# TREKKO v1.7.0 — Plan d'implémentation
**Branche** : feat/v1.7-hiking-hud-summary-ci  
**Date** : 2026-06-01  
**Base** : v1.6.0-ui-code-hardening (fc139f0)

---

## 1. État actuel

### HUD Live (hs-live)
- Top bar : mode | timer | pause | lock
- Stats panel : water alert | hero (dist + elev) | grid 2 cellules (pace + cals) | progress bar | actions (sound + stop)
- **Manque** : GPS indicator, vitesse courante, vitesse moyenne, bouton recentrer, nombre de points

### Résumé (hs-summary)
- Distance, durée, dénivelé, calories, badge difficulté, splits
- **Manque** : vitesse moy, vitesse max, allure, alt min/max, nb points, précision moy, fiabilité, copier texte, retour carte

### day-plan.js
- TRAVEL_SPEEDS existe (city/road/mixed/highway/mountain)
- generateDayPlan accepte `speedProfile` dans options
- **Manque** : sélecteur visible dans l'UI, persistence localStorage, re-calcul à la demande

### tracker.js
- getLiveStats() retourne : distanceKm, speedKmh, paceMinKm, elevGainM, activityMode, pointCount, calories, splits, autoPaused, elapsedSec, status
- **Manque** : maxSpeedKmh, avgAccuracy, lastAccuracy, minAltitude, maxAltitude (non trackés)

### CI
- Aucune GitHub Actions en place
- tests/smoke-tests.html existe (22 tests)
- **Manque** : .github/workflows/smoke.yml, scripts/check-files.mjs, package.json

---

## 2. Modifications prévues

### Lot A — tracker.js
- Ajouter tracking : _maxSpeedKmh, _lastAccuracy, _totalAccuracy, _accuracyCount, _minAltitude, _maxAltitude
- getLiveStats() : exposer ces nouveaux champs
- stopTracking() : réinitialiser ces champs
- Ajouter export buildHikingSummary(finalStats) → objet summary normalisé

### Lot B — hiking-screen.js
- HUD : mettre à jour GPS indicator, vitesse, vitesse moy, nb points (dans _updateLiveStats)
- Ajouter bouton recentrer carte (btn-hs-center)
- Remplacer _showSummary() par buildHikingSummary() + renderHikingSummary()
- Ajouter copyHikingSummaryText(summary) + bouton "Copier résumé"
- Ajouter bouton "Retour carte" dans le résumé

### Lot C — index.html
- HUD : ajouter ligne GPS indicator, expand stats grid 4 cellules, bouton recentrer
- Summary : ajouter cellules vitesse moy, allure, alt min/max, précision, nb points, avertissements
- Summary footer : ajouter btn-hs-copy + btn-hs-back-map
- day-plan-modal : ajouter <select id="dp-speed-profile"> avec 4 options

### Lot D — styles.css
- Indicateur GPS : .hs-gps-dot (vert/orange/rouge/gris), .hs-gps-bar
- Stats grid : 4 colonnes au lieu de 2
- Summary : cellules enrichies

### Lot E — app.js
- Lire/sauvegarder le profil vitesse (localStorage key : 'trekko_speed_profile')
- Passer speedProfile à generateDayPlan() dans onDayPlanClick() et le bouton régénérer
- Wirer le <select> dp-speed-profile

### Lot F — CI GitHub Actions
- .github/workflows/smoke.yml
- scripts/check-files.mjs
- package.json minimal

### Lot G — Smoke tests + docs
- Ajouter tests buildHikingSummary dans smoke-tests.html
- Mettre à jour _docs/TEST_PLAN.md section v1.7
- VERSION + CHANGELOG

---

## 3. Risques

| Risque | Mitigation |
|--------|------------|
| HUD surcharge CPU sur mobile | Garder indicateur GPS dans _updateLiveStats (5s), pas dans le timer 1s |
| buildHikingSummary casse export GPX | GPX n'est pas modifié — exportAsGPX() reste inchangé |
| speed selector re-génère le plan automatiquement | Seulement au clic "Régénérer" explicite |
| CI node --check échoue sur modules ESM | Utiliser node --check qui supporte la syntaxe ESM statiquement |
| SW v13 nécessaire ? | Oui si styles.css ou service-worker.js modifiés |

---

## 4. Rollback

- Branche feat/v1.7 indépendante — main non touché
- En cas de problème : `git checkout main` suffit
- Tag v1.6.0 intact sur fc139f0

---

## 5. Checklist de validation

- [ ] Timer HUD résistant à la veille (inchangé depuis v1.6)
- [ ] Indicateur GPS vert < 15m / orange 15-40m / rouge > 40m / gris = null
- [ ] Vitesse courante et moyenne s'affichent
- [ ] Bouton recentrer ramène la carte sur position GPS
- [ ] buildHikingSummary() retourne objet valide
- [ ] renderHikingSummary() affiche tous les champs
- [ ] Copier résumé fonctionne (clipboard)
- [ ] Export GPX inchangé (nom + contenu)
- [ ] Sélecteur vitesse visible dans le programme
- [ ] Recalcul au clic "Régénérer" avec nouveau profil
- [ ] Profil persisté en localStorage
- [ ] GitHub Actions passe sur main
- [ ] smoke-tests.html tous verts
- [ ] Console zéro erreur
