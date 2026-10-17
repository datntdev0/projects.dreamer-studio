"""Shared paths and xlsx helpers for the Claude framework scripts."""
import sys
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "_docs"
TEMPLATES = ROOT / ".claude" / "templates"
REQS_XLSX = DOCS / "0.requirements-analysis.xlsx"

CATALOG_SHEET = "Capacity Catalog"
CATALOG_ID = "ID"
CATALOG_NAME = "Capacity Full Name"
REQ_ID = "Req ID"
REQ_CAPACITY = "Capacity Name"
STATUSES = ("0. Idea", "1. Draft", "2. Approve")

DECISIONS_SHEET = "Open Decisions"
DECISION_ID = "Decision ID"
DECISION_HEADERS = (DECISION_ID, "Title", "Context", "Affects", "Options", "Recommended",
                    "Decision", "Status", "Notes", "Decided On")
DECISION_WIDTHS = (11, 30, 50, 20, 70, 30, 30, 12, 40, 12)
DECISION_STATUSES = ("Open", "Decided", "Deferred")

sys.stdout.reconfigure(encoding="utf-8")


def fail(message):
    print(f"error: {message}", file=sys.stderr)
    sys.exit(1)


def load_workbook(path=REQS_XLSX):
    import openpyxl

    with warnings.catch_warnings():
        # openpyxl drops the Excel list validation; save_workbook() restores it.
        warnings.simplefilter("ignore")
        return openpyxl.load_workbook(path)


def headers(ws):
    return [cell.value for cell in ws[1]]


def column_letter(ws, header):
    return ws.cell(row=1, column=headers(ws).index(header) + 1).column_letter


def read_rows(ws):
    """Return non-empty rows as dicts keyed by header, plus the row number in `_row`."""
    keys = headers(ws)
    rows = []
    for number, values in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not values[0]:
            continue
        row = {key: value for key, value in zip(keys, values) if key}
        row["_row"] = number
        rows.append(row)
    return rows


def theme_sheets(wb):
    return [ws for ws in wb.worksheets if ws.title not in (CATALOG_SHEET, DECISIONS_SHEET)]


def decisions_sheet(wb):
    """Return the decisions sheet, creating it (styled like the catalog) when missing."""
    if DECISIONS_SHEET in wb.sheetnames:
        return wb[DECISIONS_SHEET]
    import copy

    catalog = wb[CATALOG_SHEET]
    ws = wb.create_sheet(DECISIONS_SHEET)
    for column, (header, width) in enumerate(zip(DECISION_HEADERS, DECISION_WIDTHS), start=1):
        cell = ws.cell(row=1, column=column, value=header)
        cell._style = copy.copy(catalog.cell(row=1, column=1)._style)
        ws.column_dimensions[cell.column_letter].width = width
        # insert_row() copies styles from row 2, so seed it with the catalog data style.
        ws.cell(row=2, column=column)._style = copy.copy(catalog.cell(row=2, column=1)._style)
    ws.auto_filter.ref = f"A1:{ws.cell(row=1, column=len(DECISION_HEADERS)).column_letter}1"
    return ws


def list_rule(formula, column, ws):
    from openpyxl.worksheet.datavalidation import DataValidation

    rule = DataValidation(type="list", formula1=formula, allow_blank=True)
    rule.add(f"{column}2:{column}{max(ws.max_row, 2)}")
    return rule


def save_workbook(wb, path=REQS_XLSX):
    """Restore the dropdowns (capacity on theme sheets, status on decisions), then save."""
    catalog = wb[CATALOG_SHEET]
    name_col = column_letter(catalog, CATALOG_NAME)
    source = f"'{CATALOG_SHEET}'!${name_col}$2:${name_col}${max(catalog.max_row, 2)}"
    for ws in theme_sheets(wb):
        ws.data_validations.dataValidation = [list_rule(source, column_letter(ws, REQ_CAPACITY), ws)]
    if DECISIONS_SHEET in wb.sheetnames:
        ws = wb[DECISIONS_SHEET]
        statuses = '"' + ",".join(DECISION_STATUSES) + '"'
        ws.data_validations.dataValidation = [list_rule(statuses, column_letter(ws, "Status"), ws)]
    try:
        wb.save(path)
    except PermissionError:
        fail(f"cannot write {path.name}; close it in Excel and retry")
