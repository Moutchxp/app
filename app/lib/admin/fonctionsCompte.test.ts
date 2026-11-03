import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 D35 (Arno, 03/11/2026, option C, migration 453) — LES FONCTIONS DATÉES ET L'ACTIVITÉ PRINCIPALE (base simulée) : un changement vaut à compter de
 * sa date (le passé ne change pas) ; l'activité principale est l'une des fonctions cochées ; l'historique se lit (« Location → Gestion le 16/11/2027
 * — par Arnaud Jorel »), l'état d'avant toute date étant « Depuis toujours ».
 */
const avec453 = vi.fn<() => Promise<boolean>>(async () => true);
vi.mock('./schemaDroits', () => ({ fonctionsComptesDisponible: async () => true, activitePrincipaleDisponible: () => avec453() }));
const appels: { sql: string; params: unknown[] }[] = [];
let reponses: ((sql: string) => { rows: Record<string, unknown>[] } | undefined)[] = [];
const q = vi.fn(async (sql: string, params: unknown[] = []) => {
  appels.push({ sql: sql.replace(/\s+/g, ' '), params });
  for (const r of reponses) { const x = r(sql.replace(/\s+/g, ' ')); if (x !== undefined) return x; }
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: (s: string, p: unknown[]) => q(s, p), withTransaction: async (fn: (x: typeof q) => unknown) => fn(q) }));
const { definirFonctions, lireFonctions, motifChoixFonctions } = await import('./fonctionsCompte');
const { lignesHistoriqueFonctions } = await import('./fonctionsCompteModele');

// Jean-Baptiste PONS (5), tel que la 453 l'a laissé : Location depuis toujours, activité principale Location
const PONS = (s: string) => (s.includes('FROM admin_utilisateur WHERE id = $1 FOR UPDATE') ? { rows: [{ id: '5' }] }
  : s.includes('FROM admin_compte_fonction WHERE compte_id = $1') ? { rows: [{ id: '4', fonction: 'location', origine: 'saisie', depuis: null, jusqua: null }] }
  : s.includes('FROM admin_compte_activite_principale WHERE compte_id = $1') ? { rows: [{ id: '2', activite: 'location', origine: 'deduite', depuis: null }] } : undefined);
beforeEach(() => { appels.length = 0; reponses = [PONS]; avec453.mockResolvedValue(true); });
const sqls = () => appels.map((a) => a.sql);

describe('definirFonctions — Location → Gestion à compter du 16/11/2027', () => {
  it('la Location s’arrête au 16 (jamais effacée), la Gestion commence le 16, l’activité principale passe à Gestion le 16 ; journal avant / après daté', async () => {
    expect(await definirFonctions(5, { fonctions: ['gestion'], principale: 'gestion', depuis: '2027-11-16' }, 2, 'Arnaud Jorel')).toEqual({ ok: true, change: true });
    expect(appels.find((a) => a.sql.startsWith('UPDATE admin_compte_fonction SET jusqua'))!.params).toEqual(['4', '2027-11-16', 'Arnaud Jorel']);
    expect(appels.find((a) => a.sql.startsWith('INSERT INTO admin_compte_fonction'))!.params).toEqual([5, 'gestion', 'Arnaud Jorel', '2027-11-16']);
    expect(appels.find((a) => a.sql.startsWith('INSERT INTO admin_compte_activite_principale'))!.params).toEqual([5, 'gestion', '2027-11-16', 'Arnaud Jorel']);
    const log = appels.find((a) => a.sql.startsWith('INSERT INTO admin_utilisateur_log'))!;
    expect(log.sql).toContain("'changement_fonctions'");
    expect(JSON.parse(log.params[2] as string)).toEqual({ fonctions: ['location'], principale: 'location' });
    expect(JSON.parse(log.params[3] as string)).toEqual({ fonctions: ['gestion'], principale: 'gestion', depuis: '2027-11-16' });
    expect(sqls().some((s) => /DELETE|TRUNCATE/.test(s))).toBe(false);
  });
  it('garder la Location et ajouter la Gestion, principale Gestion : la Location reste ouverte (sans part de salaire)', async () => {
    await definirFonctions(5, { fonctions: ['location', 'gestion'], principale: 'gestion', depuis: '2027-11-16' }, 2, 'Arnaud Jorel');
    expect(sqls().some((s) => s.startsWith('UPDATE admin_compte_fonction SET jusqua'))).toBe(false);
    expect(appels.filter((a) => a.sql.startsWith('INSERT INTO admin_compte_activite_principale')).map((a) => a.params[1])).toEqual(['gestion']);
  });
  it('rien ne change : rien n’est écrit (ni journal)', async () => {
    reponses = [(s) => (s.includes('FROM admin_compte_activite_principale WHERE compte_id = $1') ? { rows: [{ id: '2', activite: 'location', origine: 'saisie', depuis: null }] } : undefined), PONS];
    expect(await definirFonctions(5, { fonctions: ['location'], principale: 'location', depuis: '2027-11-16' }, 2, 'Arnaud Jorel')).toEqual({ ok: true, change: false });
    expect(sqls().some((s) => s.startsWith('INSERT') || s.startsWith('UPDATE'))).toBe(false);
  });
  it('confirmer la principale déduite par la migration : origine « saisie », journalisé', async () => {
    expect(await definirFonctions(5, { fonctions: ['location'], principale: 'location', depuis: '2027-11-16' }, 2, 'Arnaud Jorel')).toEqual({ ok: true, change: true });
    expect(appels.find((a) => a.sql.startsWith("UPDATE admin_compte_activite_principale SET origine = 'saisie'"))!.params).toEqual(['2', 'Arnaud Jorel']);
    expect(sqls().some((s) => s.startsWith('INSERT INTO admin_compte_activite_principale'))).toBe(false);
  });
  it('des fonctions sans activité principale, ou une principale non cochée : refus, rien n’est écrit', async () => {
    const r = await definirFonctions(5, { fonctions: ['location', 'gestion'], principale: null, depuis: '2027-11-16' }, 2, 'Arnaud Jorel');
    expect(r).toEqual({ ok: false, change: false, motif: expect.stringContaining('activité principale') });
    expect((await definirFonctions(5, { fonctions: ['location'], principale: 'gestion', depuis: '2027-11-16' }, 2, 'x')).ok).toBe(false);
    expect(sqls().some((s) => s.startsWith('INSERT') || s.startsWith('UPDATE'))).toBe(false);
  });
  it('sans la 453 : la pose d’avant (retire_le), sans activité principale', async () => {
    avec453.mockResolvedValue(false);
    reponses = [(s) => (s.includes('FROM admin_utilisateur WHERE id = $1') ? { rows: [{ id: '5' }] } : s.includes('FROM admin_compte_fonction') ? { rows: [{ fonction: 'location', origine: 'saisie' }] } : undefined)];
    expect(await definirFonctions(5, ['vente'], 2, 'x')).toEqual({ ok: true, change: true });
    expect(sqls().some((s) => s.includes('admin_compte_activite_principale'))).toBe(false);
  });
});

describe('motifChoixFonctions (PUR)', () => {
  const vierge = { periodes: [{ fonction: 'vente' as const, depuis: null, jusqua: null }], principales: [] };
  it('« Depuis toujours » : seulement un profil sans rien de daté', () => {
    expect(motifChoixFonctions({ fonctions: ['vente'], principale: 'vente', depuis: null }, vierge)).toBeNull();
    expect(motifChoixFonctions({ fonctions: ['vente'], principale: 'vente', depuis: null }, { ...vierge, principales: [{ activite: 'location', depuis: '2027-01-01' }] }))
      .toContain('Depuis toujours');
  });
  it('aucune fonction : aucune activité principale exigée', () => {
    expect(motifChoixFonctions({ fonctions: [], principale: null, depuis: '2027-11-16' }, vierge)).toBeNull();
  });
});

describe('lireFonctions + l’historique lisible', () => {
  it('après le changement du 16/11/2027 : l’historique dit « Activité principale : Location → Gestion le 16/11/2027 — par Arnaud Jorel », puis « Depuis toujours »', async () => {
    reponses = [(s) => (s.includes('FROM admin_compte_fonction') ? { rows: [{ fonction: 'location', origine: 'saisie', depuis: null, jusqua: '2027-11-16' },
      { fonction: 'gestion', origine: 'saisie', depuis: '2027-11-16', jusqua: null }] }
      : s.includes('FROM admin_compte_activite_principale') ? { rows: [{ activite: 'location', origine: 'deduite', depuis: null }, { activite: 'gestion', origine: 'saisie', depuis: '2027-11-16' }] }
      : s.includes('FROM admin_utilisateur_log') ? { rows: [
        { ts: '2026-11-03', par: 'Arnaud Jorel', avant: { fonctions: ['location', 'vente'] }, apres: { fonctions: ['location'] } },
        { ts: '2026-11-03', par: 'Arnaud Jorel', avant: { fonctions: ['location'], principale: 'location' }, apres: { fonctions: ['gestion'], principale: 'gestion', depuis: '2027-11-16' } }] } : undefined)];
    const e = await lireFonctions(5);
    expect(e.datees).toBe(true);
    expect(e.initial).toEqual({ fonctions: ['location'], principale: 'location' });
    expect(lignesHistoriqueFonctions(e)).toEqual([
      'Activité principale : Location → Gestion le 16/11/2027 — par Arnaud Jorel',
      'Fonctions : Location → Gestion le 16/11/2027 — par Arnaud Jorel',
      'Fonctions : Location, Vente → Location le 03/11/2026 — par Arnaud Jorel',
      'Depuis toujours : Location — activité principale Location']);
    // la lecture n'écrit rien
    expect(sqls().every((s) => s.startsWith('SELECT'))).toBe(true);
  });
  it('Jean-Baptiste PONS au lendemain de la 453 : Location, activité principale Location (déduite)', async () => {
    reponses = [(s) => (s.includes('FROM admin_compte_fonction') ? { rows: [{ fonction: 'location', origine: 'saisie', depuis: null, jusqua: null }] }
      : s.includes('FROM admin_compte_activite_principale') ? { rows: [{ activite: 'location', origine: 'deduite', depuis: null }] } : undefined)];
    const e = await lireFonctions(5);
    expect([e.valeur, e.principale, e.principaleDeduite]).toEqual([['location'], 'location', true]);
    expect(lignesHistoriqueFonctions(e)).toEqual(['Depuis toujours : Location — activité principale Location']);
  });
});
