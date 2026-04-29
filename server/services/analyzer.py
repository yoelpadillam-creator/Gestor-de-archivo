"""
Cruza entradas de facturas contra inventario y FIT.
Porta la lógica de js/analyzer.js y añade check_fit_discrepancies.
"""

from typing import Optional
from .parser import normalize_serial, normalize_color


def _prep_inventory(inventory: list[dict]) -> list[dict]:
    return [{
        **r,
        'chasis_norm': normalize_serial(r.get('chasis')),
        'motor_norm':  normalize_serial(r.get('motor')),
        'color_norm':  normalize_color(r.get('color')),
    } for r in inventory]


def find_duplicates(invoice_entries: list[dict]) -> list[dict]:
    """Detecta seriales que aparecen en más de una factura/página."""
    by_chasis: dict[str, list] = {}
    by_motor:  dict[str, list] = {}

    for e in invoice_entries:
        if e.get('chasis_norm'):
            by_chasis.setdefault(e['chasis_norm'], []).append(e)
        if e.get('motor_norm'):
            by_motor.setdefault(e['motor_norm'], []).append(e)

    seen: set[str] = set()
    duplicates = []

    for key, group in {**{'chasis:' + k: v for k, v in by_chasis.items()},
                       **{'motor:' + k: v for k, v in by_motor.items()}}.items():
        field, val = key.split(':', 1)
        if len(group) < 2:
            continue
        sig = '|'.join(sorted(f"{e['file']}#{e['page']}" for e in group))
        token = f"{sig}::{field}::{val}"
        if token in seen:
            continue
        seen.add(token)
        duplicates.append({'by': field, 'key': val, 'entries': group})

    return duplicates


def classify_against_inventory(
        invoice_entries: list[dict],
        inventory: list[dict]
) -> tuple[list[dict], list[dict], list[dict]]:
    """
    Devuelve (matches, missing_in_inventory, not_invoiced).
    """
    inv = _prep_inventory(inventory)
    hit_inv_ids: set[int] = set()
    matches: list[dict] = []
    missing: list[dict] = []

    for entry in invoice_entries:
        idx = next(
            (i for i, inv_r in enumerate(inv)
             if (entry.get('chasis_norm') and inv_r['chasis_norm'] and
                 entry['chasis_norm'] == inv_r['chasis_norm']) or
                (entry.get('motor_norm') and inv_r['motor_norm'] and
                 entry['motor_norm'] == inv_r['motor_norm'])),
            -1
        )
        if idx == -1:
            missing.append(entry)
            continue

        hit_inv_ids.add(idx)
        inv_r = inv[idx]
        chasis_ok = bool(
            entry.get('chasis_norm') and inv_r['chasis_norm'] and
            entry['chasis_norm'] == inv_r['chasis_norm']
        )
        motor_ok = bool(
            entry.get('motor_norm') and inv_r['motor_norm'] and
            entry['motor_norm'] == inv_r['motor_norm']
        )
        color_ok = bool(
            entry.get('color_norm') and inv_r['color_norm'] and
            entry['color_norm'] == inv_r['color_norm']
        )
        matches.append({
            'file': entry['file'],
            'page': entry['page'],
            'invoice_chasis': entry.get('chasis'),
            'invoice_motor':  entry.get('motor'),
            'invoice_color':  entry.get('color'),
            'inventory_chasis': inv_r.get('chasis'),
            'inventory_motor':  inv_r.get('motor'),
            'inventory_color':  inv_r.get('color'),
            'chasis_ok': chasis_ok,
            'motor_ok':  motor_ok,
            'color_ok':  color_ok,
            'status': 'exacto' if (chasis_ok and motor_ok and color_ok) else 'parcial',
        })

    not_invoiced = [inv[i] for i in range(len(inv)) if i not in hit_inv_ids]
    return matches, missing, not_invoiced


def check_fit_discrepancies(
        invoice_entries: list[dict],
        fit_rows: list[dict]
) -> list[dict]:
    """Compara color de cada chasis en factura contra el color de la FIT."""
    if not fit_rows:
        return []

    fit_map = {
        normalize_serial(r['chasis']): r
        for r in fit_rows if r.get('chasis')
    }

    discrepancies = []
    for entry in invoice_entries:
        key = entry.get('chasis_norm', '')
        if not key:
            continue
        fit_row = fit_map.get(key)
        if not fit_row:
            continue
        color_factura = entry.get('color_norm', '')
        color_fit = normalize_color(fit_row.get('color_esperado', ''))
        if color_factura and color_fit and color_factura != color_fit:
            discrepancies.append({
                'chasis': entry.get('chasis'),
                'color_factura': entry.get('color'),
                'color_fit': fit_row.get('color_esperado'),
                'fit_modelo': fit_row.get('modelo'),
                'file': entry['file'],
                'page': entry['page'],
            })

    return discrepancies


def cross_reference(
        inventory: list[dict],
        invoice_entries: list[dict],
        invoice_filenames: list[str],
        fit_rows: Optional[list[dict]],
        model_filter: str
) -> dict:
    duplicates = find_duplicates(invoice_entries)
    matches, missing, not_invoiced = classify_against_inventory(
        invoice_entries, inventory)
    fit_disc = check_fit_discrepancies(invoice_entries, fit_rows or [])

    return {
        'summary': {
            'invoices': len(invoice_filenames),
            'entries_detected': len(invoice_entries),
            'model_filter': model_filter,
            'duplicates': len(duplicates),
            'matches_exact': sum(1 for m in matches if m['status'] == 'exacto'),
            'matches_partial': sum(1 for m in matches if m['status'] == 'parcial'),
            'missing_in_inventory': len(missing),
            'not_invoiced': len(not_invoiced),
            'fit_color_discrepancies': len(fit_disc),
        },
        'duplicates': duplicates,
        'matches': matches,
        'missing_in_inventory': missing,
        'not_invoiced': not_invoiced,
        'fit_discrepancies': fit_disc,
    }
