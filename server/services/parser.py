"""
Extrae entradas de vehículos (modelo, chasis, motor, color) del texto OCR.
Soporta cualquier modelo (multi-modelo): recibe known_models como parámetro.
Porta la lógica de js/parser.js conservando las mismas heurísticas.

Formato principal de facturas:
  MODELO : TAURO 60V
  COLOR  : VERDE MANZANA
  SERIAL : HEOEA2A04SA101647 | HK250101101754
                ^chasis            ^motor
"""

import re
import unicodedata
from difflib import get_close_matches
from typing import Optional

CONTEXT_LINES = 8

# Prefijo conocido del chasis. Tolerante a errores OCR.
CHASIS_PREFIX_RE = re.compile(r'\bH[EF][O0][EF][A4][Z2][A4]', re.I)

# Separador chasis|motor: "|", "l", "I", "1" con espacios.
PIPE_RE = re.compile(r'\s+[|lI1]\s+')

# Seriales genéricos (8-20 alfanum/guiones)
GENERIC_SERIAL_RE = re.compile(r'\b[A-Z0-9][A-Z0-9\-]{7,19}\b')
MOTOR_SERIAL_RE   = re.compile(r'\b[A-Z0-9][A-Z0-9\-]{5,19}\b')
# VIN canónico 17 chars (sin I, O, Q)
VIN_RE = re.compile(r'\b[A-HJ-NPR-Z0-9]{17}\b')

# Etiquetas por campo
LABEL_SERIAL  = re.compile(r'\bserial(?:es)?\b|\bserie(?:s)?\b', re.I)
LABEL_CHASIS  = re.compile(
    r'(?:serial|serie|n[oº.]?|no\.?|n[uú]mero)\s*(?:de\s*)?chasis\b|\bchasis\b|\bvin\b', re.I)
LABEL_MOTOR   = re.compile(
    r'(?:serial|serie|n[oº.]?|no\.?|n[uú]mero)\s*(?:de\s*)?motor\b|\bmotor\b', re.I)
LABEL_COLOR   = re.compile(r'\bcolor\b', re.I)
LABEL_MODELO  = re.compile(r'\bmodelo\b', re.I)

SEPARATOR_RE  = re.compile(r'^[\s:\-.·•]+')
COLOR_WORDS   = re.compile(
    r'\b([A-Za-zÀ-ɏ]{3,})(?:\s+([A-Za-zÀ-ɏ]{3,}))?')


# ── Normalización ──────────────────────────────────────────────────────────

def normalize_serial(s: Optional[str]) -> str:
    if not s:
        return ""
    return re.sub(r'[^A-Z0-9]', '', s.upper())


def normalize_color(s: Optional[str]) -> str:
    if not s:
        return ""
    nfd = unicodedata.normalize('NFD', s)
    stripped = ''.join(c for c in nfd if unicodedata.category(c) != 'Mn')
    return stripped.upper().strip()


# ── Extracción de campos ───────────────────────────────────────────────────

def _after_label(label_re: re.Pattern, line: str) -> str:
    m = label_re.search(line)
    if not m:
        return ""
    return SEPARATOR_RE.sub('', line[m.end():])


def _extract_chasis_value(source: str) -> Optional[str]:
    vin = VIN_RE.search(source.upper())
    if vin:
        return vin.group()
    gen = GENERIC_SERIAL_RE.search(source.upper())
    return gen.group() if gen else None


def _extract_motor_value(source: str) -> Optional[str]:
    gen = MOTOR_SERIAL_RE.search(source.upper())
    return gen.group() if gen else None


def _extract_color_value(source: str) -> Optional[str]:
    m = COLOR_WORDS.search(source)
    if not m:
        return None
    result = m.group(1)
    if m.group(2):
        result += ' ' + m.group(2)
    return result.upper()


def _classify_token(token: str) -> str:
    """Devuelve 'chasis' si el token empieza con el prefijo conocido, si no 'motor'."""
    return 'chasis' if CHASIS_PREFIX_RE.search(token) else 'motor'


def _extract_serial_line(line: str, next_line: str) -> Optional[dict]:
    """Maneja: SERIAL : HEOEA2A... | HK250...  → {chasis, motor}"""
    if not LABEL_SERIAL.search(line):
        return None
    after = _after_label(LABEL_SERIAL, line)
    source = after if len(after) >= 8 else next_line
    if not source:
        return None

    chasis = motor = None

    if PIPE_RE.search(source):
        parts = [p.strip().upper() for p in PIPE_RE.split(source)]
        for part in parts:
            tokens = GENERIC_SERIAL_RE.findall(part)
            for t in tokens:
                if not chasis and _classify_token(t) == 'chasis':
                    chasis = t
                elif not motor:
                    motor = t
        if not chasis and len(parts) >= 2:
            t0 = GENERIC_SERIAL_RE.search(parts[0])
            t1 = GENERIC_SERIAL_RE.search(parts[1])
            chasis = t0.group() if t0 else None
            motor  = t1.group() if t1 else None
    else:
        tokens = GENERIC_SERIAL_RE.findall(source.upper())
        for t in tokens:
            if not chasis and _classify_token(t) == 'chasis':
                chasis = t
            elif not motor:
                motor = t

    if chasis or motor:
        return {'chasis': chasis, 'motor': motor}
    return None


# ── Localización de modelos ────────────────────────────────────────────────

def _find_model_hits(lines: list[str], known_models: list[str]) -> list[int]:
    """Devuelve índices de líneas donde aparece algún modelo conocido."""
    hits = []
    for i, line in enumerate(lines):
        upper = line.upper()
        for model in known_models:
            mu = model.upper()
            # Coincidencia directa
            if mu in upper:
                hits.append(i)
                break
            # Fuzzy por tokens (tolera errores OCR)
            line_tokens = upper.split()
            model_tokens = mu.split()
            if all(get_close_matches(mt, line_tokens, n=1, cutoff=0.82)
                   for mt in model_tokens):
                hits.append(i)
                break
    return hits


def _extract_model_name(line: str, known_models: list[str]) -> Optional[str]:
    """Obtiene el modelo reconocido en la línea."""
    upper = line.upper()
    for model in known_models:
        mu = model.upper()
        if mu in upper:
            return model
    return None


# ── Extracción principal ───────────────────────────────────────────────────

def _dedupe_within_invoice(entries: list[dict]) -> list[dict]:
    out: list[dict] = []
    for e in entries:
        twin = next(
            (o for o in out
             if o['file'] == e['file'] and o['page'] == e['page'] and (
                 (o['chasis_norm'] and o['chasis_norm'] == e['chasis_norm']) or
                 (o['motor_norm']  and o['motor_norm']  == e['motor_norm'])
             )),
            None
        )
        if twin:
            for field in ('chasis', 'motor', 'color', 'modelo'):
                twin[field] = twin[field] or e[field]
            twin['chasis_norm'] = normalize_serial(twin['chasis'])
            twin['motor_norm']  = normalize_serial(twin['motor'])
            twin['color_norm']  = normalize_color(twin['color'])
        else:
            out.append(e)
    return out


def extract_entries(pages: list[str], filename: str,
                    known_models: list[str]) -> list[dict]:
    """
    Extrae todas las entradas de vehículos del texto OCR de un PDF.
    known_models: lista de modelos a buscar; si vacía, busca cualquier
                  línea con etiqueta MODELO:.
    """
    entries: list[dict] = []

    for page_idx, page_text in enumerate(pages):
        lines = [l.strip() for l in page_text.replace('\r', '').split('\n')
                 if l.strip()]
        if not lines:
            continue

        if known_models:
            hits = _find_model_hits(lines, known_models)
        else:
            # Modo "ALL sin inventario": usa etiqueta MODELO como pivot
            hits = [i for i, l in enumerate(lines) if LABEL_MODELO.search(l)]

        for hit_idx in hits:
            start = max(0, hit_idx - CONTEXT_LINES)
            end   = min(len(lines) - 1, hit_idx + CONTEXT_LINES)

            chasis = motor = color = modelo = None

            # Intentar extraer modelo de la línea que disparó el hit
            if known_models:
                modelo = _extract_model_name(lines[hit_idx], known_models)
            else:
                after = _after_label(LABEL_MODELO, lines[hit_idx])
                modelo = after.strip() or None

            for i in range(start, end + 1):
                line = lines[i]
                next_line = lines[i + 1] if i + 1 < len(lines) else ""

                # Formato principal: SERIAL : chasis | motor
                if not chasis or not motor:
                    sr = _extract_serial_line(line, next_line)
                    if sr:
                        chasis = chasis or sr.get('chasis')
                        motor  = motor  or sr.get('motor')

                # Fallback: etiquetas separadas
                if not chasis:
                    after = _after_label(LABEL_CHASIS, line)
                    if after:
                        chasis = (_extract_chasis_value(after)
                                  or _extract_chasis_value(next_line))
                if not motor:
                    after = _after_label(LABEL_MOTOR, line)
                    if after:
                        motor = (_extract_motor_value(after)
                                 or _extract_motor_value(next_line))
                if not color:
                    after = _after_label(LABEL_COLOR, line)
                    if after:
                        color = (_extract_color_value(after)
                                 or _extract_color_value(next_line))
                if not modelo:
                    after = _after_label(LABEL_MODELO, line)
                    if after:
                        modelo = after.strip() or None

            if chasis or motor or color:
                entries.append({
                    'file': filename,
                    'page': page_idx + 1,
                    'modelo': modelo,
                    'chasis': chasis.upper() if chasis else None,
                    'motor':  motor.upper()  if motor  else None,
                    'color':  normalize_color(color) if color else None,
                    'chasis_norm': normalize_serial(chasis),
                    'motor_norm':  normalize_serial(motor),
                    'color_norm':  normalize_color(color),
                })

    return _dedupe_within_invoice(entries)
