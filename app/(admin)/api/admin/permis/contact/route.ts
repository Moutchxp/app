import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { withTransaction } from '../../../../../lib/db/client';
import { type Requete, emailValide, ecrireContact } from '../../../../../lib/sitadel/mairieContact';

/**
 * PATCH /api/admin/permis/contact — CORRECTION MANUELLE de l'adresse e-mail d'une commune (chantier S5).
 *
 * PERMISSION : RÔLE ADMINISTRATEUR (`exigerAdministrateur` : role+actif relus en base). Non déclarée dans `proxy.ts` →
 * réservée à l'administrateur par le défaut FAIL-CLOSED (les collaborateurs sont refusés) ; garde = 2e barrière.
 *
 * Effet : valide le format, puis écrit le contact en source='saisie_manuelle', statut='confirme', EN JOURNALISANT
 * (email_avant→email_apres). AUCUN envoi d'e-mail. Transaction (journal + registre atomiques). Runtime Node.
 */
export const runtime = 'nodejs';

export async function PATCH(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const corps = (await request.json()) as { codeInsee?: unknown; email?: unknown; note?: unknown };
    const codeInsee = typeof corps.codeInsee === 'string' ? corps.codeInsee.trim() : '';
    const email = typeof corps.email === 'string' ? corps.email.trim() : '';
    const note = typeof corps.note === 'string' ? corps.note : null;
    if (!/^\d{5}$/.test(codeInsee)) return Response.json({ erreur: 'code INSEE invalide' }, { status: 400 });
    if (!emailValide(email)) return Response.json({ erreur: 'adresse e-mail invalide' }, { status: 400 });

    await withTransaction(async (tx) => {
      const q: Requete = <R = Record<string, unknown>>(t: string, p?: unknown[]) => tx(t, p) as unknown as Promise<{ rows: R[] }>;
      await ecrireContact(q, {
        codeInsee, email, source: 'saisie_manuelle', statut: 'confirme',
        motif: 'correction manuelle (admin)', auteur: garde.auteurId === null ? null : String(garde.auteurId), note,
      });
    });
    return Response.json({ ok: true, codeInsee, email, statut: 'confirme' });
  } catch {
    return Response.json({ erreur: 'enregistrement impossible' }, { status: 503 });
  }
}
