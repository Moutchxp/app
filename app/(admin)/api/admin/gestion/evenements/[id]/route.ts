import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import { lireCarte } from '../../../../../../lib/gestion/carteRepo';
import { chargerConfigGestion } from '../../../../../../lib/gestion/config';
import { lirePartenairesInternes } from '../../../../../../lib/gestion/partenaires';
import { deplacementsDeMailsDisponibles } from '../../../../../../lib/gestion/schema';
import { changerEtatEvenement, estEtat, modifierEvenement } from '../../../../../../lib/gestion/gestes';

/**
 * /api/admin/gestion/evenements/[id] (lot 4c) — LE DÉTAIL D'UNE CARTE, et ses corrections.
 *
 * GET rend la carte et les échanges qui lui sont rattachés. Il n'est appelé qu'au DÉPLIAGE : une carte qu'on ne déplie
 * pas ne coûte aucune requête (patron `BlocRepliable`).
 *
 * PATCH fait DEUX choses distinctes, jamais mélangées dans un même appel implicite :
 *   · `{ etat }`   → change l'état (« traité » pose la date de traitement, la base l'exige) ;
 *   · les CHAMPS   → corrige ce que le pré-remplissage n'a pu que proposer (quoi / qui demande / adresse).
 * Les deux sont journalisés avec l'avant et l'après.
 *
 * 🔒 GARDE D'ÉCRITURE sur les DEUX verbes — y compris le GET : le détail d'une carte contient le texte de mails de
 * locataires. `exigerCompteActif` relit la base à chaque appel. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

type Contexte = { params: Promise<{ id: string }> };

function identifiant(brut: string): number | null {
  const n = Number(brut);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = identifiant((await ctx.params).id);
  if (id === null) return Response.json({ erreur: 'Événement inconnu.' }, { status: 400 });
  try {
    // Qui est « nous », qui est un partenaire interne : lu en base (migration 233), jamais en dur. Sans ce contexte,
    //   l'attente affichée sur la carte contredirait celle de la file.
    const [config, partenaires, deplacements] = await Promise.all([
      chargerConfigGestion(), lirePartenairesInternes(), deplacementsDeMailsDisponibles(),
    ]);
    const carte = await lireCarte(id, { partenaires, adresseGestion: config.adresseGestion, deplacements });
    if (!carte) return Response.json({ erreur: 'Cet événement n’existe pas.' }, { status: 404 });
    return Response.json(carte, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gestion/evenement] lecture impossible', e);
    return Response.json({ erreur: 'Lecture impossible : erreur interne du serveur.' }, { status: 503 });
  }
}

export async function PATCH(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = identifiant((await ctx.params).id);
  if (id === null) return Response.json({ erreur: 'Événement inconnu.' }, { status: 400 });

  let corps: { etat?: unknown; objet?: string | null; demandeurNom?: string | null; demandeurEmail?: string | null; adresseLibre?: string | null };
  try { corps = (await request.json()) as typeof corps; }
  catch { return Response.json({ erreur: 'Demande illisible.' }, { status: 422 }); }

  try {
    const auteur = await auteurDeLaRequete(request);
    if (corps.etat !== undefined) {
      if (!estEtat(corps.etat)) return Response.json({ erreur: 'État inconnu.' }, { status: 400 });
      const issue = await changerEtatEvenement(id, corps.etat, auteur);
      if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409 });
      return Response.json({ ok: true });
    }
    const { objet, demandeurNom, demandeurEmail, adresseLibre } = corps;
    const issue = await modifierEvenement(id, { objet, demandeurNom, demandeurEmail, adresseLibre }, auteur);
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409 });
    return Response.json({ ok: true });
  } catch (e) {
    console.error('[gestion/evenement] modification impossible', e);
    return Response.json({ erreur: 'Modification impossible : erreur interne du serveur.' }, { status: 503 });
  }
}
