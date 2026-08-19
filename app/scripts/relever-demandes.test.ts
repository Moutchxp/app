import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { executerCli, lireProfil, lirePlafond, optionsInspectionPresentes } from './relever-demandes';
import type { IssueReleveManuelle } from '../lib/veille/releveAuto';

/**
 * CLI `demandes:relever` — DEUX modes, UNE frontière d'écriture. On teste le cœur PUR `executerCli` avec des dépendances
 * INJECTÉES (orchestrateur / inspection espionnés) : aucun IMAP, aucune DB. + garanties STATIQUES (la CLI n'écrit jamais
 * elle-même ; l'écriture réelle passe UNIQUEMENT par l'orchestrateur).
 */
const ISSUE = (over: Partial<IssueReleveManuelle> = {}): IssueReleveManuelle =>
  ({ resultat: 'ok', raison: '2 retenu(s), 1 rattaché(s)', runId: 7, rapport: null, ...over });

const io = () => { const log: string[] = [], err: string[] = []; return { log, err, sink: { log: (s: string) => log.push(s), erreur: (s: string) => err.push(s) } }; };

describe('demandes:relever — --appliquer délègue à l’orchestrateur, RIEN d’autre', () => {
  it('appelle l’orchestrateur UNE fois, jamais l’inspection ; code 0 sur issue ok', async () => {
    const orchestrer = vi.fn(async () => ISSUE());
    const inspecter = vi.fn();
    const { sink } = io();
    const code = await executerCli({ argv: ['node', 's', '--appliquer'], orchestrer, inspecter, ...sink });
    expect(orchestrer).toHaveBeenCalledTimes(1);
    expect(inspecter).not.toHaveBeenCalled();
    expect(code).toBe(0);
  });

  it('issue « erreur » → code 1 ; issue « inactif » → code 0 (convention)', async () => {
    const insp = vi.fn();
    expect(await executerCli({ argv: ['node', 's', '--appliquer'], orchestrer: async () => ISSUE({ resultat: 'erreur', raison: 'boom', runId: null }), inspecter: insp, ...io().sink })).toBe(1);
    expect(await executerCli({ argv: ['node', 's', '--appliquer'], orchestrer: async () => ISSUE({ resultat: 'inactif', raison: 'profil inactif', runId: null }), inspecter: insp, ...io().sink })).toBe(0);
    expect(insp).not.toHaveBeenCalled();
  });
});

describe('demandes:relever — mode par défaut = INSPECTION lecture seule', () => {
  it('appelle l’inspection, JAMAIS l’orchestrateur ; code 0', async () => {
    const orchestrer = vi.fn();
    const inspecter = vi.fn(async () => null); // profil inactif → message + sortie 0
    const { sink } = io();
    const code = await executerCli({ argv: ['node', 's'], orchestrer, inspecter, ...sink });
    expect(inspecter).toHaveBeenCalledTimes(1);
    expect(orchestrer).not.toHaveBeenCalled();
    expect(code).toBe(0);
  });

  it('transmet profil / plafond / sansFiltre à l’inspection (paramètres de lecture)', async () => {
    const inspecter = vi.fn(async () => null);
    await executerCli({ argv: ['node', 's', '--profil=personne', '--plafond=5', '--sans-filtre'], orchestrer: vi.fn(), inspecter, ...io().sink });
    expect(inspecter).toHaveBeenCalledWith('personne', 5, true);
  });

  it('profil invalide → code 2, aucune inspection', async () => {
    const inspecter = vi.fn();
    const code = await executerCli({ argv: ['node', 's', '--profil=maire'], orchestrer: vi.fn(), inspecter, ...io().sink });
    expect(code).toBe(2);
    expect(inspecter).not.toHaveBeenCalled();
  });
});

describe('demandes:relever — --appliquer REFUSE toute option d’inspection (jamais un drapeau silencieusement inopérant)', () => {
  for (const opt of ['--profil=personne', '--plafond=5', '--sans-filtre']) {
    it(`--appliquer + ${opt} → refus explicite (nomme l’option, dit quoi faire), code 2, orchestrateur JAMAIS appelé`, async () => {
      const orchestrer = vi.fn();
      const { err, sink } = io();
      const code = await executerCli({ argv: ['node', 's', '--appliquer', opt], orchestrer, inspecter: vi.fn(), ...sink });
      expect(code).toBe(2);
      expect(orchestrer).not.toHaveBeenCalled();
      const nom = opt.split('=')[0];
      expect(err.join(' ')).toContain(nom);                              // nomme l'option refusée
      expect(err.join(' ')).toContain('SANS --appliquer');              // dit quoi faire à la place
    });
  }
});

describe('demandes:relever — helpers purs', () => {
  it('lireProfil : défaut entreprise, personne accepté, autre → null', () => {
    expect(lireProfil(['node', 's'])).toBe('entreprise');
    expect(lireProfil(['--profil=personne'])).toBe('personne');
    expect(lireProfil(['--profil=xxx'])).toBeNull();
  });
  it('lirePlafond : entier > 0 sinon undefined', () => {
    expect(lirePlafond(['--plafond=12'])).toBe(12);
    expect(lirePlafond(['--plafond=0'])).toBeUndefined();
    expect(lirePlafond([])).toBeUndefined();
  });
  it('optionsInspectionPresentes : détecte les options avec ou sans « = »', () => {
    expect(optionsInspectionPresentes(['--appliquer', '--plafond=5'])).toEqual(['--plafond']);
    expect(optionsInspectionPresentes(['--appliquer', '--sans-filtre', '--profil=personne'])).toEqual(['--profil', '--sans-filtre']);
    expect(optionsInspectionPresentes(['--appliquer'])).toEqual([]);
  });
});

describe('demandes:relever — garanties STATIQUES : une seule frontière d’écriture', () => {
  const src = readFileSync('app/scripts/relever-demandes.ts', 'utf8');
  it('--appliquer délègue à l’orchestrateur ; l’inspection est appliquer:false ; la CLI n’écrit JAMAIS elle-même', () => {
    expect(src).toContain('executerReleveManuelle(depsReellesReleveAuto())'); // délégation au foyer unique
    expect(src).toContain('appliquer: false');                                // inspection = lecture seule
    expect(src).not.toContain('appliquer: true');                             // la CLI n'écrit jamais en direct
    expect(/INSERT\s|withTransaction/.test(src)).toBe(false);                 // aucun chemin d'écriture propre (run/curseur/GED = orchestrateur)
  });
});
