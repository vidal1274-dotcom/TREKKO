"""
AGENT 5 — CSS / Régression visuelle / Mobile
Vérifie : affichage 360px/390px/desktop, classes .hdash-* appliquées,
aucun scroll horizontal, panel-health scrollable, pas de régression.
Note : on change le viewport SANS reload pour éviter une ré-initialisation
de startApp() — le reflow CSS suffit pour tester les débordements.
"""
import pytest
from conftest import open_panel


def _open_health(page):
    open_panel(page, "panel-health")
    page.wait_for_selector(
        "#health-dashboard-root .hdash-inner, #health-dashboard-root .hdash-section",
        timeout=10_000
    )
    page.wait_for_timeout(300)


def _has_horizontal_overflow(page):
    return page.evaluate(
        "() => document.documentElement.scrollWidth > document.documentElement.clientWidth"
    )


def test_no_horizontal_overflow_mobile_360(trekko):
    """Pas de débordement horizontal à 360px — viewport seul change, pas de reload."""
    _open_health(trekko)
    trekko.set_viewport_size({"width": 360, "height": 780})
    trekko.wait_for_timeout(400)
    assert not _has_horizontal_overflow(trekko), "Débordement horizontal sur 360px"


def test_no_horizontal_overflow_mobile_390(trekko):
    _open_health(trekko)
    trekko.set_viewport_size({"width": 390, "height": 844})
    trekko.wait_for_timeout(400)
    assert not _has_horizontal_overflow(trekko), "Débordement horizontal sur 390px"


def test_no_horizontal_overflow_desktop(trekko):
    _open_health(trekko)
    trekko.set_viewport_size({"width": 1280, "height": 800})
    trekko.wait_for_timeout(400)
    assert not _has_horizontal_overflow(trekko), "Débordement horizontal sur desktop"


def test_hdash_inner_display_not_none(trekko):
    _open_health(trekko)
    display = trekko.evaluate("""
        () => {
            const el = document.querySelector('.hdash-inner');
            return el ? window.getComputedStyle(el).display : 'NOT_FOUND';
        }
    """)
    assert display not in ("none", "NOT_FOUND"), f"hdash-inner display : '{display}'"


def test_period_tabs_visible_mobile_360(trekko):
    """Les boutons de période doivent être visibles à 360px."""
    _open_health(trekko)
    trekko.set_viewport_size({"width": 360, "height": 780})
    trekko.wait_for_timeout(400)
    assert trekko.locator('[data-health-period="week"]').first.is_visible(), \
        "Bouton '7j' non visible à 360px"


def test_nav_cards_visible_mobile_390(trekko):
    """Les 3 cartes de navigation rapide doivent être visibles à 390px."""
    _open_health(trekko)
    trekko.set_viewport_size({"width": 390, "height": 844})
    trekko.wait_for_timeout(400)
    for section in ["bilan", "courses", "parcours"]:
        assert trekko.locator(f'[data-health-nav="{section}"]').first.is_visible(), \
            f"Carte nav '{section}' non visible à 390px"


def test_panel_health_scrollable(trekko):
    overflow = trekko.evaluate("""
        () => {
            const el = document.getElementById('panel-health');
            return el ? window.getComputedStyle(el).overflowY : 'NOT_FOUND';
        }
    """)
    assert overflow in ("auto", "scroll", "overlay"), \
        f"#panel-health overflow-y = '{overflow}' (non scrollable)"


def test_other_panels_not_broken(trekko):
    _open_health(trekko)
    open_panel(trekko, "panel-map")
    trekko.wait_for_timeout(600)
    assert trekko.locator("body").is_visible()
    assert not _has_horizontal_overflow(trekko), \
        "Débordement horizontal sur panneau Carte après retour de Santé"
