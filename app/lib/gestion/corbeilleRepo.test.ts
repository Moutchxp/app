import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

// Base MOCKÉE : aucune connexion réelle, aucune écriture possible.
const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
const schemaMock = vi.fn();
vi.mock('./schema', () => ({ corbeilleDisponible: () => schemaMock() }));

import { compterCorbeille, mettreALaCorbeille } from './corbeilleRepo';

/**
 * LOT 5-BOITE-3 — LA CORBEILLE, ENTIÈREMENT CHEZ NOUS.
 *
 * 🔴 CE QUI EST ÉPROUVÉ, ET POURQUOI CHAQUE POINT COMPTE :
 *   ① AUCUNE ligne n'est jamais effacée — « supprimer » pose une date, « restaurer » la retire, et le journal garde
 *      les deux gestes. Un DELETE ici trahirait la règle du module ;
 *   ② AUCUNE écriture dans Gmail : le mail reste intact, et la corbeille n'est qu'à nous ;
 *   ③ l'ÉTAT de l'échange n'est pas touché — il reste rattaché à sa carte, donc restaurer le remet exactement où il
 *      était, sans qu'on ait eu à s'en souvenir ;
 *   ④ sans la migration 251, AUCUNE requête n'est émise : nommer une colonne absente ferait échouer toute la boîte.
 */

const SQL = (): string[] => queryMock.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' '));
const PARAMS = (i = 0): unknown[] => (queryMock.mock.calls[i]?.[1] ?? []) as unknown[];
const AUTEUR = { id: 3, libelle: 'Arnaud Jorel' };

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
  schemaMock.mockReset().mockResolvedValue(true);
});

describe('🔴 ④ sans la migration 251', () => {
  it('aucune requête n’est émise, et on le DIT à l’appelant', async () => {
    schemaMock.mockResolvedValue(false);
    expect(await mettreALaCorbeille(5, true, AUTEUR)).toEqual({ etat: 'sans_schema' });
    expect(await compterCorbeille()).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('🔴 ① rien n’est jamais effacé', () => {
  it('« supprimer » POSE une date et un auteur figé en texte', async () => {
    expect(await mettreALaCorbeille(5, true, AUTEUR)).toEqual({ etat: 'ok', corbeille: true });
    expect(SQL()[0]).toContain('UPDATE gestion_fil SET corbeille_le = now()');
    expect(PARAMS(0)).toEqual([5, 3, 'Arnaud Jorel']);
  });

  it('« restaurer » remet la date à NULL — et n’efface AUCUNE ligne', async () => {
    expect(await mettreALaCorbeille(5, false, AUTEUR)).toEqual({ etat: 'ok', corbeille: false });
    expect(SQL()[0]).toContain('corbeille_le = NULL');
    expect(PARAMS(0)).toEqual([5]);
  });

  it('🔴 AUCUN DELETE, dans aucun des deux sens', async () => {
    await mettreALaCorbeille(5, true, AUTEUR);
    await mettreALaCorbeille(5, false, AUTEUR);
    for (const s of SQL()) expect(s).not.toMatch(/\bDELETE\b|\bTRUNCATE\b|\bDROP\b/i);
  });

  it('les deux sens sont JOURNALISÉS, avec l’auteur figé', async () => {
    await mettreALaCorbeille(5, true, AUTEUR);
    expect(SQL()[1]).toContain('INSERT INTO gestion_journal');
    expect(PARAMS(1)[1]).toBe('corbeille');
    expect(PARAMS(1)).toContain('Arnaud Jorel');
    queryMock.mockClear();
    await mettreALaCorbeille(5, false, AUTEUR);
    expect(PARAMS(1)[1]).toBe('corbeille_restauration');
  });

  /** Le geste a EU LIEU : un journal impossible ne doit pas le défaire, ni le faire croire raté. */
  it('un journal qui échoue ne défait pas le geste', async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockRejectedValueOnce(new Error('journal refusé'));
    expect(await mettreALaCorbeille(5, true, AUTEUR)).toEqual({ etat: 'ok', corbeille: true });
  });

  it('un échange inconnu le DIT, et n’écrit aucun journal', async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    expect(await mettreALaCorbeille(999, true, AUTEUR)).toEqual({ etat: 'inconnu' });
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

describe('🔴 ③ l’état de l’échange n’est pas touché', () => {
  it('ni `etat`, ni l’affectation à une carte ne sont modifiés', async () => {
    await mettreALaCorbeille(5, true, AUTEUR);
    await mettreALaCorbeille(5, false, AUTEUR);
    for (const s of SQL()) {
      expect(s).not.toContain('SET etat');
      expect(s).not.toContain('gestion_affectation');
      expect(s).not.toContain('gestion_evenement');
    }
  });
});

describe('le compteur, et le RETOUR AUTOMATIQUE', () => {
  /**
   * 🔴 LA RÈGLE QUI DONNE GRATUITEMENT LE COMPORTEMENT DE GMAIL : un échange n'est à la corbeille que tant que le
   * geste est POSTÉRIEUR OU ÉGAL à son dernier message. Un nouveau message l'en fait donc ressortir tout seul — sans
   * qu'une ligne soit écrite, sans rattrapage à la relève, sans rien qui puisse se désynchroniser.
   */
  it('ne compte que les échanges dont le geste est POSTÉRIEUR au dernier message', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 4 }] });
    expect(await compterCorbeille()).toBe(4);
    const s = SQL()[0];
    expect(s).toContain('f.corbeille_le IS NOT NULL');
    expect(s).toContain('f.corbeille_le >= coalesce((SELECT max(m.recu_le)');
  });

  it('corbeille vide → 0, et non `null` : « vide » et « on ne sait pas » sont deux choses', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 0 }] });
    expect(await compterCorbeille()).toBe(0);
  });
});

describe('🔴 ② rien n’est écrit dans Gmail', () => {
  const src = readFileSync('app/lib/gestion/corbeilleRepo.ts', 'utf8');
  const route = readFileSync('app/(admin)/api/admin/gestion/fils/[id]/corbeille/route.ts', 'utf8');

  it('ni le dépôt ni la route n’atteignent Gmail : aucun libellé, aucun TRASH', () => {
    for (const f of [src, route]) {
      const code = f.split('\n').filter((l) => !/^\s*(\*|\/\/|--)/.test(l)).join('\n');
      expect(code).not.toContain('TRASH');
      expect(code).not.toContain('gmail');
      expect(code).not.toContain('modifierLibelles');
    }
  });

  /** Deux verbes pour deux sens : un geste réversible doit se lire aussi facilement dans les deux sens. */
  it('la route expose POST (mettre) et DELETE (restaurer)', () => {
    expect(route).toContain('export function POST');
    expect(route).toContain('export function DELETE');
  });
});

/**
 * LA RÈGLE DU RETOUR AUTOMATIQUE vit aussi dans le parcours de la boîte : les deux formes — celle qui MONTRE la
 * corbeille et celle qui l'ÉCARTE — doivent sortir du même endroit, sans quoi un échange pourrait n'être visible
 * nulle part.
 */
describe('la même règle des deux côtés', () => {
  const boite = readFileSync('app/lib/gestion/boiteRepo.ts', 'utf8');

  it('l’étiquette « Corbeille » et l’exclusion des autres emploient le MÊME fragment', () => {
    expect(boite).toContain('const SQL_EN_CORBEILLE');
    expect(boite).toContain('AND ${SQL_EN_CORBEILLE}');
    expect(boite).toContain('AND NOT ${SQL_EN_CORBEILLE}');
  });

  it('la comparaison est bien « >= » : un geste dans la même seconde qu’un message doit tenir', () => {
    expect(boite).toContain('fc.corbeille_le >= m.recu_le');
  });
});
