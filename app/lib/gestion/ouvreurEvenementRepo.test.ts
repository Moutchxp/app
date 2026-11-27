import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (27/11/2026, 09h48) — la lecture groupée de « qui a ouvert » : colonne de l'événement, sinon journal de sa création ; LECTURE SEULE. */
const h = vi.hoisted(() => ({ sql: [] as { s: string; p: unknown[] }[], rows: [] as Record<string, unknown>[] }));
vi.mock('../db/client', () => ({ query: async (sql: string, p: unknown[] = []) => { h.sql.push({ s: sql.replace(/\s+/g, ' ').trim(), p }); return { rows: h.rows }; } }));
import { ouvreursDesEvenements } from './ouvreurEvenementRepo';

beforeEach(() => { h.sql = []; h.rows = []; });

describe('ouvreursDesEvenements', () => {
  it('rien à lire : aucune requête', async () => {
    expect((await ouvreursDesEvenements([])).size).toBe(0);
    expect(h.sql).toEqual([]);
  });
  it('la colonne, sinon le journal de CRÉATION (« ouverture » sans valeur d’avant), le compte par n° ou par identifiant ; SELECT seulement', async () => {
    h.rows = [{ id: '1', par: '2', libelle: 'a.jorel@sansvisavis.com', prenom: 'Arnaud', nom: 'Jorel' },
      { id: '5', par: null, libelle: null, prenom: null, nom: null }, { id: '6', par: null, libelle: 'relève automatique', prenom: null, nom: null }];
    const m = await ouvreursDesEvenements([1, 5, 6]);
    expect([...m.entries()]).toEqual([[1, { sorte: 'utilisateur', cle: 'u2', nom: 'Arnaud JOREL' }], [5, { sorte: 'non_renseigne', cle: 'nr' }], [6, { sorte: 'automatique', cle: 'auto' }]]);
    const s = h.sql[0].s;
    expect(s).toContain("j.entite = 'evenement' AND j.entite_id = e.id AND j.action = 'ouverture' AND j.valeur_avant IS NULL");
    expect(s).toContain('coalesce(nullif(btrim(e.ouvert_par_libelle), \'\'), jo.auteur_libelle)');
    expect(s).toContain('lower(a.identifiant) = lower(o.libelle)');
    expect(h.sql[0].p).toEqual([[1, 5, 6]]);
    expect(/\b(INSERT|UPDATE|DELETE)\b/i.test(s)).toBe(false);
  });
});
