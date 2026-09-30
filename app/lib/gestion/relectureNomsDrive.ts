import { jetonPourSubject } from './driveDelegue';
import { nomRepriseDepuisDrive, type NomVuDansDrive } from './nomUsagePiece';
import {
  ecrireNomUsage, journaliserRenommage, marquerCopieDisparue, noterNomEcritDansDrive, piecesParIdentifiants,
  type PieceARelire,
} from './nomUsageRepo';
import { motifDisparition } from './copieDisparue';
import { lireNomsDrive, type DepsReprise } from './reprendreNomsDrive';
import { renommerPiece } from './renommagePieceReel';

/**
 * ══ 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — LIRE LES NOMS DRIVE À LA DEMANDE, PAS DANS TROIS JOURS ════════════════
 *
 * Demande d'Arno : « Renommage fait DANS GOOGLE DRIVE : le balayage sur 3 jours est trop lent. Ajoute une lecture
 * À LA DEMANDE : à l'ouverture d'un fil, d'une modale de pièces ou de la visionneuse, relis en métadonnées
 * (files.get, champs name + modifiedTime) le nom des copies Drive des pièces affichées (quelques appels, en
 * parallèle, avec un cache court de 30 s environ). Si le nom a changé, le nom d'usage est mis à jour et l'écran
 * se rafraîchit. »
 *
 * ═══ 🔴 CE QUI CHANGE, ET CE QUI NE CHANGE PAS ══════════════════════════════════════════════════════════════
 *
 * · LA RÈGLE EST LA MÊME, mot pour mot : un renommage humain, c'est Drive qui dit autre chose que ce que NOUS y
 *   avons écrit (`nom_drive`). Une copie dont on ignore ce qu'on y a mis est laissée tranquille. Ce module ne
 *   rouvre aucune permission : il déclenche PLUS TÔT exactement le même geste.
 * · CE QUI CHANGE EST LE DÉCLENCHEUR ET LE RYTHME. Le balayage de fond tient la promesse « rien n'est oublié »,
 *   en trois jours. Celui-ci tient « ce que je REGARDE est à jour », en quelques centaines de millisecondes.
 *   Les deux sont nécessaires : le premier voit ce que personne ne regarde, le second voit vite ce qu'on regarde.
 *
 * ═══ ⚠️ POURQUOI UNE MÉMOIRE DE 30 SECONDES, ET PAS PLUS ════════════════════════════════════════════════════
 *
 * Ouvrir un fil, cliquer une pièce, ouvrir la visionneuse, revenir : quatre écrans en dix secondes, sur les MÊMES
 * pièces. Sans mémoire, chacun repaierait la série de `files.get` — c'est-à-dire qu'on paierait la fraîcheur au
 * prix d'une lenteur, et qu'on aurait déplacé le problème.
 *
 * 30 s, et pas davantage : au-delà, un nom changé dans Drive pendant qu'on regarde l'écran ne remonterait pas au
 * geste suivant, et l'on retomberait dans le défaut qu'on répare. C'est court parce que c'est le délai au bout
 * duquel on accepte de se tromper.
 *
 * 🔒 LA MÉMOIRE NE PORTE QUE DES NOMS DE FICHIERS, en mémoire du processus, et meurt avec lui. Aucun octet de
 * document, rien sur le disque, rien dans le Drive.
 *
 * ⚠️ SA CLÉ PORTE LE SUJET (l'adresse au nom de laquelle on interroge Google) — même règle que `driveMemoire`.
 * Google applique les droits de CETTE personne : une mémoire partagée entre deux collaborateurs ferait voir à
 * l'un ce que l'autre seul peut lire. C'est le genre de fuite qu'un cache introduit sans bruit.
 */

/** Voir l'encadré : 30 s est le délai au bout duquel on accepte de se tromper, pas un réglage de confort. */
export const MEMOIRE_NOMS_MS = 30_000;

/**
 * COMBIEN DE `files.get` EN VOL EN MÊME TEMPS.
 *
 * ⚠️ BORNÉ, ET BAS. Un fil peut afficher trente pièces ; trente requêtes simultanées vers Google au chargement
 * d'un écran, c'est la rafale qui fait répondre 429 — et un 429 ici ferait échouer des lectures qui, une par une,
 * auraient toutes abouti. Six suffit : la latence d'un `files.get` est d'environ 300 ms (mesurée), donc trente
 * lectures tiennent dans une seconde et demie, en arrière-plan, pendant que l'écran est déjà peint.
 */
export const EN_PARALLELE = 6;

/**
 * ⚠️ LE PLAFOND PAR DEMANDE. Un écran qui afficherait deux cents pièces ne doit pas lancer deux cents lectures :
 * le balayage de fond est là pour le reste, et il finit toujours par passer. On préfère une promesse tenue sur
 * les premières que la même promesse à moitié tenue sur toutes.
 */
export const PLAFOND_A_LA_DEMANDE = 40;

/**
 * ══ 🔴🔴 AU NOM DE QUI L'ON LIT — DÉFAUT TROUVÉ À L'ÉPREUVE RÉELLE, LE 30/09/2026 ════════════════════════════
 *
 * PREMIÈRE VERSION : lire avec le compte de la relève (`gestion@criterimmo.fr`), comme le balayage de fond. Le
 * renommage fait dans Google Drive n'a PAS été repris, et rien ne l'a dit.
 *
 * 🔴 LA CAUSE : le fichier était dans le Drive partagé « Test », dont `gestion@criterimmo.fr` n'est pas membre.
 * `files.get` répondait 404 — c'est-à-dire « ce fichier n'existe pas », ce que `lireNomsDrive` traite (à raison)
 * comme « rien à reprendre de lui ». Un refus de droits et un fichier disparu se ressemblent trop pour qu'on
 * puisse les distinguer ici ; la seule issue est de poser la question avec les BONS droits.
 *
 * 🔴 D'OÙ LA RÈGLE : on lit au nom de la PERSONNE QUI REGARDE L'ÉCRAN, exactement comme le dépôt écrit au nom de
 * celui qui range (lot 5-PJ-C). C'est Google qui applique ses droits, dossier par dossier, et un collaborateur
 * ne peut donc jamais faire relire un fichier qu'il n'a pas le droit de voir.
 *
 * ⚠️ LE BALAYAGE DE FOND, LUI, GARDE LE COMPTE DE LA RELÈVE : il tourne sans personne devant l'écran, et il vise
 * les copies que l'application a faites elle-même, qui sont dans SON périmètre.
 */
const COMPTE_RELEVE = 'gestion@criterimmo.fr';

interface Vu { valeur: NomVuDansDrive | null; expireA: number }
const memoire = new Map<string, Vu>();

/** Pour les tests, et pour une passe qui voudrait repartir à neuf. Sans effet sur le Drive. */
export function oublierLesNomsDrive(): void {
  memoire.clear();
}

/** Combien de noms sont retenus. Sert aux mesures et aux tests — jamais à l'écran. */
export function tailleMemoireNoms(): number {
  return memoire.size;
}

/**
 * LES NOMS ACTUELS DE CES COPIES, mémorisés 30 s, lus EN PARALLÈLE par petits paquets.
 *
 * ⚠️ UN ÉCHEC N'EST PAS MÉMORISÉ COMME UN SUCCÈS, mais il EST mémorisé : `null` veut dire « Google n'a rien
 * rendu pour cet identifiant », et le retenir 30 s évite de marteler un fichier mis à la corbeille à chaque
 * ouverture d'écran. C'est la même durée : au pire, on ignore un renommage pendant une demi-minute.
 */
export async function nomsDriveMemo(
  jeton: string, ids: readonly string[], deps: DepsReprise, maintenant = Date.now(), sujet = '',
): Promise<Map<string, NomVuDansDrive>> {
  const propres = [...new Set(ids.map((i) => i.trim()).filter((i) => i !== ''))];
  const sortie = new Map<string, NomVuDansDrive>();
  const aLire: string[] = [];
  const cle = (id: string): string => `${sujet}|${id}`;

  for (const id of propres) {
    const deja = memoire.get(cle(id));
    if (deja !== undefined && deja.expireA > maintenant) {
      if (deja.valeur !== null) sortie.set(id, deja.valeur);
      continue;
    }
    aLire.push(id);
  }
  if (aLire.length === 0) return sortie;

  /* 🔴 PAR PAQUETS DE `EN_PARALLELE`, ET NON TOUT D'UN COUP. `lireNomsDrive` lit en série (c'est ce qu'il faut
     pour une passe de fond de soixante pièces, qui a tout son temps) ; ici l'écran attend, et six lectures de
     front divisent l'attente par six sans risquer la rafale. */
  const paquets: string[][] = [];
  for (let i = 0; i < aLire.length; i += EN_PARALLELE) paquets.push(aLire.slice(i, i + EN_PARALLELE));
  for (const paquet of paquets) {
    /* 🔴 LOT FICHE-SAISIE-UNIFORME — UNE COPIE SUPPRIMÉE DU DRIVE EST MARQUÉE, ET PLUS JAMAIS RELUE. Sans cela,
       la même copie morte repartait à chaque ouverture d'écran : un aller-retour vers Google, pour toujours, sur
       un fichier qui n'existe plus. Et l'on n'affiche rien — c'est la demande d'Arno, mot pour mot. */
    const vus = await Promise.all(paquet.map(async (id) => (await lireNomsDrive(
      jeton, [id], deps,
      (mort, statut) => { void marquerCopieDisparue(mort, motifDisparition(statut)); },
    ))[0] ?? null));
    paquet.forEach((id, i) => {
      const v = vus[i] ?? null;
      memoire.set(cle(id), { valeur: v, expireA: maintenant + MEMOIRE_NOMS_MS });
      if (v !== null) sortie.set(id, v);
    });
  }
  return sortie;
}

/** Ce qu'on a repris, pour que l'écran sache s'il doit se rafraîchir. */
export interface BilanRelecture {
  /** Combien de pièces ont été confrontées à Drive. */
  relues: number;
  /** Les noms repris. Vide ⇒ l'écran n'a rien à refaire. */
  reprises: { pieceId: number; ancien: string; nouveau: string }[];
}

/**
 * ══ 🔴 LE CŒUR, PARTAGÉ AVEC LE BALAYAGE DE FOND ═══════════════════════════════════════════════════════════
 *
 * 🔴 UNE SEULE ÉCRITURE DE LA RÈGLE. Le balayage et la lecture à la demande décident EXACTEMENT la même chose ;
 * deux copies divergeraient, et ce jour-là l'un reprendrait un nom que l'autre refuse — sur la même pièce, selon
 * l'heure. C'est la sorte d'incohérence qu'on met des mois à attribuer.
 */
export async function reprendrePourCesPieces(
  pieces: readonly PieceARelire[], jeton: string, deps: DepsReprise,
  lire: (jeton: string, ids: readonly string[], deps: DepsReprise) => Promise<Map<string, NomVuDansDrive>>,
): Promise<BilanRelecture> {
  const bilan: BilanRelecture = { relues: 0, reprises: [] };
  if (pieces.length === 0) return bilan;

  /* 🔴 ON NE LIT QUE LES COPIES DONT ON SAIT CE QU'ON Y A ÉCRIT. Une copie au `nom_drive` nul est laissée
     tranquille — ne pas savoir n'est pas une raison de renommer, c'est la raison de s'abstenir. Et la filtrer
     ICI évite d'aller demander à Google le nom d'un fichier dont la réponse ne servirait à rien. */
  const candidates = pieces.map((p) => ({
    piece: p, copies: p.copies.filter((c) => (c.nomDrive ?? '').trim() !== ''),
  })).filter((x) => x.copies.length > 0);
  if (candidates.length === 0) return bilan;

  const parId = await lire(jeton, candidates.flatMap((x) => x.copies.map((c) => c.driveFileId)), deps);
  bilan.relues = candidates.length;

  for (const { piece, copies } of candidates) {
    const siens = copies
      .map((c) => {
        const vu = parId.get(c.driveFileId);
        // On compare à `nomDrive` — ce que NOUS y avons écrit —, jamais au nom de la pièce : les copies de
        //   « 00 Arrivée des mails » portent un préfixe « date — expéditeur — » et différeraient toujours.
        return vu === undefined || vu.nom.trim() === (c.nomDrive ?? '').trim() ? undefined : vu;
      })
      .filter((v): v is NomVuDansDrive => v !== undefined);
    if (siens.length === 0) continue;

    const repris = nomRepriseDepuisDrive(piece.nomAffiche, siens);
    if (repris === null) continue;

    const ancien = piece.nomAffiche;
    if (!(await ecrireNomUsage(piece.pieceId, repris.nom))) continue;

    /**
     * ══ 🔴🔴 LA COPIE D'OÙ VIENT LE NOM ENTRE AU REGISTRE, SOUS CE NOM ═════════════════════════════════════
     *
     * DÉFAUT TROUVÉ À L'ÉPREUVE RÉELLE, le 30/09/2026, en REMETTANT le nom d'origine dans Google Drive : rien
     * n'a été repris, et le nom d'usage est resté sur la version renommée.
     *
     * 🔴 LA CAUSE : `nom_drive` dit « ce que NOUS avons écrit sur ce fichier », et c'est LUI la base de
     * comparaison. Après avoir adopté un nom venu de Drive, on laissait `nom_drive` à sa valeur d'avant. Le
     * fichier disait donc éternellement « autre chose que ce qu'on y a écrit » — et, symétriquement, un RETOUR
     * au nom précédent devenait invisible : Drive redisait exactement `nom_drive`, donc « rien n'a changé ».
     *
     * 🔴 ADOPTER UN NOM, C'EST LE FAIRE NÔTRE. Une fois le nom d'usage écrit, ce nom EST celui que nous tenons
     * pour écrit là-bas : le consigner remet la comparaison à zéro, et le prochain changement — dans un sens
     * comme dans l'autre — se voit.
     *
     * ⚠️ LES AUTRES COPIES SONT CONSIGNÉES PAR `renommerPiece` juste en dessous, qui les renomme vraiment. Celle
     * d'où vient le nom n'a rien à renommer : c'est pour cela qu'elle échappait au registre.
     */
    await noterNomEcritDansDrive([repris.venantDe], repris.nom);
    /* ⚠️ LE JOURNAL DIT « drive », ET C'EST TOUTE LA DIFFÉRENCE : en relisant l'historique, on doit pouvoir
       distinguer « quelqu'un a cliqué le stylo » de « le fichier a été renommé dans Google Drive ». */
    await journaliserRenommage({
      pieceId: piece.pieceId, ancienNom: ancien, nouveauNom: repris.nom, source: 'drive',
      idsDrive: [repris.venantDe], refus: [], par: null, parLibelle: 'Google Drive',
    });
    bilan.reprises.push({ pieceId: piece.pieceId, ancien, nouveau: repris.nom });

    /* ⚠️ LES AUTRES COPIES SONT ALIGNÉES, mais SANS journaliser une seconde fois : la ligne qu'on vient d'écrire
       raconte déjà ce renommage. Deux lignes pour un seul fait feraient lire deux renommages. */
    if (copies.length > 1 || piece.copies.length > 1) {
      await renommerPiece({
        pieceId: piece.pieceId, nom: repris.nom, par: null, parLibelle: 'Google Drive',
        sansDrive: false, sansJournal: true,
      }, deps).catch(() => undefined);
    }
  }
  return bilan;
}

/**
 * LA LECTURE À LA DEMANDE, pour les pièces qu'un écran vient d'afficher.
 *
 * ⚠️ ELLE NE LÈVE JAMAIS. Un fil doit s'ouvrir même si Google est muet : un nom périmé se corrige à l'ouverture
 * suivante, un écran qui refuse de s'afficher ne se corrige pas tout seul.
 */
export async function relireNomsDesPieces(
  pieceIds: readonly number[],
  /**
   * ⚠️ L'ADRESSE AU NOM DE LAQUELLE ON INTERROGE GOOGLE — celle de la personne qui a ouvert l'écran. Voir
   * l'encadré de `COMPTE_RELEVE` : lire avec le compte de la relève a silencieusement raté tous les fichiers
   * rangés dans un Drive partagé dont ce compte n'est pas membre.
   */
  sujet: string | null = null,
  deps: DepsReprise = { fetch },
): Promise<BilanRelecture> {
  const vide: BilanRelecture = { relues: 0, reprises: [] };
  const ids = [...new Set(pieceIds.filter((i) => Number.isSafeInteger(i) && i > 0))]
    .slice(0, PLAFOND_A_LA_DEMANDE);
  if (ids.length === 0) return vide;
  try {
    const pieces = await piecesParIdentifiants(ids);
    if (pieces.length === 0) return vide;
    const adresse = (sujet ?? '').trim() || COMPTE_RELEVE;
    const jeton = await jetonPourSubject(adresse, deps);
    if (!jeton.ok) return vide;
    return await reprendrePourCesPieces(
      pieces, jeton.jeton, deps, (j, i, d) => nomsDriveMemo(j, i, d, Date.now(), adresse));
  } catch (e) {
    console.error('[gestion/noms-drive] relecture à la demande impossible', e);
    return vide;
  }
}
