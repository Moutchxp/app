import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { lireModePassageRattachement, ecrireModePassageRattachement, type ModePassageRattachement } from '../../../../../lib/permis/rattachementConfig';

/**
 * COMPLÉMENT (règle Arno, 07/09/2026) — RÉGLAGE « mode de passage en Rattachement » (automatique / clôture manuelle). Route DÉDIÉE et
 * LÉGÈRE (l'écran Réglages la lit/écrit sans passer par la route /reglages transactionnelle). Résiliente : colonne absente → défaut
 * 'automatique'. RÉSERVÉ ADMINISTRATEUR. AUCUN ENVOI. Runtime Node.
 */
export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  return Response.json({ mode: await lireModePassageRattachement() });
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const body = (await request.json().catch(() => ({}))) as { mode?: string };
  if (body.mode !== 'automatique' && body.mode !== 'cloture_manuelle') return Response.json({ erreur: 'mode invalide' }, { status: 400 });
  try {
    const mode = await ecrireModePassageRattachement(body.mode as ModePassageRattachement);
    return Response.json({ ok: true, mode });
  } catch {
    // 207 non appliquée → écriture impossible ; on le DIT (jamais un succès muet).
    return Response.json({ erreur: 'réglage indisponible (migration 207 non appliquée)' }, { status: 503 });
  }
}
