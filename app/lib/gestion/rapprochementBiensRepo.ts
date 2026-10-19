import { query, withTransaction } from '../db/client';
import type { Auteur } from './gestes';
import { colonneExisteMemo } from '../location/sondeLocation';
import { verifierGesteBien, type GesteBien, type LigneBien, type NiveauBien } from './racinesProprietaires';

/**
 * ══ 🔴🔴 RAPPROCHEMENT DES BIENS — LE DÉPÔT (Arno, 19/10/2026) ══════════════════════════════════════════════════════════
 *
 * Section « Biens » de l'écran « Rapprochement des dossiers clients » : pour chaque bien d'un propriétaire à plusieurs
 * dossiers copiés, le dossier proposé (SÛR / PROBABLE / AMBIGU). Arno décide les PROBABLES et les AMBIGUS (Valider,
 * Corriger parmi les dossiers du propriétaire, Aucun rattachement). Tables en ajout seul (migration 388) : une décision se
 * modifie en en posant une nouvelle, la plus récente fait foi.
 *
 * 🔴 RIEN D'AUTRE N'EST ÉCRIT : ni le Drive, ni `gestion_annuaire_lot.drive_dossier_id` (c'est l'étape F, lancée par Arno).
 * Ordre des écritures : LIRE sous verrou → refuser → écrire. Sans la migration 388 : `sans_schema`, rien ne tombe.
 */

export const disponibleBiens = (): Promise<boolean> => colonneExisteMemo('gestion_rapprochement_bien_decision', 'geste');

export type LectureBiens = { etat: 'sans_schema' } | { etat: 'vide' } | { etat: 'ok'; calcul: string; lignes: LigneBien[] };
export type IssueBien = { ok: true; nombre?: number } | { ok: false; motif: string };

const INSTANT = (c: string) => `to_char(${c} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
const candidatsDe = (v: unknown): { id: string; nom: string }[] => (Array.isArray(v) ? v : [])
  .filter((c): c is { id: string; nom: string } => c !== null && typeof c === 'object' && typeof (c as { id?: unknown }).id === 'string')
  .map((c) => ({ id: c.id, nom: typeof c.nom === 'string' ? c.nom : c.id }));

/** Les propositions du DERNIER calcul des biens, chacune avec sa décision qui fait foi. */
export async function lireRapprochementBiens(): Promise<LectureBiens> {
  if (!(await disponibleBiens())) return { etat: 'sans_schema' };
  const { rows: c } = await query<{ calcul: string }>(`SELECT calcul FROM gestion_rapprochement_bien_proposition ORDER BY id DESC LIMIT 1`);
  if (c.length === 0) return { etat: 'vide' };
  const calcul = c[0].calcul;
  const { rows } = await query<{
    id: string; lot_id: string; lot_wippimmo_id: string; adresse: string | null; proprietaire_id: string; proprietaire: string | null;
    dossier_id: string | null; dossier_nom: string | null; niveau: NiveauBien; raison: string; candidats: unknown;
    geste: GesteBien | null; d_dossier_id: string | null; decide_le: string | null; decide_par: string | null; n: number;
  }>(
    `SELECT p.id::text, p.lot_id::text, p.lot_wippimmo_id, concat_ws(', ', lo.adresse, lo.commune) AS adresse,
            p.proprietaire_id::text, pr.nom_complet AS proprietaire, p.dossier_id, p.dossier_nom, p.niveau, p.raison, p.candidats,
            d.geste, d.dossier_id AS d_dossier_id, ${INSTANT('d.decide_le')} AS decide_le, d.decide_par_libelle AS decide_par,
            (SELECT count(*)::int FROM gestion_rapprochement_bien_decision x WHERE x.proposition_id = p.id) AS n
       FROM gestion_rapprochement_bien_proposition p
       LEFT JOIN gestion_annuaire_lot lo ON lo.id = p.lot_id
       LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = p.proprietaire_id
       LEFT JOIN LATERAL (SELECT * FROM gestion_rapprochement_bien_decision x WHERE x.proposition_id = p.id ORDER BY x.id DESC LIMIT 1) d ON true
      WHERE p.calcul = $1 ORDER BY p.id`, [calcul]);
  return {
    etat: 'ok', calcul,
    lignes: rows.map((r) => {
      const candidats = candidatsDe(r.candidats);
      return {
        id: Number(r.id), lotId: Number(r.lot_id), wippimmo: r.lot_wippimmo_id, adresse: r.adresse ?? `lot ${r.lot_wippimmo_id}`,
        proprietaire: { id: Number(r.proprietaire_id), nom: r.proprietaire ?? `fiche ${r.proprietaire_id}` },
        niveau: r.niveau, dossierId: r.dossier_id, dossierNom: r.dossier_nom, raison: r.raison, candidats,
        decision: r.geste === null ? null : {
          geste: r.geste, dossierId: r.d_dossier_id,
          dossierNom: r.d_dossier_id === null ? null : candidats.find((x) => x.id === r.d_dossier_id)?.nom ?? r.d_dossier_id,
          decideLe: r.decide_le ?? '', decidePar: r.decide_par ?? '',
        },
        nbDecisions: r.n,
      };
    }),
  };
}

/** Valider, Corriger (un autre dossier du propriétaire) ou « Aucun rattachement », pour UN bien. */
export async function deciderRapprochementBien(propositionId: number, geste: GesteBien, dossierChoisi: string | null, auteur: Auteur): Promise<IssueBien> {
  if (!(await disponibleBiens())) return { ok: false, motif: 'La migration 388 n’est pas appliquée.' };
  if (!Number.isInteger(propositionId) || propositionId <= 0) return { ok: false, motif: 'Proposition inconnue.' };
  return withTransaction(async (q) => {
    const { rows } = await q<{ dossier_id: string | null; candidats: unknown }>(
      `SELECT dossier_id, candidats FROM gestion_rapprochement_bien_proposition WHERE id = $1 FOR UPDATE`, [propositionId]);
    if (rows.length === 0) return { ok: false, motif: 'Proposition inconnue.' };
    const p = { dossierId: rows[0].dossier_id, candidats: candidatsDe(rows[0].candidats) };
    const refus = verifierGesteBien(p, geste, dossierChoisi);
    if (refus !== null) return { ok: false, motif: refus };
    const dossier = geste === 'valider' ? p.dossierId : geste === 'corriger' ? dossierChoisi : null;
    await q(
      `INSERT INTO gestion_rapprochement_bien_decision (proposition_id, geste, dossier_id, decide_par, decide_par_libelle)
       VALUES ($1, $2, $3, $4, $5)`, [propositionId, geste, dossier, auteur.id, auteur.libelle]);
    return { ok: true };
  });
}

// ── LE CHARGEMENT D'UN CALCUL (script `gestion-rapprochement-biens-charger`) ───────────────────────────────────────────

export interface PropositionBienACharger {
  lot_id: number; lot_wippimmo_id: string; proprietaire_id: number;
  dossier_id: string | null; dossier_nom: string | null; niveau: NiveauBien; raison: string; candidats: { id: string; nom: string }[];
}

/** Charge UN calcul, en une transaction ; refuse un calcul déjà chargé (la table est en ajout seul). */
export async function chargerPropositionsBiens(calcul: string, props: readonly PropositionBienACharger[]): Promise<IssueBien> {
  if (!(await disponibleBiens())) return { ok: false, motif: 'La migration 388 n’est pas appliquée.' };
  if (!/^[0-9A-Za-z_-]{1,40}$/.test(calcul)) return { ok: false, motif: 'Étiquette de calcul invalide.' };
  return withTransaction(async (q) => {
    await q(`LOCK TABLE gestion_rapprochement_bien_proposition IN SHARE ROW EXCLUSIVE MODE`);
    const { rows } = await q<{ n: number }>(`SELECT count(*)::int AS n FROM gestion_rapprochement_bien_proposition WHERE calcul = $1`, [calcul]);
    if ((rows[0]?.n ?? 0) > 0) return { ok: false, motif: `Le calcul « ${calcul} » est déjà chargé.` };
    for (const p of props) {
      await q(
        `INSERT INTO gestion_rapprochement_bien_proposition (calcul, lot_id, lot_wippimmo_id, proprietaire_id, dossier_id, dossier_nom, niveau, raison, candidats)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
        [calcul, p.lot_id, p.lot_wippimmo_id, p.proprietaire_id, p.dossier_id, p.dossier_nom, p.niveau, p.raison, JSON.stringify(p.candidats)]);
    }
    return { ok: true, nombre: props.length };
  });
}
