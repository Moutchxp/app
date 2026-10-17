import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContactSource } from './contactsTache';

/**
 * LOT TACHES-1-BIS — LES CONTACTS D'UNE TÂCHE DANS LE DÉPÔT : copie datée au moment du choix, retrait sans
 * suppression, « Mettre à jour », et un contact retiré du bien qui reste lisible dans la tâche. La base est simulée :
 * on vérifie les paramètres liés et des fragments du SQL, jamais sa forme exacte.
 */
interface Appel { sql: string; params: unknown[] }
let appels: Appel[] = [];
let actifs: Record<string, unknown>[] = [];
let fiche: ContactSource[] = [];

const COURANTE = {
  lot_id: 10, etat: 'a_faire', objet: 'Visite', note: 'Passer avec les clés', jour: '2026-10-15', heure: null,
  rappels: [{ sorte: 'jour', heure: '09:00' }], confiee_a: 1, confiee_a_libelle: 'Arno Jorel', evenement_id: null,
};

const queryMock = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ');
  appels.push({ sql: s, params });
  if (s.includes('FROM gestion_tache WHERE id = $1 FOR UPDATE')) return { rows: [COURANTE] };
  if (s.includes('SELECT lot_id::int AS lot_id FROM gestion_tache WHERE id = $1')) return { rows: [{ lot_id: 10 }] };
  if (s.includes('FROM admin_utilisateur WHERE id = $1')) return { rows: [{ l: 'Arno Jorel' }] };
  if (s.includes('FROM (') && s.includes('admin_utilisateur')) {
    return { rows: [{ id: 1, libelle: 'Arno Jorel', identifiant: 'a.jorel@sansvisavis.com', actif: true, accesGestion: true }] };
  }
  if (s.includes('FROM gestion_annuaire_lot WHERE id = $1')) return { rows: [{ '?column?': 1 }] };
  if (s.includes('INSERT INTO gestion_tache (')) return { rows: [{ id: 7 }] };
  if (s.includes('FROM gestion_tache_contact WHERE tache_id = $1 AND retire_le IS NULL')) return { rows: actifs };
  if (s.startsWith('UPDATE gestion_tache_contact SET nom')) return { rows: [], rowCount: 1 };
  return { rows: [], rowCount: 1 };
});

vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...(a as [string, unknown[]])),
  withTransaction: async (f: (q: unknown) => unknown) => f((...a: unknown[]) => queryMock(...(a as [string, unknown[]]))),
}));
vi.mock('./schema', () => ({ acceptationTacheDisponible: async () => false, invitesTacheDisponible: async () => false, agendaTacheDisponible: async () => false, contactsTacheDisponible: async () => true, tachesDisponibles: async () => true, piecesTacheDisponible: async () => false }));
vi.mock('./contactsTacheRepo', () => ({ contactsDuBienPourTache: async () => fiche }));
vi.mock('./comptesGoogleRepo', () => ({ lireDomainesAutorises: async () => 'criterimmo.fr,sansvisavis.com' }));

const { creerTache, modifierTache, actualiserContact, lireTache } = await import('./tachesRepo');

const AUTEUR = { id: 1, libelle: 'a.jorel@sansvisavis.com' };
const PROPRIO: ContactSource = {
  cle: 'proprietaire:12', famille: 'proprietaire', nom: 'M. DUPONT Jean', qualite: null, organisation: null, adresse: null,
  coordonnees: [{ sorte: 'telephone', libelle: 'Mobile', valeur: '0612345678', affichage: '06 12 34 56 78' }],
};
const SYNDIC: ContactSource = {
  cle: 'syndic_contact:9', famille: 'syndic_immeuble', nom: 'M. GESTION Paul', qualite: 'Gestionnaire',
  organisation: 'Cabinet LOISEAU', adresse: '3 rue du Syndic, 75011 Paris',
  coordonnees: [{ sorte: 'telephone', libelle: 'Standard du cabinet', valeur: '0140000000', affichage: null }],
};
const ligneActive = (c: ContactSource) => ({
  cle: c.cle, famille: c.famille, nom: c.nom, qualite: c.qualite, organisation: c.organisation, adresse: c.adresse,
  coordonnees: c.coordonnees, copie_le: new Date('2026-10-01T08:00:00Z'),
});
const SAISIE = {
  objet: 'Visite', jour: '2026-10-15', heure: null, note: 'Passer avec les clés', confieeA: 1, evenementId: null,
  rappels: [{ sorte: 'jour' as const, heure: '09:00' }],
};

const inserts = () => appels.filter((a) => a.sql.startsWith('INSERT INTO gestion_tache_contact'));
const traces = () => appels.filter((a) => a.sql.includes('INSERT INTO gestion_tache_action')).map((a) => [a.params[1], a.params[3]]);

beforeEach(() => { appels = []; actifs = []; fiche = [PROPRIO, SYNDIC]; });

describe('🔴 copie au moment du choix', () => {
  it('créer une tâche avec deux contacts : deux copies, prises dans la fiche, et deux traces « contact ajouté »', async () => {
    expect(await creerTache(10, { ...SAISIE, contacts: ['proprietaire:12', 'syndic_contact:9'] }, AUTEUR)).toMatchObject({ ok: true, id: 7 });
    const [a, b] = inserts();
    expect(a.params.slice(0, 8)).toEqual([7, 'proprietaire:12', 'proprietaire', 'M. DUPONT Jean', null, null, null,
      JSON.stringify(PROPRIO.coordonnees)]);
    expect(b.params.slice(0, 7)).toEqual([7, 'syndic_contact:9', 'syndic_immeuble', 'M. GESTION Paul', 'Gestionnaire',
      'Cabinet LOISEAU', '3 rue du Syndic, 75011 Paris']);
    expect(traces()).toEqual([
      ['creation', expect.any(String)],
      ['modification', JSON.stringify({ contactAjoute: 'M. DUPONT Jean' })],
      ['modification', JSON.stringify({ contactAjoute: 'M. GESTION Paul' })],
    ]);
  });

  it('sans la liste de contacts (fenêtre du lot 1), les contacts ne sont pas touchés', async () => {
    await creerTache(10, SAISIE, AUTEUR);
    expect(inserts()).toEqual([]);
  });

  it('une clé inconnue de la fiche n’est jamais copiée', async () => {
    await creerTache(10, { ...SAISIE, contacts: ['carte:999'] }, AUTEUR);
    expect(inserts()).toEqual([]);
  });
});

describe('🔴 décocher : retiré, jamais effacé — et la note reste', () => {
  it('le contact décoché est marqué retiré et tracé ; la note n’est pas dans les champs modifiés', async () => {
    actifs = [ligneActive(PROPRIO), ligneActive(SYNDIC)];
    await modifierTache(7, { ...SAISIE, contacts: ['syndic_contact:9'] }, AUTEUR);
    expect(appels.some((a) => a.sql.startsWith('DELETE'))).toBe(false);
    const retrait = appels.find((a) => a.sql.startsWith('UPDATE gestion_tache_contact SET retire_le = now()'));
    expect(retrait?.params).toEqual([7, 'proprietaire:12', 'Arno Jorel']);
    expect(traces()).toEqual([['modification', JSON.stringify({ contactRetire: 'M. DUPONT Jean' })]]);
    // Rien d'autre n'a changé : ni la note, ni la tâche elle-même.
    expect(appels.some((a) => a.sql.startsWith('UPDATE gestion_tache SET'))).toBe(false);
  });

  it('🔴 un contact retiré du BIEN mais gardé coché reste dans la tâche, avec sa copie d’alors', async () => {
    actifs = [ligneActive(SYNDIC)];
    fiche = [PROPRIO]; // le syndic a changé : le contact n'est plus dans la fiche
    await modifierTache(7, { ...SAISIE, contacts: ['syndic_contact:9'] }, AUTEUR);
    expect(appels.some((a) => a.sql.includes('retire_le = now()'))).toBe(false);
    expect(inserts()).toEqual([]);
  });
});

describe('🔴 « Mettre à jour »', () => {
  it('recopie la fiche d’aujourd’hui, redate la copie, et le trace', async () => {
    fiche = [{ ...PROPRIO, coordonnees: [{ sorte: 'telephone', libelle: 'Mobile', valeur: '0699999999', affichage: null }] }];
    expect(await actualiserContact(7, 'proprietaire:12', AUTEUR)).toEqual({ ok: true, id: 7 });
    const maj = appels.find((a) => a.sql.startsWith('UPDATE gestion_tache_contact SET nom'));
    expect(maj?.sql).toContain('copie_le = now()');
    expect(maj?.params[6]).toBe(JSON.stringify([{ sorte: 'telephone', libelle: 'Mobile', valeur: '0699999999', affichage: null }]));
    expect(traces()).toEqual([['modification', JSON.stringify({ contactMisAJour: 'M. DUPONT Jean' })]]);
  });

  it('un contact qui n’est plus lié au bien ne se met pas à jour : sa copie reste telle quelle', async () => {
    fiche = [];
    expect(await actualiserContact(7, 'proprietaire:12', AUTEUR)).toMatchObject({ ok: false, statut: 409 });
    expect(appels.some((a) => a.sql.startsWith('UPDATE'))).toBe(false);
  });
});

describe('le détail rend les copies, avec leur date', () => {
  it('contacts copiés relus tels quels', async () => {
    actifs = [ligneActive(SYNDIC)];
    queryMock.mockImplementationOnce(async () => ({
      rows: [{ id: 7, lot_id: 10, lot_cle: '315', adresse: '7 avenue de l’Union', commune: 'Paris', evenement_id: null,
        objet: 'Visite', note: null, jour: '2026-10-15', heure: null, rappels: [], etat: 'a_faire', confiee_a: 1,
        confiee_a_libelle: 'Arno Jorel', cree_le: new Date(), cree_par_libelle: 'A', maj_le: new Date(), faite_le: null,
        faite_par_libelle: null, annulee_le: null, annulee_par_libelle: null, nb_contacts: 1 }],
    }));
    const d = await lireTache(7);
    expect(d?.tache.nbContacts).toBe(1);
    expect(d?.contacts).toEqual([{ ...SYNDIC, copieLe: '2026-10-01T08:00:00.000Z' }]);
  });
});
