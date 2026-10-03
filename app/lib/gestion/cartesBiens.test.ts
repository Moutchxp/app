import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 1 — CHAQUE BIEN EST UNE CARTE ═════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (03/10/2026), sur le fil 36663 / message 57419 (Federico Menghi, lot 459) : « les résultats du
 * moteur de recherche (et les propositions) : chaque bien est une CARTE nettement séparée des autres — fond propre
 * légèrement contrasté, bordure visible, coins arrondis, espacement franc entre deux cartes, en-tête de carte
 * (case + adresse + lot) bien détaché du détail, survol et état coché visibles (bordure accent). »
 *
 * 🔴 CE QUE C'ÉTAIT, ET POURQUOI ÇA NE SE LISAIT PAS. Les biens étaient empilés en un seul bloc : `gap: 0` et
 * `border-top: 0` faisaient de douze biens un tableau continu, où l'œil ne voyait plus où finissait l'un et où
 * commençait le suivant — les caractéristiques d'un bien semblaient appartenir à celui du dessus.
 *
 * ⚠️ MÊME LANGAGE VISUEL QUE LES CARTES DU HAUT DE LA FENÊTRE (`.rdf-item`) : même rayon, même bordure, même fond
 * de surface. Deux grammaires de carte dans une seule fenêtre feraient deux objets là où il n'y en a qu'un.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const PDB = readFileSync('app/(admin)/admin/(protected)/gestion/PropositionsDeBiens.tsx', 'utf8');
const MRB = readFileSync('app/(admin)/admin/(protected)/gestion/MenuRattachementBien.tsx', 'utf8');
const RDF = readFileSync('app/(admin)/admin/(protected)/gestion/RattachementsDuFil.tsx', 'utf8');

describe('🔴🔴 ① les six marques demandées par Arno', () => {
  it('🔴🔴 espacement franc, bordure visible, coins arrondis, fond propre', () => {
    expect(PDB).toContain('.pdb-liste{display:flex;flex-direction:column;gap:8px;');
    expect(PDB).toContain('.pdb-item{border:1px solid var(--color-svv-line);border-radius:.6rem;'
      + 'background:var(--color-svv-surface);');
    /* 🔴 ET PLUS AUCUNE PILE : c'est ce qui faisait le tableau continu. */
    expect(PDB).not.toContain('.pdb-liste{display:flex;flex-direction:column;gap:0;');
    expect(PDB).not.toContain('border-top:0;background:var(--color-svv-surface)');
  });

  /** 🔴 SURVOL ET ÉTAT COCHÉ : la bordure se renforce, sans que rien ne bouge (ni ombre, ni déplacement). */
  it('🔴🔴 le survol et l’état coché se voient, par la bordure', () => {
    expect(PDB).toContain('.pdb-item:hover{border-color:var(--color-svv-line-strong)}');
    expect(PDB).toContain('.pdb-item:has(input[type="checkbox"]:checked){border-color:var(--color-svv-red)}');
    /* ⚠️ ET AU CLAVIER : le focus d'une case éclaire sa carte entière. */
    expect(PDB).toContain('.pdb-item:has(input[type="checkbox"]:focus-visible){border-color:var(--color-svv-red)}');
  });

  /**
   * 🔴🔴 L'EN-TÊTE COIFFE LA CARTE ENTIÈRE, et non la colonne de gauche. Resté dans la colonne, son bandeau
   * n'aurait couvert que la moitié de la carte — un en-tête à mi-largeur ne coiffe rien, il ajoute une ligne.
   */
  it('🔴🔴 l’en-tête est sorti de la colonne et détaché du détail', () => {
    expect(PDB).toContain('export function EnTeteCarteBien({');
    expect(PDB).toContain('.pdb-item .pdb-tete{padding:8px 10px;background:var(--color-svv-field);');
    expect(PDB).toContain('border-bottom:1px solid var(--color-svv-line)}');
    /* 🔴 LA COLONNE NE LE PORTE PLUS : `ColonneBien` ne prend plus ni case, ni bascule. */
    expect(PDB).toContain('export function ColonneBien({ bien }: { bien: BienProposable }) {');
  });

  /** ⚠️ MÊME LANGAGE QUE LES CARTES DU HAUT : même rayon, même bordure, même fond. */
  it('⚠️ le même langage visuel que les cartes du haut de la fenêtre', () => {
    expect(RDF).toContain('border:1px solid var(--color-svv-line);border-radius:.6rem;'
      + 'background:var(--color-svv-surface)');
  });

  /** 🔴 AUCUNE COULEUR EN DUR : les jetons basculent seuls en Clair et en Sombre. */
  it('🔴 les cartes ne passent que par les jetons', () => {
    const i = PDB.indexOf('.pdb-liste{display:flex');
    const bloc = PDB.slice(i, PDB.indexOf('.pdb-col{min-width:0}'));
    expect(bloc.match(/#[0-9a-fA-F]{3,8}|rgba?\(/g) ?? []).toEqual([]);
  });
});

describe('🔴🔴 ② les trois endroits qui montrent des biens emploient la même carte', () => {
  /**
   * 🔴 LES PROPOSITIONS DE L'ÉCRAN, CELLES DU MENU, ET LES RÉSULTATS DE RECHERCHE : trois listes, une seule
   * carte. Trois grammaires auraient fini par se comporter de trois façons — c'est exactement ce que ce lot
   * défait ailleurs (le compte rendu d'un geste écrit six fois).
   */
  it('🔴🔴 un seul en-tête de carte, employé partout', () => {
    expect(PDB.match(/<EnTeteCarteBien /g) ?? []).toHaveLength(1);
    expect(MRB.match(/<EnTeteCarteBien /g) ?? []).toHaveLength(2);
    expect(MRB).toContain('EnTeteCarteBien, CSS_PROPOSITIONS_BIENS');
  });
});
