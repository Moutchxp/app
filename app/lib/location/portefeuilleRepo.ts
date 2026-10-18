import { query, withTransaction, type RequeteTx } from '../db/client';
import { colonneExisteMemo } from './sondeLocation';
import { sqlPersonneVivante } from '../gestion/personneVivanteSql';
import { conditionCoordonneeVivante } from '../gestion/coordonneeVivante';
import { ajouterOccupant, creerPersonne } from '../gestion/annuaireEditionRepo';
import { ficheSyndic } from '../gestion/syndicRepo';
import type { FicheSyndic } from '../gestion/syndics';
import type { Auteur } from '../gestion/gestes';
import { analyserTermePortefeuille, type LigneRecherche, type ResultatsAccueil, type SortiePortefeuille } from './recherchePortefeuille';
import type { Issue } from './locationRepo';
import { manquesClientLocation } from './cartesLocation';
import { MOTIF_PREMIERE_CARTE } from '../gestion/carteComplete';
import { familleAUneCarteComplete } from '../gestion/familleCarteRepo';
import { creerContactsDuBien, refusContacts, type ContactSaisi } from './contactsLocationRepo';
import {
  libelleOrigine, MOTIF_BIEN_HORS_SELECTION, MOTIF_OCCUPATION_A_CONFIRMER, MOTIF_ORIGINE_REQUISE, MOTIF_SELECTION_VIDE, verifierOrigine,
  type ApercuArchivage, type BienASortir,
} from './archivage';
import { SQL_AUJOURDHUI_PARIS } from '../temps/paris';

/**
 * ══ 🔴🔴 TUILE LOCATION — LE PORTEFEUILLE (refonte de l'accueil, Arno, 17/10/2026). IMPUR (base). ══════════════════════
 *
 *   · la RECHERCHE de l'accueil : personnes et syndics par nom / téléphone / e-mail ; biens par leur SEULE adresse, et
 *     seulement ceux du portefeuille (en gestion, présents au dernier export, non sortis) ;
 *   · la SORTIE DU PORTEFEUILLE (« Supprimer » / « Archiver ») : jamais un effacement — deux colonnes datent et signent
 *     la sortie (migration 373), le journal la garde ; réactivable ; une location en cours est close après avertissement
 *     (règle d'Arno du 18/10/2026, qui remplace « refusée tant qu'un locataire est en place ») ;
 *   · la CRÉATION D'UN LOCATAIRE rattaché à un bien.
 * Les données sont celles de la Gestion (mêmes tables, mêmes fonctions de création) ; seuls les écrans sont ici.
 * 🔴 Aucun DELETE dans ce fichier.
 */

export function sortieDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_annuaire_lot', 'sorti_portefeuille_le');
}

/** Le fragment « dans le portefeuille » d'une table qui porte la colonne (vide sans la migration 373). */
export async function sqlDansPortefeuille(alias: string): Promise<string> {
  return (await sortieDisponible()) ? ` AND ${alias}.sorti_portefeuille_le IS NULL` : '';
}

/** Un bien du portefeuille : en gestion (pas de fin), présent au dernier export, non sorti. */
export async function sqlBienDuPortefeuille(alias: string): Promise<string> {
  return `${alias}.gestion_fin IS NULL AND ${alias}.absent_le IS NULL${await sqlDansPortefeuille(alias)}`;
}

/** Par type de résultat : le panneau prend tout l'écran et défile (retouche d'Arno du 17/10/2026). */
const LIMITE = 25;

/**
 * LA RECHERCHE DE L'ACCUEIL. Chaque type est borné (25) ; `tronque` dit qu'il y en a d'autres.
 * 🔴 L'ADRESSE ne sert QU'AUX BIENS du portefeuille — jamais à trouver une personne ou un syndic ; l'adresse affichée sur
 *    une ligne de personne est celle d'un de SES biens du portefeuille, jamais son adresse personnelle.
 * 🔴 LES ANCIENS (fiches sorties du portefeuille) sont rendus aussi, marqués `ancien` : l'écran les met en bas, grisés.
 *    Un bien en fin de gestion ou absent du dernier export, lui, n'est pas du portefeuille : il n'apparaît pas.
 * Rangement dans chaque type : les actifs d'abord, puis la PERTINENCE (le nom commence par le premier mot tapé), puis le nom.
 */
export async function rechercherPortefeuille(brut: string, options: { proprietairesSeuls?: boolean } = {}): Promise<ResultatsAccueil> {
  const t = analyserTermePortefeuille(brut);
  const vide: ResultatsAccueil = { proprietaires: [], locataires: [], syndics: [], biens: [], tronque: false };
  if (t.vide) return vide;
  const coordVivante = await conditionCoordonneeVivante('c');
  const avecSortie = await sortieDisponible();
  const ancien = (alias: string): string => (avecSortie ? `(${alias}.sorti_portefeuille_le IS NOT NULL)` : 'false');
  // La condition « une coordonnée de cette personne correspond » : chiffres d'un téléphone, ou morceau d'e-mail.
  const parCoordonnee = (sujet: string, alias: string, n: number): string => {
    const tests: string[] = [];
    if (t.chiffres !== null) tests.push(`(c.sorte = 'telephone' AND regexp_replace(c.valeur, '\\D', '', 'g') LIKE '%' || $${n} || '%')`);
    if (t.email !== null) tests.push(`(c.sorte = 'email' AND lower(c.valeur) LIKE '%' || $${n + 1} || '%')`);
    return tests.length === 0 ? 'false' : `EXISTS (SELECT 1 FROM gestion_annuaire_contact c
      WHERE c.sujet = '${sujet}' AND c.sujet_id = ${alias}.id AND c.absent_le IS NULL${coordVivante} AND (${tests.join(' OR ')}))`;
  };
  const parNom = (colonne: string): string => (t.mots.length === 0 ? 'false'
    : t.mots.map((_, i) => `${colonne} LIKE '%' || ($3::text[])[${i + 1}] || '%'`).join(' AND '));
  /** 0 = le nom commence par le premier mot tapé (ou trouvé par téléphone / e-mail) ; 1 sinon. */
  // ⚠️ `0::int` et non `0` : un entier NU dans un ORDER BY est lu comme un NUMÉRO DE COLONNE (« position 0 » refusée).
  const pertinence = (colonne: string): string => (t.mots.length === 0 ? '0::int' : `CASE WHEN ${colonne} LIKE ($3::text[])[1] || '%' THEN 0 ELSE 1 END`);
  const coordonnee = (sujet: string, alias: string, sorte: 'telephone' | 'email'): string => `(SELECT c.valeur_brute FROM gestion_annuaire_contact c
      WHERE c.sujet = '${sujet}' AND c.sujet_id = ${alias}.id AND c.sorte = '${sorte}' AND c.absent_le IS NULL${coordVivante} ORDER BY c.rang, c.id LIMIT 1)`;
  /**
   * Un bien du portefeuille OU sorti du portefeuille (jamais en fin de gestion ni absent de l'export), sans les annexes —
   * SAUF une annexe à une AUTRE ADRESSE (migration 376) : son adresse est une adresse du portefeuille (Arno, 17/10/2026).
   */
  const autreAdresse = (await colonneExisteMemo('gestion_annuaire_lot', 'adresse_autre'));
  const bienConnu = (alias: string): string => `${alias}.gestion_fin IS NULL AND ${alias}.absent_le IS NULL
      AND (NOT EXISTS (SELECT 1 FROM gestion_lot_annexe a WHERE a.annexe_id = ${alias}.id)${autreAdresse ? ` OR ${alias}.adresse_autre IS TRUE` : ''})`;
  const params = [t.chiffres ?? '', t.email ?? '', t.mots];
  // Les trois paramètres sont TOUJOURS cités (une clause neutre) : PostgreSQL refuse un paramètre transmis mais inutilisé.
  const NEUTRE = `(length($1::text) >= 0 AND length($2::text) >= 0 AND cardinality($3::text[]) >= 0)`;
  const vivanteP = await sqlPersonneVivante('p');
  type Ligne = { id: string; nom: string; telephone: string | null; email: string | null; adresse: string | null; detail: string | null; ancien: boolean };

  /**
   * « Archiver un propriétaire » (Arno, 18/10/2026) : la recherche SPÉCIALISÉE sur les propriétaires trouve aussi un
   * propriétaire par l'ADRESSE D'UN DE SES BIENS du portefeuille (ou sortis) — jamais par son adresse personnelle.
   */
  const parAdresseDeSesBiens = options.proprietairesSeuls !== true || t.mots.length === 0 ? ''
    : ` OR EXISTS (SELECT 1 FROM gestion_annuaire_lot l
        WHERE (l.proprietaire_id = p.id OR l.id IN (SELECT lp.lot_id FROM gestion_annuaire_lot_proprietaire lp WHERE lp.proprietaire_id = p.id AND lp.jusqu_a IS NULL))
          AND ${bienConnu('l')} AND ${t.mots.map((_, i) => `coalesce(l.adresse_normalisee, '') LIKE '%' || ($3::text[])[${i + 1}] || '%'`).join(' AND ')})`;
  const ligneDe = (r: Ligne, titreParDefaut: string): LigneRecherche => ({
    id: Number(r.id), titre: r.nom ?? titreParDefaut, telephone: r.telephone, email: r.email, adresse: r.adresse,
    detail: r.detail, ancien: r.ancien === true,
  });
  const { rows: prop } = await query<Ligne>(
    `SELECT p.id::text, p.nom_complet AS nom, ${coordonnee('proprietaire', 'p', 'telephone')} AS telephone,
            ${coordonnee('proprietaire', 'p', 'email')} AS email, NULL::text AS detail, ${ancien('p')} AS ancien,
            (SELECT nullif(concat_ws(', ', l.adresse, l.commune), '') FROM gestion_annuaire_lot l
              WHERE (l.proprietaire_id = p.id OR l.id IN (SELECT lp.lot_id FROM gestion_annuaire_lot_proprietaire lp WHERE lp.proprietaire_id = p.id AND lp.jusqu_a IS NULL))
                AND ${bienConnu('l')} ORDER BY ${avecSortie ? 'l.sorti_portefeuille_le IS NOT NULL, ' : ''}l.id LIMIT 1) AS adresse
       FROM gestion_annuaire_proprietaire p
      WHERE ${NEUTRE} AND ${vivanteP} AND (${parNom('p.nom_normalise')} OR ${parCoordonnee('proprietaire', 'p', 1)}${parAdresseDeSesBiens})
      ORDER BY ${ancien('p')}, ${pertinence('p.nom_normalise')}, p.nom_normalise, p.id LIMIT ${LIMITE + 1}`, params);
  if (options.proprietairesSeuls === true) {
    return { proprietaires: prop.slice(0, LIMITE).map((r) => ligneDe(r, `Propriétaire ${r.id}`)), locataires: [], syndics: [], biens: [], tronque: prop.length > LIMITE };
  }
  const { rows: loc } = await query<Ligne>(
    `SELECT p.id::text, p.nom, ${coordonnee('locataire', 'p', 'telephone')} AS telephone,
            ${coordonnee('locataire', 'p', 'email')} AS email, NULL::text AS detail, ${ancien('p')} AS ancien,
            (SELECT nullif(concat_ws(', ', l.adresse, l.commune), '') FROM gestion_annuaire_occupation o JOIN gestion_annuaire_lot l ON l.id = o.lot_id
              WHERE o.locataire_id = p.id AND l.gestion_fin IS NULL AND l.absent_le IS NULL
              ORDER BY (o.sortie IS NULL) DESC, o.entree DESC NULLS LAST LIMIT 1) AS adresse
       FROM gestion_annuaire_locataire p
      WHERE ${NEUTRE} AND ${vivanteP} AND (${parNom('p.nom_normalise')} OR ${parCoordonnee('locataire', 'p', 1)})
      ORDER BY ${ancien('p')}, ${pertinence('p.nom_normalise')}, p.nom_normalise, p.id LIMIT ${LIMITE + 1}`, params);
  // Les syndics de la Gestion : nom, téléphone (fiche ou contacts), e-mail (fiche ou contacts). Jamais leur adresse.
  const testsSyndic: string[] = [];
  if (t.mots.length > 0) testsSyndic.push(t.mots.map((_, i) => `lower(s.nom) LIKE '%' || ($3::text[])[${i + 1}] || '%'`).join(' AND '));
  if (t.chiffres !== null) {
    testsSyndic.push(`regexp_replace(concat_ws(' ', s.telephone, s.telephone_2), '\\D', '', 'g') LIKE '%' || $1 || '%'`);
    testsSyndic.push(`EXISTS (SELECT 1 FROM gestion_syndic_contact ct JOIN gestion_syndic_coordonnee k ON k.contact_id = ct.id
      WHERE ct.syndic_id = s.id AND ct.retire_le IS NULL AND k.retire_le IS NULL AND k.sorte = 'telephone'
        AND regexp_replace(k.valeur, '\\D', '', 'g') LIKE '%' || $1 || '%')`);
  }
  if (t.email !== null) {
    testsSyndic.push(`lower(coalesce(s.email, '')) LIKE '%' || $2 || '%'`);
    testsSyndic.push(`EXISTS (SELECT 1 FROM gestion_syndic_contact ct JOIN gestion_syndic_coordonnee k ON k.contact_id = ct.id
      WHERE ct.syndic_id = s.id AND ct.retire_le IS NULL AND k.retire_le IS NULL AND k.sorte = 'email' AND lower(k.valeur) LIKE '%' || $2 || '%')`);
  }
  const { rows: syn } = testsSyndic.length === 0 ? { rows: [] as Ligne[] }
    : await query<Ligne>(
      `SELECT s.id::text, s.nom, nullif(coalesce(nullif(s.telephone, ''), s.telephone_2), '') AS telephone, nullif(s.email, '') AS email,
              NULL::text AS adresse, s.ville AS detail, false AS ancien
         FROM gestion_syndic s
        WHERE ${NEUTRE} AND s.supprime_le IS NULL AND (${testsSyndic.map((x) => `(${x})`).join(' OR ')})
        ORDER BY ${pertinence('lower(s.nom)')}, lower(s.nom), s.id LIMIT ${LIMITE + 1}`, params);
  // Les biens : par leur SEULE adresse, ceux du portefeuille (et les sortis, marqués anciens).
  const { rows: biens } = t.mots.length === 0 ? { rows: [] as Ligne[] }
    : await query<Ligne>(
      `SELECT lo.id::text, nullif(concat_ws(', ', lo.adresse, lo.commune), '') AS nom, NULL::text AS telephone, NULL::text AS email,
              nullif(concat_ws(', ', lo.adresse, lo.commune), '') AS adresse, coalesce(pr.nom_complet, lo.proprietaire_texte) AS detail,
              ${ancien('lo')} AS ancien
         FROM gestion_annuaire_lot lo LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
        WHERE ${bienConnu('lo')}
          AND ${t.mots.map((_, i) => `coalesce(lo.adresse_normalisee, '') LIKE '%' || ($1::text[])[${i + 1}] || '%'`).join(' AND ')}
        ORDER BY ${ancien('lo')}, lo.adresse_normalisee, lo.id LIMIT ${LIMITE + 1}`, [t.mots]);

  const ligne = ligneDe;
  const borne = <T>(l: T[]): T[] => l.slice(0, LIMITE);
  return {
    proprietaires: borne(prop).map((r) => ligne(r, `Propriétaire ${r.id}`)),
    locataires: borne(loc).map((r) => ligne(r, `Locataire ${r.id}`)),
    syndics: borne(syn).map((r) => ligne(r, `Syndic ${r.id}`)),
    biens: borne(biens).map((r) => ligne(r, `Bien ${r.id}`)),
    tronque: [prop, loc, syn, biens].some((l) => l.length > LIMITE),
  };
}

// ── LA SORTIE DU PORTEFEUILLE (= ARCHIVER) ───────────────────────────────────────────────────────────────────────────

export type SujetPortefeuille = 'proprietaire' | 'locataire' | 'bien';
const TABLE: Record<SujetPortefeuille, string> = {
  proprietaire: 'gestion_annuaire_proprietaire', locataire: 'gestion_annuaire_locataire', bien: 'gestion_annuaire_lot',
};

/** La table des origines d'archivage (migration 380) est-elle là ? */
function origineDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_proprietaire_archivage_origine', 'origine');
}

/**
 * L'ORIGINE de l'archivage EN COURS d'un propriétaire (libellé), ou `null` : la ligne dont l'instant est celui de la
 * sortie. Les archivages passés (avant une réactivation) restent dans la table, mais ne s'affichent plus comme actuels.
 */
async function origineDeLArchivage(q: RequeteTx, proprietaireId: number, instant: string): Promise<string | null> {
  if (!(await origineDisponible())) return null;
  const { rows } = await q<{ origine: string; sous: string | null; precision: string | null }>(
    `SELECT origine, sous_origine AS sous, precision_libre AS precision FROM gestion_proprietaire_archivage_origine
      WHERE proprietaire_id = $1 AND archive_le = $2::timestamptz ORDER BY id DESC LIMIT 1`, [proprietaireId, instant]);
  const r = rows[0];
  if (r === undefined) return null;
  return libelleOrigine({ origine: r.origine, sousOrigine: r.sous }) + (r.precision === null ? '' : ` (${r.precision})`);
}

/** L'origine de la sortie EN COURS d'un bien (migration 381), ou `null`. */
async function origineDeLaSortieDuBien(lotId: number, instant: string): Promise<string | null> {
  if (!(await colonneExisteMemo('gestion_lot_sortie_origine', 'origine'))) return null;
  const { rows } = await query<{ origine: string; sous: string | null; precision: string | null }>(
    `SELECT origine, sous_origine AS sous, precision_libre AS precision FROM gestion_lot_sortie_origine
      WHERE lot_id = $1 AND sorti_le = $2::timestamptz ORDER BY id DESC LIMIT 1`, [lotId, instant]);
  const r = rows[0];
  return r === undefined ? null : libelleOrigine({ origine: r.origine, sousOrigine: r.sous }) + (r.precision === null ? '' : ` (${r.precision})`);
}

/** La sortie d'une fiche (quand, par qui ; l'origine pour un propriétaire), ou `null` si elle est dans le portefeuille. */
export async function sortieDe(sujet: SujetPortefeuille, id: number): Promise<SortiePortefeuille | null> {
  if (!(await sortieDisponible())) return null;
  const { rows } = await query<{ le: string | null; par: string | null }>(
    `SELECT sorti_portefeuille_le::text AS le, sorti_portefeuille_par AS par FROM ${TABLE[sujet]} WHERE id = $1`, [id]);
  if (!rows[0]?.le) return null;
  const origine = sujet === 'proprietaire' ? await origineDeLArchivage((t, p) => query(t, p), id, rows[0].le)
    : sujet === 'bien' ? await origineDeLaSortieDuBien(id, rows[0].le) : null;
  return { le: rows[0].le, par: rows[0].par, ...(sujet !== 'locataire' ? { origine } : {}) };
}

class Refus extends Error {}

/**
 * Une ligne du journal (ajout seul). ⚠️ L'entité « annuaire » couvre propriétaires ET locataires (deux tables, deux suites
 * d'identifiants) : la SORTE de la fiche est donc écrite dans `valeur_apres`, pour qu'une ligne se relise sans ambiguïté.
 */
async function journaliser(q: RequeteTx, sujet: SujetPortefeuille, id: number, action: string, commentaire: string, auteur: Auteur): Promise<void> {
  await q(
    `INSERT INTO gestion_journal (entite, entite_id, action, valeur_apres, commentaire, auteur_id, auteur_libelle) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [sujet === 'bien' ? 'annuaire_lot' : 'annuaire', id, action, sujet, commentaire, auteur.id, auteur.libelle]);
}

/** Les biens touchés par la sortie d'un bien : lui et ses annexes (une annexe suit son logement). */
async function avecAnnexes(q: RequeteTx, lotId: number): Promise<number[]> {
  // Une annexe DÉTACHÉE (louable séparément, migration 379) ne suit plus son logement : elle garde son lien, pas son sort.
  const detachee = (await colonneExisteMemo('gestion_annuaire_lot', 'annexe_detachee_le'))
    ? ' AND NOT EXISTS (SELECT 1 FROM gestion_annuaire_lot d WHERE d.id = a.annexe_id AND d.annexe_detachee_le IS NOT NULL)' : '';
  const { rows } = await q<{ id: string }>(
    `SELECT a.annexe_id::text AS id FROM gestion_lot_annexe a WHERE a.parent_id = $1${detachee}`, [lotId]);
  return [lotId, ...rows.map((r) => Number(r.id))];
}

/** Un bien et TOUTES ses annexes, détachées comprises (sortie de biens, réactivation au même instant). */
async function avecToutesAnnexes(q: RequeteTx, lotId: number): Promise<number[]> {
  const { rows } = await q<{ id: string }>('SELECT annexe_id::text AS id FROM gestion_lot_annexe WHERE parent_id = $1', [lotId]);
  return [lotId, ...rows.map((r) => Number(r.id))];
}

/** Les biens d'un propriétaire, par les deux sources de propriété (celle de l'import et les liens EN COURS de la Gestion). */
const SQL_BIENS_DU_PROPRIETAIRE = `(lo.proprietaire_id = $1
  OR lo.id IN (SELECT lp.lot_id FROM gestion_annuaire_lot_proprietaire lp WHERE lp.proprietaire_id = $1 AND lp.jusqu_a IS NULL))`;

/** Un propriétaire ACTIF : ni archivé dans la Gestion, ni sorti du portefeuille, ni supprimé. */
async function sqlProprietaireActif(alias: string): Promise<string> {
  const archive = (await colonneExisteMemo('gestion_annuaire_proprietaire', 'archive_le')) ? ` AND ${alias}.archive_le IS NULL` : '';
  return `${alias}.sorti_portefeuille_le IS NULL${archive} AND ${await sqlPersonneVivante(alias)}`;
}

/** « Louée » au sens d'Arno : une location EN COURS (pas de date de sortie) sur un bien en gestion, présent à l'export. */
const SQL_LOCATION_EN_COURS = `o.sortie IS NULL AND lo.gestion_fin IS NULL AND lo.absent_le IS NULL`;

const numeroLot = (wippimmo: string | null): string | null => (wippimmo === null || wippimmo.startsWith('app-') ? null : wippimmo);

/**
 * LE PLAN D'ARCHIVAGE — ce que la sortie fera, calculé SANS RIEN ÉCRIRE (dans la transaction de l'écriture, ou seul pour
 * l'aperçu de l'écran : les deux lisent la même chose, l'écran ne peut donc pas annoncer autre chose que ce qui arrive).
 *   · PROPRIÉTAIRE : ses biens (les deux sources de propriété) encore dans le portefeuille, avec leurs annexes — SAUF un
 *     bien qu'un autre propriétaire ACTIF détient aussi (il reste, et la modale le dit) ;
 *   · BIEN : lui et ses annexes (une annexe détachée garde son lien, pas son sort) ;
 *   · LOCATAIRE : rien d'autre que lui.
 * Les locations EN COURS de ces biens (ou du locataire) seront closes ; leurs locataires sortent aussi, sauf ceux qui
 * louent un autre bien du portefeuille.
 */
async function planArchivage(q: RequeteTx, sujet: SujetPortefeuille, id: number): Promise<ApercuArchivage | null> {
  const nomSql = sujet === 'proprietaire' ? 'nom_complet' : sujet === 'locataire' ? 'nom'
    : `coalesce(nullif(concat_ws(', ', adresse, commune), ''), 'Bien ' || id)`;
  const { rows: s } = await q<{ nom: string | null; le: string | null; par: string | null }>(
    `SELECT ${nomSql} AS nom, sorti_portefeuille_le::text AS le, sorti_portefeuille_par AS par FROM ${TABLE[sujet]} WHERE id = $1`, [id]);
  if (s[0] === undefined) return null;
  const apercu: ApercuArchivage = {
    sujet, id, nom: s[0].nom ?? `Fiche ${id}`,
    sortie: s[0].le === null ? null : { le: s[0].le, par: s[0].par, ...(sujet === 'proprietaire' ? { origine: await origineDeLArchivage(q, id, s[0].le) } : {}) },
    biens: [], partages: [], occupees: [], locatairesArchives: [], locatairesGardes: [],
  };
  if (apercu.sortie !== null) return apercu;

  let biens: number[] = [];
  if (sujet === 'bien') {
    biens = await avecAnnexes(q, id);
  } else if (sujet === 'proprietaire') {
    const { rows: tetes } = await q<{ id: string }>(
      `SELECT lo.id::text FROM gestion_annuaire_lot lo WHERE ${SQL_BIENS_DU_PROPRIETAIRE} AND lo.sorti_portefeuille_le IS NULL ORDER BY lo.id`, [id]);
    const ids = tetes.map((r) => Number(r.id));
    const actif = await sqlProprietaireActif('pr');
    const { rows: partages } = ids.length === 0 ? { rows: [] }
      : await q<{ id: string; adresse: string | null; numero: string | null; autres: string[]; occupe: boolean }>(
        `SELECT lo.id::text, nullif(concat_ws(', ', lo.adresse, lo.commune), '') AS adresse, lo.wippimmo_id AS numero,
                array_agg(DISTINCT pr.nom_complet ORDER BY pr.nom_complet) AS autres,
                EXISTS (SELECT 1 FROM gestion_annuaire_occupation o WHERE o.lot_id = lo.id AND ${SQL_LOCATION_EN_COURS}) AS occupe
           FROM gestion_annuaire_lot lo
           JOIN gestion_annuaire_proprietaire pr ON (pr.id = lo.proprietaire_id
             OR pr.id IN (SELECT lp.proprietaire_id FROM gestion_annuaire_lot_proprietaire lp WHERE lp.lot_id = lo.id AND lp.jusqu_a IS NULL))
          WHERE lo.id = ANY($1::bigint[]) AND pr.id <> $2 AND ${actif}
          GROUP BY lo.id ORDER BY lo.id`, [ids, id]);
    apercu.partages = partages.map((r) => ({
      lotId: Number(r.id), adresse: r.adresse, lot: numeroLot(r.numero), autres: r.autres, occupe: r.occupe,
    }));
    const partagesIds = new Set(apercu.partages.map((p) => p.lotId));
    for (const t of ids.filter((x) => !partagesIds.has(x))) biens.push(...await avecAnnexes(q, t));
  }
  if (biens.length > 0) {
    // Les annexes déjà sorties (séparément, avant) ne ressortent pas : leur date de sortie reste la leur.
    const { rows } = await q<{ id: string }>(
      'SELECT id::text FROM gestion_annuaire_lot WHERE id = ANY($1::bigint[]) AND sorti_portefeuille_le IS NULL', [[...new Set(biens)]]);
    const restants = new Set(rows.map((r) => Number(r.id)));
    biens = [...new Set(biens)].filter((b) => restants.has(b));
  }
  apercu.biens = biens;

  await occupationsEtLocataires(q, apercu, sujet === 'locataire' ? id : null, biens);
  return apercu;
}

/**
 * Les locations EN COURS qui seront closes (sur ces biens, ou d'un locataire), et leurs locataires : archivés aussi, SAUF
 * s'ils louent un autre bien du portefeuille. Complète l'aperçu (même calcul pour toutes les sorties).
 */
async function occupationsEtLocataires(q: RequeteTx, apercu: ApercuArchivage, locataireId: number | null, biens: number[]): Promise<void> {
  const sujet: SujetPortefeuille = locataireId !== null ? 'locataire' : 'bien';
  const id = locataireId ?? 0;
  // Les locations EN COURS qui seront closes.
  const filtre = sujet === 'locataire' ? 'o.locataire_id = $1' : 'o.lot_id = ANY($1::bigint[])';
  if (sujet === 'locataire' || biens.length > 0) {
    const { rows } = await q<{ id: string; lot_id: string; adresse: string | null; numero: string | null; locataire_id: string; locataire: string | null; entree: string | null }>(
      `SELECT o.id::text, o.lot_id::text, nullif(concat_ws(', ', lo.adresse, lo.commune), '') AS adresse, lo.wippimmo_id AS numero,
              o.locataire_id::text, lc.nom AS locataire, o.entree::text
         FROM gestion_annuaire_occupation o
         JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
         JOIN gestion_annuaire_locataire lc ON lc.id = o.locataire_id
        WHERE ${filtre} AND ${SQL_LOCATION_EN_COURS}
        ORDER BY lo.adresse_normalisee NULLS LAST, lo.id, lc.nom, o.id`, [sujet === 'locataire' ? id : biens]);
    apercu.occupees = rows.map((r) => ({
      occupationId: Number(r.id), lotId: Number(r.lot_id), adresse: r.adresse, lot: numeroLot(r.numero),
      locataireId: Number(r.locataire_id), locataire: r.locataire ?? `Locataire ${r.locataire_id}`, entree: r.entree,
    }));
  }

  // Les locataires de ces locations : archivés aussi, SAUF s'ils louent un autre bien du portefeuille.
  const candidats = [...new Set(apercu.occupees.map((o) => o.locataireId))].filter((l) => !(sujet === 'locataire' && l === id));
  if (candidats.length > 0) {
    const { rows } = await q<{ id: string; nom: string | null; sorti: boolean; ailleurs: string | null; loue_ailleurs: boolean }>(
      `SELECT lc.id::text, lc.nom, (lc.sorti_portefeuille_le IS NOT NULL) AS sorti,
              (SELECT nullif(concat_ws(', ', lo.adresse, lo.commune), '') FROM gestion_annuaire_occupation o
                 JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
                WHERE o.locataire_id = lc.id AND ${SQL_LOCATION_EN_COURS} AND lo.sorti_portefeuille_le IS NULL
                  AND NOT (o.id = ANY($2::bigint[])) AND NOT (lo.id = ANY($3::bigint[]))
                ORDER BY o.entree DESC NULLS LAST, o.id LIMIT 1) AS ailleurs,
              EXISTS (SELECT 1 FROM gestion_annuaire_occupation o JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
                WHERE o.locataire_id = lc.id AND ${SQL_LOCATION_EN_COURS} AND lo.sorti_portefeuille_le IS NULL
                  AND NOT (o.id = ANY($2::bigint[])) AND NOT (lo.id = ANY($3::bigint[]))) AS loue_ailleurs
         FROM gestion_annuaire_locataire lc WHERE lc.id = ANY($1::bigint[]) ORDER BY lc.nom, lc.id`,
      [candidats, apercu.occupees.map((o) => o.occupationId), biens]);
    for (const r of rows) {
      if (r.loue_ailleurs) apercu.locatairesGardes.push({ id: Number(r.id), nom: r.nom ?? `Locataire ${r.id}`, ailleurs: r.ailleurs });
      else if (!r.sorti) apercu.locatairesArchives.push(Number(r.id));
    }
  }
}

/** L'APERÇU, pour l'écran : ce que « Archiver » fera, sans rien écrire. `null` = fiche inconnue (ou sans la migration 373). */
export async function apercuArchivage(sujet: SujetPortefeuille, id: number): Promise<ApercuArchivage | null> {
  if (!(await sortieDisponible())) return null;
  return planArchivage((texte, params) => query(texte, params), sujet, id);
}

export interface BilanArchivage { biens: number; locations: number; locataires: number }

/**
 * « SUPPRIMER » / « ARCHIVER » = SORTIR DU PORTEFEUILLE. Rien n'est effacé : chaque fiche est datée et signée (même
 * instant pour toutes), quitte les listes actives et la recherche, reste consultable dans « Anciens » et se réactive.
 *
 * 🔴 RÈGLE D'ARNO DU 18/10/2026, qui REMPLACE « sortie refusée si locataire en place » : une location en cours ne bloque
 * plus — elle est CLOSE à la date du jour (comme « Enregistrer le départ » de la Gestion), et son locataire sort aussi,
 * sauf s'il loue un autre bien du portefeuille. Mais seulement APRÈS l'avertissement : sans `confirmeOccupation`, le
 * serveur refuse (même par appel direct), et l'écran montre d'abord la liste des biens occupés.
 * Un propriétaire archivé l'est aussi dans la Gestion (`archive_le` : « archivée » sur ses cartes, même donnée).
 */
export async function sortirDuPortefeuille(
  sujet: SujetPortefeuille, id: number, auteur: Auteur, options: { confirmeOccupation?: boolean; origine?: unknown } = {},
): Promise<Issue<BilanArchivage>> {
  if (!(await sortieDisponible())) return { etat: 'sans_schema' };
  // 🔴 Arno (18/10/2026) : un PROPRIÉTAIRE ne s'archive pas sans son origine — refus avant toute lecture ou écriture.
  const origine = sujet === 'proprietaire' ? verifierOrigine(options.origine) : null;
  if (sujet === 'proprietaire' && origine === null) return { etat: 'refus', motif: MOTIF_ORIGINE_REQUISE };
  try {
    return await withTransaction(async (q) => {
      const { rows } = await q<{ sorti: string | null }>(`SELECT sorti_portefeuille_le::text AS sorti FROM ${TABLE[sujet]} WHERE id = $1 FOR UPDATE`, [id]);
      if (rows[0] === undefined) return { etat: 'inconnu' as const };
      if (rows[0].sorti !== null) return { etat: 'ok' as const, data: { biens: 0, locations: 0, locataires: 0 } };
      const plan = await planArchivage(q, sujet, id);
      if (plan === null) return { etat: 'inconnu' as const };
      // 🔴 AVANT TOUTE ÉCRITURE (un refus rendu après un UPDATE serait quand même validé par la transaction).
      if (plan.occupees.length > 0 && options.confirmeOccupation !== true) throw new Refus(MOTIF_OCCUPATION_A_CONFIRMER);

      const { rows: t } = await q<{ maintenant: string; aujourdhui: string }>(
        `SELECT now()::text AS maintenant, ${SQL_AUJOURDHUI_PARIS}::text AS aujourdhui`);
      const maintenant = t[0].maintenant;
      await q(`UPDATE ${TABLE[sujet]} SET sorti_portefeuille_le = $3::timestamptz, sorti_portefeuille_par = $2 WHERE id = $1`, [id, auteur.libelle, maintenant]);
      const autres = plan.biens.filter((b) => !(sujet === 'bien' && b === id));
      if (autres.length > 0) {
        await q(`UPDATE gestion_annuaire_lot SET sorti_portefeuille_le = $3::timestamptz, sorti_portefeuille_par = $2
                  WHERE id = ANY($1::bigint[]) AND sorti_portefeuille_le IS NULL`, [autres, auteur.libelle, maintenant]);
        for (const b of autres) {
          await journaliser(q, 'bien', b, 'location_sortie_portefeuille',
            `sorti du portefeuille avec ${sujet === 'bien' ? `le bien ${id}` : `le propriétaire ${id}`} (tuile Location) — rien n’est effacé, réactivable`, auteur);
        }
      }
      // Les locations en cours : closes à la date du jour (jamais avant l'entrée : la base refuse une sortie antérieure).
      for (const o of plan.occupees) {
        await q(`UPDATE gestion_annuaire_occupation SET sortie = greatest(coalesce(entree, $2::date), $2::date) WHERE id = $1 AND sortie IS NULL`,
          [o.occupationId, t[0].aujourdhui]);
        await journaliser(q, 'locataire', o.locataireId, 'location_cloture_archivage',
          `location du bien ${o.lotId} close le ${t[0].aujourdhui} par l’archivage ${sujet === 'locataire' ? 'du locataire' : sujet === 'bien' ? `du bien ${id}` : `du propriétaire ${id}`} (tuile Location) — l’occupation passe dans l’historique`, auteur);
      }
      if (plan.locatairesArchives.length > 0) {
        await q(`UPDATE gestion_annuaire_locataire SET sorti_portefeuille_le = $3::timestamptz, sorti_portefeuille_par = $2
                  WHERE id = ANY($1::bigint[]) AND sorti_portefeuille_le IS NULL`, [plan.locatairesArchives, auteur.libelle, maintenant]);
        for (const l of plan.locatairesArchives) {
          await journaliser(q, 'locataire', l, 'location_sortie_portefeuille',
            `sorti du portefeuille : sa location est close par l’archivage ${sujet === 'bien' ? `du bien ${id}` : `du propriétaire ${id}`} (tuile Location) — rien n’est effacé, réactivable`, auteur);
        }
      }
      // L'ORIGINE (migration 380) : une ligne en ajout seul, au MÊME instant que la sortie — elle reste après une réactivation.
      if (origine !== null && await origineDisponible()) {
        await q(`INSERT INTO gestion_proprietaire_archivage_origine (proprietaire_id, origine, sous_origine, precision_libre, archive_le, archive_par_libelle)
                  VALUES ($1, $2, $3, $4, $5::timestamptz, $6)`, [id, origine.origine, origine.sousOrigine, origine.precision, maintenant, auteur.libelle]);
      }
      // 🔴 POINT 7 D'ARNO : un propriétaire archivé depuis la Location est archivé dans la Gestion aussi (même donnée).
      if (sujet === 'proprietaire' && await colonneExisteMemo('gestion_annuaire_proprietaire', 'archive_le')) {
        await q(`UPDATE gestion_annuaire_proprietaire SET archive_le = $3::timestamptz, archive_par_libelle = $2
                  WHERE id = $1 AND archive_le IS NULL`, [id, auteur.libelle, maintenant]);
      }
      const morceaux = [
        origine !== null ? `origine : ${libelleOrigine(origine)}${origine.precision === null ? '' : ` — précision : ${origine.precision}`}` : null,
        autres.length > 0 ? `avec ${autres.length} bien(s) / annexe(s) : ${autres.join(', ')}` : null,
        plan.partages.length > 0 ? `bien(s) partagé(s) laissé(s) dans le portefeuille : ${plan.partages.map((p) => p.lotId).join(', ')}` : null,
        plan.occupees.length > 0 ? `${plan.occupees.length} location(s) close(s) le ${t[0].aujourdhui} (occupations ${plan.occupees.map((o) => o.occupationId).join(', ')})` : null,
        plan.locatairesArchives.length > 0 ? `locataire(s) archivé(s) : ${plan.locatairesArchives.join(', ')}` : null,
        plan.locatairesGardes.length > 0 ? `locataire(s) gardé(s), qui louent un autre bien : ${plan.locatairesGardes.map((l) => l.id).join(', ')}` : null,
      ].filter((x) => x !== null);
      await journaliser(q, sujet, id, 'location_sortie_portefeuille',
        `sorti du portefeuille (tuile Location)${morceaux.length > 0 ? ` — ${morceaux.join(' ; ')}` : ''} — rien n’est effacé, réactivable`, auteur);
      return { etat: 'ok' as const, data: { biens: autres.length, locations: plan.occupees.length, locataires: plan.locatairesArchives.length } };
    });
  } catch (e) {
    if (e instanceof Refus) return { etat: 'refus', motif: e.message };
    throw e;
  }
}

/**
 * RÉACTIVER : la fiche revient dans le portefeuille. Pour un propriétaire ou un bien, les biens sortis AVEC lui (même
 * instant) reviennent aussi ; un bien sorti séparément, avant, reste sorti. Un propriétaire archivé dans la Gestion PAR
 * cet archivage (même instant) y est restauré ; archivé à la main dans la Gestion, avant, il le reste.
 * Les locations closes par l'archivage RESTENT closes (ce sont des dates d'historique) ; leurs locataires restent dans
 * « Anciens » et se réactivent depuis leur fiche.
 */
export async function reactiverDansPortefeuille(sujet: SujetPortefeuille, id: number, auteur: Auteur): Promise<Issue<{ biens: number }>> {
  if (!(await sortieDisponible())) return { etat: 'sans_schema' };
  return withTransaction(async (q) => {
    const { rows } = await q<{ sorti: string | null }>(`SELECT sorti_portefeuille_le::text AS sorti FROM ${TABLE[sujet]} WHERE id = $1 FOR UPDATE`, [id]);
    if (rows[0] === undefined) return { etat: 'inconnu' as const };
    const instant = rows[0].sorti;
    if (instant === null) return { etat: 'ok' as const, data: { biens: 0 } };
    await q(`UPDATE ${TABLE[sujet]} SET sorti_portefeuille_le = NULL, sorti_portefeuille_par = NULL WHERE id = $1`, [id]);
    let n = 0;
    if (sujet !== 'locataire') {
      const tetes = sujet === 'bien' ? [id]
        : (await q<{ id: string }>(`SELECT lo.id::text FROM gestion_annuaire_lot lo WHERE ${SQL_BIENS_DU_PROPRIETAIRE}`, [id])).rows.map((r) => Number(r.id));
      // Toutes les annexes, détachées comprises : seules reviennent celles sorties AU MÊME INSTANT (donc avec lui).
      const lies = [...new Set((await Promise.all(tetes.map((l) => avecToutesAnnexes(q, l)))).flat())].filter((x) => !(sujet === 'bien' && x === id));
      if (lies.length > 0) {
        const r = await q(`UPDATE gestion_annuaire_lot SET sorti_portefeuille_le = NULL, sorti_portefeuille_par = NULL
                            WHERE id = ANY($1::bigint[]) AND sorti_portefeuille_le = $2::timestamptz`, [lies, instant]);
        n = r.rowCount ?? 0;
      }
    }
    if (sujet === 'proprietaire' && await colonneExisteMemo('gestion_annuaire_proprietaire', 'archive_le')) {
      await q(`UPDATE gestion_annuaire_proprietaire SET archive_le = NULL, archive_par_libelle = NULL
                WHERE id = $1 AND archive_le = $2::timestamptz`, [id, instant]);
    }
    await journaliser(q, sujet, id, 'location_reactivation_portefeuille',
      `réactivé dans le portefeuille (tuile Location)${n > 0 ? ` avec ${n} bien(s) / annexe(s) sortis en même temps` : ''}`, auteur);
    return { etat: 'ok' as const, data: { biens: n } };
  });
}

// ── « SUPPRIMER UN DES BIENS D'UN PROPRIÉTAIRE » (Arno, 18/10/2026 — migration 381) ──────────────────────────────────

function origineSortieBienDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_lot_sortie_origine', 'origine');
}

/**
 * LES BIENS ACTIFS D'UN PROPRIÉTAIRE (têtes) : ses biens du portefeuille (les deux sources de propriété), non sortis, en
 * gestion, présents à l'export — sans les annexes dont le logement est aussi à lui (elles suivent leur logement).
 */
async function tetesDuProprietaire(q: RequeteTx, proprietaireId: number): Promise<number[]> {
  const { rows } = await q<{ id: string }>(
    `SELECT lo.id::text FROM gestion_annuaire_lot lo
      WHERE ${SQL_BIENS_DU_PROPRIETAIRE} AND lo.sorti_portefeuille_le IS NULL AND lo.gestion_fin IS NULL AND lo.absent_le IS NULL
        AND NOT EXISTS (SELECT 1 FROM gestion_lot_annexe a JOIN gestion_annuaire_lot pa ON pa.id = a.parent_id
                         WHERE a.annexe_id = lo.id AND (pa.proprietaire_id = $1
                           OR pa.id IN (SELECT lp.lot_id FROM gestion_annuaire_lot_proprietaire lp WHERE lp.proprietaire_id = $1 AND lp.jusqu_a IS NULL)))
      ORDER BY lo.adresse_normalisee NULLS LAST, lo.id`, [proprietaireId]);
  return rows.map((r) => Number(r.id));
}

/** Les biens actifs d'un propriétaire, pour l'écran de sélection (annexes, locataires en place, autres propriétaires). */
export async function biensPourSortie(proprietaireId: number): Promise<BienASortir[] | null> {
  if (!(await sortieDisponible())) return null;
  const q: RequeteTx = (t, p) => query(t, p);
  const { rows: p } = await q('SELECT 1 FROM gestion_annuaire_proprietaire WHERE id = $1', [proprietaireId]);
  if (p.length === 0) return null;
  const tetes = await tetesDuProprietaire(q, proprietaireId);
  if (tetes.length === 0) return [];
  const actif = await sqlProprietaireActif('pr');
  const detachee = (await colonneExisteMemo('gestion_annuaire_lot', 'annexe_detachee_le')) ? '(an.annexe_detachee_le IS NOT NULL)' : 'false';
  const { rows } = await q<{ id: string; adresse: string | null; numero: string | null; nature: string | null;
    annexes: { id: number; categorie: string | null; porte: string | null; detachee: boolean }[] | null; locataires: string[] | null; autres: string[] | null }>(
    `SELECT lo.id::text, nullif(concat_ws(', ', lo.adresse, lo.commune), '') AS adresse, lo.wippimmo_id AS numero, coalesce(lo.nature, lo.type_bien) AS nature,
            (SELECT json_agg(json_build_object('id', an.id, 'categorie', an.categorie, 'porte', an.porte, 'detachee', ${detachee}) ORDER BY an.id)
               FROM gestion_lot_annexe a JOIN gestion_annuaire_lot an ON an.id = a.annexe_id
              WHERE a.parent_id = lo.id AND an.sorti_portefeuille_le IS NULL) AS annexes,
            (SELECT array_agg(lc.nom ORDER BY lc.nom) FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire lc ON lc.id = o.locataire_id
              WHERE o.lot_id = lo.id AND o.sortie IS NULL) AS locataires,
            (SELECT array_agg(DISTINCT pr.nom_complet) FROM gestion_annuaire_proprietaire pr
              WHERE pr.id <> $2 AND ${actif} AND (pr.id = lo.proprietaire_id
                OR pr.id IN (SELECT lp.proprietaire_id FROM gestion_annuaire_lot_proprietaire lp WHERE lp.lot_id = lo.id AND lp.jusqu_a IS NULL))) AS autres
       FROM gestion_annuaire_lot lo WHERE lo.id = ANY($1::bigint[])
      ORDER BY lo.adresse_normalisee NULLS LAST, lo.id`, [tetes, proprietaireId]);
  return rows.map((r) => ({
    lotId: Number(r.id), adresse: r.adresse, lot: numeroLot(r.numero), nature: r.nature,
    annexes: (r.annexes ?? []).map((a) => ({ lotId: Number(a.id), libelle: [a.categorie ? a.categorie.charAt(0).toUpperCase() + a.categorie.slice(1) : 'Annexe', a.porte ? `n° ${a.porte}` : null].filter((x) => x !== null).join(' '), detachee: a.detachee })),
    locataires: r.locataires ?? [], autresProprietaires: r.autres ?? [],
  }));
}

/**
 * LE PLAN DE SORTIE DE BIENS : les biens choisis (qui doivent être des têtes actives du propriétaire), TOUTES leurs annexes
 * (détachées comprises) non sorties, les biens partagés (signalés : ils sortent pour tous), les locations en cours et leurs
 * locataires. `null` = propriétaire inconnu ; `'hors'` = un bien choisi n'est pas un bien actif de ce propriétaire.
 */
async function planSortieBiens(q: RequeteTx, proprietaireId: number, lots: readonly number[]): Promise<{ apercu: ApercuArchivage; tous: boolean } | null | 'hors'> {
  const { rows: s0 } = await q<{ nom: string | null }>('SELECT nom_complet AS nom FROM gestion_annuaire_proprietaire WHERE id = $1', [proprietaireId]);
  if (s0[0] === undefined) return null;
  const tetes = await tetesDuProprietaire(q, proprietaireId);
  const choisis = [...new Set(lots)];
  if (choisis.some((l) => !tetes.includes(l))) return 'hors';
  const apercu: ApercuArchivage = {
    sujet: 'proprietaire', id: proprietaireId, nom: s0[0].nom ?? `Propriétaire ${proprietaireId}`, sortie: null,
    biens: [], partages: [], occupees: [], locatairesArchives: [], locatairesGardes: [], portee: 'biens', lotsChoisis: choisis,
  };
  let biens: number[] = [];
  for (const l of choisis) biens.push(...await avecToutesAnnexes(q, l));
  const { rows } = await q<{ id: string }>('SELECT id::text FROM gestion_annuaire_lot WHERE id = ANY($1::bigint[]) AND sorti_portefeuille_le IS NULL', [[...new Set(biens)]]);
  const restants = new Set(rows.map((r) => Number(r.id)));
  biens = [...new Set(biens)].filter((b) => restants.has(b));
  apercu.biens = biens;
  const actif = await sqlProprietaireActif('pr');
  const { rows: partages } = await q<{ id: string; adresse: string | null; numero: string | null; autres: string[]; occupe: boolean }>(
    `SELECT lo.id::text, nullif(concat_ws(', ', lo.adresse, lo.commune), '') AS adresse, lo.wippimmo_id AS numero,
            array_agg(DISTINCT pr.nom_complet ORDER BY pr.nom_complet) AS autres,
            EXISTS (SELECT 1 FROM gestion_annuaire_occupation o WHERE o.lot_id = lo.id AND ${SQL_LOCATION_EN_COURS}) AS occupe
       FROM gestion_annuaire_lot lo
       JOIN gestion_annuaire_proprietaire pr ON (pr.id = lo.proprietaire_id
         OR pr.id IN (SELECT lp.proprietaire_id FROM gestion_annuaire_lot_proprietaire lp WHERE lp.lot_id = lo.id AND lp.jusqu_a IS NULL))
      WHERE lo.id = ANY($1::bigint[]) AND pr.id <> $2 AND ${actif}
      GROUP BY lo.id ORDER BY lo.id`, [choisis, proprietaireId]);
  apercu.partages = partages.map((r) => ({ lotId: Number(r.id), adresse: r.adresse, lot: numeroLot(r.numero), autres: r.autres, occupe: r.occupe }));
  await occupationsEtLocataires(q, apercu, null, biens);
  return { apercu, tous: tetes.length > 0 && tetes.every((t) => choisis.includes(t)) };
}

/** L'APERÇU d'une sortie de biens (écran) — sans rien écrire. */
export async function apercuSortieBiens(proprietaireId: number, lots: readonly number[]): Promise<Issue<ApercuArchivage & { tousLesBiens: boolean }>> {
  if (!(await sortieDisponible())) return { etat: 'sans_schema' };
  if (lots.length === 0) return { etat: 'refus', motif: MOTIF_SELECTION_VIDE };
  const plan = await planSortieBiens((t, p) => query(t, p), proprietaireId, lots);
  if (plan === null) return { etat: 'inconnu' };
  if (plan === 'hors') return { etat: 'refus', motif: MOTIF_BIEN_HORS_SELECTION };
  return { etat: 'ok', data: { ...plan.apercu, tousLesBiens: plan.tous } };
}

/**
 * « SORTIR N BIENS DE LA GESTION » (Arno, 18/10/2026). Rien n'est effacé : chaque bien choisi et TOUTES ses annexes (détachées
 * comprises) sortent du portefeuille au même instant, réactivables ; les locations en cours sont closes à la date du jour
 * (après avertissement : `confirmeOccupation`) ; leurs locataires sortent aussi, sauf s'ils louent un autre bien ; l'ORIGINE
 * (obligatoire), la date et l'auteur sont enregistrés sur chaque bien (migration 381). Un bien partagé sort pour tous.
 * 🔴 TOUS les biens actifs du propriétaire choisis ⇒ c'est EXACTEMENT l'archivage du propriétaire (`sortirDuPortefeuille`).
 */
export async function sortirBiensDuPortefeuille(
  proprietaireId: number, lots: readonly number[], auteur: Auteur, options: { confirmeOccupation?: boolean; origine?: unknown } = {},
): Promise<Issue<BilanArchivage & { proprietaireArchive: boolean }>> {
  if (!(await sortieDisponible())) return { etat: 'sans_schema' };
  const choisis = [...new Set(lots)].filter((l) => Number.isSafeInteger(l) && l > 0);
  if (choisis.length === 0) return { etat: 'refus', motif: MOTIF_SELECTION_VIDE };
  const origine = verifierOrigine(options.origine);
  if (origine === null) return { etat: 'refus', motif: MOTIF_ORIGINE_REQUISE };
  const tetes = await tetesDuProprietaire((t, p) => query(t, p), proprietaireId);
  if (tetes.length > 0 && tetes.every((t) => choisis.includes(t)) && choisis.every((c) => tetes.includes(c))) {
    const r = await sortirDuPortefeuille('proprietaire', proprietaireId, auteur, options);
    return r.etat === 'ok' ? { etat: 'ok', data: { ...r.data, proprietaireArchive: true } } : r;
  }
  try {
    return await withTransaction(async (q) => {
      const { rows: verrou } = await q<{ id: string }>('SELECT id::text FROM gestion_annuaire_lot WHERE id = ANY($1::bigint[]) FOR UPDATE', [choisis]);
      if (verrou.length !== choisis.length) throw new Refus(MOTIF_BIEN_HORS_SELECTION);
      const plan = await planSortieBiens(q, proprietaireId, choisis);
      if (plan === null) return { etat: 'inconnu' as const };
      if (plan === 'hors') throw new Refus(MOTIF_BIEN_HORS_SELECTION);
      const a = plan.apercu;
      // 🔴 AVANT TOUTE ÉCRITURE.
      if (a.occupees.length > 0 && options.confirmeOccupation !== true) throw new Refus(MOTIF_OCCUPATION_A_CONFIRMER);
      const { rows: t } = await q<{ maintenant: string; aujourdhui: string }>(`SELECT now()::text AS maintenant, ${SQL_AUJOURDHUI_PARIS}::text AS aujourdhui`);
      const maintenant = t[0].maintenant;
      await q(`UPDATE gestion_annuaire_lot SET sorti_portefeuille_le = $3::timestamptz, sorti_portefeuille_par = $2
                WHERE id = ANY($1::bigint[]) AND sorti_portefeuille_le IS NULL`, [a.biens, auteur.libelle, maintenant]);
      const motOrigine = `${libelleOrigine(origine)}${origine.precision === null ? '' : ` — précision : ${origine.precision}`}`;
      const avecOrigine = await origineSortieBienDisponible();
      for (const b of a.biens) {
        if (avecOrigine) {
          await q(`INSERT INTO gestion_lot_sortie_origine (lot_id, proprietaire_id, origine, sous_origine, precision_libre, sorti_le, sorti_par_libelle)
                    VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7)`, [b, proprietaireId, origine.origine, origine.sousOrigine, origine.precision, maintenant, auteur.libelle]);
        }
        await journaliser(q, 'bien', b, 'location_sortie_portefeuille',
          `sorti du portefeuille depuis la fiche du propriétaire ${proprietaireId} (tuile Location, « Supprimer un des biens ») — origine : ${motOrigine}`
          + `${a.partages.some((p) => p.lotId === b) ? ' — bien partagé : il sort pour tous ses propriétaires' : ''} — rien n’est effacé, réactivable`, auteur);
      }
      for (const o of a.occupees) {
        await q(`UPDATE gestion_annuaire_occupation SET sortie = greatest(coalesce(entree, $2::date), $2::date) WHERE id = $1 AND sortie IS NULL`, [o.occupationId, t[0].aujourdhui]);
        await journaliser(q, 'locataire', o.locataireId, 'location_cloture_archivage',
          `location du bien ${o.lotId} close le ${t[0].aujourdhui} par la sortie de ce bien du portefeuille (tuile Location) — l’occupation passe dans l’historique`, auteur);
      }
      if (a.locatairesArchives.length > 0) {
        await q(`UPDATE gestion_annuaire_locataire SET sorti_portefeuille_le = $3::timestamptz, sorti_portefeuille_par = $2
                  WHERE id = ANY($1::bigint[]) AND sorti_portefeuille_le IS NULL`, [a.locatairesArchives, auteur.libelle, maintenant]);
        for (const l of a.locatairesArchives) {
          await journaliser(q, 'locataire', l, 'location_sortie_portefeuille', 'sorti du portefeuille : sa location est close par la sortie de son bien (tuile Location) — rien n’est effacé, réactivable', auteur);
        }
      }
      await journaliser(q, 'proprietaire', proprietaireId, 'location_sortie_biens',
        `${choisis.length} bien(s) sorti(s) du portefeuille (${a.biens.join(', ')}) — origine : ${motOrigine}`
        + `${a.occupees.length > 0 ? ` ; ${a.occupees.length} location(s) close(s) le ${t[0].aujourdhui}` : ''} — le propriétaire reste actif`, auteur);
      return { etat: 'ok' as const, data: { biens: a.biens.length, locations: a.occupees.length, locataires: a.locatairesArchives.length, proprietaireArchive: false } };
    });
  } catch (e) {
    if (e instanceof Refus) return { etat: 'refus', motif: e.message };
    throw e;
  }
}

// ── LE LOCATAIRE RATTACHÉ À UN BIEN ──────────────────────────────────────────────────────────────────────────────

export interface CreationLocataire {
  /** Un locataire EXISTANT (« Utiliser cette fiche » après une alerte de doublon), ou `null` pour en créer un. */
  locataireId: number | null;
  locataire: { civilite?: string | null; nom?: string; prenom?: string | null; telephone?: string; email?: string };
  lotId: number | null;
  entree: string | null;
}

/**
 * « Ajouter un locataire » : la fiche (création commune de l'annuaire), puis son occupation du bien choisi, avec la date
 * d'entrée. Si l'occupation échoue, la fiche reste (rien ne s'efface) et le motif le dit.
 */
export async function creerLocataireSurBien(o: CreationLocataire, auteur: Auteur): Promise<Issue<{ locataireId: number }>> {
  if (o.lotId === null) return { etat: 'refus', motif: 'Choisissez le bien loué.' };
  const entree = o.entree !== null && /^\d{4}-\d{2}-\d{2}$/.test(o.entree) ? o.entree : null;
  const { rows: lot } = await query<{ ok: boolean }>(`SELECT (${await sqlBienDuPortefeuille('lo')}) AS ok FROM gestion_annuaire_lot lo WHERE lo.id = $1`, [o.lotId]);
  if (lot[0] === undefined) return { etat: 'refus', motif: 'Ce bien n’existe plus.' };
  if (!lot[0].ok) return { etat: 'refus', motif: 'Ce bien n’est pas dans le portefeuille (sorti, fin de gestion ou absent du dernier export).' };
  let id = o.locataireId;
  if (id === null) {
    const l = o.locataire;
    if ((l.nom ?? '').trim() === '') return { etat: 'refus', motif: 'Le nom du locataire est obligatoire.' };
    const nom = [l.nom?.trim(), l.prenom?.trim()].filter((x) => x).join(' ');
    const coordonnees = [
      ...(l.telephone && l.telephone.trim() !== '' ? [{ sorte: 'telephone' as const, valeur: l.telephone, libelle: 'Mobile' }] : []),
      ...(l.email && l.email.trim() !== '' ? [{ sorte: 'email' as const, valeur: l.email, libelle: 'E-mail' }] : []),
    ];
    const cree = await creerPersonne('locataire', { nom, civilite: l.civilite ?? null, coordonnees }, auteur);
    if (cree.etat !== 'ok') return cree.etat === 'refus' ? { etat: 'refus', motif: cree.motif } : { etat: 'sans_schema' };
    id = cree.data.id;
  }
  const occ = await ajouterOccupant(o.lotId, id, entree, auteur);
  if (occ.etat !== 'ok') {
    const motif = occ.etat === 'refus' ? occ.motif : 'le bien est introuvable';
    return { etat: 'refus', motif: o.locataireId === null ? `La fiche du locataire est créée, mais son rattachement au bien a échoué : ${motif}` : motif };
  }
  return { etat: 'ok', data: { locataireId: id } };
}

/** Les biens du portefeuille proposés au rattachement d'un locataire (filtre sur l'adresse). */
export async function biensPourLocataire(filtre: string): Promise<{ id: number; titre: string; detail: string | null }[]> {
  const t = analyserTermePortefeuille(filtre);
  const conditionMots = t.mots.map((_, i) => `coalesce(lo.adresse_normalisee, '') LIKE '%' || ($1::text[])[${i + 1}] || '%'`).join(' AND ');
  const { rows } = await query<{ id: string; adresse: string | null; commune: string | null; proprietaire: string | null; loue: boolean; annexe: string | null }>(
    `SELECT lo.id::text, lo.adresse, lo.commune, coalesce(pr.nom_complet, lo.proprietaire_texte) AS proprietaire,
            CASE WHEN EXISTS (SELECT 1 FROM gestion_lot_annexe a WHERE a.annexe_id = lo.id)
                 THEN concat_ws(' ', initcap(coalesce(lo.categorie, 'annexe')), 'n° ' || lo.porte) END AS annexe,
            EXISTS (SELECT 1 FROM gestion_annuaire_occupation o WHERE o.lot_id = lo.id AND o.sortie IS NULL) AS loue
       FROM gestion_annuaire_lot lo LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
      WHERE ${await sqlBienDuPortefeuille('lo')} AND ${conditionMots === '' ? 'cardinality($1::text[]) = 0' : conditionMots}
      ORDER BY lo.adresse_normalisee, lo.id LIMIT 20`, [t.mots]);
  return rows.map((r) => ({
    id: Number(r.id), titre: (r.annexe === null ? '' : `${r.annexe} — `) + ([r.adresse, r.commune].filter((x) => x).join(', ') || `Bien ${r.id}`),
    detail: [r.proprietaire, r.loue ? 'déjà loué' : 'libre'].filter((x) => x).join(' · '),
  }));
}

/**
 * « Nouveau locataire » par CARTES (Arno, 17/10/2026) : « Locataire (client) » — un ou plusieurs (colocation, couple) —
 * et « Contact du locataire » (garant, conjoint, employeur…). Au moins UN locataire ; chaque carte client devient une fiche
 * (création commune de l'annuaire) et une occupation du bien choisi, à la même date d'entrée ; une fiche existante retenue
 * par « Utiliser cette fiche » est rattachée sans fusion. Les contacts sont posés sur le bien, côté locataire, par la
 * porte de la Gestion. Tout est VÉRIFIÉ avant la première écriture.
 */
export async function creerLocatairesSurBien(o: {
  cartes: ContactSaisi[]; existants: number[]; contacts: ContactSaisi[]; lotId: number | null; entree: string | null;
}, auteur: Auteur): Promise<Issue<{ locataireIds: number[]; contacts: number; contactsRefus: string | null }>> {
  if (o.lotId === null) return { etat: 'refus', motif: 'Choisissez le bien loué.' };
  const cartes = o.cartes.slice(0, 12);
  const existants = [...new Set(o.existants)].slice(0, 12);
  if (cartes.length + existants.length === 0) return { etat: 'refus', motif: 'Ajoutez au moins un locataire (client) : les contacts seuls ne suffisent pas.' };
  for (const [i, c] of cartes.entries()) {
    const m = Object.values(manquesClientLocation({ nom: c.nom, coordonnees: c.coordonnees }));
    if (m.length > 0) return { etat: 'refus', motif: `Locataire ${i + 1} : ${m.join(' ')}` };
  }
  // 🔴 Arno (18/10/2026) : la famille garde au moins UNE carte client complète — une carte saisie, ou une fiche retenue.
  if (!(await familleAUneCarteComplete('locataire', cartes, existants))) return { etat: 'refus', motif: MOTIF_PREMIERE_CARTE };
  const refusC = refusContacts(o.contacts);
  if (refusC !== null) return { etat: 'refus', motif: refusC };
  const entree = o.entree !== null && /^\d{4}-\d{2}-\d{2}$/.test(o.entree) ? o.entree : null;
  const { rows: lot } = await query<{ ok: boolean }>(`SELECT (${await sqlBienDuPortefeuille('lo')}) AS ok FROM gestion_annuaire_lot lo WHERE lo.id = $1`, [o.lotId]);
  if (lot[0] === undefined) return { etat: 'refus', motif: 'Ce bien n’existe plus.' };
  if (!lot[0].ok) return { etat: 'refus', motif: 'Ce bien n’est pas dans le portefeuille (sorti, fin de gestion ou absent du dernier export).' };
  const ids: number[] = [];
  for (const [i, c] of cartes.entries()) {
    const cree = await creerPersonne('locataire', { ...c, nom: (c.nom ?? '').trim() }, auteur);
    if (cree.etat !== 'ok') {
      const motif = cree.etat === 'refus' ? cree.motif : 'l’annuaire n’est pas modifiable';
      return { etat: 'refus', motif: ids.length === 0 ? `Locataire ${i + 1} : ${motif}` : `${ids.length} fiche(s) créée(s), mais le locataire ${i + 1} a échoué : ${motif}` };
    }
    ids.push(cree.data.id);
  }
  for (const id of [...ids, ...existants]) {
    const occ = await ajouterOccupant(o.lotId, id, entree, auteur);
    if (occ.etat !== 'ok') {
      return { etat: 'refus', motif: `Les fiches sont créées, mais le rattachement au bien a échoué : ${occ.etat === 'refus' ? occ.motif : 'le bien est introuvable'}` };
    }
  }
  const c = await creerContactsDuBien(o.lotId, 'locataire', o.contacts, auteur);
  return { etat: 'ok', data: { locataireIds: [...ids, ...existants], contacts: c.ok ? c.n : 0, contactsRefus: c.ok ? null : `Les locataires sont créés, mais : ${c.motif}` } };
}

/** La fiche d'un syndic, telle que la Gestion la connaît (mêmes données, aucune copie). */
export async function ficheSyndicLocation(id: number): Promise<FicheSyndic | null> {
  return ficheSyndic(id);
}
