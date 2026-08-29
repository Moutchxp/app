import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { QueryResult, QueryResultRow } from 'pg';
import { journalActif, colonneGelJournal, enregistrerLigneJournal, derniereLigne, dateModifBatiment, type LigneJournal } from './journalAltitude';

/**
 * FUS-3f — REGISTRE d'altitudes : helpers bas niveau + GARDE append-only (défense secondaire). `q` est une fausse RequeteTx qui
 * enregistre (sql, params) et répond selon un scénario — aucune base réelle. La garde EN BASE vit dans la migration 118 (trigger).
 */
type Call = { sql: string; params: unknown[] };
const faussReq = (repond: (sql: string) => QueryResultRow[]) => {
  const calls: Call[] = [];
  const q = (async (sql: string, params?: unknown[]) => { calls.push({ sql, params: params ?? [] }); return { rows: repond(sql) } as QueryResult<QueryResultRow>; }) as never;
  return { q, calls };
};

const ligne = (over: Partial<LigneJournal> = {}): LigneJournal => ({
  cleabs: 'BAT_A', altitudeNgf: 88.9, origine: 'permis', cause: 'injection', sourceType: 'permis',
  sourceMillesime: null, sourceDate: null, dossierId: 11434, altitudePrecedente: 42, originePrecedente: 'lidar',
  par: 'test', note: 'trace', ...over,
});

describe('journalActif', () => {
  it('vrai si to_regclass renvoie un nom, faux si null', async () => {
    const present = faussReq(() => [{ t: 'permis_altitude_journal' }]);
    expect(await journalActif(present.q)).toBe(true);
    const absent = faussReq(() => [{ t: null }]);
    expect(await journalActif(absent.q)).toBe(false);
    // c'est un SELECT (ne poisonne pas la transaction), pas un INSERT/CATCH
    expect(present.calls[0].sql).toMatch(/to_regclass/i);
  });
});

describe('enregistrerLigneJournal', () => {
  it('sans gelId → INSERT HISTORIQUE 12 paramètres liés dans l’ordre (byte-identique à avant FIG-1)', async () => {
    const { q, calls } = faussReq(() => []);
    await enregistrerLigneJournal(q, ligne({ cleabs: 'BAT_X', altitudeNgf: 87.1, sourceMillesime: 'inconnu' }));
    expect(calls).toHaveLength(1);
    const norm = calls[0].sql.replace(/\s+/g, ' ');
    expect(norm).toContain('INSERT INTO permis_altitude_journal');
    expect(norm).not.toMatch(/UPDATE|DELETE/i);
    expect(norm).not.toContain('gel_id');         // colonne absente du chemin historique
    expect(calls[0].params).toHaveLength(12);
    // paramètres liés : cleabs, altitude, origine, cause en tête ; dossier, altitude_precedente, origine_precedente, par au bon rang
    expect(calls[0].params.slice(0, 4)).toEqual(['BAT_X', 87.1, 'permis', 'injection']);
    expect(calls[0].params).toContain('inconnu');
    expect(calls[0].params).toContain(11434);
  });

  it('FIG-1 — avec gelId (colonne présente) → INSERT 13 colonnes portant gel_id en dernier paramètre lié', async () => {
    const { q, calls } = faussReq(() => []);
    await enregistrerLigneJournal(q, ligne({ cleabs: 'BAT_X', altitudeNgf: 88.9 }), 42);
    const norm = calls[0].sql.replace(/\s+/g, ' ');
    expect(norm).toContain('INSERT INTO permis_altitude_journal');
    expect(norm).toContain('gel_id');
    expect(norm).not.toMatch(/UPDATE|DELETE/i);
    expect(calls[0].params).toHaveLength(13);
    expect(calls[0].params[12]).toBe(42);         // la décision DÉSIGNE la version d'état figé
  });

  it('FIG-1 — gelId null (version courante inconnue) → INSERT 13 colonnes, gel_id lié à null (honnête)', async () => {
    const { q, calls } = faussReq(() => []);
    await enregistrerLigneJournal(q, ligne(), null);
    expect(calls[0].params).toHaveLength(13);
    expect(calls[0].params[12]).toBeNull();
  });
});

describe('colonneGelJournal', () => {
  it('vrai si information_schema compte la colonne, faux sinon — c’est un SELECT (ne poisonne pas la transaction)', async () => {
    const present = faussReq(() => [{ n: 1 }]);
    expect(await colonneGelJournal(present.q)).toBe(true);
    expect(present.calls[0].sql).toMatch(/information_schema\.columns/i);
    const absent = faussReq(() => [{ n: 0 }]);
    expect(await colonneGelJournal(absent.q)).toBe(false);
  });
});

describe('derniereLigne', () => {
  it('null si vide, sinon origine + altitude numérique', async () => {
    expect(await derniereLigne(faussReq(() => []).q, 'BAT_A')).toBeNull();
    const r = await derniereLigne(faussReq(() => [{ origine: 'lidar', altitude_ngf: '42.5' }]).q, 'BAT_A');
    expect(r).toEqual({ origine: 'lidar', altitudeNgf: 42.5 });
  });
});

describe('dateModifBatiment', () => {
  it('ISO si date connue, null sinon', async () => {
    expect(await dateModifBatiment(faussReq(() => []).q, 'BAT_A')).toBeNull();
    const iso = await dateModifBatiment(faussReq(() => [{ d: new Date('2026-03-20T00:00:00Z') }]).q, 'BAT_A');
    expect(iso).toBe('2026-03-20T00:00:00.000Z');
  });
});

// ── GARDE append-only (défense SECONDAIRE ; la vraie garantie est le trigger en base, migration 118) ──────────────────────
describe('GARDE append-only du registre — aucun chemin d’écriture destructif dans le dépôt', () => {
  const TABLE = 'permis_altitude_journal';
  // patterns construits dynamiquement pour que CE fichier de test ne se déclenche pas lui-même
  const interdits = [new RegExp('UPDATE\\s+' + TABLE, 'i'), new RegExp('DELETE\\s+FROM\\s+' + TABLE, 'i'), new RegExp('TRUNCATE\\s+' + TABLE, 'i')];

  const fichiersTs = (dir: string): string[] => {
    const out: string[] = [];
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e === '.next' || e === 'dist') continue;
      const p = join(dir, e);
      if (statSync(p).isDirectory()) out.push(...fichiersTs(p));
      else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p);
    }
    return out;
  };

  it('aucun UPDATE/DELETE/TRUNCATE sur la table dans le code applicatif (.ts hors tests)', () => {
    const racine = join(process.cwd(), 'app');
    const coupables: string[] = [];
    for (const f of fichiersTs(racine)) {
      const src = readFileSync(f, 'utf8');
      if (interdits.some((re) => re.test(src))) coupables.push(f);
    }
    expect(coupables, `écriture destructive sur ${TABLE} détectée (le registre est append-only) : ${coupables.join(', ')}`).toEqual([]);
  });
});
