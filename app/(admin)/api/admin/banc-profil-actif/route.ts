import { chargerProfilDegagement } from "../../../../lib/db/profilConfig";
import { aLaPermission } from "../../../../lib/admin/garde";

/**
 * Banc M5 · Lot 2b — GET /api/admin/banc-profil-actif : profil ACTIF (config_scoring + cartes d'année)
 * mappé en ProfilDegagement, pour initialiser le clone éditable côté client. LECTURE SEULE (chargerProfilDegagement
 * ne fait que des SELECT). Gardé par proxy.ts (/api/admin/:path*) ET par la permission `banc_test` ici (Lot 2e).
 */
export async function GET() {
  if (!(await aLaPermission("banc_test"))) return new Response(null, { status: 403 });
  try {
    const profil = await chargerProfilDegagement();
    return Response.json({ profil });
  } catch {
    return Response.json({ erreur: "profil actif indisponible" }, { status: 503 });
  }
}
