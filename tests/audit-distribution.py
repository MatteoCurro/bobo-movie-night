#!/usr/bin/env python3
"""Offline release auditing self-tests; no token literals embedded in the repo."""
import importlib.util
import pathlib
import tempfile

script=pathlib.Path("scripts/audit_distribution.py")
spec=importlib.util.spec_from_file_location("release_audit",script)
audit=importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

with tempfile.TemporaryDirectory() as tmp:
    base=pathlib.Path(tmp)
    static=base/"site"
    for name in audit.REQUIRED_RUNTIME:
        target=static/name
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text("OK",encoding="utf-8")
    count,issues=audit.scan_dist(static)
    assert count==len(audit.REQUIRED_RUNTIME) and not issues,issues

    unwanted=static/"backend/config.local.php"
    unwanted.parent.mkdir(parents=True,exist_ok=True)
    unwanted.write_text("sensitive runtime configuration",encoding="utf-8")
    _,issues=audit.scan_dist(static)
    assert any("not on the static distribution allowlist" in x for x in issues),issues
    assert any("private filename" in x for x in issues),issues
    unwanted.unlink()

    sensitive=static/"data/movies.json"
    sensitive.write_text('{"sample":"'+"ghp_"+"a"*40+'"}',encoding="utf-8")
    issues=audit.inspect_file(sensitive,"data/movies.json")
    assert any("github-access-token" in x for x in issues),issues
    assert not any("a"*10 in x for x in issues),"Secrets must not be printed"
    sensitive.write_text("OK",encoding="utf-8")

    for relative in ("backend/config.local.php", ".env", "backend/private/state.json",
                     "keys/id_rsa", ".htpasswd"):
        assert audit.PRIVATE_PATH.search(relative),relative
    for relative in ("backend/lib/mailer.php","data/catalog-status.json",
                     "data/cinema/oscar-index.json","README.md",
                     "data/cinema/quote-sources.json",".github/workflows/sync-upstream.yml"):
        assert not audit.allowed_public_file(relative),relative
    for relative in ("data/cinema/credits/01.json",
                     "data/cinema/people/60.json",
                     "data/cinema/connections/00.json",
                     "data/related/1f.json", "assets/flaticon/mono/climber-1.gif",
                     "data/cinema/OSCAR-LICENSE.txt"):
        assert audit.allowed_public_file(relative),relative

# Scan the entire actual checkout as part of every PR, too.
tracked, issues=audit.scan_repo(pathlib.Path.cwd())
assert tracked>100,tracked
assert not issues,issues[:20]
print("Security audit: repo secret signatures, allowlist and fail-closed release checks OK")
