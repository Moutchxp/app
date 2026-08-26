import { describe, it, expect, vi } from 'vitest';
import { executerAlerteAttenteBati, type DepsAlerteAttenteBati } from './alerteAttenteBatiAuto';
import type { CandidatAttenteBati, DossierAAlerter } from './alerteAttenteBati';

const j = (iso: string) => new Date(iso);
const NOW = j('2026-08-26T00:00:00Z');
// Un dossier VIEUX (bien au-delà d'un an) et un RÉCENT (1 jour).
const VIEUX: CandidatAttenteBati = { dossierId: 11430, numDau: 'PC1', communeNom: 'Asnières', detecteLe: j('2024-01-01T00:00:00Z'), dejaAlerte: false };
const RECENT: CandidatAttenteBati = { dossierId: 11434, numDau: 'PC2', communeNom: null, detecteLe: j('2026-08-25T00:00:00Z'), dejaAlerte: false };

function makeDeps(over: Partial<DepsAlerteAttenteBati> = {}): DepsAlerteAttenteBati {
  return {
    maintenant: () => NOW,
    lireConfig: vi.fn(async () => ({ active: true, email: 'arno@exemple.fr', seuilJours: 365 })),
    chargerCandidats: vi.fn(async () => [VIEUX, RECENT]),
    envoyer: vi.fn(async (_to: string, _s: string, _c: string) => { void _to; void _s; void _c; }),
    marquerAlertes: vi.fn(async (_d: DossierAAlerter[]) => { void _d; }),
    ...over,
  };
}

describe('ATT-BATI — executerAlerteAttenteBati : rappel « en attente de bâti » (filet)', () => {
  it('interrupteur OFF → RIEN (aucun chargement, aucun envoi, aucun marquage)', async () => {
    const chargerCandidats = vi.fn(async () => [VIEUX]);
    const envoyer = vi.fn(async () => {});
    const marquerAlertes = vi.fn(async () => {});
    const deps = makeDeps({ lireConfig: vi.fn(async () => ({ active: false, email: 'arno@exemple.fr', seuilJours: 365 })), chargerCandidats, envoyer, marquerAlertes });

    const r = await executerAlerteAttenteBati(deps);

    expect(r).toEqual({ examines: 0, aAlerter: 0, envoye: false });
    expect(chargerCandidats).not.toHaveBeenCalled();
    expect(envoyer).not.toHaveBeenCalled();
    expect(marquerAlertes).not.toHaveBeenCalled();
  });

  it('adresse d’alerte vide → RIEN (rien à envoyer)', async () => {
    const envoyer = vi.fn(async () => {});
    const deps = makeDeps({ lireConfig: vi.fn(async () => ({ active: true, email: '   ', seuilJours: 365 })), envoyer });
    const r = await executerAlerteAttenteBati(deps);
    expect(r.envoye).toBe(false);
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('tous SOUS le seuil → aucun envoi, aucun marquage, PAS un échec', async () => {
    const envoyer = vi.fn(async () => {});
    const marquerAlertes = vi.fn(async () => {});
    const deps = makeDeps({ chargerCandidats: vi.fn(async () => [RECENT]), envoyer, marquerAlertes });

    const r = await executerAlerteAttenteBati(deps);

    expect(r).toEqual({ examines: 1, aAlerter: 0, envoye: false });
    expect(envoyer).not.toHaveBeenCalled();
    expect(marquerAlertes).not.toHaveBeenCalled();
  });

  it('AU-DELÀ du seuil et jamais alerté → UN e-mail récapitulatif + marquage des dossiers concernés (le récent est exclu)', async () => {
    const envoyer = vi.fn(async (_to: string, _s: string, _c: string) => { void _to; void _s; void _c; });
    const marquerAlertes = vi.fn(async (_d: DossierAAlerter[]) => { void _d; });
    const deps = makeDeps({ envoyer, marquerAlertes });

    const r = await executerAlerteAttenteBati(deps);

    expect(r).toEqual({ examines: 2, aAlerter: 1, envoye: true });
    expect(envoyer).toHaveBeenCalledTimes(1);
    expect(envoyer.mock.calls[0][0]).toBe('arno@exemple.fr');
    expect(envoyer.mock.calls[0][2]).toContain('PC1'); // le vieux dossier est dans le corps
    expect(envoyer.mock.calls[0][2]).not.toContain('PC2'); // le récent (sous le seuil) n'y est pas
    // marqué : uniquement le dossier alerté (11430).
    expect(marquerAlertes).toHaveBeenCalledTimes(1);
    expect(marquerAlertes.mock.calls[0][0].map((d) => d.dossierId)).toEqual([11430]);
  });

  it('déjà alerté → PAS de second envoi (un rappel par dossier)', async () => {
    const envoyer = vi.fn(async () => {});
    const deps = makeDeps({ chargerCandidats: vi.fn(async () => [{ ...VIEUX, dejaAlerte: true }]), envoyer });

    const r = await executerAlerteAttenteBati(deps);

    expect(r).toEqual({ examines: 1, aAlerter: 0, envoye: false });
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('aucun dossier en attente → rien, aucun envoi, PAS un échec', async () => {
    const envoyer = vi.fn(async () => {});
    const deps = makeDeps({ chargerCandidats: vi.fn(async () => []), envoyer });
    const r = await executerAlerteAttenteBati(deps);
    expect(r).toEqual({ examines: 0, aAlerter: 0, envoye: false });
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('l’ENVOI précède le MARQUAGE : un envoi qui ÉCHOUE ne marque RIEN (retenté à la passe suivante) et relaie', async () => {
    const ordre: string[] = [];
    const envoyer = vi.fn(async () => { ordre.push('envoyer'); throw new Error('SMTP KO'); });
    const marquerAlertes = vi.fn(async () => { ordre.push('marquer'); });
    const deps = makeDeps({ envoyer, marquerAlertes });

    await expect(executerAlerteAttenteBati(deps)).rejects.toThrow('SMTP KO');
    expect(ordre).toEqual(['envoyer']);       // marquage jamais atteint
    expect(marquerAlertes).not.toHaveBeenCalled();
  });

  it('INDÉPENDANCE de RATT-AUTO : l’alerte n’a AUCUNE dépendance au rejeu automatique — elle part sur la seule ancienneté', async () => {
    // Les deps ne portent aucune notion de RATT-AUTO : un dossier vieux déclenche l'alerte, que le rejeu tourne ou non.
    const envoyer = vi.fn(async () => {});
    const deps = makeDeps({ chargerCandidats: vi.fn(async () => [VIEUX]), envoyer });
    const r = await executerAlerteAttenteBati(deps);
    expect(r.envoye).toBe(true);
    expect(envoyer).toHaveBeenCalledTimes(1);
  });
});
