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
 * ══ 🔴🔴 L'ASCENSION, ET ELLE NE SERT PLUS QU'À UNE SEULE QUESTION : SOMMES-NOUS SOUS LE DOSSIER INTERDIT ? PUR.
 *
 * 🔴 POURQUOI ELLE A ÉTÉ EXTRAITE (lot DRIVE-VISUALISER-ET-DOSSIERS). Deux gestes s'y appuient désormais : LIRE un
 * fichier (joindre, visualiser) et CRÉER un dossier. Écrire deux fois la même remontée aurait donné deux
 * remontées — et le jour où l'une gagne un cas que l'autre n'a pas, l'un des deux gestes passe là où l'autre
 * refuse. Une seule traversée, deux verdicts qui l'interprètent.
 *
 * ⚠️ L'INCERTITUDE EST UN RÉSULTAT À PART ENTIÈRE, distinct de « dehors ». Chaîne trouée, cycle, profondeur
 * dépassée, départ vide : on ne sait pas, et NE PAS SAVOIR VAUT INTERDIT pour les deux gestes. Les fondre dans
 * « dehors » ouvrirait la porte à tout ce qu'on n'a pas su lire.
 */
type Ascension =
  | { ou: 'dedans' }
  | { ou: 'dehors' }
  | { ou: 'inconnu'; cause: 'depart' | 'trou' | 'cycle' | 'profondeur' };

function remonterJusquEnHaut(depart: string | null, index: ReadonlyMap<string, Maillon>): Ascension {
  if (depart === null || depart === '') return { ou: 'inconnu', cause: 'depart' };
  const vus = new Set<string>();
  let courant: string | null = depart;
  for (let i = 0; i < PROFONDEUR_MAX && courant !== null; i += 1) {
    if (vus.has(courant)) return { ou: 'inconnu', cause: 'cycle' };
    vus.add(courant);
    const m: Maillon | undefined = index.get(courant);
    if (m === undefined) return { ou: 'inconnu', cause: 'trou' };
    if (normaliser(m.nom) === INTERDIT_NORMALISE) return { ou: 'dedans' };
    courant = m.parentId;
  }
  // On n'est « dehors » qu'après avoir vu le HAUT de la chaîne : tant qu'il reste un parent à lire, on ne sait pas.
  return courant === null ? { ou: 'dehors' } : { ou: 'inconnu', cause: 'profondeur' };
}

/**
 * ══ 🔴 PEUT-ON JOINDRE CE FICHIER ? PUR. ═════════════════════════════════════════════════════════════════════════
 *
 * `depart` est le fichier (ou son dossier). `index` porte les maillons connus : Drive rend les parents par un
 * identifiant, et l'appelant a parfois déjà tout le chemin, parfois seulement le premier parent.
 *
 * ⚠️ « JOINDRE » N'EST AUTORISÉ QUE SI L'ON A PU REMONTER JUSQU'À UNE RACINE. Tant qu'on n'a pas vu le haut de la
 * chaîne, on ne peut pas affirmer qu'on n'est pas sous le dossier interdit.
 */
export function peutJoindre(depart: string | null, index: ReadonlyMap<string, Maillon>): VerdictFichier {
  const a = remonterJusquEnHaut(depart, index);
  if (a.ou === 'dehors') return { joindre: true };
  if (a.ou === 'dedans') {
    return {
      joindre: false,
      motif: `Ce fichier est dans « ${DOSSIER_INTERDIT_LECTURE} » : son contenu n’est jamais lu. `
        + 'Vous pouvez en insérer le lien — le destinataire l’ouvrira avec ses propres droits Google.',
    };
  }
  const mot = a.cause === 'depart' ? 'Emplacement inconnu'
    : a.cause === 'trou' ? 'Emplacement incomplet'
      : a.cause === 'cycle' ? 'Arborescence incohérente'
        : 'Arborescence trop profonde';
  return { joindre: false, motif: `${mot} : par précaution, seul le lien est proposé.` };
}

export type VerdictCreationDossier =
  | { creer: true }
  | { creer: false; motif: string };

/**
 * ══ 🔴🔴 PEUT-ON CRÉER UN DOSSIER DANS CE DOSSIER ? PUR. ═════════════════════════════════════════════════════════
 *
 * 🔴 LA RÈGLE D'ARNO, LOT DRIVE-VISUALISER-ET-DOSSIERS, CODÉE EN DUR : « aucune création dans “Documents clients
 * scannés” ni dans aucun de ses sous-dossiers, à n'importe quelle profondeur ». Elle se vérifie ICI, sur toute la
 * chaîne des parents — jamais sur le nom du dossier affiché, qui ne dit rien de l'endroit où il est rangé.
 *
 * 🔴 ET LE MOTIF DIT « ARCHIVE », PAS « INTERDIT ». Un refus qui n'explique pas se lit comme une panne, et l'on
 * cherche alors à contourner ce qu'on prend pour un bogue. Ici la phrase dit ce qu'est ce dossier et pourquoi
 * l'application n'y écrit rien : il n'y a plus rien à contourner.
 *
 * ⚠️ AUCUN « SEUL LE LIEN EST PROPOSÉ » ICI : il n'y a pas de sortie de secours à la création d'un dossier. Le
 * refus est un refus, et on le dit sans faire croire à une porte à côté.
 */
export function peutCreerDossier(
  parent: string | null, index: ReadonlyMap<string, Maillon>,
): VerdictCreationDossier {
  const a = remonterJusquEnHaut(parent, index);
  if (a.ou === 'dehors') return { creer: true };
  if (a.ou === 'dedans') {
    return {
      creer: false,
      motif: `« ${DOSSIER_INTERDIT_LECTURE} » est l’archive du cabinet : l’application n’y crée aucun dossier, `
        + 'ni dans ce dossier ni dans aucun de ses sous-dossiers, à quelque profondeur que ce soit.',
    };
  }
  const mot = a.cause === 'depart' ? 'Aucun dossier n’est indiqué'
    : a.cause === 'trou' ? 'Cet emplacement n’a pas pu être situé entièrement'
      : a.cause === 'cycle' ? 'L’arborescence de cet emplacement est incohérente'
        : 'Cet emplacement est trop profond pour être vérifié';
  return {
    creer: false,
    motif: `${mot} : par précaution, aucun dossier n’y est créé — on ne crée pas là où l’on ne sait pas où l’on est.`,
  };
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
