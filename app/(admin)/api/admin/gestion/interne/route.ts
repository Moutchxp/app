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
/**
 * 🔴🔴 LOT PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE, POINT 2 — marquer « interne » DÉTACHE les biens du mail,
 * selon la fenêtre choisie, par la porte existante. Et un « Annuler » les remet, dans les secondes qui suivent.
 */
import {
  biensADetacher, detacherBiensApresInterne, remettreBiensDetaches,
} from '../../../../../lib/gestion/interneRepo';
/**
 * 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 2 — L'AUTRE SENS : rattacher un bien LÈVE la marque « interne » du
 * mail, selon la même fenêtre. Et un « Annuler » remet l'état d'avant — la marque ET le rattachement.
 */
import {
  mailsInternesParmi, remettreInterneApresAnnulation, retirerBiensApresAnnulationLevee,
} from '../../../../../lib/gestion/interneRepo';
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
 *   · GET    ?messages=1,2,3    ce que la base sait de chaque mail (marque vivante, marque connue)
 *   · GET    ?detacherait=1     les biens que « marquer interne » détacherait, nommés (aperçu, lecture seule)
 *   · GET    ?leverait=1        les mails dont un rattachement lèverait la marque (aperçu, lecture seule)
 *   · POST   { filIds }         marquer — et détacher les biens des mails couverts par la fenêtre
 *   · POST   { remettreLevee }  l'« Annuler » de l'autre sens : retire les liens nommés, repose les marques
 *     (🔴 la LEVÉE elle-même n'est pas un verbe de cette route : `rattacher()` la fait, voir son encadré)
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
     * ══ 🔴🔴 POINT 2 — L'APERÇU DU DÉTACHEMENT, POUR LA CONFIRMATION ═══════════════════════════════════════════
     *
     * `?detacherait=1&messageId=…&mails=…&choix=…` rend les biens que « Marquer interne » détacherait, nommés.
     *
     * 🔴 C'EST LE SERVEUR QUI RÉPOND, ET NON L'ÉCRAN QUI DEVINE. L'écran connaît les biens du mail AFFICHÉ ; la
     * fenêtre choisie, elle, peut couvrir toute la conversation — donc des mails dont il n'a pas les liens. Une
     * confirmation qui ne nommerait que les biens visibles promettrait moins qu'elle ne fait.
     *
     * 🔒 LECTURE SEULE : `biensADetacher` n'écrit rien. C'est le POST qui agit.
     */
    if (url.searchParams.get('detacherait') === '1') {
      const n = Number(url.searchParams.get('messageId'));
      const choixBrut = url.searchParams.get('choix');
      const couverts = mailsDuGeste({
        messageId: Number.isSafeInteger(n) && n > 0 ? n : null,
        mails: lireFilIds(url.searchParams.get('mails')),
        choix: choixBrut === 'mail' || choixBrut === 'suite' ? choixBrut : 'conversation',
      });
      return Response.json({ etat: 'ok', biens: await biensADetacher(couverts) }, { headers: ENTETES });
    }

    /**
     * ══ 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 2 — L'APERÇU DE LA LEVÉE, POUR LA CONFIRMATION ═══════════════
     *
     * `?leverait=1&messageId=…&mails=…&choix=…` rend les mails dont le rattachement retirerait la marque
     * « interne ».
     *
     * 🔴 C'EST LE SERVEUR QUI RÉPOND, et pour deux raisons que l'écran ne peut pas tenir seul :
     *   ① la RÈGLE DU REPLI (`interneDuMail`) demande les deux tables — un mail peut être interne sans porter
     *      aucune marque par mail, par la seule marque de l'échange ;
     *   ② la FENÊTRE peut couvrir des mails dont l'écran n'a pas les marques.
     * Une confirmation qui ne regarderait que le mail affiché annoncerait moins qu'elle ne fait.
     *
     * 🔒 LECTURE SEULE : `mailsInternesParmi` n'écrit rien. C'est le POST qui agit.
     */
    if (url.searchParams.get('leverait') === '1') {
      const n = Number(url.searchParams.get('messageId'));
      const messageId = Number.isSafeInteger(n) && n > 0 ? n : null;
      const choixBrut = url.searchParams.get('choix');
      const couverts = mailsDuGeste({
        messageId,
        mails: lireFilIds(url.searchParams.get('mails')),
        choix: choixBrut === 'mail' || choixBrut === 'suite' ? choixBrut : 'conversation',
      });
      /* ⚠️ SANS LISTE DE MAILS, LA QUESTION PORTE SUR LE SEUL MAIL VISÉ : « on ne devine pas une portée » (règle
         de `mailsDuGeste`), mais on ne refuse pas de répondre pour autant — l'écran a besoin de savoir si CE
         mail est interne, même quand il n'a pas chargé la conversation. */
      const vises = couverts.length > 0 ? couverts : (messageId === null ? [] : [messageId]);
      const internes = await mailsInternesParmi(vises);
      return Response.json(
        { etat: 'ok', interne: internes.includes(messageId ?? 0), mails: internes }, { headers: ENTETES });
    }

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
  /** 🔴🔴 POINT 2 — les liens que l'« Annuler » demande à remettre. Vide = le verbe d'avant ce lot. */
  remettre: number[];
  /**
   * ══ 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 2 — LES TROIS CHAMPS DE L'AUTRE SENS ═══════════════════════════
   *
   * · `remettreLevee` — ce POST est l'ANNULATION d'une levée : il retire les liens nommés (`remettre`) et
   *                     repose la marque sur les mails nommés (`marques`).
   *
   * ⚠️ IL N'Y A PAS DE VERBE « LEVER », ET C'EST VOULU : la levée est faite par `rattacher()` lui-même, la seule
   * porte d'écriture d'un rattachement. Un verbe de route en plus aurait été une SECONDE façon de lever, donc une
   * seconde règle à tenir d'accord — et la première oubliée aurait suffi à recréer l'état interdit.
   * · `marques`       — les mails dont la marque doit revenir. 🔴 CE N'EST PAS `mails` : `mails` est la
   *                     conversation ENTIÈRE, dans l'ordre chronologique, qui sert à découper la fenêtre. Ce que
   *                     l'annulation doit remettre, ce sont les mails que la levée a RÉELLEMENT touchés — elle
   *                     les a rendus, et l'écran les renvoie. Confondre les deux aurait marqué « interne » toute
   *                     une conversation pour annuler un geste qui n'avait levé qu'un mail.
   */
  remettreLevee: boolean;
  marques: number[];
} | null> {
  try {
    const c = (await request.json()) as {
      filIds?: unknown; motif?: unknown; messageId?: unknown; mails?: unknown; choix?: unknown;
      remettre?: unknown; remettreLevee?: unknown; marques?: unknown;
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
      /* ⚠️ MÊME LECTURE BORNÉE QUE LES AUTRES LISTES : `lireFilIds` ne garde que des entiers positifs, dédoublonnés
         et plafonnés. Un identifiant de lien n'est pas un identifiant d'échange, mais la règle de lecture est la
         même — et c'est elle qui compte ici. */
      remettre: lireFilIds(c.remettre),
      /* ⚠️ `=== true` ET NON UNE VÉRITÉ APPROCHÉE : une chaîne vide, un zéro ou un objet ne déclenchent pas un
         verbe d'écriture par accident. */
      remettreLevee: c.remettreLevee === true,
      marques: lireFilIds(c.marques),
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

  /**
   * ══ 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 2 — LES DEUX VERBES DE L'AUTRE SENS ════════════════════════════
   *
   * Ils sont posés AVANT le garde « aucun échange désigné » parce qu'ils ne portent pas sur un échange : leur
   * cible est un MAIL et sa fenêtre. Les confondre avec le marquage aurait obligé l'écran à inventer un `filIds`
   * pour un geste qui n'en a pas besoin.
   *
   * ⚠️ DEUX NOMS DISTINCTS, ET PAS UN DRAPEAU SUR LE MARQUAGE : « lever » et « remettre après annulation » ne
   * font pas la même chose que « marquer », et un verbe qui changerait de sens selon un champ du corps serait
   * illisible dans six mois — et impossible à éprouver proprement.
   */
  if (corps.remettreLevee) {
    try {
      const auteur = await auteurDeLaRequete(request);
      /**
       * 🔴 LES LIENS D'ABORD, LA MARQUE ENSUITE, ET L'ORDRE EST LA RÈGLE : reposer « interne » sur un mail qui
       * porte encore son bien reconstruirait, le temps d'une requête, l'état même que ce lot ferme. Si le retrait
       * échoue, la marque ne revient pas — on préfère un geste à moitié défait et visible à un état interdit.
       */
      const liens = await retirerBiensApresAnnulationLevee(corps.remettre, auteur);
      const marques = await remettreInterneApresAnnulation({ messageIds: corps.marques, auteur });
      return Response.json({ ok: true, liens, marques }, { headers: ENTETES });
    } catch (e) {
      console.error('[api/admin/gestion/interne] annulation de la levée impossible', e);
      return Response.json({ erreur: 'Annulation impossible : erreur interne du serveur.' },
        { status: 503, headers: ENTETES });
    }
  }

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
    const couverts = mailsDuGeste(corps);
    const parMail = await marquerInterneDesMessages({ messageIds: couverts, auteur });
    /**
     * ══ 🔴🔴 POINT 2 — ET LES BIENS PARTENT AVEC, par la porte existante ═══════════════════════════════════════
     *
     * DÉCISION D'ARNO (04/10/2026) : « marquer Interne DÉTACHE les biens de ce mail, selon la fenêtre choisie […],
     * par la porte existante (statut 'retire'), tracé. »
     *
     * 🔴 APRÈS LE MARQUAGE, ET JAMAIS AVANT. Si le marquage échoue, rien n'est détaché : on ne retire pas des
     * rattachements pour un geste qui n'a pas abouti.
     *
     * 🔴 LA LISTE EST RENDUE À L'APPELANT, et c'est elle qui rend l'« Annuler » possible : sans les identifiants
     * des liens, l'écran ne saurait pas quoi remettre.
     */
    const detaches = await detacherBiensApresInterne(couverts, auteur);
    return Response.json(
      { ok: true, nb: issue.nb, nbMails: parMail.ok ? parMail.nb : 0, detaches }, { headers: ENTETES });
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
    /**
     * ══ 🔴🔴 POINT 2 — ET L'« ANNULER » REMET LES BIENS DÉTACHÉS ════════════════════════════════════════════════
     *
     * DÉCISION D'ARNO : « Après : “Annuler” pendant quelques secondes, qui remet EXACTEMENT les rattachements
     * d'avant. »
     *
     * 🔴 ON NE REMET QUE CE QUE L'APPELANT NOMME, **ET** que ce geste-là avait retiré : `remettreBiensDetaches`
     * vérifie le motif en base avant de remettre. Un lien retiré par le suivi d'une conversation, ou à la main,
     * n'a pas à ressusciter parce qu'on annule un marquage « interne ».
     *
     * ⚠️ `remettre` ABSENT ⇒ LE VERBE EST EXACTEMENT CELUI D'AVANT CE LOT : la case du bandeau, qui retire la
     * marque et ne touche à aucun rattachement.
     */
    const remis = corps.remettre.length === 0 ? 0 : await remettreBiensDetaches(corps.remettre, auteur);
    return Response.json(
      { ok: true, nb: issue.nb, nbMails: parMail.ok ? parMail.nb : 0, remis }, { headers: ENTETES });
  } catch (e) {
    console.error('[api/admin/gestion/interne] annulation impossible', e);
    return Response.json({ erreur: 'Annulation impossible : erreur interne du serveur.' },
      { status: 503, headers: ENTETES });
  }
}
