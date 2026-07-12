/**
 * Module INTERNAUTE — BLOC B (consentement) : logique « consentement actif » PURE.
 *
 * Aucun accès base, AUCUN import de `app/lib/analytics/*` ni du moteur → le cloisonnement M2 et l'absence de
 * couplage moteur sont ici triviaux (fonctions pures, zéro dépendance).
 *
 * Miroir applicatif de la vue SQL `internaute_consentement_actif` (migration 023) : pour une personne et une
 * finalité, l'état COURANT = la décision LA PLUS RÉCENTE (horodatage, puis `id` bigserial monotone en tie-break) ;
 * le consentement est ACTIF si et seulement si cette dernière décision vaut `'accorde'`. Modèle APPEND-ONLY : un
 * retrait est une NOUVELLE ligne `'retire'`, jamais une suppression — l'historique reste intact.
 *
 * LOT 1 (socle) : encodage TESTABLE de l'invariant (aucune ingestion). L'accès base réel est câblé au LOT 2.
 */

/**
 * Finalité de traitement. Le référentiel est la table EXTENSIBLE `internaute_finalite` (base = source de vérité),
 * d'où un type ouvert (`string`) : une finalité future n'exige aucun changement de code ici.
 */
export type Finalite = string;

/** Clés des finalités SEED (migration 023). Confort de lecture — la table `internaute_finalite` fait foi. */
export const FINALITES_SEED = {
  recontactInterne: 'recontact_interne', // F1
  emailMarketing: 'email_marketing', // F2
  retargetingTiers: 'retargeting_tiers', // F3
} as const;

/** État d'une décision (colonne `etat`, CHECK migration 023). */
export type EtatConsentement = 'accorde' | 'refuse' | 'retire';

/** Sous-ensemble d'une ligne de preuve utile au calcul de l'état courant. */
export interface LigneConsentement {
  finalite: Finalite;
  etat: EtatConsentement;
  /** timestamptz de la décision. */
  horodatage: string | Date;
  /** `id` bigserial — tie-break monotone si deux décisions partagent le même horodatage. */
  id: number;
}

function instant(h: string | Date): number {
  return h instanceof Date ? h.getTime() : new Date(h).getTime();
}

/** `true` si `a` est STRICTEMENT plus récente que `b` (horodatage, puis `id`). */
function plusRecente(a: LigneConsentement, b: LigneConsentement): boolean {
  const ta = instant(a.horodatage);
  const tb = instant(b.horodatage);
  if (ta !== tb) return ta > tb;
  return a.id > b.id;
}

/**
 * Dernière décision par finalité (la plus récente). Miroir du `DISTINCT ON (…) ORDER BY horodatage DESC, id DESC`
 * de la vue SQL. Renvoie une Map finalité → dernière ligne.
 */
export function derniereDecisionParFinalite(historique: LigneConsentement[]): Map<Finalite, LigneConsentement> {
  const parFinalite = new Map<Finalite, LigneConsentement>();
  for (const ligne of historique) {
    const courante = parFinalite.get(ligne.finalite);
    if (!courante || plusRecente(ligne, courante)) parFinalite.set(ligne.finalite, ligne);
  }
  return parFinalite;
}

/**
 * Consentement ACTIF pour une finalité = la dernière décision vaut `'accorde'`. Absence de décision → `false`
 * (JAMAIS actif par défaut). C'est la porte que les LOTS 3+ doivent franchir avant toute exploitation d'une donnée
 * pour cette finalité.
 */
export function consentementActif(historique: LigneConsentement[], finalite: Finalite): boolean {
  return derniereDecisionParFinalite(historique).get(finalite)?.etat === 'accorde';
}
