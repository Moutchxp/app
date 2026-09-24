import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { lireAncrage, memoriserAncrage } from '../../../../../../../lib/gestion/gmailRepo';
import {
  chercherParMessageId, lireIdentifiants, lireOriginalGmail, rafraichirJeton,
} from '../../../../../../../lib/gestion/google';
import { lireJeton } from '../../../../../../../lib/gestion/googleJeton';
import { MENTION_INTROUVABLE, MENTION_SANS_CONNEXION } from '../../../../../../../lib/gestion/gmailAction';

/**
 * /api/admin/gestion/messages/[id]/original (lot 5-FIDÈLE) — LA SOURCE ORIGINALE, telle que Gmail l'a reçue.
 *
 * Deux entrées du menu s'en servent, et c'est la MÊME source :
 *   · « Afficher l'original »       → rendu en texte brut dans un onglet ;
 *   · « Télécharger le message »    → `?telecharger=1`, fichier `.eml`.
 *
 * 🔴 C'EST LA SOURCE, JAMAIS NOTRE RECONSTITUTION. Quand on cherche pourquoi un mail est arrivé de travers — un
 * encodage cassé, un en-tête absent, un expéditeur usurpé —, notre copie ne sert à rien : c'est l'original qu'il faut.
 *
 * 🔒 LECTURE SEULE de bout en bout : `format=raw` ne modifie rien. `exigerCompteActif(request,'gestion')` garde
 * l'accès ; aucun droit d'ÉCRITURE n'est exigé, parce que lire n'est pas agir. `private, no-store` : c'est un mail
 * de locataire, en clair. Runtime Node.
 */
export const runtime = 'nodejs';

type Contexte = { params: Promise<{ id: string }> };

/** Un nom de fichier sûr : ni chemin, ni guillemet, ni accent — un en-tête `Content-Disposition` ne pardonne pas. */
function nomFichier(messageId: number): string {
  return `message-gestion-${messageId}.eml`;
}

export async function GET(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const n = Number((await ctx.params).id);
  if (!Number.isInteger(n) || n <= 0) return new Response('Message inconnu.', { status: 400 });

  const identifiants = lireIdentifiants();
  const jetonRafraichissement = lireJeton();
  if (identifiants === null || jetonRafraichissement === null) {
    return new Response(MENTION_SANS_CONNEXION, { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  try {
    const acces = await rafraichirJeton({ identifiants, refreshToken: jetonRafraichissement.refreshToken }, { fetch });
    if (!acces.ok) return new Response(MENTION_SANS_CONNEXION, { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

    const ancrage = await lireAncrage(n);
    if (ancrage === null) return new Response(MENTION_INTROUVABLE, { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

    // Déjà mémorisé (migration 242) ou non : dans les deux cas on sait retrouver le message.
    let gmailId = ancrage.gmailMessageId;
    if (gmailId === null) {
      const trouve = await chercherParMessageId(acces.valeur, ancrage.messageIdRfc, { fetch });
      if (!trouve.ok) return new Response(trouve.motif, { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      if (trouve.valeur === null) return new Response(MENTION_INTROUVABLE, { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      gmailId = trouve.valeur.id;
      await memoriserAncrage(n, { id: trouve.valeur.id, threadId: trouve.valeur.threadId });
    }

    const original = await lireOriginalGmail(acces.valeur, gmailId, { fetch });
    if (!original.ok) return new Response(original.motif, { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

    const telecharger = new URL(request.url).searchParams.get('telecharger') === '1';
    return new Response(original.valeur, {
      headers: {
        // `message/rfc822` pour le téléchargement (c'est un .eml), texte brut pour la lecture à l'écran : un
        //   navigateur qui reçoit `message/rfc822` propose de l'enregistrer, ce qu'on ne veut pas quand on veut LIRE.
        'Content-Type': telecharger ? 'message/rfc822; charset=utf-8' : 'text/plain; charset=utf-8',
        'Content-Disposition': telecharger ? `attachment; filename="${nomFichier(n)}"` : 'inline',
        'Cache-Control': 'private, no-store',
        // La source d'un mail contient du HTML et des liens : on interdit tout au navigateur qui l'afficherait.
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    console.error('[gestion/messages/original] lecture impossible', e);
    return new Response('Lecture impossible : une erreur interne est survenue.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
