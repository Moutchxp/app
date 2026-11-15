/**
 * ══ 🔴🔴 Arno (15/11/2026) — LE TRI CHRONOLOGIQUE DES RENDEZ-VOUS de la liste des préavis ══════════════════════════════════════════════
 * Un bouton fait tourner trois états : « RDV : plus proches d'abord » (PAR DÉFAUT) → « RDV : plus lointains d'abord » → « Tri RDV
 * désactivé » (l'ordre des tris du panneau) → retour au premier. La date d'une ligne = son PROCHAIN rendez-vous à venir (pré-visite fixée ou
 * effectuée, état des lieux planifié — le plus proche dans le futur), à défaut le DERNIER passé. AUCUNE ligne n'est exclue : celles sans
 * rendez-vous fixé (en préavis, refus, en attente) viennent APRÈS, dans l'ordre des tris du panneau, sous « Sans rendez-vous fixé (n) ».
 * Actif, il prime sur les tris du panneau. PUR, sans import.
 */
export type ModeTriRdv = 'proches' | 'lointains' | 'off';
export const MODE_TRI_RDV_DEFAUT: ModeTriRdv = 'proches';
export const LIBELLE_TRI_RDV: Record<ModeTriRdv, string> = {
  proches: 'RDV : plus proches d’abord',
  lointains: 'RDV : plus lointains d’abord',
  off: 'Tri RDV désactivé',
};
export const modeTriRdvSuivant = (m: ModeTriRdv): ModeTriRdv => (m === 'proches' ? 'lointains' : m === 'lointains' ? 'off' : 'proches');
export const estModeTriRdv = (x: unknown): x is ModeTriRdv => x === 'proches' || x === 'lointains' || x === 'off';

/** Ce qu'il faut d'une ligne : le rendez-vous de sa pré-visite (s'il tient encore) et son état des lieux planifié. */
export interface LigneRdv {
  previsite?: { statut: string; rdv?: { jour: string; heure: string | null } | null } | null;
  edls?: { jour: string; heure: string | null } | null;
}

/** Les rendez-vous qui TIENNENT d'une ligne (« AAAA-MM-JJ HH:MM ») : la pré-visite fixée ou effectuée, l'état des lieux planifié. PUR. */
export function rendezVousDeLigne(l: LigneRdv): string[] {
  const r: string[] = [];
  const p = l.previsite;
  if (p && (p.statut === 'programmee' || p.statut === 'effectuee') && p.rdv && p.rdv.jour) r.push(`${p.rdv.jour} ${(p.rdv.heure || '00:00').slice(0, 5)}`);
  if (l.edls && l.edls.jour) r.push(`${l.edls.jour} ${(l.edls.heure || '00:00').slice(0, 5)}`);
  return r;
}

/** La date retenue : le prochain rendez-vous à venir, à défaut le dernier passé ; null : aucun rendez-vous fixé. PUR. */
export function dateRdvDeLigne(l: LigneRdv, maintenant: string): { quand: string; aVenir: boolean } | null {
  const r = rendezVousDeLigne(l);
  if (r.length === 0) return null;
  const futurs = r.filter((x) => x >= maintenant).sort();
  if (futurs.length > 0) return { quand: futurs[0], aVenir: true };
  return { quand: [...r].sort().at(-1)!, aVenir: false };
}

/**
 * L'ordre chronologique : les lignes AVEC rendez-vous (« plus proches » : à venir du plus proche au plus lointain, puis passés du plus
 * récent au plus ancien ; « plus lointains » : l'inverse exact), puis les lignes SANS rendez-vous dans l'ordre reçu (celui du panneau).
 * Aucune ligne perdue ; à égalité, l'ordre reçu. PUR.
 */
export function ordonnerParRdv<T extends LigneRdv>(lignes: readonly T[], mode: Exclude<ModeTriRdv, 'off'>, maintenant: string): { avecRdv: T[]; sansRdv: T[] } {
  const avec: { l: T; i: number; d: { quand: string; aVenir: boolean } }[] = [];
  const sansRdv: T[] = [];
  lignes.forEach((l, i) => { const d = dateRdvDeLigne(l, maintenant); if (d === null) sansRdv.push(l); else avec.push({ l, i, d }); });
  const proches = [...avec].sort((a, b) => {
    if (a.d.aVenir !== b.d.aVenir) return a.d.aVenir ? -1 : 1;
    const c = a.d.aVenir ? a.d.quand.localeCompare(b.d.quand) : b.d.quand.localeCompare(a.d.quand);
    return c !== 0 ? c : a.i - b.i;
  }).map((x) => x.l);
  return { avecRdv: mode === 'proches' ? proches : proches.reverse(), sansRdv };
}

/** « AAAA-MM-JJ HH:MM » à Paris (le moment présent, comparé aux rendez-vous). */
export function maintenantParis(d: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${v('year')}-${v('month')}-${v('day')} ${v('hour')}:${v('minute')}`;
}
