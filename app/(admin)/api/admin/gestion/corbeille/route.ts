import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import {
  idsDeLaCorbeille, marquerCorbeille, tracerSuppression, SELECTION_MAX,
} from '../../../../../lib/gestion/corbeilleRepo';
import { jetonAccesGestion } from '../../../../../lib/gestion/jetonAcces';
import { peutEnvoyerAuNomDeGestion } from '../../../../../lib/gestion/gardeEnvoi';
import { lireAncrage, memoriserAncrage } from '../../../../../lib/gestion/gmailRepo';
import {
  chercherParMessageId, corbeilleGmail, droitSuppressionAccorde, supprimerDefinitivementGmail,
  MENTION_DROIT_SUPPRESSION,
} from '../../../../../lib/gestion/google';
import { lireJeton } from '../../../../../lib/gestion/googleJeton';
import { mapConcurrenceBornee } from '../../../../../lib/concurrence';
import { messagesDuFil } from '../../../../../lib/gestion/corbeilleFil';

/**
 * /api/admin/gestion/corbeille — LOT BOITE-INTERNE-CORBEILLE : METTRE À LA CORBEILLE, RÉINTÉGRER, SUPPRIMER.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 UNE SEULE PORTE POUR LES TROIS GESTES, et ce n'est pas une économie de fichiers : ils partagent le même droit,
 * le même ancrage dans Gmail, le même journal et la même règle d'ordre (Gmail d'abord, notre base ensuite). Écrits
 * dans trois routes, ces quatre choses auraient divergé — et c'est sur le geste le plus rare, la suppression, que
 * la divergence aurait fait le plus de dégâts.
 *
 * 🔴 GMAIL D'ABORD, NOTRE BASE ENSUITE. Toujours. L'inverse afficherait un mail à la corbeille alors qu'il est
 * resté en Réception dans la vraie boîte, et personne ne le découvrirait avant la passe suivante. Un message que
 * Gmail refuse n'est donc PAS marqué chez nous, et la réponse le dit, un par un.
 *
 * ═══ 🔴🔴 LA SUPPRESSION DÉFINITIVE EST BLOQUÉE PAR GOOGLE, ET L'ÉCRAN LE DIT ══════════════════════════════════
 * Vérifié sur le vrai compte le 29/09/2026 : `DELETE /messages/…` répond **403 « insufficient authentication
 * scopes »**. La portée qui l'autoriserait (`https://mail.google.com/`) est RESTREINTE — elle donne l'accès total à
 * la boîte — et elle n'est pas demandée. Ce lot ne contourne rien : il ne « vide » pas autrement, et il n'efface
 * SURTOUT PAS chez nous seulement, ce qui donnerait à l'écran l'air de marcher en mentant sur la vraie boîte.
 * Le jour où le droit est accordé, il n'y a rien à écrire : ce chemin est câblé jusqu'au bout.
 *
 * 🔒 DEUX DROITS DISTINCTS, et le second n'est pas décoratif : lire la boîte (`gestion`) ne suffit pas pour agir sur
 * la vraie boîte de l'équipe — c'est `peutEnvoyerAuNomDeGestion`, relu à chaque requête, comme tous les gestes
 * Gmail depuis le lot 5-FIDÈLE. Un droit retiré coupe l'action au clic suivant.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';

function json(corps: unknown, status = 200): Response {
  return Response.json(corps, { status, headers: { 'Cache-Control': SANS_CACHE } });
}

/** Combien de messages traités de front chez Google. Assez pour que 200 mails passent vite, assez peu pour ne pas
 *  se faire limiter — même valeur que les déplacements du Drive, éprouvée sur la vraie API. */
const SIMULTANES = 5;

type Action = 'corbeille' | 'reintegrer' | 'supprimer';
const ACTIONS: readonly Action[] = ['corbeille', 'reintegrer', 'supprimer'];

/** Le résultat d'un message : ce qui s'est passé, et pourquoi si ça n'a pas marché. */
interface Issue { messageId: number; ok: boolean; motif?: string }

/**
 * ══ LA LISTE DES MAILS DE LA CORBEILLE — « Sélectionner les N mails » ═══════════════════════════════════════════
 * GET, parce que c'est une LECTURE : elle ne change rien, et elle doit pouvoir être redemandée sans conséquence.
 */
export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  try {
    const tout = await idsDeLaCorbeille();
    if (tout === null) {
      return json({ etat: 'sans_schema', message: 'Bientôt disponible — une mise à jour de la base est nécessaire.' }, 409);
    }
    /**
     * ⚠️ `ids` PORTE DES ÉCHANGES, pas des mails : c'est ce que la liste montre, et donc ce qu'on sélectionne.
     * `total` peut dépasser `ids.length` (borne `SELECTION_MAX`) : l'écran DIT alors combien il a pris.
     *
     * 🔴 `suppressionPossible` EST LU SUR LE JETON, PAS SUR LE CODE, et sans un seul appel à Google. L'écran peut
     * ainsi griser « Supprimer définitivement » AVANT qu'on clique, au lieu de laisser découvrir le refus après
     * coup — et le jour où Arno accorde le droit et refait l'autorisation, le bouton s'active tout seul.
     */
    return json({
      etat: 'ok', ids: tout.ids, total: tout.total, mails: tout.mails, borne: SELECTION_MAX,
      suppressionPossible: droitSuppressionAccorde(lireJeton()?.portees),
      motSuppressionImpossible: MENTION_DROIT_SUPPRESSION,
    });
  } catch (e) {
    console.error('[gestion/corbeille] lecture impossible', e);
    return json({ etat: 'erreur', message: 'La liste n’a pas pu être lue.' }, 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const corps = (await request.json().catch(() => ({}))) as { action?: string; filIds?: unknown };
  const action = ACTIONS.includes(corps.action as Action) ? (corps.action as Action) : null;
  if (action === null) return json({ etat: 'erreur', message: 'Geste inconnu.' }, 400);

  // 🔒 AGIR SUR LA VRAIE BOÎTE DE L'ÉQUIPE N'EST PAS LIRE. Droit relu EN BASE, à chaque requête.
  if (!await peutEnvoyerAuNomDeGestion(request)) {
    return json({ etat: 'refus', message: 'Vous n’avez pas le droit d’agir sur la boîte de gestion@.' }, 403);
  }

  try {
    const ids = await resoudreMessages(corps, action);
    if (ids === null) return json({ etat: 'erreur', message: 'Aucun mail désigné.' }, 400);
    if (ids.length > SELECTION_MAX) {
      return json({ etat: 'erreur', message: `Au plus ${SELECTION_MAX} mails à la fois.` }, 400);
    }

    const jeton = await jetonAccesGestion();
    if (jeton.etat !== 'ok') {
      return json({ etat: 'sans_jeton', message: `Connexion Google indisponible : ${jeton.motif}` }, 503);
    }

    const issues = await mapConcurrenceBornee(ids, SIMULTANES, (id) => agirSurUn(jeton.jeton, id, action));
    const faits = issues.filter((i) => i.ok).map((i) => i.messageId);
    const refuses = issues.filter((i) => !i.ok);

    // 🔴 NOTRE BASE N'EST TOUCHÉE QUE POUR CE QUE GMAIL A ACCEPTÉ. Jamais pour le lot entier.
    const auteur = await auteurDeLaRequete(request);
    if (action === 'supprimer') await tracerSuppression(faits, auteur);
    else {
      const issue = await marquerCorbeille(faits, action === 'corbeille', auteur);
      if (issue.etat === 'sans_schema') {
        return json({ etat: 'sans_schema', message: 'Bientôt disponible — une mise à jour de la base est nécessaire.' }, 409);
      }
    }

    // Un refus de DROIT se distingue d'un refus ordinaire : l'un se répare dans admin.google.com, l'autre se réessaie.
    const droitManquant = refuses.some((r) => r.motif === MENTION_DROIT_SUPPRESSION);
    return json({
      etat: faits.length > 0 || refuses.length === 0 ? 'ok' : 'refus',
      faits: faits.length,
      refuses: refuses.map((r) => ({ messageId: r.messageId, motif: r.motif ?? 'Refusé par Gmail.' })),
      droitManquant,
      message: mot(action, faits.length, refuses.length, droitManquant),
    });
  } catch (e) {
    console.error('[gestion/corbeille] geste impossible', e);
    return json({ etat: 'erreur', message: 'Le geste n’a pas abouti.' }, 503);
  }
}

/**
 * ══ 🔴 DES ÉCHANGES EN ENTRÉE, DES MAILS EN SORTIE — ET LA BORNE DÉPEND DU GESTE ════════════════════════════════
 *
 * L'écran désigne toujours des LIGNES, c'est-à-dire des échanges : c'est ce qu'il montre, et c'est ce sur quoi on
 * clique. La corbeille de Gmail, elle, porte sur des MAILS. La traduction se fait ici, et elle n'est pas la même
 * dans les deux sens :
 *
 *   · « Supprimer » depuis une ligne ordinaire → TOUS les mails de l'échange. Supprimer une conversation supprime
 *     la conversation ; c'est ce que fait Gmail quand on la jette depuis sa liste.
 *   · « Réintégrer » / « Supprimer définitivement » depuis la Corbeille → SEULEMENT les mails qui y sont. Un
 *     échange peut être encore vivant avec un seul mail jeté : agir sur les autres réintégrerait — ou pire,
 *     supprimerait — des mails que personne n'a jamais mis à la corbeille.
 */
async function resoudreMessages(corps: { filIds?: unknown }, action: Action): Promise<number[] | null> {
  if (!Array.isArray(corps.filIds)) return null;
  const fils = [...new Set(corps.filIds.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))];
  if (fils.length === 0) return null;
  const ids = await messagesDuFil(fils, action !== 'corbeille');
  return ids.length === 0 ? null : ids;
}

/**
 * UN MESSAGE, DE BOUT EN BOUT : le retrouver dans Gmail, puis y agir.
 *
 * ⚠️ RETROUVER COÛTE UN APPEL DE PLUS quand l'identifiant Gmail n'est pas mémorisé — c'est le cas de tout ce que la
 * relève a rapporté du dossier « [Gmail]/Corbeille », qui passe par IMAP et n'en sait rien. On le mémorise au
 * passage : le geste suivant sur le même mail n'aura plus à chercher.
 *
 * ⚠️ « INTROUVABLE DANS GMAIL » N'EST PAS UNE PANNE, et c'est même le cas NORMAL après 30 jours : Gmail a effacé
 * lui-même le contenu de sa corbeille. On le dit tel quel, mail par mail.
 */
async function agirSurUn(jeton: string, messageId: number, action: Action): Promise<Issue> {
  const ancrage = await lireAncrage(messageId);
  if (ancrage === null) return { messageId, ok: false, motif: 'Ce mail n’existe pas chez nous.' };

  let gmailId = ancrage.gmailMessageId;
  if (gmailId === null) {
    const trouve = await chercherParMessageId(jeton, ancrage.messageIdRfc, { fetch });
    if (!trouve.ok) return { messageId, ok: false, motif: trouve.motif };
    if (trouve.valeur === null) {
      return {
        messageId, ok: false,
        motif: 'Ce mail n’est plus dans la boîte Gmail de gestion@ — Gmail efface le contenu de sa corbeille au '
          + 'bout de 30 jours.',
      };
    }
    gmailId = trouve.valeur.id;
    await memoriserAncrage(messageId, { id: trouve.valeur.id, threadId: trouve.valeur.threadId });
  }

  const r = action === 'supprimer'
    ? await supprimerDefinitivementGmail(jeton, gmailId, { fetch })
    : await corbeilleGmail(jeton, gmailId, action === 'corbeille', { fetch });
  return r.ok ? { messageId, ok: true } : { messageId, ok: false, motif: r.motif };
}

/** Ce que l'écran affiche. Toujours un NOMBRE, jamais « c'est fait » : un lot mêlé doit se lire d'un coup d'œil. */
export function mot(action: Action, faits: number, refuses: number, droitManquant: boolean): string {
  if (droitManquant) return MENTION_DROIT_SUPPRESSION;
  const quoi = faits > 1 ? 'mails' : 'mail';
  const verbe = action === 'corbeille'
    ? 'mis à la corbeille'
    : action === 'reintegrer' ? 'réintégré' : 'supprimé définitivement';
  const accord = faits > 1 ? `${verbe}${verbe.endsWith('s') ? '' : 's'}` : verbe;
  if (faits === 0) return `Aucun mail ${verbe} — ${refuses} refusé${refuses > 1 ? 's' : ''}.`;
  const base = `${faits} ${quoi} ${accord}.`;
  return refuses === 0 ? base : `${base} ${refuses} refusé${refuses > 1 ? 's' : ''}.`;
}
