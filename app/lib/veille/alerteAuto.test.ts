import { describe, it, expect, vi, beforeEach } from 'vitest';

// L'alerte réelle écrit en base : on mocke le client DB pour éprouver le SQL émis (fragments) sans connexion.
// L'orchestration est éprouvée par INJECTION (aucun accès DB réel, aucun SMTP).
vi.mock('../db/client', () => ({ query: vi.fn(), withTransaction: vi.fn() }));

import { query } from '../db/client';
import { executerAlerteAuto, depsReellesAlerte, type DepsAlerteAuto } from './alerteAuto';

const queryMock = vi.mocked(query as unknown as (...a: unknown[]) => Promise<{ rows: unknown[] }>);
beforeEach(() => { queryMock.mockReset(); });

function makeDeps(over: Partial<DepsAlerteAuto> = {}): DepsAlerteAuto {
  return {
    maintenant: () => new Date('2026-04-20T09:00:00Z'),
    lireConfig: vi.fn(async () => ({ active: true, email: 'suivi@sansvisavis.com', heureLocale: 8 })),
    heureLocaleCourante: () => 9, // ≥ 8
    alerteFaiteAujourdHui: vi.fn(async () => false),
    composer: vi.fn(async () => ({ sujet: 'Suivi CRPA', corps: 'CORPS' })),
    marquerRienADire: vi.fn(async () => {}),
    insererRun: vi.fn(async () => 7),
    finaliserRun: vi.fn(async () => {}),
    envoyer: vi.fn(async () => {}),
    ...over,
  };
}

describe('R8 — executerAlerteAuto : conditions d’envoi (aucune ligne si non réunies)', () => {
  it('désactivée → ignore, aucune ligne, ne compose même pas', async () => {
    const composer = vi.fn(async () => ({ sujet: 's', corps: 'c' }));
    const insererRun = vi.fn(async () => 7);
    const marquerRienADire = vi.fn(async () => {});
    const r = await executerAlerteAuto(makeDeps({ lireConfig: vi.fn(async () => ({ active: false, email: 'x@y.fr', heureLocale: 8 })), composer, insererRun, marquerRienADire }));
    expect(r.resultat).toBe('ignore');
    expect(composer).not.toHaveBeenCalled();
    expect(insererRun).not.toHaveBeenCalled();
    expect(marquerRienADire).not.toHaveBeenCalled();
  });

  it('e-mail vide → ignore, aucune ligne', async () => {
    const insererRun = vi.fn(async () => 7);
    const r = await executerAlerteAuto(makeDeps({ lireConfig: vi.fn(async () => ({ active: true, email: '   ', heureLocale: 8 })), insererRun }));
    expect(r.resultat).toBe('ignore');
    expect(insererRun).not.toHaveBeenCalled();
  });

  it('heure non atteinte → ignore, aucune ligne', async () => {
    const insererRun = vi.fn(async () => 7);
    const r = await executerAlerteAuto(makeDeps({ heureLocaleCourante: () => 7, insererRun })); // 7 < 8
    expect(r.resultat).toBe('ignore');
    expect(insererRun).not.toHaveBeenCalled();
  });

  it('déjà traitée aujourd’hui → ignore, aucune ligne', async () => {
    const insererRun = vi.fn(async () => 7);
    const marquerRienADire = vi.fn(async () => {});
    const r = await executerAlerteAuto(makeDeps({ alerteFaiteAujourdHui: vi.fn(async () => true), insererRun, marquerRienADire }));
    expect(r.resultat).toBe('ignore');
    expect(insererRun).not.toHaveBeenCalled();
    expect(marquerRienADire).not.toHaveBeenCalled();
  });
});

describe('R8 — executerAlerteAuto : composition et envoi', () => {
  it('composerAlerte null → ligne « rien_a_dire », AUCUN envoi', async () => {
    const marquerRienADire = vi.fn(async () => {});
    const insererRun = vi.fn(async () => 7);
    const envoyer = vi.fn(async () => {});
    const r = await executerAlerteAuto(makeDeps({ composer: vi.fn(async () => null), marquerRienADire, insererRun, envoyer }));
    expect(r.resultat).toBe('rien_a_dire');
    expect(marquerRienADire).toHaveBeenCalledTimes(1);
    expect(insererRun).not.toHaveBeenCalled();
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('succès → insererRun (en_cours) PUIS finaliserRun « envoyee »', async () => {
    const insererRun = vi.fn(async () => 7);
    const finaliserRun = vi.fn(async () => {});
    const envoyer = vi.fn(async () => {});
    const r = await executerAlerteAuto(makeDeps({ insererRun, finaliserRun, envoyer }));
    expect(r.resultat).toBe('envoyee');
    expect(insererRun).toHaveBeenCalledWith('suivi@sansvisavis.com', 'Suivi CRPA', 'CORPS');
    expect(envoyer).toHaveBeenCalledWith('suivi@sansvisavis.com', 'Suivi CRPA', 'CORPS');
    expect(finaliserRun).toHaveBeenCalledWith(7, expect.objectContaining({ resultat: 'envoyee' }));
  });

  it('ISOLATION : un échec d’envoi → ligne « erreur » et NE JETTE PAS (issue « erreur »)', async () => {
    const insererRun = vi.fn(async () => 7);
    const finaliserRun = vi.fn(async () => {});
    const r = await executerAlerteAuto(makeDeps({ insererRun, finaliserRun, envoyer: vi.fn(async () => { throw new Error('SMTP down'); }) }));
    expect(r.resultat).toBe('erreur');
    expect(r.raison).toContain('SMTP down');
    expect(insererRun).toHaveBeenCalledTimes(1);
    expect(finaliserRun).toHaveBeenCalledWith(7, expect.objectContaining({ resultat: 'erreur', erreur: 'SMTP down' }));
  });
});

describe('R8 — depsReellesAlerte : SQL émis (fragments sémantiques, paramètres liés)', () => {
  it('alerteFaiteAujourdHui : anti-doublon du jour (envoyee|rien_a_dire, date du jour)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ fait: true }] });
    const fait = await depsReellesAlerte().alerteFaiteAujourdHui();
    expect(fait).toBe(true);
    const norm = (queryMock.mock.calls[0][0] as string).replace(/\s+/g, ' ');
    expect(norm).toContain('FROM alerte_run');
    expect(norm).toContain("resultat IN ('envoyee','rien_a_dire')");
    expect(norm).toContain("date_trunc('day', now())");
  });

  it('marquerRienADire : INSERT alerte_run « rien_a_dire »', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await depsReellesAlerte().marquerRienADire();
    const norm = (queryMock.mock.calls[0][0] as string).replace(/\s+/g, ' ');
    expect(norm).toContain('INSERT INTO alerte_run');
    expect(norm).toContain("'rien_a_dire'");
  });

  it('insererRun : ligne « en_cours » avec destinataire/sujet/corps liés', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 12 }] });
    const id = await depsReellesAlerte().insererRun('a@b.fr', 'SUJ', 'CORPS');
    expect(id).toBe(12);
    const norm = (queryMock.mock.calls[0][0] as string).replace(/\s+/g, ' ');
    expect(norm).toContain('INSERT INTO alerte_run');
    expect(norm).toContain("'en_cours'");
    expect(queryMock.mock.calls[0][1]).toEqual(['a@b.fr', 'SUJ', 'CORPS']);
  });

  it('finaliserRun : UPDATE alerte_run (résultat, envoye_le, erreur liés)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const t = new Date('2026-04-20T09:00:05Z');
    await depsReellesAlerte().finaliserRun(12, { resultat: 'envoyee', envoyeLe: t });
    const norm = (queryMock.mock.calls[0][0] as string).replace(/\s+/g, ' ');
    expect(norm).toContain('UPDATE alerte_run SET resultat = $2');
    expect(queryMock.mock.calls[0][1]).toEqual([12, 'envoyee', t, null]);
  });
});
