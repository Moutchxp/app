import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { coproprieteDeCle, enregistrerAgOfficielle, enregistrerPv, entreesAg, entreesAgDuLot, historiqueAgDisponible, pvAgDisponible } from '../../../../../../lib/location/agCoproprieteRepo';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import { cleImmeuble } from '../../../../../../lib/gestion/syndics';
import { enregistrerArrete, lireArrete, arreteDisponible } from '../../../../../../lib/location/arreteComptesRepo';

/**
 * /api/admin/gestion/immeubles/ag — L'HISTORIQUE DES AG D'UNE COPROPRIÉTÉ (Arno, 16/11/2026, migration 475), pour le bloc « AG de la
 * copropriété » de la fiche du bien (Location et Gestion) et de la fiche syndic. Au droit « Gestion », comme la fiche. LECTURE SEULE.
 *   GET `?lotId=` : la copropriété du bien (ou son immeuble, « à rattacher ») et ses AG ;
 *   GET `?immeuble=` : la copropriété de cet immeuble (fiche syndic) et ses AG.
 * Le syndic n'intervient jamais : les AG sont celles de la copropriété.
 *   🔴 (Arno, 17/11/2026, migration 481) POST `{ action: 'pv', immeuble, date, nature, note?, corrige? }` : « + Ajouter un PV d'AG » et
 *   « Corriger » de la fiche Copropriété (date officielle passée ou du jour, AGO / AGE, note ; ajout seul, la saisie corrigée reste en base).
 *   🔴 (Arno, 23/11/2026) POST `{ action: 'ag', immeuble, date, nature, note?, corrige? }` : « + Ajouter une AG » (date officielle, passée ou à venir).
 *   🔴 (Arno, 23/11/2026, migration 512) GET `?arreteCopropriete=<id>` / POST `{ action: 'arrete-comptes', coproprieteId, jour, mois }` : la date
 *   d'arrêté des comptes de la copropriété (fiche Copropriété et fenêtre de la sortie, même composant) ; vide des deux côtés = effacée ; journalisée.
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const u = new URL(request.url).searchParams;
  try {
    if (u.has('arreteCopropriete')) {
      const id = Number(u.get('arreteCopropriete'));
      if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ etat: 'refus', motif: 'Demande incomplète.' }, { status: 400, headers: ENTETES });
      const lu = await lireArrete(id);
      return Response.json(lu === null ? { etat: 'inconnu' } : { etat: 'ok', data: { ...lu, disponible: await arreteDisponible() } }, { headers: ENTETES });
    }
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
    return Response.json({ etat: 'ok', data: { copropriete: copro?.libelle ?? null, immeuble, applicable: true, pv: copro !== null && (await pvAgDisponible()),
      entrees: await entreesAg({ coproprieteId: copro?.id ?? null, cle, lotId: null }) } }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/immeubles/ag] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
  }
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  let corps: Record<string, unknown>;
  try { corps = await request.json() as Record<string, unknown>; } catch { return Response.json({ etat: 'refus', motif: 'Demande illisible.' }, { status: 400, headers: ENTETES }); }
  if (corps.action === 'arrete-comptes') {
    try {
      const r = await enregistrerArrete({ coproprieteId: corps.coproprieteId, jour: corps.jour, mois: corps.mois }, await auteurDeLaRequete(request));
      return Response.json(r, { headers: ENTETES });
    } catch (e) {
      console.error('[gestion/immeubles/ag] arrêté des comptes non enregistré', e);
      return Response.json({ etat: 'erreur', message: 'La date d’arrêté des comptes n’a pas été enregistrée : la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
    }
  }
  // 🔴 (Arno, 23/11/2026) `ag` : « + Ajouter une AG » de la fiche Copropriété — date OFFICIELLE, tenue ou fixée par convocation (à venir)
  if (corps.action !== 'pv' && corps.action !== 'ag') return Response.json({ etat: 'refus', motif: 'Action inconnue.' }, { status: 400, headers: ENTETES });
  try {
    const r = corps.action === 'ag' ? await enregistrerAgOfficielle(corps, await auteurDeLaRequete(request)) : await enregistrerPv(corps, await auteurDeLaRequete(request));
    return Response.json(r.ok ? { etat: 'ok', data: { entrees: r.entrees } } : { etat: 'refus', motif: r.motif }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/immeubles/ag] PV non enregistré', e);
    return Response.json({ etat: 'erreur', message: 'Le PV n’a pas été enregistré : la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
  }
}
