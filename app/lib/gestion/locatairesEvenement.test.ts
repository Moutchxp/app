import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ANCIENS_PROPOSES, choixModifie, choixParDefaut, concernesDepuisJson, ligneConcernes, optionsDuBien, phraseRattachement,
  tonConcerne, type Concerne,
} from './locatairesEvenement';

/**
 * ══ 🔴🔴 LOT MARGES-MODALE-ET-LOCATAIRES-DE-L-EVENEMENT — LE OU LES LOCATAIRES CONCERNÉS ════════════════════════════════
 * 🔒 Données de banc ; la base est simulée pour le dépôt.
 */
const appels: Array<{ sql: string; params: unknown[] }> = [];
let disponible = true;
vi.mock('../db/client', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => { appels.push({ sql, params }); return { rows: [] }; }),
  withTransaction: vi.fn(async (fn: (q: unknown) => Promise<unknown>) =>
    fn(async (sql: string, params: unknown[] = []) => { appels.push({ sql, params }); return { rows: [] }; })),
}));
vi.mock('./schema', async (orig) => ({ ...(await orig<typeof import('./schema')>()), evenementConcerneDisponible: async () => disponible }));
beforeEach(() => { appels.length = 0; disponible = true; });

const AUJ = '2026-10-12';
/* Le bien 315 (67 rue de Normandie) : vacant depuis le 28/09/2026, deux anciens ; et un troisième ancien, plus vieux. */
const OCC_315 = [
  { locataireId: 302, nom: 'LEON GUIMAREY DI FIORE Isabella et Hugo', entree: '2025-05-01', sortie: '2026-09-28' },
  { locataireId: 346, nom: 'MOUDNI Imane', entree: '2022-04-16', sortie: '2025-01-16' },
  { locataireId: 400, nom: 'ANCIEN Plus', entree: '2019-01-01', sortie: '2022-03-31' },
];
const OCC_LOUE = [{ locataireId: 10, nom: 'TALHOUARN Valentin', entree: '2024-10-26', sortie: null }, ...OCC_315];

describe('🔴 le choix par défaut est INCHANGÉ : les locataires en place, cochés — sans action, rien ne change', () => {
  it('un bien loué : le locataire en place, et rien d’autre', () => {
    const o = optionsDuBien(OCC_LOUE, AUJ);
    expect(choixParDefaut(o).map((c) => [c.sorte, c.locataireId])).toEqual([['locataire', 10]]);
    expect(choixModifie(choixParDefaut(o), choixParDefaut(o))).toBe(false);
  });
  it('un bien vacant : rien de coché, et la phrase le dit', () => {
    const o = optionsDuBien(OCC_315, AUJ);
    expect(choixParDefaut(o)).toEqual([]);
    expect(phraseRattachement(['67 rue de Normandie, 92400 COURBEVOIE — lot 315'], [], true))
      .toBe('Sera rattaché à 67 rue de Normandie, 92400 COURBEVOIE — lot 315, à son propriétaire ; aucun locataire concerné (bien vacant).');
    expect(ligneConcernes([])).toBe('aucun (bien vacant ou choix vide)');
  });
  it('les locataires pas encore lus : la phrase d’AVANT, mot pour mot', () => {
    expect(phraseRattachement(['X — lot 1'], null)).toBe('Sera rattaché à X — lot 1, à son propriétaire et à son locataire.');
    expect(phraseRattachement([], null)).toBe('Aucun bien classé sur ce mail : la carte sera ouverte sans bien rattaché.');
  });
  it('une sortie à venir n’est pas encore un départ', () => {
    expect(optionsDuBien([{ locataireId: 1, nom: 'A', entree: '2020-01-01', sortie: '2026-12-31' }], AUJ).actuels).toHaveLength(1);
  });
});

describe('🔴 les anciens locataires : les DEUX plus récents au maximum', () => {
  it('trois anciens connus : les deux sorties les plus récentes, la plus récente d’abord', () => {
    const o = optionsDuBien(OCC_315, AUJ);
    expect(ANCIENS_PROPOSES).toBe(2);
    expect(o.anciens.map((c) => [c.locataireId, c.entree, c.sortie])).toEqual([[302, '2025-05-01', '2026-09-28'], [346, '2022-04-16', '2025-01-16']]);
    expect(o.anciens.every((c) => c.sorte === 'ancien_locataire' && tonConcerne(c.sorte) === 'violet')).toBe(true);
    expect(tonConcerne('locataire')).toBe('vert');
  });
  it('la phrase suit le choix : « à M. X (ancien locataire, sorti le JJ/MM/AAAA) »', () => {
    const o = optionsDuBien(OCC_315, AUJ);
    expect(phraseRattachement(['67 rue de Normandie, 92400 COURBEVOIE — lot 315'], [o.anciens[0]]))
      .toBe('Sera rattaché à 67 rue de Normandie, 92400 COURBEVOIE — lot 315, à son propriétaire et à LEON GUIMAREY DI FIORE Isabella et Hugo (ancien locataire, sorti le 28/09/2026).');
    const loue = optionsDuBien(OCC_LOUE, AUJ);
    expect(phraseRattachement(['B — lot 2'], [...loue.actuels, loue.anciens[0]]))
      .toBe('Sera rattaché à B — lot 2, à son propriétaire et à TALHOUARN Valentin (locataire en place) et LEON GUIMAREY DI FIORE Isabella et Hugo (ancien locataire, sorti le 28/09/2026).');
  });
});

describe('🔴 la partie libre : enregistrée sur l’événement, SANS fiche d’annuaire', () => {
  it('relue sans identifiant de fiche ; un locataire sans fiche, ou une ligne illisible, est écartée', () => {
    const l = concernesDepuisJson([
      { sorte: 'libre', nom: ' Me DUPONT, avocat ', email: 'me.dupont@banc.invalid', telephone: '06 00 00 00 00', locataireId: 5, sujet: 'locataire', sujetId: 9 },
      { sorte: 'locataire', nom: 'Sans fiche' },
      { sorte: 'annuaire', nom: 'Trouvé', sujet: 'proprietaire', sujetId: 12 },
      { sorte: 'ancien_locataire', nom: 'MOUDNI Imane', locataireId: 346, entree: '2022-04-16', sortie: '2025-01-16T00:00:00Z' },
      { sorte: 'pirate', nom: 'x' }, 'n’importe quoi', { sorte: 'libre', nom: '   ' },
    ]) as Concerne[];
    expect(l.map((c) => [c.sorte, c.nom, c.locataireId, c.sujet, c.sujetId, c.email, c.sortie])).toEqual([
      ['libre', 'Me DUPONT, avocat', null, null, null, 'me.dupont@banc.invalid', null],
      ['annuaire', 'Trouvé', null, 'proprietaire', 12, null, null],
      ['ancien_locataire', 'MOUDNI Imane', 346, null, null, null, '2025-01-16'],
    ]);
    expect(concernesDepuisJson('pas une liste')).toBeNull();
    expect(concernesDepuisJson([])).toEqual([]);
  });
});

describe('🔒 la base : migration d’AJOUT, écriture seulement sur un choix modifié, événements existants intacts', () => {
  it('la migration 343 ne fait que créer (une table, un index) : aucune donnée lue, modifiée ni supprimée', () => {
    const sql = readFileSync('db/migrations/343_gestion_evenement_concerne.sql', 'utf8').replace(/--[^\n]*/g, ' ').toUpperCase();
    for (const v of ['UPDATE ', 'DELETE ', 'INSERT ', 'TRUNCATE', 'DROP ', 'ALTER TABLE']) expect(sql, v).not.toContain(v);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS GESTION_EVENEMENT_CONCERNE');
    expect(sql).not.toContain('GESTION_EVENEMENT_PARTIE');
  });
  it('un choix : les lignes vivantes sont datées (jamais supprimées), puis le choix écrit ; un choix vide = une ligne « aucun »', async () => {
    const { ecrireConcernes } = await import('./evenementConcerneRepo');
    const q = async (sql: string, params: unknown[] = []) => { appels.push({ sql, params }); return { rows: [] }; };
    expect(await ecrireConcernes(q as never, 7, [{ sorte: 'libre', nom: 'Me DUPONT' }], { id: 2, libelle: 'arno' })).toBe(true);
    expect(appels[0].sql.replace(/\s+/g, ' ')).toContain('UPDATE gestion_evenement_concerne SET retire_le = now()');
    expect(appels[1].params.slice(0, 6)).toEqual([7, 'libre', null, null, null, 'Me DUPONT']);
    appels.length = 0;
    await ecrireConcernes(q as never, 7, [], { id: 2, libelle: 'arno' });
    expect(appels[1].params.slice(0, 2)).toEqual([7, 'aucun']);
    expect(appels.some((a) => /DELETE/i.test(a.sql))).toBe(false);
  });
  it('sans la 343, ou avec une liste illisible : rien n’est écrit', async () => {
    const { ecrireConcernes } = await import('./evenementConcerneRepo');
    const q = async (sql: string, params: unknown[] = []) => { appels.push({ sql, params }); return { rows: [] }; };
    expect(await ecrireConcernes(q as never, 7, 'x', { id: 2, libelle: 'arno' })).toBe(false);
    disponible = false;
    expect(await ecrireConcernes(q as never, 7, [], { id: 2, libelle: 'arno' })).toBe(false);
    expect(appels).toEqual([]);
  });
  it('🔴 la création n’écrit les personnes concernées QUE si l’écran envoie un choix modifié', () => {
    const g = readFileSync('app/lib/gestion/gestes.ts', 'utf8');
    expect(g).toContain('if (n.concernes !== undefined) await ecrireConcernes(q, id, n.concernes, auteur);');
    const bloc = readFileSync('app/(admin)/admin/(protected)/gestion/BlocEvenement.tsx', 'utf8');
    expect(bloc).toContain('...(concernes !== null && concernes.modifie ? { concernes: concernes.choix } : {}),');
    const rdf = readFileSync('app/(admin)/admin/(protected)/gestion/RattachementsDuFil.tsx', 'utf8');
    expect(rdf).toContain("...(voulu.concernes?.modifie === true ? { concernes: voulu.concernes.choix } : {}),");
    /* La table des parties (268) n'est jamais réécrite pour les événements existants. */
    expect(readFileSync('app/lib/gestion/evenementConcerneRepo.ts', 'utf8')).not.toContain('gestion_evenement_partie');
  });
});
