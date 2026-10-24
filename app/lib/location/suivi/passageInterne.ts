import type { query as Query } from '../../db/client';
import { colonnesTrace } from '../../gestion/traceJournal';
import { colonneExisteMemo } from '../sondeLocation';
import { libelleRemuneration, versionADate, versionsEffectives, type ModeApporteur, type RemunerationCollegue } from './suivi';

/**
 * ══ 🔴 Arno (24/10/2026, migration 422) — « PASSER EN INTERNE » : UNE SEULE RÈGLE, POUR LE BOUTON ET POUR LE SCRIPT ══════════════════
 * Le bouton de la fiche (`passer-interne`) et `npm run location:apporteurs-internes -- --reel` écrivent par CETTE fonction :
 *   · l'apporteur doit être un EXTERNE non archivé ; le compte doit exister et n'être l'apporteur interne de personne d'autre ;
 *   · il devient INTERNE le jour même (`compte_id`, type « Collaborateur », `interne_depuis` = aujourd'hui) : le rattachement à son
 *     collègue et la rémunération de ce collègue prennent FIN à compter de ce jour — rien n'est effacé (historique conservé), et les
 *     dossiers déjà signés gardent leur calcul (`interneADate`) ;
 *   · une ligne de journal (`location_apporteur`) : avant (externe, collègue, rémunération) → après (interne, compte), avec le compte,
 *     la session et l'écran quand une trace est posée (le bouton) ; l'auteur du script sinon.
 * N'importe pas `server-only` : le script la charge aussi. `q` : la requête de la transaction de l'appelant.
 */
export type IssuePassage = { etat: 'ok'; avant: string; apres: string } | { etat: 'refus'; motif: string } | { etat: 'indisponible'; motif: string };

export const MOT_SANS_422 = 'Mise à jour de la base à appliquer (migration 422) : « Passer en interne » ne peut pas encore être enregistré (les dossiers passés ne garderaient pas leur calcul).';

/** 422 (date du passage) et 419 (entité de journal « location_apporteur ») : le passage peut-il s'écrire ? */
export async function passageInterneDisponible(q: typeof Query): Promise<boolean> {
  if (!(await colonneExisteMemo('gestion_location_apporteur', 'interne_depuis'))) return false;
  const { rows } = await q<{ def: string | null }>(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'gestion_journal_entite_chk' AND conrelid = 'gestion_journal'::regclass`);
  return (rows[0]?.def ?? '').includes("'location_apporteur'");
}

/** Le libellé d'un compte (« Prénom Nom », sinon l'identifiant). */
const libelleCompte = (r: { prenom: string | null; nom: string | null; identifiant: string | null; id: string }): string =>
  [r.prenom, r.nom].filter((x) => x && x.trim() !== '').join(' ').trim() || r.identifiant || `compte ${r.id}`;

export async function passerEnInterne(q: typeof Query, o: { apporteurId: number; compteId: number; jour: string; raison: string; auteur: { id: number | null; libelle: string } }): Promise<IssuePassage> {
  if (!(await passageInterneDisponible(q))) return { etat: 'indisponible', motif: MOT_SANS_422 };
  const ap = (await q<{ nom: string; type: string; compte_id: string | null; archive: boolean }>(
    'SELECT nom, type, compte_id::text, archive_le IS NOT NULL AS archive FROM gestion_location_apporteur WHERE id = $1 FOR UPDATE', [o.apporteurId])).rows[0];
  if (ap === undefined || ap.archive) return { etat: 'refus', motif: 'Apporteur inconnu.' };
  if (ap.compte_id !== null) return { etat: 'refus', motif: 'Cet apporteur est déjà interne.' };
  const compte = (await q<{ id: string; prenom: string | null; nom: string | null; identifiant: string | null }>(
    'SELECT id::text, prenom, nom, identifiant FROM admin_utilisateur WHERE id = $1', [o.compteId])).rows[0];
  if (compte === undefined) return { etat: 'refus', motif: 'Le compte de l’interface est inconnu.' };
  const lie = (await q<{ nom: string }>('SELECT nom FROM gestion_location_apporteur WHERE compte_id = $1 AND archive_le IS NULL AND id <> $2', [o.compteId, o.apporteurId])).rows[0];
  if (lie !== undefined) return { etat: 'refus', motif: `Ce compte est déjà l’apporteur interne « ${lie.nom} ».` };
  // Ce qui prend fin aujourd'hui : le collègue de rattachement et sa rémunération en vigueur (lus, jamais effacés).
  const col = (await q<{ collegue_libelle: string }>(
    `SELECT collegue_libelle FROM gestion_location_apporteur_collegue WHERE apporteur_id = $1 AND (depuis IS NULL OR depuis <= $2)
      ORDER BY depuis DESC NULLS LAST, id DESC LIMIT 1`, [o.apporteurId, o.jour])).rows[0]?.collegue_libelle ?? null;
  const avec420 = await colonneExisteMemo('gestion_location_apporteur_remuneration', 'toujours');
  const rem = (await q<{ id: string; depuis: string; remunere: boolean; mode: string; taux: string; taux_gestion: string; duree_annees: number | null; toujours: boolean }>(
    `SELECT id::text, depuis::text, remunere, mode, taux::text, taux_gestion::text, duree_annees, ${avec420 ? 'toujours' : 'false AS toujours'}
       FROM gestion_location_apporteur_remuneration WHERE apporteur_id = $1 ORDER BY depuis, id`, [o.apporteurId])).rows
    .map((r): RemunerationCollegue => ({ depuis: r.depuis.slice(0, 10), remunere: r.remunere, mode: r.mode as ModeApporteur, taux: Number(r.taux), tauxGestion: Number(r.taux_gestion),
      dureeAnnees: r.duree_annees, ordre: Number(r.id), ...(r.toujours ? { toujours: true } : {}) }));
  const remu = col === null ? null : versionADate(versionsEffectives(rem), o.jour);
  const avant = `externe (${ap.type})${col === null ? ', sans collègue de rattachement' : `, rattaché à ${col}, rémunération : ${libelleRemuneration(remu)}`}`;
  const apres = `interne — compte n° ${compte.id} ${libelleCompte(compte)}, depuis le ${o.jour.split('-').reverse().join('/')}`;
  const r = await q(
    `UPDATE gestion_location_apporteur SET compte_id = $2, type = 'collaborateur', interne_depuis = $3, modifie_le = now(), modifie_par_libelle = $4
      WHERE id = $1 AND compte_id IS NULL AND archive_le IS NULL`, [o.apporteurId, o.compteId, o.jour, o.auteur.libelle]);
  if ((r.rowCount ?? 0) !== 1) return { etat: 'refus', motif: 'Cet apporteur vient d’être modifié : rechargez-le.' };
  const t = await colonnesTrace({ sujet: 'apporteur', champ: 'Type d’apporteur' }, 7);
  await q(
    `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle${t.colonnes})
     VALUES ('location_apporteur', $1, 'location_apporteur_passe_interne', $2, $3, $4, $5, $6${t.marques})`,
    [o.apporteurId, avant, apres,
      `Apporteur « ${ap.nom} » passé en interne (${o.raison}) : rattachement et rémunération du collègue clos à compter du ${o.jour.split('-').reverse().join('/')} ; dossiers déjà signés inchangés`,
      o.auteur.id, o.auteur.libelle, ...t.valeurs]);
  return { etat: 'ok', avant, apres };
}
