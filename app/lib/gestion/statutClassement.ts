/**
 * LOT 5-STATUT — OÙ EN EST CE MESSAGE ? Module PUR : aucun import, aucune base, aucun React.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI CE FICHIER EXISTE. Jusqu'ici, savoir si un échange était classé demandait de remonter des yeux jusqu'à la
 * barre d'actions, et de deviner : trois boutons y proposaient de classer, sans jamais dire où l'échange en était. Le
 * statut descend donc À CÔTÉ DE LA DATE, dans l'en-tête de chaque message — et les gestes qui le changent sortent de
 * ce statut, au lieu d'occuper la barre en permanence (décision d'Arno du 24/09/2026).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 LE STATUT EST DÉRIVÉ, JAMAIS STOCKÉ. Comme « attend une réponse » depuis le lot 2 : aucune colonne ne le porte,
 * il se recalcule à chaque lecture depuis l'état de l'échange et du message. Une colonne mentirait dès le geste
 * suivant, et il faudrait la rattraper à chaque affectation, chaque détachement, chaque classement.
 *
 * 🔴 L'ORDRE DES CAS COMPTE, et il n'est pas arbitraire :
 *   ① un mail DÉPLACÉ SEUL vers une carte porte SA carte, pas celle de son échange — il est réellement ailleurs, et
 *      afficher la carte de l'échange ferait croire qu'il la suit ;
 *   ② un message tenu HORS DE LA FILE par une règle est un constat, pas un classement : on le dit, et on ne propose
 *      rien de plus, parce qu'il n'existe aucun geste propre à ce cas ;
 *   ③ sinon c'est l'état de l'ÉCHANGE : rattaché à une carte, classé sans suite, ou encore à classer.
 *
 * Le mot est TOUJOURS écrit dans le cartouche (« À classer », « Sans suite », la référence GES-…) : jamais la couleur
 * seule — le vert resterait muet en niveaux de gris et pour un daltonien.
 */

/** Ce qu'un message annonce de son classement. */
export type StatutClassement =
  | {
      sorte: 'carte';
      reference: string;
      /** Le titre de la carte (« Fuite salle de bain »). `null` quand on ne le connaît pas encore. */
      libelle: string | null;
      evenementId: number | null;
      /** `true` = la carte de CE MAIL, déplacé seul ; `false` = celle de son échange. Le mot affiché en dépend. */
      propre: boolean;
    }
  | { sorte: 'a_classer' }
  | { sorte: 'sans_suite' }
  | { sorte: 'automatique'; motif: string | null };

/** Ce qu'il faut savoir de l'ÉCHANGE pour trancher. Volontairement minimal : ce module ne connaît pas la base. */
export interface EtatFil {
  etat: 'a_classer' | 'sans_suite';
  reference: string | null;
  evenementId: number | null;
  /** Le titre de la carte, quand l'échange est rattaché. */
  evenementObjet?: string | null;
}

/** Ce qu'il faut savoir du MESSAGE. */
export interface EtatMessage {
  /** Le message est-il tenu hors de la file de tri par une règle ? */
  horsFile?: boolean;
  motifHorsFile?: string | null;
  /** Ce mail a-t-il été déplacé SEUL vers une carte ? La référence de cette carte, le cas échéant. */
  carteDuMail?: { reference: string; libelle: string | null; evenementId: number | null } | null;
}

/** Le statut à afficher pour CE message. PUR. Voir l'ordre des cas dans l'encadré ci-dessus. */
export function statutDuMessage(fil: EtatFil, message: EtatMessage = {}): StatutClassement {
  const propre = message.carteDuMail;
  if (propre) {
    return { sorte: 'carte', reference: propre.reference, libelle: propre.libelle, evenementId: propre.evenementId, propre: true };
  }
  if (message.horsFile === true) return { sorte: 'automatique', motif: message.motifHorsFile ?? null };
  if (fil.reference !== null && fil.reference !== '') {
    return {
      sorte: 'carte', reference: fil.reference, libelle: fil.evenementObjet ?? null,
      evenementId: fil.evenementId, propre: false,
    };
  }
  return fil.etat === 'sans_suite' ? { sorte: 'sans_suite' } : { sorte: 'a_classer' };
}

/**
 * LE MOT DU CARTOUCHE. Toujours écrit, jamais remplacé par une couleur : c'est ce qui le rend lisible en niveaux de
 * gris, pour un daltonien, et à voix haute par un lecteur d'écran. PUR.
 */
export function libelleCartouche(s: StatutClassement): string {
  switch (s.sorte) {
    case 'carte': return s.libelle && s.libelle.trim() !== '' ? `${s.reference} · ${s.libelle.trim()}` : s.reference;
    case 'a_classer': return 'À classer';
    case 'sans_suite': return 'Sans suite';
    case 'automatique': return 'Courrier automatique';
  }
}

/** Ce que le cartouche dit en plus, pour un lecteur d'écran ou en infobulle. `null` = le libellé se suffit. PUR. */
export function precisionCartouche(s: StatutClassement): string | null {
  switch (s.sorte) {
    case 'carte':
      return s.propre
        ? 'Ce mail a été déplacé seul vers cette carte : il ne suit pas son échange.'
        : 'L’échange entier est classé dans cette carte.';
    case 'a_classer': return 'Cet échange n’est rattaché à aucune carte.';
    case 'sans_suite': return 'Écarté de la file. Il y reviendra si un nouveau message arrive.';
    case 'automatique': return s.motif && s.motif.trim() !== '' ? s.motif.trim() : 'Tenu hors de la file de tri par une règle.';
  }
}

/**
 * LE TON du cartouche. Trois valeurs seulement, et chacune a son jeton de charte — aucune couleur en dur.
 * ⚠️ Le ton n'est qu'un APPUI : le mot, lui, est toujours écrit (voir `libelleCartouche`).
 */
export function tonCartouche(s: StatutClassement): 'succes' | 'attente' | 'neutre' {
  if (s.sorte === 'carte') return 'succes';
  if (s.sorte === 'a_classer') return 'attente';
  return 'neutre';
}

/** Les gestes qu'un statut peut déclencher. Ce sont ceux qui EXISTENT déjà : aucune logique nouvelle. */
export type ActionStatut = 'changer' | 'classer' | 'creer' | 'sans_suite' | 'rouvrir';

export interface ActionProposee { cle: ActionStatut; libelle: string }

/**
 * CE QUE LE CARTOUCHE PROPOSE : le mot de son bouton déclencheur (`null` = il n'en a pas), et les gestes qu'il
 * révèle. Rien n'est inventé — chacun appelle une route qui existait avant ce lot.
 *
 * ⚠️ DEUX CAS NE PROPOSENT RIEN, et c'est voulu, pas un oubli :
 *   · un mail déplacé SEUL — ses gestes à lui (« Déplacer ce mail », « Détacher ce mail ») vivent dans son menu
 *     « ⋯ », où ils étaient déjà ; les répéter ici donnerait deux commandes identiques à dix pixels l'une de l'autre ;
 *   · un message tenu hors de la file — il n'existe aucun geste propre à ce cas, et on n'en fabrique pas un.
 * PUR.
 */
export function actionsDuStatut(s: StatutClassement): { declencheur: string | null; actions: ActionProposee[] } {
  const creer: ActionProposee = { cle: 'creer', libelle: 'Créer un événement' };
  const classer: ActionProposee = { cle: 'classer', libelle: 'Classer dans une carte' };
  const sansSuite: ActionProposee = { cle: 'sans_suite', libelle: 'Classer sans suite' };
  switch (s.sorte) {
    case 'carte':
      if (s.propre) return { declencheur: null, actions: [] };
      return { declencheur: 'Modifier', actions: [{ cle: 'changer', libelle: 'Changer l’affectation' }, creer, sansSuite] };
    case 'a_classer':
      return { declencheur: 'Classer', actions: [classer, creer, sansSuite] };
    case 'sans_suite':
      return { declencheur: 'Modifier', actions: [{ cle: 'rouvrir', libelle: 'Rouvrir' }, classer, creer] };
    case 'automatique':
      return { declencheur: null, actions: [] };
  }
}

/**
 * L'adresse de la carte, pour rendre le cartouche CLIQUABLE. C'est l'écran qui existe déjà : la boîte en plein écran,
 * sous l'étiquette de cette carte. `null` quand on ne connaît pas l'identifiant — un lien mort userait la confiance.
 *
 * ⚠️ La grammaire de l'adresse est celle de `ecranUrl`, recopiée ici en UNE ligne pour que ce module reste sans
 * import (le navigateur le charge). Un test compare les deux formes, pour qu'elles ne puissent pas diverger.
 */
export function lienVersCarte(s: StatutClassement): string | null {
  if (s.sorte !== 'carte' || s.evenementId === null) return null;
  return `/admin/gestion?ecran=boite&etiquette=carte-${s.evenementId}`;
}
