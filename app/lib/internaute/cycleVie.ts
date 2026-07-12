import 'server-only';
/**
 * Module INTERNAUTE — LOT 4 : CYCLE DE VIE (serveur only). Effacement asymétrique, rectification, purge à échéance.
 *
 * Utilise le pool applicatif `app/lib/db/client.ts` (JAMAIS `poolAnalytics`). AUCUN import `app/lib/analytics/*`
 * ni moteur → cloisonnement M2 respecté. Le moteur n'est jamais rappelé → golden intact.
 *
 * ⚠️ RÈGLE ASYMÉTRIQUE D'EFFACEMENT (invariant central) : un effacement ANONYMISE l'identité (bloc A : PII → NULL,
 * `efface_a` posé) et SUPPRIME le projet (bloc C : lignes `internaute_projet`), mais NE TOUCHE JAMAIS les preuves
 * de consentement (bloc B : `internaute_consentement`, append-only). La ligne `internaute` est CONSERVÉE (anonymisée)
 * → son UUID reste le pivot des preuves B → intégrité référentielle intacte ET preuve conservée pour un contrôle.
 * Après effacement, le profil disparaît des extractions (filtre `efface_a IS NULL` dans `extractionRepo.ts`).
 */
import { query, withTransaction, type RequeteTx } from '../db/client';
import type { ChampsRectification } from './rectification';

/** Levée si la rectification d'email heurte l'unicité applicative (`lower(email)`). */
export class ErreurEmailDuplique extends Error {
  constructor() {
    super('email déjà utilisé par un autre internaute');
    this.name = 'ErreurEmailDuplique';
  }
}

function estCode(e: unknown, code: string): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code?: unknown }).code === code;
}

/** Journal append-only des opérations de cycle de vie (accountability). `details` NE contient JAMAIS de PII. */
async function journaliserCycleVie(
  q: RequeteTx,
  auteurId: number | null,
  action: 'effacement' | 'rectification' | 'purge_auto',
  cibleId: string,
  details: Record<string, unknown> | null,
): Promise<void> {
  await q(
    `INSERT INTO internaute_cycle_vie_log (utilisateur_id, action, cible_internaute_id, details)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [auteurId, action, cibleId, details ? JSON.stringify(details) : null],
  );
}

/**
 * ANONYMISATION EN PLACE d'un ou plusieurs profils (cœur de la règle asymétrique) : NULLifie les PII (A), pose
 * `efface_a`, SUPPRIME les projets (C). NE TOUCHE PAS `internaute_consentement` (B) — la preuve survit. Idempotent
 * (le `WHERE efface_a IS NULL` évite de ré-anonymiser).
 */
async function anonymiserEnPlace(q: RequeteTx, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await q(
    `UPDATE internaute
       SET prenom = NULL, nom = NULL, email = NULL, telephone = NULL, efface_a = now(), maj_a = now()
     WHERE id = ANY($1::uuid[]) AND efface_a IS NULL`,
    [ids],
  );
  await q(`DELETE FROM internaute_projet WHERE internaute_id = ANY($1::uuid[])`, [ids]);
  // Bloc B (`internaute_consentement`) : VOLONTAIREMENT INTACT (append-only + preuve conservée).
}

/**
 * EFFACEMENT SUR DEMANDE d'un profil (droit à l'effacement). Transactionnel, admin-only (garde en amont dans la
 * route). Renvoie `{ efface: false }` si l'id n'existe pas. La preuve de consentement B est conservée.
 */
export async function effacerInternaute(id: string, auteurId: number | null): Promise<{ efface: boolean }> {
  return withTransaction(async (q) => {
    const existe = await q(`SELECT 1 FROM internaute WHERE id = $1`, [id]);
    if (existe.rows.length === 0) return { efface: false };
    await anonymiserEnPlace(q, [id]);
    await journaliserCycleVie(q, auteurId, 'effacement', id, { strategie: 'anonymisation_en_place', preuve_b: 'conservee' });
    return { efface: true };
  });
}

const COLONNES_RECTIFIABLES: Record<keyof ChampsRectification, string> = {
  prenom: 'prenom',
  nom: 'nom',
  email: 'email',
  telephone: 'telephone',
};

/**
 * RECTIFICATION d'identité (droit de rectification, bloc A uniquement). Transactionnel, admin-only. Ne touche NI
 * les preuves B NI le moteur. Refuse sur un profil déjà effacé (`efface_a` non NULL → rien à rectifier). Lève
 * `ErreurEmailDuplique` si l'email heurte l'unicité. `{ rectifie: false }` si l'id n'existe pas / est effacé.
 */
export async function rectifierInternaute(
  id: string,
  champs: ChampsRectification,
  auteurId: number | null,
): Promise<{ rectifie: boolean }> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [cle, valeur] of Object.entries(champs)) {
    const colonne = COLONNES_RECTIFIABLES[cle as keyof ChampsRectification];
    if (!colonne) continue; // whitelist stricte : jamais de nom de colonne dérivé de l'entrée
    params.push(valeur);
    sets.push(`${colonne} = $${params.length}`);
  }
  if (sets.length === 0) return { rectifie: false };
  sets.push('maj_a = now()');

  try {
    return await withTransaction(async (q) => {
      const r = await q<{ id: string }>(
        `UPDATE internaute SET ${sets.join(', ')} WHERE id = $1 AND efface_a IS NULL RETURNING id`,
        params,
      );
      if (r.rows.length === 0) return { rectifie: false };
      // Journal SANS PII : on trace QUELS champs ont changé, jamais leurs valeurs.
      await journaliserCycleVie(q, auteurId, 'rectification', id, { champs: Object.keys(champs) });
      return { rectifie: true };
    });
  } catch (e) {
    if (estCode(e, '23505')) throw new ErreurEmailDuplique();
    throw e;
  }
}

/** Durée de rétention (jours) par clé. Absente → lève (fail-safe : on ne purge JAMAIS sans durée configurée). */
async function lireRetentionJours(cle: string): Promise<number> {
  const r = await query<{ jours: number }>(`SELECT jours FROM internaute_retention WHERE cle = $1`, [cle]);
  const j = r.rows[0]?.jours;
  if (typeof j !== 'number' || j <= 0) throw new Error(`rétention '${cle}' absente/invalide — purge annulée`);
  return j;
}

/**
 * PURGE À ÉCHÉANCE (déclenchable manuellement en LOCAL — pas de cron). Anonymise (règle asymétrique) les profils
 * dont la rétention identité+projet est DÉPASSÉE ET qui n'ont AUCUNE finalité active. La preuve B est conservée.
 * Renvoie le nombre de profils purgés. `auteurId` = admin déclencheur (ou NULL pour un déclenchement automatisé).
 */
export async function purgerEchus(auteurId: number | null = null): Promise<{ purges: number }> {
  const jours = await lireRetentionJours('identite_projet_jours');
  return withTransaction(async (q) => {
    const cand = await q<{ id: string }>(
      `SELECT i.id FROM internaute i
       WHERE i.efface_a IS NULL
         AND i.cree_a < now() - make_interval(days => $1)
         AND NOT EXISTS (
           SELECT 1 FROM internaute_consentement_actif ca WHERE ca.internaute_id = i.id AND ca.actif = true
         )`,
      [jours],
    );
    const ids = cand.rows.map((r) => r.id);
    if (ids.length === 0) return { purges: 0 };
    await anonymiserEnPlace(q, ids);
    for (const id of ids) await journaliserCycleVie(q, auteurId, 'purge_auto', id, { retention_jours: jours });
    return { purges: ids.length };
  });
}

/** Durées de rétention paramétrables (lecture, pour l'admin). */
export async function lireRetention(): Promise<{ cle: string; jours: number; description: string | null }[]> {
  const r = await query<{ cle: string; jours: number; description: string | null }>(
    `SELECT cle, jours, description FROM internaute_retention ORDER BY cle`,
  );
  return r.rows;
}
