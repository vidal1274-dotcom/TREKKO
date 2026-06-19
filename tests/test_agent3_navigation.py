"""
AGENT 3 — Navigation UI (Santé → Randonnée)
Vérifie : boutons bilan/courses/parcours ouvrent l'écran randonnée,
listener trekko:navigate-hiking déclenché correctement, navigation standard OK.
"""
import pytest
from conftest import open_panel


def _open_health(page):
    open_panel(page, "panel-health")
    page.wait_for_selector("#health-dashboard-root .hdash-inner, #health-dashboard-root .hdash-section", timeout=8_000)


def _hiking_screen_visible(page):
    """Retourne True si #hiking-screen est visible (pas hidden)."""
    return page.evaluate("""
        () => {
            const el = document.getElementById('hiking-screen');
            if (!el) return false;
            return !el.classList.contains('hidden') &&
                   window.getComputedStyle(el).display !== 'none';
        }
    """)


def test_sante_to_randonnee_via_bilan(trekko):
    _open_health(trekko)
    bilan_btn = trekko.locator('[data-health-nav="bilan"]')
    assert bilan_btn.count() > 0, "Bouton 'bilan' absent dans le dashboard santé"
    bilan_btn.first.click()
    trekko.wait_for_timeout(1000)
    assert _hiking_screen_visible(trekko), "Écran randonnée non affiché après clic bilan"


def test_sante_to_randonnee_via_courses(trekko):
    _open_health(trekko)
    btn = trekko.locator('[data-health-nav="courses"]')
    assert btn.count() > 0, "Bouton 'courses' absent"
    btn.first.click()
    trekko.wait_for_timeout(1000)
    assert _hiking_screen_visible(trekko), "Écran randonnée non affiché après clic courses"


def test_sante_to_randonnee_via_parcours(trekko):
    _open_health(trekko)
    btn = trekko.locator('[data-health-nav="parcours"]')
    assert btn.count() > 0, "Bouton 'parcours' absent"
    btn.first.click()
    trekko.wait_for_timeout(1000)
    assert _hiking_screen_visible(trekko), "Écran randonnée non affiché après clic parcours"


def test_navigation_cards_present(trekko):
    _open_health(trekko)
    for section in ["bilan", "courses", "parcours"]:
        assert trekko.locator(f'[data-health-nav="{section}"]').count() > 0, \
            f"Carte nav '{section}' absente"


def test_standard_map_panel_still_works(trekko):
    """L'onglet Carte s'ouvre normalement (non cassé par Phase 10)."""
    errors = []
    trekko.on("pageerror", lambda e: errors.append(str(e)))
    open_panel(trekko, "panel-map")
    trekko.wait_for_timeout(600)
    assert trekko.locator("#panel-map").count() > 0, "Panneau carte introuvable"
    assert errors == [], f"Erreur JS sur onglet Carte : {errors}"


def test_back_and_forth_health_map_no_error(trekko):
    errors = []
    trekko.on("pageerror", lambda e: errors.append(str(e)))
    for _ in range(3):
        _open_health(trekko)
        open_panel(trekko, "panel-map")
    assert errors == [], f"Erreur JS en navigation aller-retour : {errors}"


def test_hs_section_buttons_present_in_html(trekko):
    """Les boutons [data-hs-section] (bilan/courses/parcours) sont dans le DOM."""
    for section in ["bilan", "courses", "parcours"]:
        assert trekko.locator(f'[data-hs-section="{section}"]').count() > 0, \
            f"Bouton [data-hs-section='{section}'] introuvable dans le DOM"
