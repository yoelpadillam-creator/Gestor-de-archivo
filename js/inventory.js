// Lectura del inventario activo (Excel/CSV) y filtrado del modelo Tauro.
// Depende de SheetJS (XLSX) cargado globalmente desde index.html.

(function (global) {
  "use strict";

  // Mapeo tolerante de nombres de columna -> clave canónica.
  const HEADER_ALIASES = {
    modelo:  ["modelo", "model", "producto", "descripcion", "descripción"],
    chasis:  ["chasis", "serial chasis", "serialchasis", "n chasis", "n. chasis", "no chasis", "no. chasis", "nchasis", "numero chasis", "número chasis", "vin"],
    motor:   ["motor", "serial motor", "serialmotor", "n motor", "n. motor", "no motor", "no. motor", "nmotor", "numero motor", "número motor"],
    color:   ["color", "colour"]
  };

  function norm(s) {
    return String(s || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().trim().replace(/\s+/g, " ");
  }

  function resolveHeaders(rawHeaders) {
    const map = {};
    rawHeaders.forEach((raw, idx) => {
      const key = norm(raw);
      for (const canon of Object.keys(HEADER_ALIASES)) {
        if (HEADER_ALIASES[canon].some(a => a === key || key.includes(a))) {
          if (!(canon in map)) map[canon] = idx;
          break;
        }
      }
    });
    return map;
  }

  async function loadInventoryFile(file) {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (!rows.length) throw new Error("El archivo está vacío.");

    const headers = rows[0].map(h => String(h));
    const colMap = resolveHeaders(headers);

    const required = ["modelo", "chasis", "motor", "color"];
    const missing = required.filter(k => !(k in colMap));
    if (missing.length) {
      throw new Error(
        `Faltan columnas en el inventario: ${missing.join(", ")}. ` +
        `Encabezados detectados: ${headers.join(", ")}`
      );
    }

    const parsed = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(cell => cell === "")) continue;
      parsed.push({
        modelo: String(row[colMap.modelo] ?? "").trim(),
        chasis: String(row[colMap.chasis] ?? "").trim(),
        motor:  String(row[colMap.motor]  ?? "").trim(),
        color:  String(row[colMap.color]  ?? "").trim()
      });
    }
    return parsed;
  }

  function filterTauro(rows) {
    return rows.filter(r => norm(r.modelo).includes("tauro"));
  }

  global.InventoryModule = { loadInventoryFile, filterTauro };
})(window);
