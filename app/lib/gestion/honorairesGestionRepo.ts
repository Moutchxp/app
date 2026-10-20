import { query, withTransaction, type RequeteTx } from '../db/client';
import { annuaireModifiableDisponible, honorairesGestionDisponible } from './schema';
import { sqlPersonneVivante } from './personneVivanteSql';
import type { Auteur } from './gestes';
import {
  proposerTaux, tvaEnVigueur, verifierConditions,
  type BaseHonoraires, type ConditionsLocation, type LocationAffichee, type LocationPourHonoraires,
} from './honorairesGestion';
import { SQL_AUJOURDHUI_PARIS } from '../temps/paris';
import { bailDisponible, sqlConditionsDe } from '../location/bailRepo';

/**
 * ══ 🔴🔴 LOT L1 — LE DÉPÔT DES HONORAIRES DE GESTION. IMPUR (base). ════════════════════════════════════════════════
 *
 * Il lit et écrit `gestion_location_conditions` (ajout seul, migration 370), les réglages agence et les réglages
 * datés. Le CALCUL n'est pas ici : il vit dans le module pur `honorairesGestion.ts`, partagé avec l'écran.
 *
 * 🔴 RIEN N'EST JAMAIS MODIFIÉ NI SUPPRIMÉ dans les conditions : une correction AJOUTE une ligne (des déclencheurs en
 * base refusent UPDATE, DELETE et TRUNCATE). La ligne la plus récente d'une location fait foi.
 * 🔴 TOUT CHANGEMENT EST JOURNALISÉ, dans la même transaction (`gestion_journal`, entité « annuaire » déjà acceptée).
 * ⚠️ SANS LA MIGRATION 370, chaque fonction rend un état neutre (`sans_schema`, carte vide) et ne nomme aucune table
 * neuve.
 */

export interface ReglagesHonoraires {
  tauxDefautHt: number;
  baseDefaut: BaseHonoraires;
  tva: { valeur: number; depuis: string; saisiLe: string; saisiPar: string }[];
}

const REGLAGES_REPLI: ReglagesHonoraires = { tauxDefautHt: 4.5, baseDefaut: 'cc', tva: [] };

export async function lireReglages(q: RequeteTx = query): Promise<ReglagesHonoraires> {
  if (!(await honorairesGestionDisponible())) return REGLAGES_REPLI;
  const { rows: r } = await q<{ taux_defaut_ht: string; base_defaut: BaseHonoraires }>(
    'SELECT taux_defaut_ht::text, base_defaut FROM gestion_honoraires_reglage WHERE id = 1');
  const { rows: tva } = await q<{ valeur: string; depuis: string; saisi_le: string; saisi_par_libelle: string }>(
    `SELECT valeur::text, depuis::text, saisi_le::text, saisi_par_libelle FROM gestion_reglage_date
      WHERE cle = 'tva_honoraires' ORDER BY depuis, id`);
  return {
    tauxDefautHt: r[0] === undefined ? REGLAGES_REPLI.tauxDefautHt : Number(r[0].taux_defaut_ht),
    baseDefaut: r[0]?.base_defaut ?? REGLAGES_REPLI.baseDefaut,
    tva: tva.map((t) => ({ valeur: Number(t.valeur), depuis: t.depuis, saisiLe: t.saisi_le, saisiPar: t.saisi_par_libelle })),
  };
}

const num = (v: string | null): number | null => (v === null ? null : Number(v));

/**
 * ══ CE QU'UNE CARTE DE LOCATION AFFICHE, POUR CHAQUE OCCUPATION DEMANDÉE ════════════════════════════════════════════
 *
 * La ligne de conditions la plus récente (et combien il y en a eu), et le TAUX PROPOSÉ quand il n'y en a pas encore :
 * celui de la location précédente du lot (la plus récente AUTRE occupation du même lot, entrée avant celle-ci, qui a
 * des conditions), sinon le taux WIPPIMMO du lot, sinon le réglage agence.
 */
export async function locationsAffichees(occupationIds: readonly number[]): Promise<Map<number, LocationAffichee>> {
  const out = new Map<number, LocationAffichee>();
  if (occupationIds.length === 0 || !(await honorairesGestionDisponible())) return out;
  const reglages = await lireReglages();
  // Arno (20/10/2026, 393) : le loyer de départ est celui du BAIL — lu par le bail, partagé par ses colocataires.
  const avecBail = await bailDisponible();
  const { rows } = await query<{
    occupation_id: string; loyer_hc: string | null; provisions: string | null; taux_gestion_ht: string | null;
    base: BaseHonoraires | null; origine: 'saisie' | 'reprise' | null; saisi_le: string | null;
    saisi_par_libelle: string | null; versions: number; taux_wippimmo: string | null; taux_precedent: string | null;
    aujourdhui: string; partage: string[] | null;
  }>(
    `SELECT o.id::text AS occupation_id, c.loyer_hc::text, c.provisions::text, c.taux_gestion_ht::text, c.base,
            c.origine, c.saisi_le::text, c.saisi_par_libelle,
            (SELECT count(*)::int FROM gestion_location_conditions x WHERE ${sqlConditionsDe('x', 'o', avecBail)}) AS versions,
            ${avecBail ? `(SELECT array_agg(DISTINCT l3.nom ORDER BY l3.nom) FROM gestion_annuaire_occupation o3
                             JOIN gestion_annuaire_locataire l3 ON l3.id = o3.locataire_id
                            WHERE o3.bail_id = o.bail_id AND o3.locataire_id <> o.locataire_id)` : 'NULL::text[]'} AS partage,
            lo.taux_honos_wippimmo::text AS taux_wippimmo,
            pr.taux_gestion_ht::text AS taux_precedent,
            (${SQL_AUJOURDHUI_PARIS})::text AS aujourdhui
       FROM gestion_annuaire_occupation o
       LEFT JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
       LEFT JOIN LATERAL (
         SELECT * FROM gestion_location_conditions x WHERE ${sqlConditionsDe('x', 'o', avecBail)} ORDER BY x.id DESC LIMIT 1
       ) c ON true
       LEFT JOIN LATERAL (
         SELECT y.taux_gestion_ht
           FROM gestion_annuaire_occupation o2
           JOIN LATERAL (
             SELECT z.taux_gestion_ht FROM gestion_location_conditions z
              WHERE ${sqlConditionsDe('z', 'o2', avecBail)} ORDER BY z.id DESC LIMIT 1
           ) y ON true
          WHERE o2.lot_id = o.lot_id AND o2.id <> o.id${avecBail ? ' AND o2.bail_id IS DISTINCT FROM o.bail_id' : ''}
            AND (o.entree IS NULL OR o2.entree IS NULL OR o2.entree <= o.entree)
          ORDER BY o2.entree DESC NULLS LAST, o2.id DESC
          LIMIT 1
       ) pr ON o.lot_id IS NOT NULL
      WHERE o.id = ANY($1::bigint[])`, [occupationIds]);
  for (const r of rows) {
    const conditions: ConditionsLocation | null = r.taux_gestion_ht === null || r.base === null || r.origine === null
      ? null
      : {
        loyerHc: num(r.loyer_hc), provisions: num(r.provisions), tauxHt: Number(r.taux_gestion_ht), base: r.base,
        origine: r.origine, saisiLe: r.saisi_le ?? '', saisiPar: r.saisi_par_libelle ?? '',
      };
    out.set(Number(r.occupation_id), {
      occupationId: Number(r.occupation_id),
      conditions,
      versions: r.versions,
      tauxPropose: proposerTaux({
        precedent: num(r.taux_precedent), wippimmo: num(r.taux_wippimmo), reglage: reglages.tauxDefautHt,
      }),
      baseProposee: reglages.baseDefaut,
      tvaPct: tvaEnVigueur(reglages.tva, r.aujourdhui),
      partageAvec: r.partage ?? [],
    });
  }
  return out;
}

export type IssueConditions =
  | { etat: 'ok'; data: undefined }
  | { etat: 'sans_schema' }
  | { etat: 'inconnu' }
  | { etat: 'refus'; motif: string };

/**
 * ENREGISTRE les conditions d'une location : une LIGNE AJOUTÉE (jamais une modification), et une ligne au journal.
 * `q` permet de l'appeler DANS une transaction déjà ouverte (« Ajouter un occupant » avec ses conditions).
 */
export async function enregistrerConditions(
  occupationId: number, brut: Record<string, unknown>, auteur: Auteur, q?: RequeteTx,
): Promise<IssueConditions> {
  if (!(await honorairesGestionDisponible())) return { etat: 'sans_schema' };
  const verdict = verifierConditions(brut);
  if (!verdict.ok) return { etat: 'refus', motif: verdict.motif };
  const v = verdict.valeurs;
  const avecBail = await bailDisponible();
  const faire = async (t: RequeteTx): Promise<IssueConditions> => {
    const { rows } = await t<{ locataire_id: string; lot_id: string | null; bail_id: string | null }>(
      `SELECT locataire_id::text, lot_id::text, ${avecBail ? 'bail_id::text' : 'NULL::text'} AS bail_id
         FROM gestion_annuaire_occupation WHERE id = $1`, [occupationId]);
    const o = rows[0];
    if (o === undefined) return { etat: 'inconnu' };
    // Arno (20/10/2026, 393) : le loyer est porté par le BAIL — une seule donnée pour tous ses occupants. Une occupation
    // sans bien (hors gestion) garde l'ancienne règle (sa propre ligne).
    const bailId = o.bail_id === null ? null : Number(o.bail_id);
    const { rows: avant } = await t<{ loyer_hc: string | null; provisions: string | null; taux: string; base: string }>(
      `SELECT loyer_hc::text, provisions::text, taux_gestion_ht::text AS taux, base FROM gestion_location_conditions
        WHERE ${bailId !== null ? 'bail_id = $1' : 'occupation_id = $1'} ORDER BY id DESC LIMIT 1`, [bailId ?? occupationId]);
    await t(
      `INSERT INTO gestion_location_conditions
         (${bailId !== null ? 'bail_id' : 'occupation_id'}, loyer_hc, provisions, taux_gestion_ht, base, origine, saisi_par, saisi_par_libelle)
       VALUES ($1, $2, $3, $4, $5, 'saisie', $6, $7)`,
      [bailId ?? occupationId, v.loyerHc, v.provisions, v.tauxHt, v.base, auteur.id, auteur.libelle]);
    const decrire = (x: { loyer_hc: string | null; provisions: string | null; taux: string; base: string }): string =>
      `loyer ${x.loyer_hc ?? 'à saisir'} HC + provisions ${x.provisions ?? '—'} · taux ${x.taux} % HT · base ${x.base}`;
    await t(
      `INSERT INTO gestion_journal
         (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ('annuaire', $1, 'annuaire_conditions_location', $2, $3, $4, $5, $6)`,
      [Number(o.locataire_id), avant[0] === undefined ? null : decrire(avant[0]),
        decrire({ loyer_hc: v.loyerHc === null ? null : String(v.loyerHc),
          provisions: v.provisions === null ? null : String(v.provisions), taux: String(v.tauxHt), base: v.base }),
        `conditions de la location ${occupationId} (lot ${o.lot_id ?? '?'}) : loyer de départ et taux de gestion`,
        auteur.id, auteur.libelle]);
    return { etat: 'ok', data: undefined };
  };
  return q === undefined ? withTransaction(faire) : faire(q);
}

/**
 * ══ LES LOCATIONS D'UNE PÉRIODE, POUR L'ÉCRAN « HONORAIRES DE GESTION » ══════════════════════════════════════════
 *
 * Toutes les occupations d'un lot de l'annuaire qui ont couru entre `debut` et `fin` (ISO, inclus), avec leurs
 * conditions les plus récentes et les propriétaires du lot aujourd'hui — la même lecture que la fiche du bien :
 * le propriétaire de l'import, plus les liens en cours saisis dans l'application.
 */
export async function lireLocationsPourHonoraires(debut: string, fin: string): Promise<LocationPourHonoraires[] | null> {
  if (!(await honorairesGestionDisponible())) return null;
  /* Arno (20/10/2026, 393) — LE LOYER DU BAIL N'EST JAMAIS COMPTÉ DEUX FOIS : une seule occupation du bail le PORTE (celle qui
     court le plus longtemps : en place d'abord, puis la sortie la plus tardive, puis la plus ancienne) ; les autres sont
     couvertes par la clé du bail (`calculerHonoraires`). */
  const avecBail = await bailDisponible();
  const porteuse = avecBail
    ? ` AND (o.bail_id IS NULL OR o.id = (SELECT o4.id FROM gestion_annuaire_occupation o4 WHERE o4.bail_id = o.bail_id
          ORDER BY (o4.sortie IS NULL) DESC, o4.sortie DESC NULLS LAST, o4.id LIMIT 1))`
    : '';
  const { rows } = await query<{
    occupation_id: string; lot_id: string; lot_numero: string; adresse: string | null; commune: string | null;
    nature: string | null; type_bien: string | null; locataire: string; entree: string | null; sortie: string | null;
    loyer_hc: string | null; provisions: string | null; taux_gestion_ht: string | null; base: BaseHonoraires | null; bail_id: string | null;
  }>(
    `SELECT o.id::text AS occupation_id, lo.id::text AS lot_id, lo.wippimmo_id AS lot_numero, lo.adresse, lo.commune,
            lo.nature, lo.type_bien, l.nom AS locataire, o.entree::text, o.sortie::text,
            c.loyer_hc::text, c.provisions::text, c.taux_gestion_ht::text, c.base,
            ${avecBail ? 'o.bail_id::text' : 'NULL::text'} AS bail_id
       FROM gestion_annuaire_occupation o
       JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
       JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
       LEFT JOIN LATERAL (
         SELECT * FROM gestion_location_conditions x WHERE ${sqlConditionsDe('x', 'o', avecBail)}${porteuse} ORDER BY x.id DESC LIMIT 1
       ) c ON true
      WHERE (o.entree IS NULL OR o.entree <= $2::date)
        AND (o.sortie IS NULL OR o.sortie >= $1::date)`, [debut, fin]);

  const lots = [...new Set(rows.map((r) => r.lot_id))];
  const proprietaires = new Map<string, { id: number; nom: string }[]>();
  if (lots.length > 0) {
    const vivante = await sqlPersonneVivante('pr');
    const liens = (await annuaireModifiableDisponible())
      ? `UNION SELECT lp.lot_id, lp.proprietaire_id FROM gestion_annuaire_lot_proprietaire lp
          WHERE lp.lot_id = ANY($1::bigint[]) AND lp.jusqu_a IS NULL`
      : '';
    const { rows: p } = await query<{ lot_id: string; id: string; nom: string }>(
      `SELECT DISTINCT x.lot_id::text, pr.id::text, pr.nom_complet AS nom
         FROM (SELECT id AS lot_id, proprietaire_id FROM gestion_annuaire_lot
                WHERE id = ANY($1::bigint[]) AND proprietaire_id IS NOT NULL ${liens}) x
         JOIN gestion_annuaire_proprietaire pr ON pr.id = x.proprietaire_id
        WHERE ${vivante}
        ORDER BY 1, 3`, [lots]);
    for (const r of p) {
      const l = proprietaires.get(r.lot_id) ?? [];
      l.push({ id: Number(r.id), nom: r.nom });
      proprietaires.set(r.lot_id, l);
    }
  }

  return rows.map((r) => ({
    occupationId: Number(r.occupation_id),
    lotId: Number(r.lot_id),
    lotNumero: r.lot_numero,
    lotLibelle: [r.adresse, r.commune].filter((x) => x !== null && x.trim() !== '').join(', ')
      + ([r.nature, r.type_bien].some((x) => x) ? ` · ${[r.nature, r.type_bien].filter((x) => x).join(' ')}` : ''),
    locataire: r.locataire,
    entree: r.entree, sortie: r.sortie,
    conditions: r.taux_gestion_ht === null || r.base === null ? null : {
      loyerHc: num(r.loyer_hc), provisions: num(r.provisions), tauxHt: Number(r.taux_gestion_ht), base: r.base,
    },
    bailId: r.bail_id === null ? null : Number(r.bail_id),
    proprietaires: proprietaires.get(r.lot_id) ?? [],
  }));
}

// ── LES RÉGLAGES (écran des honoraires, administrateurs) ─────────────────────────────────────────────────────────

export async function enregistrerReglages(
  brut: { tauxDefautHt?: unknown; baseDefaut?: unknown }, auteur: Auteur,
): Promise<IssueConditions> {
  if (!(await honorairesGestionDisponible())) return { etat: 'sans_schema' };
  const verdict = verifierConditions({ tauxHt: brut.tauxDefautHt, base: brut.baseDefaut });
  if (!verdict.ok) return { etat: 'refus', motif: verdict.motif };
  const { tauxHt, base } = verdict.valeurs;
  return withTransaction(async (q) => {
    const { rows } = await q<{ taux: string; base: string }>(
      'SELECT taux_defaut_ht::text AS taux, base_defaut AS base FROM gestion_honoraires_reglage WHERE id = 1 FOR UPDATE');
    await q(
      `UPDATE gestion_honoraires_reglage SET taux_defaut_ht = $1, base_defaut = $2, modifie_le = now(),
              modifie_par_libelle = $3 WHERE id = 1`, [tauxHt, base, auteur.libelle]);
    await q(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ('annuaire', 0, 'honoraires_reglage', $1, $2, 'réglages agence des honoraires de gestion', $3, $4)`,
      [rows[0] === undefined ? null : `${rows[0].taux} % HT · base ${rows[0].base}`, `${tauxHt} % HT · base ${base}`,
        auteur.id, auteur.libelle]);
    return { etat: 'ok' as const, data: undefined };
  });
}

/** Ajoute une TVA datée (ajout seul). La valeur en vigueur à une date est la plus récente dont l'effet a commencé. */
export async function ajouterTva(brut: { valeur?: unknown; depuis?: unknown }, auteur: Auteur): Promise<IssueConditions> {
  if (!(await honorairesGestionDisponible())) return { etat: 'sans_schema' };
  const verdict = verifierConditions({ tauxHt: brut.valeur, base: 'cc' });
  if (!verdict.ok) return { etat: 'refus', motif: verdict.motif.replace('taux de gestion', 'taux de TVA') };
  const depuis = typeof brut.depuis === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(brut.depuis) ? brut.depuis : null;
  if (depuis === null) return { etat: 'refus', motif: 'La date d’effet est obligatoire (JJ/MM/AAAA).' };
  return withTransaction(async (q) => {
    await q(
      `INSERT INTO gestion_reglage_date (cle, valeur, depuis, saisi_par_libelle) VALUES ('tva_honoraires', $1, $2::date, $3)`,
      [verdict.valeurs.tauxHt, depuis, auteur.libelle]);
    await q(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ('annuaire', 0, 'honoraires_reglage', $1, 'TVA sur honoraires (réglage daté)', $2, $3)`,
      [`TVA ${verdict.valeurs.tauxHt} % à compter du ${depuis}`, auteur.id, auteur.libelle]);
    return { etat: 'ok' as const, data: undefined };
  });
}

// ── LA REPRISE (commande `gestion:honoraires:reprendre`) ─────────────────────────────────────────────────────────

export interface ComptesReprise {
  /**
   * Lots dont le taux WIPPIMMO a été posé ou changé par la reprise elle-même (option `--dossier`, lecture de Lots.xlsx).
   * 0 sans l'option : le taux vient alors de l'import.
   */
  tauxLots: number;
  /** Locations en cours (sans date de départ) d'un lot de l'annuaire. */
  enCours: number;
  /** Déjà pourvues de conditions : jamais touchées. */
  dejaPourvues: number;
  /** Reçoivent le taux WIPPIMMO de leur lot (origine « reprise », loyer vide). */
  reprises: number;
  /** Lot sans taux WIPPIMMO : rien n'est écrit, le taux sera proposé par le réglage agence à la saisie. */
  sansTauxWippimmo: number;
}

class AnnuleReprise extends Error { constructor(readonly comptes: ComptesReprise) { super('simulation'); } }

/**
 * REPRISE DU TAUX WIPPIMMO sur les locations en cours qui n'ont encore aucune condition. N'écrit QUE dans la table
 * neuve ; le loyer reste vide (on ne l'invente pas). Rejouable : la seconde passe ne trouve plus rien à reprendre.
 * Simulation par défaut : tout est calculé dans une transaction, puis défait.
 */
export async function reprendreTauxWippimmo(o: {
  appliquer: boolean; auteur: string;
  /** Le taux de chaque lot lu dans Lots.xlsx (`tauxHonosDesLots`) : posé AVANT la reprise, ces deux colonnes seulement. */
  tauxLots?: readonly { wippimmoId: string; tauxHonos: number | null; baseHonos: string | null }[];
}): Promise<ComptesReprise | null> {
  if (!(await honorairesGestionDisponible())) return null;
  return withTransaction(async (q) => {
    let tauxLots = 0;
    for (const t of o.tauxLots ?? []) {
      const r = await q(
        `UPDATE gestion_annuaire_lot SET taux_honos_wippimmo = $2, base_honos_wippimmo = $3
          WHERE wippimmo_id = $1
            AND (taux_honos_wippimmo IS DISTINCT FROM $2::numeric OR base_honos_wippimmo IS DISTINCT FROM $3::text)`,
        [t.wippimmoId, t.tauxHonos, t.baseHonos]);
      tauxLots += r.rowCount ?? 0;
    }
    // Arno (20/10/2026, 393) : une reprise PAR BAIL (sa première occupation en place), écrite sur le bail.
    const avecBail = await bailDisponible();
    const { rows } = await q<{ id: string; deja: boolean; taux: string | null; base: string | null; bail_id: string | null }>(
      `SELECT o.id::text,
              EXISTS (SELECT 1 FROM gestion_location_conditions c WHERE ${sqlConditionsDe('c', 'o', avecBail)}) AS deja,
              lo.taux_honos_wippimmo::text AS taux, lo.base_honos_wippimmo AS base,
              ${avecBail ? 'o.bail_id::text' : 'NULL::text'} AS bail_id
         FROM gestion_annuaire_occupation o
         JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
        WHERE o.sortie IS NULL
          ${avecBail ? 'AND (o.bail_id IS NULL OR o.id = (SELECT min(o2.id) FROM gestion_annuaire_occupation o2 WHERE o2.bail_id = o.bail_id AND o2.sortie IS NULL))' : ''}
        ORDER BY o.id`);
    const reglages = await lireReglages(q);
    const c: ComptesReprise = { tauxLots, enCours: rows.length, dejaPourvues: 0, reprises: 0, sansTauxWippimmo: 0 };
    for (const r of rows) {
      if (r.deja) { c.dejaPourvues += 1; continue; }
      if (r.taux === null) { c.sansTauxWippimmo += 1; continue; }
      // La base : « charges comprises » dès que le code WIPPIMMO contient C ; sinon hors charges. Absent : le réglage.
      const base: BaseHonoraires = r.base === null ? reglages.baseDefaut : r.base.includes('C') ? 'cc' : 'hc';
      await q(
        `INSERT INTO gestion_location_conditions
           (${r.bail_id !== null ? 'bail_id' : 'occupation_id'}, loyer_hc, provisions, taux_gestion_ht, base, origine, saisi_par_libelle)
         VALUES ($1, NULL, NULL, $2, $3, 'reprise', $4)`, [Number(r.bail_id ?? r.id), r.taux, base, o.auteur]);
      c.reprises += 1;
    }
    if (c.reprises > 0 || c.tauxLots > 0) {
      await q(
        `INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_libelle)
         VALUES ('annuaire', 0, 'honoraires_reprise', $1, $2)`,
        [`reprise du taux WIPPIMMO : ${c.tauxLots} lot(s) avec leur taux lu dans Lots.xlsx, `
          + `${c.reprises} location(s) en cours (loyer de départ à saisir), `
          + `${c.dejaPourvues} déjà pourvue(s), ${c.sansTauxWippimmo} lot(s) sans taux WIPPIMMO`, o.auteur]);
    }
    if (!o.appliquer) throw new AnnuleReprise(c);
    return c;
  }).catch((e: unknown) => {
    if (e instanceof AnnuleReprise) return e.comptes;
    throw e;
  });
}
