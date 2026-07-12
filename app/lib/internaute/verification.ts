import 'server-only';
/**
 * Module INTERNAUTE — OUTIL DE VÉRIFICATION (contrôle technique admin, serveur only).
 *
 * ⚠️ FRONTIÈRE À NE PAS FRANCHIR : cet outil sert UNIQUEMENT à VÉRIFIER que l'ingestion du tunnel fonctionne
 * (consultation admin). Il n'exporte RIEN et ne sert JAMAIS au recontact. Il est DISTINCT du moteur d'extraction
 * COMMERCIAL (`extractionRepo.ts`), dont l'invariant « consentants F1 actif » reste seul autorisé pour
 * l'export/recontact. Le mode `'tous'` ci-dessous n'est PAS soumis à cet invariant — c'est un contrôle technique,
 * pas de l'exploitation commerciale. Ne JAMAIS brancher `lireRecents('tous')` sur un export ou une liste de recontact.
 *
 * Utilise le pool applicatif `app/lib/db/client.ts` (JAMAIS `poolAnalytics`). AUCUN import `analytics/*` ni moteur →
 * cloisonnement M2 respecté. Lecture SEULE de colonnes déjà persistées → golden intact.
 */
import { query } from '../db/client';

export type ModeVerification = 'f1' | 'tous';

/** Une ligne de la liste de vérification (identité résumée + drapeaux). */
export interface LigneRecent {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  cree_a: string;
  efface_a: string | null;
  f1_actif: boolean;
}

/**
 * Les 10 derniers internautes (création décroissante) pour le panneau de vérification.
 * - `'f1'`  : uniquement les consentants F1 ACTIF et non effacés — MÊME condition que l'extraction commerciale
 *             (cohérence de contrôle), mais requête DISTINCTE (aucun export possible ici).
 * - `'tous'`: toute la base (consentants ou non), effacés INCLUS (leur PII est déjà NULL, `efface_a` renseigné) —
 *             consultation technique seulement.
 */
export async function lireRecents(mode: ModeVerification): Promise<LigneRecent[]> {
  if (mode === 'f1') {
    const r = await query<LigneRecent>(
      `SELECT i.id, i.prenom, i.nom, i.email, i.cree_a, i.efface_a, true AS f1_actif
       FROM internaute i
       JOIN internaute_consentement_actif ca
         ON ca.internaute_id = i.id AND ca.finalite = 'recontact_interne' AND ca.actif = true
       WHERE i.efface_a IS NULL
       ORDER BY i.cree_a DESC
       LIMIT 10`,
    );
    return r.rows;
  }
  // mode 'tous' : aucune restriction de consentement (contrôle technique). Effacés inclus (PII déjà anonymisée).
  const r = await query<LigneRecent>(
    `SELECT i.id, i.prenom, i.nom, i.email, i.cree_a, i.efface_a,
            COALESCE(ca.actif, false) AS f1_actif
     FROM internaute i
     LEFT JOIN internaute_consentement_actif ca
       ON ca.internaute_id = i.id AND ca.finalite = 'recontact_interne'
     ORDER BY i.cree_a DESC
     LIMIT 10`,
  );
  return r.rows;
}
