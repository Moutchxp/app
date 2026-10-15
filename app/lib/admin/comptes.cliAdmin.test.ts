import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ══ AUDIT POINT 11 (15/10/2026) — DÉSACTIVER / RÉACTIVER UN ADMINISTRATEUR, EN LIGNE DE COMMANDE ══════════════════════════
 * Le trou : un administrateur ne pouvait être désactivé qu'en SQL à la main (l'écran ne le permet pas, par décision R-D ;
 * la CLI n'avait pas de commande). Désormais : `npm run admin:desactiver` / `admin:reactiver` — sur le serveur, avec
 * confirmation, journal (`admin_utilisateur_log`), jamais le DERNIER administrateur actif, et sessions révoquées.
 */
const queryMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...a),
  withTransaction: (fn: (q: (...a: unknown[]) => unknown) => unknown) => fn((...a: unknown[]) => queryMock(...a)),
}));
vi.mock('./motDePasse', () => ({ hacher: (c: string) => Promise.resolve(`HASH:${c}`) }));

import { desactiverCompteCli, reactiverCompteCli } from './comptes';

beforeEach(() => queryMock.mockReset());
const sql = (i: number) => String(queryMock.mock.calls[i][0]).replace(/\s+/g, ' ');

describe('desactiverCompteCli', () => {
  it('administrateur actif (pas le dernier) → désactivé, journalisé « desactivation » via la CLI, sessions révoquées', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{}] })                                   // verrou consultatif
      .mockResolvedValueOnce({ rows: [{ id: 2, role: 'administrateur', actif: true, admins_actifs: 2 }] }) // lecture
      .mockResolvedValueOnce({ rows: [{ id: 2 }] })                            // UPDATE + journal
      .mockResolvedValueOnce({ rows: [{ n: 1 }] })                             // colonne session_version présente ?
      .mockResolvedValueOnce({ rows: [] });                                    // révocation
    expect(await desactiverCompteCli('Admin2@X.fr')).toBe('fait');
    expect(sql(0)).toContain('pg_advisory_xact_lock');
    expect(sql(1)).toContain('lower(identifiant) = lower($1)');
    expect(queryMock.mock.calls[1][1]).toEqual(['Admin2@X.fr']);
    expect(sql(2)).toContain('UPDATE admin_utilisateur SET actif = false');
    expect(sql(2)).toContain("'desactivation'");
    expect(sql(2)).toContain("'via', 'cli'");
    expect(sql(4)).toContain('session_version = session_version + 1');
  });

  it('le DERNIER administrateur actif → refusé, aucune écriture', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'administrateur', actif: true, admins_actifs: 1 }] });
    expect(await desactiverCompteCli('arno@x.fr')).toBe('dernier_administrateur');
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it('compte inconnu → « introuvable » ; déjà inactif → « deja » ; aucune écriture', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{}] }).mockResolvedValueOnce({ rows: [] });
    expect(await desactiverCompteCli('fantome@x.fr')).toBe('introuvable');
    queryMock.mockReset();
    queryMock.mockResolvedValueOnce({ rows: [{}] }).mockResolvedValueOnce({ rows: [{ id: 2, role: 'administrateur', actif: false, admins_actifs: 1 }] });
    expect(await desactiverCompteCli('admin2@x.fr')).toBe('deja');
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it('migration 356 absente (pas de colonne session_version) → désactivé quand même, sans requête de révocation', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{ id: 3, role: 'collaborateur', actif: true, admins_actifs: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 3 }] })
      .mockResolvedValueOnce({ rows: [{ n: 0 }] });
    expect(await desactiverCompteCli('lea@x.fr')).toBe('fait');
    expect(queryMock).toHaveBeenCalledTimes(4);
  });
});

describe('reactiverCompteCli', () => {
  it('compte inactif (administrateur compris) → réactivé, journalisé « reactivation » via la CLI', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 2, actif: false }] }).mockResolvedValueOnce({ rows: [{ id: 2 }] });
    expect(await reactiverCompteCli('admin2@x.fr')).toBe('fait');
    expect(sql(1)).toContain('UPDATE admin_utilisateur SET actif = true');
    expect(sql(1)).toContain("'reactivation'");
    expect(sql(1)).toContain("'via', 'cli'");
  });

  it('inconnu → « introuvable » ; déjà actif → « deja »', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await reactiverCompteCli('fantome@x.fr')).toBe('introuvable');
    queryMock.mockResolvedValueOnce({ rows: [{ id: 2, actif: true }] });
    expect(await reactiverCompteCli('admin2@x.fr')).toBe('deja');
  });
});

describe('la commande npm', () => {
  it('admin:desactiver et admin:reactiver existent, avec confirmation en tapant l’adresse du compte', async () => {
    const { readFileSync } = await import('node:fs');
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['admin:desactiver']).toBe('tsx app/scripts/admin.ts desactiver');
    expect(pkg.scripts['admin:reactiver']).toBe('tsx app/scripts/admin.ts reactiver');
    const script = readFileSync('app/scripts/admin.ts', 'utf8');
    expect(script).toMatch(/case 'desactiver': \{[\s\S]*?confirmerParIdentifiant[\s\S]*?desactiverCompteCli/);
    expect(script).toMatch(/case 'reactiver': \{[\s\S]*?confirmerParIdentifiant[\s\S]*?reactiverCompteCli/);
  });
});
