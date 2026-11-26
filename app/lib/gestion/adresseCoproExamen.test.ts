import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (26/11/2026, 11h58, point 1) — « à vérifier » : l'examen d'une adresse (lecture seule), les adresses confirmées, l'historique des adresses. */
const h = vi.hoisted(() => ({ sql: [] as { s: string; p: unknown[] }[], journal: true, rangs: [] as unknown[] }));
vi.mock('../db/client', () => ({ query: async (sql: string, p: unknown[] = []) => { h.sql.push({ s: sql.replace(/\s+/g, ' ').trim(), p }); return { rows: h.rangs }; } }));
vi.mock('./journalSyndicCopro', () => ({ journalCoproprieteDisponible: async () => h.journal }));
const b = vi.hoisted(() => ({ r: null as unknown, parId: null as unknown }));
vi.mock('../adresse/banRepo', () => ({ rapprocherAdresse: async () => b.r, adresseBanParId: async () => b.parId }));
import { adressesConfirmees, examinerAdresseCopro, historiqueAdresses, lienCarte } from './adresseCoproExamen';

const BAN = { id: '92062_0420_00014', numero: 14, suffixe: null, nomVoie: 'Rue Jean Jaurès', insee: '92062', commune: 'Puteaux', x: 643000, y: 6865000 };
beforeEach(() => { h.sql = []; h.journal = true; h.rangs = []; b.parId = null;
  b.r = { statut: 'a_verifier', motif: 'Voie ressemblante à 0,62.', ban: { ...BAN, score: 0.62, libelle: '14 Rue Jean Jaurès', typeContradictoire: false }, codePostal: '92800', parcelle: '920620000AB0012' }; });

describe('l’examen d’une adresse « à vérifier » (lecture seule)', () => {
  it('l’adresse écrite, l’officielle, le motif, la parcelle et la position (WGS 84) ; rien n’est écrit', async () => {
    h.rangs = [{ lat: 48.8846, lon: 2.2389, parcelle: '920620000AB0013' }];
    const e = await examinerAdresseCopro({ libelle: '14 rue Jean Jaures', codePostal: '92800', commune: 'Puteaux' });
    expect(e).toEqual({ ecrite: '14 rue Jean Jaures, 92800 Puteaux', statut: 'a_verifier', motif: 'Voie ressemblante à 0,62.', officielle: '14 rue Jean Jaurès, 92800 Puteaux',
      banId: '92062_0420_00014', parcelle: '920620000AB0013', position: { lat: 48.8846, lon: 2.2389 } });
    expect(h.sql[0].s).toContain('ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 2154), 4326)');
    expect(h.sql[0].p).toEqual([643000, 6865000]);
    expect(h.sql.some((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s))).toBe(false);
  });
  it('choisie dans la liste (identifiant connu) : « certain » ; aucune adresse officielle : ni position, la parcelle du rapprochement', async () => {
    b.parId = BAN; h.rangs = [{ lat: 48.88, lon: 2.23, parcelle: null }];
    expect((await examinerAdresseCopro({ libelle: '14 rue Jean Jaurès', codePostal: '92800', commune: 'Puteaux', banId: BAN.id })).statut).toBe('certain');
    b.r = { statut: 'introuvable', motif: 'Aucune adresse à ce numéro.', ban: null, codePostal: '92800', parcelle: null }; h.sql = [];
    expect(await examinerAdresseCopro({ libelle: '999 rue Inconnue', codePostal: '92800', commune: 'Puteaux' }))
      .toMatchObject({ statut: 'introuvable', officielle: null, banId: null, parcelle: null, position: null });
    expect(h.sql).toEqual([]);
  });
  it('le lien de la carte : OpenStreetMap, la position au millionième', () => {
    expect(lienCarte({ lat: 48.8846, lon: 2.2389 })).toBe('https://www.openstreetmap.org/?mlat=48.884600&mlon=2.238900#map=19/48.884600/2.238900');
  });
});

describe('les adresses confirmées et l’historique des adresses', () => {
  it('confirmées : journal « adresse_confirmee » de CETTE copropriété, postérieur au rattachement en cours ; sans la 506 : rien', async () => {
    h.rangs = [{ cle: '12 rue des lilas' }];
    expect(await adressesConfirmees(7)).toEqual(['12 rue des lilas']);
    const s = h.sql[0];
    expect(s.p).toEqual([7]);
    for (const f of ["j.action = 'adresse_confirmee'", 'a.retire_le IS NULL', 'a.cree_le <= j.survenu_le']) expect(s.s).toContain(f);
    h.journal = false; h.sql = [];
    expect([await adressesConfirmees(7), await historiqueAdresses(7), h.sql]).toEqual([[], [], []]);
  });
  it('l’historique : ajout, confirmation, retrait, vérification — du plus récent', async () => {
    h.rangs = [{ le: '26/11/2026 à 12h10', texte: 'Adresse confirmée', par: 'Arnaud Jorel' }];
    expect(await historiqueAdresses(7)).toEqual(h.rangs);
    expect(h.sql[0].p).toEqual([7, ['adresse_ajoutee', 'adresse_confirmee', 'adresse_retiree', 'adresse_verifiee', 'adresse_principale_changee', 'adresse_cedee', 'adresse_reprise']]);
    expect(h.sql[0].s).toContain('ORDER BY j.survenu_le DESC, j.id DESC');
  });
});
