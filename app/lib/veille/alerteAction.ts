/**
 * T7-B (cas ③) — logique PURE de l'alerte « ce message de mairie appelle une RÉPONSE HUMAINE ». Un message de nature `autre`
 * (T7-A : ni accusé, ni documents, ni rebond) est, par exemple, une demande d'informations complémentaires : il faut le
 * transmettre à l'adresse pro pour qu'un humain y réponde. Aucune I/O, aucun réseau (on ne SUIT JAMAIS un lien) : ce module
 * décide seulement le SUJET et le CORPS du forward.
 *
 * INVARIANT structurant : un `autre` n'a par définition NI pièce jointe NI lien fort (sinon il serait `documents`, cf.
 * classerNatureContenu). Le forward ne porte donc AUCUNE pièce — seulement le message d'origine, que l'exploitant a déjà dans
 * sa boîte. L'idempotence (une alerte par message) et l'ancre anti-rétroactif (nature_classee_le IS NOT NULL) sont gérées par
 * l'orchestrateur (alerteActionAuto), jamais ici.
 */

/** Contexte d'une alerte ③ : le permis principal (null = message non rattaché), les autres permis du même message, la commune. */
export interface ContexteAction {
  numDau: string | null;   // permis principal, ou null (message non rattaché → permis inconnu)
  autresPermis: string[];  // autres n° de permis de la même demande (le cas échéant)
  communeNom: string | null;
}

/**
 * Objet de l'alerte ③. Un SEUL n° de permis dans l'objet (comme G1) ; les autres sont dans le corps. Message non rattaché →
 * sujet dédié « permis à identifier » (aligné sur le « contenu non rattaché » de G1 : jamais de n° inventé).
 */
export function sujetAction(ctx: ContexteAction): string {
  if (ctx.numDau === null) return 'ACTION REQUISE — un message de mairie appelle une réponse (permis à identifier)';
  return `ACTION REQUISE PERMIS DE CONSTRUIRE N°${ctx.numDau} — un message de la mairie appelle une réponse`;
}

export interface CorpsActionEntree {
  ctx: ContexteAction;
  deAdresse: string; deNom: string | null; objet: string | null; recuLe: string; corpsTexte: string | null;
}

/**
 * Corps TEXTE du forward ③ : dit d'emblée que la mairie a écrit pour AUTRE CHOSE (ni accusé ni documents) et que ce message
 * appelle une réponse ; rappelle le(s) permis (ou l'absence de rattachement) ; puis reproduit le message d'origine. PUR.
 */
export function composerCorpsAction(e: CorpsActionEntree): string {
  const L: string[] = [];
  L.push('La mairie a écrit au sujet de votre demande — ce n’est ni un accusé de réception ni l’envoi des documents demandés.',
    'Ce message appelle vraisemblablement une RÉPONSE de votre part : répondez directement à la mairie (le message d’origine est ci-dessous).', '');

  if (e.ctx.numDau !== null) {
    L.push(`Permis concerné : N°${e.ctx.numDau}${e.ctx.communeNom ? ` (${e.ctx.communeNom})` : ''}.`);
    if (e.ctx.autresPermis.length > 0) L.push(`Autres permis de la même demande : ${e.ctx.autresPermis.map((n) => `N°${n}`).join(', ')}.`);
  } else {
    L.push('Ce message n’a PAS pu être rattaché à un permis : à identifier et rattacher dans l’onglet « Réponses ».');
  }
  L.push('');
  L.push('Quand vous aurez répondu, marquez ce message « répondu » dans l’onglet « En cours » (le suivi de la demande).', '');

  L.push('----- Message d’origine de la mairie -----');
  L.push(`De : ${e.deNom ? `${e.deNom} <${e.deAdresse}>` : e.deAdresse}`);
  L.push(`Objet : ${e.objet ?? '(sans objet)'}`);
  L.push(`Reçu le : ${e.recuLe}`);
  L.push('');
  L.push(e.corpsTexte && e.corpsTexte.trim() !== '' ? e.corpsTexte : '(message d’origine en HTML — à consulter dans l’espace d’administration)');

  return L.join('\n');
}
