/**
 * PL-C2 — MOTEUR de la SÉLECTION de parcelles validée à la main (SUPERPOSITION). Écrit/efface `permis_parcelle_selection`, puis
 * recalcule l'empreinte EFFECTIVE (via `figerEmpreinte`, rendu sélection-aware) + la photo du bâti. IMPUR (base). Module PROPRE :
 * n'importe que db/client + parcellesRepo (recompute).
 *
 * 🔴 GARDE DURE : ce module NE TOUCHE JAMAIS `permis_parcelle` (aucune mutation, aucune purge, aucun origine='saisie'). La sélection
 * vit À CÔTÉ du résultat automatique — c'est ce qui rend le retrait TRIVIAL (un DELETE) et l'origine récupérable byte-identique.
 *
 * ⚠️ PROVENANCE : `valide_par` = l'auteur RÉEL passé par la route (admin authentifié). Jamais une chaîne de harnais — c'est un
 * `origine='saisie'` posé par un harnais (« verif-lot101 ») qui a gelé DI 649 ; ici la superposition remplace ce chemin, sans le réutiliser.
 *
 * geom_snapshot + snapshot_millesime sont GELÉS À LA VALIDATION (copie de `parcelle.geom` + millésime cadastral courant), pour
 * survivre au réimport DELETE+append du cadastre — jamais renseignés après coup.
 */
import { query, withTransaction } from '../db/client';
import { figerEmpreinte, figerBatiSnapshot, type EmpreinteLigne } from './parcellesRepo';

export interface ResultatValidation { ok: boolean; nbSelectionnees: number; nbDemandees: number; empreinte: EmpreinteLigne }
export interface ResultatRetrait { ok: boolean; nbRetirees: number; empreinte: EmpreinteLigne }

/** Nettoie/dédoublonne une liste d'IDU (14 car. attendus, résolus sur `parcelle` par le SELECT ci-dessous ; les non résolus sont ignorés). */
function idusPropres(idus: readonly string[] | null | undefined): string[] {
  return [...new Set((idus ?? []).map((s) => (s ?? '').trim()).filter((s) => s !== ''))];
}

/**
 * VALIDE une sélection de parcelles : REMPLACE la sélection du dossier (une nouvelle validation écrase la précédente — « re-valider une
 * autre configuration ») par le SWAP ATOMIQUE DELETE+INSERT, puis recalcule l'empreinte effective (sélection) + le bâti. Chaque IDU est
 * résolu sur `parcelle` (geom + section/numéro/préfixe + millésime figés) ; un IDU introuvable au cadastre est IGNORÉ (jamais un contour
 * fantôme). Ordre de recompute IDENTIQUE à executerExtraction (figerEmpreinte puis figerBatiSnapshot). NE TOUCHE JAMAIS `permis_parcelle`.
 */
export async function validerSelection(dossierId: number, idus: readonly string[], majPar: string): Promise<ResultatValidation> {
  const propres = idusPropres(idus);
  // Swap ATOMIQUE de la sélection (une validation remplace la précédente).
  const nbSel = await withTransaction(async (q) => {
    await q(`DELETE FROM permis_parcelle_selection WHERE dossier_id = $1`, [dossierId]);
    if (propres.length === 0) return 0;
    const ins = await q(
      `INSERT INTO permis_parcelle_selection (dossier_id, idu, section, numero, prefixe, geom_snapshot, snapshot_millesime, valide_le, valide_par)
         SELECT $1, par.id, par.section, par.numero, par.prefixe, ST_Multi(ST_Force2D(par.geom)),
                (SELECT cm.millesime FROM cadastre_millesime cm WHERE cm.departement = left(par.id, 2) ORDER BY cm.charge_le DESC LIMIT 1),
                now(), $3
           FROM parcelle par WHERE par.id = ANY($2::text[])
         ON CONFLICT (dossier_id, idu) DO NOTHING`,
      [dossierId, propres, majPar]);
    return ins.rowCount ?? 0;
  });
  // Recompute (POOL, voit la sélection committée) — figerEmpreinte prend le chemin SÉLECTION grâce à la garde « sélection d'abord ».
  const empreinte = await figerEmpreinte(dossierId, majPar);
  await figerBatiSnapshot(dossierId, majPar).catch(() => undefined); // bâti dans la nouvelle empreinte, best-effort
  return { ok: true, nbSelectionnees: nbSel, nbDemandees: propres.length, empreinte };
}

/**
 * RETIRE la sélection d'un dossier : un simple DELETE, puis recompute. `permis_parcelle` n'ayant JAMAIS bougé, `figerEmpreinte` reprend
 * le chemin AUTOMATIQUE (aucune sélection) et redonne l'empreinte d'origine BYTE-IDENTIQUE (union des geom_snapshot d'origine —
 * mesuré). Aucune reconstruction, aucun état à restaurer. `majPar` = auteur du retrait (trace la nouvelle maj_par de l'empreinte).
 */
export async function retirerSelection(dossierId: number, majPar: string): Promise<ResultatRetrait> {
  const del = await query(`DELETE FROM permis_parcelle_selection WHERE dossier_id = $1`, [dossierId]);
  const empreinte = await figerEmpreinte(dossierId, majPar);      // aucune sélection → chemin automatique (retour à l'origine)
  await figerBatiSnapshot(dossierId, majPar).catch(() => undefined);
  return { ok: true, nbRetirees: del.rowCount ?? 0, empreinte };
}

/** Lit la sélection validée d'un dossier (pour l'écran / la remontée « Bâtiments et projection »). [] si aucune (= 100% automatique). */
export async function lireSelection(dossierId: number): Promise<{ idu: string; section: string | null; numero: string | null; valideLe: string | null; validePar: string | null }[]> {
  try {
    const { rows } = await query<{ idu: string; section: string | null; numero: string | null; valide_le: string | null; valide_par: string | null }>(
      `SELECT idu, section, numero, valide_le::text AS valide_le, valide_par FROM permis_parcelle_selection WHERE dossier_id = $1 ORDER BY section, numero`, [dossierId]);
    return rows.map((r) => ({ idu: r.idu, section: r.section, numero: r.numero, valideLe: r.valide_le, validePar: r.valide_par }));
  } catch (e) { if ((e as { code?: string })?.code === '42P01') return []; throw e; } // 202 non appliquée → aucune sélection
}
