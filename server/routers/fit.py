"""
Endpoint que recibe la FIT (orden de pedido) en PDF, le hace OCR y devuelve
una lista de filas {chasis, color_esperado, modelo, motor} usando el mismo
pipeline OCR + parser que las facturas.
"""

import json
from fastapi import APIRouter, UploadFile, File, Form

from ..services.pdf_pipeline import extract_pages
from ..services.parser import extract_entries

router = APIRouter(prefix="/api")


@router.post("/fit/pdf")
async def fit_pdf(
    files: list[UploadFile] = File(...),
    known_models: str = Form(""),
):
    models_list: list[str] = []
    if known_models:
        try:
            models_list = json.loads(known_models)
        except Exception:
            models_list = [m.strip() for m in known_models.split('|') if m.strip()]

    fit_rows: list[dict] = []
    errors: list[str] = []

    for upload in files:
        try:
            pdf_bytes = await upload.read()
            pages = extract_pages(pdf_bytes)
            entries = extract_entries(
                pages,
                upload.filename or "fit.pdf",
                models_list
            )
            for e in entries:
                if not e.get('chasis'):
                    continue
                fit_rows.append({
                    'chasis':         e['chasis'],
                    'color_esperado': e.get('color') or '',
                    'modelo':         e.get('modelo'),
                    'motor':          e.get('motor'),
                })
        except Exception as exc:
            errors.append(f"{upload.filename}: {exc}")

    return {"fit_rows": fit_rows, "errors": errors}
