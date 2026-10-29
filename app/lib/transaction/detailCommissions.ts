import { bilanVente, commissionNetteHt, ht, LIBELLE_SOCIETE, partsHt, SOCIETES, TVA, type Societe, type Vente } from './modele';
import { apporteurVerseHt, commissionsNegociateurs, type VenteTuile } from './commissions';
import type { StatutDuLibelle } from './statutLigne';
import type { Statut } from '../admin/statut';
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

/** Une ligne de coût, en CENTIMES (HT et TTC). 🔴 LOT AQ — `statut` : celui du négociateur à la vente (ses lignes seules). */
export interface LigneCout { venteId: number; cle: CleCout; qui: string; htC: number; ttcC: number; statut?: Statut | null }
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

/** 🔴 LOT AX (Arno) — L'ORDRE DES CATÉGORIES DE COMMISSIONS, de haut en bas, partout où elles s'affichent (les deux fenêtres, par catégorie
 *  et par transaction ; la synthèse « Ce que l'on doit ») : la SEULE constante d'ordre, jamais réécrite ailleurs. */
export const ORDRE_CATEGORIES = ['independants', 'inter-cabinet', 'apporteurs', 'exterieur'] as const;
export type FamilleCategorie = (typeof ORDRE_CATEGORIES)[number];
export const familleDe = (cle: CleVersee): FamilleCategorie => (cle.startsWith('inter-cabinet-') ? 'inter-cabinet' : cle as Exclude<CleVersee, `inter-cabinet-${Societe}`>);
/** Le rang d'une ligne ou d'une catégorie dans cet ordre ; les informations non déduites, après les quatre. PUR. */
export const rangCategorie = (cle: CleCout): number => (estVersee(cle) ? ORDRE_CATEGORIES.indexOf(familleDe(cle)) : ORDRE_CATEGORIES.length);
const parRang = <T extends { cle: CleCout }>(a: T, b: T): number => rangCategorie(a.cle) - rangCategorie(b.cle);

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
  const ajouter = (venteId: number, cle: CleCout, qui: string, htC: number, ttcC: number, statut?: Statut | null): void => {
    if (htC !== 0 || ttcC !== 0) lignes.push({ venteId, cle, qui, htC, ttcC, ...(statut !== undefined ? { statut } : {}) });
  };
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
      ajouter(v.id, c.classe === 'independant' ? 'independants' : c.classe === 'interne' ? 'internes' : 'a-renseigner', c.negociateur, ...deux(c.ht, undefined, undefined), c.statut);
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
  const versees = ORDRE_CATEGORIES.flatMap((f): CleVersee[] => (f === 'inter-cabinet' ? autres.map((s) => `inter-cabinet-${s}` as const) : [f])).map(categorie);
  // Une société vue ne verse jamais d'inter-cabinet à elle-même ; une telle ligne (ne devrait pas arriver) n'est pas perdue pour autant.
  for (const s of SOCIETES) if (!autres.includes(s) && lignes.some((x) => x.cle === `inter-cabinet-${s}`)) versees.push(categorie(`inter-cabinet-${s}`));
  versees.sort(parRang);
  const infos = [categorie('internes'), ...(['a-renseigner', 'neutralise'] as const).map(categorie).filter((c) => c.lignes.length > 0)];
  const affaires: AffaireCout[] = enCours.map((v) => {
    // LOT AX — les lignes de l'affaire dans l'ordre des catégories (tri stable : deux indépendants gardent leur ordre).
    const l = lignes.filter((x) => x.venteId === v.id).sort(parRang);
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

/** 🔴 LOT AN — le nombre de dossiers concernés : les affaires qui ont au moins une commission VERSÉE (les internes seuls n'y comptent pas). PUR. */
export const dossiersConcernes = (d: Pick<DetailCommissions, 'affaires'>): AffaireCout[] => d.affaires.filter((a) => a.lignes.some((l) => estVersee(l.cle)));

// ── 🔴 LOT AN (Arno, 29/10/2026) — LE DÉTAIL DE LA TUILE « CHIFFRE D'AFFAIRES » ─────────────────────────────────────────────────────────
//
// La règle EXACTE de la tuile (`bilanVente`, lot R) : le CA d'une société = la commission entière des ventes qu'elle PORTE + la part REÇUE
// en inter-cabinet (ses lignes miroir). Ce que la porteuse reverse (à l'autre société, à une agence extérieure) n'est PAS déduit du CA : il
// est compté dans « Commissions versées » ; la fenêtre le montre à sa place dans l'ordre comptable, sans le soustraire. Nos deux sociétés
// (CA global) : chaque vente une fois, l'inter-cabinet entre nos sociétés neutralisé. Les centimes : ceux des cartes (règle du lot AH) ; le
// total = la somme des lignes, et la tuile affiche ce total.

export type CleCa = `portee-${Societe}` | `recu-${Societe}` | `reverse-${Societe}` | 'exterieur' | 'neutralise';
export interface LigneCa { venteId: number; cle: CleCa; qui: string; htC: number; ttcC: number }
export interface SectionCa { cle: CleCa; libelle: string; lignes: LigneCa[]; htC: number; ttcC: number;
  /** compte : dans le CA (vert) ; info : montré, non compté dans le CA (reversé : rouge ; neutralisé : gris). */
  compte: boolean }
export interface AffaireCa {
  id: number; libelle: string; dateCompromis: string | null; recueDe: Societe | null;
  /** La commission de la vente (vente portée ; nos deux sociétés) ; null : une ligne miroir (sa seule part est connue). */
  commissionHtC: number | null; commissionTtcC: number | null;
  lignes: LigneCa[];
  /** Le CA de la société vue sur cette affaire. */
  caHtC: number; caTtcC: number;
}
export interface DetailCa { totalHtC: number; totalTtcC: number; sections: SectionCa[]; affaires: AffaireCa[];
  /** Nos deux sociétés : le CA de chacune (sa part reçue comprise), comme la tuile le disait. */
  parSociete: Record<Societe, { htC: number; ttcC: number }> | null }

export const estCompteeCa = (cle: CleCa): boolean => cle.startsWith('portee-') || cle.startsWith('recu-');

/** 🔴 LOT AN — LE DÉTAIL DU « CHIFFRE D'AFFAIRES » des compromis en cours, pour une société (null : nos deux sociétés). PUR. */
export function detailCa(ventes: readonly VenteDetail[], societe: Societe | null, statutDuLibelle?: StatutDuLibelle): DetailCa {
  const enCours = ventes.filter((v) => v.statut === 'compromis');
  const couts = detailCommissions(ventes, societe, statutDuLibelle);
  const lignes: LigneCa[] = [];
  const commissions = new Map<number, { htC: number; ttcC: number }>();
  for (const v of enCours) {
    const b = bilanVente(v, societe);
    if (b.caHt !== 0) {
      // Le CA de la vente pour cette vue : la commission entière (vente portée) ou la part reçue (ligne miroir) — HT au centime, TTC tel que la carte.
      const htC = enCentimes(b.caHt); const ttcC = enCentimes(v.honorairesTtc);
      if (v.miroir != null) lignes.push({ venteId: v.id, cle: `recu-${v.miroir.porteuse}`, qui: LIBELLE_SOCIETE[v.miroir.porteuse], htC, ttcC });
      else lignes.push({ venteId: v.id, cle: `portee-${b.porteuse}`, qui: LIBELLE_SOCIETE[b.porteuse], htC, ttcC });
    }
    if (v.miroir == null) commissions.set(v.id, { htC: enCentimes(ht(v.honorairesTtc)), ttcC: enCentimes(v.honorairesTtc) });
  }
  // Le reversé (inter-cabinet versé, agences extérieures) et le neutralisé : les lignes et les centimes du détail des commissions.
  for (const l of [...couts.versees.flatMap((c) => c.lignes), ...couts.infos.flatMap((c) => c.lignes)]) {
    if (l.cle.startsWith('inter-cabinet-')) lignes.push({ venteId: l.venteId, cle: `reverse-${l.cle.slice('inter-cabinet-'.length) as Societe}`, qui: l.qui, htC: l.htC, ttcC: l.ttcC });
    else if (l.cle === 'exterieur' || l.cle === 'neutralise') lignes.push({ venteId: l.venteId, cle: l.cle, qui: l.qui, htC: l.htC, ttcC: l.ttcC });
  }
  const section = (cle: CleCa, libelle: string): SectionCa => {
    const l = lignes.filter((x) => x.cle === cle);
    return { cle, libelle, lignes: l, htC: l.reduce((t, x) => t + x.htC, 0), ttcC: l.reduce((t, x) => t + x.ttcC, 0), compte: estCompteeCa(cle) };
  };
  const autres = societe === null ? [] : SOCIETES.filter((s) => s !== societe);
  const sections: SectionCa[] = societe === null
    ? [...SOCIETES.map((s) => section(`portee-${s}`, `Ventes portées par ${LIBELLE_SOCIETE[s]}`)),
      section('exterieur', 'Reversé à des agences extérieures — compté dans « Commissions versées », non déduit du CA'),
      section('neutralise', 'Inter-cabinet entre nos sociétés — neutralisé (compté une fois)')]
    : [section(`portee-${societe}`, `Ventes portées par ${LIBELLE_SOCIETE[societe]}`),
      ...autres.map((s) => section(`reverse-${s}`, `− Reversé en inter-cabinet vers ${LIBELLE_SOCIETE[s]} — compté dans « Commissions versées », non déduit du CA`)),
      section('exterieur', '− Reversé à des agences extérieures — compté dans « Commissions versées », non déduit du CA'),
      ...autres.map((s) => section(`recu-${s}`, `+ Reçu en inter-cabinet de ${LIBELLE_SOCIETE[s]}`))];
  const comptees = lignes.filter((x) => estCompteeCa(x.cle));
  const affaires: AffaireCa[] = enCours.map((v) => {
    const l = lignes.filter((x) => x.venteId === v.id);
    const ca = l.filter((x) => estCompteeCa(x.cle));
    const c = commissions.get(v.id) ?? null;
    return { id: v.id, libelle: v.libelle, dateCompromis: v.dateCompromis || null, recueDe: v.miroir?.porteuse ?? null, commissionHtC: c?.htC ?? null, commissionTtcC: c?.ttcC ?? null,
      lignes: l.filter((x) => !estCompteeCa(x.cle) || x.cle.startsWith('recu-')), caHtC: ca.reduce((t, x) => t + x.htC, 0), caTtcC: ca.reduce((t, x) => t + x.ttcC, 0) };
  }).sort((a, b) => {
    const da = a.dateCompromis; const db = b.dateCompromis;
    return da === db ? b.id - a.id : da === null ? 1 : db === null ? -1 : db.localeCompare(da);
  });
  const parSociete = societe !== null ? null : Object.fromEntries(SOCIETES.map((s) => {
    const portees = lignes.filter((x) => x.cle === `portee-${s}`);
    const recus = SOCIETES.filter((o) => o !== s).flatMap((o) => lignes.filter((x) => x.cle === 'neutralise' && enCours.find((v) => v.id === x.venteId) !== undefined && bilanVente(enCours.find((v) => v.id === x.venteId)!, null).porteuse === o));
    const htC = portees.reduce((t, x) => t + x.htC, 0) + recus.reduce((t, x) => t + x.htC, 0);
    const ttcC = portees.reduce((t, x) => t + x.ttcC, 0) + recus.reduce((t, x) => t + x.ttcC, 0);
    return [s, { htC, ttcC }];
  })) as Record<Societe, { htC: number; ttcC: number }>;
  return { totalHtC: comptees.reduce((t, x) => t + x.htC, 0), totalTtcC: comptees.reduce((t, x) => t + x.ttcC, 0), sections, affaires, parSociete };
}

/** 🔴 LOT AN — les dossiers du CA : les affaires qui apportent un CA à la société vue. PUR. */
export const dossiersCa = (d: Pick<DetailCa, 'affaires'>): AffaireCa[] => d.affaires.filter((a) => a.caHtC !== 0 || a.caTtcC !== 0);

// ── 🔴 LOT AO (Arno, 29/10/2026) — LE DÉTAIL DE LA TUILE « SOLDE NET » ───────────────────────────────────────────────────────────────────
//
// Le Solde net = le Chiffre d'affaires (`detailCa`) − les Commissions versées (`detailCommissions`), au centime : les MÊMES objets, aucune
// copie de calcul — les catégories et leurs sous-totaux sont ceux de la fenêtre « Commissions versées », le CA celui de la tuile.

export interface AffaireSolde {
  id: number; libelle: string; dateCompromis: string | null; recueDe: Societe | null;
  /** Le CA de la société vue sur cette affaire. */
  caHtC: number; caTtcC: number;
  /** Ses commissions VERSÉES (celles de la fenêtre « Commissions versées »). */
  couts: LigneCout[];
  soldeHtC: number; soldeTtcC: number;
}
export interface DetailSolde { ca: DetailCa; couts: DetailCommissions; totalHtC: number; totalTtcC: number; affaires: AffaireSolde[] }

/** 🔴 LOT AO — LE DÉTAIL DU « SOLDE NET », à partir des deux détails déjà calculés (ceux des tuiles). PUR. */
export function detailSolde(ca: DetailCa, couts: DetailCommissions): DetailSolde {
  const affaires: AffaireSolde[] = dossiersCa(ca).map((a) => {
    const c = couts.affaires.find((x) => x.id === a.id);
    const versees = (c?.lignes ?? []).filter((l) => estVersee(l.cle));
    const vHt = versees.reduce((t, l) => t + l.htC, 0); const vTtc = versees.reduce((t, l) => t + l.ttcC, 0);
    return { id: a.id, libelle: a.libelle, dateCompromis: a.dateCompromis, recueDe: a.recueDe, caHtC: a.caHtC, caTtcC: a.caTtcC, couts: versees, soldeHtC: a.caHtC - vHt, soldeTtcC: a.caTtcC - vTtc };
  });
  return { ca, couts, totalHtC: ca.totalHtC - couts.totalHtC, totalTtcC: ca.totalTtcC - couts.totalTtcC, affaires };
}

// ── 🔴 LOT AQ (Arno, 29/10/2026) — « CE QUE L'ON DOIT — COMPROMIS NON ENCORE SIGNÉS » ──────────────────────────────────────────────────
//
// Le même périmètre que les tuiles (compromis en cours : ni acte signé, ni annulés, quel que soit leur mois) et les MÊMES lignes au centime
// (`detailCommissions`, `detailCa`) regroupées par personne : négociateurs, apporteurs, agences, inter-cabinet. Aucun calcul recopié : le
// « Total à verser » EST le total de la tuile « Commissions versées ». Chaque montant dit la part des compromis du mois en cours (date du
// compromis) et celle des affaires sans date (« date à renseigner », jamais perdues).

/** Un montant en centimes, avec sa part « ce mois » et sa part « date à renseigner ». */
export interface SommeDu { htC: number; ttcC: number; moisHtC: number; moisTtcC: number; sansDateHtC: number; sansDateTtcC: number }
export interface LigneDu { venteId: number; date: string | null; htC: number; ttcC: number; statut?: Statut | null }
/** Une personne (négociateur, apporteur, agence) ou un sens d'inter-cabinet : ses affaires et leur cumul. */
export interface PersonneDu extends SommeDu { cle: string; nom: string; lignes: LigneDu[]; nbDossiers: number;
  /** Négociateurs : la classe de ses commissions (indépendant : dans le total ; interne / à renseigner : hors total). */
  classe?: 'independant' | 'interne' | 'a_renseigner'; statuts?: (Statut | null)[] }
export interface DetailDu {
  nbDossiers: number;
  negociateurs: PersonneDu[]; apporteurs: PersonneDu[]; agences: PersonneDu[];
  /** L'autre société (une société vue) ; null : nos deux sociétés. */
  autre: Societe | null; reverse: PersonneDu | null; recu: PersonneDu | null;
  /** Reçu − reversé (centimes) : positif, l'autre société doit ce montant à la société vue ; négatif, l'inverse. */
  soldeInterHtC: number; soldeInterTtcC: number;
  /** Nos deux sociétés : l'inter-cabinet entre elles, neutralisé. */
  neutralise: PersonneDu | null;
  /** = le total de la tuile « Commissions versées ». */
  total: SommeDu; internes: SommeDu; aRenseigner: SommeDu;
}

const VIDE: SommeDu = { htC: 0, ttcC: 0, moisHtC: 0, moisTtcC: 0, sansDateHtC: 0, sansDateTtcC: 0 };
/** La somme de lignes, avec sa part du mois (`mois` : « AAAA-MM ») et sa part sans date. PUR. */
export function sommeDu(lignes: readonly LigneDu[], mois: string): SommeDu {
  return lignes.reduce((t, l) => ({ htC: t.htC + l.htC, ttcC: t.ttcC + l.ttcC,
    moisHtC: t.moisHtC + (l.date !== null && l.date.startsWith(mois) ? l.htC : 0), moisTtcC: t.moisTtcC + (l.date !== null && l.date.startsWith(mois) ? l.ttcC : 0),
    sansDateHtC: t.sansDateHtC + (l.date === null ? l.htC : 0), sansDateTtcC: t.sansDateTtcC + (l.date === null ? l.ttcC : 0) }), { ...VIDE });
}

/** 🔴 LOT AQ — « CE QUE L'ON DOIT » des compromis en cours, pour une société (null : nos deux sociétés), au jour `aujourdhui` (AAAA-MM-JJ). PUR. */
export function detailDu(couts: DetailCommissions, ca: DetailCa, ventes: readonly Pick<Vente, 'id' | 'statut' | 'dateCompromis'>[], societe: Societe | null, aujourdhui: string): DetailDu {
  const mois = aujourdhui.slice(0, 7);
  const dates = new Map(ventes.map((v) => [v.id, v.dateCompromis || null]));
  const ligne = (l: { venteId: number; htC: number; ttcC: number; statut?: Statut | null }): LigneDu => ({ venteId: l.venteId, date: dates.get(l.venteId) ?? null, htC: l.htC, ttcC: l.ttcC,
    ...(l.statut !== undefined ? { statut: l.statut } : {}) });
  const tri = (a: LigneDu, b: LigneDu): number => (a.date === b.date ? b.venteId - a.venteId : a.date === null ? 1 : b.date === null ? -1 : b.date.localeCompare(a.date));
  const personne = (cle: string, nom: string, lignes: LigneDu[], extra: Partial<PersonneDu> = {}): PersonneDu => {
    const l = [...lignes].sort(tri);
    return { cle, nom, lignes: l, nbDossiers: new Set(l.map((x) => x.venteId)).size, ...sommeDu(l, mois), ...extra };
  };
  const parQui = (cles: readonly CleCout[], prefixe: string, extra: (ls: LigneCout[]) => Partial<PersonneDu> = () => ({})): PersonneDu[] => {
    const groupes = new Map<string, LigneCout[]>();
    for (const c of [...couts.versees, ...couts.infos]) if (cles.includes(c.cle)) for (const l of c.lignes) groupes.set(`${c.cle}|${l.qui}`, [...(groupes.get(`${c.cle}|${l.qui}`) ?? []), l]);
    return [...groupes.entries()].map(([k, ls]) => personne(`${prefixe}-${k}`, ls[0].qui, ls.map(ligne), extra(ls)))
      .sort((a, b) => b.ttcC - a.ttcC || a.nom.localeCompare(b.nom));
  };
  const classeDe = (cle: CleCout): PersonneDu['classe'] => (cle === 'independants' ? 'independant' : cle === 'internes' ? 'interne' : 'a_renseigner');
  const negociateurs = parQui(['independants', 'internes', 'a-renseigner'], 'negociateur', (ls) => ({ classe: classeDe(ls[0].cle), statuts: [...new Set(ls.map((l) => l.statut ?? null))] }));
  const autre = societe === null ? null : SOCIETES.find((s) => s !== societe) ?? null;
  const lignesDe = (cle: CleCout): LigneDu[] => [...couts.versees, ...couts.infos].filter((c) => c.cle === cle).flatMap((c) => c.lignes.map(ligne));
  const reverse = autre === null ? null : personne('reverse', LIBELLE_SOCIETE[autre], lignesDe(`inter-cabinet-${autre}`));
  const recu = autre === null ? null : personne('recu', LIBELLE_SOCIETE[autre], ca.sections.filter((c) => c.cle === `recu-${autre}`).flatMap((c) => c.lignes.map(ligne)));
  const neutralise = societe !== null ? null : personne('neutralise', 'CRITERIMMO ↔ MACJ', lignesDe('neutralise'));
  const versees = couts.versees.flatMap((c) => c.lignes.map(ligne));
  const total = sommeDu(versees, mois);
  return {
    nbDossiers: ventes.filter((v) => v.statut === 'compromis').length,
    negociateurs, apporteurs: parQui(['apporteurs'], 'apporteur'), agences: parQui(['exterieur'], 'agence'),
    autre, reverse, recu, soldeInterHtC: (recu?.htC ?? 0) - (reverse?.htC ?? 0), soldeInterTtcC: (recu?.ttcC ?? 0) - (reverse?.ttcC ?? 0), neutralise,
    // le total à verser : la somme exacte des lignes versées, celle de la tuile (`couts.totalHtC`) — vérifié par les tests
    total: { ...total, htC: couts.totalHtC, ttcC: couts.totalTtcC },
    internes: sommeDu(lignesDe('internes'), mois), aRenseigner: sommeDu(lignesDe('a-renseigner'), mois),
  };
}
