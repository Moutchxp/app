import { LIBELLE_SOCIETE, negociateursDe, payeParClasseTtc, payeTtcDe, resteTtcDe, retroTtcDe, type Retrocession, type Societe, type Vente } from './modele';
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
  reste: MontantC;
  /** L'inter-cabinet versé à l'autre société sur ce côté (la porteuse) : remplace com négo / reste. */
  reverse: { vers: string; m: MontantC } | null;
  exterieures: { nom: string; m: MontantC }[];
}
export interface LignesCarte { lignes: LigneCarte[]; apporteur: MontantC | null; retro: MontantC | null }

const RIEN: MontantC = { htC: 0, ttcC: 0 };
const plus = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC + b.htC, ttcC: a.ttcC + b.ttcC });
const somme = (xs: readonly MontantC[]): MontantC => xs.reduce(plus, RIEN);
const nul = (m: MontantC): boolean => m.htC === 0 && m.ttcC === 0;

/** Le nom du négociateur d'un côté : sa partie ; une ligne miroir, son côté ; sinon le dossier. */
function nomDuCote(v: Vente, c: 'entree' | 'sortie'): string | null {
  const sortes = c === 'entree' ? ['entree', 'entree_sortie'] : ['sortie', 'entree_sortie'];
  return v.repartition?.parties.find((p) => sortes.includes(p.sorte) && p.negociateur)?.negociateur
    ?? v.miroir?.cotes.find((x) => x.cote === c)?.negociateur
    ?? (c === 'entree' ? v.dossier?.entree?.nom : v.dossier?.sortie?.nom) ?? null;
}

/** Le négociateur d'une vente à une ligne : l'entrée ; un import sans entrée, le nom importé. PUR. */
export const nomUnique = (v: Vente): string => nomDuCote(v, 'entree') ?? (negociateursDe(v).join(', ') || 'négociateur à renseigner');

function ligneDe(nom: string, cote: 'entree' | 'sortie' | null, xs: readonly VentilationCote[]): LigneCarte {
  const versees = xs.flatMap((x) => (x.versee === null ? [] : [x.versee]));
  return {
    nom, cote,
    honoraires: somme(xs.map((x) => x.base)),
    com: somme(xs.flatMap((x) => x.commissions.map((k) => k.m))), comptabilisee: true,
    reste: somme(xs.map((x) => x.agence)),
    reverse: versees.length === 0 ? null : { vers: LIBELLE_SOCIETE[versees[0].vers], m: somme(versees.map((y) => y.m)) },
    exterieures: xs.flatMap((x) => x.quoteParts.filter((q) => q.cle === 'exterieure').map((q) => ({ nom: q.nom ?? 'agence extérieure', m: q.m }))),
  };
}

/** Les lignes de négociateur de la carte repliée, pour la société vue (null : nos deux sociétés). PUR. */
export function lignesCarteAffaire(v: Vente, vue: Societe | null, o: { retros?: readonly Retrocession[]; statutDuLibelle?: StatutDuLibelle } = {}): LignesCarte {
  const retros = o.retros ?? [];
  const vent = ventilationVente(v, vue);
  const e = vent.entree; const s = vent.sortie;
  const retroMois = retroTtcDe(v, retros);
  const retro = retroMois > 0 ? depuisTtc(retroMois) : null;
  if (e === undefined && s === undefined) {
    // Historique sans répartition (ou vente lue chez l'autre société) : une ligne — la vente, sa paye, son reste.
    const classes = payeParClasseTtc(v, o.statutDuLibelle, vue);
    return { apporteur: null, retro, lignes: [{ nom: nomUnique(v), cote: null, honoraires: depuisTtc(v.honorairesTtc), com: depuisTtc(payeTtcDe(v, vue)),
      comptabilisee: classes.independant > 0, reste: depuisTtc(resteTtcDe(v, retros, o.statutDuLibelle, vue)), reverse: null, exterieures: [] }] };
  }
  const apporteurs = somme((e ?? s)!.apporteurs.map((a) => a.m));
  const apporteur = nul(apporteurs) ? null : apporteurs;
  const deux = entreeEtSortie(v);
  const cotes = [e, s].filter((x): x is VentilationCote => x !== undefined);
  if (deux === null || cotes.length < 2) return { apporteur, retro, lignes: [ligneDe(nomDuCote(v, cotes[0].cote) ?? nomUnique(v), null, cotes)] };
  return { apporteur, retro, lignes: [ligneDe(deux[0], 'entree', [e!]), ligneDe(deux[1], 'sortie', [s!])] };
}
