import type { RequeteTx } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { immeubleDuBien } from '../gestion/copropriete';
import { enregistrerRapprochement } from './banRepo';
import type { EntreeUnification, Immeuble, PlanUnification } from './unificationStock';

/**
 * ══ 🔴🔴 APPLIQUER ET ANNULER L'UNIFICATION DU STOCK (Arno, 20/11/2026, « Adresse officielle BAN », lot 5 — plan validé le 20/11). IMPUR (base). ═════════
 *
 * APPLIQUER, dans la transaction de l'appelant (une seule), une passe journalisée (`gestion_adresse_operation`, migration 508) :
 *   · chaque bien reçoit son rapprochement (`gestion_lot_adresse_ban`, statut certain, à vérifier ou introuvable ; aucun rattachement automatique) — un
 *     bien qui a DÉJÀ un rapprochement en cours le garde ;
 *   · la copropriété reçoit son adresse officielle (`ban_id`) ; chaque adresse enregistrée reçoit la sienne et sa sorte (adresse / écriture) ;
 *   · un immeuble connu seulement par ses biens, sous plusieurs écritures, reçoit sa copropriété ; ses autres écritures y sont ajoutées en « écriture » ;
 *   · les regroupements 504 absorbés sont marqués (`absorbe_le`) ;
 *   · une ligne de journal par copropriété touchée (entité « copropriete ») ;
 *   · CHAQUE écriture est tracée (`gestion_adresse_operation_trace` : table, ligne, colonne, avant, après) — ce que l'annulation rejoue à l'envers.
 * 🔴 Une réunion de deux copropriétés ENREGISTRÉES (syndic, AG, contacts à déplacer) n'est PAS encore écrite : le plan qui en contient une est refusé,
 * rien n'est fait (aucune en recette au 20/11/2026). Rien n'est jamais supprimé ; les adresses WIPPIMMO ne sont pas touchées ; aucun digicode, syndic,
 * AG ni contact n'est modifié.
 *
 * ANNULER une passe : les rapprochements qu'elle a posés sont FERMÉS, les valeurs modifiées reprennent leur valeur d'avant, les adresses ajoutées à une
 * copropriété qui existait sont RETIRÉES. Seule exception, et seulement si rien d'autre ne s'y est rattaché depuis : la copropriété que la passe a CRÉÉE
 * et les adresses qu'elle y a posées sont effacées (la table n'a pas de « retrait », et une copropriété vide resterait dans la liste) — sinon l'annulation
 * est refusée, rien n'est fait.
 */

export class RefusUnification extends Error {}

const ACTION_JOURNAL = 'adresse_officielle_unifiee';
const ACTION_ANNULATION = 'adresse_officielle_unification_annulee';

async function tracer(q: RequeteTx, op: number, table: string, ligne: string | number, geste: 'insertion' | 'modification', colonne: string | null = null, avant: string | null = null, apres: string | null = null): Promise<void> {
  await q(`INSERT INTO gestion_adresse_operation_trace (operation_id, table_nom, ligne_id, colonne, avant, apres, geste) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [op, table, String(ligne), colonne, avant, apres, geste]);
}

/** Les phrases du journal d'un immeuble touché. PUR. */
export function phraseUnification(i: Immeuble, op: number): string {
  const n = (s: string) => i.actions.filter((a) => a.sorte === s).length;
  const morceaux = [
    `adresse officielle ${i.officielle}`,
    n('ban_adresse') ? `${n('ban_adresse')} adresse(s) enregistrée(s) rapprochée(s), dont ${i.actions.filter((a) => a.sorte === 'ban_adresse' && a.devient === 'ecriture').length} devenue(s) écriture(s) d’origine` : '',
    n('creer_copro') ? 'copropriété créée (immeuble connu par ses biens sous plusieurs écritures)' : '',
    n('ajouter_ecriture') ? `${n('ajouter_ecriture')} écriture(s) d’origine ajoutée(s)` : '',
    n('absorber_504') ? `${n('absorber_504')} regroupement(s) 504 absorbé(s)` : '',
  ].filter((x) => x !== '');
  return `Unification des adresses officielles (passe n° ${op}) : ${morceaux.join(' ; ')}`;
}

export interface IssueApplication { operationId: number; rapprochements: number; dejaRapproches: number; coproprietes: number; adresses: number; creees: number; ecritures: number; absorbes: number }

/** APPLIQUE le plan, dans la transaction de l'appelant. Lève `RefusUnification` (la transaction est alors annulée) au premier écart. */
export async function appliquerUnification(q: RequeteTx, plan: PlanUnification, entree: EntreeUnification, base: string, auteur: Auteur): Promise<IssueApplication> {
  if (plan.immeubles.some((i) => i.actions.some((a) => a.sorte === 'reunir_copro'))) {
    throw new RefusUnification('Le plan réunit des copropriétés enregistrées (syndic, AG, contacts à déplacer) : ce geste n’est pas encore écrit. Rien n’est fait.');
  }
  const { rows: [o] } = await q<{ id: string }>(
    `INSERT INTO gestion_adresse_operation (nature, base, plan, cree_par, cree_par_libelle) VALUES ('unification_stock', $1, $2::jsonb, $3, $4) RETURNING id::text`,
    [base, JSON.stringify({ biens: plan.biens, coproprietes: plan.coproprietes, actions: plan.actions, conflits: plan.immeubles.flatMap((i) => i.conflits), digicodes: plan.digicodes }), auteur.id, auteur.libelle]);
  const op = Number(o.id);
  const issue: IssueApplication = { operationId: op, rapprochements: 0, dejaRapproches: 0, coproprietes: 0, adresses: 0, creees: 0, ecritures: 0, absorbes: 0 };

  // ① les rapprochements des biens (un bien qui en a déjà un en cours le garde)
  for (const b of entree.biens) {
    if (immeubleDuBien(b) === '') continue;
    const r = entree.rapprochementDesBiens.get(b.id);
    if (r === undefined) continue;
    const { rows: deja } = await q<{ n: number }>('SELECT count(*)::int AS n FROM gestion_lot_adresse_ban WHERE lot_id = $1 AND fin IS NULL', [b.id]);
    if ((deja[0]?.n ?? 0) > 0) { issue.dejaRapproches++; continue; }
    await enregistrerRapprochement(q, b.id, r, { origine: 'stock', methode: 'similarite_voie', operationId: op }, auteur);
    issue.rapprochements++;
  }

  // ② les copropriétés, immeuble par immeuble
  for (const i of plan.immeubles) {
    if (i.actions.length === 0) continue;
    let coproId: number | null = typeof i.cible === 'number' ? i.cible : null;
    const idDeCle = new Map<string, number>();
    for (const a of i.actions) {
      if (a.sorte === 'creer_copro') {
        const b = entree.biens.find((x) => i.lignes.includes(a.cle) && immeubleDuBien(x) === a.libelle) ?? null;
        const { rows } = await q<{ id: string }>(
          `INSERT INTO gestion_copropriete (cle_immeuble, libelle, code_postal, commune, cree_par, cree_par_libelle, ban_id) VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (cle_immeuble) DO NOTHING RETURNING id::text`, [a.cle, a.libelle, b?.codePostal ?? null, b?.commune ?? null, auteur.id, auteur.libelle, a.banId]);
        if (rows[0] === undefined) throw new RefusUnification(`La copropriété « ${a.libelle} » existe déjà : le plan n’est plus à jour. Rien n’est fait.`);
        coproId = Number(rows[0].id); idDeCle.set(a.cle, coproId);
        await tracer(q, op, 'gestion_copropriete', coproId, 'insertion');
        issue.creees++;
      } else if (a.sorte === 'ban_principale') {
        const { rows: [c] } = await q<{ ban_id: string | null }>('SELECT ban_id FROM gestion_copropriete WHERE id = $1 FOR UPDATE', [a.coproId]);
        if (c === undefined) throw new RefusUnification(`La copropriété n° ${a.coproId} n’existe plus : le plan n’est plus à jour. Rien n’est fait.`);
        await q('UPDATE gestion_copropriete SET ban_id = $2 WHERE id = $1', [a.coproId, a.banId]);
        await tracer(q, op, 'gestion_copropriete', a.coproId, 'modification', 'ban_id', c.ban_id, a.banId);
        issue.coproprietes++;
      } else if (a.sorte === 'ban_adresse') {
        const { rows: [x] } = await q<{ ban_id: string | null; sorte: string }>(
          'SELECT ban_id, sorte FROM gestion_copropriete_adresse WHERE id = $1 AND retire_le IS NULL FOR UPDATE', [a.adresseId]);
        if (x === undefined) throw new RefusUnification(`L’adresse n° ${a.adresseId} n’est plus en cours : le plan n’est plus à jour. Rien n’est fait.`);
        await q('UPDATE gestion_copropriete_adresse SET ban_id = $2, sorte = $3 WHERE id = $1', [a.adresseId, a.banId, a.devient]);
        await tracer(q, op, 'gestion_copropriete_adresse', a.adresseId, 'modification', 'ban_id', x.ban_id, a.banId);
        await tracer(q, op, 'gestion_copropriete_adresse', a.adresseId, 'modification', 'sorte', x.sorte, a.devient);
        issue.adresses++;
      } else if (a.sorte === 'ajouter_ecriture') {
        const cible = idDeCle.get(a.coproCle) ?? coproId;
        if (cible === null) throw new RefusUnification(`Aucune copropriété pour l’écriture « ${a.libelle} » : rien n’est fait.`);
        const b = entree.biens.find((x) => immeubleDuBien(x) === a.libelle) ?? null;
        const { rows: [x] } = await q<{ id: string }>(
          `INSERT INTO gestion_copropriete_adresse (copropriete_id, cle_immeuble, libelle, code_postal, commune, cree_par, cree_par_libelle, sorte, ban_id, operation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'ecriture', $8, $9) RETURNING id::text`,
          [cible, a.cle, a.libelle, b?.codePostal ?? null, b?.commune ?? null, auteur.id, auteur.libelle, a.banId, op]);
        await tracer(q, op, 'gestion_copropriete_adresse', x.id, 'insertion');
        issue.ecritures++;
      } else if (a.sorte === 'absorber_504') {
        const { rows } = await q<{ id: string }>(
          'UPDATE gestion_copropriete_regroupement SET absorbe_le = now(), absorbe_operation_id = $2 WHERE id = $1 AND absorbe_le IS NULL AND degroupe_le IS NULL RETURNING id::text',
          [a.regroupementId, op]);
        if (rows[0] === undefined) throw new RefusUnification(`Le regroupement n° ${a.regroupementId} n’est plus en cours : le plan n’est plus à jour. Rien n’est fait.`);
        await tracer(q, op, 'gestion_copropriete_regroupement', a.regroupementId, 'modification', 'absorbe_le', null, 'now');
        issue.absorbes++;
      }
    }
    if (coproId !== null) {
      await q(`INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_id, auteur_libelle) VALUES ('copropriete', $1, $2, $3, $4, $5)`,
        [coproId, ACTION_JOURNAL, phraseUnification(i, op), auteur.id, auteur.libelle]);
    }
  }
  return issue;
}

export interface IssueAnnulation { operationId: number; fermes: number; restaures: number; retirees: number; effaces: number }

/** ANNULE une passe, dans la transaction de l'appelant. Lève `RefusUnification` (rien n'est fait) si elle est inconnue, déjà annulée, ou si une
 *  copropriété qu'elle a créée a reçu des données depuis. */
export async function annulerUnification(q: RequeteTx, op: number, auteur: Auteur): Promise<IssueAnnulation> {
  const { rows: [o] } = await q<{ annulee: boolean }>('SELECT annulee_le IS NOT NULL AS annulee FROM gestion_adresse_operation WHERE id = $1 FOR UPDATE', [op]);
  if (o === undefined) throw new RefusUnification(`La passe n° ${op} n’existe pas. Rien n’est fait.`);
  if (o.annulee) throw new RefusUnification(`La passe n° ${op} est déjà annulée. Rien n’est fait.`);
  const { rows: trace } = await q<{ table_nom: string; ligne_id: string; colonne: string | null; avant: string | null; geste: string }>(
    'SELECT table_nom, ligne_id, colonne, avant, geste FROM gestion_adresse_operation_trace WHERE operation_id = $1 ORDER BY id DESC', [op]);
  const creees = trace.filter((t) => t.geste === 'insertion' && t.table_nom === 'gestion_copropriete').map((t) => t.ligne_id);
  // ① les refus AVANT toute écriture : une copropriété créée par la passe qui a reçu autre chose depuis
  for (const id of creees) {
    const { rows: [r] } = await q<{ n: number }>(
      `SELECT ((SELECT count(*) FROM gestion_copropriete_syndic WHERE copropriete_id = $1) + (SELECT count(*) FROM gestion_copropriete_ag WHERE copropriete_id = $1)
             + (SELECT count(*) FROM gestion_copropriete_contact WHERE copropriete_id = $1) + (SELECT count(*) FROM gestion_copropriete_batiment WHERE copropriete_id = $1)
             + (SELECT count(*) FROM gestion_copropriete_adresse WHERE copropriete_id = $1 AND operation_id IS DISTINCT FROM $2))::int AS n`, [id, op]);
    if ((r?.n ?? 0) > 0) throw new RefusUnification(`La copropriété n° ${id}, créée par la passe n° ${op}, a reçu d’autres données depuis : l’annulation se fait à la main. Rien n’est fait.`);
  }
  const issue: IssueAnnulation = { operationId: op, fermes: 0, restaures: 0, retirees: 0, effaces: 0 };
  // ② les rapprochements posés par la passe : fermés
  const { rows: f } = await q<{ id: string }>(
    `UPDATE gestion_lot_adresse_ban SET fin = now(), fin_par = $2, fin_par_libelle = $3, fin_motif = $4 WHERE operation_id = $1 AND fin IS NULL RETURNING id::text`,
    [op, auteur.id, auteur.libelle, `annulation de la passe d’unification n° ${op}`]);
  issue.fermes = f.length;
  // ③ la trace, à l'envers : les modifications reprennent leur valeur ; les adresses ajoutées sont retirées (effacées sur une copropriété créée)
  for (const t of trace) {
    if (t.geste === 'modification' && t.table_nom === 'gestion_copropriete' && t.colonne === 'ban_id') {
      await q('UPDATE gestion_copropriete SET ban_id = $2 WHERE id = $1', [t.ligne_id, t.avant]); issue.restaures++;
    } else if (t.geste === 'modification' && t.table_nom === 'gestion_copropriete_adresse' && (t.colonne === 'ban_id' || t.colonne === 'sorte')) {
      await q(`UPDATE gestion_copropriete_adresse SET ${t.colonne === 'ban_id' ? 'ban_id' : 'sorte'} = $2 WHERE id = $1`, [t.ligne_id, t.avant]); issue.restaures++;
    } else if (t.geste === 'modification' && t.table_nom === 'gestion_copropriete_regroupement' && t.colonne === 'absorbe_le') {
      await q('UPDATE gestion_copropriete_regroupement SET absorbe_le = NULL, absorbe_operation_id = NULL WHERE id = $1', [t.ligne_id]); issue.restaures++;
    } else if (t.geste === 'insertion' && t.table_nom === 'gestion_copropriete_adresse') {
      const { rows: [a] } = await q<{ copro: string }>('SELECT copropriete_id::text AS copro FROM gestion_copropriete_adresse WHERE id = $1', [t.ligne_id]);
      if (a !== undefined && creees.includes(a.copro)) { await q('DELETE FROM gestion_copropriete_adresse WHERE id = $1', [t.ligne_id]); issue.effaces++; }
      else { await q('UPDATE gestion_copropriete_adresse SET retire_le = now(), retire_par_libelle = $2 WHERE id = $1 AND retire_le IS NULL', [t.ligne_id, auteur.libelle]); issue.retirees++; }
    }
  }
  for (const id of creees) {
    await q(`INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_id, auteur_libelle) VALUES ('copropriete', $1, $2, $3, $4, $5)`,
      [id, ACTION_ANNULATION, `Annulation de la passe d’unification n° ${op} : la copropriété qu’elle avait créée est effacée (rien ne s’y était rattaché)`, auteur.id, auteur.libelle]);
    await q('DELETE FROM gestion_copropriete WHERE id = $1', [id]); issue.effaces++;
  }
  const { rows: touchees } = await q<{ id: string }>(
    `SELECT DISTINCT ligne_id AS id FROM gestion_adresse_operation_trace WHERE operation_id = $1 AND table_nom = 'gestion_copropriete' AND geste = 'modification'`, [op]);
  for (const c of touchees) {
    await q(`INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_id, auteur_libelle) VALUES ('copropriete', $1, $2, $3, $4, $5)`,
      [c.id, ACTION_ANNULATION, `Annulation de la passe d’unification n° ${op} : valeurs d’avant reprises`, auteur.id, auteur.libelle]);
  }
  await q('UPDATE gestion_adresse_operation SET annulee_le = now(), annulee_par_libelle = $2 WHERE id = $1', [op, auteur.libelle]);
  return issue;
}

/** L'ÉTAT que l'unification touche (ce qui est EN COURS), pour prouver qu'une annulation le rend identique. LECTURE SEULE. */
export async function etatUnification(q: RequeteTx): Promise<string> {
  // une après l'autre : une même connexion (la transaction) ne mène qu'une requête à la fois
  const parts: unknown[] = [];
  for (const sql of ['SELECT lot_id, ban_id, statut FROM gestion_lot_adresse_ban WHERE fin IS NULL ORDER BY lot_id',
    'SELECT id, cle_immeuble, libelle, ban_id FROM gestion_copropriete ORDER BY id',
    'SELECT id, copropriete_id, cle_immeuble, sorte, ban_id FROM gestion_copropriete_adresse WHERE retire_le IS NULL ORDER BY id',
    'SELECT id, degroupe_le IS NULL AS ouvert, absorbe_le IS NULL AS non_absorbe FROM gestion_copropriete_regroupement ORDER BY id']) parts.push((await q<Record<string, unknown>>(sql)).rows);
  return JSON.stringify(parts);
}
