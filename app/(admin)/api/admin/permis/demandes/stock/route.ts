import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { chargerConfigVeille } from '../../../../../../lib/sitadel/veilleConfig';
import { stockPermisParCommune, lireDetailPermisCommune } from '../../../../../../lib/sitadel/demandeRepo';
import { CATEGORIES_STOCK } from '../../../../../../lib/sitadel/stock';
import type { CleCategorie } from '../../../../../../lib/sitadel/priorite';

/**
 * Q2b — /api/admin/permis/demandes/stock. GET en deux modes (aucune écriture) :
 *  - SANS `commune` → AGRÉGAT du stock par commune (permis éligibles, < 6 mois, non encore demandés). Chargé à l'ouverture
 *    du bloc repliable (fermé par défaut) — jamais au montage de l'onglet.
 *  - AVEC `commune` (5 chiffres) → DÉTAIL des permis délivrés de CETTE commune : `periode` (défaut 6 mois → « origine »),
 *    `type` (une catégorie ou « tous »). Chargé à l'ouverture du panneau, pour cette commune seule.
 * RÉSERVÉ ADMINISTRATEUR (proxy fail-closed + garde). Runtime Node.
 */
export const runtime = 'nodejs';

/** Type de permis valide pour le filtre du panneau (les 5 catégories nommées) ; toute autre valeur → null (« tous les types »). */
function typeValide(v: string | null): CleCategorie | null {
  return v !== null && (CATEGORIES_STOCK as readonly string[]).includes(v) ? (v as CleCategorie) : null;
}

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const url = new URL(request.url);
  const commune = url.searchParams.get('commune');
  try {
    const cfg = await chargerConfigVeille();
    // Mode DÉTAIL : une commune (code INSEE à 5 chiffres). Un code mal formé n'est pas un détail → on tombe sur l'agrégat.
    if (commune !== null && /^\d{5}$/.test(commune)) {
      const permis = await lireDetailPermisCommune(cfg, commune, url.searchParams.get('periode'), typeValide(url.searchParams.get('type')));
      return Response.json({ commune, permis });
    }
    return Response.json(await stockPermisParCommune(cfg));
  } catch (e) {
    // Jamais de catch muet (cf. P2 / veille:run invisible 9 h) : trace COMPLÈTE côté serveur, 503 générique au client.
    const err = e as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown; detail?: unknown; constraint?: unknown; table?: unknown; column?: unknown };
    console.error('[permis/stock] GET indisponible (503)', {
      commune,
      name: err?.name, message: err?.message,
      code: err?.code, detail: err?.detail, constraint: err?.constraint, table: err?.table, column: err?.column,
      stack: err?.stack,
    });
    return Response.json({ erreur: 'stock indisponible' }, { status: 503 });
  }
}
