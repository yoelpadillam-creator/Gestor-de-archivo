// Pinta el informe en el DOM y exporta a Excel (SheetJS) o PDF (jsPDF autotable).

(function (global) {
  "use strict";

  const ILEGIBLE = `<span class="pill muted">ilegible</span>`;

  function safe(v) {
    return v == null || v === "" ? ILEGIBLE : escapeHtml(String(v));
  }

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function renderTable(containerId, headers, rows, emptyMsg) {
    const host = document.getElementById(containerId);
    if (!rows.length) {
      host.innerHTML = `<div class="empty">${escapeHtml(emptyMsg)}</div>`;
      return;
    }
    const thead = `<thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`;
    const tbody = `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>`;
    host.innerHTML = `<table>${thead}${tbody}</table>`;
  }

  function renderSummary(summary) {
    const host = document.getElementById("summary");
    const cards = [
      { label: "Facturas analizadas", value: summary.invoices },
      { label: "Tauros detectados",   value: summary.tauroEntries },
      { label: "Facturas duplicadas", value: summary.duplicates, cls: summary.duplicates ? "alert" : "ok" },
      { label: "Coincidencias exactas", value: summary.matchesExact, cls: "ok" },
      { label: "Coincidencias parciales", value: summary.matchesPartial, cls: summary.matchesPartial ? "warn" : "" },
      { label: "Facturados no en inventario", value: summary.missingInInventory, cls: summary.missingInInventory ? "warn" : "" },
      { label: "En inventario no facturados", value: summary.notInvoiced, cls: summary.notInvoiced ? "warn" : "" }
    ];
    host.innerHTML = cards.map(c =>
      `<div class="summary-item ${c.cls || ""}">
         <div class="value">${c.value}</div>
         <div class="label">${escapeHtml(c.label)}</div>
       </div>`
    ).join("");
  }

  function renderDuplicates(duplicates) {
    const headers = ["Coincidencia por", "Valor", "Apariciones", "Facturas"];
    const rows = duplicates.map(d => {
      const aparic = d.entries.length;
      const list = d.entries
        .map(e => `${escapeHtml(e.file)} (pág. ${e.page})`)
        .join("<br>");
      return [
        `<span class="pill err">${escapeHtml(d.by)}</span>`,
        `<code>${escapeHtml(d.key)}</code>`,
        String(aparic),
        list
      ];
    });
    renderTable("tableDuplicates", headers, rows, "No se detectaron duplicados.");
  }

  function renderMatches(matches) {
    const headers = ["Factura", "Pág.", "Chasis", "Motor", "Color", "Estado"];
    const rows = matches.map(m => [
      safe(m.file),
      String(m.page),
      safe(m.invoiceChasis) + (m.chasisOk ? "" : ` <span class="pill warn">≠ ${escapeHtml(m.inventoryChasis || "-")}</span>`),
      safe(m.invoiceMotor)  + (m.motorOk  ? "" : ` <span class="pill warn">≠ ${escapeHtml(m.inventoryMotor  || "-")}</span>`),
      safe(m.invoiceColor)  + (m.colorOk  ? "" : ` <span class="pill warn">≠ ${escapeHtml(m.inventoryColor  || "-")}</span>`),
      m.status === "exacto"
        ? `<span class="pill ok">exacto</span>`
        : `<span class="pill warn">parcial</span>`
    ]);
    renderTable("tableMatches", headers, rows, "Ninguna factura coincide con el inventario.");
  }

  function renderMissing(list) {
    const headers = ["Factura", "Pág.", "Chasis", "Motor", "Color"];
    const rows = list.map(e => [
      safe(e.file), String(e.page), safe(e.chasis), safe(e.motor), safe(e.color)
    ]);
    renderTable("tableMissingInventory", headers, rows,
      "Todas las facturas encontradas están en inventario.");
  }

  function renderNotInvoiced(list) {
    const headers = ["Modelo", "Chasis", "Motor", "Color"];
    const rows = list.map(e => [
      safe(e.modelo), safe(e.chasis), safe(e.motor), safe(e.color)
    ]);
    renderTable("tableNotInvoiced", headers, rows,
      "Todos los Tauros del inventario aparecen en alguna factura.");
  }

  function renderReport(report) {
    renderSummary(report.summary);
    renderDuplicates(report.duplicates);
    renderMatches(report.matches);
    renderMissing(report.missingInInventory);
    renderNotInvoiced(report.notInvoiced);
    document.getElementById("step-report").hidden = false;
  }

  // --- EXPORTACIONES ------------------------------------------------------

  function buildSheetRows(report) {
    const sheets = {};

    sheets.Resumen = [
      ["Métrica", "Valor"],
      ["Facturas analizadas", report.summary.invoices],
      ["Tauros detectados", report.summary.tauroEntries],
      ["Facturas duplicadas", report.summary.duplicates],
      ["Coincidencias exactas", report.summary.matchesExact],
      ["Coincidencias parciales", report.summary.matchesPartial],
      ["Facturados no en inventario", report.summary.missingInInventory],
      ["En inventario no facturados", report.summary.notInvoiced]
    ];

    const dupRows = [["Coincidencia por", "Valor", "Factura", "Página"]];
    report.duplicates.forEach(d =>
      d.entries.forEach(e => dupRows.push([d.by, d.key, e.file, e.page]))
    );
    sheets["A_Duplicados"] = dupRows;

    sheets["B_Coincidencias"] = [
      ["Factura", "Pág.", "Chasis factura", "Chasis inv.", "Motor factura", "Motor inv.",
       "Color factura", "Color inv.", "Chasis OK", "Motor OK", "Color OK", "Estado"],
      ...report.matches.map(m => [
        m.file, m.page,
        m.invoiceChasis || "", m.inventoryChasis || "",
        m.invoiceMotor  || "", m.inventoryMotor  || "",
        m.invoiceColor  || "", m.inventoryColor  || "",
        m.chasisOk ? "Sí" : "No", m.motorOk ? "Sí" : "No", m.colorOk ? "Sí" : "No",
        m.status
      ])
    ];

    sheets["C_NoEnInventario"] = [
      ["Factura", "Pág.", "Chasis", "Motor", "Color"],
      ...report.missingInInventory.map(e => [
        e.file, e.page, e.chasis || "", e.motor || "", e.color || ""
      ])
    ];

    sheets["D_NoFacturados"] = [
      ["Modelo", "Chasis", "Motor", "Color"],
      ...report.notInvoiced.map(e => [e.modelo, e.chasis, e.motor, e.color])
    ];

    return sheets;
  }

  function exportXlsx(report) {
    const wb = XLSX.utils.book_new();
    const sheets = buildSheetRows(report);
    Object.entries(sheets).forEach(([name, rows]) => {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
    XLSX.writeFile(wb, "informe-facturas-tauro.xlsx");
  }

  function exportPdf(report) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

    doc.setFontSize(16);
    doc.text("Informe: Facturas vs Inventario (Tauro)", 40, 40);
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleString()}`, 40, 58);

    const s = report.summary;
    doc.autoTable({
      startY: 80,
      head: [["Métrica", "Valor"]],
      body: [
        ["Facturas analizadas", s.invoices],
        ["Tauros detectados", s.tauroEntries],
        ["Facturas duplicadas", s.duplicates],
        ["Coincidencias exactas", s.matchesExact],
        ["Coincidencias parciales", s.matchesPartial],
        ["Facturados no en inventario", s.missingInInventory],
        ["En inventario no facturados", s.notInvoiced]
      ],
      styles: { fontSize: 9 }
    });

    const sheets = buildSheetRows(report);
    [
      ["A · Facturas duplicadas", "A_Duplicados"],
      ["B · Coincidencias",       "B_Coincidencias"],
      ["C · Facturados no en inventario", "C_NoEnInventario"],
      ["D · En inventario no facturados", "D_NoFacturados"]
    ].forEach(([title, key]) => {
      const rows = sheets[key];
      if (rows.length <= 1) {
        doc.addPage();
        doc.setFontSize(12);
        doc.text(title, 40, 40);
        doc.setFontSize(10);
        doc.text("Sin datos.", 40, 62);
        return;
      }
      doc.addPage();
      doc.setFontSize(12);
      doc.text(title, 40, 40);
      doc.autoTable({
        startY: 55,
        head: [rows[0]],
        body: rows.slice(1),
        styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
        headStyles: { fillColor: [14, 165, 233] }
      });
    });

    doc.save("informe-facturas-tauro.pdf");
  }

  global.ReportModule = { renderReport, exportXlsx, exportPdf };
})(window);
