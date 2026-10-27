"""Read and check _docs/0.requirements-analysis.xlsx (read-only; the human maintains the xlsx).

Usage:
  python .claude/scripts/reqs.py list [--capacity TH01-03] [--id REQ-013] [--release 0.1.0] [--status "1. Draft"] [--json]
  python .claude/scripts/reqs.py check
  python .claude/scripts/reqs.py decisions [--status Open] [--json]
  python .claude/scripts/reqs.py next-id

Sheet format checked by `check`:
Open decision: Decision lists the options, one per line "<title> — <details>"; Recommended holds an option title.
Decided: Decision holds the choice; a grouped ADR has one "<topic>: <text>" line per topic in Context and Decision.
Affects: capacity IDs only, comma-separated (e.g. "TH01-01, TH02-03").
"""
import argparse
import json
import re

from common import (
    CATALOG_ID, CATALOG_NAME, CATALOG_SHEET, DECISION_ID, DECISION_STATUSES, DECISIONS_SHEET,
    REQ_CAPACITY, REQ_ID, STATUSES,
    load_workbook, read_rows, theme_sheets,
)

CAPACITY_ID = re.compile(r"^TH\d{2}-\d{2}$")
REQUIREMENT_ID = re.compile(r"^(REQ|TSK)-\d{3}$")
DECISION_ID_PATTERN = re.compile(r"^ADR-\d{2}$")
OPTION_SEPARATOR = " — "
AC_LINE = re.compile(r"^AC-\d+\. ")


def theme_of(capacity_name):
    """'TH-03 Library Management - ...' -> 'TH-03'."""
    return str(capacity_name or "").split(" ")[0]


def load_all(wb):
    capacities = read_rows(wb[CATALOG_SHEET])
    requirements = []
    for ws in theme_sheets(wb):
        for row in read_rows(ws):
            row["_sheet"] = ws.title
            requirements.append(row)
    return capacities, requirements


def load_decisions(wb):
    return read_rows(wb[DECISIONS_SHEET]) if DECISIONS_SHEET in wb.sheetnames else []


def option_titles(decision):
    lines = str(decision.get("Decision") or "").splitlines()
    return [line.split(OPTION_SEPARATOR)[0].strip() for line in lines if line.strip()]


# ---------- list ----------

def matches(row, args, capacity_ids):
    if args.release and str(row.get("Release")) != args.release:
        return False
    if args.status and row.get("Status") != args.status:
        return False
    if args.id and not str(row.get(CATALOG_ID) or row.get(REQ_ID)).startswith(args.id):
        return False
    if args.capacity and capacity_ids.get(row.get(REQ_CAPACITY, row.get(CATALOG_NAME))) != args.capacity:
        return False
    return True


def to_markdown(row, id_key):
    fields = [f"- **{key}**: " + str(value).replace("\n", "\n  ") for key, value in row.items()
              if not key.startswith("_") and key != id_key and value not in (None, "")]
    return f"### {row[id_key]}\n" + "\n".join(fields) + "\n"


def cmd_list(args):
    capacities, requirements = load_all(load_workbook())
    capacity_ids = {c[CATALOG_NAME]: c[CATALOG_ID] for c in capacities}
    capacities = [c for c in capacities if matches(c, args, capacity_ids)]
    requirements = [r for r in requirements if matches(r, args, capacity_ids)]
    if args.json:
        clean = lambda rows: [{k: v for k, v in r.items() if k != "_row"} for r in rows]
        print(json.dumps({"capacities": clean(capacities), "requirements": clean(requirements)},
                         ensure_ascii=False, indent=2, default=str))
        return
    print(f"## Capacities ({len(capacities)})\n")
    print("\n".join(to_markdown(c, CATALOG_ID) for c in capacities))
    print(f"## Requirements ({len(requirements)})\n")
    print("\n".join(to_markdown(r, REQ_ID) for r in requirements))


def cmd_decisions(args):
    decisions = [d for d in load_decisions(load_workbook()) if not args.status or d.get("Status") == args.status]
    if args.json:
        print(json.dumps([{k: v for k, v in d.items() if k != "_row"} for d in decisions],
                         ensure_ascii=False, indent=2, default=str))
        return
    print(f"## Decisions ({len(decisions)})\n")
    print("\n".join(to_markdown(d, DECISION_ID) for d in decisions))


# ---------- check ----------

def find_issues(capacities, requirements):
    issues = []
    seen = set()
    for row, id_key, pattern in ([(c, CATALOG_ID, CAPACITY_ID) for c in capacities]
                                 + [(r, REQ_ID, REQUIREMENT_ID) for r in requirements]):
        row_id = row[id_key]
        where = f"{row.get('_sheet', CATALOG_SHEET)}!{row['_row']} {row_id}"
        if row_id in seen:
            issues.append(f"{where}: duplicate ID")
        seen.add(row_id)
        if not pattern.match(str(row_id)):
            issues.append(f"{where}: ID does not match {pattern.pattern}")
        if row.get("Status") not in STATUSES:
            issues.append(f"{where}: status '{row.get('Status')}' not in {STATUSES}")

    capacity_names = {c[CATALOG_NAME] for c in capacities}
    for r in requirements:
        where = f"{r['_sheet']}!{r['_row']} {r[REQ_ID]}"
        if r.get(REQ_CAPACITY) not in capacity_names:
            issues.append(f"{where}: capacity not found in catalog")
        elif not r["_sheet"].startswith(theme_of(r[REQ_CAPACITY])):
            issues.append(f"{where}: capacity belongs to another theme sheet")
        criteria = str(r.get("Acceptance Criteria") or "").strip()
        if not criteria:
            issues.append(f"{where}: missing acceptance criteria")
        elif not all(AC_LINE.match(line) for line in criteria.splitlines() if line.strip()):
            issues.append(f"{where}: acceptance criteria lines must start with 'AC-<n>. '")
    return issues


def find_decision_issues(decisions, capacity_ids):
    issues = []
    seen = set()
    for d in decisions:
        where = f"{DECISIONS_SHEET}!{d['_row']} {d[DECISION_ID]}"
        if d[DECISION_ID] in seen:
            issues.append(f"{where}: duplicate ID")
        seen.add(d[DECISION_ID])
        if not DECISION_ID_PATTERN.match(str(d[DECISION_ID])):
            issues.append(f"{where}: ID does not match {DECISION_ID_PATTERN.pattern}")
        if d.get("Status") not in DECISION_STATUSES:
            issues.append(f"{where}: status '{d.get('Status')}' not in {DECISION_STATUSES}")
        unknown = [item.strip() for item in str(d.get("Affects") or "").split(",")
                   if item.strip() and item.strip() not in capacity_ids]
        if unknown:
            issues.append(f"{where}: Affects has unknown capacity IDs {unknown}")
        if d.get("Status") == "Decided" and not d.get("Decision"):
            issues.append(f"{where}: decided without a Decision")
        if d.get("Status") == "Open" and d.get("Recommended") and d["Recommended"] not in option_titles(d):
            issues.append(f"{where}: Recommended is not one of the option titles")
    return issues


def all_issues(wb):
    capacities, requirements = load_all(wb)
    capacity_ids = {c[CATALOG_ID] for c in capacities}
    return find_issues(capacities, requirements) + find_decision_issues(load_decisions(wb), capacity_ids)


def cmd_check(_args):
    issues = all_issues(load_workbook())
    print("\n".join(issues) if issues else "OK: no issues found")
    if issues:
        raise SystemExit(1)


# ---------- next-id ----------

def cmd_next_id(_args):
    wb = load_workbook()
    _, requirements = load_all(wb)
    numbers = [int(r[REQ_ID][4:]) for r in requirements if REQUIREMENT_ID.match(str(r[REQ_ID]))]
    print(f"{max(numbers, default=0) + 1:03d}  (use REQ-nnn for functional, TSK-nnn for technical)")
    decisions = [int(d[DECISION_ID][4:]) for d in load_decisions(wb) if DECISION_ID_PATTERN.match(str(d[DECISION_ID]))]
    print(f"ADR-{max(decisions, default=0) + 1:02d}  (next decision)")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)

    list_parser = commands.add_parser("list", help="print capacities and requirements")
    list_parser.add_argument("--capacity", help="capacity ID, e.g. TH01-03")
    list_parser.add_argument("--id", help="ID prefix, e.g. TH03, REQ-013")
    list_parser.add_argument("--release")
    list_parser.add_argument("--status")
    list_parser.add_argument("--json", action="store_true")
    list_parser.set_defaults(run=cmd_list)

    decisions_parser = commands.add_parser("decisions", help="print architecture decisions")
    decisions_parser.add_argument("--status", choices=DECISION_STATUSES)
    decisions_parser.add_argument("--json", action="store_true")
    decisions_parser.set_defaults(run=cmd_decisions)

    commands.add_parser("check", help="validate IDs, statuses, capacities, ACs, decisions").set_defaults(run=cmd_check)
    commands.add_parser("next-id", help="print the next free REQ/TSK and ADR number").set_defaults(run=cmd_next_id)

    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()
