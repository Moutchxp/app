import { query } from '../db/client';
import { conditionCoordonneeVivante } from '../gestion/coordonneeVivante';
import { sqlPersonneVivante } from '../gestion/personneVivanteSql';
import { estStatutBien, type StatutBien } from '../gestion/statutBien';
import { sqlStatutBien } from '../gestion/statutBienRepo';
import { colonneExisteMemo } from './sondeLocation';
import { analyserTermePortefeuille } from './recherchePortefeuille';

/**
 * ══ 🔴🔴 TUILE LOCATION — « CLIENTS ET BIENS » (Arno, 21/10/2026, migration 403). IMPUR (base), LECTURE SEULE. ═══════════════
 *
 * Les PROPRIÉTAIRES et LEURS BIENS, quel que soit le statut du bien — en gestion, location seule, ancienne gestion —, avec la
 * pastille de chaque bien. Recherche par nom, téléphone, e-mail, ou adresse d'un de ses biens ; filtre « Tous / En gestion /
 * Location seule / Ancienne gestion » : un propriétaire apparaît s'il a AU MOINS un bien du statut choisi, et seuls ces biens-là
 * sont listés sous lui. Sans recherche : tous les propriétaires, par nom, par pages de 25.
 * Les annexes RATTACHÉES ne sont pas listées à part (elles suivent leur bien principal, qui en dit le nombre).
 * 🔴 Aucune écriture.
 */
export type FiltreStatut = 'tous' | StatutBien;
export const lireFiltreStatut = (x: unknown): FiltreStatut => (estStatutBien(x) ? x : 'tous');

export interface BienDuClient {
  id: number;
  adresse: string | null;
  commune: string | null;
  categorie: string | null;
  statut: StatutBien;
  /** Combien d'annexes rattachées le suivent. */
  annexes: number;
}

export interface ClientEtBiens {
  id: number;
  nom: string;
  telephone: string | null;
  email: string | null;
  biens: BienDuClient[];
}

export interface PageClients { clients: ClientEtBiens[]; total: number; page: number; parPage: number }

const PAR_PAGE = 25;

export async function clientsEtBiens(brut: string, filtre: FiltreStatut, page = 0): Promise<PageClients> {
  const t = analyserTermePortefeuille(brut);
  const p0 = Math.max(0, Math.min(1000, Math.trunc(page) || 0));
  const statut = await sqlStatutBien('lo');
  const coordVivante = await conditionCoordonneeVivante('c');
  const vivante = await sqlPersonneVivante('p');
  const avecAnnexe = await colonneExisteMemo('gestion_lot_annexe', 'annexe_id');
  const avecDetache = await colonneExisteMemo('gestion_annuaire_lot', 'annexe_detachee_le');
  const avecCo = await colonneExisteMemo('gestion_annuaire_lot_proprietaire', 'jusqu_a');
  const avecCategorie = await colonneExisteMemo('gestion_annuaire_lot', 'categorie');
  // Les biens d'un propriétaire : titulaire, ou indivision en cours ; sans les annexes rattachées.
  const sesBiens = (p: string): string => `(lo.proprietaire_id = ${p}${avecCo ? ` OR lo.id IN (SELECT lp.lot_id FROM gestion_annuaire_lot_proprietaire lp
      WHERE lp.proprietaire_id = ${p} AND lp.jusqu_a IS NULL)` : ''})${avecAnnexe ? ` AND NOT EXISTS (SELECT 1 FROM gestion_lot_annexe ax
      WHERE ax.annexe_id = lo.id${avecDetache ? ' AND lo.annexe_detachee_le IS NULL' : ''})` : ''}`;
  const duFiltre = filtre === 'tous' ? 'true' : `${statut} = $4`;
  const parNom = t.mots.length === 0 ? 'false' : t.mots.map((_, i) => `p.nom_normalise LIKE '%' || ($3::text[])[${i + 1}] || '%'`).join(' AND ');
  const parAdresse = t.mots.length === 0 ? 'false' : `EXISTS (SELECT 1 FROM gestion_annuaire_lot lo WHERE ${sesBiens('p.id')} AND ${duFiltre}
      AND ${t.mots.map((_, i) => `(coalesce(lo.adresse_normalisee, '') || ' ' || coalesce(lo.code_postal, '')) LIKE '%' || ($3::text[])[${i + 1}] || '%'`).join(' AND ')})`;
  const tests: string[] = [];
  if (t.chiffres !== null) tests.push(`(c.sorte = 'telephone' AND regexp_replace(c.valeur, '\\D', '', 'g') LIKE '%' || $1 || '%')`);
  if (t.email !== null) tests.push(`(c.sorte = 'email' AND lower(c.valeur) LIKE '%' || $2 || '%')`);
  const parCoordonnee = tests.length === 0 ? 'false' : `EXISTS (SELECT 1 FROM gestion_annuaire_contact c
      WHERE c.sujet = 'proprietaire' AND c.sujet_id = p.id AND c.absent_le IS NULL${coordVivante} AND (${tests.join(' OR ')}))`;
  const cherche = t.vide ? 'true' : `(${parNom} OR ${parCoordonnee} OR ${parAdresse})`;
  const aDesBiens = filtre === 'tous' ? 'true' : `EXISTS (SELECT 1 FROM gestion_annuaire_lot lo WHERE ${sesBiens('p.id')} AND ${duFiltre})`;
  // Tous les paramètres sont cités (clause neutre) : PostgreSQL refuse un paramètre transmis mais inutilisé.
  const NEUTRE = '(length($1::text) >= 0 AND length($2::text) >= 0 AND cardinality($3::text[]) >= 0 AND length($4::text) >= 0)';
  const params = [t.chiffres ?? '', t.email ?? '', t.mots, filtre === 'tous' ? '' : filtre];
  const coordonnee = (sorte: 'telephone' | 'email'): string => `(SELECT c.valeur_brute FROM gestion_annuaire_contact c
      WHERE c.sujet = 'proprietaire' AND c.sujet_id = p.id AND c.sorte = '${sorte}' AND c.absent_le IS NULL${coordVivante} ORDER BY c.rang, c.id LIMIT 1)`;
  const ou = `FROM gestion_annuaire_proprietaire p WHERE ${vivante} AND ${cherche} AND ${aDesBiens} AND ${NEUTRE}`;
  const { rows: total } = await query<{ n: number }>(`SELECT count(*)::int AS n ${ou}`, params);
  const { rows } = await query<{ id: string; nom: string; telephone: string | null; email: string | null }>(
    `SELECT p.id::text, p.nom_complet AS nom, ${coordonnee('telephone')} AS telephone, ${coordonnee('email')} AS email
       ${ou} ORDER BY p.nom_normalise, p.id LIMIT ${PAR_PAGE} OFFSET ${p0 * PAR_PAGE}`, params);
  const ids = rows.map((r) => Number(r.id));
  const biens = new Map<number, BienDuClient[]>();
  if (ids.length > 0) {
    const { rows: b } = await query<{ pid: string; id: string; adresse: string | null; commune: string | null; categorie: string | null; statut: string; annexes: number }>(
      `SELECT x.pid::text, lo.id::text, lo.adresse, lo.commune, ${avecCategorie ? 'lo.categorie' : 'NULL::text AS categorie'}, ${statut} AS statut,
              ${avecAnnexe ? `(SELECT count(*)::int FROM gestion_lot_annexe ax JOIN gestion_annuaire_lot an ON an.id = ax.annexe_id
                 WHERE ax.parent_id = lo.id${avecDetache ? ' AND an.annexe_detachee_le IS NULL' : ''})` : '0'} AS annexes
         FROM unnest($1::bigint[]) AS x(pid) JOIN gestion_annuaire_lot lo ON ${sesBiens('x.pid')}
        WHERE ${filtre === 'tous' ? 'length($2::text) >= 0' : `${statut} = $2`}
        ORDER BY x.pid, CASE ${statut} WHEN 'en_gestion' THEN 0 WHEN 'location_seule' THEN 1 ELSE 2 END, lo.commune NULLS LAST, lo.adresse NULLS LAST, lo.id`,
      [ids, filtre === 'tous' ? '' : filtre]);
    for (const r of b) {
      if (!estStatutBien(r.statut)) continue;
      const liste = biens.get(Number(r.pid)) ?? [];
      if (!liste.some((x) => x.id === Number(r.id))) {
        liste.push({ id: Number(r.id), adresse: r.adresse, commune: r.commune, categorie: r.categorie, statut: r.statut, annexes: Number(r.annexes) });
      }
      biens.set(Number(r.pid), liste);
    }
  }
  return {
    clients: rows.map((r) => ({ id: Number(r.id), nom: r.nom, telephone: r.telephone, email: r.email, biens: biens.get(Number(r.id)) ?? [] })),
    total: total[0]?.n ?? 0, page: p0, parPage: PAR_PAGE,
  };
}
