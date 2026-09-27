/**
 * MODULE « GESTION » — LOT REDACTION-GMAIL : CE QU'ON A LE DROIT DE FAIRE D'UN FICHIER DU DRIVE, dans l'éditeur de
 * mail. Module PUR : aucun import, aucune base, aucun réseau. Il rend un VERDICT, il ne lit rien lui-même.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LA RÈGLE D'ARNO, ET ELLE NE SE NÉGOCIE PAS : « DOCUMENTS CLIENTS SCANNÉS » NE SE LIT PAS.
 *
 * Ce dossier est l'archive historique du cabinet — des années de documents scannés, dont des pièces d'identité, des
 * avis d'imposition, des relevés bancaires. Le module de gestion ne doit JAMAIS le modifier (règle du lot DRIVE-1,
 * tenue par `driveGardeFou`) ET, depuis ce lot, ne doit jamais en lire le CONTENU non plus.
 *
 * DEUX GESTES, DEUX RÉGIMES — et c'est toute la finesse de la règle :
 *   · « INSÉRER UN LIEN » ne lit rien : il pose dans le message l'adresse Drive du fichier et son NOM, tous deux
 *     déjà connus par la navigation. Le destinataire devra s'authentifier chez Google pour l'ouvrir, et Google
 *     appliquera SES droits à lui. Rien ne sort de chez nous. → AUTORISÉ PARTOUT.
 *   · « JOINDRE » télécharge les OCTETS et les met dans un mail qui part sur l'Internet ouvert, sans
 *     authentification, vers une adresse qu'on a tapée à la main. → INTERDIT sous « Documents clients scannés ».
 *
 * 🔴 LE REFUS EST DÉCIDÉ AVANT TOUTE LECTURE, et il l'est DEUX FOIS : à l'écran (le bouton n'existe pas) et sur le
 * serveur (la route refuse). Le premier explique, le second protège — un écran modifié ne doit pas pouvoir demander
 * ce que la règle interdit.
 *
 * ⚠️ ON NE SE FIE PAS AU NOM DU FICHIER, NI À CELUI DE SON DOSSIER IMMÉDIAT : on remonte la chaîne des parents. Un
 * fichier rangé douze niveaux sous « Documents clients scannés » est sous « Documents clients scannés ».
 *
 * ⚠️ ET ON REFUSE QUAND ON NE SAIT PAS. Chaîne de parents incomplète, dossier inconnu, réponse Drive tronquée : le
 * verdict est « interdit ». Un garde-fou qui laisse passer l'incertain ne garde rien.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Le nom du dossier interdit à la lecture de contenu, écrit UNE fois. */
export const DOSSIER_INTERDIT_LECTURE = 'Documents clients scannés';

/**
 * Variantes acceptées à la comparaison. Le dossier a été nommé à la main, il y a des années : un accent manquant ou
 * une majuscule différente ne doit PAS rouvrir la porte. On compare donc sur une forme normalisée.
 */
function normaliser(nom: string): string {
  return nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const INTERDIT_NORMALISE = normaliser(DOSSIER_INTERDIT_LECTURE);

/** Un maillon de la chaîne des parents, tel que Drive le rend. */
export interface Maillon {
  id: string;
  nom: string;
  /** `null` quand c'est une racine de Drive (on ne remonte pas au-delà). */
  parentId: string | null;
}

/** Borne l'ascension : une chaîne cyclique ou démesurée ne doit pas figer l'écran. */
export const PROFONDEUR_MAX = 32;

export type VerdictFichier =
  | { joindre: true }
  | { joindre: false; motif: string };

/**
 * ══ 🔴 PEUT-ON JOINDRE CE FICHIER ? PUR. ═════════════════════════════════════════════════════════════════════════
 *
 * `chaine` va du fichier (ou de son dossier) vers la racine. `index` permet de continuer à remonter quand la chaîne
 * fournie s'arrête. Les deux formes existent parce que Drive rend les parents par un identifiant : l'appelant a
 * parfois déjà tout le chemin, parfois seulement le premier parent.
 *
 * ⚠️ « JOINDRE » N'EST AUTORISÉ QUE SI L'ON A PU REMONTER JUSQU'À UNE RACINE. Tant qu'on n'a pas vu le haut de la
 * chaîne, on ne peut pas affirmer qu'on n'est pas sous le dossier interdit.
 */
export function peutJoindre(depart: string | null, index: ReadonlyMap<string, Maillon>): VerdictFichier {
  if (depart === null || depart === '') {
    return { joindre: false, motif: 'Emplacement inconnu : par précaution, seul le lien est proposé.' };
  }
  const vus = new Set<string>();
  let courant: string | null = depart;
  for (let i = 0; i < PROFONDEUR_MAX && courant !== null; i += 1) {
    if (vus.has(courant)) {
      return { joindre: false, motif: 'Arborescence incohérente : par précaution, seul le lien est proposé.' };
    }
    vus.add(courant);
    const m: Maillon | undefined = index.get(courant);
    if (m === undefined) {
      return { joindre: false, motif: 'Emplacement incomplet : par précaution, seul le lien est proposé.' };
    }
    if (normaliser(m.nom) === INTERDIT_NORMALISE) {
      return {
        joindre: false,
        motif: `Ce fichier est dans « ${DOSSIER_INTERDIT_LECTURE} » : son contenu n’est jamais lu. `
          + 'Vous pouvez en insérer le lien — le destinataire l’ouvrira avec ses propres droits Google.',
      };
    }
    courant = m.parentId;
  }
  // On est remonté jusqu'en haut sans rencontrer le dossier interdit : la lecture est permise.
  if (courant === null) return { joindre: true };
  return { joindre: false, motif: 'Arborescence trop profonde : par précaution, seul le lien est proposé.' };
}

/**
 * LA MÊME QUESTION, quand on dispose du CHEMIN déjà résolu (« GESTION LOCATIVE › Documents clients scannés › … »).
 * PUR.
 *
 * ⚠️ ELLE NE REMPLACE PAS `peutJoindre` : un chemin est du texte, et du texte se fabrique. Elle sert à l'ÉCRAN,
 * qui affiche déjà le chemin et doit décider quel bouton montrer sans refaire un aller-retour. Le serveur, lui,
 * tranche toujours sur la chaîne des parents.
 */
export function cheminSousDossierInterdit(chemin: readonly string[]): boolean {
  return chemin.some((seg) => normaliser(seg) === INTERDIT_NORMALISE);
}

/** Construit l'index attendu par `peutJoindre` à partir d'une liste plate. PUR. */
export function indexerMaillons(maillons: readonly Maillon[]): Map<string, Maillon> {
  return new Map(maillons.map((m) => [m.id, m]));
}
