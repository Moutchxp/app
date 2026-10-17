import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { jetonPourRequete } from '../../../../../../lib/gestion/jetonCollaborateur';
import { piecesTacheDisponible, tachesDisponibles } from '../../../../../../lib/gestion/schema';
import { chercherTache, departDuBien, lireDossierTache, RACINE_TACHES } from '../../../../../../lib/gestion/tachesDrive';

/**
 * ══ 🔴🔴 LOT TACHES-PIECES-DRIVE — LE SÉLECTEUR DRIVE DES TÂCHES, EN LECTURE SEULE ════════════════════════════════
 *
 * `GET ?bien=<id du lot>`  → le dossier de DÉPART : celui du bien (le même que « Dossier Drive ↗ »), ou la racine
 *                             avec un message quand le bien n'a pas encore de dossier ;
 * `GET ?dossier=<id>`      → son contenu (dossiers d'abord) et son parent, pour remonter ;
 * `GET ?recherche=<texte>` → recherche par nom.
 *
 * 🔴 GET SEULEMENT, ET LE DRIVE EST LU PAR UN `fetch` QUI REFUSE TOUTE ÉCRITURE (`driveLectureSeule.ts`). Le jeton
 * est celui du collaborateur connecté : on ne voit que ce qu'il a le droit de voir.
 * 🔒 `exigerCompteActif(…, 'gestion')`. `private, no-store`.
 */
export const runtime = 'nodejs';

const json = (corps: unknown, status = 200) => Response.json(corps, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!(await tachesDisponibles()) || !(await piecesTacheDisponible())) return json({ etat: 'sans_schema' });
  const jeton = await jetonPourRequete(request);
  if (jeton.etat !== 'ok') return json({ etat: 'indisponible', message: jeton.motif });

  const url = new URL(request.url);
  const bien = Number(url.searchParams.get('bien') ?? '');
  const dossier = (url.searchParams.get('dossier') ?? '').trim();
  const recherche = (url.searchParams.get('recherche') ?? '').trim();
  try {
    if (recherche !== '') {
      const r = await chercherTache(jeton.jeton, recherche);
      return r.ok ? json({ etat: 'ok', elements: r.valeur }) : json({ etat: 'indisponible', message: r.motif });
    }
    if (dossier !== '') {
      if (!/^[A-Za-z0-9_:-]{1,200}$/.test(dossier)) return json({ erreur: 'Dossier inconnu.' }, 400);
      const r = await lireDossierTache(jeton.jeton, dossier);
      return r.ok ? json({ etat: 'ok', ...r.valeur }) : json({ etat: 'indisponible', message: r.motif });
    }
    /* 🔴 LOT GESTION-TACHES-SANS-BIEN — tâche sans bien : la racine du Drive, sans message. */
    if (url.searchParams.get('bien') === 'aucun') {
      return json({ etat: 'ok', depart: { id: RACINE_TACHES, nom: 'Drive' }, message: null });
    }
    if (Number.isInteger(bien) && bien > 0) {
      const depart = await departDuBien(jeton.jeton, bien);
      return json({
        etat: 'ok',
        depart: depart ?? { id: RACINE_TACHES, nom: 'Drive' },
        message: depart === null ? 'Ce bien n’a pas encore de dossier Drive : la fenêtre s’ouvre à la racine de votre Drive.' : null,
      });
    }
    return json({ erreur: 'Bien, dossier ou recherche attendu.' }, 400);
  } catch (e) {
    console.error('[api/admin/gestion/taches/drive] lecture impossible', e);
    return json({ etat: 'indisponible', message: 'Le Drive n’a pas pu être lu.' });
  }
}
