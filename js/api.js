// Wrapper delgado sobre fetch() para los endpoints del backend Python.

(function (global) {
  "use strict";

  async function _checkResponse(res) {
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Error ${res.status}: ${text}`);
    }
    return res;
  }

  // POST /api/ocr — sube PDFs y devuelve entradas de vehículos parseadas.
  // knownModels: string[] de modelos a buscar (vacío = todos).
  async function ocr(files, modelFilter, knownModels) {
    const form = new FormData();
    files.forEach(f => form.append("files", f));
    form.append("model_filter", modelFilter || "ALL");
    form.append("known_models", JSON.stringify(knownModels || []));
    const res = await fetch("/api/ocr", { method: "POST", body: form });
    await _checkResponse(res);
    return res.json();
  }

  // POST /api/analyze — cruza inventario, facturas y FIT.
  async function analyze(inventory, invoiceEntries, fitRows, modelFilter) {
    const body = {
      inventory,
      invoice_entries: invoiceEntries,
      fit_rows: fitRows || [],
      model_filter: modelFilter || "ALL"
    };
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    await _checkResponse(res);
    return res.json();
  }

  // POST /api/export/xlsx — descarga informe Excel.
  async function exportXlsx(report) {
    const res = await fetch("/api/export/xlsx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report)
    });
    await _checkResponse(res);
    const blob = await res.blob();
    _triggerDownload(blob, "informe-facturas.xlsx");
  }

  // POST /api/export/pdf — descarga informe PDF.
  async function exportPdf(report) {
    const res = await fetch("/api/export/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report)
    });
    await _checkResponse(res);
    const blob = await res.blob();
    _triggerDownload(blob, "informe-facturas.pdf");
  }

  function _triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  global.API = { ocr, analyze, exportXlsx, exportPdf };
})(window);
