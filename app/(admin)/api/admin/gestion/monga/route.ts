import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import {
  casDesInterventions, chercherUnLotMonga, encartMonga, interventionsMonga,
} from '../../../../../lib/gestion/mongaRepo';
import {
  creerEvenementEtRelier, delierLaReference, relierLaReference,
} from '../../../../../lib/gestion/mongaClassement';
import { mongaDisponible } from '../../../../../lib/gestion/schema';

/**
 * /api/admin/gestion/monga — LOT MONGA-1 : L'ENCART D'UNE INTERVENTION, ET LE CLIC QUI LA RELIE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * LES VERBES :
 *   · GET  ?message=N            ce que l'encart montre pour ce mail (référence, libellé, adresse, lots
 *                                candidats avec leur propriétaire et leur locataire du jour, événements ouverts)
 *   · GET  ?cherche=<terme>      le moteur de recherche du cas « aucun lot reconnu à cette adresse »
 *   · GET  ?aRelier=1            les interventions Monga qui attendent un lien (le filtre du point 4)
 *   · POST { reference, evenementId }                relier à un événement EXISTANT
 *   · POST { reference, messageId, lotCle }          créer l'événement « <libellé Monga> » sur ce lot, et relier
 *   · POST { reference, delier: true }               l'« Annuler » des secondes qui suivent, et le « Délier »
 *
 * 🔴🔴 L'AUTEUR VIENT DE LA SESSION, JAMAIS DU NAVIGATEUR, et ici ce n'est pas une précaution de forme : la base
 * REFUSE un lien Monga signé « automatique » (`gestion_monga_lien_humain_chk`). C'est la décision n° 1 d'Arno —
 * « premier rattachement d'une référence = TOUJOURS un clic d'Arno » — et elle est tenue à trois étages : par
 * l'écran, par cette route, et par la contrainte.
 *
 * ⚠️ `sans_schema` (migration 311 non appliquée) N'EST PAS UNE ERREUR : c'est un état, rendu en 200. L'écran ne
 * rend alors aucun encart et se comporte exactement comme avant ce lot.
 *
 * ⚠️ AUCUN ENVOI, AUCUNE ÉCRITURE DANS GMAIL NI DANS LE DRIVE. Cette route ne touche que la base.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

/** Un identifiant propre, ou `null`. PUR. */
function entier(brut: unknown): number | null {
  const n = Number(typeof brut === 'string' ? brut.trim() : brut);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * UNE RÉFÉRENCE MONGA RE-VALIDÉE, ou `null`. PUR.
 *
 * 🔴 ELLE EST RE-VALIDÉE ICI MÊME SI LA BASE LA VALIDE AUSSI (`gestion_monga_lien_reference_chk`). Deux gardes
 * pour la même règle, et ce n'est pas une redondance : celle de la base protège la donnée, celle-ci donne un
 * message lisible au lieu d'une erreur de contrainte.
 */
export function referenceRecue(brut: unknown): string | null {
  if (typeof brut !== 'string') return null;
  const t = brut.trim().toUpperCase();
  return /^MNG-[0-9]{4,6}$/.test(t) ? t : null;
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  if (!(await mongaDisponible())) return Response.json({ etat: 'sans_schema' }, { headers: ENTETES });

  const url = new URL(request.url);
  try {
    const cherche = url.searchParams.get('cherche');
    if (cherche !== null) {
      return Response.json({ etat: 'ok', lots: await chercherUnLotMonga(cherche) }, { headers: ENTETES });
    }
    if (url.searchParams.get('aRelier') !== null) {
      const interventions = await interventionsMonga({ reliees: false });
      /* 🔴 LOT MONGA-1, POINT 5 — le compte par cas voyage AVEC la liste : une seconde requête pour un chiffre
         qui se déduit des mêmes lignes ferait deux vérités possibles le temps d'un aller-retour. */
      return Response.json(
        { etat: 'ok', interventions, cas: await casDesInterventions(interventions) }, { headers: ENTETES });
    }
    const messageId = entier(url.searchParams.get('message'));
    if (messageId === null) {
      return Response.json({ erreur: 'Mail inconnu.' }, { status: 422, headers: ENTETES });
    }
    /* ⚠️ `encart: null` N'EST PAS UNE ERREUR : ce mail n'est pas un mail Monga, ou n'en porte pas la référence.
       L'écran n'affiche alors rien, ce qui est exactement son comportement d'avant ce lot. */
    return Response.json(
      { etat: 'ok', encart: await encartMonga(String(messageId)) }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/monga] lecture impossible', e);
    return Response.json({ erreur: 'Lecture impossible : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const auteur = await auteurDeLaRequete(request);

  const corps = (await request.json().catch(() => null)) as {
    reference?: unknown; evenementId?: unknown; messageId?: unknown; lotCle?: unknown;
    delier?: unknown; motif?: unknown; categorie?: unknown; urgence?: unknown; ouvertLe?: unknown;
  } | null;
  if (corps === null) return Response.json({ erreur: 'Requête illisible.' }, { status: 400, headers: ENTETES });

  const reference = referenceRecue(corps.reference);
  if (reference === null) {
    return Response.json({ erreur: 'Référence Monga attendue (« MNG-23987 »).' },
      { status: 422, headers: ENTETES });
  }
  const motif = typeof corps.motif === 'string' && corps.motif.trim() !== ''
    ? corps.motif.trim().slice(0, 300) : undefined;

  try {
    if (corps.delier === true) {
      const issue = await delierLaReference({ reference, auteur, motif });
      return issue.ok
        ? Response.json({ etat: 'ok', ...issue }, { headers: ENTETES })
        : Response.json({ erreur: issue.motif ?? 'Annulation impossible.' },
          { status: 409, headers: ENTETES });
    }

    const evenementId = entier(corps.evenementId);
    if (evenementId !== null) {
      /* 🔴 LE MAIL DEPUIS LEQUEL LE CLIC EST PARTI est transmis : c'est « l'ancre », et il est classé même s'il
         dormait à la corbeille — voir l'encadré `ancre` de `classerUnMailMonga`. Facultatif : sans lui, tous les
         mails de la référence suivent la règle automatique. */
      const issue = await relierLaReference({
        reference, evenementId: String(evenementId), auteur,
        messageId: entier(corps.messageId) === null ? null : String(entier(corps.messageId)),
      });
      return issue.ok
        ? Response.json({ etat: 'ok', ...issue }, { headers: ENTETES })
        : Response.json({ erreur: issue.motif }, { status: 409, headers: ENTETES });
    }

    const messageId = entier(corps.messageId);
    const lotCle = typeof corps.lotCle === 'string' ? corps.lotCle.trim() : '';
    if (messageId === null || lotCle === '') {
      return Response.json(
        { erreur: 'Choisissez un événement existant, ou un bien sur lequel ouvrir le nouvel événement.' },
        { status: 422, headers: ENTETES });
    }
    const issue = await creerEvenementEtRelier({
      reference, messageId: String(messageId), lotCle, auteur,
      categorie: typeof corps.categorie === 'string' ? corps.categorie : null,
      urgence: typeof corps.urgence === 'string' ? corps.urgence : null,
      ouvertLe: typeof corps.ouvertLe === 'string' ? corps.ouvertLe : null,
    });
    return issue.ok
      ? Response.json({ etat: 'ok', ...issue }, { headers: ENTETES })
      : Response.json({ erreur: issue.motif }, { status: 409, headers: ENTETES });
  } catch (e) {
    console.error('[gestion/monga] geste impossible (%s)', reference, e);
    return Response.json({ erreur: 'Geste impossible : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}
