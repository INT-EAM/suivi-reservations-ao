// Tests d'import sur fichiers fictifs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lireCSV, lireMails, dateCitee, reponsePropre, decoder } from '../js/import-mails.js';
import { lirePWise } from '../js/import-pwise.js';
import { preparerImport } from '../js/import.js';

const q = s => `"${String(s).replace(/"/g, '""')}"`;
const ligne = (objet, corps, nom, adr, type = 'SMTP') => [objet, corps, nom, adr, type].map(q).join(',');
const ENTETE = ['Objet', 'Corps', 'De: (nom)', 'De: (adresse)', 'De: (type)'].map(q).join(',');
const notif = (ref, quand) => `\r\nDe : BNP Paribas PWise <no-reply@info.pwise.bnpparibas.com>\r\nEnvoyé : ${quand}\r\nÀ : bnp_ariba\r\nObjet : [POUR ACTION] PWise: Nouvel appel d'offres disponible\r\n\r\nAppel d'offres : ${ref}\r\n`;

const CSV = [ENTETE,
  ligne('[POUR ACTION] PWise: Nouvel appel d\'offres disponible', 'Appel d\'offres : RFC00012345 - Développeur Java', 'BNP Paribas PWise', 'no-reply@info.pwise.bnpparibas.com'),
  ligne('RE: [POUR ACTION] PWise: Nouvel appel d\'offres disponible', 'Je traite\r\nAlice MARTIN\r\nMobile : 06 00 00 00 00' + notif('RFC00012345', 'jeudi 1 octobre 2026 12:07'), 'Alice MARTIN', 'alice.martin@intm.fr'),
  ligne('RE: RFC00012345', 'Hello Alice, c’est chez moi, je récupère' + notif('RFC00012345', 'jeudi 1 octobre 2026 12:07'), 'Bruno DUPONT', '/O=EXCHANGELABS/OU=EXCHANGE/CN=RECIPIENTS/CN=BRUNO', 'EX'),
  ligne('RE: BPM041000', 'Je traite', 'Alice MARTIN', 'alice.martin@intm.fr'),                         // OneProcTool ancien
  ligne('Point BNP', 'Pas de référence ici', 'Alice MARTIN', 'alice.martin@intm.fr'),
  ligne('RE: AO', 'Je traite' + notif('RFC00011111', 'lundi 15 décembre 2025 10:00'), 'Alice MARTIN', 'alice.martin@intm.fr'), // 2025
].join('\r\n');

test('lecture CSV multiligne avec guillemets', () => {
  const { entetes, lignes } = lireCSV(CSV);
  assert.equal(entetes[2], 'De: (nom)');
  assert.equal(lignes.length, 6);
  assert.match(lignes[1][1], /Mobile : 06/);
});

test('dates citées FR et EN', () => {
  assert.equal(dateCitee('De : x\nEnvoyé : jeudi 1 octobre 2026 12:07\n'), '2026-10-01T12:07');
  assert.equal(dateCitee('Le 6 févr. 2026 à 17:52, BNP a écrit :'), '2026-02-06T17:52');
  assert.equal(dateCitee('From: x\nSent: Tuesday, September 29, 2026 5:38 PM\n'), '2026-09-29T17:38');
  assert.equal(dateCitee('Envoyé : 29/09/2026 17:38'), '2026-09-29T17:38');
});

test('réponse sans la partie citée', () => {
  assert.equal(reponsePropre('Je traite\nAlice\n\nDe : PWise\nEnvoyé : …\nAppel d’offres'), 'Je traite Alice');
});

test('décodage UTF-8 et Windows-1252', () => {
  assert.equal(decoder(new TextEncoder().encode('Envoyé')), 'Envoyé');
  assert.equal(decoder(new Uint8Array([0x45, 0x6e, 0x76, 0x6f, 0x79, 0xe9])), 'Envoyé');
});

test('extraction des réponses INTM', async () => {
  const { messages, stats, titres } = await lireMails(CSV);
  assert.equal(stats.mails, 6);
  assert.equal(messages.length, 2, 'Alice et Bruno sur RFC00012345 ; ancien BPM, sans réf et 2025 écartés');
  assert.deepEqual(messages.map(m => [m.auteur, m.ref, m.date]), [
    ['Alice MARTIN', 'RFC00012345', '2026-10-01T12:07'], ['Bruno DUPONT', 'RFC00012345', '2026-10-01T12:07']]);
  assert.equal(stats.anciens, 2);
  assert.equal(stats.sansRef, 1);
  assert.ok(titres.has('RFC00012345'));
  const deux = await lireMails(CSV);
  assert.equal(deux.messages[0].id, messages[0].id, 'empreinte stable');
});

const PWISE = JSON.stringify({ data: [
  { reference: 'RFC00012345', intitule: 'Développeur Java', statut: 'Réponse fournisseur en cours', datePublication: '01/10/2026 11:58', dateDebut: '02/11/2026' },
  { reference: 'RFC00022222', intitule: 'Chef de projet', statut: 'Réponse fournisseur en cours', datePublication: '28/09/2026 09:00' },
  { reference: 'RFC00033333', intitule: 'BA', statut: 'RFC soumis', datePublication: '2026-09-01T09:00:00' },
] });

test('lecture PWise', () => {
  const { ao, cles } = lirePWise(PWISE);
  assert.equal(cles.ref, 'reference'); assert.equal(cles.statut, 'statut');
  assert.equal(ao.length, 3);
  assert.equal(ao[0].date_publication, '2026-10-01T11:58');
  assert.equal(ao[0].debut_mission, '2026-11-02');
  assert.equal(ao[2].reponse_soumise, true);
  assert.equal(ao[1].en_cours, true);
});

test('import complet : aperçu avant/après, rien en double', async () => {
  const vide = { ao: [{ ref: 'RFC00099999', plateforme: 'PWise', statut_pwise: 'Réponse fournisseur en cours', vu_dernier_export: true }], messages: [], corrections: [], bm: [] };
  const f = (name, texte) => ({ name, texte });
  const r = await preparerImport({ mails: f('mails.csv', CSV), pwise: f('pwise.json', PWISE) }, vide);
  assert.equal(r.messagesNouveaux.length, 2);
  assert.equal(r.stats.pwise.disparus, 1, 'RFC00099999 absent du nouvel export');
  const resa = r.apres.reservations.find(x => x.ref === 'RFC00012345');
  assert.equal(resa.bm, 'Bruno DUPONT', 'la revendication l’emporte');
  assert.equal(resa.s, 'A');
  assert.equal(r.apres.libres.map(l => l.ref).join(), 'RFC00022222');
  const r2 = await preparerImport({ mails: f('mails.csv', CSV) }, { ...vide, messages: r.messagesNouveaux });
  assert.equal(r2.messagesNouveaux.length, 0, 'ré-import sans doublon');
});

import { dateLien, refsDe } from '../js/import-mails.js';

test('date de réception lue dans un lien Safelinks (heure de Paris)', () => {
  const corps = 'Je traite <https://eur02.safelinks.protection.outlook.com/?url=x&data=05%7C02%7Ca%40intm.fr%7Cabc%7Cdef%7C0%7C0%7C639264619346627530%7CUnknown%7C>';
  assert.equal(dateLien(corps), '2026-10-01T16:32');
  assert.equal(dateLien('pas de lien'), null);
});

test('références : RFC, BPM, N° RFx OneProcTool, lien PWise', () => {
  assert.deepEqual(refsDe('RE: RFC00012345 je traite'), ['RFC00012345']);
  assert.deepEqual(refsDe('*\tN° RFx : 43741'), ['BPM043741']);
  assert.deepEqual(refsDe('request_for_candidates_manage_extranet/19242 <https://x>'), ['RFC00019242']);
  assert.deepEqual(refsDe('Nous traitons RFC00040436 et RFC00040476.'), ['RFC00040436', 'RFC00040476']);
});

test('graphies d’un même BM fusionnées, OneProcTool par numéro seul', async () => {
  const q = s => `"${String(s).replace(/"/g, '""')}"`;
  const L = (o, c, n, a) => [o, c, n, a, 'SMTP'].map(q).join(',');
  const csv = ['Objet,Corps,"De: (nom)","De: (adresse)","De: (type)"',
    L('[POUR ACTION] Dossier de consultation Data', 'Bonjour,\n*\tNom RFx : Data\n*\tN° RFx : 43001\n', 'BNP PARIBAS OneProcTool', 'x@oneproctool-info.bnpparibas.com'),
    L('43001 je récupère', '', 'Alice Martin', 'alice.martin@intm.fr'),
    L('RE: BPM043001', 'Je traite', 'Alice MARTIN', 'alice.martin@intm.fr'),
    L('RE: BPM043001', 'Je traite', 'Alice MARTIN', 'alice.martin@intm.fr'),
  ].join('\r\n');
  const { messages, titres } = await lireMails(csv);
  assert.equal(titres.get('BPM043001'), 'Data');
  assert.deepEqual([...new Set(messages.map(m => m.auteur))], ['Alice MARTIN']);
  assert.ok(messages.every(m => m.ref === 'BPM043001'));
});
