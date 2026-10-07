import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { query } from '../../../../../../../lib/db/client';
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import { poserEtoile } from '../../../../../../../lib/gestion/etoileRepo';
import { basculerEtoileDuFil, type DepsEtoileFil } from '../../../../../../../lib/gestion/etoileFil';
import {
  ecrireEtoileMessage, mailsEtoilesDesFils, messagesEtoilesDuFil,
} from '../../../../../../../lib/gestion/etoileGmailRepo';
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

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

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

/**
 * ══ 🔴🔴 LOT ETOILE-PAR-MESSAGE — QUELS **MAILS** DE CET ÉCHANGE PORTENT UNE ÉTOILE ════════════════════════════
 *
 * RÈGLE D'ARNO : « une seule porte d'écriture, un seul état ». La porte d'écriture était déjà ici ; il manquait
 * la LECTURE, parce qu'un seul écran affichait l'étoile — la liste, qui la reçoit avec ses lignes
 * (`boiteRepo.etoilee`). La conversation, elle, est montée à côté de la liste et n'en reçoit rien.
 *
 * ══ 🔴🔴 CE QU'ELLE RENDAIT, ET LE BUG QUE CE GRAIN A PRODUIT ═══════════════════════════════════════════════════
 *
 * Elle rendait UN BOOLÉEN D'ÉCHANGE (`filsEtoiles` : « au moins un message porte une étoile »). La conversation
 * en faisait l'état de la grande étoile de CHACUN de ses mails — donc le même pour tous —, et le clic ne pouvait
 * désigner aucun mail en particulier : il partait par la porte de l'ÉCHANGE, qui vise « le dernier message ».
 *
 * CONSTAT D'ARNO (07/10/2026, fil 36764 « Facture Huissier », 3 mails) : clic sur la grande étoile du mail du
 * 06/10 16:31, étoile allumée sur celui du 07/10 09:32. Mesuré en base : `gestion_message.etoile_le` posé sur le
 * message 57652 (le plus récent), jamais sur le 57625 (celui qu'il avait sous le curseur).
 *
 * 🔴 ELLE REND DONC LA LISTE DES MAILS ÉTOILÉS, par `mailsEtoilesDesFils` — le MÊME dépôt, la MÊME colonne et la
 * MÊME lecture que les listes (`gestion_message.etoile_le`), simplement au grain où le geste se joue. L'état de
 * l'échange s'en déduit (« la liste n'est pas vide »), et c'est ce sens-là qui est vrai : l'inverse — déduire le
 * mail de l'échange — est exactement la devinette qu'on supprime.
 *
 * 🔴🔴 LOT ETOILE-LIGNE-DEUX-ETATS — ET ELLE REND L'EXPÉDITEUR ET LA DATE AVEC. La conversation est le seul écran
 * qui connaisse TOUTE la liste : c'est elle qui l'annonce aux listes après un clic, et une ligne doit pouvoir
 * NOMMER l'autre mail étoilé dans sa bulle d'aide.
 *
 * ⚠️ LA RÈGLE DU **FILTRE** N'EST PAS TOUCHÉE : il reste « cet échange porte au moins un mail étoilé »
 * (`boiteRepo.sqlEtoile`), et c'est voulu — un filtre qui ne regarderait que le mail affiché raterait l'étoile
 * posée ailleurs. Seul l'AFFICHAGE de la ligne distingue désormais les deux cas (pleine / creuse).
 *
 * ⚠️ `disponible: false` SANS LA MIGRATION 277 : le geste n'est pas possible, et l'écran n'affiche alors AUCUNE
 * étoile plutôt qu'une étoile éteinte — qui dirait faussement « ce mail n'est pas suivi ». C'est déjà ce que fait
 * la barre de survol (`etoileDisponible`).
 *
 * 🔒 MÊME DROIT QUE L'ÉCRITURE, relu en base. `private, no-store` : l'état d'un échange n'est pas une page.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const { id } = await ctx.params;
  const filId = Number(id);
  if (!Number.isInteger(filId) || filId <= 0) {
    return Response.json({ erreur: 'Échange inconnu.' }, { status: 400, headers: ENTETES });
  }

  try {
    if (!(await etoileGmailDisponible())) {
      return Response.json({ disponible: false, etoiles: [] }, { headers: ENTETES });
    }
    /**
     * 🔴🔴 LOT ETOILE-LIGNE-DEUX-ETATS — ON REND LES MAILS, PAS DES IDENTIFIANTS. La conversation est le seul
     * écran qui connaisse TOUTE la liste : c'est elle qui l'annonce aux listes après un clic, et une ligne doit
     * pouvoir NOMMER l'autre mail étoilé dans sa bulle (« …, houda ghannam, 6 octobre 2026 à 17:26 »).
     * Même lecture que les listes (`mailsEtoilesDesFils`), donc la même vérité.
     */
    const etoiles = await mailsEtoilesDesFils([filId]);
    return Response.json(
      { disponible: true, etoiles: etoiles.get(filId) ?? [] }, { headers: ENTETES });
  } catch (e) {
    /* Pas de catch muet qui rendrait « éteinte » : une panne et un mail non suivi ne sont pas la même chose. */
    console.error('[api/admin/gestion/fils/etoile] lecture impossible', e);
    return Response.json({ disponible: false, etoiles: [] }, { status: 503, headers: ENTETES });
  }
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
