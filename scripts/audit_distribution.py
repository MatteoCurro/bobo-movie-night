#!/usr/bin/env python3
"""Fail-closed checks for tracked Bobo source and the static release artifact.

This is defense in depth, not a substitute for credential rotation or git-history
review. Never print a secret's value. No network, third-party scanner or secrets.
"""
from __future__ import annotations

import argparse
import pathlib
import re
import subprocess
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
TEXT_SUFFIXES = {".html", ".css", ".js", ".cjs", ".json", ".py", ".php",
                 ".yml", ".yaml", ".md", ".txt", ".example", ".htaccess", ".gitignore"}
BINARY_SUFFIXES = {".gif", ".jpg", ".jpeg", ".png", ".webp", ".svg", ".ico"}
FORBIDDEN_SUFFIXES = {".zip", ".tar", ".gz", ".7z", ".rar", ".pem", ".key",
                      ".p12", ".pfx", ".sql", ".sqlite", ".sqlite3", ".db"}
PRIVATE_PATH = re.compile(
    r"(^|/)(?:\.env(?:\.[^/]*)?|config\.local\.php|\.htpasswd|"
    r"id_rsa|id_ed25519|state\.json|(?:[^/]*[-_.])?(?:credentials|private-key|service-account)\.json)$",
    re.I
)
SIGNATURES = {
    "private-key-header": re.compile(rb"-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----"),
    "github-access-token": re.compile(rb"\b(?:gh[pousr]_[A-Za-z0-9]{28,}|github_pat_[A-Za-z0-9_]{50,})\b"),
    "aws-access-key": re.compile(rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    "google-api-key": re.compile(rb"\bAIza[0-9A-Za-z_-]{35}\b"),
    "resend-api-key": re.compile(rb"(?<![A-Za-z0-9_])re_[A-Za-z0-9]{28,}(?![A-Za-z0-9_])"),
    "bearer-service-token": re.compile(rb"\b(?:sk-[A-Za-z0-9_-]{32,}|xox[baprs]-[A-Za-z0-9-]{20,})\b"),
    "jwt-token": re.compile(rb"\beyJ[A-Za-z0-9_-]{30,}\.eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{15,}\b"),
    "hardcoded-credential": re.compile(
        rb"(?i)['\"](?:api[_-]?key|access[_-]?token|resend_api_key|newsletter_secret|"
        rb"client_secret|service_role_key|password|passwd|private_key)['\"]"
        rb"\s*(?:=>|:|=)\s*['\"](?!(?:''|\"\"))([^'\"\r\n]{8,})['\"]"
    ),
}
# Exact files consumed by the browser or the separately deployed account API.
STATIC_FILES = {
    ".nojekyll", "index.html", "discover.html", "watch.html", "favorites.html",
    "person.html", "director.html", "awards.html", "informazioni.html",
    "tv/index.html",
    "bobo-ui.css", "bobo-ui.js", "bobo-retro.css", "bobo-polish.css",
    "bobo-friends.js", "bobo-library.js", "bobo-cloud.css", "bobo-cloud.js",
    "bobo-enhance.js", "bobo-discover.css", "bobo-discover.js",
    "bobo-awards.css", "bobo-awards.js",
    "bobo-watch.js", "bobo-watch.css", "bobo-players.js", "bobo-related.js",
    "bobo-official-audio.js", "bobo-reviews.js", "bobo-critic.js",
    "bobo-multi-ratings.js", "bobo-cinema.js", "bobo-cinema.css",
    "bobo-favorites.js", "bobo-favorites.css",
    "data/movies.json", "data/tv.json", "data/editorial.json",
    "data/discovery.json", "data/catalog-ledger.json",
    "data/poster-index.json", "data/enrichment.json",
    "data/newsletter.json", "data/player-sources.json", "data/verified-audio.json",
    "data/reviews.json", "data/critic-reviews.json", "data/multi-ratings.json",
    "data/cinema/person-search.json", "data/cinema/explore.json",
    "data/cinema/film-quotes.json", "data/cinema/OSCAR-LICENSE.txt",
    "data/cinema/OSCAR-CURRENT-LICENSE.txt",
}
ALLOWED_PATTERNS = [
    re.compile(r"data/episodes/[1-9]\d{0,9}\.json"),
    re.compile(r"data/related/[0-3][0-9a-f]\.json"),
    re.compile(r"data/cinema/(?:credits|people|connections)/[0-7][0-9a-f]\.json"),
    re.compile(r"assets/flaticon/(?:mono/)?[a-z0-9-]+\.gif"),
    re.compile(r"assets/flaticon/manifest\.json"),
]
REQUIRED_RUNTIME = {
    "index.html", "watch.html", "discover.html", "person.html",
    "data/movies.json", "data/tv.json", "data/cinema/person-search.json",
    "data/cinema/film-quotes.json", "data/cinema/OSCAR-LICENSE.txt",
}


def inspect_file(file: pathlib.Path, relative: str) -> list[str]:
    errors = []
    if PRIVATE_PATH.search(relative):
        errors.append(f"{relative}: private filename")
    if file.suffix.lower() in FORBIDDEN_SUFFIXES:
        errors.append(f"{relative}: forbidden archive/credential/database extension")
    if file.suffix.lower() in BINARY_SUFFIXES:
        return errors
    # Binary files other than known media are not permitted in a static artifact.
    try:
        data = file.read_bytes()
    except OSError:
        return errors + [f"{relative}: unreadable"]
    if b"\x00" in data[:8192]:
        errors.append(f"{relative}: unexpected binary payload")
        return errors
    for label, regex in SIGNATURES.items():
        if regex.search(data):
            # Report the category, NEVER a matched token or its context.
            errors.append(f"{relative}: possible {label}")
    return errors


def scan_repo(root: pathlib.Path) -> tuple[int, list[str]]:
    proc = subprocess.run(["git", "ls-files", "-z"], cwd=root, check=True,
                          capture_output=True)
    names = [name.decode("utf-8") for name in proc.stdout.split(b"\0") if name]
    issues = []
    for relative in names:
        path = root / relative
        if not path.is_file():
            continue
        issues.extend(inspect_file(path, relative))
    return len(names), issues


def allowed_public_file(relative: str) -> bool:
    return relative in STATIC_FILES or any(p.fullmatch(relative) for p in ALLOWED_PATTERNS)


def scan_dist(dist: pathlib.Path) -> tuple[int, list[str]]:
    if not dist.is_dir():
        return 0, ["Static staging directory is missing"]
    files = sorted(p for p in dist.rglob("*") if p.is_file())
    names = {p.relative_to(dist).as_posix() for p in files}
    issues = [f"{p}: mandatory runtime asset missing" for p in sorted(REQUIRED_RUNTIME - names)]
    for path in files:
        relative = path.relative_to(dist).as_posix()
        if not allowed_public_file(relative):
            issues.append(f"{relative}: not on the static distribution allowlist")
        issues.extend(inspect_file(path, relative))
    return len(files), issues


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", action="store_true", help="scan tracked source")
    parser.add_argument("--dist", type=pathlib.Path, help="validate static package directory")
    args = parser.parse_args()
    if not args.repo and args.dist is None:
        parser.error("Select --repo and/or --dist PATH")
    issues = []
    if args.repo:
        count, found = scan_repo(REPO_ROOT)
        issues.extend(found)
        print(f"Repository audit: {count} tracked paths checked")
    if args.dist is not None:
        count, found = scan_dist(args.dist)
        issues.extend(found)
        print(f"Static package audit: {count} files checked against strict allowlist")
    if issues:
        for issue in issues[:50]:
            print("::error::" + issue, file=sys.stderr)
        print(f"Security audit failed: {len(issues)} findings", file=sys.stderr)
        return 1
    print("Security audit: no known exposed-key signatures or forbidden files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
