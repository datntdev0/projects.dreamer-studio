import hmac
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from pydantic import BaseModel

from app.errors import error_response, register_error_handlers


class HealthResponse(BaseModel):
    status: str
    version: str


def create_app(token: str, version: str) -> FastAPI:
    app = FastAPI(title="Dreamer Studio Backend")
    expected = f"Bearer {token}".encode()

    @app.middleware("http")
    async def require_token(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        given = request.headers.get("authorization", "").encode()
        if not hmac.compare_digest(given, expected):
            return error_response(401, "UNAUTHORIZED", "Missing or invalid token")
        return await call_next(request)

    register_error_handlers(app)

    @app.get("/health")
    def health() -> HealthResponse:
        return HealthResponse(status="ok", version=version)

    return app
