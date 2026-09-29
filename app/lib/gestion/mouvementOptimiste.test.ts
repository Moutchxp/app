import { describe, expect, it } from 'vitest';
import {
  ajouterA, annuler, appliquer, MOT_EN_COURS, motMouvementEnCours, motRetourEnArriere, retirerDe,
  type Listes, type MouvementLocal,
} from './mouvementOptimiste';
import type { EntreeDrive } from './finderDrive';

/**
 * LOT DRIVE-DEPLACER-RAPIDE — L'ÉCRAN OPTIMISTE, REJOUÉ SANS ÉCRAN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE CES TESTS PROTÈGENT : le fait que l'optimisme ne soit pas un mensonge. Afficher d'avance un
 * déplacement est facile ; le DÉFAIRE proprement quand le serveur refuse est ce qui coûte, et c'est ce qui décide
 * si la fenêtre dit la vérité. Sans le retour en arrière, un refus laisserait à l'écran un fichier là où il n'est
 * pas — la pire des deux erreurs, parce qu'on ne la découvre qu'en le cherchant.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const f = (id: string, nom = id, dossier = false, parentId: string | null = 'A'): EntreeDrive => ({
  id, nom, typeMime: dossier ? 'application/vnd.google-apps.folder' : 'application/pdf',
  tailleOctets: dossier ? null : 10, modifieLe: null, lien: null, dossier, parentId,
});

const listes = () => new Map<string, EntreeDrive[]>([
  ['A', [f('1'), f('2'), f('3')]],
  ['B', [f('9', '9', false, 'B')]],
]);

const noms = (m: Map<string, EntreeDrive[]>, cle: string) => (m.get(cle) ?? []).map((e) => e.id);
/** Raccourci : on ne regarde que les listes, quand le détail des retraits n'est pas le sujet du test. */
const appliquees = (l: Listes, m: MouvementLocal) => appliquer(l, m).listes;

describe('retirer et ajouter', () => {
  it('retire par identifiant, et laisse le reste dans l’ordre', () => {
    expect(retirerDe(listes().get('A') as EntreeDrive[], ['2']).map((e) => e.id)).toEqual(['1', '3']);
  });

  it('retirer ce qui n’y est pas ne change rien', () => {
    expect(retirerDe(listes().get('A') as EntreeDrive[], ['zzz'])).toHaveLength(3);
  });

  /** ⚠️ SANS DOUBLON : un second dépôt du même élément ne doit pas le faire apparaître deux fois. */
  it('ajoute sans doublon', () => {
    const a = ajouterA(listes().get('B') as EntreeDrive[], [f('9', '9', false, 'B'), f('1')], 'B');
    expect(a.map((e) => e.id)).toEqual(['9', '1']);
  });

  /**
   * 🔴 LE `parentId` EST RECALÉ SUR LA CIBLE. Sans cela, l'aperçu d'un fichier qu'on vient de déplacer irait
   * chercher ses voisins dans son ANCIEN dossier — « Suivant » proposerait des fichiers qui ne sont plus à côté.
   */
  it('🔴 recale le parent sur la cible', () => {
    const a = ajouterA([], [f('1')], 'B');
    expect(a[0].parentId).toBe('B');
  });
});

describe('appliquer un déplacement aux listes de l’écran', () => {
  it('la ligne quitte la source et paraît dans la cible', () => {
    const apres = appliquees(listes(), { elements: [f('2')], source: 'A', cible: 'B' });
    expect(noms(apres, 'A')).toEqual(['1', '3']);
    expect(noms(apres, 'B')).toEqual(['9', '2']);
  });

  it('plusieurs éléments d’un coup', () => {
    const apres = appliquees(listes(), { elements: [f('1'), f('3')], source: 'A', cible: 'B' });
    expect(noms(apres, 'A')).toEqual(['2']);
    expect(noms(apres, 'B')).toEqual(['9', '1', '3']);
  });

  /** ⚠️ UNE COPIE NE RETIRE RIEN : l'original reste où il est. C'est `source: null` qui le dit. */
  it('une copie (source nulle) laisse la source intacte', () => {
    const apres = appliquees(listes(), { elements: [f('2')], source: null, cible: 'B' });
    expect(noms(apres, 'A')).toEqual(['1', '2', '3']);
    expect(noms(apres, 'B')).toEqual(['9', '2']);
  });

  /**
   * 🔴 UN DOSSIER QU'ON N'A JAMAIS OUVERT RESTE INCONNU. L'y ajouter fabriquerait une liste partielle, et l'écran
   * croirait ensuite connaître ce dossier alors qu'il n'aurait vu que ce qu'on vient d'y poser.
   */
  it('🔴 une cible jamais chargée n’est pas inventée', () => {
    const apres = appliquees(listes(), { elements: [f('2')], source: 'A', cible: 'JAMAIS_OUVERT' });
    expect(apres.has('JAMAIS_OUVERT')).toBe(false);
    expect(noms(apres, 'A')).toEqual(['1', '3']); // la source, elle, a bien bougé
  });

  it('ne modifie pas les listes reçues', () => {
    const avant = listes();
    appliquees(avant, { elements: [f('2')], source: 'A', cible: 'B' });
    expect(noms(avant, 'A')).toEqual(['1', '2', '3']);
  });
});

describe('🔴 défaire — ce qui sépare l’optimisme du mensonge', () => {
  const m: MouvementLocal = { elements: [f('1'), f('2')], source: 'A', cible: 'B' };

  it('un refus EN BLOC remet tout à sa place', () => {
    const { listes: apres, retires } = appliquer(listes(), m);
    const rendu = annuler(apres, m, ['1', '2'], retires);
    expect(noms(rendu, 'A').sort()).toEqual(['1', '2', '3']);
    expect(noms(rendu, 'B')).toEqual(['9']);
  });

  /** 🔴 UN LOT MÊLÉ : trois passent, deux sont refusés — seuls les deux reviennent. */
  it('🔴 ne remet QUE ce qui a été refusé', () => {
    const { listes: apres, retires } = appliquer(listes(), m);
    const rendu = annuler(apres, m, ['2'], retires);
    expect(noms(rendu, 'A').sort()).toEqual(['2', '3']);
    expect(noms(rendu, 'B')).toEqual(['9', '1']);
  });

  it('aucun refus ne change rien', () => {
    const { listes: apres, retires } = appliquer(listes(), m);
    const rendu = annuler(apres, m, [], retires);
    expect(noms(rendu, 'B')).toEqual(['9', '1', '2']);
  });

  /**
   * ⚠️ UNE COPIE REFUSÉE NE REND RIEN À LA SOURCE — elle n'y avait rien pris. Elle retire seulement ce qu'elle
   * avait posé dans la cible, et la cible « vide » (`source: null` → `cible: ''`) n'existe pas, donc rien n'est
   * inventé nulle part.
   */
  it('une copie refusée retire de la cible sans rien rendre à la source', () => {
    const copie: MouvementLocal = { elements: [f('2')], source: null, cible: 'B' };
    const { listes: apres, retires } = appliquer(listes(), copie);
    const rendu = annuler(apres, copie, ['2'], retires);
    expect(noms(rendu, 'B')).toEqual(['9']);
    expect(noms(rendu, 'A')).toEqual(['1', '2', '3']);
    expect(rendu.has('')).toBe(false);
  });
});

describe('les mots de l’attente', () => {
  /** ⚠️ « EN COURS » SE DIT EN MOTS : une ligne pâle se lirait comme désactivée, sélectionnée ou coupée. */
  it('l’indicateur porte un mot, pas seulement une couleur', () => {
    expect(MOT_EN_COURS).toContain('en cours');
  });

  /**
   * 🔴 LE BANDEAU PARAÎT AU LÂCHER, donc avant de savoir si cela a marché : il parle au PRÉSENT, et « Annuler »
   * n'y figure pas encore — proposer d'annuler ce qui n'a pas eu lieu promettrait un geste intenable.
   */
  it('🔴 le bandeau du lâcher parle au présent, et ne promet pas d’annulation', () => {
    const mot = motMouvementEnCours('deplacer', 3, 'Travaux');
    expect(mot).toContain('3 éléments');
    expect(mot).toContain('en cours de déplacement');
    expect(mot).not.toContain('Annuler');
    expect(motMouvementEnCours('copier', 1, 'Travaux')).toContain('en cours de copie');
  });

  it('le retour en arrière nomme le fichier ET la raison', () => {
    const mot = motRetourEnArriere('bail.pdf', 'Refusé : c’est l’archive du cabinet.');
    expect(mot).toContain('bail.pdf');
    expect(mot).toContain('revenu à sa place');
    expect(mot).toContain('archive');
  });
});
