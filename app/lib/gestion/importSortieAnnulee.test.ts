import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 🔴🔴 (Arno, 20/11/2026 — « EMMAIMA Fathi », « INEO RAIL ») UNE SORTIE ANNULÉE DANS L'APPLICATION RESTE ANNULÉE APRÈS UN IMPORT WIPPIMMO.
 *
 * Le geste « Annuler la sortie » vide la date et écrit « location_sortie_annulee » au journal (« occupation(s) 202 de nouveau en cours »).
 * L'export WIPPIMMO, lui, porte encore la date : avant ce lot, l'import initial (`annuaireRepo.ecrireOccupations`) la RÉÉCRIVAIT
 * (`ON CONFLICT … sortie = EXCLUDED.sortie`), et la mise à jour (`calculerMiseAJour`) la « complétait » sur un bail saisi ici.
 * Désormais l'application est prioritaire : la date reste vide, la différence est DITE dans le rapport (« non appliqué »), comme pour
 * les autres valeurs saisies ici. La règle est UNE (`occupationsASortieValidee`, lue dans le journal), pour les deux chemins d'import.
 * 🔒 Aucune donnée réelle.
 */

vi.mock('./schema', async (orig) => ({ ...(await orig<Record<string, unknown>>()), rapprochementAnnuaireDisponible: async () => true }));
vi.mock('../db/client', () => ({
  query: async () => ({ rows: [] }),
  withTransaction: async (f: unknown) => (f as (q: unknown) => unknown)(async () => ({ rows: [] })),
}));

import { ecrireOccupations, COMPTES_VIDES, type ComptesImport } from './annuaireRepo';

type Ligne = { id: string; wippimmo_id: string; cle_import: string | null; locataire_id: string; lot_id: string; lot_wippimmo_id: string; entree: string | null; sortie: string | null; absent_le: string | null };
let occupations: Ligne[];
let journal: { action: string; entite_id: string; valeur_apres: string | null; commentaire: string | null }[];
let ecrits: { sql: string; params: unknown[] }[];
let preavis: string[];

const q = (async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ');
  if (/^SELECT id::text, wippimmo_id/.test(s.trim())) return { rows: occupations };
  if (/FROM gestion_journal/.test(s)) return { rows: journal };
  if (/to_regclass\('gestion_location_preavis'\)/.test(s)) return { rows: [{ ok: true }] };
  if (/FROM gestion_location_preavis/.test(s)) return { rows: preavis.map((id) => ({ id })) };
  ecrits.push({ sql: s, params });
  return { rows: [] };
}) as never;

const IMPORTEE: Ligne = { id: '202', wippimmo_id: '792', cle_import: null, locataire_id: '191', lot_id: '321', lot_wippimmo_id: '466', entree: '2025-10-01', sortie: null, absent_le: null };
const ANNULEE = { action: 'location_sortie_annulee', entite_id: '191', valeur_apres: null, commentaire: 'sortie du 2026-11-30 annulée — occupation(s) 202 de nouveau en cours' };
const plan = (sortie: string | null, wippimmoId = '792') => ({
  occupations: [{ wippimmoId, clePersonne: 'fictif#x@fictif.fr', lotWippimmoId: '466', entree: '2025-10-01', sortie }],
} as never);
const ids = { loc: new Map([['fictif#x@fictif.fr', 191]]), lot: new Map([['466', 321]]) };
const comptes = (): ComptesImport => ({ ...COMPTES_VIDES, divergences: [] });

beforeEach(() => { ecrits = []; journal = []; preavis = []; occupations = [{ ...IMPORTEE }]; });

describe('import initial (annuaireRepo.ecrireOccupations) — la sortie annulée dans l’application est prioritaire', () => {
  it('bail importé, sortie annulée ici, l’export porte encore la date : RIEN n’est réécrit, la divergence est dite', async () => {
    journal = [ANNULEE];
    const c = comptes();
    await ecrireOccupations(q, plan('2026-11-30'), ids.loc, ids.lot, true, c);
    expect(ecrits).toEqual([]);
    expect(c.occupationsInchangees).toBe(1);
    expect(c.divergences).toEqual(['bail WIPPIMMO 792 — sortie : WIPPIMMO dit « 2026-11-30 », l’app dit « non renseigné » (non appliqué).']);
  });

  it('une autre valeur change (le lot) : l’écriture garde les dates de l’application (paramètre « dates gardées »)', async () => {
    journal = [ANNULEE];
    occupations = [{ ...IMPORTEE, lot_wippimmo_id: 'ancien' }];
    const c = comptes();
    await ecrireOccupations(q, plan('2026-11-30'), ids.loc, ids.lot, true, c);
    expect(ecrits).toHaveLength(1);
    expect(ecrits[0].sql).toContain('sortie = CASE WHEN $8::boolean THEN gestion_annuaire_occupation.sortie ELSE EXCLUDED.sortie END');
    expect(ecrits[0].params.slice(4)).toEqual(['2025-10-01', null, true, true]);
  });

  it('aucun geste de sortie dans l’application : l’export fait foi, comme avant (la date est recopiée)', async () => {
    const c = comptes();
    await ecrireOccupations(q, plan('2026-11-30'), ids.loc, ids.lot, true, c);
    expect(ecrits).toHaveLength(1);
    expect(ecrits[0].params.slice(4)).toEqual(['2025-10-01', '2026-11-30', false, false]);
    expect(c.divergences).toEqual([]);
  });

  it('le geste d’un AUTRE bail ne protège pas celui-ci', async () => {
    journal = [{ ...ANNULEE, commentaire: 'sortie du 2026-11-30 annulée — occupation(s) 999 de nouveau en cours' }];
    const c = comptes();
    await ecrireOccupations(q, plan('2026-11-30'), ids.loc, ids.lot, true, c);
    expect(ecrits[0].params[5]).toBe('2026-11-30');
  });

  it('bail SAISI ICI puis rapproché, sortie annulée : l’export ne la « complète » pas', async () => {
    occupations = [{ ...IMPORTEE, wippimmo_id: 'app-abc' }];
    journal = [ANNULEE];
    const c = comptes();
    await ecrireOccupations(q, plan('2026-11-30'), ids.loc, ids.lot, true, c);
    expect(ecrits).toHaveLength(1);   // le rapprochement (clé d'export) s'écrit…
    expect(ecrits[0].params[2]).toBeNull();   // … sans la sortie
    expect(c.divergences).toEqual(['bail WIPPIMMO 792 — sortie : WIPPIMMO dit « 2026-11-30 », l’app dit « non renseigné » (non appliqué).']);
  });
});

// La mise à jour WIPPIMMO (`calculerMiseAJour`) suit la même règle : ses épreuves sont dans miseAJourWippimmo.test.ts.

describe('🔴🔴 (Arno, 20/11/2026) import initial — un préavis validé ici, sortie non validée : il reste en préavis', () => {
  it('préavis ouvert sur le bail importé, l’export porte une sortie : la sortie n’est PAS écrite, la divergence est dite', async () => {
    preavis = ['202'];
    const c = comptes();
    await ecrireOccupations(q, plan('2026-12-31'), ids.loc, ids.lot, true, c);
    expect(ecrits).toEqual([]);
    expect(c.divergences).toEqual(['bail WIPPIMMO 792 — sortie : WIPPIMMO dit « 2026-12-31 », l’app dit « non renseigné » (non appliqué).']);
  });
  it('préavis ouvert, la date d’entrée change : elle suit l’export, la sortie reste vide', async () => {
    preavis = ['202'];
    const c = comptes();
    await ecrireOccupations(q, { occupations: [{ wippimmoId: '792', clePersonne: 'fictif#x@fictif.fr', lotWippimmoId: '466', entree: '2025-09-01', sortie: '2026-12-31' }] } as never,
      ids.loc, ids.lot, true, c);
    expect(ecrits).toHaveLength(1);
    expect(ecrits[0].params.slice(4)).toEqual(['2025-09-01', null, false, true]);
  });
  it('bail saisi ici puis rapproché, préavis ouvert : l’export ne « complète » pas la sortie', async () => {
    occupations = [{ ...IMPORTEE, wippimmo_id: 'app-abc' }];
    preavis = ['202'];
    const c = comptes();
    await ecrireOccupations(q, plan('2026-12-31'), ids.loc, ids.lot, true, c);
    expect(ecrits[0].params[2]).toBeNull();
  });
  it('SANS préavis validé ici : la date importée de WIPPIMMO s’écrit, comme avant', async () => {
    const c = comptes();
    await ecrireOccupations(q, plan('2026-12-31'), ids.loc, ids.lot, true, c);
    expect(ecrits[0].params[5]).toBe('2026-12-31');
  });
});
