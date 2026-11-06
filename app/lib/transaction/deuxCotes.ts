import { enHt, enTtc, montantDeLigne, TAUX_REMUNERATION_DEFAUT } from './commissions';
import { enCentimes } from './detailCommissions';
import type { Vente } from './modele';
import type { CommissionCote, MontantC, QuotePart, VentilationCote } from './partAgence';

/**
 * ══ 🔴 Arno (06/11/2026) — UNE AFFAIRE TENUE DES DEUX CÔTÉS PAR LE MÊME NÉGOCIATEUR : LA CARTE DE « MON ESPACE » LA PRÉSENTE UNE SEULE FOIS ══════
 * Les honoraires, la com négo et la part de l'agence de l'AFFAIRE ENTIÈRE, côté vendeurs ; côté acquéreurs, une mention. PRÉSENTATION seule :
 * rien d'enregistré ne change, ni les totaux (la somme des deux côtés de la ventilation, au centime).
 *   · la com négo de chaque côté : celle ENREGISTRÉE (ce qui compte), sinon le calcul sur les honoraires RÉELLEMENT attribués à ce côté (sa base
 *     de la ventilation × son taux) — jamais sur des honoraires d'un autre côté ;
 *   · jamais de montant négatif : des commissions enregistrées supérieures aux honoraires de l'affaire ne s'affichent pas en « part de l'agence »
 *     négative — l'écran le signale (`alerte`).
 * null : pas le même négociateur des deux côtés, ou un cas que la présentation commune ne couvre pas (inter-cabinet, associé) — la carte d'avant. PUR.
 */

export interface CommissionDeuxCotes { cote: 'entree' | 'sortie'; m: MontantC; source: 'enregistree' | 'calcul'; base: MontantC; taux: number }
export interface FusionDeuxCotes {
  /** La ventilation de l'affaire entière (sur le côté vendeurs). */
  x: VentilationCote;
  /** Les commissions non nulles, par côté (leur somme est la com négo de l'affaire). */
  commissions: CommissionDeuxCotes[];
  total: MontantC;
  /** Les commissions dépassent les honoraires : la part de l'agence n'est pas affichée (jamais négative), un message le dit. */
  alerte: boolean;
}

const RIEN: MontantC = { htC: 0, ttcC: 0 };
const plus = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC + b.htC, ttcC: a.ttcC + b.ttcC });
const moins = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC - b.htC, ttcC: a.ttcC - b.ttcC });
const nul = (m: MontantC): boolean => m.htC === 0 && m.ttcC === 0;

/** Le même négociateur (compte) à l'entrée et à la sortie du mandat. PUR. */
export function memeNegociateurDeuxCotes(v: Pick<Vente, 'dossier'>): boolean {
  const e = v.dossier?.entree ?? null;
  const s = v.dossier?.sortie ?? null;
  return e !== null && s !== null && e.id === s.id;
}

/** La com négo d'un côté : l'enregistrée, sinon le calcul sur sa base ; null : non commissionné (la ventilation n'en porte pas). PUR. */
function commissionDe(v: Pick<Vente, 'lignes'>, c: VentilationCote): CommissionDeuxCotes | null {
  if (c.commissions.length === 0) return null;
  const ligne = v.lignes.find((l) => l.role === 'negociateur' && l.cote === c.cote);
  const taux = ligne?.taux ?? TAUX_REMUNERATION_DEFAUT;
  const saisie = ligne === undefined ? null : montantDeLigne(ligne);
  const calcul = { htC: Math.round((c.base.htC * taux) / 100), ttcC: Math.round((c.base.ttcC * taux) / 100) };
  const m = saisie !== null ? { htC: enCentimes(enHt(saisie)), ttcC: enCentimes(enTtc(saisie)) } : calcul;
  // L'enregistrée qui EST le calcul (au centime, hors saisie à la main) se lit « base × taux » ; sinon « commission enregistrée ».
  const egaleAuCalcul = ligne?.mode !== 'manuelle' && Math.abs(m.ttcC - calcul.ttcC) <= 1;
  return { cote: c.cote, m, source: saisie === null || egaleAuCalcul ? 'calcul' : 'enregistree', base: c.base, taux };
}

/** Les quote-parts des deux côtés, réunies (même nature, même nom : une ligne). PUR. */
function reunir(qs: readonly QuotePart[]): QuotePart[] {
  const out: QuotePart[] = [];
  for (const q of qs) {
    const deja = out.find((x) => x.cle === q.cle && x.nom === q.nom);
    if (deja === undefined) out.push({ ...q });
    else deja.m = plus(deja.m, q.m);
  }
  return out;
}

export function fusionDeuxCotes(v: Pick<Vente, 'dossier' | 'lignes'>, vent: Partial<Record<'entree' | 'sortie', VentilationCote>>): FusionDeuxCotes | null {
  if (!memeNegociateurDeuxCotes(v)) return null;
  const e = vent.entree;
  if (e === undefined) return null;
  const cotes = [e, ...(vent.sortie === undefined ? [] : [vent.sortie])];
  if (cotes.some((c) => c.versee !== null || c.conserve !== null)) return null;
  const base = cotes.reduce((t, c) => plus(t, c.base), RIEN);
  const commissions = cotes.map((c) => commissionDe(v, c)).filter((c): c is CommissionDeuxCotes => c !== null && !nul(c.m));
  const total = commissions.reduce((t, c) => plus(t, c.m), RIEN);
  const agence = moins(base, total);
  const alerte = agence.htC < 0 || agence.ttcC < 0;
  const negociateur = e.commissions[0]?.negociateur ?? v.dossier?.entree?.nom ?? '';
  const x: VentilationCote = {
    ...e, base, honoraires: cotes.reduce((t, c) => plus(t, c.honoraires), RIEN), pctQuote: cotes.reduce((t, c) => t + c.pctQuote, 0),
    quoteParts: reunir(cotes.flatMap((c) => c.quoteParts)),
    commissions: commissions.map((c): CommissionCote => ({ negociateur, m: c.m })),
    agence: alerte ? RIEN : agence, associes: [],
  };
  return { x, commissions, total, alerte };
}
