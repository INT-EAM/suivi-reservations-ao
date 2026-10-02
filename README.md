# Suivi des réservations d'AO

Tableau de bord qui montre **qui réserve des appels d'offres sans les traiter**, à partir de deux fichiers :

- l'export **CSV Outlook** des réponses des BM aux mails d'AO (PWise et OneProcTool) ;
- l'extraction **JSON PWise** (liste des AO et de leur statut).

L'appli est une page statique (GitHub Pages) ; l'analyse se fait dans le navigateur et les données sont partagées via Supabase, réservées aux comptes @intm.fr.

> Aucune donnée réelle ne doit être poussée dans ce dépôt (il est public). Le `.gitignore` écarte les CSV et JSON d'export.

## Ce que fait l'appli

- **Import** : dépose le CSV des mails et/ou le JSON PWise, vérifie l'aperçu (avant/après sur chaque indicateur), valide. Un mail déjà importé n'est jamais compté deux fois.
- **Attribution automatique** de chaque AO à un BM (règles ci-dessous), avec l'historique des échanges consultable par AO.
- **Tableau de bord** : AO réservés non traités, en retard (> 5, 10, 15 j), AO en cours non réservés, classements par BM : en cours, total, dont OneProcTool, répondus / réservés PWise, taux et retenus PWise (chaque chiffre ouvre la liste des AO correspondants), fiche par BM, export CSV.
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
7. « Réponse soumise » = au moins un profil proposé sur la page de détail PWise (favori), statut PWise « RFC soumis » ou « RFC retenu », **ou** mail de résultat reçu (« Refus / Acceptation de l'offre » OneProcTool, « Résultats RFC disponibles » PWise), qui prouve qu'INTM a déposé une offre. Un export PWise ultérieur n'efface jamais cette preuve.
8. OneProcTool n'a pas de statut « en cours » : ses AO sans mail de résultat comptent dans les réservations, pas dans les non traités.
9. Date de réservation = date du mail PWise / OneProcTool cité dans la réponse (l'export CSV d'Outlook ne contient pas la date d'envoi) ; à défaut, date de sortie de l'AO, affichée « estimée ».

## Mise en place

1. **Supabase** : dans le projet, ouvrir *SQL Editor* et exécuter [`supabase/schema.sql`](supabase/schema.sql).
   Puis *Authentication > URL Configuration* : ajouter l'URL GitHub Pages de l'appli dans *Redirect URLs*.
   Accès (sans dépendre d'un envoi de mail) :
   - *Authentication > Sign In / Providers* : désactiver **Allow new users to sign up** (personne ne peut se créer un compte seul) ; dans *Email*, fixer la longueur minimale du mot de passe à 10.
   - Pour donner l'accès à quelqu'un : *Authentication > Users > Add user > Create new user*, son adresse @intm.fr, un mot de passe provisoire, cocher **Auto Confirm User**. Il le change ensuite dans l'appli (bouton *Compte*).
   - Pour retirer l'accès : supprimer l'utilisateur dans la même page. Mot de passe oublié : *… > Reset password* ou lui en fixer un nouveau.
   - Le lien par mail reste disponible pour les comptes existants, mais le service d'envoi intégré à Supabase est limité (2 mails/heure, membres du projet uniquement) : il faut un SMTP pour l'utiliser vraiment.
2. **Configuration** : renseigner la clé `anon public` dans [`js/config.js`](js/config.js) (*Project Settings > API*).
   Cette clé est publique par conception ; la sécurité repose sur la RLS du schéma, qui n'ouvre les tables qu'aux comptes @intm.fr connectés.
3. **GitHub Pages** : *Settings > Pages > Deploy from a branch > main / root*.

Sans clé Supabase, l'appli tourne en **mode local** : les données restent dans le navigateur de la personne, pratique pour tester.

## Exporter les fichiers

- **Mails** : Outlook classique > *Fichier > Ouvrir et exporter > Importer/Exporter > Exporter vers un fichier > Valeurs séparées par des virgules*, choisir le dossier qui reçoit `bnp_ariba@intm.fr`. Garder les colonnes par défaut (Objet, Corps, De…).
- **PWise** : le fichier `pwise_sync_AAAA-MM-JJ.json` produit par la synchro PWise (champs `rfc`, `intitule`, `statutPwise`, `dateDebut`…). Un autre export JSON est accepté : les champs sont reconnus par leur nom.

Les dates viennent des mails eux-mêmes, l'export CSV d'Outlook n'ayant pas de colonne date :
la date de sortie d'un AO est l'heure de réception lue dans les liens Safelinks de sa notification ;
la date d'une réponse est celle du mail cité (« Envoyé : … »), à défaut l'heure de réception lue dans un lien de la réponse.

## Le favori d'extraction PWise

[`outils/pwise-bookmarklet.txt`](outils/pwise-bookmarklet.txt) se colle dans l'URL d'un favori ; il se lance depuis la liste des demandes de PWise. Source lisible : [`outils/pwise-extract.src.js`](outils/pwise-extract.src.js), reconstruire avec `node outils/build-bookmarklet.mjs`.

1. Lit toutes les pages de la liste (référence, intitulé, statut, dates…).
2. Charge en arrière-plan la page de détail de chaque AO, sans quitter la liste, et lit le bloc **Profils** : nombre de profils proposés et codes PROP…. Si le bloc n'est pas présent dans la page téléchargée, le favori bascule sur une iframe cachée (plus lent).
3. Télécharge `pwise_sync_AAAA-MM-JJ.json`, que l'appli importe.

Effet dans l'appli : un AO avec au moins un profil proposé compte en « réponse soumise », même si PWise affiche encore « Réponse fournisseur en cours » ; un AO clos sans aucun profil passe en « clos sans profil proposé ».

## Développement

```bash
npm test                 # tests (données fictives)
python3 -m http.server   # puis http://localhost:8000
```

Structure : `js/classify.js` (lecture des réponses), `js/attribution.js` (règles), `js/annuaire.js` (trigrammes, surnoms), `js/import-*.js` (fichiers), `js/calcul.js` (indicateurs), `js/store.js` (Supabase ou local), `js/app.js` (interface).
