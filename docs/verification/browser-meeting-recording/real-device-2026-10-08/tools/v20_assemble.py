# Assembles the V20 measurement input for scripts/measure-recording-accuracy.ts.
#   py -3 v20_assemble.py <out.json> <meetings_result.json> <trial.json> x6
# Meetings: official "결정 후보" scoring uses decision labels only; predicted candidates are label ids
# (a candidate citing a label's evidence item) or x<item> for unmatched ones.
import json, sys

out_path, meetings_path, *trial_paths = sys.argv[1:]
trials = [json.load(open(p, encoding="utf-8")) for p in trial_paths]
result = json.load(open(meetings_path, encoding="utf-8"))
meetings = []
for m in result["meetings"]:
    if m.get("failed"):
        pass  # scored as product behaviour (after = no candidates)
    meetings.append({
        "id": m["id"],
        "labels": m["labels"]["decision"],
        "before": sorted({e["id"] for e in m["before"]["decision"]}),
        "after": sorted({e["id"] for e in m["after"]["decision"]}),
    })
json.dump({"trials": trials, "meetings": meetings}, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

def scores(kind, phase):
    tp = fp = fn = 0
    for m in result["meetings"]:
        truth = set(m["labels"][kind]); pred = {e["id"] for e in m[phase][kind]}
        tp += len(pred & truth); fp += len(pred - truth); fn += len(truth - pred)
    return {"tp": tp, "fp": fp, "fn": fn, "precision": round(tp / (tp + fp), 4) if tp + fp else None, "recall": round(tp / (tp + fn), 4) if tp + fn else None}

print(json.dumps({k: {p: scores(k, p) for p in ("before", "after")} for k in ("decision", "action")}, ensure_ascii=False))
