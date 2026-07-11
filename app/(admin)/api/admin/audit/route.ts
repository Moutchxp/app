import 'server-only';
import { exigerAdministrateur } from '../../../../lib/admin/garde';
import { validerFenetre } from '../../../../lib/analytics/lecture/fenetre';
import { audit } from '../../../../lib/audit/lecture';

/**
 * M2 — LOT 7. GET /api/admin/audit?debut=YYYY-MM-DD&fin=YYYY-MM-DD&grain=jour|semaine|mois
 *
 * AUDIT DE SÉCURITÉ AGRÉGÉ (READ ONLY) : succès/échecs de connexion par tranche de temps + détection de pics.
 * STRICTEMENT agrégé — AUCUN identifiant, AUCUNE IP, AUCUN détail par personne (la source `analytics_admin_jour`
 * n'en porte pas). Ne lit JAMAIS l'état de throttle `login_echec`.
 *
 * PERMISSION : réservée au RÔLE ADMINISTRATEUR (`exigerAdministrateur`, relit role+actif en base → révocation
 * immédiate) — comme la tuile « Administratif ». L'audit de sécurité est une fonction d'administration, pas une
 * permission de module déléguable. Seul GET exporté (aucune méthode mutante). Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const garde = await exigerAdministrateur(request);
    if ('refus' in garde) return garde.refus; // 403 INTERDIT générique (ni existence, ni cause)

    const url = new URL(request.url);
    const v = validerFenetre(url.searchParams.get('debut'), url.searchParams.get('fin'), url.searchParams.get('grain'));
    if (!v.ok) return Response.json({ erreur: v.erreur }, { status: 400 });

    return Response.json(await audit(v.fenetre));
  } catch {
    // Accès base en échec → erreur maîtrisée, jamais de fuite de détail.
    return Response.json({ erreur: 'audit indisponible' }, { status: 503 });
  }
}
