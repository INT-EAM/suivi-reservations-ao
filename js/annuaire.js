// Annuaire des BM : retrouve un BM à partir d'un prénom, d'un trigramme ou d'un alias.
import { norm, classer } from './classify.js';
import { TYPES } from './regles.js';

// « Lou DE LA TOUR » -> LDLT ; « Alice MARTIN » -> AMA ; « Jean-Paul DURAND » -> JPDU
export function trigramme(nom) {
  const parts = nom.trim().split(/\s+/);
  const prenom = parts.shift() || '';
  const ip = prenom.split('-').map(p => p[0]).join('');
  if (!parts.length) return ip.toUpperCase();
  const nomFamille = parts.length > 1 ? parts.map(p => p[0]).join('') : parts[0].slice(0, 2);
  return (ip + nomFamille).toUpperCase();
}

/**
 * @param {string[]} noms   noms complets connus (auteurs des mails)
 * @param {Array<{nom:string, trigramme?:string, alias?:string[]}>} fiches  fiches enregistrées (prioritaires)
 */
export function creerAnnuaire(noms, fiches = []) {
  const index = new Map(), prenoms = new Map();
  const ajoute = (cle, nom) => { if (cle) index.set(norm(cle), nom); };
  const tous = new Set([...noms, ...fiches.map(f => f.nom)]);
  for (const nom of tous) {
    ajoute(nom, nom);
    ajoute(trigramme(nom), nom);
    const p = norm(nom.split(/\s+/)[0]);
    prenoms.set(p, prenoms.has(p) ? null : nom);    // prénom ambigu => null
  }
  for (const [p, nom] of prenoms) if (nom && !index.has(p)) index.set(p, nom);
  for (const f of fiches) {
    if (f.trigramme) ajoute(f.trigramme, f.nom);
    for (const a of f.alias || []) ajoute(a, f.nom);
  }
  return {
    resoudre: jeton => (jeton ? index.get(norm(jeton)) ?? null : null),
    noms: [...tous].sort((a, b) => a.localeCompare(b, 'fr')),
  };
}

/**
 * Transforme les messages bruts (auteur + texte) en messages effectifs pour l'attribution.
 * Un message « Bruno traite » d'un BM devient une prise de Bruno ; « erratum chez BDU » devient
 * une cession de l'auteur puis une prise de BDU. Un type corrigé à la main (m.typeManuel) prime.
 */
export function messagesEffectifs(bruts, annuaire) {
  const out = [];
  bruts.forEach((m, i) => {
    const base = { date: m.date || null, ref: m.ref, auteur: m.auteur, texte: m.texte, ordre: m.ordre ?? i, id: m.id };
    if (m.typeManuel) { out.push({ ...base, bm: m.bmManuel || m.auteur, type: m.typeManuel, manuel: true }); return; }
    const c = classer(m.texte, m.auteur);
    if (c.pour) {
      const cible = annuaire.resoudre(c.pour);
      const nomCible = cible || `${c.pour[0].toUpperCase()}${c.pour.slice(1)} ? (via ${m.auteur})`;
      if (nomCible === m.auteur) { out.push({ ...base, bm: m.auteur, type: TYPES.POSITIONNEMENT }); return; }
      if (c.erratum) out.push({ ...base, bm: m.auteur, type: TYPES.CESSION });
      out.push({ ...base, bm: nomCible, type: TYPES.POSITIONNEMENT, delegue: true, nonResolu: !cible });
      return;
    }
    out.push({ ...base, bm: m.auteur, type: c.type });
  });
  return out;
}
