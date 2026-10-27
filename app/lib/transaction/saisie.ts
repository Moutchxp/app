import { estSociete, STATUTS, type RoleLigne, type Societe, type StatutVente } from './modele';

/**
 * TUILE « TRANSACTION » — la LECTURE d'une saisie venue de l'écran (vente, rétrocession, gestion du mois), avant toute écriture.
 * PUR : rend la saisie propre, ou le motif du refus (en français, montré tel quel). Aucun arrondi : les montants restent ceux saisis.
 */

export interface PartSaisie { negociateur: string; role: RoleLigne; montantTtc: number | null }
export interface VenteSaisie {
  societe: Societe;
  libelle: string;
  honorairesTtc: number;
  statut: StatutVente;
  annee: number;
  mois: number | null;
  dateCompromis: string | null;
  apporteur: string | null;
  note: string | null;
  parts: PartSaisie[];
}
/** Les champs modifiables d'une vente (une modification n'en porte que certains). */
export type ChampsVente = Partial<Omit<VenteSaisie, 'societe' | 'parts'>>;

export interface RetroSaisie { societe: Societe; annee: number; mois: number; negociateur: string; montantTtc: number; apporteur: string | null; venteId: number | null }
export interface GestionSaisie { nbLots: number | null; honorairesHt: number | null; adhocHt: number | null; salarieHt: number | null; resteHt: number | null; note: string | null }

type Lu<T> = { ok: true; valeur: T } | { ok: false; motif: string };
const refus = <T>(motif: string): Lu<T> => ({ ok: false, motif });

const texte = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x.trim() : null);
/** Un montant : nombre fini, ou texte « 1 234,56 » ; `undefined` : illisible. */
export function montant(x: unknown): number | null | undefined {
  if (x === null || x === undefined || x === '') return null;
  if (typeof x === 'number') return Number.isFinite(x) ? x : undefined;
  if (typeof x !== 'string') return undefined;
  const t = x.replace(/[\s  €]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return undefined;
  return Number(t);
}
const entier = (x: unknown, min: number, max: number): number | null | undefined => {
  if (x === null || x === undefined || x === '') return null;
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};
const dateIso = (x: unknown): string | null | undefined => {
  if (x === null || x === undefined || x === '') return null;
  return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(`${x}T00:00:00Z`)) ? x : undefined;
};
const ROLES: readonly RoleLigne[] = ['negociateur', 'part', 'vendeur'];

function lireChamps(c: Record<string, unknown>, tous: boolean): Lu<ChampsVente> {
  const v: ChampsVente = {};
  if (tous || 'libelle' in c) { const l = texte(c.libelle); if (l === null) return refus('Le libellé (vendeur / acquéreur) est obligatoire.'); v.libelle = l; }
  if (tous || 'honorairesTtc' in c) {
    const m = montant(c.honorairesTtc);
    if (m === undefined || m === null || m < 0) return refus('Les honoraires TTC doivent être un montant positif ou nul.');
    v.honorairesTtc = m;
  }
  if (tous || 'statut' in c) { if (!STATUTS.includes(c.statut as StatutVente)) return refus('Statut inconnu.'); v.statut = c.statut as StatutVente; }
  if (tous || 'annee' in c) { const a = entier(c.annee, 2000, 2100); if (a === undefined || a === null) return refus('Année invalide.'); v.annee = a; }
  if (tous || 'mois' in c) { const m = entier(c.mois, 1, 12); if (m === undefined) return refus('Mois invalide (1 à 12, ou vide : « mois à confirmer »).'); v.mois = m; }
  if (tous || 'dateCompromis' in c) { const d = dateIso(c.dateCompromis); if (d === undefined) return refus('Date du compromis invalide (AAAA-MM-JJ).'); v.dateCompromis = d; }
  if (tous || 'apporteur' in c) v.apporteur = texte(c.apporteur);
  if (tous || 'note' in c) v.note = texte(c.note);
  return { ok: true, valeur: v };
}

export function lireVente(brut: unknown): Lu<VenteSaisie> {
  if (brut === null || typeof brut !== 'object') return refus('Saisie illisible.');
  const c = brut as Record<string, unknown>;
  if (!estSociete(c.societe)) return refus('Société inconnue.');
  const ch = lireChamps(c, true);
  if (!ch.ok) return ch;
  const parts: PartSaisie[] = [];
  for (const p of Array.isArray(c.parts) ? c.parts : []) {
    const o = (p ?? {}) as Record<string, unknown>;
    const n = texte(o.negociateur);
    if (n === null) continue; // une ligne vide de l'écran ne compte pas
    if (!ROLES.includes(o.role as RoleLigne)) return refus(`Rôle inconnu pour ${n}.`);
    const m = montant(o.montantTtc);
    if (m === undefined || (m !== null && m < 0)) return refus(`Montant illisible pour ${n}.`);
    parts.push({ negociateur: n, role: o.role as RoleLigne, montantTtc: m });
  }
  const v = ch.valeur as Required<ChampsVente>;
  return { ok: true, valeur: { societe: c.societe, libelle: v.libelle, honorairesTtc: v.honorairesTtc, statut: v.statut, annee: v.annee, mois: v.mois,
    dateCompromis: v.dateCompromis, apporteur: v.apporteur, note: v.note, parts } };
}

/** Une modification : au moins un champ, chacun relu comme à la saisie. */
export function lireModification(brut: unknown): Lu<ChampsVente> {
  if (brut === null || typeof brut !== 'object') return refus('Modification illisible.');
  const r = lireChamps(brut as Record<string, unknown>, false);
  if (r.ok && Object.keys(r.valeur).length === 0) return refus('Aucun champ à modifier.');
  return r;
}

export function lireRetro(brut: unknown): Lu<RetroSaisie> {
  const c = (brut ?? {}) as Record<string, unknown>;
  if (!estSociete(c.societe)) return refus('Société inconnue.');
  const annee = entier(c.annee, 2000, 2100);
  const mois = entier(c.mois, 1, 12);
  if (annee === undefined || annee === null || mois === undefined || mois === null) return refus('Mois invalide.');
  const n = texte(c.negociateur);
  if (n === null) return refus('Le négociateur est obligatoire.');
  const m = montant(c.montantTtc);
  if (m === undefined || m === null) return refus('Le montant est obligatoire.');
  const vid = entier(c.venteId, 1, Number.MAX_SAFE_INTEGER);
  if (vid === undefined) return refus('Vente inconnue.');
  return { ok: true, valeur: { societe: c.societe, annee, mois, negociateur: n, montantTtc: m, apporteur: texte(c.apporteur), venteId: vid } };
}

export function lireGestion(brut: unknown): Lu<GestionSaisie> {
  const c = (brut ?? {}) as Record<string, unknown>;
  const lots = entier(c.nbLots, 0, 100000);
  if (lots === undefined) return refus('Nombre de lots invalide.');
  const champs = ['honorairesHt', 'adhocHt', 'salarieHt', 'resteHt'] as const;
  const lus: Record<string, number | null> = {};
  for (const k of champs) {
    const m = montant(c[k]);
    if (m === undefined) return refus('Montant illisible.');
    lus[k] = m;
  }
  return { ok: true, valeur: { nbLots: lots, honorairesHt: lus.honorairesHt, adhocHt: lus.adhocHt, salarieHt: lus.salarieHt, resteHt: lus.resteHt, note: texte(c.note) } };
}
