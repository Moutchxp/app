import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { depsMarquageGmail, marquerFilGmail } from '../../../../../../../lib/gestion/lectureGmailReel';

/**
 * POST /api/admin/gestion/fils/[id]/lecture (lot 5-BOITE-2) — MARQUER UN ÉCHANGE LU, OU NON LU, DANS GMAIL.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 UN SEUL ÉTAT, COMMUN À L'ÉQUIPE — choix d'Arno du 25/09/2026. Ce geste écrit donc DANS LA VRAIE BOÎTE : lire un
 * échange ici le marque lu dans Gmail, sur tous les téléphones de l'équipe. C'est la conséquence assumée du choix ;
 * l'alternative (un état personnel en base) existait et a été écartée.
 *
 * 🔴 SUR LE FIL GMAIL, ET EN UN APPEL. Un échange de dix messages demanderait vingt appels message par message ; le
 * fil se retrouve à partir d'un seul message et se modifie d'un coup. C'est aussi ce que fait Gmail lui-même quand
 * on marque une conversation non lue depuis une liste.
 *
 * 🔴 IDEMPOTENT. La vue conversation appelle cette route à CHAQUE ouverture : poser `UNREAD` sur un fil qui l'a déjà,
 * ou le retirer d'un fil qui ne l'a pas, ne produit ni erreur ni effet de bord chez Gmail.
 *
 * ⚠️ CE N'EST PAS « TRAITÉ ». « À traiter / traité par X » dit où en est le TRAVAIL et reste propre à notre outil ;
 * cette route-ci ne touche qu'à « ce courrier a été lu ». Les deux restent volontairement séparés.
 *
 * ⚠️ QUATRE REFUS POSSIBLES, ET ILS NE SE RÉPARENT PAS PAREIL : connexion Google absente, échange introuvable dans
 * Gmail (il vient d'ailleurs, ou il y a été effacé), refus de Gmail, panne. Chacun a son mot.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';
type Contexte = { params: Promise<{ id: string }> };

function json(corps: unknown, status = 200): Response {
  return Response.json(corps, { status, headers: { 'Cache-Control': SANS_CACHE } });
}

export async function POST(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const filId = Number((await ctx.params).id);
  if (!Number.isInteger(filId) || filId <= 0) return json({ erreur: 'Échange inconnu.' }, 400);

  const corps = (await request.json().catch(() => ({}))) as { lu?: unknown };
  // `lu` doit être dit EXPLICITEMENT : deviner « lu » par défaut ferait d'un appel malformé un geste silencieux.
  if (typeof corps.lu !== 'boolean') return json({ erreur: 'Préciser « lu » : true ou false.' }, 400);

  try {
    const issue = await marquerFilGmail(depsMarquageGmail(), filId, corps.lu);
    if (issue.etat === 'sans_connexion') {
      return json({
        etat: 'sans_connexion',
        message: 'Connexion Google de gestion@ pas encore faite : le lu/non lu vient de Gmail.',
      }, 409);
    }
    /**
     * ══ 🔴 UN ÉCHANGE INTROUVABLE N'EST PAS UNE PANNE, ET LE MESSAGE DOIT DIRE CE QUI A ÉTÉ FAIT ═══════════════
     * L'ancienne phrase — « il vient peut-être d'ailleurs » — était une hypothèse, et elle était FAUSSE dans le cas
     * signalé par Arno le 27/09 : l'échange venait bien de gestion@, mais son message d'ancrage était dans la
     * CORBEILLE, que la recherche Gmail exclut par défaut. Les deux causes sont corrigées (`in:anywhere`, et
     * plusieurs ancres essayées dont les messages ENVOYÉS).
     *
     * Ce qui reste, après ces corrections, ce sont les échanges dont AUCUN message n'existe plus dans Gmail. Le
     * message le dit alors franchement : ce qui n'a PAS changé, et pourquoi — sans alarme, et sans prétendre
     * connaître la raison.
     */
    if (issue.etat === 'introuvable') {
      return json({
        etat: 'introuvable',
        message: 'Rien n’a changé : aucun message de cet échange n’existe plus dans Gmail (effacé définitivement, '
          + 'ou jamais passé par gestion@). Le lu/non lu vient de Gmail — il n’y a donc rien à y marquer. '
          + 'L’échange et ses messages restent intacts ici.',
      }, 409);
    }
    if (issue.etat === 'refus') return json({ etat: 'refus', message: issue.motif }, 409);
    return json({ etat: 'ok', lu: corps.lu });
  } catch (e) {
    console.error('[gestion/fil/lecture] écriture impossible', e);
    return json({ etat: 'erreur', message: 'Le marquage n’a pas abouti.' }, 503);
  }
}
