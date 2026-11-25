import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (23/11/2026) — « 20 % à restituer », la LECTURE sur une base SIMULÉE : les sorties validées avec retenue (jamais une sortie annulée
 * depuis), les AGO OFFICIELLES de la copropriété (jamais les projetées enregistrées à la sortie), l'arrêté des comptes, le calcul à la lecture.
 */
const appels: string[] = [];
let sorties: Record<string, unknown>[] = [];
const query = vi.fn(async (sql: string, _p?: unknown[]) => {
  const s = sql.replace(/\s+/g, ' ');
  appels.push(s);
  if (s.includes('AS j')) return { rows: [{ j: '2026-11-23' }] };
  if (s.includes('FROM gestion_location_sortie_validee')) return { rows: sorties };
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: (sql: string, p?: unknown[]) => query(sql, p) }));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('./agCoproprieteRepo', () => ({
  contexteAgDuLot: vi.fn(async (lotId: number) => (lotId === 9 ? { lotId, immeuble: { cle: 'c', libelle: '9 rue C' }, copropriete: null } : lotId === 1
    ? { lotId, immeuble: { cle: 'a', libelle: 'A rue' }, copropriete: { id: 10, libelle: 'Copro A', cle: 'a' } }
    : { lotId, immeuble: { cle: 'b', libelle: 'B rue' }, copropriete: { id: 20, libelle: 'Copro B', cle: 'b' } })),
  entreesAg: vi.fn(async (c: { coproprieteId: number | null }) => (c.coproprieteId === null
    ? [{ type: 'derniere', statut: 'officielle', date: '2026-02-01', nature: 'ago', origine: 'sortie' }, { type: 'derniere', statut: 'officielle', date: '2025-05-05', nature: 'ago', origine: 'fiche_bien' }]
    : c.coproprieteId === 10
    ? [{ type: 'derniere', statut: 'officielle', date: '2026-03-25', nature: 'ago' }, { type: 'prochaine', statut: 'projetee', date: '2027-01-01', nature: 'ago' }]
    : [])),
}));
vi.mock('./arreteComptesRepo', () => ({ arretesDe: vi.fn(async () => new Map([[10, { jour: 31, mois: 12 }]])) }));
const { lireSuiviVingtPourcent } = await import('./vingtPourcentRepo');

beforeEach(() => {
  appels.length = 0;
  sorties = [
    { id: '5', lot_id: '1', date_sortie: '2026-11-15', valide_le: '2026-11-20', logement: '1 rue A', noms: ['DUPONT Alice'] },
    { id: '6', lot_id: '2', date_sortie: '2026-10-01', valide_le: '2026-10-02', logement: '2 rue B', noms: ['MARTIN Paul', 'MARTIN Léa'] },
  ];
});

describe('lireSuiviVingtPourcent', () => {
  it('seules les sorties AVEC retenue et toujours sorties (une sortie annulée n’y figure plus) ; lecture seule', async () => {
    await lireSuiviVingtPourcent();
    const s = appels.find((x) => x.includes('FROM gestion_location_sortie_validee'))!;
    expect(s).toContain('WHERE s.retenue_20');
    expect(s).toContain('AND o.sortie IS NULL');
    expect(appels.some((x) => /^(UPDATE|INSERT|DELETE)/.test(x))).toBe(false);
  });
  it('le calcul à la lecture : la projetée enregistrée à la sortie (01/01/2027) est IGNORÉE ; l’AGO qui compte = 25/03/2027 projetée', async () => {
    const r = await lireSuiviVingtPourcent();
    const a = r.lignes.find((l) => l.sortieId === 5)!;
    expect(a).toMatchObject({ locataires: ['DUPONT Alice'], copropriete: { id: 10, libelle: 'Copro A' }, arrete: { jour: 31, mois: 12 },
      suivi: { etat: 'ok', exercice: '2026-12-31', ago: { date: '2027-03-25', statut: 'projetee' }, limite: '2027-04-25' } });
  });
  it('« Dates / copropriétés manquantes » : la copropriété sans AGO ni arrêté, avec ses locataires ; la copropriété complète n’y est pas', async () => {
    const r = await lireSuiviVingtPourcent();
    expect(r.manquantes).toEqual([{ cle: 'copro-20', coproprieteId: 20, libelle: 'Copro B', immeuble: 'b', lotId: 2, manque: ['derniere_ago', 'arrete'], locataires: ['MARTIN Paul', 'MARTIN Léa'] }]);
    expect(r.lignes.find((l) => l.sortieId === 6)!.suivi).toEqual({ etat: 'sans_ago', exercice: null, mention: 'Dernière AGO inconnue' });
  });
  // 🔴 Arno (23/11/2026) — « cette date remonte dans la copropriété et redescend dans l'ensemble des biens concernés par les 20 % »
  it('l’arrêté, écrit UNE fois sur la copropriété, vaut pour TOUS ses locataires en attente (un autre bien, une autre sortie)', async () => {
    sorties = [
      { id: '5', lot_id: '1', date_sortie: '2026-11-15', valide_le: '2026-11-20', logement: '1 rue A', noms: ['DUPONT Alice'] },
      { id: '8', lot_id: '1', date_sortie: '2026-05-10', valide_le: '2026-05-12', logement: '1 rue A bis', noms: ['VOISIN Marc'] },
    ];
    const r = await lireSuiviVingtPourcent();
    expect(r.lignes.map((l) => [l.sortieId, l.arrete, l.suivi.etat === 'ok' ? l.suivi.exercice : null])).toEqual([
      [5, { jour: 31, mois: 12 }, '2026-12-31'], [8, { jour: 31, mois: 12 }, '2026-12-31']]);
    expect(r.manquantes).toEqual([]);
  });
  // 🔴 Arno (23/11/2026) — « Ne pas rattacher maintenant » : le bien figure dans « Dates / copropriétés manquantes » sous « Bien sans copropriété » (compté)
  it('un bien SANS copropriété : dans « Dates / copropriétés manquantes » (arrêté manquant), les dates gardées avec une sortie n’y comptent plus', async () => {
    sorties = [{ id: '12', lot_id: '9', date_sortie: '2026-11-10', valide_le: '2026-11-12', logement: '9 rue C', noms: ['SANS Copro'] }];
    const r = await lireSuiviVingtPourcent();
    expect(r.manquantes).toEqual([{ cle: 'immeuble-c', coproprieteId: null, libelle: '9 rue C', immeuble: 'c', lotId: 9, manque: ['arrete'], locataires: ['SANS Copro'] }]);
    const l = r.lignes[0];
    expect(l.copropriete).toBeNull();
    // la dernière AGO de la fiche du bien (05/05/2025) sert ; celle gardée avec une sortie (01/02/2026) non
    expect(l.suivi).toMatchObject({ etat: 'ok', ago: { date: '2027-05-05', statut: 'projetee' }, incertaine: true });
  });
});

/** 🔴🔴 Arno (24/11/2026, 23h53) — les coordonnées au strict minimum : « Prénom NOM », premier e-mail, premier téléphone formaté (lecture seule). */
describe('🔴🔴 les coordonnées des locataires et des propriétaires', () => {
  it('par sortie : ses locataires et les propriétaires du bien (titulaire puis indivision) ; premier e-mail, premier téléphone « 06 12 34 56 78 » ; « tel: » ; absent : null', async () => {
    query.mockImplementation(async (sql: string) => {
      const s = sql.replace(/\s+/g, ' '); appels.push(s);
      if (s.includes('AS j')) return { rows: [{ j: '2026-11-23' }] };
      if (s.includes('AS sortie, l.id::text')) return { rows: [{ sortie: '5', id: '101', nom: 'DUPONT', prenom: 'Alice' }, { sortie: '6', id: '102', nom: 'MARTIN', prenom: null }] };
      if (s.includes('JOIN gestion_annuaire_proprietaire p ON p.id = x.pid')) return { rows: [{ lot: '1', id: '7', nom: 'DURAND', prenom: 'Jean', complet: 'DURAND Jean' }, { lot: '1', id: '8', nom: 'SCI', prenom: null, complet: 'SCI Les Tilleuls' }] };
      if (s.includes('FROM gestion_annuaire_contact c')) return { rows: [
        { sujet: 'locataire', sujet_id: '101', sorte: 'email', valeur: 'alice@exemple.test', brute: 'alice@exemple.test' },
        { sujet: 'locataire', sujet_id: '101', sorte: 'email', valeur: 'autre@exemple.test', brute: 'autre@exemple.test' },
        { sujet: 'locataire', sujet_id: '101', sorte: 'telephone', valeur: '+33612345678', brute: '0612345678' },
        { sujet: 'proprietaire', sujet_id: '7', sorte: 'telephone', valeur: '+33145678901', brute: '01 45 67 89 01' }] };
      if (s.includes('FROM gestion_location_sortie_validee') && s.includes('array_agg(l.nom')) return { rows: sorties };
      return { rows: [] };
    });
    const lu = await lireSuiviVingtPourcent();
    const a = lu.lignes.find((l) => l.sortieId === 5)!;
    expect(a.contacts).toEqual({
      locataires: [{ nom: 'Alice DUPONT', email: 'alice@exemple.test', telephone: { affiche: '06 12 34 56 78', lien: 'tel:+33612345678' } }],
      proprietaires: [{ nom: 'Jean DURAND', email: null, telephone: { affiche: '01 45 67 89 01', lien: 'tel:+33145678901' } }, { nom: 'SCI Les Tilleuls', email: null, telephone: null }],
    });
    expect(lu.lignes.find((l) => l.sortieId === 6)!.contacts).toEqual({ locataires: [{ nom: 'MARTIN', email: null, telephone: null }], proprietaires: [] });
    expect(appels.some((x) => /^(INSERT|UPDATE|DELETE)/.test(x))).toBe(false);
  });
});
