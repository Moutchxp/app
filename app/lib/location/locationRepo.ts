import { query, withTransaction, type RequeteTx } from '../db/client';
import { colonneExisteMemo } from './sondeLocation';
import { sqlPersonneVivante } from '../gestion/personneVivanteSql';
import { conditionCoordonneeVivante } from '../gestion/coordonneeVivante';
import { normaliserTexte } from '../gestion/annuaire';
import { verifierCoordonnees } from '../gestion/annuaireEdition';
import { creerPersonne } from '../gestion/annuaireEditionRepo';
import {
  ficheLocataire, ficheLot, ficheProprietaire, rechercher, rechercherPersonnes,
  type FicheLocataire, type FicheLot, type FicheProprietaire, type PersonneTrouvee,
} from '../gestion/annuaireRepo';
import { analyserTerme } from '../gestion/annuaireRecherche';
import { locationsAffichees } from '../gestion/honorairesGestionRepo';
import type { LocationAffichee } from '../gestion/honorairesGestion';
import type { Auteur } from '../gestion/gestes';
import { sortieDe, sortieDisponible } from './portefeuilleRepo';
import { complementsDuBien, type ComplementsFiche } from './creationBienRepo';
import type { SortiePortefeuille } from './recherchePortefeuille';
import { categorieDuBien, verifierChampsBien, type BienLocation, type Categorie, type ChampsBien } from './locationBien';

/**
 * ══ 🔴🔴 TUILE LOCATION — LE DÉPÔT (correction d'Arno du 17/10/2026). IMPUR (base). ══════════════════════════════════
 *
 * « Seules les DONNÉES sont communes (personnes, biens, annexes, locations) ; les ÉCRANS de la Location sont exclusivement
 * dans /admin/location. » Ce dépôt lit donc LES MÊMES tables que la Gestion, par LES MÊMES fonctions de lecture
 * (`ficheProprietaire`, `ficheLot`, `ficheLocataire`, `rechercherPersonnes`) : une modification d'un côté se voit de
 * l'autre, par construction. Il n'ajoute que ce que la Location demande en plus (migration 372) : N° de mandat de
 * gestion, caractéristiques du bien, annexes en arbre.
 *
 * 🔴 RIEN N'EST SUPPRIMÉ : aucun DELETE ici. Le lien annexe → logement est garanti par la base (ni modification, ni
 * suppression). Tout changement est journalisé dans `gestion_journal`.
 * ⚠️ SANS LA MIGRATION 372 : les fonctions qui en dépendent rendent `sans_schema`.
 */

export function locationDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_annuaire_proprietaire', 'numero_mandat_gestion');
}

export type Issue<T = undefined> =
  | { etat: 'ok'; data: T }
  | { etat: 'sans_schema' }
  | { etat: 'inconnu' }
  | { etat: 'refus'; motif: string };

const num = (v: string | null): number | null => (v === null ? null : Number(v));

// ── LA RECHERCHE UNIQUE ──────────────────────────────────────────────────────────────────────────────────────────

export interface ResultatsLocation {
  personnes: PersonneTrouvee[];
  biens: { id: number; numero: string; adresse: string | null; commune: string | null; proprietaire: string | null }[];
  tronque: boolean;
}

/** Une personne (nom, téléphone, e-mail) ou un bien (adresse, n° de lot) : la MÊME recherche que l'annuaire. */
export async function rechercherLocation(brut: string): Promise<ResultatsLocation | null> {
  const t = analyserTerme(brut);
  if (t.vide) return { personnes: [], biens: [], tronque: false };
  const [p, b] = await Promise.all([rechercherPersonnes(t), rechercher(t)]);
  if (p.etat !== 'ok' || b.etat !== 'ok') return null;
  const vus = new Set<number>();
  const biens: ResultatsLocation['biens'] = [];
  for (const l of b.data.lignes) {
    if (l.lotId === null || vus.has(l.lotId)) continue;
    vus.add(l.lotId);
    biens.push({ id: l.lotId, numero: l.lotNumero ?? '', adresse: l.adresse, commune: l.commune, proprietaire: l.proprietaireNom });
  }
  return { personnes: p.data.personnes, biens, tronque: p.data.tronque || b.data.tronque };
}

// ── LES LISTES DE L'ACCUEIL ──────────────────────────────────────────────────────────────────────────────────────

export const TAILLE_PAGE = 50;

/**
 * 🔴 REFONTE DE L'ACCUEIL (17/10/2026) — « actifs » ou « anciens » (sortis du portefeuille, migration 373). Sans la
 * migration : tout est actif, et la liste des anciens est vide.
 */
async function filtreSortie(alias: string, anciens: boolean): Promise<string> {
  if (!(await sortieDisponible())) return anciens ? ' AND false' : '';
  return ` AND ${alias}.sorti_portefeuille_le IS ${anciens ? 'NOT ' : ''}NULL`;
}

export interface PageListe<T> { lignes: T[]; total: number; page: number }
export interface LigneProprietaire { id: number; nom: string; biens: number; numeroMandat: string | null }
export interface LigneLocataire { id: number; nom: string; enPlace: boolean; logement: string | null; lotId: number | null }

export async function listeProprietaires(page: number, filtre = '', anciens = false): Promise<PageListe<LigneProprietaire>> {
  const vivante = (await sqlPersonneVivante('p')) + await filtreSortie('p', anciens);
  const avecMandat = await locationDisponible();
  const motif = `%${normaliserTexte(filtre)}%`;
  const { rows } = await query<{ id: string; nom: string; biens: number; mandat: string | null; total: number }>(
    `SELECT p.id::text, p.nom_complet AS nom, ${avecMandat ? 'p.numero_mandat_gestion' : 'NULL::text'} AS mandat,
            (SELECT count(*)::int FROM gestion_annuaire_lot l WHERE l.proprietaire_id = p.id) AS biens,
            count(*) OVER ()::int AS total
       FROM gestion_annuaire_proprietaire p
      WHERE ${vivante} AND p.nom_normalise LIKE $1
      ORDER BY p.nom_normalise, p.id
      LIMIT ${TAILLE_PAGE} OFFSET $2`, [motif, page * TAILLE_PAGE]);
  return {
    lignes: rows.map((r) => ({ id: Number(r.id), nom: r.nom, biens: r.biens, numeroMandat: r.mandat })),
    total: rows[0]?.total ?? 0, page,
  };
}

export async function listeLocataires(page: number, filtre = '', anciens = false): Promise<PageListe<LigneLocataire>> {
  const vivante = (await sqlPersonneVivante('p')) + await filtreSortie('p', anciens);
  const motif = `%${normaliserTexte(filtre)}%`;
  const { rows } = await query<{ id: string; nom: string; en_place: boolean; logement: string | null; lot_id: string | null; total: number }>(
    `SELECT p.id::text, p.nom, o.id IS NOT NULL AS en_place,
            nullif(concat_ws(', ', lo.adresse, lo.commune), '') AS logement, lo.id::text AS lot_id,
            count(*) OVER ()::int AS total
       FROM gestion_annuaire_locataire p
       LEFT JOIN LATERAL (SELECT id, lot_id FROM gestion_annuaire_occupation x
                           WHERE x.locataire_id = p.id AND x.sortie IS NULL ORDER BY x.entree DESC NULLS LAST, x.id DESC LIMIT 1) o ON true
       LEFT JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
      WHERE ${vivante} AND p.nom_normalise LIKE $1
      ORDER BY (o.id IS NULL), p.nom_normalise, p.id
      LIMIT ${TAILLE_PAGE} OFFSET $2`, [motif, page * TAILLE_PAGE]);
  return {
    lignes: rows.map((r) => ({ id: Number(r.id), nom: r.nom, enPlace: r.en_place, logement: r.logement, lotId: num(r.lot_id) })),
    total: rows[0]?.total ?? 0, page,
  };
}

/** Les colonnes d'un bien que la Location lit en plus de la fiche commune (migration 372). */
function colonnesBien(avec372: boolean, alias = 'lo'): string {
  return avec372
    ? `${alias}.categorie, ${alias}.etage, ${alias}.porte, ${alias}.num_lot_copro, ${alias}.surface_carrez_m2::text,
       ${alias}.surface_exterieure_m2::text,
       (SELECT a.parent_id::text FROM gestion_lot_annexe a WHERE a.annexe_id = ${alias}.id) AS parent_id`
    : `NULL::text AS categorie, NULL::text AS etage, NULL::text AS porte, NULL::text AS num_lot_copro,
       NULL::text AS surface_carrez_m2, NULL::text AS surface_exterieure_m2, NULL::text AS parent_id`;
}

interface LigneBienSql {
  id: string; wippimmo_id: string; adresse: string | null; code_postal: string | null; commune: string | null;
  nature: string | null; type_bien: string | null; categorie: string | null; etage: string | null; porte: string | null;
  num_lot_copro: string | null; surface_carrez_m2: string | null; surface_exterieure_m2: string | null;
  parent_id: string | null; proprietaire: string | null; locataire: string | null; sorti: boolean;
  adresse_autre?: boolean | null; parking_situation?: string | null; parking_type?: string | null;
}

const versBien = (r: LigneBienSql): BienLocation => ({
  id: Number(r.id), numero: r.wippimmo_id, adresse: r.adresse, codePostal: r.code_postal, commune: r.commune,
  nature: r.nature, typeBien: r.type_bien,
  categorie: categorieDuBien({ categorie: r.categorie, nature: r.nature, typeBien: r.type_bien }),
  etage: r.etage, porte: r.porte, numLotCopro: r.num_lot_copro,
  surfaceCarrezM2: num(r.surface_carrez_m2), surfaceExterieureM2: num(r.surface_exterieure_m2),
  parentId: num(r.parent_id), proprietaire: r.proprietaire, locataireEnPlace: r.locataire,
  creeDansLApplication: r.wippimmo_id.startsWith('app-'),
  sorti: r.sorti,
  adresseAutre: r.adresse_autre === true,
  parkingSituation: r.parking_situation ?? null,
  parkingType: r.parking_type ?? null,
});

async function lireBiens(where: string, params: unknown[], suffixe = ''): Promise<BienLocation[]> {
  const avec372 = await locationDisponible();
  const { rows } = await query<LigneBienSql>(
    `SELECT lo.id::text, lo.wippimmo_id, lo.adresse, lo.code_postal, lo.commune, lo.nature, lo.type_bien,
            ${colonnesBien(avec372)},
            ${(await sortieDisponible()) ? 'lo.sorti_portefeuille_le IS NOT NULL' : 'false'} AS sorti,
            ${(await colonneExisteMemo('gestion_annuaire_lot', 'adresse_autre')) ? 'lo.adresse_autre, lo.parking_situation, lo.parking_type'
    : 'NULL::boolean AS adresse_autre, NULL::text AS parking_situation, NULL::text AS parking_type'},
            coalesce(pr.nom_complet, lo.proprietaire_texte) AS proprietaire,
            (SELECT l.nom FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
              WHERE o.lot_id = lo.id AND o.sortie IS NULL ORDER BY o.entree DESC NULLS LAST, o.id DESC LIMIT 1) AS locataire
       FROM gestion_annuaire_lot lo
       LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
      WHERE ${where}
      ${suffixe}`, params);
  return rows.map(versBien);
}

/** Les biens de l'accueil : les logements (et les biens autonomes), chacun avec ses annexes en arbre. */
export async function listeBiens(page: number, filtre = '', anciens = false): Promise<PageListe<BienLocation & { annexes: BienLocation[] }>> {
  const avec372 = await locationDisponible();
  const motif = `%${normaliserTexte(filtre)}%`;
  // Actifs : les logements (et biens autonomes), leurs annexes dessous. Anciens : tous les biens sortis, à plat.
  const condition = `coalesce(lo.adresse_normalisee, '') LIKE $1${await filtreSortie('lo', anciens)}
    ${avec372 && !anciens ? 'AND NOT EXISTS (SELECT 1 FROM gestion_lot_annexe a WHERE a.annexe_id = lo.id)' : ''}`;
  const { rows: t } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM gestion_annuaire_lot lo WHERE ${condition}`, [motif]);
  const tetes = await lireBiens(condition, [motif, page * TAILLE_PAGE],
    `ORDER BY lo.adresse_normalisee NULLS LAST, lo.id LIMIT ${TAILLE_PAGE} OFFSET $2`);
  const annexes = avec372 && tetes.length > 0 && !anciens
    ? await lireBiens(`lo.id IN (SELECT annexe_id FROM gestion_lot_annexe WHERE parent_id = ANY($1::bigint[]))${await filtreSortie('lo', false)}`,
      [tetes.map((b) => b.id)], 'ORDER BY lo.id')
    : [];
  return {
    // 🔴 TOUJOURS un tableau `annexes`, vide pour un bien sans annexe (l'écran ne lit jamais `undefined`).
    lignes: tetes.map((b) => ({ ...b, annexes: annexes.filter((a) => a.parentId === b.id) })),
    total: t[0]?.n ?? 0, page,
  };
}

// ── LES FICHES ───────────────────────────────────────────────────────────────────────────────────────────────────

export interface FicheProprietaireLocation {
  fiche: FicheProprietaire;
  /** Sorti du portefeuille (quand, par qui) ; `null` = dans le portefeuille. */
  sortie: SortiePortefeuille | null;
  numeroMandat: string | null;
  /** « Propriétaire(s) en gestion ? » (migration 375) : `null` = question jamais posée (ou migration absente). */
  enGestion: boolean | null;
  /** Ses biens EN ARBRE (logement puis annexes), lus avec les caractéristiques de la Location. */
  biens: BienLocation[];
  location372: boolean;
}

export async function ficheProprietaireLocation(id: number): Promise<Issue<FicheProprietaireLocation>> {
  const f = await ficheProprietaire(id);
  if (f.etat !== 'ok') return f.etat === 'inconnu' ? { etat: 'inconnu' } : { etat: 'sans_schema' };
  const avec372 = await locationDisponible();
  const mandat = avec372
    ? (await query<{ m: string | null }>('SELECT numero_mandat_gestion AS m FROM gestion_annuaire_proprietaire WHERE id = $1', [id])).rows[0]?.m ?? null
    : null;
  const biens = await lireBiens(
    `lo.proprietaire_id = $1 OR lo.id IN (SELECT lot_id FROM gestion_annuaire_lot_proprietaire WHERE proprietaire_id = $1 AND jusqu_a IS NULL)`,
    [id], 'ORDER BY lo.adresse_normalisee NULLS LAST, lo.id');
  const enGestion = (await colonneExisteMemo('gestion_annuaire_proprietaire', 'en_gestion'))
    ? (await query<{ g: boolean | null }>('SELECT en_gestion AS g FROM gestion_annuaire_proprietaire WHERE id = $1', [id])).rows[0]?.g ?? null
    : null;
  return { etat: 'ok', data: { fiche: f.data, sortie: await sortieDe('proprietaire', id), numeroMandat: mandat, enGestion, biens, location372: avec372 } };
}

export interface LocationDuLocataire {
  occupationId: number; lotId: number | null; adresse: string | null; commune: string | null;
  entree: string | null; sortie: string | null; location: LocationAffichee | null;
}
export interface FicheLocataireLocation { fiche: FicheLocataire; sortie: SortiePortefeuille | null; locations: LocationDuLocataire[] }

export async function ficheLocataireLocation(id: number): Promise<Issue<FicheLocataireLocation>> {
  const f = await ficheLocataire(id);
  if (f.etat !== 'ok') return f.etat === 'inconnu' ? { etat: 'inconnu' } : { etat: 'sans_schema' };
  const { rows } = await query<{ id: string; lot_id: string | null; adresse: string | null; commune: string | null; entree: string | null; sortie: string | null }>(
    `SELECT o.id::text, o.lot_id::text, lo.adresse, lo.commune, o.entree::text, o.sortie::text
       FROM gestion_annuaire_occupation o LEFT JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
      WHERE o.locataire_id = $1 ORDER BY (o.sortie IS NULL) DESC, o.entree DESC NULLS LAST, o.id DESC`, [id]);
  const conditions = await locationsAffichees(rows.map((r) => Number(r.id)));
  return {
    etat: 'ok',
    data: {
      fiche: f.data,
      sortie: await sortieDe('locataire', id),
      locations: rows.map((r) => ({
        occupationId: Number(r.id), lotId: num(r.lot_id), adresse: r.adresse, commune: r.commune,
        entree: r.entree, sortie: r.sortie, location: conditions.get(Number(r.id)) ?? null,
      })),
    },
  };
}

export interface FicheBienLocation {
  fiche: FicheLot;
  /** Sorti du portefeuille (quand, par qui) ; `null` = dans le portefeuille. */
  sortie: SortiePortefeuille | null;
  bien: BienLocation;
  /** Le logement d'origine quand ce bien est une annexe. */
  parent: BienLocation | null;
  /** Les annexes de ce logement (vide pour une annexe). */
  annexes: BienLocation[];
  /** Les conditions (loyer de départ, taux, honoraires) de chaque occupation du bien. */
  locations: { occupationId: number; location: LocationAffichee | null }[];
  /** Les autres biens du même propriétaire qu'on peut rattacher comme annexe (ni logement à annexes, ni annexe). */
  rattachables: BienLocation[];
  location372: boolean;
  /** Les informations complémentaires (migration 374) ; `null` sans elle. */
  complements: ComplementsFiche | null;
}

export async function ficheBienLocation(id: number): Promise<Issue<FicheBienLocation>> {
  const f = await ficheLot(id);
  if (f.etat !== 'ok') return f.etat === 'inconnu' ? { etat: 'inconnu' } : { etat: 'sans_schema' };
  const avec372 = await locationDisponible();
  const [bien] = await lireBiens('lo.id = $1', [id]);
  const parent = bien.parentId === null ? null : (await lireBiens('lo.id = $1', [bien.parentId]))[0] ?? null;
  const annexes = avec372
    ? await lireBiens('lo.id IN (SELECT annexe_id FROM gestion_lot_annexe WHERE parent_id = $1)', [id], 'ORDER BY lo.id')
    : [];
  const conditions = await locationsAffichees(f.data.occupations.map((o) => o.occupationId));
  const rattachables = avec372 && bien.parentId === null && f.data.proprietaireId !== null
    ? await lireBiens(
      `lo.proprietaire_id = $1 AND lo.id <> $2${await filtreSortie('lo', false)}
         AND NOT EXISTS (SELECT 1 FROM gestion_lot_annexe a WHERE a.annexe_id = lo.id OR a.parent_id = lo.id)`,
      [f.data.proprietaireId, id], 'ORDER BY lo.adresse_normalisee NULLS LAST, lo.id')
    : [];
  return {
    etat: 'ok',
    data: {
      fiche: f.data, sortie: await sortieDe('bien', id), bien, parent, annexes,
      locations: f.data.occupations.map((o) => ({ occupationId: o.occupationId, location: conditions.get(o.occupationId) ?? null })),
      rattachables, location372: avec372, complements: await complementsDuBien(id),
    },
  };
}

// ── LE DÉDOUBLONNAGE À LA SAISIE ─────────────────────────────────────────────────────────────────────────────────

export interface Doublon { valeur: string; sujet: 'proprietaire' | 'locataire'; id: number; nom: string }

/**
 * « Cette coordonnée est déjà sur la fiche X » : un e-mail ou un téléphone saisi, comparé (forme canonique, celle de la
 * saisie) aux coordonnées vivantes de l'annuaire. Une SUGGESTION, jamais une fusion.
 */
export async function chercherDoublons(saisies: readonly { sorte: 'telephone' | 'email'; valeur: string }[]): Promise<Doublon[]> {
  const canoniques: { valeur: string; affichage: string }[] = [];
  for (const s of saisies) {
    if (s.valeur.trim() === '') continue;
    const v = verifierCoordonnees([{ sorte: s.sorte, valeur: s.valeur, libelle: '' }]);
    if (v.ok && v.retenues[0] !== undefined) canoniques.push({ valeur: v.retenues[0].valeur, affichage: s.valeur.trim() });
  }
  if (canoniques.length === 0) return [];
  const vivanteP = await sqlPersonneVivante('p');
  const vivanteL = await sqlPersonneVivante('l');
  const coordVivante = await conditionCoordonneeVivante('c');
  const { rows } = await query<{ valeur: string; sujet: 'proprietaire' | 'locataire'; id: string; nom: string }>(
    `SELECT DISTINCT c.valeur, c.sujet, c.sujet_id::text AS id, coalesce(p.nom_complet, l.nom) AS nom
       FROM gestion_annuaire_contact c
       LEFT JOIN gestion_annuaire_proprietaire p ON c.sujet = 'proprietaire' AND p.id = c.sujet_id AND ${vivanteP}
       LEFT JOIN gestion_annuaire_locataire l ON c.sujet = 'locataire' AND l.id = c.sujet_id AND ${vivanteL}
      WHERE c.valeur = ANY($1::text[]) AND c.absent_le IS NULL${coordVivante}
        AND coalesce(p.id, l.id) IS NOT NULL
      ORDER BY 2, 4`, [canoniques.map((c) => c.valeur)]);
  return rows.map((r) => ({
    valeur: canoniques.find((c) => c.valeur === r.valeur)?.affichage ?? r.valeur, sujet: r.sujet, id: Number(r.id), nom: r.nom,
  }));
}

// ── LES ÉCRITURES ────────────────────────────────────────────────────────────────────────────────────────────────

async function journaliser(q: RequeteTx, entite: 'annuaire' | 'annuaire_lot', id: number, action: string,
  avant: string | null, apres: string | null, commentaire: string, auteur: Auteur): Promise<void> {
  await q(
    `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [entite, id, action, avant, apres, commentaire, auteur.id, auteur.libelle]);
}

/** Le N° de mandat de gestion du propriétaire : texte libre, facultatif — jamais généré, jamais vérifié. */
export async function enregistrerMandat(proprietaireId: number, brut: unknown, auteur: Auteur): Promise<Issue> {
  if (!(await locationDisponible())) return { etat: 'sans_schema' };
  const texte = typeof brut === 'string' && brut.trim() !== '' ? brut.trim().slice(0, 80) : null;
  return withTransaction(async (q) => {
    const { rows } = await q<{ m: string | null }>(
      'SELECT numero_mandat_gestion AS m FROM gestion_annuaire_proprietaire WHERE id = $1 FOR UPDATE', [proprietaireId]);
    if (rows[0] === undefined) return { etat: 'inconnu' as const };
    if ((rows[0].m ?? null) === texte) return { etat: 'ok' as const, data: undefined };
    await q('UPDATE gestion_annuaire_proprietaire SET numero_mandat_gestion = $2 WHERE id = $1', [proprietaireId, texte]);
    await journaliser(q, 'annuaire', proprietaireId, 'location_numero_mandat', rows[0].m, texte,
      'N° de mandat de gestion (saisi dans la Location)', auteur);
    return { etat: 'ok' as const, data: undefined };
  });
}

/**
 * Les caractéristiques d'un bien. 🔴 L'ADRESSE n'est modifiable que pour un bien CRÉÉ DANS L'APPLICATION : celle d'un bien
 * importé est tenue par WIPPIMMO, et l'import la réécrirait sans le dire.
 */
export async function modifierBien(lotId: number, brut: Record<string, unknown>, auteur: Auteur): Promise<Issue> {
  if (!(await locationDisponible())) return { etat: 'sans_schema' };
  const v = verifierChampsBien(brut);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  const c = v.valeurs;
  return withTransaction(async (q) => {
    const { rows } = await q<{ wippimmo_id: string; avant: string }>(
      `SELECT wippimmo_id, concat_ws(' | ', categorie, etage, porte, num_lot_copro, surface_carrez_m2, surface_exterieure_m2,
              adresse, code_postal, commune) AS avant FROM gestion_annuaire_lot WHERE id = $1 FOR UPDATE`, [lotId]);
    if (rows[0] === undefined) return { etat: 'inconnu' as const };
    const app = rows[0].wippimmo_id.startsWith('app-');
    await q(
      `UPDATE gestion_annuaire_lot SET categorie = $2, etage = $3, porte = $4, num_lot_copro = $5,
              surface_carrez_m2 = $6, surface_exterieure_m2 = $7
              ${app ? ", adresse = $8, code_postal = $9, commune = $10, adresse_normalisee = $11" : ''}
        WHERE id = $1`,
      [lotId, c.categorie, c.etage, c.porte, c.numLotCopro, c.surfaceCarrezM2, c.surfaceExterieureM2,
        ...(app ? [c.adresse, c.codePostal, c.commune, normaliserTexte([c.adresse, c.commune].filter((x) => x !== null).join(' '))] : [])]);
    await journaliser(q, 'annuaire_lot', lotId, 'location_bien_modifie', rows[0].avant, null,
      'caractéristiques du bien modifiées dans la Location', auteur);
    return { etat: 'ok' as const, data: undefined };
  });
}

/** Crée un bien (logement ou annexe) dans l'application, rattaché à son propriétaire. Clé « app-… ». */
async function insererBien(q: RequeteTx, o: { proprietaireId: number; champs: ChampsBien; categorie: Categorie }): Promise<number> {
  const { rows: p } = await q<{ nom: string }>('SELECT nom_complet AS nom FROM gestion_annuaire_proprietaire WHERE id = $1', [o.proprietaireId]);
  if (p[0] === undefined) throw new RefusLocation('Ce propriétaire n’existe plus dans l’annuaire.');
  const c = o.champs;
  const cle = `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await q<{ id: string }>(
    `INSERT INTO gestion_annuaire_lot
       (wippimmo_id, proprietaire_id, proprietaire_texte, adresse, code_postal, commune, adresse_normalisee,
        categorie, etage, porte, num_lot_copro, surface_carrez_m2, surface_exterieure_m2)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id::text`,
    [cle, o.proprietaireId, p[0].nom, c.adresse, c.codePostal, c.commune,
      normaliserTexte([c.adresse, c.commune].filter((x) => x !== null).join(' ')),
      o.categorie, c.etage, c.porte, c.numLotCopro, c.surfaceCarrezM2, c.surfaceExterieureM2]);
  return Number(rows[0].id);
}

class RefusLocation extends Error {}

const refusOuErreur = (e: unknown): Issue<never> => {
  if (e instanceof RefusLocation) return { etat: 'refus', motif: e.message };
  const m = e instanceof Error ? e.message : '';
  if (/annexe d'annexe|a déjà des annexes|gestion_lot_annexe_unique_uq|gestion_lot_annexe_soi_chk/.test(m)) {
    return { etat: 'refus', motif: 'Ce bien ne peut pas devenir une annexe ici (il est déjà annexe, ou a lui-même des annexes).' };
  }
  throw e;
};

/** Ajoute une annexe NEUVE sous un logement : même propriétaire, même adresse (héritée), lien posé pour toujours. */
export async function ajouterAnnexe(parentId: number, brut: Record<string, unknown>, auteur: Auteur): Promise<Issue<{ id: number }>> {
  if (!(await locationDisponible())) return { etat: 'sans_schema' };
  const v = verifierChampsBien(brut);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  const categorie: Categorie = v.valeurs.categorie !== null && v.valeurs.categorie !== 'logement' ? v.valeurs.categorie : 'cave';
  try {
    return await withTransaction(async (q) => {
      const { rows } = await q<{ proprietaire_id: string | null; adresse: string | null; code_postal: string | null; commune: string | null }>(
        'SELECT proprietaire_id::text, adresse, code_postal, commune FROM gestion_annuaire_lot WHERE id = $1 FOR UPDATE', [parentId]);
      const parent = rows[0];
      if (parent === undefined) return { etat: 'inconnu' as const };
      if (parent.proprietaire_id === null) throw new RefusLocation('Ce logement n’a pas de propriétaire rattaché : son annexe ne saurait à qui appartenir.');
      const id = await insererBien(q, {
        proprietaireId: Number(parent.proprietaire_id), categorie,
        champs: { ...v.valeurs, adresse: parent.adresse, codePostal: parent.code_postal, commune: parent.commune },
      });
      await q('INSERT INTO gestion_lot_annexe (annexe_id, parent_id, pose_par_libelle) VALUES ($1, $2, $3)', [id, parentId, auteur.libelle]);
      await journaliser(q, 'annuaire_lot', parentId, 'location_annexe_ajoutee', null, `annexe ${id} (${categorie})`,
        'annexe créée sous ce logement, dans la Location', auteur);
      return { etat: 'ok' as const, data: { id } };
    });
  } catch (e) { return refusOuErreur(e); }
}

/** Rattache un bien EXISTANT du même propriétaire comme annexe d'un logement. Le lien ne se défait plus. */
export async function rattacherAnnexe(parentId: number, annexeId: number, auteur: Auteur): Promise<Issue> {
  if (!(await locationDisponible())) return { etat: 'sans_schema' };
  try {
    return await withTransaction(async (q) => {
      const { rows } = await q<{ id: string; proprietaire_id: string | null }>(
        'SELECT id::text, proprietaire_id::text FROM gestion_annuaire_lot WHERE id = ANY($1::bigint[]) FOR UPDATE', [[parentId, annexeId]]);
      const p = rows.find((r) => Number(r.id) === parentId);
      const a = rows.find((r) => Number(r.id) === annexeId);
      if (p === undefined || a === undefined) return { etat: 'inconnu' as const };
      if (p.proprietaire_id === null || p.proprietaire_id !== a.proprietaire_id) {
        throw new RefusLocation('Une annexe se rattache à un logement du MÊME propriétaire.');
      }
      await q('INSERT INTO gestion_lot_annexe (annexe_id, parent_id, pose_par_libelle) VALUES ($1, $2, $3)', [annexeId, parentId, auteur.libelle]);
      await journaliser(q, 'annuaire_lot', parentId, 'location_annexe_rattachee', null, `annexe ${annexeId}`,
        'bien existant rattaché comme annexe de ce logement, dans la Location', auteur);
      return { etat: 'ok' as const, data: undefined };
    });
  } catch (e) { return refusOuErreur(e); }
}

export interface CreationProprietaireBien {
  /** Un propriétaire EXISTANT (« Utiliser cette fiche » après une alerte de doublon), ou `null` pour en créer un. */
  proprietaireId: number | null;
  proprietaire: { civilite?: string | null; nom?: string; prenom?: string | null; adresse?: string | null;
    codePostal?: string | null; commune?: string | null; telephone?: string; email?: string; numeroMandat?: string };
  logement: Record<string, unknown>;
  annexes: Record<string, unknown>[];
}

/**
 * « Nouveau propriétaire + bien + annexes », en une page. Deux temps, et c'est dit :
 *   ① la fiche du propriétaire (la création commune de l'annuaire, avec ses verrous et son journal) ;
 *   ② le logement, ses annexes et le N° de mandat, en UNE transaction.
 * Si ② échoue, la fiche ① reste (rien ne se supprime) et le motif le dit — le même partage que « Ajouter un occupant ».
 */
export async function creerProprietaireEtBiens(o: CreationProprietaireBien, auteur: Auteur): Promise<Issue<{ proprietaireId: number; logementId: number }>> {
  if (!(await locationDisponible())) return { etat: 'sans_schema' };
  const logement = verifierChampsBien(o.logement);
  if (!logement.ok) return { etat: 'refus', motif: logement.motif };
  if (logement.valeurs.adresse === null) return { etat: 'refus', motif: 'L’adresse du logement est obligatoire.' };
  const annexes: ChampsBien[] = [];
  for (const a of o.annexes) {
    const v = verifierChampsBien(a);
    if (!v.ok) return { etat: 'refus', motif: v.motif };
    annexes.push(v.valeurs);
  }
  let proprietaireId = o.proprietaireId;
  if (proprietaireId === null) {
    const p = o.proprietaire;
    if ((p.nom ?? '').trim() === '') return { etat: 'refus', motif: 'Le nom du propriétaire est obligatoire.' };
    const coordonnees = [
      ...(p.telephone && p.telephone.trim() !== '' ? [{ sorte: 'telephone' as const, valeur: p.telephone, libelle: 'Mobile' }] : []),
      ...(p.email && p.email.trim() !== '' ? [{ sorte: 'email' as const, valeur: p.email, libelle: 'E-mail' }] : []),
    ];
    const cree = await creerPersonne('proprietaire', {
      nom: p.nom ?? '', prenom: p.prenom ?? null, civilite: p.civilite ?? null, adresse: p.adresse ?? null,
      codePostal: p.codePostal ?? null, commune: p.commune ?? null, coordonnees,
    }, auteur);
    if (cree.etat !== 'ok') return cree.etat === 'refus' ? { etat: 'refus', motif: cree.motif } : { etat: 'sans_schema' };
    proprietaireId = cree.data.id;
  }
  const pid = proprietaireId;
  try {
    return await withTransaction(async (q) => {
      const logementId = await insererBien(q, { proprietaireId: pid, champs: logement.valeurs, categorie: logement.valeurs.categorie ?? 'logement' });
      for (const a of annexes) {
        const id = await insererBien(q, {
          proprietaireId: pid, categorie: a.categorie !== null && a.categorie !== 'logement' ? a.categorie : 'cave',
          champs: { ...a, adresse: logement.valeurs.adresse, codePostal: logement.valeurs.codePostal, commune: logement.valeurs.commune },
        });
        await q('INSERT INTO gestion_lot_annexe (annexe_id, parent_id, pose_par_libelle) VALUES ($1, $2, $3)', [id, logementId, auteur.libelle]);
      }
      const mandat = typeof o.proprietaire.numeroMandat === 'string' && o.proprietaire.numeroMandat.trim() !== ''
        ? o.proprietaire.numeroMandat.trim().slice(0, 80) : null;
      if (mandat !== null) {
        await q('UPDATE gestion_annuaire_proprietaire SET numero_mandat_gestion = $2 WHERE id = $1', [pid, mandat]);
      }
      await journaliser(q, 'annuaire_lot', logementId, 'location_bien_cree', null,
        `logement + ${annexes.length} annexe(s)`, `bien créé dans la Location pour le propriétaire ${pid}`
        + (mandat === null ? '' : ` (N° de mandat de gestion ${mandat})`), auteur);
      return { etat: 'ok' as const, data: { proprietaireId: pid, logementId } };
    });
  } catch (e) {
    const issue = refusOuErreur(e);
    return issue.etat === 'refus' && o.proprietaireId === null
      ? { etat: 'refus', motif: `La fiche du propriétaire est créée, mais le bien n’a pas pu l’être : ${issue.motif}` }
      : issue;
  }
}
