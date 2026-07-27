import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { chargerConfigVeille } from '../../../../../../lib/sitadel/veilleConfig';
import { profilValide } from '../../../../../../lib/sitadel/demande';
import { proposition } from '../../../../../../lib/sitadel/demandeRepo';

/**
 * GET /api/admin/permis/demandes/proposition — LOTS PROPOSÉS (aucune écriture) pour revue avant création (chantier S7).
 * Le profil (`?profil=`, défaut config_veille.profil_demandeur_defaut) est renvoyé pour préselectionner l'UI ; il
 * n'affecte PAS la composition des lots (le profil ne change que le TEXTE, décidé à la création). RÉSERVÉ
 * ADMINISTRATEUR (proxy fail-closed + garde). LECTURE SEULE. AUCUN ENVOI. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const cfg = await chargerConfigVeille();
    const brut = new URL(request.url).searchParams.get('profil');
    const profil = brut === null ? profilValide(cfg.profilDemandeurDefaut) : profilValide(brut);
    const { lots, diagnostic } = await proposition(cfg);
    return Response.json({ lots, diagnostic, profil });
  } catch {
    return Response.json({ erreur: 'proposition indisponible' }, { status: 503 });
  }
}
