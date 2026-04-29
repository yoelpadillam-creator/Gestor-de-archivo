from fastapi import APIRouter
from ..models.schemas import AnalyzeRequest, AnalyzeResponse
from ..services.analyzer import cross_reference

router = APIRouter(prefix="/api")


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest):
    inventory  = [r.model_dump() for r in req.inventory]
    entries    = [e.model_dump() for e in req.invoice_entries]
    fit_rows   = [f.model_dump() for f in req.fit_rows] if req.fit_rows else []

    invoice_files = sorted({e['file'] for e in entries})

    report = cross_reference(
        inventory=inventory,
        invoice_entries=entries,
        invoice_filenames=invoice_files,
        fit_rows=fit_rows,
        model_filter=req.model_filter,
    )
    return report
