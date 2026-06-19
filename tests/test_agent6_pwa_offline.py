"""
AGENT 6 — PWA / Service Worker / Offline
Vérifie : SW actif, anciens caches purgés, app fonctionnelle offline,
scope /TREKKO/, pas de contenu mixte.
Note : health-tab.js est un import dynamique réseau → il faut le charger
AVANT de passer offline. Le SW v12 n'a pas de fetch handler donc pas de
cache réseau : on teste que la page déjà chargée reste fonctionnelle.
"""
import pytest
from conftest import open_panel


def _open_health(page):
    open_panel(page, "panel-health")
    page.wait_for_selector(
        "#health-dashboard-root .hdash-inner, #health-dashboard-root .hdash-section",
        timeout=10_000
    )


def test_sw_is_active(trekko):
    sw_info = trekko.evaluate("""
        async () => {
            if (!('serviceWorker' in navigator)) return null;
            const reg = await navigator.serviceWorker.ready;
            return {
                active: !!reg.active,
                state: reg.active ? reg.active.state : null,
                scope: reg.scope,
            };
        }
    """)
    assert sw_info is not None, "Service Worker non disponible"
    assert sw_info["active"], "Aucun SW actif"
    assert sw_info["state"] == "activated", f"SW state : {sw_info['state']}"


def test_no_old_caches(trekko):
    caches = trekko.evaluate("async () => await caches.keys()")
    old = [k for k in caches if k.startswith("trekko-") and k != "trekko-v12"]
    assert old == [], f"Anciens caches trouvés : {old}"


def test_app_functional_after_offline(trekko, context):
    """
    L'app reste fonctionnelle offline APRÈS que le health tab a été chargé.
    health-tab.js est un import() dynamique réseau → doit être chargé online d'abord.
    """
    # 1. Charger le health tab online (déclenche l'import dynamique de health-tab.js)
    _open_health(trekko)
    # Retourner sur un autre onglet pour tester la re-navigation offline
    open_panel(trekko, "panel-map")
    trekko.wait_for_timeout(300)

    # 2. Passer offline
    context.set_offline(True)
    try:
        assert trekko.locator("body").is_visible()

        # 3. Ré-ouvrir Santé offline — health-tab.js déjà en mémoire, pas de réseau nécessaire
        # force=True déjà dans open_panel, mais on désactive aussi la bannière offline
        trekko.evaluate("""
            () => {
                const nb = document.getElementById('network-banner');
                if (nb) { nb.style.pointerEvents = 'none'; nb.style.zIndex = '-1'; }
            }
        """)
        open_panel(trekko, "panel-health")
        trekko.wait_for_timeout(800)

        root = trekko.locator("#health-dashboard-root")
        assert root.count() > 0, "Dashboard santé disparu en mode offline"
        # Le contenu doit être là (module déjà chargé)
        inner = trekko.locator("#health-dashboard-root .hdash-inner")
        assert inner.count() > 0, "hdash-inner absent offline (health-tab.js devrait être en mémoire)"

    finally:
        context.set_offline(False)


def test_sw_scope_contains_trekko(trekko):
    scope = trekko.evaluate("""
        async () => {
            const regs = await navigator.serviceWorker.getRegistrations();
            return regs.map(r => r.scope);
        }
    """)
    trekko_scopes = [s for s in scope if "TREKKO" in s or "trekko" in s.lower()]
    assert trekko_scopes, f"Aucun SW scope /TREKKO/. Scopes trouvés : {scope}"


def test_no_mixed_content_errors(trekko, console_errors):
    mixed = [e for e in console_errors if "Mixed Content" in e or "insecure" in e.lower()]
    assert mixed == [], f"Erreurs mixed content : {mixed}"
