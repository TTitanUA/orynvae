import os


APP_NAME = "orynvae-backend"
APP_VERSION = "0.1.0"

BACKEND_HOST = "127.0.0.1"
BACKEND_PORT = 9001
FRONTEND_ORIGIN = "http://localhost:9002"

DEBUG_TRUE_VALUES = {"1", "true", "yes", "on"}


def is_debug_enabled() -> bool:
    return os.environ.get("DEBUG", "").strip().lower() in DEBUG_TRUE_VALUES
