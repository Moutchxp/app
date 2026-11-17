import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Décision d'Arno (17/11/2026, migration 488) — « Le « − » sur un bâtiment déjà enregistré dans la copropriété mais SANS code : après confirmation
 * (« Retirer le bâtiment X de la copropriété ? Il ne sera plus proposé ; il reste dans l'historique »), le bâtiment est marqué retiré (date, auteur), jamais
 * effacé ; il ne revient plus à la réouverture ni dans le menu des bâtiments ; il peut être recréé ensuite par « Ajouter nouveau bâtiment » (il reprend alors
 * sa ligne). Refus clair si un bien est encore relié à ce bâtiment (dire lesquels). » 🔒 Base simulée.
 */
const h = vi.hoisted(() => ({ sql: [] as { s: string; p: unknown[] }[], avec488: true, registre: [] as { id: string; actif: boolean }[], lies: [] as string[],
  lots: [] as Record<string, unknown>[], places: [] as Record<string, unknown>[] }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (s.startsWith('SELECT b.id::text, (coalesce')) return { rows: h.registre };
  if (s.startsWith('SELECT id::text FROM gestion_annuaire_lot WHERE copropriete_batiment_id')) return { rows: h.lies.map((id) => ({ id })) };
  if (s.startsWith('SELECT b.batiment_cle AS cle')) return { rows: [{ cle: 'c' }] };
  return { rows: [], rowCount: 1 };
});
vi.mock('../db/client', () => ({ query: q }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => h.avec488 }));
vi.mock('./digicodesRepo', () => ({
  digicodesDesAdresses: async () => [{ adresseCle: '7 rue x', commun: {}, batiments: h.places, nbBiens: 0 }],
  chargerAnciens: async () => ({ lotsBruts: h.lots }),
  adresseCleDuBien: (l: { immeuble: string }) => l.immeuble,
  batimentCleDuBien: (l: { batimentLieCle: string | null; batiment: string | null }) => l.batimentLieCle ?? (l.batiment ?? '').toLowerCase(),
}));
import { batimentsRetires, reprendreSiRetire, retirerBatiment } from './batimentRetraitRepo';
import type { RequeteTx } from '../db/client';

const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const C = { coproprieteCle: '7 rue x', adresseCles: ['7 rue x'] };
const MAINTENANT = new Date('2026-11-17T15:00:00.000Z');
const tx = q as unknown as RequeteTx;
const ecritures = () => h.sql.filter((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s));
beforeEach(() => { h.sql = []; h.avec488 = true; h.registre = [{ id: '40', actif: true }]; h.lies = []; h.lots = []; h.places = []; });

describe('🔴 retirer un bâtiment sans code', () => {
  it('le bâtiment est marqué retiré : UN événement « retire » (date, auteur) — rien d’effacé, rien de modifié', async () => {
    expect(await retirerBatiment(tx, C, 'C', AUTEUR, MAINTENANT)).toEqual({ ok: true });
    expect(ecritures().map((x) => [x.s.slice(0, 50), x.p])).toEqual([['INSERT INTO gestion_copropriete_batiment_etat (bat', ['40', MAINTENANT.toISOString(), 2, 'a.jorel@sansvisavis.com']]]);
  });
  it('🔴 un bien encore relié (lien sûr, ou texte « Bâtiment » d’un bien de la copropriété) : refus qui DIT lesquels ; rien n’est écrit', async () => {
    h.lies = ['451'];
    h.lots = [{ id: 451, numero: 'app-1', immeuble: 'ailleurs', adresse: '7 rue _TEST RETRAIT BATIMENT', batiment: null, batimentLieCle: 'c' },
      { id: 12, numero: 'W12', immeuble: '7 rue x', adresse: '7 rue X', batiment: 'C', batimentLieCle: null },
      { id: 13, numero: 'W13', immeuble: '7 rue x', adresse: '7 rue X', batiment: 'D', batimentLieCle: null }];
    expect(await retirerBatiment(tx, C, 'C', AUTEUR, MAINTENANT)).toEqual({ ok: false,
      motif: 'Le bâtiment C est encore relié à 2 biens : 7 rue _TEST RETRAIT BATIMENT — bien 451 ; 7 rue X — lot W12. Changez d’abord leur bâtiment. Rien n’est retiré.' });
    expect(ecritures()).toEqual([]);
  });
  it('refus clairs, rien d’écrit : encore un code (ou un changement prévu) ; inconnu du registre ; déjà retiré ; sans la 488', async () => {
    h.places = [{ cle: 'c', code: { valeur: { digicode: true, code: 'C1' } }, aVenir: [] }];
    expect(await retirerBatiment(tx, C, 'C', AUTEUR, MAINTENANT)).toMatchObject({ ok: false, motif: expect.stringContaining('retirez d’abord son code') });
    h.places = [{ cle: 'c', code: null, aVenir: [{ id: 1 }] }];
    expect((await retirerBatiment(tx, C, 'C', AUTEUR, MAINTENANT)).ok).toBe(false);
    h.places = []; h.registre = [];
    expect(await retirerBatiment(tx, C, 'C', AUTEUR, MAINTENANT)).toMatchObject({ ok: false, motif: expect.stringContaining('n’est pas enregistré dans la copropriété') });
    h.registre = [{ id: '40', actif: false }];
    expect(await retirerBatiment(tx, C, 'C', AUTEUR, MAINTENANT)).toMatchObject({ ok: false, motif: expect.stringContaining('déjà retiré') });
    h.avec488 = false;
    expect(await retirerBatiment(tx, C, 'C', AUTEUR, MAINTENANT)).toMatchObject({ ok: false, motif: expect.stringContaining('migration 488') });
    expect(ecritures()).toEqual([]);
  });
  it('recréé par « Ajouter nouveau bâtiment » : un événement « repris », seulement s’il était retiré ; sans la 488 : rien', async () => {
    await reprendreSiRetire(tx, '7', 'c', AUTEUR);
    const r = ecritures()[0];
    expect(r.s).toContain("SELECT b.id, 'repris', $3, $4 FROM gestion_copropriete_batiment b WHERE b.copropriete_id = $1 AND b.batiment_cle = $2 AND NOT (");
    expect(r.p).toEqual(['7', 'c', 2, 'a.jorel@sansvisavis.com']);
    h.sql = []; h.avec488 = false;
    await reprendreSiRetire(tx, '7', 'c', AUTEUR);
    expect(ecritures()).toEqual([]);
  });
  it('les clés des bâtiments retirés d’une copropriété (vide sans copropriété ou sans la 488)', async () => {
    expect([...(await batimentsRetires(7, tx))]).toEqual(['#c']); // 🔴 (lot 3) la clé à son adresse : « adresse#nom » (sans adresse : « #nom », partout)
    expect([...(await batimentsRetires(null, tx))]).toEqual([]);
    h.avec488 = false;
    expect([...(await batimentsRetires(7, tx))]).toEqual([]);
  });
});
