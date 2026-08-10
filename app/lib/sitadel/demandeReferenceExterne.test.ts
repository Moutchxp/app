import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * P1 — repo de la RÉFÉRENCE mairie. On mocke ../db/client et on capture chaque (sql, params). Protocole : COMPORTEMENT +
 * PARAMÈTRES LIÉS + SQL par FRAGMENTS whitespace-normalisés (jamais la forme exacte d'un WHERE). Le 23505 de l'unique devient
 * une erreur MÉTIER nommée (409 côté route), jamais une exception brute (503). marquerDeposee greffe la référence sans jamais
 * bloquer le dépôt (ON CONFLICT DO NOTHING).
 */
const { appels, etat, queryMock, withTransactionMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const etat = { statut: 'prete' as string, canal: 'formulaire' as string | null, conflit23505: false };
  const run = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (/SELECT statut, dest_canal/i.test(sql)) return { rows: [{ statut: etat.statut, canal: etat.canal }], rowCount: 1 };
    // INSERT DIRECT (ajouterReferenceExterne, SANS ON CONFLICT) → peut lever 23505 ; la greffe (ON CONFLICT) n'est jamais bloquée.
    if (/INSERT INTO demande_reference_externe/i.test(sql) && !/ON CONFLICT/i.test(sql) && etat.conflit23505) {
      throw Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'demande_reference_externe_demande_id_reference_key' });
    }
    return { rows: [], rowCount: 1 };
  };
  const withTransactionMock = async (fn: (q: typeof run) => Promise<unknown>) => fn(run);
  return { appels, etat, queryMock: run, withTransactionMock };
});
vi.mock('../db/client', () => ({ query: queryMock, withTransaction: withTransactionMock, pool: {}, closePool: async () => undefined }));

import { ajouterReferenceExterne, marquerDeposee, ReferenceDejaEnregistreeError } from './demandeRepo';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const trouver = (re: RegExp) => appels.find((a) => re.test(a.sql));
beforeEach(() => { appels.length = 0; etat.statut = 'prete'; etat.canal = 'formulaire'; etat.conflit23505 = false; });

describe('P1 — ajouterReferenceExterne', () => {
  it('insère avec les paramètres liés, référence NETTOYÉE (trim)', async () => {
    await ajouterReferenceExterne(119, '  SLC260810440700  ', { source: 'accuse_reception' });
    const ins = trouver(/INSERT INTO demande_reference_externe/i)!;
    expect(ins).toBeDefined();
    expect(norm(ins.sql)).toContain('INSERT INTO demande_reference_externe (demande_id, dossier_id, reference, source, note, recu_le)');
    expect(ins.params).toEqual([119, null, 'SLC260810440700', 'accuse_reception', null, null]);
  });

  it('une même référence enregistrée DEUX FOIS → ReferenceDejaEnregistreeError (409 métier), jamais l’erreur brute (503)', async () => {
    etat.conflit23505 = true;
    await expect(ajouterReferenceExterne(119, 'DOUBLON')).rejects.toBeInstanceOf(ReferenceDejaEnregistreeError);
    await expect(ajouterReferenceExterne(119, 'DOUBLON')).rejects.toThrow('déjà enregistrée pour cette demande');
  });

  it('ajout APRÈS COUP (demande déjà déposée) : INSERT seul, n’écrit NI demande NI statut', async () => {
    await ajouterReferenceExterne(119, 'REF', { dossierId: 7 });
    expect(appels.some((a) => /INSERT INTO demande_reference_externe/i.test(a.sql))).toBe(true);
    expect(appels.every((a) => !/UPDATE\s+demande\b/i.test(a.sql) && !/SET\s+statut/i.test(a.sql))).toBe(true);
    // dossier_id lié quand fourni
    expect(trouver(/INSERT INTO demande_reference_externe/i)!.params[1]).toBe(7);
  });
});

describe('P1 — marquerDeposee greffe la référence', () => {
  it('avec référence : dépôt (UPDATE + journal) PUIS greffe ON CONFLICT DO NOTHING, dans la même transaction', async () => {
    await marquerDeposee(42, 'admin', '  REF-42 ');
    expect(appels.some((a) => /UPDATE demande SET statut = 'envoyee'/i.test(a.sql))).toBe(true);
    const graft = trouver(/INSERT INTO demande_reference_externe/i)!;
    expect(graft).toBeDefined();
    expect(norm(graft.sql)).toContain('ON CONFLICT (demande_id, reference) DO NOTHING');
    expect(graft.params).toEqual([42, 'REF-42']); // référence trimée
  });

  it('sans référence (absente ou vide après trim) → AUCUNE greffe (dépôt seul)', async () => {
    await marquerDeposee(42, 'admin');
    expect(appels.some((a) => /INSERT INTO demande_reference_externe/i.test(a.sql))).toBe(false);
    appels.length = 0;
    await marquerDeposee(42, 'admin', '   ');
    expect(appels.some((a) => /INSERT INTO demande_reference_externe/i.test(a.sql))).toBe(false);
  });

  it('un doublon de référence NE BLOQUE JAMAIS le dépôt (la greffe est ON CONFLICT DO NOTHING)', async () => {
    etat.conflit23505 = true; // n'affecte que l'INSERT DIRECT, pas la greffe
    await expect(marquerDeposee(42, 'admin', 'REF')).resolves.toBeUndefined();
  });
});
