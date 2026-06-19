"""Fixtures partagées — Trekko PWA Playwright tests."""
import pytest

BASE_URL = "https://vidal1274-dotcom.github.io/TREKKO/"


def wait_and_dismiss_welcome(page):
    """
    Attend que startApp() soit complété (welcome screen visible),
    puis le ferme via #btn-welcome-skip.
    Race condition évitée : on attend d'abord que le welcome soit shown.
    """
    try:
        # Attendre que le welcome screen apparaisse (preuve que startApp() a fini)
        page.wait_for_selector("#welcome-screen:not(.hidden)", timeout=12_000)
    except Exception:
        pass  # déjà caché ou jamais apparu

    # Forcer la fermeture via JS direct (+ pointer-events none sur les enfants)
    page.evaluate("""
        () => {
            const ws = document.getElementById('welcome-screen');
            if (ws) {
                ws.classList.add('hidden');
                ws.style.cssText = 'display:none!important;pointer-events:none!important;';
                // Désactiver aussi tous les enfants positionnés absolument
                ws.querySelectorAll('*').forEach(el => {
                    el.style.pointerEvents = 'none';
                });
            }
        }
    """)
    page.wait_for_timeout(300)


def dismiss_network_banner(page):
    """Désactive les pointer-events de la bannière réseau si présente."""
    page.evaluate("""
        () => {
            const nb = document.getElementById('network-banner');
            if (nb) { nb.style.pointerEvents = 'none'; nb.style.zIndex = '-1'; }
        }
    """)


def open_panel(page, panel_id):
    """Supprime les overlays bloquants puis clique sur l'onglet data-panel=panel_id."""
    dismiss_network_banner(page)
    page.locator(f'[data-panel="{panel_id}"]').click(force=True)
    page.wait_for_timeout(600)


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    return {**browser_context_args, "bypass_csp": True}


@pytest.fixture
def console_errors(page):
    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda err: errors.append(str(err)))
    return errors


@pytest.fixture
def trekko(page, console_errors):
    """Ouvre l'app, attend la fin de startApp() via le welcome screen, puis le ferme."""
    page.goto(BASE_URL, wait_until="networkidle", timeout=30_000)
    wait_and_dismiss_welcome(page)
    return page
