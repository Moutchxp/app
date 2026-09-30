import { jetonPourSubject } from './driveDelegue';
import type { NomVuDansDrive } from './nomUsagePiece';
import {
  piecesARelire, piecesPrioritaires, PLAFOND_RELECTURE, trancheDuMoment, type PieceARelire,
} from './nomUsageRepo';
/* 🔴 LOT RANGER-INSTANTANE-ET-NOM — LA DÉCISION DE REPRENDRE UN NOM EST ÉCRITE LÀ-BAS, ET LÀ-BAS SEULEMENT.
   Cette passe choisit QUELLES pièces ; `relectureNomsDrive` décide QUOI en faire — la même règle, qu'on arrive
   par l'horloge ou par l'ouverture d'un fil. */
import { reprendrePourCesPieces } from './relectureNomsDrive';

/**
 * ══ 🔴🔴 LOT NOM-UNIQUE-DES-PIECES — RENOMMÉ DANS GOOGLE DRIVE, REPRIS PAR L'APP ═════════════════════════════
 *
 * Arno : « À la relève (ou dans une passe légère séparée, espacée), relis en métadonnées le nom des fichiers
 * Drive créés par l'app. Si le nom a changé dans Drive, le nom d'usage de la pièce le reprend, avec une ligne au
 * journal “renommé dans Google Drive”. »
 *
 * ⚠️ PAS DE `import 'server-only'` : cette passe tourne sous `tsx`, lancée par launchd (motif F1 du dépôt).
 *
 * ═══ 🔴 LE COÛT, ET LE CHOIX QU'IL IMPOSE ══════════════════════════════════════════════════════════════════════
 *
 * MESURÉ LE 30/09/2026 : 26 543 copies Drive. Les relire toutes à chaque relève — donc toutes les minutes — ferait
 * quelque 266 appels `files.list` par passe, soit près de 400 000 par jour, pour découvrir un renommage que
 * personne ne fait plus d'une fois par semaine. C'est le genre de coût invisible jusqu'au jour où Google limite
 * le compte, et où c'est la RELÈVE qui s'arrête.
 *
 * TROIS DÉCISIONS, DANS CET ORDRE :
 *   ① UNE TRANCHE PAR PASSE, et le registre entier balayé en 440 passes — voir `piecesARelire`. C'est le
 *      DÉCOUPAGE qui borne le coût, pas le groupement des requêtes : Drive ne sait pas filtrer par identifiant
 *      (son langage de requête n'a pas de champ `id`), ce que l'épreuve réelle a montré.
 *   ② `fields` RÉDUIT À `id,name,modifiedTime` : les trois seuls champs dont la décision a besoin. Soixante
 *      lectures par passe, 8 640 par jour — à comparer aux 400 000 d'une relecture complète chaque minute.
 *   ③ ESPACÉE, pas à chaque relève. La relève passe toutes les minutes ; celle-ci se déclenche une fois sur
 *      `UNE_PASSE_SUR`, soit environ toutes les dix minutes. Un nom changé à la main n'est pas une urgence.
 *
 * ⚠️ QUELLES PIÈCES, ET DANS QUEL ORDRE : voir l'encadré de `piecesARelire`. Un balayage complet par tranches,
 * déterministe et sans état — et surtout PAS « les plus récemment déposées », qui ne classe rien sur une base où
 * 26 522 copies ont été faites la même nuit. L'épreuve réelle a corrigé ce premier choix.
 *
 * 🔒 ELLE NE FAIT QUE LIRE, sauf quand un nom a VRAIMENT changé — et alors seulement pour aligner les AUTRES
 * copies de la même pièce, par le même chemin gardé que le renommage depuis l'application.
 */

const COMPTE_DRIVE = 'gestion@criterimmo.fr';
const API_FICHIERS = 'https://www.googleapis.com/drive/v3/files';

/** Une passe sur dix. La relève tourne chaque minute : cela fait une relecture toutes les dix minutes environ. */
export const UNE_PASSE_SUR = 10;

export interface DepsReprise { fetch: typeof fetch }

/**
 * ══ 🔴🔴 LES NOMS ACTUELS D'UN LOT D'IDENTIFIANTS. LECTURE SEULE ═════════════════════════════════════════════
 *
 * 🔴 CE QUE J'AVAIS ÉCRIT D'ABORD, ET QUI NE MARCHE PAS. Une seule requête `files.list` avec un `q` en
 * « id = 'x' or id = 'y' », pour lire soixante noms d'un coup. L'épreuve réelle l'a réfuté immédiatement : la
 * requête rend zéro fichier, sans erreur.
 *
 * 🔴 LA CAUSE : LE LANGAGE DE REQUÊTE DE DRIVE N'A PAS DE CHAMP `id`. Il sait filtrer sur `name`, `mimeType`,
 * `parents`, `trashed`, `modifiedTime`, `fullText`… mais on ne peut pas y demander « ces identifiants-là ». Le `q`
 * était donc syntaxiquement accepté et sémantiquement vide — le pire des cas, celui qui ne dit rien.
 *
 * ⚠️ ET LE `q` PAR PARENTS NE CONVIENT PAS NON PLUS : une tranche traverse des dizaines de dossiers (un par bien),
 * et lister chaque dossier entier pour en tirer deux fichiers coûterait plus cher que de lire les deux.
 *
 * ═══ CE QU'ON FAIT, ET CE QUE ÇA COÛTE ══════════════════════════════════════════════════════════════════════════
 *
 * Un `files.get` par identifiant, en série, avec `fields` réduit à `id,name,modifiedTime` — les trois seuls champs
 * dont la décision a besoin. SOIXANTE appels par passe, une passe toutes les dix minutes : 8 640 appels par jour.
 * À comparer aux 400 000 d'une relecture complète à chaque relève, et aux quotas de Drive qui se comptent en
 * milliers de requêtes par MINUTE. Le coût est maîtrisé parce que la TRANCHE est petite, pas parce que la requête
 * est groupée — c'est le découpage qui fait le travail, et il est dans `piecesARelire`.
 *
 * ⚠️ UN IDENTIFIANT QUI NE RÉPOND PAS N'EST PAS UNE ERREUR : le fichier a pu être mis à la corbeille, ou sortir
 * du périmètre du compte. Il n'y a simplement rien à reprendre de lui, et les autres continuent.
 */
export async function lireNomsDrive(
  accessToken: string, ids: readonly string[], deps: DepsReprise,
): Promise<NomVuDansDrive[]> {
  const propres = [...new Set(ids.map((i) => i.trim()).filter((i) => i !== ''))];
  const vus: NomVuDansDrive[] = [];
  for (const id of propres) {
    const p = new URLSearchParams({ fields: 'id,name,modifiedTime', supportsAllDrives: 'true' });
    try {
      const res = await deps.fetch(`${API_FICHIERS}/${encodeURIComponent(id)}?${p}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) continue;
      const b = await res.json().catch(() => ({})) as { id?: string; name?: string; modifiedTime?: string };
      if (typeof b.name !== 'string') continue;
      vus.push({ driveFileId: b.id ?? id, nom: b.name, modifieLe: b.modifiedTime ?? null });
    } catch { /* un fichier qui ne répond pas n'emporte pas les autres */ }
  }
  return vus;
}

export interface RapportReprise {
  /** Combien de pièces ont été relues. */
  relues: number;
  /** Combien ont vu leur nom repris depuis Drive. */
  reprises: number;
  /** Les noms repris, pour le journal de la relève. */
  details: { pieceId: number; ancien: string; nouveau: string }[];
}

/**
 * ══ 🔴🔴 LA PASSE ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ ELLE NE LÈVE JAMAIS. Appelée en fin de relève, elle ne doit pas pouvoir faire échouer une passe qui a par
 * ailleurs tout capturé — c'est la règle de toutes les suites de relève du module.
 */
export async function reprendreNomsDepuisDrive(
  o: { tranche?: number; limite?: number } = {}, deps: DepsReprise = { fetch },
): Promise<RapportReprise> {
  const rapport: RapportReprise = { relues: 0, reprises: 0, details: [] };
  try {
    /**
     * ⚠️ LA TRANCHE VIENT DE L'HORLOGE, et elle peut être IMPOSÉE — c'est ce qui permet d'éprouver la reprise
     * sur une pièce précise sans attendre trois jours que son tour vienne.
     */
    const tranche = o.tranche ?? trancheDuMoment(Date.now());
    /**
     * ══ 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — LES RÉCENTES D'ABORD, PUIS LA TRANCHE ════════════════════════════
     *
     * Demande d'Arno : « Garde le balayage de fond pour le reste, mais fais passer en priorité les pièces
     * rangées ou consultées récemment. »
     *
     * 🔴 LES DEUX, ET DANS CET ORDRE. La tranche garde ses trois propriétés (tout est vu, sans état, sans pic) ;
     * la liste prioritaire ne fait que passer devant. Une pièce vue par les deux n'est lue qu'une fois — sans
     * quoi la poignée de prioritaires reviendrait payer sa lecture à chaque passe de sa propre tranche.
     */
    const prioritaires = await piecesPrioritaires();
    const deLaTranche = await piecesARelire(tranche, o.limite ?? PLAFOND_RELECTURE);
    const vues = new Set(prioritaires.map((p) => p.pieceId));
    const pieces: PieceARelire[] = [...prioritaires, ...deLaTranche.filter((p) => !vues.has(p.pieceId))];
    if (pieces.length === 0) return rapport;

    const jeton = await jetonPourSubject(COMPTE_DRIVE, deps);
    if (!jeton.ok) return rapport;

    /**
     * 🔴 LA DÉCISION EST ÉCRITE AILLEURS, ET UNE SEULE FOIS (`reprendrePourCesPieces`). La lecture à la demande
     * — celle qui se déclenche à l'ouverture d'un fil — applique EXACTEMENT la même règle. Deux copies
     * divergeraient, et ce jour-là l'une reprendrait un nom que l'autre refuse, sur la même pièce, selon
     * l'heure. C'est la sorte d'incohérence qu'on met des mois à attribuer.
     *
     * ⚠️ LA PASSE DE FOND LIT EN SÉRIE, sans mémoire courte : elle a tout son temps, et la mémoire de 30 s de
     * l'autre chemin est faite pour une rafale d'écrans, pas pour un balayage qui passe toutes les dix minutes.
     */
    const bilan = await reprendrePourCesPieces(
      pieces, jeton.jeton, deps,
      async (j, ids, d) => new Map((await lireNomsDrive(j, ids, d)).map((v) => [v.driveFileId, v])),
    );
    rapport.relues = bilan.relues;
    rapport.reprises = bilan.reprises.length;
    rapport.details = bilan.reprises;
  } catch (e) {
    console.error('[gestion/noms-drive] reprise impossible', e);
  }
  return rapport;
}
