/**
 * MODULE « GESTION » — LOT STATUT-PAR-MAIL : CE QUE « VALIDER LE CLASSEMENT » FAIT, EXACTEMENT. PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI UN MODULE PUR POUR ÇA. Valider un classement, c'est poser des rattachements sur PLUSIEURS mails et en
 * retirer d'autres. Ce calcul-là — qui poser, où, et surtout QUOI NE PAS TOUCHER — ne doit pas vivre dans un
 * composant : on ne peut pas l'éprouver sans écran, et c'est le genre de calcul qui, mal fait, écrit sur des mails
 * qu'on ne regardait pas.
 *
 * Aucun import, aucune base, aucun React : on rejoue ici la conversation d'Arno (fil 803, trois mails, un bien) et
 * les cas tordus (propriétaire à plusieurs biens, décochage, portée élargie) sans rien brancher.
 *
 * 🔴 LA PORTÉE « TOUTE LA CONVERSATION » N'AJOUTE QUE. Elle POSE le même rattachement sur les mails de l'échange qui
 * n'ont pas de classement manuel — elle ne RETIRE jamais rien sur eux. Retirer en masse était l'autre lecture
 * possible ; elle est exclue, parce qu'un décochage fait pour UN mail effacerait alors le travail de quelqu'un sur
 * onze autres, sans que l'écran l'ait annoncé. Le retrait reste donc le geste du mail qu'on a sous les yeux.
 *
 * 🔴 UN RETRAIT N'EST PAS UNE SUPPRESSION : le plan rend des identifiants de liens à passer au statut « retiré »
 * (`PATCH`), jamais à effacer. C'est la règle du lot RATTACHEMENT-1, et elle ne se rediscute pas ici.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Le choix de portée. « Ce mail uniquement » est le DÉFAUT : le geste le plus étroit est le moins regrettable. */
export type PorteeClassement = 'mail' | 'conversation';

/** Un rattachement CONFIRMÉ déjà posé vers un bien, tel que l'écran l'a lu. */
export interface LienExistant {
  id: number;
  messageId: number;
  /** La clé WIPPIMMO du bien. C'est l'identité qui survit à un ré-import de l'annuaire. */
  cle: string;
}

/**
 * 🔴 LOT STATUT-HORS-GESTION — LE GESTE DEMANDÉ SUR LA MARQUE « hors gestion ».
 *
 * `marquer` = ce mail ne concerne aucun bien ; `annuler` = il revient dans la file. Les deux sont des décisions
 * HUMAINES : ce module ne les déduit jamais de l'état, il ne fait qu'exécuter ce que l'écran a demandé.
 */
export type GesteHorsGestion = { geste: 'marquer'; motif?: string | null } | { geste: 'annuler' };

export interface PlanClassement {
  /** Les mails que la validation va toucher, dans l'ordre, sans doublon. */
  messages: number[];
  /** Les rattachements à POSER : un `POST` par entrée, qui vaut aussi confirmation d'une proposition déjà là. */
  aPoser: { messageId: number; cle: string }[];
  /** Les liens à faire passer au statut « retiré » (`PATCH`). JAMAIS une suppression. */
  aRetirer: number[];
  /** Les mails à MARQUER hors gestion (`POST`). Vide quand ce n'est pas le geste demandé. */
  aMarquerHorsGestion: number[];
  /** Les mails dont la marque est à ANNULER (`DELETE`, qui écrit `retire_le` — la ligne reste). */
  aAnnulerHorsGestion: number[];
  /** Le motif retenu pour le marquage, ou `null` : il est FACULTATIF. */
  motifHorsGestion: string | null;
  /** Ce que l'écran annonce AVANT de valider, et confirme après. Phrase complète, jamais un chiffre nu. */
  resume: string;
}

/** Les mails visés par la portée choisie. Le mail ouvert en fait TOUJOURS partie : c'est celui qu'on classe. PUR. */
export function mailsVises(
  messageId: number, portee: PorteeClassement, mailsSansManuel: readonly number[],
): number[] {
  if (portee === 'mail') return [messageId];
  // Le `Set` avant le tri : le mail ouvert figure déjà, la plupart du temps, dans la liste des mails sans manuel.
  return [...new Set([messageId, ...mailsSansManuel])].sort((a, b) => a - b);
}

/**
 * LE PLAN D'UNE VALIDATION. PUR — aucune écriture, aucun effet : il DÉCRIT ce qui sera fait.
 *
 * ⚠️ ON NE REPOSE PAS CE QUI EST DÉJÀ POSÉ. Le `POST` de rattachement est idempotent (il confirme au lieu de créer
 * un doublon), mais chaque appel écrit une ligne de journal : reposer les trois mêmes liens à chaque ouverture de la
 * fenêtre remplirait l'historique d'un bruit qui cacherait les vrais gestes.
 */
export function planClassement(o: {
  messageId: number;
  portee: PorteeClassement;
  mailsSansManuel: readonly number[];
  /** Les biens COCHÉS, par clé WIPPIMMO. Vide = on ne pose rien (et on retire ce qui était là, sur ce mail). */
  selection: readonly string[];
  /** Les liens confirmés vers un bien, sur les mails concernés, tels que lus avant la validation. */
  existants: readonly LienExistant[];
  /**
   * 🔴 LE GESTE « HORS GESTION » DEMANDÉ, quand c'en est un. `marquer` IGNORE la sélection de biens : les deux
   * réponses s'excluent — un mail qui concerne un bien n'est pas hors gestion, et réciproquement.
   */
  horsGestion?: GesteHorsGestion | null;
  /** Les mails qui portent DÉJÀ une marque vivante. Sert à ne compter que ce qui change réellement. */
  dejaHorsGestion?: readonly number[];
}): PlanClassement {
  const messages = mailsVises(o.messageId, o.portee, o.mailsSansManuel);
  const deja = new Set(o.dejaHorsGestion ?? []);
  const hg = o.horsGestion ?? null;

  /**
   * ══ 🔴 CAS « MARQUER HORS GESTION » ══════════════════════════════════════════════════════════════════════════
   * La sélection de biens n'est pas lue : dire « ce mail ne concerne aucun bien » ET cocher un bien serait une
   * contradiction que l'écran ne doit pas pouvoir enregistrer. Les rattachements du mail ouvert sont donc RETIRÉS
   * (statut « retiré », jamais supprimés) — et, là encore, seulement ceux du mail qu'on a sous les yeux.
   */
  if (hg?.geste === 'marquer') {
    const aRetirer = o.existants.filter((l) => l.messageId === o.messageId).map((l) => l.id);
    const aMarquer = messages.filter((m) => !deja.has(m));
    return {
      messages, aPoser: [], aRetirer, aMarquerHorsGestion: aMarquer, aAnnulerHorsGestion: [],
      motifHorsGestion: hg.motif ?? null,
      resume: resumeHorsGestion('marquer', aMarquer.length, hg.motif ?? null, aRetirer.length),
    };
  }

  /** ══ CAS « ANNULER HORS GESTION » — le mail revient dans la file, rien d'autre ne bouge. ═══════════════════ */
  if (hg?.geste === 'annuler') {
    const aAnnuler = messages.filter((m) => deja.has(m));
    return {
      messages, aPoser: [], aRetirer: [], aMarquerHorsGestion: [], aAnnulerHorsGestion: aAnnuler,
      motifHorsGestion: null,
      resume: resumeHorsGestion('annuler', aAnnuler.length, null, 0),
    };
  }

  const voulues = [...new Set(o.selection.map((c) => c.trim()).filter((c) => c !== ''))];

  const dejaLa = new Set(o.existants.map((l) => `${l.messageId}|${l.cle}`));
  const aPoser: { messageId: number; cle: string }[] = [];
  for (const m of messages) {
    for (const cle of voulues) if (!dejaLa.has(`${m}|${cle}`)) aPoser.push({ messageId: m, cle });
  }

  /**
   * 🔴 LE RETRAIT NE PORTE QUE SUR LE MAIL OUVERT — voir l'en-tête du fichier. Décocher un bien ici ne doit pas
   * défaire le classement de onze autres mails que la fenêtre n'a pas montrés.
   */
  const aRetirer = o.existants
    .filter((l) => l.messageId === o.messageId && !voulues.includes(l.cle))
    .map((l) => l.id);

  /**
   * 🔴 RATTACHER UN BIEN LÈVE LA MARQUE « HORS GESTION » — la réversibilité par le geste naturel : on ne doit pas
   * avoir à annuler d'abord pour pouvoir classer ensuite. Le serveur la lève aussi de son côté (`rattacher`) ; on
   * la demande ici pour que la phrase du résumé le DISE avant de valider, et pour les mails que le serveur ne voit
   * pas passer (un bien déjà posé sur l'un d'eux).
   */
  const aAnnulerHorsGestion = voulues.length === 0 ? [] : messages.filter((m) => deja.has(m));

  return {
    messages, aPoser, aRetirer, aMarquerHorsGestion: [], aAnnulerHorsGestion, motifHorsGestion: null,
    resume: resumeClassement(messages.length, voulues.length, aRetirer.length, aAnnulerHorsGestion.length),
  };
}

/**
 * LA PHRASE QUE L'ÉCRAN AFFICHE. PUR.
 *
 * ⚠️ LE MOT EST TOUJOURS ÉCRIT, ET AU PLURIEL JUSTE : « 3 mails classés », demandé tel quel par Arno. Un « 3 » nu
 * ne dit pas ce qui a été compté, et « 1 mails » se lit comme un bogue — donc on ne fait confiance à personne pour
 * accorder à la main.
 */
export function resumeClassement(
  nbMails: number, nbBiens: number, nbRetraits: number, nbMarquesLevees = 0,
): string {
  if (nbBiens === 0 && nbRetraits === 0) return 'Aucun bien sélectionné : rien ne sera classé.';
  const morceaux: string[] = [];
  if (nbBiens > 0) {
    morceaux.push(`${nbMails} mail${nbMails > 1 ? 's' : ''} classé${nbMails > 1 ? 's' : ''}`
      + ` sur ${nbBiens} bien${nbBiens > 1 ? 's' : ''}`);
  }
  if (nbRetraits > 0) {
    morceaux.push(`${nbRetraits} rattachement${nbRetraits > 1 ? 's' : ''} retiré${nbRetraits > 1 ? 's' : ''}`);
  }
  // 🔴 ON LE DIT AVANT DE LE FAIRE : la marque grise disparaît, et c'est une conséquence, pas un effet de bord muet.
  if (nbMarquesLevees === 1) morceaux.push('marque « hors gestion » levée');
  else if (nbMarquesLevees > 1) morceaux.push(`${nbMarquesLevees} marques « hors gestion » levées`);
  return `${morceaux.join(', ')}.`;
}

/**
 * 🔴 LA PHRASE D'UN GESTE « HORS GESTION ». PUR.
 *
 * ⚠️ LE MOTIF EST DIT QUAND IL Y EN A UN, et jamais inventé quand il n'y en a pas. Il reste FACULTATIF : exiger une
 * justification ferait cocher n'importe laquelle, et le motif ne voudrait plus rien dire.
 *
 * ⚠️ LE CAS « RIEN À FAIRE » EST ÉCRIT, JAMAIS LAISSÉ VIDE. Marquer hors gestion trois mails qui le sont déjà ne
 * change rien : le dire évite de croire qu'on vient d'agir.
 */
export function resumeHorsGestion(
  geste: 'marquer' | 'annuler', nbMails: number, motif: string | null, nbRetraits = 0,
): string {
  if (geste === 'annuler') {
    return nbMails === 0
      ? 'Aucun de ces mails n’est marqué « hors gestion » : rien à annuler.'
      : `${nbMails} mail${nbMails > 1 ? 's' : ''} ne ${nbMails > 1 ? 'sont' : 'sera'} plus « hors gestion »`
        + ` : ${nbMails > 1 ? 'ils reviennent' : 'il revient'} dans la file.`;
  }
  if (nbMails === 0 && nbRetraits === 0) return 'Ces mails sont déjà marqués « hors gestion » : rien à faire.';
  const morceaux: string[] = [];
  if (nbMails > 0) {
    morceaux.push(`${nbMails} mail${nbMails > 1 ? 's' : ''} marqué${nbMails > 1 ? 's' : ''} « hors gestion »`
      + (motif === null ? '' : ` (${motif})`));
  }
  if (nbRetraits > 0) {
    morceaux.push(`${nbRetraits} rattachement${nbRetraits > 1 ? 's' : ''} retiré${nbRetraits > 1 ? 's' : ''}`);
  }
  return `${morceaux.join(', ')}.`;
}
