/* =========================================================
   CARNET DE SORTIES — Style Polarsteps
   Journal de voyage personnel avec timeline, stats, photos
   ========================================================= */
import { getAllSessions, loadTrackPoints, exportAsGPX, getActivityConfig } from './tracker.js';
import { loadAllPhotos } from './photos.js';
import { dbGet, dbPut, STORES } from './storage.js';
import { showToast, escapeHTML } from './utils.js';

/* ── Journal ── */
export async function saveJournalToSession(sessionId, updates) {
  const session = await dbGet(STORES.TRACK_SESSIONS, sessionId);
  if (!session) return;
  await dbPut(STORES.TRACK_SESSIONS, { ...session, ...updates });
}

/* ── Stats agrégées ── */
export function calcCarnetStats(sessions) {
  const totalKm  = sessions.reduce((s, x) => s + (x.total_distance_km || 0), 0);
  const totalCal = sessions.reduce((s, x) => s + (x.final_calories || 0), 0);
  const totalMs  = sessions.reduce((s, x) => {
    if (x.started_at && x.ended_at) return s + (new Date(x.ended_at) - new Date(x.started_at));
    return s;
  }, 0);
  return {
    count:    sessions.length,
    km:       Math.round(totalKm  * 10) / 10,
    hours:    Math.round(totalMs  / 3600000 * 10) / 10,
    calories: Math.round(totalCal)
  };
}

/* ── Rendu principal ── */
export async function renderCarnet(container, { onShowOnMap } = {}) {
  container.innerHTML = '<div style="padding:32px;text-align:center;color:#7a7d99;font-size:14px">⏳ Chargement du carnet…</div>';

  const [sessions, photos] = await Promise.all([getAllSessions(), loadAllPhotos()]);
  const stats = calcCarnetStats(sessions);

  function getPhotosForSession(session) {
    if (!session.started_at) return [];
    const start = new Date(session.started_at).getTime();
    const end   = session.ended_at
      ? new Date(session.ended_at).getTime()
      : start + 86400000;
    return photos.filter(p => {
      const t = p.taken_at ? new Date(p.taken_at).getTime() : null;
      return t && t >= start && t <= end;
    });
  }

  const bestSession = sessions.reduce((best, s) =>
    (s.total_distance_km || 0) > (best?.total_distance_km || 0) ? s : best, null);

  container.innerHTML = `
    <div class="carnet-wrap">
      <!-- En-tête style Polarsteps -->
      <div class="carnet-hero">
        <div class="carnet-hero-icon">📔</div>
        <h2>Mon Carnet TREKKO</h2>
        <p>Journal de voyage personnel · Vos aventures</p>
      </div>

      <!-- Dashboard stats agrégées -->
      <div class="carnet-dashboard">
        <div class="carnet-stat-card accent-km">
          <div class="csc-val">${stats.km}</div>
          <div class="csc-unit">km</div>
          <div class="csc-lbl">Parcourus</div>
        </div>
        <div class="carnet-stat-card accent-aventures">
          <div class="csc-val">${stats.count}</div>
          <div class="csc-unit">aventures</div>
          <div class="csc-lbl">Enregistrées</div>
        </div>
        <div class="carnet-stat-card accent-time">
          <div class="csc-val">${stats.hours}</div>
          <div class="csc-unit">h</div>
          <div class="csc-lbl">Actif total</div>
        </div>
        <div class="carnet-stat-card accent-cal">
          <div class="csc-val">${stats.calories || '—'}</div>
          <div class="csc-unit">kcal</div>
          <div class="csc-lbl">Brûlées</div>
        </div>
      </div>

      ${bestSession ? `
      <div class="carnet-best-session">
        <span class="best-label">🏆 Meilleure sortie</span>
        <span class="best-name">${escapeHTML(bestSession.label || 'Sortie')}</span>
        <span class="best-km">${bestSession.total_distance_km} km</span>
      </div>` : ''}

      <!-- Timeline des aventures -->
      <div class="carnet-section-title">📍 Mes sorties</div>
      <div class="carnet-timeline">
        ${sessions.length === 0
          ? `<div class="carnet-empty">
               <div class="carnet-empty-icon">📔</div>
               <h3>Votre carnet est vide</h3>
               <p>Enregistrez votre première sortie GPS<br>pour commencer votre journal de voyage.</p>
             </div>`
          : sessions.map((s, i) => renderSessionCard(s, getPhotosForSession(s), i)).join('')
        }
      </div>
    </div>
  `;

  bindCarnetActions(container, onShowOnMap);
}

/* ── Carte de session style Polarsteps ── */
function renderSessionCard(session, sessionPhotos, idx) {
  const cfg = getActivityConfig(session.activity_mode || 'casual');
  const startDate = session.started_at ? new Date(session.started_at) : null;
  const endDate   = session.ended_at   ? new Date(session.ended_at)   : null;
  const durationMs = startDate && endDate ? endDate - startDate : 0;
  const durationMin = Math.round(durationMs / 60000);
  const durationStr = durationMin >= 60
    ? `${Math.floor(durationMin / 60)}h${String(durationMin % 60).padStart(2, '0')}`
    : `${durationMin} min`;

  const dateStr = startDate
    ? startDate.toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })
    : '—';
  const timeStr = startDate
    ? startDate.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
    : '';

  const weatherBadge = session.weather_emoji
    ? `<span class="weather-pill">${session.weather_emoji} ${session.weather_temp !== undefined ? session.weather_temp + '°' : ''}</span>`
    : '';

  const photosHtml = sessionPhotos.length > 0
    ? `<div class="session-photos-strip">
        ${sessionPhotos.slice(0, 6).map(p =>
          p.thumbnail
            ? `<img src="${p.thumbnail}" class="sph" alt="${p.filename}" />`
            : `<div class="sph sph-empty">📷</div>`
        ).join('')}
        ${sessionPhotos.length > 6 ? `<div class="sph sph-more">+${sessionPhotos.length - 6}</div>` : ''}
      </div>`
    : '';

  const MOODS = ['😊', '💪', '😌', '🥵', '😴', '🌟', '😰'];
  const moodHtml = `
    <div class="journal-block">
      <div class="journal-block-label">Humeur</div>
      <div class="mood-picker" data-sid="${session.id}">
        ${MOODS.map(m =>
          `<button class="mood-btn${session.journal_mood === m ? ' active' : ''}" data-sid="${session.id}" data-mood="${m}">${m}</button>`
        ).join('')}
      </div>
    </div>`;

  const notesHtml = `
    <div class="journal-block">
      <div class="journal-block-label">Notes · Journal ✍️</div>
      <textarea class="carnet-notes-input" data-sid="${session.id}"
        placeholder="Raconte ta sortie… lieux traversés, sensations, anecdotes, personnes croisées…" rows="3">${session.journal_notes || ''}</textarea>
      <span class="notes-hint" id="hint-${session.id}"></span>
    </div>`;

  return `
    <div class="carnet-card" data-idx="${idx}">
      <!-- Ligne de timeline -->
      <div class="timeline-dot"></div>

      <!-- En-tête de la carte -->
      <div class="carnet-card-header">
        <div class="carnet-card-date">
          <div class="card-date-main">${dateStr}</div>
          <div class="card-date-sub">${timeStr} · ${cfg.label} ${cfg.emoji}</div>
        </div>
        <div class="card-header-right">
          ${weatherBadge}
          <span class="vis-pill ${session.is_public ? 'vis-pub' : 'vis-prv'}">${session.is_public ? '🌍' : '🔒'}</span>
        </div>
      </div>

      <!-- Titre de la sortie -->
      <div class="carnet-card-title">${session.label || `${cfg.emoji} ${cfg.label}`}</div>

      <!-- Stats compact -->
      <div class="card-stats-row">
        <div class="csr-item"><span class="csr-v">${(session.total_distance_km || 0).toFixed ? (session.total_distance_km || 0) : 0}</span><span class="csr-u">km</span></div>
        <div class="csr-sep">·</div>
        <div class="csr-item"><span class="csr-v">${durationStr}</span></div>
        <div class="csr-sep">·</div>
        <div class="csr-item"><span class="csr-v">+${session.total_elev_gain_m || 0}m</span><span class="csr-u">D+</span></div>
        ${session.final_calories ? `<div class="csr-sep">·</div><div class="csr-item"><span class="csr-v">${session.final_calories}</span><span class="csr-u">kcal</span></div>` : ''}
        <div class="csr-sep">·</div>
        <div class="csr-item"><span class="csr-v">${session.point_count || 0}</span><span class="csr-u">pts</span></div>
      </div>

      <!-- Photos associées -->
      ${photosHtml}

      <!-- Journal -->
      <div class="carnet-journal">
        ${moodHtml}
        ${notesHtml}
      </div>

      <!-- Actions -->
      <div class="carnet-card-actions">
        <button class="carnet-btn carnet-btn-map" data-action="show-map" data-sid="${session.id}">🗺️ Carte</button>
        <button class="carnet-btn carnet-btn-gpx" data-action="export-gpx" data-sid="${session.id}">⬇️ GPX</button>
      </div>
    </div>
  `;
}

/* ── Bindings interactions ── */
function bindCarnetActions(container, onShowOnMap) {
  container.querySelectorAll('[data-action="show-map"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (onShowOnMap) onShowOnMap(btn.dataset.sid);
    });
  });

  container.querySelectorAll('[data-action="export-gpx"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pts = await loadTrackPoints(btn.dataset.sid);
      if (!pts.length) { showToast('Aucun point GPS pour cette session.', 'warning'); return; }
      const sessions = await getAllSessions();
      const sess = sessions.find(s => s.id === btn.dataset.sid);
      exportAsGPX(pts, sess?.label || 'Parcours');
      showToast('Export GPX téléchargé.', 'success');
    });
  });

  container.querySelectorAll('.mood-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sid = btn.dataset.sid;
      btn.closest('.mood-picker').querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      await saveJournalToSession(sid, { journal_mood: btn.dataset.mood });
      showToast('Humeur enregistrée.', 'success');
    });
  });

  container.querySelectorAll('.carnet-notes-input').forEach(textarea => {
    let timer = null;
    const hint = container.querySelector(`#hint-${textarea.dataset.sid}`);
    textarea.addEventListener('input', () => {
      clearTimeout(timer);
      if (hint) hint.textContent = '';
      timer = setTimeout(async () => {
        await saveJournalToSession(textarea.dataset.sid, { journal_notes: textarea.value });
        if (hint) {
          hint.textContent = '✓ sauvegardé';
          setTimeout(() => { if (hint) hint.textContent = ''; }, 2000);
        }
      }, 1500);
    });
  });
}
