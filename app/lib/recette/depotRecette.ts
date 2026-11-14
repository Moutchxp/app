/** Le dépôt d'une requête interceptée en recette dans la boîte de test (envoi Gmail : destinataires, objet, message ENTIER). Serveur. */
import { decoderRfc822, resumerRfc822, type Decision } from './interception';
import { deposerDansBoite, requeteLisible } from './boite';

/** Résumé d'un envoi Gmail : `raw` en JSON, ou le message RFC 822 brut (envoi /upload/ en message/rfc822). */
function resumerEnvoiGmail(corps: string | null): { a: string | null; objet: string | null } {
  if (!corps) return { a: null, objet: null };
  try {
    const j = JSON.parse(corps) as { raw?: string; message?: { raw?: string } };
    return resumerRfc822(j.raw ?? j.message?.raw ?? null);
  } catch {
    return resumerRfc822(Buffer.from(corps, 'utf8').toString('base64'));
  }
}

/** Le message RFC 822 entier d'un envoi Gmail (`raw` en JSON, ou le message brut en /upload/). */
function messageEnvoiGmail(corps: string | null): string | null {
  if (!corps) return null;
  try {
    const j = JSON.parse(corps) as { raw?: string; message?: { raw?: string } };
    return decoderRfc822(j.raw ?? j.message?.raw ?? null);
  } catch {
    return corps;
  }
}

/** Le dépôt d'une requête interceptée en recette : un envoi Gmail avec ses destinataires, son objet et le message ENTIER. */
export function deposerRecette(url: string, methode: string, d: Exclude<Decision, { action: 'laisser' }>, corps: string | null): void {
  const requete = requeteLisible(url, methode);
  if (d.canal === 'gmail_envoi') {
    const { a, objet } = resumerEnvoiGmail(corps);
    deposerDansBoite({ canal: 'gmail_envoi', issue: 'intercepte', a, objet, requete }, messageEnvoiGmail(corps));
  } else {
    deposerDansBoite({ canal: d.canal, issue: d.action === 'simuler' ? 'simule' : 'refuse', requete });
  }
}

