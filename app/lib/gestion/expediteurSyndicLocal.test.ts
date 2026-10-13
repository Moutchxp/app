import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT GLISSER-DEPOSER-ENTRE-TOUTES-LES-FAMILLES-DES-PARTIES — LE CARTOUCHE EXPÉDITEUR, ET LUI SEUL SUR CE BIEN ══════
 * Une adresse classée à la main en « Syndic & immeuble » sur un bien prend le rose du cartouche EXPÉDITEUR sur CE bien,
 * jamais sur un autre — même du même immeuble. 🔒 Lectures doublées, aucune écriture.
 */
const query = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => query(...a) }));
const biensRanges = vi.fn();
vi.mock('./partieCategorieRepo', () => ({ biensRangesSyndicLocal: (...a: unknown[]) => biensRanges(...a) }));
vi.mock('./schema', async (orig) => ({ ...(await orig<typeof import('./schema')>()), syndicLocalDisponible: async () => true }));

const { expediteurSyndicalDesBiens } = await import('./partiesSyndicRepo');

beforeEach(() => {
  query.mockReset().mockImplementation(async (sql: string) => {
    if (sql.includes('de_nom')) return { rows: [{ nom: 'Grabovets valeriy' }] };
    if (sql.includes('de_adresse')) return { rows: [{ adresse: 'valerka@x.fr', recu_le: '2026-10-01' }] };
    return { rows: [] };   // aucune fiche syndic ne reconnaît cette adresse
  });
  biensRanges.mockReset().mockResolvedValue(['343']);
});

describe('le cartouche EXPÉDITEUR lit le classement local, bien par bien', () => {
  it('🔴 rose sur le bien classé (343), rien sur l’autre bien du même immeuble (344)', async () => {
    const r = await expediteurSyndicalDesBiens(58133, ['343', '344']);
    expect(r).toEqual({ '343': { role: 'Syndic & immeuble — classée à la main pour ce bien', nom: 'Grabovets valeriy' } });
    expect(biensRanges).toHaveBeenCalledWith('valerka@x.fr', ['343', '344']);
  });
  it('🔒 lecture seule : aucun verbe d’écriture dans ce dépôt', () => {
    const src = readFileSync('app/lib/gestion/partiesSyndicRepo.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').toUpperCase();
    for (const v of ['INSERT ', 'UPDATE ', 'DELETE ', 'TRUNCATE']) expect(src, v).not.toContain(v);
  });
  it('la lecture des biens classés ne regarde que les biens demandés, les lignes vivantes et la valeur locale', () => {
    const src = readFileSync('app/lib/gestion/partieCategorieRepo.ts', 'utf8');
    const i = src.indexOf('export async function biensRangesSyndicLocal');
    const corps = src.slice(i, src.indexOf('\n}\n', i)).replace(/\s+/g, ' ');
    for (const f of ['retire_le IS NULL', "categorie = 'syndic_immeuble'", 'adresse = $1', 'lot_cle = ANY($2::text[])']) expect(corps).toContain(f);
  });
});

describe('🔒 historique inaltérable : déplacer une personne ne touche AUCUN mail', () => {
  it('la porte d’écriture du rangement n’écrit que dans la table des rangements', () => {
    const src = readFileSync('app/lib/gestion/partieCategorieRepo.ts', 'utf8');
    const i = src.indexOf('export async function poserCategorieAlaMain');
    const corps = src.slice(i, src.indexOf('\n}\n', i));
    const ecrites = [...corps.matchAll(/(?:UPDATE|INSERT INTO|DELETE FROM)\s+([a-z_]+)/g)].map((m) => m[1]);
    expect(ecrites.length).toBeGreaterThan(0);
    expect(new Set(ecrites)).toEqual(new Set(['gestion_partie_categorie']));
    expect(corps).not.toMatch(/gestion_rattachement|gestion_message\b|gestion_message_adresse/);
  });
});
