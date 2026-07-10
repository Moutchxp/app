import 'server-only';
import { queryAnalytics } from './pool';
import { jourParis } from './writer';
import { ECRITURE_TIMEOUT_MS } from './config';
import type { DeviceType } from './contexte';

/**
 * M2 — Analytics, LOT 2. Writer de la SESSION ÉPHÉMÈRE (`analytics_session`). Le LOT 1 n'a livré que le
 * writer de compteur (`incrementerCompteur`) ; la table de session existe mais n'avait pas de writer.
 * Une session = UNE visite : `session_id` (UUID v4 JETABLE, minté côté client), `etape_max` (l'écran le
 * plus loin atteint), dimensions d'ACQUISITION (provenance), `complete` (a atteint le résultat). Le LOT 3
 * la compacte en compteur `session_fin` puis la SUPPRIME. AUCUNE géo, AUCUN verdict ici (contrainte 018 :
 * la session ne porte que provenance + étape → jamais une empreinte appareil×lieu).
 *
 * CONTRAT DE SÛRETÉ (identique à `writer.ts`) : NE THROW JAMAIS vers l'appelant, ne bloque jamais au-delà
 * de `ECRITURE_TIMEOUT_MS`. Pool analytique DÉDIÉ, UPSERT mono-instruction auto-commit (jamais de
 * transaction). Perdre une session est acceptable ; ralentir/casser une certification ne l'est jamais.
 *
 * ⚠️ Ne DOIT jamais être importé par le moteur (`app/lib/svv/**`, `pipeline.ts`) — garde ESLint + graphe.
 */

/** Étapes du tunnel dans l'ORDRE RÉEL de progression de l'UI (≠ ordre textuel du CHECK 018). Sert au rang
 * « étape la plus loin atteinte » : `etape_max` ne recule jamais. ⚠️ Dans l'UI actuelle, l'écran PHOTO
 * précède LOCALISATION (cf. recon `app/page.tsx`) — d'où photo(2) avant localisation(3). */
export const ETAPES_ORDONNEES = ['intro', 'photo', 'localisation', 'axe', 'infos_logement', 'analyse', 'resultat'] as const;
export type EtapeTunnel = (typeof ETAPES_ORDONNEES)[number];

/** Dimensions d'acquisition d'une session (toutes optionnelles ; renseignées surtout à `session_debut`). */
export interface AcquisitionSession {
  source?: string | null;
  medium?: string | null;
  campagne?: string | null;
  refererHote?: string | null;
  deviceType?: DeviceType | null;
  navigateurFamille?: string | null;
}

/** Course contre un timeout DUR côté JS (repli de `writer.ts` ; dupliqué pour garder le LOT 1 intact). */
async function avecTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  p.catch(() => {}); // neutralise un rejet tardif après que le timeout a gagné
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
 * Crée / met à jour la session `sessionId` pour le jour courant (Europe/Paris). `etape_max` monte au
 * MAXIMUM des étapes vues (jamais en arrière) ; `complete` passe à vrai dès qu'on atteint `resultat` et
 * n'en revient jamais ; les dimensions d'acquisition sont renseignées par COALESCE (le premier non-nul
 * gagne → `session_debut` remplit la provenance, les mises à jour d'étape ne l'écrasent pas).
 *
 * NE THROW JAMAIS. `sessionId` non conforme (UUID v4) ou `etape` inconnue → no-op silencieux (le CHECK
 * 018 rejetterait de toute façon ; on évite un aller-retour base inutile).
 */
export async function majSession(
  sessionId: string,
  etape: EtapeTunnel,
  acq: AcquisitionSession = {},
): Promise<void> {
  try {
    if (!ETAPES_ORDONNEES.includes(etape)) return;
    const complete = etape === 'resultat';
    const params = [
      sessionId,
      jourParis(),
      etape,
      acq.source ?? null,
      acq.medium ?? null,
      acq.campagne ?? null,
      acq.refererHote ?? null,
      acq.deviceType ?? null,
      acq.navigateurFamille ?? null,
      complete,
    ];
    // `array_position(ETAPES_ORDONNEES, x)` donne le rang (1..7) → `etape_max` ne prend la nouvelle valeur
    // que si son rang est STRICTEMENT plus loin. COALESCE(old, new) : la provenance déjà posée n'est jamais
    // écrasée. ON CONFLICT sur la PK (session_id, jour_paris).
    const sql = `
      INSERT INTO analytics_session
        (session_id, jour_paris, etape_max, source, medium, campagne, referer_hote, device_type, navigateur_famille, complete)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT ON CONSTRAINT analytics_session_pk DO UPDATE SET
        etape_max = CASE
          WHEN array_position(ARRAY['intro','photo','localisation','axe','infos_logement','analyse','resultat']::text[], EXCLUDED.etape_max)
             > array_position(ARRAY['intro','photo','localisation','axe','infos_logement','analyse','resultat']::text[], analytics_session.etape_max)
          THEN EXCLUDED.etape_max ELSE analytics_session.etape_max END,
        complete           = analytics_session.complete OR EXCLUDED.complete,
        source             = COALESCE(analytics_session.source, EXCLUDED.source),
        medium             = COALESCE(analytics_session.medium, EXCLUDED.medium),
        campagne           = COALESCE(analytics_session.campagne, EXCLUDED.campagne),
        referer_hote       = COALESCE(analytics_session.referer_hote, EXCLUDED.referer_hote),
        device_type        = COALESCE(analytics_session.device_type, EXCLUDED.device_type),
        navigateur_famille = COALESCE(analytics_session.navigateur_famille, EXCLUDED.navigateur_famille)`;
    await avecTimeout(queryAnalytics(sql, params), ECRITURE_TIMEOUT_MS);
  } catch (e) {
    // Best-effort : on abandonne la session, on NE remonte JAMAIS l'erreur.
    console.error('[analytics] majSession abandonné', e);
  }
}
