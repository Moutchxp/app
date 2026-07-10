import 'server-only';
import { queryAnalytics } from './pool';
import { ECRITURE_TIMEOUT_MS } from './config';

/**
 * M2 — Analytics, LOT 1. WRITER isolé : l'UNIQUE porte d'écriture analytique. Toute écriture passe
 * par ce module et par le pool dédié (`pool.ts`), jamais par le pool applicatif.
 *
 * CONTRAT DE SÛRETÉ NON NÉGOCIABLE : aucune fonction exportée ici NE DOIT jamais throw vers l'appelant,
 * ni bloquer au-delà de `ECRITURE_TIMEOUT_MS`. Perdre un événement est acceptable ; faire échouer ou
 * ralentir une certification ne l'est JAMAIS. (Constat R1/R2 de la revue M2.)
 *
 * ⚠️ Ne DOIT jamais être importé par le moteur (`app/lib/svv/**`, `pipeline.ts`) — garde ESLint + test
 * de graphe d'imports.
 */

/** Dimensions d'un incrément de compteur jour (toutes optionnelles ; un événement n'en remplit que certaines). */
export interface EvenementCompteur {
  /** Nom d'événement — DOIT exister dans `analytics_catalogue_evenement` (sinon rejet FK, avalé). */
  nom: string;
  verdict?: 'SANS_VIS_A_VIS' | 'VIS_A_VIS' | 'INDETERMINE' | null;
  scoreTranche?: number | null;
  source?: string | null;
  medium?: string | null;
  campagne?: string | null;
  refererHote?: string | null;
  deviceType?: 'mobile' | 'desktop' | 'tablette' | 'inconnu' | null;
  navigateurFamille?: string | null;
  communeInsee?: string | null;
  etape?: string | null;
  raison?: string | null;
}

/**
 * Jour courant au fuseau **Europe/Paris**, au format `YYYY-MM-DD` (EARS-V1 : `jour_paris` peuplé à
 * l'écriture par l'application, jamais une colonne générée `AT TIME ZONE` que Postgres refuse).
 * DST-safe : `Intl` applique les règles du fuseau. Aucune seconde n'est jamais conservée — seul le JOUR.
 */
export function jourParis(maintenant: Date = new Date()): string {
  // en-CA → format ISO `YYYY-MM-DD` ; timeZone force le jour civil parisien.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(maintenant);
}

/**
 * Course contre un timeout DUR côté JS. Si `p` dépasse `ms`, on rejette (l'appelant avale). La requête
 * sous-jacente continue en arrière-plan mais son rejet éventuel est neutralisé (`p.catch`) pour éviter
 * un unhandled rejection ; côté serveur, `statement_timeout` l'annulera de toute façon.
 */
async function avecTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  p.catch(() => {}); // neutralise un rejet tardif de p (après que le timeout a déjà gagné)
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => {
    minuteur = setTimeout(() => rej(new Error('analytics_timeout')), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (minuteur) clearTimeout(minuteur);
  }
}

/**
 * Incrémente de 1 le compteur jour correspondant aux dimensions de `ev` (UPSERT auto-commit). Ne throw
 * JAMAIS : toute erreur (base lente/pleine, pool saturé, timeout, valeur d'enum/commune rejetée par un
 * CHECK, nom hors catalogue rejeté par la FK) est avalée et journalisée en console serveur.
 */
export async function incrementerCompteur(ev: EvenementCompteur): Promise<void> {
  try {
    const params = [
      jourParis(),
      ev.nom,
      ev.verdict ?? null,
      ev.scoreTranche ?? null,
      ev.source ?? null,
      ev.medium ?? null,
      ev.campagne ?? null,
      ev.refererHote ?? null,
      ev.deviceType ?? null,
      ev.navigateurFamille ?? null,
      ev.communeInsee ?? null,
      ev.etape ?? null,
      ev.raison ?? null,
    ];
    // UPSERT sur la contrainte NULLS NOT DISTINCT (les dimensions NULL se regroupent → vrai compteur).
    const sql = `
      INSERT INTO analytics_compteur_jour
        (jour_paris, nom, verdict, score_tranche, source, medium, campagne, referer_hote,
         device_type, navigateur_famille, commune_insee, etape, raison, n)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, 1)
      ON CONFLICT ON CONSTRAINT analytics_compteur_jour_dims_uniq
      DO UPDATE SET n = analytics_compteur_jour.n + 1`;
    await avecTimeout(queryAnalytics(sql, params), ECRITURE_TIMEOUT_MS);
  } catch (e) {
    // Best-effort : on abandonne l'événement, on NE remonte JAMAIS l'erreur à l'appelant.
    console.error('[analytics] incrementerCompteur abandonné', e);
  }
}
