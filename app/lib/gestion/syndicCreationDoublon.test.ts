import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══ 🔴🔴 LOT SYNDIC-ANTI-DOUBLON-ET-PROPOSITION-PAR-ADRESSE — LE CONTRÔLE DU « VALIDER » D'UNE CRÉATION ══════════════
 * La porte unique `enregistrerSyndic`, sur une base simulée : un syndic qui ressemble à un syndic existant n'est créé
 * que si l'écran a fait accepter le doublon (« Créer quand même »), et la création est alors tracée au journal.
 * 🔒 Aucune donnée réelle.
 */
const appels: Array<{ sql: string; params: unknown[] }> = [];
const repondre = (sql: string): { rows: unknown[] } => {
  if (sql.includes('FROM gestion_syndic s') && sql.includes('WHERE s.supprime_le IS NULL') && sql.includes('AS emails,')) {
    return { rows: [{ id: '4', nom: 'Cabinet FONCIA', adresse: '12 bis av. des Champs-Élysées', code_postal: '75008', ville: 'Paris',
      email: 'contact@foncia.invalid', telephone: '0142000001', telephone_2: null, emails: null, telephones: null }] };
  }
  if (sql.includes('INSERT INTO gestion_syndic ')) return { rows: [{ id: '11' }] };
  return { rows: [] };
};
vi.mock('../db/client', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => { appels.push({ sql, params }); return repondre(sql); }),
  withTransaction: vi.fn(async (fn: (q: unknown) => Promise<unknown>) =>
    fn(async (sql: string, params: unknown[] = []) => { appels.push({ sql, params }); return repondre(sql); })),
}));
const { enregistrerSyndic } = await import('./syndicRepo');
const { validerSyndic } = await import('./syndics');
const auteur = { id: 7, libelle: 'arno' };
const saisie = (extra: Record<string, unknown> = {}) => {
  const v = validerSyndic({ nom: 'SARL Foncia', adresse: '1 rue _TEST', codePostal: '75001', ville: 'Paris', telephone: '01 42 00 00 01', ...extra });
  if (!v.ok) throw new Error(v.motif);
  return v.syndic;
};
const ecritures = () => appels.filter((a) => /INSERT|UPDATE|DELETE/.test(a.sql));

beforeEach(() => { appels.length = 0; });

describe('🔴🔴 la création d’un syndic qui ressemble à un syndic existant', () => {
  it('sans « Créer quand même » : renvoyé à l’écran avec les doublons et leurs critères, RIEN n’est écrit', async () => {
    const r = await enregistrerSyndic(null, saisie(), auteur);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.doublonsSyndic?.map((d) => [d.syndic.id, d.criteres])).toEqual([[4, ['nom', 'telephone']]]);
    expect(ecritures()).toEqual([]);
  });
  it('un accusé incomplet (un critère manque) ne suffit pas', async () => {
    const r = await enregistrerSyndic(null, saisie({ doublonsSyndicIgnores: [{ id: 4, criteres: ['nom'] }] }), auteur);
    expect(r.ok).toBe(false);
    expect(ecritures()).toEqual([]);
  });
  it('« Créer quand même » : créé, et TRACÉ au journal avec les critères ignorés', async () => {
    const r = await enregistrerSyndic(null, saisie({ doublonsSyndicIgnores: [{ id: 4, criteres: ['nom', 'telephone'] }] }), auteur);
    expect(r).toEqual({ ok: true, id: 11 });
    const trace = appels.find((a) => a.sql.includes('syndic_cree_malgre_doublon'));
    expect(trace?.sql.replace(/\s+/g, ' ')).toContain("VALUES ('annuaire', $1, 'syndic_cree_malgre_doublon', $2, $3, $4, $5)");
    expect(trace?.params.slice(0, 3)).toEqual([11, '[{"id":4,"criteres":["nom","telephone"]}]',
      'Syndic créé malgré l’avertissement de doublon : Cabinet FONCIA n° 4 (même nom, même téléphone)']);
  });
  it('aucune ressemblance : créé sans trace ; une MODIFICATION n’est jamais contrôlée ainsi', async () => {
    const v = validerSyndic({ nom: 'Oralia', adresse: '2 rue _TEST', codePostal: '69001', ville: 'Lyon' });
    if (!v.ok) throw new Error(v.motif);
    expect(await enregistrerSyndic(null, v.syndic, auteur)).toEqual({ ok: true, id: 11 });
    expect(appels.some((a) => a.sql.includes('syndic_cree_malgre_doublon'))).toBe(false);
  });
});
