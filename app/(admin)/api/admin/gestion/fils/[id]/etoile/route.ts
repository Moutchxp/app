import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { query } from '../../../../../../../lib/db/client';
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import { poserEtoile } from '../../../../../../../lib/gestion/etoileRepo';
import { basculerEtoileDuFil, type DepsEtoileFil } from '../../../../../../../lib/gestion/etoileFil';
import { ecrireEtoileMessage, messagesEtoilesDuFil } from '../../../../../../../lib/gestion/etoileGmailRepo';
import { lireAncrage, memoriserAncrage } from '../../../../../../../lib/gestion/gmailRepo';
import { peutEnvoyerAuNomDeGestion } from '../../../../../../../lib/gestion/gardeEnvoi';
import { chercherParMessageId, modifierLibelles } from '../../../../../../../lib/gestion/google';
import { jetonAccesGestion } from '../../../../../../../lib/gestion/jetonAcces';
import { etoileGmailDisponible } from '../../../../../../../lib/gestion/schema';

/**
 * /api/admin/gestion/fils/[id]/etoile — POSER OU DÉCROCHER L'ÉTOILE D'UN ÉCHANGE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LOT ETOILE-ET-SIGNATURE — CETTE ROUTE PARLE MAINTENANT À GMAIL, et c'est tout le lot.
 *
 * CE QU'ELLE FAISAIT, ET LE DÉFAUT QUE ÇA DONNAIT À L'ÉCRAN. Elle écrivait dans `gestion_fil_etoile` — l'étoile de
 * NOTRE application, sur un échange, sans jamais toucher Gmail. L'étoile de la CONVERSATION, elle, bascule le
 * libellé `STARRED` dans Gmail et ne laisse aucune trace chez nous. Deux étoiles, deux états, et le filtre ne
 * lisait que le premier :
 *
 *     étoiles dans GMAIL (API, « is:starred »)  →  611 messages
 *     étoiles vues par le filtre                →    0 échange
 *
 * Constat d'Arno : un message étoilé en toutes lettres dans le fil 334, et un filtre vide. Décision d'Arno : UNE
 * SEULE ÉTOILE, CELLE DE GMAIL, lue et écrite dans les deux sens.
 *
 * ⚠️ SANS LA MIGRATION 277, ON RETOMBE SUR L'ANCIEN CHEMIN — l'étoile de l'équipe, en base, sans Gmail. C'est
 * exactement ce que cette route faisait avant ce lot : rien ne casse, et le filtre reste d'accord avec elle.
 * Ce n'est pas un repli de confort, c'est la règle du module : une sonde voyage avec ce qu'elle conditionne.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔒 `exigerCompteActif(request, 'gestion')`, puis — sur le chemin Gmail — le droit d'écrire au nom de gestion@,
 * RELU EN BASE. Aucun jeton ne quitte jamais le serveur. Runtime Node (driver pg).
 *
 * 🔴 L'ÉTAT DEMANDÉ EST TRANSMIS, JAMAIS « L'INVERSE DE CE QUI EST LÀ ». Deux clics partis en même temps de deux
 * postes ne peuvent donc pas se croiser et laisser l'étoile dans l'état contraire de ce que les deux voulaient.
 */
export const runtime = 'nodejs';

/** Le câblage RÉEL. Tout est injecté dans `basculerEtoileDuFil`, qui s'éprouve ainsi sans toucher à Gmail. */
function deps(request: Request): DepsEtoileFil {
  return {
    peutEcrire: () => peutEnvoyerAuNomDeGestion(request),
    jetonAcces: async () => {
      const j = await jetonAccesGestion();
      return j.etat === 'ok' ? j.jeton : null;
    },
    /**
     * ⚠️ « LE DERNIER MESSAGE », TOUS SENS CONFONDUS et corbeille comprise : c'est l'échange qu'on étoile, et le
     * repère doit être le même quelle que soit l'étiquette d'où l'on clique. Un tri par (recu_le, id) plutôt que
     * par `recu_le` seul : deux messages à la même seconde existent, et l'ordre doit être total.
     */
    dernierMessage: async (filId) => {
      const { rows } = await query<{ id: string; message_id: string }>(
        `SELECT id::text AS id, message_id FROM gestion_message
          WHERE fil_id = $1 ORDER BY recu_le DESC, id DESC LIMIT 1`, [filId]);
      return rows[0] === undefined ? null : { messageId: Number(rows[0].id), messageIdRfc: rows[0].message_id };
    },
    messagesEtoiles: (filId) => messagesEtoilesDuFil(filId),
    ancrage: (messageId) => lireAncrage(messageId),
    memoriser: (messageId, g) => memoriserAncrage(messageId, g),
    chercher: (t, mid) => chercherParMessageId(t, mid, { fetch }),
    modifier: (t, id, o) => modifierLibelles(t, id, o, { fetch }),
    noter: (messageId, etoilee) => ecrireEtoileMessage(messageId, etoilee),
    journaliser: async (l) => {
      const auteur = await auteurDeLaRequete(request);
      await query(
        `INSERT INTO gestion_journal
           (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
         VALUES ('fil_etoile', $1, $2, $3, $4, $5, $6, $7)`,
        [l.filId, l.etoilee ? 'etoiler' : 'desetoiler', String(!l.etoilee), String(l.etoilee),
          l.etoilee
            ? 'étoile posée dans Gmail sur le dernier message de l’échange'
            : `étoile retirée dans Gmail (${l.touches} message(s))`,
          auteur.id, auteur.libelle]);
    },
  };
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const { id } = await ctx.params;
  const filId = Number(id);
  if (!Number.isInteger(filId) || filId <= 0) {
    return Response.json({ erreur: 'Échange inconnu.' }, { status: 400 });
  }

  let corps: { etoilee?: unknown };
  try { corps = (await request.json()) as typeof corps; }
  catch { return Response.json({ erreur: 'Requête illisible.' }, { status: 400 }); }
  if (typeof corps.etoilee !== 'boolean') {
    return Response.json({ erreur: 'État d’étoile non reconnu.' }, { status: 400 });
  }

  try {
    if (await etoileGmailDisponible()) {
      const issue = await basculerEtoileDuFil(filId, corps.etoilee, deps(request));
      // 409 pour un état connu (droit, connexion, message introuvable) : ce n'est pas une panne, et l'écran sait
      //   le dire. Un 500 enverrait chercher un bug là où il n'y en a pas.
      if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409 });
      return Response.json({ ok: true, etoilee: issue.etoilee, touches: issue.touches });
    }
    const issue = await poserEtoile({ filId, etoilee: corps.etoilee, auteur: await auteurDeLaRequete(request) });
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409 });
    return Response.json({ ok: true, etoilee: issue.etoilee });
  } catch (e) {
    console.error('[api/admin/gestion/fils/etoile] écriture impossible', e);
    return Response.json({ erreur: 'Écriture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}
