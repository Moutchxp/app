import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { query } from '../../../../../../../lib/db/client';
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import { agirSurGmail, basculerEtoile, lireEtatGmail, type DepsActionGmail } from '../../../../../../../lib/gestion/gmailAction';
import { lireAncrage, memoriserAncrage } from '../../../../../../../lib/gestion/gmailRepo';
import { peutEnvoyerAuNomDeGestion } from '../../../../../../../lib/gestion/gardeEnvoi';
import type { ActionMessage } from '../../../../../../../lib/gestion/gmailMenu';
import {
  chercherParMessageId, creerFiltreBlocage, lireIdentifiants, lireMessageGmail, modifierLibelles, rafraichirJeton,
} from '../../../../../../../lib/gestion/google';
import { lireJeton } from '../../../../../../../lib/gestion/googleJeton';

/**
 * /api/admin/gestion/messages/[id]/gmail (lot 5-FIDÈLE) — L'ÉTAT ET LES ACTIONS GMAIL D'UN MESSAGE.
 *
 * GET  — LECTURE SEULE : l'étoile et le « non lu », relus DANS GMAIL. Aucun droit d'écriture exigé : regarder n'est
 *        pas agir. Sans connexion, on rend `null` et l'écran n'affiche pas ces marques plutôt que de les inventer.
 * POST — une action qui MODIFIE la boîte (étoile, non lu, spam, blocage). Deux gardes, dans cet ordre :
 *        `exigerCompteActif(request,'gestion')` puis le droit d'écrire au nom de gestion@, RELU EN BASE.
 *
 * 🔴 AUCUNE SUPPRESSION DÉFINITIVE n'est jamais demandée : on pose ou retire des libellés, et on crée un filtre. Tout
 * se défait depuis Gmail, et la portée qui permettrait d'effacer n'est pas demandée.
 *
 * Runtime Node. `private, no-store` : ces réponses portent l'état d'un message de locataire.
 */
export const runtime = 'nodejs';

type Contexte = { params: Promise<{ id: string }> };

function idDe(brut: string): number | null {
  const n = Number(brut);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Le câblage RÉEL, pour un message donné. Tout est injecté : les épreuves passent un monde simulé. */
function deps(request: Request, messageId: number): DepsActionGmail {
  const identifiants = lireIdentifiants();
  return {
    peutEcrire: () => peutEnvoyerAuNomDeGestion(request),
    jetonAcces: async () => {
      const jeton = lireJeton();
      if (identifiants === null || jeton === null) return null;
      try {
        const acces = await rafraichirJeton({ identifiants, refreshToken: jeton.refreshToken }, { fetch });
        return acces.ok ? acces.valeur : null;
      } catch { return null; }
    },
    ancrage: () => lireAncrage(messageId),
    memoriser: (g) => memoriserAncrage(messageId, g),
    chercher: (t, mid) => chercherParMessageId(t, mid, { fetch }),
    lire: (t, id) => lireMessageGmail(t, id, { fetch }),
    modifier: (t, id, o) => modifierLibelles(t, id, o, { fetch }),
    bloquer: (t, adresse) => creerFiltreBlocage(t, adresse, { fetch }),
    journaliser: async (l) => {
      const auteur = await auteurDeLaRequete(request);
      await query(
        `INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_id, auteur_libelle)
         VALUES ('message', $1, $2, $3, $4, $5)`,
        [l.messageId, `gmail_${l.action}`, l.detail, auteur.id, auteur.libelle]);
    },
  };
}

export async function GET(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = idDe((await ctx.params).id);
  if (id === null) return Response.json({ erreur: 'Message inconnu.' }, { status: 400 });
  try {
    const etat = await lireEtatGmail(deps(request, id));
    return Response.json({ etat, peutEcrire: await peutEnvoyerAuNomDeGestion(request) },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gestion/messages/gmail] lecture impossible', e);
    // Une lecture d'état qui échoue ne casse pas la conversation : l'écran se passe simplement de ces deux marques.
    return Response.json({ etat: null, peutEcrire: false });
  }
}

export async function POST(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = idDe((await ctx.params).id);
  if (id === null) return Response.json({ erreur: 'Message inconnu.' }, { status: 400 });

  let corps: { action?: unknown };
  try { corps = (await request.json()) as typeof corps; }
  catch { return Response.json({ erreur: 'Requête invalide.' }, { status: 422 }); }

  const permises: ActionMessage[] = ['non_lu', 'spam', 'bloquer'];
  const action = permises.find((a) => a === corps.action);
  const etoile = corps.action === 'etoile';
  if (!action && !etoile) return Response.json({ erreur: 'Action inconnue.' }, { status: 422 });

  try {
    const issue = etoile
      ? await basculerEtoile(id, deps(request, id))
      : await agirSurGmail(action as ActionMessage, id, deps(request, id));
    if (!issue.ok) {
      const statut = issue.code === 'droit' ? 403 : issue.code === 'introuvable' ? 404 : 503;
      return Response.json({ erreur: issue.motif, code: issue.code }, { status: statut });
    }
    return Response.json({ ok: true, message: issue.message, etat: issue.etat ?? null },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gestion/messages/gmail] action impossible', e);
    return Response.json({ erreur: 'Action impossible : une erreur interne est survenue.' }, { status: 503 });
  }
}
