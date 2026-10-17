import logging
import re
from collections.abc import Callable
from datetime import UTC, date, datetime
from pathlib import Path

LEVEL_NAMES: dict[int, str] = {
    logging.DEBUG: "DEBUG",
    logging.INFO: "INFO",
    logging.WARNING: "WARN",
    logging.ERROR: "ERROR",
    logging.CRITICAL: "ERROR",
}


class LineFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        time = datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds")
        level = LEVEL_NAMES.get(record.levelno, record.levelname.upper())
        head = f"{time.replace('+00:00', 'Z')} {level} backend {record.name} {record.getMessage()}"
        if record.exc_info:
            return f"{head}\n{self.formatException(record.exc_info)}"
        return head


def delete_old_logs(log_dir: Path, prefix: str, today: date, keep_days: int) -> None:
    if not log_dir.is_dir():
        return
    pattern = re.compile(rf"^{re.escape(prefix)}-(\d{{4}}-\d{{2}}-\d{{2}})\.log$")
    for path in log_dir.iterdir():
        match = pattern.match(path.name)
        if not match:
            continue
        try:
            if (today - date.fromisoformat(match.group(1))).days >= keep_days:
                path.unlink()
        except ValueError, OSError:
            continue


class DailyFileHandler(logging.FileHandler):
    def __init__(
        self,
        log_dir: Path,
        prefix: str = "backend",
        keep_days: int = 7,
        clock: Callable[[], datetime] = datetime.now,
    ) -> None:
        self.log_dir = log_dir
        self.prefix = prefix
        self.keep_days = keep_days
        self.clock = clock
        log_dir.mkdir(parents=True, exist_ok=True)
        self.current_day = clock().date()
        delete_old_logs(log_dir, prefix, self.current_day, keep_days)
        super().__init__(self.dated_file(self.current_day), encoding="utf-8")

    def dated_file(self, day: date) -> Path:
        return self.log_dir / f"{self.prefix}-{day.isoformat()}.log"

    def emit(self, record: logging.LogRecord) -> None:
        day = self.clock().date()
        if day != self.current_day:
            self.current_day = day
            if self.stream:
                self.stream.close()
                self.stream = None
            self.baseFilename = str(self.dated_file(day))
            delete_old_logs(self.log_dir, self.prefix, day, self.keep_days)
        super().emit(record)


def setup_logging(log_dir: Path, level: str) -> None:
    handler = DailyFileHandler(log_dir)
    handler.setFormatter(LineFormatter())
    root = logging.getLogger()
    root.addHandler(handler)
    root.setLevel(level.upper())
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logging.getLogger(name).setLevel(level.upper())
