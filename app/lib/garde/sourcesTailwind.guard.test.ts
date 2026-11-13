import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 🔴 GARDE DU BUILD (13/11/2026) — en production, `data` est un LIEN SYMBOLIQUE vers `shared/data`, hors du projet. La détection automatique des
 * sources de Tailwind le suivait (le lien n'est pas ignoré par git : seuls ses sous-dossiers le sont), et Turbopack (Next 16.4) refuse alors le
 * build : « webpack loader path …/shared/data is outside configured roots ». Sur le Mac, `data` est un vrai dossier : l'erreur ne s'y voit pas.
 * Les dossiers de données restent donc EXCLUS explicitement dans `app/globals.css`.
 */
const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

describe('🔴 Tailwind ne parcourt jamais les dossiers de données', () => {
  it.each(['../data', '../.captures', '../sauvegardes', '../.minio'])('@source not "%s"', (dossier) => {
    expect(css).toContain(`@source not "${dossier}";`);
  });
  it('les exclusions suivent l’import de Tailwind', () => {
    expect(css.indexOf('@import "tailwindcss";')).toBe(0);
    expect(css.indexOf('@source not "../data";')).toBeGreaterThan(0);
  });
});
