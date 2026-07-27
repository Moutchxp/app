import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { withTransaction } from '../../../../../lib/db/client';
import { type Requete, type CanalContact, validerCanal, ecrireContact } from '../../../../../lib/sitadel/mairieContact';

/**
 * PATCH /api/admin/permis/contact — CORRECTION MANUELLE de l'adresse e-mail d'une commune (chantier S5).
 *
 * PERMISSION : RÔLE ADMINISTRATEUR (`exigerAdministrateur` : role+actif relus en base). Non déclarée dans `proxy.ts` →
 * réservée à l'administrateur par le défaut FAIL-CLOSED (les collaborateurs sont refusés) ; garde = 2e barrière.
 *
 * Effet : valide le CANAL et son champ obligatoire (`validerCanal`), puis écrit le contact en source='saisie_manuelle',
 * statut='confirme', EN JOURNALISANT. Seul le champ du canal choisi est conservé (les autres → NULL). AUCUN envoi
 * d'e-mail. Transaction (journal + registre atomiques). Runtime Node.
 */
export const runtime = 'nodejs';

const CANAUX: readonly CanalContact[] = ['email', 'formulaire', 'courrier', 'inconnu'];

export async function PATCH(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const c = (await request.json()) as { codeInsee?: unknown; canal?: unknown; email?: unknown; urlFormulaire?: unknown; adressePostale?: unknown; note?: unknown };
    const codeInsee = typeof c.codeInsee === 'string' ? c.codeInsee.trim() : '';
    const canal = (typeof c.canal === 'string' ? c.canal : '') as CanalContact;
    const email = typeof c.email === 'string' ? c.email.trim() : '';
    const urlFormulaire = typeof c.urlFormulaire === 'string' ? c.urlFormulaire.trim() : '';
    const adressePostale = typeof c.adressePostale === 'string' ? c.adressePostale.trim() : '';
    const note = typeof c.note === 'string' ? c.note : null;
    if (!/^\d{5}$/.test(codeInsee)) return Response.json({ erreur: 'code INSEE invalide' }, { status: 400 });
    if (!CANAUX.includes(canal)) return Response.json({ erreur: 'canal invalide' }, { status: 400 });
    const motifErreur = validerCanal(canal, { email, urlFormulaire, adressePostale });
    if (motifErreur) return Response.json({ erreur: motifErreur }, { status: 400 });

    // Seul le champ du canal retenu est conservé (cohérence garantie côté SQL par la contrainte de la migration 051).
    await withTransaction(async (tx) => {
      const q: Requete = <R = Record<string, unknown>>(t: string, p?: unknown[]) => tx(t, p) as unknown as Promise<{ rows: R[] }>;
      await ecrireContact(q, {
        codeInsee,
        email: canal === 'email' ? email : null,
        urlFormulaire: canal === 'formulaire' ? urlFormulaire : null,
        adressePostale: canal === 'courrier' ? adressePostale : null,
        canal, source: 'saisie_manuelle', statut: 'confirme',
        motif: 'correction manuelle (admin)', auteur: garde.auteurId === null ? null : String(garde.auteurId), note,
      });
    });
    return Response.json({ ok: true, codeInsee, canal, statut: 'confirme' });
  } catch {
    return Response.json({ erreur: 'enregistrement impossible' }, { status: 503 });
  }
}
