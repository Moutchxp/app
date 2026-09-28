import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { chercherBiens, PLAFOND_BIENS } from '../../../../../lib/gestion/rechercheBienRepo';

/**
 * /api/admin/gestion/biens — LOT BIEN-RATTACHE : CHERCHER UN BIEN, ET RIEN QU'UN BIEN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LES RÉSULTATS SONT TOUJOURS DES BIENS. Chercher un propriétaire rend TOUS SES BIENS ; chercher son téléphone
 * rend les mêmes. Il n'existe aucune réponse « PROPRIÉTAIRE X » qu'on pourrait cocher : un propriétaire n'est pas
 * un dossier, c'est une PARTIE d'un dossier (règle du lot AFFECTATION-PAR-BIEN).
 *
 * LES QUESTIONS :
 *   · `?q=…`      ce qui a été tapé : adresse (même partielle), nom, téléphone (tous formats), e-mail, n° de lot
 *   · `?date=…`   la date du mail qu'on classe — elle décide QUI est locataire et qui est locataire PASSÉ
 *
 * 🔒 MÊME DROIT QUE LA TUILE GESTION, relu en base à chaque appel. `private, no-store` : ces réponses portent des
 * adresses de logements et des noms de personnes, elles ne se mettent en cache nulle part.
 *
 * 🔒 LECTURE SEULE : un seul verbe exporté, `GET`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

/** La date du mail lue dans l'adresse, ou `null`. Refuse tout ce qui n'est pas une date ISO. PUR. */
export function lireDate(brut: string | null): string | null {
  const t = (brut ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const url = new URL(request.url);
  try {
    const r = await chercherBiens(url.searchParams.get('q') ?? '', {
      dateMail: lireDate(url.searchParams.get('date')),
      limite: PLAFOND_BIENS,
    });
    return Response.json({ etat: 'ok', ...r }, { headers: ENTETES });
  } catch (e) {
    // Pas de catch muet : une liste vide se lirait « aucun bien ne correspond », ce qui serait un mensonge.
    console.error('[api/admin/gestion/biens] recherche impossible', e);
    return Response.json({ etat: 'erreur', message: 'Recherche impossible : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}
