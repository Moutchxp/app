import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import {
  ajouterTva, enregistrerReglages, lireLocationsPourHonoraires, lireReglages,
} from '../../../../../lib/gestion/honorairesGestionRepo';

/**
 * /api/admin/gestion/honoraires — LOT L1 : L'ÉCRAN « HONORAIRES DE GESTION ».
 *
 * 🔒 RÉSERVÉ AUX ADMINISTRATEURS (décision d'Arno, 17/10/2026, modifiable plus tard) : il montre le chiffre d'affaires
 * théorique de l'agence. `exigerAdministrateur` RELIT le rôle en base à chaque appel. La carte du locataire et la fiche
 * du bien, elles, restent servies par la route de l'annuaire, au droit « Gestion ».
 *
 * GET `?annee=AAAA` : les locations ayant couru dans l'année (avec leurs conditions et les propriétaires du lot) et les
 * réglages. Le CALCUL (mois, année, par lot, par propriétaire, agence) est fait par l'écran, avec le module PUR
 * `honorairesGestion.ts` : la même règle que le serveur, sans aller-retour à chaque bascule.
 * POST `{ action: 'reglages', tauxDefautHt, baseDefaut }` ou `{ action: 'tva', valeur, depuis }` : journalisés.
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const brut = new URL(request.url).searchParams.get('annee') ?? '';
  const annee = /^\d{4}$/.test(brut) ? Number(brut) : new Date().getFullYear();
  try {
    const locations = await lireLocationsPourHonoraires(`${annee}-01-01`, `${annee}-12-31`);
    if (locations === null) return Response.json({ etat: 'sans_schema' }, { headers: ENTETES });
    return Response.json({ etat: 'ok', annee, locations, reglages: await lireReglages() }, { headers: ENTETES });
  } catch (e) {
    console.error('[api/admin/gestion/honoraires] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const auteur = await auteurDeLaRequete(request);
  let corps: Record<string, unknown>;
  try {
    corps = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ etat: 'refus', motif: 'Demande illisible.' }, { status: 400, headers: ENTETES });
  }
  try {
    if (corps.action === 'reglages') {
      return Response.json(
        await enregistrerReglages({ tauxDefautHt: corps.tauxDefautHt, baseDefaut: corps.baseDefaut }, auteur),
        { headers: ENTETES });
    }
    if (corps.action === 'tva') {
      return Response.json(await ajouterTva({ valeur: corps.valeur, depuis: corps.depuis }, auteur), { headers: ENTETES });
    }
    return Response.json({ etat: 'refus', motif: 'Demande incomplète.' }, { status: 400, headers: ENTETES });
  } catch (e) {
    console.error('[api/admin/gestion/honoraires] écriture impossible', e);
    return Response.json(
      { etat: 'erreur', message: 'Enregistrement impossible : la base n’a pas répondu. Rien n’a été modifié.' },
      { status: 503 });
  }
}
