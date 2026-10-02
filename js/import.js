// Prépare un import (CSV des mails et/ou JSON PWise) : rien n'est écrit tant que l'utilisateur n'a pas validé l'aperçu.
import { decoder, lireMails } from './import-mails.js';
import { lirePWise } from './import-pwise.js';
import { calculer } from './calcul.js';

const lireFichier = f => (f.arrayBuffer ? f.arrayBuffer().then(decoder) : Promise.resolve(f.texte));

/**
 * @param {{mails?:File, pwise?:File}} fichiers
 * @param {object} existant données actuelles ({ao, messages, corrections, bm})
 */
export async function preparerImport(fichiers, existant) {
  const res = { aoAEnregistrer: [], messagesNouveaux: [], stats: {}, avertissements: [], journal: {} };
  const catalogue = new Map(existant.ao.map(a => [a.ref, a]));
  const idsConnus = new Set(existant.messages.map(m => m.id));

  // ---- PWise : remplace l'état de tous les AO PWise
  if (fichiers.pwise) {
    const p = lirePWise(await lireFichier(fichiers.pwise));
    res.stats.pwise = p.stats;
    res.cles = p.cles;
    const vus = new Set(p.ao.map(a => a.ref));
    for (const a of p.ao) res.aoAEnregistrer.push({ ...(catalogue.get(a.ref) || {}), ...a, maj: new Date().toISOString() });
    for (const a of existant.ao) {
      if (a.plateforme === 'PWise' && a.vu_dernier_export && !vus.has(a.ref)) res.aoAEnregistrer.push({ ...a, vu_dernier_export: false, en_cours: false });
    }
    res.stats.pwise.disparus = res.aoAEnregistrer.filter(a => a.vu_dernier_export === false).length;
    if (!p.cles.statut) res.avertissements.push('Statut des AO introuvable dans le JSON : les « non traités » ne pourront pas être calculés.');
    if (!p.cles.publication) res.avertissements.push('Date de publication introuvable dans le JSON : la tuile « non réservés » restera vide.');
    res.journal.fichier_pwise = fichiers.pwise.name;
    res.journal.nb_ao_pwise = p.ao.length;
  }

  // ---- Mails : ajoute les réponses qui ne sont pas déjà en base
  if (fichiers.mails) {
    const m = await lireMails(await lireFichier(fichiers.mails));
    res.stats.mails = m.stats;
    res.messagesNouveaux = m.messages.filter(x => !idsConnus.has(x.id));
    res.stats.mails.nouveaux = res.messagesNouveaux.length;
    const prevus = new Set(res.aoAEnregistrer.map(a => a.ref));
    for (const x of res.messagesNouveaux) {
      if (catalogue.has(x.ref) || prevus.has(x.ref)) continue;
      prevus.add(x.ref);
      res.aoAEnregistrer.push({ ref: x.ref, plateforme: x.ref.startsWith('BPM') ? 'OneProcTool' : 'PWise', titre: m.titres.get(x.ref) || null, vu_dernier_export: false, en_cours: false });
    }
    if (m.stats.sansDate > m.stats.messages / 2) res.avertissements.push(`${m.stats.sansDate} réponses sans date citée : vérifie que l'export contient bien le corps des mails.`);
    res.journal.fichier_mails = fichiers.mails.name;
    res.journal.nb_mails_lus = m.stats.mails;
    res.journal.nb_messages = m.stats.messages;
    res.journal.nb_nouveaux = res.messagesNouveaux.length;
  }

  // ---- Aperçu : le tableau de bord tel qu'il sera après validation
  const apres = fusion(existant, res);
  res.avant = calculer(existant);
  res.apres = calculer(apres);
  return res;
}

export function fusion(existant, res) {
  const ao = new Map(existant.ao.map(a => [a.ref, a]));
  for (const a of res.aoAEnregistrer) ao.set(a.ref, { ...(ao.get(a.ref) || {}), ...a });
  return { ...existant, ao: [...ao.values()], messages: existant.messages.concat(res.messagesNouveaux) };
}

export async function validerImport(store, res) {
  if (res.aoAEnregistrer.length) await store.enregistrer('ao', res.aoAEnregistrer);
  if (res.messagesNouveaux.length) {
    const j = await store.journaliser({ ...res.journal, date_extraction: new Date().toISOString().slice(0, 10) });
    await store.enregistrer('messages', res.messagesNouveaux.map(m => ({ ...m, import_id: j?.id ?? null })));
  } else if (Object.keys(res.journal).length) {
    await store.journaliser({ ...res.journal, date_extraction: new Date().toISOString().slice(0, 10) });
  }
}
