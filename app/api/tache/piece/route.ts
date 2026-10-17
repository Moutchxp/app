import 'server-only';
import { ouvrirPieceSignee } from '../../../lib/gestion/mailTacheRepo';

/**
 * ══ 🔴🔴 LOT GESTION-INVITATIONS-TACHES (lot 3) — TÉLÉCHARGER UNE PIÈCE D'UNE TÂCHE PAR LE LIEN DU MAIL ═════════════
 *
 * Route PUBLIQUE (hors `/api/admin`), comme `/api/tache/reponse` : le LIEN SIGNÉ est la seule autorisation. Il est propre
 * à une demande et à une pièce, a une date de fin, et cesse d'agir dès que la demande est remplacée, l'invité retiré, la
 * tâche annulée ou la pièce retirée (`ouvrirPieceSignee`). Le fichier est LU dans le Drive avec les droits de
 * l'expéditeur (jamais une écriture), et « Documents clients scannés » reste refusé. Rien n'est écrit.
 *
 *  · `GET ?j=<lien signé>` → le fichier (téléchargement), ou une page courte qui dit pourquoi pas.
 */
export const runtime = 'nodejs';

const page = (message: string, status: number) => new Response(
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
  + `<title>Pièce indisponible</title></head><body style="font-family:Arial,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#1f2328">`
  + `<h1 style="font-size:20px">Pièce indisponible</h1><p>${message.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p></body></html>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } });

export async function GET(request: Request): Promise<Response> {
  const j = new URL(request.url).searchParams.get('j') ?? '';
  if (j.trim() === '' || j.length > 300) return page('Ce lien de téléchargement n’est pas valable.', 400);
  const r = await ouvrirPieceSignee(j);
  if (!r.ok) return page(r.message, r.statut);
  const nomAscii = r.nom.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return new Response(r.flux.corps, {
    status: 200,
    headers: {
      'Content-Type': r.flux.typeMime ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${nomAscii}"; filename*=UTF-8''${encodeURIComponent(r.nom)}`,
      'Cache-Control': 'private, no-store',
      ...(r.flux.longueur !== null ? { 'Content-Length': String(r.flux.longueur) } : {}),
    },
  });
}
