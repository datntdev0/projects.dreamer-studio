import asyncio
from collections.abc import AsyncIterator
from typing import Any


def int_param(params: dict[str, Any], key: str, default: int) -> int:
    value = params.get(key)
    return value if isinstance(value, int) and not isinstance(value, bool) and value > 0 else default


async def run_demo(params: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    ticks = int_param(params, "ticks", 10)
    tick_ms = int_param(params, "tickMs", 300)
    fail = params.get("fail") is True
    for tick in range(1, ticks + 1):
        await asyncio.sleep(tick_ms / 1000)
        yield {"type": "progress", "percent": round(tick * 100 / ticks)}
        yield {"type": "log", "level": "info", "message": f"Processing chapter {tick} of {ticks}"}
        if fail and tick == ticks // 2:
            yield {"type": "error", "code": "JOB_FAILED", "message": f"Demo failure at tick {tick}"}
            return
    yield {"type": "done"}
