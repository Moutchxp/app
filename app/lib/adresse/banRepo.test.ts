import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (20/11/2026, lot 2) — l'accès unique à la BAN : la commune, les candidats, le meilleur de l'« Immeuble » et de l'adresse, l'historique. */
const h = vi.hoisted(() => ({ sql: [] as { s: string; p: unknown[] }[], communes: [] as { insee: string }[], parcelle: '920260000AB0012', enCours: [] as Record<string, unknown>[],
  au: {} as Record<string, Record<string, unknown>[]> }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (s.startsWith('SELECT DISTINCT insee_commune AS insee FROM adresse_ban')) return { rows: h.communes };
  if (s.startsWith('SELECT cle_d_interoperabilite AS id')) return { rows: h.au[`${p[0]}|${p[1]}`] ?? [] };
  if (s.startsWith('SELECT id FROM parcelle')) return { rows: [{ id: h.parcelle }] };
  if (s.startsWith('SELECT id::text, ban_id, statut FROM gestion_lot_adresse_ban')) return { rows: h.enCours };
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: q }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => true }));
import { enregistrerRapprochement, inseeDeLaCommune, rapprocherAdresse, rapprocherBien } from './banRepo';

const PUVIS = { id: '92026_7184_00054', numero: 54, suffixe: null, nom_voie: 'Avenue Puvis De Chavannes', insee: '92026', commune: 'Courbevoie', x: 645100.5, y: 6866200.25 };
const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const ecritures = () => h.sql.filter((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s));
beforeEach(() => { h.sql = []; h.communes = [{ insee: '92026' }]; h.enCours = []; h.au = { '92026|54': [PUVIS] }; });

describe('la commune', () => {
  it('Paris par l’arrondissement du code postal (sans lire la base) ; ailleurs par le nom, contrôlé par le département', async () => {
    expect(await inseeDeLaCommune('Paris', '75011')).toBe('75111');
    expect(await inseeDeLaCommune('PARIS 16', '75116')).toBe('75116');
    expect(h.sql).toEqual([]);
    expect(await inseeDeLaCommune('COURBEVOIE', '92400')).toBe('92026');
    expect(h.sql[0].p).toEqual(['courbevoie']);
    h.communes = [{ insee: '92026' }, { insee: '78123' }]; // deux communes homonymes : le département du code postal tranche
    expect(await inseeDeLaCommune('Courbevoie', '92400')).toBe('92026');
    expect(await inseeDeLaCommune('Courbevoie', null)).toBeNull(); // ambiguë sans code postal : rien n'est deviné
    h.communes = [];
    expect(await inseeDeLaCommune('Melun', '77000')).toBeNull();
  });
});

describe('rapprocher', () => {
  it('une écriture du 54 → l’adresse officielle, certaine, avec sa parcelle et le code postal écrit ; aucune écriture en base', async () => {
    const r = await rapprocherAdresse({ texte: '54 Avneue Puvis de Chavannes', codePostal: '92400', commune: 'Courbevoie' });
    expect([r.statut, r.ban?.id, r.ban?.libelle, r.insee, r.codePostal, r.parcelle, r.texteSource])
      .toEqual(['certain', '92026_7184_00054', '54 Avenue Puvis De Chavannes', '92026', '92400', '920260000AB0012', '54 Avneue Puvis de Chavannes']);
    expect(ecritures()).toEqual([]);
  });
  it('un bien : son « Immeuble » d’abord ; s’il ne donne rien de certain, son adresse (le meilleur des deux)', async () => {
    const r = await rapprocherBien({ immeuble: 'Résidence Les Tilleuls', adresse: '54 avenue Puvis de Chavannes', codePostal: '92400', commune: 'Courbevoie' });
    expect([r.statut, r.ban?.id, r.texteSource]).toEqual(['certain', '92026_7184_00054', '54 avenue Puvis de Chavannes']);
    const seul = await rapprocherBien({ immeuble: '54 Puvis de Chavannes', adresse: null, codePostal: '92400', commune: 'Courbevoie' });
    expect(seul.texteSource).toBe('54 Puvis de Chavannes');
    expect((await rapprocherBien({ immeuble: null, adresse: null, codePostal: null, commune: null })).statut).toBe('introuvable');
  });
});

describe('l’enregistrement, historisé', () => {
  it('une nouvelle ligne ; la précédente FERMÉE (jamais modifiée ni effacée) ; le même rapprochement rejoué : rien', async () => {
    const r = await rapprocherAdresse({ texte: '54 avenue Puvis de Chavannes', codePostal: '92400', commune: 'Courbevoie' });
    h.sql = [];
    expect(await enregistrerRapprochement(q as never, 14, r, { origine: 'stock', methode: 'similarite_voie' }, AUTEUR)).toBe(true);
    let w = ecritures();
    expect(w).toHaveLength(1);
    expect(w[0].s).toMatch(/^INSERT INTO gestion_lot_adresse_ban/);
    expect(w[0].p.slice(0, 13)).toEqual([14, '92026_7184_00054', '54 Avenue Puvis De Chavannes', 54, null, '92400', '92026', 'Courbevoie', '920260000AB0012', 1, 'similarite_voie', 'certain', 'stock']);
    h.sql = []; h.enCours = [{ id: '7', ban_id: '92026_7184_00054', statut: 'certain' }];
    expect(await enregistrerRapprochement(q as never, 14, r, { origine: 'stock', methode: 'similarite_voie' }, AUTEUR)).toBe(false);
    expect(ecritures()).toEqual([]);
    h.sql = [];
    expect(await enregistrerRapprochement(q as never, 14, r, { statut: 'valide', origine: 'file_verification', methode: 'choix_humain', motifFin: 'validé par Arno' }, AUTEUR)).toBe(true);
    w = ecritures();
    expect(w[0]).toMatchObject({ s: expect.stringMatching(/^UPDATE gestion_lot_adresse_ban SET fin = now\(\)/), p: ['7', 2, AUTEUR.libelle, 'validé par Arno'] });
    expect(w[1].p[11]).toBe('valide');
    expect(w.some((x) => /DELETE|gestion_annuaire_lot/.test(x.s))).toBe(false);
  });
});
