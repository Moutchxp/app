import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (20/11/2026, lot 2) — l'accès unique à la BAN : la commune, les candidats, le meilleur de l'« Immeuble » et de l'adresse, l'historique. */
const h = vi.hoisted(() => ({ cp: [] as { code_postal: string; insee: string; nom: string }[], sql: [] as { s: string; p: unknown[] }[], communes: [] as { insee: string }[], parcelle: '920260000AB0012', enCours: [] as Record<string, unknown>[],
  au: {} as Record<string, Record<string, unknown>[]> }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (s.startsWith('SELECT DISTINCT insee_commune AS insee FROM adresse_ban')) return { rows: h.communes };
  if (s.startsWith('SELECT count(*)::int AS n FROM (SELECT 1 FROM code_postal_insee')) return { rows: [{ n: h.cp.length }] };
  if (s.startsWith('SELECT count(*)::int AS n FROM (SELECT 1 FROM adresse_ban WHERE insee_commune')) return { rows: [{ n: Object.keys(h.au).some((k) => k.startsWith(`${p[0]}|`)) ? 1 : 0 }] };
  if (s.startsWith('SELECT DISTINCT insee, nom_commune AS nom FROM code_postal_insee')) return { rows: h.cp.filter((x) => x.code_postal === p[0]) };
  if (s.startsWith('SELECT cle_d_interoperabilite AS id')) return { rows: h.au[`${p[0]}|${p[1]}`] ?? [] };
  if (s.startsWith('SELECT id FROM parcelle')) return { rows: [{ id: h.parcelle }] };
  if (s.startsWith('SELECT id::text, ban_id, statut FROM gestion_lot_adresse_ban')) return { rows: h.enCours };
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: q }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => true }));
import { dedoublonnerCandidats, enregistrerRapprochement, inseeDeLaCommune, rapprocherAdresse, rapprocherBien } from './banRepo';

const PUVIS = { id: '92026_7184_00054', numero: 54, suffixe: null, nom_voie: 'Avenue Puvis De Chavannes', insee: '92026', commune: 'Courbevoie', x: 645100.5, y: 6866200.25 };
const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const ecritures = () => h.sql.filter((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s));
beforeEach(() => { h.cp = []; h.sql = []; h.communes = [{ insee: '92026' }]; h.enCours = []; h.au = { '92026|54': [PUVIS] }; });

describe('la commune', () => {
  it('Paris par l’arrondissement du code postal (sans lire la base) ; ailleurs par le nom, contrôlé par le département', async () => {
    expect(await inseeDeLaCommune('Paris', '75011')).toBe('75111');
    expect(await inseeDeLaCommune('PARIS 16', '75116')).toBe('75116');
    expect(h.sql).toEqual([]);
    expect(await inseeDeLaCommune('COURBEVOIE', '92400')).toBe('92026');
    expect(h.sql.find((x) => x.s.startsWith('SELECT DISTINCT insee_commune AS insee FROM adresse_ban'))?.p).toEqual(['courbevoie']); // sans table des codes postaux : le repli par le nom
    h.communes = [{ insee: '92026' }, { insee: '78123' }]; // deux communes homonymes : le département du code postal tranche
    expect(await inseeDeLaCommune('Courbevoie', '92400')).toBe('92026');
    expect(await inseeDeLaCommune('Courbevoie', null)).toBeNull(); // ambiguë sans code postal : rien n'est deviné
    h.communes = [];
    expect(await inseeDeLaCommune('Melun', '77000')).toBeNull();
  });
});

describe('🔴 (lot 3 bis) la commune par le CODE POSTAL, jamais par le libellé saisi', () => {
  it('« 92110 CLICHY LA GARENNE » = Clichy (92024), que la BAN nomme « Clichy » ; un code postal partagé : le nom départage, sinon rien n’est deviné', async () => {
    h.cp = [{ code_postal: '92110', insee: '92024', nom: 'CLICHY' }, { code_postal: '78117', insee: '78125', nom: 'CHATEAUFORT' }, { code_postal: '78117', insee: '78620', nom: 'TOUSSUS LE NOBLE' }];
    h.communes = [];
    expect(await inseeDeLaCommune('CLICHY LA GARENNE', '92110')).toBe('92024');
    expect(await inseeDeLaCommune('n’importe quel nom', '92110')).toBe('92024');
    expect(await inseeDeLaCommune('Toussus-le-Noble', '78117')).toBe('78620');
    expect(await inseeDeLaCommune('Ailleurs', '78117')).toBeNull();
    // le nom saisi n'est jamais lu tant que le code postal répond
    expect(h.sql.some((x) => x.s.startsWith('SELECT DISTINCT insee_commune AS insee FROM adresse_ban'))).toBe(false);
  });
});

describe('🔴 (lot 3 bis) une plage dans l’« Immeuble » OU dans l’adresse : à vérifier, quel que soit le champ qui a rapproché', () => {
  it('les trois cas du rapport du 20/11 : le motif cite les numéros de la plage', async () => {
    h.au = { '92026|1': [{ ...PUVIS, id: '92026_7290_00001', numero: 1, nom_voie: 'Square Henri Régnault' }],
      '92026|33': [{ ...PUVIS, id: '75116_7300_00033', numero: 33, nom_voie: 'Rue Pergolèse' }],
      '92026|126': [{ ...PUVIS, id: '92044_9600_00126', numero: 126, nom_voie: 'Rue de Villiers' }] };
    const cas = [['1-2 rue Square Henri Regnault', '1 Square Henri Régnault', '1-2'], ['33-35 rue Pergolèse', '33 rue Pergolèse', '33-35'], ['126 - 128 rue de Villiers', '126 rue de Villiers', '126-128']];
    for (const [immeuble, adresse, plage] of cas) {
      const r = await rapprocherBien({ immeuble, adresse, codePostal: '92400', commune: 'Courbevoie' });
      expect([r.statut, r.motif]).toEqual(['a_verifier', `Plage de numéros (${plage}) : un immeuble à plusieurs adresses officielles, à vérifier par un humain.`]);
    }
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

describe('🔴 (lot 3 ter) la même adresse sous deux identifiants (voie renumérotée par la BAN)', () => {
  it('même voie, même indice, même position : une seule, celle du fichier BAN officiel ; deux adresses distinctes restent deux', () => {
    const c = (id: string, officielle: boolean, x = 652096, suffixe: string | null = null) => ({ id, numero: 1, suffixe, nomVoie: 'Voie D/5', insee: '75105', commune: 'Paris', x, y: 6860636, officielle });
    expect(dedoublonnerCandidats([c('75105_x125_00001', false), c('75105_m7yz55_00001', true)]).map((x) => x.id)).toEqual(['75105_m7yz55_00001']);
    expect(dedoublonnerCandidats([c('75105_x125_00001', false), c('75105_m7yz55_00001_s', true, 652110, 's')]).map((x) => x.id)).toEqual(['75105_m7yz55_00001_s', '75105_x125_00001']);
    expect(dedoublonnerCandidats([c('a', false), c('b', false, 652400)]).map((x) => x.id)).toEqual(['a', 'b']);
    // 🔴 (lot 3 quater) le même identifiant à deux positions éloignées (« entrée » et « bâtiment ») : une seule adresse, jamais « plusieurs se ressemblent »
    expect(dedoublonnerCandidats([c('95197_1243_00009', true), c('95197_1243_00009', true, 652116)]).map((x) => x.id)).toEqual(['95197_1243_00009']);
  });
});

describe('🔴 (lot 3 ter) une commune trouvée par son code postal mais absente de la BAN locale', () => {
  it('« Commune absente de la Base Adresse locale » (Melun), et non « aucune adresse à ce numéro » ; une commune couverte garde ce motif', async () => {
    h.cp = [{ code_postal: '77000', insee: '77288', nom: 'MELUN' }, { code_postal: '92400', insee: '92026', nom: 'COURBEVOIE' }];
    expect((await rapprocherAdresse({ texte: '12 Rue Louis Beaunier', codePostal: '77000', commune: 'Melun' })).motif).toBe('Commune absente de la Base Adresse locale.');
    expect((await rapprocherAdresse({ texte: '99 avenue Puvis de Chavannes', codePostal: '92400', commune: 'Courbevoie' })).motif).toBe('Aucune adresse officielle au 99 dans cette commune.');
  });
});
