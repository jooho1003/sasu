# Copies real-device evidence (no audio, no local secrets) into the docs verification folder.
import glob, json, os, shutil, sys

W = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

def latest(pattern):
    found = sorted(glob.glob(os.path.join(W, "runs", pattern)))
    return found[-1] if found else None

def db_summary(run, dest):
    p = os.path.join(run, "db.json")
    if not os.path.exists(p): return
    db = json.load(open(p, encoding="utf-8"))
    review = db.get("review") or {}
    cap = dict(review.get("capture_metadata") or {})
    json.dump({
        "review": {k: review.get(k) for k in ("id", "kind", "title", "status", "status_reason", "duration", "input_method", "original_layout")},
        "capture_metadata": cap, "recording": db.get("recording"),
        "segments": db.get("segments"), "parts": db.get("parts"), "sections": len(review.get("sections") or []),
    }, open(os.path.join(dest, "db-summary.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

def copy_run(run, name, extra=()):
    if not run: return
    dest = os.path.join(OUT, name); os.makedirs(dest, exist_ok=True)
    for f in ("events.jsonl", "play.jsonl", "memory.json", "analysis.json", "trial-before.stats.json", "trial-after.stats.json",
              "probe-part6.json", "probe-part3.json", "retry1.json", "retry2-fixed.json", *extra):
        src = os.path.join(run, f)
        if os.path.exists(src): shutil.copy2(src, dest)
    for png in glob.glob(os.path.join(run, "*.png")): shutil.copy2(png, dest)
    db_summary(run, dest)

for mode in ("microphone", "tab", "system"):
    run = latest(f"v20-{mode}-*")
    copy_run(run, f"v20-{mode}", ("sections-after-parts.json", "sections-before.json"))
copy_run(latest("v04-chrome-*"), "v04")
copy_run(latest("v03-unplug-chrome-2026-10-08*"), "v03-unplug")
for s in ("refresh", "kill"): copy_run(latest(f"v05-{s}-*"), f"v05-{s}")
for s in ("quota-precheck", "quota-mid", "idb-clear", "two-tabs", "freeze"): copy_run(latest(f"v06-{s}-*"), f"v06-{s}")
for name, pattern in (("discarded/v20-microphone-hdd", "aborted-v20-microphone-hdd-*"), ("discarded/v20-tab-focus", "aborted-v20-tab-focus-*"),
                      ("discarded/v04-occluded-build", "interrupted-v04-occluded-cpu-*"), ("discarded/v04-occluded-launch", "interrupted-v04b-occluded-launch-*")):
    copy_run(latest(pattern), name)
for name, pattern in (("2026-10-05/v01-chrome", "v01-chrome-2026-10-05*"), ("2026-10-05/v01-edge", "v01-edge-2026-10-05*"),
                      ("2026-10-05/v03-deny", "v03-deny-chrome-2026-10-05T13-39-56*"), ("2026-10-05/v03-cancel", "v03-cancel-chrome-2026-10-05T13-41-16*"),
                      ("2026-10-05/v03-noaudio", "v03-noaudio-chrome-2026-10-05T13-44-49*"), ("2026-10-05/v03-share-stop", "v03-share-stop-chrome-*")):
    copy_run(latest(pattern), name)
shutil.copy2(os.path.join(W, "pnp-control", "pnp.jsonl"), os.path.join(OUT, "v03-unplug", "pnp.jsonl"))
m = os.path.join(W, "runs", "v20-meetings-20261008")
shutil.copy2(os.path.join(m, "result.json"), os.path.join(OUT, "meetings-result.json"))
shutil.copy2(os.path.join(m, "result-run1.json"), os.path.join(OUT, "meetings-result-run1.json"))
shutil.copy2(os.path.join(m, "run.log"), os.path.join(OUT, "meetings-run.log"))
shutil.copy2(os.path.join(m, "run1.log"), os.path.join(OUT, "meetings-run1.log"))
shutil.copy2(os.path.join(W, "scripts", "v20-meetings.json"), os.path.join(OUT, "meetings.json"))
shutil.copy2(os.path.join(W, "scripts", "v20.json"), os.path.join(OUT, "v20-script.json"))
shutil.copy2(os.path.join(W, "runs", "v20-accuracy-input-20261008.json"), os.path.join(OUT, "v20-accuracy-input.json"))
shutil.copy2(os.path.join(W, "runs", "glossary-prompt-20261008.json"), os.path.join(OUT, "glossary-prompt.json"))
shutil.copy2(os.path.join(W, "runs", "probe-acoustic-20261008", "diag.txt"), os.path.join(OUT, "acoustic-probe.txt"))
tools = os.path.join(OUT, "tools"); os.makedirs(tools, exist_ok=True)
for f in ("common.mjs", "flow.mjs", "v01.mjs", "v03.mjs", "v04.mjs", "v05.mjs", "v06.mjs", "v20.mjs", "v20-reextract.mjs", "cleanup-sessions.mjs",
          "analyze.py", "v20_eval.py", "v20_assemble.py", "v20_abs_paths.py", "collect_evidence.py", "make-env.mjs",
          "run-s1.ps1", "run-node.ps1", "run-ps-s1.ps1", "batch-devices.ps1", "pnp-watcher.ps1", "play.ps1", "synth.ps1", "uia.ps1", "probe-acoustic.ps1"):
    src = os.path.join(W, f)
    if os.path.exists(src): shutil.copy2(src, tools)
print(sum(len(fs) for _, _, fs in os.walk(OUT)), "files")
