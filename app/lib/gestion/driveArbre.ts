/**
 * MODULE « GESTION » — LOT DRIVE-1 : LE PLAN DE L'ARBORESCENCE. Module PUR (aucune base, aucun réseau).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LE PLAN EST CALCULÉ AVANT LA PREMIÈRE ÉCRITURE, ET EN ENTIER. C'est ce qui rend le mode « à blanc » honnête :
 * il dit exactement ce qui serait créé, parce que c'est exactement ce qui sera créé. Un programme qui déciderait en
 * chemin ne pourrait pas être simulé — il faudrait le laisser faire pour savoir ce qu'il fait.
 *
 * L'ARBORESCENCE, telle qu'Arno l'a demandée :
 *
 *   Base de données locative/
 *     00 Non rattachés/                  (ses sous-dossiers AAAA/MM naîtront au lot 2, à la demande)
 *     1 Propriétaires/
 *       NOM Prénom (n° WIPPIMMO)/
 *         En attente/
 *         → un RACCOURCI vers chacun de ses biens
 *     2 Biens immobiliers/
 *       Adresse, CP Commune — Nature Type — lot <Id>/
 *         1 Locataires/
 *           NOM Prénom (entrée JJ/MM/AAAA – sortie JJ/MM/AAAA)/
 *         2 Travaux/   3 Assurances/   4 Litige/   En attente/
 *
 * 🔴 CHAQUE NŒUD PORTE UNE CLÉ MÉTIER, ET C'EST ELLE QUI FAIT L'IDEMPOTENCE. On retrouve un dossier par
 * `(sorte, cle)` — jamais par son nom. Deux propriétaires peuvent porter le même nom (mesuré : GUSCHEMANN
 * Gracieuse, deux fiches WIPPIMMO), et un humain peut renommer un dossier sans nous prévenir. La clé, elle, ne
 * bouge pas.
 *
 * 🔴 LES RACCOURCIS SONT DANS L'ARBORESCENCE ET NE POINTENT QUE VERS ELLE. Un raccourci vers un dossier
 * préexistant ferait entrer ce dossier dans notre arborescence à l'œil, et le premier clic y mènerait — c'est
 * précisément ce que la règle de sécurité interdit. Le garde-fou le vérifie ; ce module ne les propose même pas.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { nettoyerNom } from './driveGardeFou';

/** Les quatre rubriques d'un bien, dans l'ordre où elles doivent apparaître. */
export const RUBRIQUES_BIEN = ['1 Locataires', '2 Travaux', '3 Assurances', '4 Litige'] as const;
export const EN_ATTENTE = 'En attente';
export const NON_RATTACHES = '00 Non rattachés';
export const DOSSIER_PROPRIETAIRES = '1 Propriétaires';
export const DOSSIER_BIENS = '2 Biens immobiliers';

/** Les clés fixes des quatre dossiers de tête. Écrites une fois : ce sont elles qu'on relit en base. */
export const CLE_RACINE = 'racine';
export const CLE_NON_RATTACHES = 'non_rattaches';
export const CLE_PROPRIETAIRES = 'proprietaires';
export const CLE_BIENS = 'biens';

export type SorteNoeud =
  | 'racine' | 'non_rattaches' | 'proprietaires' | 'biens'
  | 'proprietaire' | 'bien' | 'occupation' | 'rubrique' | 'en_attente' | 'raccourci';

/** Un dossier (ou raccourci) à créer. `parent` désigne un autre nœud par sa clé ; `null` pour la racine. */
export interface NoeudPlan {
  sorte: SorteNoeud;
  cle: string;
  nom: string;
  /** `(sorte, cle)` du parent. `null` pour la racine seule. */
  parent: { sorte: SorteNoeud; cle: string } | null;
  /** Pour un raccourci : `(sorte, cle)` du dossier visé — toujours un « bien » de CETTE arborescence. */
  cible?: { sorte: SorteNoeud; cle: string };
  /** Le chemin lisible, pour le journal, le rapport et le mode « à blanc ». */
  chemin: string;
}

// ── LES DONNÉES D'ENTRÉE, telles que l'annuaire les rend ──────────────────────────────────────────────────────────

export interface ProprietaireSource {
  wippimmoId: string;
  nomComplet: string;
}

export interface LotSource {
  wippimmoId: string;
  proprietaireWippimmoId: string | null;
  adresse: string | null;
  codePostal: string | null;
  commune: string | null;
  nature: string | null;
  typeBien: string | null;
}

export interface OccupationSource {
  wippimmoId: string;
  lotWippimmoId: string;
  locataireNom: string;
  /** Format ISO (`AAAA-MM-JJ`) ou `null`. */
  entree: string | null;
  sortie: string | null;
}

// ── LES NOMS ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** `AAAA-MM-JJ` → `JJ/MM/AAAA`. Chaîne vide si la date manque. PUR. */
export function dateFr(iso: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m === null ? '' : `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * « NOM Prénom (42) ». Le numéro WIPPIMMO n'est pas décoratif : c'est LUI qui distingue les homonymes — mesuré,
 * deux fiches « GUSCHEMANN Gracieuse » (102 et 103). Sans lui, les deux dossiers porteraient le même nom et
 * personne ne saurait lequel est lequel.
 */
export function nomProprietaire(p: ProprietaireSource): string {
  return nettoyerNom(`${p.nomComplet} (${p.wippimmoId})`);
}

/**
 * « 4 rue Fictive, 92800 PUTEAUX — Appartement Type 2 — lot 100 ».
 *
 * L'ADRESSE D'ABORD, parce que c'est par elle qu'on cherche des yeux dans une liste de 365 lignes. Le numéro de lot
 * ferme le nom : il est unique, et c'est lui qui tranche entre deux appartements de la même adresse.
 */
export function nomBien(l: LotSource): string {
  const lieu = [l.adresse, [l.codePostal, l.commune].filter((x) => (x ?? '').trim() !== '').join(' ')]
    .map((x) => (x ?? '').trim()).filter((x) => x !== '').join(', ');
  const bien = [l.nature, l.typeBien].map((x) => (x ?? '').trim()).filter((x) => x !== '').join(' ');
  const bouts = [lieu === '' ? 'Adresse non renseignée' : lieu];
  if (bien !== '') bouts.push(bien);
  bouts.push(`lot ${l.wippimmoId}`);
  return nettoyerNom(bouts.join(' — '));
}

/** « BERNARD Alice (entrée 01/09/2022 – en cours) ». Une date inconnue est DITE, jamais inventée. */
export function nomOccupation(o: OccupationSource): string {
  const e = dateFr(o.entree);
  const s = dateFr(o.sortie);
  const periode = `entrée ${e === '' ? 'inconnue' : e} – ${s === '' ? 'en cours' : `sortie ${s}`}`;
  return nettoyerNom(`${o.locataireNom} (${periode})`);
}

/** « → 4 rue Fictive… — lot 100 » : la flèche dit d'un coup d'œil que c'est un raccourci, pas une copie. */
export function nomRaccourci(l: LotSource): string {
  return nettoyerNom(`→ ${nomBien(l)}`);
}

// ── LE PLAN ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Plan {
  noeuds: NoeudPlan[];
  /** Les comptes, pour le mode « à blanc » et le rapport. */
  comptes: Record<string, number>;
}

/**
 * CONSTRUIT LE PLAN COMPLET. PUR — éprouvable sans base ni réseau.
 *
 * ⚠️ L'ORDRE DES NŒUDS EST L'ORDRE DE CRÉATION, et il n'est pas indifférent : un parent précède toujours son
 * enfant, et un bien précède toujours le raccourci qui le vise. La boucle de construction n'a donc rien à trier,
 * et une coupure au milieu laisse un état cohérent — ce qui la rend reprenable.
 *
 * 🔴 UN LOT SANS PROPRIÉTAIRE RATTACHÉ GARDE SON DOSSIER DE BIEN. Mesuré à l'import : un nom porté par deux
 * bailleurs n'est pas tranché, le lot reste sans propriétaire. Le bien existe quand même — c'est un logement réel —,
 * il n'a simplement aucun raccourci pointant vers lui.
 */
export function construirePlanArbre(sources: {
  proprietaires: readonly ProprietaireSource[];
  lots: readonly LotSource[];
  occupations: readonly OccupationSource[];
}): Plan {
  const noeuds: NoeudPlan[] = [];
  const RAC = { sorte: 'racine' as const, cle: CLE_RACINE };

  noeuds.push({ sorte: 'racine', cle: CLE_RACINE, nom: 'Base de données locative', parent: null, chemin: '/' });
  noeuds.push({ sorte: 'non_rattaches', cle: CLE_NON_RATTACHES, nom: NON_RATTACHES, parent: RAC, chemin: `/${NON_RATTACHES}` });
  noeuds.push({ sorte: 'proprietaires', cle: CLE_PROPRIETAIRES, nom: DOSSIER_PROPRIETAIRES, parent: RAC, chemin: `/${DOSSIER_PROPRIETAIRES}` });
  noeuds.push({ sorte: 'biens', cle: CLE_BIENS, nom: DOSSIER_BIENS, parent: RAC, chemin: `/${DOSSIER_BIENS}` });

  // ── LES BIENS D'ABORD : les raccourcis des propriétaires les visent, ils doivent donc exister avant. ──────────
  const parLot = new Map<string, LotSource>();
  const lotsTries = [...sources.lots].sort((a, b) => nomBien(a).localeCompare(nomBien(b), 'fr'));
  for (const l of lotsTries) {
    parLot.set(l.wippimmoId, l);
    const nom = nomBien(l);
    const chemin = `/${DOSSIER_BIENS}/${nom}`;
    noeuds.push({ sorte: 'bien', cle: l.wippimmoId, nom, parent: { sorte: 'biens', cle: CLE_BIENS }, chemin });
    const parentBien = { sorte: 'bien' as const, cle: l.wippimmoId };
    for (const r of RUBRIQUES_BIEN) {
      noeuds.push({ sorte: 'rubrique', cle: `${l.wippimmoId}|${r}`, nom: r, parent: parentBien, chemin: `${chemin}/${r}` });
    }
    noeuds.push({
      sorte: 'en_attente', cle: `bien|${l.wippimmoId}`, nom: EN_ATTENTE, parent: parentBien,
      chemin: `${chemin}/${EN_ATTENTE}`,
    });
  }

  // ── LES BAUX, sous « 1 Locataires » de leur bien. Un bail dont le lot n'est pas géré n'a nulle part où aller :
  //    il est ignoré ici (l'annuaire le garde, et le rapport de tri le dira). ──────────────────────────────────
  const occTriees = [...sources.occupations].sort((a, b) => {
    if (a.lotWippimmoId !== b.lotWippimmoId) return a.lotWippimmoId.localeCompare(b.lotWippimmoId);
    return (b.entree ?? '').localeCompare(a.entree ?? '');   // le plus récent en premier
  });
  for (const o of occTriees) {
    const lot = parLot.get(o.lotWippimmoId);
    if (lot === undefined) continue;
    const nom = nomOccupation(o);
    noeuds.push({
      sorte: 'occupation', cle: o.wippimmoId, nom,
      parent: { sorte: 'rubrique', cle: `${o.lotWippimmoId}|${RUBRIQUES_BIEN[0]}` },
      chemin: `/${DOSSIER_BIENS}/${nomBien(lot)}/${RUBRIQUES_BIEN[0]}/${nom}`,
    });
  }

  // ── LES PROPRIÉTAIRES, leur « En attente », et leurs raccourcis. ──────────────────────────────────────────────
  const lotsParProprietaire = new Map<string, LotSource[]>();
  for (const l of lotsTries) {
    if (l.proprietaireWippimmoId === null) continue;
    const liste = lotsParProprietaire.get(l.proprietaireWippimmoId) ?? [];
    liste.push(l);
    lotsParProprietaire.set(l.proprietaireWippimmoId, liste);
  }

  const propsTries = [...sources.proprietaires].sort((a, b) => nomProprietaire(a).localeCompare(nomProprietaire(b), 'fr'));
  for (const p of propsTries) {
    const nom = nomProprietaire(p);
    const chemin = `/${DOSSIER_PROPRIETAIRES}/${nom}`;
    noeuds.push({
      sorte: 'proprietaire', cle: p.wippimmoId, nom,
      parent: { sorte: 'proprietaires', cle: CLE_PROPRIETAIRES }, chemin,
    });
    const parentProp = { sorte: 'proprietaire' as const, cle: p.wippimmoId };
    noeuds.push({
      sorte: 'en_attente', cle: `prop|${p.wippimmoId}`, nom: EN_ATTENTE, parent: parentProp,
      chemin: `${chemin}/${EN_ATTENTE}`,
    });
    for (const l of lotsParProprietaire.get(p.wippimmoId) ?? []) {
      noeuds.push({
        sorte: 'raccourci', cle: `${p.wippimmoId}->${l.wippimmoId}`, nom: nomRaccourci(l),
        parent: parentProp, cible: { sorte: 'bien', cle: l.wippimmoId },
        chemin: `${chemin}/${nomRaccourci(l)}`,
      });
    }
  }

  const comptes: Record<string, number> = {};
  for (const n of noeuds) comptes[n.sorte] = (comptes[n.sorte] ?? 0) + 1;
  comptes.total = noeuds.length;
  return { noeuds, comptes };
}

/** Le résumé du plan, en français, pour la sortie console et le journal. PUR. */
export function resumerPlanArbre(p: Plan): string[] {
  const c = p.comptes;
  return [
    `dossiers de tête : ${(c.racine ?? 0) + (c.non_rattaches ?? 0) + (c.proprietaires ?? 0) + (c.biens ?? 0)}`,
    `propriétaires : ${c.proprietaire ?? 0} (+ autant de « ${EN_ATTENTE} »)`,
    `biens : ${c.bien ?? 0} (+ ${c.rubrique ?? 0} rubriques)`,
    `baux : ${c.occupation ?? 0}`,
    `raccourcis vers les biens : ${c.raccourci ?? 0}`,
    `TOTAL à créer : ${c.total ?? 0} éléments`,
  ];
}
