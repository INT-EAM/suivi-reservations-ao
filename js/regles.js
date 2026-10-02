// Règles de gestion — modifier ici, tout le reste s'en déduit.

// Version affichée en pied de page : permet de vérifier qu'on voit bien la dernière mise en ligne.
export const VERSION = '2026-10-02 12:45 · réponses PWise';

export const REGLES = {
  // Un AO non traité réservé depuis plus de N jours est compté clos.
  closAutoJours: 30,
  // Seuils proposés pour les tuiles « en retard » et « non réservés » (le premier est celui par défaut).
  seuilsRetard: [5, 10, 15],
  // Fenêtre des AO en cours non réservés affichés.
  nonReservesMaxJours: 30,
  // Année suivie : les mails dont la date citée est antérieure sont ignorés.
  annee: 2026,
  // OneProcTool sans date : sous ce numéro, l'AO est considéré de l'année précédente.
  bpmPremierNumeroAnnee: 41500,
};

// Types de messages (étiquettes affichées et stockées).
export const TYPES = {
  POSITIONNEMENT: 'Positionnement',
  REVENDICATION: 'Revendication',
  RESERVATION: 'Réservation (attente AO)',
  CESSION: 'Cession / laisse la main',
  ECHANGE: 'Échange / info',
};

// Types qui valent prise de l'AO par l'auteur.
export const TYPES_PRISE = new Set([TYPES.POSITIONNEMENT, TYPES.REVENDICATION, TYPES.RESERVATION]);

// Statuts calculés d'une réservation.
export const STATUTS = {
  A: { lib: 'Non traité', couleur: 'var(--bad)' },
  T: { lib: 'Réponse soumise', couleur: 'var(--good)' },
  C: { lib: 'Clos sans réponse certaine', couleur: 'var(--neutral)' },
  N: { lib: 'Clos sans profil proposé', couleur: 'var(--neutral)' },
  X: { lib: 'Clos (non traité > 30 j)', couleur: 'var(--neutral)' },
  U: { lib: 'OneProcTool · statut non suivi', couleur: 'var(--neutral)' },
};
