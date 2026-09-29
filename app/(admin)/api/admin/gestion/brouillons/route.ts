import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { reprendrePiecesDuMessage } from '../../../../../lib/gestion/brouillonPieceRepo';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import { peutEnvoyerAuNomDeGestion, refusEnvoi } from '../../../../../lib/gestion/gardeEnvoi';
import { decouperAdresses } from '../../../../../lib/gestion/redaction';
import {
  abandonnerBrouillon, brouillonsALaCorbeille, enregistrerBrouillon, lireBrouillon, lireBrouillonDuFil,
  listerBrouillons, restaurerBrouillon,
  listerBrouillonsDuFil,
} from '../../../../../lib/gestion/redactionRepo';
import { redactionDisponible } from '../../../../../lib/gestion/schema';

/**
 * /api/admin/gestion/brouillons (lot 5e) — ENREGISTRER, RETROUVER, ABANDONNER un brouillon.
 *
 * 🔴 CETTE ROUTE N'ENVOIE JAMAIS RIEN, et c'est structurel, pas une promesse : elle n'importe aucun chemin d'envoi
 * (ni `envoi.ts`, ni `envoiGmail.ts`, ni `google.ts`). Enregistrer un brouillon ne peut donc pas déclencher un mail,
 * même par erreur de câblage — c'est ce que garantit un test statique sur ses imports.
 *
 * 🔴 UN BROUILLON N'EST JAMAIS SUPPRIMÉ : `DELETE` l'ABANDONNE, en le datant. Le verbe HTTP dit « retire-le de ma
 * liste », la base dit « garde-le » — et c'est la base qui a raison sur du travail humain.
 *
 * 🔒 `exigerCompteActif(request,'gestion')`, puis la garde d'ENVOI relue en base : écrire un brouillon au nom de
 * gestion@ est déjà agir en son nom. L'auteur est lu dans la SESSION, jamais envoyé par le navigateur.
 * `private, no-store`. Runtime Node.
 */
export const runtime = 'nodejs';

/** Les migrations 239/240 ne sont pas passées : on le DIT, au lieu d'échouer sur une table absente. */
function sansSchema(): Response {
  return Response.json({ erreur: 'Mise à jour de la base à appliquer avant d’écrire des messages.' }, { status: 503 });
}

/** Une liste d'adresses reçue du navigateur, nettoyée ici AUSSI : l'écran n'est jamais l'autorité. */
function adresses(brut: unknown): string[] {
  if (Array.isArray(brut)) return decouperAdresses(brut.filter((x): x is string => typeof x === 'string').join(','));
  return typeof brut === 'string' ? decouperAdresses(brut) : [];
}

function texte(brut: unknown, max: number): string {
  return typeof brut === 'string' ? brut.slice(0, max) : '';
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!await redactionDisponible()) return Response.json({ brouillon: null, brouillons: [] });

  const parametres = new URL(request.url).searchParams;
  const filBrut = parametres.get('fil');
  const idBrut = parametres.get('id');
  try {
    /**
     * 🔴 LOT LECTURE-HTML-FIL-TROMBONE — `?corbeille=1` : LES BROUILLONS MIS À LA CORBEILLE.
     *
     * Rendus RÉDUITS À CE QUE LA LIGNE MONTRE (objet, destinataires, date), jamais leur corps : la corbeille est
     * une liste, on n'y relit pas ce qu'on a jeté. Le corps revient à la réouverture, par `?id=`, comme pour
     * n'importe quel brouillon — et il n'a jamais bougé, puisque rien n'a jamais été supprimé.
     */
    if (parametres.get('corbeille') === '1') {
      const jetes = await brouillonsALaCorbeille();
      return Response.json({
        liste: jetes.map((b) => ({
          id: b.id,
          objet: b.objet,
          destinataires: [...b.a, ...b.cc],
          majLe: b.majLe,
        })),
      }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    /**
     * 🔴 LOT BROUILLONS-GMAIL — `?id=` : UN BROUILLON PRÉCIS, celui qu'on vient de cliquer dans la liste.
     *
     * La conversation en a besoin pour rouvrir l'éditeur sous le bon message. Jusqu'ici la route ne savait rendre
     * que « le brouillon de cet échange », ce qui ne suffit pas : un échange peut en porter plusieurs (une réponse
     * à un message, un transfert d'un autre), et c'est CELUI QU'ON A CLIQUÉ qu'il faut rouvrir.
     */
    if (idBrut !== null) {
      const id = Number(idBrut);
      if (!Number.isInteger(id) || id <= 0) return Response.json({ erreur: 'Brouillon inconnu.' }, { status: 400 });
      return Response.json({ brouillon: await lireBrouillon(id) },
        { headers: { 'Cache-Control': 'private, no-store' } });
    }
    // Avec `?fil=` : le brouillon de CET échange (pour rouvrir la conversation là où on l'avait laissée), ET la
    //   liste de TOUS ses brouillons vivants — c'est elle qui permet de marquer « Brouillon » sur le bon message.
    if (filBrut !== null) {
      const filId = Number(filBrut);
      if (!Number.isInteger(filId) || filId <= 0) return Response.json({ erreur: 'Échange inconnu.' }, { status: 400 });
      const [brouillon, brouillons] = await Promise.all([lireBrouillonDuFil(filId), listerBrouillonsDuFil(filId)]);
      return Response.json({ brouillon, brouillons },
        { headers: { 'Cache-Control': 'private, no-store' } });
    }
    // Sans paramètre : tous les brouillons vivants — ce que montre le libellé « Brouillons ».
    return Response.json({ brouillons: await listerBrouillons() },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gestion/brouillons] lecture impossible', e);
    return Response.json({ erreur: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!await peutEnvoyerAuNomDeGestion(request)) return refusEnvoi();
  if (!await redactionDisponible()) return sansSchema();

  let corps: Record<string, unknown>;
  try { corps = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ erreur: 'Requête invalide.' }, { status: 422 }); }

  // LOT 5-PJ-ENVOI — une CINQUIÈME voie. Une voie inconnue retombe sur « nouveau » : c'est la moins engageante,
  //   et elle ne joint ni ne cite rien qu'on n'aurait pas demandé.
  const voies = ['repondre', 'repondre_tous', 'transferer', 'nouveau', 'transferer_piece'] as const;
  const voie = voies.find((v) => v === corps.voie) ?? 'nouveau';
  const entier = (x: unknown): number | null =>
    typeof x === 'number' && Number.isInteger(x) && x > 0 ? x : null;

  try {
    const brouillon = await enregistrerBrouillon({
      id: entier(corps.id),
      filId: entier(corps.filId),
      repondAMessageId: entier(corps.repondAMessageId),
      voie,
      a: adresses(corps.a), cc: adresses(corps.cc), cci: adresses(corps.cci),
      objet: texte(corps.objet, 500),
      corps: texte(corps.corps, 200_000),
      /**
       * 🔴 LOT EDITEUR-PJ — LA MISE EN FORME EST ENFIN GARDÉE AVEC LE BROUILLON. La colonne existait depuis la
       * migration 265 et rien ne l'écrivait : un brouillon rouvert revenait en texte brut, sans le moindre
       * message. Le dépôt réassainit ce HTML — l'écran nettoie pour qu'on voie ce qu'on écrit, le serveur nettoie
       * parce que lui seul ne peut pas être contourné.
       */
      corpsHtml: typeof corps.corpsHtml === 'string' ? corps.corpsHtml.slice(0, 200_000) : null,
      citation: typeof corps.citation === 'string' ? corps.citation.slice(0, 200_000) : null,
    }, await auteurDeLaRequete(request));

    /**
     * LOT 5-PJ-ENVOI — UN TRANSFERT REPREND LES PIÈCES DU MESSAGE D'ORIGINE, comme dans Gmail.
     *
     * 🔴 ICI, ET PAS DANS LE NAVIGATEUR : c'est le premier enregistrement qui donne un identifiant au brouillon, et
     * c'est le seul moment où l'on sait de quel message il transfère. Le faire côté écran demanderait un second
     * aller-retour, et laisserait un transfert sans ses pièces si la personne fermait entre les deux.
     *
     * 🔴 IDEMPOTENT EN BASE (`NOT EXISTS`, cf. `reprendrePiecesDuMessage`) : l'éditeur ré-enregistre à chaque
     * accalmie de frappe — dix enregistrements ne doivent pas faire dix fois les mêmes pièces. Et une pièce RETIRÉE
     * ne revient pas : sa ligne existe toujours, elle porte seulement `retire_le`.
     *
     * ⚠️ AU MIEUX-EFFORT : un brouillon enregistré ne doit pas échouer parce qu'une pièce n'a pas pu être reprise.
     * L'écran les affiche, ou ne les affiche pas ; le texte, lui, est sauvé.
     */
    if (voie === 'transferer' && brouillon.repondAMessageId !== null) {
      try {
        await reprendrePiecesDuMessage(brouillon.id, brouillon.repondAMessageId);
      } catch (e) {
        console.error('[gestion/brouillons] pièces du transfert non reprises', e);
      }
    }
    return Response.json({ ok: true, brouillon }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gestion/brouillons] enregistrement impossible', e);
    return Response.json({ erreur: 'Enregistrement impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}

/**
 * ══ 🔴 LOT LECTURE-HTML-FIL-TROMBONE — SORTIR UN BROUILLON DE LA CORBEILLE ═════════════════════════════════════
 *
 * `PATCH` et non `POST` : `POST` enregistre un brouillon (c'est déjà son verbe ici), et l'on ne mélange pas deux
 * gestes sous un même verbe — les journaux d'accès ne sauraient plus lequel a eu lieu.
 *
 * ⚠️ AUCUNE ÉCRITURE N'EST DÉFAITE : le brouillon n'avait jamais été supprimé, seulement DATÉ. Restaurer efface
 * cette date, et le contenu comme les pièces jointes sont exactement ceux d'avant — ils n'ont pas bougé.
 */
export async function PATCH(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!await peutEnvoyerAuNomDeGestion(request)) return refusEnvoi();
  if (!await redactionDisponible()) return sansSchema();

  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ erreur: 'Brouillon inconnu.' }, { status: 400 });
  try {
    const fait = await restaurerBrouillon(id);
    return fait
      ? Response.json({ ok: true, message: 'Brouillon réintégré : il est revenu dans « Brouillons ».' })
      : Response.json({ erreur: 'Ce brouillon n’est pas à la corbeille (ou il est déjà parti).' }, { status: 404 });
  } catch (e) {
    console.error('[gestion/brouillons] restauration impossible', e);
    return Response.json({ erreur: 'Restauration impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!await peutEnvoyerAuNomDeGestion(request)) return refusEnvoi();
  if (!await redactionDisponible()) return sansSchema();

  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ erreur: 'Brouillon inconnu.' }, { status: 400 });
  try {
    // MET À LA CORBEILLE : la ligne est DATÉE, jamais supprimée — et elle se restaure par `PATCH`.
    await abandonnerBrouillon(id);
    return Response.json({ ok: true, message: 'Brouillon mis à la corbeille.' });
  } catch (e) {
    console.error('[gestion/brouillons] abandon impossible', e);
    return Response.json({ erreur: 'Abandon impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}
