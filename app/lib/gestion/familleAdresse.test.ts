import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classesPuce, famillesDesSuggestions, infobullePuce, type FamilleAdresse } from './familleAdresse';
import { rangerSuggestions } from './suggestionsBien';

/**
 * ══ 🔴🔴 LOT FORMULE-CONTACT-PRIME-ET-PUCES-COLOREES — LA PUCE D'UNE ADRESSE, TEINTÉE DE SA FAMILLE ══════════════════
 * Les classes et l'info-bulle (PUR), et le CONTRASTE du texte sur chaque fond, calculé depuis les VRAIS jetons de
 * `app/globals.css` (Clair et Sombre) et la VRAIE règle CSS de `Redaction.tsx` : AA (≥ 4,5:1) partout.
 */

const F = (ton: FamilleAdresse['ton'], propre = true): FamilleAdresse => ({ ton, propre, nom: 'DUPONT Jean', role: 'Propriétaire' });

describe('la classe de la puce, selon la famille', () => {
  it('chaque famille, e-mail PROPRE : fond plein de sa couleur', () => {
    for (const ton of ['proprietaire', 'locataire', 'ancien_locataire', 'syndic', 'immeuble', 'neutre'] as const) {
      expect(classesPuce(F(ton))).toBe(` red-pastille--famille red-pastille--${ton}`);
    }
  });
  it('e-mail RATTACHÉ : la même couleur, en pâle avec contour', () => {
    expect(classesPuce(F('proprietaire', false))).toBe(' red-pastille--famille red-pastille--proprietaire red-pastille--rattache');
  });
  it('adresse INCONNUE de notre système : fond neutre, contour gris pointillé', () => {
    expect(classesPuce(null)).toBe(' red-pastille--inconnue');
  });
  it('pas encore lue : la puce d’avant (jamais un faux « inconnue »)', () => {
    expect(classesPuce(undefined)).toBe('');
  });
  it('l’info-bulle : le nom et le rôle, puis l’adresse ; « rattaché » le dit ; l’inconnue le dit', () => {
    expect(infobullePuce('p@x.fr', F('proprietaire'))).toBe('DUPONT Jean · Propriétaire — p@x.fr');
    expect(infobullePuce('p@x.fr', { ...F('locataire', false), nom: null, role: 'Garant' })).toBe('Garant (e-mail rattaché) — p@x.fr');
    expect(infobullePuce('z@ailleurs.fr', null)).toBe('z@ailleurs.fr — adresse extérieure, inconnue de notre système');
    expect(infobullePuce('z@ailleurs.fr', undefined)).toBe('z@ailleurs.fr');
  });
});

describe('les familles que la liste du bien porte déjà : la plus proche du bien l’emporte', () => {
  it('première ligne trouvée dans l’ordre des groupes (clients, immeuble, autres) ; adresse comparée sans la casse', () => {
    const groupes = rangerSuggestions({
      clients: [{ adresse: 'Double@x.fr', nom: 'DUPONT Jean', role: 'Propriétaire', ton: 'proprietaire', propre: true, civilite: null, nomFamille: null }],
      immeuble: [
        { adresse: 'double@x.fr', nom: 'Gardien', role: 'Gardien', ton: 'immeuble', propre: true, civilite: null, nomFamille: null },
        { adresse: 'syndic@x.fr', nom: 'Cabinet', role: 'Syndic — e-mail général', ton: 'syndic', propre: true, civilite: null, nomFamille: null },
      ],
    });
    const f = famillesDesSuggestions(groupes);
    expect(f['double@x.fr']).toEqual({ ton: 'proprietaire', propre: true, nom: 'DUPONT Jean', role: 'Propriétaire' });
    expect(f['syndic@x.fr']?.ton).toBe('syndic');
    expect(famillesDesSuggestions(null)).toEqual({});
  });
});

// ── LE CONTRASTE, CALCULÉ ─────────────────────────────────────────────────────────────────────────────────────────
const racine = join(__dirname, '..', '..');
const css = readFileSync(join(racine, 'globals.css'), 'utf8');
const redaction = readFileSync(join(racine, '(admin)', 'admin', '(protected)', 'gestion', 'Redaction.tsx'), 'utf8');
/** Les jetons d'un bloc : le premier `--x: #hex` rencontré APRÈS le marqueur. */
const jetons = (depuis: number): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of css.slice(depuis).matchAll(/--(color-svv-[a-z-]+):\s*(#[0-9a-f]{6})\b/gi)) if (out[m[1]] === undefined) out[m[1]] = m[2];
  return out;
};
const CLAIR = jetons(0);
const SOMBRE = jetons(css.indexOf(".svv-adm-root[data-theme='dark'] {"));
const rgb = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const melange = (a: string, pct: number, b: string): number[] => rgb(a).map((v, i) => (v * pct + rgb(b)[i] * (100 - pct)) / 100);
const lum = (c: number[]): number => {
  const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (x: number[], y: number[]): number => { const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05); };
/** Les doses de la règle CSS : la commune (repli de `var(--red-puce-dose, N%)`), et celle d'un ton qui la surcharge. */
const doseCommune = (pale: boolean): number => Number(new RegExp(`var\\(--red-puce-dose${pale ? '-pale' : ''},(\\d+)%\\)`).exec(redaction)?.[1]);
const doseDe = (ton: string, pale: boolean): number => {
  const regle = new RegExp(`\\.red-pastille--${ton}[^{]*\\{([^}]*)\\}`).exec(redaction)?.[1] ?? '';
  const m = new RegExp(`--red-puce-dose${pale ? '-pale' : ''}:(\\d+)%`).exec(regle);
  return m ? Number(m[1]) : doseCommune(pale);
};
const TONS: Record<string, string> = {
  proprietaire: 'color-svv-red', locataire: 'color-svv-green', ancien_locataire: 'color-svv-violet',
  syndic: 'color-svv-syndic-bord', immeuble: 'color-svv-syndic-bord', neutre: 'color-svv-muted',
};

describe('🔴 contraste AA : le texte (encre) et le « × » sur chaque fond, en Clair et en Sombre', () => {
  it('la règle CSS teinte le FOND seulement, le texte reste l’encre ; doses lues dans la vraie règle', () => {
    expect([doseCommune(false), doseCommune(true)]).toEqual([20, 8]);
    expect([doseDe('syndic', false), doseDe('immeuble', true), doseDe('locataire', false)]).toEqual([50, 22, 20]);
    expect(redaction).toContain('border-color:color-mix(in srgb,var(--red-puce-ton) var(--red-puce-dose,20%),var(--color-svv-surface));color:var(--color-svv-ink)}');
    expect(redaction).toContain('.red-pastille--inconnue{background:var(--color-svv-surface);border:1px dashed var(--color-svv-muted);color:var(--color-svv-ink)}');
    expect(redaction).toContain('.red-pastille--famille .red-retirer,.red-pastille--inconnue .red-retirer{color:var(--color-svv-ink)}');
    for (const ton of Object.keys(TONS)) expect(redaction).toContain(`.red-pastille--${ton}`);
  });
  for (const [nom, t] of [['Clair', CLAIR], ['Sombre', SOMBRE]] as const) {
    it(`${nom} : chaque famille, propre et rattachée, et l’inconnue ≥ 4,5:1`, () => {
      const encre = rgb(t['color-svv-ink']);
      for (const [ton, jeton] of Object.entries(TONS)) {
        for (const pct of [doseDe(ton, false), doseDe(ton, true)]) {
          const c = contraste(encre, melange(t[jeton], pct, t['color-svv-surface']));
          expect(c, `${nom} ${ton} ${pct}%`).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(contraste(encre, rgb(t['color-svv-surface']))).toBeGreaterThanOrEqual(4.5);
    });
  }
});
