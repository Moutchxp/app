import { bilanVente, commissionNetteHt, ht, societeDeLigne, SOCIETES, sommeSocietes, TVA, type BilanVente, type LigneVente, type ModeCommission, type MontantSaisi, type Societe, type Unite, type Vente } from './modele';
import type { ClasseCommission } from '../admin/statut';
import { classeDeCommission, commissionIgnoree, commissionneDePartie, statutDeCommission, type StatutDuLibelle } from './statutLigne';
import type { Statut } from '../admin/statut';

export type { MontantSaisi, Unite };

/**
 * ══ 🔴 TUILE « TRANSACTION », LOT I (Arno, 28/10/2026) — LES COMMISSIONS VERSÉES ET LES 4 TUILES DE L'ONGLET « COMPROMIS » (PUR) ═══
 *
 * UNITÉ AU CHOIX, PAR COMMISSION. La commission versée au négociateur d'entrée, à celui de sortie, et la rétrocession de l'apporteur se
 * saisissent chacune en « HT » ou en « TTC » : le choix est porté par le MONTANT, jamais par la personne (un même négociateur facture en
 * HT sur une vente, en TTC sur une autre). Conversion au taux de la tuile, la seule source (`TVA` de modele.ts : TTC = HT × 1,2), SANS
 * arrondi. Ce qui est enregistré garde l'unité saisie ; les montants d'avant (imports, saisies) sont en TTC et le restent.
 *
 * PAS DE DOUBLON. La commission versée à un négociateur est la « paye du négociateur » des lignes de vente (rôle 'negociateur', 433 —
 * `LIBELLE_ROLE`, `payeTtcDe` de modele.ts ; colonne « paye » des imports MACJ). La 437 lui ajoute le côté (entrée / sortie) et le
 * montant HT quand il est saisi en HT.
 *
 * LES 4 TUILES (compromis EN COURS seulement : acte non signé, non annulés), pour une société ou pour les deux (CA global) :
 *   1) Compromis en cours : le nombre.
 *   2) Chiffre d'affaires — 🔴 LOT R, L'INTER-CABINET : la société PORTEUSE (négociateur d'entrée) encaisse toute la commission ; l'autre
 *      société, sa seule part (sa ligne miroir). L'historique : toute la commission à sa société.
 *   3) Commissions versées : les négociateurs INDÉPENDANTS (LOT P ; chaque commission dans la société où le négociateur travaille sur
 *      cette vente) + les apporteurs (payés par la porteuse) + l'inter-cabinet versé par la porteuse (à l'autre société, à l'extérieur).
 *      Associés, salariés et statuts à renseigner : à part, non déduits.
 *   4) Solde net : CA HT − commissions versées HT (négatif : tel quel).
 * Le CA global compte chaque commission UNE fois : l'inter-cabinet entre nos sociétés y est neutralisé (ni CA en plus, ni commission versée).
 */

export const UNITES: readonly Unite[] = ['ht', 'ttc'];
export const LIBELLE_UNITE: Record<Unite, string> = { ht: 'HT', ttc: 'TTC' };

/** Le montant en HT. PUR. */
export const enHt = (m: MontantSaisi): number => (m.unite === 'ht' ? m.montant : ht(m.montant));
/** Le montant en TTC. PUR. */
export const enTtc = (m: MontantSaisi): number => (m.unite === 'ttc' ? m.montant : m.montant * TVA);
/** L'équivalent dans l'autre unité (« 1 000 HT » → « 1 200 TTC »). PUR. */
export const autreUnite = (m: MontantSaisi): MontantSaisi => (m.unite === 'ht' ? { montant: enTtc(m), unite: 'ttc' } : { montant: enHt(m), unite: 'ht' });
export const estUnite = (x: unknown): x is Unite => x === 'ht' || x === 'ttc';

/** Le montant saisi d'une ligne de vente (son unité d'origine) ; null : sans montant. PUR. */
export function montantDeLigne(l: Pick<LigneVente, 'montantTtc' | 'montantHt'>): MontantSaisi | null {
  if (l.montantHt != null) return { montant: l.montantHt, unite: 'ht' };
  return l.montantTtc === null ? null : { montant: l.montantTtc, unite: 'ttc' };
}

/** La commission versée au négociateur d'un côté (saisie depuis le dossier) ; null : rien de saisi. PUR. */
export function commissionDuCote(v: Pick<Vente, 'lignes'>, cote: 'entree' | 'sortie'): { negociateur: string; montant: MontantSaisi } | null {
  const l = v.lignes.find((x) => x.role === 'negociateur' && x.cote === cote);
  const m = l === undefined ? null : montantDeLigne(l);
  return l === undefined || m === null ? null : { negociateur: l.negociateur, montant: m };
}

/** La rétrocession de l'apporteur saisie au dossier (son unité d'origine) ; null : aucune. PUR. */
export const retroApporteurDe = (v: Pick<Vente, 'retroApporteur'>): MontantSaisi | null => v.retroApporteur ?? null;

// ── La société d'une commission de négociateur (la règle est dans modele.ts, partagée avec Le mois et L'année) ────────────────

export { societeDeLigne } from './modele';

/**
 * 🔴 LOT J (Arno) — LA PART DE LA VENTE du négociateur d'un côté, en % de la commission nette, lue dans la répartition enregistrée :
 * ses parties de ce côté (entrée : « entrée » ou « entrée et sortie » ; sortie : « sortie » ou « entrée et sortie »), une part en € HT
 * ramenée en %. Le même négociateur des deux côtés, sans partie de sortie (il porte tout à l'entrée) : 0 % côté sortie.
 * null : pas de répartition (historique, import) ou négociateur absent de la répartition — rien n'est inventé. PUR.
 */
export function partDuCote(v: Pick<Vente, 'honorairesTtc' | 'repartition' | 'dossier'>, cote: 'entree' | 'sortie'): number | null {
  const r = v.repartition;
  const nego = cote === 'entree' ? v.dossier?.entree ?? null : v.dossier?.sortie ?? null;
  if (r == null || nego === null) return null;
  const net = commissionNetteHt(v.honorairesTtc, r.retroApporteurTtc);
  const sortes = cote === 'entree' ? ['entree', 'entree_sortie'] : ['sortie', 'entree_sortie'];
  const siennes = r.parties.filter((p) => p.compteId === nego.id && sortes.includes(p.sorte));
  if (siennes.length === 0) return r.parties.some((p) => p.compteId === nego.id && p.sorte !== 'exterieure') ? 0 : null;
  return siennes.reduce((t, p) => t + (p.pourcentage !== null ? p.pourcentage : net === 0 ? 0 : ((p.montantHt ?? 0) / net) * 100), 0);
}

// ── LOTS P / Q : le statut du négociateur d'une commission — la règle unique est dans statutLigne.ts ─────────────────────────

export { statutDeLigne, statutDePartie, statutDeCommission, classeDeCommission, resolveurDe, type StatutDuLibelle } from './statutLigne';

// ── 🔴 LOT R : LA RÉMUNÉRATION D'UN NÉGOCIATEUR = TAUX × LE CA QUE LA VENTE APPORTE À SA SOCIÉTÉ ─────────────────────────────

/** Le taux de rémunération par défaut (%), modifiable sur chaque vente et chaque côté. */
export const TAUX_REMUNERATION_DEFAUT = 50;

/**
 * 🔴 LOT R (Arno) — LA BASE DE RÉMUNÉRATION d'un côté (TTC) : le CA que la vente apporte à la société de son négociateur, c.-à-d. SA part
 * dans la répartition (son % × la commission nette de l'apporteur, en TTC). Pour la porteuse comme pour l'autre société (la part reçue en
 * inter-cabinet est la sienne). null : pas de répartition ou négociateur absent de la répartition. PUR.
 */
export function baseRemunerationTtc(v: Pick<Vente, 'honorairesTtc' | 'repartition' | 'dossier'>, cote: 'entree' | 'sortie'): number | null {
  return honorairesDuCote(v, cote)?.ttc ?? null;
}

/** 🔴 LOT T — les honoraires d'un côté, décomposés pour l'écran : la commission nette de l'apporteur (TTC) × la part de ce côté (%) = la base. */
export interface HonorairesCote { netTtc: number; part: number; ttc: number }

/**
 * 🔴 LOT T (Arno) — « Honoraires nets partie vendeur / acquéreur » : commission nette après apporteur × part de ce côté = la base de rémunération
 * (la même que `baseRemunerationTtc`, qui la lit ici). null : pas de répartition ou négociateur absent de la répartition. PUR.
 */
export function honorairesDuCote(v: Pick<Vente, 'honorairesTtc' | 'repartition' | 'dossier'>, cote: 'entree' | 'sortie'): HonorairesCote | null {
  const part = partDuCote(v, cote);
  if (part === null || v.repartition == null) return null;
  const netTtc = v.honorairesTtc - v.repartition.retroApporteurTtc;
  return { netTtc, part, ttc: (netTtc * part) / 100 };
}

/** 🔴 LOT T — le taux de commissionnement du négociateur d'un côté sur cette vente (enregistré, sinon 50 %). PUR. */
export const tauxDuCote = (v: Pick<Vente, 'lignes'>, cote: 'entree' | 'sortie'): number =>
  v.lignes.find((l) => l.role === 'negociateur' && l.cote === cote)?.taux ?? TAUX_REMUNERATION_DEFAUT;

/**
 * La rémunération d'un côté : la base, le taux (enregistré, sinon 50 %), le calcul (TTC), la valeur saisie et si elle en diffère.
 * 🔴 LOT V — `mode` : celui enregistré (442) ; sinon DÉDUIT — égale au calcul (ou rien d'enregistré) : calculée ; différente : saisie à la
 * main. `modeEnregistre` : vrai seulement si le mode vient de la base (une saisie à la main d'après le lot V, et non une valeur d'avant).
 */
export interface Remuneration { baseTtc: number; taux: number; calculTtc: number; saisie: MontantSaisi | null; ecart: boolean; mode: ModeCommission; modeEnregistre: boolean }

/** Un écart de moins d'un demi-centime n'en est pas un (affichage au centime). */
const EPSILON = 0.005;

/**
 * 🔴 LOT R — LA RÉMUNÉRATION d'un côté, sur sa base : calcul = taux × base ; la valeur saisie (une commission déjà enregistrée) n'est JAMAIS
 * recalculée sans geste humain — `ecart` dit qu'elle diffère du calcul (« valeur saisie — calcul proposé : X € », « Appliquer le calcul »). PUR.
 */
export function remuneration(baseTtc: number, ligne: Pick<LigneVente, 'montantTtc' | 'montantHt' | 'taux' | 'mode'> | null | undefined): Remuneration {
  const taux = ligne?.taux ?? TAUX_REMUNERATION_DEFAUT;
  const calculTtc = (baseTtc * taux) / 100;
  const saisie = ligne == null ? null : montantDeLigne(ligne);
  const ecart = saisie !== null && Math.abs(enTtc(saisie) - calculTtc) >= EPSILON;
  const enregistre = saisie !== null && ligne?.mode != null;
  return { baseTtc, taux, calculTtc, saisie, ecart, mode: enregistre ? ligne!.mode! : ecart ? 'manuelle' : 'calculee', modeEnregistre: enregistre };
}

/** 🔴 LOT V — la commission calculée dans l'unité voulue (TTC ; HT = TTC ÷ 1,2), sans arrondi. PUR. */
export const calculDansUnite = (calculTtc: number, unite: Unite): MontantSaisi => ({ montant: unite === 'ttc' ? calculTtc : calculTtc / TVA, unite });

/**
 * 🔴 LOT S — le négociateur de ce côté est-il COMMISSIONNÉ sur cette vente (sa partie : figé, sinon son compte) ? Sans négociateur ou sans
 * partie : oui (rien ne change). PUR.
 */
export function commissionneDuCote(v: Pick<Vente, 'repartition' | 'dossier'>, cote: 'entree' | 'sortie'): boolean {
  const nego = cote === 'entree' ? v.dossier?.entree ?? null : v.dossier?.sortie ?? null;
  if (nego === null || v.repartition == null) return true;
  const sortes = cote === 'entree' ? ['entree', 'entree_sortie'] : ['sortie', 'entree_sortie'];
  const p = v.repartition.parties.find((x) => x.compteId === nego.id && sortes.includes(x.sorte)) ?? v.repartition.parties.find((x) => x.compteId === nego.id);
  return p === undefined || commissionneDePartie(p);
}

/**
 * La rémunération d'un côté d'une vente répartie (vente d'origine) ; null : pas de base (pas de répartition, pas de négociateur) — ou
 * 🔴 LOT S : un négociateur NON COMMISSIONNÉ (ni calcul proposé, ni « Appliquer le calcul »). PUR.
 */
export function remunerationDuCote(v: Pick<Vente, 'honorairesTtc' | 'repartition' | 'dossier' | 'lignes'>, cote: 'entree' | 'sortie'): Remuneration | null {
  if (!commissionneDuCote(v, cote)) return null;
  const base = baseRemunerationTtc(v, cote);
  return base === null ? null : remuneration(base, v.lignes.find((l) => l.role === 'negociateur' && l.cote === cote));
}

/** Le taux qui redonne un montant saisi (« l'un recalcule l'autre ») ; null : base nulle. PUR. */
export const tauxDuMontant = (montantTtc: number, baseTtc: number): number | null => (baseTtc === 0 ? null : (montantTtc / baseTtc) * 100);

// ── Les 4 tuiles ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface TuilesCompromis {
  nb: number;
  caHt: number;
  caTtc: number;
  /** 🔴 LOT R — le CA de chaque société (porteuse : la commission totale ; l'autre : sa part reçue), pour la vue des deux sociétés. */
  caSocieteHt: Record<Societe, number>;
  /** La commission entière des compromis comptés (HT) — pour une ligne miroir, sa seule part. */
  commissionTotaleHt: number;
  /** 🔴 LOT R — l'inter-cabinet VERSÉ par la société porteuse, par société qui le reçoit, et à l'extérieur (commissions versées). */
  interCabinetHt: Record<Societe, number>;
  exterieurHt: number;
  /** 🔴 LOT R — l'inter-cabinet REÇU (le CA des lignes miroir de la société vue). */
  recuHt: number;
  /** 🔴 LOT R — vue des deux sociétés : l'inter-cabinet entre nos sociétés, neutralisé (ni CA en plus, ni commission versée). */
  neutraliseHt: number;
  /**
   * 🔴 LOT P (Arno) — les commissions des négociateurs, par statut : les INDÉPENDANTS seuls sont « versées » (dans le cumul, déduites du
   * solde) ; les INTERNES (associés, salariés) et les « à renseigner » restent enregistrés et visibles, ni dans le cumul ni déduits.
   */
  independantsHt: number;
  internesHt: number;
  aRenseignerHt: number;
  apporteursHt: number;
  /** Le cumul « Commissions versées » : indépendants + apporteurs + inter-cabinet versé (nos sociétés, extérieur). */
  commissionsHt: number;
  commissionsTtc: number;
  soldeHt: number;
  soldeTtc: number;
}

export type VenteTuile = Pick<Vente, 'statut' | 'societe' | 'honorairesTtc' | 'repartition' | 'lignes'> & Partial<Pick<Vente, 'retroApporteur' | 'annulation' | 'miroir'>>;

/**
 * L'APPORTEUR d'une vente dans les « Commissions versées » de la société vue (null : nos deux sociétés), HT : celui de la répartition (payé
 * par la porteuse) ; l'historique, sa rétrocession saisie (lot I), à sa société. 🔴 LOT AD — la règle des tuiles, partagée avec l'écran
 * (montant de l'apporteur en rouge quand il entre dans ce cumul). PUR.
 */
export function apporteurVerseHt(v: Pick<Vente, 'societe' | 'honorairesTtc' | 'repartition'> & Partial<Pick<Vente, 'retroApporteur'>>, societe: Societe | null,
  b: BilanVente = bilanVente(v, societe)): number {
  const retro = retroApporteurDe(v);
  return v.repartition != null ? b.apporteurHt : retro === null || b.caHt === 0 ? 0 : enHt(retro);
}

/**
 * 🔴 LOT AL — LES COMMISSIONS DE NÉGOCIATEURS d'une vente comptées par la société vue (null : nos deux sociétés), une par ligne, avec leur
 * classe (indépendant / interne / à renseigner) : ce que les tuiles additionnent, et ce que la fenêtre « Commissions versées » détaille. PUR.
 */
export function commissionsNegociateurs(v: VenteTuile, societe: Societe | null, b: BilanVente, statutDuLibelle?: StatutDuLibelle):
  { negociateur: string; cote: LigneVente['cote']; classe: ClasseCommission; statut: Statut | null; ht: number }[] {
  const out: { negociateur: string; cote: LigneVente['cote']; classe: ClasseCommission; statut: Statut | null; ht: number }[] = [];
  for (const l of v.lignes) {
    if (l.role !== 'negociateur') continue;
    // 🔴 LOT S — la commission d'un négociateur NON COMMISSIONNÉ : restée en base, ignorée (ni versée, ni interne).
    if (commissionIgnoree(v, l)) continue;
    const m = montantDeLigne(l);
    if (m === null) continue;
    // Chaque commission compte dans la société OÙ son négociateur travaille sur cette vente (sans société connue : à la vente vue).
    const s = societeDeLigne(v, l);
    if (societe !== null && s !== null && s !== societe) continue;
    if (societe !== null && s === null && b.caHt === 0) continue;
    // 🔴 LOT AQ — le statut à la vente (montré dans « Ce que l'on doit ») ; la classe en dérive, comme avant.
    out.push({ negociateur: l.negociateur, cote: l.cote, classe: classeDeCommission(v, l, statutDuLibelle), statut: statutDeCommission(v, l, statutDuLibelle), ht: enHt(m) });
  }
  return out;
}

/** Le bilan d'une vente pour les tuiles, pour une société (null : nos deux sociétés) — la règle de l'inter-cabinet (`bilanVente`). PUR. */
function uneVente(v: VenteTuile, societe: Societe | null, statutDuLibelle?: StatutDuLibelle): { b: BilanVente; parClasse: Record<ClasseCommission, number>; apporteursHt: number } {
  const b = bilanVente(v, societe);
  const apporteursHt = apporteurVerseHt(v, societe, b);
  const parClasse: Record<ClasseCommission, number> = { independant: 0, interne: 0, a_renseigner: 0 };
  for (const c of commissionsNegociateurs(v, societe, b, statutDuLibelle)) parClasse[c.classe] += c.ht;
  return { b, parClasse, apporteursHt };
}

/**
 * 🔴 LES 4 TUILES DE L'ONGLET « COMPROMIS », sur les compromis EN COURS (statut « compromis » : ni acte signé, ni annulés — un compromis
 * annulé est écarté même s'il est passé par erreur). `societe` null : CA global (CRITERIMMO + MACJ, chaque commission une fois). PUR.
 */
export function tuilesCompromis(ventes: readonly VenteTuile[], societe: Societe | null, statutDuLibelle?: StatutDuLibelle): TuilesCompromis {
  const enCours = ventes.filter((v) => v.statut === 'compromis');
  const caSocieteHt = Object.fromEntries(SOCIETES.map((s) => [s, enCours.reduce((t, v) => t + bilanVente(v, s).caHt, 0)])) as Record<Societe, number>;
  const sommes = enCours.map((v) => uneVente(v, societe, statutDuLibelle));
  const somme = (f: (x: (typeof sommes)[number]) => number): number => sommes.reduce((t, x) => t + f(x), 0);
  const caHtTotal = somme((x) => x.b.caHt);
  const de = (k: ClasseCommission): number => somme((x) => x.parClasse[k]);
  const independantsHt = de('independant');
  const apporteursHt = somme((x) => x.apporteursHt);
  const interCabinetHt = Object.fromEntries(SOCIETES.map((s) => [s, somme((x) => x.b.verseHt[s])])) as Record<Societe, number>;
  const exterieur = somme((x) => x.b.exterieurHt);
  // 🔴 LOT P — n'entrent que les APPORTEURS et les INDÉPENDANTS ; LOT R : et l'inter-cabinet versé (nos sociétés, extérieur).
  const commissionsHt = independantsHt + apporteursHt + sommeSocietes(interCabinetHt) + exterieur;
  const soldeHt = caHtTotal - commissionsHt;
  return {
    nb: enCours.length, caHt: caHtTotal, caTtc: caHtTotal * TVA, caSocieteHt,
    commissionTotaleHt: enCours.reduce((t, v) => t + ht(v.honorairesTtc), 0),
    // Le reçu : la part d'une vente d'origine vue par l'autre société, ou le CA d'une ligne miroir (sa seule part).
    interCabinetHt, exterieurHt: exterieur, recuHt: enCours.reduce((t, v, i) => t + (v.miroir != null ? sommes[i].b.caHt : sommes[i].b.recuHt), 0), neutraliseHt: somme((x) => x.b.neutraliseHt),
    independantsHt, internesHt: de('interne'), aRenseignerHt: de('a_renseigner'), apporteursHt, commissionsHt, commissionsTtc: commissionsHt * TVA, soldeHt, soldeTtc: soldeHt * TVA,
  };
}
