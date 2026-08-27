import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { query } from '../../../../../lib/db/client';
import { chargerDemandesSuivi } from '../../../../../lib/veille/reponsesSuivi';
import { compterEnCoursParProcess } from '../../../../../lib/sitadel/demandesListe';

/**
 * D2 — GET /api/admin/permis/process-compteurs — compteurs du COMMUTATEUR de process (aide d'AFFICHAGE). Par process :
 * nombre de COMMUNES (mairie_contact.canal) et de DEMANDES EN COURS. Plus le TROISIÈME groupe : communes sans adresse ni
 * téléservice (canal 'inconnu'/absent) et le vestige 'courrier' (demandes historiques).
 *
 * 🔑 D2-fix — « demandes en cours » DOIT compter EXACTEMENT ce que l'onglet En cours affiche : ni les soldées (→ Archives), ni
 * les demandes à retour (→ Réponses). On lit donc la MÊME SOURCE que l'onglet (`chargerDemandesSuivi`) et on applique le MÊME
 * prédicat (`estEnCoursAffichee`, via `compterEnCoursParProcess`) — foyer UNIQUE, jamais une règle recomptée en parallèle. Un
 * simple `count(*) WHERE statut='envoyee'` MENTAIT (incluait les soldées). Aucun WHERE `dest_canal` ajouté à chargerDemandesSuivi
 * (garde axe-F verte) : le partitionnement par process est fait EN MÉMOIRE.
 *
 * LECTURE SEULE. RÉSERVÉ ADMINISTRATEUR. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const communes = await query<{ canal: string | null; n: number }>(
      `SELECT canal, count(*)::int AS n FROM mairie_contact GROUP BY canal`);
    // 3e groupe — DÉTAIL nommé (petit : ~11 communes + le vestige courrier), pour ne rien masquer en silence (Part 4).
    const sansAdresse = await query<{ code_insee: string; nom: string | null }>(
      `SELECT mc.code_insee, c.nom FROM mairie_contact mc LEFT JOIN commune c ON c.code_insee = mc.code_insee
        WHERE mc.canal <> 'email' AND mc.canal <> 'formulaire' OR mc.canal IS NULL ORDER BY c.nom NULLS LAST, mc.code_insee`);
    const courrier = await query<{ reference: string; commune_nom: string | null }>(
      `SELECT d.reference, c.nom AS commune_nom FROM demande d LEFT JOIN commune c ON c.code_insee = d.code_insee
        WHERE d.dest_canal = 'courrier' ORDER BY d.reference`);

    // D2-fix — demandes EN COURS : même source + même règle que l'onglet En cours (soldées et à-retour EXCLUES).
    const suivi = await chargerDemandesSuivi();
    const enCours = compterEnCoursParProcess(suivi.demandes);

    const communesPar = new Map(communes.rows.map((r) => [r.canal, r.n]));
    const communesSansAdresse = communes.rows
      .filter((r) => r.canal !== 'email' && r.canal !== 'formulaire')
      .reduce((s, r) => s + r.n, 0);

    return Response.json({
      email: { communes: communesPar.get('email') ?? 0, demandesEnCours: enCours.email },
      formulaire: { communes: communesPar.get('formulaire') ?? 0, demandesEnCours: enCours.formulaire },
      hors: {
        communesSansAdresse, courrierDemandes: courrier.rows.length,
        communes: sansAdresse.rows.map((r) => ({ codeInsee: r.code_insee, nom: r.nom })),
        courrier: courrier.rows.map((r) => ({ reference: r.reference, communeNom: r.commune_nom })),
      },
    });
  } catch {
    return Response.json({ erreur: 'compteurs indisponibles' }, { status: 503 });
  }
}
