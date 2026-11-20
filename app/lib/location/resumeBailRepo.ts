import { query } from '../db/client';
import { titreLogement } from '../gestion/annuaireRecherche';
import { bailDisponible } from './bailRepo';
import { conditionsParOccupation } from './conditionsEntreeRepo';
import type { ConditionsEntreeLues, LoyerMensuel } from './conditionsEntree';
import { complementsDuBien } from './creationBienRepo';
import { loyerDesOccupations } from './loyerEntreeRepo';
import { contactsRattachesDuLocataire } from './rattachementsRepo';
import type { ContactRattache } from './rattachements';
import { proprietairesDuBien } from './resumeBienRepo';
import { brancheBailDisponible, dossierDuBail } from './brancheBailDriveRepo';
import { colonneExisteMemo } from './sondeLocation';

/**
 * ══ 🔴🔴 FICHE LOCATAIRE — LE RÉSUMÉ DU BAIL (Arno, 20/10/2026). LECTURE SEULE. ═══════════════════════════════════════════════
 *
 * « Toutes les informations du locataire et de son bail saisies dans “Nouveau locataire”, lues à la source par bail_id, sans
 * copie. Le bail EN COURS ; s'il n'y en a pas, le DERNIER, avec “bail terminé le …”. Les valeurs WIPPIMMO en repli si les
 * champs Location sont vides, jamais deux valeurs contradictoires. »
 * Ce module ne fait qu'ASSEMBLER des lectures existantes : les occupations du locataire (et leur bail, migration 393), les
 * propriétaires du bien (`proprietairesDuBien`), le loyer de départ du bail (`loyerDesOccupations`), les conditions d'entrée
 * (`conditionsParOccupation`), les garants et contacts (`contactsRattachesDuLocataire`), l'entretien du bien
 * (`complementsDuBien`). L'import WIPPIMMO ne porte ni loyer, ni dépôt, ni prélèvement : son repli est la date d'entrée et
 * le bien de l'occupation importée (les mêmes colonnes que la Location).
 */
export interface ResumeBail {
  bail: {
    bailId: number | null;
    enCours: boolean;
    /** Le bail est terminé : sa date de sortie (la plus tardive de ses occupants). */
    termineLe: string | null;
    entree: string | null;
    bien: { id: number; adresse: string } | null;
    /** Les lots loués par CE locataire dans ce bail (le logement et ses annexes). */
    lots: { id: number; libelle: string }[];
    proprietaires: { id: number; nom: string }[];
    colocataires: { id: number; nom: string }[];
    /** Les occupations du bail (pour les gestes « Modifier » des conditions d'entrée). */
    occupationIds: number[];
    /** L'occupation de CE locataire sur le bien du bail (celle qui porte le geste). */
    occupationId: number | null;
  } | null;
  loyer: LoyerMensuel | null;
  conditions: ConditionsEntreeLues | null;
  garants: ContactRattache[];
  contacts: ContactRattache[];
  entretiens: { aPrevoir: boolean | null; liste: { sorte: string; nom: string | null; dateAnniversaire: string | null }[] } | null;
  /** Arno (20/10/2026, 394) — le dossier Drive du bail (N7) : créé, ou à créer ; absent sans la migration 394. */
  drive?: { etat: 'cree'; driveId: string } | { etat: 'a_creer' };
}

export async function resumeBailDuLocataire(locataireId: number): Promise<ResumeBail> {
  const avecBail = await bailDisponible();
  // Ses occupations sur un bien : celles en cours d'abord, puis la plus récente.
  const { rows: occ } = await query<{ id: string; lot_id: string; entree: string | null; sortie: string | null; bail_id: string | null; bien: string | null }>(
    `SELECT o.id::text, o.lot_id::text, o.entree::text, o.sortie::text, ${avecBail ? 'o.bail_id::text' : 'NULL::text'} AS bail_id,
            ${avecBail ? '(SELECT b.lot_id::text FROM gestion_bail b WHERE b.id = o.bail_id)' : 'NULL::text'} AS bien
       FROM gestion_annuaire_occupation o
      WHERE o.locataire_id = $1 AND o.lot_id IS NOT NULL
      ORDER BY (o.sortie IS NULL) DESC, o.entree DESC NULLS LAST, o.id DESC`, [locataireId]);
  const vide: ResumeBail = { bail: null, loyer: null, conditions: null, garants: [], contacts: [], entretiens: null };
  const choisie = choisirOccupation(occ);
  if (choisie === undefined) return vide;
  // Le bail : par bail_id (393) ; sans elle, « même lot + même date d'entrée » (la règle d'avant).
  const memeBail = (o: typeof occ[number]): boolean => (choisie.bail_id !== null ? o.bail_id === choisie.bail_id
    : o.lot_id === choisie.lot_id && o.entree === choisie.entree);
  const siennes = occ.filter(memeBail);
  const { rows: tous } = await query<{ id: string; locataire_id: string; nom: string; sortie: string | null; lot_id: string }>(
    choisie.bail_id !== null
      ? `SELECT o.id::text, o.locataire_id::text, trim(concat_ws(' ', l.nom, l.prenom)) AS nom, o.sortie::text, o.lot_id::text
           FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id WHERE o.bail_id = $1 ORDER BY o.id`
      : `SELECT o.id::text, o.locataire_id::text, trim(concat_ws(' ', l.nom, l.prenom)) AS nom, o.sortie::text, o.lot_id::text
           FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
          WHERE o.lot_id = $1 AND o.entree IS NOT DISTINCT FROM $2::date ORDER BY o.id`,
    choisie.bail_id !== null ? [Number(choisie.bail_id)] : [Number(choisie.lot_id), choisie.entree]);
  const bienId = Number(choisie.bien ?? choisie.lot_id);
  const { rows: lotsRows } = await query<{ id: string; adresse: string | null; commune: string | null; categorie: string | null; porte: string | null }>(
    `SELECT lo.id::text, lo.adresse, lo.commune, ${await colonne('categorie')} AS categorie, ${await colonne('porte')} AS porte
       FROM gestion_annuaire_lot lo WHERE lo.id = ANY($1::bigint[]) ORDER BY (lo.id = $2) DESC, lo.id`,
    [[...new Set([bienId, ...siennes.map((o) => Number(o.lot_id))])], bienId]);
  const bienLu = lotsRows.find((l) => Number(l.id) === bienId);
  const enCours = siennes.some((o) => o.sortie === null);
  const sorties = tous.map((t) => t.sortie);
  const termineLe = enCours || sorties.some((s) => s === null) ? null : sorties.filter((s): s is string => s !== null).sort().at(-1) ?? null;
  const occIds = tous.map((t) => Number(t.id));
  const conditions = occIds.length === 0 ? null : [...(await conditionsParOccupation(occIds)).values()][0] ?? null;
  const rattaches = (await contactsRattachesDuLocataire(locataireId)) ?? [];
  const comp = await complementsDuBien(bienId);
  const entrees = siennes.map((o) => o.entree).filter((x): x is string => x !== null).sort();
  const sienne = siennes.find((o) => Number(o.lot_id) === bienId) ?? siennes[0];
  return {
    bail: {
      bailId: choisie.bail_id === null ? null : Number(choisie.bail_id), enCours, termineLe,
      entree: entrees[0] ?? null,
      bien: bienLu === undefined ? null : { id: bienId, adresse: titreLogement(bienLu.adresse, bienLu.commune) },
      lots: lotsRows.filter((l) => siennes.some((o) => o.lot_id === l.id)).map((l) => ({
        id: Number(l.id), libelle: `${titreLogement(l.adresse, l.commune)}${l.categorie && l.categorie !== 'logement' ? ` — ${l.categorie}${l.porte ? ` n° ${l.porte}` : ''}` : ''}`,
      })),
      proprietaires: (await proprietairesDuBien(bienId)).map((p) => ({ id: p.id, nom: p.nom })),
      colocataires: [...new Map(tous.filter((t) => Number(t.locataire_id) !== locataireId).map((t) => [t.locataire_id, { id: Number(t.locataire_id), nom: t.nom }])).values()],
      occupationIds: occIds, occupationId: sienne === undefined ? null : Number(sienne.id),
    },
    loyer: occIds.length === 0 ? null : await loyerDesOccupations(occIds),
    conditions,
    garants: rattaches.filter((c) => c.garant),
    contacts: rattaches.filter((c) => !c.garant),
    entretiens: comp === null ? null : { aPrevoir: comp.entretienAPrevoir ?? null, liste: comp.entretiens ?? [] },
    ...(await etatDriveDuBail(choisie.bail_id === null ? null : Number(choisie.bail_id))),
  };
}

/** L'état du dossier Drive d'un bail (394) : `{}` sans la migration ou sans bail. */
async function etatDriveDuBail(bailId: number | null): Promise<{ drive?: ResumeBail['drive'] }> {
  if (bailId === null || !(await brancheBailDisponible())) return {};
  const d = await dossierDuBail(bailId);
  return { drive: d === null ? { etat: 'a_creer' } : { etat: 'cree', driveId: d.driveId } };
}

/** Le dossier Drive du bail montré sur la fiche d'un locataire (le bail en cours, sinon le dernier) — pour son en-tête. */
export async function dossierDuBailDuLocataire(locataireId: number): Promise<{ driveId: string } | null> {
  if (!(await bailDisponible()) || !(await brancheBailDisponible())) return null;
  const { rows } = await query<{ id: string; entree: string | null; sortie: string | null; bail_id: string | null }>(
    `SELECT id::text, entree::text, sortie::text, bail_id::text FROM gestion_annuaire_occupation WHERE locataire_id = $1 AND lot_id IS NOT NULL`, [locataireId]);
  const o = choisirOccupation(rows);
  return o?.bail_id == null ? null : dossierDuBail(Number(o.bail_id));
}

async function colonne(c: string): Promise<string> {
  return (await colonneExisteMemo('gestion_annuaire_lot', c)) ? `lo.${c}::text` : 'NULL::text';
}

/**
 * LE BAIL MONTRÉ (Arno, 20/10/2026) : celui EN COURS (une occupation sans sortie) ; s'il n'y en a pas, le DERNIER (la date
 * d'entrée la plus récente, puis la sortie la plus récente). À égalité, la plus récente saisie. PUR.
 */
export function choisirOccupation<T extends { id: string; entree: string | null; sortie: string | null }>(occ: readonly T[]): T | undefined {
  return [...occ].sort((a, b) => Number(a.sortie !== null) - Number(b.sortie !== null)
    || (b.entree ?? '').localeCompare(a.entree ?? '') || (b.sortie ?? '').localeCompare(a.sortie ?? '') || Number(b.id) - Number(a.id))[0];
}
