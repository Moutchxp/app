import { describe, it, expect, vi } from 'vitest';
import { lireConfigAlerteMaj } from './alerteMisesAJourRepo';

/**
 * FRAÎCHEUR / G4 — repli de configuration. Cœur : MIGRATION 144 ABSENTE → la lecture de alerte_maj_active jette → interrupteur
 * false → AUCUN envoi possible entre le commit et l'application. Requête injectée → aucun accès base.
 */

type Req = <R>(text: string, params?: unknown[]) => Promise<{ rows: R[] }>;

describe('lireConfigAlerteMaj', () => {
  it('MIGRATION ABSENTE (colonne alerte_maj_active manquante → requête en échec) → { active:false } (aucun envoi)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reqKo = (async () => { throw new Error('column "alerte_maj_active" does not exist'); }) as Req;
    const cfg = await lireConfigAlerteMaj(reqKo);
    expect(cfg.active).toBe(false);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('migration appliquée + interrupteur activé → { active:true, email }', async () => {
    const reqOk = (async () => ({ rows: [{ alerte_maj_active: true, alerte_email: '  admin@svav.fr ' }] })) as Req;
    const cfg = await lireConfigAlerteMaj(reqOk);
    expect(cfg).toEqual({ active: true, email: 'admin@svav.fr' });
  });

  it('interrupteur désactivé en base → { active:false }', async () => {
    const reqOff = (async () => ({ rows: [{ alerte_maj_active: false, alerte_email: 'admin@svav.fr' }] })) as Req;
    expect((await lireConfigAlerteMaj(reqOff)).active).toBe(false);
  });
});
