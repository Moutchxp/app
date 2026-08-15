import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { chargerSuiviReponses } from '../../../../../lib/veille/reponsesSuivi';
import { rattacherAMain, marquerTraitee, marquerDossierSatisfait, demarquerDossier, statutDemande,
  marquerDossierNonFourni, marquerDossierRefusMairie, annulerTriageDossier, retirerDossierDemande, reattacherDossierDemande,
  lireRecuLeReponse, reclasserNatureReponse, estNatureReclassable, marquerRepondu, annulerRepondu, RattachementNonEnvoyeeError } from '../../../../../lib/veille/demandeReponseRepo';
import { cloturerDemande, rouvrirDemande, TransitionInterditeError, lireCleTelechargeable, marquerDeposee, DepotInterditError } from '../../../../../lib/sitadel/demandeRepo';
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
      nature?: unknown; // T7-A : cible du reclassement manuel (accuse | documents | autre)
      relanceId?: unknown; objet?: unknown; corps?: unknown; motif?: unknown; source?: unknown; // R5c ; A1b : source pour url_piece ('reponse'|'dossier')
      refusLe?: unknown; // T1 : date de notification du refus exprès (YYYY-MM-DD)
      envoyeLe?: unknown; // T4 : date RÉELLE de dépôt saisie (YYYY-MM-DD) pour confirmer une proposition
    };
    actionCtx = corps.action;

    // Rattacher une réponse (file « à rattacher ») à une demande choisie → méthode 'manuel', rattache_le posé.
    if (corps.action === 'rattacher') {
      if (!estEntier(corps.reponseId) || !estEntier(corps.demandeId)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      // T4 — garde ROUTE : jamais un rattachement manuel vers une demande NON envoyée (brouillon/prête) → file « Dépôts à confirmer ».
      const stRat = await statutDemande(corps.demandeId);
      if (stRat === 'brouillon' || stRat === 'prete') return Response.json({ erreur: `demande « ${stRat} » : confirmez d'abord le dépôt (« cette demande a-t-elle été déposée ? »)` }, { status: 409 });
      try {
        const ok = await rattacherAMain(corps.reponseId, corps.demandeId, auteur); // R1 — aucune satisfaction auto au passage (volontaire)
        return Response.json({ ok, traite: ok });
      } catch (e) {
        if (e instanceof RattachementNonEnvoyeeError) return Response.json({ erreur: e.message }, { status: 409 }); // garde REPO (défense en profondeur)
        throw e;
      }
    }

    // T4 — CONFIRMER un dépôt (proposition « cette demande a-t-elle été déposée ? ») : bascule la demande EN ATTENTE en envoyée
    //   via le chemin EXISTANT (marquerDeposee) AVEC la date RÉELLE saisie, puis rattache le message. Date OBLIGATOIRE, NON future
    //   et NON postérieure au message (le dépôt précède la réponse de la mairie) — la même règle côté écran.
    if (corps.action === 'confirmer_depot') {
      if (!estEntier(corps.reponseId) || !estEntier(corps.demandeId)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      if (typeof corps.envoyeLe !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(corps.envoyeLe)) return Response.json({ erreur: 'date de dépôt requise (AAAA-MM-JJ)' }, { status: 400 });
      const aujourdhui = new Date().toISOString().slice(0, 10);
      if (corps.envoyeLe > aujourdhui) return Response.json({ erreur: 'la date de dépôt ne peut pas être dans le futur' }, { status: 400 });
      const recuLe = await lireRecuLeReponse(corps.reponseId);
      if (recuLe === null) return Response.json({ erreur: 'message introuvable' }, { status: 404 });
      if (corps.envoyeLe > recuLe) return Response.json({ erreur: 'la date de dépôt ne peut pas être postérieure au message reçu' }, { status: 400 });
      try {
        await marquerDeposee(corps.demandeId, auteur, null, corps.envoyeLe);      // chemin existant : statut envoyée + acheminement (envoye_le = saisie)
        await rattacherAMain(corps.reponseId, corps.demandeId, auteur);           // la demande est maintenant envoyée → rattachement autorisé
      } catch (e) {
        if (e instanceof DepotInterditError) return Response.json({ erreur: e.raison }, { status: 409 });
        if (e instanceof RattachementNonEnvoyeeError) return Response.json({ erreur: e.message }, { status: 409 });
        throw e;
      }
      return Response.json({ ok: true });
    }

    // T4 — IGNORER une proposition : marque le message traité (traite_le) → il ne réapparaît plus (ni proposition, ni « à rattacher »).
    if (corps.action === 'ignorer_proposition') {
      if (!estEntier(corps.reponseId)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      const ok = await marquerTraitee(corps.reponseId);
      return Response.json({ ok, traite: ok });
    }

    // Marquer une réponse traitée (idempotent) — fait disparaître le bruit une fois arbitré.
    if (corps.action === 'traiter') {
      if (!estEntier(corps.reponseId)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      const ok = await marquerTraitee(corps.reponseId); // R1
      return Response.json({ ok, traite: ok });
    }

    // T7-A — RECLASSER À LA MAIN la nature d'un message. Cibles autorisées : accuse | documents | autre (jamais rebond, fait
    //   technique ; jamais indetermine, état transitoire). Gabarit `action + reponseId`, comme rattacher/traiter. Le repo pose
    //   l'ancre nature_classee_le et journalise l'auteur dans `note` ; ne touche NI demande.statut NI satisfait_le NI Archives.
    if (corps.action === 'reclasser') {
      if (!estEntier(corps.reponseId) || !estNatureReclassable(corps.nature)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      const ok = await reclasserNatureReponse(corps.reponseId, corps.nature, auteur);
      return Response.json({ ok, traite: ok });
    }

    // T7-B (cas ③) — MARQUER un message « répondu » (bouton MANUEL) ou ANNULER ce marquage (réversible). Gabarit `action +
    //   reponseId`, comme reclasser/traiter. Le repo journalise l'auteur ; ne touche NI demande.statut NI satisfait_le NI Archives.
    if (corps.action === 'repondu' || corps.action === 'annuler_repondu') {
      if (!estEntier(corps.reponseId)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      const ok = corps.action === 'repondu'
        ? await marquerRepondu(corps.reponseId, auteur)
        : await annulerRepondu(corps.reponseId, auteur);
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

    // T1 — statuer un dossier : NON FOURNI / REFUS MAIRIE (exprès) / annuler triage / RETIRER / ré-attacher. Toutes INTERDITES
    //   si la demande est 'close' (comme marquer_dossier). Le refus exprès exige une date de notification NON future.
    if (corps.action === 'dossier_non_fourni' || corps.action === 'dossier_refus_mairie' || corps.action === 'annuler_triage'
        || corps.action === 'retirer_dossier' || corps.action === 'reattacher_dossier') {
      if (!estEntier(corps.demandeId) || !estEntier(corps.dossierId)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      const st = await statutDemande(corps.demandeId);
      if (st === 'close') return Response.json({ erreur: 'demande close : action impossible (rouvrir la demande d’abord)' }, { status: 409 });

      if (corps.action === 'dossier_refus_mairie') {
        const aujourdhui = new Date().toISOString().slice(0, 10);
        if (typeof corps.refusLe !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(corps.refusLe)) return Response.json({ erreur: 'date de refus invalide (attendu AAAA-MM-JJ)' }, { status: 400 });
        if (corps.refusLe > aujourdhui) return Response.json({ erreur: 'la date de notification du refus ne peut pas être dans le futur' }, { status: 400 });
        const ok = await marquerDossierRefusMairie(corps.demandeId, corps.dossierId, corps.refusLe, auteur);
        return Response.json({ ok, traite: ok });
      }
      if (corps.action === 'dossier_non_fourni') { const ok = await marquerDossierNonFourni(corps.demandeId, corps.dossierId, auteur); return Response.json({ ok, traite: ok }); }
      if (corps.action === 'annuler_triage') { const ok = await annulerTriageDossier(corps.demandeId, corps.dossierId, auteur); return Response.json({ ok, traite: ok }); }
      if (corps.action === 'retirer_dossier') { const ok = await retirerDossierDemande(corps.demandeId, corps.dossierId, auteur); return Response.json({ ok, traite: ok }); }
      // reattacher_dossier — conflict-safe : 'conflit' → 409 explicite (jamais un 23505 nu).
      const r = await reattacherDossierDemande(corps.demandeId, corps.dossierId, auteur);
      if (r === 'conflit') return Response.json({ erreur: 'ré-attachement impossible : ce dossier est déjà rattaché à une autre demande active' }, { status: 409 });
      return Response.json({ ok: r === 'reattache', traite: r === 'reattache' });
    }

    // Lien de téléchargement d'une pièce déposée : le SERVEUR signe et renvoie l'URL — la clé de stockage ne sort JAMAIS au client.
    if (corps.action === 'url_piece') {
      if (!estEntier(corps.pieceId)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      // A1b — dispatch par ORIGINE (défaut 'reponse' = pièce reçue par e-mail ; 'dossier' = document ajouté à la main) : UNE
      // seule lecture de clé (lireCleTelechargeable) et UN seul signeur (urlSignee). La clé de stockage ne sort jamais au client.
      const source = corps.source === 'dossier' ? 'dossier' : 'reponse';
      const piece = await lireCleTelechargeable(corps.pieceId, source);
      if (piece === null) return Response.json({ erreur: 'pièce non déposée (aucune clé de stockage)' }, { status: 404 });
      const { urlSignee } = await import('../../../../../lib/stockage'); // import dynamique : garde @aws-sdk hors du graphe statique
      // N6-E — SÉCURITÉ : téléchargement FORCÉ (Content-Disposition: attachment) → une pièce HTML/CSV n'est jamais rendue inline.
      return Response.json({ url: await urlSignee(piece.cle, undefined, { forcerTelechargement: true, nomFichier: piece.nomFichier }) });
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
