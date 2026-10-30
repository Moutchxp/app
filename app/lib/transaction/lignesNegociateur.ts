import { enCentimes } from './detailCommissions';
import { payeParClasseTtc, payeTtcDe, resteTtcDe, retroTtcDe, TVA, type Retrocession, type Societe, type Vente } from './modele';
import { ventilationVente, type MontantC } from './partAgence';
import type { StatutDuLibelle } from './statutLigne';

/**
 * ══ 🔴 LOT BW (Arno, 30/10/2026) — « LE MOIS » : UNE LIGNE PAR NÉGOCIATEUR ══════════════════════════════════════════════════════════════════════
 * Une vente dont la SORTIE a été faite par un AUTRE négociateur que celui qui a rentré le mandat se lit en DEUX lignes : l'entrée (porteur du
 * mandat, côté vendeurs), puis la sortie, chacune avec SA partie — les montants des cadres des cartes de la fiche (`ventilationVente`) :
 *   · honoraires de la partie = ses honoraires nets (cadre gris) + sa part de l'apporteur + sa quote-part d'agence extérieure ; l'apporteur (déduit EN
 *     ENTIER dans l'en-tête de chaque carte, règle du lot BB) se partage ici au prorata de la part du côté (`pctQuote`), l'entrée prenant l'écart ;
 *   · rétrocessions = sa part de l'apporteur (+ les rétrocessions saisies au mois, sur la ligne d'entrée) ; « reversé à … » : l'inter-cabinet versé
 *     à l'autre société et les agences extérieures de ce côté ;
 *   · com négo = la commission enregistrée de son négociateur ;
 *   · reste agence = honoraires − rétrocessions − reversés − commission (d'un indépendant) ; la ligne d'entrée prend l'écart d'arrondi, pour que
 *     la SOMME DES DEUX LIGNES = LA VENTE, au centime (honoraires, rétrocessions, commission, reste).
 * Une vente à un seul négociateur (entrée = sortie, sortie inconnue, import sans répartition), ou une ligne miroir : null (une ligne, comme avant).
 * PUR.
 */

export interface LigneNegociateur {
  cote: 'entree' | 'sortie'; negociateur: string;
  honoraires: MontantC;
  retro: MontantC;
  reverses: { vers: string; m: MontantC }[];
  /** La commission (TTC) et ce qui n'en est pas déduit (interne, statut à renseigner). */
  payeTtc: number; payeNonDeduiteTtc: number; payeARenseigner: boolean;
  reste: MontantC;
}

const RIEN: MontantC = { htC: 0, ttcC: 0 };
const plus = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC + b.htC, ttcC: a.ttcC + b.ttcC });
const moins = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC - b.htC, ttcC: a.ttcC - b.ttcC });
const somme = (xs: readonly MontantC[]): MontantC => xs.reduce(plus, RIEN);
const depuisTtc = (ttc: number): MontantC => ({ htC: enCentimes(ttc / TVA), ttcC: enCentimes(ttc) });
const memeNom = (a: string | null, b: string | null): boolean => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/** Les deux lignes d'une vente tenue par deux négociateurs ; null : une seule ligne. PUR. */
export function lignesParNegociateur(v: Vente, retros: readonly Retrocession[], statutDuLibelle: StatutDuLibelle | undefined, societe: Societe | null): [LigneNegociateur, LigneNegociateur] | null {
  const r = v.repartition;
  if (r == null || v.miroir != null || r.parties.some((p) => p.sorte === 'entree_sortie')) return null;
  const pe = r.parties.find((p) => p.sorte === 'entree');
  const ps = r.parties.find((p) => p.sorte === 'sortie');
  if (pe?.negociateur == null || ps?.negociateur == null) return null;
  if ((pe.compteId !== null && pe.compteId === ps.compteId) || memeNom(pe.negociateur, ps.negociateur)) return null;
  const vent = ventilationVente(v, societe);
  const ve = vent.entree; const vs = vent.sortie;
  if (ve === undefined || vs === undefined) return null;
  // La commission de chaque côté : ses lignes « negociateur » (une ligne sans côté — d'avant — va à l'entrée).
  const cote = (c: 'entree' | 'sortie'): Vente => ({ ...v, lignes: v.lignes.filter((l) => l.role !== 'negociateur' || (l.cote ?? 'entree') === c) });
  // L'apporteur (le même total dans les deux en-têtes) : la part de la sortie au prorata de sa part ; l'entrée, le reste (somme exacte).
  const apporteurTotal = somme(vs.apporteurs.map((a) => a.m));
  const partSortie: MontantC = { htC: Math.round((apporteurTotal.htC * vs.pctQuote) / 100), ttcC: Math.round((apporteurTotal.ttcC * vs.pctQuote) / 100) };
  const partApporteur = { entree: moins(apporteurTotal, partSortie), sortie: partSortie };
  const ligne = (c: 'entree' | 'sortie', x: NonNullable<typeof ve>, nom: string): LigneNegociateur => {
    const apporteur = partApporteur[c];
    const exterieures = x.quoteParts.filter((q) => q.cle === 'exterieure').map((q) => ({ vers: q.nom ?? 'agence extérieure', m: q.m }));
    const reverses = [...(x.versee === null ? [] : [{ vers: x.versee.vers.toUpperCase(), m: x.versee.m }]), ...exterieures];
    const retro = c === 'entree' ? plus(apporteur, depuisTtc(retroTtcDe(v, retros))) : apporteur;
    const vc = cote(c);
    const classes = payeParClasseTtc(vc, statutDuLibelle, societe);
    const honoraires = plus(x.honoraires, apporteur);
    const reste = moins(moins(moins(honoraires, retro), somme(reverses.map((y) => y.m))), depuisTtc(classes.independant));
    return { cote: c, negociateur: nom, honoraires, retro, reverses, payeTtc: payeTtcDe(vc, societe), payeNonDeduiteTtc: classes.interne + classes.a_renseigner,
      payeARenseigner: classes.a_renseigner > 0, reste };
  };
  const e = ligne('entree', ve, pe.negociateur);
  const s = ligne('sortie', vs, ps.negociateur);
  // La somme des deux lignes = la vente, au centime : l'entrée prend l'écart d'arrondi (honoraires : la commission de la vente ; reste : celui de la vente).
  const honorairesVente = depuisTtc(v.honorairesTtc);
  const resteVenteTtc = resteTtcDe(v, retros, statutDuLibelle, societe);
  const resteVente: MontantC = { htC: enCentimes(resteVenteTtc / TVA), ttcC: enCentimes(resteVenteTtc) };
  if (ve.recuDe === null && v.societe === (societe ?? v.societe)) e.honoraires = moins(honorairesVente, s.honoraires);
  e.reste = moins(resteVente, s.reste);
  return [e, s];
}
