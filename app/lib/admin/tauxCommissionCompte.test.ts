import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Mon espace (Arno, 07/11/2026, 462) — le taux de commission du PROFIL : lu (sans la 462 : rien), changé avec sa ligne de journal, borné à
 * 0-100 % ; la saisie d'un compromis refuse aussi un taux > 100 % ; le message du total dit l'écart.
 */
const h = vi.hoisted(() => ({ q: vi.fn(), dispo: vi.fn() }));
vi.mock('../db/client', () => ({ query: (s: string, p: unknown[]) => h.q(s, p) }));
vi.mock('./schemaDroits', () => ({ tauxCommissionDisponible: () => h.dispo() }));
const m = await import('./tauxCommissionCompte');
const { lireDossier } = await import('../transaction/saisie');
const { motifSomme, phraseEcart } = await import('../transaction/repartition');
const { tauxManquants, MANQUE_TAUX } = await import('../mon-espace/compromisCommun');
beforeEach(() => { h.q.mockReset(); h.dispo.mockResolvedValue(true); });

describe('le taux de commission du profil', () => {
  it('lecture de plusieurs comptes (to_jsonb : sans la 462, aucun) ; non renseigné : null', async () => {
    h.q.mockResolvedValue({ rows: [{ id: '5', taux: '60' }, { id: '6', taux: null }] });
    expect([...(await m.tauxCommissionDesComptes([5, 6])).entries()]).toEqual([[5, 60], [6, null]]);
    expect(String(h.q.mock.calls[0][0]).replace(/\s+/g, ' ')).toContain("to_jsonb(u) ->> 'taux_commission'");
  });
  it('changement : UPDATE et journal ensemble (avant / après, auteur) ; vide = non renseigné ; hors bornes refusé sans requête ; sans la 462 : refus', async () => {
    h.q.mockResolvedValue({ rows: [{ id: '5', change: true }] });
    expect(await m.definirTauxCommissionCompte(5, '62,5', 2)).toEqual({ ok: true, change: true });
    const [sql, params] = h.q.mock.calls[0];
    expect(String(sql).replace(/\s+/g, ' ')).toContain("'changement_taux_commission'");
    expect(params).toEqual([5, 62.5, 2]);
    expect(await m.definirTauxCommissionCompte(5, '', 2)).toEqual({ ok: true, change: true });
    expect(h.q.mock.calls[1][1]).toEqual([5, null, 2]);
    h.q.mockClear();
    for (const x of [101, -1, '120', 'abc', Number.NaN]) expect(await m.definirTauxCommissionCompte(5, x, 2)).toEqual({ ok: false, motif: m.MOTIF_TAUX_BORNES });
    expect(h.q).not.toHaveBeenCalled();
    h.dispo.mockResolvedValue(false);
    expect(await m.definirTauxCommissionCompte(5, 50, 2)).toEqual({ ok: false, motif: m.MOTIF_SANS_462 });
  });
  it('bornes : 0 et 100 inclus', () => {
    expect([m.tauxSaisi(0), m.tauxSaisi(100), m.tauxSaisi('100 %'), m.tauxSaisi(100.01)]).toEqual([0, 100, 100, undefined]);
  });
});

describe('la saisie d’un compromis : chaque taux entre 0 et 100 %, sans plafond commun', () => {
  const dossier = (taux: [string, string]) => ({ societe: 'criterimmo', statut: 'compromis', honorairesTtc: '12 000', retroApporteurTtc: '',
    commissions: { entree: { montant: '', unite: 'ttc', taux: taux[0] }, sortie: { montant: '', unite: 'ttc', taux: taux[1] } } });
  it('60 % + 60 % : accepté ; 101 % : refusé, message clair', () => {
    expect(lireDossier(dossier(['60', '60'])).ok).toBe(true);
    const r = lireDossier(dossier(['50', '101']));
    expect(r).toMatchObject({ ok: false });
    expect(JSON.stringify(r)).toContain('Le taux de commission du négociateur de sortie doit être compris entre 0 et 100 %.');
  });
});

describe('le total des parts : l’écart dit clairement', () => {
  const p = (pourcentage: number) => ({ sorte: 'entree' as const, compteId: 1, negociateur: 'A', societe: 'criterimmo' as const, nom: null, coordonnees: null, pourcentage, montantHt: null });
  it('il manque / de trop, en % et en € HT ; juste : aucun message', () => {
    const n = (x: string): string => x.replace(/\s/g, ' ');
    expect(n(phraseEcart(90, 9000, 10000))).toBe('Écart : il manque 10 % (1 000 € HT).');
    expect(n(phraseEcart(110, 11000, 10000))).toBe('Écart : 10 % de trop (1 000 € HT).');
    expect(n(motifSomme([p(60), { ...p(30), sorte: 'exterieure' as const, compteId: null, societe: null }], 10000) ?? '')).toContain('Écart : il manque 10 %');
    expect(motifSomme([p(100)], 10000)).toBeNull();
  });
});

describe('le serveur : le taux de commission est obligatoire à la création (aucun 50 % par défaut)', () => {
  const tous = () => true;
  it('un côté commissionné sans taux : manquant ; non commissionné : non exigé ; « deux côtés » : l’entrée seule ; sans commissions : rien', () => {
    const s = (taux: { entree: number | null; sortie: number | null }, parties = [{ sorte: 'entree' }, { sorte: 'sortie' }]) => ({ entreeId: 5, sortieId: 6, parties, commissions: { taux } });
    expect(tauxManquants(s({ entree: 60, sortie: null }), tous)).toEqual(['sortie']);
    expect(tauxManquants(s({ entree: 60, sortie: 0 }), tous)).toEqual([]);
    expect(tauxManquants(s({ entree: 60, sortie: null }), (id) => id !== 6)).toEqual([]);
    expect(tauxManquants({ entreeId: 5, sortieId: 5, parties: [{ sorte: 'entree_sortie' }], commissions: { taux: { entree: null, sortie: null } } }, tous)).toEqual(['entree']);
    expect(tauxManquants({ entreeId: 5, sortieId: 5, parties: [{ sorte: 'entree_sortie' }], commissions: { taux: { entree: 45, sortie: null } } }, tous)).toEqual([]);
    expect(tauxManquants({ entreeId: 5, sortieId: 6, parties: [] }, tous)).toEqual([]);
    expect(MANQUE_TAUX('sortie')).toBe('Saisissez le taux de commission (entre 0 et 100 %) du collaborateur de sortie du mandat (côté acquéreur).');
  });
});
