import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { query } from '../../../../../lib/db/client';

/**
 * D2 — GET /api/admin/permis/process-compteurs — compteurs du COMMUTATEUR de process (aide d'AFFICHAGE). Par process :
 * nombre de COMMUNES (mairie_contact.canal) et de DEMANDES EN COURS (statut='envoyee', par dest_canal). Plus le TROISIÈME
 * groupe : communes sans adresse ni téléservice (canal 'inconnu'/absent) et le vestige 'courrier' (demandes historiques).
 *
 * 🔑 Ce sont des requêtes de COMPTAGE NEUVES, DISTINCTES des 6 requêtes de surveillance juridique (que la garde axe-F protège) :
 * elles n'entrent dans AUCUN calcul d'échéance/relance/saisine et ne modifient aucune requête existante. LECTURE SEULE.
 * RÉSERVÉ ADMINISTRATEUR. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const communes = await query<{ canal: string | null; n: number }>(
      `SELECT canal, count(*)::int AS n FROM mairie_contact GROUP BY canal`);
    const demandes = await query<{ dest_canal: string | null; n: number }>(
      `SELECT dest_canal, count(*)::int AS n FROM demande WHERE statut = 'envoyee' GROUP BY dest_canal`);
    // 3e groupe — DÉTAIL nommé (petit : ~11 communes + le vestige courrier), pour ne rien masquer en silence (Part 4).
    const sansAdresse = await query<{ code_insee: string; nom: string | null }>(
      `SELECT mc.code_insee, c.nom FROM mairie_contact mc LEFT JOIN commune c ON c.code_insee = mc.code_insee
        WHERE mc.canal <> 'email' AND mc.canal <> 'formulaire' OR mc.canal IS NULL ORDER BY c.nom NULLS LAST, mc.code_insee`);
    const courrier = await query<{ reference: string; commune_nom: string | null }>(
      `SELECT d.reference, c.nom AS commune_nom FROM demande d LEFT JOIN commune c ON c.code_insee = d.code_insee
        WHERE d.dest_canal = 'courrier' ORDER BY d.reference`);

    const communesPar = new Map(communes.rows.map((r) => [r.canal, r.n]));
    const demandesPar = new Map(demandes.rows.map((r) => [r.dest_canal, r.n]));
    // 3e groupe : communes hors des deux process = tout canal ≠ email/formulaire (dont 'inconnu' et absent).
    const communesSansAdresse = communes.rows
      .filter((r) => r.canal !== 'email' && r.canal !== 'formulaire')
      .reduce((s, r) => s + r.n, 0);

    return Response.json({
      email: { communes: communesPar.get('email') ?? 0, demandesEnCours: demandesPar.get('email') ?? 0 },
      formulaire: { communes: communesPar.get('formulaire') ?? 0, demandesEnCours: demandesPar.get('formulaire') ?? 0 },
      hors: {
        communesSansAdresse, courrierDemandes: demandesPar.get('courrier') ?? 0,
        communes: sansAdresse.rows.map((r) => ({ codeInsee: r.code_insee, nom: r.nom })),
        courrier: courrier.rows.map((r) => ({ reference: r.reference, communeNom: r.commune_nom })),
      },
    });
  } catch {
    return Response.json({ erreur: 'compteurs indisponibles' }, { status: 503 });
  }
}
