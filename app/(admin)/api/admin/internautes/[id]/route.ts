import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { lireProfilComplet, journaliserExtraction } from '../../../../../lib/internaute/extractionRepo';

/**
 * GET /api/admin/internautes/[id] — DOSSIER COMPLET d'une personne (module Internaute, LOT 3).
 *
 * Sert le DROIT D'ACCÈS (répondre à une demande d'accès RGPD) : identité + tous les projets + état de consentement
 * PAR finalité (à quoi la personne a consenti et depuis quand). PERMISSION : RÔLE ADMINISTRATEUR
 * (`exigerAdministrateur` + fail-closed proxy). ACCOUNTABILITY : chaque consultation est journalisée
 * (`internaute_extraction_log`, action 'acces_profil'). Lecture SEULE. Aucun pont M2. Runtime Node.
 *
 * NB : ce lot pose l'ACCÈS en lecture. La rectification et l'effacement (purge en cascade) relèvent du LOT 4.
 */
export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const garde = await exigerAdministrateur(request);
    if ('refus' in garde) return garde.refus;

    const { id } = await ctx.params;
    if (!UUID.test(id)) return Response.json({ erreur: 'introuvable' }, { status: 404 }); // pas de fuite d'énumération

    const profil = await lireProfilComplet(id);
    if (!profil) return Response.json({ erreur: 'introuvable' }, { status: 404 });

    await journaliserExtraction(garde.auteurId, 'acces_profil', { cibleInternauteId: id });
    return Response.json(profil);
  } catch {
    return Response.json({ erreur: 'profil indisponible' }, { status: 503 });
  }
}
