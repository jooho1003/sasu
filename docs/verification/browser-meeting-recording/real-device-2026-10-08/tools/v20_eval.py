# V20 trial builder: aligns a transcription against the TTS script and emits one RecordingAccuracyEvidence trial.
#   py -3 v20_eval.py <run_dir> <sections.json> <mode> <glossary:before|after> <out.json>
# - recording file = concatenation of the downloaded verified original segments (<run_dir>/recording.wav), hashed
# - character alignment: Levenshtein over NFC text with whitespace removed (same rule as lib/recording/accuracy.ts)
# - term occurrences: every word-start occurrence of each of the 30 terms in the script; "recognized" = aligned hypothesis span
# - section error label (rule-based, documented): >=1 edit operation touching a non-punctuation character
#   inside the section's aligned span. flagged = section.confidence == "low".
import hashlib, json, os, re, sys, unicodedata, wave
import numpy as np

RATE = 16000
WORK = os.path.dirname(os.path.abspath(__file__))

def nows(text):
    return list(re.sub(r"\s+", "", unicodedata.normalize("NFC", text)))

def is_punct(c):
    return unicodedata.category(c).startswith("P") or unicodedata.category(c).startswith("S")

def align(R, H):
    n, m = len(R), len(H)
    D = np.zeros((n + 1, m + 1), dtype=np.int32)
    D[0] = np.arange(m + 1)
    Harr = np.array([ord(c) for c in H], dtype=np.int64)
    ar = np.arange(m + 1)
    for i in range(1, n + 1):
        cost = (Harr != ord(R[i - 1])).astype(np.int32)
        prev = D[i - 1]
        tmp = np.empty(m + 1, dtype=np.int32)
        tmp[0] = i
        tmp[1:] = np.minimum(prev[1:] + 1, prev[:-1] + cost)
        D[i] = np.minimum.accumulate(tmp - ar) + ar
    ops = []  # (op, ref_index or None, hyp_index or None)
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0 and D[i, j] == D[i - 1, j - 1] + (0 if R[i - 1] == H[j - 1] else 1):
            ops.append(("=" if R[i - 1] == H[j - 1] else "S", i - 1, j - 1)); i -= 1; j -= 1
        elif i > 0 and D[i, j] == D[i - 1, j] + 1:
            ops.append(("D", i - 1, None)); i -= 1
        else:
            ops.append(("I", None, j - 1)); j -= 1
    ops.reverse()
    return int(D[n, m]), ops

def concat_recording(run_dir):
    db = json.load(open(os.path.join(run_dir, "db.json"), encoding="utf-8"))
    segs = sorted(db["segments"], key=lambda s: s["segment_index"])
    frames = []
    for s in segs:
        with wave.open(os.path.join(run_dir, "segments", "%02d.wav" % s["segment_index"]), "rb") as w:
            assert w.getframerate() == RATE and w.getnchannels() == 1 and w.getsampwidth() == 2
            data = w.readframes(w.getnframes())
            assert len(data) // 2 == s["sample_count"]
            frames.append(data)
    out = os.path.join(run_dir, "recording.wav")
    if not os.path.exists(out):
        with wave.open(out, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(b"".join(frames))
    sha = hashlib.sha256(open(out, "rb").read()).hexdigest()
    samples = sum(len(f) // 2 for f in frames)
    return out, sha, samples / RATE, db

def main():
    run_dir, sections_path, mode, glossary, out_path = sys.argv[1:6]
    script = json.load(open(os.path.join(WORK, "scripts", "v20.json"), encoding="utf-8"))
    reference = " ".join(item["text"] for item in script["items"])
    sections = json.load(open(sections_path, encoding="utf-8"))
    if isinstance(sections, dict): sections = sections.get("sections", [])
    hypothesis = " ".join(s.get("text", "") for s in sections)
    rec_path, sha, seconds, db = concat_recording(run_dir)
    R, H = nows(reference), nows(hypothesis)
    dist, ops = align(R, H)
    # hyp char -> section index
    owner = []
    for k, s in enumerate(sections):
        owner += [k] * len(nows(s.get("text", "")))
    assert len(owner) == len(H)
    # ref char -> list of hyp chars aligned (diag) and insertions attached to following ref char
    ref_to_hyp = [[] for _ in R]
    last_ref = -1
    pending_ins = []
    for op, ri, hj in ops:
        if op in ("=", "S"):
            ref_to_hyp[ri].extend(pending_ins); pending_ins = []
            ref_to_hyp[ri].append(hj); last_ref = ri
        elif op == "D":
            ref_to_hyp[ri].extend(pending_ins); pending_ins = []; last_ref = ri
        else:
            pending_ins.append(hj)
    # terms: word-start occurrences in the spaced reference -> no-whitespace indices
    norm_ref = unicodedata.normalize("NFC", reference)
    idx_map, k = [], 0
    for c in norm_ref:
        idx_map.append(k if not c.isspace() else None)
        if not c.isspace(): k += 1
    terms = []
    for term in script["terms"]:
        for m in re.finditer(re.escape(term), norm_ref):
            a = m.start()
            if a > 0 and not (norm_ref[a - 1].isspace() or is_punct(norm_ref[a - 1])): continue
            ra = idx_map[a]
            rb = ra + len(nows(term))
            hs = sorted({h for r in range(ra, rb) for h in ref_to_hyp[r]})
            recognized = "".join(H[h] for h in hs) if hs else ""
            terms.append({"reference": term, "recognized": recognized})
    # sections error labels from edit ops
    sec_err = [False] * len(sections)
    cur = 0
    for op, ri, hj in ops:
        if hj is not None: cur = owner[hj]
        if op == "=": continue
        ch = H[hj] if op == "I" else R[ri] if op == "D" else None
        if op == "S":
            if not (is_punct(R[ri]) and is_punct(H[hj])): sec_err[cur] = True
        elif not is_punct(ch):
            sec_err[cur] = True
    flagged = [s.get("confidence") == "low" for s in sections]
    # long runs (possible boundary duplicates / losses)
    runs, run = [], None
    for op, ri, hj in ops:
        if op in ("I", "D"):
            if run and run["op"] == op: run["len"] += 1; run["text"] += (H[hj] if op == "I" else R[ri])
            else:
                if run and run["len"] >= 6: runs.append(run)
                run = {"op": op, "len": 1, "text": H[hj] if op == "I" else R[ri], "section": owner[hj] if hj is not None else None, "ref_at": ri}
        else:
            if run and run["len"] >= 6: runs.append(run)
            run = None
    if run and run["len"] >= 6: runs.append(run)
    for r in runs:
        if r["section"] is not None:
            s = sections[r["section"]]; r["section_start"] = s.get("start_seconds"); r["section_end"] = s.get("end_seconds")
    term_edits = 0; term_chars = 0
    for t in terms:
        _, tops = align(nows(t["reference"]), nows(t["recognized"]))
        term_edits += sum(1 for o in tops if o[0] != "="); term_chars += len(nows(t["reference"]))
    os_name = "Windows 11 Home 10.0.26200"
    ua = next((json.loads(l).get("ua") for l in open(os.path.join(run_dir, "events.jsonl"), encoding="utf-8") if '"event":"open"' in l), "")
    chrome = re.search(r"Chrome/([\d.]+)", ua or "")
    edge = re.search(r"Edg/([\d.]+)", ua or "")
    browser = ("Edge " + edge.group(1)) if edge else ("Chrome " + chrome.group(1)) if chrome else "unknown"
    trial = {
        "mode": mode, "glossary": glossary, "os": os_name, "browser": browser,
        "file_path": os.path.relpath(rec_path, os.getcwd()).replace("\\", "/"), "file_sha256": sha,
        "duration_seconds": round(seconds, 3), "reference": reference, "hypothesis": hypothesis,
        "terms": terms, "sections": [{"error": e, "flagged": f} for e, f in zip(sec_err, flagged)],
    }
    json.dump(trial, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    err = sum(sec_err); fl = sum(flagged); hit = sum(1 for e, f in zip(sec_err, flagged) if e and f)
    stats = {"mode": mode, "glossary": glossary, "seconds": round(seconds, 1), "sha256": sha[:16], "ref_chars": len(R), "hyp_chars": len(H),
             "cer": round(dist / len(R), 4), "term_occurrences": len(terms), "distinct_terms": len({t["reference"] for t in terms}),
             "term_cer": round(term_edits / term_chars, 4) if term_chars else None, "sections": len(sections), "error_sections": err,
             "flagged_sections": fl, "flagged_error_sections": hit, "low_conf_recall": round(hit / err, 4) if err else None,
             "flag_precision": round(hit / fl, 4) if fl else None, "long_runs": runs[:40]}
    json.dump(stats, open(out_path.replace(".json", ".stats.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    s = dict(stats); s["long_runs"] = len(runs)
    print(json.dumps(s, ensure_ascii=False))

if __name__ == "__main__":
    main()
