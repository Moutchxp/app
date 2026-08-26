import { describe, it, expect, vi } from 'vitest';
import { executerSuiviRattachementAuto, type DepsSuiviRattachementAuto, type BilanSuiviAuto } from './suiviRattachementAuto';

/** Deps par défaut = interrupteur ON, deux dossiers en attente, aucun ne bascule (bâti inchangé). Chaque test surcharge ce qu'il éprouve. */
function makeDeps(over: Partial<DepsSuiviRattachementAuto> = {}): DepsSuiviRattachementAuto {
  return {
    config: vi.fn(async () => ({ actif: true })),
    listerEnAttenteBati: vi.fn(async () => [11430, 11434]),
    rejouer: vi.fn(async (d: number) => { void d; return { etat: 'en_attente_bati' as string | null }; }), // inchangé (aucun bâti neuf) → pas de bascule
    journaliser: vi.fn(async (b: BilanSuiviAuto) => { void b; }),
    ...over,
  };
}

describe('RATT-AUTO — executerSuiviRattachementAuto : rejeu scopé aux « en attente de bâti »', () => {
  it('interrupteur OFF → RIEN (aucun listing, aucun rejeu, aucun journal)', async () => {
    const listerEnAttenteBati = vi.fn(async () => [11430]);
    const rejouer = vi.fn(async () => ({ etat: 'arbitrage_demande' }));
    const journaliser = vi.fn(async () => {});
    const deps = makeDeps({ config: vi.fn(async () => ({ actif: false })), listerEnAttenteBati, rejouer, journaliser });

    const r = await executerSuiviRattachementAuto(deps);

    expect(r).toEqual({ agi: 'inactif', examines: 0, bascules: 0 });
    expect(listerEnAttenteBati).not.toHaveBeenCalled();
    expect(rejouer).not.toHaveBeenCalled();
    expect(journaliser).not.toHaveBeenCalled();
  });

  it('ON sans dossier en attente → aucun effet, journal 0/0 en SUCCÈS (jamais un échec)', async () => {
    const rejouer = vi.fn(async () => ({ etat: 'arbitrage_demande' }));
    const journaliser = vi.fn(async () => {});
    const deps = makeDeps({ listerEnAttenteBati: vi.fn(async () => []), rejouer, journaliser });

    const r = await executerSuiviRattachementAuto(deps);

    expect(r).toEqual({ agi: 'execute', examines: 0, bascules: 0 });
    expect(rejouer).not.toHaveBeenCalled();
    expect(journaliser).toHaveBeenCalledWith({ examines: 0, bascules: 0, resultat: 'succes', erreur: null });
  });

  it('ON avec dossiers mais AUCUN bâti neuf → 0 bascule, statut normal (succès), chaque dossier rejoué UNE fois', async () => {
    const rejouer = vi.fn(async () => ({ etat: 'en_attente_bati' })); // toujours en attente → aucune bascule
    const journaliser = vi.fn(async () => {});
    const deps = makeDeps({ rejouer, journaliser });

    const r = await executerSuiviRattachementAuto(deps);

    expect(r).toEqual({ agi: 'execute', examines: 2, bascules: 0 });
    expect(rejouer).toHaveBeenCalledTimes(2);
    expect(journaliser).toHaveBeenCalledWith({ examines: 2, bascules: 0, resultat: 'succes', erreur: null });
  });

  it('ON avec bâti neuf détecté → BASCULE comptée (le dossier a quitté « en_attente_bati »)', async () => {
    // 11430 bascule (arbitrage_demande), 11434 reste en attente → 1 bascule sur 2 examinés.
    const rejouer = vi.fn(async (d: number) => ({ etat: d === 11430 ? 'arbitrage_demande' : 'en_attente_bati' }));
    const journaliser = vi.fn(async () => {});
    const deps = makeDeps({ rejouer, journaliser });

    const r = await executerSuiviRattachementAuto(deps);

    expect(r).toEqual({ agi: 'execute', examines: 2, bascules: 1 });
    expect(journaliser).toHaveBeenCalledWith({ examines: 2, bascules: 1, resultat: 'succes', erreur: null });
  });

  it('une bascule vers « valide » (rattachement automatique) compte aussi ; un rejeu SANS changement persisté (etat null) ne compte pas', async () => {
    const rejouer = vi.fn(async (d: number) => ({ etat: d === 11430 ? 'valide' : null }));
    const deps = makeDeps({ rejouer });
    const r = await executerSuiviRattachementAuto(deps);
    expect(r).toEqual({ agi: 'execute', examines: 2, bascules: 1 }); // valide = bascule ; null = pas de bascule
  });

  it('le SCOPE ne déborde pas : seuls les dossiers de listerEnAttenteBati sont rejoués (dans l’ordre, une fois chacun)', async () => {
    const rejouer = vi.fn(async (d: number) => { void d; return { etat: 'en_attente_bati' as string | null }; });
    const deps = makeDeps({ listerEnAttenteBati: vi.fn(async () => [7, 42, 99]), rejouer });

    await executerSuiviRattachementAuto(deps);

    expect(rejouer.mock.calls.map((c) => c[0])).toEqual([7, 42, 99]);
  });

  it('un rejeu qui LÈVE → passage journalisé en ÉCHEC (avec ce qui a été examiné) PUIS relancé (la veille l’isole)', async () => {
    const rejouer = vi.fn(async (d: number) => { if (d === 11434) throw new Error('DB KO'); return { etat: 'en_attente_bati' as string | null }; });
    const journaliser = vi.fn(async (b: BilanSuiviAuto) => { void b; });
    const deps = makeDeps({ rejouer, journaliser });

    await expect(executerSuiviRattachementAuto(deps)).rejects.toThrow('DB KO');

    // 11430 examiné avant l'échec sur 11434 → examines=1 ; resultat 'echec' avec le message.
    expect(journaliser).toHaveBeenCalledWith({ examines: 1, bascules: 0, resultat: 'echec', erreur: 'DB KO' });
  });
});
