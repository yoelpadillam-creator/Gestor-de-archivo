// Wrapper delgado sobre fetch() para los endpoints del backend Python.

(function (global) {
  "use strict";

  const SERVER_DOWN_MSG =
    "No se puede conectar con el servidor Python.\n\n" +
    "Comprueba que:\n" +
    "  1) El servidor está arrancado: ejecuta «python run.py» en una terminal.\n" +
    "  2) Estás usando la URL «http://localhost:8000» (no abrir el HTML directamente).";

  async function _fetch(url, options) {
    try {
      return await fetch(url, options);
    } catch (err) {
      // 'Failed to fetch' = no se llegó al servidor (no corre o file://).
      if (err && /failed to fetch|networkerror|load failed/i.test(err.message || "")) {
        const e = new Error(SERVER_DOWN_MSG);
        e.cause = err;
        throw e;
      }
      throw err;
    }
  }

  async function _checkResponse(res) {
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Error ${res.status}: ${text}`);
    }
    return res;
  }

  // POST /api/ocr — sube PDFs de facturas; devuelve entradas parseadas.
  async function ocr(files, modelFilter, knownModels) {
    const form = new FormData();
    files.forEach(f => form.append("files", f));
    form.append("model_filter", modelFilter || "ALL");
    form.append("known_models", JSON.stringify(knownModels || []));
    const res = await _fetch("/api/ocr", { method: "POST", body: form });
    await _checkResponse(res);
    return res.json();
  }

  // POST /api/fit/pdf — sube uno o más PDFs de FIT; devuelve fit_rows.
  async function fitPdf(files, knownModels) {
    const form = new FormData();
    const arr = Array.isArray(files) ? files : [files];
    arr.forEach(f => form.append("files", f));
    form.append("known_models", JSON.stringify(knownModels || []));
    const res = await _fetch("/api/fit/pdf", { method: "POST", body: form });
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
    const res = await _fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    await _checkResponse(res);
    return res.json();
  }

  async function exportXlsx(report) {
    const res = await _fetch("/api/export/xlsx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report)
    });
    await _checkResponse(res);
    _triggerDownload(await res.blob(), "informe-facturas.xlsx");
  }

  async function exportPdf(report) {
    const res = await _fetch("/api/export/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report)
    });
    await _checkResponse(res);
    _triggerDownload(await res.blob(), "informe-facturas.pdf");
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

  global.API = { ocr, fitPdf, analyze, exportXlsx, exportPdf };
})(window);
