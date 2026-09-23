import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executerReleveGestion, resume, type DepsReleveGestion } from './releve';
import { CONFIG_GESTION_DEFAUT } from './config';
import type { RapportCapture } from './capture';
import type { ClientDossier } from './captureRepo';

/**
 * LOT 3 — la coquille d'une passe. Elle n'a que trois responsabilités, et chacune se casse d'une façon reconnaissable :
 *   · le VERROU (une passe à la fois, et surtout une clé PROPRE — le partager retarderait la veille Sitadel) ;
 *   · le JOURNAL en deux temps (sans lui, « rien n'est arrivé » et « on n'a pas relevé depuis dix jours » se confondent) ;
 *   · l'ISOLATION (un échec est journalisé et RENDU, jamais relancé).
 * Et une règle dure : en SIMULATION, pas même la ligne de journal — ce serait déjà une écriture.
 */

const MAINTENANT = new Date('2026-09-23T12:00:00Z');
const client = {} as ClientDossier;

const rapport = (o: Partial<RapportCapture> = {}): RapportCapture => ({
  mode: 'applique', dossier: '_GESTION BOITE MAIL', depuis: '2026-06-25T12:00:00Z',
  uidsServeur: 10, plafondAtteint: false, vus: 10, dejaConnus: 2, captures: 8, recus: 5, envoyes: 3, exclus: 4,
  filsCrees: 6, filsFusionnes: 1, piecesDeposees: 2, piecesNonDeposees: 0, echecsLecture: 0, parRegle: {}, ...o,
});

function deps(over: Partial<DepsReleveGestion> = {}) {
  const appels = { runs: [] as string[], majs: [] as unknown[], verrous: [] as string[], captures: [] as boolean[] };
  const d: DepsReleveGestion = {
    maintenant: () => MAINTENANT,
    config: async () => CONFIG_GESTION_DEFAUT,
    creerClient: async () => client,
    acquerirVerrou: async () => { appels.verrous.push('pris'); return true; },
    libererVerrou: async () => { appels.verrous.push('rendu'); },
    insererRun: async (dossier) => { appels.runs.push(dossier); return 42; },
    finaliserRun: async (id, maj) => { appels.majs.push({ id, ...maj }); },
    capturer: async (_c, appliquer) => { appels.captures.push(appliquer); return rapport(); },
    ...over,
  };
  return { d, appels };
}

beforeEach(() => vi.clearAllMocks());

describe('SIMULATION — rien n’est écrit, pas même le journal', () => {
  it('n’insère AUCUNE ligne de passe et ne la finalise pas', async () => {
    const { d, appels } = deps();
    const issue = await executerReleveGestion(d, false);
    expect(issue.resultat).toBe('ok');
    expect(issue.runId).toBeNull();
    expect(appels.runs).toEqual([]);
    expect(appels.majs).toEqual([]);
    expect(appels.captures).toEqual([false]); // la capture est bien lancée en mode simulation
  });

  it('prend quand même le verrou : simuler pendant une vraie passe donnerait des compteurs faux', async () => {
    const { d, appels } = deps();
    await executerReleveGestion(d, false);
    expect(appels.verrous).toEqual(['pris', 'rendu']);
  });
});

describe('PASSE RÉELLE — journal en deux temps', () => {
  it('pose la ligne AVANT de capturer, la finalise « ok » après, avec les compteurs', async () => {
    const { d, appels } = deps();
    const issue = await executerReleveGestion(d, true);
    expect(issue.resultat).toBe('ok');
    expect(issue.runId).toBe(42);
    expect(appels.runs).toEqual(['_GESTION BOITE MAIL']); // le dossier RÉGLÉ, pas un nom en dur
    expect(appels.majs).toHaveLength(1);
    expect(appels.majs[0]).toMatchObject({ id: 42, resultat: 'ok', termineLe: MAINTENANT });
  });

  it('échec de capture → ligne finalisée « erreur » avec le motif, et l’issue le dit SANS relancer', async () => {
    const { d, appels } = deps({ capturer: async () => { throw new Error('boîte indisponible'); } });
    const issue = await executerReleveGestion(d, true); // ne jette PAS : l'appelant décide
    expect(issue.resultat).toBe('erreur');
    expect(issue.raison).toBe('boîte indisponible');
    expect(appels.majs[0]).toMatchObject({ resultat: 'erreur', erreur: 'boîte indisponible' });
  });

  it('le verrou est rendu même quand la capture échoue — sinon toutes les passes suivantes seraient bloquées', async () => {
    const { d, appels } = deps({ capturer: async () => { throw new Error('boum'); } });
    await executerReleveGestion(d, true);
    expect(appels.verrous).toEqual(['pris', 'rendu']);
  });
});

describe('les deux cas qui ne sont PAS des erreurs', () => {
  it('aucune boîte configurée → « inactif », aucun verrou pris, aucune ligne écrite', async () => {
    const { d, appels } = deps({ creerClient: async () => null });
    const issue = await executerReleveGestion(d, true);
    expect(issue.resultat).toBe('inactif');
    expect(issue.raison).toContain('ce n’est pas une erreur');
    expect(appels.verrous).toEqual([]);
    expect(appels.runs).toEqual([]);
  });

  it('une passe tourne déjà → « occupe », et surtout AUCUNE seconde passe', async () => {
    const { d, appels } = deps({ acquerirVerrou: async () => false });
    const issue = await executerReleveGestion(d, true);
    expect(issue.resultat).toBe('occupe');
    expect(appels.captures).toEqual([]);
    expect(appels.runs).toEqual([]);
  });
});

describe('le résumé d’une passe', () => {
  it('dit ce qui a été capturé, écarté, et déjà connu', () => {
    expect(resume(rapport())).toBe('8 capturé(s), 4 tenu(s) hors de la file, 2 déjà connu(s)');
  });

  it('quand le plafond a mordu, dit COMBIEN reste à voir — sans quoi on croirait avoir tout pris', () => {
    expect(resume(rapport({ plafondAtteint: true, uidsServeur: 1200, vus: 400 })))
      .toContain('plafond atteint (800 message(s) pour la passe suivante)');
  });
});

describe('garantie STATIQUE — le verrou du module Permis n’est jamais touché', () => {
  it('la clé de gestion est propre, et différente de celle de la veille', async () => {
    const { CLE_VERROU_GESTION } = await import('./verrou');
    const { CLE_VERROU_VEILLE } = await import('../veille/verrouVeille');
    expect(CLE_VERROU_GESTION).not.toBe(CLE_VERROU_VEILLE);
  });

  it('ni la coquille ni le câblage réel n’IMPORTENT le verrou de la veille (les commentaires, eux, le citent exprès)', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['app/lib/gestion/releve.ts', 'app/lib/gestion/releveReelle.ts', 'app/lib/gestion/captureRepo.ts']) {
      const imports = readFileSync(f, 'utf8').split('\n').filter((l) => /^\s*import\b/.test(l)).join('\n');
      expect(imports).not.toContain('verrouVeille');
      expect(imports).not.toContain('CLE_VERROU_VEILLE');
    }
  });

  it('aucun fichier du module n’écrit dans releve_run (le curseur des permis sauterait des messages)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/lib/gestion/captureRepo.ts', 'utf8').replace(/gestion_releve_run/g, 'X');
    expect(/(INSERT INTO|UPDATE|DELETE FROM)\s+releve_run\b/i.test(src)).toBe(false);
  });
});
