import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { withTransaction } from '../../../../../lib/db/client';
import { type Requete, type CanalContact, validerCanal, champsCoordonnees, ecrireContact } from '../../../../../lib/sitadel/mairieContact';

/**
 * PATCH /api/admin/permis/contact — CORRECTION MANUELLE de l'adresse e-mail d'une commune (chantier S5).
 *
 * PERMISSION : RÔLE ADMINISTRATEUR (`exigerAdministrateur` : role+actif relus en base). Non déclarée dans `proxy.ts` →
 * réservée à l'administrateur par le défaut FAIL-CLOSED (les collaborateurs sont refusés) ; garde = 2e barrière.
 *
 * Effet : valide le CANAL et son champ obligatoire (`validerCanal`), puis écrit le contact en source='saisie_manuelle',
 * statut='confirme', EN JOURNALISANT. S23 — le canal décide ce qu'on UTILISE pour adresser (via `resoudreDestination`),
 * JAMAIS ce qu'on efface : les trois coordonnées (e-mail, URL, adresse postale) sont CONSERVÉES telles quelles
 * (`champsCoordonnees`), une coordonnée ne disparaît que si l'humain l'a vidée. AUCUN envoi d'e-mail. Transaction (journal
 * + registre atomiques). Runtime Node.
 */
export const runtime = 'nodejs';

const CANAUX: readonly CanalContact[] = ['email', 'formulaire', 'courrier', 'inconnu'];

export async function PATCH(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const c = (await request.json()) as { codeInsee?: unknown; canal?: unknown; email?: unknown; urlFormulaire?: unknown; adressePostale?: unknown; note?: unknown; telephone?: unknown; responsableNom?: unknown; telephoneStandard?: unknown; emailType?: unknown; motif?: unknown };
    // D5 — MOTIF libre (journalisé), pour relire dans six mois POURQUOI une commune a changé de rail. Absent → défaut historique.
    const motif = typeof c.motif === 'string' && c.motif.trim() !== '' ? c.motif.trim() : 'correction manuelle (admin)';
    const codeInsee = typeof c.codeInsee === 'string' ? c.codeInsee.trim() : '';
    const canal = (typeof c.canal === 'string' ? c.canal : '') as CanalContact;
    const email = typeof c.email === 'string' ? c.email.trim() : '';
    const urlFormulaire = typeof c.urlFormulaire === 'string' ? c.urlFormulaire.trim() : '';
    const adressePostale = typeof c.adressePostale === 'string' ? c.adressePostale.trim() : '';
    const note = typeof c.note === 'string' ? c.note : null;
    // S18 : protocole. NULL si vide (trim) → ne stocke pas une chaîne vide.
    const telephone = typeof c.telephone === 'string' && c.telephone.trim() !== '' ? c.telephone.trim() : null;
    const responsableNom = typeof c.responsableNom === 'string' && c.responsableNom.trim() !== '' ? c.responsableNom.trim() : null;
    const telephoneStandard = typeof c.telephoneStandard === 'string' && c.telephoneStandard.trim() !== '' ? c.telephoneStandard.trim() : null;
    // S19 : email_type = l'une des 4 valeurs, sinon NULL (honnête « non renseigné » — la CHECK de la migration 067 le borne aussi).
    const emailType = typeof c.emailType === 'string' && ['urbanisme', 'accueil', 'prada', 'inconnu'].includes(c.emailType) ? c.emailType : null;
    if (!/^\d{5}$/.test(codeInsee)) return Response.json({ erreur: 'code INSEE invalide' }, { status: 400 });
    if (!CANAUX.includes(canal)) return Response.json({ erreur: 'canal invalide' }, { status: 400 });
    const motifErreur = validerCanal(canal, { email, urlFormulaire, adressePostale });
    if (motifErreur) return Response.json({ erreur: motifErreur }, { status: 400 });

    // S23 : les coordonnées sont conservées telles quelles (non gated par le canal). La cohérence utile reste garantie par
    // `validerCanal` ci-dessus + la contrainte de la 051 (le canal exige SON champ non vide ; elle n'impose PAS le NULL des
    // autres). Le canal ne pilote QUE le choix du destinataire (`resoudreDestination`), pas l'effacement.
    const coord = champsCoordonnees({ email, urlFormulaire, adressePostale });
    await withTransaction(async (tx) => {
      const q: Requete = <R = Record<string, unknown>>(t: string, p?: unknown[]) => tx(t, p) as unknown as Promise<{ rows: R[] }>;
      await ecrireContact(q, {
        codeInsee,
        email: coord.email,
        urlFormulaire: coord.urlFormulaire,
        adressePostale: coord.adressePostale,
        canal, source: 'saisie_manuelle', statut: 'confirme',
        telephone, responsableNom, // S18 : protocole (protocole_verifie_le mis à CURRENT_DATE par ecrireContact)
        telephoneStandard, emailType, // S19 : standard + nature de l'adresse
        motif, auteur: garde.auteurId === null ? null : String(garde.auteurId), note,
      });
    });
    return Response.json({ ok: true, codeInsee, canal, statut: 'confirme' });
  } catch {
    return Response.json({ erreur: 'enregistrement impossible' }, { status: 503 });
  }
}
