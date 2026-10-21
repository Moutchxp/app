import { createHash } from 'node:crypto';
import { nettoyerNom, porteLeNomProtege, RACINE_NOM } from './driveGardeFou';
import { normaliser, RUBRIQUES_N6, SOUS_PROPRIETAIRE } from './arborescenceDrive';
import type { StatutBien } from './statutBien';

/**
 * ══ 🔴🔴 LE DOSSIER D'UN BIEN DANS L'ARBRE DE SON STATUT (Arno, 21/10/2026, migrations 403 et 404). PUR. ═════════════════════
 *
 * Deux arbres FRÈRES dans le Drive partagé « GESTION LOCATIVE », de MÊME arborescence (mêmes noms, mêmes clés, mêmes règles que
 * `arborescenceDrive.ts`) :
 *   · « Base de données locative » › « Actifs » (EN GESTION) / « Inactifs » (ANCIENNE GESTION) › N3 › N4 › N5 › N6 … ;
 *   · « Base de données location seule » › N3 › N4 › N5 › N6 …  (LOCATION SEULE — sans Actifs / Inactifs).
 * Un propriétaire aux statuts mêlés a UN N3 PAR ARBRE (et par branche) concerné. Le N5 d'un bien est UNIQUE (clé `b:<tête>`) :
 * une transition le DÉPLACE entier — jamais copié, jamais supprimé ; les N3 / N4 manquants de la destination sont créés d'abord.
 *
 * 🔴 GARDE-FOUS, CODÉS ICI ET ÉPROUVÉS : on ne crée et ne déplace QUE dans ces deux arbres, et QUE des dossiers inscrits au
 * registre (`gestion_drive_noeud`) ; « Documents clients scannés » (« 1 actifs », « 2 vendus », « 3 perdus ») : AUCUNE action,
 * à aucune profondeur — le refus passe AVANT tout le reste.
 */

export type ArbreDrive = 'locative' | 'location_seule';
export const NOM_RACINE_LOCATION_SEULE = 'Base de données location seule';
/** L'étiquette `svav_arbo` de la racine « location seule » (elle n'est pas au registre des nœuds : elle a sa table, 404). */
export const CLE_RACINE_LOCATION_SEULE = 'rls:location_seule';

/** La PLACE d'un dossier : son arbre, et sa branche dans l'arbre locatif. */
export interface PlaceDrive { arbre: ArbreDrive; branche: 'Actifs' | 'Inactifs' | null }

/**
 * Où doit être le dossier d'un bien de ce statut. Arno (21/10/2026, 405) : une ancienne gestion NON archivée (« Gestion terminée »)
 * garde son dossier où il est — dans l'arbre locatif (un dossier neuf irait dans « Actifs ») ; seule l'ARCHIVÉE va dans « Inactifs ». PUR.
 */
export function placeDuStatut(s: StatutBien, archive = false): PlaceDrive {
  if (s === 'location_seule') return { arbre: 'location_seule', branche: null };
  return { arbre: 'locative', branche: s === 'en_gestion' || !archive ? 'Actifs' : 'Inactifs' };
}

export const memePlace = (a: PlaceDrive, b: PlaceDrive): boolean => a.arbre === b.arbre && (a.branche ?? null) === (b.branche ?? null);

/** La lettre de la place dans les clés : A (Actifs), I (Inactifs) — celles de l'arborescence d'origine —, L (location seule). PUR. */
export const lettrePlace = (p: PlaceDrive): 'A' | 'I' | 'L' => (p.arbre === 'location_seule' ? 'L' : p.branche === 'Inactifs' ? 'I' : 'A');

/** « Base de données locative › Actifs », « Base de données location seule ». PUR. */
export const libellePlace = (p: PlaceDrive): string => (p.arbre === 'location_seule' ? NOM_RACINE_LOCATION_SEULE : `${RACINE_NOM} › ${p.branche ?? 'Actifs'}`);

/** Les clés N3 / N4 d'un propriétaire à une place. Le N4 : l'adresse normalisée (comme la branche « bail »). PUR. */
export const cleN3 = (proprietaireId: number, p: PlaceDrive): string => `p:${proprietaireId}:${lettrePlace(p)}`;
export const cleN4 = (proprietaireId: number, p: PlaceDrive, nomN4: string): string =>
  `a:${proprietaireId}:${lettrePlace(p)}:${createHash('sha256').update(`txt:${normaliser(nomN4)}`).digest('hex').slice(0, 12)}`;

export type SorteNoeudBien = 'proprietaire' | 'adresse' | 'bien' | 'rubrique' | 'sous_rubrique' | 'annee';
export interface CreationNoeud {
  cle: string; sorte: SorteNoeudBien; niveau: number; nom: string;
  /** Un dossier déjà là (son identifiant Drive), ou un dossier créé plus haut dans ce plan (sa clé). */
  parent: { driveId: string } | { cle: string };
  lotId: number | null; annee: number | null;
}

export interface EntreePlanBien {
  place: PlaceDrive;
  annee: number;
  proprietaire: { id: number; nom: string };
  /** Le N4 : sa clé (celle déjà inscrite pour ce propriétaire à cette place et à ce nom, ou une neuve) et son nom. */
  adresse: { cle: string; nom: string };
  bien: { teteId: number; nom: string };
  /** Le parent d'un N3 neuf : le N2 « Actifs » / « Inactifs », ou la racine « location seule ». `null` : inconnu. */
  parentN3: string | null;
  /** Les dossiers DÉJÀ inscrits, par clé : jamais recréés. */
  existants: ReadonlyMap<string, string>;
  /** La clé du N3 de cette place, quand elle n'est pas la clé de base (N3 déplacé entier, clé reprise ailleurs — 405). */
  n3Cle?: string;
  /** Les dossiers ANNUELS (l'année sous « PNO » / « Taxe foncière ») : pas pour un bien en ancienne gestion (405). Défaut : oui. */
  annuels?: boolean;
}

/**
 * LE PLAN DU DOSSIER D'UN BIEN — N3 → N4 → N5 → N6 (« 0 En attente » … « 6 Locataires ») et, sous « 1 Propriétaire », « PNO » /
 * « Taxe foncière » › l'année en cours : exactement le modèle de l'arborescence. Le dossier BAIL n'en est pas (il naît à
 * « Nouveau locataire »). Un parent avant ses enfants ; ce qui existe n'est pas recréé. PUR.
 */
export function planDossierBien(e: EntreePlanBien): { ok: true; creations: CreationNoeud[] } | { ok: false; motif: string } {
  const out: CreationNoeud[] = [];
  const t = e.bien.teteId;
  const n3 = e.n3Cle ?? cleN3(e.proprietaire.id, e.place);
  const parentDe = (cle: string): CreationNoeud['parent'] => {
    const d = e.existants.get(cle);
    return d !== undefined ? { driveId: d } : { cle };
  };
  const poser = (c: Omit<CreationNoeud, 'parent'>, parent: CreationNoeud['parent']): void => {
    if (e.existants.has(c.cle) || out.some((x) => x.cle === c.cle)) return;
    out.push({ ...c, parent });
  };
  if (!e.existants.has(n3)) {
    if (e.parentN3 === null) return { ok: false, motif: `Le dossier « ${libellePlace(e.place)} » du Drive est introuvable : le dossier du propriétaire ne peut pas y être créé.` };
    poser({ cle: n3, sorte: 'proprietaire', niveau: 3, nom: nettoyerNom(e.proprietaire.nom), lotId: null, annee: null }, { driveId: e.parentN3 });
  }
  poser({ cle: e.adresse.cle, sorte: 'adresse', niveau: 4, nom: e.adresse.nom, lotId: null, annee: null }, parentDe(n3));
  poser({ cle: `b:${t}`, sorte: 'bien', niveau: 5, nom: e.bien.nom, lotId: t, annee: null }, parentDe(e.adresse.cle));
  RUBRIQUES_N6.forEach((nom, i) => {
    poser({ cle: `r:${t}:${i}`, sorte: 'rubrique', niveau: 6, nom, lotId: t, annee: null }, parentDe(`b:${t}`));
    if (i === 1) SOUS_PROPRIETAIRE.forEach((s, k) => {
      poser({ cle: `pr:${t}:${k}`, sorte: 'sous_rubrique', niveau: 7, nom: s, lotId: t, annee: null }, parentDe(`r:${t}:1`));
      if (e.annuels !== false) poser({ cle: `y:pr:${t}:${k}:${e.annee}`, sorte: 'annee', niveau: 8, nom: String(e.annee), lotId: t, annee: e.annee }, parentDe(`pr:${t}:${k}`));
    });
  });
  return { ok: true, creations: out };
}

/** Un maillon de la chaîne des parents (du dossier visé vers le haut), lu chez Google. */
export interface MaillonArbre { id: string; nom: string; parentId: string | null }
export interface RacinesArbres { locative: string | null; locationSeule: string | null }

/**
 * 🔴 LE GARDE : peut-on CRÉER sous ce dossier, ou y DÉPLACER un dossier ? `chaine` part du dossier visé (inclus) et monte.
 * `null` = permis ; sinon le motif. Dans l'ordre :
 *   ① « Documents clients scannés » n'importe où dans la chaîne → REFUS (aucune action, à aucune profondeur) ;
 *   ② une chaîne vide ou coupée → REFUS (ne pas savoir où l'on est vaut interdit) ;
 *   ③ hors des deux arbres (la racine « Base de données locative » ou « Base de données location seule », par leur IDENTIFIANT)
 *      → REFUS. PUR.
 */
export function refusEcritureArbre(chaine: readonly MaillonArbre[], racines: RacinesArbres): string | null {
  if (chaine.some((m) => porteLeNomProtege(m.nom))) {
    return '« Documents clients scannés » est l’archive du cabinet : l’application n’y crée, n’y déplace et n’y modifie rien, à aucune profondeur.';
  }
  if (chaine.length === 0) return 'L’emplacement visé n’a pas pu être situé : par précaution, rien n’y est créé ni déplacé.';
  const ids = new Set([racines.locative, racines.locationSeule].filter((x): x is string => x !== null));
  if (ids.size === 0) return 'Aucune racine d’arbre n’est connue : par précaution, rien n’est créé ni déplacé.';
  if (!chaine.some((m) => ids.has(m.id))) {
    return `Écriture refusée : l’emplacement visé n’est ni sous « ${RACINE_NOM} » ni sous « ${NOM_RACINE_LOCATION_SEULE} ».`;
  }
  return null;
}

/** L'ÉTAT du dossier Drive d'un bien, comparé à son statut. PUR. */
export type EtatDossierBien = { etat: 'ok' } | { etat: 'a_creer' } | { etat: 'a_deplacer'; depuis: PlaceDrive; vers: PlaceDrive };
export function etatDossierBien(statut: StatutBien, n5: PlaceDrive | null, archive = false): EtatDossierBien {
  const vers = placeDuStatut(statut, archive);
  if (n5 === null) return { etat: 'a_creer' };
  // « Gestion terminée » : le dossier RESTE à sa place, dans l'arbre locatif (Actifs ou déjà Inactifs) — jamais ramené.
  if (statut === 'ancienne_gestion' && !archive && n5.arbre === 'locative') return { etat: 'ok' };
  return memePlace(n5, vers) ? { etat: 'ok' } : { etat: 'a_deplacer', depuis: n5, vers };
}

/** LE PLAN DU RANGEMENT (script) : les biens dont le N5 inscrit n'est pas à la place de leur statut. PUR. */
export interface BienARanger { lotId: number; statut: StatutBien; n5: PlaceDrive | null; n5DriveId: string | null; titre: string; archive?: boolean }
export interface LigneRangement { lotId: number; titre: string; n5DriveId: string; depuis: PlaceDrive; vers: PlaceDrive }
export function planRangement(biens: readonly BienARanger[]): { deplacements: LigneRangement[]; sansDossier: BienARanger[]; enPlace: number } {
  const deplacements: LigneRangement[] = []; const sansDossier: BienARanger[] = []; let enPlace = 0;
  for (const b of biens) {
    const e = etatDossierBien(b.statut, b.n5, b.archive === true);
    if (e.etat === 'ok') enPlace += 1;
    else if (e.etat === 'a_creer' || b.n5DriveId === null) sansDossier.push(b);
    else deplacements.push({ lotId: b.lotId, titre: b.titre, n5DriveId: b.n5DriveId, depuis: e.depuis, vers: e.vers });
  }
  return { deplacements, sansDossier, enPlace };
}
