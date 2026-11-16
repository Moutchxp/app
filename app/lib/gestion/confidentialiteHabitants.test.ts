import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (16/11/2026, fiche Copropriété) — garde-fou : un habitant ne voit jamais les autres destinataires d'un envoi. */
const h = vi.hoisted(() => ({ habitants: [] as string[], sql: [] as string[], params: [] as unknown[][] }));
vi.mock('../db/client', () => ({ query: async (sql: string, p: unknown[]) => { h.sql.push(sql); h.params.push(p); return { rows: h.habitants.filter((x) => (p[0] as string[]).includes(x)).map((valeur) => ({ valeur })) }; } }));
vi.mock('./config', () => ({ chargerConfigGestion: async () => ({ adresseGestion: 'gestion@sansvisavis.com' }) }));
import { CATEGORIES_HABITANT, MOTIF_HABITANT_VISIBLE, refusEnvoiHabitants, refusHabitantVisible } from './confidentialiteHabitants';

const interne = (a: string): boolean => a.endsWith('@sansvisavis.com');
beforeEach(() => { h.habitants = ['lea.martin@exemple.test']; h.sql = []; h.params = []; });

describe('la règle (pure)', () => {
  it('un habitant visible avec une autre personne extérieure visible : REFUS', () => {
    expect(refusHabitantVisible(['lea.martin@exemple.test', 'jean@exemple.test'], new Set(['lea.martin@exemple.test']), interne)).toBe(MOTIF_HABITANT_VISIBLE);
    expect(refusHabitantVisible(['Lea.Martin@exemple.test ', 'paul@exemple.test'], new Set(['lea.martin@exemple.test']), interne)).toBe(MOTIF_HABITANT_VISIBLE);
  });
  it('seul avec l’agence (gestion@, collaborateurs) : permis ; le même habitant deux fois : permis', () => {
    expect(refusHabitantVisible(['lea.martin@exemple.test', 'gestion@sansvisavis.com', 'a.jorel@sansvisavis.com'], new Set(['lea.martin@exemple.test']), interne)).toBeNull();
    expect(refusHabitantVisible(['lea.martin@exemple.test', 'LEA.MARTIN@exemple.test'], new Set(['lea.martin@exemple.test']), interne)).toBeNull();
  });
  it('sans habitant : les envois d’aujourd’hui sont inchangés (deux extérieurs visibles restent possibles)', () => {
    expect(refusHabitantVisible(['jean@exemple.test', 'paul@exemple.test'], new Set(), interne)).toBeNull();
  });
  it('le gardien n’est pas un habitant ; copropriétaire, conseil syndical et personnalisé le sont', () => {
    expect(CATEGORIES_HABITANT).toEqual(['coproprietaire', 'conseil_syndical', 'personnalise']);
    expect(MOTIF_HABITANT_VISIBLE).toContain('copie cachée (Cci)');
  });
});

describe('l’envoi (À et Cc visibles, Cci jamais)', () => {
  it('habitant en À avec un autre en Cc : refus ; habitant en Cci : permis (aucune lecture inutile de la base)', async () => {
    expect(await refusEnvoiHabitants({ a: ['lea.martin@exemple.test'], cc: ['jean@exemple.test'] })).toBe(MOTIF_HABITANT_VISIBLE);
    expect(h.params[0][1]).toEqual(['coproprietaire', 'conseil_syndical', 'personnalise']);
    h.sql = [];
    expect(await refusEnvoiHabitants({ a: ['jean@exemple.test'], cc: [] })).toBeNull(); // un seul visible (l'habitant serait en Cci)
    expect(await refusEnvoiHabitants({ a: ['jean@exemple.test', 'gestion@sansvisavis.com'], cc: [] })).toBeNull();
    expect(h.sql).toEqual([]);
  });
});
