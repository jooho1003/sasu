# Rewrites each trial's file_path to the absolute path of its concatenated recording.wav.
import json, os, sys

for p in sys.argv[1:]:
    t = json.load(open(p, encoding="utf-8"))
    d = os.path.dirname(os.path.abspath(p))
    t["file_path"] = os.path.join(d, "recording.wav").replace(os.sep, "/")
    json.dump(t, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("ok")
