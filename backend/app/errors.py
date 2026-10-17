import logging
import sys
from types import TracebackType

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("errors")


def error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"code": code, "message": message, "details": None})


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def on_http_error(request: Request, error: StarletteHTTPException) -> JSONResponse:
        return error_response(error.status_code, f"HTTP_{error.status_code}", str(error.detail))

    @app.exception_handler(Exception)
    async def on_unexpected_error(request: Request, error: Exception) -> JSONResponse:
        logger.error("Unhandled error on %s %s", request.method, request.url.path, exc_info=error)
        return error_response(500, "BACKEND_UNEXPECTED", "Unexpected backend error")


def install_excepthook() -> None:
    previous = sys.excepthook

    def hook(kind: type[BaseException], error: BaseException, trace: TracebackType | None) -> None:
        logger.critical("Unhandled startup error", exc_info=(kind, error, trace))
        previous(kind, error, trace)

    sys.excepthook = hook
