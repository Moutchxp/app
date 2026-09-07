import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { listerEmprises, enregistrerEmprise, supprimerEmprise, lireContexteEmprise, listerIgnorees, ignorerProjection, retablirProjection, listerBatiments, lirePolygonesEmpreinte, lireVoisinageContexte, listerPolygonesProjetEcartes, ecarterPolygoneProjet, retablirPolygoneProjet, mesurerDebordement, apercuAdoptionEnProjet, apercuAffectations, adopterAffectations, supprimerEmprisesAdoptees, retoucherEmprise, lireProjectionValidee, lireValideeParCorps, lireAltitudeValideeParCorps, type AffectationEntree, type CalageTrace } from '../../../../../lib/permis/empriseReconstruiteRepo';
import { lireRayonContexteM } from '../../../../../lib/permis/projectionConfig';
import { lireSelectionInfo, type SelectionInfo } from '../../../../../lib/permis/plancheParcellesRepo'; // PL-C4 — sélection validée pour le bandeau
import { calculerSimilitude, anneauVersLambert, aireM2, verdictCalage, verdictVraisemblance, type PaireCalage, type PointPlan } from '../../../../../lib/permis/calageEmprise';
import { depsReellesLectureGed, lireGedPermis } from '../../../../../lib/permis/lectureGed';
import { lireCleTelechargeable } from '../../../../../lib/sitadel/demandeRepo';
import { lireExclusionsBestOf, exclurePageBestOf, reintegrerPageBestOf, lireInclusionsBestOf, inclurePageBestOf, desinclurePageBestOf } from '../../../../../lib/permis/bestOfExclusionRepo'; // LOT 61 (exclusions) + LOT 92 (inclusions)
import { avecVerrouDossier } from '../../../../../lib/permis/verrouExtraction'; // LOT 58 — une analyse à la fois par dossier
import { executerReperagePlanches, lecteurPlanchesMistral, coutVisionUsd, MODELE_PLANCHE, type UsageVision } from '../../../../../lib/permis/reperePlanches'; // LOT 62
import { lireReperagePlanchesOui, lireRunsReperage, enregistrerReperage } from '../../../../../lib/permis/reperePlanchesRepo'; // LOT 62
import { executerLectureValeurPage } from '../../../../../lib/permis/lectureValeursPage'; // LOT 95 — lecture de VALEURS au grain page
import { appliquerLectureValeur, enregistrerLecturePage, lireLecturesPage, annulerLectureValeur } from '../../../../../lib/permis/lectureValeursPageRepo'; // LOT 95
import { lireOrigineExtractionSansIa } from '../../../../../lib/permis/journalExtraction'; // LOT 100 — origine (auto/manuelle) de l'extraction non-IA
import { classerPiecesParFamille, scoreNomPlanMasse, pagesPlanches, lireEchelleTexte, familleDeNom, tracabilitePlanche, type FamillePlan } from '../../../../../lib/permis/planMasse';
import { familleDeContenu, niveauxDeContenu } from '../../../../../lib/permis/planMasseContenu'; // PROV : famille + niveaux par le CONTENU
import { lireStatutsPolygones, polygonesRecouvertsParEmprise, poserStatutPolygone, appliquerAutoStatut } from '../../../../../lib/permis/polygoneStatutRepo'; // RATT-1 (2) / RATT-2
import { attribuerNomsRepli } from '../../../../../lib/permis/caracteristiquesRepo'; // NOM-1 — attribue « bâtiment en projet N » aux corps anonymes (best-effort)
import { empreinteGed, bestOfMemo } from '../../../../../lib/permis/bestOfCache'; // P1 (perfo) — mémoïsation du best-of PDF (poste dominant), invalidation par empreinte de la GED
import { lireBestOfPersiste, ecrireBestOfPersiste, type BestOfValeur } from '../../../../../lib/permis/bestOfPersistance'; // PC-1 (perfo) — best-of PERSISTÉ (survit au redémarrage), résilient
import { estPieceCerfaPc } from '../../../../../lib/permis/identifierCerfa'; // LOT 66 — reconnaissance du Cerfa PC par CONTENU (n° 13409)

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
    // PL-C4 — la SÉLECTION validée (superposition), pour le bandeau « Empreinte : sélection validée » sous le curseur Rotation.
    const selection = await repli('selection', lireSelectionInfo(dossierId), { active: false, idus: [], validePar: null, valideLe: null, acteurNom: null } as SelectionInfo);
    // LOT 61 — pages RETIRÉES du best-of à la main (réversibles) : la liseuse les soustrait du best-of et affiche « N page(s) retirée(s) ».
    const exclusionsBestOf = await repli('exclusionsBestOf', lireExclusionsBestOf(dossierId), []);
    // LOT 92 — pages AJOUTÉES au best-of à la main (réversibles, miroir des exclusions). Résilient : 194 absente → [] (aucun ajout).
    const inclusionsBestOf = await repli('inclusionsBestOf', lireInclusionsBestOf(dossierId), []);
    // SOURCE UNIQUE — la projection du DOSSIER est-elle validée ? Consommée par le bandeau et la pastille pour ne PLUS afficher un ✓
    //   vert « tracé » là où une validation reste à faire (contradiction avec la capsule/en-tête). Résilient : table absente → false.
    const projectionValidee = await repli('projectionValidee', lireProjectionValidee(dossierId), false);
    // VALIDATION PAR BÂTIMENT (corpsId → validée) : la pastille et le bandeau en dérivent (mêmes faits que la capsule du cartouche). Résilient.
    const validationParCorps = await repli('validationParCorps', lireValideeParCorps(dossierId), {} as Record<number, boolean>);
    // ③ COMPLÉMENT — altitude de sommet validée par bâtiment : avec l'emprise validée, décide l'en-tête « Projection(s) validée(s) ».
    const altitudeValideeParCorps = await repli('altitudeValideeParCorps', lireAltitudeValideeParCorps(dossierId), {} as Record<number, boolean>);
    // Seules les pièces PDF sont traçables (filtre inchangé) ; la clé de stockage ne sort JAMAIS.
    const estPdf = (p: { typeMime: string | null; nomFichier: string }) => (p.typeMime ?? '').toLowerCase().includes('pdf') || p.nomFichier.toLowerCase().endsWith('.pdf');
    const piecesPdf = piecesBrutes.filter(estPdf);
    // LOT 64 — pièces NON ouvrables (format non PDF) : listées quand même dans le sélecteur, désactivées avec la raison (jamais absentes en silence).
    const piecesNonSupportees = piecesBrutes.filter((p) => !estPdf(p)).map((p) => ({ id: p.id, nomFichier: p.nomFichier, motif: `format non pris en charge${p.typeMime ? ` (${p.typeMime})` : ''}` }));
    // LOT 87 — CLASSEMENT NOM + CONTENU, COMBINÉS ET TOUJOURS (plus de garde `proposees.length === 0`, qui sautait le contenu dès qu'UN
    //   plan était nommé et laissait dehors les plans reconnus SEULEMENT par leur cartouche, ex. PC6_ARRIERE = plan de masse). Le CONTENU
    //   est prioritaire quand les deux parlent (LOT 76) ; le NOM sert de repli. Résultat : le best-of contient TOUS les plans reconnus
    //   (masse + coupe), ordonnés masse → étage → coupe. Coût assumé : lecture du texte de la GED à chaque appel (isolée en `repli` :
    //   un échec laisse le classement retomber sur le nom seul plutôt que de faire tomber la réponse). Les planches RASTER sans couche
    //   texte (pattern PC200) et les noms hors nomenclature restent HORS best-of tant que le repérage par IMAGE (bouton manuel, LOT 62)
    //   n'est pas lancé — c'est la part fragile, hors de ce lot.
    // P1 (perfo) — LE CLASSEMENT BEST-OF (extraction texte des pièces PDF : contenu GED + confirmation des planches + détection Cerfa) est
    //   le POSTE DE COÛT DOMINANT (jusqu'à ~164 téléchargements+extractions PDF sur 11430) et DÉTERMINISTE pour une GED donnée. On le
    //   MÉMOÏSE (cache mémoire, clé = dossier + empreinte des pièces PDF) → recalculé UNE fois par état de GED, quasi gratuit ensuite. Le
    //   repérage IMAGE (mutable : bouton) et l'enrichissement restent EN AVAL, hors cache. `cachable=false` si une extraction a ÉCHOUÉ par
    //   TÉLÉCHARGEMENT (possiblement transitoire) → on ne fige pas un best-of dégradé (en cas de doute, recalcule). `indisGed` remonte les
    //   indisponibilités du calcul pour que la réponse soit IDENTIQUE au 1er appel (froid) et aux suivants (chaud).
    const empreinte = empreinteGed(piecesPdf.map((p) => ({ id: p.id, cleStockage: p.cleStockage, tailleOctets: p.tailleOctets, nomFichier: p.nomFichier })));
    const best = await bestOfMemo(dossierId, empreinte, async () => {
      // PC-1 (perfo) — cache MÉMOIRE manqué → tenter le PERSISTÉ (survit au redémarrage/HMR) AVANT de payer le calcul. Résilient : table
      //   absente (208 non appliquée) / entrée périmée (empreinte différente) / lecture KO → null → on calcule. JAMAIS un prérequis.
      const persiste = await lireBestOfPersiste(dossierId, empreinte);
      if (persiste) return { valeur: persiste, cachable: true }; // hit persisté → bestOfMemo le remet aussi en cache MÉMOIRE
      const indisGed: string[] = []; let echecTelechargement = false;
      let ged: Awaited<ReturnType<typeof lireGedPermis>>;
      try { ged = await lireGedPermis(dossierId, deps); }
      catch (e) { indisGed.push('contenu'); console.error(`[permis/emprise] source indisponible: contenu`, { dossierId, message: e instanceof Error ? e.message : String(e) }); ged = { pieces: [] } as unknown as Awaited<ReturnType<typeof lireGedPermis>>; echecTelechargement = true; }
      // P2 (LEVER 1) — un échec de TÉLÉCHARGEMENT/EXTRACTION d'une pièce dans lireGedPermis (motif « échec … ») rend le calcul NON cachable
      //   (prudence P1). Ce signal était auparavant capté par le RE-téléchargement de la boucle Cerfa, désormais supprimée (réutilisation).
      if (ged.pieces.some((g) => g.motif != null && (g.motif.startsWith('échec de lecture') || g.motif.startsWith('échec d’extraction')))) echecTelechargement = true;
      const texteParId = new Map(ged.pieces.map((p) => [p.id, p.pages.filter((x) => x.aTexte).map((x) => x.texte)] as const));
      const proposeesAutres = classerPiecesParFamille(piecesPdf, (p) => familleDeContenu(texteParId.get(p.id) ?? []));
      const niveauxParId = new Map<number, string[]>(); // PROV : niveaux portés par une planche d'ÉTAGE (RDC/SSOL/R+n), quand connus par le CONTENU
      for (const p of proposeesAutres.proposees) if (p.famille === 'etage') { const niv = niveauxDeContenu(texteParId.get(p.id) ?? []); if (niv.length) niveauxParId.set(p.id, niv); }
      // PROJ-3d/3f — CONFIRMATION PARESSEUSE (shortlist plafonnée) : éclate chaque candidat en PLANCHES + échelle. Texte SEUL. Dégradation propre.
      const confirmations = new Map<number, { planches: { page: number; echelle: string | null; tracable: boolean; famille: FamillePlan; ambigu: boolean }[] }>();
      await Promise.all(proposeesAutres.proposees.slice(0, PLAFOND_SHORTLIST).map(async (p) => {
        try {
          const ex = await deps.extraire(await deps.lireObjet(p.cleStockage), p.typeMime);
          if (!ex.ok) { indisGed.push(`texte:${p.id}`); console.error(`[permis/emprise] texte pièce ${p.id} illisible`, { motif: ex.motif }); return; } // contenu illisible = DÉTERMINISTE (cachable)
          const planches = pagesPlanches(ex.pages).map((pg) => {
            const tp = tracabilitePlanche(p.famille, ex.pages[pg - 1] ?? '');
            return { page: pg, echelle: lireEchelleTexte(ex.pages[pg - 1] ?? ''), tracable: tp.tracable, famille: tp.famille, ambigu: tp.ambigu };
          });
          confirmations.set(p.id, { planches });
        } catch (e) { indisGed.push(`texte:${p.id}`); console.error(`[permis/emprise] confirmation pièce ${p.id} indisponible`, { message: e instanceof Error ? e.message : String(e) }); echecTelechargement = true; } // téléchargement raté = possiblement TRANSITOIRE → non cachable
      }));
      // ÉTAPE 3 (LOT 66) — CATÉGORIE « Cerfa » PAR CONTENU (n° 13409), lecture de TÊTE (≤3 pages), best-effort ISOLÉE (N10-J : illisible → non marqué).
      // P2 (LEVER 1) — RÉUTILISE le texte DÉJÀ extrait par lireGedPermis (mêmes 3 pages de tête, MÊME `estPieceCerfaPc`) au lieu de
      //   RE-TÉLÉCHARGER + RÉ-EXTRAIRE les N objets (103 Mo sur 11430). Marqueur IDENTIQUE (même source). Déterministe (Set, indépendant de l'ordre).
      const cerfaIds = new Set<number>();
      const gedParId = new Map(ged.pieces.map((g) => [g.id, g] as const));
      for (const p of piecesPdf) {
        const g = gedParId.get(p.id);
        if (g && estPieceCerfaPc(g.pages.slice(0, 3).map((pg) => pg.texte))) cerfaIds.add(p.id);
      }
      const valeur: BestOfValeur = { proposees: proposeesAutres.proposees, autres: proposeesAutres.autres, niveauxParId, confirmations, cerfaIds, indisGed };
      // PC-1 — un cold-open PERSISTE son calcul (best-effort, non bloquant) → survit au redémarrage/HMR + re-peuple après un retour en Analyse.
      //   Prudence P1 conservée : un calcul NON cachable (échec de téléchargement) n'est PAS persisté (comme il n'est pas mémoïsé).
      if (!echecTelechargement) void ecrireBestOfPersiste(dossierId, empreinte, valeur, 'a_la_volee');
      return { valeur, cachable: !echecTelechargement };
    });
    const { proposees, autres, niveauxParId, confirmations, cerfaIds } = best;
    indisponibles.push(...best.indisGed); // réponse IDENTIQUE froid/chaud (les indisponibilités du best-of sont mémoïsées avec lui)
    // LOT 62 — planches repérées par IMAGE (verdict='oui'), MUTABLES (repérage manuel) → HORS cache, fusionnées ici. + audits.
    const planchesImage = await repli('reperage', lireReperagePlanchesOui(dossierId), new Map<number, { page: number; categorie: string }[]>());
    const reperageRuns = await repli('reperageRuns', lireRunsReperage(dossierId), new Map());
    // LOT 95 — audit DATÉ « page analysée pour lire des valeurs » AU GRAIN PAGE (méthode 'ia'). Résilient : migration 195 absente → Map vide.
    const lecturesPages = await repli('lecturesPages', lireLecturesPage(dossierId), new Map());
    // LOT 100 — origine (auto/manuelle) de la dernière extraction NON-IA du dossier → ferme la ligne 6 (« identifiée sans IA »). Null = indéterminée.
    const origineExtractionSansIa = await repli('origineSansIa', lireOrigineExtractionSansIa(dossierId), null);
    const familleDeCategorie = (c: string): FamillePlan => (c === 'coupe' || c === 'facade' || c === 'elevation') ? 'coupe' : 'masse'; // DISPLAY seul (image = non traçable)
    const enrichir = (p: { id: number; nomFichier: string; typeMime: string | null }, propose: boolean, famille: FamillePlan | null) => {
      const planchesTexte = confirmations.get(p.id)?.planches ?? [];
      // fusion : les pages IMAGE non déjà trouvées par le texte, marquées `origine:'image'`, jamais traçables.
      const dejaTexte = new Set(planchesTexte.map((pl) => pl.page));
      const planchesIma = (planchesImage.get(p.id) ?? []).filter((ip) => !dejaTexte.has(ip.page))
        .map((ip) => ({ page: ip.page, echelle: null, tracable: false, famille: familleDeCategorie(ip.categorie), origine: 'image' as const }));
      const planches = [...planchesTexte, ...planchesIma];
      return { id: p.id, nomFichier: p.nomFichier, typeMime: p.typeMime, propose, famille, score: propose ? scoreNomPlanMasse(p.nomFichier) : 0, planches, confirme: planches.length > 0, niveaux: niveauxParId.get(p.id), cerfa: cerfaIds.has(p.id) };
    };
    const pieces = [...proposees.map((p) => enrichir(p, true, p.famille)), ...autres.map((p) => enrichir(p, false, null))];
    return Response.json({ pieces, piecesNonSupportees, emprises, ignores, batiments, contexte, polygones, polygonesEcartes, statutsPolygones, polygonesRecouverts, selection, exclusionsBestOf, inclusionsBestOf, projectionValidee, validationParCorps, altitudeValideeParCorps, reperageRuns: Object.fromEntries(reperageRuns), lecturesPages: Object.fromEntries(lecturesPages), origineExtractionSansIa, indisponibles });
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

    // LOT 61/92 — RETIRER / AJOUTER / RÉINTÉGRER une page du best-of (réversible, grain = LA PAGE). N'affecte NI le document NI la page
    //   en GED : ôte/ajoute seulement de la SÉLECTION. 🔴 MUTUELLEMENT EXCLUSIF : retirer supprime toute inclusion, ajouter supprime toute
    //   exclusion → une page n'est jamais dans les deux (préséance du dernier geste, sans ambiguïté). `ok:false` = migration 190/194 absente
    //   (no-op résilient) → l'UI retombe sur le comportement d'avant, jamais d'erreur dure à l'écran.
    if (body.action === 'exclure_page_bestof' || body.action === 'reintegrer_page_bestof' || body.action === 'inclure_page_bestof' || body.action === 'desinclure_page_bestof') {
      if (!Number.isInteger(body.pieceId) || !Number.isInteger(body.page) || (body.page as number) < 1) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      const pid = body.pieceId as number, pg = body.page as number;
      const par = garde.auteurId === null ? 'admin' : String(garde.auteurId);
      let ok: boolean;
      if (body.action === 'exclure_page_bestof') { ok = await exclurePageBestOf(dossierId, pid, pg, par); await desinclurePageBestOf(pid, pg); }      // retirer une page AUTO : exclusion + annule un éventuel ajout
      else if (body.action === 'inclure_page_bestof') { ok = await inclurePageBestOf(dossierId, pid, pg, par); await reintegrerPageBestOf(pid, pg); }   // ajouter : inclusion + annule un éventuel retrait
      else if (body.action === 'desinclure_page_bestof') ok = await desinclurePageBestOf(pid, pg);                                                        // retirer une page AJOUTÉE : simple retour au calcul auto (pas d'exclusion résiduelle)
      else ok = await reintegrerPageBestOf(pid, pg);                                                                                                      // réintégrer (liste des retirées) : retour au calcul automatique
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

    // LOT 95 (B2) — LIRE DES VALEURS sur LA SEULE page affichée (bouton « analyse de la page »). SŒUR du repérage LOT 62 mais lit UNE
    //   VALEUR (altitude de sommet NGF, niveau DOSSIER) et remplit un champ VIDE (invariant 103, méthode 'ia', provenance pièce+page).
    //   Sous le VERROU du LOT 58 (une seule page envoyée → un seul appel vision). Pré-filtre RGPD par page (abstention). Jamais câblé sur
    //   l'analyse du fichier entier. Honnête : rien de lisible → on le dit ; douteux → « à vérifier » non écrit ; déjà rempli → non écrasé.
    if (body.action === 'lire_valeurs_page') {
      if (!Number.isInteger(body.pieceId) || !Number.isInteger(body.page) || (body.page as number) < 1) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      const pieceId = body.pieceId as number; const page = body.page as number;
      const par = garde.auteurId === null ? 'admin' : String(garde.auteurId);
      const verrou = await avecVerrouDossier(dossierId, async () => {
        const deps = depsReellesLectureGed();
        const meta = (await deps.listerPieces(dossierId)).find((m) => m.id === pieceId);
        if (!meta) return { erreur: 'piece' as const };
        const pdf = await deps.lireObjet(meta.cleStockage);
        const ex = await deps.extraire(pdf, meta.typeMime);
        const texte = ex.ok ? (ex.pages[page - 1] ?? '') : ''; // page sans texte → écartée par le pré-filtre RGPD (invérifiable)
        const usage: UsageVision = { promptTokens: 0, completionTokens: 0, modeleResolu: null };
        const res = await executerLectureValeurPage({ texte: async () => texte, pdf: async () => pdf, page, lecteur: lecteurPlanchesMistral(usage) });
        if (!res.envoyee) { // ABSTENTION RGPD : aucune image envoyée, aucun coût, aucune valeur — mais l'audit daté est écrit (jamais muet).
          await enregistrerLecturePage(dossierId, pieceId, page, { envoyee: false, motif: res.motif, nbValeurs: 0, resume: `Page non envoyée : ${res.motif}`, modele: MODELE_PLANCHE, modeleResolu: null, tokensIn: 0, tokensOut: 0, coutUsd: 0, par });
          return { resume: { envoyee: false, action: 'rien' as const, valeur: null, ecrit: false, coutUsd: 0, texte: `Page non envoyée (précaution données personnelles) : ${res.motif}` } };
        }
        const coutUsd = coutVisionUsd(usage);
        const appli = await appliquerLectureValeur(dossierId, { pieceId, pieceNom: meta.nomFichier, page, valeurLue: res.valeur, par });
        await enregistrerLecturePage(dossierId, pieceId, page, { envoyee: true, motif: null, nbValeurs: appli.ecrit ? 1 : 0, resume: appli.resume, modele: MODELE_PLANCHE, modeleResolu: usage.modeleResolu, tokensIn: usage.promptTokens, tokensOut: usage.completionTokens, coutUsd, par });
        return { resume: { envoyee: true, action: appli.action, valeur: appli.valeur, ecrit: appli.ecrit, coutUsd, texte: appli.resume } };
      });
      if (!verrou.ok) return Response.json({ erreur: 'Une analyse de ce permis est déjà en cours.' }, { status: 409 });
      if ('erreur' in verrou.valeur) return Response.json({ erreur: 'pièce introuvable' }, { status: 404 });
      return Response.json({ ok: true, resume: verrou.valeur.resume });
    }

    // LOT 95 — RÉVERSIBILITÉ : annuler la valeur écrite par « analyse de la page » (vide le champ + retire la ligne 'ia'), UNIQUEMENT si
    //   l'origine est 'extraite' (jamais une saisie humaine). `annule:false` = rien à annuler (déjà vide / valeur humaine).
    if (body.action === 'annuler_lecture_page') {
      const r = await annulerLectureValeur(dossierId);
      return Response.json(r);
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

    // PROJ-CTX — CONTEXTE (lecture seule) : parcelles voisines + bâti dans le rayon (config, repli sûr) autour de l'empreinte. Appelé
    //   UNIQUEMENT quand l'interrupteur « contexte » est allumé côté client (aucune requête si éteint). JAMAIS candidats à l'affectation.
    if (body.action === 'voisinage_contexte') {
      const { rayonM, provenance } = await lireRayonContexteM();
      return Response.json({ voisinage: await lireVoisinageContexte(dossierId, rayonM), rayonM, provenanceRayon: provenance });
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
