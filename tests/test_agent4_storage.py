"""
AGENT 4 — Stockage & données santé
Vérifie : IndexedDB/localStorage accessible, dashboard santé sans données inventées,
métriques uniquement depuis données réelles, stockage local mentionné.
"""
import pytest
from conftest import open_panel


def _open_health(page):
    open_panel(page, "panel-health")
    page.wait_for_selector("#health-dashboard-root .hdash-inner, #health-dashboard-root .hdash-section", timeout=8_000)


def test_indexeddb_available(trekko):
    assert trekko.evaluate("typeof indexedDB !== 'undefined'"), "IndexedDB non disponible"


def test_localstorage_available(trekko):
    assert trekko.evaluate("typeof localStorage !== 'undefined'")


def test_health_tab_no_pageerror(trekko):
    errors = []
    trekko.on("pageerror", lambda e: errors.append(str(e)))
    _open_health(trekko)
    trekko.wait_for_timeout(600)
    assert errors == [], f"Erreurs JS lors du chargement du dashboard : {errors}"


def test_no_hardcoded_suspicious_values(trekko):
    """Aucune valeur hardcodée typique de données inventées."""
    _open_health(trekko)
    text = trekko.locator("#health-dashboard-root").inner_text()
    suspicious = ["12 km", "3h45", "450 kcal", "5 activités", "123 km"]
    for val in suspicious:
        assert val not in text, f"Valeur potentiellement inventée '{val}' dans le dashboard"


def test_metrics_not_negative(trekko):
    """Aucune métrique affichant une valeur négative brute."""
    _open_health(trekko)
    metric_vals = trekko.locator(".hdash-metric-value").all_inner_texts()
    for val in metric_vals:
        val = val.strip()
        if val in ("—", ""):
            continue
        assert not val.startswith("-"), f"Métrique négative inattendue : '{val}'"


def test_period_filter_rerender_single_inner(trekko):
    """Changer de période ne laisse jamais plus d'un .hdash-inner."""
    _open_health(trekko)
    for period in ["week", "month", "year", "all"]:
        trekko.locator(f'[data-health-period="{period}"]').click()
        trekko.wait_for_timeout(200)
        count = trekko.locator("#health-dashboard-root .hdash-inner").count()
        assert count <= 1, f"Données périmées après filtre {period} : {count} .hdash-inner"


def test_privacy_card_present(trekko):
    _open_health(trekko)
    text = trekko.locator("#health-dashboard-root").inner_text()
    assert "local" in text.lower() or "appareil" in text.lower(), \
        "Message de stockage local/confidentialité introuvable"
