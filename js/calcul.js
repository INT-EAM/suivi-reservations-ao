// Assemble les données stockées en lignes prêtes pour le tableau de bord.
import { REGLES } from './regles.js';
import { attribuer } from './attribution.js';
import { creerAnnuaire, messagesEffectifs } from './annuaire.js';

export const EN_COURS = 'Réponse fournisseur en cours';

// Statut d'une réservation : réponse prouvée (T), non traité (A), clos sans profil (N), clos incertain (C), OneProcTool sans résultat (U).
export function statutReservation(ao, plateforme) {
  // Réponse prouvée : statut PWise « soumis / retenu » ou mail de résultat (refus, acceptation) reçu.
  if (ao?.reponse_soumise === true) return 'T';
  if (plateforme === 'OneProcTool') return 'U';
  if (!ao || !ao.vu_dernier_export) return 'C';             // absent du dernier export : clos
  const s = (ao.statut_pwise || '').toLowerCase();
  if (/\bsoumis\b|^rfc retenu$/.test(s)) return 'T';
  if (s === EN_COURS.toLowerCase()) return 'A';
  // Page de détail lue et aucun profil proposé : on sait qu'INTM n'a pas répondu.
  return ao.reponse_soumise === false ? 'N' : 'C';
}

const plateformeDe = ref => (/^BPM/i.test(ref) ? 'OneProcTool' : 'PWise');
const jours = (d, auj) => (d ? Math.max(0, Math.round((auj - d) / 864e5)) : null);
const versDate = s => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`) : null);

/**
 * @param {object} donnees { ao:[], messages:[], corrections:[], bm:[] } tels que stockés
 * @param {Date} [aujourdhui]
 * @returns {{ reservations:[], libres:[], bms:string[], annuaire, nonResolus:[] }}
 */
export function calculer({ ao = [], messages = [], corrections = [], bm = [] }, aujourdhui = new Date()) {
  const auj = new Date(aujourdhui); auj.setHours(0, 0, 0, 0);
  const catalogue = new Map(ao.map(a => [a.ref, a]));
  const auteurs = [...new Set(messages.map(m => m.auteur))];
  const annuaire = creerAnnuaire(auteurs, bm);
  const corr = new Map(corrections.map(c => [c.ref, c]));

  const msgs = messages
    .filter(m => !m.date || new Date(m.date).getFullYear() >= REGLES.annee)
    .map((m, i) => ({ ...m, ordre: i }));
  const effectifs = messagesEffectifs(msgs, annuaire);
  const attrib = attribuer(effectifs, corr);

  const reservations = [];
  for (const [ref, a] of attrib) {
    const fiche = catalogue.get(ref);
    const plateforme = fiche?.plateforme || plateformeDe(ref);
    let date = versDate(a.date), estimee = false;
    if (!date && fiche?.date_publication) { date = versDate(fiche.date_publication); estimee = true; }
    let s = statutReservation(fiche, plateforme);
    const j = jours(date, auj);
    if (s === 'A' && j !== null && j > REGLES.closAutoJours) s = 'X';
    reservations.push({
      ref, plateforme, bm: a.bm, via: a.via, date, estimee, jours: j, s,
      titre: fiche?.titre || '(intitulé inconnu)', corrige: a.via === 'correction',
      // Offre INTM retenue : statut PWise « RFC retenu », ou mail d'acceptation (OneProcTool) / de résultats (PWise).
      retenu: /^rfc retenu$|^offre retenue$/i.test(fiche?.statut_pwise || ''),
    });
  }

  // AO en cours sur PWise, sans aucun BM positionné.
  const reserves = new Set(attrib.keys());
  const avecMessage = new Set(messages.map(m => m.ref));
  const libres = ao
    .filter(a => a.vu_dernier_export && (a.statut_pwise || '') === EN_COURS && !reserves.has(a.ref) && !avecMessage.has(a.ref))
    .map(a => {
      const date = versDate(a.date_publication);
      return { ref: a.ref, titre: a.titre || '', date, jours: jours(date, auj), debut: a.debut_mission || null };
    })
    .filter(a => a.date && a.jours <= REGLES.nonReservesMaxJours);

  const nonResolus = effectifs.filter(e => e.nonResolu).map(e => ({ ref: e.ref, bm: e.bm, auteur: e.auteur, texte: e.texte }));
  const bms = [...new Set(reservations.map(r => r.bm))].sort((x, y) => x.localeCompare(y, 'fr'));
  return { reservations, libres, bms, annuaire, nonResolus };
}

/** Restreint les réservations à une sélection de BM (vide = tout le monde). */
export const filtrerBM = (reservations, selection) =>
  (!selection || !selection.size ? reservations : reservations.filter(r => selection.has(r.bm)));
