import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT FRISE-PICTO-INFO-ET-ORANGE-URGENCE (11/10/2026) ════════════════════════════════════════════════════════
 * 1. Le « i » des cartes d'étape dans un cercle de 18 px ; sans commentaire, ni survol ni clic n'ouvrent la bulle,
 *    le cercle est grisé et l'info-bulle simple « ajoutée le … par … » reste ; avec commentaire, la bulle s'ouvre.
 * 2. Un vrai orange pour l'urgence « Intermédiaire », partout, distinct du rouge « Urgent », AA en Clair et Sombre.
 * (Le comportement est aussi relevé dans Chrome : captures app/.captures/frise-info-orange/.)
 */
const D = 'app/(admin)/admin/(protected)/gestion/';
const FRISE = readFileSync(`${D}FriseAvancement.tsx`, 'utf8');
const FEUILLE = (/const CSS_FRISE_AVANCEMENT = `([\s\S]*?)\n`;/.exec(FRISE)?.[1] ?? '');
const GLOBAL = readFileSync('app/globals.css', 'utf8');
const URGENCE = readFileSync(`${D}SelecteurUrgence.tsx`, 'utf8');
const TABLEAU = readFileSync(`${D}TableauBordEvenements.tsx`, 'utf8');
const VUE = readFileSync(`${D}GestionVue.tsx`, 'utf8');

const avec = FRISE.slice(FRISE.indexOf('className="fav-picto-b fav-picto-i"'));
const blocAvec = avec.slice(0, avec.indexOf('</button>'));
const sans = FRISE.slice(FRISE.indexOf('className="fav-picto-b fav-picto-i fav-picto-i--sans"'));
const blocSans = sans.slice(0, sans.indexOf('</button>'));

describe('1. le « i » dans son cercle', () => {
  it('🔴 le « i » est dans un cercle de 18 px, bord fin de la couleur du picto, centré', () => {
    expect(blocAvec).toContain('<span className="fav-i-cercle" aria-hidden="true">i</span>');
    expect(blocSans).toContain('<span className="fav-i-cercle" aria-hidden="true">i</span>');
    expect(FEUILLE).toMatch(/\.fav-i-cercle\{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;/);
    expect(FEUILLE).toContain('border:1.5px solid currentColor;border-radius:50%');
    // Plus foncé au survol : le cercle suit la couleur du bouton, qui passe à l'encre au survol et au focus.
    expect(FEUILLE).toContain('.fav-picto-b:hover,.fav-picto-b:focus-visible{background:var(--color-svv-line);color:var(--color-svv-ink)}');
  });
  it('🔴 sans commentaire : aucune bulle (ni survol, ni focus, ni clic), cercle grisé, info-bulle simple conservée', () => {
    expect(FRISE).toContain("{(e.texte ?? '').trim() === '' ? (");
    for (const geste of ['onMouseEnter', 'onFocus', 'onCommentaire']) expect(blocSans, geste).not.toContain(geste);
    expect(blocSans).toContain("title={pose ?? 'Aucun commentaire'}");
    expect(blocSans).not.toContain('disabled');
    expect(FEUILLE).toContain('.fav-picto-i--sans .fav-i-cercle{opacity:.4;border-width:1px;font-weight:400}');
  });
  it('🔴 avec commentaire : survol, focus ET clic ouvrent la bulle', () => {
    expect(blocAvec).toContain('onMouseEnter={(ev) => onCommentaire?.(e, ev.currentTarget)}');
    expect(blocAvec).toContain('onFocus={(ev) => onCommentaire?.(e, ev.currentTarget)}');
    expect(blocAvec).toContain('ev.stopPropagation(); onCommentaire?.(e, ev.currentTarget); }}');
    expect(blocAvec).toContain('aria-label={`Commentaire de la carte ${c.mot}`}');
  });
});

/** Contraste WCAG de deux couleurs #rrggbb. */
const lum = (h: string): number => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contraste = (a: string, b: string): number => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const teinte = (h: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min;
  const t = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (t * 60 + 360) % 360;
};
const jetons = (nom: string): string[] => [...GLOBAL.matchAll(new RegExp(`${nom}: (#[0-9a-f]{6});`, 'g'))].map((m) => m[1]);

describe('2. l’orange de l’urgence « Intermédiaire »', () => {
  it('🔴 un vrai orange (teinte 28-32°), AA sous texte blanc en Clair et sous texte sombre en Sombre ; Sombre dans les deux blocs', () => {
    const fonds = jetons('--color-svv-urgence-orange');
    expect(fonds).toEqual(['#b85c00', '#ff8c1a', '#ff8c1a']);
    for (const f of fonds) { expect(teinte(f)).toBeGreaterThanOrEqual(28); expect(teinte(f)).toBeLessThanOrEqual(32); }
    expect(contraste('#b85c00', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contraste('#ff8c1a', '#1b232f')).toBeGreaterThanOrEqual(4.5);
    const textes = jetons('--color-svv-urgence-orange-texte');
    expect(textes).toEqual(['#a35200', '#ff9933', '#ff9933']);
    expect(contraste('#a35200', '#ffe8d4')).toBeGreaterThanOrEqual(4.5);
    expect(contraste('#ff9933', '#3a2410')).toBeGreaterThanOrEqual(4.5);
    // Nettement distinct du rouge « Urgent » (teinte ~0°) : plus de 25° d'écart.
    expect(teinte('#b85c00') - teinte('#850302')).toBeGreaterThan(25);
  });
  it('🔴 le même jeton partout où « Intermédiaire » est représenté : bouton, tableau de bord, capsule des cartes', () => {
    expect(URGENCE).toContain('.gurg-voie--orange.gpil--actif:not(:disabled):focus-visible{background:var(--color-svv-urgence-orange);');
    expect(TABLEAU).toContain('.tbe-ton--haute .tbe-chiffre--actif:hover:not(:disabled){background:var(--color-svv-urgence-orange);');
    expect(TABLEAU).toContain('.tbe-ton--haute .tbe-n{color:var(--color-svv-urgence-orange-texte)}');
    expect(VUE).toContain('.gst-type-capsule--urg-orange{background:var(--color-svv-orange-soft);color:var(--color-svv-urgence-orange-texte)}');
    // Plus aucune règle d'urgence sur l'ancien orange brun.
    expect(URGENCE).not.toMatch(/gurg-voie--orange[^{]*\{[^}]*--color-svv-orange\)/);
    expect(TABLEAU).not.toMatch(/tbe-ton--haute[^{]*\{[^}]*--color-svv-orange\)/);
  });
  it('⚠️ l’orange partagé (syndic en conflit, « en attente », avertissement) ne bouge pas', () => {
    expect(jetons('--color-svv-orange')).toEqual(['#9a4408', '#ffb066', '#ffb066']);
  });
});
