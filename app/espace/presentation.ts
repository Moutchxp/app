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

// ── Mot de passe oublié / réinitialisation (UI, commit E) ────────────────────────────────────────────────

/** Lien discret sous le formulaire de connexion. */
export const LIB_MDP_OUBLIE = 'Mot de passe oublié ?';

/** Longueur minimale — MIROIR de la politique SERVEUR (`authCredential.LONGUEUR_MIN = 12`). À garder synchronisés. */
export const LONGUEUR_MIN_MDP = 12;

// Écran DEMANDE (saisie de l'e-mail → envoi du lien).
export const TITRE_MDP_OUBLIE = 'Mot de passe oublié';
export const INTRO_MDP_OUBLIE =
  'Saisissez l’adresse e-mail de votre compte : nous vous enverrons un lien pour choisir un nouveau mot de passe.';
export const LIB_CHAMP_EMAIL = 'E-mail';
export const LIB_ENVOYER_LIEN = 'Envoyer le lien';
export const LIB_ENVOI_EN_COURS = 'Envoi…';
/**
 * Confirmation AFFICHÉE DANS TOUS LES CAS (compte existant ou non) — pendant visible de l'anti-énumération : l'écran ne
 * révèle JAMAIS si l'adresse a un compte. Formulée au conditionnel.
 */
export const MSG_DEMANDE_ENVOYEE =
  'Si un compte est associé à cette adresse, vous allez recevoir un e-mail avec un lien de réinitialisation. Pensez à vérifier vos courriers indésirables.';
export const LIB_RETOUR_CONNEXION = 'Retour à la connexion';
/** Panne réseau du navigateur (la route, elle, répond toujours) — n'expose aucune information d'existence. */
export const MSG_RESEAU_INDISPONIBLE = 'Envoi indisponible pour le moment. Réessayez.';

// Écran SAISIE (nouveau mot de passe depuis le lien).
export const TITRE_NOUVEAU_MDP = 'Nouveau mot de passe';
export const INTRO_NOUVEAU_MDP = 'Choisissez un nouveau mot de passe pour votre compte Sans Vis-à-Vis®.';
export const LIB_CHAMP_NOUVEAU_MDP = 'Nouveau mot de passe';
export const LIB_CHAMP_CONFIRMATION = 'Confirmez le mot de passe';
export const AIDE_MDP = `Au moins ${LONGUEUR_MIN_MDP} caractères.`;
/** aria-label de l'œil DANS le champ, selon l'état courant (le libellé décrit l'action disponible au clic). */
export const ARIA_AFFICHER_MDP = 'Afficher le mot de passe';
export const ARIA_MASQUER_MDP = 'Masquer le mot de passe';
export const LIB_VALIDER_NOUVEAU_MDP = 'Valider';
export const LIB_ENREGISTREMENT_EN_COURS = 'Enregistrement…';
export const MSG_MDP_TROP_COURT = `Le mot de passe doit contenir au moins ${LONGUEUR_MIN_MDP} caractères.`;
export const MSG_MDP_DIVERGENT = 'Les deux mots de passe ne correspondent pas.';
export const MSG_LIEN_INVALIDE = 'Ce lien n’est plus valide. Demandez un nouveau lien de réinitialisation.';
export const MSG_ERREUR_REINIT = 'Une erreur est survenue. Réessayez dans un instant.';
export const LIB_REDEMANDER_LIEN = 'Demander un nouveau lien';

/**
 * Validation CLIENT du nouveau mot de passe — retour IMMÉDIAT, MIROIR de la politique serveur (`LONGUEUR_MIN_MDP`). La
 * route re-valide côté serveur ; ce contrôle évite un aller-retour ET préserve le lien (un mot de passe trop court /
 * divergent n'est jamais envoyé, donc le jeton n'est pas consommé). PUR. La longueur prime sur la divergence.
 */
export function validerNouveauMotDePasse(mdp: string, confirmation: string): { ok: boolean; erreur: string | null } {
  if (mdp.length < LONGUEUR_MIN_MDP) return { ok: false, erreur: MSG_MDP_TROP_COURT };
  if (mdp !== confirmation) return { ok: false, erreur: MSG_MDP_DIVERGENT };
  return { ok: true, erreur: null };
}

// ── Page « Mon compte » (consultation + modification prénom/nom, commit C3) ──────────────────────────────
export const TITRE_COMPTE = 'Mon compte';
export const LIB_RETOUR_ESPACE = 'Retour';

export const LIB_CHAMP_PRENOM = 'Prénom';
export const LIB_CHAMP_NOM = 'Nom';
export const LIB_CHAMP_EMAIL_COMPTE = 'E-mail';
export const LIB_CHAMP_TELEPHONE = 'Téléphone';
/** Valeur absente affichée en lecture. */
export const MSG_VALEUR_ABSENTE = '—';
/** Téléphone non renseigné en base (cadenas conservé). */
export const MSG_TELEPHONE_ABSENT = 'Non renseigné';

export const LIB_MODIFIER = 'Modifier';
export const LIB_ENREGISTRER = 'Enregistrer';
export const LIB_ENREGISTREMENT = 'Enregistrement…';
export const LIB_ANNULER = 'Annuler';

/** Confirmation discrète (role="status") après enregistrement. */
export const MSG_COMPTE_ENREGISTRE = 'Modifications enregistrées.';
/** Échec de validation (400) — message exploitable côté écran. */
export const MSG_COMPTE_VALIDATION = 'Vérifiez le prénom et le nom saisis.';
/** Échec générique (500 / réseau) — sans détail technique. */
export const MSG_COMPTE_ERREUR = 'Une erreur est survenue. Réessayez.';

/** aria-label du bouton cadenas (ouvre l'explication). */
export const ARIA_CADENAS = 'Pourquoi ce champ n’est-il pas modifiable ?';
/**
 * TEXTE EXACT de la bulle du cadenas (NE PAS reformuler). Rendu = `BULLE_CADENAS_AVANT` + lien mailto (`BULLE_CADENAS_EMAIL`)
 * + « . » → la phrase complète « …écrivez-nous à contact@sansvisavis.com. ». L'adresse est un lien mailto cliquable.
 */
export const BULLE_CADENAS_AVANT =
  'Votre adresse e-mail et votre numéro de téléphone ne sont pas modifiables depuis l’application : votre e-mail sert d’identifiant de connexion. Pour les faire changer, écrivez-nous à ';
export const BULLE_CADENAS_EMAIL = 'contact@sansvisavis.com';
