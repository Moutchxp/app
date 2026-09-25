import { describe, it, expect, vi } from 'vitest';
import { MIME_DOSSIER, type DossierDetail, type LecteurDossier } from './drive';
import {
  dossiersRecentsAccessibles, nombreRecentsValide, nouveauBudget,
  RECENTS_DEFAUT, RECENTS_MAX, RECENTS_MIN, type CandidatRecent,
} from './dossiersRecents';

/**
 * LOT 5-PJ-D — LA VUE D'OUVERTURE DU SÉLECTEUR.
 *
 * 🔴 CE QUI EST ÉPROUVÉ ICI, ET POURQUOI. La mémoire des dépôts est COMMUNE à toute l'équipe ; les DROITS ne le sont
 * pas. Un dossier alimenté par un collègue, auquel je n'ai pas accès, ne doit pas m'apparaître — et pas même son NOM,
 * qui est le plus souvent un nom de propriétaire. Les cas qui comptent sont donc ceux du refus : inaccessible,
 * supprimé, à la corbeille, remplacé par un fichier. Chacun a son test, et tous vérifient la même chose : la ligne
 * disparaît, on prend la suivante, et rien n'a filtré.
 */

/** Un dossier tel que Google le rend. */
const dossier = (id: string, nom: string, parents: string[] = []): DossierDetail =>
  ({ id, nom, parents, driveId: null, mimeType: MIME_DOSSIER, corbeille: false });

/** Un lecteur de doublure : une table d'identifiants, et le compte des questions posées. */
function lecteur(table: Record<string, DossierDetail | { refus: string }>): { lire: LecteurDossier; appels: string[] } {
  const appels: string[] = [];
  const lire = vi.fn(async (id: string) => {
    appels.push(id);
    const v = table[id];
    if (v === undefined) return { ok: false as const, motif: 'Ce dossier n’existe plus dans le Drive.' };
    if ('refus' in v) return { ok: false as const, motif: v.refus };
    return { ok: true as const, valeur: v };
  });
  return { lire, appels };
}

const candidat = (id: string, quand = '2026-09-25T10:00:00Z'): CandidatRecent =>
  ({ id, nom: `mémoire ${id}`, driveId: null, dernierDepot: quand });

describe('le réglage du nombre de dossiers récents', () => {
  it('absent, nul ou aberrant ⇒ le défaut de six', () => {
    expect(nombreRecentsValide(undefined)).toBe(RECENTS_DEFAUT);
    expect(nombreRecentsValide(null)).toBe(RECENTS_DEFAUT);
    expect(nombreRecentsValide(0)).toBe(RECENTS_DEFAUT);
    expect(nombreRecentsValide(Number.NaN)).toBe(RECENTS_DEFAUT);
  });
  it('est ramené dans ses bornes plutôt que refusé : un réglage aberrant ne doit pas vider l’écran', () => {
    expect(nombreRecentsValide(99)).toBe(RECENTS_MAX);
    expect(nombreRecentsValide(-3)).toBe(RECENTS_DEFAUT);
    expect(nombreRecentsValide(1)).toBe(RECENTS_MIN);
    expect(nombreRecentsValide(8)).toBe(8);
  });
});

describe('les dossiers récents, filtrés par les DROITS de la personne connectée', () => {
  it('rend les dossiers accessibles, le plus récent d’abord, avec le nom que GOOGLE donne aujourd’hui', async () => {
    const { lire } = lecteur({ A: dossier('A', 'Dupont'), B: dossier('B', 'Martin') });
    const r = await dossiersRecentsAccessibles([candidat('A'), candidat('B')], { lire }, { max: 6 });
    expect(r.map((x) => x.id)).toEqual(['A', 'B']);
    // Le nom mémorisé au moment du dépôt (« mémoire A ») n'est qu'un repli : c'est Google qui fait foi.
    expect(r[0].nom).toBe('Dupont');
  });

  /** 🔴 UN DOSSIER REFUSÉ PAR GOOGLE (403) EST OMIS — et surtout, son nom ne transparaît nulle part. */
  it('un dossier inaccessible est omis, et AUCUN de ses noms ne filtre', async () => {
    const { lire } = lecteur({
      A: { refus: 'Google a refusé la lecture du dossier' },
      B: dossier('B', 'Martin'),
    });
    const r = await dossiersRecentsAccessibles([candidat('A'), candidat('B')], { lire }, { max: 6 });
    expect(r.map((x) => x.id)).toEqual(['B']);
    // Rien du dossier refusé ne sort — pas même le nom retenu au moment du dépôt, qui est un nom de propriétaire.
    expect(JSON.stringify(r)).not.toContain('mémoire A');
  });

  it('un dossier supprimé (inconnu de Google) est omis', async () => {
    const { lire } = lecteur({ B: dossier('B', 'Martin') }); // A n'existe plus
    const r = await dossiersRecentsAccessibles([candidat('A'), candidat('B')], { lire }, { max: 6 });
    expect(r.map((x) => x.id)).toEqual(['B']);
  });

  /** La corbeille répond 200 : sans demander `trashed`, on proposerait de déposer dans une poubelle. */
  it('un dossier à la corbeille est omis, alors même que Google le rend', async () => {
    const { lire } = lecteur({ A: { ...dossier('A', 'Dupont'), corbeille: true }, B: dossier('B', 'Martin') });
    const r = await dossiersRecentsAccessibles([candidat('A'), candidat('B')], { lire }, { max: 6 });
    expect(r.map((x) => x.id)).toEqual(['B']);
  });

  it('une cible qui n’est plus un dossier est omise : on choisit une destination, pas un fichier', async () => {
    const { lire } = lecteur({ A: { ...dossier('A', 'bail.pdf'), mimeType: 'application/pdf' }, B: dossier('B', 'M') });
    const r = await dossiersRecentsAccessibles([candidat('A'), candidat('B')], { lire }, { max: 6 });
    expect(r.map((x) => x.id)).toEqual(['B']);
  });

  /** On ne s'arrête PAS au premier refus : on continue jusqu'à en avoir six, ou jusqu'à épuisement. */
  it('avec trois refus, on va chercher les suivants jusqu’à en avoir six', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    const table: Record<string, DossierDetail | { refus: string }> = {};
    for (const id of ids) table[id] = ['b', 'd', 'f'].includes(id) ? { refus: 'refusé' } : dossier(id, id.toUpperCase());
    const { lire } = lecteur(table);
    const r = await dossiersRecentsAccessibles(ids.map((i) => candidat(i)), { lire }, { max: 6 });
    expect(r.map((x) => x.id)).toEqual(['a', 'c', 'e', 'g', 'h', 'i']);
  });

  it('moins de six dossiers disponibles ⇒ on rend ce qu’il y a, sans rien inventer', async () => {
    const { lire } = lecteur({ A: dossier('A', 'Dupont'), B: dossier('B', 'Martin') });
    const r = await dossiersRecentsAccessibles([candidat('A'), candidat('B')], { lire }, { max: 6 });
    expect(r).toHaveLength(2);
  });

  it('aucun candidat ⇒ liste vide, et AUCUNE question posée à Google', async () => {
    const { lire, appels } = lecteur({});
    expect(await dossiersRecentsAccessibles([], { lire }, { max: 6 })).toEqual([]);
    expect(appels).toHaveLength(0);
  });

  /** Le même dossier deux fois, une fois sous chaque titre, ferait douter qu'il s'agisse du même. */
  it('le dossier déjà mis en tête (dernier de l’échange) est exclu des récents', async () => {
    const { lire, appels } = lecteur({ A: dossier('A', 'Dupont'), B: dossier('B', 'Martin') });
    const r = await dossiersRecentsAccessibles([candidat('A'), candidat('B')], { lire }, { max: 6, exclure: 'A' });
    expect(r.map((x) => x.id)).toEqual(['B']);
    expect(appels).not.toContain('A'); // et on n'a même pas payé l'appel
  });

  it('un même dossier présent deux fois dans la mémoire n’apparaît qu’une fois', async () => {
    const { lire } = lecteur({ A: dossier('A', 'Dupont') });
    const r = await dossiersRecentsAccessibles([candidat('A'), candidat('A')], { lire }, { max: 6 });
    expect(r).toHaveLength(1);
  });
});

describe('le chemin lisible', () => {
  it('remonte les parents et les écrit de la racine vers le dossier', async () => {
    const { lire } = lecteur({
      C: { ...dossier('C', 'Dupont', ['B']), driveId: 'DRV' },
      B: dossier('B', '1 actifs', ['A']),
      A: dossier('A', 'GESTION LOCATIVE'),
    });
    const r = await dossiersRecentsAccessibles([candidat('C')], { lire }, { max: 6 });
    expect(r[0].chemin).toBe('GESTION LOCATIVE › 1 actifs');
  });

  /** Treize niveaux mesurés dans ce Drive : afficher le chemin entier rendrait la ligne illisible sur un téléphone. */
  it('un chemin trop profond est tronqué, et le DIT par « … »', async () => {
    const { lire } = lecteur({
      E: dossier('E', 'Dupont', ['D']), D: dossier('D', 'd', ['C']), C: dossier('C', 'c', ['B']),
      B: dossier('B', 'b', ['A']), A: dossier('A', 'a'),
    });
    const r = await dossiersRecentsAccessibles([candidat('E')], { lire }, { max: 6, profondeur: 2 });
    expect(r[0].chemin).toBe('… › c › d');
  });

  /**
   * 🔴 MESURÉ le 25/09/2026 contre le Drive réel : `files.get` sur la racine d'un Drive partagé rend « Drive » — le
   * MÊME mot pour les dix Drive visibles. Le chemin ne dirait donc plus dans quel Drive on est, ce qui est
   * exactement la question qu'il sert à trancher.
   */
  it('la racine d’un Drive partagé porte le VRAI nom du Drive, pas le « Drive » générique de Google', async () => {
    const { lire } = lecteur({
      C: { ...dossier('C', 'Dupont', ['R']), driveId: 'DRV' },
      R: dossier('R', 'Drive'), // ce que Google répond réellement pour la racine d'un Drive partagé
    });
    const r = await dossiersRecentsAccessibles(
      [candidat('C')], { lire, nomDuDrive: async () => 'GESTION LOCATIVE' }, { max: 6 },
    );
    expect(r[0].chemin).toBe('GESTION LOCATIVE');
  });

  it('sans nom de Drive connu, on garde ce que Google dit — jamais un nom inventé', async () => {
    const { lire } = lecteur({ C: { ...dossier('C', 'Dupont', ['R']), driveId: 'DRV' }, R: dossier('R', 'Drive') });
    const r = await dossiersRecentsAccessibles([candidat('C')], { lire, nomDuDrive: async () => null }, { max: 6 });
    expect(r[0].chemin).toBe('Drive');
  });

  it('dans « Mon Drive », la racine est dite en français, et non « My Drive »', async () => {
    const { lire } = lecteur({ C: dossier('C', 'Dupont', ['R']), R: dossier('R', 'My Drive') });
    const r = await dossiersRecentsAccessibles([candidat('C')], { lire }, { max: 6 });
    expect(r[0].chemin).toBe('Mon Drive');
  });

  /** Un chemin est un CONFORT : un ancêtre illisible ne doit pas faire disparaître un dossier parfaitement ouvert. */
  it('un ancêtre refusé laisse la ligne, avec un chemin vide', async () => {
    const { lire } = lecteur({ C: dossier('C', 'Dupont', ['B']), B: { refus: 'refusé' } });
    const r = await dossiersRecentsAccessibles([candidat('C')], { lire }, { max: 6 });
    expect(r).toHaveLength(1);
    expect(r[0].chemin).toBe('');
  });

  /** Six dossiers d'un même Drive partagent leurs ancêtres : sans mémoire, on redemanderait cinq fois la même chose. */
  it('un cycle d’ancêtres ne fait pas tourner indéfiniment', async () => {
    const { lire, appels } = lecteur({ X: dossier('X', 'X', ['Y']), Y: dossier('Y', 'Y', ['X']) });
    const r = await dossiersRecentsAccessibles([candidat('X')], { lire }, { max: 6 });
    expect(r).toHaveLength(1);
    expect(appels.length).toBeLessThanOrEqual(4);
  });
});

describe('les bornes de l’ouverture — elle doit rester rapide', () => {
  it('le nombre d’appels est PLAFONNÉ : on rend ce qui est vérifié, jamais une ligne devinée', async () => {
    const table: Record<string, DossierDetail> = {};
    const ids = Array.from({ length: 20 }, (_, i) => `d${i}`);
    for (const id of ids) table[id] = dossier(id, id);
    const { lire, appels } = lecteur(table);
    const budget = nouveauBudget(0, { appelsMax: 3, delaiMs: 10_000 });
    const r = await dossiersRecentsAccessibles(ids.map((i) => candidat(i)), { lire, maintenant: () => 0 }, { max: 6, budget });
    expect(appels.length).toBeLessThanOrEqual(3);
    expect(r.length).toBeLessThanOrEqual(3);
    expect(r.every((x) => x.nom !== '')).toBe(true); // tout ce qui sort a bien été vérifié
  });

  it('le délai dépassé arrête l’enrichissement, sans exception ni attente', async () => {
    const { lire } = lecteur({ A: dossier('A', 'Dupont') });
    let t = 0;
    const horloge = (): number => { t += 5000; return t; }; // la première question arrive déjà en retard
    const budget = nouveauBudget(0, { delaiMs: 1000 });
    const r = await dossiersRecentsAccessibles([candidat('A')], { lire, maintenant: horloge }, { max: 6, budget });
    expect(r).toEqual([]);
  });

  /** Le dernier dossier de l'échange et les récents se vérifient EN MÊME TEMPS : une seule enveloppe, partagée. */
  it('un budget partagé se consomme à deux, et ne se double pas', async () => {
    const table: Record<string, DossierDetail> = {};
    for (const id of ['a', 'b', 'c', 'd']) table[id] = dossier(id, id);
    const { lire, appels } = lecteur(table);
    const budget = nouveauBudget(0, { appelsMax: 2, delaiMs: 10_000 });
    await Promise.all([
      dossiersRecentsAccessibles([candidat('a')], { lire, maintenant: () => 0 }, { max: 1, budget }),
      dossiersRecentsAccessibles([candidat('b'), candidat('c'), candidat('d')], { lire, maintenant: () => 0 }, { max: 6, budget }),
    ]);
    expect(appels.length).toBeLessThanOrEqual(2);
  });
});
