import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import {
  filRattache, mailsDuFil, poserClassement, suiviDuFil,
} from '../../../../../lib/gestion/periodeRepo';
// 🔴🔴 LOT SUIVI-CONVERSATION-NON-RATTACHEE — « cet expéditeur est-il connu des fiches ? » (règle ② d'Arno).
import { expediteurConnuDesFiches } from '../../../../../lib/gestion/contactExterneRepo';
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
  const c = brut as { sorte?: unknown; biens?: unknown; personnes?: unknown };
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
  const retenus = biens.filter((b) => (vues.has(b.cle) ? false : (vues.add(b.cle), true)));
  const personnes = personnesRecues(c.personnes);
  /**
   * ⚠️ LE CHAMP N'EST POSÉ QUE S'IL Y A QUELQUE CHOSE À POSER. Un `personnes: []` systématique changerait la forme
   * de TOUS les classements du dépôt — y compris ceux des 23 812 fenêtres existantes relues par la projection — et
   * ferait diverger les attendus des scénarios S1 à S13 pour rien.
   */
  return personnes.length === 0
    ? { sorte, biens: retenus }
    : { sorte, biens: retenus, personnes };
}

/**
 * ══ 🔴🔴 LOT CONTACTS-EXTERNES — LES PERSONNES REÇUES DU NAVIGATEUR, RE-VALIDÉES. PUR. ════════════════════════
 *
 * 🔴 RIEN N'EST CRU SUR PAROLE, et c'est la règle de cette route depuis `classementRecu` : la sorte est vérifiée
 * contre la liste fermée (`proprietaire` ou `locataire`, et rien d'autre — jamais `lot`, jamais `evenement`), la
 * clé est bornée, le libellé retombe sur la clé, et l'identifiant du contact externe doit être un entier positif.
 *
 * ⚠️ UNE SORTE INCONNUE EST ÉCARTÉE, PAS CORRIGÉE. Transformer un `lot` reçu ici en `proprietaire` écrirait une
 * cible que personne n'a demandée ; l'écarter laisse un classement de biens parfaitement valide.
 *
 * ⚠️ CINQUANTE AU PLUS, comme les biens : ce n'est pas une règle métier, c'est le refus d'un payload absurde.
 */
export function personnesRecues(brut: unknown): { sorte: 'proprietaire' | 'locataire'; cle: string; libelle: string; contactExterneId: number | null }[] {
  const liste = Array.isArray(brut) ? brut : [];
  const vues = new Set<string>();
  return liste
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    .map((x) => {
      const sorte = x.sorte === 'locataire' ? 'locataire' as const
        : x.sorte === 'proprietaire' ? 'proprietaire' as const : null;
      const cle = typeof x.cle === 'string' ? x.cle.trim().slice(0, 300) : '';
      const contact = Number(x.contactExterneId);
      return {
        sorte,
        cle,
        libelle: typeof x.libelle === 'string' && x.libelle.trim() !== ''
          ? x.libelle.trim().slice(0, 300) : cle,
        contactExterneId: Number.isSafeInteger(contact) && contact > 0 ? contact : null,
      };
    })
    .filter((x): x is { sorte: 'proprietaire' | 'locataire'; cle: string; libelle: string; contactExterneId: number | null } =>
      x.sorte !== null && x.cle !== '')
    .filter((x) => {
      const k = `${x.sorte}:${x.cle}`;
      return vues.has(k) ? false : (vues.add(k), true);
    })
    .slice(0, 50);
}

/** Le choix de suivi reçu. Absent ou inconnu ⇒ `suite`, le défaut d'Arno — jamais « toute la conversation ». */
export function choixRecu(brut: unknown): ChoixSuivi {
  return brut === 'mail' || brut === 'conversation' ? brut : 'suite';
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const url = new URL(request.url);
  const filId = entier(url.searchParams.get('fil'));
  if (filId === null) return Response.json({ erreur: 'Échange inconnu.' }, { status: 422, headers: ENTETES });
  if (!(await periodesDisponibles())) {
    return Response.json({ etat: 'sans_schema' }, { headers: ENTETES });
  }
  /**
   * 🔴🔴 LOT SUIVI-CONVERSATION-NON-RATTACHEE — LE MAIL QU'ON CLASSE, pour savoir si son expéditeur est connu.
   *
   * ⚠️ FACULTATIF : un appelant qui ne le passe pas (ou une version plus ancienne de l'écran) obtient
   * `expediteurConnu: false`, donc le comportement d'AVANT ce lot — pas de bloc sur une conversation jamais
   * rattachée. Un paramètre nouveau ne doit jamais rendre une réponse plus bavarde par surprise.
   */
  const messageId = entier(url.searchParams.get('message'));
  try {
    /**
     * 🔴 QUATRE LECTURES EN PARALLÈLE, et non l'une après l'autre : elles sont indépendantes, et cette route
     * s'exécute à CHAQUE ouverture de la modale. Les enchaîner se verrait à l'écran.
     */
    const [suivi, mails, rattachee, expediteurConnu] = await Promise.all([
      suiviDuFil(filId),
      mailsDuFil(filId),
      // 🔴 « DÉJÀ RATTACHÉE » : au moins un rattachement VALIDÉ, en plus des périodes et des exceptions.
      filRattache(filId),
      messageId === null ? Promise.resolve(false) : expediteurConnuDesFiches(messageId),
    ]);
    return Response.json(
      { etat: 'ok', ...suivi, mails, rattachee, expediteurConnu }, { headers: ENTETES });
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
