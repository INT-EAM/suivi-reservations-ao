// Accès aux données : Supabase quand il est configuré, sinon stockage local du navigateur.
// Même interface dans les deux cas, pour que l'appli ne sache pas où sont les données.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const TABLES = { ao: 'sr_ao', messages: 'sr_messages', corrections: 'sr_corrections', bm: 'sr_bm', equipes: 'sr_equipes', imports: 'sr_imports' };
const CLES = { ao: 'ref', messages: 'id', corrections: 'ref', bm: 'nom', equipes: 'nom', imports: 'id' };

// ---------------------------------------------------------------- Supabase
async function storeSupabase() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, detectSessionInUrl: true } });
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

  async function tout(table) {
    const out = [];
    for (let de = 0; ; de += 1000) {
      const lot = ok(await sb.from(TABLES[table]).select('*').range(de, de + 999));
      out.push(...lot);
      if (lot.length < 1000) return out;
    }
  }
  return {
    mode: 'supabase',
    async utilisateur() { return (await sb.auth.getSession()).data.session?.user ?? null; },
    // Lien par mail : ne crée jamais de compte, seuls les comptes déjà créés par l'administrateur le reçoivent.
    async connexion(email) {
      ok(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split('#')[0], shouldCreateUser: false } }));
    },
    async connexionMdp(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
    async changerMdp(password) { ok(await sb.auth.updateUser({ password })); },
    async deconnexion() { await sb.auth.signOut(); },
    surChangementSession(fn) { sb.auth.onAuthStateChange((_e, s) => fn(s?.user ?? null)); },
    async charger() {
      const [ao, messages, corrections, bm, equipes, imports] = await Promise.all(Object.keys(TABLES).map(tout));
      return { ao, messages, corrections, bm, equipes, imports };
    },
    async enregistrer(table, lignes) {
      for (let i = 0; i < lignes.length; i += 500) {
        ok(await sb.from(TABLES[table]).upsert(lignes.slice(i, i + 500), { onConflict: CLES[table] }));
      }
    },
    async supprimer(table, cle) { ok(await sb.from(TABLES[table]).delete().eq(CLES[table], cle)); },
    async journaliser(ligne) { return ok(await sb.from(TABLES.imports).insert(ligne).select().single()); },
  };
}

// ---------------------------------------------------------------- local
function storeLocal(prefixe = 'sr:') {
  const lire = t => { try { return JSON.parse(localStorage.getItem(prefixe + t) || '[]'); } catch { return []; } };
  const ecrire = (t, v) => { try { localStorage.setItem(prefixe + t, JSON.stringify(v)); } catch (e) { throw new Error('Stockage du navigateur indisponible ou plein'); } };
  return {
    mode: 'local',
    async utilisateur() { return { email: 'local' }; },
    async connexion() {}, async connexionMdp() {}, async changerMdp() {}, async deconnexion() {}, surChangementSession() {},
    async charger() { return Object.fromEntries(Object.keys(TABLES).map(t => [t, lire(t)])); },
    async enregistrer(table, lignes) {
      const k = CLES[table], m = new Map(lire(table).map(l => [l[k], l]));
      for (const l of lignes) m.set(l[k], { ...(m.get(l[k]) || {}), ...l });
      ecrire(table, [...m.values()]);
    },
    async supprimer(table, cle) { ecrire(table, lire(table).filter(l => l[CLES[table]] !== cle)); },
    async journaliser(ligne) { const l = { id: Date.now(), le: new Date().toISOString(), ...ligne }; ecrire('imports', [...lire('imports'), l]); return l; },
  };
}

export async function ouvrirStore() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) return storeSupabase();
  return storeLocal();
}
export { storeLocal };
