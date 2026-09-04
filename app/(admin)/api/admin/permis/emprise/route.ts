import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { listerEmprises, enregistrerEmprise, supprimerEmprise, lireContexteEmprise, listerIgnorees, ignorerProjection, retablirProjection, listerBatiments, lirePolygonesEmpreinte, listerPolygonesProjetEcartes, ecarterPolygoneProjet, retablirPolygoneProjet, mesurerDebordement, apercuAdoptionEnProjet, apercuAffectations, adopterAffectations, supprimerEmprisesAdoptees, retoucherEmprise, type AffectationEntree, type CalageTrace } from '../../../../../lib/permis/empriseReconstruiteRepo';
import { calculerSimilitude, anneauVersLambert, aireM2, verdictCalage, verdictVraisemblance, type PaireCalage, type PointPlan } from '../../../../../lib/permis/calageEmprise';
import { depsReellesLectureGed, lireGedPermis } from '../../../../../lib/permis/lectureGed';
import { lireCleTelechargeable } from '../../../../../lib/sitadel/demandeRepo';
import { lireExclusionsBestOf, exclurePageBestOf, reintegrerPageBestOf } from '../../../../../lib/permis/bestOfExclusionRepo'; // LOT 61
import { avecVerrouDossier } from '../../../../../lib/permis/verrouExtraction'; // LOT 58 — une analyse à la fois par dossier
import { executerReperagePlanches, lecteurPlanchesMistral, coutVisionUsd, MODELE_PLANCHE, type UsageVision } from '../../../../../lib/permis/reperePlanches'; // LOT 62
import { lireReperagePlanchesOui, lireRunsReperage, enregistrerReperage } from '../../../../../lib/permis/reperePlanchesRepo'; // LOT 62
import { classerPiecesParFamille, scoreNomPlanMasse, pagesPlanches, lireEchelleTexte, familleDeNom, tracabilitePlanche, type FamillePlan } from '../../../../../lib/permis/planMasse';
import { familleDeContenu, niveauxDeContenu } from '../../../../../lib/permis/planMasseContenu'; // PROV : famille + niveaux par le CONTENU
import { lireStatutsPolygones, polygonesRecouvertsParEmprise, poserStatutPolygone, appliquerAutoStatut } from '../../../../../lib/permis/polygoneStatutRepo'; // RATT-1 (2) / RATT-2
import { attribuerNomsRepli } from '../../../../../lib/permis/caracteristiquesRepo'; // NOM-1 — attribue « bâtiment en projet N » aux corps anonymes (best-effort)

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
    const [piecesBrutes, emprises, ignores, batiments, contexte, polygones, polygonesEcartes, statutsPolygones, polygonesRecouverts] = await Promise.all([
      repli('pieces', deps.listerPieces(dossierId), []),
      repli('emprises', listerEmprises(dossierId), []),
      repli('ignores', listerIgnorees(dossierId), []),
      repli('batiments', listerBatiments(dossierId), []),
      repli('contexte', lireContexteEmprise(dossierId), { empreinteAnneaux: [], surfaceTerrainM2: null, surfacePlancherM2: null, batiments: [] }),
      repli('polygones', lirePolygonesEmpreinte(dossierId), []), // PROJ-3h — polygones BD TOPO (∩ empreinte) + état, pour l'affichage
      repli('ecartes', listerPolygonesProjetEcartes(dossierId), []), // PROJ-3i — cleabs des polygones « en projet » écartés (décochés)
      repli('statuts', lireStatutsPolygones(dossierId), []),         // RATT-1 (2) — registre append-only des statuts décidés (préservé/détruit)
      repli('recouverts', polygonesRecouvertsParEmprise(dossierId), []), // RATT-1 (2) — cleabs recouverts par une emprise projetée (hors statut)
    ]);
    // LOT 61 — pages RETIRÉES du best-of à la main (réversibles) : la liseuse les soustrait du best-of et affiche « N page(s) retirée(s) ».
    const exclusionsBestOf = await repli('exclusionsBestOf', lireExclusionsBestOf(dossierId), []);
    // Seules les pièces PDF sont traçables (filtre inchangé) ; la clé de stockage ne sort JAMAIS.
    const estPdf = (p: { typeMime: string | null; nomFichier: string }) => (p.typeMime ?? '').toLowerCase().includes('pdf') || p.nomFichier.toLowerCase().endsWith('.pdf');
    const piecesPdf = piecesBrutes.filter(estPdf);
    // LOT 64 — pièces NON ouvrables (format non PDF) : listées quand même dans le sélecteur, désactivées avec la raison (jamais absentes en silence).
    const piecesNonSupportees = piecesBrutes.filter((p) => !estPdf(p)).map((p) => ({ id: p.id, nomFichier: p.nomFichier, motif: `format non pris en charge${p.typeMime ? ` (${p.typeMime})` : ''}` }));
    // PROJ-3d/3g ① — TRI PAR NOM (instantané, 0 I/O) : familles masse → étage → coupe (ordre), le reste conservé (repli).
    const nomSeul = classerPiecesParFamille(piecesPdf);
    let proposees = nomSeul.proposees;
    let autres = nomSeul.autres;
    const niveauxParId = new Map<number, string[]>(); // PROV : niveaux portés par une planche d'ÉTAGE (RDC/SSOL/R+n), quand connus par le CONTENU
    // PROV-2 (a) — NOMS OPAQUES : le nom n'a RIEN proposé (ex. 531 : 42 pièces → 0 famille) → REPLI par le CONTENU. On lit le texte
    //   (lireGedPermis ~1,8 s) UNIQUEMENT dans ce cas (un dossier bien nommé ne déclenche aucune lecture) et on reconnaît cerfa /
    //   coupe / masse par les signaux PRÉCIS de LECT-1 A/B (0 faux positif mesuré). Isolé en `repli` : un échec de lecture laisse la
    //   bande vide plutôt que de faire tomber la réponse.
    if (proposees.length === 0) {
      const ged = await repli('contenu', lireGedPermis(dossierId, deps), { pieces: [] } as unknown as Awaited<ReturnType<typeof lireGedPermis>>);
      const texteParId = new Map(ged.pieces.map((p) => [p.id, p.pages.filter((x) => x.aTexte).map((x) => x.texte)] as const));
      const parContenu = classerPiecesParFamille(piecesPdf, (p) => familleDeContenu(texteParId.get(p.id) ?? []));
      proposees = parContenu.proposees;
      autres = parContenu.autres;
      // PROV (suite) — pour chaque planche d'ÉTAGE, les niveaux qu'elle porte (RDC/SSOL/R+n), pour que l'internaute SACHE ce qu'il ouvre.
      for (const p of proposees) if (p.famille === 'etage') { const niv = niveauxDeContenu(texteParId.get(p.id) ?? []); if (niv.length) niveauxParId.set(p.id, niv); }
    }
    // PROJ-3d/3f — CONFIRMATION PARESSEUSE, uniquement sur la shortlist plafonnée : ouvre chaque candidat et l'ÉCLATE EN PLANCHES
    //   (ses pages hors cartouche, cf. pagesPlanches) + une échelle indicative par page. Texte SEUL (jamais getOperatorList, trop cher).
    //   Dégradation propre : une pièce illisible reste proposée par son NOM, sans planche (confirme=false → l'UI repliera sur la page 1).
    // PROJ-3m ① — chaque PLANCHE porte sa traçabilité PAR PAGE (une pièce PC3 « coupe » peut mêler coupes et plans de niveau).
    const confirmations = new Map<number, { planches: { page: number; echelle: string | null; tracable: boolean; famille: FamillePlan; ambigu: boolean }[] }>();
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
    // LOT 62 — planches repérées par IMAGE (verdict='oui'), à FUSIONNER dans les pièces (distinguées par `origine:'image'`), + l'audit par pièce.
    const planchesImage = await repli('reperage', lireReperagePlanchesOui(dossierId), new Map<number, { page: number; categorie: string }[]>());
    const reperageRuns = await repli('reperageRuns', lireRunsReperage(dossierId), new Map());
    const familleDeCategorie = (c: string): FamillePlan => (c === 'coupe' || c === 'facade' || c === 'elevation') ? 'coupe' : 'masse'; // DISPLAY seul (image = non traçable)
    const enrichir = (p: { id: number; nomFichier: string; typeMime: string | null }, propose: boolean, famille: FamillePlan | null) => {
      const planchesTexte = confirmations.get(p.id)?.planches ?? [];
      // fusion : les pages IMAGE non déjà trouvées par le texte, marquées `origine:'image'`, jamais traçables.
      const dejaTexte = new Set(planchesTexte.map((pl) => pl.page));
      const planchesIma = (planchesImage.get(p.id) ?? []).filter((ip) => !dejaTexte.has(ip.page))
        .map((ip) => ({ page: ip.page, echelle: null, tracable: false, famille: familleDeCategorie(ip.categorie), origine: 'image' as const }));
      const planches = [...planchesTexte, ...planchesIma];
      return { id: p.id, nomFichier: p.nomFichier, typeMime: p.typeMime, propose, famille, score: propose ? scoreNomPlanMasse(p.nomFichier) : 0, planches, confirme: planches.length > 0, niveaux: niveauxParId.get(p.id) };
    };
    const pieces = [...proposees.map((p) => enrichir(p, true, p.famille)), ...autres.map((p) => enrichir(p, false, null))];
    return Response.json({ pieces, piecesNonSupportees, emprises, ignores, batiments, contexte, polygones, polygonesEcartes, statutsPolygones, polygonesRecouverts, exclusionsBestOf, reperageRuns: Object.fromEntries(reperageRuns), indisponibles });
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
      statut?: string; // RATT-1 (2) — preserve | detruit | revoque
      affectations?: { cleabs: string; corpsId: number }[];
      anneau?: { x: number; y: number }[]; // PROJ-3s — sommets Lambert d'une retouche (positions ; jamais une géométrie autoritative)
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

    // LOT 61 — RETIRER / RÉINTÉGRER une page du best-of (réversible). N'affecte NI le document NI la page en GED : ôte seulement de
    //   la SÉLECTION. `ok:false` = migration 190 absente (no-op résilient) → l'UI réintègre la page, jamais d'erreur dure à l'écran.
    if (body.action === 'exclure_page_bestof' || body.action === 'reintegrer_page_bestof') {
      if (!Number.isInteger(body.pieceId) || !Number.isInteger(body.page) || (body.page as number) < 1) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      const ok = body.action === 'exclure_page_bestof'
        ? await exclurePageBestOf(dossierId, body.pieceId as number, body.page as number, garde.auteurId === null ? 'admin' : String(garde.auteurId))
        : await reintegrerPageBestOf(body.pieceId as number, body.page as number);
      return Response.json({ ok });
    }

    // LOT 62 — REPÉRER LES PLANCHES d'une pièce par ANALYSE D'IMAGE (bouton MANUEL, geste délibéré payant). Sous le VERROU du LOT 58
    //   (un second repérage concurrent sur le même dossier est refusé, pas mis en file). PRÉSENCE seule (jamais le contenu). Le
    //   pré-filtre RGPD (page par page, en abstention) vit dans `executerReperagePlanches` ; l'audit (pages écartées + motif, tokens,
    //   coût, modèle) est persisté par `enregistrerReperage` (rejouable). JAMAIS déclenché en automatique ni par la veille.
    if (body.action === 'reperer_planches') {
      if (!Number.isInteger(body.pieceId)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      const pieceId = body.pieceId as number;
      const par = garde.auteurId === null ? 'admin' : String(garde.auteurId);
      const verrou = await avecVerrouDossier(dossierId, async () => {
        const deps = depsReellesLectureGed();
        const meta = (await deps.listerPieces(dossierId)).find((m) => m.id === pieceId);
        if (!meta) return { erreur: 'piece' as const };
        const pdf = await deps.lireObjet(meta.cleStockage);
        const ex = await deps.extraire(pdf, meta.typeMime);
        const textes = ex.ok ? ex.pages : []; // pages sans texte → écartées par le pré-filtre RGPD (invérifiables)
        const usage: UsageVision = { promptTokens: 0, completionTokens: 0, modeleResolu: null };
        const resultat = await executerReperagePlanches({ textesPages: async () => textes, pdf: async () => pdf, lecteur: lecteurPlanchesMistral(usage) });
        const coutUsd = coutVisionUsd(usage);
        await enregistrerReperage(dossierId, pieceId, resultat, { modele: MODELE_PLANCHE, modeleResolu: usage.modeleResolu, tokensIn: usage.promptTokens, tokensOut: usage.completionTokens, coutUsd, par });
        return { resume: {
          analysees: resultat.pagesEnvoyees.length,
          planches: resultat.verdicts.filter((v) => v.verdict === 'oui').length,
          incertaines: resultat.verdicts.filter((v) => v.verdict === 'incertain').length,
          ecartees: resultat.pagesEcartees.length,
          coutUsd,
        } };
      });
      if (!verrou.ok) return Response.json({ erreur: 'Une analyse de ce permis est déjà en cours.' }, { status: 409 });
      if ('erreur' in verrou.valeur) return Response.json({ erreur: 'pièce introuvable' }, { status: 404 });
      return Response.json({ ok: true, resume: verrou.valeur.resume });
    }

    // APERÇU DÉBORDEMENT (lecture seule, jamais bloquant) — recalcule le Lambert CÔTÉ SERVEUR (garde PROJ) depuis le calage + le tracé
    //   en cours, puis mesure la part hors parcelle. Réutilise le chemin d'enregistrement (mêmes paires/anneauPlan/corpsId), sans écrire.
    //   Contour non fermé (< 3 sommets) ou calage insuffisant → { debordement: null } (aucune valeur inventée).
    if (body.action === 'apercu_debordement') {
      const paires = Array.isArray(body.paires) ? body.paires : [];
      const anneauPlan = Array.isArray(body.anneauPlan) ? body.anneauPlan : [];
      if (anneauPlan.length < 3) return Response.json({ debordement: null });
      const sim = calculerSimilitude(paires);
      if (sim === null) return Response.json({ debordement: null });
      return Response.json({ debordement: await mesurerDebordement(dossierId, anneauVersLambert(sim, anneauPlan)) });
    }

    // PROJ-3q/3r — APERÇU AUTOMATIQUE (lecture seule) : les polygones cochés regroupés par connexité + aires (proposition par défaut).
    if (body.action === 'apercu_adoption') {
      return Response.json({ apercu: await apercuAdoptionEnProjet(dossierId) });
    }

    // PROJ-3r — APERÇU PAR BÂTIMENT (lecture seule) d'une affectation donnée : combien d'emprises par bâtiment + leurs aires.
    if (body.action === 'apercu_affectations') {
      const affectations = Array.isArray(body.affectations) ? (body.affectations as AffectationEntree[]) : [];
      return Response.json({ apercu: await apercuAffectations(dossierId, affectations) });
    }

    if (body.action === 'supprimer') {
      if (!Number.isInteger(body.id)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      const nb = await supprimerEmprise(body.id as number, dossierId);
      await appliquerAutoStatut(dossierId, 'auto:emprise'); // RATT-2 — l'emprise a rétréci : révoquer les 'detruit' auto désormais hors couverture
      const [emprises, ignores, statutsPolygones, polygonesRecouverts] = await Promise.all([listerEmprises(dossierId), listerIgnorees(dossierId), lireStatutsPolygones(dossierId), polygonesRecouvertsParEmprise(dossierId)]);
      return Response.json({ ok: true, nb, emprises, ignores, statutsPolygones, polygonesRecouverts });
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

    // RATT-1 (2) — STATUER un polygone EXISTANT (préservé / détruit / révoquer). Append-only : chaque décision = une nouvelle ligne.
    //   La source IGN batiment.etat_de_l_objet n'est JAMAIS touchée (snapshot lu côté repo). Disponible même « en attente du bâti »
    //   (ces statuts portent sur des polygones existants, pas sur le futur bâtiment). Renvoie le registre à jour pour l'affichage.
    if (body.action === 'statuer_polygone') {
      const cleabs = typeof body.cleabs === 'string' ? body.cleabs : '';
      const statut = body.statut === 'preserve' || body.statut === 'detruit' || body.statut === 'revoque' ? body.statut : null;
      if (cleabs.trim() === '' || statut === null) return Response.json({ erreur: 'requête invalide (cleabs + statut preserve|detruit|revoque)' }, { status: 400 });
      const res = await poserStatutPolygone(dossierId, cleabs, statut, 'admin:projection', 'saisie'); // RATT-2 — décision HUMAINE (jamais révoquée par l'auto)
      if (!res.ok) return Response.json({ erreur: res.motif }, { status: res.tableAbsente ? 409 : 400 });
      return Response.json({ ok: true, statutsPolygones: await lireStatutsPolygones(dossierId), polygonesRecouverts: await polygonesRecouvertsParEmprise(dossierId) });
    }

    // NOM-2 — RATTRAPAGE du dossier COURANT (après confirmation d'Arno, qui a vu l'aperçu) : attribue les noms de repli manquants +
    //   pose les statuts auto de recouvrement. Réutilise les writers EXISTANTS (mêmes garanties : jamais dans repere, jamais un nom déjà
    //   posé, jamais par-dessus une 'saisie', mêmes seuil/tolérance). Append-only. Renvoie l'état à jour (noms + statuts + recouverts).
    if (body.action === 'rattraper') {
      await attribuerNomsRepli(dossierId);                 // NOM-1 — noms de repli manquants
      await appliquerAutoStatut(dossierId, 'admin:rattrapage'); // RATT-2/6 — statuts auto de recouvrement (detruit/mixte)
      const [batiments, statutsPolygones, polygonesRecouverts] = await Promise.all([listerBatiments(dossierId), lireStatutsPolygones(dossierId), polygonesRecouvertsParEmprise(dossierId)]);
      return Response.json({ ok: true, batiments, statutsPolygones, polygonesRecouverts });
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

    // PROJ-3r — ADOPTER selon une AFFECTATION cleabs → bâtiment (regroupement par bâtiment, plusieurs bâtiments possibles). 🔴 Union
    //   CÔTÉ SERVEUR (aucune géométrie client, seulement des identifiants). EXCLUSIVITÉ par bâtiment ciblé. Ne bloque jamais la validation.
    if (body.action === 'adopter') {
      const affectations = Array.isArray(body.affectations) ? (body.affectations as AffectationEntree[]) : [];
      const res = await adopterAffectations(dossierId, affectations, 'admin:adoption');
      if (!res.ok) return Response.json({ erreur: res.motif }, { status: res.tableAbsente ? 409 : 400 });
      await appliquerAutoStatut(dossierId, 'auto:emprise'); // RATT-2 — l'emprise projetée couvre du bâti : poser 'detruit' d'office (et révoquer l'auto désormais hors couverture)
      await attribuerNomsRepli(dossierId); // NOM-1 — adoption : nommer les corps anonymes (best-effort, ne bloque jamais)
      const [ignores, statutsPolygones, polygonesRecouverts] = await Promise.all([listerIgnorees(dossierId), lireStatutsPolygones(dossierId), polygonesRecouvertsParEmprise(dossierId)]);
      return Response.json({ ok: true, nbCreees: res.nbCreees, emprises: res.emprises, ignores, debordement: res.debordement, statutsPolygones, polygonesRecouverts });
    }

    // PROJ-3s — RETOUCHER une emprise existante : positions de sommets Lambert → géométrie RECALCULÉE + VALIDÉE serveur ; provenance
    //   mise à jour selon la règle (ign_adopte → ign_retouche). Ne change ni le bâtiment, ni le nombre d'emprises. Jamais bloquant.
    if (body.action === 'retoucher') {
      if (!Number.isInteger(body.id)) return Response.json({ erreur: 'emprise à retoucher requise' }, { status: 400 });
      const anneau = Array.isArray(body.anneau) ? body.anneau : [];
      const res = await retoucherEmprise(dossierId, body.id as number, anneau, 'admin:retouche');
      if (!res.ok) return Response.json({ erreur: res.motif }, { status: res.tableAbsente ? 409 : 400 });
      await appliquerAutoStatut(dossierId, 'auto:emprise'); // RATT-2 — la retouche change la couverture : poser/révoquer les 'detruit' auto en conséquence
      const [ignores, statutsPolygones, polygonesRecouverts] = await Promise.all([listerIgnorees(dossierId), lireStatutsPolygones(dossierId), polygonesRecouvertsParEmprise(dossierId)]);
      return Response.json({ ok: true, emprises: res.emprises, ignores, debordement: res.debordement, provenance: res.provenance, statutsPolygones, polygonesRecouverts });
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
      // 🔴 BUG PROV — la garde re-classait la pièce par son NOM (familleDeNom). Sur les versements à NOMS OPAQUES (ex. 531),
      //   familleDeNom rend null → un PLAN DE MASSE (reconnu par le best-of via son CONTENU, PROV-2 a / PROV-3.1) était REJETÉ 400.
      //   La garde doit donc suivre la MÊME reconnaissance que le best-of : nom d'abord, sinon CONTENU (page-aware pour la coupe).
      const famNom = familleDeNom(pieceTrace.nomFichier);
      const page = Number.isInteger(body.page) && (body.page as number) > 0 ? (body.page as number) : 1;
      let tracablePage: boolean;
      if (famNom === 'masse' || famNom === 'etage') tracablePage = true;
      else {
        // coupe (par le nom) OU nom opaque (famNom null) → on OUVRE la pièce : classement par CONTENU, puis traçabilité par page.
        try {
          const ex = await depsReellesLectureGed().extraire(await depsReellesLectureGed().lireObjet(pieceTrace.cle), 'application/pdf');
          if (!ex.ok) tracablePage = false;
          else if (famNom === 'coupe') tracablePage = tracabilitePlanche('coupe', ex.pages[page - 1] ?? '').tracable;
          else {
            const fc = familleDeContenu(ex.pages); // nom opaque → famille par le CONTENU (masse/étage traçables ; coupe → par page ; cerfa → non)
            tracablePage = fc === 'masse' || fc === 'etage' || (fc === 'coupe' && tracabilitePlanche('coupe', ex.pages[page - 1] ?? '').tracable);
          }
        } catch { tracablePage = false; }
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
      await supprimerEmprisesAdoptees(dossierId, body.corpsId as number); // PROJ-3q EXCLUSIVITÉ : un tracé manuel remplace une adoption IGN du même bâtiment
      const contexte = await lireContexteEmprise(dossierId);
      const vraisemblance = verdictVraisemblance({ aireM2: aireM2(anneauLambert), corpsId: body.corpsId as number, surfacePlancherM2: contexte.surfacePlancherM2, surfaceTerrainM2: contexte.surfaceTerrainM2, batiments: contexte.batiments });
      const debordement = await mesurerDebordement(dossierId, anneauLambert); // repère indicatif, même géométrie Lambert serveur ; jamais bloquant
      await appliquerAutoStatut(dossierId, 'auto:emprise'); // RATT-2 — l'emprise projetée couvre du bâti : poser 'detruit' d'office (jamais par-dessus une décision humaine)
      await attribuerNomsRepli(dossierId); // NOM-1 — tracé enregistré : nommer les corps anonymes (best-effort)
      const [emprises, ignores, statutsPolygones, polygonesRecouverts] = await Promise.all([listerEmprises(dossierId), listerIgnorees(dossierId), lireStatutsPolygones(dossierId), polygonesRecouvertsParEmprise(dossierId)]);
      return Response.json({ ok: true, id: res.id, surfaceM2: aireM2(anneauLambert), calage: vc, vraisemblance, debordement, emprises, ignores, statutsPolygones, polygonesRecouverts });
    }

    return Response.json({ erreur: 'action inconnue' }, { status: 400 });
  } catch (e) {
    console.error('[permis/emprise] POST indisponible', e);
    return Response.json({ erreur: 'action indisponible' }, { status: 503 });
  }
}
