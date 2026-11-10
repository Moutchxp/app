/**
 * ══ 🔴🔴 LA PLEINE PAGE « TÂCHES » — RECHERCHE, TRIS, FILTRES CUMULABLES (Arno, 10/11/2026). MODULE PUR. ═══════════════════════════════
 *
 * Arno : « la liste complète des tâches avec TOUS les filtres et tris, chacun dans les deux sens quand c'est une date : recherche par
 * intitulé, bien/adresse, locataire ou collaborateur ; tri par date de la tâche, date de création, statut ; filtres cumulables : échéance,
 * statut (en attente, acceptée, refusée, à réattribuer, faite, annulée), confiées à moi / aux collaborateurs / commandées par moi,
 * collaborateur destinataire, avec ou sans bien ; tri par défaut = celui du bloc Tâches ; le tri et les filtres choisis sont conservés. »
 *
 * Les règles sont celles du bloc, jamais une seconde : l'échéance est `couleurTache`, le statut est `statutTache`, l'ordre par défaut est
 * `comparerTaches` (puis les terminées, la plus récente d'abord, comme `repartirTaches`). Dans un groupe, les choix s'ajoutent (OU) ; d'un
 * groupe à l'autre, ils se combinent (ET).
 */
import { statutTache, type FiltreQui, type FiltreStatut } from './acceptationTache';
import { comparerTaches, couleurTache, type CouleurTache, type PastilleFiltre, type Tache } from './taches';

export type CleTriTaches = 'defaut' | 'echeance' | 'creation' | 'statut';
export interface TriTaches { cle: CleTriTaches; sens: 'asc' | 'desc' }
export const TRI_TACHES_DEFAUT: TriTaches = { cle: 'defaut', sens: 'asc' };

export type FiltreEcheance = CouleurTache;
export const ECHEANCES: readonly FiltreEcheance[] = ['retard', 'jour', 'proche', 'plus_tard'];
export const MOTS_ECHEANCE: Record<FiltreEcheance, string> = { retard: 'En retard', jour: 'Aujourd’hui / demain', proche: 'Dans 2 jours', plus_tard: 'Plus tard' };

export type StatutPleinePage = 'en_attente' | 'acceptee' | 'refusee' | 'a_reattribuer' | 'faite' | 'annulee';
export const STATUTS_PLEINE_PAGE: readonly StatutPleinePage[] = ['en_attente', 'acceptee', 'refusee', 'a_reattribuer', 'faite', 'annulee'];
export const MOTS_STATUT_PLEINE_PAGE: Record<StatutPleinePage, string> = {
  en_attente: 'En attente', acceptee: 'Acceptée', refusee: 'Refusée', a_reattribuer: 'À réattribuer', faite: 'Faite', annulee: 'Annulée',
};

export type FiltreBien = 'tous' | 'avec' | 'sans';

export interface FiltresTaches { echeances: FiltreEcheance[]; statuts: StatutPleinePage[]; collaborateur: string | null; bien: FiltreBien }
export const FILTRES_TACHES_VIDES: FiltresTaches = { echeances: [], statuts: [], collaborateur: null, bien: 'tous' };

/** Les statuts d'une tâche, au sens de la pleine page (une tâche refusée encore à faire est « Refusée » ET « À réattribuer »). PUR. */
export function statutsDeLaTache(t: Tache): StatutPleinePage[] {
  if (t.etat === 'faite') return ['faite'];
  if (t.etat === 'annulee') return ['annulee'];
  const s = statutTache({ confieeA: null, acceptation: t.acceptation, invites: t.invites });
  if (s === 'refusee') return ['refusee', 'a_reattribuer'];
  return s === null ? [] : [s];
}

/** Les collaborateurs destinataires (confiée à, et les invités), sans doublon, dans l'ordre alphabétique. PUR. */
export function collaborateursDesTaches(taches: readonly Tache[]): string[] {
  const noms = new Set<string>();
  for (const t of taches) {
    if (t.confieeALibelle.trim() !== '') noms.add(t.confieeALibelle.trim());
    for (const i of t.invites ?? []) if (i.libelle.trim() !== '') noms.add(i.libelle.trim());
  }
  return [...noms].sort((a, b) => a.localeCompare(b, 'fr'));
}

const destinataires = (t: Tache): string[] => [t.confieeALibelle, ...(t.invites ?? []).map((i) => i.libelle)].map((x) => x.trim());

/** Les filtres cumulables. Les terminées n'ont pas d'échéance : choisir une échéance les écarte. PUR. */
export function filtrerTachesPleinePage(taches: readonly Tache[], f: FiltresTaches, maintenant: Date): Tache[] {
  return taches.filter((t) => {
    if (f.echeances.length > 0) {
      const c = couleurTache(t, maintenant);
      if (c === null || !f.echeances.includes(c)) return false;
    }
    if (f.statuts.length > 0 && !statutsDeLaTache(t).some((s) => f.statuts.includes(s))) return false;
    if (f.collaborateur !== null && !destinataires(t).includes(f.collaborateur)) return false;
    if (f.bien === 'avec' && t.lotId === null) return false;
    if (f.bien === 'sans' && t.lotId !== null) return false;
    return true;
  });
}

const plat = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** La recherche : intitulé, bien / adresse, locataire (contacts de la tâche), collaborateur (confiée à, invités, créée par). PUR. */
export function chercherTaches(taches: readonly Tache[], texte: string): Tache[] {
  const q = plat(texte ?? '');
  if (q === '') return [...taches];
  return taches.filter((t) => plat([
    t.objet, t.adresseBien, t.evenement?.reference ?? '', ...(t.contactsResume ?? []).map((c) => c.nom),
    ...destinataires(t), t.creeParLibelle,
  ].join(' ')).includes(q));
}

const RANG_STATUT: Record<string, number> = { en_attente: 0, acceptee: 1, refusee: 2, aucun: 3, faite: 4, annulee: 5 };
const rangStatut = (t: Tache): number => {
  if (t.etat !== 'a_faire') return RANG_STATUT[t.etat];
  return RANG_STATUT[statutTache({ confieeA: null, acceptation: t.acceptation, invites: t.invites }) ?? 'aucun'];
};
const fin = (t: Tache): string => t.faiteLe ?? t.annuleeLe ?? t.majLe;

/**
 * Le tri : par défaut, l'ordre du bloc (les tâches à faire par `comparerTaches`, puis les terminées, la plus récente d'abord) ; sinon la
 * date de la tâche (jour + heure), la date de création, ou le statut, dans un sens. À égalité : l'ordre du bloc. PUR.
 */
export function trierTachesPleinePage(taches: readonly Tache[], tri: TriTaches, maintenant: Date): Tache[] {
  const defaut = (a: Tache, b: Tache): number => {
    if ((a.etat === 'a_faire') !== (b.etat === 'a_faire')) return a.etat === 'a_faire' ? -1 : 1;
    if (a.etat === 'a_faire') return comparerTaches(a, b, maintenant);
    return fin(b).localeCompare(fin(a)) || b.id - a.id;
  };
  if (tri.cle === 'defaut') return [...taches].sort(defaut);
  const val = (t: Tache): string | number => (tri.cle === 'echeance' ? `${t.jour} ${t.heure ?? '00:00'}` : tri.cle === 'creation' ? t.creeLe : rangStatut(t));
  return [...taches].sort((a, b) => {
    const x = val(a); const y = val(b);
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return (tri.sens === 'asc' ? c : -c) || defaut(a, b);
  });
}

/** Ce que la pleine page garde d'une visite à l'autre (préférence locale) : le tri et TOUS les filtres. */
export interface PreferencesTaches { tri: TriTaches; filtres: FiltresTaches; qui: FiltreQui; statut: FiltreStatut; pastille: PastilleFiltre | null }
export const PREFERENCES_TACHES_DEFAUT: PreferencesTaches = { tri: TRI_TACHES_DEFAUT, filtres: FILTRES_TACHES_VIDES, qui: 'toutes', statut: 'toutes', pastille: null };

/** Relit les préférences mémorisées ; tout ce qui n'est pas reconnu reprend sa valeur par défaut. PUR. */
export function lirePreferencesTaches(brut: string | null): PreferencesTaches {
  let o: Record<string, unknown> = {};
  try { o = brut ? (JSON.parse(brut) as Record<string, unknown>) : {}; } catch { o = {}; }
  const tri = (o.tri ?? {}) as Record<string, unknown>;
  const f = (o.filtres ?? {}) as Record<string, unknown>;
  const liste = <T extends string>(x: unknown, permis: readonly T[]): T[] => (Array.isArray(x) ? x.filter((v): v is T => permis.includes(v as T)) : []);
  return {
    tri: (['defaut', 'echeance', 'creation', 'statut'] as const).includes(tri.cle as CleTriTaches) && (tri.sens === 'asc' || tri.sens === 'desc')
      ? { cle: tri.cle as CleTriTaches, sens: tri.sens } : TRI_TACHES_DEFAUT,
    filtres: {
      echeances: liste(f.echeances, ECHEANCES), statuts: liste(f.statuts, STATUTS_PLEINE_PAGE),
      collaborateur: typeof f.collaborateur === 'string' && f.collaborateur.trim() !== '' ? f.collaborateur : null,
      bien: f.bien === 'avec' || f.bien === 'sans' ? f.bien : 'tous',
    },
    qui: (['toutes', 'confiees', 'collaborateurs', 'commandees'] as const).includes(o.qui as FiltreQui) ? (o.qui as FiltreQui) : 'toutes',
    statut: (['toutes', 'en_attente', 'acceptee', 'refusee'] as const).includes(o.statut as FiltreStatut) ? (o.statut as FiltreStatut) : 'toutes',
    pastille: (['retard', 'jour', 'proche', 'plus_tard', 'en_attente'] as const).includes(o.pastille as PastilleFiltre) ? (o.pastille as PastilleFiltre) : null,
  };
}
