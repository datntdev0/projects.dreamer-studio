import json
import logging
from collections.abc import AsyncIterator, Callable
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from app.errors import error_response
from app.jobs.demo import run_demo

logger = logging.getLogger("jobs")

JobRunner = Callable[[dict[str, Any]], AsyncIterator[dict[str, Any]]]

JOBS: dict[str, JobRunner] = {"demo": run_demo}

router = APIRouter()


async def stream_events(request: Request, job_type: str, run: JobRunner, params: dict[str, Any]) -> AsyncIterator[str]:
    logger.info("job started type=%s", job_type)
    finished = False
    try:
        async for event in run(params):
            if await request.is_disconnected():
                return
            yield json.dumps(event) + "\n"
            if event["type"] in ("done", "error"):
                finished = True
                logger.info("job ended type=%s result=%s", job_type, "done" if event["type"] == "done" else "failed")
    finally:
        if not finished:
            logger.info("job cancelled type=%s", job_type)


@router.post("/jobs/{job_type}", response_model=None)
async def start_job(job_type: str, request: Request) -> StreamingResponse | JSONResponse:
    run = JOBS.get(job_type)
    if run is None:
        return error_response(404, "JOB_UNKNOWN", f"Unknown job type: {job_type}")
    try:
        params = await request.json()
    except ValueError:
        params = None
    if not isinstance(params, dict):
        return error_response(422, "JOB_PARAMS_INVALID", "Job params must be a JSON object")
    return StreamingResponse(stream_events(request, job_type, run, params), media_type="application/x-ndjson")
