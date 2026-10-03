import { query } from '../db/client';
import { estDisparition, motifDisparition } from './copieDisparue';
import { deplacerCopieAuRegistre, occupantDuSlot } from './driveRepo';
import { marquerCopieDisparue } from './nomUsageRepo';
import { noterFichiersDisparus, noterParentDeplace } from './empreinteDriveRepo';

/**
 * ══ 🔴🔴 LOT FANTOMES-APRES-INDEXATION — LES ENTRÉES FANTÔMES DU REGISTRE, DÉTECTÉES ET CORRIGÉES ════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (03/10/2026), en réponse au point que j'avais soulevé à la fin du lot DRIVE-NIVEAUX-DEPLACEMENT :
 * « Ta proposition est acceptée : relance automatiquement la détection et la correction des entrées fantômes du
 * registre juste après chaque passe d'indexation (changes.list), et pas en continu. Le journal doit tracer le
 * nombre de candidats, le nombre de corrections et le nombre de disparitions. Lecture seule sur le Drive. »
 *
 * 🔴 POURQUOI « APRÈS LA PASSE », ET PAS EN CONTINU. La présélection se fait en BASE, en comparant le registre
 * (`gestion_piece_drive`) à l'index des empreintes (`gestion_drive_empreinte`, qui porte le parent réel de chaque
 * fichier vu). Or l'index est précisément ce que `changes.list` vient de rafraîchir : le lancer juste après, c'est
 * le lancer au seul moment où il peut apprendre quelque chose. En continu, il relirait un index inchangé.
 *
 * ═══ 🔒🔒 CE MODULE N'ÉMET AUCUN `fetch`, ET C'EST UNE PROPRIÉTÉ DE SON CODE ════════════════════════════════════
 *
 * La lecture du Drive arrive par INJECTION (`DepsFantomes`), comme pour le dépôt (`depotDrive`). Deux raisons, et
 * la seconde est la plus importante :
 *
 *   ① il s'éprouve sans réseau ni Drive, avec des doublures ;
 *   ② 🔴 L'APPELANT GARDE LA MAIN SUR SA PORTE. Le balayage (`indexer-empreintes-drive`) n'a qu'UN SEUL `fetch`
 *      dans tout son fichier, et trois gardes statiques le vérifient. S'il devait ouvrir une seconde porte pour
 *      ce nettoyage, ces gardes tomberaient — et avec eux la preuve que ce chemin ne sait pas écrire dans le
 *      Drive. Il lui passe donc SA porte, et la propriété tient.
 *
 * ═══ ⚠️ CE MODULE NE PORTE PAS `server-only`, ET C'EST VOLONTAIRE — NE PAS L'AJOUTER ═══════════════════════════
 *
 * Je l'y avais mis par réflexe, et le garde F2 (`garde/serverOnly.guard.test.ts`) a eu raison de rougir : DEUX
 * lignes de commande l'atteignent (`indexer-empreintes-drive`, `nettoyer-emplacements-fantomes`), et le paquet
 * `server-only` lève à l'import hors composant serveur — les deux CLI seraient mortes au CHARGEMENT, avant
 * d'avoir rien fait. C'est exactement la raison du lot F1, et pourquoi `db/client` ne le porte pas non plus.
 *
 * 🔒 LA FRONTIÈRE CLIENT RESTE GARDÉE, et mieux qu'elle ne l'était : `garde/clientBoundary.guard.test.ts` interdit
 * à tout fichier `'use client'` d'atteindre un module qui tire `pg` — ce module en est un, par `db/client`. La
 * protection est donc générique et ne dépend pas d'un marqueur qu'on pourrait oublier. Ses cinq voisins directs
 * (`driveRepo`, `empreinteDriveRepo`, `nomUsageRepo`, `copieDisparue`, `boiteRepo`) suivent la même convention.
 *
 * 🔒 AUCUNE LIGNE N'EST SUPPRIMÉE DE LA BASE, JAMAIS. Une ligne de `gestion_piece_drive` dit un fait daté (« nous
 * avons déposé une copie ici, ce jour-là ») et ce fait reste vrai après la disparition du fichier — c'est même le
 * seul moment où l'on a envie de le relire. On CORRIGE un parent, ou l'on DATE une disparition.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Ce qu'on demande à Google d'un fichier, et pas un champ de plus. Aucun ne porte de contenu. */
export interface MetaFichierDrive {
  nom: string;
  parents: readonly string[];
  trashed: boolean;
}

/**
 * LA LECTURE DU DRIVE, INJECTÉE. L'appelant fournit SA porte — voir l'encadré du module.
 *
 * ⚠️ LE REFUS REND SON CODE HTTP, et non un message : c'est le CODE qui décide si une copie est « disparue »
 * (404, 403) ou si l'on ne conclut rien (429, 503, réseau coupé). Un message aurait obligé à le deviner.
 */
export interface DepsFantomes {
  lireFichier(id: string): Promise<{ ok: true; valeur: MetaFichierDrive } | { ok: false; statut: number }>;
  /** Le NOM d'un dossier, pour l'écrire au registre. `null` = illisible : on n'écrit pas un identifiant. */
  nomDossier(id: string): Promise<string | null>;
}

/** Ce que la passe a vu et fait. Les trois nombres qu'Arno demande, plus ce qui n'a pas bougé. */
export interface BilanFantomes {
  candidats: number;
  /** Vérifiés chez Google (bornés par `max`). */
  verifies: number;
  corriges: number;
  disparus: number;
  /** Le registre disait vrai : c'était l'index qui était en retard. */
  intacts: number;
  /**
   * ══ 🔴🔴 LES CORRECTIONS QUI N'ONT PAS PU S'ÉCRIRE — AJOUTÉ APRÈS UN MENSONGE MESURÉ ═══════════════════════════
   *
   * DÉFAUT CONSTATÉ LE 04/10/2026, en appliquant la correction qu'Arno venait d'autoriser. PostgreSQL refusait
   * l'écriture — `duplicate key value violates unique constraint "gestion_piece_drive_unique_idx"` — et ce bilan
   * annonçait quand même « 2 corrigé(s) ». Le journal de la base l'a répété à trois passes du balayage
   * automatique (23:59:20, 00:14:25, 00:29:30) : trois lignes affirmant deux corrections, zéro ligne écrite.
   *
   * 🔴 LA CAUSE DU COMPTAGE FAUX ÉTAIT DANS L'ORDRE DES DEUX GESTES : on incrémentait AVANT d'écrire, et sans
   * regarder ce que l'écriture rendait. C'était d'autant plus trompeur qu'en SIMULATION le chiffre est juste —
   * il annonce une intention. En APPLICATION, il doit annoncer un fait.
   *
   * ⚠️ UN QUATRIÈME NOMBRE, ET NON UN « corriges » DIMINUÉ EN SILENCE : « 1 candidat, 0 correction » ferait
   * chercher une erreur de détection, alors que la détection avait raison et que c'est l'écriture qui a buté.
   * La cause (l'index unique qui ne distingue pas les copies disparues) est levée par la migration 301.
   */
  bloques: number;
}

/** Au plus tant de `files.get` par passe. Au-delà, on veut un chiffre avant de continuer. */
export const VERIFICATIONS_MAX = 200;

interface Candidat {
  id: number;
  pieceId: number;
  driveFileId: string;
  registreDossier: string;
  registreNom: string | null;
}

/**
 * ══ LA PRÉSÉLECTION, EN UNE REQUÊTE ET SANS UN APPEL GOOGLE ══════════════════════════════════════════════════════
 *
 * 🔴 L'INDEX PORTE LE PARENT RÉEL DE CHAQUE FICHIER VU : comparer 26 555 lignes de registre à ses 202 017 entrées
 * coûte une requête. Appeler `files.get` sur 26 555 fichiers en coûterait 26 555.
 *
 * ⚠️ TROIS SORTES DE CANDIDATS, ET AUCUNE N'EST UNE CONCLUSION :
 *   · le parent de l'index diffère de celui du registre (un déplacement qu'on n'a pas suivi) ;
 *   · l'index dit le fichier disparu ;
 *   · le fichier est absent de l'index — ce qui N'EST PAS une disparition : un fichier rangé dans un coin du
 *     Drive qu'aucun balayage n'a lu n'y est pas. Ces lignes sont vérifiées comme les autres.
 *
 * ⚠️ LES LIGNES DÉJÀ MARQUÉES « DISPARUES » SONT HORS SUJET : plus personne ne les lit (`copieVivanteAvec` les
 * écarte partout), et les reprendre reviendrait à défaire un constat daté.
 */
async function candidats(): Promise<Candidat[]> {
  const { rows } = await query<{
    id: string; piece_id: string; drive_file_id: string; drive_dossier_id: string; dossier_nom: string | null;
  }>(
    `SELECT d.id::text, d.piece_id::text, d.drive_file_id, d.drive_dossier_id, d.dossier_nom
       FROM gestion_piece_drive d
       LEFT JOIN gestion_drive_empreinte e ON e.drive_file_id = d.drive_file_id
      WHERE d.disparu_le IS NULL
        AND btrim(d.drive_file_id) <> ''
        AND (e.drive_file_id IS NULL
             OR e.disparu_le IS NOT NULL
             OR coalesce(e.parent_id, '') <> d.drive_dossier_id)
      ORDER BY d.id`);
  return rows.map((r) => ({
    id: Number(r.id), pieceId: Number(r.piece_id), driveFileId: r.drive_file_id,
    registreDossier: r.drive_dossier_id, registreNom: r.dossier_nom,
  }));
}

type Verdict =
  | { sorte: 'corriger'; parentReel: string; parentNom: string | null }
  | { sorte: 'disparu'; motif: string }
  | { sorte: 'rien'; pourquoi: string };

/**
 * CE QUE GOOGLE DIT DE CE FICHIER, ET CE QU'ON EN CONCLUT. Un seul `files.get` par candidat.
 *
 * 🔴 C'EST LE DRIVE QUI TRANCHE, PAS L'INDEX. L'index est un REFLET : corriger la base à partir de lui serait
 * corriger une base à partir d'une copie. Le parent qu'on écrit vient de `files.get`.
 */
async function verdict(deps: DepsFantomes, c: Candidat): Promise<Verdict> {
  const r = await deps.lireFichier(c.driveFileId);
  if (!r.ok) {
    /* 🔴 DEUX CODES SEULEMENT VALENT DISPARITION (module PUR `copieDisparue`). Un 429 ou un 503 ne conclut RIEN :
       Google est occupé, le fichier est probablement là, et marquer l'effacerait du registre pour de bon. */
    if (estDisparition(r.statut)) return { sorte: 'disparu', motif: motifDisparition(r.statut) };
    return { sorte: 'rien', pourquoi: `Google a répondu ${r.statut} — on ne conclut rien` };
  }
  if (r.valeur.trashed) return { sorte: 'disparu', motif: 'mis à la corbeille du Drive' };
  const parents = r.valeur.parents;
  if (parents.length === 0) return { sorte: 'rien', pourquoi: 'aucun parent rendu — on ne conclut rien' };
  if (parents.includes(c.registreDossier)) {
    return { sorte: 'rien', pourquoi: 'le registre dit vrai (c’est l’index qui était en retard)' };
  }
  const parentReel = parents[0];
  return { sorte: 'corriger', parentReel, parentNom: await deps.nomDossier(parentReel) };
}

/**
 * ══ 🔴🔴 UNE PASSE DE NETTOYAGE ══════════════════════════════════════════════════════════════════════════════════
 *
 * 🔒 SANS `appliquer`, RIEN N'EST ÉCRIT — ni en base, ni ailleurs. C'est le mode par défaut, et c'est délibéré :
 * le geste qu'Arno autorise est la correction, pas le comptage, et le comptage est ce qui permet de décider.
 *
 * ⚠️ `dire` EST FACULTATIF : sans lui, la passe est muette. C'est ce qui permet au balayage de l'appeler sans
 * polluer son propre rapport, et à la ligne de commande de tout afficher.
 */
export async function nettoyerFantomes(
  deps: DepsFantomes,
  o: { appliquer: boolean; max?: number; dire?: (ligne: string) => void } = { appliquer: false },
): Promise<BilanFantomes> {
  const dire = o.dire ?? ((): void => {});
  const liste = await candidats();
  const max = Math.max(1, Math.min(o.max ?? VERIFICATIONS_MAX, VERIFICATIONS_MAX));
  const aVerifier = liste.slice(0, max);
  const bilan: BilanFantomes = {
    candidats: liste.length, verifies: aVerifier.length, corriges: 0, disparus: 0, intacts: 0, bloques: 0,
  };
  if (liste.length === 0) return bilan;
  if (aVerifier.length < liste.length) {
    dire(`⚠️ borne : ${aVerifier.length} candidats vérifiés sur ${liste.length}`);
  }

  for (const c of aVerifier) {
    const v = await verdict(deps, c);
    const tete = `  ligne ${c.id} · pièce ${c.pieceId} · ${c.driveFileId}`;
    if (v.sorte === 'rien') { bilan.intacts += 1; dire(`${tete} → INTACTE (${v.pourquoi})`); continue; }
    if (v.sorte === 'disparu') {
      bilan.disparus += 1;
      dire(`${tete} → DISPARUE (${v.motif})`);
      if (o.appliquer) {
        await marquerCopieDisparue(c.driveFileId, v.motif);
        await noterFichiersDisparus([c.driveFileId]);
      }
      continue;
    }
    dire(`${tete} → CORRIGER le parent`);
    dire(`        registre : ${c.registreDossier} « ${c.registreNom ?? '?'} »`);
    dire(`        réel     : ${v.parentReel} « ${v.parentNom ?? '?'} »`);
    /* 🔴 EN SIMULATION, LE CHIFFRE ANNONCE UNE INTENTION ; EN APPLICATION, IL DOIT ANNONCER UN FAIT. Voir
       l'encadré de `bloques` : incrémenter avant d'écrire, et sans regarder ce que l'écriture rend, a fait
       annoncer « 2 corrigé(s) » à trois passes qui n'avaient rien écrit. */
    if (!o.appliquer) { bilan.corriges += 1; continue; }

    /**
     * ⚠️ L'OCCUPANT EST CHERCHÉ AVANT D'ÉCRIRE, et non après l'échec : l'index unique
     * `(piece_id, drive_dossier_id)` ne distingue pas les copies DISPARUES des vivantes, si bien qu'une ligne
     * morte réserve la place. Tenter quand même remplirait le journal du serveur d'une trace d'exception pour
     * une situation parfaitement prévisible — et on ne saurait toujours pas QUELLE ligne bloque.
     *
     * 🔴 ET CETTE LECTURE RESTE JUSTE APRÈS LA MIGRATION 301 : avec l'index devenu partiel, une ligne disparue
     * n'est plus un occupant, `occupantDuSlot` ne la rend plus, et la correction passe. Le code n'a donc pas à
     * savoir quel schéma est en place — il demande « la place est-elle prise ? » et la base répond.
     */
    const occupant = await occupantDuSlot(c.pieceId, v.parentReel, c.id);
    if (occupant !== null) {
      bilan.bloques += 1;
      dire(`        ↳ 🔴 BLOQUÉE : la ligne ${occupant.id} (fichier ${occupant.driveFileId}) occupe déjà cet `
        + `emplacement pour cette pièce${occupant.disparu ? ', alors que sa copie est DISPARUE' : ''}.`);
      dire('           Cause : index unique (piece_id, drive_dossier_id) sans condition. Levée par la migration 301.');
      continue;
    }
    const n = await deplacerCopieAuRegistre(c.driveFileId, v.parentReel, v.parentNom);
    if (n === 0) {
      bilan.bloques += 1;
      dire('        ↳ 🔴 BLOQUÉE : le registre n’a pas accepté l’écriture (voir le journal du serveur).');
      continue;
    }
    bilan.corriges += 1;
    await noterParentDeplace(c.driveFileId, v.parentReel);
    dire(`        ↳ ${n} ligne(s) de registre mise(s) à jour`);
  }
  return bilan;
}

/** La phrase du bilan, écrite UNE fois : le journal du serveur et celui de la base disent la même chose. PUR. */
export function phraseBilanFantomes(b: BilanFantomes, appliquer: boolean): string {
  return `${appliquer ? 'Nettoyage' : 'Simulation'} des emplacements fantômes : ${b.candidats} candidat`
    + `${b.candidats > 1 ? 's' : ''}, ${b.verifies} vérifié${b.verifies > 1 ? 's' : ''} chez Google, `
    + `${b.corriges} correction${b.corriges > 1 ? 's' : ''}, ${b.disparus} disparition`
    + `${b.disparus > 1 ? 's' : ''}, ${b.intacts} intacte${b.intacts > 1 ? 's' : ''}`
    /* 🔴 LE QUATRIÈME NOMBRE N'EST ÉCRIT QUE S'IL Y EN A, et jamais en simulation : « 0 bloquée » à chaque passe
       serait du bruit permanent, et c'est précisément le bruit qui fait cesser de lire les journaux. */
    + (b.bloques > 0 ? `, ${b.bloques} BLOQUÉE${b.bloques > 1 ? 'S' : ''} (écriture refusée par le registre)` : '')
    + '.';
}

/**
 * ══ 🔴🔴 LE JOURNAL — « le journal doit tracer le nombre de candidats, de corrections et de disparitions » ════════
 *
 * Demande d'Arno, mot pour mot. Les trois nombres partent dans `gestion_journal`, l'endroit où le module consigne
 * déjà les dépôts Drive.
 *
 * ⚠️ L'ENTITÉ EST `piece_drive`, et c'est elle qui existe DÉJÀ dans `gestion_journal_entite_chk` (vérifié en
 * base). Inventer une entité aurait demandé une migration — donc un lot livré qui ne journalise RIEN tant qu'Arno
 * ne l'applique pas, pour la seule beauté d'un mot.
 *
 * ⚠️ `entite_id = 0` : ce bilan ne porte pas sur UNE ligne du registre mais sur la passe entière. Choisir une
 * ligne au hasard aurait fait croire à un incident sur ce dépôt-là.
 *
 * ⚠️ AU MIEUX-EFFORT, ET JAMAIS ATTENDU : un journal impossible ne doit pas défaire un nettoyage qui a eu lieu —
 * la règle du module depuis le 23/09, où une entité refusée avait fait rendre un échec pour un mail parti.
 *
 * ⚠️ RIEN N'EST ÉCRIT QUAND LA PASSE N'A RIEN VU : une ligne « 0 candidat » toutes les quinze minutes noierait le
 * journal sous 96 lignes par jour qui ne disent rien. On consigne ce qui s'est passé, pas le fait d'avoir regardé.
 */
export async function journaliserFantomes(b: BilanFantomes, appliquer: boolean): Promise<void> {
  if (b.candidats === 0) return;
  try {
    await query(
      `INSERT INTO gestion_journal
         (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ('piece_drive', 0, 'nettoyage_fantomes', $1, $2, $3, NULL, $4)`,
      [
        `${b.candidats} candidat(s)`,
        `${b.corriges} corrigé(s) · ${b.disparus} disparu(s) · ${b.intacts} intacte(s)`
          + (b.bloques > 0 ? ` · ${b.bloques} BLOQUÉE(S)` : ''),
        phraseBilanFantomes(b, appliquer)
          + ' Détection par comparaison du registre des dépôts à l’index des empreintes, puis vérification de'
          + ' chaque candidat chez Google en LECTURE SEULE. Aucune ligne n’est supprimée : un parent est corrigé,'
          + ' ou une disparition est datée.',
        'nettoyage automatique après indexation',
      ]);
  } catch (e) {
    console.error('[gestion/fantomes] bilan NON journalisé', e);
  }
}
