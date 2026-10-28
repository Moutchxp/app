/**
 * ══ 🔴 TUILE « TRANSACTION » (Arno, 27/10/2026) — LE MODÈLE ET LES CALCULS (PURS) ═══════════════════════════════════════════════
 *
 * Le chiffre d'affaires de la VENTE de CRITERIMMO et de MACJ, et le CA global (vente + location + gestion).
 *   · Une vente porte ses honoraires TTC (comme les fichiers d'Arno) ; le HT en découle : TTC ÷ 1,2 — SANS ARRONDI (seul l'affichage
 *     arrondit au centime).
 *   · Le mois du CA = le mois de l'acte. Une vente sans mois est « mois à confirmer » : elle compte dans son ANNÉE, dans aucun mois.
 *   · Un compromis en cours n'est pas du CA : il fait le PRÉVISIONNEL de son année.
 *   · Les rétrocessions d'apporteurs se saisissent PAR MOIS (comme dans les fichiers) ; rattachées à une vente, ou « à répartir ».
 *   · Les montants mensuels saisis en dur sans vente (« à rattacher ») se MONTRENT, ils ne s'ajoutent jamais au CA.
 *   · Reste à l'agence = honoraires − rétrocessions − paye des négociateurs INDÉPENDANTS (TTC, puis ÷ 1,2 pour le HT). LOT Q (Arno) : la
 *     paye des associés et des salariés (« internes ») et celle d'un négociateur au statut inconnu restent affichées, non déduites —
 *     la règle unique de `statutLigne.ts`, partagée avec le cumul « Commissions versées » de l'onglet Compromis.
 * Rien ici ne lit la base : les écrans et la route appellent ces fonctions sur les lignes lues.
 */

// LOT Q — la règle unique du statut d'une commission (aucune boucle à l'exécution : statutLigne.ts n'importe de ce fichier que des types).
import { classeDeCommission, commissionIgnoree, resolveurDe, statutDePartie, type StatutDuLibelle } from './statutLigne';
import type { ClasseCommission, Statut } from '../admin/statut';

export type Societe = 'criterimmo' | 'macj';
export const SOCIETES: readonly Societe[] = ['criterimmo', 'macj'];
export const LIBELLE_SOCIETE: Record<Societe, string> = { criterimmo: 'CRITERIMMO', macj: 'MACJ' };
export const estSociete = (x: unknown): x is Societe => x === 'criterimmo' || x === 'macj';

/** Le coefficient TTC → HT des fichiers (« /1.2 »). */
export const TVA = 1.2;
export const ht = (ttc: number): number => ttc / TVA;
/** LOT I (437) — l'unité d'un montant saisi (commission versée, rétrocession de l'apporteur) : le choix est PAR MONTANT. */
export type Unite = 'ht' | 'ttc';
export interface MontantSaisi { montant: number; unite: Unite }

export type StatutVente = 'compromis' | 'vendue' | 'annulee';
export const STATUTS: readonly StatutVente[] = ['compromis', 'vendue', 'annulee'];
export const LIBELLE_STATUT: Record<StatutVente, string> = { compromis: 'Compromis en cours', vendue: 'Vendue', annulee: 'Annulée' };

/** Le rôle d'une ligne : paye du négociateur (MACJ), part des honoraires (onglets en parts), vente portée par l'onglet (CRITERIMMO). */
export type RoleLigne = 'negociateur' | 'part' | 'vendeur';
export const LIBELLE_ROLE: Record<RoleLigne, string> = { negociateur: 'paye du négociateur', part: 'part des honoraires', vendeur: 'vente de l’onglet' };

export interface LigneVente {
  id: number;
  negociateur: string;
  role: RoleLigne;
  /** Le montant TTC — pour une ligne saisie EN HT (437), son équivalent TTC (HT × 1,2), le montant saisi restant `montantHt`. */
  montantTtc: number | null;
  /** LOT I (437) — le montant saisi EN HT (alors la ligne est en HT) ; absent ou null : saisie en TTC. */
  montantHt?: number | null;
  /** LOT I (437) — la commission versée au négociateur d'entrée ou de sortie, saisie depuis le dossier ; absent ou null : ligne d'avant. */
  cote?: 'entree' | 'sortie' | null;
  /** LOT R (440) — le taux de rémunération enregistré (%) ; absent ou null : le défaut (50 %). */
  taux?: number | null;
  /**
   * LOT R — le statut du négociateur FIGÉ sur la vente d'origine, recopié sur la commission d'une LIGNE MIROIR (qui n'a pas de répartition) ;
   * absent : lu sur la partie (règle des lots P / Q).
   */
  statut?: 'associe' | 'salarie' | 'independant' | 'observateur' | null;
  nature: 'vente' | 'compromis';
  /** La ligne compte-t-elle dans les honoraires de la vente (une part comptée par le fichier) ? */
  compte: boolean;
  origine: 'saisie' | 'import';
  sourceFichier: string | null;
  sourceOnglet: string | null;
  sourceLigne: number | null;
  note: string | null;
}

export interface Vente {
  id: number;
  societe: Societe;
  libelle: string;
  honorairesTtc: number;
  statut: StatutVente;
  annee: number;
  /** Le mois de l'acte (1 → 12) ; null : « mois à confirmer » (vendue) ou sans objet (compromis). */
  mois: number | null;
  dateCompromis: string | null;
  apporteur: string | null;
  note: string | null;
  origine: 'saisie' | 'import';
  sourceFichier: string | null;
  sourceOnglet: string | null;
  sourceLigne: number | null;
  lignes: LigneVente[];
  /** LOT C — la même vente notée chez les deux sociétés : sa clé de groupe et l'état de l'attribution ; null : vente ordinaire. */
  double: { cle: string; attribution: Attribution } | null;
  /**
   * LOT D (migration 434) — la vente suit la RÉPARTITION entre parties (saisie à partir du lot D) ; absent ou null : l'historique, qui
   * garde sa règle (toute la commission à la société de la vente).
   */
  repartition?: Repartition | null;
  /** LOT G (migration 436) — l'annulation d'un compromis (statut « annulee ») : sa date, son motif, sa note ; absent ou null : non annulé. */
  annulation?: { date: string | null; motif: string; note: string | null } | null;
  /**
   * LOT I — la rétrocession de l'apporteur saisie au dossier, dans SON unité (TTC avant la 437, HT ou TTC ensuite) ; absent ou null :
   * aucune. Pour une vente répartie, `repartition.retroApporteurTtc` en est l'équivalent TTC.
   */
  retroApporteur?: MontantSaisi | null;
  /** LOT E (migration 435) — le prix de vente du bien (€), facultatif ; absent ou null : à renseigner. */
  prixVente?: number | null;
  /** LOT D — le dossier du compromis (personnes, bien, dates, négociateurs, apporteur) ; absent ou null : non renseigné. */
  dossier?: DossierVente | null;
  /**
   * 🔴 LOT R — cette vente est la LIGNE MIROIR, chez la société qui la reçoit, de la part inter-cabinet d'une vente portée par l'autre
   * société (construite à la lecture, `interCabinet.ts`) : ses honoraires sont la SEULE part reçue. Absent ou null : une vente ordinaire.
   */
  miroir?: Miroir | null;
}

/** 🔴 LOT R — ce qu'une ligne miroir sait de sa vente d'origine (jamais le montant de la vente ni la commission totale). */
export interface Miroir {
  /** La vente d'origine, chez la société porteuse : les gestes (même la rémunération modifiée d'ici) s'y font. */
  origineId: number;
  porteuse: Societe;
  libelleOrigine: string;
  /** La part reçue (HT) et son % de la commission nette. */
  partHt: number;
  pourcentage: number | null;
  /** « annulee » : la société ne reçoit plus rien de cette vente (registre 440) — la ligne reste, jamais supprimée. */
  etat: 'active' | 'annulee';
  /** Les côtés tenus par un négociateur de cette société : leur base de rémunération (la part reçue, TTC). */
  /** LOT S — `commissionne` : faux pour un négociateur non commissionné (aucune rémunération ne se saisit ni ne compte). */
  cotes: { cote: 'entree' | 'sortie'; negociateur: string; compteId: number | null; statut: Statut | null; baseTtc: number; commissionne?: boolean }[];
}

// ── LOT D : la répartition de la commission ──────────────────────────────────────────────────────────────────────────────────

/** 'entree' / 'sortie' du mandat ; 'entree_sortie' : le même négociateur des deux côtés ; 'exterieure' : hors de nos chiffres. */
export type SortePartie = 'entree' | 'sortie' | 'entree_sortie' | 'exterieure';
export const LIBELLE_PARTIE: Record<SortePartie, string> = {
  entree: 'Entrée du mandat', sortie: 'Sortie du mandat', entree_sortie: 'Entrée et sortie du mandat', exterieure: 'Partie extérieure',
};
export interface Partie {
  sorte: SortePartie;
  /** Le compte du négociateur (partie interne) ; null : partie extérieure. */
  compteId: number | null;
  negociateur: string | null;
  /** La société du négociateur AU MOMENT DE LA VENTE (figée) ; null : partie extérieure (hors CA). */
  societe: Societe | null;
  /** Le nom libre d'une partie extérieure (autre agence, confrère) et ses coordonnées facultatives. */
  nom: string | null;
  coordonnees: string | null;
  /** La part : un pourcentage de la commission nette, OU un montant HT (exactement un des deux). */
  pourcentage: number | null;
  montantHt: number | null;
  /**
   * LOT P (439) — le statut du négociateur FIGÉ à l'enregistrement de la vente (absent : avant la 439 ; null : vente d'avant ou statut
   * inconnu) — et, lu à part, le statut ACTUEL de son compte (`statutCompte`), qui sert quand rien n'a été figé.
   */
  statut?: 'associe' | 'salarie' | 'independant' | 'observateur' | null;
  statutCompte?: 'associe' | 'salarie' | 'independant' | 'observateur' | null;
  /**
   * 🔴 LOT S (441) — le négociateur était-il COMMISSIONNÉ, FIGÉ à l'enregistrement (absent ou null : vente d'avant) — et, lu à part, le
   * choix ACTUEL de son compte (`commissionneCompte` ; un collaborateur l'est toujours), qui sert quand rien n'a été figé.
   */
  commissionne?: boolean | null;
  commissionneCompte?: boolean | null;
}
export interface Repartition {
  parties: Partie[];
  /** La rétrocession de l'apporteur (TTC), déduite AVANT toute répartition. */
  retroApporteurTtc: number;
}
export interface PersonneVente { id: number; role: 'vendeur' | 'acquereur'; nom: string; telephone: string | null; email: string | null; adresse: string | null }
export interface DossierVente {
  adresseBien: string | null;
  dateActePrevue: string | null;
  dateActe: string | null;
  entree: { id: number; nom: string } | null;
  sortie: { id: number; nom: string } | null;
  apporteurId: number | null;
  personnes: PersonneVente[];
}

/** La commission NETTE HT : (commission − rétrocession de l'apporteur) ÷ 1,2 — l'apporteur est déduit avant toute répartition. PUR. */
export const commissionNetteHt = (honorairesTtc: number, retroApporteurTtc: number): number => ht(honorairesTtc - retroApporteurTtc);

/** La part HT de chaque partie (dans l'ordre), sans arrondi. PUR. */
export const partsHt = (parties: readonly Partie[], netHt: number): number[] =>
  parties.map((p) => (p.pourcentage !== null ? (netHt * p.pourcentage) / 100 : p.montantHt ?? 0));

// ── 🔴 LOT R (Arno, 28/10/2026) : L'INTER-CABINET — LA RÈGLE UNIQUE ─────────────────────────────────────────────────────────────
//
// Remplace la répartition par société du lot D pour les ventes RÉPARTIES (l'historique importé, sans répartition, est inchangé) :
//   · la SOCIÉTÉ PORTEUSE (celle du négociateur d'entrée du mandat, figée sur sa partie ; sans lui, la société où la vente est saisie)
//     encaisse TOUT : son CA = la commission totale ;
//   · la part de l'AUTRE société (son % de la commission nette, apporteur déduit d'abord : coût partagé) est une rétrocession INTER-CABINET :
//     une commission versée par la porteuse, et le CA de l'autre société (sa LIGNE MIROIR) ; la part EXTÉRIEURE (autre agence) aussi ;
//   · le GROUPE compte la commission UNE fois : CA porteuse + CA miroir − inter-cabinet entre nos sociétés (neutralisé).
// Les 4 tuiles du Compromis, Le mois, L'année, les espaces négociateurs, les apporteurs et le CA global lisent CETTE fonction.

/** 🔴 LOT R — LA SOCIÉTÉ PORTEUSE d'une vente : celle du négociateur d'ENTRÉE (sa partie, société figée à la vente) ; sinon, la société de saisie. PUR. */
export function societePorteuse(v: Pick<Vente, 'societe' | 'repartition'>): Societe {
  return v.repartition?.parties.find((p) => (p.sorte === 'entree' || p.sorte === 'entree_sortie') && p.societe !== null)?.societe ?? v.societe;
}

/** Les parts HT d'une vente répartie : par société (parties internes) et extérieure — sur la commission nette (apporteur déduit). PUR. */
function partsDeLaVente(r: Repartition, honorairesTtc: number): { parSociete: Record<Societe, number>; exterieurHt: number; netHt: number } {
  const netHt = commissionNetteHt(honorairesTtc, r.retroApporteurTtc);
  const parts = partsHt(r.parties, netHt);
  const parSociete: Record<Societe, number> = { criterimmo: 0, macj: 0 };
  let exterieur = 0;
  r.parties.forEach((p, i) => { if (p.sorte === 'exterieure') exterieur += parts[i]; else if (p.societe !== null) parSociete[p.societe] += parts[i]; });
  return { parSociete, exterieurHt: exterieur, netHt };
}

/** Ce qu'une vente apporte à une société (null : au groupe), en HT. */
export interface BilanVente {
  porteuse: Societe;
  /** Le CA de la vente pour cette vue : porteuse et groupe, la commission totale ; l'autre société, sa part reçue (sa ligne miroir). */
  caHt: number;
  /** L'apporteur (vue porteuse et groupe ; 0 pour l'autre société : la porteuse le paie, son coût est partagé par la commission nette). */
  apporteurHt: number;
  /** Vue porteuse : l'inter-cabinet VERSÉ à chacune de nos autres sociétés (une commission versée). */
  verseHt: Record<Societe, number>;
  /** Vue porteuse et groupe : l'inter-cabinet extérieur (autre agence) — une commission versée. */
  exterieurHt: number;
  /** Vue de l'autre société : la part REÇUE (= son CA). */
  recuHt: number;
  /** Vue groupe : l'inter-cabinet ENTRE NOS SOCIÉTÉS, neutralisé (ni CA en plus, ni commission versée). */
  neutraliseHt: number;
}
const RIEN: Record<Societe, number> = { criterimmo: 0, macj: 0 };

/**
 * 🔴 LOT R — LE BILAN D'UNE VENTE pour une société (null : le groupe). Historique (sans répartition) : toute la commission à la société de
 * la vente, rien d'autre — inchangé (son apporteur se lit comme avant, hors de cette fonction). PUR.
 */
export function bilanVente(v: Pick<Vente, 'societe' | 'honorairesTtc' | 'repartition'>, societe: Societe | null): BilanVente {
  if (v.repartition == null) {
    const ca = societe === null || v.societe === societe ? ht(v.honorairesTtc) : 0;
    return { porteuse: v.societe, caHt: ca, apporteurHt: 0, verseHt: { ...RIEN }, exterieurHt: 0, recuHt: 0, neutraliseHt: 0 };
  }
  const porteuse = societePorteuse(v);
  const { parSociete, exterieurHt: ext } = partsDeLaVente(v.repartition, v.honorairesTtc);
  const autres: Record<Societe, number> = { criterimmo: 0, macj: 0 };
  for (const s of SOCIETES) if (s !== porteuse) autres[s] = parSociete[s];
  const intra = SOCIETES.reduce((t, s) => t + autres[s], 0);
  if (societe === null) return { porteuse, caHt: ht(v.honorairesTtc), apporteurHt: ht(v.repartition.retroApporteurTtc), verseHt: { ...RIEN }, exterieurHt: ext, recuHt: 0, neutraliseHt: intra };
  if (societe === porteuse) return { porteuse, caHt: ht(v.honorairesTtc), apporteurHt: ht(v.repartition.retroApporteurTtc), verseHt: autres, exterieurHt: ext, recuHt: 0, neutraliseHt: 0 };
  return { porteuse, caHt: autres[societe], apporteurHt: 0, verseHt: { ...RIEN }, exterieurHt: 0, recuHt: autres[societe], neutraliseHt: 0 };
}
/** Le total d'un enregistrement « par société ». */
export const sommeSocietes = (r: Readonly<Record<Societe, number>>): number => SOCIETES.reduce((t, s) => t + r[s], 0);
/** Ce que la vente laisse à la société vue (HT) : CA − apporteur − inter-cabinet versé (nos sociétés, extérieur). PUR. */
export const resteBilanHt = (b: BilanVente): number => b.caHt - b.apporteurHt - sommeSocietes(b.verseHt) - b.exterieurHt;

/**
 * 🔴 LE CA HT QU'UNE VENTE APPORTE À UNE SOCIÉTÉ (null : au groupe) — la règle de l'inter-cabinet (LOT R) : la porteuse, la commission
 * totale ; l'autre société, sa part reçue ; le groupe, la commission totale (une seule fois). Historique : inchangé. PUR.
 */
export const caHt = (v: Pick<Vente, 'societe' | 'honorairesTtc' | 'repartition'>, societe: Societe | null = null): number => bilanVente(v, societe).caHt;
/** La part HT d'une vente versée à l'extérieur (parties extérieures : inter-cabinet extérieur). PUR. */
export function exterieurHt(v: Pick<Vente, 'honorairesTtc' | 'repartition'>): number {
  return v.repartition == null ? 0 : partsDeLaVente(v.repartition, v.honorairesTtc).exterieurHt;
}
/**
 * Une vente compte-t-elle pour cette société (historique : la sienne, si elle n'est ni à attribuer ni écartée ; répartie : la porteuse,
 * ou une part reçue en inter-cabinet) ?
 */
export function concerne(v: Pick<Vente, 'societe' | 'double' | 'repartition' | 'honorairesTtc'>, societe: Societe): boolean {
  if (v.repartition == null) return v.societe === societe && compteDansSociete(v);
  return societePorteuse(v) === societe || partsDeLaVente(v.repartition, v.honorairesTtc).parSociete[societe] > 0;
}

/** La société qui verse la commission d'une ligne « négociateur » : celle du négociateur sur cette vente ; null : inconnue. PUR. */
export function societeDeLigne(v: Pick<Vente, 'societe' | 'repartition'>, l: Pick<LigneVente, 'negociateur' | 'cote'>): Societe | null {
  if (v.repartition == null) return v.societe;
  const sortes = l.cote === 'entree' ? ['entree', 'entree_sortie'] : l.cote === 'sortie' ? ['sortie', 'entree_sortie'] : ['entree', 'sortie', 'entree_sortie'];
  const p = v.repartition.parties.find((x) => x.negociateur === l.negociateur && x.societe !== null && sortes.includes(x.sorte))
    ?? v.repartition.parties.find((x) => x.negociateur === l.negociateur && x.societe !== null);
  return p?.societe ?? null;
}
/** La ligne compte-t-elle pour cette société (null : le groupe ; une ligne sans société connue reste à la vente vue) ? PUR. */
const ligneDeLaSociete = (v: Pick<Vente, 'societe' | 'repartition'>, l: Pick<LigneVente, 'negociateur' | 'cote'>, societe: Societe | null): boolean => {
  if (societe === null) return true;
  const s = societeDeLigne(v, l);
  return s === null || s === societe;
};

/** LOT C — « a_attribuer » : en attente du choix d'Arno ; « retenue » : la note de la société choisie ; « ecartee » : l'autre. */
export type Attribution = 'a_attribuer' | 'retenue' | 'ecartee';

/**
 * LOT C (Arno, 27/10/2026) — une vente notée chez les deux sociétés n'entre dans le total d'une société QUE si elle lui est attribuée
 * (« retenue »). En attente, ou écartée : dans le total d'aucune.
 */
export const compteDansSociete = (v: Pick<Vente, 'double'>): boolean => v.double === null || v.double.attribution === 'retenue';

/**
 * LOT C — avant attribution, le CA global compte la vente UNE fois, au PLUS BAS des montants notés par les deux sociétés (choix prudent
 * retenu faute de réponse d'Arno, le 27/10/2026 ; une seule ligne à changer). Après attribution : le montant de la société choisie.
 */
export const REGLE_A_ATTRIBUER: 'plus_bas' | 'plus_haut' = 'plus_bas';

export interface Retrocession {
  id: number;
  societe: Societe;
  annee: number;
  mois: number;
  negociateur: string;
  montantTtc: number;
  apporteur: string | null;
  /** null : « à répartir ». */
  venteId: number | null;
  libelle: string | null;
  origine: 'saisie' | 'import';
  sourceOnglet: string | null;
  sourceCellule: string | null;
}

export interface CaARattacher {
  id: number;
  societe: Societe;
  annee: number;
  mois: number;
  negociateur: string;
  montantTtc: number;
  libelle: string | null;
  sourceOnglet: string | null;
  sourceCellule: string | null;
}

export interface GestionMois {
  id: number;
  annee: number;
  mois: number;
  nbLots: number | null;
  honorairesHt: number | null;
  adhocHt: number | null;
  salarieHt: number | null;
  resteHt: number | null;
  note: string | null;
  origine: 'saisie' | 'import';
}

/** Les données d'une société, telles que la route les envoie. */
export interface DonneesSociete {
  disponible: boolean;
  societe: Societe;
  aujourdhui: string;
  ventes: Vente[];
  retrocessions: Retrocession[];
  aRattacher: CaARattacher[];
  /** LOT C — les notes (des deux sociétés) des ventes notées deux fois qui touchent cette société. */
  doubles?: Vente[];
  /**
   * LOT Q — le statut du compte RAPPROCHÉ de chaque libellé de négociateur des lignes (paye importée) ; null : aucun compte sûr, ou compte
   * « à renseigner ». Absent : réponse d'avant ce lot (aucun libellé importé n'est rapproché : sa paye n'est pas déduite).
   */
  statutsNegociateurs?: Record<string, 'associe' | 'salarie' | 'independant' | 'observateur' | null>;
}

export const NOMS_MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
export const NON_ATTRIBUE = 'Non attribué';
export const APPORTEUR_NON_NOMME = 'Apporteur non nommé';

// ── Une vente ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export const estVendue = (v: Pick<Vente, 'statut'>): boolean => v.statut === 'vendue';
export const estCompromis = (v: Pick<Vente, 'statut'>): boolean => v.statut === 'compromis';
export const moisAConfirmer = (v: Pick<Vente, 'statut' | 'mois'>): boolean => v.statut === 'vendue' && v.mois === null;

/** Les négociateurs d'une vente (ordre de leurs lignes, sans doublon) ; « Non attribué » sans ligne. */
export function negociateursDe(v: Pick<Vente, 'lignes'> & Partial<Pick<Vente, 'repartition'>>): string[] {
  // LOT D — une vente répartie : ses négociateurs sont ceux de ses parties internes.
  const n = v.repartition != null ? [...new Set(v.repartition.parties.filter((p) => p.negociateur !== null).map((p) => p.negociateur as string))]
    : [...new Set(v.lignes.map((l) => l.negociateur))];
  return n.length === 0 ? [NON_ATTRIBUE] : n;
}

/** La paye des négociateurs (TTC) : les lignes « paye du négociateur » — TOUTES (affichée telle quelle). */
export const payeTtcDe = (v: Pick<Vente, 'lignes'> & Partial<Pick<Vente, 'repartition'>>): number =>
  // 🔴 LOT S — la commission d'un négociateur NON COMMISSIONNÉ sur cette vente reste en base, ignorée de tout calcul.
  v.lignes.reduce((s, l) => s + (l.role === 'negociateur' && l.montantTtc !== null && !commissionIgnoree(v, l) ? l.montantTtc : 0), 0);

/**
 * 🔴 LOT Q — la paye d'une vente PAR CLASSE (TTC) : déduite (indépendants), interne (associés, salariés), à renseigner — la règle unique
 * `classeDeCommission` (statutLigne.ts). PUR.
 */
export function payeParClasseTtc(v: Pick<Vente, 'lignes' | 'repartition' | 'societe'>, statutDuLibelle?: StatutDuLibelle, societe: Societe | null = null): Record<ClasseCommission, number> {
  const r: Record<ClasseCommission, number> = { independant: 0, interne: 0, a_renseigner: 0 };
  // 🔴 LOT R — chaque commission compte dans la société OÙ son négociateur travaille sur cette vente (null : le groupe, toutes).
  for (const l of v.lignes) if (l.role === 'negociateur' && l.montantTtc !== null && ligneDeLaSociete(v, l, societe) && !commissionIgnoree(v, l)) r[classeDeCommission(v, l, statutDuLibelle)] += l.montantTtc;
  return r;
}

/** Les rétrocessions rattachées à cette vente (TTC). */
export const retroTtcDe = (v: Pick<Vente, 'id'>, retros: readonly Retrocession[]): number =>
  retros.reduce((s, r) => s + (r.venteId === v.id ? r.montantTtc : 0), 0);

/**
 * Le reste à l'agence d'une vente (TTC) pour la société vue (null : le groupe) : honoraires − rétrocessions rattachées − paye des
 * négociateurs INDÉPENDANTS de cette société (LOT Q). 🔴 LOT R — une vente répartie : CA de la vente − apporteur − inter-cabinet versé.
 */
export function resteTtcDe(v: Vente, retros: readonly Retrocession[], statutDuLibelle?: StatutDuLibelle, societe: Societe | null = null): number {
  const paye = payeParClasseTtc(v, statutDuLibelle, societe).independant;
  if (v.repartition == null) return v.honorairesTtc - retroTtcDe(v, retros) - paye;
  return resteBilanHt(bilanVente(v, societe ?? null)) * TVA - retroTtcDe(v, retros) - paye;
}

/**
 * Le CA HT qu'un négociateur PORTE dans une vente : sa part quand la vente est en parts ; sinon les honoraires, partagés à égalité
 * entre les lignes qui comptent (la somme sur les négociateurs redonne les honoraires de la vente). 0 s'il n'y est pas.
 */
export function caHtPortePar(v: Vente, negociateur: string, societe: Societe | null = null): number {
  // LOT D — une vente répartie : le négociateur reçoit SA part (celle de ses parties, dans la société vue), jamais la commission entière.
  if (v.repartition != null) {
    const parts = partsHt(v.repartition.parties, commissionNetteHt(v.honorairesTtc, v.repartition.retroApporteurTtc));
    return v.repartition.parties.reduce((t, p, i) => t + (p.negociateur === negociateur && p.societe !== null && (societe === null || p.societe === societe) ? parts[i] : 0), 0);
  }
  const comptees = v.lignes.filter((l) => l.compte);
  if (comptees.length === 0) return negociateur === NON_ATTRIBUE ? ht(v.honorairesTtc) : 0;
  const parts = comptees.filter((l) => l.role === 'part');
  if (parts.length > 0) {
    const sesParts = parts.filter((l) => l.negociateur === negociateur).reduce((s, l) => s + (l.montantTtc ?? 0), 0);
    // Une vente en parts dont les parts ne font pas les honoraires (saisie) : le reste revient à « Non attribué ».
    const reste = v.honorairesTtc - parts.reduce((s, l) => s + (l.montantTtc ?? 0), 0);
    return ht(sesParts + (negociateur === NON_ATTRIBUE ? reste : 0));
  }
  const siennes = comptees.filter((l) => l.negociateur === negociateur).length;
  return ht((v.honorairesTtc * siennes) / comptees.length);
}

// ── Les totaux ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Totaux {
  nbVentes: number;
  caHt: number;
  caTtc: number;
  retroHt: number;
  /** LOT Q — la paye DÉDUITE : celle des négociateurs indépendants. */
  payeHt: number;
  /** LOT Q — la paye des associés et des salariés (internes) et celle des statuts inconnus : affichées, NON déduites. */
  internesHt: number;
  aRenseignerHt: number;
  /**
   * 🔴 LOT R — l'inter-cabinet VERSÉ par la société (porteuse) à nos autres sociétés et à l'extérieur : déduit du reste ; au niveau du
   * groupe, seul l'extérieur l'est (l'inter-cabinet entre nos sociétés est neutralisé : `neutraliseHt`).
   */
  interCabinetHt: number;
  exterieurHt: number;
  neutraliseHt: number;
  /** CA HT − rétrocessions HT (apporteurs) − inter-cabinet versé HT − paye déduite HT. */
  resteHt: number;
  ids: number[];
}
const VIDE: Totaux = { nbVentes: 0, caHt: 0, caTtc: 0, retroHt: 0, payeHt: 0, internesHt: 0, aRenseignerHt: 0, interCabinetHt: 0, exterieurHt: 0, neutraliseHt: 0, resteHt: 0, ids: [] };

/** Les ventes VENDUES d'un mois (année + mois de l'acte) qui comptent pour la société (LOT C : pas une vente à attribuer ou écartée). */
export const ventesDuMois = (ventes: readonly Vente[], annee: number, mois: number): Vente[] =>
  ventes.filter((v) => estVendue(v) && v.annee === annee && v.mois === mois && compteDansSociete(v));
/** Les ventes VENDUES d'une année (mois à confirmer compris) qui comptent pour la société. */
export const ventesDeLAnnee = (ventes: readonly Vente[], annee: number): Vente[] => ventes.filter((v) => estVendue(v) && v.annee === annee && compteDansSociete(v));
/** Les compromis en cours rattachés à une année (le prévisionnel de l'année). */
export const compromisDeLAnnee = (ventes: readonly Vente[], annee: number): Vente[] => ventes.filter((v) => estCompromis(v) && v.annee === annee && compteDansSociete(v));

// ── LOT C : les ventes notées chez les deux sociétés ─────────────────────────────────────────────────────────────────────

type NoteDouble = Pick<Vente, 'id' | 'societe' | 'statut' | 'annee' | 'mois' | 'honorairesTtc' | 'libelle' | 'double'>;
export interface GroupeDouble<V extends NoteDouble = NoteDouble> {
  cle: string;
  annee: number;
  notes: V[];
  /** La société choisie ; null : à attribuer. */
  attribuee: Societe | null;
  /** Le montant TTC de chaque société (somme de ses notes du groupe). */
  parSociete: Record<Societe, number>;
  /** Ce que le CA global compte pour ce groupe (TTC) : la société choisie, sinon la règle « plus bas ». */
  retenuTtc: number;
}
/** Les groupes « même vente notée deux fois » présents dans ces ventes. PUR. */
export function groupesDoubles<V extends NoteDouble>(ventes: readonly V[]): GroupeDouble<V>[] {
  const m = new Map<string, V[]>();
  for (const v of ventes) if (v.double !== null && v.statut !== 'annulee') m.set(v.double.cle, [...(m.get(v.double.cle) ?? []), v]);
  return [...m].map(([cle, notes]) => {
    const parSociete: Record<Societe, number> = { criterimmo: 0, macj: 0 };
    for (const n of notes) parSociete[n.societe] += n.honorairesTtc;
    const choisie = notes.find((n) => n.double?.attribution === 'retenue')?.societe ?? null;
    const valeurs = SOCIETES.filter((s) => notes.some((n) => n.societe === s)).map((s) => parSociete[s]);
    const retenuTtc = choisie !== null ? parSociete[choisie] : REGLE_A_ATTRIBUER === 'plus_bas' ? Math.min(...valeurs) : Math.max(...valeurs);
    return { cle, annee: Math.min(...notes.map((n) => n.annee)), notes, attribuee: choisie, parSociete, retenuTtc };
  }).sort((a, b) => a.annee - b.annee || a.cle.localeCompare(b.cle));
}
/** Les rétrocessions saisies sur un mois (rattachées ou à répartir). */
export const retrosDuMois = (retros: readonly Retrocession[], annee: number, mois: number): Retrocession[] =>
  retros.filter((r) => r.annee === annee && r.mois === mois);

/**
 * Les totaux d'un ensemble de ventes ; `retros` : les rétrocessions de la MÊME période (saisies par mois : elles comptent sur leur
 * mois, rattachées ou non). PUR.
 */
export function totaux(ventes: readonly Vente[], retros: readonly Retrocession[], societe: Societe | null = null, statutDuLibelle?: StatutDuLibelle): Totaux {
  if (ventes.length === 0 && retros.length === 0) return { ...VIDE, ids: [] };
  // L'historique (et les lignes miroir, sans répartition) se calcule EXACTEMENT comme avant (en TTC, puis ÷ 1,2) — aucune vente
  // répartie : les mêmes nombres, au bit près. 🔴 LOT R — une vente répartie : le bilan de l'inter-cabinet (`bilanVente`).
  const historiques = ventes.filter((v) => v.repartition == null && (societe === null || v.societe === societe));
  const caTtc = historiques.reduce((s, v) => s + v.honorairesTtc, 0);
  const bilans = ventes.filter((v) => v.repartition != null).map((v) => bilanVente(v, societe));
  const somme = (f: (b: BilanVente) => number): number => bilans.reduce((s, b) => s + f(b), 0);
  const repartiHt = somme((b) => b.caHt);
  const apporteurHt = somme((b) => b.apporteurHt);
  const interCabinetHt = somme((b) => sommeSocietes(b.verseHt));
  const exterieur = somme((b) => b.exterieurHt);
  const retroTtc = retros.reduce((s, r) => s + r.montantTtc, 0);
  // 🔴 LOT Q — seule la paye des INDÉPENDANTS est déduite ; les internes et les « à renseigner » sont rendus à part. LOT R : chacune dans
  // la société où son négociateur travaille sur la vente.
  const paye = ventes.map((v) => payeParClasseTtc(v, statutDuLibelle, societe));
  const payeTtc = paye.reduce((s, p) => s + p.independant, 0);
  return { nbVentes: ventes.length, caTtc: caTtc + repartiHt * TVA, caHt: ht(caTtc) + repartiHt, retroHt: ht(retroTtc) + apporteurHt, payeHt: ht(payeTtc),
    internesHt: ht(paye.reduce((s, p) => s + p.interne, 0)), aRenseignerHt: ht(paye.reduce((s, p) => s + p.a_renseigner, 0)),
    interCabinetHt, exterieurHt: exterieur, neutraliseHt: somme((b) => b.neutraliseHt),
    resteHt: ht(caTtc - retroTtc - payeTtc) + repartiHt - apporteurHt - interCabinetHt - exterieur, ids: ventes.map((v) => v.id) };
}

type DonneesTotaux = Pick<DonneesSociete, 'ventes' | 'retrocessions'> & Partial<Pick<DonneesSociete, 'societe' | 'statutsNegociateurs'>>;
export const totauxMois = (d: DonneesTotaux, annee: number, mois: number): Totaux =>
  totaux(ventesDuMois(d.ventes, annee, mois), retrosDuMois(d.retrocessions, annee, mois), d.societe ?? null, resolveurDe(d.statutsNegociateurs));

export const totauxAnnee = (d: DonneesTotaux, annee: number): Totaux =>
  totaux(ventesDeLAnnee(d.ventes, annee), d.retrocessions.filter((r) => r.annee === annee), d.societe ?? null, resolveurDe(d.statutsNegociateurs));

/** Le CA HT de chaque mois (12 valeurs) d'une année ; les ventes « mois à confirmer » n'y sont pas. PUR. */
export const caHtParMois = (ventes: readonly Vente[], annee: number, societe: Societe | null = null): number[] =>
  Array.from({ length: 12 }, (_, i) => ventesDuMois(ventes, annee, i + 1).reduce((s, v) => s + caHt(v, societe), 0));

/** Les années présentes (ventes, compromis, rétrocessions), croissantes. PUR. */
export function anneesDe(d: Pick<DonneesSociete, 'ventes' | 'retrocessions'>, aujourdhui: string): number[] {
  const a = new Set<number>([Number(aujourdhui.slice(0, 4)), ...d.ventes.map((v) => v.annee), ...d.retrocessions.map((r) => r.annee)]);
  return [...a].sort((x, y) => x - y);
}

// ── L'année par année (toute l'histoire) ─────────────────────────────────────────────────────────────────────────────────

export interface LigneAnnee {
  annee: number;
  nbVentes: number;
  caHt: number;
  /** Dont les ventes « mois à confirmer » (dans l'année, hors des mois). */
  moisAConfirmerHt: number;
  nbMoisAConfirmer: number;
  compromisHt: number;
  nbCompromis: number;
  retroHt: number;
  payeHt: number;
  /** LOT Q — internes et statuts inconnus : affichés, non déduits. */
  internesHt: number;
  aRenseignerHt: number;
  resteHt: number;
}

export function historique(d: DonneesTotaux, annees: readonly number[]): LigneAnnee[] {
  const s = d.societe ?? null;
  return annees.map((annee) => {
    const t = totauxAnnee(d, annee);
    const aConfirmer = ventesDeLAnnee(d.ventes, annee).filter(moisAConfirmer);
    const comp = compromisDeLAnnee(d.ventes, annee);
    return { annee, nbVentes: t.nbVentes, caHt: t.caHt, moisAConfirmerHt: aConfirmer.reduce((x, v) => x + caHt(v, s), 0),
      nbMoisAConfirmer: aConfirmer.length, compromisHt: comp.reduce((x, v) => x + caHt(v, s), 0), nbCompromis: comp.length,
      retroHt: t.retroHt, payeHt: t.payeHt, internesHt: t.internesHt, aRenseignerHt: t.aRenseignerHt, resteHt: t.resteHt };
  });
}

// ── Les négociateurs ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface LigneNegociateur {
  negociateur: string;
  nbVentes: number;
  caHt: number;
  payeHt: number;
  retroHt: number;
  ids: number[];
  /** LOT Q — son statut (partie figée, sinon compte rapproché) : décide si sa paye est déduite du reste à l'agence. */
  statut: Statut | null;
}

/** Par négociateur, sur un ensemble de ventes et les rétrocessions de la même période. Trié par CA HT décroissant. PUR. */
export function parNegociateur(ventes: readonly Vente[], retros: readonly Retrocession[], societe: Societe | null = null, statutDuLibelle?: StatutDuLibelle): LigneNegociateur[] {
  const statutDe = (n: string): Statut | null => {
    const p = ventes.flatMap((v) => v.repartition?.parties ?? []).find((x) => x.negociateur === n && x.compteId !== null);
    return (p === undefined ? null : statutDePartie(p)) ?? statutDuLibelle?.(n) ?? null;
  };
  const noms = new Set<string>([...ventes.flatMap(negociateursDe), ...retros.map((r) => r.negociateur)]);
  return [...noms].map((n) => {
    const siennes = ventes.filter((v) => negociateursDe(v).includes(n));
    const paye = siennes.reduce((s, v) => s + v.lignes.reduce((t, l) => t + (l.negociateur === n && l.role === 'negociateur' && !commissionIgnoree(v, l) ? l.montantTtc ?? 0 : 0), 0), 0);
    return { negociateur: n, nbVentes: siennes.length, caHt: siennes.reduce((s, v) => s + caHtPortePar(v, n, societe), 0), payeHt: ht(paye),
      retroHt: ht(retros.filter((r) => r.negociateur === n).reduce((s, r) => s + r.montantTtc, 0)), ids: siennes.map((v) => v.id), statut: statutDe(n) };
  }).sort((a, b) => b.caHt - a.caHt || a.negociateur.localeCompare(b.negociateur, 'fr'));
}

// ── Les apporteurs ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface LigneApporteur {
  apporteur: string;
  nbRetrocessions: number;
  retroHt: number;
  /** Les ventes auxquelles ses rétrocessions sont rattachées. */
  ventesIds: number[];
  caApporteHt: number;
  aRepartir: number;
}

/** Les apporteurs d'une période (rétrocessions de la période) ; un apporteur sans nom est « Apporteur non nommé ». PUR. */
export function parApporteur(retros: readonly Retrocession[], ventes: readonly Vente[]): LigneApporteur[] {
  const parId = new Map(ventes.map((v) => [v.id, v]));
  const groupes = new Map<string, Retrocession[]>();
  for (const r of retros) {
    const nom = r.apporteur?.trim() || (r.venteId !== null ? parId.get(r.venteId)?.apporteur?.trim() : '') || APPORTEUR_NON_NOMME;
    groupes.set(nom, [...(groupes.get(nom) ?? []), r]);
  }
  return [...groupes].map(([apporteur, rs]) => {
    const ids = [...new Set(rs.map((r) => r.venteId).filter((x): x is number => x !== null))];
    return { apporteur, nbRetrocessions: rs.length, retroHt: ht(rs.reduce((s, r) => s + r.montantTtc, 0)), ventesIds: ids,
      caApporteHt: ids.reduce((s, id) => { const v = parId.get(id); return s + (v === undefined ? 0 : caHt(v)); }, 0), aRepartir: rs.filter((r) => r.venteId === null).length };
  }).sort((a, b) => b.retroHt - a.retroHt || a.apporteur.localeCompare(b.apporteur, 'fr'));
}

/**
 * Les ventes auxquelles une rétrocession peut se rattacher : celles du MÊME négociateur et du même mois d'abord, puis le reste de
 * l'année de la société (une rétrocession peut payer une vente d'un autre mois). PUR.
 */
export function ventesProposees(r: Retrocession, ventes: readonly Vente[]): { duMois: Vente[]; autres: Vente[] } {
  const memeSociete = ventes.filter((v) => v.societe === r.societe && v.statut !== 'annulee');
  const duMois = memeSociete.filter((v) => v.annee === r.annee && v.mois === r.mois && negociateursDe(v).includes(r.negociateur));
  const ids = new Set(duMois.map((v) => v.id));
  const autres = memeSociete.filter((v) => !ids.has(v.id) && (v.annee === r.annee || v.annee === r.annee - 1));
  return { duMois, autres };
}

// ── Le CA global (vente CRITERIMMO + vente MACJ + location + gestion) ───────────────────────────────────────────────────────

export interface CelluleGlobal {
  venteCriterimmoHt: number;
  venteMacjHt: number;
  /** LOT C — les ventes à attribuer, comptées UNE fois (plus bas des deux montants), dans l'année seulement (dans aucun mois, aucune société). */
  aAttribuerHt: number;
  locationHt: number | null;
  gestionHt: number | null;
  /**
   * LOT D — les parts des parties extérieures (autre agence, confrère). 🔴 LOT R : l'inter-cabinet extérieur, compris dans le CA de la
   * société porteuse (elle encaisse tout) et versé par elle : montré à part, pour information.
   */
  exterieurHt: number;
  /** 🔴 LOT R — l'inter-cabinet ENTRE NOS SOCIÉTÉS : dans les ventes CRITERIMMO ET MACJ, retiré UNE fois du total (neutralisé). */
  interCabinetHt: number;
  /** Le réalisé : la somme de ce qui est connu (l'inter-cabinet entre nos sociétés retiré une fois). */
  totalHt: number;
  /** CRITERIMMO = vente CRITERIMMO + location + gestion ; MACJ = vente MACJ. */
  criterimmoHt: number;
  macjHt: number;
}

export interface EntreesGlobal {
  ventes: readonly (Pick<Vente, 'societe' | 'statut' | 'annee' | 'mois' | 'honorairesTtc'> & Partial<Pick<Vente, 'id' | 'libelle' | 'double' | 'repartition'>>)[];
  /** Le CA HT de la location par mois (« AAAA-MM » → montant), lu dans le Suivi de la Location ; absent : non lu. */
  location: Readonly<Record<string, number>> | null;
  gestion: readonly Pick<GestionMois, 'annee' | 'mois' | 'honorairesHt'>[];
}

const cle = (annee: number, mois: number): string => `${annee}-${String(mois).padStart(2, '0')}`;

/** Une cellule du CA global : un mois (mois 1 → 12), ou l'année entière (mois null : les ventes « mois à confirmer » comprises). PUR. */
export function celluleGlobal(e: EntreesGlobal, annee: number, mois: number | null): CelluleGlobal {
  const ventes = e.ventes.filter((v) => v.statut === 'vendue' && v.annee === annee && (mois === null || v.mois === mois) && compteDansSociete({ double: v.double ?? null }));
  const aAttribuerHt = mois !== null ? 0 : groupesDoubles(e.ventes.filter((v) => v.statut === 'vendue' && v.annee === annee && v.double != null)
    .map((v, i) => ({ id: v.id ?? -1 - i, libelle: v.libelle ?? '', ...v, double: v.double ?? null })))
    .filter((g) => g.attribuee === null).reduce((t, g) => t + ht(g.retenuTtc), 0);
  // 🔴 LOT R — vente CRITERIMMO / MACJ : le CA de chaque société (porteuse : la commission totale ; l'autre : sa part reçue) ; le total
  // retire UNE fois l'inter-cabinet entre nos sociétés : chaque commission n'est comptée qu'une fois pour le groupe.
  const somme = (s: Societe): number => ventes.reduce((t, v) => t + caHt(v, s), 0);
  const interCabinet = ventes.reduce((t, v) => t + bilanVente(v, null).neutraliseHt, 0);
  const moisVises = mois === null ? Array.from({ length: 12 }, (_, i) => i + 1) : [mois];
  const loc = e.location === null ? null : moisVises.reduce((t, m) => t + (e.location?.[cle(annee, m)] ?? 0), 0);
  const gLignes = e.gestion.filter((g) => g.annee === annee && moisVises.includes(g.mois) && g.honorairesHt !== null);
  const gestion = gLignes.length === 0 ? null : gLignes.reduce((t, g) => t + (g.honorairesHt ?? 0), 0);
  const venteCriterimmoHt = somme('criterimmo');
  const venteMacjHt = somme('macj');
  const criterimmoHt = venteCriterimmoHt + (loc ?? 0) + (gestion ?? 0);
  const exterieur = ventes.reduce((t, v) => t + exterieurHt(v), 0);
  return { venteCriterimmoHt, venteMacjHt, aAttribuerHt, exterieurHt: exterieur, locationHt: loc, gestionHt: gestion, interCabinetHt: interCabinet,
    totalHt: criterimmoHt + venteMacjHt + aAttribuerHt - interCabinet, criterimmoHt, macjHt: venteMacjHt };
}

/** Le prévisionnel d'une année : les compromis en cours rattachés à l'année, par société (HT). PUR. */
export function previsionnel(e: Pick<EntreesGlobal, 'ventes'>, annee: number): { criterimmoHt: number; macjHt: number; interCabinetHt: number; totalHt: number } {
  const c = e.ventes.filter((v) => v.statut === 'compromis' && v.annee === annee && compteDansSociete({ double: v.double ?? null }));
  const criterimmoHt = c.reduce((t, v) => t + caHt(v, 'criterimmo'), 0);
  const macjHt = c.reduce((t, v) => t + caHt(v, 'macj'), 0);
  // 🔴 LOT R — l'inter-cabinet entre nos sociétés, retiré une fois (neutralisé).
  const interCabinetHt = c.reduce((t, v) => t + bilanVente(v, null).neutraliseHt, 0);
  return { criterimmoHt, macjHt, interCabinetHt, totalHt: criterimmoHt + macjHt - interCabinetHt };
}

/** L'écart et sa part (null : rien à comparer). PUR. */
export const variation = (courant: number, precedent: number): number | null => (precedent === 0 ? null : (courant - precedent) / precedent);

/** Le reste de gestion proposé à la saisie : honoraires − ADHOC − salarié (les champs vides comptent 0) ; null sans honoraires. PUR. */
export const resteGestionPropose = (g: Pick<GestionMois, 'honorairesHt' | 'adhocHt' | 'salarieHt'>): number | null =>
  g.honorairesHt === null ? null : g.honorairesHt - (g.adhocHt ?? 0) - (g.salarieHt ?? 0);
