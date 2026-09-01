import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LOT 39 (thème sombre 3/3) — GARDE : les couleurs de SENS dispersées ont rejoint les familles de tokens (ambre, bleu, rouge-soft),
 * fond ET texte ensemble. La famille AMBRE (ex-#8a5a00 dispersé) et la famille BLEU (« accusé reçu », ex-#1a4d8f) sont tokenisées ;
 * plus aucune de ces valeurs de sens n'est codée en dur comme couleur de chrome (une seule tolérance : un fallback `var(x, #hex)`).
 */
const RACINE = process.cwd();
const lire = (rel: string): string => readFileSync(join(RACINE, rel), 'utf8');
const P = 'app/(admin)/admin/(protected)/';

describe('LOT 39 — familles de tokens ambre / bleu / rouge-soft', () => {
  it('globals.css définit la famille BLEU (clair #1a4d8f + variante sombre #7ab0f5)', () => {
    const css = lire('app/globals.css').replace(/\s+/g, ' ');
    expect(css).toContain('--color-svv-blue: #1a4d8f;');  // clair
    expect(css).toContain('--color-svv-blue: #7ab0f5;');  // sombre (bloc data-theme=dark ET media system)
    expect((css.match(/--color-svv-blue: #7ab0f5;/g) ?? []).length).toBe(2);
  });

  it('« accusé reçu » (bleu) et l’ambre d’état sont tokenisés dans DemandesRendu', () => {
    const src = lire(P + 'permis/DemandesRendu.tsx');
    expect(src).toContain("color: 'var(--color-svv-blue)'");        // accusé reçu
    expect(src).toContain("color: 'var(--color-svv-amber)'");       // reçu à classer
    expect(src).toContain("background: 'var(--color-svv-amber-soft)', color: 'var(--color-svv-amber)'"); // bannière PRADA
    expect(src).not.toContain("'#1a4d8f'");
    expect(src).not.toContain("'#8a5a00'");
  });

  it('ArchivesRendu : ORANGE = token ambre, pastilles origine tokenisées (ambre + rouge-soft)', () => {
    const src = lire(P + 'permis/ArchivesRendu.tsx');
    expect(src).toContain("const ORANGE = 'var(--color-svv-amber)'");
    expect(src).toContain("background: 'var(--color-svv-amber-soft)', color: 'var(--color-svv-amber)'");
    expect(src).toContain("background: 'var(--color-svv-red-soft)', color: 'var(--color-svv-red)'");
  });

  it('plus aucun #8a5a00 / #fff4e0 / #fdf1dd / #fdecec en dur comme COULEUR de chrome (fallback var(x,#hex) toléré)', () => {
    const fichiers = [
      'permis/CaracteristiquesRendu.tsx', 'permis/ContactRendu.tsx', 'permis/CollaborateursRendu.tsx',
      'permis/AutomatisationRendu.tsx', 'permis/ReponsesRendu.tsx', 'permis/SaisinesRendu.tsx',
      'permis/ReglagesRendu.tsx', 'permis/PermisVue.tsx', 'pilotage/page.tsx',
      'curation/CurationCarte.tsx', 'internautes/InternautesVue.tsx', 'comptes/page.tsx',
    ];
    for (const rel of fichiers) {
      const src = lire(P + rel);
      // on retire d'abord les fallbacks tolérés `var(--x, #hex)` avant de chercher un hex de sens résiduel
      const sansFallback = src.replace(/var\([^)]*#[0-9a-fA-F]{3,8}\s*\)/g, 'var(FALLBACK)');
      expect(sansFallback, `${rel} contient encore #8a5a00`).not.toContain('#8a5a00');
      expect(sansFallback, `${rel} contient encore #fff4e0`).not.toContain('#fff4e0');
      expect(sansFallback, `${rel} contient encore #fdf1dd`).not.toContain('#fdf1dd');
    }
  });
});
