import 'server-only';
import { query, withTransaction } from '../../db/client';
import { colonneExisteMemo } from '../sondeLocation';
import { colonnesTrace } from '../../gestion/traceJournal';
import { versionADate } from './suivi';
import { margeFr, verifierMargeGli, type LigneGli, type MargeGli } from './margeGli';

/**
 * 🔴 Arno (25/10/2026, 427) — LA MARGE GLI EN BASE, ET LES GLI DES BAUX AVEC GESTION. Voir `margeGli.ts` pour les règles.
 * Sans la 427 : aucune marge (les GLI se comptent, sans gain) et « Nouvelle marge » est refusée avec ce motif.
 */
interface Auteur { id: number | null; libelle: string }
type Reponse = { etat: 'ok' } | { etat: 'refus'; motif: string } | { etat: 'indisponible'; motif: string };
const SANS_427: Reponse = { etat: 'indisponible', motif: 'La mise à jour de la base (migration 427) n’est pas encore appliquée.' };

export const margeGliDisponible = (): Promise<boolean> => colonneExisteMemo('gestion_location_marge_gli', 'marge_pct');

export async function lireMargesGli(): Promise<MargeGli[]> {
  if (!(await margeGliDisponible())) return [];
  const { rows } = await query<{ id: string; depuis: string; marge_pct: string; saisi_le: string; saisi_par_libelle: string }>(
    `SELECT id, depuis::text AS depuis, marge_pct, saisi_le::text AS saisi_le, saisi_par_libelle FROM gestion_location_marge_gli ORDER BY depuis`);
  return rows.map((r) => ({ id: Number(r.id), depuis: r.depuis, marge: Number(r.marge_pct), saisiLe: r.saisi_le, par: r.saisi_par_libelle }));
}

/** Une nouvelle version (jamais une modification) ; une seule par date ; journalisée (compte, session, écran). */
export async function ajouterMargeGli(brut: unknown, auteur: Auteur): Promise<Reponse> {
  if (!(await margeGliDisponible())) return SANS_427;
  const v = verifierMargeGli(brut);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  const avant = versionADate(await lireMargesGli(), v.depuis);
  return withTransaction(async (q) => {
    const r = await q(`INSERT INTO gestion_location_marge_gli (depuis, marge_pct, saisi_par, saisi_par_libelle) VALUES ($1, $2, $3, $4)
                       ON CONFLICT (depuis) DO NOTHING RETURNING id`, [v.depuis, v.marge, auteur.id, auteur.libelle]);
    const id = (r.rows[0] as { id?: string } | undefined)?.id;
    if (id === undefined) return { etat: 'refus', motif: 'Une marge GLI existe déjà à cette date : choisissez une autre date d’effet.' } as Reponse;
    const t = await colonnesTrace({ sujet: 'parametre', champ: 'Marge GLI' }, 7);
    const date = v.depuis.split('-').reverse().join('/');
    await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle${t.colonnes})
             VALUES ('config', $1, 'marge_gli', $2, $3, $4, $5, $6${t.marques})`,
    [Number(id), avant === null ? 'Marge GLI : aucune' : `Marge GLI : ${margeFr(avant.marge)} (depuis le ${avant.depuis.split('-').reverse().join('/')})`,
      `Marge GLI : ${margeFr(v.marge)} à partir du ${date}`, 'Paramètres Location — nouvelle version (l’historique est conservé)', auteur.id, auteur.libelle, ...t.valeurs]);
    return { etat: 'ok' } as Reponse;
  });
}

/**
 * Les GLI des baux AVEC GESTION dont la date de souscription retenue tombe entre `debut` et `fin` (AAAA-MM-JJ) :
 *   · la dernière saisie des garanties du bail dit « GLI » ;
 *   · date = la signature (ligne du Suivi, à défaut entrée du bail) si la PREMIÈRE saisie dit déjà « GLI », sinon le jour (Paris) de la
 *     première saisie qui dit « GLI » ;
 *   · le bien est en gestion à la date de signature (dernier statut daté au plus tard ce jour-là) ;
 *   · loyer HC et provisions : les conditions du bail (à l'entrée), jamais le loyer révisé.
 */
export async function lireGli(debut: string, fin: string): Promise<LigneGli[]> {
  const [conditions, loyers, statuts] = await Promise.all([colonneExisteMemo('gestion_location_conditions_entree', 'bail_id'),
    colonneExisteMemo('gestion_location_conditions', 'bail_id'), colonneExisteMemo('gestion_annuaire_lot', 'statut_bien')]);
  if (!conditions || !loyers || !statuts) return [];
  const { rows } = await query<Record<string, unknown>>(
    `WITH ce AS (
       SELECT bail_id, (array_agg(assurance_loyers ORDER BY id DESC))[1] AS derniere, (array_agg(assurance_loyers ORDER BY id))[1] AS premiere,
              min(saisi_le) FILTER (WHERE assurance_loyers = 'gli') AS premiere_gli
         FROM gestion_location_conditions_entree GROUP BY bail_id),
     g AS (
       SELECT ce.bail_id, a.id AS activite_id, coalesce(a.lot_id, b.lot_id) AS lot_id, coalesce(a.date_signature, b.entree) AS signature,
              CASE WHEN ce.premiere = 'gli' THEN coalesce(a.date_signature, b.entree) ELSE (ce.premiere_gli AT TIME ZONE 'Europe/Paris')::date END AS date_gli
         FROM ce JOIN gestion_bail b ON b.id = ce.bail_id
         LEFT JOIN LATERAL (SELECT x.id, x.lot_id, x.date_signature FROM gestion_location_activite x
                             WHERE x.bail_id = ce.bail_id AND x.annule_le IS NULL ORDER BY x.date_signature, x.id LIMIT 1) a ON true
        WHERE ce.derniere = 'gli')
     SELECT g.bail_id, g.activite_id, g.lot_id, g.date_gli::text AS date_gli,
            coalesce(nullif(btrim(concat_ws(', ', nullif(btrim(lt.adresse), ''), nullif(btrim(lt.commune), ''))), ''), 'Bien n° ' || lt.id) AS bien,
            (SELECT string_agg(coalesce(nullif(btrim(concat_ws(' ', lo.prenom, lo.nom)), ''), lo.nom), ', ' ORDER BY lo.id) FROM gestion_annuaire_locataire lo
              WHERE lo.id IN (SELECT oc.locataire_id FROM gestion_annuaire_occupation oc WHERE oc.bail_id = g.bail_id)) AS locataire,
            c.loyer_hc, c.provisions
       FROM g JOIN gestion_annuaire_lot lt ON lt.id = g.lot_id
       LEFT JOIN LATERAL (SELECT x.loyer_hc, x.provisions FROM gestion_location_conditions x WHERE x.bail_id = g.bail_id ORDER BY x.id DESC LIMIT 1) c ON true
      WHERE g.date_gli BETWEEN $1 AND $2
        AND (SELECT t.apres FROM gestion_bien_statut_transition t WHERE t.lot_id = g.lot_id AND t.effet_le <= g.signature
              ORDER BY t.effet_le DESC, t.id DESC LIMIT 1) = 'en_gestion'
      ORDER BY g.date_gli, g.bail_id`, [debut, fin]);
  const nOuNull = (x: unknown): number | null => (x === null || x === undefined ? null : Number(x));
  return rows.map((r) => ({ bailId: Number(r.bail_id), activiteId: nOuNull(r.activite_id), lotId: nOuNull(r.lot_id), date: String(r.date_gli),
    bien: String(r.bien), locataire: String(r.locataire ?? '—'), loyerHc: nOuNull(r.loyer_hc), provisions: nOuNull(r.provisions) }));
}
