import 'server-only';
import { trouverCompteParId } from '../../../../../../../lib/admin/comptes';
import { exigerModule } from '../../../../../../../lib/admin/garde';
import { nomDuCompte } from '../../../../../../../lib/gestion/mailSyndic';
import { preparerMailSyndic } from '../../../../../../../lib/gestion/mailSyndicRepo';
import { syndicsDisponibles } from '../../../../../../../lib/gestion/syndicRepo';

/**
 * ══ /api/admin/gestion/syndics/[id]/mail — LE MAIL AU SYNDIC, PRÉ-REMPLI (LOT MAIL-SYNDIC-PREREMPLI) ═══════════════
 *
 *   · GET `?a=adresse[&a=…][&lot=N]` → `{ etat: 'ok', objet, surlignage, corps, civilites }`.
 *     LOT MAIL-PREREMPLI-TEXTE-B-ET-NOM-DANS-OBJET : l'objet commence par « Prénom NOM » du compte CONNECTÉ (lu dans
 *     `admin_utilisateur`) ; sans nom (ou voie de secours, sans compte) ⇒ « Cabinet Criterimmo / … ».
 *     `lot` = le bien d'où l'on écrit : objet avec la résidence, corps complet. Sans `lot` (écran « Syndics ») :
 *     objet sans résidence, formule d'appel seule.
 *
 * 🔒 LECTURE SEULE : rien n'est écrit, rien n'est envoyé, aucun brouillon n'est créé. Droit `gestion`.
 * `private, no-store` : les données sont lues au moment du clic.
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

function identifiant(brut: string | null): number | null {
  const n = Number(brut ?? '');
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  // `exigerModule` : le même contrôle que `exigerCompteActif` (session, compte actif, droit `gestion`), qui rend en plus
  //   le compte connecté — son nom va dans l'objet.
  const garde = await exigerModule(request, 'gestion');
  if ('refus' in garde) return garde.refus;
  const id = identifiant((await params).id);
  if (id === null) return Response.json({ etat: 'erreur', message: 'Syndic non désigné.' }, { status: 422, headers: ENTETES });
  const url = new URL(request.url);
  const lot = identifiant(url.searchParams.get('lot'));
  const a = url.searchParams.getAll('a').map((x) => x.trim()).filter((x) => x !== '').slice(0, 50);
  try {
    if (!(await syndicsDisponibles())) {
      return Response.json({ etat: 'erreur', message: 'Annuaire des syndics non installé (migration 324).' },
        { status: 409, headers: ENTETES });
    }
    const compte = garde.auteurId === null ? null : await trouverCompteParId(garde.auteurId);
    const pret = await preparerMailSyndic(id, lot, a, compte === null ? null : nomDuCompte(compte.prenom, compte.nom));
    if (pret === null) return Response.json({ etat: 'erreur', message: 'Ce syndic n’existe pas.' }, { status: 404, headers: ENTETES });
    return Response.json({ etat: 'ok', ...pret }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/syndics/%d/mail] lecture impossible', id, e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}
