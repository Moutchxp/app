/**
 * ══ LOCATION — « OUTILS DE SUIVI » : L'IMPORT DES LIGNES D'OCTOBRE 2026 DU FICHIER D'ARNO (27/10/2026). MODULE PUR ══════════════════
 *
 * Décisions d'Arno :
 *   1. seul OCTOBRE 2026 change (onglet « Oct ») — les autres mois sont prouvés identiques par leur empreinte avant / après ;
 *   2. les lignes d'octobre DÉJÀ SAISIES ne sont pas touchées : reconnues à « même mois + même locataire ou propriétaire + même
 *      montant », listées « déjà saisie, non modifiée » ;
 *   3. les autres lignes sont ajoutées (attendu : 12 lignes, 9 749,24 € HT) ;
 *   4. la logique est EXACTEMENT celle de la reprise du suivi mensuel (`planImport.planifier`, `versActivite`, `rapprocher`) ;
 *   5. rattachement aux fiches EXISTANTES seulement quand il est sans ambiguïté — le numéro de lot du fichier (« NGO 421 ») est lu ;
 *      sinon « à rattacher », avec les candidats ; aucune fiche n'est créée ;
 *   6. tout porte la marque de l'import, journalisé, et `--annuler` désactive (jamais ne supprime) ce qui a été ajouté.
 *
 * Aucune base ici : le dépôt (`importOctobreRepo`) lit et écrit, le script assemble.
 */
import type { LigneExcel } from './lectureExcel';
import { ressemblance, scoreLigne, SEUIL_DOUTEUX, SEUIL_RATTACHE, type CandidatBail, type Rapprochement } from './rapprochementImport';

export const MOIS_OCTOBRE = '2026-10';
export const ONGLET_OCTOBRE = 'Oct';
/** Les clés d'import de ces lignes : celles de la reprise (« CA_JBP_2026#2026-10#<ligne> »), pour qu'un import ne double jamais l'autre. */
export const PREFIXE_CLE = `CA_JBP_2026#${MOIS_OCTOBRE}#`;
/** La marque posée sur chaque ligne ajoutée (`cree_par_libelle`) ; `--annuler` ne vise que les lignes qui la portent. */
export const MARQUE = 'import fichier octobre 2026';
export const marqueDuJour = (jourJJMM: string): string => `${MARQUE} du ${jourJJMM}`;
/** Arno (décision 3) : ce qui doit être ajouté. Un écart et `--appliquer` refuse d'écrire. */
export const ATTENDU = { lignes: 12, totalHt: 9749.24 } as const;

const centimes = (x: number): number => Math.round(x * 100);
export const caDe = (l: Pick<LigneExcel, 'honoProprietaireHt' | 'honoLocataireHt'>): number => l.honoProprietaireHt + l.honoLocataireHt;

/** Une ligne d'octobre déjà en base (saisie, ou importée autrement que par ce script). */
export interface LigneExistante { id: number; proprietaire: string; locataire: string; hp: number; hl: number; source: string; importCle: string | null }

/**
 * Décision 2 — « même mois + même locataire ou propriétaire + même montant ». Le mois est celui de la lecture (octobre) ; le nom se
 * compare avec la ressemblance de la reprise (`ressemblance` ≥ 0,5 : au moins la moitié des mots du plus court) ; le montant au centime.
 * Une ligne existante ne sert qu'une fois. PUR.
 */
export function reconnaitreDejaSaisies(lignes: readonly LigneExcel[], existantes: readonly LigneExistante[]): Map<string, LigneExistante> {
  const prises = new Set<number>();
  const out = new Map<string, LigneExistante>();
  for (const l of lignes) {
    const e = existantes.find((x) => !prises.has(x.id) && centimes(x.hp + x.hl) === centimes(caDe(l))
      && ((l.locataire.trim() !== '' && x.locataire.trim() !== '' && ressemblance(l.locataire, x.locataire) >= 0.5)
        || (l.proprietaire.trim() !== '' && x.proprietaire.trim() !== '' && ressemblance(l.proprietaire, x.proprietaire) >= 0.5)));
    if (e !== undefined) { prises.add(e.id); out.set(l.cle, e); }
  }
  return out;
}

/** Le numéro de lot écrit après le nom du propriétaire (« NGO 421 », « DE MIRAMON 1003 ») : 2 à 5 chiffres, dernier mot. PUR. */
export function numeroDeLot(proprietaire: string): string | null {
  const m = proprietaire.trim().match(/(?:^|\s)(\d{2,5})$/);
  return m === null ? null : m[1];
}

/** Ce que le lot d'un bail porte comme numéros (porte, n° de lot de copropriété) — lus en base. */
export type NumerosDesLots = ReadonlyMap<number, readonly string[]>;

/**
 * Décision 5 — le score de la reprise (`scoreLigne`), et le NUMÉRO DE LOT quand le fichier le donne :
 *   · le lot du bail porte ce numéro ⇒ le numéro est retiré du nom avant le score (il n'est pas un mot du nom du propriétaire) ;
 *   · le lot porte un AUTRE numéro ⇒ ce bail n'est pas candidat (jamais un rattachement au mauvais appartement) ;
 *   · le lot n'a aucun numéro ⇒ le score de la reprise, tel quel. PUR.
 */
export function scoreAvecLot(l: LigneExcel, c: CandidatBail, numeros: NumerosDesLots): number {
  const n = numeroDeLot(l.proprietaire);
  if (n === null) return scoreLigne(l, c);
  const siens = (numeros.get(c.lotId) ?? []).map((x) => x.trim()).filter((x) => x !== '');
  if (siens.length === 0) return scoreLigne(l, c);
  if (!siens.includes(n)) return 0;
  return scoreLigne({ ...l, proprietaire: l.proprietaire.trim().replace(/\s+\d{2,5}$/, '') }, c);
}

export interface Rattachement {
  rapprochement: Rapprochement;
  /** Les candidats (meilleurs scores), pour le rapport d'une ligne « à rattacher ». */
  candidats: { c: CandidatBail; score: number }[];
  /** Deux baux au-dessus du seuil : rien n'est rattaché (décision 5 : « sans ambiguïté »). */
  ambigu: boolean;
}

/**
 * Le rapprochement de la reprise (meilleur score, un bail ne sert qu'une fois, seuil 0,80), avec le score au numéro de lot, et la règle
 * « sans ambiguïté » : un second bail au-dessus du seuil laisse la ligne « à rattacher ». Les douteuses ne sont jamais rattachées. PUR.
 */
export function rattacherOctobre(lignes: readonly LigneExcel[], candidats: readonly CandidatBail[], numeros: NumerosDesLots): Map<string, Rattachement> {
  const scores = lignes.map((l) => candidats.map((c) => ({ c, score: scoreAvecLot(l, c, numeros) })).filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.c.bailId - b.c.bailId));
  const paires = scores.flatMap((liste, i) => liste.filter((x) => x.score >= SEUIL_RATTACHE).map((x) => ({ i, ...x })))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const pris = new Set<number>();
  const choix = new Map<number, { c: CandidatBail; score: number }>();
  const ambigus = new Set<number>(scores.flatMap((liste, i) => (liste.filter((x) => x.score >= SEUIL_RATTACHE).length > 1 ? [i] : [])));
  for (const p of paires) {
    if (ambigus.has(p.i) || choix.has(p.i) || pris.has(p.c.bailId)) continue;
    choix.set(p.i, { c: p.c, score: p.score });
    pris.add(p.c.bailId);
  }
  return new Map(lignes.map((l, i) => {
    const ch = choix.get(i);
    const meilleur = scores[i][0]?.score ?? 0;
    const r: Rapprochement = ch === undefined
      ? { cle: l.cle, candidat: null, score: meilleur, statut: 'non_rattache' }
      : { cle: l.cle, candidat: ch.c, score: ch.score, statut: 'rattache' };
    /* Les candidats montrés : ceux que la reprise appelle au moins « douteux » (score ≥ 0,50), trois au plus. */
    return [l.cle, { rapprochement: r, candidats: scores[i].filter((x) => x.score >= SEUIL_DOUTEUX).slice(0, 3), ambigu: ambigus.has(i) }];
  }));
}

/** L'empreinte d'un mois : nombre de lignes, somme des montants HT, somme de contrôle (lue en base). */
export interface EmpreinteMois { mois: string; lignes: number; montantHt: number; controle: string }

/** Les mois (autres qu'octobre) dont l'empreinte a changé — doit être vide. PUR. */
export function moisModifies(avant: readonly EmpreinteMois[], apres: readonly EmpreinteMois[], sauf = MOIS_OCTOBRE): string[] {
  const cle = (e: EmpreinteMois): string => `${e.lignes}|${centimes(e.montantHt)}|${e.controle}`;
  const a = new Map(avant.map((e) => [e.mois, cle(e)]));
  const b = new Map(apres.map((e) => [e.mois, cle(e)]));
  return [...new Set([...a.keys(), ...b.keys()])].filter((m) => m !== sauf && a.get(m) !== b.get(m)).sort();
}

const euros = (x: number): string => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Le tableau des empreintes avant / après, mois par mois (2026). PUR. */
export function tableauEmpreintes(avant: readonly EmpreinteMois[], apres: readonly EmpreinteMois[] | null): string {
  const mois = [...new Set([...avant.map((e) => e.mois), ...(apres ?? []).map((e) => e.mois)])].sort();
  const vide: EmpreinteMois = { mois: '', lignes: 0, montantHt: 0, controle: '—' };
  return mois.map((m) => {
    const a = avant.find((e) => e.mois === m) ?? { ...vide, mois: m };
    const b = apres === null ? null : apres.find((e) => e.mois === m) ?? { ...vide, mois: m };
    const meme = b !== null && a.lignes === b.lignes && centimes(a.montantHt) === centimes(b.montantHt) && a.controle === b.controle;
    return `  ${m} : avant ${a.lignes} ligne(s) · ${euros(a.montantHt)} · ${a.controle.slice(0, 12)}`
      + (b === null ? '' : `  →  après ${b.lignes} ligne(s) · ${euros(b.montantHt)} · ${b.controle.slice(0, 12)}  ${meme ? 'identique' : 'CHANGÉ'}`);
  }).join('\n');
}

export { euros as eurosOctobre };
