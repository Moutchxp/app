import { espaceNegociateurs, lignesCarteAffaire, resultatDesCartes } from '../transaction/carteAffaireLignes';
import { APPORTEUR_NON_NOMME, type Retrocession, type Societe, type Vente } from '../transaction/modele';
import { depuisTtc, type MontantC } from '../transaction/partAgence';
import type { StatutDuLibelle } from '../transaction/statutLigne';
import type { Moi } from './mesAffaires';

/**
 * ══ 🔴 D27 / D28 (Arno, 03/11/2026) — L'ONGLET « COMPROMIS » : 4 CARTES EN TÊTE ET « PAR APPORTEUR D'AFFAIRES — COMPROMIS EN COURS » (PUR) ═════════
 * Sur les compromis en cours AFFICHÉS dans la liste, avec les fonctions des cartes d'affaire (`lignesCarteAffaire`, `espaceNegociateurs`,
 * `resultatDesCartes`) — une seule comptabilité, aucun calcul recopié :
 *   1. « Volume d'affaires » : la commission de chaque affaire, ENTIÈRE (la somme des cartes) ;
 *   2. « Compromis en cours » : leur nombre ;
 *   3. « Reversé » : ce qui part à d'autres — dont collègues (le côté d'un autre collaborateur, la part d'un co-négociateur, le côté de l'autre
 *      structure en inter-cabinet, les agences extérieures), dont négociateurs (les commissions déduites — décision A d'Arno), dont apporteurs
 *      (l'apporteur de la répartition et les rétrocessions rattachées) ;
 *   4. « Chiffre d'affaires net » = 1 − 3 : la somme des « reste » (mode agence) ; « Mon espace » : MA PART NETTE (`maPart.net`, sans ma propre
 *      commission). Chaque terme de la carte 3 est calculé pour lui-même : l'égalité 1 − 3 = 4 est un CONTRÔLE (épreuves), jamais forcée.
 * Confidentialité (décision 2) : en « Mon espace », le serveur calcule ces montants sur la vente ENTIÈRE et n'envoie que leurs totaux par affaire —
 * « dont collègues » est la part d'honoraires du côté de l'autre (déjà sur la ligne), jamais sa commission ; « dont négociateurs », la mienne.
 */

const RIEN: MontantC = { htC: 0, ttcC: 0 };
const plus = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC + b.htC, ttcC: a.ttcC + b.ttcC });
const moins = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC - b.htC, ttcC: a.ttcC - b.ttcC });
const somme = (xs: readonly MontantC[]): MontantC => xs.reduce(plus, RIEN);
type Opts = { retros?: readonly Retrocession[]; statutDuLibelle?: StatutDuLibelle };

/** Un apporteur et ce qui lui est versé sur une affaire. */
export interface VerseApporteur { nom: string; m: MontantC }
/** Ce qu'une affaire verse à d'autres, et son volume (affaire entière). */
export interface VerseAffaire { ca: MontantC; collegues: MontantC; negociateurs: MontantC; apporteurs: MontantC; parApporteur: VerseApporteur[] }

/**
 * Les apporteurs d'une affaire et leur part, au centime : l'apporteur de la répartition (le montant de la carte), puis les rétrocessions rattachées,
 * groupées par nom (`parApporteur` : le nom de la rétrocession, sinon celui de la vente, sinon « Apporteur non nommé ») — leur somme est celle de la
 * carte (`l.retro`), l'écart de centime sur le dernier groupe. PUR.
 */
export function apporteursDeLAffaire(v: Vente, vue: Societe | null, o: Opts = {}): VerseApporteur[] {
  const l = lignesCarteAffaire(v, vue, o);
  const nomVente = v.apporteur?.trim() || APPORTEUR_NON_NOMME;
  const out: VerseApporteur[] = l.apporteur === null ? [] : [{ nom: nomVente, m: l.apporteur }];
  if (l.retro === null) return out;
  const groupes = new Map<string, number>();
  for (const r of o.retros ?? []) if (r.venteId === v.id) { const n = r.apporteur?.trim() || nomVente; groupes.set(n, (groupes.get(n) ?? 0) + r.montantTtc); }
  const noms = [...groupes.keys()];
  let reste = l.retro;
  noms.forEach((n, i) => { const m = i === noms.length - 1 ? reste : depuisTtc(groupes.get(n)!); reste = moins(reste, m); out.push({ nom: n, m }); });
  // regroupe un nom présent deux fois (l'apporteur de la répartition ET une rétrocession à son nom)
  return [...out.reduce((g, x) => g.set(x.nom, plus(g.get(x.nom) ?? RIEN, x.m)), new Map<string, MontantC>())].map(([nom, m]) => ({ nom, m }));
}

/**
 * « Mon espace » : ce qu'une de MES affaires verse à d'autres, sur la vente ENTIÈRE (vue FUSION, comme `monCa` / `monCaNet`). Les lignes de
 * l'Espace par négociateur (`espaceNegociateurs`) : les miennes (mes libellés) et celles des autres ; les apporteurs et l'inter-cabinet, sur la carte.
 *   · collègues = pour chaque ligne d'un autre : son CA généré, sans sa part des rétrocessions, plus l'inter-cabinet qu'elle reverse ; plus ce que mes
 *     lignes reversent ; plus les agences extérieures ;
 *   · négociateurs = MA commission déduite ; apporteurs = l'apporteur de la répartition + les rétrocessions rattachées. PUR.
 */
export function verseAffairePerso(v: Vente, moi: Moi, o: Opts = {}): VerseAffaire {
  const l = lignesCarteAffaire(v, null, o);
  const reverse = (nom: string): MontantC => somme(l.lignes.filter((x) => x.nom === nom).map((x) => x.reverse?.m ?? RIEN));
  const lignes = espaceNegociateurs([v], null, o);
  const miennes = lignes.filter((x) => moi.libelles.has(x.negociateur));
  const autres = lignes.filter((x) => !moi.libelles.has(x.negociateur));
  const collegues = somme([...autres.map((x) => plus(moins(x.ca, x.retro), reverse(x.negociateur))), ...miennes.map((x) => reverse(x.negociateur)),
    ...l.lignes.flatMap((x) => x.exterieures.map((y) => y.m))]);
  return { ca: resultatDesCartes([v], null, o).ca, collegues, negociateurs: somme(miennes.map((x) => x.comDeduite)),
    apporteurs: plus(l.apporteur ?? RIEN, l.retro ?? RIEN), parApporteur: apporteursDeLAffaire(v, null, o) };
}

/** Mode agence : ce qu'une affaire de la structure verse hors d'elle (la carte de la structure, `resultatDesCartes`). PUR. */
export function verseAffaireAgence(v: Vente, vue: Societe | null, o: Opts = {}): VerseAffaire {
  const r = resultatDesCartes([v], vue, o);
  return { ca: r.ca, collegues: plus(r.interCabinet, r.exterieur), negociateurs: r.com, apporteurs: r.retro, parApporteur: apporteursDeLAffaire(v, vue, o) };
}

/** Les 4 cartes : sur les affaires affichées, leur « versé » et leur montant net (« Mon espace » : ma part nette ; agence : la somme des « reste »). */
export interface CartesCompromis { volume: MontantC; nb: number; reverse: MontantC; collegues: MontantC; negociateurs: MontantC; apporteurs: MontantC; net: MontantC }
export function cartesCompromis(xs: readonly { verse: VerseAffaire; net: MontantC }[]): CartesCompromis {
  const collegues = somme(xs.map((x) => x.verse.collegues));
  const negociateurs = somme(xs.map((x) => x.verse.negociateurs));
  const apporteurs = somme(xs.map((x) => x.verse.apporteurs));
  return { volume: somme(xs.map((x) => x.verse.ca)), nb: xs.length, reverse: somme([collegues, negociateurs, apporteurs]), collegues, negociateurs, apporteurs,
    net: somme(xs.map((x) => x.net)) };
}

/** Une ligne du tableau « Par apporteur d'affaires » (les deux onglets) : ses affaires, leurs honoraires, ce qui lui est versé. */
export interface LigneTableauApporteur { apporteur: string; ids: number[]; ca: { ht: number; ttc: number }; verse: { ht: number; ttc: number } }
const enEuros = (m: MontantC): { ht: number; ttc: number } => ({ ht: m.htC / 100, ttc: m.ttcC / 100 });

/**
 * « Par apporteur d'affaires — compromis en cours » : chaque apporteur des affaires affichées, le nombre de ses compromis, leurs honoraires (affaire
 * entière) et ses commissions à verser — au centime : le total = « dont apporteurs » de la carte 3. Tri : le plus versé d'abord. PUR.
 */
export function tableauApporteursCompromis(xs: readonly { id: number; verse: VerseAffaire }[]): LigneTableauApporteur[] {
  const g = new Map<string, { ids: number[]; ca: MontantC; verse: MontantC }>();
  for (const x of xs) for (const a of x.verse.parApporteur) {
    const e = g.get(a.nom) ?? { ids: [], ca: RIEN, verse: RIEN };
    g.set(a.nom, { ids: e.ids.includes(x.id) ? e.ids : [...e.ids, x.id], ca: e.ids.includes(x.id) ? e.ca : plus(e.ca, x.verse.ca), verse: plus(e.verse, a.m) });
  }
  return [...g].map(([apporteur, e]) => ({ apporteur, ids: e.ids, ca: enEuros(e.ca), verse: enEuros(e.verse) }))
    .sort((a, b) => b.verse.ht - a.verse.ht || a.apporteur.localeCompare(b.apporteur, 'fr'));
}

const SANS_VERSE: VerseAffaire = { ca: RIEN, collegues: RIEN, negociateurs: RIEN, apporteurs: RIEN, parApporteur: [] };
/** « Mon espace » : les compromis affichés, avec ce que le serveur a calculé pour chacun (`verse`) et MA PART NETTE (`maPart.net`). PUR. */
export const affairesCompromisPerso = (vs: readonly { id: number; verse?: VerseAffaire; maPart?: { net: MontantC } }[]): { id: number; verse: VerseAffaire; net: MontantC }[] =>
  vs.map((v) => ({ id: v.id, verse: v.verse ?? SANS_VERSE, net: v.maPart?.net ?? RIEN }));
/** Mode agence : les compromis affichés de la structure, chacun sa carte (le « reste » : la somme des « reste » de ses lignes). PUR. */
export const affairesCompromisAgence = (vs: readonly Vente[], vue: Societe | null, o: Opts = {}): { id: number; verse: VerseAffaire; net: MontantC }[] =>
  vs.map((v) => ({ id: v.id, verse: verseAffaireAgence(v, vue, o), net: resultatDesCartes([v], vue, o).reste }));
