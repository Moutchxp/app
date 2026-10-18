import { randomBytes } from 'node:crypto';
import { query, withTransaction, type RequeteTx } from '../db/client';
import { ecrireDateSortie } from './dateSortieOccupation';
import type { Auteur } from '../gestion/gestes';
import { chargerConfigGestion } from '../gestion/config';
import { transportParDefaut, type TransportDemande } from '../gestion/envoiDemandeTache';
import { messageIdDemande } from '../gestion/acceptationTache';
import { conditionCoordonneeVivante } from '../gestion/coordonneeVivante';
import { sqlPersonneVivante } from '../gestion/personneVivanteSql';
import { SQL_AUJOURDHUI_PARIS } from '../temps/paris';
import { colonneExisteMemo } from './sondeLocation';
import { analyserTermePortefeuille } from './recherchePortefeuille';
import {
  LIBELLE_SITUATION_PARKING, LIBELLE_TYPE_LOCAL, LIBELLE_TYPE_LOGEMENT, LIBELLE_TYPE_PARKING,
  type SituationParking, type TypeLocal, type TypeLogement, type TypeParking,
} from './bienComplet';
import { LIBELLE_CATEGORIE, type Categorie } from './locationBien';
import {
  htmlMailSortie, issueSortie, objetMailSortie, texteMailSortie, verifierCorrection, verifierSortie,
  type BailLogement, type DonneesMailSortie, type EncartLogement, type LocataireDuBail, type LotEncart, type OccupantTrouve, type SortieEnregistree,
} from './sortieLocataires';

export type { OccupantTrouve };

/**
 * ══ 🔴🔴 TUILE LOCATION — SORTIE D'UN OU PLUSIEURS LOCATAIRES (Arno, 19/10/2026). IMPUR (base + envoi). ═════════════════
 *
 * Voir `sortieLocataires.ts` pour les règles. Ici :
 *   · la RECHERCHE des seuls occupants en place à la date du jour (nom, téléphone, e-mail, adresse du logement) ;
 *   · la LECTURE d'un bail (ses locataires en place, ses annexes, les autres occupants du lot) ;
 *   · l'ÉCRITURE de la sortie, de sa correction (date) et de son annulation — chaque geste dans UNE transaction, dans
 *     l'ordre LIRE (FOR UPDATE) → REFUSER si incohérent → ÉCRIRE. ⚠️ `withTransaction` COMMITE au retour normal : un
 *     refus est donc rendu AVANT la première écriture, jamais après ;
 *   · le MAIL de confirmation, APRÈS l'écriture, jamais bloquant.
 * 🔴 RIEN N'EST EFFACÉ : la sortie DATE l'occupation (`gestion_annuaire_occupation.sortie`), la ligne reste — le sortant
 *    reste rattaché au bien dans son historique. Chaque geste est écrit au journal append-only (`gestion_journal`).
 * 🔴 AVANT ET APRÈS LES MIGRATIONS LOCATION : étage, porte, catégorie, type de logement, annexes (372) et droit Location
 *    (371) sont SONDÉS hors transaction ; absents, la colonne vaut NULL et le lien d'annexe est ignoré.
 */

export type IssueSortie<T> =
  | { etat: 'ok'; data: T }
  | { etat: 'refus'; motif: string }
  | { etat: 'inconnu' };

const LIMITE = 30;

/** Les colonnes et tables facultatives, sondées HORS transaction (règle de `app/lib/gestion/schema.ts`). */
async function schema(): Promise<{ etage: string; porte: string; categorie: string; typeLogement: string; annexes: boolean }> {
  const col = async (c: string, alias = 'lo'): Promise<string> =>
    ((await colonneExisteMemo('gestion_annuaire_lot', c)) ? `${alias}.${c}::text` : 'NULL::text');
  return {
    etage: await col('etage'), porte: await col('porte'), categorie: await col('categorie'),
    typeLogement: await col('type_logement'), annexes: await colonneExisteMemo('gestion_lot_annexe', 'annexe_id'),
  };
}

/** Le type affiché d'un lot : le type de logement (372+) traduit, sinon nature / type WIPPIMMO. */
const typeAffiche = (typeLogement: string | null, nature: string | null): string | null =>
  (typeLogement ? (LIBELLE_TYPE_LOGEMENT[typeLogement as TypeLogement] ?? typeLogement) : nature);

// ══ LA RECHERCHE DES OCCUPANTS ═══════════════════════════════════════════════════════════════════════════════════════


/**
 * LES OCCUPANTS EN PLACE À LA DATE DU JOUR (entrée passée ou inconnue, sortie absente ou à venir), et eux seuls. Par
 * nom, téléphone, e-mail du locataire, ou adresse du logement. Une occupation d'ANNEXE n'est pas rendue quand le même
 * locataire occupe le logement : c'est le logement qu'on fait sortir (ses annexes suivent).
 */
export async function rechercherOccupants(brut: string): Promise<OccupantTrouve[]> {
  const t = analyserTermePortefeuille(brut);
  if (t.vide) return [];
  const s = await schema();
  const coordVivante = await conditionCoordonneeVivante('c');
  const vivante = await sqlPersonneVivante('l');
  const tests: string[] = [];
  if (t.mots.length > 0) {
    tests.push(t.mots.map((_, i) => `l.nom_normalise LIKE '%' || ($3::text[])[${i + 1}] || '%'`).join(' AND '));
    tests.push(t.mots.map((_, i) => `coalesce(lo.adresse_normalisee, '') LIKE '%' || ($3::text[])[${i + 1}] || '%'`).join(' AND '));
  }
  const coord: string[] = [];
  if (t.chiffres !== null) coord.push(`(c.sorte = 'telephone' AND regexp_replace(c.valeur, '\\D', '', 'g') LIKE '%' || $1 || '%')`);
  if (t.email !== null) coord.push(`(c.sorte = 'email' AND lower(c.valeur) LIKE '%' || $2 || '%')`);
  if (coord.length > 0) {
    tests.push(`EXISTS (SELECT 1 FROM gestion_annuaire_contact c WHERE c.sujet = 'locataire' AND c.sujet_id = l.id
      AND c.absent_le IS NULL${coordVivante} AND (${coord.join(' OR ')}))`);
  }
  if (tests.length === 0) return [];
  const coordonnee = (sorte: string): string => `(SELECT c.valeur_brute FROM gestion_annuaire_contact c
      WHERE c.sujet = 'locataire' AND c.sujet_id = l.id AND c.sorte = '${sorte}' AND c.absent_le IS NULL${coordVivante} ORDER BY c.rang, c.id LIMIT 1)`;
  const sansAnnexeDoublon = s.annexes ? `AND NOT EXISTS (SELECT 1 FROM gestion_lot_annexe a
      JOIN gestion_annuaire_occupation o2 ON o2.lot_id = a.parent_id AND o2.locataire_id = o.locataire_id AND o2.sortie IS NULL
      WHERE a.annexe_id = o.lot_id)` : '';
  // Le préavis (migration 383, sondée) : un locataire en préavis reste OCCUPANT — il figure ici, avec sa date maximale.
  const avecPreavis = await colonneExisteMemo('gestion_location_preavis', 'date_max');
  const { rows } = await query<{ occupation_id: string; locataire_id: string; nom: string; telephone: string | null; email: string | null;
    lot_id: string; adresse: string | null; etage: string | null; porte: string | null; proprietaire: string | null; preavis_date_max: string | null }>(
    `SELECT o.id::text AS occupation_id, l.id::text AS locataire_id, l.nom, ${coordonnee('telephone')} AS telephone, ${coordonnee('email')} AS email,
            lo.id::text AS lot_id, nullif(concat_ws(', ', lo.adresse, nullif(concat_ws(' ', lo.code_postal, lo.commune), '')), '') AS adresse,
            ${s.etage} AS etage, ${s.porte} AS porte, coalesce(pr.nom_complet, lo.proprietaire_texte) AS proprietaire,
            ${avecPreavis ? `(SELECT p.date_max::text FROM gestion_location_preavis p WHERE p.occupation_id = o.id AND p.remplace_le IS NULL AND p.annule_le IS NULL LIMIT 1)` : 'NULL::text'} AS preavis_date_max
       FROM gestion_annuaire_occupation o
       JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
       JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
       LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
      WHERE (length($1::text) >= 0 AND length($2::text) >= 0 AND cardinality($3::text[]) >= 0)
        AND ${vivante}
        AND (o.entree IS NULL OR o.entree <= ${SQL_AUJOURDHUI_PARIS})
        AND (o.sortie IS NULL OR o.sortie > ${SQL_AUJOURDHUI_PARIS})
        ${sansAnnexeDoublon}
        AND (${tests.map((x) => `(${x})`).join(' OR ')})
      ORDER BY l.nom_normalise, lo.adresse_normalisee NULLS LAST, o.id
      LIMIT ${LIMITE}`,
    [t.chiffres ?? '', t.email ?? '', t.mots]);
  return rows.map((r) => ({
    occupationId: Number(r.occupation_id), locataireId: Number(r.locataire_id), nom: r.nom, telephone: r.telephone, email: r.email,
    lotId: Number(r.lot_id), adresse: r.adresse, etage: r.etage, porte: r.porte, proprietaire: r.proprietaire,
    preavisDateMax: r.preavis_date_max ?? null,
  }));
}

// ══ LA LECTURE D'UN BAIL ═════════════════════════════════════════════════════════════════════════════════════════════

type Lecteur = RequeteTx | typeof query;

/**
 * Le bail d'une occupation : le lot, ses locataires EN PLACE qui partagent la date d'entrée (sortie non enregistrée),
 * ses annexes occupées par eux, les autres occupants du lot. `verrou` = lecture FOR UPDATE (dans la transaction).
 */
async function lireBailAvec(q: Lecteur, occupationId: number, s: Awaited<ReturnType<typeof schema>>, verrou: boolean): Promise<BailLogement | null> {
  const pourMaj = verrou ? ' FOR UPDATE OF o' : '';
  const { rows: base } = await (q as typeof query)<{ lot_id: string; entree: string | null }>(
    `SELECT o.lot_id::text, o.entree::text FROM gestion_annuaire_occupation o WHERE o.id = $1 AND o.lot_id IS NOT NULL${pourMaj}`, [occupationId]);
  if (base[0] === undefined) return null;
  const lotId = Number(base[0].lot_id);
  const { rows: lot } = await (q as typeof query)<{ adresse: string | null; type_logement: string | null; nature: string | null; etage: string | null;
    porte: string | null; proprietaire: string | null }>(
    `SELECT nullif(concat_ws(', ', lo.adresse, nullif(concat_ws(' ', lo.code_postal, lo.commune), '')), '') AS adresse,
            ${s.typeLogement} AS type_logement, coalesce(lo.nature, lo.type_bien) AS nature, ${s.etage} AS etage, ${s.porte} AS porte,
            coalesce(pr.nom_complet, lo.proprietaire_texte) AS proprietaire
       FROM gestion_annuaire_lot lo LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id WHERE lo.id = $1`, [lotId]);
  if (lot[0] === undefined) return null;
  // Toutes les occupations EN PLACE (sortie non enregistrée) du lot — verrouillées : personne ne les change pendant le geste.
  const { rows: occ } = await (q as typeof query)<{ id: string; locataire_id: string; nom: string; entree: string | null }>(
    `SELECT o.id::text, o.locataire_id::text, l.nom, o.entree::text
       FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
      WHERE o.lot_id = $1 AND o.sortie IS NULL ORDER BY l.nom_normalise, o.id${pourMaj}`, [lotId]);
  const entree = base[0].entree;
  const duBail = occ.filter((o) => o.entree === entree);
  const locataires: LocataireDuBail[] = duBail.map((o) => ({
    occupationId: Number(o.id), locataireId: Number(o.locataire_id), nom: o.nom, entree: o.entree,
  }));
  const autresOccupants = [...new Set(occ.filter((o) => o.entree !== entree).map((o) => o.nom))];
  let annexes: BailLogement['annexes'] = [];
  if (s.annexes && locataires.length > 0) {
    const { rows: an } = await (q as typeof query)<{ lot_id: string; libelle: string; occupation_id: string | null; locataire_id: string | null }>(
      `SELECT al.id::text AS lot_id,
              concat_ws(' ', coalesce(initcap(${s.categorie.replace('lo.', 'al.')}), al.nature, al.type_bien, 'Annexe'),
                        CASE WHEN ${s.porte.replace('lo.', 'al.')} IS NOT NULL THEN 'n° ' || ${s.porte.replace('lo.', 'al.')} END,
                        CASE WHEN al.wippimmo_id NOT LIKE 'app-%' THEN 'lot ' || al.wippimmo_id END) AS libelle,
              o.id::text AS occupation_id, o.locataire_id::text
         FROM gestion_lot_annexe a JOIN gestion_annuaire_lot al ON al.id = a.annexe_id
         LEFT JOIN gestion_annuaire_occupation o ON o.lot_id = al.id AND o.sortie IS NULL AND o.locataire_id = ANY($2::bigint[])
        WHERE a.parent_id = $1 ORDER BY al.id, o.id`,
      [lotId, locataires.map((l) => l.locataireId)]);
    const parLot = new Map<number, BailLogement['annexes'][number]>();
    for (const r of an) {
      const id = Number(r.lot_id);
      const a = parLot.get(id) ?? { lotId: id, libelle: r.libelle, occupations: [] };
      if (r.occupation_id !== null && r.locataire_id !== null) a.occupations.push({ occupationId: Number(r.occupation_id), locataireId: Number(r.locataire_id) });
      parLot.set(id, a);
    }
    // Seules les annexes LIÉES AU BAIL (occupées par un de ses locataires) le suivent.
    annexes = [...parLot.values()].filter((a) => a.occupations.length > 0);
    // ⚠️ FOR UPDATE est refusé sur le côté facultatif d'une jointure externe : on verrouille ces occupations à part.
    const aVerrouiller = annexes.flatMap((a) => a.occupations.map((o) => o.occupationId));
    if (verrou && aVerrouiller.length > 0) {
      await (q as typeof query)('SELECT id FROM gestion_annuaire_occupation WHERE id = ANY($1::bigint[]) FOR UPDATE', [aVerrouiller]);
    }
  }
  return {
    lotId, adresse: lot[0].adresse, type: typeAffiche(lot[0].type_logement, lot[0].nature), etage: lot[0].etage, porte: lot[0].porte,
    proprietaire: lot[0].proprietaire, entree, locataires, annexes, autresOccupants,
  };
}

export async function lireBail(occupationId: number): Promise<BailLogement | null> {
  return lireBailAvec(query, occupationId, await schema(), false);
}

/** Les baux EN PLACE d'un locataire (pour le bloc de sa fiche) et ses sorties enregistrées (corrigeables). */
export async function bauxDuLocataire(locataireId: number): Promise<{ enPlace: { occupationId: number; adresse: string | null }[]; sorties: SortieEnregistree[] }> {
  const s = await schema();
  const sansAnnexe = s.annexes ? 'AND NOT EXISTS (SELECT 1 FROM gestion_lot_annexe a WHERE a.annexe_id = o.lot_id)' : '';
  const { rows: enPlace } = await query<{ id: string; adresse: string | null }>(
    `SELECT o.id::text, nullif(concat_ws(', ', lo.adresse, lo.commune), '') AS adresse
       FROM gestion_annuaire_occupation o JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
      WHERE o.locataire_id = $1 AND o.sortie IS NULL ${sansAnnexe} ORDER BY o.entree DESC NULLS LAST, o.id`, [locataireId]);
  // Les sorties : ses occupations datées (logement), groupées avec les co-sortants du même bail à la même date et leurs annexes.
  const { rows: sorties } = await query<{ lot_id: string; adresse: string | null; sortie: string; entree: string | null; ids: string[]; noms: string[] }>(
    `SELECT o.lot_id::text, nullif(concat_ws(', ', lo.adresse, lo.commune), '') AS adresse, o.sortie::text, o.entree::text,
            array(SELECT x.id::text FROM gestion_annuaire_occupation x
                   WHERE x.sortie = o.sortie AND ((x.lot_id = o.lot_id AND x.entree IS NOT DISTINCT FROM o.entree)
                     ${s.annexes ? `OR (x.lot_id IN (SELECT a.annexe_id FROM gestion_lot_annexe a WHERE a.parent_id = o.lot_id)
                         AND x.locataire_id IN (SELECT y.locataire_id FROM gestion_annuaire_occupation y
                           WHERE y.lot_id = o.lot_id AND y.sortie = o.sortie AND y.entree IS NOT DISTINCT FROM o.entree))` : ''})
                   ORDER BY x.id) AS ids,
            array(SELECT l.nom FROM gestion_annuaire_occupation x JOIN gestion_annuaire_locataire l ON l.id = x.locataire_id
                   WHERE x.lot_id = o.lot_id AND x.sortie = o.sortie AND x.entree IS NOT DISTINCT FROM o.entree ORDER BY l.nom_normalise) AS noms
       FROM gestion_annuaire_occupation o JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
      WHERE o.locataire_id = $1 AND o.sortie IS NOT NULL ${sansAnnexe}
      ORDER BY o.sortie DESC, o.id DESC LIMIT 10`, [locataireId]);
  return {
    enPlace: enPlace.map((r) => ({ occupationId: Number(r.id), adresse: r.adresse })),
    sorties: sorties.map((r) => ({
      lotId: Number(r.lot_id), adresse: r.adresse, sortie: r.sortie, entree: r.entree,
      occupationIds: r.ids.map(Number), noms: r.noms,
    })),
  };
}

// ══ LES ÉCRITURES ════════════════════════════════════════════════════════════════════════════════════════════════════

async function aujourdhui(q: RequeteTx): Promise<string> {
  const { rows } = await q<{ j: string }>(`SELECT ${SQL_AUJOURDHUI_PARIS}::text AS j`);
  return rows[0].j;
}

async function journaliser(q: RequeteTx, o: {
  entite: 'annuaire' | 'annuaire_lot'; id: number; action: string; avant: string | null; apres: string | null; commentaire: string; auteur: Auteur;
}): Promise<void> {
  await q(
    `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [o.entite, o.id, o.action, o.avant, o.apres, o.commentaire, o.auteur.id, o.auteur.libelle]);
}

export interface SortieFaite {
  bail: BailLogement;
  date: string;
  sortants: LocataireDuBail[];
  /** Les occupations datées (logement ET annexes). */
  occupationIds: number[];
  vacant: boolean;
  restants: string[];
  annexes: string[];
}

/**
 * ENREGISTRE LA SORTIE d'un ou plusieurs locataires d'un bail, à UNE date. LIRE (FOR UPDATE) → REFUSER → ÉCRIRE.
 * Les occupations des annexes du bail par les sortants sont closes à la même date (elles suivent le logement).
 */
export async function enregistrerSortie(
  demande: { occupationId: number; sortants: readonly number[]; date: unknown }, auteur: Auteur,
): Promise<IssueSortie<SortieFaite>> {
  const s = await schema();   // HORS transaction
  return withTransaction(async (q) => {
    const bail = await lireBailAvec(q, demande.occupationId, s, true);
    if (bail === null) return { etat: 'inconnu' as const };
    const jour = await aujourdhui(q);
    const sortants = [...new Set(demande.sortants)];
    const v = verifierSortie(bail, sortants, demande.date, jour);
    if (!v.ok) return { etat: 'refus' as const, motif: v.motif };   // AVANT toute écriture
    const date = demande.date as string;
    const quiSort = bail.locataires.filter((l) => sortants.includes(l.occupationId));
    const locIds = new Set(quiSort.map((l) => l.locataireId));
    const annexesOcc = bail.annexes.flatMap((a) => a.occupations.filter((o) => locIds.has(o.locataireId)).map((o) => o.occupationId));
    const ids = [...sortants, ...annexesOcc];
    const ecrites = await ecrireDateSortie(q, ids, { mode: 'poser', date });
    if (ecrites !== ids.length) throw new Error('sortie : une occupation a changé pendant le geste');
    const { vacant, restants } = issueSortie(bail, sortants);
    const issue = vacant ? 'le logement devient vacant' : `le logement reste loué à ${restants.join(', ')}`;
    const annexesSuivies = bail.annexes.filter((a) => a.occupations.some((o) => locIds.has(o.locataireId))).map((a) => a.libelle);
    for (const l of quiSort) {
      await journaliser(q, {
        entite: 'annuaire', id: l.locataireId, action: 'location_sortie_locataire', avant: null, apres: date,
        commentaire: `sortie du logement ${bail.adresse ?? `lot ${bail.lotId}`} (lot ${bail.lotId}) le ${date}${annexesSuivies.length > 0 ? ` avec ${annexesSuivies.join(', ')}` : ''} — ${issue} — occupation(s) ${ids.join(', ')}`,
        auteur,
      });
    }
    await journaliser(q, {
      entite: 'annuaire_lot', id: bail.lotId, action: 'location_sortie_locataire', avant: null, apres: date,
      commentaire: `sortie de ${quiSort.map((l) => l.nom).join(', ')} le ${date} — ${issue}`, auteur,
    });
    return { etat: 'ok' as const, data: { bail, date, sortants: quiSort, occupationIds: ids, vacant, restants, annexes: annexesSuivies } };
  });
}

/** Lit (FOR UPDATE) un groupe d'occupations sorties ENSEMBLE ; `null` s'il n'est plus cohérent. */
async function groupeSorti(q: RequeteTx, ids: readonly number[]): Promise<{ sortie: string; entrees: (string | null)[]; lignes: { id: number; locataire_id: number; lot_id: number }[] } | null> {
  if (ids.length === 0) return null;
  const { rows } = await q<{ id: string; locataire_id: string; lot_id: string; entree: string | null; sortie: string | null }>(
    `SELECT id::text, locataire_id::text, lot_id::text, entree::text, sortie::text FROM gestion_annuaire_occupation
      WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE`, [[...ids]]);
  if (rows.length !== new Set(ids).size) return null;
  const dates = new Set(rows.map((r) => r.sortie));
  if (dates.size !== 1 || rows[0].sortie === null) return null;
  return { sortie: rows[0].sortie, entrees: rows.map((r) => r.entree), lignes: rows.map((r) => ({ id: Number(r.id), locataire_id: Number(r.locataire_id), lot_id: Number(r.lot_id) })) };
}

/** CORRIGE LA DATE d'une sortie enregistrée (le groupe entier). Geste dédié, journalisé. */
export async function corrigerSortie(demande: { occupationIds: readonly number[]; date: unknown }, auteur: Auteur): Promise<IssueSortie<{ date: string }>> {
  return withTransaction(async (q) => {
    const g = await groupeSorti(q, demande.occupationIds);
    if (g === null) return { etat: 'refus' as const, motif: 'Cette sortie a changé entre-temps : rechargez la page.' };
    const v = verifierCorrection(g.entrees, demande.date, await aujourdhui(q));
    if (!v.ok) return { etat: 'refus' as const, motif: v.motif };
    const date = demande.date as string;
    if (date === g.sortie) return { etat: 'refus' as const, motif: 'C’est déjà la date enregistrée.' };
    if (await ecrireDateSortie(q, g.lignes.map((l) => l.id), { mode: 'corriger', date }) !== g.lignes.length) throw new Error('correction : une occupation a changé pendant le geste');
    for (const locataire of new Set(g.lignes.map((l) => l.locataire_id))) {
      await journaliser(q, {
        entite: 'annuaire', id: locataire, action: 'location_sortie_corrigee', avant: g.sortie, apres: date,
        commentaire: `date de sortie corrigée : ${g.sortie} → ${date} — occupation(s) ${g.lignes.map((l) => l.id).join(', ')}`, auteur,
      });
    }
    return { etat: 'ok' as const, data: { date } };
  });
}

/** ANNULE une sortie enregistrée : les occupations redeviennent en cours (le journal garde la date annulée). */
export async function annulerSortie(demande: { occupationIds: readonly number[] }, auteur: Auteur): Promise<IssueSortie<{ annulee: string }>> {
  return withTransaction(async (q) => {
    const g = await groupeSorti(q, demande.occupationIds);
    if (g === null) return { etat: 'refus' as const, motif: 'Cette sortie a changé entre-temps : rechargez la page.' };
    if (await ecrireDateSortie(q, g.lignes.map((l) => l.id), { mode: 'annuler' }) !== g.lignes.length) throw new Error('annulation : une occupation a changé pendant le geste');
    for (const locataire of new Set(g.lignes.map((l) => l.locataire_id))) {
      await journaliser(q, {
        entite: 'annuaire', id: locataire, action: 'location_sortie_annulee', avant: g.sortie, apres: null,
        commentaire: `sortie du ${g.sortie} annulée — occupation(s) ${g.lignes.map((l) => l.id).join(', ')} de nouveau en cours`, auteur,
      });
    }
    return { etat: 'ok' as const, data: { annulee: g.sortie } };
  });
}

// ══ LE MAIL ══════════════════════════════════════════════════════════════════════════════════════════════════════════

const ESSAI = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface IssueMailSortie { envoye: boolean; motif: string | null; destinataires: string[]; objet: string | null }

/** Les destinataires : l'auteur, puis tout compte ACTIF ayant la tuile Location OU la tuile Gestion (un administrateur a tout). */
export async function destinatairesSortie(emailAuteur: string | null): Promise<string[]> {
  const location = (await colonneExisteMemo('admin_utilisateur', 'perm_location')) ? ' OR perm_location IS TRUE' : '';
  const { rows } = await query<{ identifiant: string }>(
    `SELECT identifiant FROM admin_utilisateur WHERE actif AND (role = 'administrateur' OR perm_gestion IS TRUE${location}) ORDER BY id`);
  const vus = new Set<string>(); const sortie: string[] = [];
  for (const brut of [emailAuteur, ...rows.map((r) => r.identifiant)]) {
    const e = (brut ?? '').trim().toLowerCase();
    if (!ESSAI.test(e) || vus.has(e)) continue;
    vus.add(e); sortie.push(e);
  }
  return sortie;
}

async function auteurDuMail(auteur: Auteur): Promise<{ nom: string; email: string | null }> {
  if (auteur.id !== null) {
    const { rows } = await query<{ identifiant: string; prenom: string | null; nom: string | null }>(
      'SELECT identifiant, prenom, nom FROM admin_utilisateur WHERE id = $1', [auteur.id]);
    if (rows[0] !== undefined) {
      const nom = [rows[0].prenom, rows[0].nom].filter((x) => x && x.trim() !== '').join(' ');
      return { email: ESSAI.test(rows[0].identifiant) ? rows[0].identifiant : null, nom: nom || rows[0].identifiant };
    }
  }
  return { email: ESSAI.test(auteur.libelle) ? auteur.libelle : null, nom: auteur.libelle };
}

/** Les données du mail, à partir de la sortie faite. PUR (exporté pour les tests). */
export function donneesMailSortie(f: SortieFaite, auteur: { nom: string; email: string | null }, quand: string): DonneesMailSortie {
  return {
    adresse: f.bail.adresse, lotId: f.bail.lotId, type: f.bail.type, etage: f.bail.etage, porte: f.bail.porte,
    annexes: f.annexes, proprietaire: f.bail.proprietaire,
    sortants: f.sortants.map((l) => ({ nom: l.nom, entree: l.entree, sortie: f.date })),
    vacant: f.vacant, restants: f.restants, auteur, quand,
  };
}

/**
 * ENVOIE le mail de confirmation, APRÈS l'écriture. Ne lève JAMAIS : un échec est rendu (`envoye: false` + motif) pour
 * que l'écran le DISE — jamais un faux « envoyé » — et ne défait rien. Chaque tentative est écrite au journal.
 * Le canal est celui des mails de la Location (`transportParDefaut` : factice sous les tests ; en RECETTE, le verrou
 * réseau dépose l'envoi dans la boîte de test).
 */
export async function notifierSortie(
  f: SortieFaite, auteur: Auteur, deps: { transport?: TransportDemande; maintenant?: Date } = {},
): Promise<IssueMailSortie> {
  let issue: IssueMailSortie = { envoye: false, motif: null, destinataires: [], objet: null };
  try {
    const qui = await auteurDuMail(auteur);
    const d = donneesMailSortie(f, qui, (deps.maintenant ?? new Date()).toISOString());
    const destinataires = await destinatairesSortie(qui.email);
    const objet = objetMailSortie(d);
    issue = { ...issue, destinataires, objet };
    if (destinataires.length === 0) {
      issue = { ...issue, motif: 'aucun destinataire (aucune adresse e-mail connue)' };
    } else {
      const config = await chargerConfigGestion();
      const domaine = config.adresseGestion.split('@')[1] ?? 'criterimmo.fr';
      const r = await (deps.transport ?? transportParDefaut()).envoyer({
        de: config.adresseGestion, deNom: 'Gestion', a: destinataires, cc: [], cci: [], objet,
        corps: texteMailSortie(d), corpsHtml: htmlMailSortie(d), messageId: messageIdDemande(domaine, randomBytes(12).toString('hex')),
      });
      issue = r.ok ? { ...issue, envoye: true } : { ...issue, motif: r.motif };
    }
  } catch (e) {
    issue = { ...issue, envoye: false, motif: (e as Error)?.message ?? 'erreur inattendue' };
  }
  try {
    await query(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ('annuaire_lot', $1, 'location_mail_sortie_locataire', $2, $3, $4, $5)`,
      [f.bail.lotId, issue.envoye ? 'envoye' : 'echec',
        `${issue.objet ?? 'mail de sortie de locataire'} — à : ${issue.destinataires.join(', ') || 'personne'}${issue.motif ? ` — non envoyé : ${issue.motif}` : ''}`,
        auteur.id, auteur.libelle]);
  } catch (e) {
    console.error('[location] journal du mail de sortie impossible', (e as Error)?.message);
  }
  return issue;
}

// ══ L'ENCART « LE LOGEMENT » (Arno, 19/10/2026) — LECTURE SEULE ══════════════════════════════════════════════════════

/**
 * Tout ce que la base connaît du logement d'un bail, de ses lots (logement + annexes du bail) et du bail lui-même. Les
 * colonnes des migrations Location (372, 374, 376, 378, 382) et les tables 370 (conditions de location) sont SONDÉES hors
 * transaction : absentes, la valeur est `null` — et l'écran ne l'affiche pas. Ne touche à rien de la logique de sortie :
 * il relit le bail par `lireBail` (lecture), puis le détail de ses lots.
 */
export async function encartDuBail(occupationId: number): Promise<(EncartLogement & { locataireCle: string | null; lotCle: string }) | null> {
  const bail = await lireBail(occupationId);
  if (bail === null) return null;
  const c = async (col: string): Promise<string> =>
    ((await colonneExisteMemo('gestion_annuaire_lot', col)) ? `lo.${col}::text` : 'NULL::text');
  const ids = [bail.lotId, ...bail.annexes.map((a) => a.lotId)];
  const { rows } = await query<Record<string, string | null>>(
    `SELECT lo.id::text AS id, lo.wippimmo_id, lo.adresse, lo.code_postal, lo.commune, lo.nature, lo.type_bien, lo.proprietaire_id::text AS proprietaire_id,
            ${await c('categorie')} AS categorie, ${await c('type_logement')} AS type_logement, ${await c('type_local')} AS type_local,
            ${await c('parking_type')} AS parking_type, ${await c('parking_situation')} AS parking_situation, ${await c('nom_annexe')} AS nom_annexe,
            ${await c('meuble')} AS meuble, ${await c('etage')} AS etage, ${await c('porte')} AS porte, ${await c('num_lot_copro')} AS num_lot_copro,
            ${await c('batiment')} AS batiment, ${await c('escalier')} AS escalier,
            ${await c('surface_carrez_m2')} AS surface_carrez_m2, ${await c('surface_habitable_m2')} AS surface_habitable_m2,
            ${await c('surface_m2')} AS surface_m2, ${await c('surface_exterieure_m2')} AS surface_exterieure_m2, ${await c('nombre_pieces')} AS nombre_pieces,
            ${await c('ascenseur')} AS ascenseur, ${await c('digicode')} AS digicode, ${await c('digicode_code')} AS digicode_code,
            ${await c('precision_acces')} AS precision_acces, ${await c('dpe_classe')} AS dpe_classe, ${await c('dpe_date')} AS dpe_date,
            ${await c('dpe_non_soumis')} AS dpe_non_soumis, ${await c('chauffage')} AS chauffage, ${await c('epoque_construction')} AS epoque_construction,
            ${await c('syndic_id')} AS syndic_id
       FROM gestion_annuaire_lot lo WHERE lo.id = ANY($1::bigint[])`, [ids]);
  const parId = new Map(rows.map((r) => [Number(r.id), r]));
  const lo = parId.get(bail.lotId);
  if (lo === undefined) return null;
  const texte = (v: string | null | undefined): string | null => (v === null || v === undefined || v.trim() === '' ? null : v);
  const nombre = (v: string | null | undefined): number | null => (texte(v) === null || Number.isNaN(Number(v)) ? null : Number(v));
  const booleen = (v: string | null | undefined): boolean | null => (v === 'true' ? true : v === 'false' ? false : null);
  const numeroLot = (w: string | null): string | null => (w === null || w.startsWith('app-') ? null : w);
  const typeDuLot = (r: Record<string, string | null>): string | null => {
    const cat = texte(r.categorie);
    if (cat === 'logement' && texte(r.type_logement)) return LIBELLE_TYPE_LOGEMENT[r.type_logement as TypeLogement] ?? r.type_logement;
    if (cat === 'local' && texte(r.type_local)) return LIBELLE_TYPE_LOCAL[r.type_local as TypeLocal] ?? r.type_local;
    if ((cat === 'parking' || cat === 'box') && (texte(r.parking_type) || texte(r.parking_situation))) {
      return [LIBELLE_CATEGORIE[cat as Categorie], texte(r.parking_type) ? (LIBELLE_TYPE_PARKING[r.parking_type as TypeParking] ?? r.parking_type) : null,
        texte(r.parking_situation) ? (LIBELLE_SITUATION_PARKING[r.parking_situation as SituationParking] ?? r.parking_situation)?.toLowerCase() : null]
        .filter((x) => x).join(' · ');
    }
    if (texte(r.nom_annexe)) return r.nom_annexe;
    if (cat !== null && cat !== 'logement' && (LIBELLE_CATEGORIE as Record<string, string>)[cat]) return (LIBELLE_CATEGORIE as Record<string, string>)[cat];
    const wip = [texte(r.nature), texte(r.type_bien)].filter((x) => x !== null).join(' ');
    return wip === '' ? (cat === null ? null : (LIBELLE_CATEGORIE as Record<string, string>)[cat] ?? null) : wip;
  };
  const lotEncart = (r: Record<string, string | null>, role: LotEncart['role']): LotEncart => ({
    lotId: Number(r.id), role, type: typeDuLot(r), etage: texte(r.etage), numLotCopro: texte(r.num_lot_copro),
    numeroLot: numeroLot(r.wippimmo_id), porte: texte(r.porte), place: r.categorie === 'parking' || r.categorie === 'box',
  });
  // Le propriétaire (lien vers sa fiche) et le syndic (nom).
  const { rows: pr } = lo.proprietaire_id === null ? { rows: [] } : await query<{ id: string; nom: string | null }>(
    'SELECT id::text, nom_complet AS nom FROM gestion_annuaire_proprietaire WHERE id = $1', [Number(lo.proprietaire_id)]);
  const { rows: sy } = texte(lo.syndic_id) === null ? { rows: [] }
    : await query<{ nom: string | null }>('SELECT nom FROM gestion_syndic WHERE id = $1', [Number(lo.syndic_id)]).catch(() => ({ rows: [] }));
  // Le bail : loyer d'origine et taux de gestion (dernières conditions saisies sur une occupation du bail — migration 370).
  let conditions: { loyer_hc: string | null; provisions: string | null; taux: string | null; base: string | null } | undefined;
  if (await colonneExisteMemo('gestion_location_conditions', 'loyer_hc')) {
    const { rows: co } = await query<{ loyer_hc: string | null; provisions: string | null; taux: string | null; base: string | null }>(
      `SELECT c.loyer_hc::text, c.provisions::text, c.taux_gestion_ht::text AS taux, c.base::text
         FROM gestion_location_conditions c WHERE c.occupation_id = ANY($1::bigint[]) ORDER BY c.id DESC LIMIT 1`,
      [bail.locataires.map((l) => l.occupationId)]);
    conditions = co[0];
  }
  const { rows: cle } = await query<{ cle: string | null }>(
    `SELECT l.wippimmo_id AS cle FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id WHERE o.id = $1`, [occupationId]);
  return {
    lotId: bail.lotId,
    adresse: texte([lo.adresse, [lo.code_postal, lo.commune].filter((x) => texte(x)).join(' ')].filter((x) => texte(x)).join(', ')),
    type: typeDuLot(lo), meuble: booleen(lo.meuble), etage: texte(lo.etage), porte: texte(lo.porte), numLotCopro: texte(lo.num_lot_copro),
    numeroLot: numeroLot(lo.wippimmo_id), batiment: texte(lo.batiment), escalier: texte(lo.escalier),
    surfaceCarrez: nombre(lo.surface_carrez_m2), surfaceHabitable: nombre(lo.surface_habitable_m2), surface: nombre(lo.surface_m2),
    surfaceExterieure: nombre(lo.surface_exterieure_m2), nombrePieces: nombre(lo.nombre_pieces),
    ascenseur: booleen(lo.ascenseur), digicode: booleen(lo.digicode), digicodeCode: texte(lo.digicode_code), precisionAcces: texte(lo.precision_acces),
    dpeClasse: texte(lo.dpe_classe), dpeDate: texte(lo.dpe_date), dpeNonSoumis: booleen(lo.dpe_non_soumis),
    chauffage: texte(lo.chauffage), epoqueConstruction: texte(lo.epoque_construction),
    lots: [lotEncart(lo, 'logement'), ...bail.annexes.map((a) => parId.get(a.lotId)).filter((r): r is Record<string, string | null> => r !== undefined).map((r) => lotEncart(r, 'annexe'))],
    proprietaire: pr[0] === undefined ? null : { id: Number(pr[0].id), nom: pr[0].nom ?? `Propriétaire ${pr[0].id}` },
    syndic: texte(sy[0]?.nom ?? null),
    bail: {
      entree: bail.entree, loyerHc: nombre(conditions?.loyer_hc), provisions: nombre(conditions?.provisions),
      taux: nombre(conditions?.taux), base: texte(conditions?.base),
    },
    locataireCle: texte(cle[0]?.cle ?? null), lotCle: lo.wippimmo_id ?? '',
  };
}
