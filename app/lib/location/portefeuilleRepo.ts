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
import { creerContactsDuBien, refusContacts, type ContactSaisi } from './contactsLocationRepo';

/**
 * ══ 🔴🔴 TUILE LOCATION — LE PORTEFEUILLE (refonte de l'accueil, Arno, 17/10/2026). IMPUR (base). ══════════════════════
 *
 *   · la RECHERCHE de l'accueil : personnes et syndics par nom / téléphone / e-mail ; biens par leur SEULE adresse, et
 *     seulement ceux du portefeuille (en gestion, présents au dernier export, non sortis) ;
 *   · la SORTIE DU PORTEFEUILLE (« Supprimer ») : jamais un effacement — deux colonnes datent et signent la sortie
 *     (migration 373), le journal la garde ; réactivable ; refusée tant qu'un locataire est en place ;
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
export async function rechercherPortefeuille(brut: string): Promise<ResultatsAccueil> {
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

  const { rows: prop } = await query<Ligne>(
    `SELECT p.id::text, p.nom_complet AS nom, ${coordonnee('proprietaire', 'p', 'telephone')} AS telephone,
            ${coordonnee('proprietaire', 'p', 'email')} AS email, NULL::text AS detail, ${ancien('p')} AS ancien,
            (SELECT nullif(concat_ws(', ', l.adresse, l.commune), '') FROM gestion_annuaire_lot l
              WHERE (l.proprietaire_id = p.id OR l.id IN (SELECT lp.lot_id FROM gestion_annuaire_lot_proprietaire lp WHERE lp.proprietaire_id = p.id AND lp.jusqu_a IS NULL))
                AND ${bienConnu('l')} ORDER BY ${avecSortie ? 'l.sorti_portefeuille_le IS NOT NULL, ' : ''}l.id LIMIT 1) AS adresse
       FROM gestion_annuaire_proprietaire p
      WHERE ${NEUTRE} AND ${vivanteP} AND (${parNom('p.nom_normalise')} OR ${parCoordonnee('proprietaire', 'p', 1)})
      ORDER BY ${ancien('p')}, ${pertinence('p.nom_normalise')}, p.nom_normalise, p.id LIMIT ${LIMITE + 1}`, params);
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

  const ligne = (r: Ligne, titreParDefaut: string): LigneRecherche => ({
    id: Number(r.id), titre: r.nom ?? titreParDefaut, telephone: r.telephone, email: r.email, adresse: r.adresse,
    detail: r.detail, ancien: r.ancien === true,
  });
  const borne = <T>(l: T[]): T[] => l.slice(0, LIMITE);
  return {
    proprietaires: borne(prop).map((r) => ligne(r, `Propriétaire ${r.id}`)),
    locataires: borne(loc).map((r) => ligne(r, `Locataire ${r.id}`)),
    syndics: borne(syn).map((r) => ligne(r, `Syndic ${r.id}`)),
    biens: borne(biens).map((r) => ligne(r, `Bien ${r.id}`)),
    tronque: [prop, loc, syn, biens].some((l) => l.length > LIMITE),
  };
}

// ── LA SORTIE DU PORTEFEUILLE ────────────────────────────────────────────────────────────────────────────────────

export type SujetPortefeuille = 'proprietaire' | 'locataire' | 'bien';
const TABLE: Record<SujetPortefeuille, string> = {
  proprietaire: 'gestion_annuaire_proprietaire', locataire: 'gestion_annuaire_locataire', bien: 'gestion_annuaire_lot',
};

/** La sortie d'une fiche (quand, par qui), ou `null` si elle est dans le portefeuille (ou sans la migration 373). */
export async function sortieDe(sujet: SujetPortefeuille, id: number): Promise<SortiePortefeuille | null> {
  if (!(await sortieDisponible())) return null;
  const { rows } = await query<{ le: string | null; par: string | null }>(
    `SELECT sorti_portefeuille_le::text AS le, sorti_portefeuille_par AS par FROM ${TABLE[sujet]} WHERE id = $1`, [id]);
  return rows[0]?.le ? { le: rows[0].le, par: rows[0].par } : null;
}

class Refus extends Error {}

async function journaliser(q: RequeteTx, sujet: SujetPortefeuille, id: number, action: string, commentaire: string, auteur: Auteur): Promise<void> {
  await q(
    `INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_id, auteur_libelle) VALUES ($1, $2, $3, $4, $5, $6)`,
    [sujet === 'bien' ? 'annuaire_lot' : 'annuaire', id, action, commentaire, auteur.id, auteur.libelle]);
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

/** Le message quand un locataire est en place : ce qu'il faut faire d'abord. */
export const MOTIF_LOCATAIRE_EN_PLACE =
  'Un locataire est encore en place : enregistrez d’abord son départ (fiche du locataire ou du bien), puis sortez le bien du portefeuille.';

/**
 * « SUPPRIMER » = SORTIR DU PORTEFEUILLE. Rien n'est effacé : la fiche est datée et signée, quitte les listes actives et
 * la recherche, reste consultable dans « Anciens », et se réactive.
 *   · un BIEN sort avec ses annexes ; refusé si l'un d'eux a un locataire en place ;
 *   · un PROPRIÉTAIRE sort avec ses biens encore dans le portefeuille ; refusé si l'un d'eux a un locataire en place ;
 *   · un LOCATAIRE ; refusé tant qu'il est en place (son départ s'enregistre d'abord).
 */
export async function sortirDuPortefeuille(sujet: SujetPortefeuille, id: number, auteur: Auteur): Promise<Issue<{ biens: number }>> {
  if (!(await sortieDisponible())) return { etat: 'sans_schema' };
  try {
    return await withTransaction(async (q) => {
      const { rows } = await q<{ sorti: string | null }>(`SELECT sorti_portefeuille_le::text AS sorti FROM ${TABLE[sujet]} WHERE id = $1 FOR UPDATE`, [id]);
      if (rows[0] === undefined) return { etat: 'inconnu' as const };
      if (rows[0].sorti !== null) return { etat: 'ok' as const, data: { biens: 0 } };
      let biens: number[] = [];
      if (sujet === 'locataire') {
        const { rows: o } = await q('SELECT 1 FROM gestion_annuaire_occupation WHERE locataire_id = $1 AND sortie IS NULL LIMIT 1', [id]);
        if (o.length > 0) throw new Refus('Ce locataire est encore en place : enregistrez d’abord son départ (fiche du bien ou du locataire), puis sortez-le du portefeuille.');
      } else {
        const tetes = sujet === 'bien' ? [id]
          : (await q<{ id: string }>(`SELECT id::text FROM gestion_annuaire_lot WHERE proprietaire_id = $1 AND sorti_portefeuille_le IS NULL`, [id])).rows.map((r) => Number(r.id));
        for (const t of tetes) biens.push(...await avecAnnexes(q, t));
        biens = [...new Set(biens)];
        if (biens.length > 0) {
          const { rows: o } = await q('SELECT 1 FROM gestion_annuaire_occupation WHERE lot_id = ANY($1::bigint[]) AND sortie IS NULL LIMIT 1', [biens]);
          if (o.length > 0) throw new Refus(MOTIF_LOCATAIRE_EN_PLACE);
        }
      }
      await q(`UPDATE ${TABLE[sujet]} SET sorti_portefeuille_le = now(), sorti_portefeuille_par = $2 WHERE id = $1`, [id, auteur.libelle]);
      const autres = biens.filter((b) => !(sujet === 'bien' && b === id));
      if (autres.length > 0) {
        await q(`UPDATE gestion_annuaire_lot SET sorti_portefeuille_le = now(), sorti_portefeuille_par = $2
                  WHERE id = ANY($1::bigint[]) AND sorti_portefeuille_le IS NULL`, [autres, auteur.libelle]);
      }
      await journaliser(q, sujet, id, 'location_sortie_portefeuille',
        `sorti du portefeuille (tuile Location)${autres.length > 0 ? ` avec ${autres.length} bien(s) / annexe(s) : ${autres.join(', ')}` : ''} — rien n’est effacé, réactivable`, auteur);
      return { etat: 'ok' as const, data: { biens: autres.length } };
    });
  } catch (e) {
    if (e instanceof Refus) return { etat: 'refus', motif: e.message };
    throw e;
  }
}

/**
 * RÉACTIVER : la fiche revient dans le portefeuille. Pour un propriétaire ou un bien, les biens sortis AVEC lui (même
 * instant) reviennent aussi ; un bien sorti séparément, avant, reste sorti.
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
      const lies = sujet === 'bien' ? await avecAnnexes(q, id)
        : (await q<{ id: string }>('SELECT id::text FROM gestion_annuaire_lot WHERE proprietaire_id = $1', [id])).rows.map((r) => Number(r.id));
      const lies2 = sujet === 'bien' ? lies.filter((x) => x !== id) : [...new Set((await Promise.all(lies.map((l) => avecAnnexes(q, l)))).flat())];
      if (lies2.length > 0) {
        const r = await q(`UPDATE gestion_annuaire_lot SET sorti_portefeuille_le = NULL, sorti_portefeuille_par = NULL
                            WHERE id = ANY($1::bigint[]) AND sorti_portefeuille_le = $2::timestamptz`, [lies2, instant]);
        n = r.rowCount ?? 0;
      }
    }
    await journaliser(q, sujet, id, 'location_reactivation_portefeuille',
      `réactivé dans le portefeuille (tuile Location)${n > 0 ? ` avec ${n} bien(s) / annexe(s) sortis en même temps` : ''}`, auteur);
    return { etat: 'ok' as const, data: { biens: n } };
  });
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
