import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (19/11/2026, choix A) — après l'annulation : le mail part aux SEULS collaborateurs qui avaient accepté ; chaque envoi est au journal. Base simulée. */
const h = vi.hoisted(() => ({ ecrits: [] as { sql: string; params: unknown[] }[], envoyes: [] as string[][], envoiMail: true }));
vi.mock('../db/client', () => ({
  query: async (sql: string, params: unknown[] = []) => {
    const s = sql.replace(/\s+/g, ' ');
    if (/^\s*INSERT/.test(s)) h.ecrits.push({ sql: s, params });
    if (s.includes('FROM gestion_tache t LEFT JOIN gestion_annuaire_lot')) return { rows: [{ objet: 'Pré-visite', sorte: 'rdv', jour: '2026-11-20', heure: '10:00', duree: 30, adresse: '1 rue du Préavis, Puteaux' }] };
    if (s.includes('FROM gestion_tache_demande d')) return { rows: [
      { id: '2', libelle: 'Arnaud Jorel', email: 'a.jorel@sansvisavis.com', statut: 'acceptee' },
      { id: '6', libelle: 'Cédric JULLIEN', email: 'c@sansvisavis.com', statut: 'acceptee' },
      { id: '5', libelle: 'Jean-Baptiste PONS', email: 'jb@sansvisavis.com', statut: 'en_attente' },
    ] };
    return { rows: [] };
  },
}));
vi.mock('./schema', () => ({ invitesTacheDisponible: async () => true }));
vi.mock('./acceptationRepo', () => ({ lireReglageTaches: async () => ({ envoiMail: h.envoiMail }) }));
vi.mock('./config', () => ({ chargerConfigGestion: async () => ({ adresseGestion: 'gestion@criterimmo.fr' }) }));
vi.mock('./envoiDemandeTache', () => ({
  transportParDefaut: () => null,
  avecVerrouTest: () => ({ envoyer: async (m: { a: string[] }) => { h.envoyes.push(m.a); return { ok: true }; } }),
}));
const { lireAvantAnnulation, prevenirAnnulation } = await import('./annulationTacheRepo');

beforeEach(() => { h.ecrits = []; h.envoyes = []; h.envoiMail = true; });
describe('🔴 le mail d’annulation aux collaborateurs', () => {
  it('seul celui qui avait accepté (et n’annule pas lui-même) reçoit le mail ; l’envoi est inscrit au journal de la tâche', async () => {
    const avant = await lireAvantAnnulation(41);
    expect(avant).toMatchObject({ titre: 'Pré-visite', rdv: true, jour: '2026-11-20', heure: '10:00', dureeMinutes: 30 });
    const r = await prevenirAnnulation(41, avant, { id: 2, libelle: 'Arnaud Jorel' });
    expect(h.envoyes).toEqual([['c@sansvisavis.com']]);
    expect(r).toEqual([{ destinataire: 'Cédric JULLIEN', etat: 'envoye', objet: '[Copie interne] Rendez-vous annulé — Pré-visite — 1 rue du Préavis, Puteaux' }]);
    expect(h.ecrits).toHaveLength(1);
    expect(h.ecrits[0].sql).toContain('INSERT INTO gestion_tache_action');
    expect(h.ecrits[0].params.slice(0, 1)).toEqual([41]);
  });
  it('l’envoi des demandes par mail coupé : rien ne part, et c’est dit', async () => {
    h.envoiMail = false;
    const r = await prevenirAnnulation(41, await lireAvantAnnulation(41), { id: 2, libelle: 'Arnaud Jorel' });
    expect(h.envoyes).toEqual([]);
    expect(r.map((x) => x.etat)).toEqual(['desactive']);
  });
});
