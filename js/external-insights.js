/* =========================================================
   BLOC 01 — GÉNÉRATION DE LIENS DE RECHERCHE PUBLICS
   ========================================================= */
// Aucun scraping. Uniquement des liens de recherche légaux vers sources publiques.

export function buildInsightLinks(site) {
  const name = site.destination || site.nom || '';
  const enc = encodeURIComponent(name);
  const encReg = encodeURIComponent(name + ' Gard Occitanie');

  return {
    google: [
      { label: `Avis visiteurs ${name}`, url: `https://www.google.com/search?q=avis+visiteurs+${enc}`, icon: '🔍' },
      { label: `Parking ${name} gratuit`, url: `https://www.google.com/search?q=parking+gratuit+${enc}`, icon: '🅿️' },
      { label: `Entrée prix ${name}`, url: `https://www.google.com/search?q=entr%C3%A9e+prix+tarif+${enc}`, icon: '💶' },
      { label: `Péage trajet ${name}`, url: `https://www.google.com/search?q=peage+trajet+${enc}+Nimes`, icon: '🛣️' },
      { label: `Horaires ${name}`, url: `https://www.google.com/search?q=horaires+${enc}`, icon: '🕐' }
    ],
    gmaps: [
      { label: `${name} sur Google Maps`, url: `https://www.google.com/maps/search/${enc}`, icon: '🗺️' },
      { label: `Restaurants près de ${name}`, url: `https://www.google.com/maps/search/restaurant+${enc}`, icon: '🍽️' },
      { label: `Bornes recharge près de ${name}`, url: `https://www.google.com/maps/search/borne+recharge+electrique+${enc}`, icon: '⚡' }
    ],
    youtube: [
      { label: `Vidéo : visite ${name}`, url: `https://www.youtube.com/results?search_query=visite+${enc}`, icon: '▶️' },
      { label: `Vlog ${name}`, url: `https://www.youtube.com/results?search_query=vlog+${encReg}`, icon: '▶️' }
    ],
    reddit_forums: [
      { label: `Reddit : ${name}`, url: `https://www.reddit.com/search/?q=${enc}+france`, icon: '💬' },
      { label: `Forum randonnée ${name}`, url: `https://www.google.com/search?q=forum+avis+${enc}+randonnee`, icon: '💬' },
      { label: `Blogs voyage ${name}`, url: `https://www.google.com/search?q=blog+voyage+${enc}+week-end`, icon: '📝' }
    ],
    tripadvisor: [
      { label: `TripAdvisor ${name}`, url: `https://www.tripadvisor.fr/Search?q=${enc}`, icon: '⭐' }
    ]
  };
}

/* =========================================================
   BLOC 02 — POINTS POSITIFS / NÉGATIFS GÉNÉRÉS
   ========================================================= */
export function buildInsightSummary(site) {
  const vigilance = (site.vigilance || '').toLowerCase();
  const budget = (site.budget_indicatif || '').toLowerCase();
  const prog = (site.programme_court || '').toLowerCase();
  const points = (site.points_forts || '').toLowerCase();

  const positifs = [];
  const negatifs = [];
  const aVerifier = [];

  // Positifs
  if (budget.includes('gratu') || budget.includes('libre')) positifs.push('Accès gratuit signalé');
  if (budget.includes('parking gratuit') || vigilance.includes('parking gratuit')) positifs.push('Parking gratuit signalé');
  if (vigilance.includes('sans péage')) positifs.push('Sans péage probable');
  if (/paysage|panorama|vue|beau/i.test(points + prog)) positifs.push('Beau paysage signalé');
  if (/famille|enfant/i.test(points + prog)) positifs.push('Adapté aux familles');
  if (/pique.?nique|picnic/i.test(prog)) positifs.push('Pique-nique possible');
  if (site.distance_km && site.distance_km < 25) positifs.push(`Proche : ${site.distance_km} km`);

  // Négatifs / vigilance
  if (vigilance.includes('foule') || vigilance.includes('monde') || vigilance.includes('fréquenté')) {
    negatifs.push('Fréquentation élevée possible en été');
  }
  if (vigilance.includes('réservation')) negatifs.push('Réservation recommandée ou obligatoire');
  if (vigilance.includes('péage') && !vigilance.includes('sans péage')) negatifs.push('Péage possible sur le trajet');
  if (/difficile|sportif|exigeant/i.test(site.niveau_marche || '')) negatifs.push('Niveau de marche élevé');

  // À vérifier
  aVerifier.push('Horaires et tarifs à confirmer avant de partir');
  if (!budget.includes('gratu') && !site.budget_min) aVerifier.push('Budget exact à vérifier sur place ou sur le site officiel');
  if (!vigilance.includes('sans péage')) aVerifier.push('Péage : à vérifier selon itinéraire choisi');

  return { positifs, negatifs, aVerifier, source: 'Données extraites du fichier Excel source — à compléter avec avis visiteurs' };
}

/* =========================================================
   BLOC 03 — RENDU HTML SECTION INSIGHTS
   ========================================================= */
export function renderInsightsSection(site) {
  const links = buildInsightLinks(site);
  const summary = buildInsightSummary(site);

  const posHtml = summary.positifs.map(p => `<li class="insight-positive">✅ ${p}</li>`).join('');
  const negHtml = summary.negatifs.map(n => `<li class="insight-negative">⚠️ ${n}</li>`).join('');
  const verHtml = summary.aVerifier.map(v => `<li style="color:#f39c12">❓ ${v}</li>`).join('');

  const googleLinks = links.google.map(l => `<a href="${l.url}" target="_blank" rel="noopener noreferrer" class="action-link">${l.icon} ${l.label}</a>`).join('');
  const ytLinks = links.youtube.map(l => `<a href="${l.url}" target="_blank" rel="noopener noreferrer" class="action-link">${l.icon} ${l.label}</a>`).join('');
  const taLink = links.tripadvisor.map(l => `<a href="${l.url}" target="_blank" rel="noopener noreferrer" class="action-link">${l.icon} ${l.label}</a>`).join('');

  return `
    <div class="insights-block">
      <h4>💬 Ce que disent les visiteurs</h4>
      <p class="insight-source">Source : données locales + liens vers avis publics. Les informations ci-dessous sont indicatives et doivent être vérifiées.</p>
      ${posHtml || negHtml ? `
        <ul style="margin:10px 0;padding-left:16px;line-height:2">
          ${posHtml}${negHtml}${verHtml}
        </ul>` : ''}
      <div class="detail-section">
        <h4>🔍 Rechercher des avis</h4>
        <div class="action-links">${googleLinks}${taLink}${ytLinks}</div>
        <p class="insight-source" style="margin-top:6px">⚠️ Ces liens ouvrent des recherches publiques. L'application ne scrape aucun site.</p>
      </div>
    </div>`;
}
