import { caHtPortePar, compromisDuMode, LIBELLE_SOCIETE, negociateursDe, payeParClasseTtc, payeTtcDe, retroTtcDe, TVA, ventesDuMois, type ModeMois, type Retrocession, type Societe, type Vente } from './modele';
import { depuisTtc, ventilationVente, type MontantC, type VentilationCote } from './partAgence';
import { entreeEtSortie } from './lignesNegociateur';
import type { StatutDuLibelle } from './statutLigne';

/**
 * ══ 🔴 LOT CC (Arno, 31/10/2026) — LES LIGNES DE NÉGOCIATEUR DE LA CARTE D'AFFAIRE REPLIÉE (PUR) ═══════════════════════════════════════════
 * Sous le nom de l'affaire, une ligne par négociateur : « [Nom] · entrée — honoraires … · com négo … · reste … », les montants des CADRES de
 * la fiche dépliée (`ventilationVente`) :
 *   · honoraires = les honoraires nets de sa partie (cadre gris, apporteur déduit) ;
 *   · com négo = la commission de ce côté (cadres rouges) ; reste = la part de l'agence (cadre vert) ;
 *   · inter-cabinet versé à l'autre société sur ce côté : « reversé à MACJ … » à la place de com négo / reste ; agences extérieures : leur part ;
 *   · l'apporteur, une seule fois (ligne d'entrée) ; les rétrocessions saisies au mois et rattachées (« Le mois »), une seule fois aussi.
 * Somme des lignes (honoraires) + apporteur = la commission de la vente. Un seul négociateur (même des deux côtés, sortie inconnue) : une ligne,
 * sans « entrée / sortie ». Une vente sans répartition (historique importé) : une ligne — honoraires de la vente, sa paye, son reste.
 */

export interface LigneCarte {
  nom: string;
  /** null : un seul négociateur (pas de « entrée / sortie »). */
  cote: 'entree' | 'sortie' | null;
  honoraires: MontantC;
  /** La commission du négociateur de ce côté ; `comptabilisee` : déduite (indépendant) — sinon interne / à renseigner. */
  com: MontantC; comptabilisee: boolean;
  /** 🔴 LOT CF — la part de `com` déduite du reste (règle actuelle : celle d'un indépendant ; la commission d'une répartie, comme sa carte). */
  comDeduite: MontantC;
  /** 🔴 LOT CL — sa part des rétrocessions saisies au mois rattachées à la vente (déjà retirée de `honoraires`). */
  retro: MontantC;
  reste: MontantC;
  /** L'inter-cabinet versé à l'autre société sur ce côté (la porteuse) : remplace com négo / reste. */
  reverse: { vers: string; m: MontantC } | null;
  exterieures: { nom: string; m: MontantC }[];
  /** 🔴 LOT DP — la société du négociateur à la vente (sa partie de ce côté ; une vente sans répartition : la société de la vente) ; null : inconnue. */
  societe?: Societe | null;
}
export interface LignesCarte { lignes: LigneCarte[]; apporteur: MontantC | null; retro: MontantC | null }

const RIEN: MontantC = { htC: 0, ttcC: 0 };
const plus = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC + b.htC, ttcC: a.ttcC + b.ttcC });
const moins = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC - b.htC, ttcC: a.ttcC - b.ttcC });
const somme = (xs: readonly MontantC[]): MontantC => xs.reduce(plus, RIEN);
const nul = (m: MontantC): boolean => m.htC === 0 && m.ttcC === 0;

/** 🔴 LOT DP — la société du négociateur d'un côté (null : la ligne unique) : sa partie à la vente ; sans répartition, la société de la vente. PUR. */
export function societeDuCote(v: Pick<Vente, 'societe' | 'repartition'>, cote: 'entree' | 'sortie' | null): Societe | null {
  if (v.repartition == null) return v.societe;
  const sortes = cote === 'entree' ? ['entree', 'entree_sortie'] : cote === 'sortie' ? ['sortie', 'entree_sortie'] : ['entree', 'entree_sortie', 'sortie'];
  return v.repartition.parties.find((p) => sortes.includes(p.sorte) && p.negociateur && p.societe !== null)?.societe ?? null;
}

/** Le nom du négociateur d'un côté : sa partie ; une ligne miroir, son côté ; sinon le dossier. */
function nomDuCote(v: Vente, c: 'entree' | 'sortie'): string | null {
  const sortes = c === 'entree' ? ['entree', 'entree_sortie'] : ['sortie', 'entree_sortie'];
  return v.repartition?.parties.find((p) => sortes.includes(p.sorte) && p.negociateur)?.negociateur
    ?? v.miroir?.cotes.find((x) => x.cote === c)?.negociateur
    ?? (c === 'entree' ? v.dossier?.entree?.nom : v.dossier?.sortie?.nom) ?? null;
}

/** Le négociateur d'une vente à une ligne : l'entrée ; un import sans entrée, le nom importé. PUR. */
export const nomUnique = (v: Vente, nommer: (l: string) => string = (l) => l): string => {
  const e = nomDuCote(v, 'entree');
  return e !== null ? nommer(e) : (negociateursDe(v).map(nommer).join(', ') || 'négociateur à renseigner');
};

function ligneDe(nom: string, cote: 'entree' | 'sortie' | null, xs: readonly VentilationCote[], retro: MontantC): LigneCarte {
  const versees = xs.flatMap((x) => (x.versee === null ? [] : [x.versee]));
  const com = somme(xs.flatMap((x) => x.commissions.map((k) => k.m)));
  return {
    nom, cote,
    // 🔴 LOT CF — nettes aussi de SA part des rétrocessions saisies au mois (l'apporteur de la répartition l'est déjà : lot BB).
    honoraires: moins(somme(xs.map((x) => x.base)), retro),
    com, comptabilisee: true, comDeduite: com, retro,
    reste: moins(somme(xs.map((x) => x.agence)), retro),
    reverse: versees.length === 0 ? null : { vers: LIBELLE_SOCIETE[versees[0].vers], m: somme(versees.map((y) => y.m)) },
    exterieures: xs.flatMap((x) => x.quoteParts.filter((q) => q.cle === 'exterieure').map((q) => ({ nom: q.nom ?? 'agence extérieure', m: q.m }))),
  };
}

/** Partage `total` entre l'entrée et la sortie au prorata de la part de la sortie (`pct`, %) — la règle de l'apporteur (lot BB) ; l'entrée prend
 *  l'écart d'arrondi (la somme = le total, au centime, dans les deux unités). PUR. */
function partager(total: MontantC, pctSortie: number): { entree: MontantC; sortie: MontantC } {
  const sortie = { htC: Math.round((total.htC * pctSortie) / 100), ttcC: Math.round((total.ttcC * pctSortie) / 100) };
  return { entree: moins(total, sortie), sortie };
}

/**
 * Les lignes de négociateur de la carte repliée, pour la société vue (null : nos deux sociétés). PUR.
 * 🔴 LOT CF (Arno) — « honoraires nets » = honoraires de la partie (de la vente, pour un seul négociateur) MOINS toutes les rétrocessions
 * d'apporteurs qui la concernent : l'apporteur de la répartition (déjà déduit, lot BB) ET les rétrocessions saisies au mois rattachées à la vente
 * (partagées entre l'entrée et la sortie comme l'apporteur). Sur chaque ligne : honoraires nets − com négo déduite − reversé = reste, au centime ;
 * somme des lignes + apporteur + rétrocessions du mois (+ agences extérieures) = la commission de la vente. La seule fonction de ce calcul :
 * l'onglet Compromis, « Le mois » et la ligne miroir l'appellent tous.
 */
export function lignesCarteAffaire(v: Vente, vue: Societe | null, o: { retros?: readonly Retrocession[]; statutDuLibelle?: StatutDuLibelle;
  /** 🔴 LOT CG — le nom affiché d'un libellé (« Prénom NOM ») ; absent : tel quel. */
  nommer?: (libelle: string) => string } = {}): LignesCarte {
  // 🔴 LOT DP — chaque ligne porte la société de son négociateur à la vente (l'étiquette de la page FUSION).
  const l = lignesSansSociete(v, vue, o);
  return { ...l, lignes: l.lignes.map((x) => ({ ...x, societe: societeDuCote(v, x.cote) })) };
}
function lignesSansSociete(v: Vente, vue: Societe | null, o: { retros?: readonly Retrocession[]; statutDuLibelle?: StatutDuLibelle; nommer?: (libelle: string) => string }): LignesCarte {
  const retros = o.retros ?? [];
  const nommer = o.nommer ?? ((l: string) => l);
  const vent = ventilationVente(v, vue);
  const e = vent.entree; const s = vent.sortie;
  const retroMois = retroTtcDe(v, retros);
  const retroC = depuisTtc(retroMois);
  const retro = retroMois > 0 ? retroC : null;
  if (e === undefined && s === undefined) {
    // Historique sans répartition (ou vente lue chez l'autre société) : une ligne — la vente nette de ses rétrocessions, sa paye, son reste.
    const classes = payeParClasseTtc(v, o.statutDuLibelle, vue);
    const honoraires = moins(depuisTtc(v.honorairesTtc), retroC);
    const comDeduite = depuisTtc(classes.independant);
    return { apporteur: null, retro, lignes: [{ nom: nomUnique(v, nommer), cote: null, honoraires, com: depuisTtc(payeTtcDe(v, vue)),
      comptabilisee: classes.independant > 0, comDeduite, retro: retroC, reste: moins(honoraires, comDeduite), reverse: null, exterieures: [] }] };
  }
  const apporteurs = somme((e ?? s)!.apporteurs.map((a) => a.m));
  const apporteur = nul(apporteurs) ? null : apporteurs;
  const deux = entreeEtSortie(v);
  const cotes = [e, s].filter((x): x is VentilationCote => x !== undefined);
  if (deux === null || cotes.length < 2) { const n = nomDuCote(v, cotes[0].cote); return { apporteur, retro, lignes: [ligneDe(n !== null ? nommer(n) : nomUnique(v, nommer), null, cotes, retroC)] }; }
  const part = partager(retroC, s!.pctQuote);
  return { apporteur, retro, lignes: [ligneDe(nommer(deux[0]), 'entree', [e!], part.entree), ligneDe(nommer(deux[1]), 'sortie', [s!], part.sortie)] };
}

/**
 * 🔴 LOT CF — LE CONTRÔLE d'une carte : sur chaque ligne, honoraires nets − com négo déduite − reversé = reste ; et la somme des lignes + apporteur
 * + rétrocessions du mois + agences extérieures = la commission de la vente (la part reçue, pour une ligne miroir), au centime, en HT et en TTC.
 * Rend les écarts (vide : tout tombe juste). PUR.
 */
export function ecartsCarte(v: Vente, vue: Societe | null, l: LignesCarte): string[] {
  const out: string[] = [];
  const vent = ventilationVente(v, vue);
  const commission = (vent.entree ?? vent.sortie)?.commissionVente ?? depuisTtc(v.honorairesTtc);
  for (const x of l.lignes) {
    const calcule = moins(moins(x.honoraires, x.comDeduite), x.reverse?.m ?? RIEN);
    for (const u of ['htC', 'ttcC'] as const) if (calcule[u] !== x.reste[u]) out.push(`${x.nom}${x.cote ? ` (${x.cote})` : ''} : honoraires nets − com − reversé = ${calcule[u]} ≠ reste ${x.reste[u]} (${u})`);
  }
  const total = somme([...l.lignes.map((x) => x.honoraires), ...l.lignes.flatMap((x) => x.exterieures.map((y) => y.m)), l.apporteur ?? RIEN, l.retro ?? RIEN]);
  for (const u of ['htC', 'ttcC'] as const) if (total[u] !== commission[u]) out.push(`somme des lignes + rétrocessions = ${total[u]} ≠ commission ${commission[u]} (${u})`);
  return out;
}

/**
 * ══ 🔴 LOT CH (Arno, 31/10/2026) — LE « RÉSULTAT DE L'AGENCE » = LA SOMME DES CARTES AFFICHÉES (PUR) ═══════════════════════════════════════════
 * Calculé à partir des seules ventes / compromis affichés, avec la fonction des cartes (`lignesCarteAffaire`), sans copie de calcul :
 *   · CA = la commission de chaque carte ;
 *   · − Rétrocessions d'apporteurs = l'apporteur de la répartition + les rétrocessions RATTACHÉES à ces ventes, quel que soit leur mois de saisie ;
 *   · − Inter-cabinet (nos sociétés, extérieur) = les « reversé à … » et les agences extérieures des cartes ;
 *   · − Commissions des négociateurs indépendants = les « com négo » déduites des cartes ;
 *   · = Reste à l'agence = la somme des « reste » des cartes, au centime, en HT et en TTC (CA − tout ce qui précède).
 */
export interface ResultatCartes { ca: MontantC; retro: MontantC; interCabinet: MontantC; exterieur: MontantC; com: MontantC; reste: MontantC; ids: number[] }

export function resultatDesCartes(ventes: readonly Vente[], vue: Societe | null, o: { retros?: readonly Retrocession[]; statutDuLibelle?: StatutDuLibelle } = {}): ResultatCartes {
  const r: ResultatCartes = { ca: RIEN, retro: RIEN, interCabinet: RIEN, exterieur: RIEN, com: RIEN, reste: RIEN, ids: [] };
  for (const v of ventes) {
    const l = lignesCarteAffaire(v, vue, o);
    const vent = ventilationVente(v, vue);
    r.ca = plus(r.ca, (vent.entree ?? vent.sortie)?.commissionVente ?? depuisTtc(v.honorairesTtc));
    r.retro = plus(plus(r.retro, l.apporteur ?? RIEN), l.retro ?? RIEN);
    r.interCabinet = plus(r.interCabinet, somme(l.lignes.map((x) => x.reverse?.m ?? RIEN)));
    r.exterieur = plus(r.exterieur, somme(l.lignes.flatMap((x) => x.exterieures.map((y) => y.m))));
    r.com = plus(r.com, somme(l.lignes.map((x) => x.comDeduite)));
    r.reste = plus(r.reste, somme(l.lignes.map((x) => x.reste)));
    r.ids.push(v.id);
  }
  return r;
}

/**
 * ══ 🔴 LOT CW (Arno, 31/10/2026) — LE « CA NET » D'UNE VENTE : CE QU'ELLE RAPPORTE RÉELLEMENT À L'AGENCE (PUR) ══════════════════════════════════
 * Honoraires − commissions de TOUS les négociateurs (indépendants ET salariés / associés commissionnés, à renseigner : même celles non déduites du
 * « Reste à l'agence ») − rétrocessions d'apporteurs (de la répartition et saisies au mois rattachées) − reversé en inter-cabinet (nos sociétés,
 * agences extérieures). Sur les lignes de sa carte (`lignesCarteAffaire`, aucune copie de calcul) : la somme des « reste » (qui retirent déjà la
 * commission déduite, les rétrocessions et l'inter-cabinet) moins la part des commissions NON déduites. Au centime, en HT et en TTC.
 */
export function caNetVente(v: Vente, vue: Societe | null, o: { retros?: readonly Retrocession[]; statutDuLibelle?: StatutDuLibelle } = {}): MontantC {
  return somme(lignesCarteAffaire(v, vue, o).lignes.map((x) => moins(x.reste, moins(x.com, x.comDeduite))));
}
/** 🔴 LOT CW — le CA net de chaque mois (12 valeurs), selon le mode : les mêmes ventes que le CA du mois (`ventesDuMois`, `compromisDuMode`). PUR. */
export function caNetParMoisMode(ventes: readonly Vente[], annee: number, vue: Societe | null, mode: ModeMois, jour: string, o: { retros?: readonly Retrocession[]; statutDuLibelle?: StatutDuLibelle } = {}): MontantC[] {
  return Array.from({ length: 12 }, (_, i) => somme([...(mode === 'compromis' ? [] : ventesDuMois(ventes, annee, i + 1)), ...compromisDuMode(ventes, annee, i + 1, mode, jour)]
    .map((v) => caNetVente(v, vue, o))));
}

/** 🔴 LOT CH — les rétrocessions SAISIES sur la période mais rattachées à aucune vente affichée (« à répartir », ou une vente d'une autre période) :
 *  montrées à part, jamais déduites du Résultat. PUR. */
export const retrosSansVenteAffichee = (saisies: readonly Retrocession[], ids: readonly number[]): Retrocession[] =>
  saisies.filter((x) => x.venteId === null || !ids.includes(x.venteId));

/**
 * ══ 🔴 LOT CL (Arno, 31/10/2026) — « ESPACE PAR NÉGOCIATEUR » : PAR NÉGOCIATEUR, LES MÊMES MONTANTS QUE SES CARTES (PUR) ═══════════════════════════
 * Pour chaque négociateur (libellé tel qu'en base) : CA généré, Com (et sa part comptabilisée), Rétrocessions, CA net = CA généré − Com comptabilisée
 * − Rétrocessions = la somme des « reste » de ses lignes de cartes, au centime, en HT et en TTC ; la somme des CA nets = le Reste à l'agence du
 * Résultat (`resultatDesCartes`).
 *   · vente répartie (ou ligne miroir) : chaque ligne de sa carte (`lignesCarteAffaire`) — CA généré = ses honoraires nets avant les rétrocessions
 *     du mois, moins l'inter-cabinet reversé (ce qui reste à la société vue) ;
 *   · vente sans répartition : la vente partagée comme aujourd'hui (`caHtPortePar`, l'écart d'arrondi au dernier), sa commission à lui, les
 *     rétrocessions rattachées qui le nomment (les autres au premier négociateur).
 */
export interface LigneEspace { negociateur: string; ids: number[]; ca: MontantC; com: MontantC; comDeduite: MontantC; retro: MontantC; net: MontantC }

export function espaceNegociateurs(ventes: readonly Vente[], vue: Societe | null, o: { retros?: readonly Retrocession[]; statutDuLibelle?: StatutDuLibelle } = {}): LigneEspace[] {
  const retros = o.retros ?? [];
  const lignes = new Map<string, LigneEspace>();
  const ajouter = (nom: string, id: number, x: Omit<LigneEspace, 'negociateur' | 'ids'>): void => {
    const a = lignes.get(nom) ?? { negociateur: nom, ids: [], ca: RIEN, com: RIEN, comDeduite: RIEN, retro: RIEN, net: RIEN };
    lignes.set(nom, { negociateur: nom, ids: a.ids.includes(id) ? a.ids : [...a.ids, id], ca: plus(a.ca, x.ca), com: plus(a.com, x.com), comDeduite: plus(a.comDeduite, x.comDeduite),
      retro: plus(a.retro, x.retro), net: plus(a.net, x.net) });
  };
  for (const v of ventes) {
    const vent = ventilationVente(v, vue);
    if (vent.entree !== undefined || vent.sortie !== undefined) {
      for (const x of lignesCarteAffaire(v, vue, o).lignes) {
        const ca = moins(plus(x.honoraires, x.retro), x.reverse?.m ?? RIEN);
        ajouter(x.nom, v.id, { ca, com: x.com, comDeduite: x.comDeduite, retro: x.retro, net: x.reste });
      }
      continue;
    }
    const negos = negociateursDe(v);
    const liees = retros.filter((r) => r.venteId === v.id);
    // Les totaux de la vente, comme sa carte (centimes) ; le dernier négociateur prend l'écart d'arrondi de chaque colonne.
    let resteCa = depuisTtc(v.honorairesTtc);
    let resteDed = depuisTtc(payeParClasseTtc(v, o.statutDuLibelle, vue).independant);
    let resteRetro = depuisTtc(retroTtcDe(v, retros));
    negos.forEach((n, i) => {
      const dernier = i === negos.length - 1;
      const caHt = caHtPortePar(v, n, vue);
      const ca = dernier ? resteCa : { htC: Math.round(caHt * 100), ttcC: Math.round(caHt * TVA * 100) };
      const classes = payeParClasseTtc({ ...v, lignes: v.lignes.filter((l) => l.negociateur === n) }, o.statutDuLibelle, vue);
      const com = depuisTtc(classes.independant + classes.interne + classes.a_renseigner);
      const comDeduite = dernier ? resteDed : depuisTtc(classes.independant);
      const retroTtc = liees.filter((r) => r.negociateur === n || (i === 0 && !negos.includes(r.negociateur))).reduce((t, r) => t + r.montantTtc, 0);
      const retro = dernier ? resteRetro : depuisTtc(retroTtc);
      resteCa = moins(resteCa, ca); resteDed = moins(resteDed, comDeduite); resteRetro = moins(resteRetro, retro);
      ajouter(n, v.id, { ca, com, comDeduite, retro, net: moins(moins(ca, comDeduite), retro) });
    });
  }
  return [...lignes.values()].sort((a, b) => b.ca.htC - a.ca.htC || a.negociateur.localeCompare(b.negociateur, 'fr'));
}
