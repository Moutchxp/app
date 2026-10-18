import { query, withTransaction } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { colonneExisteMemo } from './sondeLocation';
import { cleEntretien, libelleEntretien, verifierEntretiens, type Entretien } from './entretien';

/**
 * ══ 🔴🔴 TUILE LOCATION — ENTRETIENS D'UN BIEN, DÉTACHEMENT D'UNE ANNEXE (migration 379). IMPUR (base). ═════════════════
 *
 * 🔴 RIEN N'EST EFFACÉ : un entretien retiré (ligne supprimée, ou « Non ») reçoit `retire_le` ; seuls les entretiens qui ont
 * changé sont retirés / ajoutés. Le DÉTACHEMENT est une marque sur l'annexe : le lien parent (`gestion_lot_annexe`, en
 * ajout seul) n'est jamais touché. Sans la migration 379, la lecture rend « rien » et l'écriture refuse en le disant.
 */

export function entretienDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_annuaire_lot', 'entretien_a_prevoir');
}

const SANS_379 = 'L’entretien et le détachement des annexes ne sont pas encore installés (migration 379).';

async function journal(lotId: number, action: string, commentaire: string, auteur: Auteur): Promise<void> {
  await query(`INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_id, auteur_libelle) VALUES ('annuaire_lot', $1, $2, $3, $4, $5)`,
    [lotId, action, commentaire, auteur.id, auteur.libelle]);
}

/** « Entretien à prévoir » et les entretiens en cours d'un bien. */
export async function lireEntretiens(lotId: number): Promise<{ aPrevoir: boolean | null; entretiens: Entretien[] } | null> {
  if (!(await entretienDisponible())) return null;
  const { rows: l } = await query<{ a: boolean | null }>('SELECT entretien_a_prevoir AS a FROM gestion_annuaire_lot WHERE id = $1', [lotId]);
  if (l[0] === undefined) return null;
  const { rows } = await query<{ sorte: Entretien['sorte']; nom: string | null; d: string | null }>(
    `SELECT sorte, nom, date_anniversaire::text AS d FROM gestion_lot_entretien WHERE lot_id = $1 AND retire_le IS NULL
      ORDER BY CASE sorte WHEN 'chaudiere' THEN 0 WHEN 'ramonage' THEN 1 ELSE 2 END, id`, [lotId]);
  return { aPrevoir: l[0].a, entretiens: rows.map((r) => ({ sorte: r.sorte, nom: r.nom, dateAnniversaire: r.d })) };
}

/** Enregistre « Entretien à prévoir » et ses entretiens (Non vide le tout) ; seuls les changements sont écrits. */
export async function enregistrerEntretiens(lotId: number, aPrevoirBrut: unknown, brut: unknown, auteur: Auteur):
  Promise<{ ok: true } | { ok: false; motif: string }> {
  const v = verifierEntretiens(aPrevoirBrut, brut);
  if (!v.ok) return v;
  if (!(await entretienDisponible())) return { ok: false, motif: SANS_379 };
  const changes = await withTransaction(async (q) => {
    const { rows: l } = await q<{ a: boolean | null }>('SELECT entretien_a_prevoir AS a FROM gestion_annuaire_lot WHERE id = $1 FOR UPDATE', [lotId]);
    if (l[0] === undefined) return null;
    const { rows } = await q<{ id: string; sorte: Entretien['sorte']; nom: string | null; d: string | null }>(
      'SELECT id::text, sorte, nom, date_anniversaire::text AS d FROM gestion_lot_entretien WHERE lot_id = $1 AND retire_le IS NULL', [lotId]);
    const voulus = new Map(v.entretiens.map((e) => [cleEntretien(e), e]));
    const gardes = new Set<string>();
    const retires: string[] = [];
    for (const r of rows) {
      const cle = cleEntretien({ sorte: r.sorte, nom: r.nom, dateAnniversaire: r.d });
      if (voulus.has(cle) && !gardes.has(cle)) { gardes.add(cle); continue; }
      await q('UPDATE gestion_lot_entretien SET retire_le = now(), retire_par_libelle = $2 WHERE id = $1', [Number(r.id), auteur.libelle]);
      retires.push(libelleEntretien({ sorte: r.sorte, nom: r.nom }));
    }
    const ajoutes: string[] = [];
    for (const [cle, e] of voulus) {
      if (gardes.has(cle)) continue;
      await q('INSERT INTO gestion_lot_entretien (lot_id, sorte, nom, date_anniversaire, cree_par_libelle) VALUES ($1, $2, $3, $4::date, $5)',
        [lotId, e.sorte, e.nom, e.dateAnniversaire, auteur.libelle]);
      ajoutes.push(`${libelleEntretien(e)}${e.dateAnniversaire ? ` (${e.dateAnniversaire})` : ''}`);
    }
    if (l[0].a !== v.aPrevoir) await q('UPDATE gestion_annuaire_lot SET entretien_a_prevoir = $2 WHERE id = $1', [lotId, v.aPrevoir]);
    return { avant: l[0].a, retires, ajoutes };
  });
  if (changes === null) return { ok: false, motif: 'Ce bien n’existe plus.' };
  if (changes.avant !== v.aPrevoir || changes.retires.length + changes.ajoutes.length > 0) {
    const mot = (x: boolean | null): string => (x === null ? 'non renseigné' : x ? 'oui' : 'non');
    await journal(lotId, 'location_entretien', `entretien à prévoir : ${mot(changes.avant)} → ${mot(v.aPrevoir)}`
      + `${changes.ajoutes.length > 0 ? ` ; ajoutés : ${changes.ajoutes.join(', ')}` : ''}${changes.retires.length > 0 ? ` ; retirés : ${changes.retires.join(', ')}` : ''}`, auteur);
  }
  return { ok: true };
}

/**
 * « Détacher » / « Rattacher » une annexe : la marque `annexe_detachee_le` seulement. Le lien parent reste — elle reste
 * affichée sous son logement, étiquette « Détachée » ; détachée, elle ne sort plus avec lui du portefeuille.
 */
export async function detacherAnnexe(annexeId: number, detacher: boolean, auteur: Auteur): Promise<{ etat: 'ok'; data: undefined } | { etat: 'refus'; motif: string } | { etat: 'inconnu' }> {
  if (!(await entretienDisponible())) return { etat: 'refus', motif: SANS_379 };
  const { rows } = await query<{ parent: string }>('SELECT parent_id::text AS parent FROM gestion_lot_annexe WHERE annexe_id = $1', [annexeId]);
  if (rows[0] === undefined) return { etat: 'inconnu' };
  await query(
    `UPDATE gestion_annuaire_lot SET annexe_detachee_le = ${detacher ? 'coalesce(annexe_detachee_le, now())' : 'NULL'},
            annexe_detachee_par_libelle = ${detacher ? 'coalesce(annexe_detachee_par_libelle, $2)' : 'NULL'} WHERE id = $1`,
    detacher ? [annexeId, auteur.libelle] : [annexeId]);
  const mot = detacher ? 'détachée : louable séparément (son lien avec le logement est gardé)' : 'rattachée : de nouveau dans l’ensemble loué avec le logement';
  await journal(annexeId, detacher ? 'location_annexe_detachee' : 'location_annexe_rattachee', `annexe ${mot}`, auteur);
  await journal(Number(rows[0].parent), detacher ? 'location_annexe_detachee' : 'location_annexe_rattachee', `annexe ${annexeId} ${mot}`, auteur);
  return { etat: 'ok', data: undefined };
}
