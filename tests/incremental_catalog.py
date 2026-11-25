#!/usr/bin/env python3
"""Offline regression test: additions, updates, retained titles and bad data."""
import importlib.util
from pathlib import Path
p=Path("scripts/merge_upstream_catalog.py")
spec=importlib.util.spec_from_file_location("merge_upstream_catalog",p)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
old={"schema":1,"items":[{"tmdb_id":1,"title":"One"},{"tmdb_id":2,"title":"Two"}]}
new={"schema":1,"items":[{"tmdb_id":1,"title":"One - edited"},{"tmdb_id":3,"title":"Three"}]}
module.MINIMUM_ITEMS=1
merged,counts=module.merge(old,new)
assert counts=={"previous":2,"upstream":2,"added":1,"updated":1,"retained":1,"total":3},counts
assert [x["tmdb_id"] for x in merged["items"]]==[1,3,2]
try:module.merge(old,{"items":[]})
except ValueError:pass
else:raise AssertionError("Empty catalog must be rejected")
try:module.merge(old,{"items":[{"tmdb_id":3},{"tmdb_id":3}]})
except ValueError:pass
else:raise AssertionError("Duplicate IDs must be rejected")
print("Incremental catalog merge tests passed")
