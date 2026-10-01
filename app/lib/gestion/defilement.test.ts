import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LIBELLE_PASTILLE, MARGE_BAS, resteEnDessous, sautDe } from './defilement';

/**
 * ══ 🔴🔴 LOT MODALE-SUIVI-ET-DEFILEMENT (point 2) — « IL Y EN A ENCORE EN DESSOUS » ═══════════════════════════
 *
 * DEMANDE D'ARNO : « Elle disparaît dès que le bas de la liste est atteint, et réapparaît si on remonte. Un clic
 * fait défiler en douceur d'environ une hauteur de zone. aria-label “Voir les biens suivants”. »
 */

describe('① la pastille ne s’allume que s’il reste quelque chose', () => {
  it('🔴 une liste qui tient entièrement dans sa zone ne porte JAMAIS de pastille', () => {
    expect(resteEnDessous({ scrollTop: 0, scrollHeight: 200, clientHeight: 200 })).toBe(false);
    expect(resteEnDessous({ scrollTop: 0, scrollHeight: 120, clientHeight: 300 })).toBe(false);
  });

  it('🔴 une liste plus longue que sa zone, en haut : la pastille est là', () => {
    expect(resteEnDessous({ scrollTop: 0, scrollHeight: 900, clientHeight: 300 })).toBe(true);
  });

  it('🔴 arrivé EN BAS, elle disparaît', () => {
    expect(resteEnDessous({ scrollTop: 600, scrollHeight: 900, clientHeight: 300 })).toBe(false);
  });

  it('🔴 on remonte : elle réapparaît', () => {
    expect(resteEnDessous({ scrollTop: 400, scrollHeight: 900, clientHeight: 300 })).toBe(true);
  });

  /**
   * 🔴🔴 LE PIÈGE QUI JUSTIFIE CE MODULE. Les navigateurs rendent des hauteurs FRACTIONNAIRES : en bas de liste,
   * `scrollTop + clientHeight` vaut couramment `scrollHeight - 0,5`. Une comparaison stricte laisserait la
   * pastille allumée en bas, à pulser sans jamais s'éteindre — un défaut qu'on ne voit qu'à l'écran et qu'on ne
   * sait pas reproduire.
   */
  it('🔴🔴 une demi-fraction de pixel au bas de la liste ne rallume pas la pastille', () => {
    expect(resteEnDessous({ scrollTop: 599.5, scrollHeight: 900, clientHeight: 300 })).toBe(false);
    expect(resteEnDessous({ scrollTop: 597.2, scrollHeight: 900, clientHeight: 300 })).toBe(false);
    // …mais une vraie ligne de plus, elle, compte.
    expect(resteEnDessous({ scrollTop: 560, scrollHeight: 900, clientHeight: 300 })).toBe(true);
    expect(MARGE_BAS).toBe(4);
  });

  it('⚠️ un débordement d’un pixel ne vaut pas la peine d’une pastille', () => {
    expect(resteEnDessous({ scrollTop: 0, scrollHeight: 302, clientHeight: 300 })).toBe(false);
  });
});

describe('② le saut d’un clic : « environ une hauteur de zone »', () => {
  it('🔴 un peu moins qu’une hauteur pleine — quelques lignes restent communes', () => {
    expect(sautDe(300)).toBe(255);
    expect(sautDe(500)).toBe(425);
  });

  it('⚠️ jamais un saut ridicule sur une zone minuscule', () => {
    expect(sautDe(10)).toBe(40);
    expect(sautDe(0)).toBe(40);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔒 CE QUE LE COMPOSANT DOIT PORTER — relu dans la source, parce qu'une règle non employée ne prouve rien
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒 la pastille, telle qu’Arno l’a décrite', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/ZoneDefilante.tsx', 'utf8');

  it('🔴 ronde, centrée, avec une flèche vers le bas', () => {
    expect(src).toContain('border-radius:50%');
    expect(src).toContain('left:50%');
    expect(src).toContain('M6 9l6 6 6-6');          // le tracé de la flèche
  });

  it('🔴 posée sur un léger dégradé de fondu, qui ne capte pas la souris', () => {
    expect(src).toContain('linear-gradient(to bottom, transparent, var(--color-svv-surface))');
    expect(src).toContain('pointer-events:none');
  });

  /** 🔴 « Pulsation lente et sobre : environ 2,4 s, opacité et échelle (1 → 1,06), ease-in-out. » */
  it('🔴🔴 la pulsation est celle demandée : 2,4 s, ease-in-out, échelle 1 → 1,06', () => {
    expect(src).toContain('animation:zdf-pulse 2.4s ease-in-out infinite');
    expect(src).toContain('scale(1.06)');
    expect(src).toContain('@keyframes zdf-pulse');
  });

  /** 🔴 « Avec prefers-reduced-motion : pas de pulsation. » Exigence transverse du dépôt, et demande explicite. */
  it('🔴🔴 aucune pulsation pour qui n’en veut pas', () => {
    expect(src.replace(/\s+/g, ' ')).toContain('@media (prefers-reduced-motion:reduce){ .zdf-pastille{animation:none');
  });

  it('🔴 le nom accessible est celui d’Arno, et le clic défile en douceur', () => {
    expect(LIBELLE_PASTILLE).toBe('Voir les biens suivants');
    expect(src).toContain('aria-label={LIBELLE_PASTILLE}');
    expect(src).toContain("behavior: 'smooth'");
    // 🔴 UN VRAI BOUTON : le clavier l'atteint par nature, sans `tabindex` ni gestionnaire de touche inventé.
    expect(src).toContain('<button type="button" className="zdf-pastille"');
  });

  /** 🔴 LES COULEURS VIENNENT DES JETONS : lisible en Clair comme en Sombre, sans une valeur en dur. */
  it('🔴 aucune couleur en dur — que des jetons du thème', () => {
    const css = src.slice(src.indexOf('CSS_ZONE_DEFILANTE'));
    expect(css).toContain('var(--color-svv-surface)');
    expect(css).toContain('var(--color-svv-line-strong)');
    expect(/#[0-9a-f]{3,8}\b/i.test(css.replace(/rgba\([^)]*\)/g, ''))).toBe(false);
  });
});
