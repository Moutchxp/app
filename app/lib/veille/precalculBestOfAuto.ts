/**
 * PC-3 (perfo) — PRODUCTEUR DE FOND du best-of PDF que la migration 208 annonçait (« peuplée EN AMONT par veille:run ») et qui
 * n'existait pas : jusqu'ici, la SEULE écriture de `permis_best_of_precalcul` passait `calcule_par='a_la_volee'` (route /emprise),
 * donc APRÈS que l'utilisateur a payé les ~9 s d'extraction. Cette étape de veille CALCULE le best-of AVANT l'ouverture, pour que
 * l'onglet « Bâtiments » s'ouvre instantanément (hit persisté, ~0 ms) au lieu de déclencher un cold-open.
 *
 * 🔒 GARDES (calquées sur les autres briques de veille, isolées et sans effet de bord dangereux) :
 *  - UNIVERS BORNÉ, jamais un balayage global : SEULS les permis « sous surveillance / en rattachement » (= ceux qui ont une ligne
 *    `permis_empreinte`, l'univers exact des onglets, cf. rattachementSuiviRepo) ET qui ont des pièces en GED (`dossier_document`) —
 *    un permis sans GED a un best-of VIDE, rien à précalculer. Un dossier DÉJÀ à jour (empreinte persistée == empreinte GED courante)
 *    n'est JAMAIS recalculé.
 *  - EN SÉRIE, un dossier après l'autre : pdf.js est mono-thread (worker désactivé) → paralléliser ne gagnerait rien et inonderait
 *    l'object store. Ordre STABLE (dossier_id croissant) → un run interrompu par le budget reprend là où il s'est arrêté au tick suivant.
 *  - PLAFOND PAR TICK (`PRECALCUL_BUDGET_MS`) : le tick de veille est à 900 s ; un dossier lourd coûte ~8,5 s. On rend la main
 *    LARGEMENT avant la fin de l'intervalle. Budget vérifié ENTRE les dossiers (un dossier commencé se termine ; jamais coupé au milieu).
 *  - GARDE echecTelechargement (identique au cache P1 / à la route) : un best-of calculé avec un échec de TÉLÉCHARGEMENT (possiblement
 *    transitoire) N'EST JAMAIS persisté (`cachable=false`). On ne fige pas une donnée dégradée que plus rien ne viendrait corriger.
 *  - Aucun DELETE / DROP / TRUNCATE : n'écrit QUE des lignes `permis_best_of_precalcul` (`calcule_par='fond'`, upsert par dossier). La
 *    purge PC-2 (entrée en rattachement) n'est pas touchée. Ne touche NI le moteur, NI le verdict, NI le golden, NI une altitude.
 *  - Le lecteur reste AUTONOME : le précalcul est un ACCÉLÉRATEUR, jamais un prérequis — la route garde intégralement son repli
 *    calcul-à-la-volée. Ce module ne modifie pas le comportement du lecteur.
 */
import { query } from '../db/client';
import { depsReellesLectureGed, type DepsLectureGed, type PieceGedMeta } from '../permis/lectureGed';
import { empreinteGed } from '../permis/bestOfCache';
import { calculerBestOf, estPiecePdf } from '../permis/bestOfCalcul';
import { ecrireBestOfPersiste, TYPE_BEST_OF, type BestOfValeur } from '../permis/bestOfPersistance';

/**
 * BUDGET DE TEMPS d'un tick de précalcul (ms). UNE seule constante nommée — remontable en réglage `config_veille` plus tard.
 * Choisi TRÈS en deçà de l'intervalle de veille (900 s) : 120 s traite ~14 dossiers lourds (~8,5 s) ou beaucoup de légers par tick,
 * en laissant >13 min de marge ; le reste est repris au tick suivant (univers borné + saut des dossiers déjà à jour → converge vite).
 */
export const PRECALCUL_BUDGET_MS = 120_000;

/** I/O injectables : le cœur (boucle, budget, garde echecTelechargement) est ainsi PUR et testable sans base, MinIO ni pdf.js. */
export interface DepsPrecalculBestOf {
  /** Horloge monotone en ms (Date.now en prod) — pour le budget. */
  maintenant(): number;
  /** Univers BORNÉ, ordre STABLE (dossier_id croissant) : permis sous surveillance/rattachement AYANT des pièces GED. */
  listerCandidats(): Promise<number[]>;
  /** Empreinte GED persistée pour ce dossier (null si absente / table 208 absente / lecture KO). */
  empreintePersistee(dossierId: number): Promise<string | null>;
  /** Empreinte GED COURANTE + pièces PDF du dossier (source IDENTIQUE à la route → l'empreinte matche le lecteur). */
  empreinteCourante(dossierId: number): Promise<{ empreinte: string; piecesPdf: PieceGedMeta[] }>;
  /** Calcule le best-of (retourne cachable=false en cas d'échec de téléchargement). */
  calculer(dossierId: number, piecesPdf: PieceGedMeta[]): Promise<{ valeur: BestOfValeur; cachable: boolean }>;
  /** Persiste le best-of (calcule_par='fond'). Best-effort en amont : appelé UNIQUEMENT si cachable. */
  persister(dossierId: number, empreinte: string, valeur: BestOfValeur): Promise<void>;
}

export interface BilanPrecalculBestOf {
  candidats: number;        // taille de l'univers borné
  examines: number;         // dossiers effectivement regardés (≤ candidats si budget atteint)
  aJour: number;            // empreinte persistée == courante → sautés
  recalcules: number;       // best-of (re)calculé (absent ou périmé)
  persistes: number;        // écrits en 'fond' (cachable)
  degrades: number;         // calcul non cachable (échec téléchargement) → NON persisté
  interrompuBudget: boolean; // le budget a coupé la boucle avant la fin de l'univers
}

/**
 * Une passe de précalcul. Parcourt l'univers borné EN SÉRIE, saute les dossiers déjà à jour, (re)calcule et persiste (`fond`) les
 * autres, sous le budget de temps. Rend un bilan chiffré (journalisable). Aucune exception ne remonte du corps utile : un dossier
 * fautif est compté (`degrades`) et n'interrompt pas les suivants — comme les autres briques de veille, la passe est robuste.
 */
export async function executerPrecalculBestOf(deps: DepsPrecalculBestOf, options?: { budgetMs?: number }): Promise<BilanPrecalculBestOf> {
  const budgetMs = options?.budgetMs ?? PRECALCUL_BUDGET_MS;
  const debut = deps.maintenant();
  const candidats = await deps.listerCandidats();
  const bilan: BilanPrecalculBestOf = { candidats: candidats.length, examines: 0, aJour: 0, recalcules: 0, persistes: 0, degrades: 0, interrompuBudget: false };
  for (const dossierId of candidats) {
    // BUDGET vérifié AVANT de commencer un dossier (jamais coupé au milieu). Le reste sera repris au tick suivant (ordre stable).
    if (deps.maintenant() - debut >= budgetMs) { bilan.interrompuBudget = true; break; }
    bilan.examines++;
    const { empreinte, piecesPdf } = await deps.empreinteCourante(dossierId);
    const persistee = await deps.empreintePersistee(dossierId);
    if (persistee !== null && persistee === empreinte) { bilan.aJour++; continue; } // déjà à jour → jamais recalculé
    bilan.recalcules++;
    const { valeur, cachable } = await deps.calculer(dossierId, piecesPdf);
    if (!cachable) { bilan.degrades++; continue; } // GARDE echecTelechargement : on ne fige jamais un best-of dégradé
    await deps.persister(dossierId, empreinte, valeur);
    bilan.persistes++;
  }
  return bilan;
}

// ── Deps RÉELLES (production) ────────────────────────────────────────────────
export function depsReellesPrecalculBestOf(): DepsPrecalculBestOf {
  const depsGed: DepsLectureGed = depsReellesLectureGed(); // une seule instance réutilisée (stateless) pour lister + calculer
  return {
    maintenant: () => Date.now(),
    listerCandidats: async () => {
      // UNIVERS = permis AYANT une empreinte (sous surveillance / rattachement, cf. rattachementSuiviRepo) ∩ permis AYANT des pièces
      //   GED. Ordre STABLE (dossier_id croissant) pour une reprise déterministe après coupure de budget.
      const { rows } = await query<{ dossier_id: number | string }>(
        `SELECT DISTINCT dd.dossier_id
           FROM dossier_document dd
          WHERE EXISTS (SELECT 1 FROM permis_empreinte e WHERE e.dossier_id = dd.dossier_id)
          ORDER BY dd.dossier_id`);
      return rows.map((r) => Number(r.dossier_id));
    },
    empreintePersistee: async (dossierId) => {
      try {
        const { rows } = await query<{ empreinte: string }>(`SELECT empreinte FROM permis_best_of_precalcul WHERE dossier_id = $1 AND type = $2`, [dossierId, TYPE_BEST_OF]);
        return rows[0]?.empreinte ?? null;
      } catch { return null; } // table 208 absente / lecture KO → traité comme « absent » → (re)calcul (jamais un crash)
    },
    empreinteCourante: async (dossierId) => {
      const pieces = await depsGed.listerPieces(dossierId);
      const piecesPdf = pieces.filter(estPiecePdf); // MÊME filtre que la route → empreinte IDENTIQUE au lecteur
      const empreinte = empreinteGed(piecesPdf.map((p) => ({ id: p.id, cleStockage: p.cleStockage, tailleOctets: p.tailleOctets, nomFichier: p.nomFichier })));
      return { empreinte, piecesPdf };
    },
    calculer: (dossierId, piecesPdf) => calculerBestOf(dossierId, piecesPdf, depsGed),
    persister: (dossierId, empreinte, valeur) => ecrireBestOfPersiste(dossierId, empreinte, valeur, 'fond'),
  };
}
