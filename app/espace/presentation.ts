/**
 * Helpers de PRÉSENTATION (purs) de l'espace client. Aucune logique métier, aucun accès base : les données viennent de
 * `app/lib/internaute/espace.ts`. Toutes les chaînes user-facing de /espace sont ICI (aucune phrase en dur dans le JSX),
 * même patron que `app/verifier/presentation.ts`.
 */

/** Titre du bandeau rouge (espace). */
export const TITRE_ESPACE = 'Mon espace personnel';
/** Titre du bandeau rouge (page de connexion). */
export const TITRE_CONNEXION = 'Connexion';
/** Sous-ligne sous la phrase d'accueil (dans l'en-tête de la page, sous le bandeau). */
export const SOUS_LIGNE_ACCUEIL = 'Retrouvez ici toutes vos analyses et vos certificats.';

/** Titre de la liste unifiée (une ligne par analyse ; le certificat, s'il existe, est rattaché à sa ligne). */
export const TITRE_ANALYSES = 'Mes analyses';

/** État vide (aucune analyse). */
export const MSG_AUCUNE_ANALYSE = 'Aucune analyse pour le moment.';

/**
 * Analyse SANS certificat (cas structurel : un bien avec vis-à-vis n'émet pas de certificat). La ligne existe, ne se
 * déplie pas, et affiche cette mention sobre à la place des documents.
 */
export const MSG_SANS_CERTIFICAT = 'Aucun certificat pour cette analyse.';

/** Intitulé du bloc déplié listant les documents disponibles. */
export const LIB_DOCUMENTS = 'Vos documents';

/**
 * Les TROIS documents proposés au dépliement, avec une phrase courte destinée à un non-technicien. Objets `label` +
 * `description` (aucune phrase en dur dans le JSX). Ordre d'affichage : nominatif, anonymisé, visuel.
 */
export const DOC_NOMINATIF = {
  label: 'Certificat nominatif',
  description: 'Le document officiel complet, établi à votre nom.',
} as const;
export const DOC_ANONYME = {
  label: 'Certificat anonymisé',
  description: 'Le même certificat sans vos coordonnées — à transmettre librement.',
} as const;
export const DOC_VISUEL = {
  label: 'Visuel pour annonce',
  description: 'Une image prête à coller dans votre annonce immobilière.',
} as const;

/** Nominatif pas encore déposé (route → 409) : mention sobre en lieu et place de son lien. */
export const MSG_NOMINATIF_EN_PREPARATION = 'Certificat en préparation — disponible sous peu.';

/** Bouton de retour vers l'accueil de l'application (racine du site). */
export const LIB_RETOUR = 'Retour';

/** Libellés divers. */
export const LIB_DECONNEXION = 'Se déconnecter';
export const LIB_DECONNEXION_EN_COURS = 'Déconnexion…';
export const MSG_ADRESSE_ABSENTE = 'Adresse non renseignée';
export const LIB_ETAGE = 'Étage';
export const LIB_EMIS_LE = 'Émis le';

/** Score de vue /100 → libellé compact d'affichage (arrondi d'AFFICHAGE seulement, jamais réutilisé en calcul). `null` → « — ». */
export function formatScore(score: number | null): string {
  return score === null ? '—' : `${Math.round(score)}/100`;
}

/**
 * Phrase d'accueil personnalisée. « Bonjour <Prénom> <Nom> » UNIQUEMENT si les DEUX sont présents (non vides) ; sinon
 * REPLI défensif « Bonjour, » seul — jamais « Bonjour null », jamais d'espace orphelin. (Un profil anonymisé — prénom/nom
 * NULL après droit à l'oubli — ne peut plus se connecter, mais on couvre le cas.)
 */
export function salutation(prenom: string | null, nom: string | null): string {
  const p = (prenom ?? '').trim();
  const n = (nom ?? '').trim();
  return p && n ? `Bonjour ${p} ${n}` : 'Bonjour,';
}

/** Verdict brut → libellé d'affichage de l'espace (charte : « détecté » explicite pour le vis-à-vis). */
export function libelleVerdict(verdict: string | null): string {
  if (verdict === 'SANS_VIS_A_VIS') return 'Sans vis-à-vis';
  if (verdict === 'VIS_A_VIS') return 'Vis-à-vis détecté';
  return 'Indéterminé';
}
