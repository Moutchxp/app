import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appliquerUnification, annulerUnification, phraseUnification, RefusUnification } from './unificationApplicationRepo';
import type { Immeuble, PlanUnification, EntreeUnification } from './unificationStock';

/** 🔴🔴 Arno (20/11/2026, lot 5) — appliquer et annuler : tracé, rien de supprimé hors ce que la passe a créé, refus sans rien écrire. */
const h = vi.hoisted(() => ({ sql: [] as { s: string; p: unknown[] }[], trace: [] as Record<string, unknown>[], annulee: false, references: 0 }));
const q = async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (s.startsWith('INSERT INTO gestion_adresse_operation (')) return { rows: [{ id: '2' }] };
  if (s.startsWith('INSERT INTO gestion_copropriete (')) return { rows: [{ id: '300' }] };
  if (s.startsWith('SELECT ban_id FROM gestion_copropriete WHERE id')) return { rows: [{ ban_id: null }] };
  if (s.startsWith('SELECT ban_id, sorte FROM gestion_copropriete_adresse')) return { rows: [{ ban_id: null, sorte: 'adresse' }] };
  if (s.startsWith('INSERT INTO gestion_copropriete_adresse')) return { rows: [{ id: '40' }] };
  if (s.startsWith('UPDATE gestion_copropriete_regroupement SET absorbe_le')) return { rows: [{ id: '9' }] };
  if (s.startsWith('SELECT count(*)::int AS n FROM gestion_lot_adresse_ban')) return { rows: [{ n: 0 }] };
  if (s.startsWith('SELECT annulee_le IS NOT NULL AS annulee')) return { rows: [{ annulee: h.annulee }] };
  if (s.startsWith('SELECT table_nom, ligne_id')) return { rows: h.trace };
  if (s.startsWith('SELECT ((SELECT count(*) FROM gestion_copropriete_syndic')) return { rows: [{ n: h.references }] };
  if (s.startsWith('SELECT copropriete_id::text AS copro FROM gestion_copropriete_adresse WHERE id')) return { rows: [{ copro: p[0] === '40' ? '300' : '7' }] };
  if (s.startsWith('UPDATE gestion_lot_adresse_ban SET fin')) return { rows: [{ id: '1' }] };
  return { rows: [] };
};
vi.mock('./banRepo', () => ({ enregistrerRapprochement: async (qq: typeof q, lotId: number, _r: unknown, o: { operationId: number }) => { await qq('INSERT INTO gestion_lot_adresse_ban (…)', [lotId, o.operationId]); return true; } }));
const AUTEUR = { id: null, libelle: 'unification (épreuve)' };
const imm = (o: Partial<Immeuble>): Immeuble => ({ officielle: '54 Avenue Puvis De Chavannes, 92400 Courbevoie', banIds: ['B54'], adresses: [], lignes: ['54 a'], coprosEnregistrees: [276], cible: 276,
  ecritures: [], biens: 2, actions: [], conflits: [], digicodes: [], autres: {}, ...o });
const PLAN = (immeubles: Immeuble[]) => ({ biens: { total: 1, certains: 1, aVerifier: 0, introuvables: 0 }, coproprietes: { avant: 1, apres: 1 }, immeubles, changeants: 1,
  actions: {}, conflits: 0, digicodes: { fusionnes: 0, aTrancher: 0 }, regroupements: { absorbes: 0, nonAbsorbes: [] } }) as unknown as PlanUnification;
const ENTREE = { biens: [{ id: 1, immeuble: '54 a', adresse: null, codePostal: '92400', commune: 'Courbevoie' }], rapprochementDesBiens: new Map([[1, { statut: 'certain' }]]) } as unknown as EntreeUnification;
beforeEach(() => { h.sql = []; h.trace = []; h.annulee = false; h.references = 0; });

describe('appliquer', () => {
  it('chaque écriture tracée (avant / après) ; un rapprochement par bien ; le regroupement 504 absorbé ; une ligne de journal par copropriété ; aucun DELETE', async () => {
    const i = imm({ actions: [{ sorte: 'ban_principale', coproId: 276, banId: 'B54', libelle: 'x' }, { sorte: 'ban_adresse', adresseId: 26, coproId: 276, cle: '54 b', banId: 'B54', devient: 'ecriture' },
      { sorte: 'absorber_504', regroupementId: 9, coproId: 276 }] });
    const r = await appliquerUnification(q as never, PLAN([i]), ENTREE, 'svav_recette', AUTEUR);
    expect(r).toEqual({ operationId: 2, rapprochements: 1, dejaRapproches: 0, coproprietes: 1, adresses: 1, creees: 0, ecritures: 0, absorbes: 1 });
    const traces = h.sql.filter((x) => x.s.startsWith('INSERT INTO gestion_adresse_operation_trace')).map((x) => x.p.slice(1));
    expect(traces).toEqual([['gestion_copropriete', '276', 'ban_id', null, 'B54', 'modification'], ['gestion_copropriete_adresse', '26', 'ban_id', null, 'B54', 'modification'],
      ['gestion_copropriete_adresse', '26', 'sorte', 'adresse', 'ecriture', 'modification'], ['gestion_copropriete_regroupement', '9', 'absorbe_le', null, 'now', 'modification']]);
    expect(h.sql.filter((x) => x.s.startsWith('INSERT INTO gestion_journal')).map((x) => x.p[0])).toEqual([276]);
    expect(h.sql.some((x) => /^DELETE|gestion_annuaire_lot|gestion_digicode/.test(x.s))).toBe(false);
  });
  it('un plan qui réunit deux copropriétés enregistrées : refusé, RIEN n’est écrit (le geste n’est pas encore écrit)', async () => {
    await expect(appliquerUnification(q as never, PLAN([imm({ actions: [{ sorte: 'reunir_copro', cibleId: 1, absorbeeId: 2, syndic: false, ag: 0, contacts: 0, batiments: 0, adresses: 0 }] })]), ENTREE, 'svav_recette', AUTEUR))
      .rejects.toBeInstanceOf(RefusUnification);
    expect(h.sql).toEqual([]);
  });
  it('la phrase du journal', () => {
    expect(phraseUnification(imm({ actions: [{ sorte: 'absorber_504', regroupementId: 9, coproId: 276 }] }), 2)).toBe('Unification des adresses officielles (passe n° 2) : adresse officielle 54 Avenue Puvis De Chavannes, 92400 Courbevoie ; 1 regroupement(s) 504 absorbé(s)');
  });
});

describe('annuler', () => {
  it('à l’envers : valeurs d’avant reprises, rapprochements fermés ; la copropriété CRÉÉE et ses adresses effacées seulement si rien d’autre ne s’y rattache', async () => {
    h.trace = [{ table_nom: 'gestion_copropriete_adresse', ligne_id: '40', colonne: null, avant: null, geste: 'insertion' }, { table_nom: 'gestion_copropriete', ligne_id: '300', colonne: null, avant: null, geste: 'insertion' },
      { table_nom: 'gestion_copropriete', ligne_id: '276', colonne: 'ban_id', avant: null, geste: 'modification' }];
    const r = await annulerUnification(q as never, 2, AUTEUR);
    expect(r).toEqual({ operationId: 2, fermes: 1, restaures: 1, retirees: 0, effaces: 2 });
    expect(h.sql.filter((x) => x.s.startsWith('DELETE')).map((x) => [x.s.split(' ')[2], x.p[0]])).toEqual([['gestion_copropriete_adresse', '40'], ['gestion_copropriete', '300']]);
  });
  it('refus SANS RIEN ÉCRIRE : passe déjà annulée ; copropriété créée qui a reçu d’autres données depuis', async () => {
    h.annulee = true;
    await expect(annulerUnification(q as never, 2, AUTEUR)).rejects.toThrow(/déjà annulée/);
    h.annulee = false; h.references = 1; h.trace = [{ table_nom: 'gestion_copropriete', ligne_id: '300', colonne: null, avant: null, geste: 'insertion' }];
    await expect(annulerUnification(q as never, 2, AUTEUR)).rejects.toThrow(/a reçu d’autres données depuis/);
    expect(h.sql.some((x) => /^(UPDATE|DELETE|INSERT)/.test(x.s))).toBe(false);
  });
});
