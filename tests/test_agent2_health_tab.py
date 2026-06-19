"""
AGENT 2 — Onglet Santé / Health Dashboard
Vérifie : ouverture à froid, lazy-load, filtres période, états vides propres,
pas de données inventées (undefined/null/NaN/fake), duplication DOM.
"""
import pytest
from conftest import open_panel


def _open_health(page):
    open_panel(page, "panel-health")
    page.wait_for_selector("#health-dashboard-root .hdash-inner, #health-dashboard-root .hdash-section", timeout=8_000)


def test_health_tab_opens_cold(trekko):
    """Le dashboard santé s'affiche à la première ouverture."""
    _open_health(trekko)
    root = trekko.locator("#health-dashboard-root")
    assert root.is_visible()
    assert root.locator(".hdash-inner").count() > 0 or root.locator(".hdash-section").count() > 0


def test_no_dom_duplication_on_multiple_opens(trekko):
    """Ouvrir/fermer Santé 3× ne doit pas dupliquer .hdash-inner."""
    for _ in range(3):
        _open_health(trekko)
        open_panel(trekko, "panel-map")
        trekko.wait_for_timeout(300)

    _open_health(trekko)
    count = trekko.locator("#health-dashboard-root .hdash-inner").count()
    assert count <= 1, f"Duplication DOM : {count} blocs .hdash-inner trouvés"


def test_empty_states_no_fake_data(trekko):
    """Aucune valeur indéfinie/fausse dans l'état vide."""
    _open_health(trekko)
    root_text = trekko.locator("#health-dashboard-root").inner_text()
    forbidden = ["undefined", "null", "NaN", "fake", "TODO", "lorem"]
    for word in forbidden:
        assert word.lower() not in root_text.lower(), \
            f"Valeur suspecte '{word}' trouvée dans le dashboard santé"


def test_period_filter_7j(trekko):
    errors = []
    trekko.on("pageerror", lambda e: errors.append(str(e)))
    _open_health(trekko)
    trekko.locator('[data-health-period="week"]').click()
    trekko.wait_for_timeout(400)
    assert errors == [], f"Erreur JS sur filtre 7j : {errors}"


def test_period_filter_30j(trekko):
    _open_health(trekko)
    trekko.locator('[data-health-period="month"]').click()
    trekko.wait_for_timeout(300)
    assert trekko.locator("#health-dashboard-root").is_visible()


def test_period_filter_annee(trekko):
    _open_health(trekko)
    trekko.locator('[data-health-period="year"]').click()
    trekko.wait_for_timeout(300)
    assert trekko.locator("#health-dashboard-root").is_visible()


def test_period_filter_tout(trekko):
    _open_health(trekko)
    trekko.locator('[data-health-period="all"]').click()
    trekko.wait_for_timeout(300)
    assert trekko.locator("#health-dashboard-root").is_visible()


def test_all_period_buttons_present(trekko):
    _open_health(trekko)
    for period in ["week", "month", "year", "all"]:
        assert trekko.locator(f'[data-health-period="{period}"]').count() > 0, \
            f"Bouton de période '{period}' absent"


def test_health_section_title_visible(trekko):
    _open_health(trekko)
    assert trekko.get_by_text("Tableau de bord santé").count() > 0 or \
           trekko.get_by_text("santé", exact=False).count() > 0


def test_apple_health_unavailable_section(trekko):
    _open_health(trekko)
    text = trekko.locator("#health-dashboard-root").inner_text()
    assert "Apple" in text or "PWA" in text or "natif" in text.lower(), \
        "Section Apple Health / PWA non trouvée dans le dashboard"
