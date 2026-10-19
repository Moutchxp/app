import { query, withTransaction, type RequeteTx } from '../db/client';
import type { Auteur } from './gestes';
import { colonneExisteMemo } from '../location/sondeLocation';
import {
  peutValiderTousLesSurs, sursAValider, verifierGeste,
  type Decision, type FicheCourte, type Geste, type LigneRapprochement, type Niveau,
} from './rapprochementDossiers';

/**
 * ══ 🔴🔴 RAPPROCHEMENT DES DOSSIERS CLIENTS — LE DÉPÔT (Arno, 19/10/2026) ════════════════════════════════════════════════
 *
 * LIRE les propositions du dernier calcul et leur décision qui fait foi ; ENREGISTRER une décision (Valider, Corriger,
 * Aucun rattachement) ou « Valider tous les SÛRS ». Une décision se modifie en en posant une nouvelle : la table est en
 * ajout seul (migration 387), c'est elle le journal (date, auteur, geste, fiche).
 *
 * 🔴 RIEN D'AUTRE N'EST ÉCRIT : ni le Drive, ni l'annuaire (`drive_dossier_id` ne bouge pas), ni aucune autre table.
 * Ordre des écritures : LIRE sous verrou → refuser → écrire (un refus rendu après une écriture serait committé).
 * Sans la migration 387 : `sans_schema`, l'écran le dit et rien ne tombe.
 */

export const disponible = (): Promise<boolean> => colonneExisteMemo('gestion_rapprochement_decision', 'geste');

export type Lecture =
  | { etat: 'sans_schema' }
  | { etat: 'vide' }
  | { etat: 'ok'; calcul: string; lignes: LigneRapprochement[] };

export type IssueRapprochement = { ok: true; nombre?: number } | { ok: false; motif: string };

interface LigneProposition {
  id: string; sorte: 'dossier' | 'client_sans_dossier'; copie_dossier_id: string | null; nom_dossier: string | null; branche: string | null;
  nb_fichiers: number | null; niveau: Niveau; raison: string; proprietaire_id: string | null; candidats: string[];
  controle_oeil: boolean; vendu_en_gestion: boolean; groupe_plusieurs: string | null; principal: boolean; dernier_fichier_le: string | null;
}
interface LigneDecision {
  id: string; proposition_id: string; geste: Geste; proprietaire_id: string | null; en_masse: boolean; decide_le: string; decide_par_libelle: string;
}

async function fiches(ids: readonly number[]): Promise<Map<number, FicheCourte>> {
  if (ids.length === 0) return new Map();
  const { rows } = await query<{ id: string; nom: string; drive_dossier_id: string | null }>(
    `SELECT id::text, nom_complet AS nom, drive_dossier_id FROM gestion_annuaire_proprietaire WHERE id = ANY($1::bigint[])`, [[...new Set(ids)]]);
  return new Map(rows.map((r) => [Number(r.id), { id: Number(r.id), nom: r.nom, dossierActuelId: r.drive_dossier_id }]));
}

/** Les propositions du DERNIER calcul, chacune avec sa décision qui fait foi (la plus récente). */
export async function lireRapprochement(): Promise<Lecture> {
  if (!(await disponible())) return { etat: 'sans_schema' };
  const { rows: c } = await query<{ calcul: string }>(`SELECT calcul FROM gestion_rapprochement_proposition ORDER BY id DESC LIMIT 1`);
  if (c.length === 0) return { etat: 'vide' };
  const calcul = c[0].calcul;
  const { rows: props } = await query<LigneProposition>(
    `SELECT id::text, sorte, copie_dossier_id, nom_dossier, branche, nb_fichiers, niveau, raison, proprietaire_id::text,
            candidats::text[] AS candidats, controle_oeil, vendu_en_gestion, groupe_plusieurs, principal,
            to_char(dernier_fichier_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS dernier_fichier_le
       FROM gestion_rapprochement_proposition WHERE calcul = $1 ORDER BY id`, [calcul]);
  const { rows: decs } = await query<LigneDecision & { n: number }>(
    `SELECT DISTINCT ON (d.proposition_id) d.id::text, d.proposition_id::text, d.geste, d.proprietaire_id::text, d.en_masse,
            to_char(d.decide_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS decide_le, d.decide_par_libelle,
            (SELECT count(*)::int FROM gestion_rapprochement_decision x WHERE x.proposition_id = d.proposition_id) AS n
       FROM gestion_rapprochement_decision d JOIN gestion_rapprochement_proposition p ON p.id = d.proposition_id
      WHERE p.calcul = $1 ORDER BY d.proposition_id, d.id DESC`, [calcul]);
  const ids = [...props.flatMap((p) => [p.proprietaire_id, ...(p.candidats ?? [])]), ...decs.map((d) => d.proprietaire_id)]
    .filter((x): x is string => x !== null).map(Number);
  const F = await fiches(ids);
  const fiche = (id: string | null): FicheCourte | null => (id === null ? null : F.get(Number(id)) ?? { id: Number(id), nom: `fiche ${id}`, dossierActuelId: null });
  const D = new Map(decs.map((d) => [d.proposition_id, d]));
  return {
    etat: 'ok', calcul,
    lignes: props.map((p) => {
      const d = D.get(p.id);
      const decision: Decision | null = d === undefined ? null
        : { id: Number(d.id), geste: d.geste, fiche: fiche(d.proprietaire_id), enMasse: d.en_masse, decideLe: d.decide_le, decidePar: d.decide_par_libelle };
      return {
        id: Number(p.id), sorte: p.sorte, copieDossierId: p.copie_dossier_id, nomDossier: p.nom_dossier, branche: p.branche,
        nbFichiers: p.nb_fichiers, niveau: p.niveau, raison: p.raison, fiche: fiche(p.proprietaire_id),
        candidats: (p.candidats ?? []).map((x) => fiche(x)).filter((x): x is FicheCourte => x !== null),
        controleOeil: p.controle_oeil, venduEnGestion: p.vendu_en_gestion, groupePlusieurs: p.groupe_plusieurs, principal: p.principal,
        dernierFichierLe: p.dernier_fichier_le, decision, nbDecisions: d?.n ?? 0,
      };
    }),
  };
}

async function ecrireDecision(q: RequeteTx, propositionId: number, geste: Geste, proprietaireId: number | null, enMasse: boolean, auteur: Auteur): Promise<void> {
  await q(
    `INSERT INTO gestion_rapprochement_decision (proposition_id, geste, proprietaire_id, en_masse, decide_par, decide_par_libelle)
     VALUES ($1, $2, $3, $4, $5, $6)`, [propositionId, geste, proprietaireId, enMasse, auteur.id, auteur.libelle]);
}

/** Valider, Corriger (une autre fiche) ou « Aucun rattachement », pour UNE proposition. */
export async function deciderRapprochement(propositionId: number, geste: Geste, ficheChoisie: number | null, auteur: Auteur): Promise<IssueRapprochement> {
  if (!(await disponible())) return { ok: false, motif: 'La migration 387 n’est pas appliquée.' };
  if (!Number.isInteger(propositionId) || propositionId <= 0) return { ok: false, motif: 'Proposition inconnue.' };
  return withTransaction(async (q) => {
    const { rows } = await q<{ sorte: 'dossier' | 'client_sans_dossier'; proprietaire_id: string | null }>(
      `SELECT sorte, proprietaire_id::text FROM gestion_rapprochement_proposition WHERE id = $1 FOR UPDATE`, [propositionId]);
    if (rows.length === 0) return { ok: false, motif: 'Proposition inconnue.' };
    const p = rows[0];
    const refus = verifierGeste({ sorte: p.sorte, fiche: p.proprietaire_id === null ? null : { id: Number(p.proprietaire_id), nom: '', dossierActuelId: null } }, geste, ficheChoisie);
    if (refus !== null) return { ok: false, motif: refus };
    let fiche: number | null = null;
    if (geste === 'valider') fiche = Number(p.proprietaire_id);
    if (geste === 'corriger') {
      const { rows: f } = await q<{ id: string }>(
        `SELECT id::text FROM gestion_annuaire_proprietaire WHERE id = $1 AND supprime_le IS NULL`, [ficheChoisie]);
      if (f.length === 0) return { ok: false, motif: 'Cette fiche n’existe pas (ou a été supprimée).' };
      fiche = Number(f[0].id);
    }
    await ecrireDecision(q, propositionId, geste, fiche, false, auteur);
    return { ok: true };
  });
}

/**
 * « Valider tous les SÛRS » : refusé tant que les 20 du contrôle à l'œil ne sont pas tous validés. Relu sous verrou dans
 * la transaction (deux clics simultanés ne valident pas deux fois).
 */
export async function validerTousLesSurs(auteur: Auteur): Promise<IssueRapprochement> {
  if (!(await disponible())) return { ok: false, motif: 'La migration 387 n’est pas appliquée.' };
  const avant = await lireRapprochement();
  if (avant.etat !== 'ok') return { ok: false, motif: 'Aucune proposition chargée.' };
  return withTransaction(async (q) => {
    await q(`SELECT id FROM gestion_rapprochement_proposition WHERE calcul = $1 ORDER BY id FOR UPDATE`, [avant.calcul]);
    const lu = await lireRapprochementDans(q, avant);
    const verdict = peutValiderTousLesSurs(lu);
    if (!verdict.ok) return { ok: false, motif: verdict.motif };
    const cibles = sursAValider(lu);
    for (const l of cibles) await ecrireDecision(q, l.id, 'valider', (l.fiche as FicheCourte).id, true, auteur);
    return { ok: true, nombre: cibles.length };
  });
}

/** Relit, DANS la transaction et sous verrou, la dernière décision de chaque proposition (le reste vient de la lecture). */
async function lireRapprochementDans(q: RequeteTx, lecture: Extract<Lecture, { etat: 'ok' }>): Promise<LigneRapprochement[]> {
  const { rows } = await q<{ proposition_id: string; geste: Geste; proprietaire_id: string | null; n: number }>(
    `SELECT DISTINCT ON (d.proposition_id) d.proposition_id::text, d.geste, d.proprietaire_id::text,
            (SELECT count(*)::int FROM gestion_rapprochement_decision x WHERE x.proposition_id = d.proposition_id) AS n
       FROM gestion_rapprochement_decision d JOIN gestion_rapprochement_proposition p ON p.id = d.proposition_id
      WHERE p.calcul = $1 ORDER BY d.proposition_id, d.id DESC`, [lecture.calcul]);
  const D = new Map(rows.map((r) => [Number(r.proposition_id), r]));
  return lecture.lignes.map((l) => {
    const d = D.get(l.id);
    return {
      ...l, nbDecisions: d?.n ?? 0,
      decision: d === undefined ? null : { id: 0, geste: d.geste, fiche: d.proprietaire_id === null ? null : { id: Number(d.proprietaire_id), nom: '', dossierActuelId: null }, enMasse: false, decideLe: '', decidePar: '' },
    };
  });
}

/** « Corriger » : chercher une fiche propriétaire par son nom (toutes les fiches non supprimées, archivées comprises). */
export async function chercherFiches(brut: string): Promise<{ id: number; nom: string; detail: string | null }[]> {
  const mots = brut.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/[^a-z0-9]+/).filter((m) => m.length >= 2).slice(0, 5);
  if (mots.length === 0) return [];
  const { rows } = await query<{ id: string; nom: string; detail: string | null }>(
    `SELECT p.id::text, p.nom_complet AS nom,
            concat_ws(' · ', CASE WHEN p.archive_le IS NOT NULL THEN 'archivée' END, CASE WHEN p.absent_le IS NOT NULL THEN 'absente de WIPPIMMO' END,
              (SELECT nullif(concat_ws(', ', lo.adresse, lo.commune), '') FROM gestion_annuaire_lot lo WHERE lo.proprietaire_id = p.id ORDER BY lo.id LIMIT 1)) AS detail
       FROM gestion_annuaire_proprietaire p
      WHERE p.supprime_le IS NULL AND ${mots.map((_, i) => `p.nom_normalise LIKE '%' || $${i + 1} || '%'`).join(' AND ')}
      ORDER BY p.nom_normalise, p.id LIMIT 15`, mots);
  return rows.map((r) => ({ id: Number(r.id), nom: r.nom, detail: r.detail === '' ? null : r.detail }));
}

// ── LE CHARGEMENT D'UN CALCUL (script `gestion-rapprochement-charger`) ─────────────────────────────────────────────────

export interface PropositionACharger {
  sorte: 'dossier' | 'client_sans_dossier'; copie_dossier_id: string | null; archive_dossier_id: string | null; nom_dossier: string | null;
  branche: string | null; nb_fichiers: number | null; niveau: Niveau; motif: string; raison: string; proprietaire_id: number | null;
  candidats: number[]; controle_oeil: boolean; vendu_en_gestion: boolean; groupe_plusieurs: string | null; principal: boolean;
  ancien_dossier_id: string | null; dernier_fichier_le: string | null;
}

/** Charge UN calcul, en une transaction ; refuse un calcul déjà chargé (la table est en ajout seul). */
export async function chargerPropositions(calcul: string, props: readonly PropositionACharger[]): Promise<IssueRapprochement> {
  if (!(await disponible())) return { ok: false, motif: 'La migration 387 n’est pas appliquée.' };
  if (!/^[0-9A-Za-z_-]{1,40}$/.test(calcul)) return { ok: false, motif: 'Étiquette de calcul invalide.' };
  return withTransaction(async (q) => {
    await q(`LOCK TABLE gestion_rapprochement_proposition IN SHARE ROW EXCLUSIVE MODE`);
    const { rows } = await q<{ n: number }>(`SELECT count(*)::int AS n FROM gestion_rapprochement_proposition WHERE calcul = $1`, [calcul]);
    if ((rows[0]?.n ?? 0) > 0) return { ok: false, motif: `Le calcul « ${calcul} » est déjà chargé.` };
    for (const p of props) {
      await q(
        `INSERT INTO gestion_rapprochement_proposition (calcul, sorte, copie_dossier_id, archive_dossier_id, nom_dossier, branche, nb_fichiers,
           niveau, motif, raison, proprietaire_id, candidats, controle_oeil, vendu_en_gestion, groupe_plusieurs, principal, ancien_dossier_id,
           dernier_fichier_le)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::bigint[],$13,$14,$15,$16,$17,$18)`,
        [calcul, p.sorte, p.copie_dossier_id, p.archive_dossier_id, p.nom_dossier, p.branche, p.nb_fichiers, p.niveau, p.motif, p.raison,
          p.proprietaire_id, p.candidats, p.controle_oeil, p.vendu_en_gestion, p.groupe_plusieurs, p.principal, p.ancien_dossier_id, p.dernier_fichier_le]);
    }
    return { ok: true, nombre: props.length };
  });
}
