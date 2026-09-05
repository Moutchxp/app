import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { parcellesVoisines, suggestionsAdresse, bornerRayon, type PlancheParcelles, type CentreMode } from '../../../../../lib/permis/plancheParcellesRepo';
import { validerSelection, retirerSelection } from '../../../../../lib/permis/selectionParcelleRepo';

/**
 * PL-A/B/C — /api/admin/permis/planche : la PLANCHE CADASTRALE d'un permis. RÉSERVÉ ADMINISTRATEUR.
 *   GET  ?dossierId=468[&rayon=50][&centre=empreinte|parcelle|adresse][&idu=…]  →  { planche }  (LECTURE SEULE)
 *   POST { action:'valider', dossierId, idus:[…] }  →  valide une sélection SUPERPOSÉE (recalcule empreinte+bâti+projection) → { planche }
 *   POST { action:'retirer', dossierId }            →  retire la sélection (retour byte-identique à la configuration automatique) → { planche }
 *
 * PL-C — PROVENANCE : `auteur = auteurDe(garde)` = l'ADMIN AUTHENTIFIÉ réel, jamais une chaîne de harnais (c'est un origine='saisie'
 * posé par « verif-lot101 » qui a gelé DI 649). Sélection VIDE refusée explicitement (une empreinte nulle n'a pas de sens).
 * NE TOUCHE JAMAIS `permis_parcelle` (la superposition est un chemin distinct).
 */
const auteurDe = (g: { auteurId: number | null }): string => (g.auteurId != null ? String(g.auteurId) : 'admin');

const plancheVide = (rayon: number): PlancheParcelles => ({
  schema: { largeur: 360, hauteur: 300, empreintePath: null, polygones: [], motif: 'planche indisponible', transform: null },
  meta: [], rayonM: rayon, nbRetenues: 0, nbVoisines: 0, motif: 'planche indisponible (lecture des parcelles impossible)',
  centre: { mode: 'empreinte', idu: null, point: null, provenance: null, label: null }, centreAvertissement: null, marqueurAdresse: null, parcellesChoix: [],
  localisation: { communeCode: null, communeNom: null, sections: [], feuilleLibelle: 'localisation indisponible', feuilleNote: '' },
  selection: { active: false, idus: [], validePar: null, valideLe: null, acteurNom: null },
});

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const url = new URL(request.url);
  const dossierId = Number(url.searchParams.get('dossierId'));
  if (!Number.isInteger(dossierId) || dossierId <= 0) return Response.json({ erreur: 'dossierId invalide' }, { status: 400 });
  // PL-E — AUTOCOMPLÉTION : ?suggest=<q> → liste de suggestions (proxy api-adresse, biais commune). Panne/rien → liste vide (repli propre).
  const suggest = url.searchParams.get('suggest');
  if (suggest !== null) {
    try { return Response.json({ suggestions: await suggestionsAdresse(dossierId, suggest) }); }
    catch (e) { console.error('[permis/planche] suggest indisponible', e instanceof Error ? e.message : String(e)); return Response.json({ suggestions: [] }); }
  }
  const rayonBrut = url.searchParams.get('rayon');
  const rayon = bornerRayon(rayonBrut !== null && rayonBrut.trim() !== '' ? Number(rayonBrut) : undefined);
  const modeBrut = (url.searchParams.get('centre') ?? 'empreinte').trim();
  const mode: CentreMode = modeBrut === 'parcelle' || modeBrut === 'adresse' ? modeBrut : 'empreinte';
  const idu = url.searchParams.get('idu');
  const adresseTexte = url.searchParams.get('adresse'); // PL-D — saisie manuelle d'adresse (recours quand le géocodage auto échoue)
  // PL-E — suggestion CHOISIE : point déjà connu (px/py Lambert-93 + libellé) → aucun re-géocodage.
  const px = Number(url.searchParams.get('px')), py = Number(url.searchParams.get('py'));
  const pointAdresse = Number.isFinite(px) && Number.isFinite(py) && url.searchParams.get('px') !== null
    ? { x: px, y: py, label: url.searchParams.get('plabel') ?? 'adresse choisie' } : null;
  try {
    return Response.json({ planche: await parcellesVoisines(dossierId, rayon, { mode, idu, adresseTexte, pointAdresse }) });
  } catch (e) {
    console.error('[permis/planche] GET indisponible', e instanceof Error ? e.message : String(e));
    return Response.json({ planche: plancheVide(rayon) }); // jamais un 500 qui ferait disparaître le bloc sans explication
  }
}

/** POST — MODIFICATION (valider / retirer une sélection superposée). L'admin authentifié est l'auteur. Renvoie la planche à jour. */
export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const auteur = auteurDe(garde);
  const body = (await request.json().catch(() => ({}))) as { action?: string; dossierId?: number; idus?: unknown };
  const dossierId = Number(body.dossierId);
  if (!Number.isInteger(dossierId) || dossierId <= 0) return Response.json({ erreur: 'dossierId invalide' }, { status: 400 });
  try {
    if (body.action === 'valider') {
      const idus = Array.isArray(body.idus) ? body.idus.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
      // SÉLECTION VIDE refusée EXPLICITEMENT (jamais un succès silencieux sur une empreinte nulle).
      if (idus.length === 0) return Response.json({ erreur: 'sélection vide : sélectionnez au moins une parcelle avant de valider' }, { status: 400 });
      const r = await validerSelection(dossierId, idus, auteur);
      if (r.nbSelectionnees === 0) return Response.json({ erreur: 'aucune des parcelles sélectionnées n’a de contour au cadastre : validation impossible' }, { status: 400 });
      return Response.json({ ok: true, nbSelectionnees: r.nbSelectionnees, planche: await parcellesVoisines(dossierId) });
    }
    if (body.action === 'retirer') {
      await retirerSelection(dossierId, auteur);
      return Response.json({ ok: true, planche: await parcellesVoisines(dossierId) });
    }
    return Response.json({ erreur: 'action inconnue' }, { status: 400 });
  } catch (e) {
    console.error('[permis/planche] POST échec', e instanceof Error ? e.message : String(e));
    return Response.json({ erreur: 'écriture refusée (base indisponible ou migration 202 absente)' }, { status: 422 });
  }
}
