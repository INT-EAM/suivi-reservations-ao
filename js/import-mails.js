// Lecture de l'export CSV Outlook (Fichier > Ouvrir et exporter > Importer/Exporter > Exporter vers un fichier > CSV).
// L'export ne contient pas la date d'envoi : on prend la date du mail cité (notification PWise / OneProcTool).
import { REGLES } from './regles.js';

// ---------------------------------------------------------------- décodage
export function decoder(buffer) {
  const octets = new Uint8Array(buffer);
  if (octets[0] === 0xff && octets[1] === 0xfe) return new TextDecoder('utf-16le').decode(octets);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(octets).replace(/^﻿/, ''); }
  catch { return new TextDecoder('windows-1252').decode(octets); }
}

// CSV avec champs entre guillemets sur plusieurs lignes ; séparateur détecté sur la 1re ligne.
export function lireCSV(texte) {
  const premiere = texte.slice(0, texte.indexOf('\n') + 1 || undefined);
  const sep = [',', ';', '\t'].map(s => [s, premiere.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const lignes = []; let champ = '', ligne = [], guill = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guill) {
      if (c === '"') { if (texte[i + 1] === '"') { champ += '"'; i++; } else guill = false; }
      else champ += c;
    } else if (c === '"') guill = true;
    else if (c === sep) { ligne.push(champ); champ = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++;
      ligne.push(champ); champ = '';
      if (ligne.length > 1 || ligne[0] !== '') lignes.push(ligne);
      ligne = [];
    } else champ += c;
  }
  if (champ !== '' || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  const entetes = lignes.shift() || [];
  return { entetes, lignes };
}

// Repère les colonnes utiles quelle que soit la langue d'Outlook.
function colonnes(entetes) {
  const trouve = (...motifs) => entetes.findIndex(h => motifs.some(m => m.test(h.trim())));
  return {
    objet: trouve(/^objet$/i, /^subject$/i),
    corps: trouve(/^corps$/i, /^body$/i, /^message$/i),
    nom: trouve(/^de\s*:\s*\(nom\)$/i, /^from:\s*\(name\)$/i, /^de$/i, /^from$/i),
    adresse: trouve(/^de\s*:\s*\(adresse\)$/i, /^from:\s*\(address\)$/i),
    typeAdr: trouve(/^de\s*:\s*\(type\)$/i, /^from:\s*\(type\)$/i),
    date: trouve(/^(date|envoy[ée]|reçu|received|sent)/i),
  };
}

// ---------------------------------------------------------------- dates
const MOIS = { janvier: 1, janv: 1, jan: 1, january: 1, fevrier: 2, fevr: 2, feb: 2, february: 2, mars: 3, march: 3, mar: 3,
  avril: 4, avr: 4, april: 4, apr: 4, mai: 5, may: 5, juin: 6, june: 6, jun: 6, juillet: 7, juil: 7, july: 7, jul: 7,
  aout: 8, august: 8, aug: 8, septembre: 9, sept: 9, sep: 9, september: 9, octobre: 10, oct: 10, october: 10,
  novembre: 11, nov: 11, november: 11, decembre: 12, dec: 12, december: 12 };
const sansAccent = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const p2 = n => String(n).padStart(2, '0');

/** Date du premier en-tête de mail cité (« Envoyé : mardi 29 septembre 2026 17:38 », « Le 6 févr. 2026 à 17:52 »…). */
export function dateCitee(corps) {
  const t = sansAccent(corps || '');
  let m = t.match(/(?:envoye|sent|date)\s*:\s*(?:\w+\.?,?\s+)?(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})\s+(?:a\s+)?(\d{1,2})[:h](\d{2})/)
       || t.match(/\ble\s+(?:\w+\s+)?(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})\s+a\s+(\d{1,2})[:h](\d{2})/);
  if (m && MOIS[m[2]]) return `${m[3]}-${p2(MOIS[m[2]])}-${p2(m[1])}T${p2(m[4])}:${m[5]}`;
  m = t.match(/(?:sent|date)\s*:\s*\w+,\s+([a-z]+)\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)?/);
  if (m && MOIS[m[1]]) {
    let h = +m[4]; if (m[6] === 'pm' && h < 12) h += 12; if (m[6] === 'am' && h === 12) h = 0;
    return `${m[3]}-${p2(MOIS[m[1]])}-${p2(m[2])}T${p2(h)}:${m[5]}`;
  }
  m = t.match(/(?:envoye|sent|date)\s*:\s*(?:\w+\s+)?(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (m) return `${m[3]}-${p2(m[2])}-${p2(m[1])}T${p2(m[4])}:${m[5]}`;
  return null;
}

/**
 * Heure de réception lue dans un lien Safelinks Outlook (« …%7C0%7C0%7C639264619346627530%7C… »,
 * horodatage .NET en dixièmes de microseconde depuis l'an 1), rendue en heure de Paris.
 * C'est la seule date fiable d'une notification PWise, l'export CSV n'ayant pas de colonne date.
 */
export function dateLien(corps) {
  const m = String(corps || '').match(/%7C0%7C0%7C(6\d{17})%7C/);
  if (!m) return null;
  const ms = Number((BigInt(m[1]) - 621355968000000000n) / 10000n);
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// ---------------------------------------------------------------- texte
// Partie écrite par l'auteur : tout ce qui précède le premier message cité.
// Partie brute écrite par l'auteur, avant le premier message cité.
export function partiePropre(corps) {
  const t = (corps || '').replace(/\r/g, '');
  const coupe = t.search(/^\s*(de|from)\s*:\s.+$|^-{3,}\s*(message d'origine|original message)|^_{10,}|^\s*le .{5,80} a [ée]crit\s*:|^\s*on .{5,80} wrote:|^\s*d[ée]but du message transf[ée]r[ée]/im);
  return coupe >= 0 ? t.slice(0, coupe) : t;
}
export function reponsePropre(corps) {
  return partiePropre(corps)
    .replace(/classification intm\s*:.*?confidentiel\s*\[.?\]/gis, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Références d'AO : « RFC00082603 », « BPM043741 », « N° RFx : 43741 » (OneProcTool),
// lien PWise « request_for_candidates_manage_extranet/82603 ».
export function refsDe(s) {
  const t = String(s || ''), out = [];
  for (const m of t.matchAll(/\b(RFC\d{8}|BPM\d{6})\b/gi)) out.push(m[1].toUpperCase());
  for (const m of t.matchAll(/N°\s*RFx\s*:\s*(\d{4,6})\b/gi)) out.push('BPM' + m[1].padStart(6, '0'));
  for (const m of t.matchAll(/request_for_candidates_manage_extranet(?:\/|%2F)(\d{4,8})\b/gi)) out.push('RFC' + m[1].padStart(8, '0'));
  return [...new Set(out)];
}
const estSysteme = (nom, adr) => /pwise|oneproc|no-?reply|ariba|bnp ?paribas|mailer|postmaster/i.test(`${nom} ${adr}`);
const estINTM = (adr, type) => /@intm\.(fr|com)\b/i.test(adr) || /^EX$/i.test(type || '') || /\/o=/i.test(adr || '');

// Empreinte stable d'un message, pour qu'un ré-import ne crée pas de doublon.
export async function empreinte(...parts) {
  const data = new TextEncoder().encode(parts.join('|'));
  const h = await crypto.subtle.digest('SHA-1', data);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

/**
 * Lit l'export et en tire les réponses des BM aux AO.
 * 1er passage : notifications PWise / OneProcTool (intitulés, date de sortie de chaque AO).
 * 2e passage : réponses des collaborateurs INTM.
 * @returns {Promise<{messages:Array, stats:object, titres:Map, publications:Map}>}
 */
export async function lireMails(texteCSV) {
  const { entetes, lignes } = lireCSV(texteCSV);
  const c = colonnes(entetes);
  if (c.objet < 0 || c.corps < 0 || c.nom < 0) {
    throw new Error(`Colonnes introuvables dans le CSV (trouvé : ${entetes.slice(0, 8).join(', ')}…). Attendu : Objet, Corps, De: (nom).`);
  }
  const stats = { mails: lignes.length, intm: 0, sansRef: 0, anciens: 0, messages: 0, sansDate: 0, parIntitule: 0 };
  const messages = [], titres = new Map(), publications = new Map(), offres = new Map(), vus = new Set();
  const champ = (l, k) => (c[k] >= 0 ? l[c[k]] || '' : '');

  // Un même BM peut apparaître sous plusieurs graphies (« Alice MARTIN », « Alice Martin ») : on garde la plus fréquente.
  const graphies = new Map();
  for (const l of lignes) {
    const n = champ(l, 'nom').trim(), k = sansAccent(n);
    if (!n) continue;
    const g = graphies.get(k) || new Map(); g.set(n, (g.get(n) || 0) + 1); graphies.set(k, g);
  }
  const canon = n => { const g = graphies.get(sansAccent(n)); return g ? [...g].sort((a, b) => b[1] - a[1])[0][0] : n; };

  // ---- 1er passage : notifications
  const systeme = l => estSysteme(champ(l, 'nom'), champ(l, 'adresse'));
  for (const l of lignes) {
    if (!systeme(l)) continue;
    const objet = champ(l, 'objet'), corps = champ(l, 'corps');
    const zone = `${objet}\n${corps.slice(0, 4000)}`;
    const refs = refsDe(zone);
    if (/nouvel appel d'offres|nouvelle consultation|dossier de consultation/i.test(zone)) {
      const quand = dateLien(corps);
      for (const r of refs) if (quand && (!publications.has(r) || quand < publications.get(r))) publications.set(r, quand);
    }
    // Résultat d'une offre INTM : la preuve qu'une réponse a été déposée (refusée ou retenue).
    const resultat = /offre a [ée]t[ée] (accept[ée]e|retenue)|soci[ée]t[ée] a [ée]t[ée] retenue|acceptation de l.offre|resultats rfc|résultats rfc/i.test(zone) ? 'retenue'
      : /offre a [ée]t[ée] rejet[ée]e|refus de l.offre/i.test(zone) ? 'refusee' : null;
    if (resultat) for (const r of refs) if (offres.get(r) !== 'retenue') offres.set(r, resultat);
    for (const r of refs) {
      if (titres.has(r)) continue;
      const num = r.slice(3).replace(/^0+/, '');
      const m = zone.match(new RegExp(`${r}\\W{1,12}([^\\r\\n]{3,150})`, 'i'))
             || (r.startsWith('BPM') && zone.match(/Nom RFx\s*:\s*([^\r\n]{3,150})/i) && zone.includes(num) ? zone.match(/Nom RFx\s*:\s*([^\r\n]{3,150})/i) : null);
      if (m) titres.set(r, m[1].replace(/^['"\s-]+/, '').trim());
    }
  }
  // Intitulé -> référence (quand l'intitulé est unique), pour les réponses qui ne citent pas de numéro.
  const cle = s => sansAccent(String(s || '')).replace(/[^a-z0-9]+/g, ' ').trim();
  const parTitre = new Map();
  for (const [r, t] of titres) { const k = cle(t); parTitre.set(k, parTitre.has(k) && parTitre.get(k) !== r ? null : r); }
  const connus = new Set([...titres.keys(), ...publications.keys()]);
  // Numéro seul dans l'objet (« 43683 je récupère ») : on garde la plateforme où il existe.
  const numeroSeul = objet => {
    const m = objet.match(/(?:^|\s)(\d{4,6})(?=\s|$)/);
    if (!m) return [];
    const bpm = 'BPM' + m[1].padStart(6, '0'), rfc = 'RFC' + m[1].padStart(8, '0');
    return connus.has(bpm) && !connus.has(rfc) ? [bpm] : connus.has(rfc) && !connus.has(bpm) ? [rfc] : [];
  };
  const parIntitule = objet => {
    const t = cle(objet.replace(/^((re|tr|fw|fwd|réf)\s*:\s*)+/i, '').replace(/\[[^\]]*\]/g, '').replace(/^.*dossier de consultation\s*/i, ''));
    const r = t.length > 8 ? parTitre.get(t) : null;
    return r ? [r] : [];
  };

  // ---- 2e passage : réponses INTM
  for (const l of lignes) {
    const nom = champ(l, 'nom').trim();
    if (!nom || systeme(l)) continue;
    if (!(estINTM(champ(l, 'adresse'), champ(l, 'typeAdr')) || c.adresse < 0)) continue;
    stats.intm++;
    const objet = champ(l, 'objet'), corps = champ(l, 'corps');
    const reponse = reponsePropre(corps);
    // Les références écrites dans la réponse priment sur celle de l'objet (« je traite RFC… et RFC… »).
    let refs = refsDe(reponse);
    if (!refs.length) refs = refsDe(objet);
    if (!refs.length) refs = refsDe(corps).slice(0, 1);
    if (!refs.length) refs = numeroSeul(objet);
    if (!refs.length) { refs = parIntitule(objet); if (refs.length) stats.parIntitule++; }
    if (!refs.length) { stats.sansRef++; continue; }
    // Date : celle du mail cité ; sinon l'heure de réception lue dans un lien de la réponse elle-même (signature, iPhone…).
    const date = dateCitee(corps) || dateLien(partiePropre(corps));
    const auteur = canon(nom);
    for (const ref of refs) {
      if (date && +date.slice(0, 4) < REGLES.annee) { stats.anciens++; continue; }
      if (!date && /^BPM/.test(ref) && +ref.slice(3) < REGLES.bpmPremierNumeroAnnee) { stats.anciens++; continue; }
      const id = await empreinte(ref, auteur, date || '', reponse.slice(0, 300));
      if (vus.has(id)) continue;
      vus.add(id);
      if (!date) stats.sansDate++;
      messages.push({ id, ref, date, auteur, texte: reponse.slice(0, 1000) });
    }
  }
  stats.messages = messages.length;
  stats.publications = publications.size;
  stats.offres = offres.size;
  return { messages, stats, titres, publications, offres };
}
