import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { listerEmprises, enregistrerEmprise, supprimerEmprise, lireContexteEmprise, listerIgnorees, ignorerProjection, retablirProjection, listerBatiments, lirePolygonesEmpreinte, listerPolygonesProjetEcartes, ecarterPolygoneProjet, retablirPolygoneProjet, type CalageTrace } from '../../../../../lib/permis/empriseReconstruiteRepo';
import { calculerSimilitude, anneauVersLambert, aireM2, verdictCalage, verdictVraisemblance, type PaireCalage, type PointPlan } from '../../../../../lib/permis/calageEmprise';
import { depsReellesLectureGed } from '../../../../../lib/permis/lectureGed';
import { lireCleTelechargeable } from '../../../../../lib/sitadel/demandeRepo';
import { classerPiecesParFamille, scoreNomPlanMasse, pagesPlanches, lireEchelleTexte, familleDeNom, tracabilitePlanche } from '../../../../../lib/permis/planMasse';

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
    const [piecesBrutes, emprises, ignores, batiments, contexte, polygones, polygonesEcartes] = await Promise.all([
      repli('pieces', deps.listerPieces(dossierId), []),
      repli('emprises', listerEmprises(dossierId), []),
      repli('ignores', listerIgnorees(dossierId), []),
      repli('batiments', listerBatiments(dossierId), []),
      repli('contexte', lireContexteEmprise(dossierId), { empreinteAnneaux: [], surfaceTerrainM2: null, surfacePlancherM2: null, batiments: [] }),
      repli('polygones', lirePolygonesEmpreinte(dossierId), []), // PROJ-3h — polygones BD TOPO (∩ empreinte) + état, pour l'affichage
      repli('ecartes', listerPolygonesProjetEcartes(dossierId), []), // PROJ-3i — cleabs des polygones « en projet » écartés (décochés)
    ]);
    // Seules les pièces PDF sont traçables (filtre inchangé) ; la clé de stockage ne sort JAMAIS.
    const piecesPdf = piecesBrutes.filter((p) => (p.typeMime ?? '').toLowerCase().includes('pdf') || p.nomFichier.toLowerCase().endsWith('.pdf'));
    // PROJ-3d/3g ① — TRI PAR NOM (instantané, 0 I/O) : familles masse → étage → coupe (ordre), le reste conservé (repli).
    const { proposees, autres } = classerPiecesParFamille(piecesPdf);
    // PROJ-3d/3f — CONFIRMATION PARESSEUSE, uniquement sur la shortlist plafonnée : ouvre chaque candidat et l'ÉCLATE EN PLANCHES
    //   (ses pages hors cartouche, cf. pagesPlanches) + une échelle indicative par page. Texte SEUL (jamais getOperatorList, trop cher).
    //   Dégradation propre : une pièce illisible reste proposée par son NOM, sans planche (confirme=false → l'UI repliera sur la page 1).
    // PROJ-3m ① — chaque PLANCHE porte sa traçabilité PAR PAGE (une pièce PC3 « coupe » peut mêler coupes et plans de niveau).
    const confirmations = new Map<number, { planches: { page: number; echelle: string | null; tracable: boolean; famille: 'masse' | 'etage' | 'coupe'; ambigu: boolean }[] }>();
    await Promise.all(proposees.slice(0, PLAFOND_SHORTLIST).map(async (p) => {
      try {
        const ex = await deps.extraire(await deps.lireObjet(p.cleStockage), p.typeMime);
        if (!ex.ok) { indisponibles.push(`texte:${p.id}`); console.error(`[permis/emprise] texte pièce ${p.id} illisible`, { motif: ex.motif }); return; }
        const planches = pagesPlanches(ex.pages).map((pg) => {
          const tp = tracabilitePlanche(p.famille, ex.pages[pg - 1] ?? '');
          return { page: pg, echelle: lireEchelleTexte(ex.pages[pg - 1] ?? ''), tracable: tp.tracable, famille: tp.famille, ambigu: tp.ambigu };
        });
        confirmations.set(p.id, { planches });
      } catch (e) { indisponibles.push(`texte:${p.id}`); console.error(`[permis/emprise] confirmation pièce ${p.id} indisponible`, { message: e instanceof Error ? e.message : String(e) }); }
    }));
    const enrichir = (p: { id: number; nomFichier: string; typeMime: string | null }, propose: boolean, famille: 'masse' | 'etage' | 'coupe' | null) => {
      const planches = confirmations.get(p.id)?.planches ?? [];
      return { id: p.id, nomFichier: p.nomFichier, typeMime: p.typeMime, propose, famille, score: propose ? scoreNomPlanMasse(p.nomFichier) : 0, planches, confirme: planches.length > 0 };
    };
    const pieces = [...proposees.map((p) => enrichir(p, true, p.famille)), ...autres.map((p) => enrichir(p, false, null))];
    return Response.json({ pieces, emprises, ignores, batiments, contexte, polygones, polygonesEcartes, indisponibles });
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
      anneauPlan?: PointPlan[]; paires?: PaireCalage[]; ratioDeclare?: number | null; id?: number; motif?: string; cleabs?: string;
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

    // PROJ-3i — ÉCARTER / RÉTABLIR un polygone « en projet » (décision d'affichage d'Arno, tracée). 🔴 Aucun couplage moteur.
    if (body.action === 'ecarter_polygone' || body.action === 'retablir_polygone') {
      const cleabs = typeof body.cleabs === 'string' ? body.cleabs : '';
      if (cleabs.trim() === '') return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      const res = body.action === 'ecarter_polygone'
        ? await ecarterPolygoneProjet(dossierId, cleabs, 'admin:projection')
        : await retablirPolygoneProjet(dossierId, cleabs);
      if (!res.ok) return Response.json({ erreur: res.motif }, { status: res.tableAbsente ? 409 : 400 });
      return Response.json({ ok: true, polygonesEcartes: await listerPolygonesProjetEcartes(dossierId) });
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
      // 🔴 PROJ-3g/3j/3m — VERROU MÉTIER revérifié SERVEUR (la garde d'UI ne suffit pas) : une emprise se trace sur une VUE EN PLAN
      //   (plan de masse OU d'étage), jamais sur une coupe/façade (élévation). PROJ-3m : contrôle PAR PAGE pour les pièces 'coupe' (qui
      //   peuvent mêler coupes et plans de niveau) — on ouvre alors LA page concernée et on classe son titre (tracabilitePlanche).
      if (!Number.isInteger(body.pieceId)) return Response.json({ erreur: 'une pièce (vue en plan) est requise pour tracer une emprise' }, { status: 400 });
      const pieceTrace = await lireCleTelechargeable(body.pieceId as number, 'dossier');
      if (!pieceTrace) return Response.json({ erreur: 'pièce introuvable' }, { status: 400 });
      const famPiece = familleDeNom(pieceTrace.nomFichier);
      let tracablePage = famPiece === 'masse' || famPiece === 'etage';
      if (famPiece === 'coupe') {
        const page = Number.isInteger(body.page) && (body.page as number) > 0 ? (body.page as number) : 1;
        try { const ex = await depsReellesLectureGed().extraire(await depsReellesLectureGed().lireObjet(pieceTrace.cle), 'application/pdf'); tracablePage = ex.ok && tracabilitePlanche('coupe', ex.pages[page - 1] ?? '').tracable; }
        catch { tracablePage = false; }
      }
      if (!tracablePage) return Response.json({ erreur: 'une emprise se trace sur une vue en plan (plan de masse, plan d’étage), jamais sur une coupe ou une façade (vue en élévation)' }, { status: 400 });
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
      const vraisemblance = verdictVraisemblance({ aireM2: aireM2(anneauLambert), corpsId: body.corpsId as number, surfacePlancherM2: contexte.surfacePlancherM2, surfaceTerrainM2: contexte.surfaceTerrainM2, batiments: contexte.batiments });
      const [emprises, ignores] = await Promise.all([listerEmprises(dossierId), listerIgnorees(dossierId)]);
      return Response.json({ ok: true, id: res.id, surfaceM2: aireM2(anneauLambert), calage: vc, vraisemblance, emprises, ignores });
    }

    return Response.json({ erreur: 'action inconnue' }, { status: 400 });
  } catch (e) {
    console.error('[permis/emprise] POST indisponible', e);
    return Response.json({ erreur: 'action indisponible' }, { status: 503 });
  }
}
