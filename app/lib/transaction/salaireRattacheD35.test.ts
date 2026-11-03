import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 D35 (Arno, 03/11/2026, option C, migration 453) — LA SAISIE D'UN SALAIRE RATTACHÉ AU COLLABORATEUR (base simulée) :
 *   · un salaire ne se saisit que pour un collaborateur qui a une activité principale ce mois-là ; dans l'activité qui le porte ; la location et la
 *     gestion sur CRITERIMMO ;
 *   · la ligne s'écrit SANS famille (elle se calcule) ; un salarié UNE fois par mois, toutes activités et structures confondues ;
 *   · à la lecture, un salaire du mois d'un changement est dans les deux activités, au prorata.
 */
const avec453 = vi.fn<() => Promise<boolean>>(async () => true);
vi.mock('../admin/schemaDroits', () => ({ droitTransactionDisponible: async () => true, coutsSaisisDisponible: async () => true, activitePrincipaleDisponible: () => avec453(),
  repartitionDisponible: async () => false, prixVenteDisponible: async () => false, annulationDisponible: async () => false, uniteCommissionDisponible: async () => false,
  statutDisponible: async () => false, interCabinetDisponible: async () => false, commissionneDisponible: async () => false, modeCommissionDisponible: async () => false,
  personneTypeDisponible: async () => false, mongaDisponible: async () => false, mandatDisponible: async () => false }));
const appels: { sql: string; params: unknown[] }[] = [];
let reponses: ((sql: string) => { rows: Record<string, unknown>[] } | undefined)[] = [];
const q = vi.fn(async (sql: string, params: unknown[] = []) => {
  appels.push({ sql: sql.replace(/\s+/g, ' '), params });
  for (const r of reponses) { const x = r(sql.replace(/\s+/g, ' ')); if (x !== undefined) return x; }
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: (s: string, p: unknown[]) => q(s, p), withTransaction: async (fn: (x: typeof q) => unknown) => fn(q) }));
const repo = await import('./repo');
const A = { id: 3, libelle: 'arno' };
// Jean-Baptiste PONS (5) : Location, puis Gestion à compter du 16/11/2027 ; Arnaud Jorel (2) : Vente ; Cédric (9) : aucune activité principale
const PRINCIPALES = [{ compte_id: '5', activite: 'location', depuis: null }, { compte_id: '5', activite: 'gestion', depuis: '2027-11-16' }, { compte_id: '2', activite: 'vente', depuis: null }];
beforeEach(() => {
  appels.length = 0; avec453.mockResolvedValue(true);
  reponses = [(s) => (s.includes('FROM admin_compte_activite_principale') ? { rows: PRINCIPALES } : undefined),
    (s) => (s.startsWith('INSERT INTO transaction_cout_ligne') ? { rows: [{ id: '41' }] } : undefined),
    (s) => (s.startsWith('INSERT INTO transaction_journal') ? { rows: [{ id: '900' }] } : undefined)];
});
const salaire = (o: Partial<Parameters<typeof repo.ajouterCoutLigne>[0]> = {}) => ({ societe: 'criterimmo' as const, famille: 'gestion' as const, poste: 'salaires' as const,
  annee: 2027, mois: 11, compteId: 5, libelle: null, montantHt: 3000, ...o });
const insertion = () => appels.find((a) => a.sql.startsWith('INSERT INTO transaction_cout_ligne'));

describe('ajouterCoutLigne — un salaire rattaché au collaborateur', () => {
  it('le mois du changement, dans la gestion (sa nouvelle activité) : accepté, écrit SANS famille ; le doublon cherché sur le mois et le salarié seuls', async () => {
    expect(await repo.ajouterCoutLigne(salaire(), A)).toEqual({ ok: true, valeur: 41 });
    expect(insertion()!.params.slice(0, 6)).toEqual(['criterimmo', null, 'salaires', 2027, 11, 5]);
    const doublon = appels.find((a) => a.sql.includes("SELECT id FROM transaction_cout_ligne WHERE retire_le IS NULL AND poste = 'salaires'"))!;
    expect(doublon.sql).not.toContain('famille');
    expect(doublon.params).toEqual([2027, 11, 5]);
  });
  it('dans la location le mois du changement (son ancienne activité) : accepté aussi — la même ligne, répartie', async () => {
    expect((await repo.ajouterCoutLigne(salaire({ famille: 'location' }), A)).ok).toBe(true);
  });
  it('décembre, dans la location : refusé — son salaire va à la Gestion ; rien n’est écrit', async () => {
    const r = await repo.ajouterCoutLigne(salaire({ famille: 'location', mois: 12 }), A);
    expect(r).toEqual({ ok: false, motif: expect.stringContaining('va à son activité principale (Gestion)') });
    expect(insertion()).toBeUndefined();
  });
  it('un collaborateur sans activité principale : refusé, le motif dit où la poser ; rien n’est écrit', async () => {
    const r = await repo.ajouterCoutLigne(salaire({ compteId: 9, famille: 'vente' }), A);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motif).toContain('Administratif › Comptes');
    expect(insertion()).toBeUndefined();
  });
  it('C7 — une part en location ou gestion sur MACJ : refusé', async () => {
    const r = await repo.ajouterCoutLigne(salaire({ societe: 'macj', famille: 'gestion' }), A);
    expect(!r.ok && r.motif).toContain('CRITERIMMO');
  });
  it('un salarié qui a déjà son salaire ce mois-là (dans une autre activité) : 409, rien n’est écrit', async () => {
    reponses.unshift((s) => (s.includes("SELECT id FROM transaction_cout_ligne WHERE retire_le IS NULL AND poste = 'salaires'") ? { rows: [{ id: '40' }] } : undefined));
    expect(await repo.ajouterCoutLigne(salaire(), A)).toEqual({ ok: false, motif: expect.stringContaining('déjà son salaire'), conflit: true });
    expect(insertion()).toBeUndefined();
  });
  it('sans la 453 : la règle d’avant (famille enregistrée, doublon par structure et famille)', async () => {
    avec453.mockResolvedValue(false);
    expect((await repo.ajouterCoutLigne(salaire({ famille: 'location', mois: 12 }), A)).ok).toBe(true);
    expect(insertion()!.params[1]).toBe('location');
  });
  it('« Autres » : inchangé, sa famille enregistrée', async () => {
    expect((await repo.ajouterCoutLigne(salaire({ poste: 'autres', compteId: null, libelle: 'Loyer', famille: 'location' }), A)).ok).toBe(true);
    expect(insertion()!.params[1]).toBe('location');
  });
});

describe('lireCoutsLignes — la famille se calcule', () => {
  it('le salaire de novembre (3 000 €) : 1 500 en location (15/30 j), 1 500 en gestion ; décembre : 100 % gestion', async () => {
    reponses.unshift((s) => (s.includes('FROM transaction_cout_ligne l') ? { rows: [
      { id: '41', societe: 'criterimmo', famille: null, poste: 'salaires', annee: 2027, mois: 11, compte_id: '5', libelle: null, montant_ht: '3000.00', tva: false, compte_libelle: 'Jean-Baptiste Pons', version: '9' },
      { id: '42', societe: 'criterimmo', famille: null, poste: 'salaires', annee: 2027, mois: 12, compte_id: '5', libelle: null, montant_ht: '3000.00', tva: false, compte_libelle: 'Jean-Baptiste Pons', version: '10' }] } : undefined));
    const ls = (await repo.lireCoutsLignes())!;
    expect(ls.map((l) => [l.id, l.mois, l.famille, l.montantHt, l.montantSaisiHt, l.prorata?.jours ?? null])).toEqual([
      [41, 11, 'location', 1500, 3000, 15], [41, 11, 'gestion', 1500, 3000, 15], [42, 12, 'gestion', 3000, 3000, null]]);
  });
});

describe('motifSalaire (PUR)', () => {
  const p = new Map([[5, [{ activite: 'location' as const, depuis: null }, { activite: 'gestion' as const, depuis: '2027-11-16' }]]]);
  it('un changement le 1er : 100 % la nouvelle dès ce mois — l’ancienne refusée ce mois-là', () => {
    const p1 = new Map([[5, [{ activite: 'location' as const, depuis: null }, { activite: 'gestion' as const, depuis: '2027-11-01' }]]]);
    expect(repo.motifSalaire(p1, 5, 'criterimmo', 2027, 11, 'location')).toContain('(Gestion)');
    expect(repo.motifSalaire(p1, 5, 'criterimmo', 2027, 11, 'gestion')).toBeNull();
    expect(repo.motifSalaire(p1, 5, 'criterimmo', 2027, 10, 'location')).toBeNull();
  });
  it('le mois du changement : les deux ; famille non vérifiée (changement de salarié) : accepté', () => {
    expect(repo.motifSalaire(p, 5, 'criterimmo', 2027, 11, 'location')).toBeNull();
    expect(repo.motifSalaire(p, 5, 'criterimmo', 2027, 11, null)).toBeNull();
  });
});
