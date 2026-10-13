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
  proprietaire: 'color-svv-proprio', locataire: 'color-svv-green', ancien_locataire: 'color-svv-violet',
  syndic: 'color-svv-syndic-bord', immeuble: 'color-svv-syndic-bord', neutre: 'color-svv-muted',
  /* LOT PASTILLE-TIERS-INDEPENDANT-DANS-LES-SUGGESTIONS — le bleu du tiers indépendant, éprouvé comme les autres. */
  independant: 'color-svv-blue',
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
        const fonds = ton === 'proprietaire'
          ? [rgb(t['color-svv-proprio-trame']), rgb(t['color-svv-proprio-trame-pale'])]   // trame dédiée (lot PROFIL-GESTION)
          : [doseDe(ton, false), doseDe(ton, true)].map((pct) => melange(t[jeton], pct, t['color-svv-surface']));
        for (const fond of fonds) expect(contraste(encre, fond), `${nom} ${ton}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contraste(encre, rgb(t['color-svv-surface']))).toBeGreaterThanOrEqual(4.5);
    });
  }
});

// ── 🔴 LOT PROFIL-GESTION-ET-ROUGE-PROPRIETAIRE — LE ROUGE PROPRIÉTAIRE : PUR, FRANC, DISTINCT DU ROSE ET DU VIOLET ─────
const teinte = (c: number[]): number => {
  const [r, g, b] = c.map((v) => v / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const ecart = (a: number, b: number): number => { const x = Math.abs(a - b) % 360; return x > 180 ? 360 - x : x; };
describe('🔴 la trame propriétaire : rouge pur (sans jaune), distincte du rose immeuble et du violet', () => {
  for (const [nom, t] of [['Clair', CLAIR], ['Sombre', SOMBRE]] as const) {
    it(`${nom} : teinte 0° (vert = bleu), et à plus de 25° du rose et du violet`, () => {
      for (const j of ['color-svv-proprio', 'color-svv-proprio-trame', 'color-svv-proprio-trame-pale']) {
        const [, g, b] = rgb(t[j]);
        expect(g, `${nom} ${j} : pas de jaune`).toBe(b);
        expect(teinte(rgb(t[j]))).toBe(0);
      }
      const rose = melange(t['color-svv-syndic-bord'], doseDe('syndic', false), t['color-svv-surface']);
      const violet = melange(t['color-svv-violet'], doseDe('ancien_locataire', false), t['color-svv-surface']);
      expect(ecart(teinte(rgb(t['color-svv-proprio-trame'])), teinte(rose))).toBeGreaterThan(25);
      expect(ecart(teinte(rgb(t['color-svv-proprio-trame'])), teinte(violet))).toBeGreaterThan(25);
    });
  }
  it('les autres familles ne bougent pas : vert, violet, rose, gris gardent leur jeton et leur dose', () => {
    expect(redaction).toContain('.red-pastille--locataire{--red-puce-ton:var(--color-svv-green)}');
    expect(redaction).toContain('.red-pastille--ancien_locataire{--red-puce-ton:var(--color-svv-violet)}');
    expect(redaction).toContain('.red-pastille--syndic,.red-pastille--immeuble{--red-puce-ton:var(--color-svv-syndic-bord);--red-puce-dose:50%;--red-puce-dose-pale:22%}');
    expect(redaction).toContain('.red-pastille--neutre{--red-puce-ton:var(--color-svv-muted)}');
    expect(redaction).toContain('.red-sugg-pastille--proprietaire{--red-sugg-ton:var(--color-svv-proprio)}');
  });
});

describe('🔴 LOT NOUVEAU-MESSAGE-CONTEXTE-BIEN-PAR-CLIENT — « à choisir » : fond de surface, contour plein, texte à l’encre', () => {
  const regle = '.red-pastille--famille.red-pastille--a-choisir{background:var(--color-svv-surface);border:1.5px solid var(--red-puce-ton)}';
  it('la règle existe, et vient APRÈS la trame propriétaire (même poids : la dernière gagne)', () => {
    expect(redaction).toContain(regle);
    expect(redaction.indexOf(regle)).toBeGreaterThan(redaction.indexOf('.red-pastille--famille.red-pastille--proprietaire{'));
  });
  for (const [nom, t] of [['Clair', CLAIR], ['Sombre', SOMBRE]] as const) {
    it(`${nom} : l’encre sur la surface ≥ 4,5:1`, () => {
      expect(contraste(rgb(t['color-svv-ink']), rgb(t['color-svv-surface']))).toBeGreaterThanOrEqual(4.5);
    });
  }
});
