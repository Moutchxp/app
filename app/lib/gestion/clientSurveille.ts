/**
 * MODULE « GESTION » — LOT 3-ter : SURVEILLANCE DE LA CONNEXION. Module PUR (aucune I/O, aucun imapflow).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE — deux défauts MESURÉS, pas supposés :
 *
 * ① UN INCIDENT RÉSEAU TUAIT LE PROCESSUS. `ImapFlow.emitError` fait `this.emit('error', err)` SANS vérifier qu'un
 *    écouteur existe (node_modules/imapflow/lib/imap-flow.js:509). Or un EventEmitter Node qui émet « error » sans
 *    écouteur JETTE, et le processus meurt. `app/lib/email/imap.ts` n'attachait AUCUN écouteur — ni pour la gestion, ni
 *    pour le module Permis, ni pour la sonde : tous étaient exposés, la sonde n'a simplement jamais rencontré de panne.
 *    Le déclencheur observé : `socket.setTimeout(socketTimeout)` avec 5 MINUTES par défaut (imap-flow.js:55, :325,
 *    :1235) — c'est un délai d'INACTIVITÉ du socket ; hors IDLE, il appelle `emitError` immédiatement (:1286-1287).
 *
 * ② UNE CONNEXION MORTE PASSAIT POUR UN SUCCÈS. La capture isole chaque message illisible pour qu'un MIME cassé ne
 *    fasse pas perdre les autres. Mais quand c'est la CONNEXION qui tombe, tous les messages suivants échouent : mesuré
 *    sur 400 messages avec une coupure au 4ᵉ, la passe rendait « 3 capturés, 397 illisibles » — un rapport d'allure
 *    normale, sans aucun signal d'échec. C'est le pire des deux défauts : le premier fait du bruit, celui-ci ment.
 *
 * LA DISTINCTION QUE CE FICHIER INTRODUIT, et qui répare les deux : une panne de MESSAGE (on continue) n'est pas une
 * panne de CONNEXION (on s'arrête). Sans elle, aucun compteur ne peut être cru.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Contrat d'accès à la boîte, tel que la gestion l'utilise (satisfait par `creerClientApprofondi`, imap.ts). */
export interface ClientDossier {
  ouvrir(): Promise<void>;
  ouvrirBoite(chemin: string): Promise<void>;
  chercher(criteres: { depuis: Date; from?: string }): Promise<number[]>;
  telechargerMessage(uid: number): Promise<{
    uid: number; recuLe: Date; deNom: string | null;
    message: { messageId: string; inReplyTo?: string; references?: string[]; deAdresse: string; objet?: string; corpsTexte?: string; corpsHtml?: string; entetes: Record<string, string> };
    pieces: { nomFichier: string; typeMime: string | null; tailleOctets: number | null; contenu: Buffer }[];
  }>;
  fermer(): Promise<void>;
}

/**
 * La connexion à la boîte est tombée. DISTINCTE d'une erreur de message : celle-ci ARRÊTE la passe, là où un message
 * illisible la laisse continuer. Tout ce qui a été capturé avant reste acquis — chaque message est écrit au fil de l'eau.
 */
export class ErreurConnexion extends Error {
  constructor(message: string, readonly origine?: unknown) {
    super(message);
    this.name = 'ErreurConnexion';
  }
}

/** Ce que l'écouteur d'erreur retient. Un objet, pas une variable : il est partagé entre l'écouteur et l'enveloppe. */
export interface EtatConnexion { erreur: Error | null }

export function nouvelEtat(): EtatConnexion {
  return { erreur: null };
}

/**
 * L'ÉCOUTEUR à donner au client IMAP. Sa seule présence suffit à empêcher Node de tuer le processus ; il retient en plus
 * l'erreur, pour que le message rendu à l'écran nomme la vraie cause (« Socket timeout ») et pas un symptôme vague.
 */
export function noterErreur(etat: EtatConnexion): (e: Error) => void {
  return (e) => { if (etat.erreur === null) etat.erreur = e; }; // la PREMIÈRE erreur est la cause ; les suivantes en découlent
}

/**
 * ENVELOPPE un client : chaque appel échoue VITE et CLAIREMENT si la connexion est tombée.
 *
 * Deux moments, parce qu'un incident réseau se manifeste de deux façons :
 *   · AVANT l'appel — l'événement « error » est arrivé pendant qu'on travaillait hors réseau ; inutile de demander au
 *     serveur, il n'est plus là ;
 *   · APRÈS un rejet — l'appel a échoué ET une erreur de connexion a été notée : c'est ELLE qu'on rapporte, parce
 *     qu'« impossible de lire le message 412 » cache la vraie cause, qui est « la connexion a expiré ».
 * Un rejet SANS erreur de connexion notée est rendu TEL QUEL : c'est un message illisible, la passe doit continuer.
 */
export function surveiller(client: ClientDossier, etat: EtatConnexion): ClientDossier {
  // ⚠️ L'erreur est relue par APPEL DE FONCTION, jamais par accès direct : `etat` est muté de l'EXTÉRIEUR (par l'écouteur,
  //   au moment où le réseau tombe). Un accès direct laisserait TypeScript conclure, après le test du haut, que le champ
  //   reste nul pour toute la suite — et le test d'après l'échec serait supprimé à la compilation.
  const relire = (): Error | null => etat.erreur;
  const garde = async <T>(quoi: string, appel: () => Promise<T>): Promise<T> => {
    const avant = relire();
    if (avant !== null) throw new ErreurConnexion(`connexion à la boîte perdue avant ${quoi} : ${avant.message}`, avant);
    try {
      return await appel();
    } catch (e) {
      const pendant = relire();
      if (pendant !== null) throw new ErreurConnexion(`connexion à la boîte perdue pendant ${quoi} : ${pendant.message}`, pendant);
      throw e; // panne de MESSAGE : l'appelant décide (la capture la compte « illisible » et continue)
    }
  };
  return {
    ouvrir: () => garde('la connexion', () => client.ouvrir()),
    ouvrirBoite: (chemin) => garde(`l'ouverture du dossier « ${chemin} »`, () => client.ouvrirBoite(chemin)),
    chercher: (criteres) => garde('la recherche des messages', () => client.chercher(criteres)),
    telechargerMessage: (uid) => garde(`la lecture du message ${uid}`, () => client.telechargerMessage(uid)),
    // La FERMETURE ne garde rien : refermer une connexion déjà tombée doit rester silencieux, sinon l'erreur de
    //   fermeture masquerait la vraie cause dans le `finally` de la passe.
    fermer: () => client.fermer(),
  };
}
