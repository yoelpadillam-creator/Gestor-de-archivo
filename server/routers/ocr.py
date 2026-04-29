from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional
from ..services.pdf_pipeline import extract_pages
from ..services.parser import extract_entries

router = APIRouter(prefix="/api")


@router.post("/ocr")
async def ocr_invoices(
    files: list[UploadFile] = File(...),
    model_filter: str = Form("ALL"),
    known_models: str = Form(""),   # JSON array serializado como string
):
    """
    Recibe PDFs, extrae texto (OCR o digital) y parsea entradas de vehículos.
    known_models: lista separada por '|' de modelos a buscar.
    """
    import json

    models_list: list[str] = []
    if known_models:
        try:
            models_list = json.loads(known_models)
        except Exception:
            models_list = [m.strip() for m in known_models.split('|') if m.strip()]

    results = []
    for upload in files:
        try:
            pdf_bytes = await upload.read()
            pages = extract_pages(pdf_bytes)
            entries = extract_entries(pages, upload.filename or "sin_nombre.pdf",
                                      models_list)
            results.append({
                "filename": upload.filename,
                "entries": entries,
                "error": None
            })
        except Exception as exc:
            results.append({
                "filename": upload.filename,
                "entries": [],
                "error": str(exc)
            })

    return {"results": results}
