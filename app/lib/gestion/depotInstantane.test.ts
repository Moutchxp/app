import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { EntreeDrive } from './finderDrive';
import {
  estProvisoire, idProvisoire, ligneProvisoire, ligneReelle, poser, remplacer, retirer,
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
