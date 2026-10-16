import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { envoyerInvitation } from '../../../../../../lib/admin/invitationRepo';
import { phraseEnvoi } from '../../../../../../lib/admin/invitation';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/comptes/[id]/invitation — « Renvoyer le mail d'invitation » (lot GESTION-INVITATION-ADMIN, 16/10/2026).
 * Administrateur uniquement (proxy : surface Administratif ; ET rôle revérifié en base). Génère un NOUVEAU lien et rend
 * l'ancien inutilisable. Refusé pour un compte déjà activé ou désactivé, et à moins de 2 minutes du dernier envoi.
 * Réponse : la phrase VRAIE (« Mail renvoyé à … » ou l'erreur réelle).
 */
export async function POST(request: Request, ctx: Ctx) {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const { id } = await ctx.params;
  if (!/^[1-9]\d*$/.test(id)) return Response.json({ erreur: 'Identifiant de compte invalide.' }, { status: 422 });

  const r = await envoyerInvitation(Number(id), garde.auteurId);
  if (r.ok) {
    const message = r.etat === 'envoye' ? `Mail renvoyé à ${r.destinataire}.` : phraseEnvoi({ etat: r.etat, destinataire: r.destinataire });
    return Response.json({ ok: true, etat: r.etat, message });
  }
  if (r.etat === 'refuse') return Response.json({ erreur: r.motif }, { status: r.motif === 'Compte introuvable.' ? 404 : 409 });
  return Response.json({ erreur: phraseEnvoi({ etat: r.etat, destinataire: r.destinataire, motif: r.motif }), etat: r.etat }, { status: 502 });
}
