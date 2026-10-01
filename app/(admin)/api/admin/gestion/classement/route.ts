import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import {
  contexteClassement, contexteClassementRedaction, mailsSansClassementManuel,
} from '../../../../../lib/gestion/classementBien';
// 🔴 LOT PROPOSITIONS-EMAILS-MULTIPLES — le filet contre le cache périmé (voir l'encadré du GET).
import { rafraichirAvantOuverture } from '../../../../../lib/gestion/rafraichirPropositions';

/**
 * /api/admin/gestion/classement — LOT STATUT-PAR-MAIL : DE QUOI CLASSER UN MAIL DANS UN BIEN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒 AUCUN CLASSEMENT NE SE POSE ICI. Cette route ne fait que RÉPONDRE à « à quels biens ce mail peut-il se
 * rattacher, et qui sont leurs parties à sa date ? ». Le geste d'ÉCRITURE reste celui qui existe déjà —
 * `POST /api/admin/gestion/rattachements` — avec son journal, son auteur et sa réversibilité. Ouvrir un second
 * chemin d'écriture ici aurait donné deux façons de poser un rattachement, donc un jour deux comportements.
 *
 * ⚠️ LOT PROPOSITIONS-EMAILS-MULTIPLES — ELLE N'EST PLUS STRICTEMENT EN LECTURE SEULE, et c'est une demande
 * d'Arno du 01/10/2026 : avant de répondre pour un mail, elle remet à jour la RECONNAISSANCE des adresses si une
 * fiche a changé depuis son calcul, puis les propositions automatiques qui s'en déduisent. Voir l'encadré du GET.
 *
 * LES QUESTIONS :
 *   · `?message=N`            les biens proposables pour ce mail, la recommandation, les parties à SA date
 *   · `?fil=N&portee=1`       les mails de la conversation qui n'ont AUCUN classement manuel (portée « toute la
 *                             conversation ») — c'est la liste que l'écran annonce avant de valider
 *   · `POST { destinataires, objet?, corps?, pieces? }`  🔴 LOT RATTACHER-EN-ECRIVANT — les biens proposables
 *                             pour un mail qu'on est en train d'ÉCRIRE, et qui n'existe pas encore en base.
 *
 * ⚠️ POURQUOI UN `POST` POUR UNE LECTURE. La question porte sur des ADRESSES, un OBJET et un CORPS en cours de
 * frappe : les mettre dans l'adresse de la requête y écrirait des données personnelles (règle de confidentialité
 * du projet : jamais de donnée personnelle dans une URL), et les ferait entrer dans les journaux du serveur et
 * l'historique du navigateur. Le verbe dit « je te donne de quoi répondre », pas « écris ». RIEN N'EST ÉCRIT :
 * `contexteClassementRedaction` ne pose aucun rattachement, et le graphe d'imports de ce fichier n'atteint aucun
 * chemin d'écriture.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';

/** Un identifiant lu dans une adresse. Refuse `0` et le non-numérique : inutile d'interroger pour rien. PUR. */
export function identifiant(brut: string | null): number | null {
  const s = (brut ?? '').trim();
  if (!/^[1-9]\d{0,15}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * 🔴 LOT RATTACHER-EN-ECRIVANT — LES PROPOSITIONS PENDANT QU'ON ÉCRIT. Lecture seule, malgré le verbe (voir
 * l'encadré du fichier).
 *
 * ⚠️ LES ENTRÉES SONT BORNÉES ICI : cinquante destinataires, et des textes tronqués. Un corps de dix pages ne
 * rend pas de meilleures propositions — la citation d'une adresse ou d'un n° de lot est toujours en tête —, il
 * ne fait que coûter. Même borne que la relève pour le corps.
 */
export const DESTINATAIRES_MAX = 50;
export const CORPS_MAX = 4000;

export function lireDestinataires(brut: unknown): string[] {
  const liste = Array.isArray(brut) ? brut : typeof brut === 'string' ? brut.split(',') : [];
  const propres = liste
    .map((x) => String(x ?? '').trim().toLowerCase())
    .filter((x) => x !== '' && x.includes('@'));
  return [...new Set(propres)].slice(0, DESTINATAIRES_MAX);
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  let corps: { destinataires?: unknown; objet?: unknown; corps?: unknown; pieces?: unknown };
  try { corps = (await request.json()) as typeof corps; } catch {
    return Response.json({ etat: 'erreur', message: 'Requête illisible.' },
      { status: 400, headers: { 'Cache-Control': SANS_CACHE } });
  }

  try {
    const contexte = await contexteClassementRedaction({
      destinataires: lireDestinataires(corps.destinataires),
      objet: typeof corps.objet === 'string' ? corps.objet.slice(0, 500) : null,
      corps: typeof corps.corps === 'string' ? corps.corps.slice(0, CORPS_MAX) : null,
      pieces: Array.isArray(corps.pieces)
        ? corps.pieces.map((x) => String(x ?? '')).filter((x) => x !== '').slice(0, 50) : [],
    });
    return Response.json({ etat: 'ok', contexte }, { headers: { 'Cache-Control': SANS_CACHE } });
  } catch (e) {
    // Pas de catch muet : une liste vide se lirait « aucun bien ne correspond », ce qui serait faux.
    console.error('[api/admin/gestion/classement] propositions de rédaction impossibles', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' },
      { status: 503, headers: { 'Cache-Control': SANS_CACHE } });
  }
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const url = new URL(request.url);
  const message = identifiant(url.searchParams.get('message'));
  const fil = identifiant(url.searchParams.get('fil'));

  try {
    if (fil !== null && url.searchParams.get('portee') === '1') {
      return Response.json(
        { etat: 'ok', mails: await mailsSansClassementManuel(fil) },
        { headers: { 'Cache-Control': SANS_CACHE } });
    }
    if (message === null) {
      return Response.json({ etat: 'erreur', message: 'Mail non désigné.' },
        { status: 400, headers: { 'Cache-Control': SANS_CACHE } });
    }
    /**
     * ══ 🔴🔴 LOT PROPOSITIONS-EMAILS-MULTIPLES — AUCUN CACHE PÉRIMÉ À L'OUVERTURE ═══════════════════════════════
     *
     * DEMANDE D'ARNO (01/10/2026) : « à l'ouverture d'un mail, les propositions sont recalculées si la fiche a
     * changé depuis leur calcul ». Le défaut qu'elle ferme : il avait ajouté la seconde adresse de Mme THAI à sa
     * fiche, rechargé, rouvert le mail — et n'avait toujours AUCUNE proposition de ses deux biens, parce que la
     * reconnaissance des adresses était figée au jour de la capture.
     *
     * ⚠️ C'EST LA SEULE ÉCRITURE DE CETTE ROUTE, et elle n'est pas un classement : elle remet à jour un CALCUL
     * (la reconnaissance des adresses, puis les propositions automatiques qui s'en déduisent). Les rattachements
     * posés à la main n'y survivent pas par chance mais par construction — voir `rafraichirPropositions`.
     *
     * ⚠️ ELLE NE COÛTE RIEN QUAND RIEN N'A CHANGÉ : une requête qui ne rend aucune ligne (voir
     * `messagesAReconnaitre`), et l'on passe.
     */
    await rafraichirAvantOuverture(message);
    return Response.json({ etat: 'ok', contexte: await contexteClassement(message) },
      { headers: { 'Cache-Control': SANS_CACHE } });
  } catch (e) {
    // Pas de catch muet : une liste vide se lirait « aucun bien ne correspond », ce qui serait faux.
    console.error('[api/admin/gestion/classement] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' },
      { status: 503, headers: { 'Cache-Control': SANS_CACHE } });
  }
}
