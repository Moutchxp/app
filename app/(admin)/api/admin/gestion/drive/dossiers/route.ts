import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import {
  chercherDossiers, filAriane, listerDossiers, listerDrivesAvecId, listerPartagesAvecMoi,
} from '../../../../../../lib/gestion/drive';
import { jetonPourRequete, messageAcces } from '../../../../../../lib/gestion/jetonCollaborateur';
import { dernierDossierDuFil } from '../../../../../../lib/gestion/driveRepo';
import { depotsDriveDisponibles } from '../../../../../../lib/gestion/schema';

/**
 * /api/admin/gestion/drive/dossiers — LE SÉLECTEUR DE DOSSIER, servi par l'application.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LOT 5-PJ-C2 — ON AGIT AU NOM DE L'ADRESSE DE SESSION. Le jeton est obtenu par DÉLÉGATION, pour l'adresse avec
 * laquelle la personne s'est identifiée à l'interface : ni choix de compte, ni écran Google, ni bouton à cliquer.
 * C'est donc Google qui applique SES droits, comme dans drive.google.com. Auparavant un seul jeton partagé
 * (`gestion@`) servait tout le monde — tout le monde voyait la même chose, ni plus ni moins que ce compte-là.
 * Aucune liste de droits n'est recopiée chez nous : elle serait fausse dès le lendemain.
 *
 * 🔒 LE JETON NE SORT JAMAIS D'ICI. Le navigateur ne parle jamais à Google : il demande à l'application, qui relit
 * le droit `gestion` à chaque requête, puis interroge le Drive.
 *
 * 🔒 LECTURE SEULE DU DRIVE : lister et chercher. Aucune création, aucun renommage, aucun déplacement, aucun partage.
 *
 * LA RACINE A TROIS ENTRÉES, comme Google Drive : « Mon Drive », les « Drives partagés », et « Partagés avec moi ».
 * La troisième n'est atteignable par AUCUN `in parents` (ces dossiers appartiennent à quelqu'un d'autre) : elle
 * manquait donc entièrement, sans que rien n'échoue.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';

/** Les identifiants des trois entrées de racine. Des mots à nous, jamais des identifiants Google. */
export const RACINE_MON_DRIVE = 'root';
export const RACINE_DRIVES_PARTAGES = 'svav:drives';
export const RACINE_PARTAGES_AVEC_MOI = 'svav:partages';

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

  // La migration des DÉPÔTS d'abord : inutile d'aller chercher un jeton pour une fonctionnalité qui ne pourrait pas
  //   mémoriser son résultat. L'écran affiche alors « bientôt disponible », ce qui est la vérité.
  if (!await depotsDriveDisponibles()) {
    return json({ etat: 'sans_schema', message: 'Bientôt disponible — une mise à jour de la base est nécessaire.' });
  }

  const acces = await jetonPourRequete(request);
  if (acces.etat !== 'ok') {
    // On rend l'ÉTAT, pas seulement un message : « pas encore configuré par l'administrateur » et « votre adresse
    //   n'a pas d'accès » ne se réparent pas au même endroit, et l'écran doit pouvoir le dire.
    return json({ etat: acces.acces.etat, message: messageAcces(acces.acces), detail: acces.motif });
  }
  const T = acces.jeton;

  try {
    // ── LA RECHERCHE, tous Drive confondus (raccourcis compris) ──
    if (recherche !== '') {
      const r = await chercherDossiers(T, recherche, { fetch });
      if (!r.ok) return json({ etat: 'erreur', message: r.motif }, 502);
      return json({ etat: 'ok', mode: 'recherche', compte: acces.compteGoogle, dossiers: r.valeur });
    }

    // ── LES DRIVE PARTAGÉS, présentés comme un dossier qu'on ouvre ──
    if (parent === RACINE_DRIVES_PARTAGES) {
      const r = await listerDrivesAvecId(T, { fetch });
      if (!r.ok) return json({ etat: 'erreur', message: r.motif }, 502);
      return json({
        etat: 'ok', mode: 'navigation', compte: acces.compteGoogle, dossiers: r.valeur,
        ariane: [{ id: RACINE_DRIVES_PARTAGES, nom: 'Drives partagés' }],
      });
    }

    // ── « PARTAGÉS AVEC MOI » ──
    if (parent === RACINE_PARTAGES_AVEC_MOI) {
      const r = await listerPartagesAvecMoi(T, { fetch });
      if (!r.ok) return json({ etat: 'erreur', message: r.motif }, 502);
      return json({
        etat: 'ok', mode: 'navigation', compte: acces.compteGoogle, dossiers: r.valeur,
        ariane: [{ id: RACINE_PARTAGES_AVEC_MOI, nom: 'Partagés avec moi' }],
      });
    }

    // ── UN DOSSIER ORDINAIRE ──
    if (parent !== '') {
      const [liste, ariane] = await Promise.all([
        listerDossiers(T, { parentId: parent, driveId }, { fetch }),
        filAriane(T, parent, { fetch }),
      ]);
      if (!liste.ok) return json({ etat: 'erreur', message: liste.motif }, 502);
      return json({
        etat: 'ok', mode: 'navigation', compte: acces.compteGoogle, dossiers: liste.valeur,
        ariane: ariane.ok ? ariane.valeur : [],
      });
    }

    // ── LA RACINE : trois entrées, comme dans Google Drive ──
    const dernier = Number.isInteger(filId) && filId > 0 ? await dernierDossierDuFil(filId) : null;
    return json({
      etat: 'ok', mode: 'racines', compte: acces.compteGoogle,
      dossiers: [
        { id: RACINE_MON_DRIVE, nom: 'Mon Drive', driveId: null },
        { id: RACINE_DRIVES_PARTAGES, nom: 'Drives partagés', driveId: null },
        { id: RACINE_PARTAGES_AVEC_MOI, nom: 'Partagés avec moi', driveId: null },
      ],
      dernier,
    });
  } catch (e) {
    console.error('[gestion/drive/dossiers] lecture impossible', e);
    return json({ etat: 'erreur', message: 'Le Drive n’a pas répondu.' }, 503);
  }
}
