/**
 * PART-2 — DIAGNOSTIC DE COMPLÉTUDE des pièces d'un permis. Module PUR : aucune I/O, aucune IA. Il répond à « voici ce qui est
 * attendu, voici ce qui est présent / manquant », en classant chaque pièce PAR CONTENU d'abord, par NOM en appoint.
 *
 * ORDRE DE PRIORITÉ (documenté, et ce qui l'emporte en cas de désaccord) :
 *   1. CONTENU (`familleDeContenu`, best-of : Cerfa 13409, cartouche/vocabulaire de site pour la masse, cartouche de niveau pour
 *      l'étage, table de nivellement pour la coupe) — SOURCE PRINCIPALE ;
 *   2. NOM (`familleDeNom`, codes R.431 PC2/PC3 + formes) — APPOINT, utilisé UNIQUEMENT quand le contenu ne dit rien (pièce muette,
 *      scan, ou signal de contenu absent).
 *   → En cas de DÉSACCORD (le contenu dit X, le nom dit Y ≠ X), c'est le CONTENU QUI L'EMPORTE (un fichier nommé « PC02 » dont le
 *      contenu est une coupe est classé « coupe »), et le désaccord est EXPOSÉ (`desaccords`) pour être rendu visible.
 *   → Une pièce que NI le contenu NI le nom ne classent (scan muet à nom opaque) est « non classée » : exposée (`nonClassees`),
 *      jamais comptée comme attestant une famille, mais jamais non plus la cause d'un faux « manquant » silencieux.
 *
 * Le Cerfa se détecte par son CONTENU (formulaire 13409), jamais par son nom.
 */
import { familleDeContenu } from './planMasseContenu';
import { familleDeNom, type FamillePlan } from './planMasse';

/** Libellé FR d'une famille attendue (affichage + réglages). SOURCE UNIQUE. */
export const LIBELLE_FAMILLE: Record<FamillePlan, string> = {
  masse: 'Plan de masse',
  coupe: 'Plan de coupe',
  etage: 'Plans d’étages',
  cerfa: 'Formulaire Cerfa',
};

/** Ordre d'AFFICHAGE des familles (défaut porteur : masse, coupe, étages, Cerfa). */
export const ORDRE_FAMILLES: readonly FamillePlan[] = ['masse', 'coupe', 'etage', 'cerfa'];

/** Une pièce déjà lue : son nom + le texte de ses pages (vide/[] si scan muet). */
export interface PieceLueDiag { nomFichier: string; pagesTexte: readonly string[] }

/** Le classement d'une pièce : la famille retenue + ce que disent séparément le contenu et le nom + le drapeau de désaccord. */
export interface ClassementPiece {
  nomFichier: string;
  famille: FamillePlan | null; // retenue = contenu ?? nom
  parContenu: FamillePlan | null;
  parNom: FamillePlan | null;
  desaccord: boolean;          // contenu ET nom non nuls ET différents
  // LOT 60 — la pièce portait-elle du TEXTE exploitable au moment du calcul ? Sert UNIQUEMENT à la RESTITUTION d'une pièce non
  //   classée (distinguer « lisible mais hors des 4 familles » d'un vrai « illisible »). Optionnel : les classements ANTÉRIEURS au
  //   LOT 60 n'ont pas ce drapeau → `undefined` = « présence de texte inconnue » (message honnêtement vague, jamais « illisible »).
  aTexte?: boolean;
}

/** Une ligne du diagnostic : une famille ATTENDUE, présente ou non, et les pièces qui l'attestent. */
export interface LigneCompletude { famille: FamillePlan; presente: boolean; pieces: string[] }

/**
 * LOT 60 — pourquoi une pièce n'entre dans AUCUNE des 4 familles suivies. `hors_familles` : elle a du TEXTE lisible mais ne relève
 * d'aucune famille (ex. une notice en prose) — elle est bien LUE et rangée. `illisible` : aucun texte exploitable (scan image).
 * `indetermine` : présence de texte inconnue (classement antérieur au LOT 60) → on n'affirme NI lisible NI illisible.
 */
export type RaisonNonClassee = 'hors_familles' | 'illisible' | 'indetermine';

/** Une pièce non classée, avec la VRAIE raison + si elle relève de la rubrique Cerfa standard « autres pièces » (PC200). */
export interface NonClassee {
  nomFichier: string;
  raison: RaisonNonClassee;
  rubriqueAutresPieces: boolean;
}

export interface DiagnosticCompletude {
  lignes: LigneCompletude[];        // une par famille attendue (ordre ORDRE_FAMILLES)
  desaccords: ClassementPiece[];    // contenu ≠ nom (à rendre visibles)
  nonClassees: NonClassee[];        // LOT 60 — pièces qu'aucun signal ne classe, AVEC la raison (lisible-hors-familles / illisible / indéterminé)
}

// LOT 60 — RUBRIQUE Cerfa STANDARD « autres pièces » (R.431, code PC200 : fourre-tout réglementaire). Reconnaissance ROBUSTE (nom
//   normalisé) : code PC200 en frontière de mot, OU la forme « autres pièces ». Sert à DIRE que la pièce a été déposée là, pas à classer.
function normaliserNom(nom: string): string {
  return nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}
export function estRubriqueAutresPieces(nomFichier: string): boolean {
  const n = normaliserNom(nomFichier);
  return /\bpc\s*200\b/.test(n) || /\bautres?\s+pieces?\b/.test(n);
}

/** Config des familles attendues (4 interrupteurs). */
export interface FamillesAttenduesConfig { cerfa: boolean; masse: boolean; coupe: boolean; etage: boolean }

/** Familles attendues (dans l'ordre d'affichage) dérivées des interrupteurs de config. PURE. */
export function famillesAttenduesDepuisConfig(cfg: FamillesAttenduesConfig): FamillePlan[] {
  return ORDRE_FAMILLES.filter((f) => cfg[f]);
}

/** Classe UNE pièce : contenu prioritaire, nom en appoint, désaccord signalé. PURE. */
export function classerPiece(p: PieceLueDiag): ClassementPiece {
  const parContenu = familleDeContenu(p.pagesTexte);
  const parNom = familleDeNom(p.nomFichier);
  const famille = parContenu ?? parNom; // le CONTENU l'emporte ; le NOM ne parle que là où le contenu se tait
  const desaccord = parContenu !== null && parNom !== null && parContenu !== parNom;
  const aTexte = p.pagesTexte.some((t) => t.trim().length > 0); // LOT 60 — mesuré au calcul : au moins une page porte du texte exploitable
  return { nomFichier: p.nomFichier, famille, parContenu, parNom, desaccord, aTexte };
}

/**
 * Diagnostic à partir des CLASSEMENTS déjà calculés + des familles attendues (config VIVE). PURE et SANS I/O : c'est cette fonction
 * qu'on rejoue à l'affichage (les classements sont stockés au moment coûteux de la lecture des PDF ; ici, aucune relecture). Un
 * changement de config des familles attendues prend donc effet IMMÉDIATEMENT, sans relancer l'analyse.
 */
export function lignesDepuisClassements(classements: readonly ClassementPiece[], famillesAttendues: readonly FamillePlan[]): DiagnosticCompletude {
  const lignes: LigneCompletude[] = ORDRE_FAMILLES
    .filter((f) => famillesAttendues.includes(f))
    .map((f) => {
      const pieces = classements.filter((c) => c.famille === f).map((c) => c.nomFichier);
      return { famille: f, presente: pieces.length > 0, pieces };
    });
  const desaccords = classements.filter((c) => c.desaccord);
  // LOT 60 — non classée AVEC sa raison : `aTexte===true` → lisible mais hors des 4 familles ; `===false` → illisible (scan) ;
  //   `undefined` (classement antérieur au LOT 60) → indéterminé (on n'affirme rien sur la lisibilité).
  const nonClassees: NonClassee[] = classements.filter((c) => c.famille === null).map((c) => ({
    nomFichier: c.nomFichier,
    raison: c.aTexte === true ? 'hors_familles' : c.aTexte === false ? 'illisible' : 'indetermine',
    rubriqueAutresPieces: estRubriqueAutresPieces(c.nomFichier),
  }));
  return { lignes, desaccords, nonClassees };
}

/** Diagnostic complet depuis les pièces LUES (classe puis rapproche). PURE. Pratique pour le calcul et les tests. */
export function diagnostiquerCompletude(pieces: readonly PieceLueDiag[], famillesAttendues: readonly FamillePlan[]): DiagnosticCompletude & { classements: ClassementPiece[] } {
  const classements = pieces.map(classerPiece);
  return { ...lignesDepuisClassements(classements, famillesAttendues), classements };
}
