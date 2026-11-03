// 🔴 MON ESPACE « LES COÛTS », LOT 2 (Arno, 03/11/2026, décision C9, migration 451) — LA FONCTION D'UN PROFIL : vente, location, gestion
// (plusieurs possibles), cochées dans la page Comptes, pré-cochées par la migration d'après les données existantes. Elles ne donnent AUCUN droit :
// elles rangent les profils proposés pour un salaire chargé (ceux de la fonction en cours d'abord). Même convention que `serviceGestion.ts` : pas de
// `import 'server-only'` ; une écriture = les lignes d'UN compte, journalisée dans `admin_utilisateur_log` (`changement_fonctions`, avant / après).
import { query, withTransaction } from '../db/client';
import { fonctionsComptesDisponible } from './schemaDroits';

import type { EtatFonctions, Fonction } from './fonctionsCompteModele';
export { estFonction, FONCTIONS, LIBELLE_FONCTION, profilsPourSalaire, type EtatFonctions, type Fonction, type ProfilCout } from './fonctionsCompteModele';

/** Les fonctions d'un compte. LECTURE SEULE. Sans la 451 : aucune, non disponible. */
export async function lireFonctions(id: number): Promise<EtatFonctions> {
  if (!(await fonctionsComptesDisponible())) return { valeur: [], disponible: false, deduites: [] };
  const { rows } = await query<{ fonction: Fonction; origine: string }>(
    'SELECT fonction, origine FROM admin_compte_fonction WHERE compte_id = $1 AND retire_le IS NULL ORDER BY fonction', [id]);
  return { valeur: rows.map((r) => r.fonction), disponible: true, deduites: rows.filter((r) => r.origine === 'deduite').map((r) => r.fonction) };
}

/** Les profils proposés (actifs, sauf observateurs), avec leurs fonctions (aucune sans la 451). LECTURE SEULE. */
export async function lireProfilsCouts(): Promise<import('./fonctionsCompteModele').ProfilCout[]> {
  const avec = await fonctionsComptesDisponible();
  const { rows } = await query<{ id: string; libelle: string; fonctions: Fonction[] | null }>(
    `SELECT u.id::text, coalesce(nullif(btrim(concat_ws(' ', u.prenom, u.nom)), ''), u.identifiant) AS libelle,
            ${avec ? `(SELECT array_agg(f.fonction ORDER BY f.fonction) FROM admin_compte_fonction f WHERE f.compte_id = u.id AND f.retire_le IS NULL)` : 'NULL::text[]'} AS fonctions
       FROM admin_utilisateur u
      WHERE u.actif IS TRUE AND coalesce(to_jsonb(u) ->> 'statut', '') <> 'observateur'
      ORDER BY libelle`);
  return rows.map((r) => ({ id: Number(r.id), libelle: r.libelle, fonctions: r.fonctions ?? [] }));
}

/**
 * Pose les fonctions d'UN compte : retire celles qui ne sont plus cochées (`retire_le`), ajoute les nouvelles (origine « saisie »), confirme les
 * déduites gardées ; une ligne de journal (avant / après, auteur). Rien n'est écrit si rien ne change. ⚠️ RÉSERVÉ AUX ADMINISTRATEURS (la route).
 */
export async function definirFonctions(id: number, fonctions: readonly Fonction[], auteurId: number | null, auteurLibelle: string): Promise<{ ok: boolean; change: boolean }> {
  if (!(await fonctionsComptesDisponible())) return { ok: false, change: false };
  const voulues = [...new Set(fonctions)].sort();
  return withTransaction(async (q) => {
    const { rows: c } = await q<{ id: string }>('SELECT id FROM admin_utilisateur WHERE id = $1 FOR UPDATE', [id]);
    if (c.length === 0) return { ok: false, change: false };
    const { rows } = await q<{ fonction: Fonction; origine: string }>('SELECT fonction, origine FROM admin_compte_fonction WHERE compte_id = $1 AND retire_le IS NULL', [id]);
    const avant = rows.map((r) => r.fonction).sort();
    const aConfirmer = rows.filter((r) => r.origine === 'deduite' && voulues.includes(r.fonction)).map((r) => r.fonction);
    if (JSON.stringify(avant) === JSON.stringify(voulues) && aConfirmer.length === 0) return { ok: true, change: false };
    await q(`UPDATE admin_compte_fonction SET retire_le = now(), retire_par_libelle = $3 WHERE compte_id = $1 AND retire_le IS NULL AND NOT (fonction = ANY($2::text[]))`,
      [id, voulues, auteurLibelle]);
    await q(`UPDATE admin_compte_fonction SET origine = 'saisie', pose_par_libelle = $3 WHERE compte_id = $1 AND retire_le IS NULL AND origine = 'deduite' AND fonction = ANY($2::text[])`,
      [id, voulues, auteurLibelle]);
    for (const f of voulues.filter((x) => !avant.includes(x))) {
      await q(`INSERT INTO admin_compte_fonction (compte_id, fonction, origine, pose_par_libelle) VALUES ($1, $2, 'saisie', $3)`, [id, f, auteurLibelle]);
    }
    await q(`INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres) VALUES ('changement_fonctions', $1, $2, $3::jsonb, $4::jsonb)`,
      [id, auteurId, JSON.stringify({ fonctions: avant }), JSON.stringify({ fonctions: voulues })]);
    return { ok: true, change: true };
  });
}
