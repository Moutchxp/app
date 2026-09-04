import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * LOT 84 — GARDE PAR LECTURE DE SOURCE (thème sombre) : aucun fond CLAIR en dur sous texte token dans la ligne permis (bloc « Les
 * bâtiments » / « Le permis ») ni dans les briques du schéma. On interdit la réapparition des hex CLAIRS retirés (fonds d'encadrés
 * d'aide, violet « à confirmer », bleu des sources) — remplacés par des tokens qui basculent avec le thème.
 *
 * 🔴 EXCEPTIONS ASSUMÉES (zones volontairement CLAIRES, cf. LOTs 82/83) : le CANVAS du schéma (`background:'#fff'`) et les couleurs
 *    FIXES des étiquettes (#1b1b1b/#ffffff/#a30402) restent en dur — elles sont posées SUR un canvas clair permanent, jamais sur une
 *    surface qui bascule. La garde ne cible donc QUE les hex clairs employés comme FOND de contenu textuel (rosés/violets).
 */
const ici = dirname(fileURLToPath(import.meta.url));
const lire = (f: string) => readFileSync(join(ici, f), 'utf8');

// Hex CLAIRS retirés au LOT 84 : ils étaient des FONDS de contenu (jamais du canvas) → ne doivent plus jamais réapparaître.
const HEX_FONDS_CLAIRS_RETIRES = ['#fff8f8', '#faf5ff', '#f3e8ff'];
// Hex de TEXTE/bordure retirés (bleu sources, violet « à confirmer ») → tokenisés.
const HEX_TEXTE_RETIRES = ['#1a5fb4', '#7d3ac1'];

describe('LOT 84 — thème sombre : plus de fond/texte clair en dur sous texte token', () => {
  for (const f of ['CaracteristiquesRendu.tsx', 'TraceEmpriseRendu.tsx']) {
    it(`${f} : aucun hex clair d'encadré/violet/bleu source en dur (tokens obligatoires)`, () => {
      const src = lire(f);
      for (const hex of [...HEX_FONDS_CLAIRS_RETIRES, ...HEX_TEXTE_RETIRES]) expect(src, `${hex} doit être remplacé par un token`).not.toContain(hex);
    });
  }

  it('CaracteristiquesRendu : les constantes de couleur sont des tokens (basculent avec le thème)', () => {
    const src = lire('CaracteristiquesRendu.tsx');
    expect(src).toContain("BLEU_SOURCE = 'var(--color-svv-lien-source)'");
    expect(src).toContain("VIOLET_A_CONFIRMER = 'var(--color-svv-violet)'");
    // styleNote + carte d'édition du sommet : fonds tokenisés
    expect(src).toContain("background: 'var(--color-svv-note-bg)'");
    expect(src).toContain("'var(--color-svv-violet-faint)'");
    expect(src).toContain("background: 'var(--color-svv-violet-soft)'");
  });

  it('globals.css : les 5 nouveaux tokens ont une valeur claire ET une valeur sombre (dark + system)', () => {
    const css = readFileSync(join(ici, '..', '..', '..', '..', 'globals.css'), 'utf8');
    for (const t of ['--color-svv-note-bg', '--color-svv-violet', '--color-svv-violet-soft', '--color-svv-violet-faint', '--color-svv-lien-source']) {
      // 3 déclarations attendues : :root (clair) + [data-theme='dark'] + [data-theme='system']
      const n = css.split(t).length - 1;
      expect(n, `${t} doit être déclaré en clair + dark + system`).toBeGreaterThanOrEqual(3);
    }
    // non-régression CLAIR : la valeur claire des tokens = l'hex historique EXACT
    expect(css).toContain('--color-svv-note-bg: #fff8f8;');
    expect(css).toContain('--color-svv-violet: #7d3ac1;');
    expect(css).toContain('--color-svv-lien-source: #1a5fb4;');
  });
});
