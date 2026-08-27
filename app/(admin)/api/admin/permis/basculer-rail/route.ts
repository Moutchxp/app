import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { query } from '../../../../../lib/db/client';
import { raisonRefusBascule } from '../../../../../lib/sitadel/basculeRail';

/**
 * D5 — GET /api/admin/permis/basculer-rail?q=&cible=email|formulaire — APERÇU (LECTURE SEULE) avant de basculer une commune de
 * rail. Résout la commune (code INSEE 5 chiffres OU nom exact), lit son contact (canal + coordonnées), compte ses demandes NON
 * ENVOYÉES (brouillon/prête) et les permis qui reviendraient au réservoir, et renvoie la RAISON DE REFUS éventuelle (rail déjà
 * actif, ou coordonnée cible manquante — renvoi à la fiche contact). L'EXÉCUTION réutilise les chemins EXISTANTS côté client :
 * annulation via `/demandes/annuler-lot` (D1, aucun DELETE) puis changement de canal via `PATCH /contact` (`ecrireContact`,
 * journalisé). Ce lot n'AJOUTE aucun nouveau chemin d'écriture. AUCUN WHERE dest_canal (garde axe-F). RÉSERVÉ ADMINISTRATEUR. Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const cibleP = url.searchParams.get('cible');
  const cible = cibleP === 'email' || cibleP === 'formulaire' ? cibleP : null;
  if (cible === null) return Response.json({ erreur: 'cible invalide (email|formulaire)' }, { status: 422 });
  if (q === '') return Response.json({ erreur: 'commune manquante' }, { status: 422 });
  try {
    // Résolution de la commune : code INSEE (5 chiffres) OU nom exact (insensible à la casse). Ambiguïté → 409 (préciser le code).
    const estCode = /^\d{5}$/.test(q);
    const c = await query<{ code_insee: string; nom: string | null }>(
      `SELECT code_insee, nom FROM commune WHERE ($2 AND code_insee = $1) OR (NOT $2 AND nom ILIKE $1) ORDER BY code_insee LIMIT 2`,
      [q, estCode]);
    if (c.rows.length === 0) return Response.json({ erreur: 'commune introuvable' }, { status: 404 });
    if (c.rows.length > 1) return Response.json({ erreur: 'plusieurs communes correspondent — précisez le code INSEE' }, { status: 409 });
    const codeInsee = c.rows[0].code_insee;
    const communeNom = c.rows[0].nom;

    const contact = await query<{ canal: string | null; email: string | null; url_formulaire: string | null; adresse_postale: string | null }>(
      `SELECT canal, email, url_formulaire, adresse_postale FROM mairie_contact WHERE code_insee = $1`, [codeInsee]);
    const ct = contact.rows[0] ?? { canal: null, email: null, url_formulaire: null, adresse_postale: null };

    // Demandes NON ENVOYÉES de la commune (à annuler) + permis distincts encore dûs qui reviendraient au réservoir.
    const dem = await query<{ id: number }>(`SELECT id::int AS id FROM demande WHERE code_insee = $1 AND statut IN ('brouillon', 'prete') ORDER BY id`, [codeInsee]);
    const perm = await query<{ n: number }>(
      `SELECT count(DISTINCT dd.dossier_id)::int AS n FROM demande d JOIN demande_dossier dd ON dd.demande_id = d.id
        WHERE d.code_insee = $1 AND d.statut IN ('brouillon', 'prete') AND dd.actif AND dd.satisfait_le IS NULL`, [codeInsee]);

    const raisonRefus = raisonRefusBascule(ct.canal, cible, { email: ct.email, urlFormulaire: ct.url_formulaire, adressePostale: ct.adresse_postale });

    return Response.json({
      codeInsee, communeNom, canalActuel: ct.canal, cible,
      ids: dem.rows.map((r) => r.id), nbDemandes: dem.rows.length, nbPermis: perm.rows[0]?.n ?? 0,
      raisonRefus, // null = bascule permise ; sinon la raison (rail déjà actif, coordonnée manquante)
      // Coordonnées ACTUELLES à re-transmettre au PATCH /contact (il écrit ce qu'on lui envoie — on préserve l'existant).
      coordonnees: { email: ct.email ?? '', urlFormulaire: ct.url_formulaire ?? '', adressePostale: ct.adresse_postale ?? '' },
    });
  } catch {
    return Response.json({ erreur: 'aperçu indisponible' }, { status: 503 });
  }
}
