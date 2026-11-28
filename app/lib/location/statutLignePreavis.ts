/**
 * ══ 🔴🔴 Arno (15/11/2026) — LE STATUT D'UNE LIGNE DE PRÉAVIS (arbre validé par Arno) ═════════════════════════════════════════════════
 * UN SEUL statut à la fois, CALCULÉ à partir des gestes existants (aucune saisie manuelle) — le geste le plus avancé l'emporte :
 *   1.  « En préavis »                    BLEU      préavis reçu, ni rendez-vous de pré-visite ni refus ;
 *   2a. « RDV pré-visite fixé »           SARCELLE  rendez-vous de pré-visite enregistré (un déplacement garde ce statut) ;
 *   2b. « Refus / absence pré-visite »    CORAIL    « Refus / absence de pré-visite » validé ;
 *   3.  « Pré-visite effectuée »          VERT      compte rendu de pré-visite envoyé (seulement après 2a) ;
 *   4.  « RDV état des lieux fixé »       VIOLET    rendez-vous d'état des lieux de sortie planifié (depuis 3 ou 2b) ;
 *   5.  « État des lieux + CR effectués » GRIS      « Valider la sortie » confirmée avec son compte rendu : la ligne quitte la liste des
 *                                                   préavis actifs (occupations sorties), le logement devient vacant (calculé, comme avant).
 * L'alerte (« Aucune pré-visite fixée », 11e jour) n'est pas un statut : c'est un repère d'une ligne « En préavis ». PUR ; seul import : le
 * module pur des rendez-vous (`triRdvPreavis`, les alertes de rendez-vous dépassé — 28/11/2026).
 */
import { alertesRdv, type LigneRdv } from './triRdvPreavis';
export type StatutLigne = 'en_preavis' | 'rdv_previsite' | 'refus_previsite' | 'previsite_effectuee' | 'rdv_edl' | 'edl_effectue';

/** L'ordre de l'arbre (filtres, tri). */
export const STATUTS_LIGNE: readonly StatutLigne[] = ['en_preavis', 'rdv_previsite', 'refus_previsite', 'previsite_effectuee', 'rdv_edl', 'edl_effectue'];
/** Les statuts d'une ligne ACTIVE (la 5 n'est plus dans la liste des préavis) : un filtre chacun. */
export const STATUTS_LIGNE_ACTIFS: readonly StatutLigne[] = STATUTS_LIGNE.filter((s) => s !== 'edl_effectue');

export const LIBELLE_STATUT_LIGNE: Record<StatutLigne, string> = {
  en_preavis: 'En préavis',
  rdv_previsite: 'RDV pré-visite fixé',
  refus_previsite: 'Refus / absence pré-visite',
  previsite_effectuee: 'Pré-visite effectuée',
  rdv_edl: 'RDV état des lieux fixé',
  edl_effectue: 'État des lieux + CR effectués',
};

/** Ce qu'il faut savoir d'une ligne : le statut de sa pré-visite, son état des lieux planifié, sa sortie validée. */
export interface FaitsLigne {
  /** 🔴 (28/11/2026) `rdv` : le rendez-vous de la pré-visite (sa date dépassée fait l'alerte « Compte rendu pré-visite à faire ») */
  previsite?: { statut: 'alerte' | 'recu' | 'programmee' | 'effectuee' | 'refusee'; rdv?: { jour: string; heure: string | null } | null } | null;
  /** l'état des lieux de sortie PLANIFIÉ (tâche à faire) ; absent ou null : aucun */
  edls?: unknown;
  /** « Valider la sortie » confirmée avec son compte rendu */
  sortieValidee?: boolean;
}

/** LE statut de la ligne : le geste le plus avancé l'emporte, une seule valeur. PUR. */
export function statutLigne(f: FaitsLigne): StatutLigne {
  if (f.sortieValidee === true) return 'edl_effectue';
  if (f.edls !== undefined && f.edls !== null) return 'rdv_edl';
  const p = f.previsite?.statut;
  if (p === 'effectuee') return 'previsite_effectuee';
  if (p === 'refusee') return 'refus_previsite';
  if (p === 'programmee') return 'rdv_previsite';
  return 'en_preavis';
}

/* ══ 🔴🔴 Arno (16/11/2026) — DEUX RENDEZ-VOUS FIXÉS EN MÊME TEMPS (exception à « un seul statut », validée par Arno) ═════════════════════
 * À la réception du préavis, on fixe d'un coup la pré-visite ET l'état des lieux de sortie. Tant que la pré-visite est programmée (ni
 * effectuée, ni refusée) et qu'un état des lieux est planifié, la ligne a DEUX statuts : « RDV pré-visite fixé » et « RDV état des lieux
 * fixé ». Pré-visite effectuée ou refusée : un seul, « RDV état des lieux fixé ». Tous les autres cas : le statut unique de `statutLigne`. */
/** LES statuts de la ligne (un, ou les deux rendez-vous fixés), dans l'ordre de l'arbre. PUR. */
export function statutsLigne(f: FaitsLigne): StatutLigne[] {
  const s = statutLigne(f);
  return s === 'rdv_edl' && f.previsite?.statut === 'programmee' ? ['rdv_previsite', 'rdv_edl'] : [s];
}

/** Un filtre : un statut, ou « alerte » (repère gardé à part, il n'est pas un statut). */
export type FiltreLigne = StatutLigne | 'alerte';
export const estFiltreLigne = (x: unknown): x is FiltreLigne => x === 'alerte' || (typeof x === 'string' && (STATUTS_LIGNE as readonly string[]).includes(x));

/** Les rendez-vous de la ligne, lus sans supposer leur forme (`edls` est `unknown` ici) : un état des lieux sans jour n'en est pas un. PUR. */
function rdvsDesFaits(f: FaitsLigne): LigneRdv {
  const e = f.edls as { jour?: unknown; heure?: unknown } | null | undefined;
  const edls = e !== null && typeof e === 'object' && typeof e.jour === 'string'
    ? { jour: e.jour, heure: typeof e.heure === 'string' ? e.heure : null } : null;
  return { previsite: f.previsite, edls };
}
/**
 * La ligne est-elle « Alerte préavis » ? « Aucune pré-visite fixée » (11e jour), et 🔴🔴 (Arno, 28/11/2026, 01h04) les deux alertes de rendez-vous
 * dépassé : « Compte rendu pré-visite à faire » et « Sortie à valider » (`alertesRdv`, la même source que les cartouches). Sans `maintenant` :
 * la seule règle du 11e jour, comme avant. PUR.
 */
export function ligneEnAlerte(f: FaitsLigne, maintenant?: string): boolean {
  return f.previsite?.statut === 'alerte' || (maintenant !== undefined && alertesRdv({ ...rdvsDesFaits(f), sortieValidee: f.sortieValidee }, maintenant).length > 0);
}

/** La ligne passe-t-elle le filtre (plusieurs valeurs : l'une OU l'autre ; vide : toutes) ? PUR. */
export function lignePasseFiltre(f: FaitsLigne, filtre: ReadonlySet<FiltreLigne>, maintenant?: string): boolean {
  if (filtre.size === 0) return true;
  return statutsLigne(f).some((s) => filtre.has(s)) || (filtre.has('alerte') && ligneEnAlerte(f, maintenant));
}

/** Les filtres avec leur compteur, dans l'ordre de l'arbre (statuts 1 à 4) ; « Alerte préavis » en plus, seulement s'il y en a. Une ligne à
 *  deux statuts compte dans les DEUX filtres (« Tous », le nombre des lignes, ne la compte qu'une fois). Une ligne à plusieurs alertes compte
 *  UNE fois dans « Alerte préavis ». PUR. */
export function filtresLignes(lignes: readonly FaitsLigne[], maintenant?: string): { filtre: FiltreLigne; libelle: string; nombre: number }[] {
  const alertes = lignes.filter((l) => ligneEnAlerte(l, maintenant)).length;
  return [
    ...STATUTS_LIGNE_ACTIFS.map((s) => ({ filtre: s as FiltreLigne, libelle: LIBELLE_STATUT_LIGNE[s], nombre: lignes.filter((l) => statutsLigne(l).includes(s)).length })),
    ...(alertes > 0 ? [{ filtre: 'alerte' as const, libelle: 'Alerte préavis', nombre: alertes }] : []),
  ];
}

/** Le rang de tri (une ligne en alerte avant les autres « En préavis »). PUR. */
export function rangStatutLigne(f: FaitsLigne): number {
  const s = statutLigne(f);
  return STATUTS_LIGNE.indexOf(s) * 2 + (s === 'en_preavis' && f.previsite?.statut !== 'alerte' ? 1 : 0);
}
