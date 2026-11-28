/**
 * ══ 🔴🔴 Arno (15/11/2026) — LE TRI CHRONOLOGIQUE DES RENDEZ-VOUS de la liste des préavis ══════════════════════════════════════════════
 * Un bouton fait tourner trois états : « RDV : plus proches d'abord » (PAR DÉFAUT) → « RDV : plus lointains d'abord » → « Tri RDV
 * désactivé » (l'ordre des tris du panneau) → retour au premier. 🔴 (16/11/2026) La date d'une ligne = le rendez-vous de SON STATUT
 * (« RDV pré-visite fixé » ou « RDV état des lieux fixé » seulement), même dépassé. AUCUNE ligne n'est exclue : toutes les autres (en
 * préavis, refus, pré-visite effectuée) viennent APRÈS, par fin de préavis la plus proche, sous « Sans rendez-vous fixé (n) ».
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

/** Ce qu'il faut d'une ligne : le rendez-vous de sa pré-visite (s'il tient encore), son état des lieux planifié, sa fin de préavis. */
export interface LigneRdv {
  previsite?: { statut: string; rdv?: { jour: string; heure: string | null } | null; collegues?: readonly { libelle: string; statut: string | null }[] } | null;
  edls?: { jour: string; heure: string | null; confieA?: string | null; statut?: string | null } | null;
  /** la fin de préavis (AAAA-MM-JJ) : l'ordre des lignes SANS rendez-vous fixé */
  dateMax?: string | null;
}

/* ══ 🔴🔴 Arno (16/11/2026, correctif constaté en production) — LE RENDEZ-VOUS DU STATUT ════════════════════════════════════════════════
 * Seules les lignes « RDV pré-visite fixé » et « RDV état des lieux fixé » ont un rendez-vous fixé : sa date est celle du rendez-vous de CE
 * statut (l'état des lieux planifié l'emporte, comme dans le statut de la ligne). Une pré-visite EFFECTUÉE n'est plus un rendez-vous fixé :
 * la ligne va sous « Sans rendez-vous fixé ». Un rendez-vous dont la date est passée sans que l'étape soit faite reste fixé, avec la mention
 * rouge « date dépassée — compte rendu à faire » (pré-visite) ou « date dépassée — sortie à valider » (état des lieux). */
export interface RdvDuStatut { sorte: 'previsite' | 'edl'; jour: string; heure: string | null; quand: string }
export const MENTION_DATE_DEPASSEE: Record<'previsite' | 'edl', string> = {
  previsite: 'date dépassée — compte rendu à faire',
  edl: 'date dépassée — sortie à valider',
};
const quandDe = (jour: string, heure: string | null | undefined): string => `${jour} ${(heure || '00:00').slice(0, 5)}`;
/* 🔴🔴 Arno (16/11/2026) — DEUX RENDEZ-VOUS FIXÉS : la pré-visite programmée (ni effectuée, ni refusée) ET l'état des lieux planifié. La ligne
 * est datée par son PROCHAIN rendez-vous non réalisé (le plus tôt des deux — en général la pré-visite ; dépassé, il reste en tête). */
/** Les rendez-vous FIXÉS de la ligne (ceux de ses statuts) : pré-visite puis état des lieux ; aucun : liste vide. PUR. */
export function rdvsDeLigne(l: LigneRdv): RdvDuStatut[] {
  const p = l.previsite;
  const pv: RdvDuStatut[] = p && p.statut === 'programmee' && p.rdv && p.rdv.jour
    ? [{ sorte: 'previsite', jour: p.rdv.jour, heure: p.rdv.heure, quand: quandDe(p.rdv.jour, p.rdv.heure) }] : [];
  if (l.edls && l.edls.jour) return [...pv, { sorte: 'edl', jour: l.edls.jour, heure: l.edls.heure, quand: quandDe(l.edls.jour, l.edls.heure) }];
  return pv;
}
/** Le rendez-vous qui DATE la ligne (le prochain non réalisé), ou null. PUR. */
export function rdvDuStatut(l: LigneRdv): RdvDuStatut | null {
  const r = rdvsDeLigne(l);
  return r.length === 0 ? null : r.reduce((a, b) => (b.quand < a.quand ? b : a));
}
/** La date est-elle dépassée (étape pas faite) ? PUR. */
export const rdvDepasse = (r: RdvDuStatut, maintenant: string): boolean => r.quand < maintenant;

/**
 * L'ordre chronologique. « Rendez-vous fixés » (statuts « RDV pré-visite fixé » et « RDV état des lieux fixé » seulement), par la date de
 * ce rendez-vous : « plus proches » = du plus ancien au plus lointain (un rendez-vous DÉPASSÉ vient donc EN TÊTE) ; « plus lointains » :
 * l'inverse. Puis « Sans rendez-vous fixé » (toutes les autres lignes), par fin de préavis la plus proche (sans date : à la fin). Aucune
 * ligne perdue ; à égalité, l'ordre reçu. PUR.
 */
export function ordonnerParRdv<T extends LigneRdv>(lignes: readonly T[], mode: Exclude<ModeTriRdv, 'off'>): { avecRdv: T[]; sansRdv: T[] } {
  const avec: { l: T; i: number; quand: string }[] = [];
  const sans: { l: T; i: number }[] = [];
  lignes.forEach((l, i) => { const r = rdvDuStatut(l); if (r === null) sans.push({ l, i }); else avec.push({ l, i, quand: r.quand }); });
  const sens = mode === 'proches' ? 1 : -1;
  const avecRdv = avec.sort((a, b) => sens * a.quand.localeCompare(b.quand) || a.i - b.i).map((x) => x.l);
  const sansRdv = sans.sort((a, b) => {
    const x = a.l.dateMax ?? null; const y = b.l.dateMax ?? null;
    if (x !== y) { if (x === null) return 1; if (y === null) return -1; return x.localeCompare(y); }
    return a.i - b.i;
  }).map((x) => x.l);
  return { avecRdv, sansRdv };
}

/* ══ 🔴🔴 Arno (28/11/2026, 01h28) — DEUX GROUPES, « Sans rendez-vous fixé » D'ABORD ══════════════════════════════════════════════════════════════
   « Il y a 2 catégories de lignes : les locataires dont un RDV a été fixé et ceux sans RDV fixé. Afficher d'abord les locataires "Sans rendez-vous fixé",
   ensuite ceux "Avec rendez-vous fixé". » Les deux groupes, dans l'ORDRE D'AFFICHAGE : « Sans » (par fin de préavis la plus proche, comme avant), puis
   « Avec » (le tri RDV : plus proches / plus lointains d'abord). Les groupes viennent avec le tri RDV, comme le séparateur d'avant ; « Tri RDV
   désactivé » : la liste reste celle des tris du panneau, d'un seul tenant (inchangé). Le partage est celui de `rdvDuStatut` (un rendez-vous fixé, même
   dépassé). Aucune ligne perdue. PUR. */
export const TITRE_GROUPE_RDV: Record<'sans' | 'avec', string> = { sans: 'Sans rendez-vous fixé', avec: 'Avec rendez-vous fixé' };
export function grouperParRdv<T extends LigneRdv>(lignes: readonly T[], mode: Exclude<ModeTriRdv, 'off'>): { groupe: 'sans' | 'avec'; lignes: T[] }[] {
  const o = ordonnerParRdv(lignes, mode);
  return [{ groupe: 'sans' as const, lignes: o.sansRdv }, { groupe: 'avec' as const, lignes: o.avecRdv }];
}

/** « AAAA-MM-JJ HH:MM » à Paris (le moment présent, comparé aux rendez-vous). */
export function maintenantParis(d: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${v('year')}-${v('month')}-${v('day')} ${v('hour')}:${v('minute')}`;
}

/* ══ 🔴🔴 Arno (15/11/2026) — LA COLONNE « RENDEZ-VOUS » du listing (même place sur toutes les lignes) ═══════════════════════════════════
   Le rendez-vous FIXÉ de la ligne (celui de son statut), mis en évidence avec son type : « Pré-visite · dim. 15/11 · 00h16 » ou « État des
   lieux · mer. 18/11 · 11h30 » ; 🔴 (16/11/2026) sa date passée sans que l'étape soit faite : la mention rouge « date dépassée — … » ;
   sans rendez-vous : « Pré-visite effectuée le JJ/MM » (pré-visite faite, pas encore d'état des lieux), sinon « — Aucun RDV fixé ». */
export type ColonneRdv = { sorte: 'previsite' | 'edl'; texte: string; quand: string; depassee: string | null } | { sorte: 'effectuee' | 'aucun'; texte: string };
export const AUCUN_RDV_FIXE = '— Aucun RDV fixé';
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
/** « sam. 15/11 » (le jour civil, sans fuseau). PUR. */
export function jourCourt(jour: string): string {
  const [a, m, j] = jour.split('-').map(Number);
  const d = new Date(Date.UTC(a, (m || 1) - 1, j || 1));
  return `${JOURS[d.getUTCDay()]} ${String(j).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}
const heureCourte = (h: string | null | undefined): string => { const [hh, mm] = (h || '00:00').split(':'); return `${hh.padStart(2, '0')}h${(mm ?? '00').padStart(2, '0')}`; };
const colonneDe = (r: RdvDuStatut, maintenant: string): ColonneRdv => ({ sorte: r.sorte, quand: r.quand,
  texte: `${r.sorte === 'edl' ? 'État des lieux' : 'Pré-visite'} · ${jourCourt(r.jour)} · ${heureCourte(r.heure)}`,
  depassee: rdvDepasse(r, maintenant) ? MENTION_DATE_DEPASSEE[r.sorte] : null });
/** 🔴 (16/11/2026) La colonne « rendez-vous » : un rendez-vous par statut — deux, l'un sous l'autre (pré-visite puis état des lieux). PUR. */
export function colonnesRdv(l: LigneRdv, maintenant: string): ColonneRdv[] {
  const r = rdvsDeLigne(l);
  return r.length === 0 ? [colonneRdv(l, maintenant)] : r.map((x) => colonneDe(x, maintenant));
}
/** La colonne « rendez-vous » d'une ligne (le rendez-vous qui la date). PUR. */
export function colonneRdv(l: LigneRdv, maintenant: string): ColonneRdv {
  const r = rdvDuStatut(l);
  if (r !== null) return colonneDe(r, maintenant);
  const p = l.previsite;
  if (p && p.statut === 'effectuee' && p.rdv && p.rdv.jour) return { sorte: 'effectuee', texte: `Pré-visite effectuée le ${jourCourt(p.rdv.jour).slice(5)}` };
  return { sorte: 'aucun', texte: AUCUN_RDV_FIXE };
}

/* ══ 🔴🔴 Arno (28/11/2026, 01h04) — LES ALERTES SOUS LEUR RENDEZ-VOUS (ligne repliée) ══════════════════════════════════════════════════════
   « le RDV de pré-visite a été fixé, la date est dépassée, et il n'y a pas le cartouche orange qui attire l'attention pour compléter le compte rendu
   de pré-visite […] Faire pareil si un RDV d'état des lieux a été fixé et que sa date est dépassée sans que la sortie soit validée ». MÊME règle que
   la mention rouge « date dépassée — … » de la colonne rendez-vous (`rdvsDeLigne` + `rdvDepasse`, une seule source) : la pré-visite programmée dont
   la date est passée → « Compte rendu pré-visite à faire » (disparaît dès le compte rendu : la pré-visite n'est plus programmée) ; l'état des lieux
   planifié dont la date est passée → « Sortie à valider » (disparaît dès la sortie validée : la ligne quitte la liste). Ordre : pré-visite, puis
   état des lieux. PUR. */
export type AlerteRdv = 'compte_rendu' | 'sortie';
export const LIBELLE_ALERTE_RDV: Record<AlerteRdv, string> = { compte_rendu: 'Compte rendu pré-visite à faire', sortie: 'Sortie à valider' };
/** L'alerte que porte un rendez-vous dépassé de cette sorte. */
export const ALERTE_DU_RDV: Record<'previsite' | 'edl', AlerteRdv> = { previsite: 'compte_rendu', edl: 'sortie' };
/** Les alertes de la ligne (aucune : liste vide). Une sortie déjà validée n'a plus d'alerte « Sortie à valider ». PUR. */
export function alertesRdv(l: LigneRdv & { sortieValidee?: boolean }, maintenant: string): AlerteRdv[] {
  return rdvsDeLigne(l).filter((r) => rdvDepasse(r, maintenant)).map((r) => ALERTE_DU_RDV[r.sorte])
    .filter((a) => !(a === 'sortie' && l.sortieValidee === true));
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

/**
 * 🔴🔴 (Arno, 28/11/2026, 00h45) « le même collaborateur est confirmé deux fois, il ne faut pas de doublons » — une ligne qui affiche la pré-visite ET l'état
 * des lieux : la MÊME personne avec le MÊME statut → une seule mention « confié à Prénom NOM · Confirmé », sur les deux rendez-vous ; personnes ou statuts
 * différents → une mention par rendez-vous. Même règle pour « Locataires : … » (un seul mot s'il est le même, et présent des deux côtés). PUR.
 */
export function mentionsCommunes(missions: readonly ({ qui: string; etat: EtatMission } | null)[], locataires: readonly (string | null)[]): { mission: boolean; locataires: boolean } {
  const [a, b] = missions;
  const [x, y] = locataires;
  return {
    mission: missions.length === 2 && a != null && b != null && a.qui === b.qui && a.etat === b.etat,
    locataires: locataires.length === 2 && x != null && y != null && x === y,
  };
}

/**
 * 🔴🔴 (Arno, 28/11/2026, 01h07) « le cartouche qui concerne le locataire s'affiche dans la continuité de la même ligne que celle du cartouche "Confirmé"
 * qui concerne le collaborateur » : sur une ligne à deux rendez-vous, une PAIRE (mission + locataires) par rendez-vous, chacune sur sa rangée ; UNE
 * seule paire quand TOUT est identique — même personne au même statut (`mentionsCommunes`), même mot des locataires, ou rien des deux côtés — et
 * qu'il y a quelque chose à dire. Sinon une paire par rendez-vous (la mission peut alors se lire deux fois : c'est la ligne de chacun). PUR.
 */
export function paireCommune(missions: readonly ({ qui: string; etat: EtatMission } | null)[], locataires: readonly (string | null)[]): boolean {
  if (missions.length !== 2 || locataires.length !== 2) return false;
  const c = mentionsCommunes(missions, locataires);
  const memeMission = c.mission || (missions[0] == null && missions[1] == null);
  const memesLocataires = c.locataires || (locataires[0] == null && locataires[1] == null);
  return memeMission && memesLocataires && !(missions[0] == null && locataires[0] == null);
}
