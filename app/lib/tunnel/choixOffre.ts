/**
 * Module TUNNEL — logique PURE de l'écran de choix « Test unique / Test illimité » (Commit D1).
 *
 * Aucune dépendance React, DOM, serveur ni moteur → testable en Node. Encode les invariants du choix :
 *  - le slider ne valide qu'À FOND (glisser jusqu'à une extrémité) ; centre = neutre ;
 *  - le chemin « illimité » CRÉE le compte AVANT d'émettre le certificat (cohérent avec l'exclusion de l'auto-effacement
 *    des titulaires, Commit B) et n'écrit JAMAIS de consentement ;
 *  - « PDF pour tous » : tout échec NON lié au mot de passe émet quand même le certificat (le certificat est dû à tous).
 */

export type Choix = 'unique' | 'illimite';

/** Longueur minimale du mot de passe — MIROIR CLIENT de la politique serveur (Commit B). Le serveur re-valide (source de vérité). */
export const LONGUEUR_MIN_MDP = 12;

/**
 * Décision du slider à partir du ratio de déplacement dans [-1, +1] (0 = centre neutre). « Glisser à fond valide
 * directement » : on ne renvoie un choix que si le curseur a atteint une extrémité (|ratio| ≥ seuil). Gauche (négatif)
 * = test unique ; droite (positif) = test illimité ; entre les deux = null (le curseur revient au centre).
 */
export function choixDepuisRatio(ratio: number, seuil = 0.92): Choix | null {
  if (ratio <= -seuil) return 'unique';
  if (ratio >= seuil) return 'illimite';
  return null;
}

/** Aiguillage d'un choix vers le bon handler. Garantit, en code testable, le câblage gauche→unique / droite→illimité. */
export function brancherChoix(choix: Choix, handlers: { surUnique: () => void; surIllimite: () => void }): void {
  if (choix === 'unique') handlers.surUnique();
  else handlers.surIllimite();
}

/** Réponse minimale attendue de l'appel de création de compte (route Commit B `/api/internaute/auth/creer`). */
export interface ReponseCreationCompte {
  ok: boolean;
  status: number;
  erreurs?: string[];
}

/** Issue de l'orchestration « test illimité ». */
export type ResultatIllimite =
  | { statut: 'compte_cree' } // compte créé (session ouverte) PUIS certificat émis
  | { statut: 'mot_de_passe_invalide'; erreurs: string[] } // politique non respectée → PAS d'émission (l'internaute corrige)
  | { statut: 'compte_indisponible' }; // jeton absent/expiré, 401/404/503/réseau → certificat émis QUAND MÊME (PDF pour tous)

/**
 * Orchestration du chemin « test illimité » : crée le compte AVANT l'émission, sans JAMAIS écrire de consentement.
 *
 * Ordre GARANTI : `creerCompte` (POST `/api/internaute/auth/creer` { jeton, motDePasse }) PUIS, seulement en cas de
 * succès, `emettre()` (l'émission EXISTANTE du certificat). Le compte existe donc avant le certificat → l'exclusion de
 * l'auto-effacement des titulaires (Commit B) est fiable.
 *
 * Règles :
 *  - mot de passe < `LONGUEUR_MIN_MDP` → refus AVANT tout appel réseau, AUCUNE émission (l'internaute corrige) ;
 *  - jeton absent (email pré-existant → pas de capacité de propriété) → compte impossible par cette voie, MAIS le
 *    certificat reste DÛ → on émet (PDF pour tous) ;
 *  - création OK → émission ; création 422 (politique serveur) → pas d'émission (l'internaute corrige) ;
 *  - tout autre échec (401/404/503/réseau) → émission (PDF pour tous).
 *
 * N'écrit AUCUN consentement : ne transmet que { jeton, motDePasse } et ne déclenche que l'émission existante.
 */
export async function orchestrerIllimite(params: {
  jeton: string | null;
  motDePasse: string;
  creerCompte: (jeton: string, motDePasse: string) => Promise<ReponseCreationCompte>;
  emettre: () => void;
}): Promise<ResultatIllimite> {
  const { jeton, motDePasse, creerCompte, emettre } = params;

  if (motDePasse.length < LONGUEUR_MIN_MDP) {
    return { statut: 'mot_de_passe_invalide', erreurs: [`Le mot de passe doit contenir au moins ${LONGUEUR_MIN_MDP} caractères.`] };
  }
  if (!jeton) {
    emettre(); // pas de compte possible, mais le certificat est dû (PDF pour tous)
    return { statut: 'compte_indisponible' };
  }

  const r = await creerCompte(jeton, motDePasse);
  if (r.ok) {
    emettre(); // compte créé AVANT l'émission
    return { statut: 'compte_cree' };
  }
  if (r.status === 422) {
    return { statut: 'mot_de_passe_invalide', erreurs: r.erreurs && r.erreurs.length > 0 ? r.erreurs : ['Mot de passe non conforme.'] };
  }
  emettre(); // jeton expiré / 401 / 404 / 503 / réseau → PDF pour tous
  return { statut: 'compte_indisponible' };
}
