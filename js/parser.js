// Extrae entradas "Tauro" (chasis, motor, color) a partir del texto OCR de cada página.
// Heurística: busca ocurrencias del modelo Tauro y revisa una ventana de ±6 líneas
// para encontrar las etiquetas chasis / motor / color y sus valores.
//
// Formato real de las facturas Tauro:
//   MODELO : TAURO 60V
//   COLOR  : VERDE MANZANA
//   SERIAL : HEOEA2A04SA101647 | HK250101101754
//                  ^chasis           ^motor
// El chasis siempre empieza con el prefijo HEOEA2A.

(function (global) {
  "use strict";

  const CONTEXT_LINES = 8;

  // Tolerante a errores de OCR: TAURO / TAUR0 / TAURD / con espacios sueltos.
  const TAURO_RE = /T\s*A\s*U\s*R\s*[O0D]/i;

  // Prefijo conocido del chasis (Tauro). Permite OCR: HE0EA2A, HE0EAZ4, etc.
  // Captura al menos los primeros 7 chars reconocibles.
  const CHASIS_PREFIX_RE = /\bH[EF][O0][EF][A4][Z2][A4]/i;

  // Separador entre chasis y motor en la misma línea: "|", "l", "I", "1" rodeado de espacios.
  const PIPE_RE = /\s+[|lI1]\s+/;

  // Etiquetas por campo. Se evalúa en este orden (más específica primero).
  const LABELS = {
    // "SERIAL" = línea que contiene chasis | motor juntos (formato Tauro real).
    serial: [
      /\bserial\s*(?:es)?\b/i,
      /\bserie\s*(?:s)?\b/i
    ],
    chasis: [
      /(?:serial|serie|n[oº\.]?|no\.?|n[uú]mero)\s*(?:de\s*)?chasis\b/i,
      /\bchasis\b/i,
      /\bvin\b/i
    ],
    motor: [
      /(?:serial|serie|n[oº\.]?|no\.?|n[uú]mero)\s*(?:de\s*)?motor\b/i,
      /\bmotor\b/i
    ],
    color: [
      /\bcolor\b/i
    ]
  };

  // VIN "canónico": 17 alfanuméricos sin I, O, Q.
  const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/;
  // Respaldo genérico para chasis/motor: 8–20 alfanuméricos.
  const GENERIC_SERIAL_RE = /\b[A-Z0-9][A-Z0-9\-]{7,19}\b/;
  // Motor suele ser más corto.
  const MOTOR_SERIAL_RE = /\b[A-Z0-9][A-Z0-9\-]{5,19}\b/;

  function splitLines(text) {
    return String(text || "")
      .replace(/\r/g, "")
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0);
  }

  function findFirstMatch(line, regexes) {
    for (const re of regexes) {
      const m = line.match(re);
      if (m) return { index: m.index, length: m[0].length, label: m[0] };
    }
    return null;
  }

  // Decide si un token alphanumerico es chasis (por prefijo) o motor.
  function classifyToken(token) {
    return CHASIS_PREFIX_RE.test(token) ? "chasis" : "motor";
  }

  // Maneja la línea "SERIAL : HEOEA2A04SA101647 | HK250101101754"
  // Devuelve { chasis, motor } o null si no coincide el patrón.
  function extractSerialLine(line, nextLine) {
    const hasLabel = findFirstMatch(line, LABELS.serial);
    if (!hasLabel) return null;

    const after = line.slice(hasLabel.index + hasLabel.length)
      .replace(/^[\s:\-.·•]+/, "");

    // Acepta que el contenido pueda estar en la línea siguiente si after está vacío.
    const source = after.length >= 8 ? after : (nextLine || "");
    if (!source) return null;

    // ¿Hay separador pipe (real u OCR)? → divide en dos partes.
    if (PIPE_RE.test(source)) {
      const parts = source.split(PIPE_RE).map(p => p.trim().toUpperCase());
      let chasis = null, motor = null;
      parts.forEach(p => {
        const tokens = p.match(GENERIC_SERIAL_RE) || [];
        tokens.forEach(t => {
          if (!chasis && classifyToken(t) === "chasis") chasis = t;
          else if (!motor) motor = t;
        });
      });
      // Si no se pudo clasificar por prefijo, primer token = chasis.
      if (!chasis && parts.length >= 2) {
        const t0 = (parts[0].match(GENERIC_SERIAL_RE) || [])[0];
        const t1 = (parts[1].match(GENERIC_SERIAL_RE) || [])[0];
        chasis = t0 || null;
        motor  = t1 || null;
      }
      if (chasis || motor) return { chasis, motor };
    }

    // Sin pipe: extrae todos los tokens y clasifica por prefijo.
    const tokens = source.toUpperCase().match(GENERIC_SERIAL_RE) || [];
    let chasis = null, motor = null;
    tokens.forEach(t => {
      if (!chasis && classifyToken(t) === "chasis") chasis = t;
      else if (!motor) motor = t;
    });
    if (chasis || motor) return { chasis, motor };
    return null;
  }

  // Busca el valor del campo a partir de una etiqueta encontrada en `line`:
  //   primero tras la etiqueta en la misma línea (p.ej. "CHASIS: ABC123...")
  //   y si no aparece, en la línea siguiente.
  function extractValue(field, line, nextLine) {
    const labelMatch = findFirstMatch(line, LABELS[field]);
    if (!labelMatch) return null;

    const after = line.slice(labelMatch.index + labelMatch.length)
      .replace(/^[\s:\-.·•]+/, "");

    const tryExtract = (source) => {
      if (!source) return null;
      if (field === "chasis") {
        const vin = source.match(VIN_RE);
        if (vin) return vin[0];
        const gen = source.toUpperCase().match(GENERIC_SERIAL_RE);
        return gen ? gen[0] : null;
      }
      if (field === "motor") {
        const gen = source.toUpperCase().match(MOTOR_SERIAL_RE);
        return gen ? gen[0] : null;
      }
      if (field === "color") {
        // 1 o 2 palabras alfabéticas, acepta tildes y "ñ".
        const m = source.match(/\b([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,})(?:\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}))?/);
        if (!m) return null;
        return (m[2] ? `${m[1]} ${m[2]}` : m[1]).toUpperCase();
      }
      return null;
    };

    return tryExtract(after) || tryExtract(nextLine);
  }

  function normalizeSerial(s) {
    return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function normalizeColor(s) {
    return String(s || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toUpperCase().trim();
  }

  // Agrupa Tauro que parecen ser el mismo ítem dentro de una misma factura:
  // si dos ocurrencias están muy cerca y comparten al menos un campo, se fusionan.
  function dedupeWithinInvoice(entries) {
    const out = [];
    for (const e of entries) {
      const twin = out.find(o =>
        o.file === e.file && o.page === e.page &&
        (
          (o.chasisNorm && o.chasisNorm === e.chasisNorm) ||
          (o.motorNorm  && o.motorNorm  === e.motorNorm)
        )
      );
      if (twin) {
        twin.chasis = twin.chasis || e.chasis;
        twin.motor  = twin.motor  || e.motor;
        twin.color  = twin.color  || e.color;
        twin.chasisNorm = normalizeSerial(twin.chasis);
        twin.motorNorm  = normalizeSerial(twin.motor);
        twin.colorNorm  = normalizeColor(twin.color);
      } else {
        out.push(e);
      }
    }
    return out;
  }

  // `pages` es un array de strings (texto por página) y `fileName` identifica la factura.
  function extractTauroEntries(pages, fileName) {
    const entries = [];
    pages.forEach((pageText, pageIdx) => {
      const lines = splitLines(pageText);
      if (!lines.length) return;

      const hits = [];
      lines.forEach((ln, i) => { if (TAURO_RE.test(ln)) hits.push(i); });

      hits.forEach(hitIdx => {
        const start = Math.max(0, hitIdx - CONTEXT_LINES);
        const end   = Math.min(lines.length - 1, hitIdx + CONTEXT_LINES);
        let chasis = null, motor = null, color = null;

        for (let i = start; i <= end; i++) {
          const line = lines[i];
          const next = lines[i + 1] || "";

          // Formato Tauro real: SERIAL : chasis | motor en una sola línea.
          if (!chasis || !motor) {
            const sr = extractSerialLine(line, next);
            if (sr) {
              chasis = chasis || sr.chasis;
              motor  = motor  || sr.motor;
            }
          }

          // Fallback: etiquetas separadas (CHASIS: xxx / MOTOR: yyy).
          if (!chasis) chasis = extractValue("chasis", line, next);
          if (!motor)  motor  = extractValue("motor",  line, next);
          if (!color)  color  = extractValue("color",  line, next);
        }

        // Solo registramos la entrada si al menos un campo es útil.
        if (chasis || motor || color) {
          entries.push({
            file: fileName,
            page: pageIdx + 1,
            chasis: chasis ? chasis.toUpperCase() : null,
            motor:  motor  ? motor.toUpperCase()  : null,
            color:  color  ? normalizeColor(color) : null,
            chasisNorm: normalizeSerial(chasis),
            motorNorm:  normalizeSerial(motor),
            colorNorm:  normalizeColor(color)
          });
        }
      });
    });

    return dedupeWithinInvoice(entries);
  }

  global.ParserModule = {
    extractTauroEntries,
    normalizeSerial,
    normalizeColor
  };
})(window);
