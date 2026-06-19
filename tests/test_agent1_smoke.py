"""
AGENT 1 — Smoke tests
Vérifie : chargement sans erreur, SW enregistré, onglets présents, titre.
"""
import pytest
from conftest import BASE_URL


def test_app_title(trekko):
    title = trekko.title()
    assert "TREKKO" in title.upper(), f"Titre inattendu : '{title}'"


def test_no_console_errors_on_load(trekko, console_errors):
    real_errors = [e for e in console_errors if any(t in e for t in ("TypeError", "ReferenceError", "SyntaxError"))]
    assert real_errors == [], f"Erreurs JS au chargement : {real_errors}"


def test_tabs_present(trekko):
    """Les onglets Santé et Carte doivent exister dans le DOM."""
    assert trekko.locator('[data-panel="panel-health"]').count() > 0, "Onglet Santé absent"
    assert trekko.locator('[data-panel="panel-map"]').count() > 0, "Onglet Carte absent"


def test_service_worker_registered(trekko):
    sw_registered = trekko.evaluate("""
        async () => {
            if (!('serviceWorker' in navigator)) return false;
            const regs = await navigator.serviceWorker.getRegistrations();
            return regs.length > 0;
        }
    """)
    assert sw_registered, "Aucun Service Worker enregistré"


def test_manifest_reachable(trekko):
    resp = trekko.request.get(BASE_URL + "manifest.json")
    assert resp.status == 200


def test_app_loads_in_standalone_viewport(trekko):
    trekko.set_viewport_size({"width": 390, "height": 844})
    trekko.reload(wait_until="networkidle")
    assert trekko.locator("body").is_visible()


def test_health_panel_exists_in_dom(trekko):
    """Le panneau #panel-health et son root doivent exister dès le départ."""
    assert trekko.locator("#panel-health").count() > 0, "#panel-health absent du DOM"
    assert trekko.locator("#health-dashboard-root").count() > 0, "#health-dashboard-root absent du DOM"
