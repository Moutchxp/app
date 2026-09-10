import { query } from '../db/client';
import { origineDepuisMajPar, suffixeOrigine } from './journalExtraction'; // LOT 100
import { lireDeclarationsRecapCerfa, type DeclarationsRecapCerfa } from './recapCerfa';
import { lireGedPermis, depsReellesLectureGed, type ResultatLectureGed, type PieceGedMeta } from './lectureGed'; // REPLI D'AFFICHAGE — texte DÉJÀ extrait des pièces (pdfjs local), aucune IA, aucun service payant
import { trouverCerfaPc } from './identifierCerfa'; // pièce source identifiée PAR CONTENU (jamais par nom)
import type { DecompteDescription } from './decompteDescription';
import { lirePermisCaracteristiques, ecrireCaracteristiquesGlobales, type ChampGlobalDeclare } from './caracteristiquesRepo';
import { proprietairesRetenue } from './journalLecture';
import { decisionReportDeclarations, CHAMPS_REPORTABLES, type ChampReportable, type EtatChampCourant } from './reportDeclarations';

/** LOT 69 — champ (niveau PERMIS, corps_id NULL) du nombre de bâtiments DÉCLARÉ dans le champ libre, corroboré par la somme. */
export const CHAMP_NB_BATIMENTS = 'nb_batiments_declares';

/**
 * LOT 67 — persistance de l'INSTANTANÉ des déclarations du Cerfa (récapitulatif). Informatif : affiché en lecture seule, n'alimente
 * AUCUNE colonne de valeur arbitrée par la précédence, n'écrase AUCUN champ Sitadel. RÉSILIENT : migration 192 absente (42P01/42703)
 * → écriture no-op et lecture null (aucun bloc « déclarations du Cerfa », comportement d'avant) — jamais d'exception propagée.
 */
export interface DeclarationsCerfaStockees { declarations: DeclarationsRecapCerfa; pieceSource: string | null; majLe: string | null }

/** Écrit (remplace) l'instantané d'un dossier. `true` = persisté ; `false` = table absente (no-op). */
export async function ecrireDeclarationsRecap(dossierId: number, declarations: DeclarationsRecapCerfa, pieceSource: string | null, majPar: string): Promise<boolean> {
  try {
    await query(
      `INSERT INTO permis_cerfa_recap (dossier_id, declarations, piece_source, maj_le, maj_par)
         VALUES ($1, $2::jsonb, $3, now(), $4)
         ON CONFLICT (dossier_id) DO UPDATE
           SET declarations = EXCLUDED.declarations, piece_source = EXCLUDED.piece_source, maj_le = EXCLUDED.maj_le, maj_par = EXCLUDED.maj_par`,
      [dossierId, JSON.stringify(declarations), pieceSource, majPar]);
    return true;
  } catch { return false; } // 192 absente → non persisté
}

/**
 * LOT 69 — JOURNALISE (audit) le décompte lu dans le CHAMP LIBRE, sous la méthode dédiée `recap` (migration 193). Niveau PERMIS
 * (corps_id NULL), champ `nb_batiments_declares`. NE crée AUCUN corps, n'écrit AUCUNE colonne de valeur : c'est une trace d'AUDIT au
 * même titre que les lignes Cerfa/motifs, dont l'UI tire confiance + provenance + motif.
 * - concordant (somme = total structuré) → ligne 'retenue', confiance 'a_verifier' (JAMAIS 'confirmee' : la source est une phrase),
 *   valeur = nombre de bâtiments retenu, extrait = le décompte lu ;
 * - décompte LU mais DISCORDANT → ligne 'ecartee' AVEC le motif chiffré (« somme 40+18+9=67 ≠ total structuré N ») et la valeur lue ;
 * - rien lu (pas de décompte) → AUCUNE ligne (l'absence est déjà portée par `absents` de recapCerfa, N10-R — pas de bruit).
 * RECOMPUTE IDEMPOTENT : purge CIBLÉE de `methode='recap'` du dossier avant réécriture. RÉSILIENT : 193 absente (le CHECK refuse
 * 'recap') → l'INSERT échoue, capturé → no-op (l'instantané `permis_cerfa_recap` reste, lui, la source d'affichage). Renvoie `true`
 * si une ligne a été posée.
 */
export async function ecrireDecompteDescription(dossierId: number, decompte: DecompteDescription | null, pieceSource: string | null, majPar: string): Promise<boolean> {
  if (!decompte || (decompte.batiments.length === 0)) {
    // Rien lu : on purge quand même une éventuelle trace périmée, puis on s'arrête (best-effort).
    await query(`DELETE FROM permis_extraction_journal WHERE dossier_id = $1 AND methode = 'recap'`, [dossierId]).catch(() => undefined);
    return false;
  }
  const origine = origineDepuisMajPar(majPar); // LOT 100 — auto (passage) / manuelle (relance) / null (indéterminée)
  try {
    await query(`DELETE FROM permis_extraction_journal WHERE dossier_id = $1 AND methode = 'recap'`, [dossierId]);
    if (decompte.concordant) {
      const reserve = `déclaré dans la description du projet ; somme des logements par bâtiment (${decompte.batiments.map((b) => b.logements).join('+')}=${decompte.sommeLogements}) vérifiée avec le total structuré (${decompte.logementsTotalStructure})`;
      const params = [dossierId, CHAMP_NB_BATIMENTS, decompte.nbBatimentsRetenu, reserve, pieceSource, decompte.extrait];
      const og = await suffixeOrigine(params.length, origine); // LOT 100
      await query(
        `INSERT INTO permis_extraction_journal
           (dossier_id, corps_id, champ, valeur, unite, role, methode, confiance, reserve, motif, piece, page, extrait, extrait_le${og.cols})
         VALUES ($1, NULL, $2, $3, NULL, 'retenue', 'recap', 'a_verifier', $4, NULL, $5, NULL, $6, now()${og.vals})`,
        [...params, ...og.params]);
    } else {
      const params = [dossierId, CHAMP_NB_BATIMENTS, decompte.nbBatimentsDeclare, decompte.motifEcart, pieceSource, decompte.extrait];
      const og = await suffixeOrigine(params.length, origine); // LOT 100
      await query(
        `INSERT INTO permis_extraction_journal
           (dossier_id, corps_id, champ, valeur, unite, role, methode, confiance, reserve, motif, piece, page, extrait, extrait_le${og.cols})
         VALUES ($1, NULL, $2, $3, NULL, 'ecartee', 'recap', NULL, NULL, $4, $5, NULL, $6, now()${og.vals})`,
        [...params, ...og.params]);
    }
    return true;
  } catch { return false; } // 193 absente (CHECK refuse 'recap') → no-op, l'affichage reste porté par l'instantané
}

/**
 * LOT 70 — REPORTE les DÉCLARATIONS du Cerfa (récapitulatif) dans les CHAMPS de caractéristiques (niveau PERMIS). N'écrit QUE des
 * champs VIDES (méthode `recap`, la plus faible : elle ne domine personne) ; un champ `saisie` ou détenu par une méthode supérieure
 * n'est JAMAIS écrasé (décision PURE `decisionReportDeclarations` + garde du dépôt `ecrireCaracteristiquesGlobales`). Chaque valeur
 * écrite laisse une ligne de journal 'retenue' methode='recap' confiance 'a_verifier' (JAMAIS 'confirmee' : source déclarative),
 * avec la pièce source → l'UI montre la valeur AVEC sa provenance. Idempotent : purge CIBLÉE des lignes 'recap' de CES champs avant
 * réécriture (jamais la ligne `nb_batiments_declares` du LOT 69, autre champ). Renvoie les COLONNES effectivement écrites.
 * RÉSILIENT : le report des colonnes ne dépend PAS de la migration 193 (colonnes 106 déjà là) ; seule la ligne de JOURNAL 'recap'
 * exige 193 → si absente, l'INSERT viole le CHECK, capturé → la valeur est quand même reportée (juste sans provenance journalisée).
 */
export async function reporterDeclarationsCerfa(dossierId: number, declarations: DeclarationsRecapCerfa, pieceSource: string | null, majPar: string): Promise<string[]> {
  const colonnes = CHAMPS_REPORTABLES.map((c) => c.colonne);
  const [carac, owners] = await Promise.all([
    lirePermisCaracteristiques(dossierId),
    proprietairesRetenue(dossierId, null, colonnes),
  ]);
  const g = carac.global;
  const etat: Record<ChampReportable, EtatChampCourant> = {
    nbLogements: { valeur: g?.nbLogements ?? null, origine: g?.nbLogementsOrigine ?? null, proprietaire: owners.get('nb_logements') ?? null },
    nbPlacesStationnement: { valeur: g?.nbPlacesStationnement ?? null, origine: g?.nbPlacesStationnementOrigine ?? null, proprietaire: owners.get('nb_places_stationnement') ?? null },
    surfacePlancherM2: { valeur: g?.surfacePlancherM2 ?? null, origine: g?.surfacePlancherM2Origine ?? null, proprietaire: owners.get('surface_plancher_m2') ?? null },
  };

  const aReporter = decisionReportDeclarations(declarations, etat);
  if (aReporter.length === 0) return [];

  // Écriture des colonnes (origine 'extraite' ; la garde 'saisie' du dépôt est un 2e verrou en plus de la décision pure).
  const valeurs: Partial<Record<ChampGlobalDeclare, number>> = {};
  for (const a of aReporter) (valeurs as Record<string, number>)[a.cle] = a.valeur;
  const res = await ecrireCaracteristiquesGlobales(dossierId, valeurs, 'extraite', majPar);
  const ecritsCle = new Set(res.ecrits);
  const ecrits = aReporter.filter((a) => ecritsCle.has(a.cle as ChampGlobalDeclare));
  if (ecrits.length === 0) return [];

  // JOURNAL 'recap' (audit + provenance + confiance). Purge CIBLÉE des champs reportables (jamais nb_batiments_declares du LOT 69).
  try {
    await query(`DELETE FROM permis_extraction_journal WHERE dossier_id = $1 AND methode = 'recap' AND champ = ANY($2::text[])`, [dossierId, colonnes]);
    const origine = origineDepuisMajPar(majPar); // LOT 100
    for (const a of ecrits) {
      const params = [dossierId, a.colonne, a.valeur, 'reporté depuis la déclaration du récapitulatif du Cerfa (aucun champ n’était renseigné)', pieceSource, `déclaré : ${a.valeur}`];
      const og = await suffixeOrigine(params.length, origine); // LOT 100
      await query(
        `INSERT INTO permis_extraction_journal
           (dossier_id, corps_id, champ, valeur, unite, role, methode, confiance, reserve, motif, piece, page, extrait, extrait_le${og.cols})
         VALUES ($1, NULL, $2, $3, NULL, 'retenue', 'recap', 'a_verifier', $4, NULL, $5, NULL, $6, now()${og.vals})`,
        [...params, ...og.params]);
    }
  } catch { /* 193 absente (CHECK refuse 'recap') → valeur reportée sans ligne de provenance ; jamais une exception propagée */ }

  return ecrits.map((a) => a.colonne);
}

/** Lit l'instantané d'un dossier, ou null (table absente OU jamais écrit) → l'UI n'affiche pas le bloc. */
export async function lireDeclarationsRecap(dossierId: number): Promise<DeclarationsCerfaStockees | null> {
  try {
    const { rows } = await query<{ declarations: DeclarationsRecapCerfa; piece_source: string | null; maj_le: string }>(
      `SELECT declarations, piece_source, maj_le FROM permis_cerfa_recap WHERE dossier_id = $1`, [dossierId]);
    const r = rows[0];
    return r ? { declarations: r.declarations, pieceSource: r.piece_source, majLe: r.maj_le } : null;
  } catch { return null; } // 192 absente → aucun bloc
}

/** Texte concaténé des pages À TEXTE d'une lecture GED — source COMMUNE au repli d'affichage et à la production de fond (aucune relecture). */
export function texteDeGed(ged: ResultatLectureGed): string {
  return ged.pieces.flatMap((p) => p.pages.filter((y) => y.aTexte).map((y) => y.texte)).join('\n');
}

/** REPLI — lit tout le TEXTE de la GED d'un dossier (pdfjs local, aucune IA) + identifie la pièce Cerfa source PAR CONTENU. Isolé pour
 *  l'injection de tests (le repli d'affichage n'a pas à dépendre de S3 dans un test unitaire). Coût réel ~2 à 10 s selon le nb de pièces. */
async function lireTexteGedEtSource(dossierId: number): Promise<{ texte: string; source: string | null }> {
  const deps = depsReellesLectureGed();
  const ged = await lireGedPermis(dossierId, deps);
  const metas = await deps.listerPieces(dossierId); // pièce source identifiée PAR CONTENU (trouverCerfaPc), jamais par nom
  return { texte: texteDeGed(ged), source: trouverCerfaPc(ged, metas)?.nomFichier ?? null };
}

/**
 * PRODUCTION DE FOND (PC-3 étendu) — ÉCRIT l'instantané du récap Cerfa à partir d'une lecture GED **DÉJÀ FAITE** (aucune relecture, aucune
 * IA, aucun service payant). Appelé par le producteur de fond sur la MÊME lecture que le best-of/complétude → coût marginal quasi nul (le
 * parsing du récap ne coûte que quelques ms). Écrit `permis_cerfa_recap` (upsert `ecrireDeclarationsRecap`) si le texte contient un
 * récapitulatif LISIBLE ; sinon no-op (aucun récap → aucune ligne, comme à la volée). Pièce source identifiée PAR CONTENU. Renvoie `true`
 * si une ligne a été écrite. Résilient (ecrireDeclarationsRecap avale l'absence de migration 192).
 */
export async function memoriserRecapCerfaDepuisGed(
  dossierId: number, ged: ResultatLectureGed, metas: readonly PieceGedMeta[], majPar: string,
  deps: { ecrire?: typeof ecrireDeclarationsRecap } = {}, // injectable pour les tests uniquement (défaut = écriture réelle)
): Promise<boolean> {
  const decl = lireDeclarationsRecapCerfa(texteDeGed(ged));
  if (!decl.present) return false; // aucun récapitulatif lisible → rien à figer (jamais une ligne vide)
  return (deps.ecrire ?? ecrireDeclarationsRecap)(dossierId, decl, trouverCerfaPc(ged, metas)?.nomFichier ?? null, majPar);
}

/**
 * AFFICHAGE — déclarations du Cerfa avec REPLI EN LECTURE À LA VOLÉE. L'INSTANTANÉ stocké (permis_cerfa_recap) reste PRIORITAIRE :
 * s'il existe, on le renvoie tel quel, jamais recalculé par-dessus. S'il n'existe PAS (dossier dont l'analyse complète est ANTÉRIEURE à
 * la persistance du récap — LOT 67), on RECONSTITUE les déclarations depuis le TEXTE DÉJÀ EXTRAIT des pièces (lireDeclarationsRecapCerfa,
 * déterministe). ⚠️ REPLI D'AFFICHAGE, PAS un backfill : AUCUNE écriture en base. ⚠️ AUCUN appel IA ni service payant — uniquement le
 * texte pdfjs local déjà présent. COÛT : ce repli lit toute la GED du dossier (~2 à 10 s selon le nombre de pièces) ; il ne s'exécute
 * donc QUE lorsqu'aucun instantané n'est stocké (un dossier stocké paie 0 ms). Récap illisible ou toute erreur → null (comportement d'avant).
 * `deps` injectables pour les tests uniquement (défauts = base + GED réelles).
 */
export async function lireDeclarationsRecapOuRepli(
  dossierId: number,
  deps: {
    lireStocke?: (id: number) => Promise<DeclarationsCerfaStockees | null>;
    lireTexteEtSource?: (id: number) => Promise<{ texte: string; source: string | null }>;
  } = {},
): Promise<DeclarationsCerfaStockees | null> {
  const stocke = await (deps.lireStocke ?? lireDeclarationsRecap)(dossierId);
  if (stocke) return stocke; // instantané STOCKÉ prioritaire — jamais recalculé par-dessus
  try {
    const { texte, source } = await (deps.lireTexteEtSource ?? lireTexteGedEtSource)(dossierId);
    const decl = lireDeclarationsRecapCerfa(texte);
    if (!decl.present) return null; // aucun récapitulatif lisible → pas de bloc (comportement d'avant)
    return { declarations: decl, pieceSource: source, majLe: null }; // majLe null = reconstitué à la volée (non figé en base)
  } catch { return null; }
}
