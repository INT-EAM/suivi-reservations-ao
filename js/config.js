// Paramètres de connexion Supabase.
// La clé « anon » est publique par nature : la sécurité repose sur la RLS (voir supabase/schema.sql),
// qui n'ouvre les données qu'aux comptes @intm.fr connectés.
// Laisser vide pour un mode local (données gardées dans ce navigateur uniquement).
export const SUPABASE_URL = 'https://tjlrhacczpdtgtiutjlm.supabase.co';
export const SUPABASE_ANON_KEY = '';   // Supabase > Project Settings > API > anon public
