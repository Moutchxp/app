import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import { enregistrerDigicode, journalDigicode, lireDigicodeAdresse } from '../../../../../../lib/location/digicodeImmeubleRepo';

/**
 * /api/admin/gestion/immeubles/digicode — LE DIGICODE DE L'IMMEUBLE, depuis la fiche immeuble / syndic (rose) (Arno, 21/10/2026,
 * migration 396). Au droit « Gestion ». L'immeuble est désigné par son ADRESSE POSTALE (`voie`, `cp`, `commune`), jamais par le
 * syndic : changer de syndic ne change rien au digicode.
 *   GET  `?voie=&cp=&commune=` : la valeur, la mention « Commun à tous les biens du … (N biens) », le journal.
 *   POST `{ voie, cp, commune, digicode, code }` : écrit sur l'immeuble (créé s'il n'existe pas), journalisé « fiche_syndic ».
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;
const texte = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null);

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const u = new URL(request.url).searchParams;
  const adresse = { voie: texte(u.get('voie'), 300), codePostal: texte(u.get('cp'), 10), commune: texte(u.get('commune'), 120) };
  try {
    const lu = await lireDigicodeAdresse(adresse);
    if (lu === null) return Response.json({ etat: 'sans_schema' }, { headers: ENTETES });
    return Response.json({ etat: 'ok', data: { ...lu, journal: await journalDigicode(adresse) } }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/immeubles/digicode] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
  }
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  let corps: Record<string, unknown>;
  try {
    corps = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ etat: 'refus', motif: 'Demande illisible.' }, { status: 400, headers: ENTETES });
  }
  try {
    const r = await enregistrerDigicode({ voie: texte(corps.voie, 300), codePostal: texte(corps.cp, 10), commune: texte(corps.commune, 120) },
      { digicode: corps.digicode, code: corps.code }, await auteurDeLaRequete(request), 'fiche_syndic');
    return Response.json(r.ok ? { etat: 'ok', data: { change: r.change } } : { etat: 'refus', motif: r.motif }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/immeubles/digicode] écriture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Enregistrement impossible : la base n’a pas répondu. Rien n’a été modifié.' }, { status: 503, headers: ENTETES });
  }
}
