/**
 * ══ 🔴🔴 LOT TACHES-1 — LES GESTES D'UNE TÂCHE, CÔTÉ ÉCRAN : UNE SEULE PORTE ════════════════════════════════════
 *
 * Arno : « Une seule et même fonction partagée pour ces actions et pour la couleur, pour que tous les écrans disent
 * la même chose. » La couleur vit dans `lib/gestion/taches.ts` ; les GESTES vivent ici. La fiche du bien, le
 * récapitulatif général et la fenêtre de détail appellent `agirSurTache` — aucun d'eux n'écrit son propre `fetch`.
 *
 * 🔴 APRÈS CHAQUE GESTE RÉUSSI, UN SIGNAL (`gestion:taches`) EST ÉMIS SUR LA FENÊTRE. Tous les blocs de tâches
 * affichés l'écoutent et se relisent : une tâche marquée faite dans le récapitulatif se grise aussi sur la fiche,
 * sans qu'aucun des deux connaisse l'autre.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : ce fichier vit dans le navigateur (garde `clientBoundary.guard.test.ts`).
 */
import {
  refusDuServeur, type ChampTache, type PieceTache, type RaccourciDecalage, type Rappel, type Tache, type TraceTache,
} from '../../../../lib/gestion/taches';
import type { ContactSource, ContactTache } from '../../../../lib/gestion/contactsTache';

export const SIGNAL_TACHES = 'gestion:taches';

export function signalerTaches(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SIGNAL_TACHES));
}

/** S'abonne au signal ; rend la fonction de désabonnement (pour un `useEffect`). */
export function ecouterTaches(f: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(SIGNAL_TACHES, f);
  return () => window.removeEventListener(SIGNAL_TACHES, f);
}

/**
 * 🔴 LOT FICHE-TACHES-EN-ATTENTE — « une tâche vient d'être CRÉÉE depuis la fiche de ce bien » : le bloc « Tâches de ce
 * bien », replié par défaut, se déplie pour montrer le résultat (Arno). Un signal à part, porteur du bien, pour que
 * les autres gestes (récapitulatif général, autres fiches) ne déplient rien.
 */
export const SIGNAL_DEPLIER_TACHES_BIEN = 'gestion:taches:deplier-bien';

export function demanderDepliageBien(lotId: number): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SIGNAL_DEPLIER_TACHES_BIEN, { detail: { lotId } }));
}

export function ecouterDepliageBien(lotId: number, f: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const g = (e: Event) => { if (Number((e as CustomEvent<{ lotId: number }>).detail?.lotId) === Number(lotId)) f(); };
  window.addEventListener(SIGNAL_DEPLIER_TACHES_BIEN, g);
  return () => window.removeEventListener(SIGNAL_DEPLIER_TACHES_BIEN, g);
}

/**
 * L'ISSUE D'UN GESTE. Un refus porte TOUJOURS un message en français, et le champ concerné quand il y en a un
 * (`refusDuServeur`, règle unique) : la fenêtre l'affiche en haut ET à côté du champ. Jamais de clic sans effet.
 */
export type IssueGeste =
  | { ok: true; message: string; id?: number }
  | { ok: false; message: string; champ?: ChampTache | null };

async function envoyer(url: string, method: 'POST' | 'PATCH', corps: unknown): Promise<IssueGeste> {
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  } catch {
    return { ok: false, message: 'Le serveur ne répond pas : rien n’a été enregistré.', champ: null };
  }
  const d = (await res.json().catch(() => null)) as { message?: string; erreur?: string; champ?: string; id?: number; etat?: string } | null;
  if (!res.ok) {
    const r = refusDuServeur(res.status, d);
    return { ok: false, message: r.message, champ: r.champ };
  }
  // ⚠️ UN 200 SANS LA RÉPONSE ATTENDUE (page de connexion servie à la place, par exemple) n'est PAS un succès.
  if (d === null || d.etat !== 'ok') {
    return { ok: false, message: 'Réponse inattendue du serveur : rien ne confirme l’enregistrement. Recharge la page.', champ: null };
  }
  signalerTaches();
  return { ok: true, message: d.message ?? 'Enregistré.', id: d.id };
}

/** Ce que l'écran envoie à la création et à la modification. */
export interface SaisieEcran {
  objet: string; jour: string; heure: string | null; note: string; confieeA: number | null;
  evenementId: number | null; rappels: Rappel[];
  /** 🔴 LOT TACHES-1-BIS — les clés des contacts cochés ; absent ⇒ les contacts ne sont pas touchés. */
  contacts?: string[];
  /** 🔴 LOT TACHES-PIECES-DRIVE — à la création : les identifiants Drive des pièces choisies. */
  pieces?: string[];
  /** 🔴 LOT TACHES-AGENDA — la durée d'un rendez-vous (minutes) ; `null` = 1 h. */
  dureeMinutes?: number | null;
}

export type GesteTache =
  | { geste: 'faite' }
  | { geste: 'annuler' }
  | { geste: 'rouvrir' }
  | { geste: 'decaler'; raccourci: RaccourciDecalage }
  | { geste: 'decaler'; jour: string; heure: string | null; dureeMinutes?: number | null }
  | ({ geste: 'modifier' } & SaisieEcran)
  /** 🔴 LOT TACHES-1-BIS — « Mettre à jour » les coordonnées copiées d'un contact. */
  | { geste: 'actualiserContact'; cle: string }
  /** 🔴 LOT TACHES-ACCEPTATION — un nouveau mail, un nouveau lien ; l'ancien cesse d'agir. */
  | { geste: 'renvoyerDemande' }
  /** 🔴 LOT TACHES-PIECES-DRIVE — des RÉFÉRENCES Drive ; le fichier n'est jamais touché. */
  | { geste: 'ajouterPieces'; pieces: string[] }
  | { geste: 'retirerPiece'; driveId: string }
  /** 🔴 LOT TACHES-AGENDA — « Réessayer » l'envoi vers l'agenda Google. */
  | { geste: 'reessayerAgenda' };

/** LA porte des gestes sur une tâche existante. */
export function agirSurTache(id: number, g: GesteTache): Promise<IssueGeste> {
  return envoyer(`/api/admin/gestion/taches/${id}`, 'PATCH', g);
}

export function creerTache(lotId: number, s: SaisieEcran): Promise<IssueGeste> {
  return envoyer('/api/admin/gestion/taches', 'POST', { lotId, ...s });
}

export type ListeTaches =
  | { etat: 'ok'; taches: Tache[]; moi: number | null; tronque: boolean }
  | { etat: 'sans_schema' }
  | { etat: 'erreur' };

/** Les tâches d'un bien (`lotId`), ou de tous (`null`). */
export async function lireTaches(lotId: number | null): Promise<ListeTaches> {
  try {
    const res = await fetch(
      lotId === null ? '/api/admin/gestion/taches' : `/api/admin/gestion/taches?bien=${lotId}`, { cache: 'no-store' });
    const d = (await res.json()) as { etat?: string; taches?: Tache[]; moi?: number | null; tronque?: boolean };
    if (d.etat === 'sans_schema') return { etat: 'sans_schema' };
    if (!res.ok || d.etat !== 'ok') return { etat: 'erreur' };
    return { etat: 'ok', taches: d.taches ?? [], moi: d.moi ?? null, tronque: d.tronque === true };
  } catch {
    return { etat: 'erreur' };
  }
}

export interface DetailTache { tache: Tache; traces: TraceTache[]; contacts: ContactTache[]; pieces: PieceTache[] }

export async function lireDetailTache(id: number): Promise<DetailTache | null> {
  try {
    const res = await fetch(`/api/admin/gestion/taches/${id}`, { cache: 'no-store' });
    const d = (await res.json()) as { etat?: string; tache?: Tache; traces?: TraceTache[]; contacts?: ContactTache[]; pieces?: PieceTache[] };
    return res.ok && d.etat === 'ok' && d.tache
      ? { tache: d.tache, traces: d.traces ?? [], contacts: d.contacts ?? [], pieces: d.pieces ?? [] } : null;
  } catch {
    return null;
  }
}

/** Une personne de la liste « Confiée à ». `accesGestion` faux ⇒ mention « sans accès Gestion » (règle du 13/10/2026). */
export interface CollaborateurEcran { id: number; libelle: string; accesGestion?: boolean }

export async function lireCollaborateurs(): Promise<{ collaborateurs: CollaborateurEcran[]; moi: number | null } | null> {
  try {
    const res = await fetch('/api/admin/gestion/taches/collaborateurs', { cache: 'no-store' });
    const d = (await res.json()) as { etat?: string; collaborateurs?: CollaborateurEcran[]; moi?: number | null };
    return res.ok && d.etat === 'ok' ? { collaborateurs: d.collaborateurs ?? [], moi: d.moi ?? null } : null;
  } catch {
    return null;
  }
}

/** Les événements du bien, pour le lien facultatif. La même route que le bloc « Événements » de la fiche. */
export async function lireEvenementsDuBien(lotCle: string): Promise<{ id: number; reference: string; objet: string; ouvert: boolean }[]> {
  try {
    const res = await fetch(`/api/admin/gestion/biens/evenements?bien=${encodeURIComponent(lotCle)}`, { cache: 'no-store' });
    const d = (await res.json()) as { etat?: string; evenements?: { id: number; reference: string; objet: string; ouvert: boolean }[] };
    return d.etat === 'ok' ? (d.evenements ?? []) : [];
  } catch {
    return [];
  }
}

/**
 * 🔴 LOT TACHES-1-BIS — LES CONTACTS DU BIEN, pour la section « Contacts de la tâche ». `null` ⇒ la section ne
 * s'affiche pas (migration 347 absente, ou lecture impossible) : la fenêtre est alors celle du lot 1.
 */
export async function lireContactsDuBien(lotId: number): Promise<ContactSource[] | null> {
  try {
    const res = await fetch(`/api/admin/gestion/taches/contacts?bien=${lotId}`, { cache: 'no-store' });
    const d = (await res.json()) as { etat?: string; contacts?: ContactSource[] };
    return res.ok && d.etat === 'ok' ? (d.contacts ?? []) : null;
  } catch {
    return null;
  }
}

/* ═══ 🔴🔴 LOT TACHES-PIECES-DRIVE — LE SÉLECTEUR DRIVE DES TÂCHES (lecture seule, côté serveur verrouillé) ═══ */

export interface ElementDriveEcran {
  id: string; nom: string; typeMime: string; dossier: boolean; modifieLe: string | null; lien: string | null;
}
export type LectureDrive<T> = { etat: 'ok'; valeur: T } | { etat: 'sans_schema' } | { etat: 'indisponible'; message: string };

async function lireDrive<T>(parametres: string, extraire: (d: Record<string, unknown>) => T): Promise<LectureDrive<T>> {
  try {
    const res = await fetch(`/api/admin/gestion/taches/drive?${parametres}`, { cache: 'no-store' });
    const d = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || d === null) return { etat: 'indisponible', message: refusDuServeur(res.status, d).message };
    if (d.etat === 'sans_schema') return { etat: 'sans_schema' };
    if (d.etat !== 'ok') return { etat: 'indisponible', message: String(d.message ?? 'Le Drive n’a pas pu être lu.') };
    return { etat: 'ok', valeur: extraire(d) };
  } catch {
    return { etat: 'indisponible', message: 'Le serveur ne répond pas.' };
  }
}

/** Le dossier de départ : celui du bien (comme « Dossier Drive ↗ »), ou la racine avec un message. */
export function lireDepartDrive(lotId: number) {
  return lireDrive(`bien=${lotId}`, (d) => ({
    depart: d.depart as { id: string; nom: string }, message: (d.message as string | null) ?? null,
  }));
}
export function lireDossierDrive(id: string) {
  return lireDrive(`dossier=${encodeURIComponent(id)}`, (d) => ({
    dossier: d.dossier as { id: string; nom: string }, parent: (d.parent as { id: string; nom: string } | null) ?? null,
    elements: (d.elements as ElementDriveEcran[]) ?? [], tronque: d.tronque === true,
  }));
}
export function chercherDansLeDrive(texte: string) {
  return lireDrive(`recherche=${encodeURIComponent(texte)}`, (d) => (d.elements as ElementDriveEcran[]) ?? []);
}
