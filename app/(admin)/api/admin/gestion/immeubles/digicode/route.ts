import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { journalDigicode, lireDigicodesAdresse } from '../../../../../../lib/location/digicodeImmeubleRepo';

/**
 * /api/admin/gestion/immeubles/digicode — LE DIGICODE DE L'IMMEUBLE, depuis la fiche immeuble / syndic (rose) (Arno, 21/10/2026,
 * migration 396). Au droit « Gestion ». L'immeuble est désigné par son ADRESSE POSTALE (`voie`, `cp`, `commune`), jamais par le
 * syndic : changer de syndic ne change rien au digicode.
 *   GET  `?voie=&cp=&commune=` : la valeur, la mention « Commun à tous les biens du … (N biens) », le journal.
 *   POST : 🔴 REFUSÉ depuis le 16/11/2026 (voir plus bas) — n'écrit plus jamais.
 * Arno (21/10/2026, 399) — UN CODE PAR BÂTIMENT : le GET rend aussi `batiments` (une ligne par bâtiment connu) et `parBatiment` ;
 * le POST accepte `batiment` (absent ou vide : le code général de l'adresse).
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
    const lu = await lireDigicodesAdresse(adresse);
    if (lu === null) return Response.json({ etat: 'sans_schema' }, { headers: ENTETES });
    return Response.json({ etat: 'ok', data: { ...lu.general, batiments: lu.batiments, parBatiment: lu.parBatiment, journal: await journalDigicode(adresse) } }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/immeubles/digicode] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
  }
}

/**
 * 🔴🔴 (16/11/2026, « Digicodes unifiés », décision d'Arno) CE QU'IL Y AVAIT : le POST écrivait le digicode dans les ANCIENNES tables (396 / 399),
 * pour l'ancienne saisie par adresse (DigicodeImmeuble), retirée au lot 4. Plus aucun écran ne l'appelle, et elle ne doit plus JAMAIS écrire :
 * toute écriture est REFUSÉE, avec un message clair qui renvoie au chemin unique (base unique, migration 478). Rien n'est lu ni écrit en base.
 * La lecture (GET) reste telle quelle.
 */
const MOTIF_ANCIEN_CHEMIN = 'Cette saisie du digicode n’existe plus : le digicode se saisit désormais dans la fiche Copropriété ou la fiche du bien '
  + '(base unique des digicodes : première saisie, « Corriger une erreur », « Modifier »). Rien n’est enregistré.';

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  return Response.json({ etat: 'refus', motif: MOTIF_ANCIEN_CHEMIN }, { status: 410, headers: ENTETES });
}
