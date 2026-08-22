import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { chargerDonneesCarteCada } from '../../../../../../lib/veille/carteCadaDonnees';

/**
 * /api/admin/permis/saisines/copie-pdf?saisineId= (CADA lot A) — TÉLÉCHARGE la pièce jointe obligatoire de la saisine : la
 * copie PDF de la demande initiale restée sans suite (générateur EXISTANT genererCopieDemandePdf, NON modifié). Import dynamique
 * pour garder pdfkit hors du graphe statique. RÉSERVÉ ADMINISTRATEUR. Runtime Node. N'écrit rien.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const saisineId = Number(new URL(request.url).searchParams.get('saisineId'));
    if (!Number.isInteger(saisineId)) return Response.json({ erreur: 'saisineId invalide' }, { status: 400 });
    const donnees = await chargerDonneesCarteCada(saisineId);
    if (donnees === null) return Response.json({ erreur: 'saisine introuvable' }, { status: 404 });
    const { genererCopieDemandePdf } = await import('../../../../../../lib/pdf/copieDemandePdf');
    const pdf = await genererCopieDemandePdf(donnees.pdf);
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Copie-demande-${donnees.reference}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[permis/saisines/copie-pdf] GET impossible (503)', { message: (e as Error)?.message });
    return Response.json({ erreur: 'PDF indisponible' }, { status: 503 });
  }
}
