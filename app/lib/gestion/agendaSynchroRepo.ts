import 'server-only';
import { query, withTransaction, type RequeteTx } from '../db/client';
import { acceptationTacheDisponible, agendaTacheDisponible } from './schema';
import { lireDomainesAutorises } from './comptesGoogleRepo';
import { lireDomaines } from './googleCollaborateur';
import { coordonneesLisibles, estFamille, texteCompletTache, type ContactSource } from './contactsTache';
import { motRappel, type EtatTache, type Rappel } from './taches';
import {
  agendaAffiche, agendaPourCarte, construireEvenement, delaiProchainEssaiMs, placeVoulue,
  type AgendaTache, type PlaceVoulue, type SynchroEtat,
} from './agendaTache';
import { creerPorteAgenda, type IssueAgenda, type PorteAgenda } from './agendaGoogle';
import { jetonAgendaPour } from './agendaDelegue';
import { creerFauxGoogle, jetonFactice, type FauxGoogle } from './agendaFauxGoogle';

/**
 * ══ 🔴🔴 LOT TACHES-AGENDA (lot 2) — LA SYNCHRONISATION D'UNE TÂCHE VERS L'AGENDA (migration 350) ═════════════════
 *
 * SENS UNIQUE : application → agenda. L'APPLICATION FAIT FOI, l'agenda en est une copie (le retour agenda →
 * application sera le lot 3).
 *
 * LE PRINCIPE : pas de « recette » par geste, une RÉCONCILIATION. À chaque geste, on calcule où la tâche DOIT être
 * (`placeVoulue`, règles 1-2-3) et on compare avec où elle EST (`google_agenda` + `google_evenement_id`) :
 *   · elle est dans un agenda où elle ne doit plus être (annulée, refusée, réattribuée, relancée) → suppression ;
 *   · elle doit être dans un agenda → modification de NOTRE événement s'il y est, création sinon ;
 *   · « faite » → l'événement reste, titre préfixé « ✓ ».
 * Créer, décaler, modifier, faire, annuler, rouvrir, accepter, refuser, réattribuer, ajouter une pièce, un contact :
 * tous passent par la même fonction, donc tous disent la même chose.
 *
 * 🔴 JAMAIS D'ÉCHEC SILENCIEUX : si Google échoue, la tâche reste enregistrée (le geste est déjà validé en base),
 * l'état passe « echec » avec son motif (« Agenda : à resynchroniser »), un bouton « Réessayer » l'affiche, et une
 * reprise automatique repasse plus tard (`reprendreSynchros`, délai croissant).
 *
 * 🔴 RÉGLAGE COUPÉ (défaut) : AUCUN appel à Google. Un geste sur une tâche qui a déjà un événement la marque « à
 * envoyer », pour que l'agenda soit remis d'aplomb à la réactivation ; une tâche sans événement reste muette.
 *
 * 🔴 GARDE-FOU : seuls NOS événements sont touchés — voir `agendaGoogle.ts` (verrou du fetch + relecture de la marque).
 * Chaque appel est consigné dans `gestion_tache_agenda_appel` (journal inaltérable).
 */

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE RÉGLAGE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export async function lireReglageAgenda(q: RequeteTx = query): Promise<boolean> {
  if (!(await agendaTacheDisponible())) return false;
  const { rows } = await q<{ a: boolean }>(`SELECT envoi_agenda AS a FROM gestion_tache_reglage WHERE id = 1`);
  return rows[0]?.a === true; // ligne absente : COUPÉ
}

export async function modifierReglageAgenda(actif: boolean, nom: string, auteurId: number | null): Promise<void> {
  await withTransaction(async (q) => {
    const avant = await lireReglageAgenda(q);
    await q(`UPDATE gestion_tache_reglage SET envoi_agenda = $1, modifie_le = now(), modifie_par_libelle = $2 WHERE id = 1`, [actif, nom]);
    console.info('[taches/agenda] envoi vers l’agenda Google : %s → %s, par %s (compte %s)', avant, actif, nom, auteurId ?? 'secours');
  });
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA PORTE : réelle en service, FAUSSE sous les tests (aucun appel réel pendant le développement et les tests)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

let fauxParDefaut: FauxGoogle | null = null;

/** Le faux Google de la porte par défaut sous les tests (pour l'inspecter). */
export function fauxGoogleDesTests(): FauxGoogle {
  fauxParDefaut ??= creerFauxGoogle();
  return fauxParDefaut;
}

export function porteParDefaut(env: Record<string, string | undefined> = process.env): PorteAgenda {
  if (env.VITEST || env.NODE_ENV === 'test') return creerPorteAgenda({ jeton: jetonFactice, fetch: fauxGoogleDesTests().fetch });
  return creerPorteAgenda({ jeton: (a) => jetonAgendaPour(a, { fetch }), fetch });
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   MARQUER « À SYNCHRONISER » — dans la transaction du geste
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * À appeler DANS la transaction d'un geste réussi. Incrémente la version (une synchronisation commencée avant ne
 * pourra pas se dire « à jour ») et pose « à envoyer » si le réglage est actif OU si un événement existe déjà.
 * Sans la migration 350 : rien (la tâche est celle d'avant le lot).
 */
export async function marquerASynchroniser(q: RequeteTx, tacheId: number): Promise<void> {
  if (!(await agendaTacheDisponible())) return;
  await q(
    `UPDATE gestion_tache SET synchro_version = synchro_version + 1, synchro_essais = 0, synchro_prochain_essai = NULL,
            synchro_erreur = CASE WHEN synchro_etat = 'echec' THEN synchro_erreur ELSE NULL END,
            synchro_etat = CASE
              WHEN (SELECT envoi_agenda FROM gestion_tache_reglage WHERE id = 1) OR google_evenement_id IS NOT NULL
              THEN 'a_envoyer' ELSE synchro_etat END
      WHERE id = $1`, [tacheId]);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA LECTURE D'UNE TÂCHE POUR L'AGENDA
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

interface LigneAgenda {
  id: number; etat: EtatTache; objet: string; note: string | null; jour: string; heure: string | null; rappels: Rappel[];
  duree_minutes: number | null; confiee_a: number | null; confiee_a_libelle: string; cree_par: number | null; lot_id: number;
  google_agenda: string | null; google_evenement_id: string | null; synchro_version: string; synchro_essais: number;
  synchro_etat: SynchroEtat; synchro_erreur: string | null;
  confiee_email: string | null; confiee_actif: boolean | null;
  adresse: string | null; code_postal: string | null; commune: string | null; acceptation: string | null;
}

async function lireLigne(q: RequeteTx, ids: readonly number[]): Promise<LigneAgenda[]> {
  const avecDemande = await acceptationTacheDisponible();
  const { rows } = await q<LigneAgenda>(
    `SELECT t.id::int AS id, t.etat, t.objet, t.note, to_char(t.jour, 'YYYY-MM-DD') AS jour, to_char(t.heure, 'HH24:MI') AS heure,
            t.rappels, t.duree_minutes, t.confiee_a::int AS confiee_a, t.confiee_a_libelle, t.cree_par::int AS cree_par,
            t.lot_id::int AS lot_id, t.google_agenda, t.google_evenement_id, t.synchro_version::text AS synchro_version,
            t.synchro_essais, t.synchro_etat, t.synchro_erreur,
            u.identifiant AS confiee_email, u.actif AS confiee_actif, l.adresse, l.code_postal, l.commune,
            ${avecDemande
              ? `(SELECT d.statut FROM gestion_tache_demande d WHERE d.tache_id = t.id AND d.statut <> 'remplacee' LIMIT 1)`
              : 'NULL::text'} AS acceptation
       FROM gestion_tache t
       JOIN gestion_annuaire_lot l ON l.id = t.lot_id
       LEFT JOIN admin_utilisateur u ON u.id = t.confiee_a
      WHERE t.id = ANY($1::bigint[])`, [ids]);
  return rows;
}

function place(r: LigneAgenda, domaines: readonly string[]): PlaceVoulue {
  const a = r.acceptation;
  return placeVoulue({
    etat: r.etat, confieeA: r.confiee_a, confieeEmail: r.confiee_email, confieeActif: r.confiee_actif === true,
    creePar: r.cree_par, acceptation: a === 'en_attente' || a === 'acceptee' || a === 'refusee' ? a : null,
  }, domaines);
}

const domainesWorkspace = async () => lireDomaines(await lireDomainesAutorises());

/**
 * LA DURÉE ET L'ÉTAT « AGENDA » DE CHAQUE TÂCHE, pour les listes et le détail. Une seule requête pour toute la liste.
 * Sans la migration 350 : une carte vide (aucune mention, aucune durée).
 */
export async function complementsAgenda(ids: readonly number[]): Promise<Map<number, { agenda: AgendaTache | null; agendaCarte: AgendaTache; dureeMinutes: number | null }>> {
  const m = new Map<number, { agenda: AgendaTache | null; agendaCarte: AgendaTache; dureeMinutes: number | null }>();
  if (ids.length === 0 || !(await agendaTacheDisponible())) return m;
  const [reglage, domaines, lignes] = await Promise.all([lireReglageAgenda(), domainesWorkspace(), lireLigne(query, ids)]);
  for (const r of lignes) {
    const e = {
      reglageActif: reglage, synchroEtat: r.synchro_etat, erreur: r.synchro_erreur, evenementId: r.google_evenement_id,
      place: place(r, domaines), confieeLibelle: r.confiee_a_libelle,
    };
    m.set(Number(r.id), {
      dureeMinutes: r.duree_minutes === null ? null : Number(r.duree_minutes),
      agenda: agendaAffiche(e),
      // 🔴 LOT FICHE-CARTE-4-BLOCS — la mention TOUJOURS présente de la carte (fiche du bien).
      agendaCarte: agendaPourCarte(e),
    });
  }
  return m;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA SYNCHRONISATION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

async function journal(tacheId: number, operation: string, agenda: string, evenementId: string | null,
  issue: IssueAgenda<object> | { ok: true }, detail: string | null = null): Promise<void> {
  const resultat = issue.ok ? 'ok' : issue.sorte;
  const motif = issue.ok ? detail : 'motif' in issue ? issue.motif : detail;
  await query(
    `INSERT INTO gestion_tache_agenda_appel (tache_id, operation, agenda, evenement_id, resultat, detail)
     VALUES ($1, $2, $3, $4, $5, $6)`, [tacheId, operation, agenda, evenementId, resultat, motif]).catch((e) => {
    console.error('[taches/agenda] journal des appels impossible', e);
  });
}

async function contactsDe(tacheId: number): Promise<ContactSource[]> {
  const { rows } = await query<{ cle: string; famille: string; nom: string; qualite: string | null; organisation: string | null;
    adresse: string | null; coordonnees: unknown }>(
    `SELECT cle, famille, nom, qualite, organisation, adresse, coordonnees FROM gestion_tache_contact
      WHERE tache_id = $1 AND retire_le IS NULL ORDER BY rang, id`, [tacheId]).catch(() => ({ rows: [] }));
  return rows.filter((r) => estFamille(r.famille)).map((r) => ({
    cle: r.cle, famille: r.famille as ContactSource['famille'], nom: r.nom, qualite: r.qualite, organisation: r.organisation,
    adresse: r.adresse, coordonnees: coordonneesLisibles(r.coordonnees),
  }));
}

async function piecesDe(tacheId: number) {
  const { rows } = await query<{ drive_fichier_id: string; nom: string; type_mime: string | null; lien: string | null }>(
    `SELECT drive_fichier_id, nom, type_mime, lien FROM gestion_tache_piece WHERE tache_id = $1 AND retire_le IS NULL ORDER BY id`,
    [tacheId]).catch(() => ({ rows: [] }));
  return rows.map((r) => ({ driveId: r.drive_fichier_id, nom: r.nom, typeMime: r.type_mime, lien: r.lien }));
}

export type IssueSynchro =
  | { etat: 'desactive' }
  | { etat: 'sans_schema' }
  | { etat: 'introuvable' }
  | { etat: 'ok'; place: PlaceVoulue }
  | { etat: 'echec'; motif: string };

/** Le verrou d'une tâche pendant sa synchronisation : deux gestes rapprochés ne créent jamais deux événements. */
const CLE_VERROU = 350_350;

/**
 * SYNCHRONISE UNE TÂCHE. Ne lève jamais : un échec se lit dans l'issue ET dans la base (« à resynchroniser »).
 */
export async function synchroniserTache(tacheId: number, o: { porte?: PorteAgenda; siteUrl?: string | null } = {}): Promise<IssueSynchro> {
  if (!(await agendaTacheDisponible())) return { etat: 'sans_schema' };
  if (!(await lireReglageAgenda())) return { etat: 'desactive' };
  const porte = o.porte ?? porteParDefaut();
  const siteUrl = o.siteUrl ?? process.env.SITE_URL ?? null;
  try {
    return await withTransaction(async (q) => {
      await q(`SELECT pg_advisory_xact_lock($1, $2)`, [CLE_VERROU, tacheId]);
      const r = (await lireLigne(q, [tacheId]))[0];
      if (r === undefined) return { etat: 'introuvable' } as const;
      const voulu = place(r, await domainesWorkspace());
      let actuel: { agenda: string; id: string } | null =
        r.google_agenda && r.google_evenement_id ? { agenda: r.google_agenda, id: r.google_evenement_id } : null;
      const avaitUnEvenement = actuel !== null;

      const echouer = async (motif: string): Promise<IssueSynchro> => {
        const essais = Number(r.synchro_essais ?? 0) + 1;
        await q(
          `UPDATE gestion_tache SET synchro_etat = 'echec', synchro_erreur = $2, synchro_le = now(), synchro_essais = $3,
                  synchro_prochain_essai = now() + ($4::bigint * interval '1 millisecond'),
                  google_agenda = $5, google_evenement_id = $6
            WHERE id = $1`, [tacheId, motif.slice(0, 500), essais, delaiProchainEssaiMs(essais - 1), actuel?.agenda ?? null, actuel?.id ?? null]);
        return { etat: 'echec', motif };
      };

      // ① RETIRER de l'agenda où elle ne doit plus être.
      if (actuel !== null && (voulu.sorte === 'absent' || voulu.agenda !== actuel.agenda.toLowerCase())) {
        const s = await porte.supprimer(actuel.agenda, actuel.id, tacheId);
        await journal(tacheId, 'suppression', actuel.agenda, actuel.id, s);
        if (!s.ok && s.sorte === 'echec') return echouer(s.motif);
        // ok, déjà absent, ou ÉTRANGER (refus_garde : on n'y a pas touché) → on oublie la référence.
        actuel = null;
      }

      // ② POSER dans l'agenda où elle doit être.
      if (voulu.sorte === 'present') {
        const ev = construireEvenement({
          id: tacheId, objet: r.objet, texte: texteCompletTache(r.note, await contactsDe(tacheId)), jour: r.jour, heure: r.heure,
          dureeMinutes: r.duree_minutes, rappels: Array.isArray(r.rappels) ? r.rappels : [], faite: voulu.faite, lotId: Number(r.lot_id),
          adresse: r.adresse, codePostal: r.code_postal, commune: r.commune, pieces: await piecesDe(tacheId),
        }, { siteUrl, motRappel });
        if (actuel !== null) {
          const m = await porte.modifier(actuel.agenda, actuel.id, tacheId, ev);
          await journal(tacheId, 'modification', actuel.agenda, actuel.id, m);
          if (!m.ok && m.sorte === 'echec') return echouer(m.motif);
          if (!m.ok) actuel = null; // disparu dans Google, ou étranger : on recrée le nôtre
        }
        if (actuel === null) {
          // Idempotence : un événement déjà créé pour cette tâche (réponse de Google perdue) est REPRIS, pas doublé.
          const c = await porte.chercher(voulu.agenda, tacheId);
          await journal(tacheId, 'recherche', voulu.agenda, null, c, c.ok ? `${c.ids.length} trouvé(s)` : null);
          if (!c.ok) return echouer(c.sorte === 'echec' ? c.motif : 'Recherche impossible dans l’agenda.');
          for (const id of c.ids) {
            if (actuel === null) {
              const m = await porte.modifier(voulu.agenda, id, tacheId, ev);
              await journal(tacheId, 'modification', voulu.agenda, id, m);
              if (!m.ok && m.sorte === 'echec') return echouer(m.motif);
              if (m.ok) actuel = { agenda: voulu.agenda, id };
            } else {
              // Un DOUBLON de NOTRE événement (même marque, même tâche) : retiré.
              const s = await porte.supprimer(voulu.agenda, id, tacheId);
              await journal(tacheId, 'suppression', voulu.agenda, id, s, 'doublon');
            }
          }
          if (actuel === null) {
            const n = await porte.creer(voulu.agenda, tacheId, ev);
            await journal(tacheId, 'creation', voulu.agenda, n.ok ? n.id : null, n);
            if (!n.ok) return echouer(n.sorte === 'echec' ? n.motif : 'Création refusée.');
            actuel = { agenda: voulu.agenda, id: n.id };
          }
        }
      }

      // ③ L'ÉTAT. Un geste survenu PENDANT la synchronisation (version changée) la laisse « à envoyer ».
      const final: SynchroEtat = voulu.sorte === 'present' ? 'envoyee' : avaitUnEvenement ? 'retiree' : r.synchro_etat === 'retiree' ? 'retiree' : 'non_demandee';
      await q(
        `UPDATE gestion_tache SET google_agenda = $2, google_evenement_id = $3, synchro_le = now(), synchro_erreur = NULL,
                synchro_essais = 0, synchro_prochain_essai = NULL,
                synchro_etat = CASE WHEN synchro_version = $4::bigint THEN $5 ELSE 'a_envoyer' END
          WHERE id = $1`, [tacheId, actuel?.agenda ?? null, actuel?.id ?? null, r.synchro_version, final]);
      return { etat: 'ok', place: voulu };
    });
  } catch (e) {
    // Une exception (dont un refus du VERROU, qui serait un défaut du code) : la tâche le dit, rien n'est perdu.
    const motif = e instanceof Error ? e.message.slice(0, 300) : 'erreur inconnue';
    console.error('[taches/agenda] synchronisation impossible', tacheId, e);
    await query(
      `UPDATE gestion_tache SET synchro_etat = 'echec', synchro_erreur = $2, synchro_le = now(), synchro_essais = synchro_essais + 1,
              synchro_prochain_essai = now() + interval '5 minutes' WHERE id = $1`, [tacheId, motif]).catch(() => {});
    return { etat: 'echec', motif };
  }
}

/** La phrase ajoutée au message d'un geste. `''` quand le réglage est coupé (rien n'a été promis). PUR. */
export function phraseSynchro(s: IssueSynchro): string {
  if (s.etat === 'echec') return ` Agenda : à resynchroniser (${s.motif}).`;
  if (s.etat !== 'ok') return '';
  if (s.place.sorte === 'present') return ' Agenda Google à jour.';
  if (s.place.raison === 'hors_workspace') return ' Pas d’agenda Google pour cette personne.';
  if (s.place.raison === 'en_attente') return ' Elle entrera dans l’agenda après acceptation.';
  return '';
}

/** Après un geste réussi : synchroniser, sans jamais faire échouer le geste. */
export async function synchroniserApresGeste(tacheId: number | null | undefined): Promise<string> {
  if (tacheId === null || tacheId === undefined) return '';
  try {
    return phraseSynchro(await synchroniserTache(Number(tacheId)));
  } catch {
    return ' Agenda : à resynchroniser.';
  }
}

/** « RÉESSAYER » : la tâche repasse « à envoyer », et l'on synchronise tout de suite. */
export async function reessayerSynchro(tacheId: number): Promise<IssueSynchro> {
  if (!(await agendaTacheDisponible())) return { etat: 'sans_schema' };
  if (!(await lireReglageAgenda())) return { etat: 'desactive' };
  await withTransaction((q) => marquerASynchroniser(q, tacheId));
  return synchroniserTache(tacheId);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA REPRISE AUTOMATIQUE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Les tâches à (re)envoyer dont le délai est passé, synchronisées une à une. Rend combien ont été tentées. */
export async function reprendreSynchros(o: { limite?: number; porte?: PorteAgenda } = {}): Promise<{ tentees: number; echecs: number }> {
  if (!(await agendaTacheDisponible()) || !(await lireReglageAgenda())) return { tentees: 0, echecs: 0 };
  const { rows } = await query<{ id: number }>(
    `SELECT id::int AS id FROM gestion_tache
      WHERE synchro_etat IN ('a_envoyer', 'echec') AND (synchro_prochain_essai IS NULL OR synchro_prochain_essai <= now())
      ORDER BY coalesce(synchro_prochain_essai, maj_le), id LIMIT $1`, [o.limite ?? 20]);
  let echecs = 0;
  for (const r of rows) {
    const s = await synchroniserTache(Number(r.id), { porte: o.porte });
    if (s.etat === 'echec') echecs += 1;
  }
  return { tentees: rows.length, echecs };
}

let derniereReprise = 0;
let repriseEnCours = false;
const INTERVALLE_REPRISE_MS = 2 * 60_000;

/**
 * LA REPRISE « PLUS TARD », SANS DÉMON : à chaque lecture des tâches, au plus une fois toutes les 2 minutes, en
 * arrière-plan (la lecture n'attend pas). Le démon de relève n'est pas touché.
 */
export function declencherReprise(maintenant: number = Date.now()): void {
  if (repriseEnCours || maintenant - derniereReprise < INTERVALLE_REPRISE_MS) return;
  derniereReprise = maintenant;
  repriseEnCours = true;
  void reprendreSynchros().catch((e) => console.error('[taches/agenda] reprise impossible', e))
    .finally(() => { repriseEnCours = false; });
}
