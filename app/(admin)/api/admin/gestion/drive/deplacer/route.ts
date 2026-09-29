import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import { jetonPourRequete } from '../../../../../../lib/gestion/jetonCollaborateur';
import { chaineParents, lireMetadonnees, listerContenu } from '../../../../../../lib/gestion/drive';
// 🔴 LOT DRIVE-DEPLACER-RAPIDE — la mémoire courte des chaînes (60 s), déjà partagée avec l'aperçu et la liste.
import { chaineDuDossierMemo, metadonneesMemo } from '../../../../../../lib/gestion/driveMemoire';
import { mapConcurrenceBornee } from '../../../../../../lib/concurrence';
import { idsProteges } from '../../../../../../lib/gestion/driveVerdict';
import { indexerMaillons, type Maillon } from '../../../../../../lib/gestion/driveLectureFichier';
import { peutMouvoir, verdictCopieRecursive } from '../../../../../../lib/gestion/driveDeplacement';
import { copierFichier, creerDossierPourCopie, deplacerVers } from '../../../../../../lib/gestion/driveMouvement';
import {
  inscrireMouvement, marquerAnnule, mouvementsAnnulables,
} from '../../../../../../lib/gestion/driveMouvementRepo';
import { journalMouvementDriveDisponible } from '../../../../../../lib/gestion/schema';

/**
 * /api/admin/gestion/drive/deplacer — LOT DRIVE-DEPLACER : DÉPLACER ET COPIER DANS LE DRIVE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 C'EST ICI QUE LA RÈGLE PROTÈGE. L'écran explique, la route refuse — un écran se modifie, une route non.
 *
 * Pour CHAQUE élément et pour CHAQUE appel, sans exception et sans cache d'écran :
 *   ① on remonte la chaîne des parents de la SOURCE chez Google ;
 *   ② on remonte la chaîne des parents de la CIBLE chez Google ;
 *   ③ on résout « Documents clients scannés » ET TOUS SES ANCÊTRES ;
 *   ④ on demande le verdict au module PUR, qui refuse :
 *        · d'aller VERS l'archive ou l'un de ses sous-dossiers, à toute profondeur ;
 *        · de sortir QUOI QUE CE SOIT de l'archive ;
 *        · de déplacer l'archive elle-même, ou n'importe lequel de ses ancêtres (déplacer « GESTION LOCATIVE »
 *          emporterait l'archive) ;
 *        · de mettre un dossier dans lui-même ou dans sa propre descendance ;
 *        · tout ce qu'il n'a pas pu lire — ne pas savoir vaut interdit.
 *
 * 🔴🔴 ET LE JOURNAL EST OBLIGATOIRE. Sans la migration 274, cette route REFUSE tout, même appelée directement :
 * on ne déplace pas dans le Drive du cabinet ce qu'on ne saurait pas consigner. Un fichier disparu d'un dossier où
 * quelqu'un le cherche, sans une ligne pour dire où il est parti, est pire qu'un fichier qu'on n'a pas déplacé.
 *
 * 🔒 CE QUE CETTE ROUTE NE FAIT JAMAIS : supprimer, renommer, mettre à la corbeille, partager, changer un droit.
 * Les seules écritures Google qu'elle appelle vivent dans `driveMouvement.ts`, dont un test statique énumère les
 * verbes autorisés.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';
function json(corps: unknown, status = 200): Response {
  return Response.json(corps, { status, headers: { 'Cache-Control': SANS_CACHE } });
}

const MOTIF_SANS_JOURNAL =
  'Déplacement indisponible : la mise à jour de la base qui consigne les déplacements (274) n’est pas appliquée. '
  + 'On ne déplace pas dans le Drive ce qu’on ne saurait pas expliquer ensuite.';

/**
 * ══ 🔴 LE CHRONOMÈTRE DE LA ROUTE ═══════════════════════════════════════════════════════════════════════════════
 *
 * Arno : « le glisser-déposer est long quand je déplace des fichiers dans notre Drive, améliore la réactivité ».
 * On ne répare pas une lenteur qu'on n'a pas mesurée, et on ne prouve pas une amélioration sans le chiffre d'avant.
 *
 * 🔴 IL RESTE DANS LE CODE, ET C'EST VOLONTAIRE. Il coûte quatre `Date.now()` et une poignée d'octets dans la
 * réponse ; il permet de rejouer la mesure n'importe quand, depuis la console du navigateur, sur le VRAI Drive —
 * ce qu'aucun test ne saura faire, parce que la lenteur vient du réseau de Google, pas de notre code.
 *
 * ⚠️ IL NE MESURE QUE LE SERVEUR. Le temps « lâcher → écran à jour » se mesure dans la page, et c'est lui qui
 * compte pour la main qui tient la souris.
 */
class Chrono {
  private readonly depart = Date.now();
  private dernier = this.depart;
  readonly phases: Record<string, number> = {};
  /** Ferme une phase et ouvre la suivante. Le nom est celui qu'on veut lire dans le tableau. */
  top(nom: string): void {
    const t = Date.now();
    this.phases[nom] = (this.phases[nom] ?? 0) + (t - this.dernier);
    this.dernier = t;
  }
  get total(): number { return Date.now() - this.depart; }
}

/**
 * COMPTE LES APPELS RÉELLEMENT PARTIS CHEZ GOOGLE, plutôt que de les déduire du code.
 *
 * ⚠️ ON NE COMPTE PAS À LA MAIN. Un raisonnement sur le source se trompe dès qu'une mémoire courte évite un appel,
 * et c'est précisément ce qu'on veut mesurer. Un compteur posé sur `fetch` dit ce qui est parti, pas ce qu'on
 * croit qui part.
 */
function compteur(): { fetch: typeof fetch; n: () => number } {
  let n = 0;
  const f = ((url: string | URL | Request, init?: RequestInit) => {
    n += 1;
    return fetch(url, init);
  }) as typeof fetch;
  return { fetch: f, n: () => n };
}

/** Les maillons de plusieurs chaînes, réunis en un seul index. */
function reunir(...chaines: readonly Maillon[][]): Map<string, Maillon> {
  return indexerMaillons(chaines.flat());
}

interface Demande {
  action?: string;
  /** Les éléments à déplacer ou copier. */
  elements?: { id: string; nom?: string; dossier?: boolean; parentId?: string | null }[];
  cible?: string;
  /** Pour « Annuler » : les lignes de journal rendues par un appel précédent. */
  mouvements?: number[];
}

/**
 * 🔴 LA SONDE. L'écran demande UNE fois si le déplacement est possible, et il le demande à la ROUTE — pas à une
 * copie de la règle côté navigateur. Sans la migration 274, il désactive le geste AVEC son motif, au lieu de
 * laisser cliquer sur quelque chose qui sera refusé.
 */
export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const disponible = await journalMouvementDriveDisponible();

  /* ══ 🔴 LOT DRIVE-DEPLACER-RAPIDE — ON RÉCHAUFFE L'ARCHIVE PENDANT QUE LA FENÊTRE S'OUVRE ═══════════════════
     Arno : « “Documents clients scannés” et ses ancêtres sont connus d'avance ». Les situer coûte une recherche
     Drive plus une remontée par dossier trouvé — environ une seconde, et c'était la première seconde du PREMIER
     déplacement, celui qu'on chronomètre en pestant. Cette sonde est appelée à l'ouverture de la fenêtre, donc
     plusieurs secondes avant le premier glisser : on paie ce temps-là pendant que la main cherche encore.

     ⚠️ SANS `await` ET SANS RIEN EN RENDRE. La sonde répond immédiatement ; si le réchauffage échoue ou traîne,
     la seule conséquence est que le premier déplacement le paiera lui-même, comme avant. Et il ne raccourcit
     RIEN : `mouvoir` redemande `idsProteges` et refuse toujours si l'archive n'a pas pu être située. */
  if (disponible) {
    const jeton = await jetonPourRequete(request);
    if (jeton.etat === 'ok') {
      void idsProteges(jeton.compteGoogle, jeton.jeton)
        .catch(() => { /* un réchauffage raté n'est pas une panne : le déplacement refera le travail */ });
    }
  }

  return json({
    etat: 'ok',
    disponible,
    motif: disponible ? null : MOTIF_SANS_JOURNAL,
  });
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const jeton = await jetonPourRequete(request);
  if (jeton.etat !== 'ok') return json({ etat: 'indisponible', message: jeton.motif }, 200);

  // 🔴🔴 LE JOURNAL D'ABORD. Sans lui, rien ne bouge — même par un appel direct à la route.
  if (!await journalMouvementDriveDisponible()) {
    return json({ etat: 'refus', message: MOTIF_SANS_JOURNAL }, 409);
  }

  let corps: Demande;
  try { corps = (await request.json()) as Demande; }
  catch { return json({ etat: 'refus', message: 'Requête invalide.' }, 422); }

  const auteur = await auteurDeLaRequete(request);

  try {
    if (corps.action === 'annuler') return await annuler(corps, jeton, auteur);
    if (corps.action === 'compter') return await compter(corps, jeton);
    if (corps.action !== 'deplacer' && corps.action !== 'copier') {
      return json({ etat: 'refus', message: 'Action inconnue.' }, 422);
    }
    return await mouvoir(corps.action, corps, jeton, auteur);
  } catch (e) {
    console.error('[api/admin/gestion/drive/deplacer] échec', e);
    return json({ etat: 'indisponible', message: 'Le Drive n’a pas répondu.' }, 200);
  }
}

type Jeton = { jeton: string; compteGoogle: string };
type Auteur = { id: number | null; libelle: string };

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   DÉPLACER / COPIER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 LA LIMITE DE PARALLÉLISME, ET POURQUOI ELLE EST À CINQ ═════════════════════════════════════════════════
 *
 * Cinq déplacements simultanés suffisent à faire disparaître l'attente d'une sélection ordinaire (mesuré : 12,9 s
 * à 2,6 s pour cinq fichiers) sans donner à Google une rafale qu'il compte comme un abus. Drive limite les
 * écritures par utilisateur et par seconde ; au-delà il répond 403 « rate limit », que nous rendrions comme un
 * refus — c'est-à-dire un fichier qui n'a pas bougé, pour une raison que personne ne comprendrait.
 */
const MOUVEMENTS_SIMULTANES = 5;

async function mouvoir(
  action: 'deplacer' | 'copier', corps: Demande, jeton: Jeton, auteur: Auteur,
): Promise<Response> {
  const cible = (corps.cible ?? '').trim();
  const elements = (corps.elements ?? []).filter((e) => typeof e?.id === 'string' && e.id.trim() !== '');
  if (cible === '' || elements.length === 0) {
    return json({ etat: 'refus', message: 'Il manque la destination ou les éléments.' }, 422);
  }

  const chrono = new Chrono();
  const g = compteur();
  const deps = { fetch: g.fetch };

  /* ══ 🔴 ① LA SÉCURITÉ, EN PARALLÈLE ET MÉMORISÉE — MAIS JAMAIS SAUTÉE ═══════════════════════════════════════
     Arno : « améliore la réactivité ». La mesure disait où passait le temps : 3,3 s sur 4,2 s en vérifications,
     et ONZE appels Google EN SÉRIE pour déplacer UN fichier. Trois choses changent, et aucune n'est la règle :

       · l'archive et la chaîne de la CIBLE sont demandées EN MÊME TEMPS (elles ne dépendent pas l'une de l'autre) ;
       · la chaîne d'un dossier passe par `chaineDuDossierMemo`, la mémoire courte (60 s) que l'aperçu utilise
         déjà — la liste qui vient de s'afficher a souvent payé cette chaîne une seconde plus tôt ;
       · les métadonnées des éléments sont lues en parallèle, et la chaîne de leur PARENT une seule fois par
         parent distinct : cinq fichiers d'un même dossier partagent une seule remontée.

     🔴🔴 CE QUI NE CHANGE PAS : le verdict est prononcé, POUR CHAQUE ÉLÉMENT, AVANT le moindre `files.update`, à
     partir des chaînes réelles lues chez Google. La mémoire ne dispense d'aucune vérification — elle évite de
     REDEMANDER à Google une réponse qu'il vient de donner, et elle ne dure qu'une minute, justement pour qu'un
     rangement fait entre-temps ne puisse pas être ignoré. Un test le prouve : cible interdite DÉJÀ en cache,
     refus quand même. ═══════════════════════════════════════════════════════════════════════════════════════ */
  const [proteges, chaineCible] = await Promise.all([
    idsProteges(jeton.compteGoogle, jeton.jeton),
    chaineDuDossierMemo(jeton.compteGoogle, jeton.jeton, cible, deps),
  ]);
  if (proteges === null) {
    return json({
      etat: 'refus',
      message: 'Refusé : impossible de situer « Documents clients scannés » en ce moment. Par précaution, aucun '
        + 'déplacement n’est fait tant que l’archive n’a pas été localisée.',
    }, 409);
  }
  const nomCible = chaineCible[0]?.nom ?? 'ce dossier';

  // ── ② LES MÉTADONNÉES DE CHAQUE ÉLÉMENT, en parallèle. Elles donnent le nom, le type ET le parent. ──────────
  const metas = await mapConcurrenceBornee(elements, MOUVEMENTS_SIMULTANES, async (e) => ({
    id: e.id.trim(),
    nomAnnonce: e.nom ?? e.id,
    meta: await metadonneesMemo(jeton.compteGoogle, jeton.jeton, e.id.trim(), deps),
  }));

  /* ── ③ LA CHAÎNE DE CHAQUE PARENT DISTINCT, une seule fois ─────────────────────────────────────────────────
     ⚠️ ON REMONTE DEPUIS LE PARENT, jamais depuis l'élément : la chaîne d'un fichier commence par lui-même et ne
     se partage avec personne. Celle de son dossier sert à tous ses voisins — c'est tout le gain. */
  const parents = [...new Set(metas.map((m) => (m.meta.ok ? m.meta.valeur.parents[0] ?? null : null))
    .filter((x): x is string => x !== null))];
  const chaines = new Map<string, Maillon[]>();
  await mapConcurrenceBornee(parents, MOUVEMENTS_SIMULTANES, async (parentId) => {
    chaines.set(parentId, await chaineDuDossierMemo(jeton.compteGoogle, jeton.jeton, parentId, deps));
  });
  chrono.top('securite');

  /* ── ④ LE VERDICT, ÉLÉMENT PAR ÉLÉMENT. PUR, donc gratuit — et c'est bien pour cela qu'il n'y a aucune raison
        de l'économiser. Rien n'est écrit tant que tous les verdicts ne sont pas rendus. */
  type Prete = { id: string; nom: string; estDossier: boolean; parentOrigine: string };
  const pretes: Prete[] = [];
  const refuses: { id: string; nom: string; motif: string }[] = [];

  for (const m of metas) {
    if (!m.meta.ok) {
      refuses.push({ id: m.id, nom: m.nomAnnonce, motif: 'Cet élément n’a pas pu être lu dans le Drive.' });
      continue;
    }
    const nom = m.meta.valeur.nom;
    const parentOrigine = m.meta.valeur.parents[0] ?? null;
    if (parentOrigine === null) {
      refuses.push({ id: m.id, nom, motif: 'Cet élément est à la racine d’un Drive : il ne se déplace pas ici.' });
      continue;
    }
    const estDossier = m.meta.valeur.typeMime === 'application/vnd.google-apps.folder';
    const index = reunir(
      [{ id: m.id, nom, parentId: parentOrigine }],
      chaines.get(parentOrigine) ?? [],
      chaineCible,
      proteges.maillons,
    );
    const v = peutMouvoir(
      { sourceId: m.id, cibleId: cible, sourceEstDossier: estDossier, parentActuel: parentOrigine, sorte: action },
      { index, proteges: proteges.proteges, protegesEtAncetres: proteges.protegesEtAncetres },
    );
    if (!v.ok) { refuses.push({ id: m.id, nom, motif: v.motif }); continue; }
    pretes.push({ id: m.id, nom, estDossier, parentOrigine });
  }

  /* ── ⑤ LES ÉCRITURES, EN PARALLÈLE ─────────────────────────────────────────────────────────────────────────
     ⚠️ LE JOURNAL RESTE APRÈS GOOGLE, POUR CHAQUE ÉLÉMENT : l'ordre « on déplace, PUIS on inscrit » est
     l'invariant du lot DRIVE-DEPLACER, et il ne se négocie pas. Ce qui change est qu'il ne bloque plus les
     AUTRES éléments : il s'exécute pendant que leurs appels Google sont en vol. Mesuré à 2 ms par ligne, il
     n'est plus sur le chemin critique de personne. */
  const issues = await mapConcurrenceBornee(pretes, MOUVEMENTS_SIMULTANES, async (p) => {
    if (action === 'deplacer') {
      const r = await deplacerVers(jeton.jeton, { id: p.id, parentOrigine: p.parentOrigine, parentCible: cible }, deps);
      if (!r.ok) return { ok: false as const, id: p.id, nom: p.nom, motif: r.motif };
      const mouvementId = await inscrireMouvement({
        action: 'deplacer', driveId: p.id, nom: p.nom, estDossier: p.estDossier,
        parentOrigine: p.parentOrigine, parentCible: cible, copieDriveId: null,
        auteurId: auteur.id, auteurLibelle: auteur.libelle, compteGoogle: jeton.compteGoogle,
      });
      return { ok: true as const, id: p.id, nom: p.nom, mouvementId, copieId: null };
    }
    const copie = p.estDossier
      ? await copierDossier(jeton.jeton, { id: p.id, nom: p.nom, parentCible: cible })
      : await copierFichier(jeton.jeton, { id: p.id, parentCible: cible }, deps);
    if (!copie.ok) return { ok: false as const, id: p.id, nom: p.nom, motif: copie.motif };
    const mouvementId = await inscrireMouvement({
      action: 'copier', driveId: p.id, nom: p.nom, estDossier: p.estDossier,
      parentOrigine: p.parentOrigine, parentCible: cible, copieDriveId: copie.valeur.id,
      auteurId: auteur.id, auteurLibelle: auteur.libelle, compteGoogle: jeton.compteGoogle,
    });
    return { ok: true as const, id: p.id, nom: p.nom, mouvementId, copieId: copie.valeur.id };
  });
  chrono.top('drive');

  const faits: { id: string; nom: string; mouvementId: number | null; copieId: string | null }[] = [];
  for (const i of issues) {
    if (i.ok) faits.push({ id: i.id, nom: i.nom, mouvementId: i.mouvementId, copieId: i.copieId });
    else refuses.push({ id: i.id, nom: i.nom, motif: i.motif });
  }

  return json({
    etat: 'ok',
    action,
    cible,
    nomCible,
    faits,
    refuses,
    mouvements: faits.map((f) => f.mouvementId).filter((x): x is number => x !== null),
    temps: { ...chrono.phases, total: chrono.total, appelsGoogle: g.n() },
  });
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA COPIE RÉCURSIVE D'UN DOSSIER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * 🔴 ON COMPTE AVANT DE COPIER. La borne (`COPIE_RECURSIVE_MAX`) est vérifiée sur le nombre RÉEL d'éléments, lu
 * chez Google — pas sur ce que l'écran annonce. Et l'on refuse EN BLOC : copier « les deux cents premiers »
 * donnerait un dossier incomplet dont personne ne saurait qu'il l'est.
 */
async function copierDossier(
  jeton: string, o: { id: string; nom: string; parentCible: string },
): Promise<{ ok: true; valeur: { id: string; nom: string } } | { ok: false; motif: string }> {
  const compte = await compterRecursif(jeton, o.id);
  if (compte === null) return { ok: false, motif: 'Le contenu de ce dossier n’a pas pu être lu en entier.' };
  const v = verdictCopieRecursive(compte, o.nom);
  if (!v.ok) return { ok: false, motif: v.motif };

  const racine = await creerDossierPourCopie(jeton, { nom: o.nom, parentCible: o.parentCible }, { fetch });
  if (!racine.ok) return { ok: false, motif: racine.motif };
  const erreur = await copierContenu(jeton, o.id, racine.valeur.id);
  if (erreur !== null) return { ok: false, motif: erreur };
  return { ok: true, valeur: { id: racine.valeur.id, nom: racine.valeur.nom } };
}

/**
 * ══ 🔴 COMPTER AVANT DE DEMANDER, POUR QUE LA CONFIRMATION ANNONCE UN VRAI NOMBRE ═══════════════════════════════
 *
 * Arno : « copie récursive, précédée d'une confirmation qui annonce le nombre d'éléments, avec une limite
 * raisonnable ». Ce nombre ne peut venir que de Google : l'écran ne connaît que le premier niveau, et encore, que
 * s'il l'a déplié.
 *
 * 🔴 CETTE ACTION N'ÉCRIT RIEN. Elle lit des métadonnées, ce que le navigateur a déjà le droit de faire partout —
 * y compris sous « Documents clients scannés », qui reste parcourable en métadonnées. Elle ne dit donc RIEN du
 * droit de copier : c'est `mouvoir` qui prononcera le verdict, et lui seul. Annoncer un nombre n'autorise pas.
 */
async function compter(corps: Demande, jeton: Jeton): Promise<Response> {
  const dossiers = (corps.elements ?? []).filter((e) => typeof e?.id === 'string' && e.id.trim() !== '');
  if (dossiers.length === 0) return json({ etat: 'refus', message: 'Rien à compter.' }, 422);
  let total = 0;
  for (const d of dossiers) {
    const n = await compterRecursif(jeton.jeton, d.id.trim());
    if (n === null) {
      return json({
        etat: 'ok', possible: false,
        motif: `Le contenu de « ${d.nom ?? 'ce dossier'} » n’a pas pu être lu en entier : la copie est refusée `
          + 'tant qu’on ne sait pas ce qu’elle emporterait.',
      });
    }
    total += n;
  }
  const nom = dossiers.length === 1 ? (dossiers[0].nom ?? 'ce dossier') : `${dossiers.length} dossiers`;
  const v = verdictCopieRecursive(total, nom);
  return v.ok
    ? json({ etat: 'ok', possible: true, elements: v.elements, phrase: v.phrase })
    : json({ etat: 'ok', possible: false, motif: v.motif });
}

/** Combien d'éléments ce dossier contient-il, en tout ? `null` = on n'a pas pu tout lire, donc on refuse. */
async function compterRecursif(jeton: string, id: string, profondeur = 0): Promise<number | null> {
  if (profondeur > 12) return null;
  const liste = await listerContenu(jeton, { parentId: id }, { fetch });
  if (!liste.ok || liste.valeur.tronque) return null;
  let n = liste.valeur.fichiers.length;
  for (const f of liste.valeur.fichiers) {
    if (!f.dossier) continue;
    const sous = await compterRecursif(jeton, f.id, profondeur + 1);
    if (sous === null) return null;
    n += sous;
  }
  return n;
}

/** Copie le contenu d'un dossier dans un autre, récursivement. Rend le motif d'échec, ou `null`. */
async function copierContenu(
  jeton: string, source: string, destination: string, profondeur = 0,
): Promise<string | null> {
  if (profondeur > 12) return 'Ce dossier est trop profond pour être copié d’un seul geste.';
  const liste = await listerContenu(jeton, { parentId: source }, { fetch });
  if (!liste.ok) return liste.motif;
  for (const f of liste.valeur.fichiers) {
    if (f.dossier) {
      const sous = await creerDossierPourCopie(jeton, { nom: f.nom, parentCible: destination }, { fetch });
      if (!sous.ok) return sous.motif;
      const e = await copierContenu(jeton, f.id, sous.valeur.id, profondeur + 1);
      if (e !== null) return e;
      continue;
    }
    const c = await copierFichier(jeton, { id: f.id, parentCible: destination }, { fetch });
    if (!c.ok) return c.motif;
  }
  return null;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ANNULER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * 🔴 « ANNULER » RELIT LE PARENT D'ORIGINE DANS LE JOURNAL, jamais dans ce que le navigateur affirme. Et il
 * repasse par le MÊME verdict : remettre un élément à sa place est un déplacement comme un autre, et il n'y a
 * aucune raison de lui accorder un régime de faveur.
 *
 * ⚠️ UNE COPIE NE S'ANNULE PAS : `mouvementsAnnulables` n'en rend aucune. Annuler une copie voudrait dire la
 * SUPPRIMER, et l'application ne supprime rien.
 */
async function annuler(corps: Demande, jeton: Jeton, auteur: Auteur): Promise<Response> {
  const ids = (corps.mouvements ?? []).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return json({ etat: 'refus', message: 'Rien à annuler.' }, 422);

  const lignes = await mouvementsAnnulables(ids);
  if (lignes.length === 0) return json({ etat: 'refus', message: 'Ces déplacements ne sont plus annulables.' }, 409);

  const proteges = await idsProteges(jeton.compteGoogle, jeton.jeton);
  if (proteges === null) {
    return json({ etat: 'refus', message: 'Refusé : impossible de situer l’archive en ce moment.' }, 409);
  }

  const remis: string[] = [];
  const refuses: { id: string; nom: string; motif: string }[] = [];
  for (const l of lignes) {
    const chaineSource = await chaineParents(jeton.jeton, l.driveId, { fetch });
    const chaineCible = await chaineParents(jeton.jeton, l.parentOrigine, { fetch });
    const meta = chaineSource[0];
    if (meta === undefined || meta.parentId === null) {
      refuses.push({ id: l.driveId, nom: l.nom, motif: 'Cet élément n’a pas pu être relu dans le Drive.' });
      continue;
    }
    const infos = await lireMetadonnees(jeton.jeton, l.driveId, { fetch });
    const estDossier = infos.ok && infos.valeur.typeMime === 'application/vnd.google-apps.folder';
    const v = peutMouvoir(
      {
        sourceId: l.driveId, cibleId: l.parentOrigine, sourceEstDossier: estDossier,
        parentActuel: meta.parentId, sorte: 'deplacer',
      },
      {
        index: reunir(chaineSource, chaineCible, proteges.maillons),
        proteges: proteges.proteges, protegesEtAncetres: proteges.protegesEtAncetres,
      },
    );
    if (!v.ok) { refuses.push({ id: l.driveId, nom: l.nom, motif: v.motif }); continue; }

    const r = await deplacerVers(
      jeton.jeton, { id: l.driveId, parentOrigine: meta.parentId, parentCible: l.parentOrigine }, { fetch });
    if (!r.ok) { refuses.push({ id: l.driveId, nom: l.nom, motif: r.motif }); continue; }

    // 🔴 LE RETOUR EST UN GESTE, donc il a SA ligne. Et l'aller est daté annulé — sans être effacé.
    await inscrireMouvement({
      action: 'deplacer', driveId: l.driveId, nom: l.nom, estDossier,
      parentOrigine: meta.parentId, parentCible: l.parentOrigine, copieDriveId: null,
      auteurId: auteur.id, auteurLibelle: `${auteur.libelle} (annulation)`, compteGoogle: jeton.compteGoogle,
    });
    await marquerAnnule(l.id);
    remis.push(l.driveId);
  }

  return json({ etat: 'ok', action: 'annuler', remis, refuses });
}
