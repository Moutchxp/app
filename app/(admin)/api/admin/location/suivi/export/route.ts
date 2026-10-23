import 'server-only';
import { exigerLocation } from '../../../../../../lib/location/garde';
import { peutVoirCommissions } from '../../../../../../lib/location/suivi/suiviRepo';
import { donneesTableau } from '../../../../../../lib/location/suivi/tableauBordRepo';
import { filtrer, filtreDepuis } from '../../../../../../lib/location/suivi/tableauBord';
import { classeurSuivi } from '../../../../../../lib/location/suivi/exportXlsx';
import { aujourdhuiParis } from '../../../../../../lib/location/suivi/suivi';

/**
 * GET /api/admin/location/suivi/export?annee=AAAA[&negociateur&apporteur&gestion&origine] — le suivi de l'année en .xlsx, un
 * onglet par mois (janvier → mois en cours), avec les filtres de l'écran. Droit « Location » ; primes et commission du
 * négociateur seulement pour qui peut « Voir les commissions ». LECTURE SEULE.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerLocation(request);
  if ('refus' in garde) return garde.refus;
  const url = new URL(request.url);
  const jour = aujourdhuiParis();
  const a = Number(url.searchParams.get('annee'));
  const annee = Number.isInteger(a) && a >= 2000 && a <= 2100 ? a : Number(jour.slice(0, 4));
  try {
    const voirCommissions = await peutVoirCommissions(garde.auteurId);
    const d = await donneesTableau(annee, voirCommissions, jour);
    const filtre = filtreDepuis(url.searchParams);
    const activites = filtrer(d.activites, filtre).filter((x) => x.dateSignature.startsWith(`${annee}-`));
    const moisMax = annee < Number(jour.slice(0, 4)) ? 12 : Math.max(Number(jour.slice(5, 7)), ...activites.map((x) => Number(x.dateSignature.slice(5, 7))));
    const libelleNego = d.negociateurs.find((n) => n.cle === filtre.negociateur)?.libelle;
    const libelleApp = typeof filtre.apporteur === 'number' ? d.apporteurs.find((x) => x.id === filtre.apporteur)?.nom : filtre.apporteur === 'aucun' ? 'sans apporteur' : undefined;
    const filtres = [libelleNego, libelleApp, filtre.gestion ? `${filtre.gestion} gestion` : null, filtre.origine === 'nouveau' ? 'nouveaux clients' : filtre.origine === 'deja' ? 'déjà clients' : null]
      .filter((x) => x).join(', ');
    const tampon = await classeurSuivi({ annee, moisMax, activites, ctx: { regles: d.regles, apporteurs: d.apporteurs, retrocessions: d.retrocessions,
      // 413 — la part gestion « Récurrent » des affaires de toutes les années, avec les mêmes filtres.
      recurrents: filtrer(d.recurrents ?? [], filtre), aujourdhui: d.aujourdhui }, voirCommissions, filtres });
    return new Response(new Uint8Array(tampon), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="suivi-location-${annee}.xlsx"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('[api/admin/location/suivi/export] export impossible', e);
    return Response.json({ etat: 'erreur', message: 'Export impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}
