import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { coproprieteDeCle, entreesAg, entreesAgDuLot, historiqueAgDisponible } from '../../../../../../lib/location/agCoproprieteRepo';
import { cleImmeuble } from '../../../../../../lib/gestion/syndics';

/**
 * /api/admin/gestion/immeubles/ag — L'HISTORIQUE DES AG D'UNE COPROPRIÉTÉ (Arno, 16/11/2026, migration 475), pour le bloc « AG de la
 * copropriété » de la fiche du bien (Location et Gestion) et de la fiche syndic. Au droit « Gestion », comme la fiche. LECTURE SEULE.
 *   GET `?lotId=` : la copropriété du bien (ou son immeuble, « à rattacher ») et ses AG ;
 *   GET `?immeuble=` : la copropriété de cet immeuble (fiche syndic) et ses AG.
 * Le syndic n'intervient jamais : les AG sont celles de la copropriété.
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const u = new URL(request.url).searchParams;
  try {
    if (!(await historiqueAgDisponible())) return Response.json({ etat: 'sans_schema' }, { headers: ENTETES });
    const lot = Number(u.get('lotId'));
    if (Number.isSafeInteger(lot) && lot > 0) {
      const h = await entreesAgDuLot(lot);
      if (h === null) return Response.json({ etat: 'inconnu' }, { headers: ENTETES });
      return Response.json({ etat: 'ok', data: { copropriete: h.contexte.copropriete?.libelle ?? null, immeuble: h.contexte.immeuble?.libelle ?? null,
        applicable: h.contexte.immeuble !== null, entrees: h.entrees } }, { headers: ENTETES });
    }
    const immeuble = (u.get('immeuble') ?? '').slice(0, 300);
    const cle = cleImmeuble(immeuble);
    if (cle === '') return Response.json({ etat: 'refus', motif: 'Demande incomplète.' }, { status: 400, headers: ENTETES });
    const copro = await coproprieteDeCle(cle);
    return Response.json({ etat: 'ok', data: { copropriete: copro?.libelle ?? null, immeuble, applicable: true,
      entrees: await entreesAg({ coproprieteId: copro?.id ?? null, cle, lotId: null }) } }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/immeubles/ag] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
  }
}
