import 'server-only';
import { exigerAdministrateur } from '../../../../lib/admin/garde';
import { lireSourcesFraicheur } from '../../../../lib/admin/sourcesFraicheurRepo';
import { construireEtatSources, DEPARTEMENTS } from '../../../../lib/admin/sourcesFraicheur';
import { lireDetections, basculerDetectionSource } from '../../../../lib/veille/detectionRepo';
import { mesurerMorphologie } from '../../../../lib/admin/morphologieRepo';
import { construireMorphologie, MORPHOLOGIE_INDISPONIBLE } from '../../../../lib/admin/morphologieDisque';
import { lireFichierProtocoles } from '../../../../lib/admin/protocolesRepo';
import { construireAffichageProtocoles } from '../../../../lib/admin/protocolesReingestion';
import { misesAJourActionnables, sourcesAvecProcedure } from '../../../../lib/admin/pastilleSources';
import { construireEtatAutomatisation, nuitCourante } from '../../../../lib/veille/ingestionAuto';
import { lireConfigIngestionAuto, dernierJournalParSource, basculerIngestionAuto, ecrireFenetreNocturne } from '../../../../lib/veille/ingestionAutoRepo';

/**
 * /api/admin/sources — FRAÎCHEUR DES DONNÉES.
 * GET  → état des sources (millésime/âge/couverture, détection, morphologie disque, protocoles) + automatisation nocturne (F6).
 * POST { action } :
 *   'reglage_detection'      {source, actif}   → surveillance d'une source (lot 2) ;
 *   'reglage_ingestion_auto' {source, actif}   → interrupteur d'ingestion AUTO d'une source (a) — F6 (le geste explicite d'Arno) ;
 *   'reglage_fenetre_nocturne' {debut, fin}    → fenêtre nocturne (heures 0..23) — F6.
 * La route NE LANCE JAMAIS d'ingestion : elle ne fait que POSER des réglages (l'exécution vit dans la veille, la nuit).
 * RÉSERVÉ ADMINISTRATEUR. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const garde = await exigerAdministrateur(request);
    if ('refus' in garde) return garde.refus; // 403 générique

    const [lectures, detections, mesure, texteProtocoles, configAuto, dernierJournal] = await Promise.all([
      lireSourcesFraicheur(), lireDetections(), mesurerMorphologie(), lireFichierProtocoles(),
      lireConfigIngestionAuto(), dernierJournalParSource(),
    ]);
    const lignes = construireEtatSources(lectures, new Date(), detections);
    // F4 « Morphologie » : répartition disque par source. Mesure en échec → sentinelle « indisponible » (jamais des zéros).
    const morphologie = mesure ? construireMorphologie(mesure.tables, mesure.dbTotal) : MORPHOLOGIE_INDISPONIBLE;
    // F5 « Protocoles » : mode d'emploi de réingestion par source (fichier absent → sentinelle). AUCUNE exécution.
    const protocoles = construireAffichageProtocoles(texteProtocoles);
    // F6 « Automatisation nocturne » : interrupteurs par source + fenêtre + dernier résultat. La route n'exécute rien.
    const automatisation = construireEtatAutomatisation({
      sources: lignes.map((l) => ({ cle: l.cle, nom: l.nom })),
      actionnables: new Set(misesAJourActionnables(lignes, protocoles).map((l) => l.cle)),
      avecCommande: sourcesAvecProcedure(protocoles),
      fenetre: configAuto.fenetre,
      actifs: configAuto.actifs,
      dernierParSource: dernierJournal,
      nuit: nuitCourante(new Date(), configAuto.fenetre.debut, configAuto.fenetre.fin),
    });
    // Chemin ABSOLU du dépôt — sert au `cd` du bloc à coller (lot 3). AUCUNE exécution ici.
    return Response.json({ lignes, departements: DEPARTEMENTS, cheminDepot: process.cwd(), morphologie, protocoles, automatisation });
  } catch (e) {
    console.error('[admin/sources] GET indisponible', e);
    return Response.json({ erreur: 'sources indisponibles' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const garde = await exigerAdministrateur(request);
    if ('refus' in garde) return garde.refus;

    const body = (await request.json().catch(() => ({}))) as {
      action?: string; source?: string; actif?: boolean; debut?: number; fin?: number;
    };

    if (body.action === 'reglage_detection') {
      if (typeof body.source !== 'string' || typeof body.actif !== 'boolean') return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      try {
        return Response.json({ ok: true, source: body.source, actif: await basculerDetectionSource(body.source, body.actif) });
      } catch (e) {
        return Response.json({ erreur: e instanceof Error ? e.message : 'source invalide' }, { status: 400 });
      }
    }

    if (body.action === 'reglage_ingestion_auto') {
      if (typeof body.source !== 'string' || typeof body.actif !== 'boolean') return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      try {
        return Response.json({ ok: true, source: body.source, actif: await basculerIngestionAuto(body.source, body.actif) });
      } catch (e) {
        // Source non automatisable OU migration 143 pas appliquée (colonne absente) → 400, la requête est en cause.
        return Response.json({ erreur: e instanceof Error ? e.message : 'source invalide' }, { status: 400 });
      }
    }

    if (body.action === 'reglage_fenetre_nocturne') {
      if (typeof body.debut !== 'number' || typeof body.fin !== 'number') return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      try {
        return Response.json({ ok: true, fenetre: await ecrireFenetreNocturne(body.debut, body.fin) });
      } catch (e) {
        return Response.json({ erreur: e instanceof Error ? e.message : 'fenêtre invalide' }, { status: 400 });
      }
    }

    return Response.json({ erreur: 'action inconnue' }, { status: 400 });
  } catch (e) {
    console.error('[admin/sources] POST indisponible', e);
    return Response.json({ erreur: 'réglage indisponible' }, { status: 503 });
  }
}
