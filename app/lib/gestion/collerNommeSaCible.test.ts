import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { motColler, type Presse } from './driveDeplacement';

/**
 * ══ 🔴🔴 LOT REINTEGRER-PARTOUT-ET-BANDEAU, POINT 3 — « COLLER ICI » NOMME SA CIBLE ═══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (04/10/2026), née de mon propre constat à la fin du lot précédent : « dans le menu contextuel de
 * la fenêtre Drive, “Coller ici” devient “Coller dans « <nom du dossier> »”. Il colle exactement dans le dossier
 * nommé, avec la même logique de cible que celle corrigée pour “Déposer ici”. »
 *
 * ═══ 🔴🔴 CE QUE « ICI » COÛTAIT, ET JE L'AI PAYÉ MOI-MÊME ═══════════════════════════════════════════════════════
 *
 * En éprouvant le point 5 du lot précédent, j'ai fait un clic droit sur une LIGNE DE DOSSIER et cliqué « Coller
 * ici » en croyant coller dans le dossier affiché. Le menu a collé DANS ce dossier — ce que son code annonce depuis
 * toujours, et ce que l'écran n'annonçait nulle part. Le fichier est parti au bon endroit selon la règle, et au
 * mauvais selon moi.
 *
 * 🔴 LA RÈGLE N'A PAS CHANGÉ D'UN CRAN. Sur un dossier on colle DEDANS, sur un fichier dans le dossier qui le
 * contient, dans le vide dans le dossier affiché — ou le dossier SÉLECTIONNÉ quand l'affiché n'en est pas un, comme
 * « Déposer ici ». Ce point ne corrige pas un comportement : il corrige un MOT. Et un mot qui désigne mal est un
 * comportement faux pour qui le lit.
 *
 * 🔴 UNE SEULE FONCTION POUR LE MOT ET POUR LE GESTE (`cibleDuMenu`), et c'est le cœur de ce fichier. S'ils
 * calculaient chacun leur cible, le jour où l'une change, l'autre annoncerait encore l'ancienne — c'est-à-dire
 * exactement le défaut qu'on vient de réparer, retourné.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const SFD = readFileSync('app/(admin)/admin/(protected)/gestion/SelecteurFichierDrive.tsx', 'utf8');

const presse = (mode: 'couper' | 'copier', n: number): Presse => ({
  mode, ids: Array.from({ length: n }, (_, i) => `id${i}`), dossiers: [], parentSource: 'P',
});

describe('🔴🔴 ① le mot, et son repli', () => {
  /** 🔴 LA FORME EXACTE DEMANDÉE PAR ARNO : « Coller dans « <nom> » », puis le compte entre parenthèses. */
  it('🔴🔴 « Coller dans « Test » (déplacer 1 élément) »', () => {
    expect(motColler(presse('couper', 1), 'Test')).toBe('Coller dans « Test » (déplacer 1 élément)');
    expect(motColler(presse('copier', 3), 'Test creation dossier drive'))
      .toBe('Coller dans « Test creation dossier drive » (copier 3 éléments)');
  });

  /**
   * 🔴 LE MOT D'AVANT EST LE REPLI, AU CARACTÈRE PRÈS. Un appelant qui ne sait pas où il collerait doit dire
   * « Coller ici » et non inventer un nom : mieux vaut vague que faux. C'est aussi ce qui garde valides les
   * appelants plus anciens, qui ne passent pas de nom.
   */
  it('🔴 sans nom de cible, c’est « Coller ici » — le mot d’avant', () => {
    expect(motColler(presse('couper', 1))).toBe('Coller ici (déplacer 1 élément)');
    expect(motColler(presse('couper', 1), null)).toBe('Coller ici (déplacer 1 élément)');
    /* ⚠️ UN NOM FAIT D'ESPACES N'EST PAS UN NOM : on retombe sur « ici » plutôt que d'afficher « dans «  » ». */
    expect(motColler(presse('couper', 1), '   ')).toBe('Coller ici (déplacer 1 élément)');
    expect(motColler(null)).toBe('Coller ici');
    expect(motColler(null, 'Test')).toBe('Coller dans « Test »');
  });
});

describe('🔴🔴 ② une seule cible, pour le mot ET pour le clic', () => {
  /**
   * 🔴🔴 C'EST L'ASSERTION QUI COMPTE DANS TOUT CE FICHIER. Le libellé et l'action lisent la MÊME fonction. Deux
   * calculs séparés — un pour afficher, un pour agir — est précisément la forme du défaut d'origine.
   */
  it('🔴🔴 `cibleDuMenu` est lue par le libellé et par l’action', () => {
    expect(SFD).toContain('const cibleDuMenu = (f: Fichier | null): { id: string; nom: string } | null => (f === null');
    /* LE MOT : les trois menus (vide, dossier, fichier) passent la cible à `droitsPresse`. */
    expect((SFD.match(/droitsPresse\(cibleDuMenu\(/g) ?? [])).toHaveLength(3);
    expect(SFD).toContain('motColler: motColler(presse, cible?.nom ?? null),');
    /* L'ACTION : le menu du vide colle dans cette même cible, et plus dans « le dossier affiché » tout court. */
    expect(SFD).toContain('const ou = cibleDuMenu(null);');
    expect(SFD).toContain("if (ou !== null && ou.id !== '') coller(ou.id, ou.nom);");
    /* ⚠️ ET PLUS AUCUN `droitsPresse()` SANS CIBLE : c'est la forme qui ferait réapparaître « ici ». */
    expect(SFD).not.toContain('droitsPresse()');
  });

  /**
   * 🔴🔴 LA MÊME LOGIQUE QUE « DÉPOSER ICI » (demande d'Arno), et elle vient du MÊME module pur. Le menu du vide
   * collait dans « le dossier affiché » et lui seul : en arborescence, où l'affiché est la racine — un
   * REGROUPEMENT qui n'existe pas chez Google —, le collage ne partait nulle part alors que le menu l'offrait.
   */
  it('🔴🔴 dans le vide, la cible est celle de « Déposer ici »', () => {
    expect(SFD).toContain('? cibleDeposerIci(dossierCourant, dossiersChoisis).cible');
    expect(SFD).toContain(": cibleDeLaLigne(f));");
    /* 🔴 ET C'EST BIEN LE MODULE PUR PARTAGÉ, pas une règle réécrite dans la fenêtre. */
    expect(SFD).toMatch(/import \{[^}]*cibleDeposerIci[^}]*\} from '\.\.\/\.\.\/\.\.\/\.\.\/lib\/gestion\/cibleDepot';/);
  });

  /**
   * 🔴 SUR UNE LIGNE, LA RÈGLE EST INCHANGÉE : `cibleDeLaLigne` — sur un dossier, dedans ; sur un fichier, dans le
   * dossier qui le contient. Ce point ne la touche pas, il la NOMME. On fige donc qu'elle est toujours là.
   */
  it('🔴 sur une ligne, c’est toujours `cibleDeLaLigne`', () => {
    expect(SFD).toContain('const cibleDeLaLigne = (f: Fichier): { id: string; nom: string } | null => {');
    expect(SFD).toContain('const ou = cibleDeLaLigne(f);');
  });
});

describe('🔴 ③ ce que l’essai réel a montré', () => {
  /**
   * ══ 🔴🔴 MESURÉ DANS « Test » LE 04/10/2026 ══════════════════════════════════════════════════════════════════
   *
   * Un fichier coupé dans « Test », puis quatre clics droits :
   *   · sur le DOSSIER « Test creation dossier drive » → « Coller dans « Test creation dossier drive »
   *     (déplacer 1 élément) » ;
   *   · sur un FICHIER de « Test »                     → « Coller dans « Test » (déplacer 1 élément) » ;
   *   · dans le VIDE de « Test »                       → « Coller dans « Test » (déplacer 1 élément) » ;
   *   · dans le VIDE de « Drives partagés », arbre déplié et « Test » SÉLECTIONNÉ → « Coller dans « Test »
   *     (déplacer 1 élément) », ACTIF — là où le collage ne partait nulle part avant ce point.
   *
   * Puis le collage réel dans le dossier nommé : le fichier est arrivé dans « Test creation dossier drive », le
   * bandeau a dit « 1 élément déplacé vers “Test creation dossier drive” », et « Annuler le dernier déplacement »
   * annonçait « Remettre « _MESURE 1790804490862 0836_001.pdf [octets] » dans « Test » ». Après l'annulation :
   * « Test » revenu à 25 entrées, le sous-dossier à ses 3 fichiers.
   *
   * ⚠️ CE TEST NE REJOUE PAS CES GESTES — il n'y a pas de Drive dans une épreuve. Il fige la seule chose qu'un
   * test puisse tenir : que le mot et le geste n'ont qu'une source. Le reste est écrit ici pour qu'on sache ce qui
   * a été vérifié, et comment.
   */
  it('⚠️ le compte des éléments reste celui de la presse, jamais celui de la sélection', () => {
    /* 🔴 LE COMPTE VIENT DE `presse.ids`, c'est-à-dire de ce qu'on a COUPÉ — pas de ce qui est sélectionné au
       moment du clic droit. Les confondre annoncerait « déplacer 3 éléments » là où un seul partirait. */
    expect(motColler(presse('couper', 2), 'Test')).toContain('déplacer 2 éléments');
    expect(motColler(presse('copier', 1), 'Test')).toContain('copier 1 élément');
  });
});
