import { query } from '../db/client';

/**
 * RATT-EDIT (lot B3) — MARQUEUR PERSISTANT « modifié après validation, non revalidé » + TRACE (qui/quand de la dernière modification).
 *
 * 🔴 DÉRIVÉ, ZÉRO MIGRATION : le marqueur n'est PAS stocké — il se RECALCULE en comparant l'état de travail COURANT (corps + emprises)
 * à la RÉFÉRENCE de la dernière validation. Conséquence directe : il SURVIT au rechargement, à la fermeture de l'onglet et vaut pour
 * TOUT utilisateur (c'est un fait serveur, pas un état d'écran) ; et il DISPARAÎT dès qu'une revalidation (figerVersionValidation, B1)
 * appende une nouvelle version de gel qui recouvre l'état courant.
 *
 * RÉFÉRENCE `ref_le` = COALESCE(dernière version de gel de VALIDATION `gele_le` [B1], `permis_projection.validee_le` [passage en
 * Rattachement], `permis_rattachement.valide_le`). Le gel prime dès qu'il existe (après une 1re revalidation) ; sinon on retombe sur
 * l'horodatage de validation de projection — indispensable pour les permis validés AVANT B1 (aucun gel, décision « pas de backfill »).
 *
 * DÉTECTION (fiable, indépendante des estampilles éparses côté emprise) :
 *   · corps : `maj_le > ref_le` — couvre altitude, mesures, repère, adresse, création, désactivation (tout passe par maj_le/maj_par) ;
 *   · corps SUPPRIMÉ en dur depuis le gel (si gel) : un `permis_gel_corps.corps_id` absent des corps courants ;
 *   · emprise : estampille (`GREATEST(cree_le, ajustement.pose_le, validee_le) > ref_le`) OU — quand un gel existe — géométrie/ajustement/
 *     nombre DIFFÉRENTS du gel (compare `ST_Equals` → capte la RETOUCHE, que les estampilles ratent).
 *
 * TRACE `derniereModif` : la modification de CORPS la plus récente après `ref_le` (source fiable `maj_le`/`maj_par` → nom résolu). Une
 * modification d'emprise SEULE (sans corps touché) laisse la trace à null (marqueur ON, auteur/date indéterminés) — honnête, jamais faux.
 */
export interface MarqueurModif {
  le: string | null;      // ISO — quand (dernière modification de corps après la validation) ; null si seule une emprise a changé
  parNom: string | null;  // nom complet de l'auteur (résolu depuis admin_utilisateur) ; null si non résoluble / emprise seule
}

/**
 * Renvoie une entrée PAR dossier MODIFIÉ depuis sa dernière validation (parmi `dossierIds`), avec la trace. Absent de la Map = non modifié
 * (ou non validé, ou registre de gel indisponible). RÉSILIENT : toute absence de table/colonne → Map vide (jamais une liste cassée).
 */
export async function marqueursModifApresValidation(dossierIds: number[]): Promise<Map<number, MarqueurModif>> {
  const m = new Map<number, MarqueurModif>();
  const ids = [...new Set(dossierIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return m;
  try {
    const { rows } = await query<{ dossier_id: number | string; le: string | Date | null; par_nom: string | null }>(
      `WITH ref AS (
         SELECT d.dossier_id,
                (SELECT g.id      FROM permis_gel g WHERE g.dossier_id = d.dossier_id AND g.gele_par LIKE 'validation:%' ORDER BY g.version DESC LIMIT 1) AS gel_id,
                COALESCE(
                  (SELECT g.gele_le FROM permis_gel g WHERE g.dossier_id = d.dossier_id AND g.gele_par LIKE 'validation:%' ORDER BY g.version DESC LIMIT 1),
                  pp.validee_le,
                  r.valide_le
                ) AS ref_le
           FROM (SELECT unnest($1::bigint[]) AS dossier_id) d
           LEFT JOIN permis_projection   pp ON pp.dossier_id = d.dossier_id
           LEFT JOIN permis_rattachement r  ON r.dossier_id  = d.dossier_id
       ),
       -- CORPS modifié après la référence (source fiable maj_le/maj_par)
       cm AS (
         SELECT ref.dossier_id, cb.maj_le AS le, cb.maj_par AS par
           FROM ref JOIN permis_corps_batiment cb ON cb.dossier_id = ref.dossier_id
          WHERE ref.ref_le IS NOT NULL AND cb.maj_le IS NOT NULL AND cb.maj_le > ref.ref_le
       ),
       -- CORPS figé SUPPRIMÉ en dur depuis (uniquement si un gel existe → on connaît la liste d'origine)
       cs AS (
         SELECT DISTINCT ref.dossier_id
           FROM ref JOIN permis_gel_corps gc ON gc.gel_id = ref.gel_id
          WHERE ref.gel_id IS NOT NULL AND gc.corps_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM permis_corps_batiment cb WHERE cb.id = gc.corps_id)
       ),
       -- EMPRISE modifiée : estampille > ref (marche sans gel) OU, si gel, géométrie/ajustement/nombre différents (capte la retouche)
       em AS (
         SELECT DISTINCT ref.dossier_id
           FROM ref
          WHERE ref.ref_le IS NOT NULL AND (
                EXISTS (SELECT 1 FROM permis_emprise_reconstruite e
                         WHERE e.dossier_id = ref.dossier_id
                           AND GREATEST(e.cree_le, (e.ajustement->>'pose_le')::timestamptz, e.validee_le) > ref.ref_le)
             OR (ref.gel_id IS NOT NULL AND (
                   (SELECT count(*) FROM permis_emprise_reconstruite e WHERE e.dossier_id = ref.dossier_id)
                     <> (SELECT count(*) FROM permis_gel_emprise ge WHERE ge.gel_id = ref.gel_id)
                   OR EXISTS (SELECT 1 FROM permis_emprise_reconstruite e
                                JOIN permis_gel_emprise ge ON ge.gel_id = ref.gel_id AND ge.emprise_id = e.id
                               WHERE e.dossier_id = ref.dossier_id
                                 AND (NOT ST_Equals(e.geom, ge.geom) OR e.ajustement IS DISTINCT FROM ge.ajustement))
                   OR EXISTS (SELECT 1 FROM permis_emprise_reconstruite e
                               WHERE e.dossier_id = ref.dossier_id
                                 AND NOT EXISTS (SELECT 1 FROM permis_gel_emprise ge WHERE ge.gel_id = ref.gel_id AND ge.emprise_id = e.id))
                 ))
          )
       ),
       modifies AS (
         SELECT dossier_id FROM cm
         UNION SELECT dossier_id FROM cs
         UNION SELECT dossier_id FROM em
       ),
       trace AS (  -- la modification de corps la PLUS RÉCENTE, résolue en nom
         SELECT DISTINCT ON (cm.dossier_id) cm.dossier_id, cm.le,
                (SELECT nullif(btrim(concat_ws(' ', u.prenom, u.nom)), '') FROM admin_utilisateur u WHERE u.id::text = cm.par LIMIT 1) AS par_nom
           FROM cm ORDER BY cm.dossier_id, cm.le DESC
       )
       SELECT md.dossier_id, t.le, t.par_nom
         FROM modifies md LEFT JOIN trace t ON t.dossier_id = md.dossier_id`,
      [ids]);
    for (const r of rows) {
      const id = Number(r.dossier_id);
      const le = r.le == null ? null : (r.le instanceof Date ? r.le.toISOString() : new Date(r.le).toISOString());
      m.set(id, { le, parNom: r.par_nom ?? null });
    }
    return m;
  } catch {
    return m; // registre de gel / colonnes de gel absents (169/225/226 non appliquées) → aucun marqueur, jamais une liste cassée
  }
}
