import { describe, it, expect } from 'vitest';
import {
  couleurIllisibleSurFondSombre, fondClairImpose, lireCouleur, luminance, vivacite,
  LUMINANCE_SOMBRE, VIVACITE_TERNE,
} from './couleurSombre';

/**
 * ══ 🔴🔴 LOT SOMBRE-ET-RECHERCHE — DU TEXTE NOIR SUR UN FOND SOMBRE ═════════════════════════════════════════
 *
 * ARNO (01/10/2026) : « dans l'éditeur (Nouveau message), en thème Sombre, la signature HTML (“Service Gestion”,
 * l'adresse, les téléphones) s'écrit en noir sur fond sombre, donc illisible. […] Les couleurs vives (rouge,
 * liens, etc.) et les images ne sont jamais modifiées. »
 */
describe('🔴 ce qu’on relève : sombre ET terne', () => {
  it('🔴 le noir et le gris foncé d’une signature', () => {
    for (const c of ['#000', '#000000', 'rgb(0, 0, 0)', '#333333', '#1a1a1a', 'rgb(51,51,51)']) {
      expect(couleurIllisibleSurFondSombre(c), c).toBe(true);
    }
  });

  /**
   * 🔴🔴 LE ROUGE DE LA MARQUE NE BOUGE PAS. `#a30402` est sombre (luminance 0,04) mais VIF : ses canaux
   * s'écartent de 161 sur 255. Le relever effacerait une information — c'est exactement ce qu'Arno interdit.
   */
  it('🔴🔴 le rouge de la marque, les liens, les couleurs vives : intouchés', () => {
    for (const c of ['#a30402', 'rgb(163,4,2)', '#0000ee', '#1a73e8', '#b30000', '#006400']) {
      expect(couleurIllisibleSurFondSombre(c), c).toBe(false);
    }
  });

  /** ⚠️ UN GRIS DÉJÀ CLAIR SE LIT TRÈS BIEN : le relever ne réparerait rien et changerait un choix de l'auteur. */
  it('⚠️ un gris clair n’est pas touché', () => {
    for (const c of ['#cccccc', '#999999', '#ffffff', 'rgb(200,200,200)']) {
      expect(couleurIllisibleSurFondSombre(c), c).toBe(false);
    }
  });

  /** ⚠️ CE QU'ON NE SAIT PAS LIRE, ON N'Y TOUCHE PAS. Ne pas savoir vaut « laisser tel quel ». */
  it('⚠️ une couleur illisible pour nous est laissée telle quelle', () => {
    for (const c of ['', null, undefined, 'currentColor', 'red', 'var(--x)', 'linear-gradient(#000,#fff)']) {
      expect(couleurIllisibleSurFondSombre(c), String(c)).toBe(false);
    }
  });

  /**
   * ⚠️ UN TEXTE TRANSPARENT NE SE VOIT PAS : il n'y a rien à corriger, et l'éclaircir ferait APPARAÎTRE ce que
   * l'auteur avait masqué (un préambule technique, une adresse de suivi).
   */
  it('⚠️ un noir transparent n’est pas relevé', () => {
    expect(lireCouleur('rgba(0, 0, 0, 0)')).toBeNull();
    expect(couleurIllisibleSurFondSombre('rgba(0,0,0,0)')).toBe(false);
    // …mais un noir opaque, si.
    expect(couleurIllisibleSurFondSombre('rgba(0, 0, 0, 1)')).toBe(true);
  });
});

describe('🔴 lire une couleur', () => {
  it('les formes qu’un navigateur et un mail écrivent', () => {
    expect(lireCouleur('#000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(lireCouleur('#A30402')).toEqual({ r: 163, g: 4, b: 2 });
    expect(lireCouleur('rgb(16, 32, 48)')).toEqual({ r: 16, g: 32, b: 48 });
    expect(lireCouleur('rgba(16,32,48,0.8)')).toEqual({ r: 16, g: 32, b: 48 });
    expect(lireCouleur('rgb(16 32 48 / 50%)')).toEqual({ r: 16, g: 32, b: 48 });
  });

  it('ce qui n’est pas une couleur rend `null`', () => {
    for (const c of ['#12', '#1234567', 'bleu', 'rgb(a,b,c)']) expect(lireCouleur(c), c).toBeNull();
  });
});

/**
 * 🔴 LA LUMINANCE N'EST PAS LA MOYENNE DES CANAUX. L'œil est bien plus sensible au vert qu'au bleu : une moyenne
 * simple dirait qu'un bleu pur est aussi clair qu'un vert pur. Sur un fond sombre, l'un est illisible et l'autre
 * éclatant — et c'est exactement la décision qu'on prend ici.
 */
describe('🔴 la luminance et la vivacité', () => {
  it('🔴 le vert pèse plus que le bleu', () => {
    expect(luminance({ r: 0, g: 255, b: 0 })).toBeGreaterThan(luminance({ r: 0, g: 0, b: 255 }));
    expect(luminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(luminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
  });

  it('🔴 un gris a une vivacité nulle, un rouge pur une vivacité maximale', () => {
    expect(vivacite({ r: 51, g: 51, b: 51 })).toBe(0);
    expect(vivacite({ r: 255, g: 0, b: 0 })).toBe(1);
  });

  /** ⚠️ LES DEUX SEUILS SONT EXIGÉS : relever tout ce qui est sombre écraserait le rouge de la marque. */
  it('⚠️ les deux conditions, jamais une seule', () => {
    // Sombre mais VIF : on ne touche pas.
    expect(luminance({ r: 163, g: 4, b: 2 })).toBeLessThan(LUMINANCE_SOMBRE);
    expect(vivacite({ r: 163, g: 4, b: 2 })).toBeGreaterThan(VIVACITE_TERNE);
    expect(couleurIllisibleSurFondSombre('#a30402')).toBe(false);
    // Terne mais CLAIR : on ne touche pas non plus.
    expect(vivacite({ r: 204, g: 204, b: 204 })).toBeLessThan(VIVACITE_TERNE);
    expect(luminance({ r: 204, g: 204, b: 204 })).toBeGreaterThan(LUMINANCE_SOMBRE);
    expect(couleurIllisibleSurFondSombre('#cccccc')).toBe(false);
  });
});

/**
 * ══ 🔴🔴 UN FOND CLAIR IMPOSÉ ARRÊTE TOUT ═══════════════════════════════════════════════════════════════════
 *
 * Un mail peut poser « background:#fff » sur un bloc, en comptant sur du texte noir. En thème Sombre ce bloc
 * reste blanc : relever son texte le rendrait BLANC SUR BLANC. La correction ne doit jamais rendre illisible ce
 * qui ne l'était pas.
 */
describe('🔴🔴 là où le mail impose un fond clair, on ne touche à rien', () => {
  it('🔴 un fond blanc ou clair se reconnaît', () => {
    for (const c of ['#ffffff', '#fff', 'rgb(250,250,250)', '#f4f4f4']) expect(fondClairImpose(c), c).toBe(true);
  });

  it('🔴 un fond sombre ou absent ne protège rien', () => {
    for (const c of ['#111', 'rgb(22,32,44)', 'rgba(0,0,0,0)', '', null]) {
      expect(fondClairImpose(c), String(c)).toBe(false);
    }
  });
});

/**
 * 🔒 LE MODULE EST PUR — il ne connaît ni le DOM, ni React, ni le thème. C'est ce qui permet d'éprouver la
 * décision couleur par couleur, sans monter un navigateur.
 */
describe('🔒 module pur', () => {
  it('🔒 aucun import', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('app/lib/gestion/couleurSombre.ts', 'utf8')).not.toMatch(/^import /m);
  });
});
