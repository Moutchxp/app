import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { query } from '../../../../../lib/db/client';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import { chargerConfigGestion } from '../../../../../lib/gestion/config';
import { envoyerMessage, type AncrageFil, type DepsEnvoiComplet } from '../../../../../lib/gestion/envoi';
import { envoyerViaGmail } from '../../../../../lib/gestion/envoiGmail';
import { peutEnvoyerAuNomDeGestion, refusEnvoi } from '../../../../../lib/gestion/gardeEnvoi';
import { COMPTE_GESTION, lireIdentifiants, rafraichirJeton } from '../../../../../lib/gestion/google';
import { lireJeton } from '../../../../../lib/gestion/googleJeton';
import {
  actionJournalEnvoi, cibleJournalEnvoi, commentaireJournalEnvoi,
} from '../../../../../lib/gestion/journalEnvoi';
import { motifLisible, phraseEchecEnvoi } from '../../../../../lib/gestion/motifEchec';
import { decouperAdresses } from '../../../../../lib/gestion/redaction';
import {
  finaliserEnvoi, lireEnvoisDuFil, marquerBrouillonEnvoye, ouvrirEnvoi, type Auteur,
} from '../../../../../lib/gestion/redactionRepo';
import { journalEnvoiDisponible, redactionDisponible } from '../../../../../lib/gestion/schema';

/**
 * /api/admin/gestion/envois (lot 5e) — ENVOYER un message au nom de gestion@criterimmo.fr.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LE SEUL CHEMIN D'ENVOI DE TOUTE L'APPLICATION. L'ordre des gestes (droit relu en base → validation → jeton →
 * ligne écrite AVANT l'appel → Gmail → finalisation) vit dans `envoi.ts`, en un seul endroit et entièrement éprouvé :
 * cette route ne fait que lui fournir le monde réel.
 *
 * 🔴 LA FENÊTRE « ANNULER » N'EST PAS ICI. Elle court DANS L'ÉCRAN, avant l'appel : tant qu'elle n'est pas écoulée,
 * aucune requête n'est partie. Un envoi différé côté serveur demanderait une file d'attente, un processus qui la
 * dépile et un moyen de l'annuler — trois choses de plus à surveiller pour un besoin que dix secondes d'attente à
 * l'écran résolvent exactement.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔒 Deux gardes, dans cet ordre : `exigerCompteActif(request,'gestion')` puis `peutEnvoyerAuNomDeGestion` — relue EN
 * BASE, jamais dans le jeton. L'auteur vient de la SESSION. Runtime Node.
 */
export const runtime = 'nodejs';

/** Le nom affiché par défaut, quand Gmail ne nous en donne pas — décision d'Arno. */
const NOM_PAR_DEFAUT = 'CRITERIMMO';

/**
 * CE À QUOI ON RÉPOND, lu dans le message d'origine : son `Message-ID`, sa chaîne `References`. C'est ce qui range la
 * réponse DANS le fil chez le correspondant — sans quoi le mail arrive orphelin, et personne ne voit de quoi on parle.
 */
async function ancrageDuMessage(messageId: number | null): Promise<AncrageFil> {
  if (messageId === null) return { messageIdRfc: null, references: null, threadId: null };
  const { rows } = await query<{ message_id: string | null; references_brut: string | null }>(
    `SELECT message_id, references_brut FROM gestion_message WHERE id = $1`, [messageId]);
  return {
    messageIdRfc: rows[0]?.message_id?.trim() || null,
    references: rows[0]?.references_brut?.trim() || null,
    threadId: null, // Gmail retrouve le fil par les en-têtes ; on ne stocke pas encore son identifiant de fil.
  };
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!await redactionDisponible()) return Response.json({ envois: [] });
  const filId = Number(new URL(request.url).searchParams.get('fil'));
  if (!Number.isInteger(filId) || filId <= 0) return Response.json({ erreur: 'Échange inconnu.' }, { status: 400 });
  try {
    return Response.json({ envois: await lireEnvoisDuFil(filId) },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gestion/envois] lecture impossible', e);
    return Response.json({ erreur: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!await peutEnvoyerAuNomDeGestion(request)) return refusEnvoi();
  if (!await redactionDisponible()) {
    return Response.json({ erreur: 'Mise à jour de la base à appliquer avant d’envoyer.' }, { status: 503 });
  }

  let corps: Record<string, unknown>;
  try { corps = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ erreur: 'Requête invalide.' }, { status: 422 }); }

  // 🔴 LA CLÉ D'IDEMPOTENCE VIENT DE L'ÉCRAN, mais c'est la BASE qui tranche (contrainte UNIQUE). Sans clé, on refuse :
  //   accepter un envoi non identifié, c'est accepter de l'envoyer deux fois.
  const cle = typeof corps.cleIdempotence === 'string' ? corps.cleIdempotence.trim().slice(0, 100) : '';
  if (cle.length < 8) return Response.json({ erreur: 'Demande d’envoi sans clé : refusée.' }, { status: 422 });

  const entier = (x: unknown): number | null => (typeof x === 'number' && Number.isInteger(x) && x > 0 ? x : null);
  const liste = (x: unknown): string[] =>
    Array.isArray(x) ? decouperAdresses(x.filter((v): v is string => typeof v === 'string').join(',')) : [];

  const auteur: Auteur = await auteurDeLaRequete(request);
  const config = await chargerConfigGestion();
  const identifiants = lireIdentifiants();

  const deps: DepsEnvoiComplet = {
    // Le droit est DÉJÀ vérifié ci-dessus ; on le redemande ici parce que `envoi.ts` en fait sa première étape, et
    //   qu'un jour cette fonction pourra être appelée d'ailleurs. Deux lectures valent mieux qu'un trou.
    peutEnvoyer: () => peutEnvoyerAuNomDeGestion(request),
    jetonAcces: async () => {
      const jeton = lireJeton();
      if (identifiants === null || jeton === null) return null;
      try {
        const acces = await rafraichirJeton({ identifiants, refreshToken: jeton.refreshToken }, { fetch });
        return acces.ok ? acces.valeur : null;
      } catch {
        return null; // Google injoignable : on ne prétend pas envoyer, et le brouillon reste où il est
      }
    },
    expediteur: async () => ({ adresse: config.adresseGestion || COMPTE_GESTION, nom: NOM_PAR_DEFAUT }),
    ancrage: ancrageDuMessage,
    ouvrirEnvoi,
    envoyer: (o) => envoyerViaGmail(o, { fetch }),
    finaliser: finaliserEnvoi,
    marquerBrouillonEnvoye,
    // LE JOURNAL MÉTIER, celui qu'Arno a demandé : qui, à qui, quand, quel objet. Rien du corps du message.
    // 🔴 L'ENTITÉ EST DÉCIDÉE, PAS DEVINÉE. Écrire `'envoi'` en dur a fait rendre un échec pour un message parti le
    //   23/09 : la règle de la table ne connaissait pas ce mot. Voir `journalEnvoi.ts` pour la mesure et le choix.
    journaliser: async (l) => {
      const cible = cibleJournalEnvoi({
        envoiId: l.envoiId, filId: entier(corps.filId), repondAMessageId: entier(corps.repondAMessageId),
        envoiPermis: await journalEnvoiDisponible(),
      });
      if (cible === null) {
        // Aucun rangement à la fois VRAI et permis : on ne fabrique pas une ligne fausse, on le DIT au serveur.
        console.warn('[gestion/envois] journal métier non écrit : aucune entité permise '
          + '(applique la migration 243 pour journaliser les messages neufs). envoi=%d', l.envoiId);
        return;
      }
      await query(
        `INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_id, auteur_libelle)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [cible.entite, cible.entiteId, actionJournalEnvoi(l.issue),
         commentaireJournalEnvoi(l), l.auteur.id, l.auteur.libelle]);
    },
    // 🔴 LE JOURNAL DU SERVEUR, jamais l'écran. Un geste d'après-envoi manqué est une comptabilité en retard, pas un
    //   mail perdu : Arno n'a rien à refaire, et c'est nous qui devons le voir.
    incident: (etape, e) => {
      const m = motifLisible(e);
      console.error('[gestion/envois] LE MESSAGE EST PARTI mais « %s » a échoué (%s) — à rattraper à la main : %s',
        etape, m.etiquette, e instanceof Error ? e.message : String(e));
    },
    maintenant: () => new Date(),
    alea: () => crypto.randomUUID().replace(/-/g, ''),
  };

  try {
    const issue = await envoyerMessage({
      cleIdempotence: cle,
      brouillonId: entier(corps.brouillonId),
      filId: entier(corps.filId),
      repondAMessageId: entier(corps.repondAMessageId),
      a: liste(corps.a), cc: liste(corps.cc), cci: liste(corps.cci),
      objet: typeof corps.objet === 'string' ? corps.objet.slice(0, 500) : '',
      corps: typeof corps.corps === 'string' ? corps.corps.slice(0, 200_000) : '',
    }, auteur, deps);

    if (!issue.ok) {
      const statut = issue.code === 'droit' ? 403 : issue.code === 'invalide' ? 422 : 503;
      return Response.json({ erreur: issue.motif, code: issue.code }, { status: statut });
    }
    return Response.json({ ok: true, envoi: issue.envoi, deja: issue.deja },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    // Pas de catch muet : un envoi dont on ne sait rien est pire qu'un envoi refusé. La ligne, elle, est déjà en base.
    // 🔴 ET PAS DE « ERREUR INTERNE » NON PLUS quand la cause est connue : c'est la phrase qu'Arno a lue le 23/09 pour
    //   un message qui était parti, et elle ne lui a rien appris. Le détail technique va au journal du serveur ; ce
    //   qui va à l'écran est une raison en français, sur laquelle on peut agir. Voir `motifEchec.ts`.
    const m = phraseEchecEnvoi(e);
    console.error('[gestion/envois] envoi impossible (%s)', m.etiquette, e);
    return Response.json({ erreur: m.phrase, code: 'interne' }, { status: 503 });
  }
}
