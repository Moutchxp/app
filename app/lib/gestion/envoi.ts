/**
 * LOT 5e — L'ENVOI, DE BOUT EN BOUT. IMPUR, mais TOUT est injecté : base, Gmail, horloge, aléa. Aucune connexion n'est
 * ouverte par ce fichier — c'est ce qui permet de l'éprouver entièrement sans qu'un seul mail parte.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 L'ORDRE DES GESTES EST LA FONCTIONNALITÉ. Il n'est pas négociable, et chaque inversion a une conséquence connue :
 *   ① on relit le DROIT (en base, pas dans le jeton) → un droit retiré coupe l'envoi au clic suivant ;
 *   ② on vérifie que le brouillon est ENVOYABLE → l'écran l'a déjà fait, le serveur est la seule autorité ;
 *   ③ on vérifie que la connexion Google EXISTE → sinon on le dit, et le brouillon est CONSERVÉ ;
 *   ④ on ÉCRIT la ligne d'envoi, AVANT l'appel réseau → si tout tombe ensuite, on sait qu'un mail est peut-être parti ;
 *      et c'est la BASE qui tranche le double-clic (clé unique) : une seconde demande retombe sur la première ;
 *   ⑤ on appelle Gmail ;
 *   ⑥ on FINALISE la ligne — parti, ou refusé avec son motif. Jamais laissée en silence.
 * Écrire la ligne APRÈS l'appel (④ après ⑤) perdrait la trace d'un envoi réussi dont la réponse n'est jamais revenue :
 * on renverrait alors le même mail, et le correspondant le recevrait deux fois.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔒 AUCUN CORPS, AUCUNE ADRESSE, AUCUN JETON dans les journaux applicatifs : le registre `gestion_envoi` porte l'objet
 * et les destinataires — c'est le journal MÉTIER, celui qu'Arno a demandé —, et rien d'autre ne sort vers `console`.
 */
import type { Auteur, EnvoiEnBase } from './redactionRepo';
import { chainerReferences, construireRfc822, domaineDe, fabriquerMessageId, type ResultatEnvoi } from './envoiGmail';
import { pretAEnvoyer } from './redaction';

/** Ce que l'envoi a besoin de savoir du message auquel on répond, pour rester dans le bon fil. */
export interface AncrageFil {
  /** Le `Message-ID` RFC du message d'origine. `null` = nouveau message, aucun ancrage. */
  messageIdRfc: string | null;
  /** Sa chaîne `References`, si on la connaît. */
  references: string | null;
  /** L'identifiant de fil côté Gmail, si on le connaît. Aide Gmail à ranger, sans remplacer les en-têtes. */
  threadId: string | null;
}

export interface DemandeEnvoi {
  cleIdempotence: string;
  brouillonId: number | null;
  filId: number | null;
  repondAMessageId: number | null;
  a: string[];
  cc: string[];
  cci: string[];
  objet: string;
  corps: string;
}

export interface DepsEnvoiComplet {
  /** ① Le droit, RELU EN BASE. */
  peutEnvoyer(): Promise<boolean>;
  /** ③ Un jeton d'accès Google valide, ou `null` si la connexion n'est pas faite. */
  jetonAcces(): Promise<string | null>;
  /** Le nom affiché de l'expéditeur, et son adresse. */
  expediteur(): Promise<{ adresse: string; nom: string }>;
  /** Ce à quoi on répond. */
  ancrage(repondAMessageId: number | null): Promise<AncrageFil>;
  /** ④ Ouvre la ligne, et tranche le double-clic. */
  ouvrirEnvoi(e: Parameters<typeof import('./redactionRepo').ouvrirEnvoi>[0], auteur: Auteur): Promise<EnvoiEnBase>;
  /** ⑤ Remet le message à Gmail. */
  envoyer(o: { accessToken: string; rfc822: string; cci: readonly string[]; threadId: string | null }): Promise<ResultatEnvoi>;
  /** ⑥ Finalise la ligne. */
  finaliser(id: number, maj: { etat: 'envoye' | 'echec'; gmailMessageId?: string | null; erreur?: string | null }): Promise<void>;
  /** Marque le brouillon envoyé (il quitte la liste sans être supprimé). */
  marquerBrouillonEnvoye(id: number): Promise<void>;
  /** Le journal MÉTIER : qui, à qui, quand, quel objet. */
  journaliser(l: { auteur: Auteur; objet: string; destinataires: string[]; issue: 'envoye' | 'echec' }): Promise<void>;
  maintenant(): Date;
  alea(): string;
}

export type IssueEnvoi =
  | { ok: true; envoi: EnvoiEnBase; deja: boolean }
  | { ok: false; motif: string; code: 'droit' | 'invalide' | 'sans_jeton' | 'refus_gmail' };

/** La phrase montrée quand la connexion Google n'est pas faite. Une seule formulation, à l'écran comme dans la route. */
export const MENTION_SANS_JETON =
  'Envoi impossible : la connexion Google de gestion@ n’est pas encore faite — voir docs/GUIDE_CONNEXION_GOOGLE_GESTION.md';

export async function envoyerMessage(d: DemandeEnvoi, auteur: Auteur, deps: DepsEnvoiComplet): Promise<IssueEnvoi> {
  // ① LE DROIT, relu en base. Avant tout le reste : rien ne doit être écrit au nom de quelqu'un qui n'a pas le droit.
  if (!await deps.peutEnvoyer()) {
    return { ok: false, code: 'droit', motif: 'Vous n’avez pas le droit d’envoyer au nom de gestion@.' };
  }

  // ② LE BROUILLON EST-IL ENVOYABLE ? L'écran l'a déjà vérifié ; ici c'est l'autorité, pas une politesse.
  const pret = pretAEnvoyer(d);
  if (!pret.pret) return { ok: false, code: 'invalide', motif: pret.motif };

  // ③ LA CONNEXION GOOGLE. Sans elle on ne prétend rien : on le DIT, et le brouillon reste où il est.
  const jeton = await deps.jetonAcces();
  if (jeton === null) return { ok: false, code: 'sans_jeton', motif: MENTION_SANS_JETON };

  const de = await deps.expediteur();
  const ancrage = await deps.ancrage(d.repondAMessageId);
  const messageId = fabriquerMessageId(domaineDe(de.adresse), deps.alea(), deps.maintenant());
  const references = chainerReferences(ancrage.references, ancrage.messageIdRfc);

  // ④ LA LIGNE, AVANT L'APPEL. Et c'est la base qui tranche le double-clic.
  const envoi = await deps.ouvrirEnvoi({
    cleIdempotence: d.cleIdempotence, brouillonId: d.brouillonId, filId: d.filId,
    repondAMessageId: d.repondAMessageId, messageIdRfc: messageId,
    inReplyTo: ancrage.messageIdRfc, references,
    a: d.a, cc: d.cc, cci: d.cci, objet: d.objet,
  }, auteur);
  // 🔴 DOUBLE-CLIC : la ligne existait déjà. On ne renvoie RIEN — on rend l'issue du premier clic.
  if (envoi.deja) return { ok: true, envoi, deja: true };

  // ⑤ GMAIL.
  const rfc822 = construireRfc822({
    de: de.adresse, deNom: de.nom, a: d.a, cc: d.cc, cci: d.cci,
    objet: d.objet, corps: d.corps, messageId,
    inReplyTo: ancrage.messageIdRfc, references,
  });
  const issue = await deps.envoyer({ accessToken: jeton, rfc822, cci: d.cci, threadId: ancrage.threadId });

  // ⑥ ON FINALISE, dans les deux cas. Une ligne laissée `en_cours` est un envoi dont personne ne saura jamais rien.
  if (!issue.ok) {
    await deps.finaliser(envoi.id, { etat: 'echec', erreur: issue.motif });
    await deps.journaliser({ auteur, objet: d.objet, destinataires: [...d.a, ...d.cc, ...d.cci], issue: 'echec' });
    return { ok: false, code: 'refus_gmail', motif: issue.motif };
  }
  await deps.finaliser(envoi.id, { etat: 'envoye', gmailMessageId: issue.gmailMessageId });
  if (d.brouillonId !== null) await deps.marquerBrouillonEnvoye(d.brouillonId);
  await deps.journaliser({ auteur, objet: d.objet, destinataires: [...d.a, ...d.cc, ...d.cci], issue: 'envoye' });
  return { ok: true, envoi: { ...envoi, etat: 'envoye' }, deja: false };
}
