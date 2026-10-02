# Suivi des réservations d'AO

Tableau de bord qui montre **qui réserve des appels d'offres sans les traiter**, à partir de deux fichiers :

- l'export **CSV Outlook** des réponses des BM aux mails d'AO (PWise et OneProcTool) ;
- l'extraction **JSON PWise** (liste des AO et de leur statut).

L'appli est une page statique (GitHub Pages) ; l'analyse se fait dans le navigateur et les données sont partagées via Supabase, réservées aux comptes @intm.fr.

> Aucune donnée réelle ne doit être poussée dans ce dépôt (il est public). Le `.gitignore` écarte les CSV et JSON d'export.

## Ce que fait l'appli

- **Import** : dépose le CSV des mails et/ou le JSON PWise, vérifie l'aperçu (avant/après sur chaque indicateur), valide. Un mail déjà importé n'est jamais compté deux fois.
- **Attribution automatique** de chaque AO à un BM (règles ci-dessous), avec l'historique des échanges consultable par AO.
- **Tableau de bord** : AO réservés non traités, en retard (> 5, 10, 15 j), AO en cours non réservés, classements, fiche par BM, export CSV.
- **Équipes** : choisis un ou plusieurs BM, enregistre la sélection comme équipe ; chaque équipe a son lien direct (`…/#equipe=Nom`).
- **Corrections** : clique sur un AO pour imposer un BM ou l'exclure ; la correction prime sur le calcul et survit aux imports suivants.
- **Annuaire** : trigrammes et surnoms (« Bubu », « BDU ») pour rattacher les réponses du type « Bruno traite » ou « erratum chez BDU ».

## Règles de gestion

Toutes dans [`js/regles.js`](js/regles.js) et [`js/attribution.js`](js/attribution.js).

1. Périmètre PWise **et** OneProcTool.
2. En cas de revendications successives (« c'est chez moi »), l'AO revient au **dernier** qui a revendiqué ; le premier positionné est retiré.
3. Sans revendication, présomption de réservation pour le **premier** BM positionné.
4. Un BM qui cède la main (« erratum », « vas-y », « Bruno récupère ») est retiré ; s'il désigne quelqu'un, l'AO va à cette personne.
5. Une correction manuelle prime sur tout le reste.
6. « Non traité » = AO en cours sur PWise sans réponse INTM soumise. Au-delà de **30 jours** après la réservation, il est compté clos.
7. OneProcTool n'a pas de statut de réponse : ses AO comptent dans les réservations, pas dans les non traités.
8. Date de réservation = date du mail PWise / OneProcTool cité dans la réponse (l'export CSV d'Outlook ne contient pas la date d'envoi) ; à défaut, date de sortie de l'AO, affichée « estimée ».

## Mise en place

1. **Supabase** : dans le projet, ouvrir *SQL Editor* et exécuter [`supabase/schema.sql`](supabase/schema.sql).
   Puis *Authentication > URL Configuration* : ajouter l'URL GitHub Pages de l'appli dans *Redirect URLs*.
2. **Configuration** : renseigner la clé `anon public` dans [`js/config.js`](js/config.js) (*Project Settings > API*).
   Cette clé est publique par conception ; la sécurité repose sur la RLS du schéma, qui n'ouvre les tables qu'aux comptes @intm.fr connectés.
3. **GitHub Pages** : *Settings > Pages > Deploy from a branch > main / root*.

Sans clé Supabase, l'appli tourne en **mode local** : les données restent dans le navigateur de la personne, pratique pour tester.

## Exporter les fichiers

- **Mails** : Outlook classique > *Fichier > Ouvrir et exporter > Importer/Exporter > Exporter vers un fichier > Valeurs séparées par des virgules*, choisir le dossier qui reçoit `bnp_ariba@intm.fr`. Garder les colonnes par défaut (Objet, Corps, De…).
- **PWise** : export JSON de la liste des appels d'offres.

## Développement

```bash
npm test                 # tests (données fictives)
python3 -m http.server   # puis http://localhost:8000
```

Structure : `js/classify.js` (lecture des réponses), `js/attribution.js` (règles), `js/annuaire.js` (trigrammes, surnoms), `js/import-*.js` (fichiers), `js/calcul.js` (indicateurs), `js/store.js` (Supabase ou local), `js/app.js` (interface).
