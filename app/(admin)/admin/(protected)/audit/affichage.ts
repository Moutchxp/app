/**
 * M2 — LOT 7 (écran d'audit). LOGIQUE D'AFFICHAGE PURE, testable sans rendu. Le module CONSOMME l'API
 * `GET /api/admin/audit` et l'AFFICHE ; il ne calcule aucune métrique de sécurité, n'accède jamais à la base.
 * Types miroir du contrat de l'API (jamais importés du serveur `server-only`). Module autonome (pas de couplage
 * au dashboard statistiques) : l'audit reste isolé.
 */

export type Grain = 'jour' | 'semaine' | 'mois';
export interface Fenetre {
  debut: string; // 'YYYY-MM-DD'
  fin: string;
  grain: Grain;
}
export interface PointAudit {
  bucket: string;
  succes: number;
  echecs: number;
}
export interface Audit {
  fenetre: Fenetre;
  serie: PointAudit[];
  totaux: { succes: number; echecs: number };
  pics: { bucket: string; echecs: number }[];
  seuilPic: number;
}

/** Jour civil Europe/Paris (cohérent avec le Lot 4/serveur). */
export function jourParis(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
/** Décale une date 'YYYY-MM-DD' (arithmétique UTC → insensible au changement d'heure). */
export function decalerJours(iso: string, jours: number): string {
  const [a, m, j] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + jours));
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
/** Fenêtre par défaut : 30 derniers jours, grain jour. */
export function fenetreDefaut(maintenant: Date = new Date()): Fenetre {
  const fin = jourParis(maintenant);
  return { debut: decalerJours(fin, -29), fin, grain: 'jour' };
}
/** Preset relatif (7/30/90 jours) + grain. */
export function preset(jours: number, grain: Grain, maintenant: Date = new Date()): Fenetre {
  const fin = jourParis(maintenant);
  return { debut: decalerJours(fin, -(jours - 1)), fin, grain };
}
/** URL de l'API d'audit (le client NE FAIT QUE la consommer — jamais la base). */
export function construireUrl(f: Fenetre): string {
  const p = new URLSearchParams({ debut: f.debut, fin: f.fin, grain: f.grain });
  return `/api/admin/audit?${p.toString()}`;
}

export function formatNombre(n: number): string {
  return n.toLocaleString('fr-FR');
}

export type CleAudit = 'succes' | 'echecs';
/** Max de la série (échelle Y commune succès/échecs), plancher 1 (anti division par 0). */
export function maxSerie(serie: PointAudit[]): number {
  let m = 0;
  for (const p of serie) {
    if (p.succes > m) m = p.succes;
    if (p.echecs > m) m = p.echecs;
  }
  return Math.max(1, m);
}
/** Coordonnées d'affichage (x,y) d'une métrique dans [0..largeur]×[0..hauteur] (y inversé). Pur, testé. */
export function coordsSerie(serie: PointAudit[], cle: CleAudit, max: number, largeur: number, hauteur: number): { x: number; y: number }[] {
  const n = serie.length;
  if (n === 0 || max <= 0) return [];
  return serie.map((p, i) => ({
    x: n > 1 ? (i * largeur) / (n - 1) : largeur / 2,
    y: hauteur - (p[cle] / max) * hauteur,
  }));
}

/** Vrai si la période ne contient aucune connexion (ni succès ni échec). */
export function estVideAudit(a: Audit): boolean {
  return a.totaux.succes === 0 && a.totaux.echecs === 0;
}

/** Rappel RGPD affiché en tête : l'audit est strictement agrégé. */
export const RAPPEL_AUDIT =
  'Vue AGRÉGÉE — aucun suivi individuel, aucune adresse IP. Nombre de connexions réussies et échouées par ' +
  'tranche de temps (audit de sécurité), jamais « qui » ni « d’où ».';
