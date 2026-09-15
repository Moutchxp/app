/**
 * PART-2 (élargissement) — CHARGEMENT du référentiel des familles suivies depuis `permis_famille_ref` (IMPUR : base). REPLI SÛR : table
 * absente (migration 223 non appliquée), vide, ou lecture impossible → `FAMILLES_REF_DEFAUT` (les 4 familles historiques, comportement
 * ACTUEL à l'identique). Aucune exception propagée : le diagnostic ne dépend jamais de la présence de la table.
 */
import { query } from '../db/client';
import { FAMILLES_REF_DEFAUT, type FamilleRef, type DetecteurContenu } from './famillesRef';

interface Row {
  code: string; libelle: string; libelle_corps: string; ordre: number;
  motifs_nom: string[] | null; detecteur_contenu: string | null; actif: boolean;
}

/**
 * Charge le référentiel complet (toutes familles, actives ou non), trié par `ordre`. Repli EN DUR sur les 4 historiques si la table
 * est absente/vide/illisible. Le caller filtre l'activation via `famillesSuiviesActives`.
 */
export async function chargerFamillesRef(): Promise<FamilleRef[]> {
  try {
    const { rows } = await query<Row>(
      `SELECT code, libelle, libelle_corps, ordre, motifs_nom, detecteur_contenu, actif FROM permis_famille_ref ORDER BY ordre`);
    if (rows.length === 0) return [...FAMILLES_REF_DEFAUT]; // table vide → repli (jamais un diagnostic sans aucune famille)
    return rows.map((r) => ({
      code: r.code,
      libelle: r.libelle,
      libelleCorps: r.libelle_corps,
      ordre: r.ordre,
      motifsNom: r.motifs_nom ?? [],
      detecteurContenu: (r.detecteur_contenu as DetecteurContenu | null),
      actif: r.actif,
    }));
  } catch {
    return [...FAMILLES_REF_DEFAUT]; // 223 absente / lecture impossible → comportement historique
  }
}
