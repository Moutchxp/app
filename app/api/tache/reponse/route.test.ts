import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

/**
 * LOT GESTION-ACCEPTATION (16/10/2026) — répondre à une tâche par le LIEN DU MAIL, sans connexion. Base SIMULÉE avec état
 * (une demande, ses réponses, l'historique), agenda SIMULÉ (aucun appel Google) : la VRAIE route et le VRAI
 * `repondreDemande` / `verdictLien` sont exercés. Le verrou de ligne (`FOR UPDATE`) est reproduit en sérialisant les
 * transactions, comme le fait PostgreSQL pour deux réponses simultanées à la même demande.
 */
const empreinte = (j: string) => createHash('sha256').update(j).digest('hex');
const JETON = 'JETON-valide-0123456789abcdefghijklmnopqrstuvwxyz';

interface Demande { id: number; tache_id: number; statut: string; destinataire_id: number; destinataire_libelle: string;
  jeton_empreinte: string; expire_le: Date; utilise_le: Date | null; motif: string | null; repondu_par_libelle: string | null }
let demande: Demande;
let tacheEtat: string;
let historique: { apres: unknown; auteur_id: unknown; auteur_libelle: unknown }[];
let agenda: Map<number, number>; // tâche → nombre d'événements posés dans l'agenda simulé
let syncAppels: number;

function reinitialiser(o: Partial<Demande> = {}) {
  demande = { id: 41, tache_id: 7, statut: 'en_attente', destinataire_id: 3, destinataire_libelle: 'Claire Essai',
    jeton_empreinte: empreinte(JETON), expire_le: new Date(Date.now() + 86_400_000), utilise_le: null, motif: null,
    repondu_par_libelle: null, ...o };
  tacheEtat = 'a_faire'; historique = []; agenda = new Map(); syncAppels = 0;
}

const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ');
  if (s.includes('FROM gestion_tache_demande d JOIN gestion_tache t') && s.includes('d.jeton_empreinte = $1')) {
    if (params[0] !== demande.jeton_empreinte) return { rows: [] };
    return { rows: [{ ...demande, tache_etat: tacheEtat, etat: tacheEtat, statut_brut: demande.statut, objet: 'Visite',
      jour: '2026-10-20', heure: '09:30', note: null, adresse: '7 avenue de l’Union', commune: 'ASNIERES',
      demandeur_libelle: 'Arnaud Jorel', cree_le: new Date(), repondu_le: demande.utilise_le }] };
  }
  if (s.startsWith('UPDATE gestion_tache_demande SET statut = $2')) {
    Object.assign(demande, { statut: params[1], repondu_par_libelle: params[2], motif: params[3], utilise_le: new Date() });
    return { rows: [], rowCount: 1 };
  }
  if (s.startsWith('INSERT INTO gestion_tache_action')) {
    historique.push({ apres: JSON.parse(String(params[2])), auteur_id: params[3], auteur_libelle: params[4] });
    return { rows: [], rowCount: 1 };
  }
  return { rows: [], rowCount: 0 };
});
let verrou: Promise<unknown> = Promise.resolve();
vi.mock('server-only', () => ({}));
vi.mock('../../../lib/db/client', () => ({
  query: (sql: string, p?: unknown[]) => query(sql, p),
  withTransaction: (f: (q: unknown) => Promise<unknown>) => {
    const suite = verrou.then(() => f((sql: string, p?: unknown[]) => query(sql, p)));
    verrou = suite.catch(() => {});
    return suite;
  },
}));
vi.mock('../../../lib/gestion/schema', () => ({ acceptationTacheDisponible: async () => true, invitesTacheDisponible: async () => false }));
// Agenda SIMULÉ : le chemin existant est « marquer à synchroniser » dans la transaction, puis synchroniser après le geste.
vi.mock('../../../lib/gestion/agendaSynchroRepo', () => ({
  marquerASynchroniser: async () => {},
  synchroniserApresGeste: async (tacheId: number) => {
    syncAppels += 1;
    // Comme le vrai (idempotent) : une tâche acceptée a UN événement, jamais deux.
    if (demande.statut === 'acceptee') agenda.set(tacheId, 1);
    return ' Agenda Google à jour.';
  },
}));

const { GET, POST } = await import('./route');

const poster = (corps: unknown) => POST(new Request('http://local/api/tache/reponse', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
}));
const lire = (j: string) => GET(new Request(`http://local/api/tache/reponse?j=${encodeURIComponent(j)}`));

beforeEach(() => { reinitialiser(); query.mockClear(); });

describe('jeton', () => {
  it('valide → lecture : titre, date, et le lien peut répondre ; rien n’est écrit', async () => {
    const r = await (await lire(JETON)).json();
    expect(r.peutRepondre).toBe(true);
    expect(r.tache).toMatchObject({ objet: 'Visite', jour: '2026-10-20', heure: '09:30', statut: 'en_attente' });
    expect(r.tache.echeance).toBe('mar. 20 oct. · 9 h 30');
    expect(query.mock.calls.some(([sql]) => /UPDATE|INSERT/.test(String(sql)))).toBe(false);
  });

  it('faux → message clair, rien n’est modifié', async () => {
    const res = await poster({ jeton: 'faux', decision: 'accepter' });
    expect(res.status).toBe(409);
    expect((await res.json()).erreur).toMatch(/pas valable/);
    expect(demande.statut).toBe('en_attente');
    expect(historique).toEqual([]);
  });

  it('expiré → message clair, rien n’est modifié', async () => {
    reinitialiser({ expire_le: new Date(Date.now() - 1000) });
    const res = await poster({ jeton: JETON, decision: 'accepter' });
    expect(res.status).toBe(409);
    const d = await res.json();
    expect(d.cause).toBe('expire');
    expect(d.erreur).toMatch(/expiré/);
    expect(demande.statut).toBe('en_attente');
    expect(agenda.size).toBe(0);
  });

  it('déjà utilisé → message clair, la réponse enregistrée est rendue, rien n’est modifié', async () => {
    await poster({ jeton: JETON, decision: 'accepter' });
    const avant = { ...demande };
    const res = await poster({ jeton: JETON, decision: 'refuser', motif: 'finalement non' });
    expect(res.status).toBe(409);
    const d = await res.json();
    expect(d.cause).toBe('deja_utilise');
    expect(d.tache.statut).toBe('acceptee');
    expect(demande).toEqual(avant);
  });

  it('demande remplacée (date, heure ou personne changée) → refus clair, rien n’est modifié', async () => {
    reinitialiser({ statut: 'remplacee' });
    const d = await (await poster({ jeton: JETON, decision: 'accepter' })).json();
    expect(d.cause).toBe('remplace');
    expect(demande.statut).toBe('remplacee');
  });
});

describe('réponses', () => {
  it('accepter, SANS connexion → « acceptée », tracée au nom du destinataire, ajoutée à l’agenda par le chemin existant', async () => {
    const res = await poster({ jeton: JETON, decision: 'accepter' });
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.statut).toBe('acceptee');
    expect(d.tache).toMatchObject({ objet: 'Visite', statut: 'acceptee' });
    expect(demande).toMatchObject({ statut: 'acceptee', repondu_par_libelle: 'Claire Essai' });
    expect(demande.utilise_le).not.toBeNull();
    expect(historique).toEqual([{ apres: { acceptation: 'acceptee', canal: 'lien du mail' }, auteur_id: 3, auteur_libelle: 'Claire Essai' }]);
    expect(syncAppels).toBe(1);
    expect(agenda.get(7)).toBe(1);
  });

  it('refuser → motif obligatoire (rien n’est modifié sans lui), puis « refusée » enregistrée, rien dans l’agenda', async () => {
    const sans = await poster({ jeton: JETON, decision: 'refuser' });
    expect(sans.status).toBe(400);
    expect(demande.statut).toBe('en_attente');
    const res = await poster({ jeton: JETON, decision: 'refuser', motif: 'Déjà pris ce jour-là' });
    expect((await res.json()).statut).toBe('refusee');
    expect(demande).toMatchObject({ statut: 'refusee', motif: 'Déjà pris ce jour-là' });
    expect(agenda.size).toBe(0);
  });

  it('double clic (deux réponses simultanées) → une seule enregistrée, un seul événement, aucun doublon', async () => {
    const [a, b] = await Promise.all([poster({ jeton: JETON, decision: 'accepter' }), poster({ jeton: JETON, decision: 'accepter' })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(historique).toHaveLength(1);
    expect(syncAppels).toBe(1);
    expect(agenda.get(7)).toBe(1);
  });

  it('second clic plus tard → « déjà enregistrée », l’agenda n’est pas resynchronisé', async () => {
    await poster({ jeton: JETON, decision: 'accepter' });
    const d = await (await poster({ jeton: JETON, decision: 'accepter' })).json();
    expect(d.cause).toBe('deja_utilise');
    expect(syncAppels).toBe(1);
    expect(agenda.get(7)).toBe(1);
  });

  it('tâche déjà faite ou annulée → rien à accepter', async () => {
    tacheEtat = 'faite';
    const d = await (await poster({ jeton: JETON, decision: 'accepter' })).json();
    expect(d.cause).toBe('tache_terminee');
    expect(demande.statut).toBe('en_attente');
  });
});
