-- Suivi des réservations d'AO — schéma Supabase
-- À exécuter une fois dans Supabase > SQL Editor. Ré-exécutable sans risque (if not exists / or replace).
--
-- Sécurité : le dépôt est public et la clé « anon » est visible dans le code.
-- Toutes les tables sont donc fermées par RLS et ne s'ouvrent qu'aux utilisateurs
-- connectés avec une adresse @intm.fr (ou @intm.com).

-- ---------------------------------------------------------------- accès
create or replace function public.sr_est_intm() returns boolean
language sql stable as $$
  select coalesce(lower(auth.jwt() ->> 'email') ~ '@intm\.(fr|com)$', false)
$$;

-- ---------------------------------------------------------------- tables
-- Catalogue des AO, alimenté par l'export PWise (et complété par les références vues dans les mails).
create table if not exists public.sr_ao (
  ref               text primary key,            -- RFC00012345 (PWise) ou BPM041234 (OneProcTool)
  plateforme        text not null,               -- 'PWise' | 'OneProcTool'
  titre             text,
  organisation      text,
  statut_pwise      text,                        -- statut de l'AO dans le dernier export
  reponse_soumise   boolean,                     -- INTM a soumis une réponse (null = inconnu)
  date_publication  timestamptz,
  debut_mission     date,
  en_cours          boolean default false,       -- « Réponse fournisseur en cours » au dernier export
  vu_dernier_export boolean default false,
  maj               timestamptz default now()
);

-- Réponses des BM aux mails d'AO (une ligne par mail, sans la partie citée).
create table if not exists public.sr_messages (
  id         text primary key,                   -- empreinte (ref + auteur + date + texte) : un ré-import ne crée pas de doublon
  ref        text not null,
  date       timestamptz,                        -- date du mail PWise / OneProcTool cité ; null si introuvable
  auteur     text not null,
  texte      text,
  import_id  bigint,
  cree_le    timestamptz default now()
);
create index if not exists sr_messages_ref on public.sr_messages(ref);

-- Corrections manuelles d'attribution : priment sur le calcul automatique.
create table if not exists public.sr_corrections (
  ref         text primary key,
  bm          text,                              -- null = AO exclu du suivi
  commentaire text,
  par         text default (auth.jwt() ->> 'email'),
  maj         timestamptz default now()
);

-- Annuaire des BM : trigramme et surnoms utilisés dans les mails (« Bubu », « BDU »…).
create table if not exists public.sr_bm (
  nom        text primary key,                   -- « Prénom NOM » tel qu'il apparaît dans Outlook
  trigramme  text,
  alias      text[] default '{}',
  actif      boolean default true
);

-- Équipes : sélections nommées d'un ou plusieurs BM.
create table if not exists public.sr_equipes (
  id       bigserial primary key,
  nom      text unique not null,
  membres  text[] not null default '{}',
  par      text default (auth.jwt() ->> 'email'),
  maj      timestamptz default now()
);

-- Journal des imports.
create table if not exists public.sr_imports (
  id               bigserial primary key,
  le               timestamptz default now(),
  par              text default (auth.jwt() ->> 'email'),
  fichier_mails    text,
  fichier_pwise    text,
  date_extraction  date,
  nb_mails_lus     int,
  nb_messages      int,
  nb_nouveaux      int,
  nb_ao_pwise      int
);

-- ---------------------------------------------------------------- RLS
do $$
declare t text;
begin
  foreach t in array array['sr_ao','sr_messages','sr_corrections','sr_bm','sr_equipes','sr_imports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "intm lecture" on public.%I', t);
    execute format('drop policy if exists "intm ecriture" on public.%I', t);
    execute format('create policy "intm lecture" on public.%I for select to authenticated using (public.sr_est_intm())', t);
    execute format('create policy "intm ecriture" on public.%I for all to authenticated using (public.sr_est_intm()) with check (public.sr_est_intm())', t);
  end loop;
end $$;

-- Aucun accès pour les visiteurs non connectés (rôle anon).
revoke all on public.sr_ao, public.sr_messages, public.sr_corrections, public.sr_bm, public.sr_equipes, public.sr_imports from anon;
grant select, insert, update, delete on public.sr_ao, public.sr_messages, public.sr_corrections, public.sr_bm, public.sr_equipes, public.sr_imports to authenticated;
grant usage on all sequences in schema public to authenticated;
