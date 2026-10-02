import { REGLES, STATUTS, TYPES } from './regles.js';
import { calculer, filtrerBM } from './calcul.js';
import { ouvrirStore } from './store.js';
import { preparerImport, validerImport } from './import.js';
import { classer } from './classify.js';
import { trigramme } from './annuaire.js';

// ---------------------------------------------------------------- utilitaires
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fd = d => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const fdh = d => (d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const pluriel = (n, s, p = s + 's') => `${n} ${n > 1 ? p : s}`;
const mem = {
  get(k, d) { try { const v = localStorage.getItem('sr-ui:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sr-ui:' + k, JSON.stringify(v)); } catch { /* préférences non conservées */ } },
};

const S = {
  store: null, user: null,
  donnees: { ao: [], messages: [], corrections: [], bm: [], equipes: [], imports: [] }, calc: null,
  p: 'all', seuil: REGLES.seuilsRetard[0], seuilF: REGLES.seuilsRetard[0], only: true,
  sel: new Set(mem.get('selection', [])), equipeNom: mem.get('equipe', null),
  vue: 'home', liste: 'wait', person: '', tab: 'equipes', editEquipe: null,
  sort: { list: ['jours', -1], rank: ['wait', -1], person: ['jours', -1], free: ['jours', -1] },
  fichiers: {}, prep: null, message: null,
};

// ---------------------------------------------------------------- période et périmètre
function bornes(p) {
  const t = new Date(), y = t.getFullYear(), m = t.getMonth(), q = Math.floor(m / 3) * 3;
  return { m0: [new Date(y, m, 1), new Date(y, m + 1, 1)], m1: [new Date(y, m - 1, 1), new Date(y, m, 1)],
    q0: [new Date(y, q, 1), new Date(y, q + 3, 1)], q1: [new Date(y, q - 3, 1), new Date(y, q, 1)] }[p] || null;
}
const dansPeriode = d => { const b = bornes(S.p); return !b || (d && d >= b[0] && d < b[1]); };
const reservations = () => filtrerBM(S.calc.reservations, S.sel).filter(r => dansPeriode(r.date));
const libres = () => S.calc.libres.filter(a => dansPeriode(a.date));

// ---------------------------------------------------------------- données
async function charger() {
  try {
    S.donnees = await S.store.charger();
    S.calc = calculer(S.donnees);
    if (location.hash.startsWith('#equipe=')) {
      const e = S.donnees.equipes.find(x => x.nom === decodeURIComponent(location.hash.slice(8)));
      if (e) appliquerEquipe(e, false);
    }
  } catch (e) {
    S.calc = calculer({});
    S.message = { type: 'err', texte: `Chargement impossible : ${e.message}` };
  }
  render();
}

// ---------------------------------------------------------------- équipe
function appliquerSelection(noms, nomEquipe = null) {
  S.sel = new Set(noms); S.equipeNom = nomEquipe;
  mem.set('selection', [...S.sel]); mem.set('equipe', nomEquipe);
  if (nomEquipe) history.replaceState(null, '', '#equipe=' + encodeURIComponent(nomEquipe));
  else history.replaceState(null, '', location.pathname + location.search);
}
function appliquerEquipe(e, rendre = true) { appliquerSelection(e.membres || [], e.nom); if (rendre) render(); }
function libelleEquipe() {
  if (!S.sel.size) return 'tout le monde';
  if (S.equipeNom) return S.equipeNom;
  return S.sel.size === 1 ? [...S.sel][0] : `${S.sel.size} BM sélectionnés`;
}
function tousLesBM() {
  const s = new Set([...(S.calc?.bms || []), ...S.donnees.bm.map(b => b.nom), ...S.sel]);
  return [...s].filter(n => !/\?/.test(n)).sort((a, b) => a.localeCompare(b, 'fr'));
}
function renderPanelEquipe() {
  const p = $('#panelEquipe');
  const equipes = [...S.donnees.equipes].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  p.innerHTML = `
    <h3>Équipes enregistrées</h3>
    <div class="chips">
      <button class="chip" data-tous aria-pressed="${!S.sel.size}">Tout le monde</button>
      ${equipes.map(e => `<button class="chip" data-eq="${esc(e.nom)}" aria-pressed="${S.equipeNom === e.nom}">${esc(e.nom)} · ${e.membres.length}</button>`).join('')
        || '<span class="sub">Aucune pour l’instant : coche des BM puis enregistre la sélection.</span>'}
    </div>
    <h3>Ou choisis un ou plusieurs BM</h3>
    <input type="search" id="fltBM" placeholder="Filtrer les noms" style="width:100%;margin-bottom:6px">
    <div class="checks" id="lstBM">${tousLesBM().map(n => `<label data-n="${esc(n.toLowerCase())}"><input type="checkbox" value="${esc(n)}" ${S.sel.has(n) ? 'checked' : ''}><span>${esc(n)}</span></label>`).join('')}</div>
    <div class="row" style="margin-top:10px">
      <input type="text" id="nomNouvelle" placeholder="Nom de l’équipe" style="flex:1">
      <button class="btn" id="bSauverSel" ${S.sel.size ? '' : 'disabled'}>Enregistrer la sélection</button>
    </div>`;
  p.querySelector('[data-tous]').onclick = () => { appliquerSelection([]); render(); };
  p.querySelectorAll('[data-eq]').forEach(b => b.onclick = () => appliquerEquipe(S.donnees.equipes.find(e => e.nom === b.dataset.eq)));
  p.querySelector('#fltBM').oninput = e => { const q = e.target.value.toLowerCase(); p.querySelectorAll('#lstBM label').forEach(l => l.classList.toggle('hidden', !l.dataset.n.includes(q))); };
  p.querySelectorAll('#lstBM input').forEach(c => c.onchange = () => {
    appliquerSelection([...p.querySelectorAll('#lstBM input:checked')].map(x => x.value));
    p.querySelector('#bSauverSel').disabled = !S.sel.size;
    p.querySelectorAll('[data-eq],[data-tous]').forEach(b => b.setAttribute('aria-pressed', b.hasAttribute('data-tous') && !S.sel.size));
    render(true);
  });
  p.querySelector('#bSauverSel').onclick = async () => {
    const nom = p.querySelector('#nomNouvelle').value.trim();
    if (!nom) { p.querySelector('#nomNouvelle').focus(); return; }
    await sauver('equipes', [{ nom, membres: [...S.sel] }], `Équipe « ${nom} » enregistrée.`);
    appliquerSelection([...S.sel], nom); render();
  };
}

// ---------------------------------------------------------------- accueil
function rankData(L) {
  const m = {};
  for (const a of L) {
    const r = m[a.bm] = m[a.bm] || { bm: a.bm, total: 0, wait: 0, traites: 0, sum: 0, nj: 0, old: null };
    r.total++; if (a.s === 'T') r.traites++;
    if (a.s === 'A') { r.wait++; if (a.jours !== null) { r.sum += a.jours; r.nj++; if (!r.old || a.jours > r.old.jours) r.old = a; } }
  }
  return Object.values(m).map(r => ({ ...r, avg: r.nj ? Math.round(r.sum / r.nj) : null, oldj: r.old ? r.old.jours : null }));
}
function rankList(el, rows, key) {
  const top = rows.filter(r => r[key] > 0).sort((a, b) => b[key] - a[key] || a.bm.localeCompare(b.bm)).slice(0, 5);
  const max = Math.max(1, ...top.map(r => r[key]));
  el.innerHTML = top.length ? top.map((r, i) => `<li data-p="${esc(r.bm)}"><span class="n">${i + 1}</span><span class="nm">${esc(r.bm)}</span><span class="bar"><i style="width:${100 * r[key] / max}%"></i></span><b>${r[key]}</b></li>`).join('')
    : '<li class="muted" style="cursor:default">Aucune donnée</li>';
  el.querySelectorAll('[data-p]').forEach(li => li.onclick = () => ouvrirPersonne(li.dataset.p));
}
function renderHome() {
  const L = reservations(), W = L.filter(a => a.s === 'A'), late = W.filter(a => a.jours !== null && a.jours > S.seuil);
  $('#nWait').textContent = W.length;
  const nEst = W.filter(a => a.estimee).length;
  $('#nWaitNote').textContent = `sur ${L.length} réservés${nEst ? ` · dont ${nEst} à date estimée` : ''}`;
  $('#nLate').textContent = late.length;
  const oldest = late.reduce((m, a) => (!m || a.jours > m.jours ? a : m), null);
  $('#nLateNote').textContent = oldest ? `le plus ancien : ${oldest.jours} j (${oldest.bm})` : 'aucun';
  const F = libres(), Fs = F.filter(a => a.jours > S.seuilF);
  $('#nFree').textContent = Fs.length;
  $('#nFreeNote').textContent = `personne ne s’est positionné · ${F.length} non réservés sortis depuis ${REGLES.nonReservesMaxJours} jours ou moins`;
  const rk = rankData(L); rankList($('#rkStock'), rk, 'wait'); rankList($('#rkGlobal'), rk, 'total');
}

// ---------------------------------------------------------------- tableaux
const LAST = {};
function table(sel, key, cols, rows, onRow) {
  const [k, d] = S.sort[key]; const c = cols.find(x => x.k === k) || cols[0];
  rows = [...rows].sort((a, b) => {
    const x = c.v(a), y = c.v(b);
    if (x === null && y === null) return 0; if (x === null) return 1; if (y === null) return -1;
    return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'fr')) * d;
  });
  LAST[key] = { cols, rows };
  const el = $(sel);
  el.innerHTML = `<thead><tr>${cols.map(x => `<th data-k="${x.k}" class="${x.k === k ? 'sorted' : ''} ${x.m ? 'hide-m' : ''}" data-dir="${d > 0 ? '▲' : '▼'}" ${x.num ? 'style="text-align:right"' : ''}>${x.h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r, i) => `<tr class="${onRow ? 'click' : ''}" data-i="${i}">${cols.map(x => `<td class="${x.num ? 'num' : ''} ${x.m ? 'hide-m' : ''}">${x.f ? x.f(r) : esc(x.v(r) ?? '')}</td>`).join('')}</tr>`).join('')
      || `<tr><td colspan="${cols.length}" class="muted">Rien à afficher.</td></tr>`}</tbody>`;
  el.querySelectorAll('th').forEach(th => th.onclick = () => {
    const nk = th.dataset.k, col = cols.find(x => x.k === nk);
    S.sort[key] = [nk, S.sort[key][0] === nk ? -S.sort[key][1] : (col.num ? -1 : 1)]; render(true);
  });
  if (onRow) el.querySelectorAll('tbody tr[data-i]').forEach(tr => tr.onclick = () => onRow(rows[+tr.dataset.i]));
  return rows;
}
const joursCell = a => (a.jours === null ? '<span class="muted">—</span>' : `${a.jours} j${a.s === 'A' && a.jours > S.seuil ? ' <span class="dot" style="background:var(--warn);margin:0 0 0 4px"></span>' : ''}`);
const dateCell = a => (a.date ? `${fd(a.date)}${a.estimee ? ' <span class="est" title="Date estimée : sortie de l’AO">estimée</span>' : ''}` : '<span class="muted">inconnue</span>');
const stCell = a => `<span class="st"><span class="dot" style="background:${STATUTS[a.s].couleur}"></span>${STATUTS[a.s].lib}</span>${a.corrige ? '<span class="tag">corrigé</span>' : ''}`;
const C_AO = avecBM => [
  { k: 'jours', h: 'Jours écoulés', num: 1, v: a => a.jours, f: joursCell },
  { k: 'date', h: 'Réservé le', v: a => (a.date ? a.date.getTime() : null), f: dateCell, m: 1, csv: a => (a.date ? fd(a.date) + (a.estimee ? ' (estimée)' : '') : '') },
  ...(avecBM ? [{ k: 'bm', h: 'Réservé par', v: a => a.bm }] : []),
  { k: 'titre', h: 'Libellé', v: a => a.titre, f: a => `${esc(a.titre)}<div class="ref">${esc(a.ref)}</div>`, csv: a => `${a.titre} — ${a.ref}` },
  { k: 's', h: 'Statut', v: a => STATUTS[a.s].lib, f: stCell, m: 1 },
];
const C_RANK = [
  { k: 'bm', h: 'Réserveur', v: r => r.bm },
  { k: 'wait', h: 'En cours', num: 1, v: r => r.wait },
  { k: 'total', h: 'Total', num: 1, v: r => r.total },
  { k: 'traites', h: 'Réponses soumises', num: 1, v: r => r.traites, m: 1 },
  { k: 'avg', h: 'Attente moy.', num: 1, v: r => r.avg, f: r => (r.avg === null ? '<span class="muted">—</span>' : r.avg + ' j'), m: 1 },
  { k: 'oldj', h: 'Plus ancien', num: 1, v: r => r.oldj, f: r => (r.oldj === null ? '<span class="muted">—</span>' : r.oldj + ' j') },
];
const C_FREE = [
  { k: 'jours', h: 'Jours depuis sortie', num: 1, v: a => a.jours, f: a => a.jours + ' j' },
  { k: 'date', h: 'Sorti le', v: a => a.date.getTime(), f: a => fd(a.date), m: 1, csv: a => fd(a.date) },
  { k: 'titre', h: 'Libellé', v: a => a.titre, f: a => `${esc(a.titre)}<div class="ref">${esc(a.ref)}</div>`, csv: a => `${a.titre} — ${a.ref}` },
  { k: 'debut', h: 'Début mission', v: a => a.debut, f: a => (a.debut ? fd(a.debut) : '—'), m: 1, csv: a => (a.debut ? fd(a.debut) : '') },
];

// ---------------------------------------------------------------- vues
function ouvrirPersonne(p) { S.person = p; aller('person'); }
function aller(v) { S.vue = v; $('#panelEquipe').classList.add('hidden'); render(); scrollTo(0, 0); }

function render(garderPanel = false) {
  if (!S.calc) return;
  if (!garderPanel) $('#panelEquipe').classList.add('hidden');
  $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + S.vue));
  const dernier = [...S.donnees.imports].sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
  $('#maj').textContent = (dernier ? `Dernier import le ${fdh(dernier.le)}` : 'Aucun import pour l’instant')
    + ` · ${pluriel(S.donnees.ao.length, 'AO', 'AO')} · ${S.store.mode === 'local' ? 'mode local (ce navigateur uniquement)' : 'données partagées'}`;
  $('#bEquipe').textContent = `Équipe : ${libelleEquipe()} ▾`;
  const bar = $('#equipeBar');
  bar.classList.toggle('hidden', !S.sel.size);
  bar.innerHTML = S.sel.size ? `Affiché pour : ${[...S.sel].map(n => `<span class="chip">${esc(n)}<button data-ret="${esc(n)}" title="Retirer">×</button></span>`).join('')} <button class="more" id="bTous">Voir tout le monde</button>` : '';
  bar.querySelectorAll('[data-ret]').forEach(b => b.onclick = () => { const s = new Set(S.sel); s.delete(b.dataset.ret); appliquerSelection([...s]); render(); });
  if (S.sel.size) $('#bTous').onclick = () => { appliquerSelection([]); render(); };
  renderAlertes();
  renderHome();

  if (S.vue === 'list') {
    let L = reservations().filter(a => a.s === 'A');
    if (S.liste === 'late') L = L.filter(a => a.jours !== null && a.jours > S.seuil);
    $('#listTitle').textContent = S.liste === 'late' ? `Non traités depuis plus de ${S.seuil} jours` : 'AO réservés non traités';
    $('#listCount').textContent = pluriel(table('#tList', 'list', C_AO(true), L, a => ouvrirAO(a.ref)).length, 'AO', 'AO');
  }
  if (S.vue === 'free') {
    $('#freeTitle').textContent = `AO en cours non réservés depuis plus de ${S.seuilF} jours`;
    $('#freeCount').textContent = pluriel(table('#tFreeL', 'free', C_FREE, libres().filter(a => a.jours > S.seuilF), null).length, 'AO', 'AO');
  }
  if (S.vue === 'rank') table('#tRank', 'rank', C_RANK, rankData(reservations()), r => ouvrirPersonne(r.bm));
  if (S.vue === 'person') {
    const all = S.calc.reservations.filter(a => a.bm === S.person && dansPeriode(a.date)), W = all.filter(a => a.s === 'A'), d = W.filter(a => a.jours !== null);
    $('#pName').textContent = S.person;
    $('#pWait').textContent = W.length;
    $('#pAvg').textContent = d.length ? Math.round(d.reduce((s, a) => s + a.jours, 0) / d.length) + ' j' : '—';
    const o = d.reduce((m, a) => (!m || a.jours > m.jours ? a : m), null);
    $('#pOld').textContent = o ? o.jours + ' j' : '—'; $('#pOldRef').textContent = o ? o.ref : '';
    $('#cOnlyWait').setAttribute('aria-pressed', S.only);
    const n = table('#tPerson', 'person', C_AO(false), S.only ? W : all, a => ouvrirAO(a.ref)).length;
    $('#pCount').textContent = `${pluriel(n, 'AO', 'AO')}${S.only ? '' : ` · ${all.filter(a => a.s === 'T').length} avec réponse soumise`}`;
  }
  if (S.vue === 'import') renderImport();
  if (S.vue === 'reglages') renderReglages();
  $('#foot').innerHTML = `Règles : périmètre PWise et OneProcTool. L’AO revient au dernier BM qui l’a revendiqué (« c’est chez moi ») ; sans revendication, au premier positionné ; un BM qui cède la main est retiré ; une correction manuelle prime.
    « Non traité » = AO en cours sur PWise sans réponse INTM soumise ; au-delà de ${REGLES.closAutoJours} jours après la réservation, il est compté clos. OneProcTool n’a pas de statut de réponse : ses AO comptent dans les réservations, pas dans les non traités.
    Date de réservation = date du mail PWise / OneProcTool cité dans la réponse ; à défaut, date de sortie de l’AO (« estimée »).`;
}

function renderAlertes() {
  const el = $('#alertes'), parts = [];
  if (S.message) parts.push(`<div class="banner ${S.message.type || ''}">${esc(S.message.texte)} <button class="more" id="bFerme">Fermer</button></div>`);
  const nr = S.calc.nonResolus.length;
  if (nr && S.vue === 'home') parts.push(`<div class="banner warn">${pluriel(nr, 'réponse désigne', 'réponses désignent')} un BM non reconnu (surnom, trigramme). <button class="more" data-alerte-annuaire>Les rattacher dans l’annuaire</button></div>`);
  if (!S.donnees.ao.length && !S.donnees.messages.length && S.vue === 'home') parts.push('<div class="banner">Aucune donnée : commence par <button class="more" data-go="import">importer les mails et l’extraction PWise</button>.</div>');
  el.innerHTML = parts.join('');
  el.querySelector('#bFerme')?.addEventListener('click', () => { S.message = null; render(); });
  el.querySelector('[data-alerte-annuaire]')?.addEventListener('click', () => { S.tab = 'annuaire'; aller('reglages'); });
  el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => aller(b.dataset.go));
}

// ---------------------------------------------------------------- fiche AO : échanges et correction
function ouvrirAO(ref) {
  const r = S.calc.reservations.find(x => x.ref === ref);
  const fiche = S.donnees.ao.find(a => a.ref === ref) || {};
  const corr = S.donnees.corrections.find(c => c.ref === ref);
  const msgs = S.donnees.messages.filter(m => m.ref === ref).sort((a, b) => String(a.date || '9').localeCompare(String(b.date || '9')));
  const dlg = $('#dlg');
  dlg.innerHTML = `
    <div class="bar-top"><h2 style="font-size:16px">${esc(fiche.titre || r?.titre || ref)}</h2><span class="spacer"></span><button class="btn" id="dClose">Fermer</button></div>
    <div class="sub">${esc(ref)} · ${esc(fiche.statut_pwise || (r?.plateforme === 'OneProcTool' ? 'OneProcTool' : 'statut inconnu'))}${fiche.organisation ? ' · ' + esc(fiche.organisation) : ''}</div>
    <p>Attribué à <b>${esc(r?.bm || 'personne')}</b>${r ? ` <span class="tag">${{ revendication: 'dernière revendication', positionnement: 'premier positionné', correction: 'correction manuelle' }[r.via]}</span>` : ''}</p>
    <h3 style="font-size:13px;color:var(--ink-2)">Échanges (${msgs.length})</h3>
    <ul class="fil">${msgs.map(m => { const c = classer(m.texte, m.auteur); return `<li><b>${esc(m.auteur)}</b> <span class="tag">${esc(c.pour ? `désigne « ${c.pour} »` : c.type)}</span><div class="t">${m.date ? fdh(m.date) : 'date inconnue'}</div>${esc(m.texte || '(réponse vide)')}</li>`; }).join('') || '<li class="muted">Aucun mail.</li>'}</ul>
    <h3 style="font-size:13px;color:var(--ink-2)">Corriger l’attribution</h3>
    <div class="row">
      <select id="dBM" style="flex:1">
        <option value="__auto">Calcul automatique</option>
        ${S.calc.annuaire.noms.map(n => `<option ${corr?.bm === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}
        <option value="__exclu" ${corr && corr.bm === null ? 'selected' : ''}>Exclure cet AO du suivi</option>
      </select>
    </div>
    <textarea id="dCom" rows="2" placeholder="Raison (facultatif)" style="width:100%;margin-top:8px">${esc(corr?.commentaire || '')}</textarea>
    <div class="row" style="margin-top:8px"><span class="spacer"></span><button class="btn primary" id="dSave">Enregistrer</button></div>`;
  dlg.querySelector('#dClose').onclick = () => dlg.close();
  dlg.querySelector('#dSave').onclick = async () => {
    const v = dlg.querySelector('#dBM').value, com = dlg.querySelector('#dCom').value.trim() || null;
    dlg.close();
    if (v === '__auto') { if (corr) await supprimer('corrections', ref, `Correction retirée sur ${ref}.`); }
    else await sauver('corrections', [{ ref, bm: v === '__exclu' ? null : v, commentaire: com, maj: new Date().toISOString() }], `Attribution de ${ref} corrigée.`);
  };
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
}

// ---------------------------------------------------------------- écriture
async function sauver(table, lignes, ok) {
  try { await S.store.enregistrer(table, lignes); S.message = { texte: ok }; await charger(); }
  catch (e) { S.message = { type: 'err', texte: `Enregistrement impossible : ${e.message}` }; render(); }
}
async function supprimer(table, cle, ok) {
  try { await S.store.supprimer(table, cle); S.message = { texte: ok }; await charger(); }
  catch (e) { S.message = { type: 'err', texte: `Suppression impossible : ${e.message}` }; render(); }
}

// ---------------------------------------------------------------- import
function renderImport() {
  for (const [k, id] of [['mails', '#dMails'], ['pwise', '#dPwise']]) {
    const f = S.fichiers[k]; $(id).classList.toggle('ok', !!f);
    $(id).querySelector('span').textContent = f ? `${f.name} · ${(f.size / 1024 / 1024).toFixed(1)} Mo` : (k === 'mails' ? 'Export du dossier des réponses aux AO' : 'Liste des AO et de leur statut');
  }
  $('#bAnalyser').disabled = !(S.fichiers.mails || S.fichiers.pwise);
  const el = $('#apercu'), p = S.prep;
  if (!p) { el.innerHTML = ''; return; }
  if (p.erreur) { el.innerHTML = `<div class="banner err">${esc(p.erreur)}</div>`; return; }
  const indic = c => { const L = c.reservations, W = L.filter(a => a.s === 'A'); return {
    'AO réservés': L.length, 'Non traités': W.length, [`En retard (> ${REGLES.seuilsRetard[0]} j)`]: W.filter(a => a.jours > REGLES.seuilsRetard[0]).length,
    'Non réservés en cours': c.libres.length, 'BM non reconnus': c.nonResolus.length }; };
  const av = indic(p.avant), ap = indic(p.apres);
  const m = p.stats.mails, w = p.stats.pwise;
  el.innerHTML = `
    ${p.avertissements.map(a => `<div class="banner warn">${esc(a)}</div>`).join('')}
    <div class="grid2">
      <div class="card"><h3>Mails</h3>${m ? `<div class="kv">
        <span>Mails lus</span><span class="n">${m.mails}</span><span></span>
        <span>Envoyés par INTM</span><span class="n">${m.intm}</span><span></span>
        <span>Réponses à un AO</span><span class="n">${m.messages}</span><span class="h">${m.sansDate} sans date citée</span>
        <span><b>Nouvelles</b></span><span class="n"><b>${m.nouveaux}</b></span><span class="h">${m.messages - m.nouveaux} déjà en base</span>
        <span>Sans référence d’AO</span><span class="n">${m.sansRef}</span><span class="h">ignorés</span>
        <span>Années précédentes</span><span class="n">${m.anciens}</span><span class="h">ignorés</span></div>` : '<span class="sub">Pas de fichier.</span>'}</div>
      <div class="card"><h3>PWise</h3>${w ? `<div class="kv">
        <span>AO dans l’extraction</span><span class="n">${w.ao}</span><span></span>
        <span>En cours</span><span class="n">${w.enCours}</span><span></span>
        <span>Sortis de l’extraction</span><span class="n">${w.disparus}</span><span class="h">passent en clos</span></div>
        <div class="sub" style="margin-top:8px">Champs reconnus : ${Object.entries(p.cles).map(([k, v]) => `${k} → ${v ? esc(v) : '<b>introuvable</b>'}`).join(' · ')}</div>` : '<span class="sub">Pas de fichier : les statuts restent ceux du dernier import.</span>'}</div>
    </div>
    <div class="card"><h3>Effet sur le tableau de bord</h3><div class="kv">
      <span class="h"></span><span class="h n">Avant</span><span class="h">Après</span>
      ${Object.keys(av).map(k => `<span>${k}</span><span class="n">${av[k]}</span><span>${ap[k]}${ap[k] !== av[k] ? ` <span class="${ap[k] > av[k] ? 'delta-up' : 'delta-down'}">(${ap[k] > av[k] ? '+' : ''}${ap[k] - av[k]})</span>` : ''}</span>`).join('')}
    </div></div>
    <div class="row"><span class="spacer"></span><button class="btn" id="bAnnuler">Annuler</button><button class="btn primary" id="bValider">Valider l’import</button></div>`;
  $('#bAnnuler').onclick = () => { S.prep = null; render(); };
  $('#bValider').onclick = async e => {
    e.target.disabled = true; e.target.textContent = 'Enregistrement…';
    try {
      await validerImport(S.store, p);
      S.message = { texte: `Import enregistré : ${pluriel(p.messagesNouveaux.length, 'nouvelle réponse', 'nouvelles réponses')}, ${pluriel(p.aoAEnregistrer.length, 'AO mis à jour', 'AO mis à jour')}.` };
      S.prep = null; S.fichiers = {}; $('#fMails').value = ''; $('#fPwise').value = '';
      S.vue = 'home'; await charger();
    } catch (err) { S.message = { type: 'err', texte: `Import interrompu : ${err.message}. Tu peux relancer : les données déjà écrites ne seront pas dupliquées.` }; render(); }
  };
}

// ---------------------------------------------------------------- réglages
function renderReglages() {
  $$('#tabsReglages [data-tab]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tab === S.tab));
  const el = $('#reglages');
  if (S.tab === 'equipes') {
    const e = S.editEquipe;
    el.innerHTML = `
      ${[...S.donnees.equipes].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')).map(q => `<div class="card"><div class="row"><b>${esc(q.nom)}</b><span class="sub">${pluriel(q.membres.length, 'BM', 'BM')}</span><span class="spacer"></span>
        <button class="btn" data-voir="${esc(q.nom)}">Afficher</button><button class="btn" data-modif="${esc(q.nom)}">Modifier</button><button class="btn danger" data-suppr="${esc(q.nom)}">Supprimer</button></div>
        <div class="sub" style="margin-top:6px">${q.membres.map(esc).join(' · ')}</div></div>`).join('') || '<p class="sub">Aucune équipe enregistrée.</p>'}
      <div class="card"><h3>${e ? `Modifier « ${esc(e.nom)} »` : 'Nouvelle équipe'}</h3>
        <input type="text" id="eqNom" placeholder="Nom de l’équipe" value="${esc(e?.nom || '')}" style="width:100%;margin-bottom:8px" ${e ? 'readonly' : ''}>
        <div class="checks">${tousLesBM().map(n => `<label><input type="checkbox" value="${esc(n)}" ${e?.membres.includes(n) ? 'checked' : ''}><span>${esc(n)}</span></label>`).join('')}</div>
        <div class="row" style="margin-top:10px"><span class="spacer"></span>${e ? '<button class="btn" id="eqAnnul">Annuler</button>' : ''}<button class="btn primary" id="eqSave">Enregistrer</button></div></div>`;
    el.querySelectorAll('[data-voir]').forEach(b => b.onclick = () => { appliquerEquipe(S.donnees.equipes.find(q => q.nom === b.dataset.voir), false); aller('home'); });
    el.querySelectorAll('[data-modif]').forEach(b => b.onclick = () => { S.editEquipe = S.donnees.equipes.find(q => q.nom === b.dataset.modif); render(); });
    el.querySelectorAll('[data-suppr]').forEach(b => b.onclick = () => { if (confirm(`Supprimer l’équipe « ${b.dataset.suppr} » ?`)) supprimer('equipes', b.dataset.suppr, 'Équipe supprimée.'); });
    el.querySelector('#eqAnnul')?.addEventListener('click', () => { S.editEquipe = null; render(); });
    el.querySelector('#eqSave').onclick = async () => {
      const nom = el.querySelector('#eqNom').value.trim(), membres = [...el.querySelectorAll('.checks input:checked')].map(c => c.value);
      if (!nom || !membres.length) { S.message = { type: 'warn', texte: 'Donne un nom et coche au moins un BM.' }; render(); return; }
      S.editEquipe = null;
      await sauver('equipes', [{ nom, membres, maj: new Date().toISOString() }], `Équipe « ${nom} » enregistrée.`);
    };
  }
  if (S.tab === 'annuaire') {
    const fiches = new Map(S.donnees.bm.map(b => [b.nom, b]));
    const nr = S.calc.nonResolus, jetons = [...new Map(nr.map(x => [x.bm, x])).values()];
    el.innerHTML = `
      ${jetons.length ? `<div class="card"><h3>Noms non reconnus dans les mails</h3>
        ${jetons.map(x => { const tok = x.bm.split(' ?')[0]; return `<div class="row" style="margin-bottom:6px"><span style="flex:1"><b>${esc(tok)}</b> <span class="sub">— ${esc(x.auteur)} sur ${esc(x.ref)} : « ${esc((x.texte || '').slice(0, 60))} »</span></span>
          <select data-tok="${esc(tok)}"><option value="">Rattacher à…</option>${tousLesBM().map(n => `<option>${esc(n)}</option>`).join('')}</select></div>`; }).join('')}</div>` : ''}
      <div class="card"><h3>Trigrammes et surnoms</h3><p class="sub">Le trigramme est déduit du nom ; ajoute les surnoms utilisés dans les mails, séparés par des virgules.</p>
        <table><thead><tr><th>BM</th><th>Trigramme</th><th>Surnoms</th><th></th></tr></thead><tbody>
        ${tousLesBM().map(n => { const f = fiches.get(n) || {}; return `<tr><td>${esc(n)}</td><td><input type="text" data-tri="${esc(n)}" value="${esc(f.trigramme || trigramme(n))}" style="width:70px"></td>
          <td><input type="text" data-ali="${esc(n)}" value="${esc((f.alias || []).join(', '))}" style="width:100%"></td><td><button class="btn" data-sv="${esc(n)}">OK</button></td></tr>`; }).join('')}
        </tbody></table></div>`;
    el.querySelectorAll('[data-tok]').forEach(s => s.onchange = () => {
      if (!s.value) return; const f = fiches.get(s.value) || { nom: s.value, alias: [] };
      sauver('bm', [{ nom: f.nom, trigramme: f.trigramme || null, alias: [...new Set([...(f.alias || []), s.dataset.tok.toLowerCase()])] }], `« ${s.dataset.tok} » rattaché à ${s.value}.`);
    });
    el.querySelectorAll('[data-sv]').forEach(b => b.onclick = () => {
      const n = b.dataset.sv, tri = el.querySelector(`[data-tri="${CSS.escape(n)}"]`).value.trim().toUpperCase();
      const alias = el.querySelector(`[data-ali="${CSS.escape(n)}"]`).value.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
      sauver('bm', [{ nom: n, trigramme: tri || null, alias }], `Fiche de ${n} enregistrée.`);
    });
  }
  if (S.tab === 'corrections') {
    const titre = ref => S.donnees.ao.find(a => a.ref === ref)?.titre || '';
    el.innerHTML = `<div class="tablebox"><table><thead><tr><th>AO</th><th>Attribué à</th><th class="hide-m">Raison</th><th class="hide-m">Par</th><th></th></tr></thead><tbody>
      ${S.donnees.corrections.map(c => `<tr><td>${esc(titre(c.ref))}<div class="ref">${esc(c.ref)}</div></td><td>${c.bm === null ? '<i>exclu du suivi</i>' : esc(c.bm)}</td><td class="hide-m">${esc(c.commentaire || '')}</td>
        <td class="hide-m">${esc(c.par || '')}<div class="ref">${fd(c.maj)}</div></td><td><button class="btn" data-voir="${esc(c.ref)}">Voir</button> <button class="btn danger" data-ret="${esc(c.ref)}">Retirer</button></td></tr>`).join('')
        || '<tr><td colspan="5" class="muted">Aucune correction. Pour en faire une, clique sur un AO dans une fiche BM.</td></tr>'}</tbody></table></div>`;
    el.querySelectorAll('[data-voir]').forEach(b => b.onclick = () => ouvrirAO(b.dataset.voir));
    el.querySelectorAll('[data-ret]').forEach(b => b.onclick = () => supprimer('corrections', b.dataset.ret, 'Correction retirée.'));
  }
  if (S.tab === 'imports') {
    el.innerHTML = `<div class="tablebox"><table><thead><tr><th>Date</th><th>Par</th><th>Fichiers</th><th class="num">Mails lus</th><th class="num">Nouvelles réponses</th><th class="num">AO PWise</th></tr></thead><tbody>
      ${[...S.donnees.imports].sort((a, b) => String(b.le).localeCompare(String(a.le))).map(i => `<tr><td>${fdh(i.le)}</td><td>${esc(i.par || '')}</td><td class="ref">${esc([i.fichier_mails, i.fichier_pwise].filter(Boolean).join(' + '))}</td>
        <td class="num">${i.nb_mails_lus ?? ''}</td><td class="num">${i.nb_nouveaux ?? ''}</td><td class="num">${i.nb_ao_pwise ?? ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Aucun import.</td></tr>'}</tbody></table></div>`;
  }
}

// ---------------------------------------------------------------- événements
function brancher() {
  const opts = REGLES.seuilsRetard.map(s => `<option>${s}</option>`).join('');
  $('#seuil').innerHTML = opts; $('#seuilF').innerHTML = opts;
  $('#seuil').onchange = e => { S.seuil = +e.target.value; render(); };
  $('#seuilF').onchange = e => { S.seuilF = +e.target.value; render(); };
  const pasSelect = e => !['SELECT', 'OPTION'].includes(e.target.tagName);
  $('#tWait').onclick = () => { S.liste = 'wait'; S.sort.list = ['jours', -1]; aller('list'); };
  $('#tLate').onclick = e => { if (pasSelect(e)) { S.liste = 'late'; S.sort.list = ['jours', -1]; aller('list'); } };
  $('#tFree').onclick = e => { if (pasSelect(e)) { S.sort.free = ['jours', -1]; aller('free'); } };
  $('#periode').onchange = e => { S.p = e.target.value; render(); };
  $('#cOnlyWait').onclick = () => { S.only = !S.only; render(); };
  $$('[data-go]').forEach(b => b.onclick = () => aller(b.dataset.go));
  $$('[data-rank]').forEach(b => b.onclick = () => { S.sort.rank = [b.dataset.rank, -1]; aller('rank'); });
  $$('#tabsReglages [data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; S.editEquipe = null; render(); });
  $('#bEquipe').onclick = e => { e.stopPropagation(); const p = $('#panelEquipe'); const ouvrir = p.classList.contains('hidden'); if (ouvrir) renderPanelEquipe(); p.classList.toggle('hidden', !ouvrir); };
  document.addEventListener('click', e => { const p = $('#panelEquipe'); if (!p.classList.contains('hidden') && !p.contains(e.target) && e.target !== $('#bEquipe')) p.classList.add('hidden'); });
  $('#theme').onclick = () => { const r = document.documentElement; const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; r.dataset.theme = dark ? 'light' : 'dark'; mem.set('theme', r.dataset.theme); };
  const th = mem.get('theme', null); if (th) document.documentElement.dataset.theme = th;

  $('#fMails').onchange = e => { S.fichiers.mails = e.target.files[0]; S.prep = null; render(); };
  $('#fPwise').onchange = e => { S.fichiers.pwise = e.target.files[0]; S.prep = null; render(); };
  for (const [zone, k] of [['#dMails', 'mails'], ['#dPwise', 'pwise']]) {
    $(zone).addEventListener('dragover', e => e.preventDefault());
    $(zone).addEventListener('drop', e => { e.preventDefault(); S.fichiers[k] = e.dataTransfer.files[0]; S.prep = null; render(); });
  }
  $('#bAnalyser').onclick = async e => {
    e.target.disabled = true; e.target.textContent = 'Analyse…';
    try { S.prep = await preparerImport(S.fichiers, S.donnees); }
    catch (err) { S.prep = { erreur: err.message }; }
    e.target.textContent = 'Analyser'; render();
  };

  $$('[data-csv]').forEach(b => b.onclick = () => {
    const t = LAST[b.dataset.csv]; if (!t) return;
    const val = (c, r) => (c.csv ? c.csv(r) : c.k === 's' ? STATUTS[r.s].lib : c.v(r) ?? '');
    const csv = [t.cols.map(c => c.h)].concat(t.rows.map(r => t.cols.map(c => val(c, r))))
      .map(l => l.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = `reservations_ao_${b.dataset.csv}${b.dataset.csv === 'person' ? '_' + S.person.split(' ')[0] : ''}.csv`;
    a.click();
  });
}

// ---------------------------------------------------------------- démarrage
async function demarrer() {
  S.store = await ouvrirStore();
  const montrer = async user => {
    S.user = user;
    $('#v-login').classList.toggle('hidden', !!user);
    $('#app').classList.toggle('hidden', !user);
    if (user) await charger();
  };
  $('#fLogin').onsubmit = async e => {
    e.preventDefault();
    const email = $('#email').value.trim();
    if (!/@intm\.(fr|com)$/i.test(email)) { $('#loginMsg').textContent = 'Utilise ton adresse @intm.fr.'; return; }
    try { await S.store.connexion(email); $('#loginMsg').textContent = `Lien envoyé à ${email}. Ouvre-le depuis ta boîte mail, sur cet appareil.`; }
    catch (err) { $('#loginMsg').textContent = `Envoi impossible : ${err.message}`; }
  };
  S.store.surChangementSession(u => { if (!!u !== !!S.user) montrer(u); });
  brancher();
  await montrer(await S.store.utilisateur());
}
demarrer();

export { S, render, charger };   // pour les tests
