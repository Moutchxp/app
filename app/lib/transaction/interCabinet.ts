import { bilanVente, commissionNetteHt, LIBELLE_SOCIETE, societeDeLigne, societePorteuse, SOCIETES, TVA, type LigneVente, type Miroir, type Societe, type Vente } from './modele';
import { commissionIgnoree, commissionneDePartie, statutDePartie } from './statutLigne';
import { honorairesDuCote } from './commissions';

/**
 * ══ 🔴 TUILE « TRANSACTION », LOT R (Arno, 28/10/2026) — LA LIGNE MIROIR DE L'INTER-CABINET (PUR) ══════════════════════════════════
 *
 * Une vente répartie est PORTÉE par la société de son négociateur d'entrée (`societePorteuse`, modele.ts) : elle y encaisse toute la
 * commission. L'autre société, si elle reçoit une part, la voit sous la forme d'une LIGNE MIROIR « … — inter-cabinet reçu de … » :
 *   · ses honoraires sont SA PART seulement (HT et TTC) — jamais le montant de la vente ni la commission totale ;
 *   · elle suit la vie de la vente d'origine (même statut : compromis, vendue au mois de l'acte, annulée ; même année) ;
 *   · ses lignes : les commissions des négociateurs de CETTE société (leur statut figé recopié), et une ligne « part » par négociateur de
 *     cette société (le CA qu'il porte, pour l'espace négociateurs) ;
 *   · non modifiable directement : le lien « Voir la vente d'origine » ; seule la rémunération de son négociateur se modifie d'ici (elle
 *     s'enregistre sur la vente d'origine — aucune donnée dupliquée).
 * Elle est construite à la LECTURE depuis la vente d'origine (une seule vérité : jamais de doublon). Le REGISTRE (migration 440) garde sa
 * trace : créée, mise à jour, annulée quand la société ne reçoit plus rien (jamais supprimée), rétablie — journalisé.
 */

/** Une ligne du registre (440) pour une vente et une société qui reçoit. */
export interface EntreeRegistre { societe: Societe; porteuse: Societe; partHt: number; pourcentage: number | null; etat: 'active' | 'annulee'; modifieLe: string | null }

/** Le libellé d'une ligne miroir. PUR. */
export const libelleMiroir = (libelle: string, porteuse: Societe): string => `${libelle} — inter-cabinet reçu de ${LIBELLE_SOCIETE[porteuse]}`;

/** Les parts attendues chez nos autres sociétés (le registre doit les porter) : société, part HT, % de la commission nette. PUR. */
export function miroirsAttendus(v: Pick<Vente, 'societe' | 'honorairesTtc' | 'repartition'>): { societe: Societe; porteuse: Societe; partHt: number; pourcentage: number | null }[] {
  if (v.repartition == null) return [];
  const porteuse = societePorteuse(v);
  const net = commissionNetteHt(v.honorairesTtc, v.repartition.retroApporteurTtc);
  // Le % lu sur ses parties (une part en € HT ramenée en %) : sans division de la part par le net, donc sans écart de virgule.
  const pct = (s: Societe): number | null => (v.repartition!.parties.some((p) => p.societe === s && p.pourcentage === null) && net === 0 ? null
    : v.repartition!.parties.reduce((t, p) => t + (p.societe !== s ? 0 : p.pourcentage !== null ? p.pourcentage : ((p.montantHt ?? 0) / net) * 100), 0));
  return SOCIETES.filter((s) => s !== porteuse).map((s) => ({ s, part: bilanVente(v, s).recuHt }))
    .filter((x) => x.part > 0).map((x) => ({ societe: x.s, porteuse, partHt: x.part, pourcentage: pct(x.s) }));
}

/**
 * 🔴 LA LIGNE MIROIR d'une vente d'origine chez la société `s`, avec sa part (HT) et son état ; `annulee` : la société ne reçoit plus rien
 * (la dernière part connue, au registre) — la ligne reste, statut « annulée ». PUR.
 */
export function ligneMiroir(v: Vente, s: Societe, partHt: number, pourcentage: number | null, etat: 'active' | 'annulee', annuleeLe: string | null = null): Vente {
  const porteuse = societePorteuse(v);
  const r = v.repartition;
  const net = r == null ? 0 : commissionNetteHt(v.honorairesTtc, r.retroApporteurTtc);
  const partieDe = (cote: 'entree' | 'sortie') => r?.parties.find((p) => p.societe === s && (cote === 'entree' ? ['entree', 'entree_sortie'] : ['sortie', 'entree_sortie']).includes(p.sorte)
    && p.compteId !== null && (cote === 'entree' ? v.dossier?.entree?.id : v.dossier?.sortie?.id) === p.compteId);
  // Les côtés tenus par un négociateur de cette société : leur rémunération se lit (et se modifie) d'ici.
  const cotes: Miroir['cotes'] = (['entree', 'sortie'] as const).flatMap((cote) => {
    const p = partieDe(cote);
    const h = honorairesDuCote(v, cote);
    return p === undefined || p.negociateur === null || h === null ? []
      : [{ cote, negociateur: p.negociateur, compteId: p.compteId, statut: statutDePartie(p), baseTtc: h.ttc, commissionne: commissionneDePartie(p), part: h.part, netTtc: h.netTtc }];
  });
  // Ses lignes : les commissions des négociateurs de CETTE société (statut figé recopié) ; une ligne « part » par négociateur (CA porté).
  // 🔴 LOT S — la commission d'un négociateur NON COMMISSIONNÉ n'est pas recopiée (elle reste sur la vente d'origine, ignorée).
  const commissions: LigneVente[] = v.lignes.filter((l) => l.role === 'negociateur' && societeDeLigne(v, l) === s && !commissionIgnoree(v, l))
    .map((l) => ({ ...l, statut: cotes.find((c) => c.cote === l.cote)?.statut ?? r?.parties.find((p) => p.negociateur === l.negociateur && p.societe === s)?.statut ?? null }));
  const parNego = new Map<string, number>();
  if (r != null && etat === 'active') r.parties.forEach((p) => {
    if (p.societe !== s || p.negociateur === null) return;
    parNego.set(p.negociateur, (parNego.get(p.negociateur) ?? 0) + (p.pourcentage !== null ? (net * p.pourcentage) / 100 : p.montantHt ?? 0));
  });
  const parts: LigneVente[] = [...parNego].map(([negociateur, h], i) => ({ id: -(v.id * 10 + i + 1), negociateur, role: 'part', montantTtc: h * TVA, nature: v.statut === 'compromis' ? 'compromis' : 'vente',
    compte: true, origine: v.origine, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null }));
  const annulation = etat === 'annulee'
    ? { date: annuleeLe, motif: `Plus de part inter-cabinet pour ${LIBELLE_SOCIETE[s]} sur cette vente`, note: null }
    : v.statut === 'annulee' ? v.annulation ?? null : null;
  return {
    id: v.id, societe: s, libelle: libelleMiroir(v.libelle, porteuse), honorairesTtc: partHt * TVA,
    statut: etat === 'annulee' ? 'annulee' : v.statut, annee: v.annee, mois: v.mois, dateCompromis: v.dateCompromis, apporteur: null, note: null,
    origine: v.origine, sourceFichier: null, sourceOnglet: null, sourceLigne: null, lignes: [...parts, ...commissions], double: null,
    repartition: null, annulation, retroApporteur: null, prixVente: null,
    dossier: v.dossier == null ? null : { ...v.dossier, apporteurId: null },
    miroir: { origineId: v.id, porteuse, libelleOrigine: v.libelle, partHt, pourcentage, etat, cotes },
  };
}

/**
 * 🔴 LA VENTE TELLE QUE LA SOCIÉTÉ `s` LA VOIT : l'historique et la vente qu'elle porte, telles quelles ; la vente portée par l'autre
 * société dont elle reçoit une part, sa ligne miroir ; une part disparue mais connue du registre, la ligne miroir ANNULÉE (jamais
 * supprimée) ; sinon rien (null). PUR.
 */
export function venteDansSociete(v: Vente, s: Societe, registre?: EntreeRegistre | null): Vente | null {
  if (v.repartition == null) {
    if (v.societe === s) return v;
    return registre != null && registre.porteuse !== s ? ligneMiroir(v, s, registre.partHt, registre.pourcentage, 'annulee', registre.modifieLe) : null;
  }
  if (societePorteuse(v) === s) return v;
  const attendu = miroirsAttendus(v).find((m) => m.societe === s);
  if (attendu !== undefined) return ligneMiroir(v, s, attendu.partHt, attendu.pourcentage, 'active');
  return registre != null ? ligneMiroir(v, s, registre.partHt, registre.pourcentage, 'annulee', registre.modifieLe) : null;
}

/** Un changement à porter au registre (journalisé) : créer, mettre à jour, annuler, rétablir. */
export type OperationRegistre =
  | { sorte: 'creer'; societe: Societe; porteuse: Societe; partHt: number; pourcentage: number | null }
  | { sorte: 'maj' | 'retablir'; societe: Societe; porteuse: Societe; partHt: number; pourcentage: number | null; avant: EntreeRegistre }
  | { sorte: 'annuler'; societe: Societe; avant: EntreeRegistre };

const meme = (a: number | null, b: number | null): boolean => (a === null || b === null ? a === b : Math.abs(a - b) < 1e-9);

/**
 * 🔴 CE QUE LE REGISTRE DOIT DEVENIR après un geste sur la vente d'origine : une part neuve → créée ; une part changée (%, négociateur,
 * commission, apporteur) → mise à jour ; une part retrouvée → rétablie ; une part disparue → annulée (jamais supprimée) ; inchangée : rien. PUR.
 */
export function planRegistre(attendus: ReturnType<typeof miroirsAttendus>, existants: readonly EntreeRegistre[]): OperationRegistre[] {
  const ops: OperationRegistre[] = [];
  for (const a of attendus) {
    const e = existants.find((x) => x.societe === a.societe);
    if (e === undefined) ops.push({ sorte: 'creer', ...a });
    else if (e.etat === 'annulee') ops.push({ sorte: 'retablir', ...a, avant: e });
    else if (!meme(e.partHt, a.partHt) || !meme(e.pourcentage, a.pourcentage) || e.porteuse !== a.porteuse) ops.push({ sorte: 'maj', ...a, avant: e });
  }
  for (const e of existants) if (e.etat === 'active' && !attendus.some((a) => a.societe === e.societe)) ops.push({ sorte: 'annuler', societe: e.societe, avant: e });
  return ops;
}
