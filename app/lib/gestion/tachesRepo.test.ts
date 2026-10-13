import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * LOT TACHES-1 — LES GESTES « FAITE » ET « DÉCALER » DANS LE DÉPÔT : la trace (qui, quand, avant → après) est écrite
 * dans la MÊME transaction que le changement, le refus se décide AVANT toute écriture, et rien n'est jamais supprimé.
 * La base est simulée : on vérifie les PARAMÈTRES liés et les fragments sémantiques, jamais la forme exacte du SQL.
 */
interface Appel { sql: string; params: unknown[] }
let appels: Appel[] = [];
let courante: Record<string, unknown> | null = null;

const queryMock = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ');
  appels.push({ sql: s, params });
  if (s.includes('FROM gestion_tache WHERE id = $1 FOR UPDATE')) return { rows: courante === null ? [] : [courante] };
  if (s.includes('FROM admin_utilisateur WHERE id = $1')) return { rows: [{ l: 'Arno Jorel' }] };
  return { rows: [] };
});

vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...(a as [string, unknown[]])),
  withTransaction: async (f: (q: unknown) => unknown) => f((...a: unknown[]) => queryMock(...(a as [string, unknown[]]))),
}));

const { marquerFaite, decalerTache, annulerTache } = await import('./tachesRepo');

const AUTEUR = { id: 1, libelle: 'a.jorel@sansvisavis.com' };
const MAINTENANT = new Date('2026-10-13T15:00:00+02:00');

beforeEach(() => {
  appels = [];
  courante = {
    etat: 'a_faire', objet: 'Visite', note: null, jour: '2026-10-15', heure: null,
    rappels: [{ sorte: 'jour', heure: '09:00' }], confiee_a: 1, confiee_a_libelle: 'Arno Jorel', evenement_id: null,
  };
});

const ecritures = () => appels.filter((a) => /^(UPDATE|INSERT|DELETE)/.test(a.sql.trim()));
const trace = () => appels.find((a) => a.sql.includes('INSERT INTO gestion_tache_action'));

describe('🔴 « Faite »', () => {
  it('passe la tâche à « faite » ET écrit la trace signée, dans la même transaction', async () => {
    expect(await marquerFaite(7, AUTEUR)).toEqual({ ok: true, id: 7 });
    const [maj, tr] = ecritures();
    expect(maj.sql).toContain("SET etat = 'faite', faite_le = now(), faite_par_libelle = $2");
    expect(maj.params).toEqual([7, 'Arno Jorel']);
    expect(tr.sql).toContain('INSERT INTO gestion_tache_action');
    expect(tr.params).toEqual([7, 'faite', JSON.stringify({ etat: 'a_faire' }), JSON.stringify({ etat: 'faite' }), 1, 'Arno Jorel']);
  });

  it('🔴 une tâche déjà faite est REFUSÉE avant toute écriture', async () => {
    courante = { ...courante, etat: 'faite' };
    expect(await marquerFaite(7, AUTEUR)).toMatchObject({ ok: false, statut: 409 });
    expect(ecritures()).toEqual([]);
  });

  it('une tâche inconnue rend 404, sans rien écrire', async () => {
    courante = null;
    expect(await marquerFaite(7, AUTEUR)).toMatchObject({ ok: false, statut: 404 });
    expect(ecritures()).toEqual([]);
  });
});

describe('🔴 « Décaler »', () => {
  it('+1 jour : nouvelle date écrite, trace « ancienne → nouvelle »', async () => {
    expect(await decalerTache(7, { raccourci: '+1j' }, AUTEUR, MAINTENANT)).toEqual({ ok: true, id: 7 });
    const [maj] = ecritures();
    expect(maj.params.slice(0, 3)).toEqual([7, '2026-10-16', null]);
    expect(trace()?.params.slice(1, 4)).toEqual([
      'decalage', JSON.stringify({ jour: '2026-10-15', heure: null }), JSON.stringify({ jour: '2026-10-16', heure: null }),
    ]);
    expect(trace()?.params[5]).toBe('Arno Jorel');
  });

  it('une tâche en retard décalée de +1 jour arrive à DEMAIN', async () => {
    courante = { ...courante, jour: '2026-10-01' };
    await decalerTache(7, { raccourci: '+1j' }, AUTEUR, MAINTENANT);
    expect(ecritures()[0].params[1]).toBe('2026-10-14');
  });

  it('vers une date et une heure choisies : le repère devient rendez-vous, rappels par défaut du rendez-vous', async () => {
    await decalerTache(7, { jour: '2026-10-20', heure: '10:30' }, AUTEUR, MAINTENANT);
    const [maj] = ecritures();
    expect(maj.params).toEqual([7, '2026-10-20', '10:30',
      JSON.stringify([{ sorte: 'avant', minutes: 1440 }, { sorte: 'avant', minutes: 60 }])]);
  });

  it('la même date est refusée sans rien écrire ; une tâche annulée ne se décale pas', async () => {
    expect(await decalerTache(7, { jour: '2026-10-15', heure: null }, AUTEUR, MAINTENANT)).toMatchObject({ ok: false });
    courante = { ...courante, etat: 'annulee' };
    expect(await decalerTache(7, { raccourci: '+1j' }, AUTEUR, MAINTENANT)).toMatchObject({ ok: false, statut: 409 });
    expect(ecritures()).toEqual([]);
  });
});

describe('🔴 jamais de suppression', () => {
  it('annuler est un changement d’état tracé, pas un DELETE', async () => {
    await annulerTache(7, AUTEUR);
    expect(appels.some((a) => a.sql.trim().startsWith('DELETE'))).toBe(false);
    expect(ecritures()[0].sql).toContain("SET etat = 'annulee'");
    expect(trace()?.params[1]).toBe('annulation');
  });
});
