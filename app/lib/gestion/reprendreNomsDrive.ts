import { jetonPourSubject } from './driveDelegue';
import { nomRepriseDepuisDrive, type NomVuDansDrive } from './nomUsagePiece';
import {
  ecrireNomUsage, journaliserRenommage, piecesARelire, PLAFOND_RELECTURE, trancheDuMoment,
} from './nomUsageRepo';
import { renommerPiece } from './renommagePieceReel';

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
    const pieces = await piecesARelire(tranche, o.limite ?? PLAFOND_RELECTURE);
    if (pieces.length === 0) return rapport;

    const jeton = await jetonPourSubject(COMPTE_DRIVE, deps);
    if (!jeton.ok) return rapport;

    // ① UNE SEULE SÉRIE DE LECTURES pour toutes les copies de toutes les pièces de la tranche.
    const tousLesIds = pieces.flatMap((p) => p.copies.map((c) => c.driveFileId));
    const vus = await lireNomsDrive(jeton.jeton, tousLesIds, deps);
    const parId = new Map(vus.map((v) => [v.driveFileId, v]));
    rapport.relues = pieces.length;

    for (const p of pieces) {
      /**
       * ══ 🔴🔴 ON NE REGARDE QUE LES COPIES DONT ON SAIT CE QU'ON Y A ÉCRIT ═════════════════════════════════
       *
       * PREMIÈRE VERSION, RÉFUTÉE PAR L'ÉPREUVE RÉELLE : comparer le nom Drive au nom de la PIÈCE. Les copies de
       * « 00 Arrivée des mails » sont nommées « 2026-09-23 — expediteur@exemple.fr — Facture.pdf », exprès. Le
       * nom Drive diffère donc du nom de la pièce pour les 26 522 copies, et la passe a « repris » 60 pièces sur
       * 60 — elle aurait renommé toute la base d'après ses préfixes.
       *
       * 🔴 UN RENOMMAGE HUMAIN, C'EST DRIVE QUI DIT AUTRE CHOSE QUE CE QU'ON Y A ÉCRIT. Une copie dont on ignore
       * ce qu'on y a mis (`nomDrive` nul, les 26 522 d'aujourd'hui) est LAISSÉE TRANQUILLE : ne pas savoir n'est
       * pas une raison de renommer, c'est la raison de s'abstenir. La colonne se remplit au premier renommage
       * fait depuis l'application.
       */
      const candidates = p.copies.filter((c) => (c.nomDrive ?? '').trim() !== '');
      const siens = candidates
        .map((c) => {
          const vu = parId.get(c.driveFileId);
          // On compare à `nomDrive`, pas au nom de la pièce : `nomRepriseDepuisDrive` écarte ce qui est identique.
          return vu === undefined || vu.nom.trim() === (c.nomDrive ?? '').trim() ? undefined : vu;
        })
        .filter((v): v is NomVuDansDrive => v !== undefined);
      if (siens.length === 0) continue;

      const repris = nomRepriseDepuisDrive(p.nomAffiche, siens);
      if (repris === null) continue;

      /**
       * 🔴 ON ÉCRIT LE NOM D'USAGE, PUIS ON ALIGNE LES AUTRES COPIES. `renommerPiece` refait les deux contrôles
       * de sécurité (registre, chaîne de parents) : la reprise n'est pas un chemin plus permissif que le stylo,
       * c'est le MÊME chemin déclenché par une autre cause.
       *
       * ⚠️ LE JOURNAL DIT « drive », ET C'EST TOUTE LA DIFFÉRENCE : en relisant l'historique, on doit pouvoir
       * distinguer « quelqu'un a cliqué le stylo » de « le fichier a été renommé dans Google Drive ».
       */
      const ancien = p.nomAffiche;
      if (!(await ecrireNomUsage(p.pieceId, repris.nom))) continue;
      await journaliserRenommage({
        pieceId: p.pieceId, ancienNom: ancien, nouveauNom: repris.nom, source: 'drive',
        idsDrive: [repris.venantDe], refus: [], par: null, parLibelle: 'Google Drive',
      });
      rapport.reprises += 1;
      rapport.details.push({ pieceId: p.pieceId, ancien, nouveau: repris.nom });

      /**
       * ⚠️ LES AUTRES COPIES SONT ALIGNÉES, mais SANS journaliser une seconde fois : la ligne qui vient d'être
       * écrite raconte déjà ce renommage. Deux lignes pour un seul fait feraient lire deux renommages.
       */
      const autres = p.copies.filter((c) => c.driveFileId !== repris.venantDe);
      if (autres.length > 0) {
        await renommerPiece({
          pieceId: p.pieceId, nom: repris.nom, par: null, parLibelle: 'Google Drive',
          sansDrive: false, sansJournal: true,
        }, deps).catch(() => undefined);
      }
    }
  } catch (e) {
    console.error('[gestion/noms-drive] reprise impossible', e);
  }
  return rapport;
}
