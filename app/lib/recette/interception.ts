/**
 * ══ MODE RECETTE — CE QUI EST INTERCEPTÉ SUR LE RÉSEAU (lot RECETTE-MAC) ══════════════════════════════════════════════
 *
 * En recette, le `fetch` du serveur passe par `decisionRecette` (posé au démarrage par `instrumentation.ts`). PUR.
 *
 *   · LECTURES (GET, HEAD) : laissées passer — lire Gmail, l'Agenda ou le Drive n'a aucun effet.
 *   · Demande de JETON Google (POST oauth2.googleapis.com/token) : laissée passer — sans jeton, aucune lecture.
 *   · ENVOI d'un mail par Gmail (…/messages/send, …/drafts/send, y compris /upload/) : NE PART PAS → déposé dans la
 *     boîte de test ; réponse simulée « envoyé » (identifiant `recette-…`).
 *   · Autre ÉCRITURE Gmail (libellés, lu/non lu, corbeille, suppression, brouillons, filtres) : NE PART PAS → réponse
 *     simulée ; la vraie boîte gestion@ n'est pas modifiée.
 *   · ÉCRITURE dans un AGENDA (création, modification, suppression d'événement) : NE PART PAS → réponse simulée.
 *   · ÉCRITURE dans le DRIVE (création, envoi, renommage, déplacement, corbeille, partage, copie) : REFUSÉE (403) — le
 *     Drive reste en lecture seule et l'écran dit que l'écriture n'a pas été faite. Les garde-fous existants
 *     (« Documents clients scannés ») restent en place en amont, inchangés.
 *   · Lots Google (`/batch/…`) en écriture : refusés comme une écriture Drive (contenu non inspecté).
 *   · Tout le reste (adresses non Google, IA Gemini, base d'adresses…) : inchangé.
 */

export type Decision =
  | { action: 'laisser' }
  | { action: 'simuler'; canal: 'gmail_envoi' | 'gmail_ecriture' | 'agenda'; statut: number; corps: unknown }
  | { action: 'refuser'; canal: 'drive' | 'google_lot'; statut: number; corps: unknown };

const ENVOI_GMAIL = /^\/(upload\/)?gmail\/v1\/users\/[^/]+\/(messages|drafts)\/send$/;

/** Que faire de cette requête sortante, en recette ? `id` sert aux réponses simulées. PUR. */
export function decisionRecette(url: string, methode: string | undefined, id: string): Decision {
  const m = (methode ?? 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return { action: 'laisser' };
  let u: URL;
  try { u = new URL(url); } catch { return { action: 'laisser' }; }
  const hote = u.hostname.toLowerCase();
  const chemin = u.pathname;
  if (hote === 'oauth2.googleapis.com') return { action: 'laisser' }; // jeton : nécessaire aux lectures

  const gmail = hote === 'gmail.googleapis.com' || (hote === 'www.googleapis.com' && /^\/(upload\/)?gmail\//.test(chemin));
  if (gmail && ENVOI_GMAIL.test(chemin)) {
    return { action: 'simuler', canal: 'gmail_envoi', statut: 200, corps: { id: `recette-${id}`, threadId: `recette-${id}`, labelIds: ['SENT'] } };
  }
  if (gmail) {
    return m === 'DELETE'
      ? { action: 'simuler', canal: 'gmail_ecriture', statut: 204, corps: null }
      : { action: 'simuler', canal: 'gmail_ecriture', statut: 200, corps: { id: `recette-${id}`, labelIds: [] } };
  }
  if ((hote === 'www.googleapis.com' || hote === 'calendar.googleapis.com') && /^\/calendar\//.test(chemin)) {
    return m === 'DELETE'
      ? { action: 'simuler', canal: 'agenda', statut: 204, corps: null }
      : { action: 'simuler', canal: 'agenda', statut: 200, corps: { id: `recette${id.replace(/[^a-z0-9]/gi, '').toLowerCase()}`, status: 'confirmed', htmlLink: '' } };
  }
  const message = 'RECETTE — écriture dans le Drive non effectuée (le Drive est en lecture seule sur le Mac).';
  if ((hote === 'www.googleapis.com' || hote === 'drive.googleapis.com') && /^\/(upload\/)?drive\//.test(chemin)) {
    return { action: 'refuser', canal: 'drive', statut: 403, corps: { error: { code: 403, message } } };
  }
  if (hote.endsWith('googleapis.com') && /^\/batch\//.test(chemin)) {
    return { action: 'refuser', canal: 'google_lot', statut: 403, corps: { error: { code: 403, message: 'RECETTE — lot Google en écriture non effectué.' } } };
  }
  return { action: 'laisser' };
}

/** Destinataires et objet d'un message RFC 822 (envoi Gmail : champ `raw` en base64url). PUR, ne lève jamais. */
export function resumerRfc822(raw: string | null | undefined): { a: string | null; objet: string | null } {
  if (!raw) return { a: null, objet: null };
  let texte = '';
  try { texte = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); } catch { return { a: null, objet: null }; }
  const entetes = texte.split(/\r?\n\r?\n/)[0] ?? '';
  const deplie = entetes.replace(/\r?\n[ \t]+/g, ' ');
  const lire = (nom: string) => deplie.match(new RegExp(`^${nom}:\\s*(.*)$`, 'im'))?.[1]?.trim() ?? null;
  return { a: [lire('To'), lire('Cc'), lire('Bcc')].filter(Boolean).join(', ') || null, objet: decoderMime(lire('Subject')) };
}

/** Décode un en-tête MIME encodé (=?UTF-8?B?…?= / =?UTF-8?Q?…?=). PUR. */
export function decoderMime(v: string | null): string | null {
  if (v === null) return null;
  return v.replace(/=\?utf-8\?([bq])\?([^?]*)\?=/gi, (_, enc: string, data: string) => {
    try {
      return enc.toLowerCase() === 'b'
        ? Buffer.from(data, 'base64').toString('utf8')
        : decodeURIComponent(data.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, '%$1'));
    } catch { return data; }
  }).replace(/\?=\s+=\?/g, '');
}
