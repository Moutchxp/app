import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * FIL-C — orchestration de la CAPTURE des sortants hors outil. Partie 1 : COMPORTEMENT par INJECTION (aucun IMAP, aucune base).
 * Partie 2 : les requêtes RÉELLES portent le repli migration (to_regclass), la portée des fils, et la dédup ON CONFLICT.
 */
const { appels, queryMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (/to_regclass/i.test(sql)) return { rows: [{ ok: true }], rowCount: 1 };
    if (/FROM demande d\s+WHERE d\.statut/i.test(sql)) {
      return { rows: [{ demande_id: 154, dest_email: 'urba@mairie.fr', ach_mids: ['<init@nous.fr>'], rec_mids: ['<m7@mairie.fr>'], rec_adr: ['lauriane@mairie.fr'], envoye_min: '2026-08-04T08:00:00.000Z' }], rowCount: 1 };
    }
    if (/INSERT INTO demande_sortant_hors_outil/i.test(sql)) return { rows: [{ id: 1 }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  };
  return { appels, queryMock };
});
vi.mock('../db/client', () => ({ query: queryMock }));
vi.mock('../sitadel/veilleConfig', () => ({ chargerConfigVeille: vi.fn(async () => ({ releveActive: true, releveProfil: 'entreprise' })) }));

import { executerCaptureSortantsAuto, depsReellesCaptureSortants, type DepsCaptureSortants } from './captureSortantsAuto';
import type { SortantComplet, FilCible } from './captureSortants';

const sortant = (over: Partial<SortantComplet> = {}): SortantComplet => ({
  messageId: '<out-1@nous.fr>', inReplyTo: '<m7@mairie.fr>', references: [], destinataires: ['urba@mairie.fr'],
  objet: 'Re: complément', corpsTexte: 'voici les pièces', envoyeLe: '2026-08-20T10:00:00.000Z', ...over,
});
const fil = (over: Partial<FilCible> = {}): FilCible => ({ demandeId: 154, messageIds: ['<m7@mairie.fr>', '<init@nous.fr>'], mairieAdresses: ['urba@mairie.fr'], ...over });

function harness(opts: { active?: boolean; table?: boolean; fils?: FilCible[]; messageIds?: string[]; sortants?: SortantComplet[]; stockerThrows?: boolean; doublon?: boolean } = {}) {
  const stockes: { demandeId: number; dest: string; messageId: string }[] = [];
  const lireSortantsComplets = vi.fn(async () => opts.sortants ?? []);
  const chargerFils = vi.fn(async () => ({ fils: opts.fils ?? [fil()], messageIds: opts.messageIds ?? ['<m7@mairie.fr>', '<init@nous.fr>'], depuis: new Date('2026-08-04T08:00:00Z') }));
  const tableDisponible = vi.fn(async () => opts.table ?? true);
  const deps: DepsCaptureSortants = {
    lireConfig: async () => ({ active: opts.active ?? true, profil: 'entreprise' }),
    tableDisponible,
    chargerFils,
    lireSortantsComplets,
    stocker: async (demandeId, dest, s) => { if (opts.stockerThrows) throw new Error('DB down'); if (opts.doublon) return false; stockes.push({ demandeId, dest, messageId: s.messageId }); return true; },
  };
  return { deps, stockes, lireSortantsComplets, chargerFils, tableDisponible };
}

beforeEach(() => { appels.length = 0; });

describe('FIL-C — executerCaptureSortantsAuto (injection)', () => {
  it('sortant apparié au fil ET adressé à la mairie → capturé une fois', async () => {
    const h = harness({ sortants: [sortant()] });
    const b = await executerCaptureSortantsAuto(h.deps);
    expect(b.captures).toBe(1);
    expect(h.stockes).toEqual([{ demandeId: 154, dest: 'urba@mairie.fr', messageId: '<out-1@nous.fr>' }]);
  });

  it('sortant adressé à un TIERS → ignoré (pas capturé)', async () => {
    const h = harness({ sortants: [sortant({ destinataires: ['tiers@autre.fr'] })] });
    expect((await executerCaptureSortantsAuto(h.deps)).captures).toBe(0);
    expect(h.stockes).toEqual([]);
  });

  it('sortant SANS en-tête de fil → ignoré', async () => {
    const h = harness({ sortants: [sortant({ inReplyTo: null, references: [] })] });
    expect((await executerCaptureSortantsAuto(h.deps)).captures).toBe(0);
  });

  it('second passage / doublon (stocker → false) → aucun doublon compté', async () => {
    const h = harness({ sortants: [sortant()], doublon: true });
    const b = await executerCaptureSortantsAuto(h.deps);
    expect(b.captures).toBe(0);
    expect(b.examines).toBe(1);
  });

  it('migration 176 absente (tableDisponible → false) → aucune connexion IMAP, aucune capture', async () => {
    const h = harness({ table: false, sortants: [sortant()] });
    const b = await executerCaptureSortantsAuto(h.deps);
    expect(b).toMatchObject({ examines: 0, captures: 0 });
    expect(h.chargerFils).not.toHaveBeenCalled();
    expect(h.lireSortantsComplets).not.toHaveBeenCalled();
  });

  it('aucun fil suivi → AUCUNE connexion IMAP (lireSortantsComplets jamais appelé)', async () => {
    const h = harness({ fils: [], messageIds: [] });
    const b = await executerCaptureSortantsAuto(h.deps);
    expect(b.examines).toBe(0);
    expect(h.lireSortantsComplets).not.toHaveBeenCalled();
  });

  it('opt-in désactivé → rien, ni table ni fils consultés', async () => {
    const h = harness({ active: false, sortants: [sortant()] });
    expect((await executerCaptureSortantsAuto(h.deps)).captures).toBe(0);
    expect(h.tableDisponible).not.toHaveBeenCalled();
    expect(h.chargerFils).not.toHaveBeenCalled();
  });

  it('IMAP indisponible / pas de \\Sent (lireSortantsComplets → []) → aucune capture, aucune erreur', async () => {
    const h = harness({ sortants: [] });
    const b = await executerCaptureSortantsAuto(h.deps);
    expect(b).toMatchObject({ examines: 0, captures: 0, erreurs: 0 });
  });

  it('sortant sans Message-ID → ignoré (pas de clé de dédup)', async () => {
    const h = harness({ sortants: [sortant({ messageId: '  ' })] });
    expect((await executerCaptureSortantsAuto(h.deps)).captures).toBe(0);
  });

  it('ISOLATION : un stockage qui échoue est compté, n’interrompt pas les autres', async () => {
    const h = harness({ sortants: [sortant(), sortant({ messageId: '<out-2@nous.fr>' })], stockerThrows: true });
    const b = await executerCaptureSortantsAuto(h.deps);
    expect(b.erreurs).toBe(2);
    expect(b.captures).toBe(0);
  });
});

describe('FIL-C — depsReellesCaptureSortants : requêtes', () => {
  it('tableDisponible : sonde to_regclass (repli si migration 176 absente)', async () => {
    const ok = await depsReellesCaptureSortants().tableDisponible();
    expect(ok).toBe(true);
    expect(appels.some((a) => /to_regclass\('public.demande_sortant_hors_outil'\)/i.test(a.sql))).toBe(true);
  });

  it('chargerFils : demandes envoyées par e-mail, Message-ID (envoi + reçus), adresses mairie (dest_email + reçus)', async () => {
    const { fils, messageIds, depuis } = await depsReellesCaptureSortants().chargerFils('entreprise');
    const sel = appels.find((a) => /FROM demande d\s+WHERE d\.statut/i.test(a.sql))!;
    const sql = sel.sql.replace(/\s+/g, ' ');
    expect(sql).toContain("d.statut IN ('envoyee','close')");
    expect(sql).toContain("d.dest_canal = 'email'");
    expect(sql).toContain("r.nature <> 'rebond'");
    expect(fils).toEqual([{ demandeId: 154, messageIds: ['<init@nous.fr>', '<m7@mairie.fr>'], mairieAdresses: ['urba@mairie.fr', 'lauriane@mairie.fr'] }]);
    expect(messageIds.sort()).toEqual(['<init@nous.fr>', '<m7@mairie.fr>']);
    expect(depuis).toEqual(new Date('2026-08-04T08:00:00.000Z'));
  });

  it('stocker : INSERT avec ON CONFLICT (message_id) DO NOTHING (dédup) → true si inséré', async () => {
    const insere = await depsReellesCaptureSortants().stocker(154, 'urba@mairie.fr', sortant());
    const ins = appels.find((a) => /INSERT INTO demande_sortant_hors_outil/i.test(a.sql))!;
    const sql = ins.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('ON CONFLICT (message_id) DO NOTHING');
    expect(insere).toBe(true);
    expect(ins.params[1]).toBe('<out-1@nous.fr>'); // message_id lié (clé de dédup)
  });
});
