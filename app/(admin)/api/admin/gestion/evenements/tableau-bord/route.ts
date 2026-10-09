import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { tableauBord } from '../../../../../../lib/gestion/tableauBordRepo';

/**
 * ══ 🔴🔴 LOT EVENEMENTS-TABLEAU-DE-BORD — LES CHIFFRES DU PORTEFEUILLE. LECTURE SEULE ══════════════════════════
 *
 * `/api/admin/gestion/evenements/tableau-bord` — GET, et rien d'autre. Aucune écriture n'est possible par cette
 * porte : il n'y a pas de `POST`, pas de `PATCH`, pas de `DELETE`, et le module qu'elle appelle ne sait pas
 * écrire (voir l'encadré de `tableauBordRepo`).
 *
 * 🔒 `exigerCompteActif` : les chiffres portent sur le portefeuille entier (montants de devis, volumes).
 * `private, no-store` — un tableau de bord mis en cache par un intermédiaire serait un tableau de bord faux.
 * Runtime Node (driver `pg`).
 *
 * ⚠️ UN ÉCHEC REND 503 ET UN MESSAGE, jamais un objet vide : un tableau de bord qui affiche des zéros parce que
 * la base n'a pas répondu est le pire des deux mondes — il a l'air de dire quelque chose.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  try {
    const tb = await tableauBord();
    return Response.json(tb, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gestion/evenements/tableau-bord] lecture impossible', e);
    return Response.json(
      { erreur: 'Tableau de bord indisponible : erreur interne du serveur.' },
      { status: 503 },
    );
  }
}
