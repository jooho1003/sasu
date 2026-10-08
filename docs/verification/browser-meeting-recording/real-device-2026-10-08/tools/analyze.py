# Offline evidence analysis for real-device runs (py -3, numpy only).
#   py -3 analyze.py <run_dir> <script.json> <part=wav>[,<part=wav>...]
# - concatenates downloaded segment WAVs, checks sample counts
# - aligns each played source WAV against the recording (envelope + waveform cross-correlation)
#   in sliding windows: a constant lag = no lost/duplicated audio; jumps are reported
# - maps transcription sections to script sentences (fuzzy), reports duplicates / misses / leaked pause sentence
import json, sys, wave, re, difflib, os
import numpy as np

RATE = 16000

def read_wav(path):
    with wave.open(path, "rb") as w:
        assert w.getframerate() == RATE and w.getnchannels() == 1 and w.getsampwidth() == 2, path
        return np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768.0

def envelope(x, hop=160):
    n = len(x) // hop
    frames = x[: n * hop].reshape(n, hop)
    return np.log10(np.mean(frames * frames, axis=1) + 1e-9)

def xcorr_best(a, b):
    """Best lag of short a inside long b (normalized cross-correlation via FFT). Returns (lag, score)."""
    a = a - a.mean()
    if np.linalg.norm(a) == 0 or len(b) < len(a):
        return None, 0.0
    n = 1
    while n < len(a) + len(b):
        n *= 2
    fa = np.fft.rfft(a[::-1], n)
    fb = np.fft.rfft(b, n)
    corr = np.fft.irfft(fa * fb, n)[len(a) - 1: len(b)]
    # local normalization of b
    cs = np.concatenate([[0], np.cumsum(b)])
    cs2 = np.concatenate([[0], np.cumsum(b * b)])
    L = len(a)
    s = cs[L:] - cs[:-L]
    s2 = cs2[L:] - cs2[:-L]
    var = np.maximum(s2 - s * s / L, 1e-12)
    norm = corr[: len(var)] / (np.linalg.norm(a) * np.sqrt(var))
    k = int(np.argmax(norm))
    return k, float(norm[k])

def norm_text(t):
    return re.sub(r"[\s\.,!?\"'·…~\-]", "", t)

def fuzzy_hits(sentence, transcript, threshold=0.6):
    s = norm_text(sentence)
    T = norm_text(transcript)
    L = len(s)
    best = []
    i = 0
    scores = []
    for start in range(0, max(1, len(T) - int(L * 0.6))):
        cand = T[start: start + L]
        scores.append(difflib.SequenceMatcher(None, s, cand).ratio())
    scores = np.array(scores) if scores else np.zeros(1)
    hits = []
    used = np.zeros(len(scores), dtype=bool)
    for idx in np.argsort(-scores):
        if scores[idx] < threshold:
            break
        if used[max(0, idx - L): idx + L].any():
            continue
        used[idx] = True
        hits.append((int(idx), float(scores[idx])))
    return float(scores.max()), hits

def main():
    run_dir, script_path, parts_arg = sys.argv[1], sys.argv[2], sys.argv[3]
    out = {"run_dir": os.path.basename(run_dir)}
    db = json.load(open(os.path.join(run_dir, "db.json"), encoding="utf-8"))
    segs = sorted(db["segments"], key=lambda s: s["segment_index"])
    pcm = []
    for s in segs:
        p = os.path.join(run_dir, "segments", "%02d.wav" % s["segment_index"])
        x = read_wav(p)
        assert len(x) == s["sample_count"], (p, len(x), s["sample_count"])
        pcm.append(x)
    rec = np.concatenate(pcm)
    out["segments"] = [{"index": s["segment_index"], "samples": s["sample_count"], "bytes": s["bytes"], "status": s["status"]} for s in segs]
    out["total_samples"] = int(len(rec))
    out["total_seconds"] = len(rec) / RATE
    out["segment_rule_ok"] = all(s["sample_count"] == 960000 for s in segs[:-1]) and 0 < segs[-1]["sample_count"] <= 960000
    peak = float(np.max(np.abs(rec)))
    out["level"] = {"peak": peak, "rms": float(np.sqrt(np.mean(rec * rec)))}
    env_rec = envelope(rec)
    # per-second RMS of recording (dBFS) for silence/pause inspection
    sec = len(rec) // RATE
    out["rms_dbfs_per_second"] = [round(float(20 * np.log10(np.sqrt(np.mean(rec[i*RATE:(i+1)*RATE]**2)) + 1e-9)), 1) for i in range(sec)]
    plays = []
    pl = os.path.join(run_dir, "play.jsonl")
    if os.path.exists(pl):
        plays = [json.loads(l) for l in open(pl, encoding="utf-8") if l.strip()]
    events = [json.loads(l) for l in open(os.path.join(run_dir, "events.jsonl"), encoding="utf-8") if l.strip()]
    timeline = next((e for e in events if e["event"] == "timeline"), {})
    align = {}
    for spec in parts_arg.split(","):
        name, wav = spec.split("=")
        src = read_wav(wav)
        env_src = envelope(src)
        lag_frames, score = xcorr_best(env_src, env_rec)
        res = {"source_seconds": len(src) / RATE, "envelope_score": round(score, 3)}
        if lag_frames is None:
            align[name] = res; continue
        coarse = lag_frames * 160
        res["coarse_offset_s"] = coarse / RATE
        # sliding-window waveform refinement (sample precision): 4 s windows every 2 s
        wins = []
        w = 4 * RATE
        for start in range(0, len(src) - w, 2 * RATE):
            seg = src[start: start + w]
            if np.sqrt(np.mean(seg * seg)) < 0.003:
                continue
            exp = coarse + start
            lo = max(0, exp - RATE // 2)
            hi = min(len(rec), exp + w + RATE // 2)
            if hi - lo < w:
                continue
            k, sc = xcorr_best(seg, rec[lo:hi])
            wins.append({"src_s": start / RATE, "lag_samples": int(lo + k - start), "score": round(sc, 3)})
        good = [x for x in wins if x["score"] >= 0.3]
        res["windows"] = len(wins)
        res["windows_scored"] = len(good)
        if good:
            lags = np.array([x["lag_samples"] for x in good])
            res["lag_median_samples"] = int(np.median(lags))
            res["lag_span_samples"] = int(lags.max() - lags.min())
            diffs = np.diff(lags)
            res["max_step_samples"] = int(np.max(np.abs(diffs))) if len(diffs) else 0
            res["jumps_over_80_samples"] = [{"at_src_s": good[i + 1]["src_s"], "step": int(d)} for i, d in enumerate(diffs) if abs(d) > 80]
            res["min_window_score"] = min(x["score"] for x in good)
            res["first_lag"] = int(lags[0]); res["last_lag"] = int(lags[-1])
            ts = np.array([x["src_s"] for x in good])
            if len(good) >= 3:
                slope, icpt = np.polyfit(ts, lags, 1)
                resid = lags - (slope * ts + icpt)
                res["drift_ppm"] = round(float(slope / RATE * 1e6), 1)
                res["residual_rms_samples"] = round(float(np.sqrt(np.mean(resid ** 2))), 1)
                res["residual_max_samples"] = int(np.max(np.abs(resid)))
                # persistent step test: median of next 4 windows minus median of previous 4 (after drift removal)
                steps = []
                for i in range(4, len(resid) - 3):
                    st = float(np.median(resid[i:i + 4]) - np.median(resid[i - 4:i]))
                    steps.append((float(ts[i]), st))
                worst = max(steps, key=lambda s: abs(s[1])) if steps else (None, 0.0)
                res["max_persistent_step_samples"] = round(worst[1], 1)
                res["max_persistent_step_at_src_s"] = worst[0]
            # lags at windows overlapping recording-segment boundaries (every 960000 samples)
            bounds = []
            for b in range(960000, len(rec), 960000):
                near = [x for x in good if abs((x["src_s"] * RATE + x["lag_samples"]) - b) < 6 * RATE]
                if near:
                    bounds.append({"boundary_s": b / RATE, "lags": [x["lag_samples"] for x in near]})
            res["boundary_windows"] = bounds
        play = next((p for p in plays if p["file"] == os.path.basename(wav)), None)
        if play and good:
            # wall-clock time (ms) at which recording sample 0 would have been captured, from this source
            res["rec_zero_wall_ms"] = play["start"] - (res["lag_median_samples"] / RATE) * 1000
        res["sample_windows"] = wins[:3] + wins[-3:]
        align[name] = res
    out["alignment"] = align
    if "A" in align and "B" in align and "rec_zero_wall_ms" in align["A"] and "rec_zero_wall_ms" in align["B"]:
        gap = align["B"]["rec_zero_wall_ms"] - align["A"]["rec_zero_wall_ms"]
        out["excluded_wall_ms_between_A_and_B"] = round(gap, 1)
        if timeline:
            out["ui_paused_ms"] = timeline.get("pausedMs")
    # transcript
    script = json.load(open(script_path, encoding="utf-8"))
    sections = db["review"].get("sections") or []
    transcript = " ".join(s.get("text", "") for s in sections)
    out["sections"] = [{"start": s.get("start_seconds"), "end": s.get("end_seconds"), "confidence": s.get("confidence"), "boundary_review": s.get("boundary_review"), "text": s.get("text")} for s in sections]
    report = []
    for part, items in script.items():
        for item in items:
            best, hits = fuzzy_hits(item["text"], transcript)
            report.append({"part": part, "id": item["id"], "best": round(best, 3), "hits": len(hits)})
    out["sentences"] = report
    out["summary"] = {
        "sentences_found": sum(1 for r in report if r["part"] != "P" and r["hits"] >= 1),
        "sentences_total": sum(1 for r in report if r["part"] != "P"),
        "sentences_duplicated": [r["id"] for r in report if r["part"] != "P" and r["hits"] > 1],
        "sentences_missing": [r["id"] for r in report if r["part"] != "P" and r["hits"] == 0],
        "pause_sentence_best_similarity": max([r["best"] for r in report if r["part"] == "P"], default=None),
        "pause_sentence_hits": sum(r["hits"] for r in report if r["part"] == "P"),
        "pause_keywords_in_transcript": [k for k in ["코끼리", "바나나", "우주선", "휴식 구간"] if k in transcript],
    }
    json.dump(out, open(os.path.join(run_dir, "analysis.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    s = dict(out); s.pop("sections"); s.pop("rms_dbfs_per_second"); s.pop("sentences")
    for a in s["alignment"].values():
        a.pop("sample_windows", None)
    print(json.dumps(s, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()
