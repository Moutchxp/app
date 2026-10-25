import 'server-only';
import { exigerLocation } from '../../../../../../lib/location/garde';
import { estAdministrateurActif } from '../../../../../../lib/location/suivi/suiviRepo';
import { donneesTableau } from '../../../../../../lib/location/suivi/tableauBordRepo';
import { filtrer, filtreDepuis } from '../../../../../../lib/location/suivi/tableauBord';
import { classeurSuivi } from '../../../../../../lib/location/suivi/exportXlsx';
import { aujourdhuiParis } from '../../../../../../lib/location/suivi/suivi';
import { dansPeriode, moisDeLaPeriode } from '../../../../../../lib/location/suivi/periodeSuivi';

/**
 * GET /api/admin/location/suivi/export?annee=AAAA | ?debut=AAAA-MM-JJ&fin=AAAA-MM-JJ [&negociateur&apporteur&gestion&origine] — le suivi en .xlsx, un
 * onglet par mois (janvier → mois en cours), avec les filtres de l'écran. Droit « Location » ; primes et commission du
 * négociateur seulement pour un administrateur (Arno, 25/10/2026). LECTURE SEULE.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerLocation(request);
  if ('refus' in garde) return garde.refus;
  const url = new URL(request.url);
  const jour = aujourdhuiParis();
  // 🔴 Arno (25/10/2026) — le Suivi annuel exporte sa PÉRIODE (`debut` et `fin`, AAAA-MM-JJ) : un onglet par mois de la période (4a).
  const dateOk = (x: string | null): x is string => x !== null && /^\d{4}-\d{2}-\d{2}$/.test(x);
  const debutP = url.searchParams.get('debut'); const finP = url.searchParams.get('fin');
  const periode = dateOk(debutP) && dateOk(finP) && debutP <= finP ? { debutDate: debutP, finDate: finP } : null;
  const a = Number(url.searchParams.get('annee'));
  const annee = periode !== null ? Number(periode.finDate.slice(0, 4)) : Number.isInteger(a) && a >= 2000 && a <= 2100 ? a : Number(jour.slice(0, 4));
  try {
    // 🔴 Arno (25/10/2026) — primes et commission du négociateur dans l'export : administrateurs seulement.
    const voirCommissions = await estAdministrateurActif(garde.auteurId);
    const d = await donneesTableau(annee, voirCommissions, jour, voirCommissions ? null : garde.auteurId, { toutes: periode !== null });
    const p = d.negociateurPropre;
    const commissionPropre = p === undefined ? undefined
      : { libelle: p.libelle, parMois: Object.fromEntries(p.lignes.map((l) => [l.mois, { commission: l.totaux.commission, retrocessions: l.totaux.retrocessions }])) };
    const filtre = filtreDepuis(url.searchParams);
    const activites = filtrer(d.activites, filtre).filter((x) => (periode === null ? x.dateSignature.startsWith(`${annee}-`) : dansPeriode(x.dateSignature, periode)));
    const moisMax = annee < Number(jour.slice(0, 4)) ? 12 : Math.max(Number(jour.slice(5, 7)), ...activites.map((x) => Number(x.dateSignature.slice(5, 7))));
    const mois = periode === null ? undefined : moisDeLaPeriode(periode);
    const libelleNego = d.negociateurs.find((n) => n.cle === filtre.negociateur)?.libelle;
    const libelleApp = typeof filtre.apporteur === 'number' ? d.apporteurs.find((x) => x.id === filtre.apporteur)?.nom : filtre.apporteur === 'aucun' ? 'sans apporteur' : undefined;
    const filtres = [libelleNego, libelleApp, filtre.gestion ? `${filtre.gestion} gestion` : null, filtre.origine === 'nouveau' ? 'nouveaux clients' : filtre.origine === 'deja' ? 'déjà clients' : null]
      .filter((x) => x).join(', ');
    const tampon = await classeurSuivi({ annee, moisMax, activites, ctx: { regles: d.regles, apporteurs: d.apporteurs, retrocessions: d.retrocessions,
      // 413 — la part gestion « Récurrent » des affaires de toutes les années, avec les mêmes filtres.
      recurrents: filtrer(d.recurrents ?? [], filtre), aujourdhui: d.aujourdhui }, voirCommissions, filtres, commissionPropre, mois });
    return new Response(new Uint8Array(tampon), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="suivi-location-${periode === null ? annee : `${periode.debutDate}_${periode.finDate}`}.xlsx"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('[api/admin/location/suivi/export] export impossible', e);
    return Response.json({ etat: 'erreur', message: 'Export impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}
