import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { chargerSuiviReponses } from '../../../../../lib/veille/reponsesSuivi';
import { rattacherAMain, marquerTraitee, marquerDossierSatisfait, demarquerDossier, statutDemande, lireClePiece } from '../../../../../lib/veille/demandeReponseRepo';
import { cloturerDemande, rouvrirDemande, TransitionInterditeError } from '../../../../../lib/sitadel/demandeRepo';
import { majRelance, abandonnerRelance, regenererRelance, RelanceActionError } from '../../../../../lib/veille/demandeRelanceRepo';

/**
 * /api/admin/permis/reponses — GET agrégé LECTURE SEULE (R5a) + POST ACTIONS (R5b/R5c). R5b : rattacher une réponse à une
 * demande, marquer/démarquer un dossier reçu, lien signé de pièce, marquer une réponse traitée. R5c : éditer / régénérer /
 * abandonner un brouillon de relance, CLÔTURER une demande (enfin l'écrivain de 'close') et la ROUVRIR. Les refus métier
 * (transition interdite, régénération impossible) répondent en 409 avec un message explicite ; l'inattendu reste un 503
 * journalisé (jamais de catch muet). RÉSERVÉ ADMINISTRATEUR (même garde que les routes voisines). Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    return Response.json(await chargerSuiviReponses());
  } catch (e) {
    // Trace SERVEUR de l'exception inattendue (jamais de catch muet) : sans elle, un bug (colonne absente, 42703…) reste
    // invisible des deux côtés. La réponse HTTP au client reste un 503 générique.
    const err = e as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown; detail?: unknown; constraint?: unknown; table?: unknown; column?: unknown };
    console.error('[permis/reponses] GET suivi indisponible (503)', {
      name: err?.name, message: err?.message,
      code: err?.code, detail: err?.detail, constraint: err?.constraint, table: err?.table, column: err?.column,
      stack: err?.stack,
    });
    return Response.json({ erreur: 'suivi indisponible' }, { status: 503 });
  }
}

const estEntier = (v: unknown): v is number => Number.isInteger(v);

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const auteur = garde.auteurId === null ? 'admin' : String(garde.auteurId);
  // Contexte capturé hors du try pour la trace du catch (les refus métier 400/409 sont des `return`, jamais ce catch).
  let actionCtx: unknown;
  try {
    const corps = (await request.json().catch(() => ({}))) as {
      action?: unknown; reponseId?: unknown; demandeId?: unknown; dossierId?: unknown; pieceId?: unknown; satisfait?: unknown;
      relanceId?: unknown; objet?: unknown; corps?: unknown; motif?: unknown; // R5c (corps.corps = corps de la relance éditée)
    };
    actionCtx = corps.action;

    // Rattacher une réponse (file « à rattacher ») à une demande choisie → méthode 'manuel', rattache_le posé.
    if (corps.action === 'rattacher') {
      if (!estEntier(corps.reponseId) || !estEntier(corps.demandeId)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      const ok = await rattacherAMain(corps.reponseId, corps.demandeId, auteur); // R1 — aucune satisfaction auto au passage (volontaire)
      return Response.json({ ok, traite: ok });
    }

    // Marquer une réponse traitée (idempotent) — fait disparaître le bruit une fois arbitré.
    if (corps.action === 'traiter') {
      if (!estEntier(corps.reponseId)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      const ok = await marquerTraitee(corps.reponseId); // R1
      return Response.json({ ok, traite: ok });
    }

    // Marquer / démarquer un dossier reçu à la main. INTERDIT si la demande est 'close' (message explicite, pas un bouton inerte).
    if (corps.action === 'marquer_dossier') {
      if (!estEntier(corps.demandeId) || !estEntier(corps.dossierId) || typeof corps.satisfait !== 'boolean') return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      const st = await statutDemande(corps.demandeId);
      if (st === 'close') return Response.json({ erreur: 'demande close : marquage impossible (rouvrir la demande d’abord — chantier ultérieur)' }, { status: 409 });
      const ok = corps.satisfait
        ? await marquerDossierSatisfait(corps.demandeId, corps.dossierId, null, auteur) // R6c — manuel, reponse_id null
        : await demarquerDossier(corps.demandeId, corps.dossierId, auteur);             // R5b — annulation
      return Response.json({ ok, traite: ok });
    }

    // Lien de téléchargement d'une pièce déposée : le SERVEUR signe et renvoie l'URL — la clé de stockage ne sort JAMAIS au client.
    if (corps.action === 'url_piece') {
      if (!estEntier(corps.pieceId)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      const cle = await lireClePiece(corps.pieceId);
      if (cle === null) return Response.json({ erreur: 'pièce non déposée (aucune clé de stockage)' }, { status: 404 });
      const { urlSignee } = await import('../../../../../lib/stockage'); // import dynamique : garde @aws-sdk hors du graphe statique
      return Response.json({ url: await urlSignee(cle) });
    }

    // R5c — éditer le brouillon d'une relance (objet + corps). Le texte stocké EST la vérité (aucune régénération implicite).
    if (corps.action === 'editer_relance') {
      if (!estEntier(corps.relanceId) || typeof corps.objet !== 'string' || typeof corps.corps !== 'string') return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      const ok = await majRelance(corps.relanceId, corps.objet, corps.corps, auteur);
      return Response.json({ ok });
    }

    // R5c — régénérer : abandonne le brouillon courant et en produit un nouveau depuis les données actuelles (dossiers dus).
    if (corps.action === 'regenerer_relance') {
      if (!estEntier(corps.relanceId)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      try {
        const relanceId = await regenererRelance(corps.relanceId, auteur);
        return Response.json({ ok: true, relanceId });
      } catch (e) {
        // Refus métier (relance non-brouillon, demande close, identité incomplète, plus aucun dossier dû) → 409 explicite.
        if (e instanceof RelanceActionError) return Response.json({ erreur: e.raison }, { status: 409 });
        if (e instanceof Error && (e.name === 'IdentiteIncompleteError' || e.name === 'AucunDossierNonSatisfaitError')) return Response.json({ erreur: e.message }, { status: 409 });
        throw e;
      }
    }

    // R5c — abandonner une relance SANS en produire de nouvelle (l'auto ne la ressuscite plus : changement de règle R5c).
    if (corps.action === 'abandonner_relance') {
      if (!estEntier(corps.relanceId)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      const ok = await abandonnerRelance(corps.relanceId, auteur);
      return Response.json({ ok });
    }

    // R5c — CLÔTURER une demande (écrivain de 'close'). Uniquement depuis 'envoyee' ; motif requis si des dossiers restent dus.
    if (corps.action === 'cloturer') {
      if (!estEntier(corps.demandeId)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      try {
        await cloturerDemande(corps.demandeId, typeof corps.motif === 'string' ? corps.motif : '', auteur);
        return Response.json({ ok: true });
      } catch (e) {
        if (e instanceof TransitionInterditeError) return Response.json({ erreur: e.raison }, { status: 409 });
        throw e;
      }
    }

    // R5c — ROUVRIR une demande clôturée ('close' → 'envoyee') : retour arrière indispensable, l'échéance se recalcule seule.
    if (corps.action === 'rouvrir') {
      if (!estEntier(corps.demandeId)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      try {
        await rouvrirDemande(corps.demandeId, typeof corps.motif === 'string' ? corps.motif : null, auteur);
        return Response.json({ ok: true });
      } catch (e) {
        if (e instanceof TransitionInterditeError) return Response.json({ erreur: e.raison }, { status: 409 });
        throw e;
      }
    }

    return Response.json({ erreur: 'action inconnue' }, { status: 400 });
  } catch (e) {
    const err = e as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown; detail?: unknown; constraint?: unknown; table?: unknown; column?: unknown };
    console.error('[permis/reponses] POST action impossible (503)', {
      action: actionCtx,
      name: err?.name, message: err?.message,
      code: err?.code, detail: err?.detail, constraint: err?.constraint, table: err?.table, column: err?.column,
      stack: err?.stack,
    });
    return Response.json({ erreur: 'action impossible' }, { status: 503 });
  }
}
