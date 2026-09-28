import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import {
  changerStatut, chiffresRattachement, fileATrier, liensDeLaPiece, liensDesMessages, liensDuFil, rattacher,
} from '../../../../../lib/gestion/rattachementRepo';
import { SORTES_RATTACHEMENT_PERMISES } from '../../../../../lib/gestion/rattachement';
// LOT FICHE-RATTACHEMENT — la fiche d'un échange : ses biens, leurs parties, leurs coordonnées. Lecture seule.
import { ficheRattachementDuFil } from '../../../../../lib/gestion/ficheRattachementRepo';
import type { Cible, Issue, Statut } from '../../../../../lib/gestion/rattachement';

/**
 * /api/admin/gestion/rattachements — LOT RATTACHEMENT-1 : LA SEULE PORTE DES RATTACHEMENTS.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒 MÊME DROIT QUE LA TUILE GESTION (`exigerCompteActif(request, 'gestion')`), relu en base à CHAQUE appel — pour la
 * lecture comme pour l'écriture. `private, no-store` : ces réponses portent des noms de biens et des adresses de
 * logements, elles ne se mettent en cache nulle part.
 *
 * LES QUESTIONS, EN LECTURE :
 *   · `?messages=1,2,3`   les liens vivants de ces mails — le bandeau d'une conversation, en UNE requête
 *   · `?fil=N`            TOUS les liens vivants d'un échange — la fenêtre ouverte depuis une ligne de liste
 *   · `?piece=N`          les liens d'une pièce : ceux de son mail (hérités) ET les siens
 *   · `?file=1&page=0`    la file « À trier », avec ses totaux
 *   · `?chiffres=1`       l'état d'ensemble
 *
 * LES GESTES, EN ÉCRITURE — tous RÉVERSIBLES, tous JOURNALISÉS, aucun ne supprime rien :
 *   · POST   { messageId, pieceId?, cible }        rattacher (ou confirmer un candidat déjà là)
 *   · PATCH  { lienId, statut, motif? }            confirmer · rejeter · retirer · remettre en proposition
 *
 * 🔴 AUCUN DELETE, ET C'EST DÉLIBÉRÉ. Retirer un rattachement est un CHANGEMENT D'ÉTAT (`PATCH` vers `retire`), pas
 * une suppression : le lien reste, daté et signé, et se remet d'un clic. Offrir un `DELETE` ici laisserait croire
 * qu'il existe une façon d'effacer — il n'en existe pas.
 *
 * ⚠️ `sans_schema` (migration 257 non appliquée) N'EST PAS UNE ERREUR : c'est un état, rendu en 200. L'écran dit
 * alors « pas encore installé ». Une 500 ferait croire à une panne, une réponse vide à une absence de rattachements.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

/** Un identifiant lu dans une requête. Refuse `0` et le non-numérique : inutile d'interroger pour rien. PUR. */
function identifiant(brut: unknown): number | null {
  const s = typeof brut === 'number' ? String(brut) : typeof brut === 'string' ? brut : '';
  if (!/^[1-9]\d{0,15}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/** Une liste d'identifiants, BORNÉE : un échange ne porte jamais des milliers de messages. PUR. */
export const MESSAGES_MAX = 200;

export function lireMessages(brut: string | null): number[] {
  return (brut ?? '').split(',').map((x) => identifiant(x.trim()))
    .filter((x): x is number => x !== null).slice(0, MESSAGES_MAX);
}

/**
 * 🔴🔴 LOT FICHE-RATTACHEMENT — LA LISTE VIENT DU MODULE PUR, elle n'est plus recopiée ici.
 *
 * `proprietaire` en est sortie. Elle y figurait encore le 28/09 au soir, et c'était la dernière porte par laquelle
 * un lien « personne » pouvait naître d'un geste d'écran. La liste vit désormais à UN seul endroit
 * (`rattachement.SORTES_RATTACHEMENT_PERMISES`) : une seconde copie ici finirait par dire autre chose, et ce
 * serait cette copie-là qui commanderait, puisque c'est elle que la requête rencontre en premier.
 */
const SORTES: readonly Cible['sorte'][] = SORTES_RATTACHEMENT_PERMISES;
const STATUTS: readonly Statut[] = ['propose', 'confirme', 'rejete', 'retire'];

/**
 * LA CIBLE PORTÉE PAR UN CORPS DE REQUÊTE, ou `null` si elle n'est pas désignée proprement. PUR.
 *
 * ⚠️ ON REFUSE PLUTÔT QUE DE DEVINER. Une cible mal formée qui passerait ici irait échouer sur la contrainte de la
 * base — avec un message d'erreur PostgreSQL que personne ne peut lire à l'écran.
 */
export function lireCible(brut: unknown): Cible | null {
  if (brut === null || typeof brut !== 'object') return null;
  const o = brut as { sorte?: unknown; cle?: unknown; id?: unknown };
  const sorte = typeof o.sorte === 'string' && (SORTES as readonly string[]).includes(o.sorte)
    ? (o.sorte as Cible['sorte']) : null;
  if (sorte === null) return null;

  if (sorte === 'evenement') {
    const id = identifiant(o.id);
    return id === null ? null : { sorte, cle: null, id };
  }
  const cle = typeof o.cle === 'string' ? o.cle.trim() : '';
  // La clé WIPPIMMO est bornée et sans espace : au-delà, c'est une saisie qui a dérapé, pas une clé.
  if (cle === '' || cle.length > 60) return null;
  return { sorte, cle, id: null };
}

/** L'issue demandée par la file, ou « toutes ». PUR. */
export function lireIssue(brut: string | null): Issue | 'toutes' {
  if (brut === 'a_trier' || brut === 'sans_candidat' || brut === 'automatique') return brut;
  return 'toutes';
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const url = new URL(request.url);
  try {
    const piece = identifiant(url.searchParams.get('piece'));
    if (piece !== null) return Response.json(await liensDeLaPiece(piece), { headers: ENTETES });

    /**
     * LOT BARRE-STATUT — TOUS LES LIENS D'UN ÉCHANGE. Depuis une ligne de liste on ne connaît que l'échange : sans
     * cette question, il faudrait charger toute la conversation pour ouvrir une fenêtre de consultation.
     */
    const fil = identifiant(url.searchParams.get('fil'));
    if (fil !== null) return Response.json(await liensDuFil(fil), { headers: ENTETES });

    /**
     * 🔴 LOT FICHE-RATTACHEMENT — LA FICHE COMPLÈTE D'UN ÉCHANGE : ses biens, et tout ce qu'il faut savoir de
     * chacun pour agir sans rouvrir WIPPIMMO (adresse, lot, nature, type, surface, statut, propriétaire et
     * locataires à la date du mail avec leurs coordonnées, dossier Drive).
     *
     * ⚠️ ELLE VIT DANS LA MÊME ROUTE QUE `?fil=`, et non dans une route à part : « la SEULE porte des
     * rattachements » est la promesse de ce fichier depuis le lot RATTACHEMENT-1. Une seconde route signifierait
     * un second contrôle d'accès à tenir à jour, et c'est toujours le second qu'on oublie.
     *
     * 🔒 LECTURE SEULE. Aucune écriture n'est faite pour la construire — ni en base, ni dans le Drive : le lien
     * vers le dossier est une ADRESSE que le navigateur ouvrira, jamais un appel de l'application à Google.
     */
    const fiche = identifiant(url.searchParams.get('fiche'));
    if (fiche !== null) {
      const f = await ficheRattachementDuFil(fiche);
      return Response.json({ etat: f.disponible ? 'ok' : 'sans_schema', data: f }, { headers: ENTETES });
    }

    if (url.searchParams.get('chiffres') !== null) {
      return Response.json(await chiffresRattachement(), { headers: ENTETES });
    }

    if (url.searchParams.get('file') !== null) {
      const page = Number(url.searchParams.get('page') ?? '0');
      const taille = Number(url.searchParams.get('taille') ?? '0');
      return Response.json(await fileATrier({
        page: Number.isInteger(page) && page >= 0 ? page : 0,
        taille: Number.isInteger(taille) && taille > 0 ? taille : undefined,
        issue: lireIssue(url.searchParams.get('issue')),
      }), { headers: ENTETES });
    }

    const messages = lireMessages(url.searchParams.get('messages'));
    const liens = await liensDesMessages(messages);
    if (liens.etat !== 'ok') return Response.json(liens, { headers: ENTETES });
    // Une `Map` ne se sérialise pas en JSON : on rend un objet, indexé par identifiant de message.
    return Response.json(
      { etat: 'ok', data: Object.fromEntries([...liens.data].map(([k, v]) => [String(k), v])) },
      { headers: ENTETES });
  } catch (e) {
    // Pas de catch muet : une liste vide se lirait « ce mail n'est rattaché à rien », ce qui serait un mensonge.
    console.error('[api/admin/gestion/rattachements] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  let corps: { messageId?: unknown; pieceId?: unknown; cible?: unknown; motif?: unknown };
  try { corps = (await request.json()) as typeof corps; }
  catch { return Response.json({ erreur: 'Requête illisible.' }, { status: 400 }); }

  const messageId = identifiant(corps.messageId);
  if (messageId === null) return Response.json({ erreur: 'Mail inconnu.' }, { status: 400 });
  const cible = lireCible(corps.cible);
  if (cible === null) return Response.json({ erreur: 'Cible de rattachement non reconnue.' }, { status: 400 });
  const pieceId = corps.pieceId === undefined || corps.pieceId === null ? null : identifiant(corps.pieceId);
  if (corps.pieceId !== undefined && corps.pieceId !== null && pieceId === null) {
    return Response.json({ erreur: 'Pièce jointe inconnue.' }, { status: 400 });
  }

  try {
    const issue = await rattacher({
      messageId, pieceId, cible,
      auteur: await auteurDeLaRequete(request),
      motif: typeof corps.motif === 'string' ? corps.motif.trim().slice(0, 300) : null,
    });
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409 });
    return Response.json({ ok: true, id: issue.id });
  } catch (e) {
    console.error('[api/admin/gestion/rattachements] rattachement impossible', e);
    return Response.json({ erreur: 'Rattachement impossible : erreur interne du serveur.' }, { status: 503 });
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  let corps: { lienId?: unknown; statut?: unknown; motif?: unknown };
  try { corps = (await request.json()) as typeof corps; }
  catch { return Response.json({ erreur: 'Requête illisible.' }, { status: 400 }); }

  const lienId = identifiant(corps.lienId);
  if (lienId === null) return Response.json({ erreur: 'Rattachement inconnu.' }, { status: 400 });
  const statut = typeof corps.statut === 'string' && (STATUTS as readonly string[]).includes(corps.statut)
    ? (corps.statut as Statut) : null;
  if (statut === null) return Response.json({ erreur: 'Statut non reconnu.' }, { status: 400 });

  try {
    const issue = await changerStatut({
      lienId, statut,
      auteur: await auteurDeLaRequete(request),
      motif: typeof corps.motif === 'string' ? corps.motif.trim().slice(0, 300) : null,
    });
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409 });
    return Response.json({ ok: true, id: issue.id });
  } catch (e) {
    console.error('[api/admin/gestion/rattachements] changement de statut impossible', e);
    return Response.json({ erreur: 'Changement impossible : erreur interne du serveur.' }, { status: 503 });
  }
}
