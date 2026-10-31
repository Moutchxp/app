import { libellePersonne, negociateursDe, type Retrocession, type Societe, type Vente } from './modele';
import { lignesCarteAffaire, resultatDesCartes } from './carteAffaireLignes';
import type { MontantC } from './partAgence';
import type { StatutDuLibelle } from './statutLigne';

/**
 * ══ 🔴 LOT DJ (Arno, 31/10/2026) — LES LISTES DE CARTES DE « LE MOIS » ET « L'ANNÉE » : TRI ET RECHERCHE (PUR) ════════════════════════════════════
 * Le tri ne change que l'ordre des cartes, la recherche que les cartes montrées : les tuiles, le Résultat et le graphique n'en dépendent pas.
 */
export type TriListe = 'date-recent' | 'date-ancien' | 'ca-desc' | 'ca-asc';
export const TRIS_LISTE: readonly TriListe[] = ['ca-desc', 'ca-asc', 'date-recent', 'date-ancien'];
export const LIBELLE_TRI_LISTE: Record<TriListe, string> = {
  'ca-desc': 'CA : du plus gros au plus petit', 'ca-asc': 'CA : du plus petit au plus gros',
  'date-recent': 'Date : la plus récente d’abord', 'date-ancien': 'Date : la plus ancienne d’abord',
};
export const TRI_LISTE_DEFAUT: TriListe = 'date-recent';
export const estTriListe = (x: unknown): x is TriListe => typeof x === 'string' && (TRIS_LISTE as readonly string[]).includes(x);
/** Le choix retenu par le navigateur, partagé entre « Le mois » et « L'année », CRITERIMMO et MACJ. */
export const CLE_TRI_LISTE = 'trx-liste-tri';
/** À partir de combien de cartes le champ « Rechercher… » s'affiche. */
export const SEUIL_RECHERCHE = 10;

const deux = (n: number): string => String(n).padStart(2, '0');
/**
 * La date d'une carte : une vente signée, la date de l'acte (sinon son mois) ; un compromis, la date du compromis ; null : « mois à confirmer » ou
 * sans date (en fin de liste).
 */
export function dateDeCarte(v: Pick<Vente, 'statut' | 'annee' | 'mois' | 'dateCompromis' | 'dossier'>): string | null {
  if (v.statut === 'vendue') {
    const acte = v.dossier?.dateActe ?? null;
    if (acte !== null && acte !== '') return acte;
    return v.mois === null ? null : `${v.annee}-${deux(v.mois)}-00`;
  }
  return v.dateCompromis == null || v.dateCompromis === '' ? null : v.dateCompromis;
}

/** Les cartes dans l'ordre choisi ; `montantC` : le CA de la carte (centimes, l'unité affichée) ; `titre` : le nom affiché (égalité : alphabétique). */
export function trierListe<V extends Pick<Vente, 'id' | 'statut' | 'annee' | 'mois' | 'dateCompromis' | 'dossier'>>(liste: readonly V[], tri: TriListe,
  montantC: (v: V) => number, titre: (v: V) => string): V[] {
  const alpha = (a: V, b: V): number => titre(a).localeCompare(titre(b), 'fr', { sensitivity: 'base' }) || a.id - b.id;
  return [...liste].sort((a, b) => {
    if (tri === 'ca-desc' || tri === 'ca-asc') return (tri === 'ca-desc' ? montantC(b) - montantC(a) : montantC(a) - montantC(b)) || alpha(a, b);
    const [da, db] = [dateDeCarte(a), dateDeCarte(b)];
    if (da === null || db === null) return da === db ? alpha(a, b) : da === null ? 1 : -1;
    return da === db ? alpha(a, b) : (tri === 'date-recent' ? -1 : 1) * da.localeCompare(db);
  });
}

/** Le texte comparé : minuscules, sans accents, espaces simples. */
export const normaliser = (x: string): string => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const chiffres = (x: string): string => x.replace(/\D/g, '');
/** Un montant écrit (« 7500 », « 7 500 », « 7500,00 », « 7 500 € ») ; null : ce n'est pas un montant. */
export function lireMontant(x: string): number | null {
  const t = x.replace(/[\s  €]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Number(t);
}

export interface FicheRecherche { textes: string[]; telephones: string[]; montants: number[] }
/**
 * Ce qu'une carte offre à la recherche : le nom de l'affaire, les vendeurs, acquéreurs et représentants, les négociateurs, l'apporteur, l'adresse du
 * bien (et des personnes), les e-mails ; les téléphones (chiffres seuls) ; les montants en euros, HT et TTC (honoraires, com négo, honoraires nets,
 * reste, reversé, prix).
 */
export function ficheRecherche(v: Vente, o: { titre: string; vue: Societe | null; retros?: readonly Retrocession[]; statutDuLibelle?: StatutDuLibelle;
  nommer?: (libelle: string) => string; apporteurs?: readonly { id: number; nom: string }[] }): FicheRecherche {
  const nommer = o.nommer ?? ((x: string) => x);
  const personnes = v.dossier?.personnes ?? [];
  const reps = personnes.flatMap((p) => p.representants ?? []);
  const negos = [...negociateursDe(v), v.dossier?.entree?.nom ?? '', v.dossier?.sortie?.nom ?? '', ...(v.repartition?.parties ?? []).flatMap((p) => [p.negociateur ?? '', p.nom ?? ''])]
    .filter((x) => x !== '');
  const apporteur = [v.apporteur ?? '', o.apporteurs?.find((a) => a.id === v.dossier?.apporteurId)?.nom ?? ''];
  const textes = [o.titre, v.libelle, v.miroir?.libelleOrigine ?? '', ...personnes.flatMap((p) => [libellePersonne(p), p.nom, p.prenom ?? '', p.email ?? '', p.adresse ?? '']),
    ...reps.flatMap((r) => [r.nom, r.prenom ?? '', `${r.prenom ?? ''} ${r.nom}`, r.email ?? '', r.adresse ?? '']), ...negos, ...negos.map(nommer), ...apporteur,
    v.dossier?.adresseBien ?? ''].filter((x) => x.trim() !== '').map(normaliser);
  const telephones = [...personnes.map((p) => p.telephone), ...reps.map((r) => r.telephone)].filter((x): x is string => x != null).map(chiffres).filter((x) => x !== '');
  const c = lignesCarteAffaire(v, o.vue, { retros: o.retros, statutDuLibelle: o.statutDuLibelle });
  const m = (x: MontantC | null | undefined): number[] => (x == null ? [] : [x.htC / 100, x.ttcC / 100]);
  const ca = resultatDesCartes([v], o.vue, { retros: o.retros, statutDuLibelle: o.statutDuLibelle }).ca;
  const montants = [...m(ca), v.honorairesTtc, v.honorairesTtc / 1.2, ...(v.prixVente != null ? [v.prixVente] : []),
    ...c.lignes.flatMap((l) => [...m(l.honoraires), ...m(l.com), ...m(l.reste), ...m(l.reverse?.m), ...l.exterieures.flatMap((x) => m(x.m))]), ...m(c.apporteur), ...m(c.retro)];
  return { textes, telephones, montants };
}

/** Un mot (ou la recherche entière) trouvé dans la fiche : texte, téléphone (chiffres seuls), ou montant (à l'euro près, ou exact au centime). */
function trouve(f: FicheRecherche, mot: string): boolean {
  const n = normaliser(mot);
  if (n === '') return true;
  if (f.textes.some((t) => t.includes(n))) return true;
  const ch = chiffres(mot);
  if (/^[\d\s.+\-/()]+$/.test(mot.trim()) && ch.length >= 2 && f.telephones.some((t) => t.includes(ch))) return true;
  const x = lireMontant(mot);
  if (x !== null) return f.montants.some((y) => (Number.isInteger(x) && !/[.,]/.test(mot) ? Math.floor(y + 1e-9) === x : Math.round(y * 100) === Math.round(x * 100)));
  return false;
}
/**
 * La carte correspond-elle à la recherche ? La recherche entière d'abord (« 06 12 », « 7 500 » : un téléphone ou un montant écrit avec des espaces),
 * sinon chacun de ses mots, où qu'il soit trouvé. Insensible aux majuscules et aux accents. PUR.
 */
export function correspond(f: FicheRecherche, recherche: string): boolean {
  const r = recherche.trim();
  if (r === '') return true;
  if (trouve(f, r)) return true;
  return r.split(/\s+/).every((mot) => trouve(f, mot));
}
