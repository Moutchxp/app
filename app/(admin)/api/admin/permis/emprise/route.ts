import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { listerEmprises, enregistrerEmprise, supprimerEmprise, lireContexteEmprise, type CalageTrace } from '../../../../../lib/permis/empriseReconstruiteRepo';
import { calculerSimilitude, anneauVersLambert, aireM2, verdictCalage, verdictVraisemblance, type PaireCalage, type PointPlan } from '../../../../../lib/permis/calageEmprise';
import { depsReellesLectureGed } from '../../../../../lib/permis/lectureGed';
import { lireCleTelechargeable } from '../../../../../lib/sitadel/demandeRepo';

/**
 * PROJ-2 — /api/admin/permis/emprise : tracé manuel assisté d'une emprise RECONSTITUÉE, calée sur la parcelle.
 * GET ?dossierId=N → pièces PDF de la GED (choix), emprises déjà tracées, et contexte (empreinte parcelle + repères de vraisemblance).
 * POST { action } :
 *   'signer_piece' {pieceId}                → URL SIGNÉE inline de la pièce (rendu PDF client) ; la clé de stockage ne sort jamais.
 *   'enregistrer' {dossierId, libelle, pieceId, page, anneauPlan, paires, ratioDeclare}
 *                                           → 🔴 la GÉOMÉTRIE est recalculée CÔTÉ SERVEUR (similitude autoritative sur `paires`),
 *                                             jamais reçue du client ; enregistre UNE reconstitution (jamais une mesure).
 *   'supprimer' {dossierId, id}             → efface une reconstitution (scopée au dossier).
 * RÉSERVÉ ADMINISTRATEUR. Runtime Node.
 */
export const runtime = 'nodejs';

function coercerDossierId(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const dossierId = coercerDossierId(new URL(request.url).searchParams.get('dossierId'));
    if (dossierId === null) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
    const [piecesBrutes, emprises, contexte] = await Promise.all([
      depsReellesLectureGed().listerPieces(dossierId).catch(() => []),
      listerEmprises(dossierId),
      lireContexteEmprise(dossierId),
    ]);
    // Seules les pièces PDF sont traçables ; la clé de stockage ne sort JAMAIS (uniquement id/nom/type).
    const pieces = piecesBrutes
      .filter((p) => (p.typeMime ?? '').toLowerCase().includes('pdf') || p.nomFichier.toLowerCase().endsWith('.pdf'))
      .map((p) => ({ id: p.id, nomFichier: p.nomFichier, typeMime: p.typeMime }));
    return Response.json({ pieces, emprises, contexte });
  } catch (e) {
    console.error('[permis/emprise] GET indisponible', e);
    return Response.json({ erreur: 'emprises indisponibles' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string; dossierId?: number | string; pieceId?: number; page?: number; libelle?: string;
      anneauPlan?: PointPlan[]; paires?: PaireCalage[]; ratioDeclare?: number | null; id?: number;
    };

    if (body.action === 'signer_piece') {
      if (!Number.isInteger(body.pieceId)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      const piece = await lireCleTelechargeable(body.pieceId as number, 'dossier');
      if (!piece) return Response.json({ erreur: 'pièce introuvable' }, { status: 404 });
      const { urlSignee } = await import('../../../../../lib/stockage'); // import dynamique : @aws-sdk hors du graphe statique
      return Response.json({ url: await urlSignee(piece.cle, undefined, {}) }); // inline (le client ajoute #page=N, fragment jamais signé)
    }

    const dossierId = coercerDossierId(body.dossierId);
    if (dossierId === null) return Response.json({ erreur: 'requête invalide' }, { status: 400 });

    if (body.action === 'supprimer') {
      if (!Number.isInteger(body.id)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      const nb = await supprimerEmprise(body.id as number, dossierId);
      return Response.json({ ok: true, nb, emprises: await listerEmprises(dossierId) });
    }

    if (body.action === 'enregistrer') {
      const libelle = (body.libelle ?? '').trim();
      const paires = Array.isArray(body.paires) ? body.paires : [];
      const anneauPlan = Array.isArray(body.anneauPlan) ? body.anneauPlan : [];
      const ratioDeclare = typeof body.ratioDeclare === 'number' && Number.isFinite(body.ratioDeclare) && body.ratioDeclare > 0 ? body.ratioDeclare : null;
      if (libelle === '') return Response.json({ erreur: 'libellé du bâtiment requis' }, { status: 400 });
      if (anneauPlan.length < 3) return Response.json({ erreur: 'un contour exige au moins 3 sommets' }, { status: 400 });
      // 🔴 GÉOMÉTRIE AUTORITATIVE SERVEUR : la similitude est recalculée ici sur les paires de calage, jamais reçue du client.
      const sim = calculerSimilitude(paires);
      if (sim === null) return Response.json({ erreur: 'calage insuffisant (2 points distincts requis)' }, { status: 400 });
      const anneauLambert = anneauVersLambert(sim, anneauPlan);
      const vc = verdictCalage(sim, paires, ratioDeclare);
      const calage: CalageTrace = {
        paires, ratioDeclare, ratioImplicite: vc.ratioImplicite, residuFitM: vc.residuFitM,
        residuEchelleM: vc.residuEchelleM, douteux: vc.douteux, raisons: vc.raisons,
      };
      const res = await enregistrerEmprise({ dossierId, libelle, anneau: anneauLambert, pieceId: body.pieceId ?? null, page: body.page ?? null, calage, residuM: vc.residuFitM, creePar: 'admin:trace' });
      if (!res.ok) return Response.json({ erreur: res.motif }, { status: res.tableAbsente ? 409 : 400 });
      const contexte = await lireContexteEmprise(dossierId);
      const vraisemblance = verdictVraisemblance({ aireM2: aireM2(anneauLambert), surfacePlancherM2: contexte.surfacePlancherM2, nbEtages: contexte.nbEtages, surfaceTerrainM2: contexte.surfaceTerrainM2 });
      return Response.json({ ok: true, id: res.id, surfaceM2: aireM2(anneauLambert), calage: vc, vraisemblance, emprises: await listerEmprises(dossierId) });
    }

    return Response.json({ erreur: 'action inconnue' }, { status: 400 });
  } catch (e) {
    console.error('[permis/emprise] POST indisponible', e);
    return Response.json({ erreur: 'action indisponible' }, { status: 503 });
  }
}
