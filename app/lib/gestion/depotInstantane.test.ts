import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { EntreeDrive } from './finderDrive';
import {
  depotsVivants, estProvisoire, FENETRE_REINJECTION_MS, fusionnerDepots, idProvisoire, ligneProvisoire,
  ligneReelle, poser, remplacer, retirer, type DepotConfirme,
} from './depotInstantane';

/**
 * ══ 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — LA LIGNE QUI PARAÎT AU LÂCHER ════════════════════════════════════════
 *
 * CAS RÉEL : « la fenêtre affiche “✓ Rangée dans Test · ouvrir”, mais le dossier Test ouvert dans l'arbre ne
 * montre PAS le fichier. Il n'apparaît qu'environ 1 minute plus tard. » (Arno, 30/09/2026.)
 */
const PIECE = { pieceId: 42, nom: 'Recommandé M Ahmed KHARRAT.pdf', typeMime: 'application/pdf', tailleOctets: 133157 };
const fichier = (id: string, nom = id): EntreeDrive => ({
  id, nom, typeMime: 'application/pdf', tailleOctets: 1, modifieLe: null, lien: null, dossier: false,
});

describe('🔴 la ligne provisoire', () => {
  it('🔴 porte le NOM D’USAGE, pas le nom d’origine', () => {
    /* Afficher « 0836_001.pdf » une seconde puis le nouveau nom ferait croire que le renommage a échoué, puis
       qu'il a été rattrapé. Le nom sous lequel la copie PART est le seul qu'on ait le droit de montrer. */
    expect(ligneProvisoire(PIECE, 'CIBLE').nom).toBe('Recommandé M Ahmed KHARRAT.pdf');
  });

  it('elle décrit la pièce : type, taille, dossier cible', () => {
    const l = ligneProvisoire(PIECE, 'CIBLE');
    expect(l.typeMime).toBe('application/pdf');
    expect(l.tailleOctets).toBe(133157);
    expect(l.parentId).toBe('CIBLE');
    expect(l.dossier).toBe(false);
  });

  /**
   * ⚠️ `modifieLe` VAUT `null` ET NON L'HEURE COURANTE : on ne connaît pas encore la date que Google donnera, et
   * l'inventer ferait sauter la ligne de place au premier tri par date — juste sous l'œil de celui qui regarde.
   */
  it('⚠️ elle n’invente pas de date de modification', () => {
    expect(ligneProvisoire(PIECE, 'CIBLE').modifieLe).toBeNull();
  });

  /**
   * 🔴🔴 SON IDENTIFIANT NE PEUT PAS ÊTRE PRIS POUR CELUI D'UN FICHIER. Un clic sur une ligne provisoire ne doit
   * jamais partir demander à Google un fichier qui n'existe pas encore — ni, pire, un fichier qui existe.
   */
  it('🔴🔴 son identifiant se reconnaît, et ne ressemble à aucun identifiant Drive', () => {
    const id = idProvisoire(42);
    expect(estProvisoire(id)).toBe(true);
    expect(estProvisoire('1rQrM0TYzWloLnIDgemu8NO4SWh98-Tl_')).toBe(false);
    expect(id).toContain(':');
  });
});

describe('🔴 poser, remplacer, retirer', () => {
  it('🔴 elle est posée en TÊTE : c’est elle qu’on cherche des yeux', () => {
    const apres = poser([fichier('A'), fichier('B')], ligneProvisoire(PIECE, 'C'));
    expect(apres.map((e) => e.id)).toEqual([idProvisoire(42), 'A', 'B']);
  });

  it('⚠️ deux dépôts de la même pièce ne font pas deux lignes', () => {
    const l = ligneProvisoire(PIECE, 'C');
    expect(poser(poser([fichier('A')], l), l)).toHaveLength(2);
  });

  /**
   * 🔴 REMPLACER, ET NON « AJOUTER PUIS RETIRER » : entre les deux gestes, la liste montrerait la pièce en double
   * ou pas du tout — et un rendu de React tombe exactement là où on ne l'attend pas.
   */
  it('🔴 la provisoire devient la vraie, EN PLACE et sans doublon', () => {
    const avant = poser([fichier('A')], ligneProvisoire(PIECE, 'C'));
    const reelle = ligneReelle(PIECE, { driveFileId: 'D1', lien: 'https://drive/D1' }, 'C');
    const apres = remplacer(avant, 42, reelle);
    expect(apres.map((e) => e.id)).toEqual(['D1', 'A']);
    expect(apres[0].nom).toBe('Recommandé M Ahmed KHARRAT.pdf');
    expect(apres[0].lien).toBe('https://drive/D1');
  });

  /**
   * ⚠️ SI LA PROVISOIRE N'Y EST PLUS (on a changé de dossier, la liste a été rechargée entre-temps), la vraie est
   * quand même posée. Ne rien faire laisserait un dossier fraîchement relu SANS le fichier qu'on vient d'y
   * mettre — c'est-à-dire exactement le défaut qu'on répare.
   */
  it('⚠️ une liste rechargée entre-temps reçoit quand même la vraie ligne', () => {
    const apres = remplacer([fichier('A')], 42, ligneReelle(PIECE, { driveFileId: 'D1', lien: null }, 'C'));
    expect(apres.map((e) => e.id)).toEqual(['D1', 'A']);
  });

  it('⚠️ et si elle y est déjà, elle n’y entre pas deux fois', () => {
    const apres = remplacer([fichier('D1')], 42, ligneReelle(PIECE, { driveFileId: 'D1', lien: null }, 'C'));
    expect(apres.map((e) => e.id)).toEqual(['D1']);
  });

  /**
   * 🔴 LE REFUS DÉFAIT LA LIGNE. Une ligne optimiste qui resterait après un refus ferait croire à un fichier qui
   * n'est pas là — le seul mensonge que l'optimisme n'a pas le droit de dire.
   */
  it('🔴 un refus la fait disparaître, et ne touche à rien d’autre', () => {
    const avant = poser([fichier('A'), fichier('B')], ligneProvisoire(PIECE, 'C'));
    expect(retirer(avant, 42).map((e) => e.id)).toEqual(['A', 'B']);
  });

  it('retirer une pièce qui n’y est pas ne dérange personne', () => {
    expect(retirer([fichier('A')], 99).map((e) => e.id)).toEqual(['A']);
  });
});

/**
 * ══ 🔴🔴 LE NOM CHOISI SUIT LES DEUX VOIES DE DÉPÔT ═════════════════════════════════════════════════════════
 *
 * Défaut trouvé en relisant le câblage : `copierFichier` savait depuis ce lot porter un nom, et l'appelant ne le
 * lui passait pas. La même pièce se serait rangée sous deux noms selon que ses octets étaient encore chez nous
 * ou non — c'est-à-dire selon une circonstance invisible à celui qui range.
 */
describe('🔴🔴 le nom d’usage part par les DEUX voies', () => {
  it('🔴 la copie Drive → Drive emporte le nom choisi', () => {
    const src = readFileSync('app/lib/gestion/depotDriveReel.ts', 'utf8');
    expect(src).toContain('parentCible: o.dossierId, nom: o.nom');
  });

  it('🔴 la voie des octets aussi (elle le faisait déjà)', () => {
    const src = readFileSync('app/lib/gestion/depotDrive.ts', 'utf8');
    expect(src).toContain('nom: nomCopie, typeMime: piece.typeMime, octets, dossierId');
  });
});

/**
 * ══ 🔴🔴 LA VRAIE CAUSE DU DÉFAUT D'ARNO : LA TROISIÈME LISTE ════════════════════════════════════════════════
 *
 * La fenêtre tient TROIS listes pour un même dossier — la mémoire des listings, les sous-niveaux dépliés, et la
 * vue courante. Le dépôt n'en touchait que deux. Un dossier déplié DANS L'ARBRE gardait donc le contenu lu à son
 * dépliage, et la ligne n'y paraissait jamais : « environ une minute » n'était pas un délai, c'était le prochain
 * geste qui rafraîchissait par hasard.
 *
 * ⚠️ ON ÉPROUVE L'ÉCRAN PAR SON SOURCE, faute de pouvoir monter la fenêtre entière ici : ce qui doit être vrai,
 * c'est que le dépôt passe par la fonction qui touche LES TROIS, et plus par un effacement de mémoire suivi d'un
 * rechargement conditionnel.
 */
describe('🔴🔴 l’écran pose la ligne dans les TROIS listes', () => {
  const ecran = readFileSync('app/(admin)/admin/(protected)/gestion/SelecteurFichierDrive.tsx', 'utf8');

  it('🔴 `majListesDu` touche le cache, les sous-niveaux dépliés ET la vue courante', () => {
    const corps = ecran.slice(ecran.indexOf('const majListesDu ='), ecran.indexOf('const nomDuDossier ='));
    expect(corps).toContain('cache.current.set');
    expect(corps).toContain('setEnfants');
    expect(corps).toContain('setVue');
  });

  it('🔴 le rangement pose la provisoire, puis la remplace par la vraie', () => {
    expect(ecran).toContain('majListesDu(cibleId, (l) => poserLigne(l, provisoire))');
    expect(ecran).toContain('remplacerLigne');
    expect(ecran).toContain('oublierLaProvisoire');
  });

  /**
   * 🔴 « ✓ RANGÉE » N'EST DIT QU'APRÈS GOOGLE. La ligne provisoire montre ce qui est EN TRAIN d'arriver ; la
   * marque affirme que c'est arrivé. Les confondre, c'était annoncer un rangement sans preuve.
   */
  it('🔴 la marque « Rangée » vient APRÈS l’identifiant Drive, jamais avant', () => {
    const geste = ecran.slice(ecran.indexOf('const ranger = async ('), ecran.indexOf('const motifSansApercuPiece'));
    expect(geste.indexOf('r.driveFileId')).toBeGreaterThan(0);
    expect(geste.indexOf('r.driveFileId')).toBeLessThan(geste.indexOf('setRangees'));
  });

  /**
   * ⚠️ PLUS DE `charger()` APRÈS UN DÉPÔT : il vidait l'écran, remettait le défilement en haut et repassait par
   * l'état « chargement » — pour un dossier qu'on vient de mettre à jour ligne par ligne.
   */
  it('⚠️ le dépôt revalide en silence au lieu de recharger', () => {
    const geste = ecran.slice(ecran.indexOf('const ranger = async ('), ecran.indexOf('const motifSansApercuPiece'));
    expect(geste).toContain('revaliderEnSilence([cibleId])');
    expect(geste).not.toContain('void charger(cibleId)');
  });
});

/**
 * ══ 🔴🔴 LOT RANGER-ET-NOM-FIABLES — LA LIGNE QUI DISPARAISSAIT APRÈS ÊTRE APPARUE ══════════════════════════
 *
 * CONSTAT D'ARNO (01/10/2026) : « ✓ Rangée s'affiche sur la carte de gauche, mais la ligne n'apparaît PAS dans
 * le dossier de l'arbre. Il faut fermer puis rouvrir la fenêtre. Au second essai, tout a marché. »
 *
 * 🔴 LA CAUSE, ET ELLE EXPLIQUE L'INTERMITTENCE. Le correctif précédent posait bien la ligne, puis lançait une
 * revalidation silencieuse qui REMPLAÇAIT la liste par ce que Google rend. Or Google met environ 3,8 SECONDES
 * (mesuré sur le vrai Drive « Test ») à faire paraître un fichier neuf dans `files.list` : la revalidation
 * rapportait donc une liste SANS le fichier, et effaçait la ligne. Au second essai, Google avait rattrapé.
 */
describe('🔴🔴 une liste périmée n’efface plus un dépôt confirmé', () => {
  const depot = (id: string, dossierId = 'CIBLE', jusqua = 1_000): DepotConfirme => ({
    dossierId, jusqua, ligne: ligneReelle(PIECE, { driveFileId: id, lien: null }, dossierId),
  });

  /** 🔴 LE CAS D'ARNO, EXACTEMENT : la revalidation revient sans le fichier, et la ligne doit rester. */
  it('🔴🔴 la revalidation ne rapporte pas encore le fichier : la ligne reste', () => {
    const deGoogle = [fichier('A'), fichier('B')];
    const apres = fusionnerDepots(deGoogle, 'CIBLE', [depot('D1')], 500);
    expect(apres.map((e) => e.id)).toEqual(['D1', 'A', 'B']);
  });

  /** 🔴 ET DÈS QUE GOOGLE RATTRAPE, la sienne fait foi : pas de doublon, pas de ligne fantôme. */
  it('🔴 quand Google la rend enfin, elle n’est pas ajoutée deux fois', () => {
    const deGoogle = [fichier('D1'), fichier('A')];
    const apres = fusionnerDepots(deGoogle, 'CIBLE', [depot('D1')], 500);
    expect(apres.map((e) => e.id)).toEqual(['D1', 'A']);
  });

  /**
   * ⚠️ UN DÉPÔT DANS UN AUTRE DOSSIER NE DÉBORDE PAS ICI. Sans ce filtre, ranger dans « Test » aurait fait
   * paraître la ligne dans tous les dossiers qu'on ouvre ensuite.
   */
  it('⚠️ le dossier est respecté : une ligne ne paraît que là où elle a été déposée', () => {
    const apres = fusionnerDepots([fichier('A')], 'AUTRE', [depot('D1', 'CIBLE')], 500);
    expect(apres.map((e) => e.id)).toEqual(['A']);
  });

  /**
   * 🔴 CE N'EST PAS UN CACHE : passé la fenêtre, c'est Google qui a raison, quoi qu'il dise. Un fichier supprimé
   * dans Drive juste après le dépôt doit finir par disparaître de l'écran.
   */
  it('🔴 passé la fenêtre, on n’insiste plus', () => {
    const apres = fusionnerDepots([fichier('A')], 'CIBLE', [depot('D1', 'CIBLE', 1_000)], 2_000);
    expect(apres.map((e) => e.id)).toEqual(['A']);
    expect(depotsVivants([depot('D1', 'CIBLE', 1_000)], 2_000)).toEqual([]);
    expect(depotsVivants([depot('D1', 'CIBLE', 5_000)], 2_000)).toHaveLength(1);
  });

  /** ⚠️ PLUSIEURS DÉPÔTS D'AFFILÉE dans le même dossier : tous réinjectés, aucun perdu. */
  it('⚠️ deux rangements à la suite tiennent tous les deux', () => {
    const apres = fusionnerDepots([fichier('A')], 'CIBLE', [depot('D1'), depot('D2')], 500);
    expect(apres.map((e) => e.id)).toEqual(['D1', 'D2', 'A']);
  });

  /** ⚠️ La fenêtre est LARGE devant le retard mesuré (3,8 s), et courte devant l'attention d'un humain. */
  it('⚠️ la fenêtre couvre largement le retard de Google', () => {
    expect(FENETRE_REINJECTION_MS).toBeGreaterThanOrEqual(15_000);
    expect(FENETRE_REINJECTION_MS).toBeLessThanOrEqual(60_000);
  });
});

/**
 * ══ 🔴🔴 LE POINT DE PASSAGE UNIQUE — ET POURQUOI IL DOIT L'ÊTRE ════════════════════════════════════════════
 *
 * Quatre chemins rapportent une liste : le premier affichage, le préchargement au survol, le dépliage d'un
 * sous-niveau, la revalidation silencieuse. Réinjecter dans chacun aurait laissé un trou dès qu'on en oublie un —
 * et le défaut serait revenu, intermittent, sur ce chemin-là seulement.
 */
describe('🔴🔴 la réinjection est faite UNE fois, là où toutes les listes passent', () => {
  const ecran = readFileSync('app/(admin)/admin/(protected)/gestion/SelecteurFichierDrive.tsx', 'utf8');

  it('🔴 `lireListing` fusionne, et c’est le seul endroit qui le fait', () => {
    const corps = ecran.slice(ecran.indexOf('const lireListing = useCallback'), ecran.indexOf('const charger ='));
    expect(corps).toContain('fusionnerDepots(');
    expect((ecran.match(/fusionnerDepots\(/g) ?? [])).toHaveLength(1);
  });

  /** 🔴 LA TRACE EST POSÉE AVANT LA REVALIDATION : sinon la liste qui revient efface encore la ligne. */
  it('🔴 le dépôt est retenu AVANT que la revalidation ne parte', () => {
    const geste = ecran.slice(ecran.indexOf('const ranger = async ('), ecran.indexOf('const motifSansApercuPiece'));
    expect(geste.indexOf('depotsConfirmes.current = [')).toBeGreaterThan(0);
    expect(geste.indexOf('depotsConfirmes.current = ['))
      .toBeLessThan(geste.indexOf('revaliderEnSilence([cibleId])'));
  });

  /** ⚠️ UNE `ref`, jamais un état : cette trace ne doit pas provoquer de rendu par elle-même. */
  it('⚠️ la trace ne déclenche aucun rendu', () => {
    expect(ecran).toContain('const depotsConfirmes = useRef<DepotConfirme[]>([]);');
  });
});
