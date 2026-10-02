// Lecture de l'export JSON PWise : un tableau d'AO (éventuellement enveloppé dans un objet).
// Les noms de champs sont repérés par motif, pour résister aux variations d'export.

// Trouve le premier tableau d'objets dans le JSON.
function tableauAO(json) {
  if (Array.isArray(json) && json.some(x => x && typeof x === 'object')) return json;
  if (json && typeof json === 'object') {
    for (const v of Object.values(json)) { const t = tableauAO(v); if (t) return t; }
  }
  return null;
}

// Aplatis un objet imbriqué : { a: { b: 1 } } -> { 'a.b': 1 }
function aplatir(o, pre = '', out = {}) {
  for (const [k, v] of Object.entries(o || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) aplatir(v, `${pre}${k}.`, out);
    else out[`${pre}${k}`] = v;
  }
  return out;
}

const CHAMPS = {
  ref: [/^(rfc|ref|reference|référence|numero|n°|id|code)$/i, /(rfc|r[ée]f[ée]rence)/i],
  titre: [/^(intitul[ée]|titre|title|libell[ée]|name|nom|objet)$/i, /(intitul|titre|libell)/i],
  organisation: [/(organisation|direction|entit[ée]|d[ée]partement|perim|p[ée]rim[eè]tre|client)/i],
  statut: [/^(statut|status|[ée]tat)$/i, /(statut|status)/i],
  publication: [/(publi|cr[ée]ation|creat|ouverture|emission|[ée]mis|sortie)/i],
  debut: [/(d[ée]but|start|date de d)/i],
  soumis: [/(soumis|submitted|r[ée]ponse.*(fournisseur|intm))/i],
};
function choisirCles(exemples) {
  const cles = [...new Set(exemples.flatMap(o => Object.keys(o)))];
  const prendre = motifs => {
    for (const m of motifs) { const k = cles.find(c => m.test(c.split('.').pop())) || cles.find(c => m.test(c)); if (k) return k; }
    return null;
  };
  const choix = Object.fromEntries(Object.entries(CHAMPS).map(([nom, m]) => [nom, prendre(m)]));
  // La référence se reconnaît aussi à sa valeur (RFC + 8 chiffres).
  if (!choix.ref || !exemples.some(o => /^RFC\d{8}$/i.test(String(o[choix.ref] ?? '')))) {
    choix.ref = cles.find(c => exemples.filter(o => /^RFC\d{8}$/i.test(String(o[c] ?? ''))).length > exemples.length / 2) || choix.ref;
  }
  return choix;
}

// Date FR (31/12/2026 [12:00]) ou ISO -> ISO
export function dateISO(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return new Date(v > 1e12 ? v : v * 1000).toISOString();
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}${m[4] ? `T${m[4].padStart(2, '0')}:${m[5]}` : ''}`;
  m = s.match(/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2})?/);
  return m ? m[0].replace(' ', 'T') : null;
}

/**
 * @returns {{ ao:Array, cles:object, stats:object }}
 */
export function lirePWise(texteJSON) {
  let json;
  try { json = JSON.parse(texteJSON.replace(/^﻿/, '')); } catch (e) { throw new Error(`JSON PWise illisible : ${e.message}`); }
  const brut = tableauAO(json);
  if (!brut) throw new Error('Aucune liste d’AO trouvée dans le JSON PWise.');
  const lignes = brut.map(o => aplatir(o));
  const k = choisirCles(lignes.slice(0, 200));
  if (!k.ref) throw new Error(`Référence RFC introuvable dans le JSON (champs : ${Object.keys(lignes[0] || {}).slice(0, 10).join(', ')}…).`);
  const ao = [];
  for (const o of lignes) {
    const ref = String(o[k.ref] ?? '').trim().toUpperCase();
    if (!/^RFC\d{8}$/.test(ref)) continue;
    const statut = k.statut ? String(o[k.statut] ?? '').trim() : '';
    const soumis = k.soumis ? o[k.soumis] : undefined;
    ao.push({
      ref, plateforme: 'PWise',
      titre: k.titre ? String(o[k.titre] ?? '').trim() || null : null,
      organisation: k.organisation ? String(o[k.organisation] ?? '').trim() || null : null,
      statut_pwise: statut || null,
      reponse_soumise: typeof soumis === 'boolean' ? soumis : (/soumis|retenu$/i.test(statut) && !/non retenu/i.test(statut) ? true : null),
      date_publication: k.publication ? dateISO(o[k.publication]) : null,
      debut_mission: k.debut ? (dateISO(o[k.debut]) || '').slice(0, 10) || null : null,
      en_cours: /r[ée]ponse fournisseur en cours/i.test(statut),
      vu_dernier_export: true,
    });
  }
  return { ao, cles: k, stats: { lignes: lignes.length, ao: ao.length, enCours: ao.filter(a => a.en_cours).length } };
}
