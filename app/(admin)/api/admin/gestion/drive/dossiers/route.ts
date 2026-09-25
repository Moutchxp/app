import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import {
  chercherDossiers, filAriane, listerDossiers, listerDrivesAvecId, listerPartagesAvecMoi, lireDossier,
  memoiserLecture, type EtapeAriane,
} from '../../../../../../lib/gestion/drive';
import {
  RACINE_DRIVES_PARTAGES, RACINE_MON_DRIVE, RACINE_PARTAGES_AVEC_MOI,
} from '../../../../../../lib/gestion/cibleDepot';
import { dossiersRecentsAccessibles, nouveauBudget } from '../../../../../../lib/gestion/dossiersRecents';
import { jetonPourRequete, messageAcces } from '../../../../../../lib/gestion/jetonCollaborateur';
import {
  dernierDossierDuFil, dossiersRecentsDeposes, lireMaxDossiersRecents,
} from '../../../../../../lib/gestion/driveRepo';
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
 *
 * 🔴 LOT 5-PJ-D — QUATRE VUES, ET NON PLUS TROIS. La vue d'OUVERTURE (`accueil`) propose le dernier dossier de
 * l'échange puis les dossiers récents, comme « Ajouter à Drive » dans Gmail ; `vue=racines` donne la racine
 * inchangée, atteinte par « Parcourir tout le Drive ». Rien n'est retiré : navigation, recherche, raccourcis et
 * « Partagés avec moi » se comportent exactement comme avant.
 *
 * 🔴 LES DEUX REGROUPEMENTS SONT MARQUÉS `regroupement: true`. « Drives partagés » et « Partagés avec moi » ne sont
 * pas des dossiers : l'écran n'y affiche plus « Déposer ici », et les routes de dépôt refusent la cible (cf.
 * `cibleDepot.ts`). Le marquage est fait ICI, du côté qui SAIT, plutôt que par une liste d'identifiants recopiée
 * dans le composant.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';

// Les identifiants des trois entrées de racine vivent désormais dans `cibleDepot.ts` — les routes de dépôt en ont
//   besoin aussi, et une seconde copie finirait par diverger. Réexportés : rien de ce qui les importait ne casse.
export { RACINE_MON_DRIVE, RACINE_DRIVES_PARTAGES, RACINE_PARTAGES_AVEC_MOI };

/** Les trois entrées de la racine. Les deux regroupements le DISENT : ce ne sont pas des destinations de dépôt. */
const RACINES = [
  { id: RACINE_MON_DRIVE, nom: 'Mon Drive', driveId: null },
  { id: RACINE_DRIVES_PARTAGES, nom: 'Drives partagés', driveId: null, regroupement: true },
  { id: RACINE_PARTAGES_AVEC_MOI, nom: 'Partagés avec moi', driveId: null, regroupement: true },
];

/**
 * Combien de dossiers on demande à la base pour en retenir `max`. Il en faut PLUS que `max` : certains seront
 * écartés faute de droits, et s'arrêter au premier refus rendrait une liste courte sans raison visible. Trois fois,
 * borné — au-delà, on chercherait indéfiniment des dossiers auxquels cette personne n'a simplement pas accès.
 */
const VIVIER_PAR_PLACE = 3;

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
  /** « Parcourir tout le Drive » : la racine, demandée explicitement. Sans ce mot, on rend la vue d'ouverture. */
  const versRacines = (url.searchParams.get('vue') ?? '') === 'racines';

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
        // `regroupement` sur la miette : c'est elle qui alimente le bouton « Déposer dans « … » » du bas, et déposer
        //   « dans les Drives partagés » ne veut rien dire — Google refuserait, après le téléversement.
        ariane: [{ id: RACINE_DRIVES_PARTAGES, nom: 'Drives partagés', regroupement: true }],
      });
    }

    // ── « PARTAGÉS AVEC MOI » ──
    if (parent === RACINE_PARTAGES_AVEC_MOI) {
      const r = await listerPartagesAvecMoi(T, { fetch });
      if (!r.ok) return json({ etat: 'erreur', message: r.motif }, 502);
      return json({
        etat: 'ok', mode: 'navigation', compte: acces.compteGoogle, dossiers: r.valeur,
        ariane: [{ id: RACINE_PARTAGES_AVEC_MOI, nom: 'Partagés avec moi', regroupement: true }],
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
        ariane: ariane.ok ? await arianeNommee(T, ariane.valeur) : [],
      });
    }

    // ── LA RACINE, DEMANDÉE EXPLICITEMENT : trois entrées, comme dans Google Drive ──
    if (versRacines) {
      return json({ etat: 'ok', mode: 'racines', compte: acces.compteGoogle, dossiers: RACINES });
    }

    // ── LA VUE D'OUVERTURE (lot 5-PJ-D) ──
    return json(await vueOuverture(T, acces.compteGoogle, filId));
  } catch (e) {
    console.error('[gestion/drive/dossiers] lecture impossible', e);
    return json({ etat: 'erreur', message: 'Le Drive n’a pas répondu.' }, 503);
  }
}

/**
 * CE QU'ON VOIT EN OUVRANT : le dernier dossier utilisé POUR CET ÉCHANGE, puis les dossiers récents de l'équipe.
 *
 * 🔴 CHAQUE LIGNE EST VÉRIFIÉE AVEC LE JETON DE LA PERSONNE QUI REGARDE. La mémoire des dépôts est commune ; les
 * droits ne le sont pas. Un dossier inaccessible est omis — pas même son nom, qui trahirait déjà un nom de
 * propriétaire — et l'on prend le suivant, jusqu'à en avoir assez.
 *
 * 🔴 AUCUN DÉPÔT ENCORE, OU RIEN D'ACCESSIBLE : la racine, tout de suite, avec une phrase qui dit pourquoi. Une vue
 * d'ouverture vide qui ne s'explique pas se lit comme une panne.
 */
async function vueOuverture(jeton: string, compte: string, filId: number): Promise<unknown> {
  const max = await lireMaxDossiersRecents();
  const [dernier, candidats] = await Promise.all([
    Number.isInteger(filId) && filId > 0 ? dernierDossierDuFil(filId) : Promise.resolve(null),
    dossiersRecentsDeposes(max * VIVIER_PAR_PLACE),
  ]);

  if (dernier === null && candidats.length === 0) {
    return { etat: 'ok', mode: 'racines', compte, dossiers: RACINES, motif: 'sans_depot' };
  }

  // Une SEULE mémoire de lecture et un SEUL budget pour toute la vue : les six dossiers d'un même Drive partagent
  //   presque toujours leurs ancêtres, et deux budgets séparés autoriseraient le double des appels.
  const lire = memoiserLecture((id: string) => lireDossier(jeton, id, { fetch }));
  const nomDuDrive = nommeurDeDrives(jeton);
  const budget = nouveauBudget(Date.now());
  const deps = { lire, nomDuDrive };
  const [tete, recents] = await Promise.all([
    dernier === null ? Promise.resolve([]) : dossiersRecentsAccessibles(
      [{ id: dernier.id, nom: dernier.nom, driveId: null, dernierDepot: '' }], deps, { max: 1, budget },
    ),
    dossiersRecentsAccessibles(candidats, deps, { max, budget, exclure: dernier?.id ?? null }),
  ]);

  if (tete.length === 0 && recents.length === 0) {
    return { etat: 'ok', mode: 'racines', compte, dossiers: RACINES, motif: 'sans_recent_accessible' };
  }
  return { etat: 'ok', mode: 'accueil', compte, dernier: tete[0] ?? null, recents };
}

/**
 * LE VRAI NOM D'UN DRIVE PARTAGÉ, demandé UNE SEULE FOIS, et seulement si un chemin en a besoin.
 *
 * 🔴 MESURÉ le 25/09/2026 contre le Drive réel : `files.get` sur la racine d'un Drive partagé rend « Drive » — le
 * même mot pour les dix Drive visibles. Un chemin « Drive › 1 actifs › Dupont » ne dit donc PAS dans quel Drive on
 * est, ce qui est précisément la question qu'un chemin doit trancher. `drives.list` rend les vrais noms.
 *
 * L'appel est PARESSEUX (aucun chemin de Drive partagé ⇒ aucune requête) et MÉMORISÉ (dix dossiers du même Drive ⇒
 * une seule requête). Un échec rend `null` : on garde alors ce que Google dit, sans jamais inventer un nom.
 */
/**
 * LE FIL D'ARIANE, avec le VRAI nom du Drive partagé à sa racine.
 *
 * 🔴 VU À L'ÉCRAN le 25/09/2026, en naviguant pour de bon : entrer dans un Drive partagé affichait
 * « Drive › … », et le bouton du bas proposait « Déposer dans « Drive » ». Les dix Drive partagés portaient le même
 * mot : le fil d'Ariane ne disait donc plus où l'on était — ce qui est son unique raison d'être. Une seule requête
 * (`drives.list`), mémorisée, et seulement si une racine de Drive partagé figure dans le chemin.
 */
async function arianeNommee(jeton: string, etapes: EtapeAriane[]): Promise<EtapeAriane[]> {
  if (!etapes.some((e) => e.driveId !== undefined)) return etapes;
  const nom = nommeurDeDrives(jeton);
  return Promise.all(etapes.map(async (e) => {
    if (e.driveId === undefined) return e;
    const vrai = await nom(e.driveId);
    return vrai === null || vrai === '' ? e : { ...e, nom: vrai };
  }));
}

function nommeurDeDrives(jeton: string): (driveId: string) => Promise<string | null> {
  let noms: Promise<Map<string, string>> | null = null;
  return async (driveId: string) => {
    noms ??= listerDrivesAvecId(jeton, { fetch })
      .then((r) => new Map(r.ok ? r.valeur.map((d) => [d.id, d.nom]) : []))
      .catch(() => new Map<string, string>());
    return (await noms).get(driveId) ?? null;
  };
}
