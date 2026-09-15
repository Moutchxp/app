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
 * LOT 76 — PRÉSENCE ≠ LECTURE. Pour la COMPLÉTUDE (« ce dossier contient-il un Cerfa ? »), le NOM du fichier est une preuve
 *   suffisante : un fichier nommé « CERFA_13409 » EST un Cerfa, MÊME scanné (couche texte absente → `familleDeContenu` aveugle). On
 *   ajoute donc ICI une reconnaissance du Cerfa par le nom (`cerfaParNom`), en APPOINT du contenu, SCOPÉE À CE CLASSEMENT DE
 *   COMPLÉTUDE. On ne touche PAS `planMasse.familleDeNom` (sélecteur de tracé, où un formulaire n'est jamais traçable — PROV-2(a)),
 *   NI la LECTURE DE VALEURS (`recapCerfa`/`decisionCerfa`, par CONTENU uniquement) : le nom prouve la PRÉSENCE, jamais ce que le Cerfa
 *   déclare. Le CONTENU reste prioritaire : un fichier nommé « cerfa » dont le contenu est une coupe est classé « coupe » (désaccord exposé).
 */
import { familleDeContenu } from './planMasseContenu';
import { familleDeNom, type FamillePlan } from './planMasse';
// PART-2 (élargissement) — le RÉFÉRENTIEL des familles suivies (pilotable, repli EN DUR sur les 4 historiques) remplace les Records en
//   dur pour l'évaluation présent/manquant/indéterminé. `FamillePlan` (tracé/best-of) reste INTACT ; ici on manipule des CODES ouverts.
import { evaluerCompletude, FAMILLES_REF_DEFAUT, type FamilleRef, type EtatFamille } from './famillesRef';

export type { EtatFamille } from './famillesRef';

/** Libellé FR des 4 familles HISTORIQUES (repli d'affichage — ex. libellé lisible d'un marqueur « dossier partiel »). SOURCE UNIQUE
 *  historique. ⚠️ N'est PLUS la source des libellés du diagnostic (venus du référentiel) : conservé pour les consommateurs legacy
 *  (dossierPartiel) qui tolèrent un code inconnu en repli. */
export const LIBELLE_FAMILLE: Record<FamillePlan, string> = {
  masse: 'Plan de masse',
  coupe: 'Plan de coupe',
  etage: 'Plans d’étages',
  cerfa: 'Formulaire Cerfa',
};

/** Ordre d'AFFICHAGE des 4 familles historiques (repli). Le référentiel porte l'ordre vif une fois la migration 223 appliquée. */
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

/**
 * Une ligne du diagnostic : une famille ATTENDUE, son ÉTAT (present / manquant / indetermine) et les pièces qui l'attestent.
 * `famille` (= `code`) et `presente` (= `etat === 'present'`) sont CONSERVÉS pour les consommateurs existants (cascade partielle,
 * bilan) ; le décompte des MANQUANTES doit se faire sur `etat === 'manquant'` (une famille `indetermine` n'est jamais une manquante).
 */
export interface LigneCompletude { code: string; famille: string; libelle: string; libelleCorps: string; ordre: number; etat: EtatFamille; presente: boolean; pieces: string[] }

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

/**
 * LOT 76 — un fichier est-il un FORMULAIRE Cerfa d'après son NOM (PRÉSENCE, pour la complétude UNIQUEMENT) ? STRICT — un faux positif
 * ferait disparaître une vraie alerte « Cerfa manquant », pire que le défaut d'origine : on n'accepte que le mot « cerfa » (frontière
 * de mot) OU un numéro de formulaire Cerfa CONNU (13409 = PC/PA, 13824), jamais une forme large. N'entre JAMAIS dans la LECTURE de
 * valeurs ni dans la traçabilité (planMasse) — seulement dans le classement de complétude, en APPOINT du contenu.
 */
export function cerfaParNom(nomFichier: string): boolean {
  const n = normaliserNom(nomFichier);
  return /\bcerfa\b/.test(n) || /\b(13409|13824)\b/.test(n);
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
  // LOT 76 — le NOM classe masse/étage/coupe (familleDeNom) ET, en dernier ressort, le Cerfa par son nom (présence). Le nom ne
  //   décide du Cerfa QUE si familleDeNom se tait (un plan nommé « PC2 » reste 'masse', jamais 'cerfa').
  const parNom = familleDeNom(p.nomFichier) ?? (cerfaParNom(p.nomFichier) ? 'cerfa' : null);
  const famille = parContenu ?? parNom; // le CONTENU l'emporte ; le NOM ne parle que là où le contenu se tait
  const desaccord = parContenu !== null && parNom !== null && parContenu !== parNom;
  const aTexte = p.pagesTexte.some((t) => t.trim().length > 0); // LOT 60 — mesuré au calcul : au moins une page porte du texte exploitable
  return { nomFichier: p.nomFichier, famille, parContenu, parNom, desaccord, aTexte };
}

/**
 * Résout la liste des familles attendues en `FamilleRef[]` : soit des objets `FamilleRef` (référentiel chargé), soit des CODES (repli
 * sur `FAMILLES_REF_DEFAUT` — rétro-compat des appelants/tests qui passent `['masse','cerfa']`). Un code inconnu du repli est ignoré. PURE.
 */
function versFamillesRef(familles: readonly (FamilleRef | string)[]): FamilleRef[] {
  return familles
    .map((f) => (typeof f === 'string' ? (FAMILLES_REF_DEFAUT.find((r) => r.code === f) ?? null) : f))
    .filter((f): f is FamilleRef => f !== null);
}

/**
 * Diagnostic à partir des CLASSEMENTS déjà calculés + des familles attendues (config VIVE, référentiel). PURE et SANS I/O : c'est cette
 * fonction qu'on rejoue à l'affichage (les classements sont stockés au moment coûteux de la lecture des PDF ; ici, aucune relecture). Un
 * changement de config/référentiel prend donc effet IMMÉDIATEMENT, sans relancer l'analyse. Les familles à détecteur de CONTENU (les 4
 * historiques) donnent present/manquant comme avant ; les familles par NOM seul peuvent être `indetermine` (jamais un faux manquant).
 */
export function lignesDepuisClassements(classements: readonly ClassementPiece[], famillesAttendues: readonly (FamilleRef | string)[]): DiagnosticCompletude {
  const lignes: LigneCompletude[] = evaluerCompletude(classements, versFamillesRef(famillesAttendues))
    .map((l) => ({ code: l.code, famille: l.code, libelle: l.libelle, libelleCorps: l.libelleCorps, ordre: l.ordre, etat: l.etat, presente: l.etat === 'present', pieces: l.pieces }));
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
export function diagnostiquerCompletude(pieces: readonly PieceLueDiag[], famillesAttendues: readonly (FamilleRef | string)[]): DiagnosticCompletude & { classements: ClassementPiece[] } {
  const classements = pieces.map(classerPiece);
  return { ...lignesDepuisClassements(classements, famillesAttendues), classements };
}
