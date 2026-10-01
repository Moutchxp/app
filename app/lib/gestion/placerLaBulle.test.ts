import { describe, it, expect } from 'vitest';
import { placerLaBulle, ECART_PICTO, MARGE_BORD } from './placerLaBulle';

/**
 * ══ 🔴🔴 LOT BULLE-INFO-ET-S12 — LES TROIS PLACES QU'ARNO A NOMMÉES ════════════════════════════════════════════
 *
 * « Position dans la fenêtre : bord droit, bas de modale, petit écran. » Ce sont trois jeux de nombres, et c'est
 * tout ce qu'il faut pour les éprouver : la règle est pure.
 *
 * 🔴 L'ATTENDU EST TOUJOURS LE MÊME, QUELLE QUE SOIT LA PLACE : la bulle tient ENTIÈREMENT dans la fenêtre, avec
 * sa marge. Chaque essai le vérifie par `entierementVisible`, en plus du côté retenu — sans quoi on figerait un
 * côté sans jamais vérifier ce qu'Arno a demandé.
 */

const FENETRE = { largeur: 1440, hauteur: 900 };
const BULLE = { largeur: 320, hauteur: 260 };
/** Un picto de 18 px, la taille réelle de la pastille « i ». */
const picto = (gauche: number, haut: number) => ({ gauche, haut, largeur: 18, hauteur: 18 });

/** Le seul attendu qui compte vraiment : rien ne dépasse. */
function entierementVisible(
  p: { gauche: number; haut: number; hauteurMax: number },
  bulle: { largeur: number; hauteur: number },
  fenetre: { largeur: number; hauteur: number },
): boolean {
  const hauteur = Math.min(bulle.hauteur, p.hauteurMax);
  return p.gauche >= MARGE_BORD && p.haut >= MARGE_BORD
    && p.gauche + bulle.largeur <= fenetre.largeur - MARGE_BORD
    && p.haut + hauteur <= fenetre.hauteur - MARGE_BORD;
}

describe('① à droite, le défaut d’Arno', () => {
  it('🔴 un picto au milieu : la bulle se place à DROITE, centrée sur lui', () => {
    const p = placerLaBulle({ picto: picto(600, 400), bulle: BULLE, fenetre: FENETRE });
    expect(p.cote).toBe('droite');
    expect(p.gauche).toBe(600 + 18 + ECART_PICTO);
    // Centrée sur le picto : le descriptif se lit en face de la ligne dont il parle.
    expect(p.haut).toBe(400 + 9 - 130);
    expect(entierementVisible(p, BULLE, FENETRE)).toBe(true);
  });
});

describe('② le bord droit — le défaut qu’Arno a vu à l’écran', () => {
  it('🔴🔴 plus de place à droite : la bulle passe à GAUCHE, et ne dépasse pas', () => {
    // 1 440 − 320 − 8 = 1 112 : au-delà, la bulle sortirait par la droite.
    const p = placerLaBulle({ picto: picto(1200, 400), bulle: BULLE, fenetre: FENETRE });
    expect(p.cote).toBe('gauche');
    expect(p.gauche).toBe(1200 - ECART_PICTO - 320);
    expect(entierementVisible(p, BULLE, FENETRE)).toBe(true);
  });

  it('🔴 collée au bord droit de l’écran, elle passe encore à gauche', () => {
    const p = placerLaBulle({ picto: picto(1430, 450), bulle: BULLE, fenetre: FENETRE });
    expect(p.cote).toBe('gauche');
    expect(entierementVisible(p, BULLE, FENETRE)).toBe(true);
  });
});

describe('③ ni à droite ni à gauche : en dessous, puis au-dessus', () => {
  /** Une fenêtre étroite où aucun côté ne tient : c'est la place du téléphone. */
  const ETROITE = { largeur: 360, hauteur: 780 };
  const PETITE = { largeur: 320, hauteur: 200 };

  it('🔴 en DESSOUS, centrée sur le picto et ramenée dans la fenêtre', () => {
    const p = placerLaBulle({ picto: picto(170, 120), bulle: PETITE, fenetre: ETROITE });
    expect(p.cote).toBe('dessous');
    expect(p.haut).toBe(120 + 18 + ECART_PICTO);
    expect(entierementVisible(p, PETITE, ETROITE)).toBe(true);
  });

  it('🔴🔴 BAS DE MODALE : plus de place en dessous → AU-DESSUS du picto', () => {
    // Un picto à 720 px dans une fenêtre de 780 : 720 + 18 + 8 + 200 = 946, bien au-delà du bord.
    const p = placerLaBulle({ picto: picto(170, 720), bulle: PETITE, fenetre: ETROITE });
    expect(p.cote).toBe('dessus');
    expect(p.haut).toBe(720 - ECART_PICTO - 200);
    expect(entierementVisible(p, PETITE, ETROITE)).toBe(true);
  });
});

describe('④ petit écran : elle est bornée, jamais refusée', () => {
  const TELEPHONE = { largeur: 390, hauteur: 560 };

  it('🔴 une bulle PLUS HAUTE que l’écran : `hauteurMax` la fait défiler au lieu de la laisser dépasser', () => {
    const haute = { largeur: 320, hauteur: 900 };
    const p = placerLaBulle({ picto: picto(200, 300), bulle: haute, fenetre: TELEPHONE });
    expect(p.hauteurMax).toBe(560 - 2 * MARGE_BORD);
    // 🔴 ELLE PLACE QUAND MÊME : rendre « nulle part » ferait disparaître le descriptif.
    expect(entierementVisible(p, haute, TELEPHONE)).toBe(true);
  });

  it('🔴 un picto dans le coin haut-gauche : rien ne passe sous zéro', () => {
    const p = placerLaBulle({ picto: picto(2, 2), bulle: { largeur: 320, hauteur: 300 }, fenetre: TELEPHONE });
    expect(p.gauche).toBeGreaterThanOrEqual(MARGE_BORD);
    expect(p.haut).toBeGreaterThanOrEqual(MARGE_BORD);
  });

  it('🔴 un picto dans le coin bas-droit : rien ne dépasse non plus', () => {
    const p = placerLaBulle({
      picto: picto(380, 550), bulle: { largeur: 320, hauteur: 300 }, fenetre: TELEPHONE,
    });
    expect(entierementVisible(p, { largeur: 320, hauteur: 300 }, TELEPHONE)).toBe(true);
  });

  /**
   * ⚠️ LE CAS ABSURDE QU'ON NE VEUT PAS VOIR PLANTER : une bulle plus LARGE que la fenêtre. Elle ne peut pas tenir,
   * et la fonction doit rendre un nombre, pas `NaN` ni une valeur négative qui enverrait la bulle hors écran.
   */
  it('⚠️ une bulle plus large que la fenêtre rend quand même une place valide', () => {
    const p = placerLaBulle({
      picto: picto(100, 100), bulle: { largeur: 900, hauteur: 200 }, fenetre: TELEPHONE,
    });
    expect(Number.isFinite(p.gauche)).toBe(true);
    expect(p.gauche).toBe(MARGE_BORD);
    expect(Number.isFinite(p.haut)).toBe(true);
  });
});
