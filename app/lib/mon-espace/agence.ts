import { espaceNegociateurs, resultatDesCartes, type LigneEspace } from '../transaction/carteAffaireLignes';
import { totalCompromisEnCours } from '../transaction/compromisEnCours';
import { aConfirmerDesAnnees, retrosDesAnnees, ventesDesAnnees } from '../transaction/periodeAnnees';
import { retrosPeriode, ventesPeriode } from '../transaction/periodeMois';
import { estSociete, LIBELLE_SOCIETE, parApporteur, ventesDuMois, type DonneesSociete, type LigneApporteur, type Retrocession, type Societe, type Vente } from '../transaction/modele';
import { resolveurDe } from '../transaction/statutLigne';
import type { MontantC } from '../transaction/partAgence';
import type { CompteursMonEspace } from './mesAffaires';
import { moisDuChoix, type ChoixStats, type StatsMonEspace } from './statistiques';
import { surVenteActee } from './accueil';

/**
 * ══ 🔴 MON ESPACE, LOT 10 (Arno, 02/11/2026) — LE MODE AGENCE (ADMINISTRATEURS) : UNE STRUCTURE ENTIÈRE, LES CHIFFRES DU SUIVI CA (PUR) ═══════════
 * Les données sont celles de la page de la structure dans le Suivi CA (`lireDonneesSociete` : CRITERIMMO, MACJ, ou FUSION = null — chaque vente une
 * fois, lignes miroir de l'inter-cabinet comprises) ; chaque chiffre est calculé par LA fonction de l'écran du Suivi CA qui l'affiche :
 *   · CA et nombre de ventes d'un mois, d'une période, d'une année, de tout : la somme des cartes (`resultatDesCartes`) des ventes signées de la
 *     période (`ventesDuMois`, `ventesPeriode`, `ventesDesAnnees` : les 12 mois + les « mois à confirmer ») — la tuile « CA » de « Le mois » et de
 *     « L'année ». La somme des cartes est vente par vente, au centime : la somme des mois = l'année, exactement ;
 *   · compromis en cours (le prévisionnel) : la règle unique `totalCompromisEnCours` ;
 *   · par négociateur : `espaceNegociateurs` (l'« Espace par négociateur ») ; par apporteur : `parApporteur` sur les rétrocessions saisies sur la
 *     période et celles liées aux ventes affichées (le bloc de « L'année »).
 * Aucune recopie de calcul : ce module ne fait que choisir les ventes et appeler ces fonctions.
 */
export type Agence = Societe | 'tous';
export const AGENCES: readonly Agence[] = ['criterimmo', 'macj', 'tous'];
export const estAgence = (x: unknown): x is Agence => x === 'tous' || estSociete(x);
/** La structure lue (null : FUSION, les deux sociétés). */
export const societeDeLAgence = (a: Agence): Societe | null => (a === 'tous' ? null : a);
export const LIBELLE_AGENCE: Record<Agence, string> = { criterimmo: LIBELLE_SOCIETE.criterimmo, macj: LIBELLE_SOCIETE.macj, tous: 'FUSION' };

type DonneesAgence = Pick<DonneesSociete, 'societe' | 'ventes' | 'retrocessions'> & Partial<Pick<DonneesSociete, 'statutsNegociateurs'>>;
const opts = (d: DonneesAgence) => ({ retros: d.retrocessions, statutDuLibelle: resolveurDe(d.statutsNegociateurs) });
/** Le CA (somme des cartes, au centime) de ces ventes, pour la structure. PUR. */
export const caAgence = (d: DonneesAgence, ventes: readonly Vente[]): MontantC => resultatDesCartes(ventes, d.societe, opts(d)).ca;

/** Les années qui ont une vente signée (l'année en cours et la précédente toujours). PUR. */
export function anneesAgence(d: DonneesAgence, aujourdhui: string): number[] {
  const an = Number(aujourdhui.slice(0, 4));
  return [...new Set([an, an - 1, ...d.ventes.filter((v) => v.statut === 'vendue').map((v) => v.annee)])].sort((a, b) => a - b);
}

/** Les compteurs de l'accueil : les compromis en cours de la structure, ses ventes de l'année, et chaque année (la tuile « L'année »). PUR. */
export function compteursAgence(d: DonneesAgence, aujourdhui: string): CompteursMonEspace {
  const annee = Number(aujourdhui.slice(0, 4));
  const cec = totalCompromisEnCours(d.ventes, d.societe, resolveurDe(d.statutsNegociateurs));
  const de = (a: number) => { const vs = ventesDesAnnees(d.ventes, [a]); return { annee: a, nb: vs.length, ids: vs.map((v) => v.id), ca: caAgence(d, vs) }; };
  const parAnnee = anneesAgence(d, aujourdhui).map(de).filter((x) => x.nb > 0).sort((a, b) => b.annee - a.annee);
  return { compromis: { nb: cec.nb, ids: cec.ids, ca: { htC: cec.htC, ttcC: cec.ttcC } }, actees: de(annee), parAnnee };
}

/** Les chiffres de la structure, par année, mois par mois (la forme de « Mes statistiques ») : chaque mois, la somme des cartes de ses ventes. PUR. */
export function statistiquesAgence(d: DonneesAgence, aujourdhui: string): StatsMonEspace {
  return { annees: anneesAgence(d, aujourdhui).map((a) => {
    const mois = Array.from({ length: 12 }, (_, i) => ventesDuMois(d.ventes, a, i + 1));
    const aConfirmer = aConfirmerDesAnnees(d.ventes, [a]);
    return { annee: a, ca: mois.map((vs) => caAgence(d, vs)), nb: mois.map((vs) => vs.length), aConfirmer: caAgence(d, aConfirmer), aConfirmerNb: aConfirmer.length };
  }) };
}

/** Les ventes signées du choix (Mois, Période, Année avec ses « mois à confirmer », Tout) : celles des écrans du Suivi CA. PUR. */
export function ventesDuChoix(d: DonneesAgence, c: ChoixStats, aujourdhui: string): Vente[] {
  if (c.mode === 'tout') return ventesDesAnnees(d.ventes, anneesAgence(d, aujourdhui));
  if (c.mode === 'annee') return ventesDesAnnees(d.ventes, [c.annee]);
  return ventesPeriode(d.ventes, moisDuChoix(c, aujourdhui).map((mois) => ({ annee: c.annee, mois })));
}
const retrosDuChoix = (d: DonneesAgence, c: ChoixStats, aujourdhui: string): Retrocession[] =>
  (c.mode === 'tout' ? retrosDesAnnees(d.retrocessions, anneesAgence(d, aujourdhui)) : c.mode === 'annee' ? retrosDesAnnees(d.retrocessions, [c.annee])
    : retrosPeriode(d.retrocessions, moisDuChoix(c, aujourdhui).map((mois) => ({ annee: c.annee, mois }))));

/** Par négociateur, sur le choix : l'« Espace par négociateur » du Suivi CA. PUR. */
export const negociateursAgence = (d: DonneesAgence, c: ChoixStats, aujourdhui: string): LigneEspace[] =>
  espaceNegociateurs(ventesDuChoix(d, c, aujourdhui), d.societe, opts(d));

/** Par apporteur, sur le choix : `parApporteur` sur les rétrocessions saisies sur la période et celles liées aux ventes du choix (le bloc de « L'année »). PUR. */
export function apporteursAgence(d: DonneesAgence, c: ChoixStats, aujourdhui: string): LigneApporteur[] {
  const ids = new Set(ventesDuChoix(d, c, aujourdhui).map((v) => v.id));
  // 🔴 D28 — les ventes actées seulement (`surVenteActee`)
  const saisies = retrosDuChoix(d, c, aujourdhui).filter((r) => surVenteActee(r, d.ventes));
  const liees = d.retrocessions.filter((r) => r.venteId !== null && ids.has(r.venteId) && !saisies.some((x) => x.id === r.id));
  return parApporteur([...saisies, ...liees], d.ventes);
}
