import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 🔴 LOT CONTACTS-ET-EVENEMENT — LA RÉCONCILIATION DES CONTACTS, ET LE DÉFAUT DU 28/09/2026.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT, MESURÉ SUR LA BASE RÉELLE. La migration 267 venait d'être appliquée ; Arno a relancé
 * `gestion:annuaire:importer -- --appliquer`, et le rapport a annoncé « contacts : 0 ajouté(s) ». Les 1 793
 * libellés de colonne (« Mobile 1 », « Email 2 ») sont restés VIDES.
 *
 * LA CAUSE : l'état « existant » ne portait que (sujet, sujet_id, sorte, valeur). Un contact déjà en base était
 * donc réputé INCHANGÉ quoi qu'il arrive, et la boucle le sautait AVANT d'écrire. Le rapport disait vrai sur ce
 * qu'il faisait, et faux sur ce qu'il fallait faire — le pire des deux, parce qu'on le croit.
 *
 * 🔴 LA RÈGLE QUI EN DÉCOULE, ET QUE CE FICHIER TIENT : un import idempotent doit comparer TOUT CE QU'IL ÉCRIT.
 * Le jour où l'on ajoute une colonne, la clé de comparaison doit l'apprendre — sinon la colonne neuve ne se
 * remplit jamais, en silence.
 *
 * 🔒 Aucune donnée réelle : adresses en @fictif.fr, numéros du préfixe 06 99 99 … réservé à la fiction.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const migration267 = vi.fn(async () => true);
vi.mock('./schema', () => ({
  annuaireDisponible: async () => true,
  libelleSourceContactDisponible: () => migration267(),
}));
vi.mock('../db/client', () => ({
  query: async () => ({ rows: [] }),
  withTransaction: async (f: unknown) => (f as (q: unknown) => unknown)(async () => ({ rows: [] })),
}));

import { ecrireContacts, COMPTES_VIDES } from './annuaireRepo';
import type { ComptesImport } from './annuaireRepo';

/** Une ligne de `gestion_annuaire_contact` telle que PostgreSQL la rend. */
const enBase = (o: Record<string, unknown> = {}) => ({
  sujet: 'proprietaire', sujet_id: '7', sorte: 'email', valeur: 'a@fictif.fr',
  absent_le: null, libelle_source: null, ...o,
});
/** Un contact tel que le plan d'import le veut. */
const voulu = (o: Record<string, unknown> = {}) => ({
  sorte: 'email' as const, valeur: 'a@fictif.fr', valeurBrute: 'A@Fictif.FR', rang: 0,
  libelleSource: 'Email 1', ...o,
});

let ecrits: { sql: string; params: unknown[] }[];
let lignes: ReturnType<typeof enBase>[];

/** Le `q` factice : il rend l'état de la base, et enregistre ce qu'on lui demande d'écrire. */
const q = (async (sql: string, params: unknown[] = []) => {
  if (/SELECT sujet/.test(sql)) return { rows: lignes };
  ecrits.push({ sql: sql.replace(/\s+/g, ' '), params });
  return { rows: [] };
}) as never;

const plan = (contacts: ReturnType<typeof voulu>[]) => ({
  proprietaires: [{ wippimmoId: 'P1', contacts }],
  locataires: [],
} as never);

const lancer = async (appliquer = true): Promise<ComptesImport> => {
  const c: ComptesImport = { ...COMPTES_VIDES };
  // ⚠️ La carte va de la CLÉ WIPPIMMO vers l'identifiant interne, jamais l'inverse : c'est ce que le dépôt attend.
  await ecrireContacts(q, plan([voulu()]), new Map([['P1', 7]]), new Map(), appliquer, c);
  return c;
};

beforeEach(() => {
  migration267.mockResolvedValue(true);
  ecrits = [];
  lignes = [];
});

describe('🔴 LE DÉFAUT DU 28/09/2026 — un contact déjà là dont le LIBELLÉ manque', () => {
  it('🔴 est compté comme MIS À JOUR, et il est RÉELLEMENT écrit', async () => {
    lignes = [enBase({ libelle_source: null })];
    const c = await lancer();
    // Avant la correction : 0 création, 0 mise à jour, 0 écriture — et le libellé restait vide pour toujours.
    expect(c.contactsCrees).toBe(0);
    expect(c.contactsMajs).toBe(1);
    expect(ecrits).toHaveLength(1);
    expect(ecrits[0].sql).toContain('libelle_source');
    expect(ecrits[0].params).toContain('Email 1');
  });

  it('un contact dont le libellé a CHANGÉ est mis à jour lui aussi', async () => {
    lignes = [enBase({ libelle_source: 'Email 2' })];
    const c = await lancer();
    expect(c.contactsMajs).toBe(1);
    expect(ecrits).toHaveLength(1);
  });

  it('🔴 un contact dont le libellé est DÉJÀ LE BON n’est PAS réécrit — l’import reste idempotent', async () => {
    lignes = [enBase({ libelle_source: 'Email 1' })];
    const c = await lancer();
    expect(c.contactsCrees).toBe(0);
    expect(c.contactsMajs).toBe(0);
    expect(ecrits).toEqual([]);
  });

  it('un contact ABSENT de la base est une création, comme avant', async () => {
    lignes = [];
    const c = await lancer();
    expect(c.contactsCrees).toBe(1);
    expect(c.contactsMajs).toBe(0);
    expect(ecrits).toHaveLength(1);
  });

  it('🔴 un contact MARQUÉ ABSENT revient : il est recréé, pas ignoré', async () => {
    lignes = [enBase({ absent_le: '2026-09-01', libelle_source: 'Email 1' })];
    const c = await lancer();
    expect(c.contactsCrees).toBe(1);
    expect(ecrits[0].sql).toContain('absent_le = NULL');
  });
});

describe('🔴 SANS LA MIGRATION 267, RIEN NE CHANGE', () => {
  it('la colonne n’est NOMMÉE NULLE PART, et un contact déjà là n’est pas réécrit', async () => {
    migration267.mockResolvedValue(false);
    lignes = [enBase({ libelle_source: null })];
    const c = await lancer();
    expect(c.contactsMajs).toBe(0);
    expect(ecrits).toEqual([]);
  });

  it('une création, elle, se fait encore — sans la colonne', async () => {
    migration267.mockResolvedValue(false);
    lignes = [];
    await lancer();
    expect(ecrits).toHaveLength(1);
    expect(ecrits[0].sql).not.toContain('libelle_source');
  });
});

describe('🔴 LA SIMULATION NE LAISSE RIEN, mais elle COMPTE juste', () => {
  it('elle annonce la mise à jour sans l’écrire', async () => {
    lignes = [enBase({ libelle_source: null })];
    const c = await lancer(false);
    expect(c.contactsMajs).toBe(1);
    expect(ecrits).toEqual([]);
  });
});

describe('ce qui a disparu de l’export est MARQUÉ, jamais effacé', () => {
  it('un contact en base que le plan ne veut plus est daté « absent »', async () => {
    lignes = [enBase({ valeur: 'parti@fictif.fr', libelle_source: 'Email 1' }), enBase({ libelle_source: 'Email 1' })];
    const c = await lancer();
    expect(c.contactsRetires).toBe(1);
    const retrait = ecrits.find((e) => e.sql.includes('absent_le = now()'));
    expect(retrait).toBeDefined();
    expect(retrait?.sql).not.toContain('DELETE');
    expect(retrait?.params).toContain('parti@fictif.fr');
  });
});
