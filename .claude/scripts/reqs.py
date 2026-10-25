"""Read, check and update _docs/0.requirements-analysis.xlsx.

Usage:
  python .claude/scripts/reqs.py list [--capacity TH01-03] [--id REQ-013] [--release 0.1.0] [--status "1. Draft"] [--json]
  python .claude/scripts/reqs.py check
  python .claude/scripts/reqs.py decisions [--status Open] [--json]
  python .claude/scripts/reqs.py next-id
  python .claude/scripts/reqs.py upsert patch.json

Patch file (only the given fields are written; new IDs are inserted; "delete" removes requirement or capacity rows;
"rename" changes capacity or requirement IDs, applied first and in order; a missing theme sheet is created,
named after the theme part of the capacity name, e.g. "TH-04 Library Analysis"):
  {"rename":       [["TH03-05", "TH03-04"]],
   "delete":       ["REQ-012"],
   "capacities":   [{"ID": "TH03-10", "Capacity Full Name": "...", "Status": "1. Draft"}],
   "requirements": [{"Req ID": "REQ-023", "Capacity Name": "...", "Status": "1. Draft"}],
   "decisions":    [{"Decision ID": "AD-14", "Title": "...", "Options": "A — pros\\nB — pros", "Status": "Open"}]}

Decision options: one per line, "<title> — <details>"; Recommended and Decision hold an option title.
"""
import argparse
import copy
import json
import re

from common import (
    CATALOG_ID, CATALOG_NAME, CATALOG_SHEET, DECISION_ID, DECISION_STATUSES, DECISIONS_SHEET,
    REQ_CAPACITY, REQ_ID, STATUSES,
    create_theme_sheet, decisions_sheet, fail, headers, load_workbook, read_rows, save_workbook, theme_sheets,
)

CAPACITY_ID = re.compile(r"^TH\d{2}-\d{2}$")
REQUIREMENT_ID = re.compile(r"^(REQ|TSK)-\d{3}$")
DECISION_ID_PATTERN = re.compile(r"^AD-\d{2}$")
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
    lines = str(decision.get("Options") or "").splitlines()
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


def find_decision_issues(decisions):
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
        if d.get("Status") == "Decided" and not d.get("Decision"):
            issues.append(f"{where}: decided without a Decision")
        if d.get("Recommended") and d["Recommended"] not in option_titles(d):
            issues.append(f"{where}: Recommended is not one of the option titles")
    return issues


def all_issues(wb):
    return find_issues(*load_all(wb)) + find_decision_issues(load_decisions(wb))


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
    decisions = [int(d[DECISION_ID][3:]) for d in load_decisions(wb) if DECISION_ID_PATTERN.match(str(d[DECISION_ID]))]
    print(f"AD-{max(decisions, default=0) + 1:02d}  (next decision)")


# ---------- upsert ----------

def write_row(ws, row_number, values):
    keys = headers(ws)
    for key, value in values.items():
        if key not in keys:
            fail(f"unknown column '{key}' in sheet '{ws.title}'")
        ws.cell(row=row_number, column=keys.index(key) + 1, value=value)


def insert_row(ws, after_row, values):
    """Insert a row below `after_row`, copying its style (or the first data row's)."""
    style_row = after_row if after_row > 1 and ws.cell(row=after_row, column=1).value else 2
    styles = [copy.copy(ws.cell(row=style_row, column=column)._style) for column in range(1, ws.max_column + 1)]
    ws.insert_rows(after_row + 1)
    for column, style in enumerate(styles, start=1):
        ws.cell(row=after_row + 1, column=column)._style = style
    write_row(ws, after_row + 1, values)


def upsert(ws, rows, id_key, values, group_of):
    """Update the row with the same ID, or insert it after the last row of its group."""
    existing = next((r for r in rows if r[id_key] == values[id_key]), None)
    if existing:
        write_row(ws, existing["_row"], values)
        return "updated"
    group = [r["_row"] for r in rows if group_of(r) == group_of(values)]
    if group:
        insert_row(ws, max(group), values)
    elif rows:  # new group: leave one blank separator row after the last data row
        insert_row(ws, max(r["_row"] for r in rows) + 1, values)
    else:
        insert_row(ws, 1, values)
    return "inserted"


def cmd_upsert(args):
    with open(args.patch, encoding="utf-8") as file:
        patch = json.load(file)
    wb = load_workbook()
    catalog = wb[CATALOG_SHEET]

    for old_id, new_id in patch.get("rename", []):
        sheet, id_key, row = next(((ws, key, r) for ws, key in [(catalog, CATALOG_ID)]
                                   + [(ws, REQ_ID) for ws in theme_sheets(wb)]
                                   for r in read_rows(ws) if r[key] == old_id), (None, None, None))
        if sheet is None:
            fail(f"{old_id}: not found")
        write_row(sheet, row["_row"], {id_key: new_id})
        print(f"renamed: {old_id} -> {new_id} ({sheet.title})")

    for item_id in patch.get("delete", []):
        sources = [(catalog, CATALOG_ID)] if CAPACITY_ID.match(item_id) else [(ws, REQ_ID) for ws in theme_sheets(wb)]
        sheet, row = next(((ws, r) for ws, key in sources for r in read_rows(ws) if r[key] == item_id), (None, None))
        if sheet is None:
            fail(f"{item_id}: not found")
        sheet.delete_rows(row["_row"])
        print(f"deleted: {item_id} ({sheet.title})")

    for values in patch.get("capacities", []):
        result = upsert(catalog, read_rows(catalog), CATALOG_ID, values,
                        lambda r: str(r[CATALOG_ID])[:4])
        print(f"{result}: {values[CATALOG_ID]}")

    for values in patch.get("requirements", []):
        sheet = next((ws for ws in theme_sheets(wb)
                      if any(r[REQ_ID] == values[REQ_ID] for r in read_rows(ws))), None)
        sheet = sheet or next((ws for ws in theme_sheets(wb)
                               if ws.title.startswith(theme_of(values.get(REQ_CAPACITY)))), None)
        if sheet is None:
            if values.get(REQ_CAPACITY) not in {c[CATALOG_NAME] for c in read_rows(catalog)}:
                fail(f"{values[REQ_ID]}: capacity '{values.get(REQ_CAPACITY)}' not found in catalog")
            sheet = create_theme_sheet(wb, values[REQ_CAPACITY].split(" - ")[0])
            print(f"created sheet: {sheet.title}")
        result = upsert(sheet, read_rows(sheet), REQ_ID, values, lambda r: r.get(REQ_CAPACITY))
        print(f"{result}: {values[REQ_ID]} ({sheet.title})")

    if patch.get("decisions"):
        sheet = decisions_sheet(wb)
        for values in patch["decisions"]:
            result = upsert(sheet, read_rows(sheet), DECISION_ID, values, lambda r: DECISIONS_SHEET)
            print(f"{result}: {values[DECISION_ID]}")

    save_workbook(wb)
    issues = all_issues(wb)
    print("\n".join(["check:"] + issues) if issues else "check: OK")


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
    commands.add_parser("next-id", help="print the next free REQ/TSK number").set_defaults(run=cmd_next_id)

    upsert_parser = commands.add_parser("upsert", help="apply a JSON patch")
    upsert_parser.add_argument("patch")
    upsert_parser.set_defaults(run=cmd_upsert)

    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()
