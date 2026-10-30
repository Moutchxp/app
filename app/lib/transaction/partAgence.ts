import { bilanVente, commissionNetteHt, LIBELLE_SOCIETE, societePorteuse, TVA, type Societe, type Vente } from './modele';
import { enHt, enTtc, remuneration, remunerationDuCote } from './commissions';
import { statutDePartie } from './statutLigne';
import { centimesRepartition } from './repartition';
import { enCentimes } from './detailCommissions';

/**
 * ══ 🔴 LOT AY (Arno, 30/10/2026) — « PART DE L'AGENCE » : 100 % DES HONORAIRES DE CHAQUE PARTIE VENTILÉS (PUR) ═════════════════════════════
 *
 * Dans chaque carte de partie (Vendeurs, Acquéreurs ; ligne miroir : chaque côté tenu par la société qui reçoit), lue avec la société de
 * l'écran : honoraires de la partie = commissions des négociateurs de cette société + quote-part de l'apporteur et des agences extérieures
 * + inter-cabinet versé à l'autre société + PART DE L'AGENCE (ce qui reste dans le CA de la société, non reversé). Au centime, dans chaque
 * unité : la part de l'agence est le reste exact des lignes affichées.
 *   · La base : « Honoraires partie vendeur / acquéreur » tels que la carte les affiche (commission nette × part de ce côté).
 *   · L'apporteur et les agences extérieures (payés par la porteuse, sur la commission avant répartition) : la quote-part de chaque côté est
 *     au PRORATA de sa part parmi les parties de nos sociétés (50 / 50 pour deux côtés égaux) ; leurs centimes sont ceux du lot AH
 *     (`centimesRepartition`), l'écart d'un centime reporté sur le dernier côté.
 *   · La commission d'un négociateur : celle enregistrée, sinon le calcul (taux × base) ; non commissionné : aucune.
 * EXCEPTION ASSOCIÉ : un associé de la société de la carte sur la vente (statut à la vente, commissionné ou non, d'entrée ou de sortie) : la
 * part de l'agence est rattachée à SON CA personnel ; deux associés : à parts égales (le centime d'écart sur le dernier). Ce rattachement
 * mesure le CA généré : il ne change NI le CA de la société, NI les Commissions versées, NI le Solde net, NI la synthèse.
 * Aucun calcul existant ne change : rien ici n'est lu par les tuiles ni par les fenêtres.
 */

export interface MontantC { htC: number; ttcC: number }
export interface QuotePart { cle: 'apporteur' | 'exterieure'; nom: string | null; total: MontantC; m: MontantC }
export interface CommissionCote { negociateur: string; m: MontantC }
export interface RattachementAssocie { nom: string; m: MontantC }
export interface VentilationCote {
  cote: 'entree' | 'sortie';
  /** La société qui garde la part de l'agence (celle de l'écran ; CA global : celle du côté). */
  societe: Societe;
  /** « Honoraires partie … » tels que la carte les affiche. */
  base: MontantC;
  /** La part de ce côté dans l'apporteur et les agences extérieures (% , pour l'écran). */
  pctQuote: number;
  quoteParts: QuotePart[];
  /** Les honoraires de la partie : base + quote-parts (= base sans apporteur ni agence extérieure). */
  honoraires: MontantC;
  commissions: CommissionCote[];
  /**
   * L'inter-cabinet versé à l'autre société sur ce côté (vue de la porteuse). 🔴 LOT BA — à titre d'information (hors total de la carte) : la
   * commission de son négociateur, payée par l'autre société (null : non commissionné), et la part de l'agence de l'autre société.
   */
  versee: { vers: Societe; m: MontantC; negociateur: string | null; taux: number | null; commission: MontantC | null; agenceAutre: MontantC } | null;
  /** 🔴 LOT BA — la commission de la vente (porteuse, CA global) : l'en-tête de la carte. */
  commissionVente: MontantC;
  /**
   * 🔴 LOT BB (Arno) — le(s) apporteur(s), déduits dans l'EN-TÊTE de chaque carte (« − Apporteur », son nom dessous), jamais dans sa ventilation :
   * « = Honoraires partie … : (commission − apporteur) × part % = … » — les honoraires NETS de la partie. Vide : sans apporteur (ou ligne miroir).
   */
  apporteurs: { nom: string | null; m: MontantC }[];
  /** 🔴 LOT BA — la ligne miroir : la société porteuse (« Honoraires reçus de … ») ; null : une vente de la société vue. */
  recuDe: Societe | null;
  agence: MontantC;
  /** Vide : la part reste dans le CA de la société ; sinon, rattachée au CA de ces associés. */
  associes: RattachementAssocie[];
}

const RIEN: MontantC = { htC: 0, ttcC: 0 };
const plus = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC + b.htC, ttcC: a.ttcC + b.ttcC });
const moins = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC - b.htC, ttcC: a.ttcC - b.ttcC });
/** Un montant TTC exact, en centimes dans les deux unités (ceux qu'affiche une ligne de calcul : TTC, et TTC ÷ 1,2). PUR. */
export const depuisTtc = (ttc: number): MontantC => ({ htC: enCentimes(ttc / TVA), ttcC: enCentimes(ttc) });
const SORTES = { entree: ['entree', 'entree_sortie'], sortie: ['sortie', 'entree_sortie'] } as const;

/** Partage `total` à parts égales entre `n` (le centime d'écart sur le dernier). PUR. */
export function partsEgales(total: MontantC, n: number): MontantC[] {
  const un = { htC: Math.floor(total.htC / n), ttcC: Math.floor(total.ttcC / n) };
  return Array.from({ length: n }, (_, i) => (i < n - 1 ? un : { htC: total.htC - un.htC * (n - 1), ttcC: total.ttcC - un.ttcC * (n - 1) }));
}

/** Partage `total` selon des poids (la somme des parts = le total ; l'écart sur le dernier). PUR. */
function auProrata(total: MontantC, poids: readonly number[]): MontantC[] {
  const somme = poids.reduce((t, x) => t + x, 0);
  if (somme === 0) return poids.map(() => RIEN);
  const out = poids.map((p) => ({ htC: Math.round((total.htC * p) / somme), ttcC: Math.round((total.ttcC * p) / somme) }));
  const dernier = out.length - 1;
  out[dernier] = moins(total, out.slice(0, -1).reduce(plus, RIEN));
  return out;
}

/** La commission d'un côté, au centime : celle enregistrée, sinon le calcul ; null : aucune (non commissionné, sans base). PUR. */
function commissionDe(r: ReturnType<typeof remuneration> | null): MontantC | null {
  if (r === null) return null;
  return r.saisie !== null ? { htC: enCentimes(enHt(r.saisie)), ttcC: enCentimes(enTtc(r.saisie)) } : depuisTtc(r.calculTtc);
}

/** Les associés (noms distincts) d'une société parmi les négociateurs d'entrée et de sortie de la vente (statut figé à la vente). PUR. */
function associesDe(v: Vente, s: Societe): string[] {
  const r = v.repartition;
  if (r == null) return [];
  const noms: string[] = [];
  for (const cote of ['entree', 'sortie'] as const) {
    const nego = cote === 'entree' ? v.dossier?.entree ?? null : v.dossier?.sortie ?? null;
    if (nego === null) continue;
    const p = r.parties.find((x) => x.compteId === nego.id && (SORTES[cote] as readonly string[]).includes(x.sorte)) ?? r.parties.find((x) => x.compteId === nego.id && x.sorte !== 'exterieure');
    if (p === undefined || p.societe !== s || statutDePartie(p) !== 'associe') continue;
    const nom = p.negociateur ?? nego.nom;
    if (!noms.includes(nom)) noms.push(nom);
  }
  return noms;
}

const rattacher = (agence: MontantC, noms: readonly string[]): RattachementAssocie[] =>
  noms.length === 0 || (agence.htC === 0 && agence.ttcC === 0) ? [] : partsEgales(agence, noms.length).map((m, i) => ({ nom: noms[i], m }));

/**
 * 🔴 LOT AY — LA VENTILATION DES CARTES DE PARTIE d'une vente, lue avec la société de l'écran (`vue` ; null : CA global). Une vente portée
 * par l'autre société : rien (c'est sa ligne miroir qui se lit ici). Sans répartition (historique) : rien — aucune part n'est inventée.
 * 🔴 LOT BA (Arno) — les honoraires de chaque partie = sa part au centime du lot AH (`centimesRepartition` : les MÊMES montants que la
 * Répartition, la fenêtre « Commissions versées » et la ligne miroir) + sa quote-part de l'apporteur et des agences extérieures : les deux
 * cartes font la commission de la vente, au centime (`controleVentilation`). PUR.
 */
export function ventilationVente(v: Vente, vue: Societe | null): Partial<Record<'entree' | 'sortie', VentilationCote>> {
  if (v.miroir != null) return ventilationMiroir(v);
  const r = v.repartition;
  if (r == null) return {};
  const porteuse = societePorteuse(v);
  if (vue !== null && vue !== porteuse) return {};
  const netHt = commissionNetteHt(v.honorairesTtc, r.retroApporteurTtc);
  const pctDe = (i: number): number => { const p = r.parties[i]; return p.pourcentage !== null ? p.pourcentage : netHt === 0 ? 0 : ((p.montantHt ?? 0) / netHt) * 100; };
  const cHt = centimesRepartition(r.parties, v.honorairesTtc, r.retroApporteurTtc, porteuse);
  const cTtc = centimesRepartition(r.parties, v.honorairesTtc, r.retroApporteurTtc, porteuse, 'ttc');
  const ah = cHt !== null && cTtc !== null;
  // Chaque côté : ses parties (une partie n'est comptée qu'une fois, même « entrée et sortie »), sa part (%), sa société, son négociateur.
  const prises = new Set<number>();
  const cotes = (['entree', 'sortie'] as const).flatMap((cote) => {
    const nego = cote === 'entree' ? v.dossier?.entree ?? null : v.dossier?.sortie ?? null;
    const sortes = SORTES[cote] as readonly string[];
    const ix = r.parties.map((p, i) => ({ p, i })).filter(({ p, i }) => !prises.has(i)
      && (nego !== null ? p.compteId === nego.id && sortes.includes(p.sorte) : p.compteId === null && p.sorte === cote)).map(({ i }) => i);
    ix.forEach((i) => prises.add(i));
    // Le même négociateur porte tout de l'autre côté : ce côté existe, à 0 %.
    if (ix.length === 0 && !(nego !== null && r.parties.some((p) => p.compteId === nego.id && p.sorte !== 'exterieure'))) return [];
    const part = ix.reduce((t, i) => t + pctDe(i), 0);
    const base: MontantC = ah ? { htC: Math.round(ix.reduce((t, i) => t + cHt!.parts[i], 0) * 100), ttcC: Math.round(ix.reduce((t, i) => t + cTtc!.parts[i], 0) * 100) }
      : depuisTtc((netHt * TVA * part) / 100);
    const societe = ix.map((i) => r.parties[i].societe).find((x) => x !== null) ?? (nego !== null ? r.parties.find((p) => p.compteId === nego.id && p.societe !== null)?.societe : undefined) ?? porteuse;
    return [{ cote, nego, part, base, societe }];
  });
  // Les quote-parts de l'apporteur et des agences extérieures (vue de la porteuse ou CA global : c'est elle qui les paie), au prorata.
  const pctInternes = r.parties.reduce((t, p, i) => t + (p.sorte === 'exterieure' ? 0 : pctDe(i)), 0);
  const poids = cotes.map((c) => c.part);
  // 🔴 LOT BB — l'apporteur est déduit dans l'en-tête de chaque carte (il n'est plus réparti entre les cartes) ; seules les agences extérieures
  // gardent leur quote-part dans la ventilation.
  const apporteurs = r.retroApporteurTtc === 0 ? [] : [{ nom: v.apporteur?.trim() || null,
    m: ah ? { htC: Math.round(cHt!.apporteurHt * 100), ttcC: Math.round(cTtc!.apporteurHt * 100) } : depuisTtc(r.retroApporteurTtc) }];
  const aRepartir: { cle: QuotePart['cle']; nom: string | null; total: MontantC }[] = [];
  r.parties.forEach((p, i) => {
    if (p.sorte !== 'exterieure') return;
    const total = ah ? { htC: Math.round(cHt!.parts[i] * 100), ttcC: Math.round(cTtc!.parts[i] * 100) } : depuisTtc((netHt * pctDe(i) * TVA) / 100);
    if (total.htC !== 0 || total.ttcC !== 0) aRepartir.push({ cle: 'exterieure', nom: p.nom?.trim() || null, total });
  });
  // La part de chaque côté : son poids parmi nos parties ; deux côtés qui font 100 % des parties de nos sociétés se partagent tout (écart
  // d'un centime sur le dernier) ; sinon (une partie de nos sociétés hors des deux côtés), chacun sa part arrondie.
  const toutes = Math.abs(poids.reduce((t, x) => t + x, 0) - pctInternes) < 1e-9 && pctInternes > 0;
  const quotes = aRepartir.map((q) => (toutes ? auProrata(q.total, poids)
    : poids.map((p) => (pctInternes === 0 ? RIEN : { htC: Math.round((q.total.htC * p) / pctInternes), ttcC: Math.round((q.total.ttcC * p) / pctInternes) }))));
  const commissionVente: MontantC = ah ? { htC: Math.round(cHt!.commissionHt * 100), ttcC: Math.round(cTtc!.commissionHt * 100) } : depuisTtc(v.honorairesTtc);
  const out: Partial<Record<'entree' | 'sortie', VentilationCote>> = {};
  cotes.forEach((c, i) => {
    const quoteParts: QuotePart[] = aRepartir.map((q, k) => ({ ...q, m: quotes[k][i] })).filter((q) => q.m.htC !== 0 || q.m.ttcC !== 0);
    const honoraires = quoteParts.reduce((t, q) => plus(t, q.m), c.base);
    const garde = vue ?? c.societe;
    const rem = c.nego === null ? null : remunerationDuCote(v, c.cote);
    const commission = commissionDe(rem);
    // L'inter-cabinet : ce côté travaille pour l'autre société — la porteuse lui verse ses honoraires (règle des tuiles : `bilanVente`) ; la
    // commission de son négociateur est payée par l'autre société (à titre d'information).
    const versee = vue !== null && c.societe !== vue && bilanVente(v, vue).verseHt[c.societe] > 0
      ? { vers: c.societe, m: c.base, negociateur: c.nego?.nom ?? null, taux: rem?.taux ?? null, commission, agenceAutre: commission === null ? c.base : moins(c.base, commission) } : null;
    const commissions: CommissionCote[] = versee === null && c.nego !== null && commission !== null ? [{ negociateur: c.nego.nom, m: commission }] : [];
    const agence = commissions.reduce((t, x) => moins(t, x.m), versee === null ? c.base : moins(c.base, versee.m));
    out[c.cote] = { cote: c.cote, societe: garde, base: c.base, pctQuote: pctInternes === 0 ? 0 : (c.part / pctInternes) * 100, quoteParts, honoraires, commissions, versee, agence,
      associes: rattacher(agence, associesDe(v, garde)), commissionVente, apporteurs, recuDe: null };
  });
  return out;
}

/** 🔴 LOT AY — la ligne miroir : chaque côté tenu par la société qui reçoit, à partir de SA part reçue (la base de ce côté). PUR. */
function ventilationMiroir(v: Vente): Partial<Record<'entree' | 'sortie', VentilationCote>> {
  const m = v.miroir!;
  const s = v.societe;
  const associes = [...new Set(m.cotes.filter((x) => x.statut === 'associe').map((x) => x.negociateur))];
  const out: Partial<Record<'entree' | 'sortie', VentilationCote>> = {};
  for (const x of m.cotes) {
    const base = depuisTtc(x.baseTtc);
    const ligne = v.lignes.find((l) => l.role === 'negociateur' && l.cote === x.cote);
    const c = x.commissionne === false ? null : commissionDe(remuneration(x.baseTtc, ligne));
    const commissions = c === null ? [] : [{ negociateur: x.negociateur, m: c }];
    const agence = commissions.reduce((t, k) => moins(t, k.m), base);
    out[x.cote] = { cote: x.cote, societe: s, base, pctQuote: 100, quoteParts: [], honoraires: base, commissions, versee: null, agence, associes: rattacher(agence, associes),
      commissionVente: depuisTtc(v.honorairesTtc), apporteurs: [], recuDe: m.porteuse };
  }
  return out;
}

/** 🔴 LOT BA — le contrôle de la ventilation d'une affaire : attendu, ventilé (la somme des cadres des cartes), écart (attendu − ventilé). */
export interface ControleVentilation { attendu: MontantC; ventile: MontantC; ecart: MontantC }

/**
 * 🔴 LOT BA (Arno) — LE CONTRÔLE PERMANENT : la somme de TOUS les cadres des cartes de partie (vert + rouge : commissions, quote-parts,
 * inter-cabinet versé, parts de l'agence ; jamais les lignes « dont » d'information) — 🔴 LOT BB : + le(s) apporteur(s) de l'en-tête — = la
 * commission de la vente (porteuse, CA global) ou la part reçue (ligne miroir), au centime, en HT et en TTC. null : rien à contrôler (historique sans répartition, vente lue chez l'autre
 * société). Un écart = des données incomplètes (une partie qui n'est ni l'entrée ni la sortie, une répartition qui ne fait pas 100 %). PUR.
 */
export function controleVentilation(v: Vente, vue: Societe | null): ControleVentilation | null {
  const vt = ventilationVente(v, vue);
  const cartes = Object.values(vt).filter((x): x is VentilationCote => x !== undefined);
  if (v.miroir == null && (v.repartition == null || (vue !== null && vue !== societePorteuse(v)))) return null;
  // 🔴 LOT BB — les honoraires nets des cartes (la somme de leurs cadres) + le(s) apporteur(s), comptés une fois.
  const cadres = cartes.reduce((t, c) => [...c.commissions.map((x) => x.m), ...c.quoteParts.map((x) => x.m), ...(c.versee === null ? [] : [c.versee.m]), c.agence].reduce(plus, t), RIEN);
  const ventile = (cartes[0]?.apporteurs ?? []).reduce((t, a) => plus(t, a.m), cadres);
  const attendu = v.miroir != null ? { htC: enCentimes(v.miroir.partHt), ttcC: enCentimes(v.honorairesTtc) } : cartes[0]?.commissionVente ?? commissionDeVente(v);
  return { attendu, ventile, ecart: moins(attendu, ventile) };
}

/** La commission de la vente au centime (règle du lot AH ; à défaut, l'arrondi simple). PUR. */
function commissionDeVente(v: Vente): MontantC {
  const r = v.repartition;
  const c = r == null ? null : centimesRepartition(r.parties, v.honorairesTtc, r.retroApporteurTtc, societePorteuse(v));
  const t = r == null ? null : centimesRepartition(r.parties, v.honorairesTtc, r.retroApporteurTtc, societePorteuse(v), 'ttc');
  return c !== null && t !== null ? { htC: Math.round(c.commissionHt * 100), ttcC: Math.round(t.commissionHt * 100) } : depuisTtc(v.honorairesTtc);
}

/** La mention de la part de l'agence (le rattachement, ou ce qu'elle devient). PUR. */
export function mentionPartAgence(x: Pick<VentilationCote, 'societe' | 'associes'> & Partial<Pick<VentilationCote, 'versee'>>): string {
  const n = x.associes.map((a) => a.nom);
  // Inter-cabinet : les honoraires de ce côté sont versés à l'autre société — la mention le dit (le montant seul ne le dirait pas).
  const verse = x.versee == null ? '' : ` ; honoraires de ce côté versés en inter-cabinet à ${LIBELLE_SOCIETE[x.versee.vers]}`;
  if (n.length === 0) return `Reste dans le CA de ${LIBELLE_SOCIETE[x.societe]} — non reversé${verse}`;
  if (n.length === 1) return `Rattachée au CA de ${n[0]} (associé)`;
  if (n.length === 2) return `Rattachée pour moitié au CA de ${n[0]} et de ${n[1]} (associés)`;
  return `Rattachée à parts égales au CA de ${n.slice(0, -1).join(', ')} et de ${n[n.length - 1]} (associés)`;
}

/**
 * 🔴 LOT AY — LE CA GÉNÉRÉ (HT) par négociateur sur des ventes : la part de l'agence qui lui est rattachée (associés) ; la colonne « CA
 * généré » y ajoute ses commissions (la paye). Le CA de la société n'en change pas. PUR.
 */
export function partAgenceRattacheeHt(ventes: readonly Vente[], vue: Societe | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const v of ventes) {
    if (v.statut === 'annulee') continue;
    for (const c of Object.values(ventilationVente(v, vue))) for (const a of c?.associes ?? []) out.set(a.nom, (out.get(a.nom) ?? 0) + a.m.htC / 100);
  }
  return out;
}
