import { espaceNegociateurs } from '../transaction/carteAffaireLignes';
import { pourLaVue } from '../transaction/compromisEnCours';
import { negociateursDe, type Vente } from '../transaction/modele';
import type { MontantC } from '../transaction/partAgence';

/**
 * ══ 🔴 MON ESPACE, LOT 3 (Arno, 02/11/2026) — « MES AFFAIRES » : QUELLES VENTES SONT À MOI, CE QUE J'EN REÇOIS, MON CA (PUR) ═══════════════════════
 *
 * Aucune donnée propre : les ventes sont celles du Suivi CA (`lireVentes(null)` : chaque vente une fois, comme FUSION / CA global), filtrées ici.
 *   · À MOI : je suis sur au moins un côté — négociateur d'entrée ou de sortie du dossier, une partie de la répartition (mon compte), ou, pour
 *     une vente importée, un libellé des fichiers rattaché à mon compte (« CEDRIC », « jb.pons@… » → le compte ; règle existante
 *     `comptesRapprochesDesLibelles`, appliquée par le dépôt qui fournit `libelles`).
 *   · CE QUE J'EN REÇOIS (décision 2 d'Arno) : toute la vente, MAIS la commission et le taux de rémunération de l'AUTRE collègue sont RETIRÉS
 *     (ses lignes « paye du négociateur ») — pas masqués à l'écran : absents de la réponse. Un administrateur reçoit tout.
 *   · MON CA (décision 1) : les honoraires rattachés à mes côtés, par la fonction de l'« Espace par négociateur » (`espaceNegociateurs`, vue
 *     FUSION) — jamais un calcul recopié. Les ventes notées chez les deux sociétés et non attribuées sont écartées comme partout (`pourLaVue`).
 */

/** Qui je suis pour les ventes : mon compte, et les libellés de négociateur qui me désignent (les miens, tels qu'en base). */
export interface Moi { compteId: number; libelles: ReadonlySet<string> }

/** Les côtés que je tiens sur une vente : 'entree', 'sortie', ou 'unique' (une vente importée sans répartition, où mon libellé figure). PUR. */
export function mesCotes(v: Vente, moi: Moi): ('entree' | 'sortie' | 'unique')[] {
  const cotes = new Set<'entree' | 'sortie' | 'unique'>();
  const d = v.dossier;
  if (d?.entree?.id === moi.compteId) cotes.add('entree');
  if (d?.sortie?.id === moi.compteId) cotes.add('sortie');
  for (const p of v.repartition?.parties ?? []) {
    const aMoi = (p.compteId !== null && p.compteId === moi.compteId) || (p.negociateur !== null && moi.libelles.has(p.negociateur));
    if (!aMoi) continue;
    if (p.sorte === 'entree' || p.sorte === 'entree_sortie') cotes.add('entree');
    if (p.sorte === 'sortie' || p.sorte === 'entree_sortie') cotes.add('sortie');
  }
  if (v.repartition == null && cotes.size === 0 && v.lignes.some((l) => moi.libelles.has(l.negociateur))) cotes.add('unique');
  return [...cotes];
}

export const estAMoi = (v: Vente, moi: Moi): boolean => mesCotes(v, moi).length > 0;

/**
 * La vente telle qu'un collaborateur la reçoit : sans la commission (ni le taux, ni le mode) d'un AUTRE négociateur. Une ligne « paye du
 * négociateur » reste si elle est à moi : mon libellé, ou le côté (entrée / sortie) que je tiens. PUR.
 */
export function sansCommissionsDesAutres(v: Vente, moi: Moi): Vente {
  const cotes = mesCotes(v, moi);
  const aMoi = (l: Vente['lignes'][number]): boolean => moi.libelles.has(l.negociateur)
    || (v.repartition != null && cotes.includes((l.cote ?? 'entree') as 'entree' | 'sortie'));
  return { ...v, lignes: v.lignes.filter((l) => l.role !== 'negociateur' || aMoi(l)) };
}

/**
 * Mon CA sur ces ventes : la somme des « CA généré » de MES lignes de l'Espace par négociateur (vue FUSION), au centime, HT et TTC. Le libellé
 * d'une ligne est celui de la partie ou du fichier : il est à moi s'il figure dans `moi.libelles`. PUR.
 */
export function monCa(ventes: readonly Vente[], moi: Moi): MontantC {
  return espaceNegociateurs(ventes, null).filter((l) => moi.libelles.has(l.negociateur))
    .reduce((t, l) => ({ htC: t.htC + l.ca.htC, ttcC: t.ttcC + l.ca.ttcC }), { htC: 0, ttcC: 0 });
}
/**
 * 🔴 Décision 13 (Arno, 02/11/2026) — MON CA NET : la colonne « CA net » de MES lignes de l'Espace par négociateur (vue FUSION) — mon CA, moins ma
 * commission déduite, moins les rétrocessions de mon côté — avec les options de la page du Suivi CA (rétrocessions, statut des négociateurs). PUR.
 */
export function monCaNet(ventes: readonly Vente[], moi: Moi, o: Parameters<typeof espaceNegociateurs>[2] = {}): MontantC {
  return espaceNegociateurs(ventes, null, o).filter((l) => moi.libelles.has(l.negociateur))
    .reduce((t, l) => ({ htC: t.htC + l.net.htC, ttcC: t.ttcC + l.net.ttcC }), { htC: 0, ttcC: 0 });
}

export interface Compteur { nb: number; ids: number[]; ca: MontantC }
export interface CompteursMonEspace { compromis: Compteur; actees: Compteur & { annee: number };
  /** 🔴 LOT 4 — « Mes ventes » : mes ventes actées, par année de l'acte (la plus récente d'abord), chacune son nombre et mon CA. */
  parAnnee?: (Compteur & { annee: number })[] }

/** Les deux compteurs de l'accueil : mes compromis en cours, mes ventes actées de l'année (année de l'acte). PUR. */
export function compteursMonEspace(ventes: readonly Vente[], moi: Moi, aujourdhui: string): CompteursMonEspace {
  const annee = Number(aujourdhui.slice(0, 4));
  const miennes = ventes.filter((v) => pourLaVue(v, null) && estAMoi(v, moi));
  const compteur = (xs: readonly Vente[]): Compteur => ({ nb: xs.length, ids: xs.map((v) => v.id), ca: monCa(xs, moi) });
  const vendues = miennes.filter((v) => v.statut === 'vendue');
  const annees = [...new Set(vendues.map((v) => v.annee))].sort((a, b) => b - a);
  return {
    compromis: compteur(miennes.filter((v) => v.statut === 'compromis')),
    actees: { annee, ...compteur(vendues.filter((v) => v.annee === annee)) },
    parAnnee: annees.map((a) => ({ annee: a, ...compteur(vendues.filter((v) => v.annee === a)) })),
  };
}

/** Les libellés de négociateur d'une vente (parties, lignes, dossier) — ceux que le dépôt rapproche des comptes. PUR. */
export function libellesDeVente(v: Vente): string[] {
  return [...new Set([...negociateursDe(v), ...v.lignes.map((l) => l.negociateur), ...(v.repartition?.parties ?? []).flatMap((p) => (p.negociateur === null ? [] : [p.negociateur])),
    ...(v.dossier?.entree?.nom ? [v.dossier.entree.nom] : []), ...(v.dossier?.sortie?.nom ? [v.dossier.sortie.nom] : [])])].filter((x) => x.trim() !== '');
}

/**
 * Une vente telle que « Mon espace » la renvoie : la vente (réduite pour un collaborateur), les côtés que le titulaire y tient, et
 * `commissionsRetirees` (🔴 LOT 4) — vrai si la commission d'un autre a été retirée : l'écran ne montre alors ni sa commission ni ce qui en
 * dépend (« reste », part de l'agence), au lieu d'un « 0 € » ou d'un chiffre recalculé.
 */
export type VenteMonEspace = Vente & { mesCotes: ('entree' | 'sortie' | 'unique')[]; commissionsRetirees?: boolean;
  /** 🔴 LOT 7 — l'auteur de la dernière écriture (l'entrée du journal qui fait la version) : « Léa a mis à jour … » quand ce n'est pas moi. */
  derniereModification?: { auteurId: number | null; prenom: string | null; libelle: string } | null };

/** La réponse de /api/admin/mon-espace/affaires. */
export interface MesAffaires {
  disponible: boolean;
  aujourdhui: string;
  titulaire: { id: number; prenom: string | null; administrateur: boolean };
  /** Collaborateur : SES ventes, sans la commission des autres. Administrateur : toutes les ventes, telles quelles (« mesCotes » vide : pas à lui). */
  ventes: VenteMonEspace[];
  compteurs: CompteursMonEspace;
  /** 🔴 LOT 4 — ce que la fiche dépliée lit d'ordinaire dans les références de la Transaction (sans y donner accès) : les migrations appliquées,
   *  le nom affiché de chaque libellé (« Prénom NOM ») et le statut des négociateurs dont une paye figure dans la réponse. */
  schema?: { lotD: boolean; personneType: boolean; uniteCommission: boolean; prixVente: boolean; mandat: boolean };
  nomsNegociateurs?: Record<string, string>;
  /** 🔴 LOT 8 — « Mes statistiques » : mon CA mois par mois, par année (statistiques.ts), et les rétrocessions liées à mes ventes (par apporteur). */
  statistiques?: import('./statistiques').StatsMonEspace;
  retrocessions?: import('../transaction/modele').Retrocession[];
  statutsNegociateurs?: Record<string, 'associe' | 'salarie' | 'independant' | 'observateur' | null>;
  /** 🔴 LOT 10 — le MODE AGENCE (administrateurs) : la structure lue ; les compteurs, les statistiques et les listes sont alors ceux de la structure
   *  entière (les fonctions du Suivi CA, `agence.ts`), et `retrocessions` toutes celles de la structure. Absent : l'espace personnel. */
  agence?: { cle: import('./agence').Agence; societe: import('../transaction/modele').Societe | null };
}

/** 🔴 LOT 7 — l'empreinte de « mes affaires » : les affaires visibles et leur version ; elle change dès qu'une écriture les touche. PUR. */
export const empreinteDe = (ventes: readonly Pick<Vente, 'id' | 'version'>[]): string =>
  `${ventes.map((v) => v.id).sort((a, b) => a - b).join(',')}#${ventes.reduce((m, v) => Math.max(m, v.version ?? 0), 0)}`;
