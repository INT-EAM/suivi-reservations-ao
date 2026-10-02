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

// ---------------------------------------------------------------- texte
// Partie écrite par l'auteur : tout ce qui précède le premier message cité.
export function reponsePropre(corps) {
  const t = (corps || '').replace(/\r/g, '');
  const coupe = t.search(/^\s*(de|from)\s*:\s.+$|^-{3,}\s*(message d'origine|original message)|^_{10,}|^\s*le .{5,80} a [ée]crit\s*:|^\s*on .{5,80} wrote:/im);
  return (coupe >= 0 ? t.slice(0, coupe) : t).replace(/\s+/g, ' ').trim();
}

const RE_REF = /\b(RFC\d{8}|BPM\d{6})\b/gi;
const refsDe = s => [...new Set((String(s || '').match(RE_REF) || []).map(r => r.toUpperCase()))];
const estSysteme = (nom, adr) => /pwise|oneproc|no-?reply|ariba|bnp ?paribas|mailer|postmaster/i.test(`${nom} ${adr}`);
const estINTM = (adr, type) => /@intm\.(fr|com)\b/i.test(adr) || /^EX$/i.test(type || '') || /\/o=/i.test(adr || '');

// Empreinte stable d'un message, pour qu'un ré-import ne crée pas de doublon.
export async function empreinte(...parts) {
  const data = new TextEncoder().encode(parts.join('|'));
  const h = await crypto.subtle.digest('SHA-1', data);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

/**
 * @returns {Promise<{messages:Array, stats:object, refsTitres:Map}>}
 */
export async function lireMails(texteCSV) {
  const { entetes, lignes } = lireCSV(texteCSV);
  const c = colonnes(entetes);
  if (c.objet < 0 || c.corps < 0 || c.nom < 0) {
    throw new Error(`Colonnes introuvables dans le CSV (trouvé : ${entetes.slice(0, 8).join(', ')}…). Attendu : Objet, Corps, De: (nom).`);
  }
  const stats = { mails: lignes.length, intm: 0, sansRef: 0, anciens: 0, messages: 0, sansDate: 0 };
  const messages = [], titres = new Map(), vus = new Set();
  for (const l of lignes) {
    const objet = l[c.objet] || '', corps = l[c.corps] || '', nom = (l[c.nom] || '').trim();
    const adr = c.adresse >= 0 ? l[c.adresse] || '' : '', type = c.typeAdr >= 0 ? l[c.typeAdr] : '';
    // Intitulés des AO lus dans les notifications, utiles pour les AO OneProcTool absents de PWise.
    if (estSysteme(nom, adr)) {
      const zone = `${objet}\n${corps.slice(0, 3000)}`;
      for (const r of refsDe(zone)) {
        if (titres.has(r)) continue;
        const m = zone.match(new RegExp(`${r}\\s*[-:–]\\s*([^\\r\\n]{3,150})`, 'i'));
        if (m) titres.set(r, m[1].trim());
      }
      continue;
    }
    if (!nom || !(estINTM(adr, type) || c.adresse < 0)) continue;
    stats.intm++;
    const reponse = reponsePropre(corps);
    const refs = [...new Set([...refsDe(objet), ...refsDe(reponse)])];
    if (!refs.length) refs.push(...refsDe(corps).slice(0, 1));
    if (!refs.length) { stats.sansRef++; continue; }
    const date = dateCitee(corps.slice(reponse.length ? corps.indexOf(reponse.slice(0, 20)) + reponse.length : 0)) || dateCitee(corps);
    for (const ref of refs) {
      if (date && +date.slice(0, 4) < REGLES.annee) { stats.anciens++; continue; }
      if (!date && /^BPM/.test(ref) && +ref.slice(3) < REGLES.bpmPremierNumeroAnnee) { stats.anciens++; continue; }
      const id = await empreinte(ref, nom, date || '', reponse.slice(0, 300));
      if (vus.has(id)) continue;
      vus.add(id);
      if (!date) stats.sansDate++;
      messages.push({ id, ref, date, auteur: nom, texte: reponse.slice(0, 1000) });
    }
  }
  stats.messages = messages.length;
  return { messages, stats, titres };
}
