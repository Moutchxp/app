import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { chercherDossiers, filAriane, listerDossiers } from '../../../../../../lib/gestion/drive';
import { listerDrivesPartages } from '../../../../../../lib/gestion/google';
import { jetonAccesGestion } from '../../../../../../lib/gestion/jetonAcces';
import { dernierDossierDuFil } from '../../../../../../lib/gestion/driveRepo';
import { depotsDriveDisponibles } from '../../../../../../lib/gestion/schema';

/**
 * /api/admin/gestion/drive/dossiers (lot 5-PJ-B) — LE SÉLECTEUR DE DOSSIER, servi par l'application.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒 LE JETON GOOGLE NE SORT JAMAIS D'ICI. Le navigateur ne parle jamais à Google : il demande à l'application, qui
 * relit le droit `gestion` à chaque requête, puis interroge le Drive avec un jeton qui reste côté serveur. Donner le
 * jeton au navigateur reviendrait à lui donner un accès complet au Drive de l'agence, sans limite ni révocation.
 *
 * 🔒 LECTURE SEULE DU DRIVE. Cette route ne fait que LISTER et CHERCHER des dossiers. Aucune création, aucun
 * renommage, aucun déplacement, aucun partage — le Drive existant n'est jamais modifié.
 *
 * TROIS QUESTIONS, une par paramètre :
 *   · `?parent=<id>`   les dossiers de ce dossier (navigation), avec son fil d'Ariane ;
 *   · `?q=<texte>`     les dossiers dont le nom contient ce texte, tous Drive confondus ;
 *   · rien             les racines : Mon Drive et les Drive partagés, plus le dernier dossier utilisé pour l'échange
 *                      (`?fil=<id>`), sur lequel le sélecteur s'ouvre.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';

function json(corps: unknown, status = 200): Response {
  return Response.json(corps, { status, headers: { 'Cache-Control': SANS_CACHE } });
}

function sansCache(reponse: Response): Response {
  const entetes = new Headers(reponse.headers);
  entetes.set('Cache-Control', SANS_CACHE);
  return new Response(reponse.body, { status: reponse.status, statusText: reponse.statusText, headers: entetes });
}

export async function GET(request: Request): Promise<Response> {
  const barrage = await exigerCompteActif(request, 'gestion');
  if (barrage) return sansCache(barrage);

  const url = new URL(request.url);
  const parent = (url.searchParams.get('parent') ?? '').trim();
  const recherche = (url.searchParams.get('q') ?? '').trim();
  const driveId = (url.searchParams.get('drive') ?? '').trim() || null;
  const filId = Number(url.searchParams.get('fil') ?? '');

  // La migration D'ABORD : inutile d'aller chercher un jeton Google pour une fonctionnalité qui ne pourrait pas
  //   mémoriser son résultat. L'écran affiche alors « bientôt disponible », ce qui est la vérité.
  if (!await depotsDriveDisponibles()) {
    return json({ etat: 'sans_schema', message: 'Bientôt disponible — une mise à jour de la base est nécessaire.' });
  }

  const acces = await jetonAccesGestion();
  if (acces.etat !== 'ok') return json({ etat: acces.etat, message: acces.motif });

  try {
    if (recherche !== '') {
      const r = await chercherDossiers(acces.jeton, recherche, { fetch });
      if (!r.ok) return json({ etat: 'erreur', message: r.motif }, 502);
      return json({ etat: 'ok', mode: 'recherche', dossiers: r.valeur });
    }

    if (parent !== '') {
      const [liste, ariane] = await Promise.all([
        listerDossiers(acces.jeton, { parentId: parent, driveId }, { fetch }),
        filAriane(acces.jeton, parent, { fetch }),
      ]);
      if (!liste.ok) return json({ etat: 'erreur', message: liste.motif }, 502);
      return json({
        etat: 'ok', mode: 'navigation', dossiers: liste.valeur,
        ariane: ariane.ok ? ariane.valeur : [],
      });
    }

    // ── LES RACINES ── Mon Drive et les Drive partagés, présentés comme des dossiers ordinaires.
    const drives = await listerDrivesPartages(acces.jeton, { fetch });
    const racines = [
      { id: 'root', nom: 'Mon Drive', driveId: null },
      ...(drives.ok ? await identifiantsDesDrives(acces.jeton) : []),
    ];
    const dernier = Number.isInteger(filId) && filId > 0 ? await dernierDossierDuFil(filId) : null;
    return json({ etat: 'ok', mode: 'racines', dossiers: racines, dernier });
  } catch (e) {
    console.error('[gestion/drive/dossiers] lecture impossible', e);
    return json({ etat: 'erreur', message: 'Le Drive n’a pas répondu.' }, 503);
  }
}

/**
 * Les Drive partagés AVEC leur identifiant. `listerDrivesPartages` (lot 5-GOOGLE) ne rend que les NOMS — c'était son
 * but : confirmer un accès sans faire défiler des noms de locataires. Ici il faut l'identifiant pour y naviguer, donc
 * on redemande le champ. On ne modifie pas la fonction existante, dont un test tient le contrat.
 */
async function identifiantsDesDrives(jeton: string): Promise<{ id: string; nom: string; driveId: string }[]> {
  const res = await fetch('https://www.googleapis.com/drive/v3/drives?pageSize=100&fields=drives(id,name)', {
    headers: { Authorization: `Bearer ${jeton}` },
  });
  if (!res.ok) return [];
  const j = (await res.json().catch(() => ({}))) as { drives?: { id?: string; name?: string }[] };
  return (j.drives ?? [])
    .filter((d) => typeof d.id === 'string' && d.id !== '')
    // La racine d'un Drive partagé a pour identifiant celui du Drive lui-même : le parent et le Drive coïncident.
    .map((d) => ({ id: d.id as string, nom: (d.name ?? '(sans nom)').trim(), driveId: d.id as string }));
}
