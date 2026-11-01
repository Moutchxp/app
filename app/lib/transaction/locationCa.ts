// ══ 🔴 LOT LO1 (Arno, 01/11/2026) — « SUIVI CHIFFRE D'AFFAIRES › LOCATION » : L'ACTIVITÉ ÉCONOMIQUE DE LA LOCATION (PUR) ══════════════════════════
// La source : les lignes du Suivi du mois de la Location (`gestion_location_activite`, lues par `lireActivites` : non annulées — une location
// supprimée au lot LS1 est une ligne annulée), et ses fonctions de calcul, sans copie : le CA d'une ligne (`caLigne`), sa prime de nouvelle gestion
// (`primeDe`), la commission de son apporteur à la signature (`partLocationDe` + `partGestionSignatureDe`, ce que `totaux` additionne en
// « apporteurs »). Société : CRITERIMMO. Les montants du Suivi sont HT ; le TTC = HT × `TVA` (1,20, la constante de la vente). Chaque montant d'une
// ligne est mis au centime une fois (HT, et TTC à partir du HT) ; tout total est la somme des centimes des lignes : la tuile, le Résultat, l'Espace
// par négociateur et les cartes tombent juste au centime, et « CA net = CA brut − primes − apporteurs » ligne par ligne.
// N'entrent PAS dans les coûts (et le disent) : la part gestion « Récurrent » des apporteurs (due mois après mois, sans bail de la période), le dû
// aux collègues, la commission du négociateur et ses rétrocessions (`gestion_location_retrocession` : elles diminuent SA commission, pas le CA).
import { apporteurAffiche, caLigne, cleNegociateur, commissionCollegueSignatureDe, partGestionSignatureDe, partLocationDe, primeDe, tauxNegociateurDe, type ActiviteCalcul, type ActiviteLue } from '../location/suivi/tableauBord';
import type { Apporteur, RegleCommission } from '../location/suivi/suivi';
import { TVA } from './modele';
import type { MontantC } from './partAgence';
import { normaliser, type FicheRecherche, type TriListe } from './listeCartes';

/** « Compter » : chaque ligne est dans UNE seule catégorie (la partition du total). */
export type CompterLocation = 'tous' | 'avec' | 'sans' | 'gestion_seule';
export const COMPTER_LOCATION: readonly CompterLocation[] = ['tous', 'avec', 'sans', 'gestion_seule'];
export const LIBELLE_COMPTER_LOCATION: Record<CompterLocation, string> = { tous: 'Tous', avec: 'Avec gestion', sans: 'Sans gestion', gestion_seule: 'Mandat de gestion seul' };
export const estCompterLocation = (x: unknown): x is CompterLocation => x === 'tous' || x === 'avec' || x === 'sans' || x === 'gestion_seule';

/** Une ligne du Suivi, telle que l'écran la reçoit : ses montants au centime, et de quoi faire sa carte. */
export interface LigneLocationCa {
  id: number;
  type: 'bail' | 'avenant' | 'gestion_seule';
  /** La catégorie de « Compter » : mandat de gestion seul, sinon avec / sans gestion. */
  categorie: Exclude<CompterLocation, 'tous'>;
  date: string;
  /** La date de signature est « supposée » (reprise du fichier) : le mois est connu, le jour peut-être pas. */
  dateSupposee: boolean;
  annee: number;
  mois: number;
  proprietaire: string;
  locataire: string;
  /** Le bien (son adresse) : le premier bien de la ligne, sinon rien. */
  bien: string | null;
  negociateur: { cle: string; nom: string };
  apporteur: string | null;
  proprietaireC: MontantC;
  locataireC: MontantC;
  caC: MontantC;
  primeC: MontantC;
  apporteurC: MontantC;
  /** CA − prime − apporteur (au centime). */
  netC: MontantC;
  /**
   * 🔴 LOT LO11 — le variable du négociateur sur ce dossier : son taux à la date de signature × (CA − commissions déduites : l'apporteur au centime,
   * le collègue à la signature) — le « résultat commercial » du lot LO9, au centime. Sans TVA (payé en salaire) : le même en HT et en TTC.
   */
  variableC: MontantC;
  lotId: number | null;
  bailId: number | null;
}

const RIEN: MontantC = { htC: 0, ttcC: 0 };
export const plusC = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC + b.htC, ttcC: a.ttcC + b.ttcC });
export const moinsC = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC - b.htC, ttcC: a.ttcC - b.ttcC });
/** Un montant HT du Suivi, au centime : le HT, et le TTC calculé du HT (× 1,20). PUR. */
export const depuisHt = (ht: number): MontantC => ({ htC: Math.round((ht + Number.EPSILON) * 100), ttcC: Math.round((ht * TVA + Number.EPSILON) * 100) });

/** La catégorie « Compter » d'une ligne : le mandat de gestion seul d'abord (son type), puis la case « avec gestion ». PUR. */
export const categorieDe = (a: Pick<ActiviteLue, 'type' | 'avecGestion'>): LigneLocationCa['categorie'] => (a.type === 'gestion_seule' ? 'gestion_seule' : a.avecGestion ? 'avec' : 'sans');

/**
 * ══ 🔴 LOT LO5 (Arno) — LES MONTANTS D'UNE LIGNE, UNE SEULE FOIS, POUR LES DEUX PAGES (Suivi annuel de la Location, Suivi CA › Location) ═══════════
 * Chaque montant de la ligne au centime, en HT puis en TTC (`depuisHt`) : le CA (`caLigne`), la prime de nouvelle gestion (`primeDe`), la
 * commission d'apporteur DUE À LA SIGNATURE (part location + part gestion « One shot » : `partLocationDe` + `partGestionSignatureDe`).
 * La part gestion « Récurrent » des apporteurs (due mois après mois, sur des baux d'autres périodes) et la rémunération des collègues n'y sont
 * pas : elles ne tiennent à aucun bail de la période (le Résumé de la période du Suivi annuel les montre à part, inchangé). PUR.
 */
export interface MontantsLigne { caC: MontantC; primeC: MontantC; apporteurC: MontantC }
export function montantsLigne(a: ActiviteCalcul, ctx: { regles: readonly RegleCommission[]; apporteurs: readonly Apporteur[] }): MontantsLigne {
  return { caC: depuisHt(caLigne(a)), primeC: depuisHt(primeDe(a, ctx.regles)), apporteurC: depuisHt(partLocationDe(a, ctx.apporteurs) + partGestionSignatureDe(a, ctx.apporteurs)) };
}
/** Les sommes de lignes : CA, commissions d'apporteurs, primes ; « CA net d'apporteurs » = CA − commissions ; « CA net » = CA net d'apporteurs − primes. */
export interface SommesLocation { ca: MontantC; apporteurs: MontantC; primes: MontantC; netApporteurs: MontantC; net: MontantC }
/** 🔴 LOT LO5 — LA fonction des deux pages : la somme des centimes de chaque ligne (une seule règle d'arrondi). PUR. */
export function sommesLocation(ms: readonly MontantsLigne[]): SommesLocation {
  const ca = ms.reduce((t, m) => plusC(t, m.caC), RIEN); const apporteurs = ms.reduce((t, m) => plusC(t, m.apporteurC), RIEN);
  const primes = ms.reduce((t, m) => plusC(t, m.primeC), RIEN); const netApporteurs = moinsC(ca, apporteurs);
  return { ca, apporteurs, primes, netApporteurs, net: moinsC(netApporteurs, primes) };
}
/** Les sommes d'activités du Suivi (le Suivi annuel) : `sommesLocation` de leurs montants. PUR. */
export const sommesActivites = (lignes: readonly ActiviteCalcul[], ctx: { regles: readonly RegleCommission[]; apporteurs: readonly Apporteur[] }): SommesLocation =>
  sommesLocation(lignes.map((a) => montantsLigne(a, ctx)));

/** Une ligne du Suivi → sa ligne d'activité économique (les fonctions de la Location, sans copie). PUR. */
export function ligneLocationCa(a: ActiviteLue, ctx: { regles: readonly RegleCommission[]; apporteurs: readonly Apporteur[] }): LigneLocationCa {
  // les montants de la ligne (`montantsLigne`, la règle des deux pages) ; la part locataire est le reste (propriétaire + locataire = CA, au centime)
  const { caC, primeC, apporteurC } = montantsLigne(a, ctx);
  const proprietaireC = depuisHt(a.honoProprietaireHt);
  const locataireC = moinsC(caC, proprietaireC);
  const app = apporteurAffiche(a, ctx.apporteurs as Apporteur[]);
  const bien = a.lots?.find((l) => l.annexeDe == null)?.libelle ?? a.lots?.[0]?.libelle ?? null;
  return {
    id: Number(a.id), type: a.type, categorie: categorieDe(a), date: a.dateSignature, dateSupposee: a.dateSupposee === true,
    annee: Number(a.dateSignature.slice(0, 4)), mois: Number(a.dateSignature.slice(5, 7)),
    proprietaire: a.libelleProprietaire, locataire: (a.locataires ?? []).map((l) => l.libelle).join(', ') || a.libelleLocataire, bien,
    negociateur: { cle: cleNegociateur(a), nom: a.negociateurLibelle || '—' },
    apporteur: app.source === 'apporteur' && app.texte !== '' ? app.texte : a.apporteurId !== null ? (a.apporteurNom ?? 'Apporteur') : null,
    proprietaireC, locataireC, caC, primeC, apporteurC, netC: moinsC(moinsC(caC, primeC), apporteurC), lotId: a.lotId, bailId: a.bailId,
    variableC: (() => { const v = Math.round((tauxNegociateurDe(a, ctx.regles) * (caLigne(a) - apporteurC.htC / 100 - commissionCollegueSignatureDe(a, ctx.apporteurs as Apporteur[])) + Number.EPSILON) * 100); return { htC: v, ttcC: v }; })(),
  };
}

/**
 * ══ 🔴 LOT LO11 (règle d'Arno, 01/11/2026) — LES COÛTS DE LA LOCATION, MOIS PAR MOIS ══════════════════════════════════════════════════════════
 * · un mois SANS salaires chargés saisis : coûts = commissions d'apporteurs + primes + variable du négociateur, tous déduits du CA ;
 * · un mois AVEC salaires chargés saisis : coûts = commissions d'apporteurs + salaires chargés ; les primes et le variable restent montrés,
 *   « inclus dans les salaires », mais ne sont PAS déduits (déjà dans les salaires).
 * CA net = CA brut − coûts. Le variable du mois = la somme des variables des dossiers − les rétrocessions du mois (le calcul du module Location).
 * Une période = la somme de ses mois. Salaires et variable : sans TVA (le même en HT et en TTC). PUR.
 */
export interface RetroLocation { annee: number; mois: number; negociateurCle: string; montantC: MontantC }
export interface SalairesLocation { id?: number; annee: number; mois: number; salairesHt: number | null; note: string | null }
export interface CoutsLocation {
  ca: MontantC; apporteurs: MontantC; primes: MontantC; variable: MontantC;
  /** Les salaires chargés COMPTÉS (déduits) ; `salairesSaisis` : le montant saisi, compté ou non (🔴 LOT LO12 : « Sans salaires », montré en gris). */
  salaires: MontantC; salairesSaisis: MontantC;
  /** Ce qui est déduit : primes et variable des mois sans salaires ; salaires des mois qui en ont. */
  primesDeduites: MontantC; variableDeduit: MontantC;
  /** Les coûts déduits et le CA net (CA brut − coûts). */
  couts: MontantC; net: MontantC;
  /** Les mois comptés ; ceux dont les salaires sont comptés (primes et variable alors « inclus ») ; ceux qui ont des salaires saisis. */
  nbMois: number; moisAvecSalaires: number; moisSaisis: number;
}
const salaireDuMois = (salaires: readonly SalairesLocation[] | null, a: number, m: number): number | null =>
  salaires?.find((x) => x.annee === a && x.mois === m)?.salairesHt ?? null;
/**
 * Les coûts d'UN mois (les lignes du mois, ses rétrocessions, ses salaires saisis ou null). 🔴 LOT LO12 — `avecSalaires` faux (« Sans salaires ») :
 * aucun salaire compté (le montant saisi reste montré), primes et variable toujours déduits. PUR.
 */
export function coutsLocationMois(lignes: readonly LigneLocationCa[], retros: readonly RetroLocation[], salairesHt: number | null, avecSalaires = true): CoutsLocation {
  const t = totauxLocation(lignes);
  const v = moinsC(lignes.reduce((x, l) => plusC(x, l.variableC), RIEN), retros.reduce((x, r) => ({ htC: x.htC + r.montantC.htC, ttcC: x.ttcC + r.montantC.htC }), RIEN));
  const saisi = salairesHt !== null;
  const avec = saisi && avecSalaires;
  const sal = saisi ? Math.round((salairesHt + Number.EPSILON) * 100) : 0;
  const salairesSaisis = { htC: sal, ttcC: sal };
  const salaires = avec ? salairesSaisis : RIEN;
  const primesDeduites = avec ? RIEN : t.primes; const variableDeduit = avec ? RIEN : v;
  const couts = plusC(plusC(plusC(t.apporteurs, primesDeduites), variableDeduit), salaires);
  return { ca: t.ca, apporteurs: t.apporteurs, primes: t.primes, variable: v, salaires, salairesSaisis, primesDeduites, variableDeduit, couts, net: moinsC(t.ca, couts), nbMois: 1,
    moisAvecSalaires: avec ? 1 : 0, moisSaisis: saisi ? 1 : 0 };
}
const sommeCouts = (xs: readonly CoutsLocation[]): CoutsLocation => {
  const k = ['ca', 'apporteurs', 'primes', 'variable', 'salaires', 'salairesSaisis', 'primesDeduites', 'variableDeduit', 'couts', 'net'] as const;
  return { ...Object.fromEntries(k.map((x) => [x, xs.reduce((s, c) => plusC(s, c[x]), RIEN)])) as Pick<CoutsLocation, (typeof k)[number]>,
    nbMois: xs.reduce((s, c) => s + c.nbMois, 0), moisAvecSalaires: xs.reduce((s, c) => s + c.moisAvecSalaires, 0), moisSaisis: xs.reduce((s, c) => s + c.moisSaisis, 0) };
};
/** Les coûts d'un ensemble de mois : la somme de ses mois (chacun à sa règle). `retros` : déjà filtrées (négociateurs choisis). PUR. */
export function coutsLocation(lignes: readonly LigneLocationCa[], ms: readonly { annee: number; mois: number }[], retros: readonly RetroLocation[],
  salaires: readonly SalairesLocation[] | null, avecSalaires = true): CoutsLocation {
  return sommeCouts(ms.map((m) => coutsLocationMois(lignesDesMois(lignes, [m]), retros.filter((r) => r.annee === m.annee && r.mois === m.mois), salaireDuMois(salaires, m.annee, m.mois), avecSalaires)));
}
/** Les salaires saisis d'un mois (null : non saisi). PUR. */
export const salairesLocationDuMois = salaireDuMois;

// ── Les sommes ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface TotauxLocationCa {
  nb: number; nbBaux: number; nbAvenants: number; nbGestionSeule: number;
  proprietaire: MontantC; locataire: MontantC; ca: MontantC; primes: MontantC; apporteurs: MontantC;
  /** Primes + apporteurs (la tuile « Primes et rétrocessions versées »). */
  couts: MontantC;
  /** 🔴 LOT LO5 — CA − commissions d'apporteurs (le « CA net d'apporteurs » du Suivi annuel). */
  netApporteurs: MontantC;
  net: MontantC;
  ids: number[];
}
/** Les totaux de lignes : CA, apporteurs, primes, nets par `sommesLocation` (la fonction des deux pages) ; les comptes et les parts à côté. PUR. */
export function totauxLocation(lignes: readonly LigneLocationCa[]): TotauxLocationCa {
  const s = sommesLocation(lignes);
  const t: TotauxLocationCa = { nb: 0, nbBaux: 0, nbAvenants: 0, nbGestionSeule: 0, proprietaire: RIEN, locataire: RIEN, ca: s.ca, primes: s.primes, apporteurs: s.apporteurs,
    couts: plusC(s.primes, s.apporteurs), netApporteurs: s.netApporteurs, net: s.net, ids: [] };
  for (const l of lignes) {
    t.nb += 1;
    if (l.type === 'bail') t.nbBaux += 1; else if (l.type === 'avenant') t.nbAvenants += 1; else t.nbGestionSeule += 1;
    t.proprietaire = plusC(t.proprietaire, l.proprietaireC); t.locataire = plusC(t.locataire, l.locataireC);
    t.ids.push(l.id);
  }
  return t;
}

/** Les lignes d'un ensemble de mois (« Le mois » : un, la période, ou les douze ; « L'année » : ceux des années choisies). PUR. */
export const lignesDesMois = (lignes: readonly LigneLocationCa[], ms: readonly { annee: number; mois: number }[]): LigneLocationCa[] =>
  lignes.filter((l) => ms.some((m) => m.annee === l.annee && m.mois === l.mois));
/** Les lignes des années choisies. PUR. */
export const lignesDesAnnees = (lignes: readonly LigneLocationCa[], annees: readonly number[]): LigneLocationCa[] => lignes.filter((l) => annees.includes(l.annee));
/** « Compter » et le filtre Négociateur (des clés : une personne, tous ses libellés). PUR. */
export function filtrerLocation(lignes: readonly LigneLocationCa[], compter: CompterLocation, negociateurs: readonly string[] | null): LigneLocationCa[] {
  return lignes.filter((l) => (compter === 'tous' || l.categorie === compter) && (negociateurs === null || negociateurs.includes(l.negociateur.cle)));
}
/** Les années qui ont au moins une ligne (et l'année en cours), dans l'ordre. PUR. */
export const anneesLocation = (lignes: readonly LigneLocationCa[], jour: string): number[] =>
  [...new Set([...lignes.map((l) => l.annee), Number(jour.slice(0, 4))])].sort((a, b) => a - b);
/** Les négociateurs (une personne par clé), par nom. PUR. */
export function negociateursLocation(lignes: readonly LigneLocationCa[]): { cle: string; nom: string }[] {
  const m = new Map<string, string>();
  for (const l of lignes) if (!m.has(l.negociateur.cle)) m.set(l.negociateur.cle, l.negociateur.nom);
  return [...m.entries()].map(([cle, nom]) => ({ cle, nom })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/** L'espace par négociateur : ses baux, son CA généré, ses primes, ses rétrocessions d'apporteurs, son CA net ; la somme = le Résultat. PUR. */
export interface LigneEspaceLocation { cle: string; nom: string; nb: number; ca: MontantC; primes: MontantC; apporteurs: MontantC; net: MontantC; ids: number[] }
export function espaceLocation(lignes: readonly LigneLocationCa[]): LigneEspaceLocation[] {
  const m = new Map<string, LigneEspaceLocation>();
  for (const l of lignes) {
    const a = m.get(l.negociateur.cle) ?? { cle: l.negociateur.cle, nom: l.negociateur.nom, nb: 0, ca: RIEN, primes: RIEN, apporteurs: RIEN, net: RIEN, ids: [] };
    m.set(l.negociateur.cle, { ...a, nb: a.nb + 1, ca: plusC(a.ca, l.caC), primes: plusC(a.primes, l.primeC), apporteurs: plusC(a.apporteurs, l.apporteurC), net: plusC(a.net, l.netC), ids: [...a.ids, l.id] });
  }
  return [...m.values()].sort((a, b) => b.ca.htC - a.ca.htC);
}

/**
 * ══ 🔴 LOT LO12 (Arno) — L'ESPACE PAR NÉGOCIATEUR À LA RÈGLE DES MOIS ═══════════════════════════════════════════════════════════════════════════
 * Le variable du négociateur s'y retire aussi, comme dans le CA net de la page : chaque mois, ses primes et son variable (ses dossiers − ses
 * rétrocessions du mois) sont déduits si le mois est compté SANS salaires (aucun saisi, ou « Sans salaires ») ; un mois AVEC salaires, ils sont
 * « inclus dans les salaires », non déduits. Les salaires chargés ne se répartissent pas entre négociateurs : la somme des lignes = le CA net de la
 * page + les salaires comptés. Un négociateur qui n'a qu'une rétrocession sur la période apparaît (0 bail), pour que la somme tombe juste. PUR.
 */
export interface LigneEspaceRegle extends LigneEspaceLocation {
  /** Le variable du négociateur (dossiers − rétrocessions) ; ce qui en est déduit ; les primes déduites. `net` = CA − apporteurs − primes et variable déduits. */
  variable: MontantC; variableDeduit: MontantC; primesDeduites: MontantC;
}
export function espaceLocationRegle(lignes: readonly LigneLocationCa[], ms: readonly { annee: number; mois: number }[], retros: readonly RetroLocation[],
  salaires: readonly SalairesLocation[] | null, avecSalaires = true): LigneEspaceRegle[] {
  const m = new Map<string, LigneEspaceRegle>();
  const vide = (cle: string, nom: string): LigneEspaceRegle => ({ cle, nom, nb: 0, ca: RIEN, primes: RIEN, apporteurs: RIEN, net: RIEN, ids: [], variable: RIEN, variableDeduit: RIEN, primesDeduites: RIEN });
  const noms = new Map(negociateursLocation(lignes).map((p) => [p.cle, p.nom]));
  for (const mo of ms) {
    const avec = avecSalaires && salaireDuMois(salaires, mo.annee, mo.mois) !== null;
    const duMois = lignesDesMois(lignes, [mo]);
    const rs = retros.filter((r) => r.annee === mo.annee && r.mois === mo.mois);
    for (const cle of new Set([...duMois.map((l) => l.negociateur.cle), ...rs.map((r) => r.negociateurCle)])) {
      const ls = duMois.filter((l) => l.negociateur.cle === cle);
      const c = coutsLocationMois(ls, rs.filter((r) => r.negociateurCle === cle), avec ? 0 : null);
      const a = m.get(cle) ?? vide(cle, noms.get(cle) ?? ls[0]?.negociateur.nom ?? cle);
      const net = moinsC(moinsC(moinsC(c.ca, c.apporteurs), c.primesDeduites), c.variableDeduit);
      m.set(cle, { ...a, nb: a.nb + ls.length, ca: plusC(a.ca, c.ca), primes: plusC(a.primes, c.primes), apporteurs: plusC(a.apporteurs, c.apporteurs),
        variable: plusC(a.variable, c.variable), variableDeduit: plusC(a.variableDeduit, c.variableDeduit), primesDeduites: plusC(a.primesDeduites, c.primesDeduites),
        net: plusC(a.net, net), ids: [...a.ids, ...ls.map((l) => l.id)] });
    }
  }
  return [...m.values()].sort((a, b) => b.ca.htC - a.ca.htC);
}

/** Les apporteurs de la période : ce qu'ils ont apporté (CA des baux) et ce qu'ils coûtent ; « Sans apporteur » à la fin. PUR. */
export interface LigneApporteurLocation { nom: string; nb: number; ca: MontantC; commission: MontantC; ids: number[] }
export const SANS_APPORTEUR = 'Sans apporteur';
export function apporteursLocation(lignes: readonly LigneLocationCa[]): LigneApporteurLocation[] {
  const m = new Map<string, LigneApporteurLocation>();
  for (const l of lignes) {
    const nom = l.apporteur ?? SANS_APPORTEUR;
    const a = m.get(nom) ?? { nom, nb: 0, ca: RIEN, commission: RIEN, ids: [] };
    m.set(nom, { nom, nb: a.nb + 1, ca: plusC(a.ca, l.caC), commission: plusC(a.commission, l.apporteurC), ids: [...a.ids, l.id] });
  }
  return [...m.values()].sort((a, b) => (a.nom === SANS_APPORTEUR ? 1 : b.nom === SANS_APPORTEUR ? -1 : b.ca.htC - a.ca.htC || a.nom.localeCompare(b.nom, 'fr')));
}

/**
 * ══ 🔴 LOT LO6 (Arno) — LE DÉTAIL DES FENÊTRES « PRIMES ET RÉTROCESSIONS » ET « CA NET » ══════════════════════════════════════════════════════
 * Aucun calcul nouveau : les montants de chaque ligne (`montantsLigne`, lot LO5) regroupés ; les totaux sont ceux des tuiles (`totauxLocation` →
 * `sommesLocation`). Les baux du plus récent au plus ancien (date, puis numéro). PUR.
 */
export interface GroupeApporteurLocation { nom: string; total: MontantC; lignes: LigneLocationCa[] }
export interface DetailCoutsLocation {
  /** Le total de la tuile 3 (primes + apporteurs) et ses deux sous-totaux. */
  total: MontantC; primes: MontantC; apporteurs: MontantC;
  /** Les baux qui portent une prime de nouvelle gestion. */
  lignesPrimes: LigneLocationCa[];
  /** Un groupe par apporteur (son cumul, ses baux), le plus gros cumul d'abord. */
  groupesApporteurs: GroupeApporteurLocation[];
  /** Les baux qui portent au moins un coût (« N baux concernés »). */
  baux: LigneLocationCa[];
}
/** Le nom d'un bail, comme sur sa carte : le bien, sinon « propriétaire / locataire ». PUR. */
export const titreBail = (l: Pick<LigneLocationCa, 'bien' | 'proprietaire' | 'locataire'>): string => l.bien ?? `${l.proprietaire} / ${l.locataire}`;
const nonNul = (m: MontantC): boolean => m.htC !== 0 || m.ttcC !== 0;
/** Du plus récent au plus ancien. PUR. */
export const parDateDecroissante = (lignes: readonly LigneLocationCa[]): LigneLocationCa[] =>
  [...lignes].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
export function detailCoutsLocation(lignes: readonly LigneLocationCa[]): DetailCoutsLocation {
  const t = totauxLocation(lignes);
  const triees = parDateDecroissante(lignes);
  const groupes = new Map<string, GroupeApporteurLocation>();
  for (const l of triees.filter((x) => nonNul(x.apporteurC))) {
    const nom = l.apporteur ?? 'Apporteur';
    const g = groupes.get(nom) ?? { nom, total: RIEN, lignes: [] };
    groupes.set(nom, { nom, total: plusC(g.total, l.apporteurC), lignes: [...g.lignes, l] });
  }
  return {
    total: t.couts, primes: t.primes, apporteurs: t.apporteurs,
    lignesPrimes: triees.filter((l) => nonNul(l.primeC)),
    groupesApporteurs: [...groupes.values()].sort((a, b) => b.total.htC - a.total.htC || a.nom.localeCompare(b.nom, 'fr')),
    baux: triees.filter((l) => nonNul(l.primeC) || nonNul(l.apporteurC)),
  };
}

/** Toute l'histoire : une ligne par année (baux, CA brut, coûts, CA net). PUR. */
export const historiqueLocation = (lignes: readonly LigneLocationCa[], annees: readonly number[]): { annee: number; t: TotauxLocationCa }[] =>
  annees.map((annee) => ({ annee, t: totauxLocation(lignesDesAnnees(lignes, [annee])) }));

/**
 * La fiche de recherche d'une carte (la règle partagée de la vente, `correspond`) : le bien (adresse), le propriétaire, les locataires, le négociateur,
 * l'apporteur ; les montants HT et TTC (CA, propriétaire, locataire, prime, apporteur, net). Les lignes du Suivi ne portent ni téléphone ni e-mail. PUR.
 */
export function ficheRechercheLocation(l: LigneLocationCa): FicheRecherche {
  const m = (x: MontantC): number[] => [x.htC / 100, x.ttcC / 100];
  return { textes: [l.bien ?? '', l.proprietaire, l.locataire, l.negociateur.nom, l.apporteur ?? ''].filter((x) => x.trim() !== '').map(normaliser), telephones: [],
    montants: [l.caC, l.proprietaireC, l.locataireC, l.primeC, l.apporteurC, l.netC].flatMap(m) };
}
/** Le tri des cartes (les tris de la vente : CA décroissant / croissant, date récente / ancienne), dans l'unité affichée ; égalité : le titre. PUR. */
export function trierLocation(lignes: readonly LigneLocationCa[], tri: TriListe, unite: 'ht' | 'ttc'): LigneLocationCa[] {
  const ca = (l: LigneLocationCa): number => (unite === 'ht' ? l.caC.htC : l.caC.ttcC);
  const titre = (l: LigneLocationCa): string => l.bien ?? l.proprietaire;
  const alpha = (a: LigneLocationCa, b: LigneLocationCa): number => titre(a).localeCompare(titre(b), 'fr', { sensitivity: 'base' }) || a.id - b.id;
  return [...lignes].sort((a, b) => (tri === 'ca-desc' ? ca(b) - ca(a) : tri === 'ca-asc' ? ca(a) - ca(b)
    : (tri === 'date-recent' ? -1 : 1) * a.date.localeCompare(b.date)) || alpha(a, b));
}

// ── 🔴 LOT LO2 (Arno, 01/11/2026) — LA MÊME RÈGLE TTC DANS LE SUIVI ANNUEL DE LA LOCATION ────────────────────────────────────────────────────
/** Le TTC (centimes) d'UN montant HT : `depuisHt` (HT au centime, TTC = HT × `TVA` au centime). PUR. */
export const ttcCentimes = (ht: number): number => depuisHt(ht).ttcC;
/** Le TTC (centimes) d'une somme de lignes : la somme des TTC de chaque ligne (la règle des totaux de cette page). PUR. */
export const ttcCentimesDesLignes = <A>(lignes: readonly A[], ht: (a: A) => number): number => lignes.reduce((t, a) => t + depuisHt(ht(a)).ttcC, 0);
/** Le CA d'une ligne (`caLigne`, au centime), en TTC, comme une ligne de cette page. */
export const caTtcC = (a: ActiviteCalcul): number => depuisHt(caLigne(a)).ttcC;
