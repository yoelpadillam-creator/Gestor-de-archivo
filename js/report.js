// Renderiza el informe en el DOM y delega exportación al backend Python.

(function (global) {
  "use strict";

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function cell(v) {
    return v == null || v === ""
      ? `<span class="pill muted">ilegible</span>`
      : esc(String(v));
  }

  function renderTable(id, headers, rows, empty) {
    const host = document.getElementById(id);
    if (!rows.length) {
      host.innerHTML = `<p class="empty">${esc(empty)}</p>`;
      return;
    }
    const ths = headers.map(h => `<th>${esc(h)}</th>`).join("");
    const trs = rows.map(r =>
      `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`
    ).join("");
    host.innerHTML = `<div class="table-wrap"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
  }

  function renderSummary(s) {
    const cards = [
      { label: "Facturas analizadas",       value: s.invoices },
      { label: "Entradas detectadas",        value: s.entries_detected },
      { label: "Modelo analizado",           value: s.model_filter },
      { label: "Duplicados",                 value: s.duplicates,            cls: s.duplicates             ? "alert" : "ok" },
      { label: "Coincidencias exactas",      value: s.matches_exact,         cls: "ok" },
      { label: "Coincidencias parciales",    value: s.matches_partial,       cls: s.matches_partial        ? "warn" : "" },
      { label: "Facturados sin inventario",  value: s.missing_in_inventory,  cls: s.missing_in_inventory   ? "warn" : "" },
      { label: "Inventario no facturado",    value: s.not_invoiced,          cls: s.not_invoiced           ? "warn" : "" },
      { label: "Discrepancias color (FIT)",  value: s.fit_color_discrepancies, cls: s.fit_color_discrepancies ? "alert" : "ok" },
    ];
    document.getElementById("summary").innerHTML = cards.map(c =>
      `<div class="summary-item ${c.cls || ""}">
         <div class="value">${esc(String(c.value))}</div>
         <div class="label">${esc(c.label)}</div>
       </div>`
    ).join("");
  }

  function renderDuplicates(duplicates) {
    const rows = [];
    duplicates.forEach(d =>
      d.entries.forEach(e => rows.push([
        `<span class="pill ${d.by === 'chasis' ? 'alert' : 'warn'}">${esc(d.by)}</span>`,
        `<code>${esc(d.key)}</code>`,
        cell(e.file), String(e.page),
        cell(e.modelo), cell(e.chasis), cell(e.motor), cell(e.color)
      ]))
    );
    renderTable("tableDuplicates",
      ["Campo", "Valor", "Factura", "Pág.", "Modelo", "Chasis", "Motor", "Color"],
      rows, "No se detectaron duplicados.");
  }

  function renderMatches(matches) {
    const rows = matches.map(m => {
      const chasisCell = cell(m.invoice_chasis) +
        (!m.chasis_ok && m.inventory_chasis ? ` <span class="pill warn">≠ ${esc(m.inventory_chasis)}</span>` : "");
      const motorCell = cell(m.invoice_motor) +
        (!m.motor_ok && m.inventory_motor ? ` <span class="pill warn">≠ ${esc(m.inventory_motor)}</span>` : "");
      const colorCell = cell(m.invoice_color) +
        (!m.color_ok && m.inventory_color ? ` <span class="pill warn">≠ ${esc(m.inventory_color)}</span>` : "");
      return [
        cell(m.file), String(m.page),
        chasisCell, motorCell, colorCell,
        m.status === "exacto"
          ? `<span class="pill ok">exacto</span>`
          : `<span class="pill warn">parcial</span>`
      ];
    });
    renderTable("tableMatches",
      ["Factura", "Pág.", "Chasis", "Motor", "Color", "Estado"],
      rows, "Ninguna factura coincide con el inventario.");
  }

  function renderMissing(list) {
    renderTable("tableMissingInventory",
      ["Factura", "Pág.", "Modelo", "Chasis", "Motor", "Color"],
      list.map(e => [cell(e.file), String(e.page), cell(e.modelo),
                     cell(e.chasis), cell(e.motor), cell(e.color)]),
      "Todas las facturas están en inventario.");
  }

  function renderNotInvoiced(list) {
    renderTable("tableNotInvoiced",
      ["Modelo", "Chasis", "Motor", "Color"],
      list.map(r => [cell(r.modelo), cell(r.chasis), cell(r.motor), cell(r.color)]),
      "Todos los ítems del inventario aparecen en facturas.");
  }

  function renderFitDiscrepancies(list) {
    renderTable("tableFitDiscrepancies",
      ["Chasis", "Color Factura", "Color FIT", "Modelo FIT", "Factura", "Pág."],
      list.map(d => [
        cell(d.chasis),
        `<span class="pill warn">${cell(d.color_factura)}</span>`,
        `<span class="pill ok">${cell(d.color_fit)}</span>`,
        cell(d.fit_modelo), cell(d.file), String(d.page)
      ]),
      "No se cargó FIT o no hay discrepancias de color.");
  }

  function renderReport(report) {
    renderSummary(report.summary);
    renderDuplicates(report.duplicates);
    renderMatches(report.matches);
    renderMissing(report.missing_in_inventory);
    renderNotInvoiced(report.not_invoiced);
    renderFitDiscrepancies(report.fit_discrepancies);
    document.getElementById("step-report").hidden = false;
    document.getElementById("step-report").scrollIntoView({ behavior: "smooth" });
  }

  global.ReportModule = { renderReport };
})(window);
