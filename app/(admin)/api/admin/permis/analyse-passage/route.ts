import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { analyserAuPassageEnAnalyse } from '../../../../../lib/permis/analysePassage';
import { avecVerrouDossier } from '../../../../../lib/permis/verrouExtraction';

/**
 * LOT 70 — /api/admin/permis/analyse-passage : ANALYSE AU PASSAGE EN « Analyse et projection ». POST { dossierId }. Appelé SANS
 * geste explicite d'Arno (à l'ouverture d'un permis dans l'onglet). Lance l'analyse complète (vision, payante) SEULEMENT si aucune
 * analyse n'a jamais tourné pour ce dossier OU si la GED a changé (règle b, même logique que diagnosticsVague, LOT 56-C) ; dans tous
 * les cas, reporte GRATUITEMENT les déclarations connues dans les champs vides. SOUS LE VERROU du dossier (LOT 58 : une seule analyse
 * à la fois). Ne touche JAMAIS une saisie (invariant 103). RÉSERVÉ ADMINISTRATEUR. Runtime Node.
 */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  let ctx: unknown;
  try {
    const c = (await request.json().catch(() => ({}))) as { dossierId?: unknown };
    ctx = c.dossierId;
    if (!Number.isInteger(c.dossierId) || (c.dossierId as number) <= 0) return Response.json({ erreur: 'dossierId invalide' }, { status: 400 });
    const auteur = garde.auteurId === null ? 'admin' : String(garde.auteurId);
    const verrou = await avecVerrouDossier(c.dossierId as number, () =>
      analyserAuPassageEnAnalyse(c.dossierId as number, `analyse:passage:${auteur}`));
    // Verrou déjà pris (une analyse tourne) → 409 HONNÊTE : jamais une fausse panne. Le client l'affiche comme « analyse en cours ».
    if (!verrou.ok) return Response.json({ erreur: 'Une analyse de ce permis est déjà en cours.' }, { status: 409 });
    if (!verrou.valeur.ok) return Response.json({ erreur: 'permis inconnu' }, { status: 404 });
    return Response.json({ ok: true, resultat: verrou.valeur });
  } catch (e) {
    console.error('[permis/analyse-passage] POST impossible (503)', { dossierId: ctx, message: (e as Error)?.message });
    return Response.json({ erreur: 'analyse impossible' }, { status: 503 });
  }
}
