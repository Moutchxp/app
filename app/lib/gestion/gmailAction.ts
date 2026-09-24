/**
 * LOT 5-FIDÈLE — EXÉCUTER UNE ACTION SUR LA VRAIE BOÎTE GMAIL. IMPUR, mais TOUT est injecté : base, Gmail, journal.
 * Aucune connexion n'est ouverte par ce fichier — c'est ce qui permet de l'éprouver entièrement sans toucher à Gmail.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 L'ORDRE DES GESTES, et ce que chaque inversion coûterait :
 *   ① le DROIT d'écrire au nom de gestion@, RELU EN BASE → un droit retiré coupe l'action au clic suivant ;
 *   ② la connexion Google → sans jeton, on le DIT et rien d'autre ne bouge ;
 *   ③ retrouver le message DANS Gmail (par `rfc822msgid:`, puis mémorisé) → un message introuvable n'est pas une
 *      panne : il vient d'une autre boîte, ou il a été effacé. On le dit tel quel ;
 *   ④ l'action elle-même, puis le JOURNAL avec l'auteur lu dans la session.
 *
 * 🔴 AUCUNE SUPPRESSION DÉFINITIVE N'EST JAMAIS DEMANDÉE. Les trois actions qui écrivent ne font que poser ou retirer
 * des libellés, ou créer un filtre — trois gestes que l'équipe défait depuis Gmail avec les commandes qu'elle connaît.
 * La portée qui permettrait d'effacer n'est même pas demandée (cf. `PORTEES_GESTION`).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import type { ActionMessage } from './gmailMenu';
import { ecritDansGmail } from './gmailMenu';
import {
  chercherParMessageId, LIBELLE_NON_LU, LIBELLE_RECEPTION, LIBELLE_SPAM, lireMessageGmail, modifierLibelles,
  type MessageGmail,
} from './google';
import type { AncrageGmail } from './gmailRepo';

/** La phrase montrée quand la connexion Google n'est pas faite. Une seule formulation, partout. */
export const MENTION_SANS_CONNEXION =
  'Connexion Google de gestion@ pas encore faite — voir docs/GUIDE_CONNEXION_GOOGLE_GESTION.md';

/** La phrase montrée quand le message n'existe pas (ou plus) dans la boîte Gmail. Ce n'est PAS une panne. */
export const MENTION_INTROUVABLE =
  'Ce message n’a pas été retrouvé dans la boîte Gmail de gestion@ (il vient peut-être d’ailleurs, ou il y a été effacé).';

export interface DepsActionGmail {
  /** ① Le droit d'écrire au nom de gestion@, relu EN BASE. */
  peutEcrire(): Promise<boolean>;
  /** ② Un jeton d'accès valide, ou `null` si la connexion n'est pas faite. */
  jetonAcces(): Promise<string | null>;
  /** ③ Ce qu'on sait du message chez nous. */
  ancrage(): Promise<AncrageGmail | null>;
  /** Mémorise la correspondance une fois trouvée (sans effet si la migration 242 n'est pas passée). */
  memoriser(gmail: { id: string; threadId: string }): Promise<void>;
  /** Appels Gmail, tous injectés. */
  chercher(accessToken: string, messageIdRfc: string): ReturnType<typeof chercherParMessageId>;
  lire(accessToken: string, id: string): ReturnType<typeof lireMessageGmail>;
  modifier(accessToken: string, id: string, o: { ajouter?: string[]; retirer?: string[] }): ReturnType<typeof modifierLibelles>;
  bloquer(accessToken: string, adresse: string): Promise<{ ok: true; valeur: string } | { ok: false; motif: string }>;
  /** ④ Le journal MÉTIER : qui, quoi, sur quel message. */
  journaliser(l: { action: ActionMessage; messageId: number; detail: string }): Promise<void>;
}

export type IssueAction =
  | { ok: true; message: string; etat?: EtatGmail }
  | { ok: false; motif: string; code: 'droit' | 'sans_jeton' | 'introuvable' | 'refus_gmail' };

/** L'état VRAI d'un message dans Gmail, relu à chaque fois — jamais recopié en base (il change sous nos pieds). */
export interface EtatGmail {
  gmailMessageId: string;
  gmailThreadId: string;
  etoile: boolean;
  nonLu: boolean;
}

function etatDe(m: MessageGmail): EtatGmail {
  return {
    gmailMessageId: m.id, gmailThreadId: m.threadId,
    etoile: m.libelles.includes('STARRED'),
    nonLu: m.libelles.includes(LIBELLE_NON_LU),
  };
}

/**
 * RETROUVE le message dans Gmail, et mémorise la correspondance. C'est l'étape ③, isolée parce que TOUTES les actions
 * Gmail en dépendent — y compris la simple lecture de l'étoile à l'ouverture de la conversation.
 */
async function retrouver(
  jeton: string, ancrage: AncrageGmail, deps: DepsActionGmail,
): Promise<{ ok: true; gmail: MessageGmail } | { ok: false; motif: string; code: 'introuvable' | 'refus_gmail' }> {
  // Déjà connu : on relit son état, parce que les libellés, eux, ne se mémorisent jamais.
  if (ancrage.gmailMessageId) {
    const lu = await deps.lire(jeton, ancrage.gmailMessageId);
    if (lu.ok) return { ok: true, gmail: lu.valeur };
    // L'identifiant mémorisé ne vaut plus rien (message déplacé hors de la boîte, purgé) : on recherche à nouveau.
  }
  const trouve = await deps.chercher(jeton, ancrage.messageIdRfc);
  if (!trouve.ok) return { ok: false, code: 'refus_gmail', motif: trouve.motif };
  if (trouve.valeur === null) return { ok: false, code: 'introuvable', motif: MENTION_INTROUVABLE };
  await deps.memoriser({ id: trouve.valeur.id, threadId: trouve.valeur.threadId });
  // La recherche ne rend pas les libellés : on relit pour connaître l'étoile et le non-lu.
  const lu = await deps.lire(jeton, trouve.valeur.id);
  return lu.ok ? { ok: true, gmail: lu.valeur } : { ok: false, code: 'refus_gmail', motif: lu.motif };
}

/**
 * LIT l'état Gmail d'un message — l'étoile et le non-lu affichés dans l'en-tête. LECTURE SEULE : aucun droit
 * d'écriture exigé, parce que regarder n'est pas agir. Sans jeton, on rend `null` et l'écran n'affiche simplement pas
 * ces deux marques : il ne prétend pas qu'elles sont éteintes.
 */
export async function lireEtatGmail(deps: DepsActionGmail): Promise<EtatGmail | null> {
  const jeton = await deps.jetonAcces();
  if (jeton === null) return null;
  const ancrage = await deps.ancrage();
  if (ancrage === null) return null;
  const r = await retrouver(jeton, ancrage, deps);
  return r.ok ? etatDe(r.gmail) : null;
}

/**
 * EXÉCUTE une action qui modifie Gmail. Les actions qui n'écrivent pas (liens, impression, recherche) ne passent PAS
 * par ici : elles sont rendues par l'écran, qui n'a besoin de rien demander à personne.
 */
export async function agirSurGmail(
  action: ActionMessage, messageId: number, deps: DepsActionGmail,
): Promise<IssueAction> {
  if (!ecritDansGmail(action) && action !== 'telecharger' && action !== 'afficher_original') {
    return { ok: false, code: 'refus_gmail', motif: 'Cette action ne se fait pas depuis ici.' };
  }
  // ① LE DROIT. Une action qui change la boîte de l'équipe n'est pas une lecture.
  if (ecritDansGmail(action) && !await deps.peutEcrire()) {
    return { ok: false, code: 'droit', motif: 'Vous n’avez pas le droit d’agir sur la boîte de gestion@.' };
  }
  // ② LA CONNEXION.
  const jeton = await deps.jetonAcces();
  if (jeton === null) return { ok: false, code: 'sans_jeton', motif: MENTION_SANS_CONNEXION };
  // ③ LE MESSAGE, DANS GMAIL.
  const ancrage = await deps.ancrage();
  if (ancrage === null) return { ok: false, code: 'introuvable', motif: MENTION_INTROUVABLE };
  const trouve = await retrouver(jeton, ancrage, deps);
  if (!trouve.ok) return { ok: false, code: trouve.code, motif: trouve.motif };

  // ④ L'ACTION.
  if (action === 'non_lu') {
    const r = await deps.modifier(jeton, trouve.gmail.id, { ajouter: [LIBELLE_NON_LU] });
    if (!r.ok) return { ok: false, code: 'refus_gmail', motif: r.motif };
    await deps.journaliser({ action, messageId, detail: 'marqué non lu dans Gmail' });
    return { ok: true, message: 'Marqué comme non lu dans Gmail.', etat: etatDe(r.valeur) };
  }
  if (action === 'spam') {
    const r = await deps.modifier(jeton, trouve.gmail.id, { ajouter: [LIBELLE_SPAM], retirer: [LIBELLE_RECEPTION] });
    if (!r.ok) return { ok: false, code: 'refus_gmail', motif: r.motif };
    await deps.journaliser({ action, messageId, detail: 'signalé comme spam dans Gmail' });
    return { ok: true, message: 'Signalé comme spam dans Gmail. Le geste se défait depuis Gmail.', etat: etatDe(r.valeur) };
  }
  if (action === 'bloquer') {
    const r = await deps.bloquer(jeton, ancrage.de);
    if (!r.ok) return { ok: false, code: 'refus_gmail', motif: r.motif };
    await deps.journaliser({ action, messageId, detail: `expéditeur bloqué dans Gmail : ${ancrage.de}` });
    return {
      ok: true,
      message: `« ${ancrage.deNom ?? ancrage.de} » est bloqué : ses prochains messages iront dans les indésirables. `
        + 'Le blocage se retire dans Gmail (Paramètres → Filtres et adresses bloquées).',
    };
  }
  // `telecharger` et `afficher_original` : le message a été retrouvé, la route sert l'original elle-même.
  return { ok: true, message: 'Message retrouvé dans Gmail.', etat: etatDe(trouve.gmail) };
}

/**
 * BASCULE l'étoile. À part des autres parce que c'est le geste le plus fréquent, et le seul qui doit connaître l'état
 * d'AVANT pour décider : on pose l'étoile si elle n'y est pas, on la retire si elle y est — exactement comme le clic
 * de Gmail, qui bascule.
 */
export async function basculerEtoile(messageId: number, deps: DepsActionGmail): Promise<IssueAction> {
  if (!await deps.peutEcrire()) {
    return { ok: false, code: 'droit', motif: 'Vous n’avez pas le droit d’agir sur la boîte de gestion@.' };
  }
  const jeton = await deps.jetonAcces();
  if (jeton === null) return { ok: false, code: 'sans_jeton', motif: MENTION_SANS_CONNEXION };
  const ancrage = await deps.ancrage();
  if (ancrage === null) return { ok: false, code: 'introuvable', motif: MENTION_INTROUVABLE };
  const trouve = await retrouver(jeton, ancrage, deps);
  if (!trouve.ok) return { ok: false, code: trouve.code, motif: trouve.motif };

  const avait = trouve.gmail.libelles.includes('STARRED');
  const r = await deps.modifier(jeton, trouve.gmail.id,
    avait ? { retirer: ['STARRED'] } : { ajouter: ['STARRED'] });
  if (!r.ok) return { ok: false, code: 'refus_gmail', motif: r.motif };
  await deps.journaliser({
    action: 'non_lu', messageId, // le journal porte l'entité, le DÉTAIL dit le geste exact
    detail: avait ? 'étoile retirée dans Gmail' : 'étoile ajoutée dans Gmail',
  });
  return { ok: true, message: avait ? 'Étoile retirée dans Gmail.' : 'Étoile ajoutée dans Gmail.', etat: etatDe(r.valeur) };
}
