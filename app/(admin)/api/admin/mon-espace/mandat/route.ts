import { exigerMonEspace } from '../../../../../lib/mon-espace/garde';
import { transactionDuMandat } from '../../../../../lib/mon-espace/creationRepo';
import { lireNumeroMandat } from '../../../../../lib/transaction/mandat';
import { estSociete } from '../../../../../lib/transaction/modele';

/**
 * 🔴 MON ESPACE, LOT 5 — GET /api/admin/mon-espace/mandat?societe=criterimmo&numero=M-42 : « ce mandat existe-t-il déjà dans cette structure ? »
 * Les fonctions uniques du lot 2 (`lireNumeroMandat`, puis `venteDuMandat`). Rend `{ libre: true }` ou `{ libre: false, transaction }` (bien,
 * parties, statut, dates, collègues rattachés — aucun montant). LECTURE SEULE ; droit « Mon espace ». Jamais mise en cache.
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;
const json = (corps: unknown, status = 200): Response => Response.json(corps, { status, headers: ENTETES });

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerMonEspace(request);
  if ('refus' in garde) return garde.refus;
  const url = new URL(request.url);
  const societe = url.searchParams.get('societe');
  if (!estSociete(societe)) return json({ etat: 'refus', motif: 'Choisissez d’abord la structure (CRITERIMMO ou MACJ).' }, 422);
  const n = lireNumeroMandat(url.searchParams.get('numero'));
  if (!n.ok) return json({ etat: 'refus', motif: n.motif }, 422);
  if (n.valeur === null) return json({ etat: 'refus', motif: 'Le n° de mandat est obligatoire.' }, 422);
  try {
    const transaction = await transactionDuMandat(societe, n.valeur.saisi);
    return json({ etat: 'ok', data: transaction === null ? { libre: true, numero: n.valeur.saisi } : { libre: false, numero: n.valeur.saisi, transaction } });
  } catch (e) {
    console.error('[mon-espace] mandat', e);
    return json({ etat: 'erreur', message: 'Vérification impossible.' }, 500);
  }
}
