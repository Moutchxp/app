/**
 * ══ 🔴🔴 RACINE PROPRIÉTAIRE, BOUTON DRIVE DES BIENS, RATTRAPAGE DES AJOUTS TARDIFS (Arno, 19/10/2026) ════════════════════
 *
 * Suite du rangement des dossiers copiés (`rangementDossiersCopies.ts`). Constat d'Arno en production : la fiche d'un
 * propriétaire à plusieurs biens ouvrait UN de ses dossiers copiés. Règle voulue :
 *   · bouton Drive d'une fiche PROPRIÉTAIRE → toujours la RACINE du propriétaire, sous laquelle on voit tous ses biens ;
 *   · bouton Drive d'un BIEN → la racine de CE bien.
 *
 * Exécuté par des scripts qu'Arno lance lui-même (`.captures/rangement/`, non versionnés) : E (racines + déplacements),
 * F (repointage des fiches et des biens), G (vérification), R (rattrapage), D révisé (corbeille). Ce module porte leurs
 * VERROUS et leurs règles, PURS et éprouvés sans réseau. Un refus arrête tout.
 *
 * 🔴 « Documents clients scannés » : aucune écriture, d'aucune sorte. Le rattrapage COPIE depuis lui (files.copy, qui ne
 * modifie pas l'original) vers le dossier copié correspondant ; `refusRequeteRacines` ne laisse partir que ces formes-là.
 * 🔴 Jamais l'identifiant de la racine « Base de données locative », d'« Actifs » ou d'« Inactifs » comme dossier d'une
 * fiche ou d'un bien (`motifRefusDossierAttitre`) : les repli vers la racine sont des replis d'AFFICHAGE, dans le code.
 */
import { porteLeNomProtege } from './driveGardeFou';
import {
  cheminInterdit, CONTENEURS, ETIQUETTE_COPIE, estIdDrive, idsProteges, LIBELLE_SANS_DOSSIER_ATTITRE, motifRefusDossierAttitre,
  type Conteneur, type ContexteRangement, type ElementLu, type LigneRepointage, type Maillon, type VerdictRangement,
} from './rangementDossiersCopies';

/** L'étiquette posée sur une racine propriétaire à sa création : l'identifiant de la fiche. Sert à la reprise. */
export const ETIQUETTE_RACINE = 'svav_racine_proprietaire';

const MIME_DOSSIER = 'application/vnd.google-apps.folder';
const MIME_RACCOURCI = 'application/vnd.google-apps.shortcut';
const DRIVE = 'https://drive.google.com/drive/folders/';
const API = 'https://www.googleapis.com/drive/v3/';
const refus = (motif: string): VerdictRangement => ({ ok: false, motif });

// ── NOMS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Minuscules, sans accents. PUR. */
export const normaliser = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
/** Les mots (lettres et chiffres), normalisés. PUR. */
export const motsDe = (s: string): string[] => normaliser(s).split(/[^\p{L}\p{N}]+/u).filter((m) => m !== '');
/** Le nom sans ses parenthèses (« Martin-Durand (Ville A) » → « Martin-Durand »). PUR. */
export const sansParenthese = (nom: string): string => nom.replace(/\([^)]*\)?/g, ' ').replace(/\s+/g, ' ').trim();
/** Le contenu des parenthèses (« Martin-Durand (Ville A) » → « Ville A »). PUR. */
export const parenthese = (nom: string): string => [...nom.matchAll(/\(([^)]*)\)?/g)].map((m) => m[1].trim()).join(' ');

/**
 * LE NOM DE LA RACINE D'UN PROPRIÉTAIRE : la partie commune des noms de ses dossiers, sans la parenthèse ; à défaut, le nom
 * de la fiche. On part du nom du dossier PRINCIPAL et on n'en garde que les mots présents dans TOUS les autres (accents et
 * capitales ignorés). S'il les garde tous, il reste tel qu'il est écrit (« Roux - Blanc ») ; sinon, les mots gardés.
 * Un nom vide, protégé ou égal à un conteneur cède la place au nom de la fiche. PUR.
 */
export function nomRacineProprietaire(noms: readonly string[], principal: string, nomFiche: string): string {
  const base = sansParenthese(principal);
  const autres = noms.map((n) => new Set(motsDe(sansParenthese(n))));
  const motsBase = [...base.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => m[0]);
  const gardes = motsBase.filter((m) => autres.every((a) => a.has(normaliser(m))));
  let nom = gardes.length === motsBase.length ? base.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') : gardes.join(' ');
  nom = nom.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  const repli = nomFiche.trim();
  if (nom === '' || porteLeNomProtege(nom) || CONTENEURS.some((c) => normaliser(c) === normaliser(nom))) return repli;
  return nom;
}

// ── LE PLAN DES RACINES ──────────────────────────────────────────────────────────────────────────────────────────────

export interface DossierDuProprietaire {
  id: string; nom: string;
  /** Où le dossier copié est rangé : « Actifs », « Inactifs », ou laissé en place (décision 6 : il ne bouge pas). */
  place: Conteneur | 'en_place';
  /** Le dossier que la fiche cite aujourd'hui (le principal du repointage B). */
  principal: boolean;
}

export interface PlanRacine {
  ficheId: number; ficheNom: string; nom: string;
  /** Une racine par conteneur où le propriétaire a au moins un dossier copié ; ses dossiers y seront déplacés. */
  racines: { conteneur: Conteneur; dossiers: { id: string; nom: string }[] }[];
  /** Les dossiers laissés en place : ils ne bougent pas. */
  laissesEnPlace: { id: string; nom: string }[];
  /** La racine que la fiche citera : celle d'« Actifs », à défaut celle d'« Inactifs ». */
  ficheVers: Conteneur | null;
}

/**
 * Le plan d'UN propriétaire à plusieurs dossiers copiés (point 2). `null` s'il n'en a qu'un : ce dossier sert alors de racine
 * propriétaire ET de racine de ses biens, on ne le découpe pas. PUR.
 */
export function planRacineDuProprietaire(fiche: { id: number; nom: string }, dossiers: readonly DossierDuProprietaire[]): PlanRacine | null {
  if (dossiers.length < 2) return null;
  const principal = dossiers.find((d) => d.principal) ?? dossiers[0];
  const nom = nomRacineProprietaire(dossiers.map((d) => d.nom), principal.nom, fiche.nom);
  const racines = CONTENEURS
    .map((c) => ({ conteneur: c, dossiers: dossiers.filter((d) => d.place === c).map((d) => ({ id: d.id, nom: d.nom })) }))
    .filter((r) => r.dossiers.length > 0);
  return {
    ficheId: fiche.id, ficheNom: fiche.nom, nom, racines,
    laissesEnPlace: dossiers.filter((d) => d.place === 'en_place').map((d) => ({ id: d.id, nom: d.nom })),
    ficheVers: racines.some((r) => r.conteneur === 'Actifs') ? 'Actifs' : racines.length > 0 ? 'Inactifs' : null,
  };
}

// ── LE RAPPROCHEMENT DES BIENS ───────────────────────────────────────────────────────────────────────────────────────

export type NiveauBien = 'SUR' | 'PROBABLE' | 'AMBIGU';

export interface LotARapprocher {
  id: number; wippimmo: string; adresse: string | null; commune: string | null; codePostal: string | null;
  locataires: readonly { nom: string; enPlace: boolean }[];
}
export interface DossierARapprocher {
  id: string; nom: string;
  /** Les noms des sous-dossiers de son dossier « Locataire(s) ». */
  locataires: readonly string[];
  /** Ses sous-dossiers directs (un dossier qui réunit plusieurs biens les range souvent par adresse). */
  sousDossiers: readonly { id: string; nom: string }[];
}
export interface PropositionBien {
  lotId: number; wippimmo: string; niveau: NiveauBien;
  dossierId: string | null; dossierNom: string | null;
  raison: string;
  candidats: { id: string; nom: string }[];
}

const MOTS_VIDES = new Set(['rue', 'avenue', 'av', 'boulevard', 'bd', 'place', 'allee', 'chemin', 'impasse', 'quai', 'route', 'square', 'villa',
  'cours', 'passage', 'sentier', 'cite', 'bis', 'ter', 'de', 'du', 'des', 'la', 'le', 'les', 'sur', 'sous', 'en', 'et', 'saint', 'sainte', 'st',
  'etage', 'eme', 'er', 'appartement', 'appt', 'lot', 'mandat']);
const significatifs = (s: string): string[] => motsDe(s).filter((m) => m.length >= 4 && !MOTS_VIDES.has(m) && !/^\d/.test(m));

/** Les noms de famille d'un locataire : ses mots écrits en CAPITALES (la convention de l'annuaire), à défaut le premier. PUR. */
export function nomsDeFamille(nom: string): string[] {
  const caps = [...nom.matchAll(/[\p{L}'-]+/gu)].map((m) => m[0]).filter((m) => m.length >= 3 && m === m.toUpperCase() && m !== m.toLowerCase());
  const base = caps.length > 0 ? caps : [nom.trim().split(/\s+/)[0] ?? ''];
  return [...new Set(base.flatMap((m) => motsDe(m)).filter((m) => m.length >= 3))];
}

/** Un sous-dossier porte-t-il l'adresse du bien (numéro + voie) ? PUR. */
function sousDossierDAdresse(lot: LotARapprocher, d: DossierARapprocher): { id: string; nom: string } | null {
  const a = motsDe(lot.adresse ?? '');
  if (a.length < 2 || !/^\d/.test(a[0])) return null;
  const voie = a.slice(1).filter((m) => !MOTS_VIDES.has(m));
  const ok = d.sousDossiers.filter((s) => {
    const m = motsDe(s.nom);
    return m[0] === a[0] && voie.length > 0 && voie.every((v) => m.includes(v));
  });
  return ok.length === 1 ? ok[0] : null;
}

/** La commune du bien dans la parenthèse du dossier (« (Paris 16) » exige aussi l'arrondissement). PUR. */
function communeDansParenthese(lot: LotARapprocher, d: DossierARapprocher): boolean {
  const p = motsDe(parenthese(d.nom));
  const c = motsDe(lot.commune ?? '').filter((m) => !MOTS_VIDES.has(m) && !/^\d+$/.test(m));
  if (p.length === 0 || c.length === 0 || !p.includes(c[0])) return false;
  const cp = (lot.codePostal ?? '').trim();
  if (c[0] === 'paris' || c[0] === 'lyon' || c[0] === 'marseille') {
    const arr = p.find((m) => /^\d{1,2}(e|eme|er)?$/.test(m));
    if (arr !== undefined && /^\d{5}$/.test(cp)) return Number(arr.replace(/\D/g, '')) === Number(cp.slice(-2));
  }
  return true;
}

/** Les indices qui relient UN bien à UN dossier : forts (commune, adresse, locataire), faibles (un mot de la voie). PUR. */
export function indicesBienDossier(lot: LotARapprocher, d: DossierARapprocher): { forts: string[]; faibles: string[]; sousDossier: { id: string; nom: string } | null } {
  const forts: string[] = []; const faibles: string[] = [];
  const sous = sousDossierDAdresse(lot, d);
  if (sous !== null) forts.push(`sous-dossier « ${sous.nom} »`);
  if (communeDansParenthese(lot, d)) forts.push(`commune ${parenthese(d.nom)}`);
  else {
    const voie = new Set(significatifs(lot.adresse ?? ''));
    const p = significatifs(parenthese(d.nom)).filter((m) => voie.has(m));
    if (p.length > 0) faibles.push(`voie « ${p.join(' ')} »`);
  }
  const dl = new Set(d.locataires.flatMap((n) => motsDe(n)));
  const vus = new Set<string>();
  for (const l of [...lot.locataires].sort((a, b) => Number(b.enPlace) - Number(a.enPlace))) {
    const f = nomsDeFamille(l.nom).filter((m) => dl.has(m));
    if (f.length === 0 || vus.has(f[0])) continue;
    vus.add(f[0]);
    forts.push(`${l.enPlace ? 'locataire actuel' : 'ancien locataire'} ${f[0].toUpperCase()}`);
  }
  return { forts, faibles, sousDossier: sous };
}

/** Les dossiers entre lesquels « Corriger » choisit : les dossiers du propriétaire, et leurs sous-dossiers d'adresse. PUR. */
export function candidatsDuProprietaire(dossiers: readonly DossierARapprocher[]): { id: string; nom: string }[] {
  return dossiers.flatMap((d) => [{ id: d.id, nom: d.nom },
    ...d.sousDossiers.filter((s) => /^\s*\d/.test(s.nom)).map((s) => ({ id: s.id, nom: `${d.nom} › ${s.nom}` }))]);
}

/**
 * LE RAPPROCHEMENT D'UN BIEN avec les dossiers copiés de son propriétaire (point 3). PUR.
 *   · SÛR      : un seul dossier porte un indice, et il est fort ;
 *   · PROBABLE : un dossier a strictement plus d'indices forts que les autres, ou seul un indice faible existe ;
 *   · AMBIGU   : égalité, ou aucun indice — aucun dossier n'est proposé, « Corriger » choisit.
 * Le dossier proposé est le sous-dossier d'adresse quand il existe (la racine de CE bien), sinon le dossier copié.
 */
export function rapprocherBien(lot: LotARapprocher, dossiers: readonly DossierARapprocher[]): PropositionBien {
  const candidats = candidatsDuProprietaire(dossiers);
  const notes = dossiers.map((d) => ({ d, ...indicesBienDossier(lot, d) }));
  const avecFort = notes.filter((n) => n.forts.length > 0);
  const avecIndice = notes.filter((n) => n.forts.length > 0 || n.faibles.length > 0);
  const tri = [...notes].sort((a, b) => b.forts.length - a.forts.length || b.faibles.length - a.faibles.length);
  const autres = (n: (typeof notes)[number]) => notes.filter((x) => x !== n && (x.forts.length > 0 || x.faibles.length > 0))
    .map((x) => `autre piste : « ${x.d.nom} » (${[...x.forts, ...x.faibles].join(' + ')})`);
  const proposer = (n: (typeof notes)[number], niveau: NiveauBien): PropositionBien => ({
    lotId: lot.id, wippimmo: lot.wippimmo, niveau,
    dossierId: n.sousDossier?.id ?? n.d.id, dossierNom: n.sousDossier ? `${n.d.nom} › ${n.sousDossier.nom}` : n.d.nom,
    raison: [[...n.forts, ...n.faibles].join(' + '), ...autres(n)].join(' · '), candidats,
  });
  if (avecFort.length === 1 && avecIndice.length === 1) return proposer(avecFort[0], 'SUR');
  if (avecFort.length >= 1 && tri[0].forts.length > tri[1].forts.length) return proposer(tri[0], 'PROBABLE');
  if (avecFort.length === 0 && avecIndice.length === 1) return proposer(avecIndice[0], 'PROBABLE');
  return {
    lotId: lot.id, wippimmo: lot.wippimmo, niveau: 'AMBIGU', dossierId: null, dossierNom: null, candidats,
    raison: avecIndice.length === 0 ? 'aucun indice (commune, adresse, locataire) dans les dossiers du propriétaire'
      : `indices à égalité — ${avecIndice.map((n) => `« ${n.d.nom} » (${[...n.forts, ...n.faibles].join(' + ')})`).join(' · ')}`,
  };
}

/**
 * Le dossier que le BIEN retient, d'après le calcul et la décision qui fait foi (décision 2 : sans réponse ou « Aucun
 * rattachement » = aucun dossier attitré, le bouton se replie). Un SÛR n'est pas montré à l'écran : il vaut validé. PUR.
 */
export function dossierRetenuDuBien(
  p: { niveau: NiveauBien; dossierId: string | null; candidats: readonly { id: string }[] },
  decision: { geste: 'valider' | 'corriger' | 'aucun'; dossierId: string | null } | null,
): string | null {
  if (decision === null) return p.niveau === 'SUR' ? p.dossierId : null;
  if (decision.geste === 'aucun') return null;
  if (decision.geste === 'valider') return p.dossierId;
  return decision.dossierId !== null && p.candidats.some((c) => c.id === decision.dossierId) ? decision.dossierId : null;
}

// ── LE BOUTON DRIVE D'UN BIEN (repli d'affichage) ────────────────────────────────────────────────────────────────────

export const LIBELLE_DOSSIER_DU_LOT = 'Dossier Drive du lot ↗';
export const LIBELLE_DOSSIER_PROPRIETAIRE_DU_BIEN = 'Dossier du propriétaire ↗';
export type SourceDossierBien = 'bien' | 'proprietaire';

/**
 * LE DOSSIER QU'OUVRE UN BIEN : son dossier attitré ; à défaut, celui de son propriétaire. Les deux arrivent DÉJÀ filtrés de
 * l'ancienne arborescence par la lecture (`annuaireRepo`, un dossier mémorisé dans `gestion_drive_arbre` ne compte pas) ;
 * un identifiant interdit (racine, conteneur) compte comme absent. `null` → le bouton se replie sur la racine. PUR.
 */
export function dossierDuBien(bien: string | null, proprietaire: string | null, interdits: ReadonlySet<string> = new Set()):
  { id: string; source: SourceDossierBien } | null {
  if (bien !== null && motifRefusDossierAttitre(bien, interdits) === null) return { id: bien, source: 'bien' };
  if (proprietaire !== null && motifRefusDossierAttitre(proprietaire, interdits) === null) return { id: proprietaire, source: 'proprietaire' };
  return null;
}

/**
 * LE BOUTON DRIVE D'UN BIEN : le dossier résolu par `dossierDuBien`, sinon la RACINE « Base de données locative » avec un
 * libellé qui le dit ; `null` si la racine elle-même est inconnue. La racine n'est jamais prise pour le dossier du bien. PUR.
 */
export function boutonDossierBien(
  resolu: { id: string; source: SourceDossierBien } | null, racineId: string | null, libelleBien: string = LIBELLE_DOSSIER_DU_LOT,
): { href: string; libelle: string; source: SourceDossierBien | 'racine' } | null {
  if (resolu !== null && resolu.id !== racineId && estIdDrive(resolu.id)) {
    return { href: `${DRIVE}${encodeURIComponent(resolu.id)}`, libelle: resolu.source === 'bien' ? libelleBien : LIBELLE_DOSSIER_PROPRIETAIRE_DU_BIEN, source: resolu.source };
  }
  if (racineId === null || !estIdDrive(racineId)) return null;
  return { href: `${DRIVE}${encodeURIComponent(racineId)}`, libelle: LIBELLE_SANS_DOSSIER_ATTITRE, source: 'racine' };
}

// ── VERROU DES REQUÊTES DRIVE DES ÉTAPES E ET R ──────────────────────────────────────────────────────────────────────

export type ModeRacines = 'lecture' | 'racines' | 'rattrapage';

export interface ContexteRequetesRacines {
  /** « Actifs » et « Inactifs ». */
  conteneurs: ReadonlySet<string>;
  /** Les racines propriétaires du plan (trouvées ou créées). */
  racines: ReadonlySet<string>;
  /** Rattrapage : les dossiers copiés qui peuvent recevoir une copie, et les originaux permis (id → nom exact). */
  destinationsCopie?: ReadonlySet<string>;
  fichiersACopier?: ReadonlyMap<string, string>;
  dossiersARecreer?: ReadonlyMap<string, string>;
}

const corpsJson = (corps: string): Record<string, unknown> | null => {
  try { const o = JSON.parse(corps) as unknown; return o !== null && typeof o === 'object' && !Array.isArray(o) ? o as Record<string, unknown> : null; } catch { return null; }
};
const memesCles = (o: Record<string, unknown>, cles: string[]) => Object.keys(o).sort().join(',') === [...cles].sort().join(',');
const unParentParmi = (o: Record<string, unknown>, permis: ReadonlySet<string>) =>
  Array.isArray(o.parents) && o.parents.length === 1 && typeof o.parents[0] === 'string' && permis.has(o.parents[0]);
const nomPermis = (n: unknown): n is string => typeof n === 'string' && n.trim() !== '' && !/[\u0000-\u001f\u007f]/.test(n) && !porteLeNomProtege(n);

/**
 * La requête Drive est-elle permise ? `null` = oui ; sinon le motif. PUR.
 *   · toujours : GET de métadonnées (jamais `alt=media`) ;
 *   · « racines » : POST files qui crée un DOSSIER dans « Actifs » ou « Inactifs », étiqueté `svav_racine_proprietaire` ;
 *     PATCH files/<id> qui déplace d'« Actifs » / « Inactifs » vers une racine du plan, corps vide ;
 *   · « rattrapage » : POST files/<original>/copy vers un dossier copié permis, nom EXACT de l'original, étiquette
 *     `svav_source_id` = l'original et rien d'autre ; POST files qui recrée un dossier miroir, même étiquette.
 * Tout le reste est refusé : DELETE, corbeille, emptyTrash, permissions, renommage, upload, untrash…
 */
export function refusRequeteRacines(url: string, init: { method?: string; body?: unknown } | undefined, mode: ModeRacines, ctx: ContexteRequetesRacines): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return 'adresse illisible'; }
  if (!url.startsWith(API)) return `hors de l’API Drive v3 : ${u.origin}${u.pathname}`;
  const methode = (init?.method ?? 'GET').toUpperCase();
  const chemin = u.pathname.replace(/^\/drive\/v3\//, '');
  if (methode === 'GET') return u.searchParams.get('alt') === 'media' ? 'lecture de contenu (alt=media) refusée : métadonnées seulement' : null;
  if (mode === 'lecture') return `${methode} refusé : ce script ne fait que lire`;
  if (/emptyTrash|permissions|revisions|comments|watch|upload|untrash/i.test(chemin)) return `${chemin} refusé`;
  const corps = typeof init?.body === 'string' ? init.body : init?.body === undefined ? '' : null;
  if (corps === null) return 'corps de requête illisible';
  if (/"trashed"/.test(corps)) return 'la corbeille est refusée ici';
  const fichier = /^files\/([A-Za-z0-9_-]{10,128})$/.exec(chemin);
  const copie = /^files\/([A-Za-z0-9_-]{10,128})\/copy$/.exec(chemin);

  if (mode === 'racines') {
    if (methode === 'POST' && chemin === 'files') {
      const o = corpsJson(corps); if (o === null) return 'création refusée : corps illisible';
      if (!memesCles(o, ['appProperties', 'mimeType', 'name', 'parents'])) return `création refusée : champs inattendus (${Object.keys(o).sort().join(',')})`;
      if (o.mimeType !== MIME_DOSSIER) return 'création refusée : seul un dossier se crée';
      if (!nomPermis(o.name) || CONTENEURS.some((c) => normaliser(c) === normaliser(String(o.name)))) return `création refusée : nom « ${String(o.name)} » interdit`;
      if (!unParentParmi(o, ctx.conteneurs)) return 'création refusée : une racine propriétaire se crée dans « Actifs » ou « Inactifs », et nulle part ailleurs';
      const e = o.appProperties as Record<string, unknown> | null;
      if (e === null || typeof e !== 'object' || !memesCles(e, [ETIQUETTE_RACINE]) || !/^[1-9]\d{0,17}$/.test(String(e[ETIQUETTE_RACINE]))) return `création refusée : l’étiquette ${ETIQUETTE_RACINE} (et elle seule) est exigée`;
      return null;
    }
    if (methode === 'PATCH' && fichier !== null) {
      const ajout = u.searchParams.get('addParents') ?? ''; const retrait = u.searchParams.get('removeParents') ?? '';
      if (!ctx.racines.has(ajout)) return `déplacement refusé : ${ajout || '(aucune destination)'} n’est pas une racine propriétaire du plan`;
      if (!ctx.conteneurs.has(retrait)) return 'déplacement refusé : on ne retire un dossier que d’« Actifs » ou d’« Inactifs »';
      if (corps !== '' && corps !== '{}') return 'déplacement refusé : aucun autre changement (nom, étiquette, corbeille) n’est permis';
      return null;
    }
    return `${methode} ${chemin} refusé en mode racines`;
  }

  // rattrapage
  const dest = ctx.destinationsCopie ?? new Set<string>();
  if (methode === 'POST' && copie !== null) {
    const nom = ctx.fichiersACopier?.get(copie[1]);
    if (nom === undefined) return `copie refusée : ${copie[1]} n’est pas un ajout tardif relevé`;
    if (/[?&](addParents|removeParents)=/.test(url)) return 'copie refusée : aucun déplacement';
    const o = corpsJson(corps); if (o === null) return 'copie refusée : corps illisible';
    if (!memesCles(o, ['appProperties', 'name', 'parents'])) return `copie refusée : champs inattendus (${Object.keys(o).sort().join(',')})`;
    if (o.name !== nom) return 'copie refusée : le nom doit être EXACTEMENT celui de l’original';
    if (!unParentParmi(o, dest)) return 'copie refusée : la destination n’est pas le dossier copié attendu';
    const e = o.appProperties as Record<string, unknown> | null;
    if (e === null || typeof e !== 'object' || !memesCles(e, [ETIQUETTE_COPIE]) || e[ETIQUETTE_COPIE] !== copie[1]) return `copie refusée : l’étiquette ${ETIQUETTE_COPIE} = l’original, et elle seule`;
    return null;
  }
  if (methode === 'POST' && chemin === 'files') {
    const o = corpsJson(corps); if (o === null) return 'création refusée : corps illisible';
    if (!memesCles(o, ['appProperties', 'mimeType', 'name', 'parents']) || o.mimeType !== MIME_DOSSIER) return 'création refusée : seul un dossier miroir se crée';
    const e = o.appProperties as Record<string, unknown> | null;
    const src = e !== null && typeof e === 'object' && memesCles(e, [ETIQUETTE_COPIE]) ? String(e[ETIQUETTE_COPIE]) : '';
    const nom = ctx.dossiersARecreer?.get(src);
    if (nom === undefined || o.name !== nom) return 'création refusée : dossier miroir inconnu, ou nom différent de l’original';
    if (!unParentParmi(o, dest)) return 'création refusée : la destination n’est pas le dossier copié attendu';
    return null;
  }
  return `${methode} ${chemin} refusé en mode rattrapage`;
}

// ── ÉTAPE E — LES VERDICTS ───────────────────────────────────────────────────────────────────────────────────────────

/** Une racine retrouvée (reprise) est-elle bien celle du plan ? PUR. */
export function verifierRacineTrouvee(m: ElementLu, attendu: { ficheId: number; nom: string; conteneurId: string }): VerdictRangement {
  if (m.mimeType !== MIME_DOSSIER) return refus(`${m.id} n’est pas un dossier`);
  if (m.trashed === true) return refus(`la racine ${m.id} est à la corbeille`);
  if (m.appProperties?.[ETIQUETTE_COPIE] !== undefined) return refus(`${m.id} est un dossier copié, pas une racine`);
  if (m.appProperties?.[ETIQUETTE_RACINE] !== String(attendu.ficheId)) return refus(`${m.id} n’est pas la racine de la fiche ${attendu.ficheId}`);
  if ((m.parents ?? []).length !== 1 || m.parents?.[0] !== attendu.conteneurId) return refus(`la racine ${m.id} n’est plus dans son conteneur`);
  if (m.name !== attendu.nom) return refus(`la racine ${m.id} s’appelle « ${m.name} », le plan dit « ${attendu.nom} »`);
  return { ok: true, deja: true };
}

/**
 * LE VERDICT SUR LE DÉPLACEMENT D'UN DOSSIER COPIÉ sous la racine de son propriétaire. PUR. Tout doit être vrai :
 *   ① c'est le dossier du plan, un dossier copié (étiquette), pas à la corbeille, pas protégé ;
 *   ② sa chaîne relue est sous « Base de données locative », hors de « Documents clients scannés » et de « 00 Arrivée des mails » ;
 *   ③ son parent est le conteneur attendu (→ à déplacer) ou déjà la racine (→ reprise), et la racine est dans ce conteneur.
 */
export function verifierDeplacementSousRacine(
  d: ElementLu, chaine: readonly Maillon[], attendu: { copieDossierId: string; conteneurId: string; racineId: string }, ctx: ContexteRangement,
): VerdictRangement {
  if (d.id !== attendu.copieDossierId) return refus(`${d.id} n’est pas le dossier du plan`);
  if (idsProteges(ctx).has(d.id) || d.id === attendu.racineId) return refus(`${d.id} est protégé`);
  if (d.mimeType !== MIME_DOSSIER) return refus(`${d.id} n’est pas un dossier`);
  if (d.trashed === true) return refus(`${d.id} est à la corbeille`);
  if ((d.appProperties?.[ETIQUETTE_COPIE] ?? '') === '') return refus(`${d.id} ne porte pas l’étiquette ${ETIQUETTE_COPIE} : ce n’est pas une copie`);
  const parents = d.parents ?? [];
  if (parents.length !== 1 || chaine.length === 0 || chaine[0].id !== parents[0]) return refus(`${d.id} : chaîne des parents incohérente`);
  const interdit = cheminInterdit(chaine, ctx);
  if (interdit !== null) return refus(`${d.id} : ${interdit}`);
  if (!Object.values(ctx.destinations).includes(attendu.conteneurId)) return refus(`le conteneur ${attendu.conteneurId} n’est ni « Actifs » ni « Inactifs »`);
  if (parents[0] === attendu.racineId) {
    if (chaine[1]?.id !== attendu.conteneurId) return refus(`la racine ${attendu.racineId} n’est pas dans son conteneur`);
    return { ok: true, deja: true };
  }
  if (parents[0] !== attendu.conteneurId) return refus(`${d.id} n’est ni dans « ${chaine[0].nom} » attendu ni sous sa racine : quelqu’un l’a déplacé`);
  return { ok: true, deja: false };
}

// ── ÉTAPE R — LE RATTRAPAGE ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * LE VERDICT SUR LA COPIE D'UN AJOUT TARDIF de « Documents clients scannés ». PUR. Tout doit être vrai :
 *   ① l'original est un FICHIER (ni dossier, ni raccourci), pas à la corbeille, sous « Documents clients scannés » ;
 *   ② la destination est le dossier copié de son dossier parent (étiquette `svav_source_id` = le parent de l'original) ;
 *   ③ la destination relue est sous « Base de données locative », hors de « Documents clients scannés » et de « 00 Arrivée
 *      des mails », pas à la corbeille, pas protégée.
 */
export function verifierCopieRattrapage(
  src: ElementLu, srcChaine: readonly string[], dest: ElementLu, destChaine: readonly Maillon[], ctx: ContexteRangement,
): VerdictRangement {
  if (src.mimeType === MIME_DOSSIER || src.mimeType === MIME_RACCOURCI) return refus(`${src.id} n’est pas un fichier`);
  if (src.trashed === true) return refus(`${src.id} est à la corbeille`);
  if (!srcChaine.includes(ctx.scannesId)) return refus(`${src.id} n’est pas dans « Documents clients scannés »`);
  if (src.appProperties?.[ETIQUETTE_COPIE] !== undefined) return refus(`${src.id} est déjà une copie`);
  const parentSource = src.parents?.[0];
  if (parentSource === undefined || (src.parents ?? []).length !== 1) return refus(`${src.id} : parent inconnu`);
  if (dest.mimeType !== MIME_DOSSIER || dest.trashed === true) return refus(`la destination ${dest.id} n’est pas un dossier vivant`);
  if (idsProteges(ctx).has(dest.id)) return refus(`la destination ${dest.id} est protégée`);
  if (dest.appProperties?.[ETIQUETTE_COPIE] !== parentSource) return refus(`la destination ${dest.id} n’est pas la copie du dossier de l’original (${parentSource})`);
  if ((dest.parents ?? []).length !== 1 || destChaine.length === 0 || destChaine[0].id !== dest.parents?.[0]) return refus(`la destination ${dest.id} : chaîne incohérente`);
  const interdit = cheminInterdit(destChaine, ctx);
  if (interdit !== null) return refus(`la destination ${dest.id} : ${interdit}`);
  return { ok: true, deja: false };
}

// ── ÉTAPE D RÉVISÉE — LES EXCLUSIONS ─────────────────────────────────────────────────────────────────────────────────

/**
 * Un dossier de la liste de corbeille doit-il en être EXCLU ? `null` = non ; sinon le motif. PUR. Exclu s'il est encore
 * cité par une fiche OU par un bien (serveur ou recette), s'il est le PARENT (à n'importe quelle hauteur) d'un dossier
 * cité, ou s'il en contient un dans son sous-arbre relu.
 */
export function motifExclusionCorbeille(id: string, cites: ReadonlySet<string>, ancetresDesCites: ReadonlySet<string>, sousArbre: readonly string[]): string | null {
  if (cites.has(id)) return 'encore cité par une fiche ou un bien';
  if (ancetresDesCites.has(id)) return 'parent d’un dossier encore cité par une fiche ou un bien';
  const dedans = sousArbre.find((x) => cites.has(x));
  if (dedans !== undefined) return `contient le dossier ${dedans}, encore cité par une fiche ou un bien`;
  return null;
}

// ── ÉTAPE F — LE REPOINTAGE DES FICHES ET DES BIENS, EN UNE TRANSACTION ──────────────────────────────────────────────

const verifierLignes = (quoi: string, lignes: readonly LigneRepointage[], interdits: ReadonlySet<string>, nouveauUnique: boolean) => {
  const vus = new Set<number>(); const nouveaux = new Set<string>();
  for (const l of lignes) {
    if (!Number.isSafeInteger(l.id) || l.id <= 0) throw new Error(`${quoi} : identifiant invalide ${l.id}`);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(l.wippimmo)) throw new Error(`${quoi} ${l.id} : n° WIPPIMMO invalide`);
    if (l.ancien !== null && !estIdDrive(l.ancien)) throw new Error(`${quoi} ${l.id} : ancien dossier invalide`);
    const r = motifRefusDossierAttitre(l.nouveau, interdits);
    if (r !== null) throw new Error(`${quoi} ${l.id} : ${r}`);
    if (vus.has(l.id)) throw new Error(`${quoi} ${l.id} en double`);
    if (nouveauUnique && nouveaux.has(l.nouveau)) throw new Error(`dossier ${l.nouveau} attribué à deux fiches`);
    vus.add(l.id); nouveaux.add(l.nouveau);
  }
};
const valeurs = (lignes: readonly LigneRepointage[]) => lignes.length === 0
  ? '(NULL::bigint, NULL::text, NULL::text, NULL::text)'
  : lignes.map((l) => `(${l.id}::bigint, '${l.wippimmo}'::text, ${l.ancien === null ? 'NULL' : `'${l.ancien}'`}::text, '${l.nouveau}'::text)`).join(',\n  ');

/**
 * Le script psql de l'étape F, pour le serveur comme pour la recette. PUR. Il refuse de s'écrire si une ligne est malformée,
 * en double, ou vise un dossier interdit (racine, « Actifs », « Inactifs », conteneurs de la copie…). Joué, il :
 *   · s'arrête si la colonne `gestion_annuaire_lot.drive_dossier_id` manque (migration 388 pas encore publiée) ou si l'une
 *     des deux tables porte un déclencheur ;
 *   · vérifie CHAQUE fiche et CHAQUE bien (même identifiant, même n° WIPPIMMO, dossier actuel = celui vu au plan ou déjà le
 *     nouveau ; pour une fiche, nouveau dossier pris par aucune autre fiche) : une seule discordance annule TOUT ;
 *   · essai : transaction READ ONLY, rien n'est écrit ; réel : verrouille, écrit `drive_dossier_id` et RIEN d'autre, relit,
 *     puis COMMIT — fiches et biens dans la MÊME transaction.
 */
export function sqlRepointageFichesEtBiens(
  fiches: readonly LigneRepointage[], biens: readonly LigneRepointage[], interdits: ReadonlySet<string>, reel: boolean,
): string {
  if (fiches.length + biens.length === 0) throw new Error('rien à repointer');
  verifierLignes('fiche', fiches, interdits, true);
  verifierLignes('bien', biens, interdits, false);
  const rf = `rf(id, wippimmo, ancien, nouveau) AS (SELECT * FROM (VALUES\n  ${valeurs(fiches)}) v(id, wippimmo, ancien, nouveau) WHERE id IS NOT NULL)`;
  const rb = `rb(id, wippimmo, ancien, nouveau) AS (SELECT * FROM (VALUES\n  ${valeurs(biens)}) v(id, wippimmo, ancien, nouveau) WHERE id IS NOT NULL)`;
  const arret = (m: string) => `DO $x$ BEGIN RAISE EXCEPTION '${m.replace(/'/g, "''")}'; END $x$;`;
  const idsF = fiches.map((l) => l.id).join(',') || '0';
  const idsB = biens.map((l) => l.id).join(',') || '0';
  return `-- REPOINTAGE DES FICHES (racines propriétaires) ET DES BIENS (Arno 19/10/2026) — ${reel ? 'RÉEL' : 'ESSAI À BLANC (READ ONLY)'} — ${fiches.length} fiche(s), ${biens.length} bien(s)
\\set ON_ERROR_STOP 1
\\pset footer off
${reel ? 'BEGIN;' : 'BEGIN TRANSACTION READ ONLY;'}
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SELECT count(*) AS colonne_bien FROM information_schema.columns WHERE table_name = 'gestion_annuaire_lot' AND column_name = 'drive_dossier_id' \\gset
SELECT (:colonne_bien = 0) AS sans_colonne \\gset
\\if :sans_colonne
  \\echo 'ARRÊT : la colonne gestion_annuaire_lot.drive_dossier_id n’existe pas — publier d’abord (migration 388).'
  ${arret('REPOINTAGE ANNULÉ : migration 388 absente')}
\\endif
SELECT count(*) AS declencheurs FROM pg_trigger WHERE tgrelid IN ('gestion_annuaire_proprietaire'::regclass, 'gestion_annuaire_lot'::regclass) AND NOT tgisinternal \\gset
SELECT (:declencheurs > 0) AS avec_declencheur \\gset
\\if :avec_declencheur
  \\echo 'ARRÊT : une des deux tables porte un déclencheur — une écriture pourrait modifier autre chose que drive_dossier_id.'
  ${arret('REPOINTAGE ANNULÉ : déclencheur présent')}
\\endif
${reel ? `SELECT id FROM gestion_annuaire_proprietaire WHERE id IN (${idsF}) ORDER BY id FOR UPDATE;
SELECT id FROM gestion_annuaire_lot WHERE id IN (${idsB}) ORDER BY id FOR UPDATE;` : ''}
WITH ${rf},
  j AS (SELECT rf.*, p.id AS pid, p.wippimmo_id, p.drive_dossier_id FROM rf LEFT JOIN gestion_annuaire_proprietaire p ON p.id = rf.id)
SELECT count(*) AS f_attendues,
       count(*) FILTER (WHERE pid IS NULL) AS f_absentes,
       count(*) FILTER (WHERE pid IS NOT NULL AND wippimmo_id IS DISTINCT FROM wippimmo) AS f_wippimmo,
       count(*) FILTER (WHERE pid IS NOT NULL AND drive_dossier_id IS NOT DISTINCT FROM ancien AND drive_dossier_id IS DISTINCT FROM nouveau) AS f_a_repointer,
       count(*) FILTER (WHERE pid IS NOT NULL AND drive_dossier_id = nouveau) AS f_deja,
       count(*) FILTER (WHERE pid IS NOT NULL AND drive_dossier_id IS DISTINCT FROM ancien AND drive_dossier_id IS DISTINCT FROM nouveau) AS f_change,
       (SELECT count(*) FROM gestion_annuaire_proprietaire x JOIN rf r2 ON x.drive_dossier_id = r2.nouveau AND x.id <> r2.id) AS f_pris_ailleurs
  FROM j \\gset
WITH ${rb},
  j AS (SELECT rb.*, l.id AS lid, l.wippimmo_id, l.drive_dossier_id FROM rb LEFT JOIN gestion_annuaire_lot l ON l.id = rb.id)
SELECT count(*) AS b_attendus,
       count(*) FILTER (WHERE lid IS NULL) AS b_absents,
       count(*) FILTER (WHERE lid IS NOT NULL AND wippimmo_id IS DISTINCT FROM wippimmo) AS b_wippimmo,
       count(*) FILTER (WHERE lid IS NOT NULL AND drive_dossier_id IS NOT DISTINCT FROM ancien AND drive_dossier_id IS DISTINCT FROM nouveau) AS b_a_repointer,
       count(*) FILTER (WHERE lid IS NOT NULL AND drive_dossier_id = nouveau) AS b_deja,
       count(*) FILTER (WHERE lid IS NOT NULL AND drive_dossier_id IS DISTINCT FROM ancien AND drive_dossier_id IS DISTINCT FROM nouveau) AS b_change
  FROM j \\gset
\\echo 'fiches attendues :' :f_attendues '· à repointer :' :f_a_repointer '· déjà faites :' :f_deja ' — biens attendus :' :b_attendus '· à repointer :' :b_a_repointer '· déjà faits :' :b_deja
\\echo 'discordances — fiches absentes :' :f_absentes '· n° WIPPIMMO :' :f_wippimmo '· dossier changé :' :f_change '· dossier déjà pris :' :f_pris_ailleurs ' — biens absents :' :b_absents '· n° WIPPIMMO :' :b_wippimmo '· dossier changé :' :b_change
SELECT (:f_absentes + :f_wippimmo + :f_change + :f_pris_ailleurs + :b_absents + :b_wippimmo + :b_change > 0) AS discordance,
       (:f_a_repointer + :f_deja <> :f_attendues OR :b_a_repointer + :b_deja <> :b_attendus) AS compte_faux \\gset
\\if :discordance
  WITH ${rf}
  SELECT 'fiche' AS sorte, rf.id, CASE WHEN p.id IS NULL THEN 'absente' WHEN p.wippimmo_id IS DISTINCT FROM rf.wippimmo THEN 'n° WIPPIMMO différent'
         WHEN p.drive_dossier_id IS DISTINCT FROM rf.ancien AND p.drive_dossier_id IS DISTINCT FROM rf.nouveau THEN 'dossier actuel changé depuis le plan'
         ELSE 'nouveau dossier déjà pris par une autre fiche' END AS motif
    FROM rf LEFT JOIN gestion_annuaire_proprietaire p ON p.id = rf.id
   WHERE p.id IS NULL OR p.wippimmo_id IS DISTINCT FROM rf.wippimmo
      OR (p.drive_dossier_id IS DISTINCT FROM rf.ancien AND p.drive_dossier_id IS DISTINCT FROM rf.nouveau)
      OR EXISTS (SELECT 1 FROM gestion_annuaire_proprietaire x WHERE x.drive_dossier_id = rf.nouveau AND x.id <> rf.id);
  WITH ${rb}
  SELECT 'bien' AS sorte, rb.id, CASE WHEN l.id IS NULL THEN 'absent' WHEN l.wippimmo_id IS DISTINCT FROM rb.wippimmo THEN 'n° WIPPIMMO différent'
         ELSE 'dossier actuel changé depuis le plan' END AS motif
    FROM rb LEFT JOIN gestion_annuaire_lot l ON l.id = rb.id
   WHERE l.id IS NULL OR l.wippimmo_id IS DISTINCT FROM rb.wippimmo
      OR (l.drive_dossier_id IS DISTINCT FROM rb.ancien AND l.drive_dossier_id IS DISTINCT FROM rb.nouveau);
  \\echo 'ARRÊT : au moins une discordance — RIEN n’est écrit.'
  ${arret('REPOINTAGE ANNULÉ : discordance')}
\\endif
\\if :compte_faux
  ${arret('REPOINTAGE ANNULÉ : compte incohérent')}
\\endif
${reel ? `WITH ${rf},
  u AS (UPDATE gestion_annuaire_proprietaire p SET drive_dossier_id = rf.nouveau FROM rf
         WHERE p.id = rf.id AND p.wippimmo_id = rf.wippimmo AND p.drive_dossier_id IS NOT DISTINCT FROM rf.ancien AND p.drive_dossier_id IS DISTINCT FROM rf.nouveau
        RETURNING p.id)
SELECT count(*) AS f_modifiees FROM u \\gset
WITH ${rb},
  u AS (UPDATE gestion_annuaire_lot l SET drive_dossier_id = rb.nouveau FROM rb
         WHERE l.id = rb.id AND l.wippimmo_id = rb.wippimmo AND l.drive_dossier_id IS NOT DISTINCT FROM rb.ancien AND l.drive_dossier_id IS DISTINCT FROM rb.nouveau
        RETURNING l.id)
SELECT count(*) AS b_modifies FROM u \\gset
WITH ${rf} SELECT count(*) AS f_relues FROM rf JOIN gestion_annuaire_proprietaire p ON p.id = rf.id AND p.wippimmo_id = rf.wippimmo AND p.drive_dossier_id = rf.nouveau \\gset
WITH ${rb} SELECT count(*) AS b_relus FROM rb JOIN gestion_annuaire_lot l ON l.id = rb.id AND l.wippimmo_id = rb.wippimmo AND l.drive_dossier_id = rb.nouveau \\gset
SELECT (:f_modifiees <> :f_a_repointer OR :b_modifies <> :b_a_repointer OR :f_relues <> :f_attendues OR :b_relus <> :b_attendus) AS ecart_apres \\gset
\\if :ecart_apres
  \\echo 'ARRÊT : relecture incohérente — fiches' :f_modifiees '/' :f_a_repointer 'relues' :f_relues '/' :f_attendues '· biens' :b_modifies '/' :b_a_repointer 'relus' :b_relus '/' :b_attendus
  ${arret('REPOINTAGE ANNULÉ : relecture incohérente')}
\\endif
COMMIT;
\\echo 'REPOINTAGE FAIT : fiches' :f_modifiees 'modifiée(s),' :f_deja 'déjà faite(s), relues' :f_relues '/' :f_attendues '— biens' :b_modifies 'modifié(s),' :b_deja 'déjà fait(s), relus' :b_relus '/' :b_attendus` : `ROLLBACK;
\\echo 'ESSAI À BLANC TERMINÉ : rien n’est écrit — fiches' :f_a_repointer 'à repointer,' :f_deja 'déjà faite(s) — biens' :b_a_repointer 'à repointer,' :b_deja 'déjà fait(s).'`}
`;
}

// ── L'ÉCRAN : LA SECTION « BIENS » DU RAPPROCHEMENT ──────────────────────────────────────────────────────────────────

export type GesteBien = 'valider' | 'corriger' | 'aucun';
export const GESTES_BIEN: readonly GesteBien[] = ['valider', 'corriger', 'aucun'];

export interface DecisionBien { geste: GesteBien; dossierId: string | null; dossierNom: string | null; decideLe: string; decidePar: string }

export interface LigneBien {
  id: number; lotId: number; wippimmo: string; adresse: string;
  proprietaire: { id: number; nom: string };
  niveau: NiveauBien; dossierId: string | null; dossierNom: string | null; raison: string;
  candidats: { id: string; nom: string }[];
  decision: DecisionBien | null; nbDecisions: number;
}

/** Ce que l'écran montre : les PROBABLES et les AMBIGUS (les SÛRS valent validés, décision d'Arno du 19/10). PUR. */
export const biensAMontrer = (lignes: readonly LigneBien[]): LigneBien[] =>
  lignes.filter((l) => l.niveau !== 'SUR')
    .sort((a, b) => a.proprietaire.nom.localeCompare(b.proprietaire.nom, 'fr') || a.adresse.localeCompare(b.adresse, 'fr') || a.id - b.id);

/** La décision demandée est-elle recevable pour ce bien ? `null` = oui. PUR. */
export function verifierGesteBien(l: Pick<LigneBien, 'dossierId' | 'candidats'>, geste: GesteBien, dossierChoisi: string | null): string | null {
  if (!GESTES_BIEN.includes(geste)) return 'Geste inconnu.';
  if (geste === 'valider' && l.dossierId === null) return 'Aucun dossier n’est proposé : choisir un dossier avec « Corriger ».';
  if (geste === 'corriger' && (dossierChoisi === null || !l.candidats.some((c) => c.id === dossierChoisi))) return 'Choisir un dossier parmi ceux du propriétaire.';
  return null;
}
