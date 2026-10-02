// Attribution des AO à un BM à partir des messages, selon les règles de gestion :
//  1. périmètre PWise et OneProcTool ;
//  2. en cas de revendications successives, l'AO revient au dernier qui a revendiqué ;
//     le premier positionné est retiré ;
//  3. sans revendication, présomption de réservation pour le premier BM positionné ;
//  4. un BM qui cède la main est retiré ;
//  5. une correction manuelle prime sur tout le reste.
import { TYPES, TYPES_PRISE } from './regles.js';

/**
 * @param {Array<{date?:string, ref:string, bm:string, type:string, ordre?:number}>} messages
 * @param {Map<string,{bm:string|null}>} [corrections] ref -> correction (bm null = AO exclu)
 * @returns {Map<string,{bm:string, date:string|null, via:string}>}
 */
export function attribuer(messages, corrections = new Map()) {
  const parRef = new Map();
  messages.forEach((m, i) => {
    if (!parRef.has(m.ref)) parRef.set(m.ref, []);
    parRef.get(m.ref).push({ ...m, ordre: m.ordre ?? i });
  });

  const out = new Map();
  for (const [ref, liste] of parRef) {
    const corr = corrections.get(ref);
    // Messages datés dans l'ordre chronologique, puis non datés dans l'ordre de l'export.
    const dates = liste.filter(m => m.date).sort((a, b) => a.date.localeCompare(b.date) || a.ordre - b.ordre);
    const seq = dates.concat(liste.filter(m => !m.date).sort((a, b) => a.ordre - b.ordre));

    const cedes = new Set(), candidats = [];
    let derniereRev = null;
    for (const m of seq) {
      if (m.type === TYPES.CESSION) { cedes.add(m.bm); continue; }
      if (!TYPES_PRISE.has(m.type)) continue;
      cedes.delete(m.bm);
      if (!candidats.includes(m.bm)) candidats.push(m.bm);
      if (m.type === TYPES.REVENDICATION) derniereRev = m;
    }

    let bm = null, via = 'positionnement';
    if (derniereRev && !cedes.has(derniereRev.bm)) { bm = derniereRev.bm; via = 'revendication'; }
    else bm = candidats.find(b => !cedes.has(b)) ?? null;

    if (corr) {
      if (corr.bm === null) continue;           // AO exclu à la main
      bm = corr.bm; via = 'correction';
    }
    if (!bm) continue;

    // Date de réservation : la revendication qui tranche, sinon la 1re prise datée du BM retenu.
    let date = null;
    if (via === 'revendication' && derniereRev.date) date = derniereRev.date;
    else date = seq.find(m => m.bm === bm && m.date && TYPES_PRISE.has(m.type))?.date
             ?? seq.find(m => m.date)?.date ?? null;
    out.set(ref, { bm, date: date ? date.slice(0, 10) : null, via });
  }
  return out;
}
