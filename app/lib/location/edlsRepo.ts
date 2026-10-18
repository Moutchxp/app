import { query, withTransaction, type RequeteTx } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { tachesDisponibles } from '../gestion/schema';
import { rappelsParDefaut, type SaisieTache } from '../gestion/taches';
import { annulerTache, creerTache, decalerTache, listerCollaborateurs, modifierTache, type Collaborateur, type IssueTache } from '../gestion/tachesRepo';
import type { DemandePosee } from '../gestion/acceptationRepo';
import { colonneExisteMemo } from './sondeLocation';
import { encartDuBail } from './sortieLocatairesRepo';
import { libelleLotEncart, lignesEncart } from './sortieLocataires';
import { OBJET_TACHE_EDLS, texteRecapEdls, verifierPlanification, type EdlsAffiche } from './edls';

/**
 * ══ 🔴🔴 L'ÉTAT DES LIEUX DE SORTIE PLANIFIÉ — LE DÉPÔT (Arno, 19/10/2026) ════════════════════════════════════════════
 *
 * Une TÂCHE du module de tâches de la Gestion — RIEN d'autre : `creerTache`, `decalerTache`, `modifierTache` font la tâche,
 * sa demande d'acceptation (mail « Accepter / Refuser », « en attente de confirmation », acceptée d'office quand on se la
 * confie), son agenda (synchronisé par la route, après la transaction) et leurs traces. Ce dépôt ne fait que :
 *   · juger la saisie (`verifierPlanification`) et la personne (accès Location ET Gestion ET adresse du Workspace) ;
 *   · écrire le récapitulatif de la mission dans la note de la tâche ;
 *   · tenir le LIEN occupations ↔ tâche (`gestion_location_edls`, migration 385 — jamais effacé, seulement clos) ;
 *   · poser la date sur l'occupation (`etat_des_lieux_prevu_le`, migration 384 : la MÊME donnée que le tri) ;
 *   · journaliser chaque geste au journal de la Gestion, par locataire.
 * Ordre : LIRE (FOR UPDATE) → REFUSER → ÉCRIRE. La tâche est créée dans SA transaction ; si le lien ne peut pas être posé
 * ensuite (un autre EDLS est arrivé entre-temps), la tâche créée est ANNULÉE (tracée, jamais effacée) et le geste refusé.
 */

export type IssueEdls<T> =
  | { etat: 'ok'; data: T; tacheId: number; demande?: DemandePosee | null; demandes?: DemandePosee[] }
  | { etat: 'refus'; motif: string; champ?: string | null }
  | { etat: 'inconnu' }
  | { etat: 'sans_schema' };

/** Le lien (385), la date sur l'occupation (384), les préavis (383) et les tâches (346). */
export async function edlsDisponible(): Promise<boolean> {
  return (await colonneExisteMemo('gestion_location_edls', 'tache_id'))
    && (await colonneExisteMemo('gestion_annuaire_occupation', 'etat_des_lieux_prevu_le'))
    && (await colonneExisteMemo('gestion_location_preavis', 'date_max'))
    && (await tachesDisponibles());
}

/**
 * « CONFIER À » : les comptes qui peuvent recevoir une tâche (actifs, adresse de notre Workspace — LA règle du module de
 * tâches) ET qui ont les tuiles Location ET Gestion. Sans la migration 371 (droit Location), seul un administrateur a la
 * tuile Location. Moi en tête, comme la liste du module de tâches.
 */
export async function confiablesEdls(moi: number | null): Promise<Collaborateur[]> {
  const location = (await colonneExisteMemo('admin_utilisateur', 'perm_location')) ? 'perm_location IS TRUE' : 'false';
  const { rows } = await query<{ id: number }>(
    `SELECT id::int AS id FROM admin_utilisateur WHERE actif AND (role = 'administrateur' OR (perm_gestion IS TRUE AND ${location}))`);
  const permis = new Set(rows.map((r) => Number(r.id)));
  return (await listerCollaborateurs(moi)).filter((c) => permis.has(Number(c.id)));
}

async function journaliser(q: RequeteTx, locataireId: number, action: string, avant: string | null, apres: string | null, commentaire: string, auteur: Auteur): Promise<void> {
  await q(
    `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
     VALUES ('annuaire', $1, $2, $3, $4, $5, $6, $7)`,
    [locataireId, action, avant, apres, commentaire, auteur.id, auteur.libelle]);
}

type LigneGroupe = { id: string; locataire_id: string; lot_id: string; sortie: string | null; recu_le: string | null; date_max: string | null };

/** Les occupations du préavis, VERROUILLÉES, avec leur préavis ouvert. Refus si l'une est sortie ou n'est plus en préavis. */
async function lireGroupe(q: RequeteTx, ids: readonly number[]): Promise<{ ok: true; lignes: LigneGroupe[]; lotId: number } | { ok: false; issue: IssueEdls<never> }> {
  const { rows } = await q<LigneGroupe>(
    `SELECT o.id::text, o.locataire_id::text, o.lot_id::text, o.sortie::text, p.recu_le::text, p.date_max::text
       FROM gestion_annuaire_occupation o
       LEFT JOIN gestion_location_preavis p ON p.occupation_id = o.id AND p.remplace_le IS NULL AND p.annule_le IS NULL
      WHERE o.id = ANY($1::bigint[]) ORDER BY o.id FOR UPDATE OF o`, [ids]);
  if (rows.length !== ids.length) return { ok: false, issue: { etat: 'inconnu' } };
  if (rows.some((r) => r.sortie !== null)) return { ok: false, issue: { etat: 'refus', motif: 'Un des locataires est déjà sorti : rechargez la page.' } };
  if (rows.some((r) => r.recu_le === null || r.date_max === null)) return { ok: false, issue: { etat: 'refus', motif: 'Un des locataires n’est plus en préavis : rechargez la page.' } };
  if (new Set(rows.map((r) => r.lot_id)).size !== 1) return { ok: false, issue: { etat: 'refus', motif: 'Ces locataires n’occupent pas le même logement.' } };
  return { ok: true, lignes: rows, lotId: Number(rows[0].lot_id) };
}

type LienOuvert = { id: string; tache_id: string; etat: string; jour: string; heure: string | null; duree: number | null; confiee_a: string | null;
  confiee_a_libelle: string; objet: string; note: string | null; rappels: unknown; evenement_id: string | null; statut: string | null };

/** Les liens ouverts de ces occupations, VERROUILLÉS, avec leur tâche et la demande de la personne à qui elle est confiée. */
async function liensOuverts(q: RequeteTx, ids: readonly number[]): Promise<LienOuvert[]> {
  const duree = (await colonneExisteMemo('gestion_tache', 'duree_minutes')) ? 't.duree_minutes' : 'NULL::int';
  const demande = await colonneExisteMemo('gestion_tache_demande', 'statut');
  const { rows } = await q<LienOuvert>(
    `SELECT e.id::text, e.tache_id::text, t.etat, to_char(t.jour, 'YYYY-MM-DD') AS jour, to_char(t.heure, 'HH24:MI') AS heure,
            ${duree} AS duree, t.confiee_a::text, t.confiee_a_libelle, t.objet, t.note, t.rappels, t.evenement_id::text,
            ${demande ? `(SELECT d.statut FROM gestion_tache_demande d WHERE d.tache_id = t.id AND d.statut <> 'remplacee'
               ORDER BY (d.destinataire_id IS NOT DISTINCT FROM t.confiee_a) DESC, d.id DESC LIMIT 1)` : 'NULL::text'} AS statut
       FROM gestion_location_edls e JOIN gestion_tache t ON t.id = e.tache_id
      WHERE e.clos_le IS NULL AND e.occupation_ids && $1::bigint[]
      ORDER BY e.id FOR UPDATE OF e`, [ids]);
  return rows;
}

/** Le récapitulatif de la mission, écrit dans la note de la tâche (et donc dans le mail de la tâche). */
async function recapitulatif(ids: readonly number[], lignes: readonly LigneGroupe[], commentaire: string | null): Promise<string> {
  const e = await encartDuBail(ids[0]);
  const acces = e === null ? [] : lignesEncart(e).filter((l) => ['batiment', 'escalier', 'etage', 'porte', 'acces', 'digicode', 'ascenseur'].includes(l.cle))
    .map((l) => ({ libelle: l.libelle, valeur: l.valeur }));
  const coords = e?.coordonnees;
  const sortants = (coords?.locataires ?? []).filter((l) => ids.includes(l.occupationId));
  const recu = lignes.map((l) => l.recu_le as string).sort().pop() as string;
  const fin = lignes.map((l) => l.date_max as string).sort().pop() as string;
  return texteRecapEdls({
    adresse: e?.adresse ?? null, acces,
    lots: e === null ? [] : e.lots.map(libelleLotEncart),
    proprietaires: e?.proprietaire ? [{ nom: e.proprietaire.nom, telephones: coords?.proprietaire?.telephones ?? [], emails: coords?.proprietaire?.emails ?? [] }] : [],
    locataires: sortants.map((l) => ({ nom: l.nom, telephones: l.telephones, emails: l.emails })),
    preavis: { recuLe: recu, dateMax: fin }, commentaire,
  });
}

const groupePreavis = (lignes: readonly LigneGroupe[]) => lignes.map((l) => ({ recuLe: l.recu_le as string, dateMax: l.date_max as string }));
const plage = (jour: string, heure: string | null, duree: number | null): string => `${jour}${heure === null ? '' : ` ${heure} (${duree ?? 60} min)`}`;
const refusTache = (r: Extract<IssueTache, { ok: false }>): IssueEdls<never> => ({ etat: 'refus', motif: r.motif, champ: r.champ === 'confieeA' ? 'confieA' : (r.champ ?? null) });

/** PLANIFIER L'EDLS d'un préavis : la tâche (rendez-vous) confiée, le lien, la date sur l'occupation, le journal. */
export async function planifierEdls(
  d: { occupationIds: readonly number[]; jour: string; debut: string; fin: string; confieA: number | null; commentaire: string | null },
  auteur: Auteur,
): Promise<IssueEdls<{ edlsId: number }>> {
  if (!(await edlsDisponible())) return { etat: 'sans_schema' };
  const ids = [...new Set(d.occupationIds)];
  if (ids.length === 0) return { etat: 'refus', motif: 'Demande incomplète.' };
  // ① LIRE (verrouillé) → REFUSER, avant toute écriture.
  const avant = await withTransaction(async (q) => {
    const g = await lireGroupe(q, ids);
    if (!g.ok) return g;
    if ((await liensOuverts(q, ids)).some((l) => l.etat === 'a_faire')) {
      return { ok: false as const, issue: { etat: 'refus' as const, motif: 'Un état des lieux de sortie est déjà planifié pour ce préavis : déplacez-le.' } };
    }
    return g;
  });
  if (!avant.ok) return avant.issue;
  const v = verifierPlanification({ jour: d.jour, debut: d.debut, fin: d.fin, confieA: d.confieA, commentaire: d.commentaire }, groupePreavis(avant.lignes));
  if (!v.ok) return { etat: 'refus', motif: v.motif, champ: v.champ };
  if (!(await confiablesEdls(auteur.id)).some((c) => Number(c.id) === Number(d.confieA))) {
    return { etat: 'refus', motif: 'Cette personne n’a pas accès aux tuiles Location et Gestion avec une adresse de notre Workspace.', champ: 'confieA' };
  }
  // ② LA TÂCHE, par le module de tâches (sa transaction, sa demande, ses traces).
  const saisie: SaisieTache = {
    objet: OBJET_TACHE_EDLS, jour: v.jour, heure: v.heure, dureeMinutes: v.dureeMinutes,
    note: await recapitulatif(ids, avant.lignes, v.commentaire), confieeA: d.confieA, evenementId: null, rappels: rappelsParDefaut(true),
  };
  const t = await creerTache(avant.lotId, saisie, auteur);
  if (!t.ok) return refusTache(t);
  // ③ LE LIEN, relu sous verrou : un autre EDLS arrivé entre-temps ⇒ la tâche créée est annulée, le geste refusé.
  const lien = await withTransaction(async (q) => {
    const g = await lireGroupe(q, ids);
    if (!g.ok) return { ok: false as const, issue: g.issue };
    const ouverts = await liensOuverts(q, ids);
    if (ouverts.some((l) => l.etat === 'a_faire')) {
      return { ok: false as const, issue: { etat: 'refus' as const, motif: 'Un état des lieux de sortie vient d’être planifié par quelqu’un d’autre pour ce préavis.' } };
    }
    // Les liens dont la tâche est annulée ou faite se CLOSENT (jamais effacés) : un seul EDLS ouvert par préavis.
    for (const l of ouverts) {
      await q(`UPDATE gestion_location_edls SET clos_le = now(), clos_motif = $2, clos_par_libelle = $3 WHERE id = $1`,
        [Number(l.id), `tâche ${l.etat === 'faite' ? 'faite' : 'annulée'} — nouvel EDLS planifié`, auteur.libelle]);
    }
    const { rows } = await q<{ id: number }>(
      `INSERT INTO gestion_location_edls (tache_id, lot_id, occupation_ids, commentaire, cree_par, cree_par_libelle)
       VALUES ($1, $2, $3::bigint[], $4, $5, $6) RETURNING id::int AS id`,
      [t.id, g.lotId, ids, v.commentaire, auteur.id, auteur.libelle]);
    await q('UPDATE gestion_annuaire_occupation SET etat_des_lieux_prevu_le = $2::date WHERE id = ANY($1::bigint[]) AND sortie IS NULL', [ids, v.jour]);
    for (const r of g.lignes) {
      await journaliser(q, Number(r.locataire_id), 'location_edls_planifie', null, plage(v.jour, v.heure, v.dureeMinutes),
        `état des lieux de sortie planifié le ${plage(v.jour, v.heure, v.dureeMinutes)} — tâche ${t.id} — occupation ${r.id}`, auteur);
    }
    return { ok: true as const, id: Number(rows[0].id) };
  });
  if (!lien.ok) {
    await annulerTache(t.id, auteur);
    return lien.issue;
  }
  return { etat: 'ok', data: { edlsId: lien.id }, tacheId: t.id, demande: t.demande, demandes: t.demandes };
}

/** La tâche ouverte de l'EDLS de ces occupations, sous verrou, ou le refus. */
async function edlsCourant(q: RequeteTx, ids: readonly number[]): Promise<{ ok: true; g: { lignes: LigneGroupe[]; lotId: number }; l: LienOuvert } | { ok: false; issue: IssueEdls<never> }> {
  const g = await lireGroupe(q, ids);
  if (!g.ok) return g;
  const l = (await liensOuverts(q, ids)).find((x) => x.etat === 'a_faire');
  if (l === undefined) return { ok: false, issue: { etat: 'refus', motif: 'Aucun état des lieux de sortie n’est planifié pour ce préavis.' } };
  return { ok: true, g, l };
}

const saisieDeLaTache = (l: LienOuvert, o: { jour: string; heure: string; dureeMinutes: number; confieeA: number }): SaisieTache => ({
  objet: l.objet, note: l.note, jour: o.jour, heure: o.heure, dureeMinutes: o.dureeMinutes, confieeA: o.confieeA,
  evenementId: l.evenement_id === null ? null : Number(l.evenement_id),
  rappels: Array.isArray(l.rappels) ? (l.rappels as SaisieTache['rappels']) : rappelsParDefaut(true),
});

/**
 * DÉPLACER LE RENDEZ-VOUS : nouvelle date et plage, et éventuellement une autre personne. La tâche repasse « en attente de
 * confirmation » (le module de tâches relance la demande), l'agenda suit (route), un NOUVEAU mail part (« Rendez-vous
 * déplacé — … ») ; le déplacement est tracé par la tâche ET au journal de la Gestion (ancienne et nouvelle plage, auteur).
 */
export async function deplacerEdls(
  d: { occupationIds: readonly number[]; jour: string; debut: string; fin: string; confieA?: number | null },
  auteur: Auteur,
): Promise<IssueEdls<{ tacheId: number }>> {
  if (!(await edlsDisponible())) return { etat: 'sans_schema' };
  const ids = [...new Set(d.occupationIds)];
  if (ids.length === 0) return { etat: 'refus', motif: 'Demande incomplète.' };
  const avant = await withTransaction(async (q) => edlsCourant(q, ids));
  if (!avant.ok) return avant.issue;
  const l = avant.l;
  const confieA = d.confieA ?? (l.confiee_a === null ? null : Number(l.confiee_a));
  const v = verifierPlanification({ jour: d.jour, debut: d.debut, fin: d.fin, confieA, commentaire: null }, groupePreavis(avant.g.lignes));
  if (!v.ok) return { etat: 'refus', motif: v.motif, champ: v.champ };
  const autrePersonne = l.confiee_a === null || Number(l.confiee_a) !== Number(confieA);
  if (autrePersonne && !(await confiablesEdls(auteur.id)).some((c) => Number(c.id) === Number(confieA))) {
    return { etat: 'refus', motif: 'Cette personne n’a pas accès aux tuiles Location et Gestion avec une adresse de notre Workspace.', champ: 'confieA' };
  }
  if (!autrePersonne && v.jour === l.jour && v.heure === l.heure && v.dureeMinutes === (l.duree ?? 60)) {
    return { etat: 'refus', motif: 'Le rendez-vous est déjà à cette date et à cette heure.' };
  }
  const tacheId = Number(l.tache_id);
  const t = autrePersonne
    ? await modifierTache(tacheId, saisieDeLaTache(l, { jour: v.jour, heure: v.heure, dureeMinutes: v.dureeMinutes, confieeA: confieA as number }), auteur)
    : await decalerTache(tacheId, { jour: v.jour, heure: v.heure, dureeMinutes: v.dureeMinutes }, auteur);
  if (!t.ok) return refusTache(t);
  /* La même personne garde le rendez-vous : son mail est celui d'un DÉPLACEMENT (« Rendez-vous déplacé — … »). Le module de
     tâches porte l'ancienne date avec les invités (migration 365) ; sans eux, on la lui donne ici. */
  const ancienneDate = { jour: l.jour, heure: l.heure, dureeMinutes: l.duree };
  const avecAncienne = (x: DemandePosee | null | undefined): DemandePosee | null | undefined =>
    (x && !autrePersonne && x.ancienneDate === undefined && (v.jour !== l.jour || v.heure !== l.heure) ? { ...x, ancienneDate } : x);
  await withTransaction(async (q) => {
    await q('UPDATE gestion_annuaire_occupation SET etat_des_lieux_prevu_le = $2::date WHERE id = ANY($1::bigint[]) AND sortie IS NULL', [ids, v.jour]);
    for (const r of avant.g.lignes) {
      await journaliser(q, Number(r.locataire_id), 'location_edls_deplace',
        `${plage(l.jour, l.heure, l.duree)} — ${l.confiee_a_libelle}`, `${plage(v.jour, v.heure, v.dureeMinutes)}${autrePersonne ? ' — autre personne' : ` — ${l.confiee_a_libelle}`}`,
        `état des lieux de sortie déplacé — tâche ${tacheId} — occupation ${r.id}`, auteur);
    }
  });
  return { etat: 'ok', data: { tacheId }, tacheId, demande: avecAncienne(t.demande), demandes: t.demandes?.map((x) => avecAncienne(x) as DemandePosee) };
}

/** APRÈS UN REFUS : confier l'EDLS à quelqu'un d'autre (nouveau cycle : nouvelle demande, nouveau mail). Rien n'est supprimé. */
export async function reattribuerEdls(d: { occupationIds: readonly number[]; confieA: number | null }, auteur: Auteur): Promise<IssueEdls<{ tacheId: number }>> {
  if (!(await edlsDisponible())) return { etat: 'sans_schema' };
  const ids = [...new Set(d.occupationIds)];
  if (ids.length === 0 || d.confieA === null) return { etat: 'refus', motif: 'Choisissez à qui confier l’état des lieux.', champ: 'confieA' };
  const avant = await withTransaction(async (q) => edlsCourant(q, ids));
  if (!avant.ok) return avant.issue;
  const l = avant.l;
  if (l.statut !== 'refusee') return { etat: 'refus', motif: 'Cet état des lieux n’a pas été refusé : utilisez « Déplacer » pour changer de personne.' };
  if (!(await confiablesEdls(auteur.id)).some((c) => Number(c.id) === Number(d.confieA))) {
    return { etat: 'refus', motif: 'Cette personne n’a pas accès aux tuiles Location et Gestion avec une adresse de notre Workspace.', champ: 'confieA' };
  }
  const tacheId = Number(l.tache_id);
  const t = await modifierTache(tacheId, saisieDeLaTache(l, { jour: l.jour, heure: l.heure ?? '09:00', dureeMinutes: l.duree ?? 60, confieeA: d.confieA }), auteur);
  if (!t.ok) return refusTache(t);
  await withTransaction(async (q) => {
    for (const r of avant.g.lignes) {
      await journaliser(q, Number(r.locataire_id), 'location_edls_reattribue', l.confiee_a_libelle, String(d.confieA),
        `état des lieux de sortie réattribué après refus — tâche ${tacheId} — occupation ${r.id}`, auteur);
    }
  });
  return { etat: 'ok', data: { tacheId }, tacheId, demande: t.demande, demandes: t.demandes };
}

/** LES EDLS EN COURS de ces occupations (lecture seule), pour les lignes du bloc de l'accueil. */
export async function edlsDesOccupations(occupationIds: readonly number[]): Promise<{ occupationIds: number[]; edls: EdlsAffiche }[]> {
  if (occupationIds.length === 0 || !(await edlsDisponible())) return [];
  const duree = (await colonneExisteMemo('gestion_tache', 'duree_minutes')) ? 't.duree_minutes' : 'NULL::int';
  const demande = await colonneExisteMemo('gestion_tache_demande', 'statut');
  const { rows } = await query<{ id: string; tache_id: string; occupation_ids: string[]; jour: string; heure: string | null; duree: number | null;
    confiee_a: string | null; confiee_a_libelle: string; statut: string | null; repondu_par: string | null; motif: string | null }>(
    `SELECT e.id::text, e.tache_id::text, e.occupation_ids::text[] AS occupation_ids, to_char(t.jour, 'YYYY-MM-DD') AS jour,
            to_char(t.heure, 'HH24:MI') AS heure, ${duree} AS duree, t.confiee_a::text, t.confiee_a_libelle,
            ${demande ? 'd.statut, d.repondu_par_libelle AS repondu_par, d.motif' : 'NULL::text AS statut, NULL::text AS repondu_par, NULL::text AS motif'}
       FROM gestion_location_edls e JOIN gestion_tache t ON t.id = e.tache_id
       ${demande ? `LEFT JOIN LATERAL (SELECT d0.* FROM gestion_tache_demande d0 WHERE d0.tache_id = t.id AND d0.statut <> 'remplacee'
          ORDER BY (d0.destinataire_id IS NOT DISTINCT FROM t.confiee_a) DESC, d0.id DESC LIMIT 1) d ON true` : ''}
      WHERE e.clos_le IS NULL AND t.etat = 'a_faire' AND e.occupation_ids && $1::bigint[]
      ORDER BY e.id`, [[...occupationIds]]);
  return rows.map((r) => ({
    occupationIds: r.occupation_ids.map(Number),
    edls: {
      edlsId: Number(r.id), tacheId: Number(r.tache_id), jour: r.jour, heure: r.heure, dureeMinutes: r.duree === null ? null : Number(r.duree),
      confieA: r.confiee_a_libelle, confieAId: r.confiee_a === null ? null : Number(r.confiee_a),
      statut: r.statut === 'en_attente' || r.statut === 'acceptee' || r.statut === 'refusee' ? r.statut : null,
      reponduPar: r.repondu_par, motifRefus: r.motif,
    },
  }));
}
