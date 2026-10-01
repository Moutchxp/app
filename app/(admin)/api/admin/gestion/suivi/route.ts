import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import {
  mailsDuFil, poserClassement, suiviDuFil,
} from '../../../../../lib/gestion/periodeRepo';
import { periodesDisponibles } from '../../../../../lib/gestion/schema';
import type { ChoixSuivi, Classement, SorteClassement } from '../../../../../lib/gestion/periodesConversation';

/**
 * /api/admin/gestion/suivi — LOT SUIVI-CONVERSATION : LES PÉRIODES DE CLASSEMENT D'UNE CONVERSATION.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 UNE SEULE PORTE POUR UN SEUL GESTE. Avant ce lot, classer un mail demandait N appels (un par bien posé, un par
 * bien retiré) : l'écran composait lui-même la suite des gestes, et personne ne savait SOUS QUELLE RÈGLE le mail
 * avait été classé. Ici, on envoie la DÉCISION — ce classement, avec ce suivi — et le serveur en tire les écritures.
 *
 * LES VERBES :
 *   · GET  ?fil=N        les périodes et exceptions vivantes de cette conversation, et ses mails dans l'ordre
 *   · POST { filId, messageId, classement, choix }   poser un classement avec son suivi
 *
 * ⚠️ `sans_schema` (migration 290 non appliquée) N'EST PAS UNE ERREUR : c'est un état, rendu en 200. L'écran ne
 * rend alors pas le bloc « Suivi dans la conversation » et se comporte exactement comme avant ce lot.
 *
 * 🔒 LE DROIT EST EXIGÉ À CHAQUE VERBE, et l'auteur vient de la SESSION, jamais du navigateur : une période est une
 * décision humaine, et la base refuse un auteur anonyme (migration 290).
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
 * LE CLASSEMENT RECU DU NAVIGATEUR, RE-VALIDÉ. PUR.
 *
 * ⚠️ RIEN N'EST CRU SUR PAROLE : la sorte est vérifiée contre la liste fermée, les biens sont bornés, et un
 * libellé vide retombe sur la clé — une ligne sans nom dans une période se relirait des mois plus tard sans
 * qu'on sache de quel bien elle parle.
 */
export function classementRecu(brut: unknown): Classement | null {
  if (typeof brut !== 'object' || brut === null) return null;
  const c = brut as { sorte?: unknown; biens?: unknown };
  const sortes: SorteClassement[] = ['biens', 'interne', 'hors_gestion'];
  const sorte = sortes.find((s) => s === c.sorte);
  if (sorte === undefined) return null;
  if (sorte !== 'biens') return { sorte, biens: [] };
  const liste = Array.isArray(c.biens) ? c.biens : [];
  const biens = liste
    .filter((x): x is { cle?: unknown; libelle?: unknown } => typeof x === 'object' && x !== null)
    .map((x) => ({
      cle: typeof x.cle === 'string' ? x.cle.trim() : '',
      libelle: typeof x.libelle === 'string' && x.libelle.trim() !== ''
        ? x.libelle.trim().slice(0, 300)
        : (typeof x.cle === 'string' ? x.cle.trim() : ''),
    }))
    .filter((x) => x.cle !== '')
    .slice(0, 50);
  // ⚠️ SANS DOUBLON : la sélection est un ENSEMBLE (lot MODALE-RATTACHER-PROPRE), et elle le reste en base.
  const vues = new Set<string>();
  return { sorte, biens: biens.filter((b) => (vues.has(b.cle) ? false : (vues.add(b.cle), true))) };
}

/** Le choix de suivi reçu. Absent ou inconnu ⇒ `suite`, le défaut d'Arno — jamais « toute la conversation ». */
export function choixRecu(brut: unknown): ChoixSuivi {
  return brut === 'mail' || brut === 'conversation' ? brut : 'suite';
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const filId = entier(new URL(request.url).searchParams.get('fil'));
  if (filId === null) return Response.json({ erreur: 'Échange inconnu.' }, { status: 422, headers: ENTETES });
  if (!(await periodesDisponibles())) {
    return Response.json({ etat: 'sans_schema' }, { headers: ENTETES });
  }
  try {
    const [suivi, mails] = await Promise.all([suiviDuFil(filId), mailsDuFil(filId)]);
    return Response.json({ etat: 'ok', ...suivi, mails }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/suivi] lecture impossible (fil=%d)', filId, e);
    return Response.json({ erreur: 'Lecture impossible : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  let corps: Record<string, unknown>;
  try { corps = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ erreur: 'Requête invalide.' }, { status: 422, headers: ENTETES }); }

  const filId = entier(corps.filId);
  const messageId = entier(corps.messageId);
  const classement = classementRecu(corps.classement);
  if (filId === null || messageId === null || classement === null) {
    return Response.json({ erreur: 'Échange, mail ou classement manquant.' },
      { status: 422, headers: ENTETES });
  }
  try {
    const issue = await poserClassement({
      filId, messageId, classement, choix: choixRecu(corps.choix),
      auteur: await auteurDeLaRequete(request),
    });
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409, headers: ENTETES });
    return Response.json({ ok: true, projetes: issue.projetes }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/suivi] écriture impossible (fil=%d, mail=%d)', filId, messageId, e);
    return Response.json({ erreur: 'Le geste n’a pas abouti : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}
