"""Merge an i18n fragment into shared/i18n/{en,vi}.json, so several designers can add keys at the same time.

Usage:
  python .claude/scripts/i18n.py merge .claude/flows/TH02-01/i18n/storage.json --prefix settings.storage.

Fragment format: {"en": {"settings.storage.title": "Storage"}, "vi": {"settings.storage.title": "Lưu trữ"}}
- en and vi must have the same keys, and every key must start with --prefix (the slice the designer owns).
- Existing keys are updated in place; new keys go after the last key of the same namespace.
- A lock file serializes concurrent runs; re-running the same fragment is safe.
"""
import argparse
import json
import os
import time

from common import ROOT, fail

I18N_DIR = ROOT / "shared" / "i18n"
LANGUAGES = ("en", "vi")
LOCK_FILE = I18N_DIR / ".merge.lock"
LOCK_TIMEOUT_SECONDS = 30


def acquire_lock():
    deadline = time.monotonic() + LOCK_TIMEOUT_SECONDS
    while True:
        try:
            return os.open(LOCK_FILE, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            if time.monotonic() > deadline:
                fail(f"{LOCK_FILE.relative_to(ROOT)} is held; delete it if no merge is running")
            time.sleep(0.2)


def release_lock(handle):
    os.close(handle)
    LOCK_FILE.unlink(missing_ok=True)


def read_fragment(path, prefix):
    fragment = json.loads(path.read_text(encoding="utf-8"))
    if set(fragment) != set(LANGUAGES):
        fail(f"fragment needs exactly the keys {LANGUAGES}")
    if set(fragment["en"]) != set(fragment["vi"]):
        fail(f"en and vi differ: {sorted(set(fragment['en']) ^ set(fragment['vi']))}")
    outside = [key for key in fragment["en"] if not key.startswith(prefix)]
    if outside:
        fail(f"keys outside prefix '{prefix}': {outside}")
    return fragment


def merge_keys(current, additions):
    merged = dict(current)
    for key, value in additions.items():
        if key in merged:
            merged[key] = value
            continue
        namespace = key.split(".")[0] + "."
        items = list(merged.items())
        last = max((index for index, (name, _) in enumerate(items) if name.startswith(namespace)), default=len(items) - 1)
        items.insert(last + 1, (key, value))
        merged = dict(items)
    return merged


def write_json(path, data):
    temp = path.with_suffix(".json.tmp")
    temp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    os.replace(temp, path)


def cmd_merge(args):
    fragment = read_fragment(ROOT / args.fragment, args.prefix)
    handle = acquire_lock()
    try:
        for language in LANGUAGES:
            path = I18N_DIR / f"{language}.json"
            write_json(path, merge_keys(json.loads(path.read_text(encoding="utf-8")), fragment[language]))
    finally:
        release_lock(handle)
    print(f"merged {len(fragment['en'])} keys with prefix '{args.prefix}' into shared/i18n")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)

    merge_parser = commands.add_parser("merge", help="merge a fragment into en.json and vi.json")
    merge_parser.add_argument("fragment", help="fragment path from the repo root")
    merge_parser.add_argument("--prefix", required=True, help="key prefix the fragment owns, e.g. settings.storage.")
    merge_parser.set_defaults(run=cmd_merge)

    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()
