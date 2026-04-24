// Orquestador: cablea la UI, mantiene estado en memoria y dispara las fases.

(function () {
  "use strict";

  const state = {
    inventoryAll: [],   // todas las filas del Excel
    inventoryTauro: [], // solo Tauro
    invoices: [],       // File[]
    invoiceEntries: [], // entradas Tauro extraídas
    report: null
  };

  const els = {
    inventoryInput:   document.getElementById("inventoryInput"),
    inventoryStatus:  document.getElementById("inventoryStatus"),
    inventoryTable:   document.getElementById("inventoryTableWrap"),
    invoicesInput:    document.getElementById("invoicesInput"),
    invoicesList:     document.getElementById("invoicesList"),
    analyzeBtn:       document.getElementById("analyzeBtn"),
    analyzeProgress:  document.getElementById("analyzeProgress"),
    progressFill:     document.getElementById("progressFill"),
    progressLabel:    document.getElementById("progressLabel"),
    exportXlsxBtn:    document.getElementById("exportXlsxBtn"),
    exportPdfBtn:     document.getElementById("exportPdfBtn")
  };

  function updateAnalyzeButton() {
    els.analyzeBtn.disabled =
      state.inventoryTauro.length === 0 || state.invoices.length === 0;
  }

  // ---- Paso 1: Inventario -------------------------------------------------

  function renderInventoryTable(rows) {
    if (!rows.length) {
      els.inventoryTable.innerHTML =
        `<div class="empty">No hay filas con modelo "TAURO".</div>`;
      return;
    }
    const headers = ["Modelo", "Chasis", "Motor", "Color"];
    const body = rows.map(r =>
      `<tr>
         <td>${escape(r.modelo)}</td>
         <td><code>${escape(r.chasis)}</code></td>
         <td><code>${escape(r.motor)}</code></td>
         <td>${escape(r.color)}</td>
       </tr>`
    ).join("");
    els.inventoryTable.innerHTML =
      `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
       <tbody>${body}</tbody></table>`;
  }

  function escape(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  els.inventoryInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    els.inventoryStatus.textContent = `Leyendo ${file.name}…`;
    els.inventoryStatus.className = "status";
    try {
      const rows = await window.InventoryModule.loadInventoryFile(file);
      state.inventoryAll = rows;
      state.inventoryTauro = window.InventoryModule.filterTauro(rows);
      els.inventoryStatus.textContent =
        `${rows.length} filas leídas · ${state.inventoryTauro.length} Tauro activos.`;
      els.inventoryStatus.className = "status ok";
      renderInventoryTable(state.inventoryTauro);
    } catch (err) {
      console.error(err);
      els.inventoryStatus.textContent = `Error: ${err.message}`;
      els.inventoryStatus.className = "status err";
      state.inventoryTauro = [];
      els.inventoryTable.innerHTML = "";
    }
    updateAnalyzeButton();
  });

  // ---- Paso 2: Facturas ---------------------------------------------------

  function renderInvoicesList() {
    if (!state.invoices.length) {
      els.invoicesList.innerHTML = "";
      return;
    }
    els.invoicesList.innerHTML = state.invoices.map((f, idx) =>
      `<li data-idx="${idx}">
         <span class="fname">${escape(f.name)}</span>
         <span class="fstatus" data-idx="${idx}">pendiente</span>
       </li>`
    ).join("");
  }

  function setInvoiceStatus(idx, text, cls) {
    const el = els.invoicesList.querySelector(`.fstatus[data-idx="${idx}"]`);
    if (el) {
      el.textContent = text;
      el.className = `fstatus ${cls || ""}`;
    }
  }

  els.invoicesInput.addEventListener("change", (e) => {
    state.invoices = Array.from(e.target.files || []);
    renderInvoicesList();
    updateAnalyzeButton();
  });

  // ---- Paso 3: Analizar ---------------------------------------------------

  function setProgress(done, total, label) {
    els.analyzeProgress.hidden = false;
    const pct = total ? Math.round((done / total) * 100) : 0;
    els.progressFill.style.width = `${pct}%`;
    els.progressLabel.textContent = label;
  }

  els.analyzeBtn.addEventListener("click", async () => {
    els.analyzeBtn.disabled = true;
    state.invoiceEntries = [];
    setProgress(0, state.invoices.length, "Preparando OCR…");

    for (let i = 0; i < state.invoices.length; i++) {
      const file = state.invoices[i];
      setInvoiceStatus(i, "procesando…", "run");
      setProgress(i, state.invoices.length, `Factura ${i + 1}/${state.invoices.length}: ${file.name}`);

      try {
        const pages = await window.OcrModule.ocrPdf(file, (p) => {
          setProgress(
            i + (p.ratio || 0),
            state.invoices.length,
            `Factura ${i + 1}/${state.invoices.length}: ${file.name} · pág. ${p.pageIndex}/${p.pageCount} (${p.stage})`
          );
        });
        const entries = window.ParserModule.extractTauroEntries(pages, file.name);
        state.invoiceEntries.push(...entries);
        setInvoiceStatus(i,
          entries.length ? `${entries.length} Tauro detectado(s)` : "sin Tauros",
          "done");
      } catch (err) {
        console.error(err);
        setInvoiceStatus(i, `error: ${err.message}`, "err");
      }

      setProgress(i + 1, state.invoices.length,
        `Factura ${i + 1}/${state.invoices.length} completada.`);
    }

    setProgress(state.invoices.length, state.invoices.length, "Cruzando datos…");

    const invoiceNames = state.invoices.map(f => f.name);
    state.report = window.AnalyzerModule.crossReference(
      state.inventoryTauro,
      state.invoiceEntries,
      invoiceNames
    );
    window.ReportModule.renderReport(state.report);

    setProgress(state.invoices.length, state.invoices.length, "Listo.");
    els.analyzeBtn.disabled = false;

    // Tesseract worker ya no se necesita mientras el usuario revisa el informe.
    try { await window.OcrModule.terminateWorker(); } catch (_) {}
  });

  // ---- Exportaciones ------------------------------------------------------

  els.exportXlsxBtn.addEventListener("click", () => {
    if (!state.report) return;
    window.ReportModule.exportXlsx(state.report);
  });

  els.exportPdfBtn.addEventListener("click", () => {
    if (!state.report) return;
    window.ReportModule.exportPdf(state.report);
  });
})();
