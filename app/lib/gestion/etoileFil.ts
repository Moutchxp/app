import type { AncrageGmail } from './gmailRepo';
import { LIBELLE_ETOILE, type MessageGmail, type Resultat } from './google';

/**
 * LOT ETOILE-ET-SIGNATURE — L'ÉTOILE D'UN ÉCHANGE, DANS GMAIL. IMPUR, mais TOUT est injecté : base, Gmail, journal.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE FAIT LE CLIC SUR L'ÉTOILE D'UNE LIGNE, ET POURQUOI CE N'EST PAS SYMÉTRIQUE.
 *
 * C'est le comportement de Gmail, repris tel quel — et il a de bonnes raisons d'être asymétrique :
 *
 *   · POSER  → sur LE MESSAGE que la ligne montre, et lui seul. Étoiler les douze messages d'un échange pour un
 *     clic rendrait la chose impossible à défaire message par message, et remplirait « Suivis » de bruit.
 *   · RETIRER → sur TOUS les messages étoilés de l'échange. Sinon l'échange resterait dans le filtre après qu'on
 *     a cliqué pour l'en sortir : le geste aurait l'air de n'avoir rien fait. C'est exactement le défaut qu'Arno a
 *     constaté dans l'autre sens, et il ne serait pas moins déroutant ici.
 *
 * 🔴 GMAIL D'ABORD, NOTRE COLONNE ENSUITE. `etoile_le` est un MIROIR : on n'y écrit qu'un fait que Gmail a
 * confirmé. L'ordre inverse ferait de notre base une seconde vérité — celle qui se trompe quand Gmail refuse.
 *
 * 🔴 ET UN ÉCHEC PARTIEL SE DIT. Retirer l'étoile de trois messages dont un seul échoue laisse l'échange dans le
 * filtre : on rend alors le nombre de réussites ET le motif, plutôt qu'un « c'est fait » qui serait faux.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Un message de l'échange, tel que la base le connaît. Le `Message-ID` RFC est le pont vers Gmail. */
export interface MessageDuFil {
  messageId: number;
  messageIdRfc: string;
}

export interface DepsEtoileFil {
  /** ① Le droit d'écrire au nom de gestion@, relu EN BASE. */
  peutEcrire(): Promise<boolean>;
  /** ② Un jeton d'accès valide, ou `null` si la connexion n'est pas faite. */
  jetonAcces(): Promise<string | null>;
  /** ③ Le message le plus récent de l'échange — celui que la ligne montre. `null` = échange vide ou inconnu. */
  dernierMessage(filId: number): Promise<MessageDuFil | null>;
  /** ③ bis Ceux que notre miroir tient pour étoilés, du plus récent au plus ancien. */
  messagesEtoiles(filId: number): Promise<MessageDuFil[]>;
  /** ④ Le pont vers Gmail, message par message. */
  ancrage(messageId: number): Promise<AncrageGmail | null>;
  memoriser(messageId: number, g: { id: string; threadId: string }): Promise<void>;
  chercher(accessToken: string, messageIdRfc: string): Promise<Resultat<{ id: string; threadId: string } | null>>;
  modifier(
    accessToken: string, id: string, o: { ajouter?: string[]; retirer?: string[] },
  ): Promise<Resultat<MessageGmail>>;
  /** ⑤ Le miroir local, écrit APRÈS Gmail. */
  noter(messageId: number, etoilee: boolean): Promise<void>;
  /** ⑥ Le journal MÉTIER. */
  journaliser(l: { filId: number; etoilee: boolean; touches: number }): Promise<void>;
}

export type IssueEtoileFil =
  | { ok: true; etoilee: boolean; touches: number }
  | { ok: false; motif: string; code: 'droit' | 'sans_jeton' | 'introuvable' | 'refus_gmail' };

export const MENTION_SANS_MESSAGE =
  'Cet échange ne porte aucun message que nous sachions retrouver dans Gmail.';

/**
 * RETROUVE l'identifiant Gmail d'un de NOS messages, et le mémorise. Rendu séparément parce que les deux sens du
 * geste en ont besoin, et parce que c'est le seul endroit où l'on parle à Gmail pour identifier plutôt qu'agir.
 */
async function idGmailDe(
  jeton: string, m: MessageDuFil, deps: DepsEtoileFil,
): Promise<string | null> {
  const ancrage = await deps.ancrage(m.messageId);
  if (ancrage?.gmailMessageId) return ancrage.gmailMessageId;
  const trouve = await deps.chercher(jeton, m.messageIdRfc);
  if (!trouve.ok || trouve.valeur === null) return null;
  await deps.memoriser(m.messageId, trouve.valeur);
  return trouve.valeur.id;
}

/** POSE OU RETIRE L'ÉTOILE SUR UN ÉCHANGE, dans Gmail, puis dans notre miroir. */
export async function basculerEtoileDuFil(
  filId: number, etoilee: boolean, deps: DepsEtoileFil,
): Promise<IssueEtoileFil> {
  if (!await deps.peutEcrire()) {
    return { ok: false, code: 'droit', motif: 'Vous n’avez pas le droit d’agir sur la boîte de gestion@.' };
  }
  const jeton = await deps.jetonAcces();
  if (jeton === null) {
    return {
      ok: false, code: 'sans_jeton',
      motif: 'Connexion Google de gestion@ pas encore faite — l’étoile vit dans Gmail, elle ne se pose pas sans lui.',
    };
  }

  /**
   * ⚠️ LA LISTE DES CIBLES DÉPEND DU SENS, et c'est tout le propos de ce module (voir l'encadré du haut) : un
   * message à poser, tous les étoilés à retirer.
   */
  const cibles = etoilee
    ? [await deps.dernierMessage(filId)].filter((m): m is MessageDuFil => m !== null)
    : await deps.messagesEtoiles(filId);
  if (cibles.length === 0) {
    /**
     * 🔴 RETIRER CE QUI N'EST PAS LÀ EST UN SUCCÈS, pas une erreur. Notre miroir peut avoir un cran de retard sur
     * Gmail (étoile décrochée depuis un téléphone) : répondre « introuvable » ferait croire à une panne alors que
     * l'état voulu est déjà l'état vrai.
     */
    if (!etoilee) return { ok: true, etoilee: false, touches: 0 };
    return { ok: false, code: 'introuvable', motif: MENTION_SANS_MESSAGE };
  }

  let touches = 0;
  let dernierMotif: string | null = null;
  for (const m of cibles) {
    const id = await idGmailDe(jeton, m, deps);
    if (id === null) { dernierMotif = MENTION_SANS_MESSAGE; continue; }
    const r = await deps.modifier(jeton, id,
      etoilee ? { ajouter: [LIBELLE_ETOILE] } : { retirer: [LIBELLE_ETOILE] });
    if (!r.ok) { dernierMotif = r.motif; continue; }
    await deps.noter(m.messageId, etoilee);
    touches += 1;
  }

  // 🔴 AUCUNE RÉUSSITE ⇒ ON LE DIT. Un « c'est fait » sur zéro message serait un mensonge que l'écran répéterait.
  if (touches === 0) {
    return { ok: false, code: 'refus_gmail', motif: dernierMotif ?? MENTION_SANS_MESSAGE };
  }
  await deps.journaliser({ filId, etoilee, touches });
  return { ok: true, etoilee, touches };
}
