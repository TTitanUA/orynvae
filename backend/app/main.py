from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.api.router import api_router
from app.core.config import APP_VERSION, FRONTEND_ORIGIN, is_debug_enabled
from app.core.debug_logging import debug_log
from app.storage.paths import ensure_data_dirs


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    ensure_data_dirs()
    debug_log("backend", "system", "app.startup", {"debug_enabled": is_debug_enabled()})
    yield
    debug_log("backend", "system", "app.shutdown", {"debug_enabled": is_debug_enabled()})


async def debug_http_middleware(request: Request, call_next):
    if not is_debug_enabled():
        return await call_next(request)

    request_id = str(uuid4())
    started = perf_counter()
    debug_log(
        "backend",
        "http",
        "request.start",
        {
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "query": str(request.url.query),
            "client": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent"),
        },
    )
    try:
        response = await call_next(request)
    except Exception as exc:
        duration_ms = int((perf_counter() - started) * 1000)
        debug_log(
            "backend",
            "http",
            "request.error",
            {
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "duration_ms": duration_ms,
                "error_type": exc.__class__.__name__,
                "error": str(exc),
            },
        )
        raise

    duration_ms = int((perf_counter() - started) * 1000)
    response.headers["X-Orynvae-Request-Id"] = request_id
    debug_log(
        "backend",
        "http",
        "request.end",
        {
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
        },
    )
    return response


def create_app() -> FastAPI:
    app = FastAPI(
        title="Orynvae API",
        version=APP_VERSION,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[FRONTEND_ORIGIN, "http://127.0.0.1:9002"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(BaseHTTPMiddleware, dispatch=debug_http_middleware)
    app.include_router(api_router, prefix="/api")

    return app


app = create_app()
