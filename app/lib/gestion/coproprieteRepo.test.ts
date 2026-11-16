import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (16/11/2026, 476) — la lecture de la fiche Copropriété (base simulée ; le vrai SQL a été rejoué sur la recette). */
const b = vi.hoisted(() => ({ avec476: true, sql: [] as string[], copro: null as Record<string, unknown> | null, adresses: [] as unknown[], lots: [] as unknown[],
  syndic: [] as unknown[], gestionnaires: [] as unknown[] }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async (t: string) => (t === 'gestion_copropriete' ? b.avec476 : true) }));
vi.mock('./contactsImmeubleRepo', () => ({ contactsDeLImmeuble: async () => [{ id: 1, categorie: 'gardien', libelle: null, civilite: 'M.', prenom: 'Paul', nom: 'Loge', note: null, coordonnees: [] }] }));
vi.mock('../db/client', () => ({
  query: async (sql: string) => {
    const s = sql.replace(/\s+/g, ' ').trim(); b.sql.push(s);
    if (s.includes('FROM gestion_copropriete c WHERE c.cle_immeuble = $1')) return { rows: b.copro ? [b.copro] : [] };
    if (s.includes('FROM gestion_copropriete_adresse WHERE copropriete_id = $1')) return { rows: b.adresses };
    if (s.includes('FROM gestion_annuaire_lot WHERE absent_le IS NULL')) return { rows: b.lots };
    if (s.includes('FROM gestion_copropriete_syndic cs JOIN gestion_syndic s')) return { rows: b.syndic };
    if (s.includes('FROM gestion_syndic_contact ct')) return { rows: b.gestionnaires };
    throw new Error(`requête inattendue : ${s.slice(0, 80)}`);
  },
}));
import { cleImmeubleDuBien, ficheCopropriete } from './coproprieteRepo';

const LOT = (id: number, immeuble: string | null, adresse: string, copropriete: boolean | null = null) => ({ id: String(id), numero: `W${id}`, immeuble, adresse, code_postal: '75011', commune: 'Paris', copropriete });
beforeEach(() => {
  b.avec476 = true; b.sql = [];
  b.copro = { id: '7', cle: 'residence les tilleuls', libelle: 'Résidence Les Tilleuls', code_postal: '75011', commune: 'Paris', nom: null, hors: false, nomenclature: null };
  b.adresses = [{ cle: '12 rue des lilas', libelle: '12 rue des Lilas', code_postal: '75011', commune: 'Paris' }];
  b.lots = [LOT(1, 'Résidence Les Tilleuls', '10 rue des Lilas', true), LOT(2, '12 rue des Lilas', '12 rue des Lilas', true), LOT(3, null, '12 rue des Lilas', null), LOT(4, 'Autre immeuble', '3 rue X', false)];
  b.syndic = [{ id: '2', nom: 'Cabinet A', ville: 'Paris', debut: '2026-01-01' }];
  b.gestionnaires = [{ id: '5', civilite: 'Mme', prenom: 'Claire', nom: 'Test', titre: 'Gestionnaire', coordonnees: [{ sorte: 'email', libelle: null, valeur: 'claire@exemple.test' }] }];
});

describe('la fiche Copropriété', () => {
  it('ses adresses (principale puis secondaires), ses biens (par « Immeuble », sinon par adresse), son syndic et ses gestionnaires, ses contacts', async () => {
    const f = (await ficheCopropriete('12 rue des Lilas'))!; // une adresse secondaire ramène à sa copropriété
    expect([f.cle, f.declaree, f.id, f.libelle]).toEqual(['residence les tilleuls', true, 7, 'Résidence Les Tilleuls']);
    expect(f.adresses.map((a) => [a.libelle, a.principale])).toEqual([['Résidence Les Tilleuls', true], ['12 rue des Lilas', false]]);
    expect(f.biens.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(f.syndic).toEqual({ id: 2, nom: 'Cabinet A', ville: 'Paris', depuis: '2026-01-01' });
    expect(f.gestionnaires.map((g) => [g.prenom, g.coordonnees.length])).toEqual([['Claire', 1]]);
    expect(f.contacts.map((c) => c.categorie)).toEqual(['gardien']);
    expect(f.desaccord).toBe(false);
    expect(b.sql.some((x) => /UPDATE|INSERT|DELETE/.test(x))).toBe(false); // lecture seule
  });
  it('pas encore enregistrée : connue par ses biens (libellé, code postal, commune), sans syndic ; inconnue : rien', async () => {
    b.copro = null; b.adresses = [];
    const f = (await ficheCopropriete('Autre immeuble'))!;
    expect([f.declaree, f.id, f.libelle, f.codePostal, f.syndic, f.biens.length]).toEqual([false, null, 'Autre immeuble', '75011', null, 1]);
    expect(await ficheCopropriete('Nulle part')).toBeNull();
    expect(await ficheCopropriete('  ')).toBeNull();
  });
  it('« hors copropriété », nom et nomenclature lus avec la 476 ; des biens qui se contredisent : désaccord', async () => {
    b.copro = { ...b.copro!, nom: 'Les Tilleuls', hors: true, nomenclature: 'lettres' };
    b.lots = [...b.lots, LOT(5, 'Résidence Les Tilleuls', '10 rue des Lilas', false)];
    const f = (await ficheCopropriete('Résidence Les Tilleuls'))!;
    expect([f.nom, f.horsCopropriete, f.nomenclature, f.desaccord, f.avec476]).toEqual(['Les Tilleuls', true, 'lettres', true, true]);
  });
  it('sans la 476 : la fiche se lit quand même (sans nom ni « hors copropriété »)', async () => {
    b.avec476 = false;
    const f = (await ficheCopropriete('Résidence Les Tilleuls'))!;
    expect([f.nom, f.horsCopropriete, f.avec476]).toEqual([null, false, false]);
    expect(b.sql.find((x) => x.includes('FROM gestion_copropriete c'))).toContain('NULL::boolean AS hors');
  });
  it('la clé d’immeuble d’un bien : son « Immeuble », sinon son adresse', () => {
    expect(cleImmeubleDuBien({ immeuble: 'Résidence Les Tilleuls', adresse: '1 rue X' })).toBe(cleImmeubleDuBien({ immeuble: 'résidence  les tilleuls', adresse: null }));
    expect(cleImmeubleDuBien({ immeuble: ' ', adresse: '12 rue des Lilas' })).toBe(cleImmeubleDuBien({ immeuble: '12 rue des Lilas', adresse: null }));
  });
});
