// Orquestador: gestiona estado UI, llama al backend Python y renderiza el informe.

(function () {
  "use strict";

  const state = {
    inventoryAll:   [],   // todas las filas del Excel inventario
    inventory:      [],   // filtradas por modelo seleccionado
    fit:            [],   // filas de la FIT
    invoices:       [],   // File[] de PDFs
    invoiceEntries: [],   // entradas devueltas por /api/ocr
    report:         null,
    modelFilter:    "ALL"
  };

  // ── Referencias DOM ──────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  const els = {
    inventoryInput:  $("inventoryInput"),
    inventoryStatus: $("inventoryStatus"),
    inventoryTable:  $("inventoryTableWrap"),
    modelSelect:     $("modelSelect"),
    fitInput:        $("fitInput"),
    fitStatus:       $("fitStatus"),
    fitTable:        $("fitTableWrap"),
    invoicesInput:   $("invoicesInput"),
    invoicesList:    $("invoicesList"),
    analyzeBtn:      $("analyzeBtn"),
    analyzeProgress: $("analyzeProgress"),
    progressFill:    $("progressFill"),
    progressLabel:   $("progressLabel"),
    exportXlsxBtn:   $("exportXlsxBtn"),
    exportPdfBtn:    $("exportPdfBtn")
  };

  // ── Utilidades UI ────────────────────────────────────────────────────────
  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function setStatus(el, text, cls) {
    el.textContent = text;
    el.className = "status" + (cls ? " " + cls : "");
  }

  function setProgress(pct, label) {
    els.analyzeProgress.hidden = false;
    els.progressFill.style.width = `${Math.min(100, pct)}%`;
    els.progressLabel.textContent = label;
  }

  function updateAnalyzeBtn() {
    els.analyzeBtn.disabled =
      state.inventory.length === 0 || state.invoices.length === 0;
  }

  // ── Tablas simples ───────────────────────────────────────────────────────
  function renderSimpleTable(host, headers, rows, empty) {
    if (!rows.length) {
      host.innerHTML = `<p class="empty">${esc(empty)}</p>`;
      return;
    }
    const ths = headers.map(h => `<th>${esc(h)}</th>`).join("");
    const trs = rows.map(r =>
      `<tr>${r.map(c => `<td>${esc(String(c ?? ""))}</td>`).join("")}</tr>`
    ).join("");
    host.innerHTML =
      `<div class="table-wrap"><table><thead><tr>${ths}</tr></thead>` +
      `<tbody>${trs}</tbody></table></div>`;
  }

  // ── PASO 1: Inventario ───────────────────────────────────────────────────
  els.inventoryInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setStatus(els.inventoryStatus, `Leyendo ${file.name}…`);
    try {
      state.inventoryAll = await window.InventoryModule.loadInventoryFile(file);
      populateModelSelect(window.InventoryModule.uniqueModels(state.inventoryAll));
      applyModelFilter();
      setStatus(els.inventoryStatus,
        `${state.inventoryAll.length} filas leídas · ${state.inventory.length} mostradas.`, "ok");
    } catch (err) {
      setStatus(els.inventoryStatus, `Error: ${err.message}`, "err");
      state.inventoryAll = [];
      state.inventory = [];
      els.inventoryTable.innerHTML = "";
    }
    updateAnalyzeBtn();
  });

  function populateModelSelect(models) {
    els.modelSelect.innerHTML =
      `<option value="ALL">Todos los modelos</option>` +
      models.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join("");
    els.modelSelect.disabled = false;
  }

  function applyModelFilter() {
    state.modelFilter = els.modelSelect.value;
    state.inventory = window.InventoryModule.filterByModel(
      state.inventoryAll, state.modelFilter);
    renderSimpleTable(
      els.inventoryTable,
      ["Modelo", "Chasis", "Motor", "Color"],
      state.inventory.map(r => [r.modelo, r.chasis, r.motor, r.color]),
      "No hay filas para el modelo seleccionado."
    );
    updateAnalyzeBtn();
  }

  els.modelSelect.addEventListener("change", applyModelFilter);

  // ── PASO 2: FIT ──────────────────────────────────────────────────────────
  els.fitInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const isPdf = (file.name || "").toLowerCase().endsWith(".pdf");
    setStatus(els.fitStatus,
      isPdf ? `OCR de ${file.name}… (puede tardar varios segundos)`
            : `Leyendo ${file.name}…`);
    try {
      const knownModels = window.InventoryModule.uniqueModels(state.inventoryAll);
      state.fit = await window.InventoryModule.loadFitFile(file, knownModels);
      setStatus(els.fitStatus, `${state.fit.length} filas FIT cargadas.`, "ok");
      renderSimpleTable(
        els.fitTable,
        ["Chasis", "Color esperado", "Modelo"],
        state.fit.map(r => [r.chasis, r.color_esperado, r.modelo || "—"]),
        "FIT vacía."
      );
    } catch (err) {
      setStatus(els.fitStatus, `Error: ${err.message}`, "err");
      state.fit = [];
      els.fitTable.innerHTML = "";
    }
  });

  // ── PASO 3: Facturas ─────────────────────────────────────────────────────
  els.invoicesInput.addEventListener("change", (e) => {
    state.invoices = Array.from(e.target.files || []);
    els.invoicesList.innerHTML = state.invoices.map((f, i) =>
      `<li><span class="fname">${esc(f.name)}</span>` +
      `<span class="fstatus" data-i="${i}">pendiente</span></li>`
    ).join("");
    updateAnalyzeBtn();
  });

  function setFileStatus(i, text, cls) {
    const el = els.invoicesList.querySelector(`[data-i="${i}"]`);
    if (el) { el.textContent = text; el.className = `fstatus ${cls || ""}`; }
  }

  // ── PASO 4: Analizar ─────────────────────────────────────────────────────
  els.analyzeBtn.addEventListener("click", async () => {
    els.analyzeBtn.disabled = true;
    state.invoiceEntries = [];
    $("step-report").hidden = true;

    const knownModels = state.modelFilter === "ALL"
      ? window.InventoryModule.uniqueModels(state.inventoryAll)
      : [state.modelFilter];

    // Fase 1: OCR (el backend procesa cada PDF)
    setProgress(10, "Enviando facturas al servidor para OCR…");
    try {
      const ocrResult = await window.API.ocr(
        state.invoices, state.modelFilter, knownModels);

      ocrResult.results.forEach((r, i) => {
        if (r.error) {
          setFileStatus(i, `error: ${r.error}`, "err");
        } else {
          const n = r.entries.length;
          setFileStatus(i, n ? `${n} entrada(s)` : "sin entradas", "done");
          state.invoiceEntries.push(...r.entries);
        }
      });
    } catch (err) {
      setProgress(0, "Error en OCR.");
      alert(err.message);
      els.analyzeBtn.disabled = false;
      return;
    }

    // Fase 2: Análisis cruzado
    setProgress(80, "Cruzando datos con inventario y FIT…");
    try {
      state.report = await window.API.analyze(
        state.inventory,
        state.invoiceEntries,
        state.fit,
        state.modelFilter
      );
    } catch (err) {
      setProgress(80, "Error en análisis.");
      alert(err.message);
      els.analyzeBtn.disabled = false;
      return;
    }

    setProgress(100, "Listo.");
    window.ReportModule.renderReport(state.report);
    els.analyzeBtn.disabled = false;
  });

  // ── Exportaciones ────────────────────────────────────────────────────────
  els.exportXlsxBtn.addEventListener("click", async () => {
    if (!state.report) return;
    try {
      els.exportXlsxBtn.disabled = true;
      await window.API.exportXlsx(state.report);
    } catch (err) {
      alert(`Error al exportar Excel: ${err.message}`);
    } finally {
      els.exportXlsxBtn.disabled = false;
    }
  });

  els.exportPdfBtn.addEventListener("click", async () => {
    if (!state.report) return;
    try {
      els.exportPdfBtn.disabled = true;
      await window.API.exportPdf(state.report);
    } catch (err) {
      alert(`Error al exportar PDF: ${err.message}`);
    } finally {
      els.exportPdfBtn.disabled = false;
    }
  });
})();
