import logging
import os
from pathlib import Path

import uvicorn

from app.errors import install_excepthook
from app.log import setup_logging
from app.main import create_app

if __name__ == "__main__":
    install_excepthook()
    port = int(os.environ.get("DREAMER_PORT", "8765"))
    version = os.environ.get("DREAMER_VERSION", "dev")
    setup_logging(Path(os.environ["DREAMER_LOG_DIR"]), os.environ.get("DREAMER_LOG_LEVEL", "info"))
    token = os.environ["DREAMER_TOKEN"]
    logging.getLogger("run").info("Backend %s starting on port %s", version, port)
    uvicorn.run(create_app(token, version), host="127.0.0.1", port=port, log_config=None)
