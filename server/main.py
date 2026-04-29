from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from .routers import ocr, analyze, export

app = FastAPI(title="Gestor de Facturas", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(ocr.router)
app.include_router(analyze.router)
app.include_router(export.router)

# Sirve el frontend estático desde la raíz del proyecto.
# Debe montarse DESPUÉS de los routers para que /api/* no sea interceptado.
_static_dir = os.path.join(os.path.dirname(__file__), "..")
app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
