from pydantic import BaseModel
from typing import Optional


class InventoryRow(BaseModel):
    modelo: str
    chasis: str
    motor: str
    color: str


class FitRow(BaseModel):
    chasis: str
    color_esperado: str
    modelo: Optional[str] = None
    motor: Optional[str] = None


class InvoiceEntry(BaseModel):
    file: str
    page: int
    modelo: Optional[str] = None
    chasis: Optional[str] = None
    motor: Optional[str] = None
    color: Optional[str] = None
    chasis_norm: str = ""
    motor_norm: str = ""
    color_norm: str = ""


class OcrFileResult(BaseModel):
    filename: str
    entries: list[InvoiceEntry]
    error: Optional[str] = None


class OcrResponse(BaseModel):
    results: list[OcrFileResult]


class AnalyzeRequest(BaseModel):
    inventory: list[InventoryRow]
    invoice_entries: list[InvoiceEntry]
    fit_rows: Optional[list[FitRow]] = None
    model_filter: str = "ALL"


class DuplicateGroup(BaseModel):
    by: str          # "chasis" | "motor"
    key: str
    entries: list[InvoiceEntry]


class MatchEntry(BaseModel):
    file: str
    page: int
    invoice_chasis: Optional[str]
    invoice_motor: Optional[str]
    invoice_color: Optional[str]
    inventory_chasis: Optional[str]
    inventory_motor: Optional[str]
    inventory_color: Optional[str]
    chasis_ok: bool
    motor_ok: bool
    color_ok: bool
    status: str   # "exacto" | "parcial"


class FitDiscrepancy(BaseModel):
    chasis: str
    color_factura: Optional[str]
    color_fit: str
    fit_modelo: Optional[str]
    file: str
    page: int


class ReportSummary(BaseModel):
    invoices: int
    entries_detected: int
    model_filter: str
    duplicates: int
    matches_exact: int
    matches_partial: int
    missing_in_inventory: int
    not_invoiced: int
    fit_color_discrepancies: int


class AnalyzeResponse(BaseModel):
    summary: ReportSummary
    duplicates: list[DuplicateGroup]
    matches: list[MatchEntry]
    missing_in_inventory: list[InvoiceEntry]
    not_invoiced: list[InventoryRow]
    fit_discrepancies: list[FitDiscrepancy]
