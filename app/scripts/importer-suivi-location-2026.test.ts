import { describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { RACINE_PROJET } from '../lib/ops/rapportScript';

/**
 * Arno (23/10/2026) — l'import de l'historique en PRODUCTION lit ses 7 fichiers dans un dossier hors des versions : l'option
 * `--dossier` du script `location:importer-suivi` (les deux écritures ; absente : `.captures/suivi-location/`, comme avant).
 */
describe('🔴 importer-suivi : --dossier', () => {
  it('--dossier=<chemin> et --dossier <chemin> ; absent : .captures/suivi-location/ du projet', async () => {
    const { dossierDesFichiers } = await import('./importer-suivi-location-2026');
    expect(dossierDesFichiers(['--tous', '--dossier=/home/ubuntu/sansvisavis/shared/import-location'])).toBe('/home/ubuntu/sansvisavis/shared/import-location');
    expect(dossierDesFichiers(['--tous', '--dossier', '/home/ubuntu/sansvisavis/shared/import-location', '--reel'])).toBe('/home/ubuntu/sansvisavis/shared/import-location');
    expect(dossierDesFichiers(['--tous', '--dossier', 'import'])).toBe(resolve('import'));
    expect(dossierDesFichiers(['--tous'])).toBe(join(RACINE_PROJET, '.captures/suivi-location'));
    expect(dossierDesFichiers(['--tous', '--dossier', '--reel'])).toBe(join(RACINE_PROJET, '.captures/suivi-location'));
  });
});
