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

export interface PlanClassement {
  /** Les mails que la validation va toucher, dans l'ordre, sans doublon. */
  messages: number[];
  /** Les rattachements à POSER : un `POST` par entrée, qui vaut aussi confirmation d'une proposition déjà là. */
  aPoser: { messageId: number; cle: string }[];
  /** Les liens à faire passer au statut « retiré » (`PATCH`). JAMAIS une suppression. */
  aRetirer: number[];
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
}): PlanClassement {
  const messages = mailsVises(o.messageId, o.portee, o.mailsSansManuel);
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

  return { messages, aPoser, aRetirer, resume: resumeClassement(messages.length, voulues.length, aRetirer.length) };
}

/**
 * LA PHRASE QUE L'ÉCRAN AFFICHE. PUR.
 *
 * ⚠️ LE MOT EST TOUJOURS ÉCRIT, ET AU PLURIEL JUSTE : « 3 mails classés », demandé tel quel par Arno. Un « 3 » nu
 * ne dit pas ce qui a été compté, et « 1 mails » se lit comme un bogue — donc on ne fait confiance à personne pour
 * accorder à la main.
 */
export function resumeClassement(nbMails: number, nbBiens: number, nbRetraits: number): string {
  if (nbBiens === 0 && nbRetraits === 0) return 'Aucun bien sélectionné : rien ne sera classé.';
  const morceaux: string[] = [];
  if (nbBiens > 0) {
    morceaux.push(`${nbMails} mail${nbMails > 1 ? 's' : ''} classé${nbMails > 1 ? 's' : ''}`
      + ` sur ${nbBiens} bien${nbBiens > 1 ? 's' : ''}`);
  }
  if (nbRetraits > 0) {
    morceaux.push(`${nbRetraits} rattachement${nbRetraits > 1 ? 's' : ''} retiré${nbRetraits > 1 ? 's' : ''}`);
  }
  return `${morceaux.join(', ')}.`;
}
