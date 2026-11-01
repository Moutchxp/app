// ══ 🔴 LOT LO1 (Arno, 01/11/2026) — « SUIVI CHIFFRE D'AFFAIRES › LOCATION » : L'ACTIVITÉ ÉCONOMIQUE DE LA LOCATION (PUR) ══════════════════════════
// La source : les lignes du Suivi du mois de la Location (`gestion_location_activite`, lues par `lireActivites` : non annulées — une location
// supprimée au lot LS1 est une ligne annulée), et ses fonctions de calcul, sans copie : le CA d'une ligne (`caLigne`), sa prime de nouvelle gestion
// (`primeDe`), la commission de son apporteur à la signature (`partLocationDe` + `partGestionSignatureDe`, ce que `totaux` additionne en
// « apporteurs »). Société : CRITERIMMO. Les montants du Suivi sont HT ; le TTC = HT × `TVA` (1,20, la constante de la vente). Chaque montant d'une
// ligne est mis au centime une fois (HT, et TTC à partir du HT) ; tout total est la somme des centimes des lignes : la tuile, le Résultat, l'Espace
// par négociateur et les cartes tombent juste au centime, et « CA net = CA brut − primes − apporteurs » ligne par ligne.
// N'entrent PAS dans les coûts (et le disent) : la part gestion « Récurrent » des apporteurs (due mois après mois, sans bail de la période), le dû
// aux collègues, la commission du négociateur et ses rétrocessions (`gestion_location_retrocession` : elles diminuent SA commission, pas le CA).
import { apporteurAffiche, caLigne, cleNegociateur, partGestionSignatureDe, partLocationDe, primeDe, type ActiviteLue } from '../location/suivi/tableauBord';
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

/** Une ligne du Suivi → sa ligne d'activité économique (les fonctions de la Location, sans copie). PUR. */
export function ligneLocationCa(a: ActiviteLue, ctx: { regles: readonly RegleCommission[]; apporteurs: readonly Apporteur[] }): LigneLocationCa {
  // le CA de la ligne : celui du Suivi (`caLigne`), au centime ; la part locataire est le reste (propriétaire + locataire = CA, au centime)
  const caC = depuisHt(caLigne(a));
  const proprietaireC = depuisHt(a.honoProprietaireHt);
  const locataireC = moinsC(caC, proprietaireC);
  const primeC = depuisHt(primeDe(a, ctx.regles));
  const apporteurC = depuisHt(partLocationDe(a, ctx.apporteurs) + partGestionSignatureDe(a, ctx.apporteurs));
  const app = apporteurAffiche(a, ctx.apporteurs as Apporteur[]);
  const bien = a.lots?.find((l) => l.annexeDe == null)?.libelle ?? a.lots?.[0]?.libelle ?? null;
  return {
    id: Number(a.id), type: a.type, categorie: categorieDe(a), date: a.dateSignature, dateSupposee: a.dateSupposee === true,
    annee: Number(a.dateSignature.slice(0, 4)), mois: Number(a.dateSignature.slice(5, 7)),
    proprietaire: a.libelleProprietaire, locataire: (a.locataires ?? []).map((l) => l.libelle).join(', ') || a.libelleLocataire, bien,
    negociateur: { cle: cleNegociateur(a), nom: a.negociateurLibelle || '—' },
    apporteur: app.source === 'apporteur' && app.texte !== '' ? app.texte : a.apporteurId !== null ? (a.apporteurNom ?? 'Apporteur') : null,
    proprietaireC, locataireC, caC, primeC, apporteurC, netC: moinsC(moinsC(caC, primeC), apporteurC), lotId: a.lotId, bailId: a.bailId,
  };
}

// ── Les sommes ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface TotauxLocationCa {
  nb: number; nbBaux: number; nbAvenants: number; nbGestionSeule: number;
  proprietaire: MontantC; locataire: MontantC; ca: MontantC; primes: MontantC; apporteurs: MontantC;
  /** Primes + apporteurs (la tuile « Primes et rétrocessions versées »). */
  couts: MontantC;
  net: MontantC;
  ids: number[];
}
/** Les totaux de lignes : la somme de leurs centimes. PUR. */
export function totauxLocation(lignes: readonly LigneLocationCa[]): TotauxLocationCa {
  const t: TotauxLocationCa = { nb: 0, nbBaux: 0, nbAvenants: 0, nbGestionSeule: 0, proprietaire: RIEN, locataire: RIEN, ca: RIEN, primes: RIEN, apporteurs: RIEN, couts: RIEN, net: RIEN, ids: [] };
  for (const l of lignes) {
    t.nb += 1;
    if (l.type === 'bail') t.nbBaux += 1; else if (l.type === 'avenant') t.nbAvenants += 1; else t.nbGestionSeule += 1;
    t.proprietaire = plusC(t.proprietaire, l.proprietaireC); t.locataire = plusC(t.locataire, l.locataireC); t.ca = plusC(t.ca, l.caC);
    t.primes = plusC(t.primes, l.primeC); t.apporteurs = plusC(t.apporteurs, l.apporteurC); t.net = plusC(t.net, l.netC);
    t.ids.push(l.id);
  }
  t.couts = plusC(t.primes, t.apporteurs);
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
