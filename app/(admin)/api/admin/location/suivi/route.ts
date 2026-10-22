import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import { exigerLocation } from '../../../../../lib/location/garde';
import {
  ajouterBaremeApporteur, ajouterRegle, ajouterRetrocession, annulerRetrocession, creerApporteur, enregistrerActiviteBail,
  lireApporteurs, lireNegociateurs, lireRegles, lireRetrocessions, peutVoirCommissions, proposerActivite, suiviDisponible,
} from '../../../../../lib/location/suivi/suiviRepo';
import { donneesTableau } from '../../../../../lib/location/suivi/tableauBordRepo';
import { aujourdhuiParis } from '../../../../../lib/location/suivi/suivi';

/**
 * TUILE LOCATION — « OUTILS DE SUIVI » (Arno, 22/10/2026, migration 406). Une porte dédiée, à côté de `/api/admin/location` :
 *   GET  ?vue=parametres                         apporteurs (taux datés), règles de commission, rétrocessions, négociateurs ;
 *   GET  ?vue=proposition&lotId&locataires&date  ce que « Nouveau locataire » propose (gestion du bien, origine client déduite) ;
 *   GET  ?vue=tableau&annee=AAAA                  le tableau de bord (lignes de l'année et de N−1, gestion récurrente, préavis) ;
 *   POST action=enregistrer-activite {bailId, activite}   le suivi commercial d'un bail (module Location) ;
 *   POST action=creer-apporteur {apporteur}               « + Nouvel apporteur » (module Location) ;
 *   POST action=bareme-apporteur | regle | retrocession | annuler-retrocession   (ADMINISTRATEUR : la roue Paramètres).
 * Les rétrocessions (montants de commission) ne sont lues que par qui peut « Voir les commissions ».
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;
const json = (corps: unknown, status = 200): Response => Response.json(corps, { status, headers: ENTETES });

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerLocation(request);
  if ('refus' in garde) return garde.refus;
  const url = new URL(request.url);
  try {
    if (url.searchParams.get('vue') === 'proposition') {
      const ids = (url.searchParams.get('locataires') ?? '').split(',').map(Number).filter((x) => Number.isInteger(x) && x > 0);
      return json(await proposerActivite(Number(url.searchParams.get('lotId')), ids, url.searchParams.get('date')));
    }
    const voirCommissions = await peutVoirCommissions(garde.auteurId);
    if (url.searchParams.get('vue') === 'tableau') {
      const jour = aujourdhuiParis();
      const a = Number(url.searchParams.get('annee'));
      const annee = Number.isInteger(a) && a >= 2000 && a <= 2100 ? a : Number(jour.slice(0, 4));
      return json({ etat: 'ok', data: await donneesTableau(annee, voirCommissions, jour) });
    }
    const [disponible, apporteurs, regles, retrocessions, negociateurs] = await Promise.all([
      suiviDisponible(), lireApporteurs(), lireRegles(), voirCommissions ? lireRetrocessions() : Promise.resolve([]), lireNegociateurs(),
    ]);
    return json({ etat: 'ok', data: { disponible, apporteurs, regles, retrocessions, negociateurs, voirCommissions, moi: garde.auteurId ?? null } });
  } catch (e) {
    console.error('[api/admin/location/suivi] lecture impossible', e);
    return json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, 503);
  }
}

const ACTIONS_ADMIN = new Set(['bareme-apporteur', 'regle', 'retrocession', 'annuler-retrocession']);

export async function POST(request: Request): Promise<Response> {
  let corps: Record<string, unknown>;
  try {
    corps = await request.json() as Record<string, unknown>;
  } catch {
    return json({ etat: 'refus', motif: 'Demande illisible.' }, 400);
  }
  const action = typeof corps.action === 'string' ? corps.action : '';
  const garde = ACTIONS_ADMIN.has(action) ? await exigerAdministrateur(request) : await exigerLocation(request);
  if ('refus' in garde) return garde.refus;
  const auteur = await auteurDeLaRequete(request);
  try {
    switch (action) {
      case 'enregistrer-activite': return json(await enregistrerActiviteBail(corps.bailId, corps.activite, auteur));
      case 'creer-apporteur': return json(await creerApporteur(corps.apporteur, auteur));
      case 'bareme-apporteur': return json(await ajouterBaremeApporteur(corps.apporteurId, corps.bareme, auteur));
      case 'regle': return json(await ajouterRegle(corps.regle, auteur));
      case 'retrocession': return json(await ajouterRetrocession(corps.retrocession, auteur));
      case 'annuler-retrocession': return json(await annulerRetrocession(corps.id, auteur));
      default: return json({ etat: 'refus', motif: 'Action inconnue.' }, 400);
    }
  } catch (e) {
    console.error('[api/admin/location/suivi] écriture impossible', action, e);
    return json({ etat: 'erreur', message: 'Enregistrement impossible : la base n’a pas répondu.' }, 503);
  }
}
