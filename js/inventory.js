// Carga inventario activo y FIT (orden de pedido) desde Excel/CSV con SheetJS.
// Depende de XLSX cargado globalmente.

(function (global) {
  "use strict";

  const INVENTORY_ALIASES = {
    modelo: ["modelo", "model", "producto", "descripcion", "descripción",
             "articulo", "artículo"],
    chasis: ["chasis", "serial chasis", "serialchasis", "n chasis",
             "n. chasis", "no chasis", "no. chasis", "nchasis",
             "numero chasis", "número chasis", "vin"],
    motor:  ["motor", "serial motor", "serialmotor", "n motor",
             "n. motor", "no motor", "no. motor", "nmotor",
             "numero motor", "número motor"],
    color:  ["color", "colour"]
  };

  const FIT_ALIASES = {
    chasis:         ["chasis", "serial chasis", "vin", "no. chasis",
                     "n. chasis", "numero chasis"],
    color_esperado: ["color esperado", "color_esperado", "color pedido",
                     "color orden", "color", "colour"],
    modelo:         ["modelo", "model", "producto"],
    motor:          ["motor", "serial motor"]
  };

  function norm(s) {
    return String(s || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().trim();
  }

  function resolveHeaders(rawHeaders, aliases) {
    const map = {};
    rawHeaders.forEach((raw, idx) => {
      const key = norm(raw);
      for (const canon of Object.keys(aliases)) {
        if (canon in map) continue;
        if (aliases[canon].some(a => a === key || key.includes(norm(a)))) {
          map[canon] = idx;
          break;
        }
      }
    });
    return map;
  }

  async function _parseFile(file, aliases, requiredCols) {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (!rows.length) throw new Error("El archivo está vacío.");

    const headers = rows[0].map(h => String(h));
    const colMap = resolveHeaders(headers, aliases);
    const missing = requiredCols.filter(k => !(k in colMap));
    if (missing.length) {
      throw new Error(
        `Faltan columnas: ${missing.join(", ")}. Detectadas: ${headers.join(", ")}`
      );
    }

    const parsed = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(c => c === "")) continue;
      const obj = {};
      for (const canon of Object.keys(aliases)) {
        if (canon in colMap) {
          obj[canon] = String(row[colMap[canon]] ?? "").trim();
        }
      }
      parsed.push(obj);
    }
    return parsed;
  }

  async function loadInventoryFile(file) {
    return _parseFile(file, INVENTORY_ALIASES, ["modelo", "chasis", "motor", "color"]);
  }

  async function loadFitFile(file) {
    return _parseFile(file, FIT_ALIASES, ["chasis", "color_esperado"]);
  }

  function filterByModel(rows, modelFilter) {
    if (!modelFilter || modelFilter === "ALL") return rows;
    const mf = norm(modelFilter);
    return rows.filter(r => norm(r.modelo || "").includes(mf));
  }

  function uniqueModels(rows) {
    const seen = new Set();
    const models = [];
    for (const r of rows) {
      const m = String(r.modelo || "").trim();
      if (m && !seen.has(m)) { seen.add(m); models.push(m); }
    }
    return models.sort();
  }

  global.InventoryModule = {
    loadInventoryFile,
    loadFitFile,
    filterByModel,
    uniqueModels
  };
})(window);
