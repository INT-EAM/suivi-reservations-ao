// Extraction PWise — source lisible du favori (bookmarklet).
// Génère pwise_sync_AAAA-MM-JJ.json pour INTM AO Manager et pour le Suivi des réservations d'AO.
//
// Phase 1 (inchangée) : parcourt les pages de la liste des demandes et lit chaque AO.
// Phase 2 (nouvelle)  : pour chaque AO, ouvre en arrière-plan sa page de détail
//   (…/clb/request_for_candidates_manage_extranet/<n°>) sans quitter la liste,
//   et lit le bloc « Profils » : nombre de profils proposés et codes PROP….
//   Ajoute à chaque AO : nbProfils, profilsSoumis, profils, statutDetail, detailLu.
//
// Pour produire le favori : `node outils/build-bookmarklet.mjs` puis copier outils/pwise-bookmarklet.txt
// dans l'URL d'un favori Chrome / Edge.
(async function PWiseExtract() {
  const TABLE_ID = 'body_x_dcc_dccRFC_dccRFC';
  const MAX_PAGES = 80;
  const LIRE_PROFILS = true;          // phase 2
  const PARALLELE = 3;                // pages de détail chargées en même temps (rester raisonnable)
  const PAUSE = 250;                  // ms entre deux lots
  const NOISE = ['Prestation', 'Dates de mission', "Nombre d'UO", 'TJM', 'Code', "Demande d'achats", 'Organisation', 'Département', 'Date limite de réponses', 'Statut'];
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const today = () => new Date().toISOString().slice(0, 10);

  // ---------------------------------------------------------------- fenêtre de suivi
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;background:#0f172a;color:#e2e8f0;padding:18px 22px;border-radius:12px;font-family:system-ui;font-size:13px;min-width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.4);border:1px solid #334155';
  ov.innerHTML = '<div style="font-weight:700;font-size:15px;margin-bottom:10px">🚀 INTM — Extraction PWise</div><div id="bms">Initialisation...</div>'
    + '<div id="bmp" style="margin-top:10px;background:#1e293b;border-radius:6px;height:8px"><div id="bmb" style="height:100%;background:#00915a;border-radius:6px;width:0;transition:width 0.3s"></div></div>'
    + '<div id="bmd" style="margin-top:8px;font-size:11px;color:#94a3b8"></div>'
    + '<button id="bmc" style="margin-top:12px;padding:5px 14px;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">✕ Annuler</button>';
  document.body.appendChild(ov);
  let cancelled = false;
  document.getElementById('bmc').onclick = () => { cancelled = true; };
  const ss = (m, d = '') => { document.getElementById('bms').textContent = m; if (d) document.getElementById('bmd').textContent = d; };
  const sp = p => { document.getElementById('bmb').style.width = p + '%'; };

  // ---------------------------------------------------------------- phase 1 : liste
  function parseAOs(raw) {
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const aos = []; let i = 0;
    while (i < lines.length) {
      if (lines[i] === 'btnMasterDetail' && i + 1 < lines.length && /^RFC\d+/.test(lines[i + 1])) {
        const rfc = lines[i + 1], intitule = lines[i + 2] || '';
        let tm = '', org = '', dept = '', statutPwise = '', j = i + 3;
        while (j < lines.length && lines[j] !== 'btnMasterDetail') {
          if (/^TM\d+/.test(lines[j])) tm = lines[j];
          else if (/^L6T?_/.test(lines[j])) org = lines[j].replace(/^L6T?_/, '');
          else if (lines[j].startsWith('L4_')) dept = lines[j].replace('L4_', '');
          else if (!NOISE.includes(lines[j]) && !lines[j].includes('Enregistrement') && !lines[j].includes('Modifier')) statutPwise = lines[j];
          j++;
        }
        let profil = '', modalite = '', dateDebut = '', dateFin = '', nbJours = 0;
        if (j < lines.length && lines[j] === 'btnMasterDetail' && (j + 1 >= lines.length || !/^RFC\d+/.test(lines[j + 1]))) {
          j++; if (j < lines.length) { profil = lines[j]; j++; }
          while (j < lines.length && lines[j] !== 'btnMasterDetail') {
            if (['Sur Site', 'Télétravail', 'Hybride'].includes(lines[j])) modalite = lines[j];
            const dm = lines[j].match(/^(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})$/);
            if (dm) { dateDebut = dm[1]; dateFin = dm[2]; }
            const nm = lines[j].match(/^(\d+)[,.](\d+)$/);
            if (nm) nbJours = parseInt(nm[1]);
            j++;
          }
        }
        if (!profil && intitule) profil = intitule;
        if (rfc) aos.push({ rfc, tm, intitule, org, dept, statutPwise, profil, modalite, dateDebut, dateFin, nbJours, isHistorique: true, bm: '', consultant: '', tjm: '', notes: '', dateOuverture: today(), dateCreation: today(), datePrise: '', dateReponse: '', dateQualif: '', dateDemarrage: '', dateCloture: '', dateDisparition: '', dernierImport: today(), statut: 'ouvert' });
        i = j;
      } else i++;
    }
    return aos;
  }
  async function expandAll() {
    const t = document.getElementById(TABLE_ID); if (!t) return;
    let btns = [...t.querySelectorAll("a[id*='masterDetail'],a[id*='MasterDetail']")];
    if (!btns.length) btns = [...t.querySelectorAll('a,button')].filter(el => (el.innerText || '').trim() === 'btnMasterDetail');
    if (!btns.length) btns = [...t.rows].slice(1).map(r => r.querySelector('a,button')).filter(Boolean);
    for (const b of btns) { try { b.click(); } catch (e) { /* ligne déjà ouverte */ } await delay(150); }
    await delay(1200);
  }
  function extractText() {
    const t = document.getElementById(TABLE_ID);
    return t ? [...t.rows].map(r => r.innerText.trim()).filter(Boolean).join('\n') : '';
  }
  // Lien vers la page de détail, quand la ligne en porte un.
  function liensDetail() {
    const t = document.getElementById(TABLE_ID), out = {};
    if (!t) return out;
    for (const a of t.querySelectorAll('a[href]')) {
      const m = a.getAttribute('href').match(/request_for_candidates_manage_extranet\/(\d+)/);
      const ref = (a.closest('tr')?.innerText.match(/RFC\d{8}/) || [])[0];
      if (m && ref) out[ref] = new URL(a.getAttribute('href'), location.href).href;
    }
    return out;
  }
  function goNext() {
    const b = [...document.querySelectorAll('a,button,span,input')].find(el => (el.innerText || el.value || '').trim() === 'Page suivante' && !el.disabled && !el.classList.contains('disabled'));
    if (b) { b.click(); return true; }
    return false;
  }

  // ---------------------------------------------------------------- phase 2 : page de détail
  const urlDetail = (rfc, liens) => liens[rfc] || `${location.origin}/page.aspx/fr/clb/request_for_candidates_manage_extranet/${parseInt(rfc.slice(3), 10)}`;

  // Valeur affichée sous un libellé (« Statut de l'offre » -> « RFC soumis »).
  function valeurSous(doc, libelle) {
    const el = [...doc.querySelectorAll('label,span,div,td,th,dt,b,strong')].find(e => e.children.length === 0 && libelle.test(e.textContent.trim()));
    if (!el) return '';
    for (const c of [el.nextElementSibling, el.parentElement?.nextElementSibling, el.parentElement?.parentElement?.nextElementSibling]) {
      const v = (c?.textContent || '').replace(/\s+/g, ' ').trim();
      if (v && !libelle.test(v)) return v;
    }
    return '';
  }

  // Texte d'un élément, avec un espace entre chaque morceau (textContent colle « PROP…2 » et « 2 Enregistrement »).
  function texte(el) {
    const w = (el.ownerDocument || el).createTreeWalker(el, 4), out = [];
    for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n.nodeValue);
    return out.join(' ').replace(/\s+/g, ' ');
  }

  // Lit le bloc « Profils » : nombre d'enregistrements et codes PROP….
  function lireDetail(doc, rfc) {
    const tout = doc.body ? doc.body.textContent : '';
    if (!/R[ée]f[ée]rence du RFC/.test(tout)) return { erreur: /mot de passe|password|login|connexion/i.test(tout) ? 'session' : 'page' };
    if (!tout.includes(rfc)) return { erreur: 'ref' };
    const statutDetail = valeurSous(doc, /^Statut de l.offre$/);
    const titres = [...doc.querySelectorAll('*')].filter(e => e.children.length <= 2 && e.textContent.trim() === 'Profils');
    for (const t of titres) {
      let c = t;
      for (let k = 0; k < 12 && c; k++) {
        c = c.parentElement; if (!c) break;
        let tc = texte(c);
        if (/Informations de la demande/.test(tc)) break;
        tc = tc.slice(tc.indexOf('Profils'));              // ignore le tableau Prestation placé avant
        const m = tc.match(/(\d+)\s*Enregistrement/);
        if (m) {
          const profils = [...new Set(tc.match(/PROP\d{5,}/g) || [])];
          const nb = Math.max(parseInt(m[1], 10), profils.length);
          return { statutDetail, nbProfils: nb, profilsSoumis: nb > 0, profils };
        }
      }
    }
    return { statutDetail, erreur: 'profils' };
  }

  // 1) téléchargement direct de la page (rapide) ; 2) si le bloc est construit par script, iframe cachée.
  async function parFetch(url, rfc) {
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) return { erreur: 'http ' + r.status };
    return lireDetail(new DOMParser().parseFromString(await r.text(), 'text/html'), rfc);
  }
  function parIframe(url, rfc) {
    return new Promise(resolve => {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:-9999px;top:0;width:1200px;height:900px;visibility:hidden';
      let fini = false;
      const fin = v => { if (fini) return; fini = true; f.remove(); resolve(v); };
      f.onload = async () => {
        for (let k = 0; k < 20; k++) {                     // jusqu'à 10 s pour que le bloc apparaisse
          await delay(500);
          try { const v = lireDetail(f.contentDocument, rfc); if (!v.erreur || v.erreur === 'session') return fin(v); } catch (e) { return fin({ erreur: 'iframe' }); }
        }
        fin({ erreur: 'profils' });
      };
      setTimeout(() => fin({ erreur: 'délai' }), 20000);
      f.src = url;
      document.body.appendChild(f);
    });
  }
  let modeIframe = false;
  async function detail(ao, liens) {
    const url = urlDetail(ao.rfc, liens);
    if (!modeIframe) {
      const v = await parFetch(url, ao.rfc).catch(e => ({ erreur: e.message }));
      if (v.erreur !== 'profils') return v;
      modeIframe = true;                                  // le bloc n'est pas dans le HTML : on passe en iframe
    }
    return parIframe(url, ao.rfc);
  }

  // ---------------------------------------------------------------- exécution
  const allAOs = {}, liens = {};
  let page = 1, lastText = '';
  try {
    while (page <= MAX_PAGES && !cancelled) {
      ss('📄 Page ' + page + ' — lecture de la liste...');
      sp(Math.min(50, Math.round(page / MAX_PAGES * 50)));
      await delay(page === 1 ? 1000 : 3000);
      const text = extractText();
      if (!text) { ss('⚠️ Table introuvable'); break; }
      if (text === lastText) { ss('🏁 Dernière page'); break; }
      lastText = text;
      await expandAll();
      parseAOs('=== PAGE ' + page + ' ===\n' + extractText()).forEach(a => { allAOs[a.rfc] = a; });
      Object.assign(liens, liensDetail());
      ss('📄 Page ' + page, Object.keys(allAOs).length + ' AO lus');
      if (!goNext()) break;
      page++;
    }

    const aos = Object.values(allAOs);
    let lus = 0, avec = 0, erreurs = 0;
    if (LIRE_PROFILS && !cancelled) {
      for (let i = 0; i < aos.length && !cancelled; i += (modeIframe ? 1 : PARALLELE)) {
        const lot = aos.slice(i, i + (modeIframe ? 1 : PARALLELE));
        const res = await Promise.all(lot.map(a => detail(a, liens)));
        res.forEach((v, k) => {
          const a = lot[k];
          if (v.erreur) { a.detailLu = false; a.detailErreur = v.erreur; erreurs++; }
          else { Object.assign(a, v, { detailLu: true }); lus++; if (v.profilsSoumis) avec++; }
        });
        if (res.some(v => v.erreur === 'session')) { ss('⚠️ Session PWise expirée', 'Reconnecte-toi puis relance : la liste déjà lue sera enregistrée.'); break; }
        sp(50 + Math.round((i + lot.length) / aos.length * 50));
        ss('🔎 Profils proposés : ' + (i + lot.length) + '/' + aos.length + (modeIframe ? ' (mode lent)' : ''), avec + ' AO avec profil · ' + erreurs + ' non lus');
        await delay(PAUSE);
      }
    }

    const data = { version: 3, extractDate: new Date().toISOString(), source: 'PWise', totalPages: page, profilsLus: LIRE_PROFILS, aos };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'pwise_sync_' + today() + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    sp(100);
    ss('✅ Terminé ! ' + aos.length + ' AO', (LIRE_PROFILS ? avec + ' avec au moins un profil proposé · ' + erreurs + ' pages non lues · ' : '') + 'fichier téléchargé');
    document.getElementById('bmc').textContent = '✕ Fermer';
    document.getElementById('bmc').style.background = '#475569';
    document.getElementById('bmc').onclick = () => ov.remove();
  } catch (err) {
    ss('❌ Erreur : ' + err.message); console.error(err);
  }
})();
