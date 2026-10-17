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
    return [ws for ws in wb.worksheets if ws.title != CATALOG_SHEET]


def save_workbook(wb, path=REQS_XLSX):
    """Restore the capacity dropdown on every theme sheet, then save."""
    from openpyxl.worksheet.datavalidation import DataValidation

    catalog = wb[CATALOG_SHEET]
    name_col = column_letter(catalog, CATALOG_NAME)
    source = f"'{CATALOG_SHEET}'!${name_col}$2:${name_col}${max(catalog.max_row, 2)}"
    for ws in theme_sheets(wb):
        col = column_letter(ws, REQ_CAPACITY)
        rule = DataValidation(type="list", formula1=source, allow_blank=True)
        rule.add(f"{col}2:{col}{max(ws.max_row, 2)}")
        ws.data_validations.dataValidation = [rule]
    try:
        wb.save(path)
    except PermissionError:
        fail(f"cannot write {path.name}; close it in Excel and retry")
