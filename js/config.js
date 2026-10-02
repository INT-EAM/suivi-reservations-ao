// Paramètres de connexion Supabase.
// La clé « anon » est publique par nature : la sécurité repose sur la RLS (voir supabase/schema.sql),
// qui n'ouvre les données qu'aux comptes @intm.fr connectés.
// Laisser vide pour un mode local (données gardées dans ce navigateur uniquement).
export const SUPABASE_URL = 'https://tjlrhacczpdtgtiutjlm.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqbHJoYWNjenBkdGd0aXV0amxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NzcxNTIsImV4cCI6MjA5MTI1MzE1Mn0.iBBvWvBtVHWf6s9eRb1cF9TgDqWBdl_8Bc3y6KH8lA4';   // Supabase > Project Settings > API > anon public
