import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContactSource } from './contactsTache';

/**
 * 🔴🔴 RÈGLE 5 (Arno, 10/11/2026, migration 465) — « Tâche rattachée à UN SEUL bien : un contact ajouté qui n'existe pas dans
 * l'historique de ce bien y est ajouté comme « tiers indépendant » (nom, rôle, téléphone, e-mail), avec trace au journal. Tâche
 * rattachée à plusieurs biens ou à aucun : rien n'est ajouté. » Base simulée : on lit les paramètres liés, jamais la forme du SQL.
 */
interface Appel { sql: string; params: unknown[] }
let appels: Appel[] = [];
let biens: string[] = [];
let copies: Record<string, unknown>[] = [];
let fiche: ContactSource[] = [];

const COURANTE = {
  lot_id: 10, etat: 'a_faire', objet: 'Visite', note: null, jour: '2026-11-20', heure: null,
  rappels: [], confiee_a: 1, confiee_a_libelle: 'Arno Jorel', evenement_id: null,
};

const queryMock = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ');
  appels.push({ sql: s, params });
  if (s.includes('FROM gestion_tache WHERE id = $1 FOR UPDATE')) return { rows: [COURANTE] };
  if (s.includes('FROM admin_utilisateur WHERE id = $1')) return { rows: [{ l: 'Arno Jorel' }] };
  if (s.includes('FROM (') && s.includes('admin_utilisateur')) {
    return { rows: [{ id: 1, libelle: 'Arno Jorel', identifiant: 'a.jorel@sansvisavis.com', actif: true, accesGestion: true }] };
  }
  if (s.includes('FROM gestion_annuaire_lot WHERE id = $1')) return { rows: [{ '?column?': 1 }] };
  if (s.includes('INSERT INTO gestion_tache (')) return { rows: [{ id: 7 }] };
  // Les biens de la tâche : son lot, et ceux de ses événements rattachés.
  if (s.includes('SELECT l.wippimmo_id AS cle FROM gestion_tache t')) return { rows: biens.map((cle) => ({ cle })) };
  if (s.includes('FROM gestion_annuaire_lot WHERE wippimmo_id = $1')) return { rows: [{ id: 10 }] };
  if (s.startsWith('INSERT INTO gestion_tache_contact (')) {
    copies.push({ cle: params[1], famille: 'independant', nom: params[2], qualite: params[3], organisation: null, adresse: null,
      coordonnees: JSON.parse(String(params[4])), copie_le: new Date('2026-11-10T08:00:00Z') });
    return { rows: [] };
  }
  if (s.includes('FROM gestion_tache_contact WHERE tache_id = $1 AND retire_le IS NULL')) return { rows: copies };
  if (s.startsWith('INSERT INTO gestion_bien_tiers')) return { rows: [{ id: 1 }] };
  return { rows: [], rowCount: 1 };
});

vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...(a as [string, unknown[]])),
  withTransaction: async (f: (q: unknown) => unknown) => f((...a: unknown[]) => queryMock(...(a as [string, unknown[]]))),
}));
vi.mock('./schema', () => ({ creneauTacheDisponible: async () => false, sorteTacheDisponible: async () => false,
  acceptationTacheDisponible: async () => false, invitesTacheDisponible: async () => false, evenementsTacheDisponible: async () => false,
  agendaTacheDisponible: async () => false, contactsTacheDisponible: async () => true, tachesDisponibles: async () => true,
  piecesTacheDisponible: async () => false, invitationContactsDisponible: async () => true,
}));
vi.mock('./contactsTacheRepo', () => ({ contactsDuBienPourTache: async () => fiche }));
vi.mock('./comptesGoogleRepo', () => ({ lireDomainesAutorises: async () => 'criterimmo.fr,sansvisavis.com' }));

const { creerTache, modifierTache } = await import('./tachesRepo');

const AUTEUR = { id: 1, libelle: 'a.jorel@sansvisavis.com' };
const PROPRIO: ContactSource = {
  cle: 'proprietaire:12', famille: 'proprietaire', nom: 'M. DUPONT Jean', qualite: null, organisation: null, adresse: null,
  coordonnees: [{ sorte: 'email', libelle: null, valeur: 'jean@exemple.test', affichage: null }],
};
const SAISIE = { objet: 'Visite', jour: '2026-11-20', heure: null, note: null, confieeA: 1, evenementId: null, rappels: [] };
const PLOMBIER = { nom: 'Plombier Test', qualite: 'Plombier', telephone: '06 11 22 33 44', email: 'plombier@exemple.test' };

const tiersPoses = () => appels.filter((a) => a.sql.startsWith('INSERT INTO gestion_bien_tiers')).map((a) => a.params);
const journal = () => appels.filter((a) => a.sql.startsWith('INSERT INTO gestion_journal'));

beforeEach(() => { appels = []; copies = []; biens = ['315']; fiche = [PROPRIO]; });

describe('🔴 tâche rattachée à UN SEUL bien', () => {
  it('un contact saisi à la main, absent de l’historique du bien : ajouté comme tiers indépendant (nom, rôle, téléphone, e-mail) et tracé au journal', async () => {
    expect(await creerTache(10, { ...SAISIE, contactsManuels: [PLOMBIER] }, AUTEUR)).toMatchObject({ ok: true, id: 7 });
    expect(tiersPoses()).toEqual([[10, 'Plombier Test', 'Plombier', '06 11 22 33 44', 'plombier@exemple.test', 7, 1, 'Arno Jorel']]);
    expect(journal()).toHaveLength(1);
    expect(journal()[0].sql).toContain("'annuaire_lot'");
    expect(journal()[0].sql).toContain("'tiers_independant_ajoute'");
    expect(journal()[0].params.slice(0, 2)).toEqual([10, 'Plombier Test']);
    expect(String(journal()[0].params[2])).toContain('Plombier Test · Plombier · 06 11 22 33 44 · plombier@exemple.test');
  });

  it('déjà dans l’historique du bien (même e-mail, ou même nom) : rien n’est ajouté', async () => {
    await creerTache(10, { ...SAISIE, contactsManuels: [{ nom: 'Autre Nom', qualite: null, telephone: null, email: 'JEAN@exemple.test' }] }, AUTEUR);
    await creerTache(10, { ...SAISIE, contactsManuels: [{ nom: 'm. dupont jean', qualite: null, telephone: null, email: null }] }, AUTEUR);
    expect(tiersPoses()).toEqual([]);
    expect(journal()).toEqual([]);
  });

  it('à la modification aussi', async () => {
    await modifierTache(7, { ...SAISIE, contactsManuels: [PLOMBIER] }, AUTEUR);
    expect(tiersPoses()).toHaveLength(1);
    expect(journal()).toHaveLength(1);
  });

  it('un contact pris dans la fiche (pas saisi à la main) n’est jamais reposé', async () => {
    await creerTache(10, { ...SAISIE, contacts: ['proprietaire:12'] }, AUTEUR);
    expect(tiersPoses()).toEqual([]);
  });
});

describe('🔴 plusieurs biens, ou aucun : rien n’est ajouté', () => {
  it('plusieurs biens (le lot de la tâche + celui d’un événement rattaché)', async () => {
    biens = ['315', '412'];
    await creerTache(10, { ...SAISIE, contactsManuels: [PLOMBIER] }, AUTEUR);
    expect(tiersPoses()).toEqual([]);
    expect(journal()).toEqual([]);
  });
  it('aucun bien (tâche sans bien)', async () => {
    biens = [];
    await creerTache(null, { ...SAISIE, contactsManuels: [PLOMBIER] }, AUTEUR);
    expect(tiersPoses()).toEqual([]);
    expect(journal()).toEqual([]);
    // Le contact reste bien dans la tâche.
    expect(copies.map((c) => c.nom)).toEqual(['Plombier Test']);
  });
});
