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
import type { RaccourciDecalage, Rappel, Tache, TraceTache } from '../../../../lib/gestion/taches';
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

export type IssueGeste = { ok: true; message: string; id?: number } | { ok: false; message: string };

async function envoyer(url: string, method: 'POST' | 'PATCH', corps: unknown): Promise<IssueGeste> {
  try {
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
    });
    const d = (await res.json().catch(() => ({}))) as { message?: string; erreur?: string; id?: number };
    if (!res.ok) return { ok: false, message: d.erreur ?? 'Le geste n’a pas pu être enregistré.' };
    signalerTaches();
    return { ok: true, message: d.message ?? 'Enregistré.', id: d.id };
  } catch {
    return { ok: false, message: 'Le serveur ne répond pas : rien n’a été enregistré.' };
  }
}

/** Ce que l'écran envoie à la création et à la modification. */
export interface SaisieEcran {
  objet: string; jour: string; heure: string | null; note: string; confieeA: number | null;
  evenementId: number | null; rappels: Rappel[];
  /** 🔴 LOT TACHES-1-BIS — les clés des contacts cochés ; absent ⇒ les contacts ne sont pas touchés. */
  contacts?: string[];
}

export type GesteTache =
  | { geste: 'faite' }
  | { geste: 'annuler' }
  | { geste: 'rouvrir' }
  | { geste: 'decaler'; raccourci: RaccourciDecalage }
  | { geste: 'decaler'; jour: string; heure: string | null }
  | ({ geste: 'modifier' } & SaisieEcran)
  /** 🔴 LOT TACHES-1-BIS — « Mettre à jour » les coordonnées copiées d'un contact. */
  | { geste: 'actualiserContact'; cle: string };

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

export interface DetailTache { tache: Tache; traces: TraceTache[]; contacts: ContactTache[] }

export async function lireDetailTache(id: number): Promise<DetailTache | null> {
  try {
    const res = await fetch(`/api/admin/gestion/taches/${id}`, { cache: 'no-store' });
    const d = (await res.json()) as { etat?: string; tache?: Tache; traces?: TraceTache[]; contacts?: ContactTache[] };
    return res.ok && d.etat === 'ok' && d.tache
      ? { tache: d.tache, traces: d.traces ?? [], contacts: d.contacts ?? [] } : null;
  } catch {
    return null;
  }
}

export interface CollaborateurEcran { id: number; libelle: string }

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
