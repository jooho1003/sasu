"""Read only a temporary Chrome History copy; stdout is consumed by the collector."""
import json
import pathlib
import sqlite3
import sys

path, since, until = pathlib.Path(sys.argv[1]).resolve(), int(sys.argv[2]), int(sys.argv[3])
with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True) as db:
    db.row_factory = sqlite3.Row
    visits = [dict(row) for row in db.execute(
        "select urls.url,urls.title,visits.visit_time,1 as visit_count from visits "
        "join urls on urls.id=visits.url where visits.visit_time>=? and visits.visit_time<? "
        "order by visits.visit_time limit 10000", (since, until))]
    searches = []
    if len(sys.argv) > 4 and sys.argv[4] == "search-opt-in":
        searches = [dict(row) for row in db.execute(
            "select k.term,v.visit_time from keyword_search_terms k join visits v on v.url=k.url_id "
            "where v.visit_time>=? and v.visit_time<? limit 1000", (since, until))]
    print(json.dumps({"visits": visits, "searches": searches}, ensure_ascii=False))
