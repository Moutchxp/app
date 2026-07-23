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

/** Titres de sections. */
export const TITRE_ANALYSES = 'Mes analyses';
export const TITRE_CERTIFICATS = 'Mes certificats';

/** États vides. */
export const MSG_AUCUNE_ANALYSE = 'Aucune analyse pour le moment.';
export const MSG_AUCUN_CERTIFICAT = 'Aucun certificat pour le moment.';

/** Libellés de boutons / états du certificat. */
export const LIB_TELECHARGER = 'Télécharger le PDF';
export const MSG_PDF_PREPARATION = 'PDF en préparation — disponible sous peu.';

/** Libellés divers. */
export const LIB_DECONNEXION = 'Se déconnecter';
export const LIB_DECONNEXION_EN_COURS = 'Déconnexion…';
export const MSG_ADRESSE_ABSENTE = 'Adresse non renseignée';
export const LIB_ETAGE = 'Étage';
export const LIB_EMIS_LE = 'Émis le';

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
