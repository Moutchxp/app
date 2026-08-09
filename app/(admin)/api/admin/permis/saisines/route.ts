import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { chargerSuiviSaisines } from '../../../../../lib/veille/saisinesSuivi';
import {
  creerSaisineCada, marquerSaisineDeposee, enregistrerAvisSaisine, SaisineCadaError, SENS_AVIS, type SensAvis,
} from '../../../../../lib/veille/saisineCadaRepo';
import { abandonnerRelance } from '../../../../../lib/veille/demandeRelanceRepo';

/**
 * /api/admin/permis/saisines — GET agrégé LECTURE SEULE (saisissables + indéterminées + lancées/en cours + reçues +
 * abandonnées + file de dépôt) et POST ACTIONS. « lancer » : crée la saisine en brouillon (creerSaisineCada) puis la fait
 * partir immédiatement OU la place en file de dépôt (l'orchestrateur d'envoi X3, réutilisé, décide selon config_veille.cada_email) ;
 * « marquer_deposee » : dépôt manuel constaté ; « abandonner » : réutilise le chemin d'abandon générique de demande_relance ;
 * « enregistrer_avis » : consigne l'avis rendu par la CADA (favorable / défavorable / sans_suite).
 *
 * Erreurs : refus métier (état incompatible, plus rien à réclamer…) → 409 explicite ; DOUBLE saisine simultanée (23505 sur
 * demande_relance_vivante_uniq, discriminée par err.constraint) → 409 nommé — c'est le garde-fou anti-doublon ; toute exception
 * inattendue → 503 APRÈS journalisation serveur complète (name/message/stack + code/detail/constraint/table/column), jamais un
 * catch muet. RÉSERVÉ ADMINISTRATEUR (même garde que les routes voisines). Runtime Node. demande.statut n'est JAMAIS écrit ici.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    return Response.json(await chargerSuiviSaisines());
  } catch (e) {
    const err = e as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown; detail?: unknown; constraint?: unknown; table?: unknown; column?: unknown };
    console.error('[permis/saisines] GET suivi indisponible (503)', {
      name: err?.name, message: err?.message,
      code: err?.code, detail: err?.detail, constraint: err?.constraint, table: err?.table, column: err?.column,
      stack: err?.stack,
    });
    return Response.json({ erreur: 'suivi indisponible' }, { status: 503 });
  }
}

const estEntier = (v: unknown): v is number => Number.isInteger(v);
const estSens = (v: unknown): v is SensAvis => typeof v === 'string' && (SENS_AVIS as readonly string[]).includes(v);
const invalide = (): Response => Response.json({ erreur: 'requête invalide' }, { status: 400 });

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const auteur = garde.auteurId === null ? 'admin' : String(garde.auteurId);
  // Contexte capturé hors du try pour la trace du catch (les refus métier 400/409 sont des `return`, jamais ce catch).
  let actionCtx: unknown;
  try {
    const corps = (await request.json().catch(() => ({}))) as {
      action?: unknown; demandeId?: unknown; saisineId?: unknown; sens?: unknown;
    };
    actionCtx = corps.action;

    // « lancer » : crée le brouillon PUIS réutilise l'orchestrateur d'envoi X3, restreint à cette seule saisine (candidats
    // filtrés). L'orchestrateur décide du canal : e-mail immédiat (copie de la demande en PJ) si cada_email est renseigné,
    // sinon file de dépôt (aucun envoi). Import DYNAMIQUE : garde nodemailer/pdfkit hors du graphe statique de la route.
    if (corps.action === 'lancer') {
      if (!estEntier(corps.demandeId)) return invalide();
      const saisineId = await creerSaisineCada(corps.demandeId, auteur); // SaisineCadaError / 23505 / identité → catch → 409
      const { envoyerSaisinesCada, depsReellesEnvoiSaisine } = await import('../../../../../lib/sitadel/envoiSaisineCada');
      const base = depsReellesEnvoiSaisine();
      const rapport = await envoyerSaisinesCada(
        { appliquer: true, auteur },
        { ...base, candidats: async () => (await base.candidats()).filter((s) => s.saisineId === saisineId) },
      );
      if (rapport.canal === 'formulaire') return Response.json({ ok: true, canal: 'formulaire', saisineId });
      const r0 = rapport.resultats.find((x) => x.saisineId === saisineId) ?? rapport.resultats[0];
      if (r0 && r0.issue === 'envoye') return Response.json({ ok: true, canal: 'email', issue: 'envoye', saisineId });
      // Brouillon créé mais envoi non abouti (forclose de justesse / PJ / compte SMTP / gabarit / budget partagé épuisé) : la
      // saisine reste en brouillon (visible dans la file de dépôt), on renvoie le motif honnête — jamais un faux succès.
      const motif = r0?.motif
        ?? rapport.bloqueesForclusion[0]?.motif ?? rapport.bloqueesPiece[0]?.motif
        ?? rapport.bloqueesCompte[0]?.motif ?? rapport.bloqueesCorps[0]?.motif
        ?? (rapport.budget === 0 ? 'plafond d’envoi du jour atteint (saisine préparée en brouillon, à relancer)' : 'envoi impossible (saisine préparée en brouillon)');
      return Response.json({ ok: false, canal: 'email', issue: r0?.issue ?? 'bloquee', motif, saisineId });
    }

    // « marquer_deposee » : le gestionnaire a déposé la saisine à la main sur le formulaire → brouillon devient 'envoyee'.
    if (corps.action === 'marquer_deposee') {
      if (!estEntier(corps.saisineId)) return invalide();
      await marquerSaisineDeposee(corps.saisineId, auteur); // refuse un non-'brouillon' → SaisineCadaError → 409
      return Response.json({ ok: true });
    }

    // « abandonner » : chemin d'abandon GÉNÉRIQUE de demande_relance (s'applique tel quel à une saisine). Idempotent.
    if (corps.action === 'abandonner') {
      if (!estEntier(corps.saisineId)) return invalide();
      const ok = await abandonnerRelance(corps.saisineId, auteur);
      return Response.json({ ok });
    }

    // « enregistrer_avis » : consigne l'avis rendu par la CADA (favorable / défavorable / sans_suite). Refuse une saisine
    // qui n'est pas 'envoyee' (garde SQL) → SaisineCadaError → 409.
    if (corps.action === 'enregistrer_avis') {
      if (!estEntier(corps.saisineId) || !estSens(corps.sens)) return invalide();
      await enregistrerAvisSaisine(corps.saisineId, corps.sens, auteur);
      return Response.json({ ok: true });
    }

    return Response.json({ erreur: 'action inconnue' }, { status: 400 });
  } catch (e) {
    // Refus métier (état incompatible, plus rien à réclamer, identité incomplète…) → 409 explicite, sans journalisation d'erreur.
    if (e instanceof SaisineCadaError) return Response.json({ erreur: e.raison }, { status: 409 });
    if (e instanceof Error && (e.name === 'IdentiteIncompleteError' || e.name === 'AucunDossierNonSatisfaitError')) {
      return Response.json({ erreur: e.message }, { status: 409 });
    }
    const err = e as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown; detail?: unknown; constraint?: unknown; table?: unknown; column?: unknown };
    // DOUBLE déclenchement simultané : l'unique partiel demande_relance_vivante_uniq tranche → 23505. Discriminé par
    // err.constraint (motif certificatEmission.ts) → 409 nommé, JAMAIS un 503. C'est le garde-fou anti-double-saisine.
    if (err.code === '23505' && err.constraint === 'demande_relance_vivante_uniq') {
      return Response.json({ erreur: 'une saisine est déjà en cours pour cette demande' }, { status: 409 });
    }
    console.error('[permis/saisines] POST action impossible (503)', {
      action: actionCtx,
      name: err?.name, message: err?.message,
      code: err?.code, detail: err?.detail, constraint: err?.constraint, table: err?.table, column: err?.column,
      stack: err?.stack,
    });
    return Response.json({ erreur: 'action impossible' }, { status: 503 });
  }
}
