from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pathlib import Path

from api.database import init_db
from api.routes.telemetry import router as telemetry_router
from api.routes.courses import router as courses_router
from api.routes.admin import router as admin_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Student AI Server",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Tauri apps use custom scheme; restrict in production
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(telemetry_router)
app.include_router(courses_router)
app.include_router(admin_router)

# Serve admin dashboard SPA (built via `cd server/dashboard && bun run build`).
# Falls back gracefully if the SPA hasn't been built yet.
dashboard_dir = Path(__file__).parent.parent / "dashboard" / "dist"
if (dashboard_dir / "index.html").exists():
    app.mount("/dashboard", StaticFiles(directory=str(dashboard_dir), html=True), name="dashboard")


@app.get("/health")
async def health():
    return {"status": "ok"}
