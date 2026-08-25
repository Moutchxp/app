import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { listerEmprises, enregistrerEmprise, supprimerEmprise, lireContexteEmprise, listerIgnorees, ignorerProjection, retablirProjection, listerBatiments, type CalageTrace } from '../../../../../lib/permis/empriseReconstruiteRepo';
import { calculerSimilitude, anneauVersLambert, aireM2, verdictCalage, verdictVraisemblance, type PaireCalage, type PointPlan } from '../../../../../lib/permis/calageEmprise';
import { depsReellesLectureGed } from '../../../../../lib/permis/lectureGed';
import { lireCleTelechargeable } from '../../../../../lib/sitadel/demandeRepo';
import { classerPiecesPlanMasse, scoreNomPlanMasse, pagePlanMasse, lireEchelleTexte } from '../../../../../lib/permis/planMasse';

// PROJ-3d — confirmation page-level PARESSEUSE : plafond DUR de pièces ouvertes côté serveur (mesuré ~98 ms/pièce → ~0,7 s pour 7).
//   Ne JAMAIS ouvrir les 81 pièces (~8 s). Les proposées au-delà du plafond restent proposées PAR LEUR NOM, sans confirmation.
const PLAFOND_SHORTLIST = 8;

/**
 * PROJ-2 / PROJ-2b — /api/admin/permis/emprise : tracé manuel assisté d'une emprise RECONSTITUÉE, calée sur la parcelle, PAR BÂTIMENT.
 * GET ?dossierId=N → pièces PDF de la GED (choix), emprises déjà tracées (avec corps_id), projections IGNORÉES, et contexte.
 * POST { action } :
 *   'signer_piece' {pieceId}                → URL SIGNÉE inline de la pièce (rendu PDF client) ; la clé de stockage ne sort jamais.
 *   'enregistrer' {dossierId, corpsId, libelle, pieceId, page, anneauPlan, paires, ratioDeclare}
 *                                           → 🔴 la GÉOMÉTRIE est recalculée CÔTÉ SERVEUR (similitude autoritative sur `paires`),
 *                                             jamais reçue du client ; enregistre UNE reconstitution (jamais une mesure), liée au bâtiment.
 *   'ignorer' {dossierId, corpsId, motif}   → PROJ-2b : ignore la projection d'un bâtiment (motif obligatoire) + journal append-only.
 *   'retablir' {dossierId, corpsId}         → PROJ-2b : annule l'ignorance (réversible) + journal.
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
    // RÉSILIENCE : chaque source est ISOLÉE — une lecture défaillante ne fait plus tomber toute la réponse (précédent : nb_etages
    //   inexistant → 503 → écran « 0 bâtiment » mensonger). Pas de catch muet : la source fautive est TOUJOURS journalisée et
    //   listée dans `indisponibles`, pour que le client distingue « indisponible » (panne) de « vide » (0 réel). Repli sûr par source.
    const indisponibles: string[] = [];
    const repli = async <T,>(source: string, p: Promise<T>, valeur: T): Promise<T> => {
      try { return await p; }
      catch (e) { indisponibles.push(source); console.error(`[permis/emprise] source indisponible: ${source}`, { dossierId, message: e instanceof Error ? e.message : String(e) }); return valeur; }
    };
    const deps = depsReellesLectureGed();
    const [piecesBrutes, emprises, ignores, batiments, contexte] = await Promise.all([
      repli('pieces', deps.listerPieces(dossierId), []),
      repli('emprises', listerEmprises(dossierId), []),
      repli('ignores', listerIgnorees(dossierId), []),
      repli('batiments', listerBatiments(dossierId), []),
      repli('contexte', lireContexteEmprise(dossierId), { empreinteAnneaux: [], surfaceTerrainM2: null, surfacePlancherM2: null, nbEtages: null }),
    ]);
    // Seules les pièces PDF sont traçables (filtre inchangé) ; la clé de stockage ne sort JAMAIS.
    const piecesPdf = piecesBrutes.filter((p) => (p.typeMime ?? '').toLowerCase().includes('pdf') || p.nomFichier.toLowerCase().endsWith('.pdf'));
    // PROJ-3d ① — TRI PAR NOM (instantané, 0 I/O) : plans de masse proposés d'abord (score R.431-9), tout le reste conservé (repli).
    const { proposees, autres } = classerPiecesPlanMasse(piecesPdf);
    // PROJ-3d ② — CONFIRMATION PARESSEUSE, uniquement sur la shortlist plafonnée : ouvre chaque candidat, cherche la page « plan de
    //   masse » (n° proposé) + une échelle indicative. Dégradation propre : une pièce illisible reste proposée par son NOM (confirme=false).
    const confirmations = new Map<number, { pagePlan: number | null; echelle: string | null }>();
    await Promise.all(proposees.slice(0, PLAFOND_SHORTLIST).map(async (p) => {
      try {
        const ex = await deps.extraire(await deps.lireObjet(p.cleStockage), p.typeMime);
        if (!ex.ok) { indisponibles.push(`texte:${p.id}`); console.error(`[permis/emprise] texte pièce ${p.id} illisible`, { motif: ex.motif }); return; }
        const page = pagePlanMasse(ex.pages);
        confirmations.set(p.id, { pagePlan: page, echelle: page ? lireEchelleTexte(ex.pages[page - 1]) : null });
      } catch (e) { indisponibles.push(`texte:${p.id}`); console.error(`[permis/emprise] confirmation pièce ${p.id} indisponible`, { message: e instanceof Error ? e.message : String(e) }); }
    }));
    const enrichir = (p: { id: number; nomFichier: string; typeMime: string | null }, propose: boolean) => {
      const c = confirmations.get(p.id);
      return { id: p.id, nomFichier: p.nomFichier, typeMime: p.typeMime, propose, score: propose ? scoreNomPlanMasse(p.nomFichier) : 0, pagePlan: c?.pagePlan ?? null, echelle: c?.echelle ?? null, confirme: (c?.pagePlan ?? null) !== null };
    };
    const pieces = [...proposees.map((p) => enrichir(p, true)), ...autres.map((p) => enrichir(p, false))];
    return Response.json({ pieces, emprises, ignores, batiments, contexte, indisponibles });
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
      action?: string; dossierId?: number | string; corpsId?: number; pieceId?: number; page?: number; libelle?: string;
      anneauPlan?: PointPlan[]; paires?: PaireCalage[]; ratioDeclare?: number | null; id?: number; motif?: string;
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
      const [emprises, ignores] = await Promise.all([listerEmprises(dossierId), listerIgnorees(dossierId)]);
      return Response.json({ ok: true, nb, emprises, ignores });
    }

    // PROJ-2b — ignorer / rétablir la projection d'UN bâtiment (débloque la validation sans tracer ; réversible ; tracé au journal).
    if (body.action === 'ignorer' || body.action === 'retablir') {
      if (!Number.isInteger(body.corpsId)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      const res = body.action === 'ignorer'
        ? await ignorerProjection(dossierId, body.corpsId as number, body.motif ?? '', 'admin:projection')
        : await retablirProjection(dossierId, body.corpsId as number, 'admin:projection');
      if (!res.ok) return Response.json({ erreur: res.motif }, { status: res.tableAbsente ? 409 : 400 });
      const [emprises, ignores] = await Promise.all([listerEmprises(dossierId), listerIgnorees(dossierId)]);
      return Response.json({ ok: true, emprises, ignores });
    }

    if (body.action === 'enregistrer') {
      const libelle = (body.libelle ?? '').trim();
      const paires = Array.isArray(body.paires) ? body.paires : [];
      const anneauPlan = Array.isArray(body.anneauPlan) ? body.anneauPlan : [];
      const ratioDeclare = typeof body.ratioDeclare === 'number' && Number.isFinite(body.ratioDeclare) && body.ratioDeclare > 0 ? body.ratioDeclare : null;
      if (!Number.isInteger(body.corpsId)) return Response.json({ erreur: 'bâtiment requis' }, { status: 400 }); // PROJ-2b : une emprise par bâtiment
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
      const res = await enregistrerEmprise({ dossierId, corpsId: body.corpsId as number, libelle, anneau: anneauLambert, pieceId: body.pieceId ?? null, page: body.page ?? null, calage, residuM: vc.residuFitM, creePar: 'admin:trace' });
      if (!res.ok) return Response.json({ erreur: res.motif }, { status: res.tableAbsente ? 409 : 400 });
      const contexte = await lireContexteEmprise(dossierId);
      const vraisemblance = verdictVraisemblance({ aireM2: aireM2(anneauLambert), surfacePlancherM2: contexte.surfacePlancherM2, nbEtages: contexte.nbEtages, surfaceTerrainM2: contexte.surfaceTerrainM2 });
      const [emprises, ignores] = await Promise.all([listerEmprises(dossierId), listerIgnorees(dossierId)]);
      return Response.json({ ok: true, id: res.id, surfaceM2: aireM2(anneauLambert), calage: vc, vraisemblance, emprises, ignores });
    }

    return Response.json({ erreur: 'action inconnue' }, { status: 400 });
  } catch (e) {
    console.error('[permis/emprise] POST indisponible', e);
    return Response.json({ erreur: 'action indisponible' }, { status: 503 });
  }
}
