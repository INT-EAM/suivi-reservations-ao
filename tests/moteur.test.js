// Tests sur données fictives (aucune donnée réelle dans le dépôt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classer } from '../js/classify.js';
import { attribuer } from '../js/attribution.js';
import { creerAnnuaire, messagesEffectifs, trigramme } from '../js/annuaire.js';
import { TYPES } from '../js/regles.js';

const T = (txt, auteur = 'Alice MARTIN') => classer(txt, auteur);

test('classification des réponses courantes', () => {
  assert.equal(T('Bonjour, Je traite.').type, TYPES.POSITIONNEMENT);
  assert.equal(T('On traite. Biz').type, TYPES.POSITIONNEMENT);
  assert.equal(T('').type, TYPES.POSITIONNEMENT);
  assert.equal(T('Alice MARTIN').type, TYPES.POSITIONNEMENT, 'signature seule');
  assert.equal(T('Idem').type, TYPES.POSITIONNEMENT);
  assert.equal(T('Hello, C’est chez moi, je récupère').type, TYPES.REVENDICATION);
  assert.equal(T('Je l’ai pris désolé').type, TYPES.REVENDICATION);
  assert.equal(T('J’attends l’AO BPM012345').type, TYPES.RESERVATION);
  assert.equal(T('Ah ok, désolée').type, TYPES.CESSION);
  assert.equal(T('Erratum j’ai confondu').type, TYPES.CESSION);
  assert.equal(T('Merci de lire vos mails avant de répondre !').type, TYPES.ECHANGE);
  assert.equal(T('Bonjour Je traite Tel : 06 12 34 56 78 Mail : x@intm.fr').type, TYPES.POSITIONNEMENT);
});

test('désignation d’un autre BM', () => {
  assert.deepEqual([T('Bruno traite').type, T('Bruno traite').pour], [TYPES.POSITIONNEMENT, 'bruno']);
  const e = T('ERRATUM chez BDU');
  assert.equal(e.pour, 'bdu'); assert.ok(e.erratum);
  assert.ok(T('Sorry Bruno récupère').erratum, 'l’auteur lâche l’AO');
  assert.equal(T('Chez Stéphane je traite').pour, null, 'première personne : c’est l’auteur qui prend');
});

test('trigrammes', () => {
  assert.equal(trigramme('Alice MARTIN'), 'AMA');
  assert.equal(trigramme('Lou DE LA TOUR'), 'LDLT');
  assert.equal(trigramme('Jean-Paul DURAND'), 'JPDU');
});

const ann = creerAnnuaire(['Alice MARTIN', 'Bruno DUPONT', 'Chloé DURAND'], [{ nom: 'Bruno DUPONT', alias: ['bubu'] }]);
const msg = (ref, auteur, texte, date = null) => ({ ref, auteur, texte, date });

test('annuaire : prénom, trigramme, alias', () => {
  assert.equal(ann.resoudre('bruno'), 'Bruno DUPONT');
  assert.equal(ann.resoudre('BDU'), 'Bruno DUPONT');
  assert.equal(ann.resoudre('Bubu'), 'Bruno DUPONT');
  assert.equal(ann.resoudre('chloe'), 'Chloé DURAND');
  assert.equal(ann.resoudre('inconnu'), null);
});

const run = (msgs, corr) => attribuer(messagesEffectifs(msgs, ann), corr);

test('présomption : le premier positionné garde l’AO', () => {
  const r = run([msg('A1', 'Alice MARTIN', 'Je traite', '2026-03-01T10:00'), msg('A1', 'Bruno DUPONT', 'Je traite', '2026-03-01T11:00')]);
  assert.equal(r.get('A1').bm, 'Alice MARTIN');
  assert.equal(r.get('A1').date, '2026-03-01');
});

test('la dernière revendication l’emporte', () => {
  const r = run([
    msg('A2', 'Alice MARTIN', 'Je traite', '2026-03-01T10:00'),
    msg('A2', 'Bruno DUPONT', 'C’est chez moi', '2026-03-02T10:00'),
    msg('A2', 'Chloé DURAND', 'Non c’est chez moi, je récupère', '2026-03-03T10:00'),
  ]);
  assert.equal(r.get('A2').bm, 'Chloé DURAND');
  assert.equal(r.get('A2').date, '2026-03-03');
});

test('cession : celui qui lâche est retiré', () => {
  const r = run([msg('A3', 'Alice MARTIN', 'Je traite', '2026-03-01T10:00'), msg('A3', 'Alice MARTIN', 'Erratum chez BDU', '2026-03-01T10:05')]);
  assert.equal(r.get('A3').bm, 'Bruno DUPONT');
});

test('délégation non résolue reste visible', () => {
  const r = run([msg('A4', 'Alice MARTIN', 'Zorro traite', '2026-03-01T10:00')]);
  assert.match(r.get('A4').bm, /^Zorro \? \(via Alice MARTIN\)$/);
});

test('correction manuelle prioritaire, ou exclusion', () => {
  const m = [msg('A5', 'Alice MARTIN', 'Je traite', '2026-03-01T10:00')];
  assert.equal(run(m, new Map([['A5', { bm: 'Bruno DUPONT' }]])).get('A5').bm, 'Bruno DUPONT');
  assert.equal(run(m, new Map([['A5', { bm: null }]])).has('A5'), false);
});
