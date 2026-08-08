import { describe, it, expect, vi } from 'vitest';
import { executerReleveAuto, type DepsReleveAuto } from './releveAuto';
import type { ClientBoite, RapportReleve } from './releveReponses';

/**
 * R7 — orchestrateur PUR de la relève automatique (injection totale : ni IMAP, ni base). On éprouve les trois garde-fous
 * « ignore » AVANT connexion (sans ligne releve_run), la tentative réelle journalisée EN DEUX TEMPS, et l'ISOLATION
 * (une relève qui échoue journalise « erreur » et RETOURNE — elle ne relance jamais).
 */
const CLIENT_FACTICE = {} as ClientBoite; // opaque : transite de creerClient à relever, jamais déréférencé ici

function rapport(over: Partial<RapportReleve> = {}): RapportReleve {
  return {
    mode: 'applique', profil: 'entreprise', connecte: true, depuis: null, domainesInterroges: [],
    uidsServeur: 0, referencesInterrogees: 0, uidsReferences: 0, plafondReferencesAtteint: false, plafondAtteint: false,
    vus: 0, dejaConnus: 0, horsPerimetre: 0, retenus: 0, rattaches: 0, nonRattaches: 0,
    rebondsDetectes: 0, rebondsRattaches: 0, rebondsEtrangers: 0, rebondsAppliques: 0, ecrites: 0, piecesDeposees: 0, piecesNonDeposees: 0, parMethode: {}, lignes: [],
    ...over,
  };
}

/** Deps par défaut = relève ACTIVE, aucun « ok » antérieur, compte présent, relève OK. Chaque test surcharge ce qu'il éprouve. */
function makeDeps(over: Partial<DepsReleveAuto> = {}): DepsReleveAuto {
  return {
    maintenant: () => new Date('2026-08-08T12:00:00Z'),
    lireConfig: vi.fn(async () => ({ active: true, intervalleMinutes: 60, profil: 'entreprise' as const })),
    dernierOkLe: vi.fn(async () => null),
    creerClient: vi.fn(async () => CLIENT_FACTICE),
    relever: vi.fn(async () => rapport({ retenus: 2, rattaches: 2, ecrites: 2 })),
    insererRun: vi.fn(async () => 7),
    finaliserRun: vi.fn(async () => {}),
    ...over,
  };
}

describe('R7 — executerReleveAuto : garde-fous AVANT connexion (aucune ligne releve_run)', () => {
  it('relève DÉSACTIVÉE → « ignore », AUCUNE connexion, AUCUNE ligne', async () => {
    const creerClient = vi.fn(async () => CLIENT_FACTICE);
    const insererRun = vi.fn(async () => 7);
    const deps = makeDeps({ lireConfig: vi.fn(async () => ({ active: false, intervalleMinutes: 60, profil: 'entreprise' as const })), creerClient, insererRun });

    const issue = await executerReleveAuto(deps);

    expect(issue.resultat).toBe('ignore');
    expect(issue.runId).toBeNull();
    expect(creerClient).not.toHaveBeenCalled();
    expect(insererRun).not.toHaveBeenCalled();
  });

  it('intervalle NON écoulé (dernière relève « ok » il y a 30 min < 60) → « ignore », aucune connexion, aucune ligne', async () => {
    const creerClient = vi.fn(async () => CLIENT_FACTICE);
    const insererRun = vi.fn(async () => 7);
    const deps = makeDeps({ dernierOkLe: vi.fn(async () => new Date('2026-08-08T11:30:00Z')), creerClient, insererRun });

    const issue = await executerReleveAuto(deps);

    expect(issue.resultat).toBe('ignore');
    expect(creerClient).not.toHaveBeenCalled();
    expect(insererRun).not.toHaveBeenCalled();
  });

  it('intervalle ÉCOULÉ (dernière relève « ok » il y a 90 min > 60) → tentative réelle', async () => {
    const insererRun = vi.fn(async () => 7);
    const deps = makeDeps({ dernierOkLe: vi.fn(async () => new Date('2026-08-08T10:30:00Z')), insererRun });

    const issue = await executerReleveAuto(deps);

    expect(issue.resultat).toBe('ok');
    expect(insererRun).toHaveBeenCalledTimes(1);
  });

  it('profil INACTIF (creerClient → null) → « ignore », AUCUNE ligne releve_run', async () => {
    const insererRun = vi.fn(async () => 7);
    const deps = makeDeps({ creerClient: vi.fn(async () => null), insererRun });

    const issue = await executerReleveAuto(deps);

    expect(issue.resultat).toBe('ignore');
    expect(issue.raison).toMatch(/inactif/i);
    expect(insererRun).not.toHaveBeenCalled();
  });
});

describe('R7 — executerReleveAuto : tentative réelle journalisée EN DEUX TEMPS', () => {
  it('succès → insererRun (« en_cours ») PUIS finaliserRun « ok » avec les compteurs du rapport', async () => {
    const insererRun = vi.fn(async () => 7);
    const finaliserRun = vi.fn(async () => {});
    const deps = makeDeps({
      insererRun, finaliserRun,
      relever: vi.fn(async () => rapport({ vus: 5, retenus: 3, rattaches: 2, ecrites: 3, rebondsRattaches: 1 })),
    });

    const issue = await executerReleveAuto(deps);

    expect(issue.resultat).toBe('ok');
    expect(issue.runId).toBe(7);
    expect(insererRun).toHaveBeenCalledWith('entreprise');
    expect(finaliserRun).toHaveBeenCalledWith(7, expect.objectContaining({
      resultat: 'ok',
      rapport: expect.objectContaining({ vus: 5, retenus: 3, ecrites: 3, rebondsRattaches: 1 }),
    }));
  });

  it('ÉCHEC de relève → finaliserRun « erreur » (motif) et NE RELANCE PAS (issue « erreur »)', async () => {
    const insererRun = vi.fn(async () => 7);
    const finaliserRun = vi.fn(async () => {});
    const deps = makeDeps({ insererRun, finaliserRun, relever: vi.fn(async () => { throw new Error('IMAP timeout'); }) });

    // NE DOIT PAS jeter (isolation : c'est l'appelant qui décide) → issue « erreur »
    const issue = await executerReleveAuto(deps);

    expect(issue.resultat).toBe('erreur');
    expect(issue.raison).toContain('IMAP timeout');
    expect(insererRun).toHaveBeenCalledTimes(1); // la ligne « en_cours » a bien été posée avant l'échec
    expect(finaliserRun).toHaveBeenCalledWith(7, expect.objectContaining({ resultat: 'erreur', erreur: 'IMAP timeout' }));
  });

  it('appelle relever avec le CLIENT de creerClient et le PROFIL configuré (personne)', async () => {
    const client = {} as ClientBoite;
    const relever = vi.fn(async () => rapport({ profil: 'personne' }));
    const deps = makeDeps({
      lireConfig: vi.fn(async () => ({ active: true, intervalleMinutes: 60, profil: 'personne' as const })),
      creerClient: vi.fn(async () => client),
      relever,
    });

    await executerReleveAuto(deps);

    expect(relever).toHaveBeenCalledWith(client, 'personne');
  });
});
