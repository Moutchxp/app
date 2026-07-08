import { chargerProfilDegagement } from "../../../../lib/db/profilConfig";

/**
 * Banc M5 · Lot 2b — GET /api/admin/banc-profil-actif : profil ACTIF (config_scoring + cartes d'année)
 * mappé en ProfilDegagement, pour initialiser le clone éditable côté client. LECTURE SEULE (chargerProfilDegagement
 * ne fait que des SELECT). Gardé par proxy.ts (/api/admin/:path*).
 */
export async function GET() {
  try {
    const profil = await chargerProfilDegagement();
    return Response.json({ profil });
  } catch {
    return Response.json({ erreur: "profil actif indisponible" }, { status: 503 });
  }
}
