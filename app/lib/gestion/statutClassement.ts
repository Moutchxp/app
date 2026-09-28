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
    case 'carte': {
      const nom = s.libelle && s.libelle.trim() !== '' ? `${s.reference} · ${s.libelle.trim()}` : s.reference;
      return `Événement : ${nom}`;
    }
    /**
     * 🔴 LOT STATUT-PAR-MAIL — « À classer » N'EST PLUS JAMAIS LE MOT DE CE CARTOUCHE.
     *
     * LE DÉFAUT QU'IL CORRIGE, constaté par Arno sur le fil 803 (Thirion) : chaque message portait le badge
     * « À classer » ET le lien vert « Visualiser / Modifier ». Contradictoire à l'œil, et pourtant les deux
     * disaient vrai — ils ne parlaient simplement pas de la même chose : le badge de l'ÉVÉNEMENT (aucune carte),
     * le lien du BIEN (les trois mails sont rattachés au lot 445).
     *
     * Le STATUT d'un mail, désormais, c'est son rattachement à un BIEN, et lui seul (voir `capsuleDuMessage`).
     * L'événement garde toute sa place — rien n'est supprimé — mais il se dit comme ce qu'il est : une MENTION,
     * « Événement : aucun », qui ne peut plus être lue comme un verdict de classement.
     */
    case 'a_classer': return 'Événement : aucun';
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
    case 'a_classer':
      return 'Cet échange n’est posé sur aucune carte d’événement. C’est une information distincte du '
        + 'classement du mail, qui se lit sur sa capsule (À classer / Auto / Classé).';
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
  /**
   * 🔴 LOT STATUT-PAR-MAIL — « aucun événement » EST NEUTRE, PLUS « EN ATTENTE ». Le ton « attente » est celui
   * d'un travail à faire ; or ne pas avoir d'événement n'est pas un manquement — l'immense majorité des mails
   * n'en a pas et n'en aura jamais. C'est la capsule du BIEN qui porte désormais le « à faire », et elle seule.
   */
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
  // LOT ERGO-BOITE — la boîte est désormais l'écran par défaut : `ecran=boite` ne s'écrit plus. Ce module est PUR
  //   (aucun import), la grammaire de l'adresse y est donc recopiée — et `statutClassement.test.ts` la compare à
  //   `ecrireEtatUrl` pour que les deux ne divergent jamais. C'est ce test qui a attrapé ce changement.
  return `/admin/gestion?etiquette=carte-${s.evenementId}`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LOT CAPSULE-STATUT — LA CAPSULE D'UNE LIGNE DE LISTE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Où en est le RATTACHEMENT d'un échange, vu de la liste.
 *
 * 🔴 CE N'EST PAS LA MÊME QUESTION QUE L'ENTRÉE « À classer » DE LA COLONNE DE GAUCHE, et la confusion coûterait
 * cher. Celle-ci demande « ce courrier est-il rattaché à un logement ou à un propriétaire ? » ; celle-là demande
 * « cet échange est-il posé sur un ÉVÉNEMENT ? ». Mesuré le 27/09/2026 : 474 échanges sans événement, 9 631 sans
 * rattachement. Deux questions, deux nombres, et aucun des deux ne remplace l'autre.
 */
export type CapsuleStatut = 'classe' | 'auto' | 'a_classer';

/**
 * LE STATUT D'UN ÉCHANGE, à partir de ce que la requête a compté. PUR.
 *
 * PRIORITÉ : Classé > Auto > À classer — c'est-à-dire « le geste humain l'emporte ». Un échange dont un mail a été
 * rattaché à la main par un collègue est CLASSÉ, même si dix autres de ses mails n'ont qu'un rattachement
 * automatique : quelqu'un a tranché, et c'est l'information qui compte.
 *
 * ⚠️ UNE PROPOSITION NON CONFIRMÉE NE CLASSE RIEN. Elle n'entre pas dans `nbActifs` (la requête ne compte que les
 * rattachements `confirme`) : un candidat que personne n'a validé laisse l'échange « à classer », ce qui est
 * exactement ce qu'il est.
 */
export function capsuleStatut(o: { nbActifs: number; parUnHumain: boolean }): CapsuleStatut {
  if (o.nbActifs > 0 && o.parUnHumain) return 'classe';
  if (o.nbActifs > 0) return 'auto';
  return 'a_classer';
}

/** Le MOT de la capsule — toujours écrit, jamais porté par la seule couleur. PUR. */
export function motCapsule(s: CapsuleStatut): string {
  if (s === 'classe') return 'Classé';
  if (s === 'auto') return 'Auto';
  return 'À classer';
}

/**
 * L'INFO-BULLE : le détail des rattachements, tel que la requête l'a assemblé. Quand il n'y en a aucun, on dit
 * POURQUOI la capsule est rouge plutôt que de laisser une bulle vide. PUR.
 */
export function bulleCapsule(s: CapsuleStatut, detail: string | null): string {
  if (s === 'a_classer') {
    return 'Aucun rattachement confirmé à un logement ou à un propriétaire '
      + '(une proposition non confirmée ne compte pas).';
  }
  return detail && detail.trim() !== '' ? detail : 'Rattaché.';
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LOT STATUT-PAR-MAIL — LE STATUT D'UN MAIL, C'EST SON RATTACHEMENT À UN BIEN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴 LES SORTES DE CIBLE QUI SONT UN « BIEN » ══════════════════════════════════════════════════════════════════
 *
 * Un LOGEMENT, un PROPRIÉTAIRE, un LOCATAIRE. Pas un ÉVÉNEMENT — c'est l'autre question, et toute la confusion du
 * fil 803 venait de les avoir mêlées.
 *
 * ⚠️ POURQUOI LE PROPRIÉTAIRE ET LE LOCATAIRE COMPTENT AUTANT QUE LE LOGEMENT. Beaucoup de mails parlent d'une
 * PERSONNE sans désigner un appartement précis (un relevé de charges d'un bailleur qui possède six lots, une
 * demande d'un locataire). Exiger le logement laisserait ces mails « à classer » pour toujours, alors qu'ils sont
 * parfaitement rangés.
 */
export const SORTES_BIEN: readonly string[] = ['lot', 'proprietaire', 'locataire'];

/** Un rattachement, réduit à ce qui décide du statut. Volontairement minimal : ce module ne connaît pas la base. */
export interface LienPourStatut {
  cible: { sorte: string };
  statut: string;
  origine: string;
  /** Vrai quand un humain a touché le statut : poser OU confirmer, les deux valent « quelqu'un a tranché ». */
  parUnHumain?: boolean;
}

/**
 * ══ 🔴 LA CAPSULE D'UN MESSAGE, calculée sur SES rattachements à un BIEN. PUR. ═══════════════════════════════════
 *
 * C'est LE statut d'un mail, et il n'y en a plus qu'un. Trois valeurs, et la priorité est celle de la liste :
 * Classé > Auto > À classer — « le geste humain l'emporte ». Un mail que quelqu'un a rattaché à la main est CLASSÉ,
 * même si le moteur en a proposé trois autres : quelqu'un a tranché, et c'est l'information qui compte.
 *
 * ⚠️ UNE PROPOSITION NON CONFIRMÉE NE CLASSE RIEN. Elle reste « à classer », ce qui est exactement ce qu'elle est :
 * un candidat que personne n'a validé.
 *
 * ⚠️ UN RATTACHEMENT VERS UN ÉVÉNEMENT NE COMPTE PAS, et c'est tout l'objet de ce lot. Mesuré le 27/09/2026 :
 * 474 échanges sans événement contre 9 631 sans rattachement — deux questions, deux nombres, et aucun ne remplace
 * l'autre. Les mêler donnait le badge « À classer » sur trois mails parfaitement rattachés au lot 445 (fil 803).
 */
export function capsuleDuMessage(liens: readonly LienPourStatut[]): CapsuleStatut {
  const biens = liens.filter((l) => SORTES_BIEN.includes(l.cible.sorte) && l.statut === 'confirme');
  if (biens.length === 0) return 'a_classer';
  return biens.some((l) => l.origine === 'manuel' || l.parUnHumain === true) ? 'classe' : 'auto';
}

/**
 * L'INFO-BULLE de la capsule d'un MESSAGE : ce à quoi il est rattaché, ou pourquoi il ne l'est pas. PUR.
 *
 * ⚠️ QUAND C'EST ROUGE, ON DIT POURQUOI — et on rappelle qu'une proposition ne compte pas. Sans cela, on cherche
 * un rattachement qui est bien là, mais que personne n'a confirmé.
 */
export function bulleCapsuleMessage(s: CapsuleStatut, libelles: readonly string[]): string {
  if (s === 'a_classer') {
    return 'Ce mail n’est rattaché à aucun bien (logement, propriétaire ou locataire). '
      + 'Une proposition automatique non confirmée ne compte pas.';
  }
  const dit = libelles.filter((l) => l.trim() !== '');
  const debut = s === 'classe' ? 'Rattaché à la main' : 'Rattaché automatiquement';
  return dit.length === 0 ? `${debut}.` : `${debut} : ${dit.join(' · ')}`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LOT STATUT-PAR-MAIL — REGROUPER LES RATTACHEMENTS D'UNE CONVERSATION PAR BIEN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Un rattachement, réduit à ce qu'il faut pour le regrouper. Ce module ne connaît toujours pas la base. */
export interface LienPourRegroupement extends LienPourStatut {
  id: number;
  messageId: number;
  libelle: string;
  cible: { sorte: string; cle?: string | null; id?: number | null };
}

/** Un BIEN, et tous les mails de la conversation qui lui sont rattachés. */
export interface GroupeParBien<T extends LienPourRegroupement> {
  cle: string;
  sorte: string;
  libelle: string;
  /** Combien de MAILS de la conversation portent ce rattachement. C'est le chiffre qui manquait à l'écran. */
  nbMails: number;
  /** Le statut du groupe : « Classé » dès qu'un humain a tranché sur l'un d'eux, « Auto » sinon. */
  statut: CapsuleStatut;
  liens: T[];
}

/**
 * ══ 🔴 REGROUPER PAR BIEN. PUR. ══════════════════════════════════════════════════════════════════════════════════
 *
 * LE DÉFAUT QU'IL CORRIGE, vu par Arno sur le fil 803 : la fenêtre « Rattachements de l'échange » affichait TROIS
 * LIGNES IDENTIQUES — « Lot 445 », « Lot 445 », « Lot 445 » — une par message, sans jamais dire que c'était le même
 * bien vu trois fois. On croyait à un triplon, ou à une erreur.
 *
 * Une ligne par BIEN, donc, avec « sur 3 mails de la conversation » écrit dessus. Le détail par message reste
 * accessible en dépliant : on ne CACHE rien, on cesse simplement de répéter.
 *
 * ⚠️ L'ORDRE EST STABLE ET SIGNIFIANT : d'abord ce qui porte sur le plus de mails (c'est le rattachement principal
 * de la conversation), puis par libellé. Un ordre qui change d'un affichage à l'autre rend une liste illisible.
 */
export function regrouperParBien<T extends LienPourRegroupement>(liens: readonly T[]): GroupeParBien<T>[] {
  const par = new Map<string, GroupeParBien<T>>();
  for (const l of liens) {
    const cle = `${l.cible.sorte}|${l.cible.cle ?? ''}|${l.cible.id ?? 0}`;
    const g = par.get(cle);
    if (g === undefined) {
      par.set(cle, { cle, sorte: l.cible.sorte, libelle: l.libelle, nbMails: 1, statut: 'auto', liens: [l] });
    } else {
      g.liens.push(l);
      // ⚠️ LE NOMBRE DE MAILS, PAS DE LIENS : un mail peut porter deux liens vers le même bien (un hérité d'une
      //    pièce, un posé à la main). Les compter deux fois annoncerait « sur 4 mails » sur une conversation de 3.
      g.nbMails = new Set(g.liens.map((x) => x.messageId)).size;
    }
  }
  for (const g of par.values()) {
    // Le statut du GROUPE suit la même règle que celle d'un mail : le geste humain l'emporte.
    g.statut = g.liens.some((l) => l.statut === 'confirme' && (l.origine === 'manuel' || l.parUnHumain === true))
      ? 'classe'
      : g.liens.some((l) => l.statut === 'confirme') ? 'auto' : 'a_classer';
    g.nbMails = new Set(g.liens.map((x) => x.messageId)).size;
  }
  return [...par.values()].sort((a, b) => b.nbMails - a.nbMails || a.libelle.localeCompare(b.libelle, 'fr'));
}
