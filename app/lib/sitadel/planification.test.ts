import { describe, it, expect } from 'vitest';
import {
  doitSExecuter, millesimeEstNouveau, fichiersCsvAPurger, resumeRun,
  type ConfigAuto, type RunVeille,
} from './planification';

const CFG = (over: Partial<ConfigAuto> = {}): ConfigAuto => ({ autoActive: true, autoIntervalleHeures: 24, ...over });
const T = (iso: string) => new Date(iso);

describe('S11a — doitSExecuter (planification pure, raison chiffrée)', () => {
  const maintenant = T('2026-07-28T12:00:00Z');

  it('automatisation éteinte → NON', () => {
    const d = doitSExecuter(T('2026-07-01T12:00:00Z'), maintenant, CFG({ autoActive: false }));
    expect(d.executer).toBe(false);
    expect(d.raison).toContain('auto_active = false');
  });

  it('aucun run réussi antérieur → OUI', () => {
    const d = doitSExecuter(null, maintenant, CFG());
    expect(d.executer).toBe(true);
    expect(d.raison).toContain('aucun run réussi');
  });

  it('intervalle NON écoulé → NON, avec les heures restantes dans la raison', () => {
    const d = doitSExecuter(T('2026-07-28T06:00:00Z'), maintenant, CFG({ autoIntervalleHeures: 24 })); // 6 h écoulées
    expect(d.executer).toBe(false);
    expect(d.raison).toContain('6 h');
    expect(d.raison).toMatch(/prochain dans ~\d+ h/); // heures restantes chiffrées
  });

  it('intervalle écoulé → OUI', () => {
    const d = doitSExecuter(T('2026-07-27T06:00:00Z'), maintenant, CFG({ autoIntervalleHeures: 24 })); // 30 h
    expect(d.executer).toBe(true);
    expect(d.raison).toContain('≥ intervalle 24 h');
  });

  it('un échec ne bloque pas : le caller passe le dernier SUCCÈS (null si aucun) → OUI', () => {
    // dernier run = échec → dernierSucces reste null → on réessaie.
    expect(doitSExecuter(null, maintenant, CFG()).executer).toBe(true);
  });
});

describe('S11a — millesimeEstNouveau', () => {
  it('aucun millésime en base → nouveau', () => {
    const r = millesimeEstNouveau(null, '2026-06');
    expect(r.nouveau).toBe(true);
    expect(r.raison).toContain('aucun millésime en base');
  });
  it('millésime différent → nouveau', () => {
    expect(millesimeEstNouveau('2026-06', '2026-07').nouveau).toBe(true);
  });
  it('millésime identique → pas nouveau', () => {
    const r = millesimeEstNouveau('2026-06', '2026-06');
    expect(r.nouveau).toBe(false);
    expect(r.raison).toContain('déjà à jour');
  });
});

describe('S11a-FIX — fichiersCsvAPurger (protège le millésime courant)', () => {
  const maintenant = T('2026-07-28T12:00:00Z');
  const COURANT = '2026-07';
  const f = (chemin: string, iso: string, millesime: string) => ({ chemin, mtime: T(iso), millesime });

  it('aucun fichier → aucune purge', () => {
    expect(fichiersCsvAPurger([], maintenant, 0, COURANT)).toEqual([]);
    expect(fichiersCsvAPurger([], maintenant, 30, COURANT)).toEqual([]);
  });

  it('le millésime COURANT n’est JAMAIS purgé, même très ancien, même rétention 0', () => {
    const fichiers = [
      f('courant.csv', '2000-01-01T00:00:00Z', COURANT), // ancien mais = millésime en base → protégé
      f('anterieur.csv', '2000-01-01T00:00:00Z', '2026-06'),
    ];
    expect(fichiersCsvAPurger(fichiers, maintenant, 0, COURANT)).toEqual(['anterieur.csv']);
    expect(fichiersCsvAPurger(fichiers, maintenant, 30, COURANT)).toEqual(['anterieur.csv']);
  });

  it('rétention 0 → tous les ANTÉRIEURS (le courant reste)', () => {
    const fichiers = [f('a.2026-07.csv', '2026-07-28T11:00:00Z', COURANT), f('b.2026-06.csv', '2020-01-01T00:00:00Z', '2026-06')];
    expect(fichiersCsvAPurger(fichiers, maintenant, 0, COURANT)).toEqual(['b.2026-06.csv']);
  });

  it('rétention N → antérieurs plus vieux que N jours ; récent/futur/courant conservés', () => {
    const fichiers = [
      f('vieux.csv', '2026-05-01T00:00:00Z', '2026-05'),  // ~88 j → purgé
      f('recent.csv', '2026-07-27T00:00:00Z', '2026-06'), // ~1,5 j → conservé
      f('futur.csv', '2026-08-10T00:00:00Z', '2026-06'),  // futur → conservé
      f('courant.csv', '2020-01-01T00:00:00Z', COURANT),  // courant → conservé
    ];
    expect(fichiersCsvAPurger(fichiers, maintenant, 30, COURANT)).toEqual(['vieux.csv']);
  });
});

describe('S11a — resumeRun (phrase lisible, jamais figée)', () => {
  const base: RunVeille = {
    declencheur: 'planifie', statut: 'succes', demarreLe: '2026-07-28 12:00:00+00', finiLe: '2026-07-28 12:05:00+00',
    millesimeDetecte: '2026-06', millesimeIngere: '2026-06', lignesLues: 2875592, dossiersRetenus: 29670,
    dossiersNouveaux: 0, message: 'millésime 2026-06 ingéré', erreur: null,
  };
  it('succès → statut, millésime et compteurs', () => {
    const s = resumeRun(base);
    expect(s).toContain('[succes]');
    expect(s).toContain('millésime 2026-06');
    expect(s).toContain('2875592 lues');
    expect(s).toContain('29670 retenus');
    expect(s).toContain('0 nouveaux');
  });
  it('échec → le motif d’erreur est présent', () => {
    const s = resumeRun({ ...base, statut: 'echec', erreur: 'DiDo HTTP 503', message: null });
    expect(s).toContain('[echec]');
    expect(s).toContain('DiDo HTTP 503');
  });
});
