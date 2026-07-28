import { describe, it, expect, vi } from 'vitest';
import { executerVeille, type DepsVeille } from './executerVeille';
import type { CompteursIngestion } from './ingestionMillesime';

const COMPTEURS: CompteursIngestion = {
  millesime: '2026-07', millesimeId: 2, lignesLues: 100, dossiersRetenus: 10,
  dossiersNouveaux: 3, dossiersDejaConnus: 7, dossiersMisAJour: 0, dossiersAbsents: 0, pc: 6, pd: 4,
};

/** Deps par défaut = chemin de succès (distant 2026-07 ≠ base 2026-06) ; chaque test surcharge ce qu'il éprouve. */
function makeDeps(over: Partial<DepsVeille> = {}): DepsVeille {
  return {
    maintenant: () => new Date('2026-07-28T12:00:00Z'),
    chargerConfig: vi.fn(async () => ({ autoActive: false, autoIntervalleHeures: 24, csvRetentionJours: 0, runDemandeLe: null })),
    dernierSucces: vi.fn(async () => null),
    millesimeEnBase: vi.fn(async () => '2026-06'),
    acquerirVerrou: vi.fn(async () => true),
    libererVerrou: vi.fn(async () => {}),
    insererRun: vi.fn(async () => 1),
    finaliserRun: vi.fn(async () => {}),
    millesimeDistant: vi.fn(async () => '2026-07'),
    ingerer: vi.fn(async () => COMPTEURS),
    // un CSV du millésime COURANT (2026-07, protégé) + un ANTÉRIEUR (2026-06, purgeable).
    listerCsv: vi.fn(async () => [
      { chemin: 'data/sitadel/logements.2026-07.csv', mtime: new Date('2026-07-28T00:00:00Z'), millesime: '2026-07' },
      { chemin: 'data/sitadel/logements.2026-06.csv', mtime: new Date('2026-06-01T00:00:00Z'), millesime: '2026-06' },
    ]),
    supprimerFichiers: vi.fn(async () => {}),
    ...over,
  };
}

describe('S11a-FIX — executerVeille : verrou concurrent', () => {
  it('verrou déjà pris → « rien_a_faire » SANS aucun appel réseau ni ingestion', async () => {
    const millesimeDistant = vi.fn(async () => '2026-07');
    const ingerer = vi.fn(async () => COMPTEURS);
    const insererRun = vi.fn(async () => 1);
    const deps = makeDeps({ acquerirVerrou: vi.fn(async () => false), millesimeDistant, ingerer, insererRun });

    const r = await executerVeille({ declencheur: 'planifie' }, deps);

    expect(r.statut).toBe('rien_a_faire');
    expect(millesimeDistant).not.toHaveBeenCalled();
    expect(ingerer).not.toHaveBeenCalled();
    expect(insererRun).not.toHaveBeenCalled();
  });
});

describe('S11a-FIX — executerVeille : millésime distant DIFFÉRENT', () => {
  it('ingère le millésime DÉTECTÉ (2026-07) une fois, purge les ANTÉRIEURS sans jamais le courant', async () => {
    const ingerer = vi.fn(async () => COMPTEURS);
    const supprimerFichiers = vi.fn(async () => {});
    const finaliserRun = vi.fn(async () => {});
    const deps = makeDeps({ ingerer, supprimerFichiers, finaliserRun });

    const r = await executerVeille({ declencheur: 'manuel' }, deps);

    expect(r.statut).toBe('succes');
    expect(ingerer).toHaveBeenCalledTimes(1);
    expect(ingerer).toHaveBeenCalledWith('2026-07');               // le DÉTECTÉ, pas une constante
    // purge : uniquement l'antérieur 2026-06 ; le courant 2026-07 est EXCLU.
    expect(supprimerFichiers).toHaveBeenCalledWith(['data/sitadel/logements.2026-06.csv']);
    expect(finaliserRun).toHaveBeenCalledWith(1, expect.objectContaining({ statut: 'succes', millesimeDetecte: '2026-07', millesimeIngere: '2026-07' }));
  });
});

describe('S11a-FIX — executerVeille : millésime inchangé (LE test qui manquait)', () => {
  it('distant == base et !forcer → « rien_a_faire », AUCUNE ingestion, AUCUNE purge', async () => {
    const ingerer = vi.fn(async () => COMPTEURS);
    const supprimerFichiers = vi.fn(async () => {});
    const listerCsv = vi.fn(async () => []);
    const finaliserRun = vi.fn(async () => {});
    const deps = makeDeps({ millesimeDistant: vi.fn(async () => '2026-06'), ingerer, supprimerFichiers, listerCsv, finaliserRun });

    const r = await executerVeille({ declencheur: 'manuel' }, deps);

    expect(r.statut).toBe('rien_a_faire');
    expect(ingerer).not.toHaveBeenCalled();          // AUCUNE ré-ingestion
    expect(listerCsv).not.toHaveBeenCalled();
    expect(supprimerFichiers).not.toHaveBeenCalled(); // AUCUNE purge → le cache survit
    expect(finaliserRun).toHaveBeenCalledWith(1, expect.objectContaining({ statut: 'rien_a_faire', millesimeDetecte: '2026-06' }));
  });

  it('--forcer ré-ingère même à millésime égal, purge les antérieurs', async () => {
    const ingerer = vi.fn(async () => ({ ...COMPTEURS, millesime: '2026-06' }));
    const supprimerFichiers = vi.fn(async () => {});
    const deps = makeDeps({ millesimeDistant: vi.fn(async () => '2026-06'), ingerer, supprimerFichiers });

    const r = await executerVeille({ declencheur: 'manuel', forcer: true }, deps);

    expect(r.statut).toBe('succes');
    expect(ingerer).toHaveBeenCalledWith('2026-06');
    // millésime courant = 2026-06 (celui ingéré) → seul l'autre (2026-07) serait purgé s'il était antérieur ; ici il est
    // « courant côté fichiers » mais c'est 2026-06 qui vient d'être ingéré → 2026-07 est traité comme antérieur.
    expect(supprimerFichiers).toHaveBeenCalledWith(['data/sitadel/logements.2026-07.csv']);
  });
});

describe('S11a-FIX — executerVeille : appel DiDo en erreur', () => {
  it('métadonnées KO → « echec », ingestion JAMAIS appelée, purge JAMAIS appelée, verrou libéré', async () => {
    const ingerer = vi.fn(async () => COMPTEURS);
    const supprimerFichiers = vi.fn(async () => {});
    const finaliserRun = vi.fn(async () => {});
    const libererVerrou = vi.fn(async () => {});
    const deps = makeDeps({
      millesimeDistant: vi.fn(async () => { throw new Error('DiDo HTTP 503'); }),
      ingerer, supprimerFichiers, finaliserRun, libererVerrou,
    });

    await expect(executerVeille({ declencheur: 'manuel' }, deps)).rejects.toThrow('DiDo HTTP 503');

    expect(finaliserRun).toHaveBeenCalledWith(1, expect.objectContaining({ statut: 'echec', erreur: 'DiDo HTTP 503' }));
    expect(ingerer).not.toHaveBeenCalled();           // PAS de repli vers le travail lourd « au cas où »
    expect(supprimerFichiers).not.toHaveBeenCalled();
    expect(libererVerrou).toHaveBeenCalledTimes(1);
  });
});

describe('S11a-FIX — executerVeille : échec d’ingestion', () => {
  it('laisse une ligne « echec » avec erreur, NE PURGE PAS, libère le verrou, relance', async () => {
    const finaliserRun = vi.fn(async () => {});
    const supprimerFichiers = vi.fn(async () => {});
    const libererVerrou = vi.fn(async () => {});
    const deps = makeDeps({
      ingerer: vi.fn(async () => { throw new Error('boom ingestion'); }),
      finaliserRun, supprimerFichiers, libererVerrou,
    });

    await expect(executerVeille({ declencheur: 'manuel' }, deps)).rejects.toThrow('boom ingestion');

    expect(finaliserRun).toHaveBeenCalledWith(1, expect.objectContaining({ statut: 'echec', erreur: 'boom ingestion' }));
    expect(supprimerFichiers).not.toHaveBeenCalled();
    expect(libererVerrou).toHaveBeenCalledTimes(1);
  });
});

describe('S11b — executerVeille : drapeau de demande manuelle', () => {
  it('drapeau posé (auto éteinte) → run en « manuel », insererRun consomme le drapeau au démarrage', async () => {
    const insererRun = vi.fn(async () => 1);
    const deps = makeDeps({
      chargerConfig: vi.fn(async () => ({ autoActive: false, autoIntervalleHeures: 24, csvRetentionJours: 0, runDemandeLe: new Date('2026-07-28T11:59:00Z') })),
      insererRun,
    });

    const r = await executerVeille({ declencheur: 'planifie' }, deps);

    expect(r.statut).toBe('succes');
    // le run porte 'manuel' (le drapeau l'emporte) — insererRun (qui, en réel, remet le drapeau à NULL dans SA
    // transaction) est appelé avec 'manuel' AU DÉMARRAGE, avant tout travail.
    expect(insererRun).toHaveBeenCalledWith('manuel', expect.any(Date));
  });

  it('un ÉCHEC ne laisse pas le drapeau armé : insererRun (qui le consomme) est appelé AVANT l’échec', async () => {
    const insererRun = vi.fn(async () => 1);
    const finaliserRun = vi.fn(async () => {});
    const deps = makeDeps({
      chargerConfig: vi.fn(async () => ({ autoActive: false, autoIntervalleHeures: 24, csvRetentionJours: 0, runDemandeLe: new Date('2026-07-28T11:59:00Z') })),
      insererRun, finaliserRun,
      ingerer: vi.fn(async () => { throw new Error('boom'); }),
    });

    await expect(executerVeille({ declencheur: 'planifie' }, deps)).rejects.toThrow('boom');

    expect(insererRun).toHaveBeenCalledWith('manuel', expect.any(Date)); // drapeau consommé au démarrage
    expect(finaliserRun).toHaveBeenCalledWith(1, expect.objectContaining({ statut: 'echec' }));
  });
});

describe('S11a-FIX — executerVeille : garde d’intervalle (planifie)', () => {
  it('auto éteinte + planifie → « rien_a_faire » sans insérer de run ni toucher le réseau', async () => {
    const insererRun = vi.fn(async () => 1);
    const millesimeDistant = vi.fn(async () => '2026-07');
    const deps = makeDeps({
      chargerConfig: vi.fn(async () => ({ autoActive: false, autoIntervalleHeures: 24, csvRetentionJours: 0, runDemandeLe: null })),
      insererRun, millesimeDistant,
    });

    const r = await executerVeille({ declencheur: 'planifie' }, deps);

    expect(r.statut).toBe('rien_a_faire');
    expect(r.raison).toContain('auto_active = false');
    expect(insererRun).not.toHaveBeenCalled();
    expect(millesimeDistant).not.toHaveBeenCalled();
  });
});
