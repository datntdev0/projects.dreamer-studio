import logging
import sys
from collections.abc import Iterator
from datetime import UTC, date, datetime
from pathlib import Path

import pytest

from app.log import DailyFileHandler, LineFormatter, delete_old_logs

CREATED = datetime(2026, 10, 17, 8, 4, 5, 123000, tzinfo=UTC).timestamp()


def make_record(level: int, message: str = "hello", exc_info: tuple | None = None) -> logging.LogRecord:
    record = logging.LogRecord("app.sample", level, __file__, 1, message, None, exc_info)
    record.created = CREATED
    record.msecs = 123.0
    return record


@pytest.mark.parametrize(
    ("level", "label"),
    [
        (logging.DEBUG, "DEBUG"),
        (logging.INFO, "INFO"),
        (logging.WARNING, "WARN"),
        (logging.ERROR, "ERROR"),
        (logging.CRITICAL, "ERROR"),
    ],
)
def test_TH01_01_line_format_levels(level: int, label: str) -> None:
    line = LineFormatter().format(make_record(level))
    assert line == f"2026-10-17T08:04:05.123Z {label} backend app.sample hello"


def test_TH01_01_line_format_with_traceback() -> None:
    try:
        raise ValueError("boom")
    except ValueError:
        exc_info = sys.exc_info()
    line = LineFormatter().format(make_record(logging.ERROR, "failed", exc_info))
    first, _, rest = line.partition("\n")
    assert first == "2026-10-17T08:04:05.123Z ERROR backend app.sample failed"
    assert "Traceback" in rest
    assert "ValueError: boom" in rest
    assert not line.endswith("\n")


def touch_logs(log_dir: Path, names: list[str]) -> None:
    for name in names:
        (log_dir / name).write_text("x")


def test_TH01_01_delete_old_logs_boundary(tmp_path: Path) -> None:
    touch_logs(
        tmp_path,
        ["backend-2026-10-09.log", "backend-2026-10-10.log", "backend-2026-10-11.log", "backend-2026-10-17.log"],
    )
    delete_old_logs(tmp_path, "backend", date(2026, 10, 17), 7)
    assert sorted(p.name for p in tmp_path.iterdir()) == ["backend-2026-10-11.log", "backend-2026-10-17.log"]


def test_TH01_01_delete_old_logs_ignores_other_files(tmp_path: Path) -> None:
    others = ["main-2026-01-01.log", "backend-2026-01-01.txt", "backend-old.log", "notes.log"]
    touch_logs(tmp_path, others + ["backend-2026-01-01.log"])
    delete_old_logs(tmp_path, "backend", date(2026, 10, 17), 7)
    assert sorted(p.name for p in tmp_path.iterdir()) == sorted(others)


def test_TH01_01_delete_old_logs_missing_dir(tmp_path: Path) -> None:
    delete_old_logs(tmp_path / "missing", "backend", date(2026, 10, 17), 7)


class FakeClock:
    def __init__(self, now: datetime) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture
def handlers() -> Iterator[list[logging.Handler]]:
    created: list[logging.Handler] = []
    yield created
    for handler in created:
        handler.close()


def test_TH01_01_daily_handler_switches_file_and_cleans_up(tmp_path: Path, handlers: list[logging.Handler]) -> None:
    touch_logs(tmp_path, ["backend-2026-10-01.log"])
    clock = FakeClock(datetime(2026, 10, 17, 23, 59, 0))
    handler = DailyFileHandler(tmp_path, clock=clock)
    handlers.append(handler)
    handler.setFormatter(logging.Formatter("%(message)s"))

    handler.emit(make_record(logging.INFO, "first"))
    clock.now = datetime(2026, 10, 18, 0, 0, 1)
    handler.emit(make_record(logging.INFO, "second"))
    handler.close()

    assert "first" in (tmp_path / "backend-2026-10-17.log").read_text()
    day_two = (tmp_path / "backend-2026-10-18.log").read_text()
    assert "second" in day_two
    assert "first" not in day_two
    assert not (tmp_path / "backend-2026-10-01.log").exists()
