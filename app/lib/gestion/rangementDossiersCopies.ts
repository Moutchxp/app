/**
 * ══ 🔴🔴 RANGEMENT DES DOSSIERS COPIÉS, REPOINTAGE DES FICHES, CORBEILLE DE L'ANCIENNE ARBORESCENCE (Arno, 19/10/2026) ═══
 *
 * Les décisions du rapprochement (écran « Rapprochement des dossiers clients ») sont exécutées par quatre scripts qu'Arno
 * lance lui-même (A déplacements Drive, B repointage en base, C vérification, D corbeille). Ce module porte leurs VERROUS,
 * PURS et éprouvés sans réseau ; les scripts (non versionnés, `.captures/rangement/`) ne font que lire, demander le
 * verdict, puis agir. Un refus arrête tout.
 *
 * 🔴 « Documents clients scannés » : aucune écriture, d'aucune sorte. Les verrous ci-dessous refusent tout élément dont la
 * chaîne de parents passe par lui (identifiant OU nom protégé), et `refusRequeteRangement` ne laisse partir que trois
 * formes de requête : un déplacement (PATCH addParents/removeParents), la création d'« Actifs » / « Inactifs » sous la
 * racine, la corbeille (PATCH {trashed: true}). Jamais DELETE, jamais emptyTrash, jamais de copie, jamais de partage.
 *
 * 🔴 POINT 4 : une fiche SANS dossier attitré ouvre la RACINE « Base de données locative », par un repli d'AFFICHAGE.
 * L'identifiant de la racine (ni celui d'« Actifs » / « Inactifs ») n'est JAMAIS enregistré comme dossier d'une fiche :
 * la future automatisation renomme et déplace les dossiers des fiches par identifiant, elle ne doit pas pouvoir toucher
 * la racine (`motifRefusDossierAttitre`).
 */
import { porteLeNomProtege, RACINE_NOM } from './driveGardeFou';

export const NOM_ACTIFS = 'Actifs';
export const NOM_INACTIFS = 'Inactifs';
export type Conteneur = typeof NOM_ACTIFS | typeof NOM_INACTIFS;
export const CONTENEURS: readonly Conteneur[] = [NOM_ACTIFS, NOM_INACTIFS];

/** L'étiquette que la copie a posée sur chaque élément copié : l'identifiant de son original. */
export const ETIQUETTE_COPIE = 'svav_source_id';

const MIME_DOSSIER = 'application/vnd.google-apps.folder';
const DRIVE = 'https://drive.google.com/drive/folders/';
const API = 'https://www.googleapis.com/drive/v3/';

export type VerdictRangement = { ok: true; deja: boolean } | { ok: false; motif: string };
const refus = (motif: string): VerdictRangement => ({ ok: false, motif });

/** Un identifiant Drive plausible (et sans rien qui puisse sortir d'une chaîne SQL). PUR. */
export const estIdDrive = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{10,128}$/.test(id);

// ── POINT 4 — LE BOUTON « DOSSIER » D'UNE FICHE PROPRIÉTAIRE ─────────────────────────────────────────────────────────

export const LIBELLE_DOSSIER_ATTITRE = 'Dossier Drive ↗';
export const LIBELLE_SANS_DOSSIER_ATTITRE = `${RACINE_NOM} (aucun dossier attitré)`;

/**
 * Le bouton « dossier » d'une fiche propriétaire : son dossier attitré (`drive_dossier_id`) ; à défaut, la RACINE, avec un
 * libellé qui dit qu'il n'y a pas de dossier attitré ; `null` si la racine elle-même est inconnue. Un dossier attitré
 * interdit (la racine, un conteneur) compte comme absent : on ne l'ouvre pas comme s'il était le dossier de la personne. PUR.
 */
export function boutonDossierProprietaire(
  attitre: string | null, racineId: string | null, interdits: ReadonlySet<string> = new Set(),
): { href: string; libelle: string; attitre: boolean } | null {
  const proteges = new Set(interdits);
  if (racineId !== null) proteges.add(racineId);
  if (attitre !== null && motifRefusDossierAttitre(attitre, proteges) === null) {
    return { href: `${DRIVE}${encodeURIComponent(attitre)}`, libelle: LIBELLE_DOSSIER_ATTITRE, attitre: true };
  }
  if (racineId === null || !estIdDrive(racineId)) return null;
  return { href: `${DRIVE}${encodeURIComponent(racineId)}`, libelle: LIBELLE_SANS_DOSSIER_ATTITRE, attitre: false };
}

/** Peut-on enregistrer cet identifiant comme dossier attitré d'une fiche ? `null` = oui ; sinon le motif. PUR. */
export function motifRefusDossierAttitre(id: string | null, interdits: ReadonlySet<string>): string | null {
  if (!estIdDrive(id)) return 'identifiant de dossier invalide';
  if (interdits.has(id)) return `le dossier ${id} est la racine « ${RACINE_NOM} » ou un conteneur (Actifs, Inactifs, copie) : jamais le dossier d’une fiche`;
  return null;
}

// ── POINT 7 — LA RAISON « ANCIEN LOCATAIRE X » / « LOCATAIRE ACTUEL X » ─────────────────────────────────────────────

/** Le nom tel que le calcul le cite : le premier mot, en capitales. PUR. */
export const nomCiteDuLocataire = (nom: string): string => (nom.trim().split(/\s+/)[0] ?? '').toUpperCase();

/**
 * « même nom + locataire X connu » → « même nom + locataire actuel X » ou « même nom + ancien locataire X », d'après les
 * occupations des lots de la fiche proposée. Un locataire de ce nom encore en place (règle unique : pas de date de
 * sortie) l'emporte. Aucun locataire de ce nom retrouvé : la raison reste telle quelle. PUR.
 */
export function preciserRaisonLocataire(raison: string, locataires: readonly { nom: string; enPlace: boolean }[]): string {
  return raison.replace(/locataire (\S+) connu/g, (tout, cite: string) => {
    const memes = locataires.filter((l) => nomCiteDuLocataire(l.nom) === cite);
    if (memes.length === 0) return tout;
    return memes.some((l) => l.enPlace) ? `locataire actuel ${cite}` : `ancien locataire ${cite}`;
  });
}

// ── VERROU DES REQUÊTES DRIVE DES SCRIPTS ────────────────────────────────────────────────────────────────────────────

export type ModeRangement = 'lecture' | 'deplacer' | 'corbeille';

/**
 * La requête Drive est-elle permise dans ce mode ? `null` = oui ; sinon le motif. PUR.
 *   · toujours : GET de métadonnées (jamais `alt=media`) ;
 *   · « deplacer » : PATCH files/<id> avec UN addParents (Actifs ou Inactifs) et UN removeParents, corps vide ; POST files
 *     qui crée un DOSSIER « Actifs » ou « Inactifs » dont le seul parent est la racine ;
 *   · « corbeille » : PATCH files/<id> au corps EXACTEMENT {"trashed":true}, sans changement de parent.
 * Tout le reste est refusé : DELETE, emptyTrash, copy, permissions, untrash, renommage, étiquette, upload…
 */
export function refusRequeteRangement(
  url: string, init: { method?: string; body?: unknown } | undefined, mode: ModeRangement,
  ctx: { racineId: string; destinations: ReadonlySet<string> },
): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return 'adresse illisible'; }
  if (!url.startsWith(API)) return `hors de l’API Drive v3 : ${u.origin}${u.pathname}`;
  const methode = (init?.method ?? 'GET').toUpperCase();
  const chemin = u.pathname.replace(/^\/drive\/v3\//, '');
  if (methode === 'GET') {
    if (u.searchParams.get('alt') === 'media') return 'lecture de contenu (alt=media) refusée : métadonnées seulement';
    return null;
  }
  if (mode === 'lecture') return `${methode} refusé : ce script ne fait que lire`;
  if (/emptyTrash|\/copy$|permissions|revisions|comments|watch|upload/i.test(chemin) || u.pathname.startsWith('/upload/')) return `${chemin} refusé`;
  const corps = typeof init?.body === 'string' ? init.body : init?.body === undefined ? '' : null;
  if (corps === null) return 'corps de requête illisible';
  const fichier = /^files\/([A-Za-z0-9_-]{10,128})$/.exec(chemin);
  if (mode === 'deplacer') {
    if (methode === 'PATCH' && fichier !== null) {
      const ajout = u.searchParams.get('addParents') ?? '';
      const retrait = u.searchParams.get('removeParents') ?? '';
      if (!ctx.destinations.has(ajout)) return `déplacement refusé : la destination ${ajout || '(aucune)'} n’est ni « Actifs » ni « Inactifs »`;
      if (!estIdDrive(retrait) || retrait.includes(',')) return 'déplacement refusé : un seul parent à retirer';
      if (corps !== '' && corps !== '{}') return 'déplacement refusé : aucun autre changement (nom, étiquette, corbeille) n’est permis';
      return null;
    }
    if (methode === 'POST' && chemin === 'files') {
      let o: Record<string, unknown>;
      try { o = JSON.parse(corps) as Record<string, unknown>; } catch { return 'création refusée : corps illisible'; }
      const cles = Object.keys(o).sort().join(',');
      if (cles !== 'mimeType,name,parents') return `création refusée : champs inattendus (${cles})`;
      if (o.mimeType !== MIME_DOSSIER) return 'création refusée : seul un dossier se crée';
      if (!CONTENEURS.includes(o.name as Conteneur)) return `création refusée : seul « ${NOM_ACTIFS} » ou « ${NOM_INACTIFS} » se crée`;
      if (!Array.isArray(o.parents) || o.parents.length !== 1 || o.parents[0] !== ctx.racineId) return `création refusée : le parent doit être la racine « ${RACINE_NOM} »`;
      return null;
    }
    return `${methode} ${chemin} refusé en mode déplacement`;
  }
  // corbeille
  if (methode === 'PATCH' && fichier !== null) {
    if (u.searchParams.has('addParents') || u.searchParams.has('removeParents')) return 'corbeille refusée : aucun déplacement';
    if (corps.replace(/\s+/g, '') !== '{"trashed":true}') return 'corbeille refusée : le corps doit être exactement {"trashed": true}';
    return null;
  }
  return `${methode} ${chemin} refusé en mode corbeille`;
}

// ── ÉTAPE A — LE DÉPLACEMENT D'UN DOSSIER COPIÉ ──────────────────────────────────────────────────────────────────────

export interface ElementLu {
  id: string; name: string; mimeType: string; parents?: readonly string[]; trashed?: boolean;
  appProperties?: Readonly<Record<string, string>>;
}
export interface Maillon { id: string; nom: string }

export interface ContexteRangement {
  racineId: string;
  scannesId: string;
  arriveeId: string;
  racineCopieId: string;
  /** Les conteneurs « Actifs » / « Inactifs », sous la racine. */
  destinations: Readonly<Record<Conteneur, string>>;
}

/** Ce que ni un déplacement ni une corbeille ne vise jamais. PUR. */
export function idsProteges(ctx: ContexteRangement): Set<string> {
  return new Set([ctx.racineId, ctx.scannesId, ctx.arriveeId, ctx.racineCopieId, ...Object.values(ctx.destinations)].filter((x) => x !== ''));
}

export function cheminInterdit(chaine: readonly Maillon[], ctx: ContexteRangement): string | null {
  for (const m of chaine) {
    if (m.id === ctx.scannesId || porteLeNomProtege(m.nom)) return `il est sous « ${m.nom} », qui ne perd ni ne reçoit jamais rien`;
    if (m.id === ctx.arriveeId) return `il est sous « ${m.nom} »`;
  }
  if (!chaine.some((m) => m.id === ctx.racineId)) return `il n’est pas sous « ${RACINE_NOM} »`;
  return null;
}

/**
 * LE VERDICT SUR LE DÉPLACEMENT D'UN DOSSIER COPIÉ vers « Actifs » ou « Inactifs » (point 3). PUR. Tout doit être vrai :
 *   ① c'est un dossier, pas à la corbeille, qui porte l'étiquette de copie ET l'original attendu par le plan ;
 *   ② sa chaîne, RELUE CHEZ GOOGLE, est sous la racine, hors de « Documents clients scannés » et de « 00 Arrivée des mails » ;
 *   ③ son parent est la branche copiée attendue (sous le dossier d'import) → à déplacer ; ou déjà la destination → reprise ;
 *   ④ la destination est bien le conteneur attendu, et ce n'est rien de protégé.
 */
export function verifierDeplacementCopie(
  d: ElementLu, chaine: readonly Maillon[],
  attendu: { copieDossierId: string; sourceId: string; brancheCopieId: string; vers: Conteneur },
  ctx: ContexteRangement,
): VerdictRangement {
  if (d.id !== attendu.copieDossierId) return refus(`${d.id} n’est pas le dossier du plan (${attendu.copieDossierId})`);
  if (idsProteges(ctx).has(d.id)) return refus(`${d.id} est protégé (racine, conteneur, dossier d’import, original)`);
  if (d.mimeType !== MIME_DOSSIER) return refus(`${d.id} n’est pas un dossier`);
  if (d.trashed === true) return refus(`${d.id} est à la corbeille`);
  const source = d.appProperties?.[ETIQUETTE_COPIE];
  if (source === undefined || source === '') return refus(`${d.id} ne porte pas l’étiquette ${ETIQUETTE_COPIE} : ce n’est pas une copie`);
  if (source !== attendu.sourceId) return refus(`${d.id} est la copie de ${source}, le plan attendait ${attendu.sourceId}`);
  const parents = d.parents ?? [];
  if (parents.length !== 1) return refus(`${d.id} a ${parents.length} parent(s) : un seul attendu`);
  if (chaine.length === 0 || chaine[0].id !== parents[0]) return refus(`${d.id} : chaîne des parents incohérente — ne pas savoir vaut refus`);
  const interdit = cheminInterdit(chaine, ctx);
  if (interdit !== null) return refus(`${d.id} : ${interdit}`);
  const destination = ctx.destinations[attendu.vers];
  if (!estIdDrive(destination)) return refus(`le conteneur « ${attendu.vers} » est inconnu`);
  if (parents[0] === destination) return { ok: true, deja: true };
  if (parents[0] !== attendu.brancheCopieId) return refus(`${d.id} n’est ni dans sa branche copiée ni dans « ${attendu.vers} » : quelqu’un l’a déplacé`);
  if (!chaine.some((m) => m.id === ctx.racineCopieId)) return refus(`${d.id} n’est pas sous le dossier d’import`);
  return { ok: true, deja: false };
}

/** Le conteneur d'un dossier copié, d'après sa branche (décision 4 du 18/10). PUR. */
export const conteneurDeLaBranche = (branche: string | null): Conteneur => (branche === '1 actifs' ? NOM_ACTIFS : NOM_INACTIFS);

// ── ÉTAPE D — LA CORBEILLE D'UN ANCIEN DOSSIER (ou d'un dossier d'essai) ────────────────────────────────────────────

export const estDossierDEssai = (nom: string): boolean => /^_TEST CLAUDE\b/.test(nom) || nom.trim() === '_TEST COPIE';

/**
 * LE VERDICT SUR LA CORBEILLE (point 6). PUR. Tout doit être vrai :
 *   ① l'identifiant est dans la liste nominative écrite avant exécution, avec sa sorte (« ancien » ou « essai ») ;
 *   ② c'est un dossier, sans étiquette de copie ; son sous-arbre ne contient AUCUNE copie OFFICIELLE (mémorisée par la copie
 *      de « Documents clients scannés »), et, pour un ancien dossier, aucune copie du tout (un dossier d'essai, lui, peut
 *      contenir les copies de l'essai du 18/10, qui ne sont la copie officielle de rien) ;
 *   ③ sa chaîne relue est sous la racine, hors de « Documents clients scannés », de « 00 Arrivée des mails », du dossier
 *      d'import et des conteneurs ; ce n'est rien de protégé ;
 *   ④ AUCUNE fiche (serveur ou recette) ne le cite encore comme dossier ;
 *   ⑤ « ancien » : un dossier propriétaire de l'ancienne arborescence (sorte mémorisée `proprietaire`) ; « essai » : un
 *      « _TEST CLAUDE … » ou « _TEST COPIE » posé à même la racine ;
 *   ⑥ 🔴 (Arno, 19/10/2026) JAMAIS un dossier qui contient au moins UN FICHIER, à n'importe quelle profondeur — ancien comme
 *      essai (un raccourci n'est pas un fichier) ; JAMAIS un dossier dont le sous-arbre (lui compris) a été créé ou modifié
 *      APRÈS le calcul du plan : quelqu'un y a travaillé depuis, la liste ne le savait pas ;
 *   ⑦ déjà à la corbeille → reprise, rien à faire.
 */
export function verifierCorbeilleDossier(
  d: ElementLu, chaine: readonly Maillon[],
  sousArbre: { fichiers: number; copies: number; copiesOfficielles: number; dernierChangement: string | null },
  ctx: ContexteRangement & {
    liste: ReadonlyMap<string, 'ancien' | 'essai'>;
    citesParUneFiche: ReadonlySet<string>;
    sortesMemorisees: ReadonlyMap<string, string>;
    /** L'instant du calcul du plan (ISO) : tout changement plus récent dans le sous-arbre vaut refus. */
    planCalculeLe: string;
  },
): VerdictRangement {
  const sorte = ctx.liste.get(d.id);
  if (sorte === undefined) return refus(`${d.id} ne figure pas dans la liste nominative`);
  if (d.mimeType !== MIME_DOSSIER) return refus(`${d.id} n’est pas un dossier`);
  if (idsProteges(ctx).has(d.id)) return refus(`${d.id} est protégé`);
  if (d.appProperties?.[ETIQUETTE_COPIE] !== undefined) return refus(`${d.id} est un dossier COPIÉ : jamais à la corbeille`);
  if (ctx.citesParUneFiche.has(d.id)) return refus(`${d.id} est encore le dossier d’une fiche`);
  if (d.trashed === true) return { ok: true, deja: true };
  if (sousArbre.fichiers > 0) return refus(`${d.id} contient ${sousArbre.fichiers} fichier(s) : rien ne part à la corbeille avec un fichier`);
  if (!Number.isFinite(Date.parse(ctx.planCalculeLe))) return refus('instant du calcul du plan inconnu — ne pas savoir vaut refus');
  if (sousArbre.dernierChangement !== null && Date.parse(sousArbre.dernierChangement) > Date.parse(ctx.planCalculeLe)) {
    return refus(`${d.id} a été modifié le ${sousArbre.dernierChangement}, après le calcul du plan (${ctx.planCalculeLe})`);
  }
  if (sousArbre.copiesOfficielles > 0) return refus(`${d.id} contient ${sousArbre.copiesOfficielles} copie(s) officielle(s) de « Documents clients scannés »`);
  if (sorte === 'ancien' && sousArbre.copies > 0) return refus(`${d.id} contient ${sousArbre.copies} élément(s) copié(s)`);
  const parents = d.parents ?? [];
  if (parents.length !== 1 || chaine.length === 0 || chaine[0].id !== parents[0]) return refus(`${d.id} : chaîne des parents incohérente`);
  const interdit = cheminInterdit(chaine, ctx);
  if (interdit !== null) return refus(`${d.id} : ${interdit}`);
  for (const m of chaine) if (m.id === ctx.racineCopieId || Object.values(ctx.destinations).includes(m.id)) return refus(`${d.id} est sous « ${m.nom} »`);
  if (sorte === 'ancien') {
    if (ctx.sortesMemorisees.get(d.id) !== 'proprietaire') return refus(`${d.id} n’est pas un dossier propriétaire de l’ancienne arborescence`);
  } else {
    if (!estDossierDEssai(d.name)) return refus(`« ${d.name} » n’est pas un dossier d’essai`);
    if (parents[0] !== ctx.racineId) return refus(`« ${d.name} » n’est pas à même la racine`);
  }
  return { ok: true, deja: false };
}

// ── ÉTAPE B — LE REPOINTAGE EN BASE, EN UNE TRANSACTION ─────────────────────────────────────────────────────────────

export interface LigneRepointage { id: number; wippimmo: string; ancien: string | null; nouveau: string }

/**
 * Le script psql du repointage (point 1), pour le serveur comme pour la recette. PUR. Il refuse de s'écrire si une ligne
 * est malformée, en double, ou vise un dossier interdit. Joué, il :
 *   · s'arrête si la table des fiches porte un déclencheur (rien d'autre ne doit bouger) ;
 *   · vérifie CHAQUE fiche (même identifiant, même n° WIPPIMMO, dossier actuel = celui vu au calcul, ou déjà le nouveau
 *     en cas de reprise ; nouveau dossier pris par aucune autre fiche) : une seule discordance annule tout ;
 *   · essai (`reel` faux) : transaction READ ONLY, aucune écriture, il compte ;
 *   · réel : verrouille les fiches, écrit `drive_dossier_id` et RIEN d'autre, recompte, puis COMMIT.
 */
export function sqlRepointage(lignes: readonly LigneRepointage[], interdits: ReadonlySet<string>, reel: boolean): string {
  if (lignes.length === 0) throw new Error('aucune fiche à repointer');
  const vus = new Set<number>(); const nouveaux = new Set<string>();
  for (const l of lignes) {
    if (!Number.isSafeInteger(l.id) || l.id <= 0) throw new Error(`identifiant de fiche invalide : ${l.id}`);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(l.wippimmo)) throw new Error(`n° WIPPIMMO invalide pour la fiche ${l.id}`);
    if (l.ancien !== null && !estIdDrive(l.ancien)) throw new Error(`ancien dossier invalide pour la fiche ${l.id}`);
    const refusNouveau = motifRefusDossierAttitre(l.nouveau, interdits);
    if (refusNouveau !== null) throw new Error(`fiche ${l.id} : ${refusNouveau}`);
    if (vus.has(l.id)) throw new Error(`fiche ${l.id} en double`);
    if (nouveaux.has(l.nouveau)) throw new Error(`dossier ${l.nouveau} attribué à deux fiches`);
    vus.add(l.id); nouveaux.add(l.nouveau);
  }
  const valeurs = lignes.map((l) => `(${l.id}::bigint, '${l.wippimmo}'::text, ${l.ancien === null ? 'NULL' : `'${l.ancien}'`}::text, '${l.nouveau}'::text)`).join(',\n  ');
  const rp = `rp(id, wippimmo, ancien, nouveau) AS (VALUES\n  ${valeurs})`;
  const ids = lignes.map((l) => l.id).join(',');
  const arret = (m: string) => `DO $x$ BEGIN RAISE EXCEPTION '${m.replace(/'/g, "''")}'; END $x$;`;
  return `-- REPOINTAGE DES FICHES (point 1, Arno 19/10/2026) — ${reel ? 'RÉEL' : 'ESSAI À BLANC (READ ONLY)'} — ${lignes.length} fiche(s)
\\set ON_ERROR_STOP 1
\\pset footer off
${reel ? 'BEGIN;' : 'BEGIN TRANSACTION READ ONLY;'}
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SELECT count(*) AS declencheurs FROM pg_trigger WHERE tgrelid = 'gestion_annuaire_proprietaire'::regclass AND NOT tgisinternal \\gset
SELECT (:declencheurs > 0) AS avec_declencheur \\gset
\\if :avec_declencheur
  \\echo 'ARRÊT : la table des fiches porte un déclencheur — une écriture pourrait modifier autre chose que drive_dossier_id.'
  ${arret('REPOINTAGE ANNULÉ : déclencheur présent')}
\\endif
${reel ? `SELECT id FROM gestion_annuaire_proprietaire WHERE id IN (${ids}) ORDER BY id FOR UPDATE;` : ''}
WITH ${rp},
  j AS (SELECT rp.*, p.id AS pid, p.wippimmo_id, p.drive_dossier_id FROM rp LEFT JOIN gestion_annuaire_proprietaire p ON p.id = rp.id)
SELECT count(*) AS attendues,
       count(*) FILTER (WHERE pid IS NULL) AS absentes,
       count(*) FILTER (WHERE pid IS NOT NULL AND wippimmo_id IS DISTINCT FROM wippimmo) AS wippimmo_differents,
       count(*) FILTER (WHERE pid IS NOT NULL AND drive_dossier_id IS NOT DISTINCT FROM ancien) AS a_repointer,
       count(*) FILTER (WHERE pid IS NOT NULL AND drive_dossier_id = nouveau) AS deja_faites,
       count(*) FILTER (WHERE pid IS NOT NULL AND drive_dossier_id IS DISTINCT FROM ancien AND drive_dossier_id IS DISTINCT FROM nouveau) AS dossier_change,
       (SELECT count(*) FROM gestion_annuaire_proprietaire x JOIN rp r2 ON x.drive_dossier_id = r2.nouveau AND x.id <> r2.id) AS nouveau_pris_ailleurs
  FROM j \\gset
\\echo 'fiches attendues :' :attendues '· à repointer :' :a_repointer '· déjà faites (reprise) :' :deja_faites
\\echo 'discordances — absentes :' :absentes '· n° WIPPIMMO différent :' :wippimmo_differents '· dossier actuel changé :' :dossier_change '· nouveau dossier déjà pris :' :nouveau_pris_ailleurs
SELECT (:absentes + :wippimmo_differents + :dossier_change + :nouveau_pris_ailleurs > 0) AS discordance,
       (:a_repointer + :deja_faites <> :attendues) AS compte_faux \\gset
\\if :discordance
  WITH ${rp}
  SELECT rp.id AS fiche, CASE WHEN p.id IS NULL THEN 'absente' WHEN p.wippimmo_id IS DISTINCT FROM rp.wippimmo THEN 'n° WIPPIMMO différent'
         WHEN p.drive_dossier_id IS DISTINCT FROM rp.ancien AND p.drive_dossier_id IS DISTINCT FROM rp.nouveau THEN 'dossier actuel changé depuis le calcul'
         ELSE 'nouveau dossier déjà pris par une autre fiche' END AS motif
    FROM rp LEFT JOIN gestion_annuaire_proprietaire p ON p.id = rp.id
   WHERE p.id IS NULL OR p.wippimmo_id IS DISTINCT FROM rp.wippimmo
      OR (p.drive_dossier_id IS DISTINCT FROM rp.ancien AND p.drive_dossier_id IS DISTINCT FROM rp.nouveau)
      OR EXISTS (SELECT 1 FROM gestion_annuaire_proprietaire x WHERE x.drive_dossier_id = rp.nouveau AND x.id <> rp.id)
   ORDER BY 1;
  \\echo 'ARRÊT : au moins une discordance — RIEN n’est écrit.'
  ${arret('REPOINTAGE ANNULÉ : discordance')}
\\endif
\\if :compte_faux
  ${arret('REPOINTAGE ANNULÉ : compte incohérent')}
\\endif
${reel ? `WITH ${rp},
  u AS (UPDATE gestion_annuaire_proprietaire p SET drive_dossier_id = rp.nouveau FROM rp
         WHERE p.id = rp.id AND p.wippimmo_id = rp.wippimmo AND p.drive_dossier_id IS NOT DISTINCT FROM rp.ancien
        RETURNING p.id)
SELECT count(*) AS modifiees FROM u \\gset
WITH ${rp}
SELECT count(*) AS verifiees FROM rp JOIN gestion_annuaire_proprietaire p ON p.id = rp.id AND p.wippimmo_id = rp.wippimmo AND p.drive_dossier_id = rp.nouveau \\gset
SELECT (:modifiees <> :a_repointer OR :verifiees <> :attendues) AS ecart_apres \\gset
\\if :ecart_apres
  \\echo 'ARRÊT : modifiées' :modifiees 'pour' :a_repointer 'attendues, vérifiées' :verifiees '/' :attendues
  ${arret('REPOINTAGE ANNULÉ : relecture incohérente')}
\\endif
COMMIT;
\\echo 'REPOINTAGE FAIT :' :modifiees 'fiche(s) modifiée(s),' :deja_faites 'déjà faite(s), relues' :verifiees '/' :attendues` : `ROLLBACK;
\\echo 'ESSAI À BLANC TERMINÉ : rien n’est écrit —' :a_repointer 'fiche(s) seraient repointée(s),' :deja_faites 'déjà faite(s).'`}
`;
}
