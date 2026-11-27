import { query } from '../db/client';
import { ouvreurDe, type OuvreurEvenement } from './ouvreurEvenement';

/**
 * 🔴🔴 QUI A OUVERT CHAQUE ÉVÉNEMENT (Arno, 27/11/2026, 09h48) — UNE LECTURE, partagée par la liste, le tableau de bord (filtre « OUVERT PAR »),
 * la fiche du bien et la frise : la même règle partout (ouvreurDe). Lecture seule : rien n'est écrit, rien n'est deviné.
 *   ① la colonne de l'événement (ouvert_par / ouvert_par_libelle, posée à la création par l'utilisateur de la SESSION) ;
 *   ② sinon le journal de sa création (« ouverture » sans valeur d'avant — la même ligne que la date de création de la frise) ;
 *   ③ le compte retrouvé par son n°, sinon par son identifiant quand le libellé est une adresse mail (règle de d1d501cd).
 * `ids` absent : tous les événements.
 */
export async function ouvreursDesEvenements(ids?: readonly number[]): Promise<Map<number, OuvreurEvenement>> {
  if (ids !== undefined && ids.length === 0) return new Map();
  const { rows } = await query<{ id: string; par: string | null; libelle: string | null; prenom: string | null; nom: string | null }>(
    `SELECT e.id::text AS id, o.par::text AS par, o.libelle, u.prenom, u.nom
       FROM gestion_evenement e
       LEFT JOIN LATERAL (
         SELECT j.auteur_id, j.auteur_libelle FROM gestion_journal j
          WHERE j.entite = 'evenement' AND j.entite_id = e.id AND j.action = 'ouverture' AND j.valeur_avant IS NULL
          ORDER BY j.survenu_le, j.id LIMIT 1) jo ON true
       CROSS JOIN LATERAL (
         SELECT CASE WHEN e.ouvert_par IS NOT NULL OR nullif(btrim(e.ouvert_par_libelle), '') IS NOT NULL THEN e.ouvert_par ELSE jo.auteur_id END AS par,
                coalesce(nullif(btrim(e.ouvert_par_libelle), ''), jo.auteur_libelle) AS libelle) o
       LEFT JOIN LATERAL (
         SELECT a.prenom, a.nom FROM admin_utilisateur a
          WHERE (o.par IS NOT NULL AND a.id = o.par)
             OR (o.par IS NULL AND position('@' IN coalesce(o.libelle, '')) > 0 AND lower(a.identifiant) = lower(o.libelle))
          LIMIT 1) u ON true
      ${ids === undefined ? '' : 'WHERE e.id = ANY($1::bigint[])'}`, ids === undefined ? [] : [ids.map(Number)]);
  return new Map(rows.map((r) => [Number(r.id), ouvreurDe({ id: r.par, libelle: r.libelle, prenom: r.prenom, nom: r.nom })]));
}
