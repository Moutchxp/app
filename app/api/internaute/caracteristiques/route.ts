import 'server-only';
import { exigerInternaute } from '../../../lib/internaute/authGarde';
import { lireRepriseCompte } from '../../../lib/internaute/repriseCaracteristiquesRepo';
import { clesAdresse } from '../../../lib/tunnel/repriseCaracteristiques';

// Runtime Node explicite (driver pg via la garde). Route PUBLIQUE, LECTURE SEULE.
export const runtime = 'nodejs';

/**
 * GET /api/internaute/caracteristiques?ban=…&adresse=… — 🔴 LOT REPRISE-CARACTERISTIQUES : les caractéristiques du bien
 * de la dernière demande de certificat de l'internaute CONNECTÉ à cette adresse (même identifiant BAN, à défaut même
 * adresse normalisée). Scopée par l'id SCELLÉ dans la session, jamais lu dans la requête : jamais la reprise d'un autre.
 * Non connecté → `{ connecte: false }` (la page se sert alors de la session de l'appareil). Connecté mais erreur de
 * lecture → `{ connecte: true, reprise: null }` : champs vides, jamais ceux d'un autre. Aucune écriture.
 * `Cache-Control: no-store`.
 */
export async function GET(request: Request): Promise<Response> {
  const entetes = { 'Cache-Control': 'no-store' };
  let garde: Awaited<ReturnType<typeof exigerInternaute>>;
  try {
    garde = await exigerInternaute(request);
  } catch {
    return Response.json({ connecte: false }, { headers: entetes });
  }
  if ('refus' in garde) return Response.json({ connecte: false }, { headers: entetes });
  try {
    const u = new URL(request.url);
    const cles = clesAdresse(u.searchParams.get('ban'), u.searchParams.get('adresse'));
    if (cles.ban === null && cles.texte === null) return Response.json({ connecte: true, reprise: null }, { headers: entetes });
    return Response.json({ connecte: true, reprise: await lireRepriseCompte(garde.internauteId, cles) }, { headers: entetes });
  } catch {
    return Response.json({ connecte: true, reprise: null }, { headers: entetes });
  }
}
