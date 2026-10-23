import type { MessageBrut, MessageAEcrire, FilResolu, PieceBrute } from './capture';
import { preparerMessage } from './capture';
import type { ConfigGestion } from './config';
import { cleDuFil, identifiantsMessage, pourComparaison } from './fil';
import type { RegleExclusion } from './regles';

/**
 * ══ 🔴🔴 UN MAIL ENVOYÉ DEPUIS L'APPLICATION ENTRE TOUT DE SUITE DANS « ENVOYÉS » (Arno, 23/10/2026) ═════════════════════════════
 *
 * CONSTAT D'ARNO (prod) : un mail envoyé à 22 h 10 n'était pas dans « Envoyés » cinq minutes plus tard. CE QUI SE PASSAIT : rien
 * n'écrivait le message envoyé en base au moment de l'envoi. « Envoyés » se lit dans `gestion_message` (sens `envoye`), et ce
 * message n'y entrait qu'à la RELÈVE suivante (IMAP, libellé de gestion) — avec, ensuite seulement, ses rattachements demandés
 * (`appliquer…EnAttente`). Une relève lente, arrêtée ou en panne, et l'envoi restait invisible.
 *
 * 🔴 LA CORRECTION : juste après l'acceptation de Gmail, on relit CE message chez Gmail (son original, par l'identifiant que
 * l'envoi vient de rendre) et on l'écrit par LE MÊME CHEMIN que la relève — `preparerMessage`, `resoudreFil`, `ecrireMessage`,
 * `deposerPiecesMessage` : même corps, mêmes pièces, même fil, même sens. Puis on pose les intentions retenues à l'envoi (biens,
 * classement, parties, interne, hors gestion) par les MÊMES passes que la suite de la relève.
 *
 * 🔴 AUCUN DOUBLON QUAND LA RELÈVE PASSE ENSUITE : l'original lu chez Gmail porte le Message-ID que Gmail a réellement gardé (il
 * réécrit celui de l'envoi), c'est-à-dire celui que la relève lira dans le dossier ; `gestion_message.message_id` est UNIQUE et
 * la relève l'écarte dès l'enveloppe (`filtrerNonVus`), sinon à l'écriture (`ON CONFLICT (message_id) DO NOTHING`).
 *
 * ⚠️ AU MIEUX-EFFORT, APRÈS LE MESSAGE PARTI : rien ici ne peut rendre un échec d'envoi. Si Gmail ne rend pas l'original, ou si
 * la base refuse, la relève fera ce qu'elle faisait avant — le message entrera à sa prochaine passe.
 */
export interface DepsCaptureImmediate {
  jetonAcces(): Promise<string | null>;
  lireOriginal(jeton: string, gmailId: string): Promise<{ ok: true; valeur: Buffer } | { ok: false; motif: string }>;
  analyser(original: Buffer): Promise<MessageBrut>;
  config(): Promise<ConfigGestion>;
  reglesActives(): Promise<RegleExclusion[]>;
  dejaConnu(messageId: string): Promise<boolean>;
  resoudreFil(identifiants: string[], cleRacine: string, objet: string | null): Promise<FilResolu>;
  ecrire(m: MessageAEcrire, filId: number): Promise<number | null>;
  deposerPieces(messageId: number, pieces: PieceBrute[], config: ConfigGestion): Promise<{ deposees: number; nonDeposees: number }>;
  /** L'identifiant Gmail, posé sur la ligne : c'est lui que les intentions de l'envoi cherchent EN PREMIER (exact). */
  memoriserGmailId(messageId: number, gmailId: string): Promise<void>;
  /** Les passes de la suite de la relève qui posent les intentions retenues à l'envoi. Idempotentes. */
  appliquerIntentions(): Promise<void>;
}

export type IssueCaptureImmediate =
  | { etat: 'capture'; messageId: number; pieces: number }
  | { etat: 'deja' }
  | { etat: 'impossible'; motif: string };

export async function capturerEnvoiImmediat(gmailId: string, deps: DepsCaptureImmediate): Promise<IssueCaptureImmediate> {
  const jeton = await deps.jetonAcces();
  if (jeton === null) return { etat: 'impossible', motif: 'jeton Google indisponible' };
  const lu = await deps.lireOriginal(jeton, gmailId);
  if (!lu.ok) return { etat: 'impossible', motif: lu.motif };
  const m = await deps.analyser(lu.valeur);
  const mid = m.messageId.trim();
  if (mid === '') return { etat: 'impossible', motif: 'original sans Message-ID' };
  if (await deps.dejaConnu(mid)) { await deps.appliquerIntentions(); return { etat: 'deja' }; }

  const config = await deps.config();
  const prepare = preparerMessage(m, config, await deps.reglesActives());
  const fil = await deps.resoudreFil(identifiantsMessage(m).map(pourComparaison), cleDuFil(m, m.uid, m.recuLe), m.objet);
  const id = await deps.ecrire(prepare, fil.filId);
  if (id === null) { await deps.appliquerIntentions(); return { etat: 'deja' }; }   // la relève l'a écrit entre-temps
  await deps.memoriserGmailId(id, gmailId);
  let pieces = 0;
  if (m.pieces.length > 0) pieces = (await deps.deposerPieces(id, m.pieces, config)).deposees;
  await deps.appliquerIntentions();
  return { etat: 'capture', messageId: id, pieces };
}
