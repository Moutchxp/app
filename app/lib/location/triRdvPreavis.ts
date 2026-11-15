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
  previsite?: { statut: string; rdv?: { jour: string; heure: string | null } | null; collegues?: readonly { libelle: string; statut: string | null }[] } | null;
  edls?: { jour: string; heure: string | null; confieA?: string | null; statut?: string | null } | null;
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

/* ══ 🔴🔴 Arno (15/11/2026) — LA COLONNE « RENDEZ-VOUS » du listing (même place sur toutes les lignes) ═══════════════════════════════════
   Le rendez-vous FIXÉ de la ligne, mis en évidence avec son type : « Pré-visite · sam. 15/11 · 00h16 » (pré-visite fixée) ou « État des lieux
   · mer. 18/11 · 11h30 » (état des lieux planifié) — le prochain à venir, à défaut le dernier passé ; sans rendez-vous : « Pré-visite effectuée
   le JJ/MM » (pré-visite faite, pas encore d'état des lieux), sinon « — Aucun RDV fixé ». */
export type ColonneRdv = { sorte: 'previsite' | 'edl'; texte: string; quand: string } | { sorte: 'effectuee' | 'aucun'; texte: string };
export const AUCUN_RDV_FIXE = '— Aucun RDV fixé';
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
/** « sam. 15/11 » (le jour civil, sans fuseau). PUR. */
export function jourCourt(jour: string): string {
  const [a, m, j] = jour.split('-').map(Number);
  const d = new Date(Date.UTC(a, (m || 1) - 1, j || 1));
  return `${JOURS[d.getUTCDay()]} ${String(j).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}
const heureCourte = (h: string | null | undefined): string => { const [hh, mm] = (h || '00:00').split(':'); return `${hh.padStart(2, '0')}h${(mm ?? '00').padStart(2, '0')}`; };
/** La colonne « rendez-vous » d'une ligne. PUR. */
export function colonneRdv(l: LigneRdv, maintenant: string): ColonneRdv {
  const c: { sorte: 'previsite' | 'edl'; jour: string; heure: string | null; quand: string }[] = [];
  const p = l.previsite;
  if (p && p.statut === 'programmee' && p.rdv && p.rdv.jour) c.push({ sorte: 'previsite', jour: p.rdv.jour, heure: p.rdv.heure, quand: `${p.rdv.jour} ${(p.rdv.heure || '00:00').slice(0, 5)}` });
  if (l.edls && l.edls.jour) c.push({ sorte: 'edl', jour: l.edls.jour, heure: l.edls.heure, quand: `${l.edls.jour} ${(l.edls.heure || '00:00').slice(0, 5)}` });
  if (c.length > 0) {
    const futurs = c.filter((x) => x.quand >= maintenant).sort((a, b) => a.quand.localeCompare(b.quand));
    const x = futurs[0] ?? [...c].sort((a, b) => a.quand.localeCompare(b.quand)).at(-1)!;
    return { sorte: x.sorte, quand: x.quand, texte: `${x.sorte === 'edl' ? 'État des lieux' : 'Pré-visite'} · ${jourCourt(x.jour)} · ${heureCourte(x.heure)}` };
  }
  if (p && p.statut === 'effectuee' && p.rdv && p.rdv.jour) return { sorte: 'effectuee', texte: `Pré-visite effectuée le ${jourCourt(p.rdv.jour).slice(5)}` };
  return { sorte: 'aucun', texte: AUCUN_RDV_FIXE };
}

/* 🔴 (15/11/2026) LA MÉMOIRE DU TRI RDV, VERSIONNÉE : seul le format courant est relu ; une valeur d'un format ancien ou invalide est
   ignorée et le défaut (« RDV : plus proches d'abord ») s'applique. */
export const VERSION_MEMOIRE_TRI_RDV = 2;
export function lireModeTriRdv(brut: string | null | undefined): ModeTriRdv {
  if (!brut) return MODE_TRI_RDV_DEFAUT;
  try {
    const o = JSON.parse(brut) as { v?: unknown; mode?: unknown };
    return o && o.v === VERSION_MEMOIRE_TRI_RDV && estModeTriRdv(o.mode) ? o.mode : MODE_TRI_RDV_DEFAUT;
  } catch { return MODE_TRI_RDV_DEFAUT; }
}
export const ecrireModeTriRdv = (m: ModeTriRdv): string => JSON.stringify({ v: VERSION_MEMOIRE_TRI_RDV, mode: m });

/* ══ 🔴🔴 Arno (15/11/2026) — LA MISSION du rendez-vous affiché : « confié à Prénom NOM » et l'état de la tâche (acceptation existante) ══════
   « En attente de confirmation » tant que la personne n'a pas accepté ; « Confirmé » quand elle a accepté (ou quand le rendez-vous lui a été
   confié directement, sans demande) ; « Refusé — à réattribuer » quand elle a refusé (tous les collègues invités, pour une pré-visite). */
export type EtatMission = 'attente' | 'confirme' | 'refuse';
export const LIBELLE_ETAT_MISSION: Record<EtatMission, string> = { attente: 'En attente de confirmation', confirme: 'Confirmé', refuse: 'Refusé — à réattribuer' };
/** « Arnaud JOREL » (le nom de famille en capitales) ; une adresse reste telle quelle. PUR. */
export function prenomNom(libelle: string): string {
  const x = libelle.trim().replace(/\s+/g, ' ');
  if (x === '' || x.includes('@')) return x;
  const [prenom, ...reste] = x.split(' ');
  return reste.length === 0 ? x : `${prenom} ${reste.join(' ').toLocaleUpperCase('fr-FR')}`;
}
const etatDe = (statut: string | null | undefined): EtatMission => (statut === 'en_attente' ? 'attente' : statut === 'refusee' ? 'refuse' : 'confirme');
/** La mission du rendez-vous de cette sorte (celui de la colonne « rendez-vous »), ou null. PUR. */
export function missionDeLigne(l: LigneRdv, sorte: 'previsite' | 'edl'): { qui: string; etat: EtatMission } | null {
  if (sorte === 'edl') {
    const e = l.edls;
    if (!e || !e.confieA || e.confieA.trim() === '') return null;
    return { qui: prenomNom(e.confieA), etat: etatDe(e.statut) };
  }
  const c = l.previsite?.collegues ?? [];
  if (c.length === 0) return null;
  const accepte = c.find((x) => x.statut === 'acceptee' || x.statut === null);
  if (accepte) return { qui: prenomNom(accepte.libelle), etat: 'confirme' };
  if (c.every((x) => x.statut === 'refusee')) return { qui: prenomNom(c[0].libelle), etat: 'refuse' };
  const attente = c.find((x) => x.statut === 'en_attente') ?? c[0];
  return { qui: prenomNom(attente.libelle), etat: 'attente' };
}
