"""Read and check the capability and Level 2 specification workbook.

Usage:
  python .claude/scripts/reqs.py list [--capacity TH01-03] [--id L2-TH01] [--release 0.1.0] [--status "1. Draft"] [--json]
  python .claude/scripts/reqs.py check
  python .claude/scripts/reqs.py decisions [--status Open] [--json]
  python .claude/scripts/reqs.py next-id [--capability TH01-03]

Level 2 rows use a unique Spec ID and refer to Level 1 only by Capability ID.
Open decisions list options one per line as "<title> — <details>"; Affects contains capability IDs.
"""
import argparse
import json
import re

from common import (
    CATALOG_ID, CATALOG_NAME, CATALOG_SHEET, DECISION_ID, DECISION_STATUSES,
    DECISIONS_SHEET, L2_PREFIX, STATUSES, load_workbook, read_rows,
)

CAPABILITY_ID = re.compile(r"^TH\d{2}-\d{2}$")
SPEC_ID = re.compile(r"^L2-(TH\d{2}-\d{2})-(\d{2})$")
DECISION_ID_PATTERN = re.compile(r"^ADR-\d{2}$")
OPTION_SEPARATOR = " — "


def load_all(wb):
    capabilities = read_rows(wb[CATALOG_SHEET])
    specs = []
    for ws in wb.worksheets:
        if ws.title.startswith(L2_PREFIX):
            for row in read_rows(ws):
                row["_sheet"] = ws.title
                specs.append(row)
    return capabilities, specs


def load_decisions(wb):
    return read_rows(wb[DECISIONS_SHEET]) if DECISIONS_SHEET in wb.sheetnames else []


def option_titles(decision):
    lines = str(decision.get("Decision") or "").splitlines()
    return [line.split(OPTION_SEPARATOR)[0].strip() for line in lines if line.strip()]


def matches(row, args, release_by_capability):
    release = row.get("Release") or release_by_capability.get(row.get("Capability ID"))
    if args.release and str(release) != args.release:
        return False
    if args.status and row.get("Status") != args.status:
        return False
    row_id = row.get("Spec ID") or row.get(CATALOG_ID) or row.get("Capability ID")
    if args.id and not str(row_id or "").startswith(args.id):
        return False
    capability_id = row.get("Capability ID") or row.get(CATALOG_ID)
    if args.capacity and capability_id != args.capacity:
        return False
    return True


def to_markdown(row, id_key):
    fields = [f"- **{key}**: " + str(value).replace("\n", "\n  ") for key, value in row.items()
              if not key.startswith("_") and key != id_key and value not in (None, "")]
    return f"### {row[id_key]}\n" + "\n".join(fields) + "\n"


def cmd_list(args):
    capabilities, specs = load_all(load_workbook())
    release_by_capability = {c[CATALOG_ID]: c.get("Release") for c in capabilities}
    capabilities = [c for c in capabilities if matches(c, args, release_by_capability)]
    specs = [s for s in specs if matches(s, args, release_by_capability)]
    if args.json:
        clean = lambda rows: [{k: v for k, v in r.items() if k != "_row"} for r in rows]
        print(json.dumps({"capabilities": clean(capabilities), "specifications": clean(specs)},
                         ensure_ascii=False, indent=2, default=str))
        return
    print(f"## Capabilities ({len(capabilities)})\n")
    print("\n".join(to_markdown(c, CATALOG_ID) for c in capabilities))
    print(f"## Level 2 specifications ({len(specs)})\n")
    print("\n".join(to_markdown(s, "Spec ID") for s in specs))


def cmd_decisions(args):
    decisions = [d for d in load_decisions(load_workbook()) if not args.status or d.get("Status") == args.status]
    if args.json:
        print(json.dumps([{k: v for k, v in d.items() if k != "_row"} for d in decisions],
                         ensure_ascii=False, indent=2, default=str))
        return
    print(f"## Decisions ({len(decisions)})\n")
    print("\n".join(to_markdown(d, DECISION_ID) for d in decisions))


def find_capability_issues(capabilities):
    issues = []
    seen = set()
    for row in capabilities:
        row_id = str(row.get(CATALOG_ID) or "")
        where = f"{CATALOG_SHEET}!{row['_row']} {row_id}"
        if row_id in seen:
            issues.append(f"{where}: duplicate Capability ID")
        seen.add(row_id)
        if not CAPABILITY_ID.match(row_id):
            issues.append(f"{where}: Capability ID does not match {CAPABILITY_ID.pattern}")
        if row.get("Status") not in STATUSES:
            issues.append(f"{where}: status '{row.get('Status')}' not in {STATUSES}")
        for field in (CATALOG_NAME, "Purpose", "Context & Boundaries"):
            if not str(row.get(field) or "").strip():
                issues.append(f"{where}: missing {field}")
    return issues


def find_spec_issues(specs, capabilities):
    issues = []
    capability_ids = {str(c[CATALOG_ID]) for c in capabilities}
    seen_ids = set()
    seen_titles = set()
    for row in specs:
        where = f"{row['_sheet']}!{row['_row']}"
        spec_id = str(row.get("Spec ID") or "")
        cap_id = str(row.get("Capability ID") or "")
        title = str(row.get("Title") or "").strip()
        match = SPEC_ID.match(spec_id)
        if not match:
            issues.append(f"{where}: Spec ID '{spec_id}' does not match {SPEC_ID.pattern}")
        else:
            if match.group(1) != cap_id:
                issues.append(f"{where}: Spec ID Capability ID does not match '{cap_id}'")
        if spec_id in seen_ids:
            issues.append(f"{where}: duplicate Spec ID '{spec_id}'")
        seen_ids.add(spec_id)
        if cap_id not in capability_ids:
            issues.append(f"{where}: unknown Capability ID '{cap_id}'")
        if not title:
            issues.append(f"{where}: missing Title")
        key = (cap_id, title.casefold())
        if key in seen_titles:
            issues.append(f"{where}: duplicate L2 Title for {cap_id}")
        seen_titles.add(key)
        if row.get("Status") not in STATUSES:
            issues.append(f"{where}: status '{row.get('Status')}' not in {STATUSES}")
        for field in ("Scope", "Acceptance Scenarios", "Invariants & Contracts"):
            if not str(row.get(field) or "").strip():
                issues.append(f"{where}: missing {field}")
    return issues


def find_decision_issues(decisions, capability_ids):
    issues = []
    seen = set()
    for row in decisions:
        decision_id = str(row.get(DECISION_ID) or "")
        where = f"{DECISIONS_SHEET}!{row['_row']} {decision_id}"
        if decision_id in seen:
            issues.append(f"{where}: duplicate ID")
        seen.add(decision_id)
        if not DECISION_ID_PATTERN.match(decision_id):
            issues.append(f"{where}: ID does not match {DECISION_ID_PATTERN.pattern}")
        if row.get("Status") not in DECISION_STATUSES:
            issues.append(f"{where}: status '{row.get('Status')}' not in {DECISION_STATUSES}")
        unknown = [item.strip() for item in str(row.get("Affects") or "").split(",")
                   if item.strip() and item.strip() not in capability_ids]
        if unknown:
            issues.append(f"{where}: Affects has unknown capability IDs {unknown}")
        if row.get("Status") == "Decided" and not row.get("Decision"):
            issues.append(f"{where}: decided without a Decision")
        if row.get("Status") == "Open" and row.get("Recommended") and row["Recommended"] not in option_titles(row):
            issues.append(f"{where}: Recommended is not one of the option titles")
    return issues


def all_issues(wb):
    capabilities, specs = load_all(wb)
    capability_ids = {str(c[CATALOG_ID]) for c in capabilities}
    return (find_capability_issues(capabilities)
            + find_spec_issues(specs, capabilities)
            + find_decision_issues(load_decisions(wb), capability_ids))


def cmd_check(_args):
    issues = all_issues(load_workbook())
    print("\n".join(issues) if issues else "OK: no issues found")
    if issues:
        raise SystemExit(1)


def cmd_next_id(args):
    capabilities, specs = load_all(load_workbook())
    if args.capability:
        selected = [c for c in capabilities if c[CATALOG_ID] == args.capability]
        if not selected:
            raise SystemExit(f"Unknown Capability ID: {args.capability}")
    else:
        selected = capabilities
    for capability in selected:
        cap_id = capability[CATALOG_ID]
        numbers = [int(match.group(2)) for row in specs
                   if row.get("Capability ID") == cap_id
                   and (match := SPEC_ID.match(str(row.get("Spec ID") or "")))]
        print(f"L2-{cap_id}-{max(numbers, default=0) + 1:02d}  ({capability[CATALOG_NAME]})")
    decisions = [int(row[DECISION_ID][4:]) for row in load_decisions(load_workbook())
                 if DECISION_ID_PATTERN.match(str(row.get(DECISION_ID) or ""))]
    print(f"ADR-{max(decisions, default=0) + 1:02d}  (next decision)")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest='command', required=True)

    list_parser = commands.add_parser('list', help='print capabilities and Level 2 specifications')
    list_parser.add_argument('--capacity', help='Capability ID, e.g. TH01-03')
    list_parser.add_argument('--id', help='ID prefix, e.g. TH03 or L2-TH03')
    list_parser.add_argument('--release')
    list_parser.add_argument('--status')
    list_parser.add_argument('--json', action='store_true')
    list_parser.set_defaults(run=cmd_list)

    decisions_parser = commands.add_parser('decisions', help='print architecture decisions')
    decisions_parser.add_argument('--status', choices=DECISION_STATUSES)
    decisions_parser.add_argument('--json', action='store_true')
    decisions_parser.set_defaults(run=cmd_decisions)

    commands.add_parser('check', help='validate capability, L2, and decision IDs and fields').set_defaults(run=cmd_check)
    next_parser = commands.add_parser('next-id', help='print next Level 2 Spec ID(s) and ADR number')
    next_parser.add_argument('--capability', help='show next Spec ID for one Capability ID')
    next_parser.set_defaults(run=cmd_next_id)

    args = parser.parse_args()
    args.run(args)


if __name__ == '__main__':
    main()
