import os

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Dreamer Studio Backend")


class HealthResponse(BaseModel):
    status: str
    version: str


@app.get("/health")
def health() -> HealthResponse:
    return HealthResponse(status="ok", version=os.environ.get("DREAMER_VERSION", "dev"))
