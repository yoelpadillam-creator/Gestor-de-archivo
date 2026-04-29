"""
Lectura tolerante de Excel/CSV de inventario y FIT con pandas.
Mapea variantes de nombres de columna a claves canónicas.
"""

import io
import unicodedata
from typing import Optional

import pandas as pd

INVENTORY_ALIASES = {
    'modelo': ['modelo', 'model', 'producto', 'descripcion', 'descripción',
               'articulo', 'artículo'],
    'chasis': ['chasis', 'serial chasis', 'serialchasis', 'n chasis',
               'n. chasis', 'no chasis', 'no. chasis', 'nchasis',
               'numero chasis', 'número chasis', 'vin'],
    'motor':  ['motor', 'serial motor', 'serialmotor', 'n motor',
               'n. motor', 'no motor', 'no. motor', 'nmotor',
               'numero motor', 'número motor'],
    'color':  ['color', 'colour'],
}

FIT_ALIASES = {
    'chasis':         ['chasis', 'serial chasis', 'vin', 'no. chasis',
                       'n. chasis', 'numero chasis'],
    'color_esperado': ['color esperado', 'color_esperado', 'color pedido',
                       'color orden', 'color', 'colour'],
    'modelo':         ['modelo', 'model', 'producto'],
    'motor':          ['motor', 'serial motor'],
}


def _norm(s: str) -> str:
    nfd = unicodedata.normalize('NFD', str(s or ''))
    stripped = ''.join(c for c in nfd if unicodedata.category(c) != 'Mn')
    return stripped.lower().strip().replace('\s+', ' ')


def _resolve_columns(df_cols: list[str], aliases: dict) -> dict:
    """Devuelve {canon: col_name} para las columnas encontradas."""
    mapping = {}
    norm_cols = {_norm(c): c for c in df_cols}
    for canon, alts in aliases.items():
        for alt in alts:
            if alt in norm_cols and canon not in mapping:
                mapping[canon] = norm_cols[alt]
                break
        if canon not in mapping:
            # Coincidencia parcial: la columna contiene el alias
            for alt in alts:
                for nc, orig in norm_cols.items():
                    if alt in nc and canon not in mapping:
                        mapping[canon] = orig
                        break
    return mapping


def _read_df(file_bytes: bytes, filename: str) -> pd.DataFrame:
    buf = io.BytesIO(file_bytes)
    if filename.lower().endswith('.csv'):
        for enc in ('utf-8', 'latin-1', 'cp1252'):
            try:
                buf.seek(0)
                return pd.read_csv(buf, encoding=enc, dtype=str)
            except Exception:
                continue
        raise ValueError("No se pudo leer el CSV.")
    else:
        return pd.read_excel(buf, dtype=str)


def load_inventory(file_bytes: bytes, filename: str) -> list[dict]:
    df = _read_df(file_bytes, filename)
    df.columns = [str(c) for c in df.columns]
    col_map = _resolve_columns(list(df.columns), INVENTORY_ALIASES)

    required = ['modelo', 'chasis', 'motor', 'color']
    missing = [k for k in required if k not in col_map]
    if missing:
        detected = ', '.join(df.columns.tolist())
        raise ValueError(
            f"Faltan columnas en inventario: {', '.join(missing)}. "
            f"Detectadas: {detected}"
        )

    rows = []
    for _, row in df.iterrows():
        if all(pd.isna(row.get(col_map[k], '')) or
               str(row.get(col_map[k], '')).strip() == ''
               for k in required):
            continue
        rows.append({
            'modelo': str(row[col_map['modelo']] or '').strip(),
            'chasis': str(row[col_map['chasis']] or '').strip(),
            'motor':  str(row[col_map['motor']]  or '').strip(),
            'color':  str(row[col_map['color']]  or '').strip(),
        })
    return rows


def load_fit(file_bytes: bytes, filename: str) -> list[dict]:
    df = _read_df(file_bytes, filename)
    df.columns = [str(c) for c in df.columns]
    col_map = _resolve_columns(list(df.columns), FIT_ALIASES)

    for k in ('chasis', 'color_esperado'):
        if k not in col_map:
            raise ValueError(
                f"La FIT debe tener columnas 'chasis' y 'color_esperado'. "
                f"Detectadas: {', '.join(df.columns.tolist())}"
            )

    rows = []
    for _, row in df.iterrows():
        chasis = str(row.get(col_map['chasis'], '') or '').strip()
        color  = str(row.get(col_map['color_esperado'], '') or '').strip()
        if not chasis:
            continue
        rows.append({
            'chasis':         chasis,
            'color_esperado': color,
            'modelo': str(row[col_map['modelo']] or '').strip()
                      if 'modelo' in col_map else None,
            'motor':  str(row[col_map['motor']]  or '').strip()
                      if 'motor' in col_map else None,
        })
    return rows


def filter_by_model(rows: list[dict], model_filter: str) -> list[dict]:
    """Filtra lista por modelo. 'ALL' devuelve todo."""
    if model_filter == 'ALL':
        return rows
    mf = _norm(model_filter)
    return [r for r in rows if mf in _norm(r.get('modelo', ''))]


def unique_models(rows: list[dict]) -> list[str]:
    seen = set()
    models = []
    for r in rows:
        m = str(r.get('modelo', '')).strip()
        if m and m not in seen:
            seen.add(m)
            models.append(m)
    return sorted(models)
