import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import { verifierCibleDepot } from '../../../../../../../lib/gestion/cibleDepot';
import { depsReellesDepot } from '../../../../../../../lib/gestion/depotDriveReel';
import { deposerPieces, resumerDepot } from '../../../../../../../lib/gestion/depotDrive';
// 🔴 LOT RANGER-INSTANTANE-ET-NOM — le nom donné au dépôt devient le NOM D'USAGE de la pièce, et la copie entre
//   au registre des fichiers que l'application a nommés. Voir l'encadré de ce module : sans ces deux écritures,
//   la carte du message gardait le nom d'origine et la copie échappait pour toujours à la reprise depuis Drive.
import { consignerNomDuDepot } from '../../../../../../../lib/gestion/depotNomUsage';
import { lireDossier, memoiserLecture } from '../../../../../../../lib/gestion/drive';
import { verdictDeposer } from '../../../../../../../lib/gestion/driveVerdict';
import { jetonPourRequete, messageAcces } from '../../../../../../../lib/gestion/jetonCollaborateur';
import { depotsDriveDisponibles } from '../../../../../../../lib/gestion/schema';
// 🔴 LOT RENOMMER-AVANT-RANGER — le MÊME nettoyage que l'écran, écrit une seule fois (module PUR).
import { eclaterNom, verifierNom } from '../../../../../../../lib/gestion/renommagePiece';

/**
 * POST /api/admin/gestion/pieces/[id]/drive (lot 5-PJ-B) — DÉPOSER UNE PIÈCE dans un dossier du Drive.
 *
 * 🔒 LE DROIT EST CELUI QUI PERMET DÉJÀ DE VOIR LA PIÈCE (`gestion`), relu à chaque requête. Déposer une copie dans
 * le Drive de l'agence n'expose rien de plus que d'ouvrir la pièce : c'est le même contenu, pour les mêmes personnes.
 *
 * 🔒 LE JETON GOOGLE RESTE AU SERVEUR, et aucune URL de stockage ne sort : seul le lien Drive (`webViewLink`) est
 * rendu au navigateur.
 *
 * 🔒 RIEN N'EST EFFACÉ : l'original reste dans l'application (l'effacement sera le lot D).
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';
type Contexte = { params: Promise<{ id: string }> };

function json(corps: unknown, status = 200): Response {
  return Response.json(corps, { status, headers: { 'Cache-Control': SANS_CACHE } });
}
function sansCache(reponse: Response): Response {
  const e = new Headers(reponse.headers);
  e.set('Cache-Control', SANS_CACHE);
  return new Response(reponse.body, { status: reponse.status, statusText: reponse.statusText, headers: e });
}

export async function POST(request: Request, ctx: Contexte): Promise<Response> {
  const barrage = await exigerCompteActif(request, 'gestion');
  if (barrage) return sansCache(barrage);

  const pieceId = Number((await ctx.params).id);
  if (!Number.isInteger(pieceId) || pieceId <= 0) return json({ erreur: 'Pièce inconnue.' }, 400);

  const corps = (await request.json().catch(() => ({}))) as { dossierId?: string; nom?: string };
  const dossierId = (corps.dossierId ?? '').trim();
  if (dossierId === '') return json({ erreur: 'Aucun dossier choisi.' }, 400);

  /**
   * ══ 🔴🔴 LOT RENOMMER-AVANT-RANGER — LE NOM DONNÉ EST REVALIDÉ ICI, ET PAS SEULEMENT À L'ÉCRAN ══════════════
   *
   * Demande d'Arno : « le nouveau nom est celui sous lequel la pièce sera DÉPOSÉE dans le Drive ».
   *
   * 🔴 L'ÉCRAN NETTOIE DÉJÀ (mêmes fonctions, module PUR), ET ON RECOMMENCE QUAND MÊME. Un écran peut être
   * modifié, un appel peut être forgé, un vieil onglet peut envoyer ce qu'il veut : la seule barrière qui compte
   * est celle du serveur. Le coût est nul — c'est une fonction pure sur une chaîne.
   *
   * ⚠️ ON NE REFUSE PAS UN NOM SALE, ON LE NETTOIE — exactement comme l'écran, avec le MÊME code : deux
   * nettoyages différents des deux côtés finiraient par déposer un fichier sous un nom que personne n'a vu.
   * Un nom devenu vide après nettoyage est simplement ignoré : la pièce part alors sous son nom d'origine,
   * jamais sous un nom inventé.
   */
  const nomDemande = (corps.nom ?? '').trim();
  let nomChoisi = '';
  if (nomDemande !== '') {
    const { base, extension } = eclaterNom(nomDemande);
    const v = verifierNom(base, extension);
    if (v.refus === null) nomChoisi = v.nom;
  }

  // La migration AVANT tout : sans mémoire des dépôts, on ne saurait pas empêcher un doublon au clic suivant.
  if (!await depotsDriveDisponibles()) {
    return json({ etat: 'sans_schema', message: 'Bientôt disponible — une mise à jour de la base est nécessaire.' }, 409);
  }
  // LOT 5-PJ-C — le dépôt part avec le jeton DU COLLABORATEUR : c'est Google qui applique ses droits, et le
  //   fichier lui appartient. Un collaborateur non connecté se voit proposer la connexion, jamais une erreur.
  const acces = await jetonPourRequete(request);
  if (acces.etat !== 'ok') {
    // LOT 5-PJ-C2 — aucun geste n'est proposé : soit l'administrateur doit finir la configuration, soit cette
    //   adresse n'a pas d'accès Drive dans l'organisation. Dans les deux cas, un message clair, non technique.
    return json({ etat: acces.acces.etat, message: messageAcces(acces.acces), detail: acces.motif }, 409);
  }

  try {
    // LOT 5-PJ-D — LA CIBLE EST-ELLE UN VRAI DOSSIER ? « Drives partagés » et « Partagés avec moi » sont des
    //   REGROUPEMENTS : l'écran n'y propose plus « Déposer ici », mais une requête forgée ou un vieil onglet
    //   arriveraient encore avec. On refuse AVANT de lire 25 Mo, et la lecture est mémorisée : le dépôt, qui a
    //   besoin du nom du dossier, ne la repaiera pas.
    const lire = memoiserLecture((id: string) => lireDossier(acces.jeton, id, { fetch }));

    /* ══ 🔴🔴 LOT DRIVE-UNIQUE — ET OÙ CE DOSSIER SE TROUVE-T-IL ? ══════════════════════════════════════════════
       `verifierCibleDepot` dit ce que la cible EST (un dossier, pas un regroupement, pas la corbeille). Elle ne
       disait pas OÙ elle est — si bien que l'archive du cabinet était une destination de dépôt valide, alors que
       rien d'autre dans l'application n'a le droit d'y écrire. Même remontée, même module pur, même « ne pas
       savoir vaut interdit » que la création d'un dossier.

       ══ 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — LES DEUX EN PARALLÈLE ═══════════════════════════════════════════
       Demande d'Arno : « vérification des parents en parallèle et en cache (déjà fait pour les déplacements,
       réutilise-le) ».

       🔴 ELLES ÉTAIENT EN SÉRIE, ET RIEN NE L'EXIGEAIT : deux questions indépendantes posées à Google, l'une
       après l'autre. MESURÉ le 30/09/2026 sur le vrai Drive : 448 ms + 303 ms, puis 303 ms + 338 ms — environ
       650 ms d'attente pour deux appels qui n'ont rien à se dire.

       🔴 ET AUCUNE DES DEUX N'EST AFFAIBLIE. Les deux réponses sont attendues, les deux refus sont prononcés, et
       DANS LE MÊME ORDRE qu'avant : « ce n'est pas un dossier » d'abord, « ce n'est pas un endroit permis »
       ensuite. Paralléliser change quand on pose les questions, jamais lesquelles ni ce qu'on fait des réponses.

       ⚠️ ON LANCE LES DEUX AVANT DE LIRE LA PREMIÈRE, donc on paie parfois un verdict dont on n'avait pas
       besoin — quand la cible n'est même pas un dossier. C'est une LECTURE de métadonnées, mémorisée 60 s
       (`chaineDuDossierMemo`), et le cas est celui d'une requête forgée : on optimise le chemin normal. */
    const [cible, place] = await Promise.all([
      verifierCibleDepot(dossierId, lire),
      verdictDeposer(acces.compteGoogle, acces.jeton, dossierId),
    ]);
    if (!cible.ok) return json({ etat: 'cible_invalide', message: cible.motif }, 400);
    if (!place.deposer) return json({ etat: 'cible_invalide', message: place.motif }, 403);

    const auteur = { ...await auteurDeLaRequete(request), compteGoogle: acces.compteGoogle };
    const issues = await deposerPieces(
      depsReellesDepot(lire), acces.jeton, [pieceId], dossierId, auteur,
      // ⚠️ VIDE ⇒ CARTE VIDE, donc `nomDeDepot` rend le nom d'origine : la route d'avant ce lot, mot pour mot.
      nomChoisi === '' ? undefined : new Map([[pieceId, nomChoisi]]),
    );
    /**
     * 🔴🔴 APRÈS LA CONFIRMATION DE GOOGLE, ET SEULEMENT APRÈS. Écrire le nom d'usage avant le dépôt renommerait
     * la pièce partout dans l'application pour un fichier qui n'existerait peut-être jamais — et un échec de
     * dépôt laisserait derrière lui un renommage que personne n'a demandé.
     *
     * ⚠️ NE LÈVE JAMAIS, et n'est donc pas attendu par le verdict : le fichier EST dans le Drive. Dire le dépôt
     * raté parce qu'on n'a pas su noter son nom enverrait le déposer une seconde fois.
     */
    const bilanNom = await consignerNomDuDepot(pieceId, nomChoisi, issues, auteur);
    return json({
      etat: 'ok', resultats: issues, resume: resumerDepot(issues),
      // L'écran s'en sert pour savoir s'il doit relire le fil : le nom affiché de la pièce vient de changer.
      nomUsageEcrit: bilanNom.nomUsageEcrit,
    });
  } catch (e) {
    console.error('[gestion/piece/drive] dépôt impossible', e);
    return json({ etat: 'erreur', message: 'Le dépôt n’a pas abouti.' }, 503);
  }
}
