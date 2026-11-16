import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 (Arno, 16/11/2026) LE CONFLIT DE PARCELLE QUEL QUE SOIT LE CÔTÉ D'OÙ L'ON RATTACHE — depuis la fiche SYNDIC : une copropriété que ce syndic
 * reçoit, une adresse de la même parcelle gérée par un AUTRE syndic. La même règle serveur que la fiche copropriété (`conflitParcelleRepo`).
 * 🔒 Base simulée : aucune lecture ni écriture réelle.
 */
const h = vi.hoisted(() => ({ sql: [] as { s: string; p: unknown[] }[], parcelle: [] as unknown[], dejaAMoi: false }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  h.sql.push({ s, p });
  if (s.startsWith('SELECT c.cle_immeuble AS cle FROM gestion_copropriete c JOIN gestion_copropriete_syndic cs')) return { rows: h.dejaAMoi ? [{ cle: 'residence les tilleuls' }] : [] };
  if (s.startsWith('SELECT c.cle_immeuble AS cle, c.libelle, s.id::text AS syndic_id') && p[0] === '10 rue voisine') {
    return { rows: [{ cle: '10 rue voisine', libelle: '10 rue Voisine', syndic_id: '9', syndic_nom: 'Cabinet B', syndic_ville: 'Paris' }] };
  }
  if (s.startsWith('SELECT c.id::text, cs.syndic_id::text AS syndic FROM gestion_copropriete c')) return { rows: [{ id: '12', syndic: '9' }] };
  if (s.startsWith('SELECT id::text FROM gestion_syndic WHERE id = $1')) return { rows: [{ id: String(p[0]) }] };
  if (s.startsWith('SELECT id::text FROM gestion_copropriete WHERE cle_immeuble = $1')) return { rows: [{ id: '7' }] };
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: q, withTransaction: async (fn: (x: typeof q) => Promise<unknown>) => fn(q) }));
vi.mock('./parcelleRepo', () => ({ adressesDeLaParcelle: async () => ({ parcelles: [], adresses: h.parcelle }) }));
import { enregistrerSyndic } from './syndicRepo';
import { validerSyndic } from './syndics';

const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const saisie = (o: Record<string, unknown> = {}) => {
  const v = validerSyndic({ nom: 'Cabinet A', adresse: '1 rue _TEST', codePostal: '75001', ville: 'Paris', confirmeDoublons: true,
    immeubles: [{ libelle: 'Résidence Les Tilleuls', codePostal: '75011', commune: 'Paris' }], ...o });
  if (!v.ok) throw new Error(v.motif);
  return v.syndic;
};
const ecritures = () => h.sql.filter((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s));
beforeEach(() => {
  h.sql = []; h.dejaAMoi = false;
  h.parcelle = [{ cle: '10 rue voisine', libelle: '10 rue Voisine', codePostal: '75011', commune: 'Paris', parcelle: 'AB12' }];
});

describe('🔴🔴 depuis la fiche syndic : la copropriété reçue, sur une parcelle gérée par un autre syndic', () => {
  it('conflit posé : SANS la confirmation, refus clair AVANT toute écriture, avec la question à poser', async () => {
    const r = await enregistrerSyndic(5, saisie(), AUTEUR);
    expect(r).toMatchObject({ ok: false, motif: 'Conflit de parcelle non confirmé pour « Résidence Les Tilleuls » : sur la même parcelle, 10 rue Voisine, 75011 Paris (10 rue Voisine) est gérée par Cabinet B / Paris. Confirmez un autre syndic pour cette copropriété : rien n’est enregistré sans cette confirmation.',
      conflitsParcelle: [{ immeuble: 'Résidence Les Tilleuls', libelle: '10 rue Voisine', parcelle: 'AB12', syndic: { id: 9 } }] });
    expect(ecritures()).toEqual([]);
  });
  it('à la création d’un syndic aussi (tout syndic existant est un autre)', async () => {
    expect(await enregistrerSyndic(null, saisie(), AUTEUR)).toMatchObject({ ok: false, conflitsParcelle: [{ libelle: '10 rue Voisine' }] });
    expect(ecritures()).toEqual([]);
  });
  it('AVEC la confirmation : enregistré, le conflit noté par la règle commune (copropriété, syndic, autre copropriété, son syndic, parcelle)', async () => {
    const r = await enregistrerSyndic(5, saisie({ conflitsParcelle: [{ immeuble: 'Résidence Les Tilleuls', autre: '10 rue Voisine', parcelle: 'AB12' }] }), AUTEUR);
    expect(r).toEqual({ ok: true, id: 5 });
    expect(ecritures().filter((x) => x.s.startsWith('INSERT INTO gestion_copropriete_conflit')).map((x) => x.p.slice(0, 5))).toEqual([['7', 5, '12', '9', 'AB12']]);
  });
  it('une confirmation pour une AUTRE copropriété ne vaut pas : refus', async () => {
    expect((await enregistrerSyndic(5, saisie({ conflitsParcelle: [{ immeuble: '3 impasse Neuve', autre: '10 rue Voisine', parcelle: 'AB12' }] }), AUTEUR)).ok).toBe(false);
    expect(ecritures()).toEqual([]);
  });
  it('une copropriété DÉJÀ à ce syndic (contacts, notes…) : aucune question ; pas d’autre syndic sur la parcelle : aucune question', async () => {
    h.dejaAMoi = true;
    expect((await enregistrerSyndic(5, saisie(), AUTEUR)).ok).toBe(true);
    h.dejaAMoi = false; h.parcelle = [];
    expect((await enregistrerSyndic(5, saisie(), AUTEUR)).ok).toBe(true);
    expect(ecritures().some((x) => x.s.startsWith('INSERT INTO gestion_copropriete_conflit'))).toBe(false);
  });
  it('rattachée au MÊME syndic que la parcelle : pas de conflit', async () => {
    expect((await enregistrerSyndic(9, saisie(), AUTEUR)).ok).toBe(true);
  });
});
