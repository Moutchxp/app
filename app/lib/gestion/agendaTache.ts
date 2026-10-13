/**
 * ══ 🔴🔴 LOT TACHES-AGENDA (lot 2) — LA RÈGLE UNIQUE DE L'ENVOI D'UNE TÂCHE DANS L'AGENDA GOOGLE ═════════════════
 *
 * RÈGLE D'ARNO (13/10/2026) :
 *   1. confiée À SOI-MÊME (créateur = personne confiée) : dans son agenda Google DÈS SA CRÉATION ;
 *   2. confiée à un COLLÈGUE : dans son agenda SEULEMENT APRÈS SON ACCEPTATION — rien tant qu'elle est « En attente »
 *      ou « Refusée ». (Conséquence assumée : changer la date ou l'heure d'une tâche confiée à un collègue relance sa
 *      demande — lot ACCEPTATION — et l'événement quitte son agenda jusqu'à la nouvelle acceptation.)
 *   3. comptes de NOTRE Workspace seulement ; sinon « pas d'agenda Google », la tâche reste dans l'application.
 *
 * L'ÉVÉNEMENT (décisions d'Arno) :
 *   · dans l'agenda PRINCIPAL de la personne confiée (`calendarId` = son adresse) ;
 *   · titre « Gestion — <adresse courte du bien> — <objet> » ; jamais de n° de lot, jamais de nom de locataire ;
 *     « ✓ » devant quand la tâche est faite ;
 *   · PRIVÉ (les collègues ne voient que « Occupé ») ; lieu = adresse complète du bien ;
 *   · avec heure : rendez-vous, 1 h par défaut (champ « Durée ») ; sans heure : journée entière ;
 *   · description : note + bloc Contacts + lien vers la fiche du bien ; pièces Drive attachées ;
 *   · rappels de la tâche convertis en notifications Google (« le jour même » d'une journée → « la veille à 17 h » ;
 *     jamais les notifications par défaut de l'agenda).
 *
 * 🔴🔴 GARDE-FOU ABSOLU : l'application ne crée, ne modifie et ne supprime QUE les événements qu'ELLE a créés. Chacun
 * porte, en propriété PRIVÉE (invisible des invités, propre à l'application), la marque `MARQUE_APPLICATION` et le
 * numéro de la tâche. `estNotreEvenement` est LA vérification : rien n'est modifié ni supprimé sans elle (voir
 * `agendaGoogle.ts`, où elle est appliquée AVANT tout envoi, et `fetchAgendaGarde`, qui refuse toute autre adresse).
 *
 * PUR : aucune base, aucun réseau. Chargeable dans le navigateur.
 */
import { ajouterJours, dureeValide, estHeureValide, type EtatTache, type Rappel } from './taches';
import { peutRecevoirUneTache } from './taches';

/** La marque privée de l'application, posée sur chaque événement qu'elle crée. Ne JAMAIS la changer : les événements
 *  déjà créés ne seraient plus reconnus, donc plus jamais mis à jour ni retirés. */
export const MARQUE_APPLICATION = 'svav-gestion-tache';
export const CLE_MARQUE = 'svavApp';
export const CLE_TACHE = 'svavTacheId';

export const FUSEAU_AGENDA = 'Europe/Paris';
/** Durée d'un rendez-vous quand rien n'est choisi (Arno : « 1 h par défaut »). */
export const DUREE_DEFAUT_MINUTES = 60;
/** Les durées proposées dans la fenêtre. */
export const DUREES_PROPOSEES: readonly number[] = [15, 30, 45, 60, 90, 120, 180, 240];

/** « 1 h », « 1 h 30 », « 45 min ». PUR. */
export function motDuree(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** Une durée venue du navigateur (règle dans `taches.ts`, pour que la saisie la lise sans détour). */
export { dureeValide };

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① OÙ LA TÂCHE DOIT-ELLE ÊTRE ? — les règles 1, 2, 3
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export type RaisonAbsence = 'annulee' | 'en_attente' | 'refusee' | 'hors_workspace' | 'sans_personne';

export type PlaceVoulue =
  | { sorte: 'present'; agenda: string; faite: boolean }
  | { sorte: 'absent'; raison: RaisonAbsence };

export interface EtatPourAgenda {
  etat: EtatTache;
  confieeA: number | null;
  /** L'adresse de connexion de la personne confiée, relue EN BASE (jamais reçue du navigateur). */
  confieeEmail: string | null;
  /** Le compte de la personne confiée est-il actif ? */
  confieeActif: boolean;
  creePar: number | null;
  /** Le statut de la demande d'acceptation COURANTE ; `null` = pas de demande (tâche d'avant l'acceptation). */
  acceptation: 'en_attente' | 'acceptee' | 'refusee' | null;
}

/**
 * OÙ LA TÂCHE DOIT VIVRE DANS LES AGENDAS. L'application fait foi : l'agenda en est une copie.
 *   · annulée → nulle part ; faite → reste, avec « ✓ » ;
 *   · personne hors de notre Workspace (ou compte inactif) → nulle part : « pas d'agenda Google » ;
 *   · acceptée (d'office quand on se la confie, ou par le collègue) → dans l'agenda de la personne ;
 *   · en attente ou refusée → nulle part.
 * Sans demande (tâche d'avant le lot ACCEPTATION) : la règle 1 directement (créateur = personne confiée). PUR.
 */
export function placeVoulue(t: EtatPourAgenda, domaines: readonly string[]): PlaceVoulue {
  if (t.etat === 'annulee') return { sorte: 'absent', raison: 'annulee' };
  if (t.confieeA === null) return { sorte: 'absent', raison: 'sans_personne' };
  if (!peutRecevoirUneTache({ actif: t.confieeActif, identifiant: t.confieeEmail }, domaines)) {
    return { sorte: 'absent', raison: 'hors_workspace' };
  }
  const acceptee = t.acceptation === null
    ? t.creePar !== null && Number(t.creePar) === Number(t.confieeA)
    : t.acceptation === 'acceptee';
  if (!acceptee) return { sorte: 'absent', raison: t.acceptation === 'refusee' ? 'refusee' : 'en_attente' };
  return { sorte: 'present', agenda: (t.confieeEmail ?? '').trim().toLowerCase(), faite: t.etat === 'faite' };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② L'ÉVÉNEMENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Ce que l'événement dit, lu par le dépôt. */
export interface ContenuTache {
  id: number;
  objet: string;
  /** Le texte complet : note + bloc Contacts (`texteCompletTache`). */
  texte: string;
  jour: string;
  heure: string | null;
  dureeMinutes: number | null;
  rappels: Rappel[];
  faite: boolean;
  lotId: number;
  adresse: string | null;
  codePostal: string | null;
  commune: string | null;
  pieces: { driveId: string; nom: string; typeMime: string | null; lien: string | null }[];
}

/** La ressource « événement » de l'API Agenda, dans la seule forme que l'application écrit. */
export interface EvenementGoogle {
  summary: string;
  location?: string;
  description: string;
  visibility: 'private';
  start: { date: string } | { dateTime: string; timeZone: string };
  end: { date: string } | { dateTime: string; timeZone: string };
  reminders: { useDefault: boolean; overrides?: { method: 'popup'; minutes: number }[] };
  attachments?: { fileUrl: string; title: string; mimeType?: string; fileId?: string }[];
  extendedProperties: { private: Record<string, string> };
}

/** « 7 avenue de l'Union » — la rue seule ; à défaut, la commune ; jamais un numéro de lot. PUR. */
export function adresseCourte(adresse: string | null, commune: string | null): string {
  const a = (adresse ?? '').trim();
  if (a !== '') return a;
  const c = (commune ?? '').trim();
  return c !== '' ? c : 'Adresse non renseignée';
}

/** « 7 avenue de l'Union, 92600 Asnières-sur-Seine » — le lieu de l'événement. `null` si rien n'est connu. PUR. */
export function adresseComplete(adresse: string | null, codePostal: string | null, commune: string | null): string | null {
  const ville = [codePostal, commune].map((x) => (x ?? '').trim()).filter((x) => x !== '').join(' ');
  const bouts = [(adresse ?? '').trim(), ville].filter((x) => x !== '');
  return bouts.length === 0 ? null : bouts.join(', ');
}

export const PREFIXE_FAITE = '✓ ';

/** Le titre : « Gestion — 7 avenue de l'Union — Visite », « ✓ » devant quand elle est faite. PUR. */
export function titreEvenement(c: Pick<ContenuTache, 'objet' | 'adresse' | 'commune' | 'faite'>): string {
  const t = `Gestion — ${adresseCourte(c.adresse, c.commune)} — ${c.objet.trim()}`;
  return c.faite ? `${PREFIXE_FAITE}${t}` : t;
}

/** L'adresse de la fiche du bien dans l'application. `null` sans adresse de site (pas de lien mort). PUR. */
export function lienFicheBien(siteUrl: string | null | undefined, lotId: number): string | null {
  const base = (siteUrl ?? '').trim().replace(/\/+$/, '');
  if (base === '' || !Number.isSafeInteger(lotId) || lotId <= 0) return null;
  return `${base}/admin/gestion?ecran=annuaire&fiche=lot-${lotId}`;
}

/** « AAAA-MM-JJTHH:MM:00 » + N minutes, en heure LOCALE (le fuseau est donné à Google à côté). PUR. */
export function ajouterMinutesLocal(jour: string, heure: string, minutes: number): string {
  const [y, m, d] = jour.split('-').map(Number);
  const [hh, mm] = heure.split(':').map(Number);
  // Calcul sur des valeurs « murales » (UTC sert de calculette, aucun fuseau n'est appliqué) : Google interprète le
  //   résultat dans `FUSEAU_AGENDA`, donc un rendez-vous à cheval sur un changement d'heure garde sa durée murale.
  const x = new Date(Date.UTC(y, m - 1, d, hh, mm + minutes));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getUTCFullYear()}-${p(x.getUTCMonth() + 1)}-${p(x.getUTCDate())}T${p(x.getUTCHours())}:${p(x.getUTCMinutes())}:00`;
}

/**
 * 🔴 DÉCISION D'ARNO (13/10/2026, après l'essai réel) — sur une journée entière, « le jour même à HH:MM » devient une
 * notification Google « LA VEILLE À 17 H », et la description garde la mention « Rappel prévu dans l'application :
 * le jour même à 9 h ». (Google ne sait pas poser une notification après minuit du jour d'une journée entière.)
 */
export const VEILLE_DE_REMPLACEMENT = '17:00';

/**
 * LES RAPPELS EN NOTIFICATIONS GOOGLE. Google compte un rappel en minutes AVANT LE DÉBUT de l'événement, entre 0 et
 * 40 320 (4 semaines) ; pour une journée entière, le début est MINUIT du jour.
 *   · rendez-vous, « N min avant » → N ;
 *   · journée, « la veille à HH:MM » → minutes entre cette heure et minuit (17 h → 420) ;
 *   · journée, « le jour même à HH:MM » → IMPOSSIBLE à dire à Google : il devient « la veille à 17 h »
 *     (`VEILLE_DE_REMPLACEMENT`), et il est rendu dans `remplaces` pour que la description le dise.
 * 🔴 JAMAIS LES NOTIFICATIONS PAR DÉFAUT DE L'AGENDA (`useDefault` toujours faux, décision d'Arno : « La veille à
 * 23:50 », inutile) : aucun rappel choisi ⇒ aucune notification. PUR.
 */
export function rappelsGoogle(rappels: readonly Rappel[], avecHeure: boolean):
  { reminders: EvenementGoogle['reminders']; remplaces: Rappel[] } {
  const minutes: number[] = [];
  const remplaces: Rappel[] = [];
  const veille = (heure: string) => { const [h, m] = heure.split(':').map(Number); return 1440 - (h * 60 + m); };
  for (const r of rappels) {
    if (r.sorte === 'avant' && avecHeure && r.minutes >= 0 && r.minutes <= 40_320) minutes.push(r.minutes);
    else if (r.sorte === 'veille' && !avecHeure && estHeureValide(r.heure)) minutes.push(veille(r.heure));
    else if (r.sorte === 'jour' && !avecHeure && estHeureValide(r.heure)) {
      minutes.push(veille(VEILLE_DE_REMPLACEMENT));
      remplaces.push(r);
    }
  }
  const uniques = [...new Set(minutes)].sort((a, b) => a - b).slice(0, 5);
  return {
    reminders: { useDefault: false, overrides: uniques.map((n) => ({ method: 'popup' as const, minutes: n })) },
    remplaces,
  };
}

/** « le jour même à 9 h » : le mot du rappel, première lettre en minuscule, dans une phrase. PUR. */
const dansLaPhrase = (mot: string) => mot.charAt(0).toLowerCase() + mot.slice(1);

/** Une pièce Drive en pièce jointe d'événement : un LIEN vers le fichier, jamais une copie. PUR. */
function pieceJointe(p: ContenuTache['pieces'][number]): NonNullable<EvenementGoogle['attachments']>[number] {
  const fileUrl = (p.lien ?? '').trim() !== '' ? (p.lien ?? '').trim() : `https://drive.google.com/open?id=${encodeURIComponent(p.driveId)}`;
  return { fileUrl, title: p.nom, fileId: p.driveId, ...(p.typeMime ? { mimeType: p.typeMime } : {}) };
}

/** Les propriétés privées qui signent l'événement : la marque de l'application et le numéro de la tâche. PUR. */
export function marqueTache(tacheId: number): Record<string, string> {
  return { [CLE_MARQUE]: MARQUE_APPLICATION, [CLE_TACHE]: String(tacheId) };
}

/** L'ÉVÉNEMENT COMPLET d'une tâche. `motRappel` met en mots le rappel remplacé (« Le jour même à 9 h »). PUR. */
export function construireEvenement(c: ContenuTache, o: { siteUrl?: string | null; motRappel: (r: Rappel) => string }): EvenementGoogle {
  const avecHeure = c.heure !== null;
  const { reminders, remplaces } = rappelsGoogle(c.rappels, avecHeure);
  const lien = lienFicheBien(o.siteUrl, c.lotId);
  const blocs = [
    c.texte.trim(),
    remplaces.length > 0
      ? `Rappel prévu dans l’application : ${remplaces.map((r) => dansLaPhrase(o.motRappel(r))).join(', ')} (notification Google : la veille à 17 h).`
      : '',
    lien !== null ? `Fiche du bien : ${lien}` : '',
    'Créée depuis l’application Gestion. Pour la modifier, passez par l’application.',
  ].filter((x) => x !== '');
  const lieu = adresseComplete(c.adresse, c.codePostal, c.commune);
  const duree = c.dureeMinutes ?? DUREE_DEFAUT_MINUTES;
  return {
    summary: titreEvenement(c),
    ...(lieu !== null ? { location: lieu } : {}),
    description: blocs.join('\n\n'),
    visibility: 'private',
    start: avecHeure ? { dateTime: `${c.jour}T${c.heure}:00`, timeZone: FUSEAU_AGENDA } : { date: c.jour },
    // ⚠️ JOURNÉE ENTIÈRE : la fin est le LENDEMAIN (borne exclusive de Google).
    end: avecHeure ? { dateTime: ajouterMinutesLocal(c.jour, c.heure as string, duree), timeZone: FUSEAU_AGENDA } : { date: ajouterJours(c.jour, 1) },
    reminders,
    ...(c.pieces.length > 0 ? { attachments: c.pieces.slice(0, 25).map(pieceJointe) } : {}),
    extendedProperties: { private: marqueTache(c.id) },
  };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LE GARDE-FOU : EST-CE BIEN NOTRE ÉVÉNEMENT ?
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * 🔴🔴 UN ÉVÉNEMENT LU DANS UN AGENDA EST-IL CELUI QUE L'APPLICATION A CRÉÉ POUR CETTE TÂCHE ? Il faut la marque ET le
 * bon numéro de tâche, en propriété PRIVÉE (celle que seule l'application qui l'a posée voit). Tout le reste —
 * événement sans marque, marque d'une autre tâche, marque « partagée » — est un événement ÉTRANGER : on n'y touche
 * pas. PUR.
 */
export function estNotreEvenement(ev: unknown, tacheId: number): boolean {
  const p = (ev as { extendedProperties?: { private?: Record<string, unknown> } } | null)?.extendedProperties?.private;
  return p !== undefined && p !== null && p[CLE_MARQUE] === MARQUE_APPLICATION && p[CLE_TACHE] === String(tacheId);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ CE QUE L'ÉCRAN DIT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export type SynchroEtat = 'non_demandee' | 'a_envoyer' | 'envoyee' | 'echec' | 'a_retirer' | 'retiree';

export type EtatAgendaEcran = 'dans_agenda' | 'apres_acceptation' | 'a_resynchroniser' | 'en_cours' | 'sans_agenda_google'
  /** 🔴 LOT FICHE-CARTE-4-BLOCS — sur la carte seulement. */
  | 'pas_encore' | 'pas_dans_agenda';

/** L'état « Agenda » d'une tâche, tel qu'une ligne ou la fenêtre l'affiche. `null` = rien à dire. */
export interface AgendaTache { etat: EtatAgendaEcran; texte: string; motif: string | null; peutReessayer: boolean }

export const MENTION_SANS_AGENDA = 'pas d’agenda Google';

/**
 * LA MENTION « AGENDA » d'une tâche. Jamais d'échec silencieux : un envoi raté se lit « Agenda : à resynchroniser »
 * avec son motif, et propose « Réessayer ». Réglage coupé et aucun événement : on ne dit rien (rien n'a été promis).
 * PUR.
 */
export function agendaAffiche(o: {
  reglageActif: boolean; synchroEtat: SynchroEtat; erreur: string | null; evenementId: string | null;
  place: PlaceVoulue; confieeLibelle: string;
}): AgendaTache | null {
  if (o.place.sorte === 'absent' && o.place.raison === 'hors_workspace') {
    return { etat: 'sans_agenda_google', texte: MENTION_SANS_AGENDA, motif: null, peutReessayer: false };
  }
  if (o.synchroEtat === 'echec') {
    return { etat: 'a_resynchroniser', texte: 'Agenda : à resynchroniser', motif: o.erreur, peutReessayer: o.reglageActif };
  }
  if (!o.reglageActif && o.evenementId === null) return null;
  if (o.synchroEtat === 'a_envoyer') {
    return o.reglageActif
      ? { etat: 'en_cours', texte: 'Agenda : envoi en attente', motif: null, peutReessayer: true }
      : { etat: 'a_resynchroniser', texte: 'Agenda : à resynchroniser (envoi vers l’agenda désactivé)', motif: null, peutReessayer: false };
  }
  if (o.evenementId !== null && o.place.sorte === 'present') {
    return { etat: 'dans_agenda', texte: `📅 Dans l’agenda Google de ${o.confieeLibelle}`, motif: null, peutReessayer: false };
  }
  if (o.reglageActif && o.place.sorte === 'absent' && o.place.raison === 'en_attente') {
    return { etat: 'apres_acceptation', texte: 'Agenda : après acceptation', motif: null, peutReessayer: false };
  }
  return null;
}

/**
 * ══ 🔴🔴 LOT FICHE-CARTE-4-BLOCS (Arno, 13/10/2026) — SUR LA CARTE DE LA FICHE, L'AGENDA EST TOUJOURS DIT ═════════════
 * Les mêmes mentions que `agendaAffiche` (qui reste celle du récapitulatif, inchangée), plus ce qu'elle tait :
 *   · « Pas encore dans l'agenda » — la tâche devrait y être mais n'y est pas (créée avant l'activation) ; avec
 *     « Envoyer » quand l'envoi est actif (`peutReessayer` : la MÊME synchronisation que « Réessayer ») ;
 *   · « Agenda : après acceptation » même réglage coupé ;
 *   · « Pas dans l'agenda » — annulée, refusée, ou personne.
 * Ne rend jamais `null`. PUR.
 */
export function agendaPourCarte(o: Parameters<typeof agendaAffiche>[0]): AgendaTache {
  const a = agendaAffiche(o);
  if (a !== null) return a;
  if (o.place.sorte === 'absent' && o.place.raison === 'en_attente') {
    return { etat: 'apres_acceptation', texte: 'Agenda : après acceptation', motif: null, peutReessayer: false };
  }
  if (o.place.sorte === 'absent') return { etat: 'pas_dans_agenda', texte: 'Pas dans l’agenda', motif: null, peutReessayer: false };
  return o.reglageActif
    ? { etat: 'pas_encore', texte: 'Pas encore dans l’agenda', motif: null, peutReessayer: true }
    : { etat: 'pas_encore', texte: 'Pas encore dans l’agenda (envoi vers l’agenda désactivé)', motif: null, peutReessayer: false };
}

/** Le délai avant le prochain essai automatique : 5 min, 10, 20… plafonné à 6 h. PUR. */
export function delaiProchainEssaiMs(essais: number): number {
  const n = Math.max(0, Math.min(essais, 12));
  return Math.min(5 * 60_000 * 2 ** n, 6 * 3_600_000);
}
