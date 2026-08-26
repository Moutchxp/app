import { describe, it, expect, vi } from 'vitest';
import { executerAlerteObstacleDisparu, type DepsAlerteObstacleDisparu } from './alerteObstacleDisparuAuto';
import type { CandidatObstacleDisparu, ObstacleDisparu } from './alerteObstacleDisparu';

// Un certificat dont l'obstacle a RÉELLEMENT disparu (absent + non couvert), et un dont c'est une RE-NUMÉROTATION (couvert).
const VIDE: CandidatObstacleDisparu = { certificatId: 14, numero: 'SAVV-2026-000001', adresse: 'Asnières', cleabs: 'BAT-VIDE', present: false, couvert: false, dejaAlerte: false };
const RENUM: CandidatObstacleDisparu = { certificatId: 15, numero: 'SAVV-2026-000002', adresse: null, cleabs: 'BAT-RENUM', present: false, couvert: true, dejaAlerte: false };

function makeDeps(over: Partial<DepsAlerteObstacleDisparu> = {}): DepsAlerteObstacleDisparu {
  return {
    lireConfig: vi.fn(async () => ({ active: true, email: 'arno@exemple.fr' })),
    chargerCandidats: vi.fn(async () => [VIDE, RENUM]),
    envoyer: vi.fn(async (_to: string, _s: string, _c: string) => { void _to; void _s; void _c; }),
    marquerAlertes: vi.fn(async (_d: ObstacleDisparu[]) => { void _d; }),
    ...over,
  };
}

describe('ALERTE obstacle disparu — executerAlerteObstacleDisparu', () => {
  it('interrupteur OFF → RIEN (aucun chargement, aucun envoi, aucun marquage)', async () => {
    const chargerCandidats = vi.fn(async () => [VIDE]);
    const envoyer = vi.fn(async () => {});
    const marquerAlertes = vi.fn(async () => {});
    const deps = makeDeps({ lireConfig: vi.fn(async () => ({ active: false, email: 'arno@exemple.fr' })), chargerCandidats, envoyer, marquerAlertes });
    const r = await executerAlerteObstacleDisparu(deps);
    expect(r).toEqual({ examines: 0, aAlerter: 0, envoye: false });
    expect(chargerCandidats).not.toHaveBeenCalled();
    expect(envoyer).not.toHaveBeenCalled();
    expect(marquerAlertes).not.toHaveBeenCalled();
  });

  it('adresse d’alerte vide → RIEN', async () => {
    const envoyer = vi.fn(async () => {});
    const deps = makeDeps({ lireConfig: vi.fn(async () => ({ active: true, email: '  ' })), envoyer });
    expect((await executerAlerteObstacleDisparu(deps)).envoye).toBe(false);
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('emprise réellement vidée sous un certificat → UN e-mail ; la re-numérotation est EXCLUE ; seul le vidé est marqué', async () => {
    const envoyer = vi.fn(async (_to: string, _s: string, _c: string) => { void _to; void _s; void _c; });
    const marquerAlertes = vi.fn(async (_d: ObstacleDisparu[]) => { void _d; });
    const deps = makeDeps({ envoyer, marquerAlertes });
    const r = await executerAlerteObstacleDisparu(deps);
    expect(r).toEqual({ examines: 2, aAlerter: 1, envoye: true });
    expect(envoyer).toHaveBeenCalledTimes(1);
    expect(envoyer.mock.calls[0][0]).toBe('arno@exemple.fr');
    expect(envoyer.mock.calls[0][2]).toContain('SAVV-2026-000001'); // le vidé
    expect(envoyer.mock.calls[0][2]).not.toContain('SAVV-2026-000002'); // la re-numérotation exclue
    expect(marquerAlertes.mock.calls[0][0].map((d) => d.certificatId)).toEqual([14]);
  });

  it('certificat déjà alerté → PAS de second envoi', async () => {
    const envoyer = vi.fn(async () => {});
    const deps = makeDeps({ chargerCandidats: vi.fn(async () => [{ ...VIDE, dejaAlerte: true }]), envoyer });
    expect((await executerAlerteObstacleDisparu(deps)).envoye).toBe(false);
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('aucun certificat concerné (liste vide, ou que des re-numérotations) → rien, PAS un échec', async () => {
    const envoyer = vi.fn(async () => {});
    expect((await executerAlerteObstacleDisparu(makeDeps({ chargerCandidats: vi.fn(async () => []), envoyer }))).envoye).toBe(false);
    expect((await executerAlerteObstacleDisparu(makeDeps({ chargerCandidats: vi.fn(async () => [RENUM]), envoyer }))).envoye).toBe(false);
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('l’ENVOI précède le MARQUAGE : un envoi qui ÉCHOUE ne marque RIEN (retenté) et relaie', async () => {
    const ordre: string[] = [];
    const envoyer = vi.fn(async () => { ordre.push('envoyer'); throw new Error('SMTP KO'); });
    const marquerAlertes = vi.fn(async () => { ordre.push('marquer'); });
    const deps = makeDeps({ envoyer, marquerAlertes });
    await expect(executerAlerteObstacleDisparu(deps)).rejects.toThrow('SMTP KO');
    expect(ordre).toEqual(['envoyer']);
    expect(marquerAlertes).not.toHaveBeenCalled();
  });
});
