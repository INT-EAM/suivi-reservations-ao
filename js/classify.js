// Classe la réponse d'un BM à un mail d'AO.
// classer(texte, auteur) -> { type, pour, erratum }
//   type   : un des TYPES
//   pour   : jeton désignant un autre BM quand l'auteur répond pour quelqu'un (« Bruno traite », « chez BDU »), sinon null
//   erratum: l'auteur revient sur un message précédent (il lâche l'AO s'il le désigne à un autre)
import { TYPES } from './regles.js';

export const norm = s => (s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’`´]/g, "'")
  .toLowerCase();

// Coupe la signature (téléphone, mail, adresse, mentions légales…).
export function sansSignature(texte) {
  const t = (texte || '').replace(/\s+/g, ' ').trim();
  const m = t.search(/\b(mobile|mob|tel|tél|t[ée]l\.|fax)\s*[:.]|\bmail\s*:|\b(senior |sénior )?(business )?manager\b|\b0[67][ .]?\d\d|\+33|<mailto:(?!.*@intm)|\bintm(fr)? groupe\b|\b2 rue kl[ée]ber|hors situations de crise/i);
  return m >= 0 ? t.slice(0, m) : t;
}

const PREMIERE = "(je|j'|on|nous|moi qui)";
const TRAITE = "(t?r?a+i+t\\w*|prend|prends|prenons|recupere|m'en occupe|suis sur le sujet)";
const R = {
  revendication: [
    /c'?est (bien )?chez (moi|nous)/, /^\W*(hello|bonjour)?\W*chez (moi|nous)\b/, /\bchez (moi|nous)\b/, /chez mon client.{0,40}(recup|reprend)/,
    /\b(je|on|nous) (le |l'ao )?recup/, /\bnous recuperons\b/, /\b(je|on|nous) reprend/, /\breprend l'ao\b/,
    /\bje l'ai (deja )?pris\b/, /j'ai deja pris/, /\bdeja sur le sujet\b/, /\best reserve\b/, /\bperimetre .* reserve\b/,
    /\bbesoin est chez\b/, /renouvellement chez (moi|nous)/, /merci de ne pas (le )?traiter/, /\bj'ai du \w+ aussi\b/,
  ],
  reservation: [
    /\bj'attends? (l'ao|un ao|le bpm|ce bpm|les? \w*|c'?est|ces|\d)/, /\bmettre en stand ?by\b/, /\battendre un peu\b/,
    /dans l'attente de cet a[op]/,
  ],
  cession: [
    /\bmy bad\b/, /\bprends[- ]le\b/, /\bvas[- ]y\b/, /\btu peux y aller\b/, /^\W*(ok\W+)?sorry\b/,
    /\bah ok\b/, /\bah oki?\b/, /\bpas de (souci|soucis|probleme)\b/, /\bdesolee?,? oui\b/, /ce n'est pas chez (lui|elle|moi|nous)/,
    /\bdeja (pris|traite) (par|le dossier)\b/, /\bidem pour (rfc|bpm)/, /\bj'ai confondu\b/, /\bje passe\b/,
  ],
  positionnement: [
    new RegExp(`\\b${PREMIERE}\\b.{0,25}\\b${TRAITE}\\b`), /\btraitons\b/, /\bje me positionne\b/, /\bpositionn/, /\bon y va\b/,
    /^\W*(hello|bonjour)?\W*(pour moi|idem)\b/, /\bje vais (essaye de )?traiter\b/, /\bon va traiter\b/, /\bpren(d|ons|nent) en charge\b/,
  ],
};
const test = (liste, t) => liste.some(re => re.test(t));

// Mots qui ne disent rien de l'intention : une réponse qui n'en contient que ça vaut prise de l'AO.
const NEUTRES = new Set(('bonjour hello hi salut re merci thanks bonne journee soiree cordialement cdt bien a tous ' +
  'biz bise bises of course ok bon courage top super parfait').split(' '));

// Désignation d'un autre BM : « Bruno traite », « BDU traite », « Chloé prend », « erratum chez AMA », « @Bruno DUPONT ».
const PAS_UN_NOM = new Set(('je on nous qui moi lui elle mon ma notre leur client bnp bcef ito itg cib pf cardif levallois ' +
  'merignac nantes almt it adm et c est que ce cet ao bonjour hello bien').split(' '));
function designe(t) {
  let m = t.match(/(?:^|\s)@([a-z][a-z-]+)/);
  if (m) return m[1];
  m = t.match(/\bchez ([a-z][a-z-]{1,})\b/);
  if (m && !PAS_UN_NOM.has(m[1])) return m[1];
  m = t.match(/\b([a-z][a-z-]{1,})\s+(traite|prend|recupere)\b/);
  if (m && !PAS_UN_NOM.has(m[1])) return m[1];
  return null;
}

export function classer(texte, auteur = '') {
  let t = norm(sansSignature(texte));
  // Retire le nom de l'auteur (signature réduite à « Prénom NOM »).
  for (const mot of norm(auteur).split(/[\s-]+/).filter(w => w.length > 1)) t = t.replace(new RegExp(`\\b${mot}\\b`, 'g'), ' ');
  t = t.replace(/\s+/g, ' ').trim();
  const erratum = /\berr?r?att?um\b|\beeerrattum\b|\berattum\b/.test(t) || /\berr+a+t+u+m\b/.test(t);

  if (test(R.revendication, t)) return { type: TYPES.REVENDICATION, pour: null, erratum };
  if (test(R.reservation, t)) return { type: TYPES.RESERVATION, pour: null, erratum };
  // Une réponse à la 1re personne (« je traite ») vaut prise par l'auteur, même si elle cite un nom (« chez Paul je traite »).
  if (test(R.positionnement, t)) return { type: TYPES.POSITIONNEMENT, pour: null, erratum };
  const pour = designe(t);
  // « Sorry, Bruno récupère » : l'auteur lâche l'AO au profit de celui qu'il désigne.
  if (pour) return { type: TYPES.POSITIONNEMENT, pour, erratum: erratum || test(R.cession, t) };
  if (erratum || test(R.cession, t)) return { type: TYPES.CESSION, pour: null, erratum };
  if (test(R.positionnement, t)) return { type: TYPES.POSITIONNEMENT, pour: null, erratum };

  const mots = t.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (mots.every(m => NEUTRES.has(m) || /^(rfc|bpm)\d+$/.test(m))) return { type: TYPES.POSITIONNEMENT, pour: null, erratum };
  return { type: TYPES.ECHANGE, pour: null, erratum };
}
