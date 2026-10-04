import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import { annulerInterne, lireInterne, marquerInterne } from '../../../../../lib/gestion/interneRepo';
/**
 * 🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 7 — « INTERNE » PAR MAIL (migration 297), enfin câblée.
 *
 * Le verbe d'ÉCHANGE est conservé tel quel : il reste le repli, et c'est la case du bandeau. Ce qui s'ajoute est
 * la lecture et l'écriture au grain du MAIL, selon les trois fenêtres d'Arno.
 */
import {
  annulerInterneDesMessages, lireInterneDesMessages, marquerInterneDesMessages,
} from '../../../../../lib/gestion/interneMessageRepo';
import { mailsCouvertsParLeChoix, type ChoixInterne } from '../../../../../lib/gestion/interneDuMail';
import { interneDisponible, interneDuMessageDisponible } from '../../../../../lib/gestion/schema';

/**
 * /api/admin/gestion/interne — LOT RATTACHER-EN-ECRIVANT : UN ÉCHANGE ENTRE COLLÈGUES.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 UN STATUT POSÉ À LA MAIN, ET SEULEMENT À LA MAIN. Chaque verbe exige `exigerCompteActif(request, 'gestion')` et
 * écrit le NOM de la personne : il n'existe aucun chemin par lequel un programme pourrait marquer un échange
 * interne, et la base le refuse de son côté (migration 281).
 *
 * 🔴🔴 LA CIBLE EST UN **ÉCHANGE** (`filIds`), PAS UN MAIL. C'est la différence avec `/hors-gestion`, et elle vient
 * d'un constat d'Arno : marqué sur le seul mail qu'on écrit, le statut serait perdu dès que le collègue répond.
 * Voir l'encadré de `interneRepo`.
 *
 * LES VERBES — tous RÉVERSIBLES, aucun ne supprime rien :
 *   · GET    ?fils=1,2,3        les marques vivantes de ces échanges
 *   · POST   { filIds }         marquer
 *   · DELETE { filIds, motif? } annuler (écrit `retire_le` ; la ligne reste, datée et signée)
 *
 * ⚠️ `sans_schema` (migration 281 non appliquée) N'EST PAS UNE ERREUR : c'est un état, rendu en 200. L'écran grise
 * alors le bouton en disant pourquoi. Une 500 ferait croire à une panne.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

/** Une liste d'identifiants d'ÉCHANGES, BORNÉE. PUR : c'est elle qu'on éprouve, pas la route entière. */
export const FILS_MAX = 500;

export function lireFilIds(brut: unknown): number[] {
  const liste = Array.isArray(brut) ? brut
    : typeof brut === 'string' ? brut.split(',')
      : typeof brut === 'number' ? [brut] : [];
  const propres = liste
    .map((x) => Number(typeof x === 'string' ? x.trim() : x))
    .filter((n) => Number.isSafeInteger(n) && n > 0);
  return [...new Set(propres)].slice(0, FILS_MAX);
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  try {
    if (!(await interneDisponible())) {
      return Response.json({ etat: 'sans_schema', data: {} }, { headers: ENTETES });
    }
    const url = new URL(request.url);

    /**
     * ══ 🔴🔴 POINT 7 — LA LECTURE AU GRAIN DU MAIL ════════════════════════════════════════════════════════════
     *
     * `?messages=1,2,3` rend, pour chaque mail, ce que la base sait de lui : la marque est-elle VIVANTE, et a-t-on
     * DÉJÀ décidé pour ce mail ? Les deux, parce qu'une marque retirée n'est pas une absence de marque — c'est un
     * « non » qui empêche la marque d'échange de ressusciter le statut (voir `interneDuMail`).
     *
     * ⚠️ SANS LA 297, ON LE DIT (`sans_schema_message`) PLUTÔT QUE DE RENDRE UN OBJET VIDE : un objet vide se
     * lirait « aucun mail n'est interne », ce qui serait faux — c'est la marque d'échange qui répond alors.
     */
    const brutMessages = url.searchParams.get('messages');
    if (brutMessages !== null) {
      if (!(await interneDuMessageDisponible())) {
        return Response.json({ etat: 'sans_schema_message', data: {} }, { headers: ENTETES });
      }
      const parMail = await lireInterneDesMessages(lireFilIds(brutMessages));
      return Response.json(
        { etat: 'ok', data: Object.fromEntries([...parMail].map(([k, v]) => [String(k), v])) },
        { headers: ENTETES });
    }

    const marques = await lireInterne(lireFilIds(url.searchParams.get('fils')));
    // Une `Map` ne se sérialise pas en JSON : on rend un objet, indexé par identifiant d'échange.
    return Response.json(
      { etat: 'ok', data: Object.fromEntries([...marques].map(([k, v]) => [String(k), v])) },
      { headers: ENTETES });
  } catch (e) {
    // Pas de catch muet : un objet vide se lirait « aucun échange n'est interne », ce qui serait faux.
    console.error('[api/admin/gestion/interne] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}

/** Le corps d'un geste, ou `null` s'il est illisible. */
async function corpsDuGeste(request: Request): Promise<{
  filIds: number[]; motif: string | null;
  /** 🔴 POINT 7 — le geste AU GRAIN DU MAIL : le mail visé, les mails de l'échange, et le choix de fenêtre. */
  messageId: number | null; mails: number[]; choix: ChoixInterne;
} | null> {
  try {
    const c = (await request.json()) as {
      filIds?: unknown; motif?: unknown; messageId?: unknown; mails?: unknown; choix?: unknown;
    };
    const n = Number(c.messageId);
    return {
      filIds: lireFilIds(c.filIds),
      motif: typeof c.motif === 'string' ? c.motif.trim().slice(0, 300) : null,
      messageId: Number.isSafeInteger(n) && n > 0 ? n : null,
      /** ⚠️ L'ORDRE EST CHRONOLOGIQUE, du plus ancien au plus récent — jamais celui de l'affichage. */
      mails: lireFilIds(c.mails),
      /* ⚠️ LE DÉFAUT EST « toute la conversation », et c'est le sens de la case du bandeau : elle a toujours porté
         sur l'ÉCHANGE. Un défaut plus étroit aurait changé, en silence, ce que ce clic fait depuis des mois. */
      choix: c.choix === 'mail' || c.choix === 'suite' ? c.choix : 'conversation',
    };
  } catch { return null; }
}

/**
 * ══ 🔴🔴 POINT 7 — LES MAILS QUE CE GESTE COUVRE ═════════════════════════════════════════════════════════════════
 *
 * RÈGLE D'ARNO : « le choix fait sur un mail s'applique selon les 3 fenêtres ». La découpe vient du module PUR
 * `mailsCouvertsParLeChoix`, et elle n'est écrite nulle part ailleurs.
 *
 * ⚠️ RIEN À MARQUER PAR MAIL quand l'appelant ne donne ni mail visé ni liste : le geste reste celui de l'ÉCHANGE,
 * exactement comme avant ce lot. On ne devine pas une portée.
 */
function mailsDuGeste(c: { messageId: number | null; mails: number[]; choix: ChoixInterne }): number[] {
  if (c.messageId === null || c.mails.length === 0) return [];
  return mailsCouvertsParLeChoix(c.mails, c.messageId, c.choix);
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const corps = await corpsDuGeste(request);
  if (corps === null) return Response.json({ erreur: 'Requête illisible.' }, { status: 400, headers: ENTETES });
  if (corps.filIds.length === 0) {
    return Response.json({ erreur: 'Aucun échange désigné.' }, { status: 400, headers: ENTETES });
  }

  try {
    const auteur = await auteurDeLaRequete(request);
    const issue = await marquerInterne({ filIds: corps.filIds, auteur });
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409, headers: ENTETES });
    /**
     * 🔴🔴 POINT 7 — ET LA MARQUE PAR MAIL, POUR LES MAILS QUE LE CHOIX COUVRE. Les deux sont écrites, et c'est
     * voulu : la marque d'échange reste le REPLI (pour les mails qu'aucune fenêtre ne couvre, et pour les
     * échanges d'avant ce lot), la marque par mail est la vérité précise.
     *
     * ⚠️ SON ÉCHEC NE FAIT PAS ÉCHOUER LE GESTE : la marque d'échange est posée, l'écran est donc déjà juste par
     * le repli. On rend le nombre, et l'appelant peut le dire.
     */
    const parMail = await marquerInterneDesMessages({ messageIds: mailsDuGeste(corps), auteur });
    return Response.json(
      { ok: true, nb: issue.nb, nbMails: parMail.ok ? parMail.nb : 0 }, { headers: ENTETES });
  } catch (e) {
    console.error('[api/admin/gestion/interne] marquage impossible', e);
    return Response.json({ erreur: 'Marquage impossible : erreur interne du serveur.' },
      { status: 503, headers: ENTETES });
  }
}

/**
 * ANNULER — et non SUPPRIMER. Le verbe HTTP dit « retire cette marque » ; en base, la ligne reste, avec qui l'a
 * annulée et quand. Même convention que `/hors-gestion`.
 */
export async function DELETE(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const corps = await corpsDuGeste(request);
  if (corps === null) return Response.json({ erreur: 'Requête illisible.' }, { status: 400, headers: ENTETES });
  if (corps.filIds.length === 0) {
    return Response.json({ erreur: 'Aucun échange désigné.' }, { status: 400, headers: ENTETES });
  }

  try {
    const auteur = await auteurDeLaRequete(request);
    const issue = await annulerInterne({ filIds: corps.filIds, motif: corps.motif, auteur });
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409, headers: ENTETES });
    /**
     * 🔴🔴 POINT 7 — ET LE RETRAIT PAR MAIL. Il est AUSSI IMPORTANT QUE LA POSE, et pour une raison précise : la
     * ligne retirée reste en base, et sa présence dit « quelqu'un s'est prononcé sur ce mail ». C'est elle qui
     * empêche la marque d'échange de ressusciter le statut au prochain affichage — sans quoi retirer « Interne »
     * n'aurait AUCUN effet visible, et l'on cliquerait trois fois avant de conclure que le bouton est cassé.
     */
    const parMail = await annulerInterneDesMessages({
      messageIds: mailsDuGeste(corps), auteur, motif: corps.motif,
    });
    return Response.json(
      { ok: true, nb: issue.nb, nbMails: parMail.ok ? parMail.nb : 0 }, { headers: ENTETES });
  } catch (e) {
    console.error('[api/admin/gestion/interne] annulation impossible', e);
    return Response.json({ erreur: 'Annulation impossible : erreur interne du serveur.' },
      { status: 503, headers: ENTETES });
  }
}
