import 'server-only';
import { verifierJetonCada } from '../../../lib/internaute/jetonRectification';
import { SaisineCadaError } from '../../../lib/veille/saisineCadaRepo';

/**
 * X5 — POST public de CONFIRMATION de saisine CADA (déclenché par le clic du bouton, JAMAIS par le chargement du lien). Re-
 * VÉRIFIE le jeton (l'autorité, jamais un id du client), puis emprunte EXACTEMENT le chemin partagé « lancer » (création +
 * orchestrateur d'envoi restreint) — logique non réécrite. Anti-doublon : si l'onglet a lancé la saisine entre-temps,
 * creerSaisineCada lève (SaisineCadaError « déjà en cours ») ou l'unique demande_relance_vivante_uniq tranche (23505) → on
 * répond « déjà lancée », jamais un 503. Runtime Node. AUCUNE session (page publique). demande.statut n'est jamais écrit.
 */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  let demandeCtx: number | null = null;
  try {
    const corps = (await request.json().catch(() => ({}))) as { jeton?: unknown };
    if (typeof corps.jeton !== 'string' || corps.jeton === '') {
      return Response.json({ ok: false, etat: 'jeton', message: 'lien invalide' }, { status: 400 });
    }
    const v = await verifierJetonCada(corps.jeton);
    if (!v.ok) {
      // Jeton invalide / expiré : on n'agit pas. L'exploitant peut toujours passer par l'onglet Saisines CADA.
      return Response.json({ ok: false, etat: 'jeton', message: v.raison === 'expire' ? 'lien expiré' : 'lien invalide' }, { status: 401 });
    }
    demandeCtx = v.demandeId;

    // Chemin PARTAGÉ avec le bouton de l'onglet. Import DYNAMIQUE : garde nodemailer/pdfkit hors du graphe statique.
    const { lancerSaisinePourDemande } = await import('../../../lib/sitadel/envoiSaisineCada');
    const r = await lancerSaisinePourDemande(v.demandeId, 'lien e-mail CADA');
    return Response.json({ ok: r.ok, canal: r.canal, issue: r.issue, motif: r.motif });
  } catch (e) {
    // Refus métier → 409. « déjà en cours » (saisine vivante) → etat 'deja' pour que la page dise « déjà lancée ».
    if (e instanceof SaisineCadaError) {
      const deja = /déjà en cours/i.test(e.raison);
      return Response.json({ ok: false, etat: deja ? 'deja' : 'refus', message: e.raison }, { status: 409 });
    }
    if (e instanceof Error && (e.name === 'IdentiteIncompleteError' || e.name === 'AucunDossierNonSatisfaitError')) {
      return Response.json({ ok: false, etat: 'refus', message: e.message }, { status: 409 });
    }
    const err = e as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown; detail?: unknown; constraint?: unknown; table?: unknown; column?: unknown };
    // Double déclenchement simultané (onglet + lien) → l'unique demande_relance_vivante_uniq tranche → 409 « déjà lancée ».
    if (err.code === '23505' && err.constraint === 'demande_relance_vivante_uniq') {
      return Response.json({ ok: false, etat: 'deja', message: 'une saisine est déjà en cours pour cette demande' }, { status: 409 });
    }
    console.error('[cada/confirmer] POST impossible (503)', {
      demandeId: demandeCtx,
      name: err?.name, message: err?.message,
      code: err?.code, detail: err?.detail, constraint: err?.constraint, table: err?.table, column: err?.column,
      stack: err?.stack,
    });
    return Response.json({ ok: false, etat: 'erreur', message: 'action impossible' }, { status: 503 });
  }
}
