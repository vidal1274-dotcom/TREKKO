# TREKKO — Plan de test manuel
**Version** : 1.7.0-hiking-hud-summary-ci  
**À exécuter avant tout merge sur main.**

---

## 14. Tests v1.7 — HUD GPS + Résumé + Programme + CI

### HUD Randonnée
- [ ] Indicateur GPS vert quand précision < 15 m
- [ ] Indicateur GPS orange quand précision 15-40 m
- [ ] Indicateur GPS rouge quand précision > 40 m
- [ ] Indicateur GPS gris si GPS perdu / inaccessible
- [ ] "GPS excellent / moyen / faible / perdu" texte lisible
- [ ] Valeur `±X m` affichée à côté du statut
- [ ] Avertissement "Précision GPS faible" si accuracy > 40m
- [ ] Grille HUD : 4 cellules (allure, vitesse, vitesse moy, kcal)
- [ ] Bouton 📍 recentre la carte sur la position GPS

### Résumé Randonnée
- [ ] buildHikingSummary produit un objet valide (non nul)
- [ ] renderHikingSummary affiche distance, durée, dénivelé, vitesse moy, allure
- [ ] Altitude min/max affichée si données dispo
- [ ] Précision GPS moyenne affichée
- [ ] Fiabilité "🟢 bonne" si pointCount ≥ 3 et accuracy < 40
- [ ] Avertissement si peu de points ou précision faible
- [ ] Bouton "Copier résumé" → texte dans presse-papier (format lisible)
- [ ] Texte copié contient distance, durée, vitesse moyenne
- [ ] Bouton "Retour carte" ferme l'écran randonnée
- [ ] Export GPX inchangé (nom format trekko-xxx-AAAA-MM-JJ-HHMM.gpx)

### Programme Journée
- [ ] Sélecteur de profil visible dans la modale
- [ ] 4 options disponibles (ville, montagne, mixte, autoroute)
- [ ] Choix persisté après fermeture/réouverture de la modale
- [ ] "Régénérer" utilise le profil sélectionné
- [ ] Avertissement "Hors trafic réel" visible
- [ ] Badge GPS vert si position réelle, orange si défaut

### CI GitHub Actions
- [ ] `npm run smoke` passe localement (node scripts/check-files.mjs)
- [ ] Workflow `.github/workflows/smoke.yml` visible sur GitHub
- [ ] CI passe au prochain push sur la branche

### smoke-tests.html v1.7
- [ ] Ouvrir tests/smoke-tests.html
- [ ] Tous les tests ✅ (35 tests)
- [ ] Aucun ❌
- [ ] buildHikingSummary tests passent
- [ ] TRAVEL_SPEEDS tests passent
- [ ] GPS indicator states testées

---

---

## 0. Pré-requis
- [ ] GitHub Pages déployé depuis la branche (ou tester en local)
- [ ] iPhone ou Android avec GPS activé
- [ ] Console navigateur ouverte (Safari Web Inspector ou DevTools)
- [ ] Console sans erreur critique au chargement

---

## 1. Chargement & Service Worker
- [ ] Page se charge en moins de 5s en 4G
- [ ] Console : aucune erreur rouge au chargement
- [ ] Console : aucun module manquant (404)
- [ ] Service Worker enregistré (DevTools > Application > Service Workers)
- [ ] Après refresh forcé (Ctrl+Shift+R) : données toujours présentes

---

## 2. GPS automatique
- [ ] Dès le chargement, le navigateur demande la permission GPS
- [ ] Après accord : point bleu visible sur la carte
- [ ] Bouton GPS dans la barre de localisation passe en vert
- [ ] Label localisation affiche "Ma position"
- [ ] Les distances des sites sont recalculées depuis la position réelle

---

## 3. Carte principale
- [ ] Fond de carte OpenStreetMap chargé correctement
- [ ] Bascule Satellite : fond IGN visible, noms de rues superposés
- [ ] Bascule retour Carte : fond OSM restauré
- [ ] Zoom avant jusqu'au niveau 19 : tuiles nettes
- [ ] Sur Retina (iPhone) : tuiles nettes sans flou
- [ ] Marqueurs de sites visibles avec couleurs correctes

---

## 4. Randonnée — Setup
- [ ] Cliquer sur Randonnée depuis l'écran d'accueil
- [ ] Bottom-sheet visible en bas, carte visible au-dessus
- [ ] Fond de carte centré sur la position GPS
- [ ] Sentiers OSM verts chargés (patienter 5-10s)
- [ ] Marqueurs de sites habituels masqués
- [ ] Bandeau "X sentiers trouvés dans un rayon de Y km"
- [ ] Bouton Retour ← fonctionne → retour carte + marqueurs restaurés
- [ ] Fermer pendant chargement Overpass → sentiers ne s'affichent PAS sur la carte principale

---

## 5. Randonnée — Live HUD
- [ ] Cliquer DÉMARRER
- [ ] Timer démarre et s'incrémente correctement
- [ ] Mettre l'écran en veille 30s → rouvrir → timer correct (pas de dérive)
- [ ] Bouton Pause : timer s'arrête (affiché orange)
- [ ] Bouton Reprendre : timer reprend depuis le bon instant
- [ ] Stats : distance, dénivelé, allure s'affichent
- [ ] Bouton Verrouiller → overlay verrouillage
- [ ] Maintenir "Déverrouiller" 1.5s → overlay disparaît

---

## 6. Randonnée — Stop & Résumé
- [ ] ARRÊTER → confirmation → résumé affiché
- [ ] Résumé : distance, durée, dénivelé, calories correctes
- [ ] Badge difficulté cohérent avec la distance
- [ ] Splits affichés si ≥ 1 km parcouru
- [ ] Console : aucune erreur

---

## 7. Export GPX
- [ ] Bouton GPX dans le résumé → téléchargement déclenché
- [ ] Nom de fichier format : `trekko-rando-AAAA-MM-JJ-HHMM.gpx`
- [ ] Fichier valide (ouvrir dans GPX viewer ou JOSM)
- [ ] Sur Safari iOS : fichier non vide (revoke après 5s)
- [ ] Toast "GPX exporté" visible
- [ ] Aucun double téléchargement

---

## 8. Alerte hydratation
- [ ] Lancer une rando et attendre 45 min (ou raccourcir waterIntervalMin pour test)
- [ ] Bannière bleue "💧 Boire ~Xml maintenant" apparaît
- [ ] Valeur en ml est un nombre valide (pas NaN)
- [ ] Voix (si activée) annonce "Pensez à boire"
- [ ] Bannière disparaît après 8s

---

## 9. Programme de journée
- [ ] Aller dans l'onglet Programme
- [ ] Cliquer Générer
- [ ] Programme affiché avec étapes et connecteurs de trajet
- [ ] Connecteur : X km · ~Xh visible
- [ ] Liens Waze et Maps fonctionnels (ouvrent l'app)
- [ ] Badge "Depuis position GPS" si GPS actif (vert)
- [ ] Badge "Depuis position par défaut" si pas de GPS (orange)
- [ ] Mention "Profil route : Route mixte"
- [ ] Distances à vol d'oiseau avertissement visible
- [ ] Bouton Copier → texte dans presse-papier

---

## 10. Overpass POI thématiques
- [ ] Ouvrir un filtre thématique (Restaurants, Musées…)
- [ ] Indicateur de chargement visible
- [ ] Résultats dans un rayon cohérent
- [ ] Déclencher deux recherches rapidement → seule la dernière s'affiche (AbortController)

---

## 11. Responsive mobile iPhone
- [ ] Tous les boutons tactiles ≥ 44px (conforme Apple HIG)
- [ ] Aucun texte tronqué ou chevauchant
- [ ] Bottom-sheet du setup rando scrollable
- [ ] HUD live lisible en plein soleil (contraste fort)
- [ ] Résumé scrollable

---

## 12. Console finale
- [ ] Zéro erreur JavaScript rouge
- [ ] Pas de warning critique lié à Leaflet
- [ ] Pas de "Failed to load resource" sur les modules JS
- [ ] Service Worker actif et version correcte (SW v12)

---

## 13. Smoke tests automatiques
- [ ] Ouvrir `tests/smoke-tests.html` dans le navigateur
- [ ] Tous les tests verts (✅)
- [ ] Aucun rouge (❌)
