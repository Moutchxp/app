import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import { contexteEtape2, enregistrerContactExterne } from '../../../../../lib/gestion/contactExterneRepo';
import { typeRecu } from '../../../../../lib/gestion/contactExterne';

/**
 * ══ /api/admin/gestion/contact-externe — LOT CONTACTS-EXTERNES : LA 2ᵉ ÉTAPE DE LA MODALE ═════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * LES DEUX VERBES, ET CE QU'ILS NE FONT PAS :
 *
 *   · GET  ?message=N&biens=A,B[&interne=1][&horsGestion=1]
 *       « l'étape 2 est-elle demandée pour ce mail et ces biens, et si oui que montre-t-elle ? »
 *       🔒 LECTURE SEULE. Aucun classement, aucun contact mémorisé.
 *
 *   · POST { email, nom?, telephone?, type? }
 *       mémorise (ou complète) le CONTACT EXTERNE, et rien d'autre. Elle rend son identifiant.
 *
 * 🔴🔴 CE QUE CETTE ROUTE NE FAIT **PAS**, ET C'EST TOUT L'INTÉRÊT : ELLE NE CLASSE RIEN.
 *
 * Le rattachement au bien ET les relations aux personnes passent par la porte qui existe déjà —
 * `POST /api/admin/gestion/suivi`, avec son journal, son auteur, ses périodes et sa réversibilité. Le `classement`
 * qu'elle reçoit porte simplement, depuis ce lot, un champ `personnes` facultatif.
 *
 * ⚠️ POURQUOI PAS UNE SECONDE PORTE D'ÉCRITURE ICI. Deux chemins pour poser un classement donneraient un jour deux
 * comportements — et c'est celui qu'on regarde le moins qui garderait l'erreur. C'est la règle écrite en tête de
 * `/api/admin/gestion/classement`, et elle vaut ici à l'identique. La seule écriture de cette route concerne la
 * MÉMOIRE DU CONTACT (nom, téléphone, type), qui n'est ni un classement ni un rattachement.
 *
 * ⚠️ LES CLÉS DE BIENS VOYAGENT DANS L'ADRESSE (`?biens=`), ET C'EST SANS DANGER : un numéro de lot WIPPIMMO n'est
 * pas une donnée personnelle. Les NOMS, eux, ne sortent que dans le CORPS de la réponse — jamais dans une URL, donc
 * jamais dans les journaux du serveur ni l'historique du navigateur (règle de confidentialité du projet).
 *
 * 🔒 Le droit `gestion` est exigé aux deux verbes, et l'auteur vient de la SESSION, jamais du navigateur.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

/** Un identifiant propre, ou `null`. PUR. */
export function entier(brut: unknown): number | null {
  const n = Number(typeof brut === 'string' ? brut.trim() : brut);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * LES CLÉS DE BIENS REÇUES, BORNÉES ET DÉDOUBLONNÉES. PUR.
 *
 * ⚠️ CINQUANTE AU PLUS, comme la liste de biens d'un classement (`classementRecu`, route du suivi). Ce n'est pas
 * une règle métier : c'est le refus d'un payload absurde.
 */
export function biensRecus(brut: string | null): string[] {
  const liste = (brut ?? '').split(',').map((x) => x.trim()).filter((x) => x !== '');
  return [...new Set(liste)].slice(0, 50);
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const u = new URL(request.url);
  const messageId = entier(u.searchParams.get('message'));
  if (messageId === null) {
    return Response.json({ etat: 'erreur', message: 'Mail non désigné.' }, { status: 422, headers: ENTETES });
  }
  try {
    const data = await contexteEtape2({
      messageId,
      biensCoches: biensRecus(u.searchParams.get('biens')),
      interne: u.searchParams.get('interne') === '1',
      horsGestion: u.searchParams.get('horsGestion') === '1',
    });
    if (data === null) {
      return Response.json({ etat: 'erreur', message: 'Ce mail n’existe pas.' },
        { status: 404, headers: ENTETES });
    }
    return Response.json({ etat: 'ok', data }, { headers: ENTETES });
  } catch (e) {
    /**
     * ⚠️ PAS DE CATCH MUET, ET SURTOUT PAS DE « requise: false » DE SECOURS. Répondre « pas d'étape 2 » sur une
     * lecture en échec ferait classer en silence un mail dont on n'a PAS pu vérifier l'expéditeur — c'est-à-dire
     * perdre l'information exactement dans le cas où ce lot existe pour la retenir. L'écran dit que la lecture a
     * échoué, et laisse classer le bien comme avant.
     */
    console.error('[gestion/contact-externe] lecture impossible (message=%d)', messageId, e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  let corps: Record<string, unknown>;
  try { corps = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ erreur: 'Requête invalide.' }, { status: 422, headers: ENTETES }); }

  const email = typeof corps.email === 'string' ? corps.email : '';
  try {
    const issue = await enregistrerContactExterne({
      email,
      // ⚠️ LES TROIS CHAMPS SONT FACULTATIFS, et un vide reste un vide : le dépôt n'écrase jamais une valeur
      //   déjà saisie avec du blanc (voir `enregistrerContactExterne`).
      nom: typeof corps.nom === 'string' ? corps.nom : null,
      telephone: typeof corps.telephone === 'string' ? corps.telephone : null,
      // 🔴 LE TYPE EST RE-VALIDÉ CONTRE LA LISTE FERMÉE D'ARNO : rien n'est cru sur parole.
      type: typeRecu(corps.type),
      auteur: await auteurDeLaRequete(request),
    });
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409, headers: ENTETES });
    return Response.json({ ok: true, id: issue.id }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/contact-externe] mémorisation impossible', e);
    return Response.json({ erreur: 'Le geste n’a pas abouti : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}
