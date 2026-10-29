import { bilanVente, commissionNetteHt, ht, LIBELLE_SOCIETE, partsHt, SOCIETES, TVA, type Societe, type Vente } from './modele';
import { apporteurVerseHt, commissionsNegociateurs, type VenteTuile } from './commissions';
import type { StatutDuLibelle } from './statutLigne';
import { auCentime, centimesRepartition } from './repartition';

/**
 * ══ 🔴 LOT AL (Arno, 29/10/2026) — LE DÉTAIL DE LA TUILE « COMMISSIONS VERSÉES » (PUR) ══════════════════════════════════════════════════
 *
 * La fenêtre ouverte par la tuile relit ce que la tuile additionne (`tuilesCompromis` : les mêmes montants exacts), ligne par ligne :
 *   · versées (dans le total) : l'apporteur de chaque affaire, l'inter-cabinet versé à l'autre société, chaque agence extérieure, chaque
 *     négociateur indépendant ;
 *   · à titre d'information, non déduits : les internes (associés, salariés), les statuts à renseigner, et — vue des deux sociétés —
 *     l'inter-cabinet entre nos sociétés, neutralisé.
 * LES CENTIMES — la règle du lot AH (`centimesRepartition`) : chaque ligne est au MÊME centime que sur sa carte (l'apporteur, la part
 * reversée à l'autre société, chaque agence extérieure ; un négociateur : sa commission arrondie), et le total est la SOMME de ces
 * centimes. La tuile affiche ce total : lignes, sous-totaux par catégorie, sous-totaux par affaire et tuile font le même nombre au
 * centime, et reste + reversements + apporteur = commission de la vente, comme sur la carte. Aucun calcul ne change : les montants
 * exacts sont ceux de la tuile ; seul leur arrondi d'affichage suit la règle des cartes.
 */

export type CleVersee = 'apporteurs' | `inter-cabinet-${Societe}` | 'exterieur' | 'independants';
export type CleInfo = 'internes' | 'a-renseigner' | 'neutralise';
export type CleCout = CleVersee | CleInfo;

/** Une ligne de coût, en CENTIMES (HT et TTC). */
export interface LigneCout { venteId: number; cle: CleCout; qui: string; htC: number; ttcC: number }
export interface CategorieCout { cle: CleCout; libelle: string; lignes: LigneCout[]; htC: number; ttcC: number }
export interface AffaireCout {
  id: number; libelle: string; dateCompromis: string | null;
  /** La ligne miroir (inter-cabinet reçu) : la société porteuse ; null : une vente de la société vue. */
  recueDe: Societe | null;
  /** La commission de la vente pour cette vue (la ligne miroir : sa seule part). */
  commissionHt: number; commissionTtc: number;
  lignes: LigneCout[];
  /** Le versé de l'affaire (lignes dans le total), en centimes. */
  verseHtC: number; verseTtcC: number;
}
export interface DetailCommissions {
  totalHtC: number; totalTtcC: number;
  /** Les catégories versées, toujours toutes (vide : « Aucune » à 0,00), dans l'ordre d'Arno. */
  versees: CategorieCout[];
  /** Les informations non déduites : les internes toujours ; le reste s'il y a lieu. */
  infos: CategorieCout[];
  /** Les affaires, de la plus récente (date du compromis) à la plus ancienne ; sans date à la fin. */
  affaires: AffaireCout[];
}

export const ETIQUETTE: Record<CleCout, string> = {
  apporteurs: 'Apporteur', 'inter-cabinet-criterimmo': 'Inter-cabinet', 'inter-cabinet-macj': 'Inter-cabinet', exterieur: 'Agence extérieure',
  independants: 'Indépendant', internes: 'Interne non déduit', 'a-renseigner': 'Statut à renseigner', neutralise: 'Inter-cabinet neutralisé',
};
export const estVersee = (cle: CleCout): cle is CleVersee => cle !== 'internes' && cle !== 'a-renseigner' && cle !== 'neutralise';

const libelleCategorie = (cle: CleCout): string =>
  cle === 'apporteurs' ? 'Apporteurs d’affaires' : cle === 'exterieur' ? 'Agences extérieures' : cle === 'independants' ? 'Indépendants'
    : cle === 'internes' ? 'Internes (associés, salariés) — non déduits' : cle === 'a-renseigner' ? 'Statut à renseigner — non déduits'
      : cle === 'neutralise' ? 'Inter-cabinet entre nos sociétés — neutralisé' : `Inter-cabinet vers ${LIBELLE_SOCIETE[cle.slice('inter-cabinet-'.length) as Societe]}`;

/** Un montant en centimes, à la règle du lot AH (`auCentime`). PUR. */
export const enCentimes = (x: number): number => Math.round(auCentime(x) * 100);

type VenteDetail = VenteTuile & Pick<Vente, 'id' | 'libelle' | 'dateCompromis' | 'apporteur'>;

/** Les noms des négociateurs d'une société sur une vente (« Pierre Thevenin et … ») ; aucun : la société. PUR. */
function negociateursDe(v: VenteDetail, s: Societe): string {
  const noms = [...new Set((v.repartition?.parties ?? []).filter((p) => p.sorte !== 'exterieure' && p.societe === s && p.negociateur).map((p) => p.negociateur as string))];
  return noms.length === 0 ? LIBELLE_SOCIETE[s] : noms.join(' et ');
}

/** 🔴 LOT AL — LE DÉTAIL DES « COMMISSIONS VERSÉES » des compromis en cours, pour une société (null : nos deux sociétés). PUR. */
export function detailCommissions(ventes: readonly VenteDetail[], societe: Societe | null, statutDuLibelle?: StatutDuLibelle): DetailCommissions {
  const enCours = ventes.filter((v) => v.statut === 'compromis');
  const lignes: LigneCout[] = [];
  const ajouter = (venteId: number, cle: CleCout, qui: string, htC: number, ttcC: number): void => { if (htC !== 0 || ttcC !== 0) lignes.push({ venteId, cle, qui, htC, ttcC }); };
  for (const v of enCours) {
    const b = bilanVente(v, societe);
    const r = v.repartition ?? null;
    // La règle des cartes (lot AH), en HT et en TTC ; null (répartition qui ne fait pas 100 %) : chaque montant exact arrondi.
    const cHt = r === null ? null : centimesRepartition(r.parties, v.honorairesTtc, r.retroApporteurTtc, b.porteuse);
    const cTtc = r === null ? null : centimesRepartition(r.parties, v.honorairesTtc, r.retroApporteurTtc, b.porteuse, 'ttc');
    const deux = (exact: number, h: number | undefined, t: number | undefined): [number, number] =>
      [h === undefined ? enCentimes(exact) : enCentimes(h), t === undefined ? enCentimes(exact * TVA) : enCentimes(t)];
    const app = apporteurVerseHt(v, societe, b);
    if (app !== 0) ajouter(v.id, 'apporteurs', v.apporteur?.trim() || 'Apporteur à renseigner', ...deux(app, cHt?.apporteurHt, cTtc?.apporteurHt));
    for (const s of SOCIETES) if (b.verseHt[s] !== 0) ajouter(v.id, `inter-cabinet-${s}`, negociateursDe(v, s), ...deux(b.verseHt[s], cHt?.reverse[s], cTtc?.reverse[s]));
    if (b.exterieurHt !== 0 && r !== null) {
      const parts = partsHt(r.parties, commissionNetteHt(v.honorairesTtc, r.retroApporteurTtc));
      r.parties.forEach((p, i) => {
        if (p.sorte !== 'exterieure' || parts[i] === 0) return;
        ajouter(v.id, 'exterieur', p.nom?.trim() || 'Agence extérieure', ...deux(parts[i], cHt?.parts[i], cTtc?.parts[i]));
      });
    }
    for (const c of commissionsNegociateurs(v, societe, b, statutDuLibelle)) {
      ajouter(v.id, c.classe === 'independant' ? 'independants' : c.classe === 'interne' ? 'internes' : 'a-renseigner', c.negociateur, ...deux(c.ht, undefined, undefined));
    }
    if (b.neutraliseHt !== 0) {
      const autres = SOCIETES.filter((s) => s !== b.porteuse);
      const somme = (c: typeof cHt): number | undefined => (c === null ? undefined : autres.reduce((t, s) => t + c.parSociete[s], 0));
      ajouter(v.id, 'neutralise', autres.map((s) => negociateursDe(v, s)).join(' et '), ...deux(b.neutraliseHt, somme(cHt), somme(cTtc)));
    }
  }
  const total = (l: readonly LigneCout[]): { htC: number; ttcC: number } => ({ htC: l.reduce((t, x) => t + x.htC, 0), ttcC: l.reduce((t, x) => t + x.ttcC, 0) });
  const categorie = (cle: CleCout): CategorieCout => { const l = lignes.filter((x) => x.cle === cle); return { cle, libelle: libelleCategorie(cle), lignes: l, ...total(l) }; };
  const autres = societe === null ? [] : SOCIETES.filter((s) => s !== societe);
  const versees = (['apporteurs', ...autres.map((s) => `inter-cabinet-${s}` as const), 'exterieur', 'independants'] as CleVersee[]).map(categorie);
  // Une société vue ne verse jamais d'inter-cabinet à elle-même ; une telle ligne (ne devrait pas arriver) n'est pas perdue pour autant.
  for (const s of SOCIETES) if (!autres.includes(s) && lignes.some((x) => x.cle === `inter-cabinet-${s}`)) versees.splice(1, 0, categorie(`inter-cabinet-${s}`));
  const infos = [categorie('internes'), ...(['a-renseigner', 'neutralise'] as const).map(categorie).filter((c) => c.lignes.length > 0)];
  const affaires: AffaireCout[] = enCours.map((v) => {
    const l = lignes.filter((x) => x.venteId === v.id);
    const t = total(l.filter((x) => estVersee(x.cle)));
    return { id: v.id, libelle: v.libelle, dateCompromis: v.dateCompromis || null, recueDe: v.miroir?.porteuse ?? null,
      commissionHt: v.miroir != null ? v.miroir.partHt : ht(v.honorairesTtc), commissionTtc: v.honorairesTtc, lignes: l, verseHtC: t.htC, verseTtcC: t.ttcC };
  }).sort((a, b) => {
    // Une date vide ou absente (historique importé) compte comme manquante : à la fin.
    const da = a.dateCompromis || null; const db = b.dateCompromis || null;
    return da === db ? b.id - a.id : da === null ? 1 : db === null ? -1 : db.localeCompare(da);
  });
  const t = total(lignes.filter((x) => estVersee(x.cle)));
  return { totalHtC: t.htC, totalTtcC: t.ttcC, versees, infos, affaires };
}
