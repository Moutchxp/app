import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * LOT TACHES-ACCEPTATION — LE DÉPÔT, base simulée : la demande posée (acceptée d'office ou en attente, jeton jamais
 * gardé en clair), et le mail : RIEN tant que le réglage est désactivé ; préparé par le transport FACTICE sinon.
 */
let envoiActive = false;
let appels: { sql: string; params: unknown[] }[] = [];
const queryMock = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ');
  appels.push({ sql: s, params });
  if (s.includes('FROM gestion_tache_reglage')) return { rows: [{ e: envoiActive, d: 7, le: new Date(), par: 'x' }] };
  if (s.includes('SELECT identifiant AS e FROM admin_utilisateur')) return { rows: [{ e: 'claire@criterimmo.fr' }] };
  if (s.includes('INSERT INTO gestion_tache_demande')) return { rows: [{ id: 41 }] };
  if (s.includes('FROM gestion_tache_demande d JOIN gestion_tache t') && s.includes('WHERE d.id = $1')) {
    return { rows: [{ tache_id: 7, destinataire_libelle: 'Claire', destinataire_email: 'claire@criterimmo.fr', demandeur_libelle: 'Arnaud Jorel',
      expire_le: new Date('2026-10-20T13:00:00Z'), objet: 'Visite', jour: '2026-10-14', heure: '09:30', note: 'Clés chez le gardien',
      adresse: '7 avenue de l’Union', commune: 'ASNIERES' }] };
  }
  return { rows: [], rowCount: 1 };
});
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...(a as [string, unknown[]])),
  withTransaction: async (f: (q: unknown) => unknown) => f((...a: unknown[]) => queryMock(...(a as [string, unknown[]]))),
}));
vi.mock('./config', () => ({ chargerConfigGestion: async () => ({ adresseGestion: 'gestion@criterimmo.fr' }) }));

const { poserDemande, envoyerDemande, empreinteJeton } = await import('./acceptationRepo');
const { ENVOIS_FACTICES, transportParDefaut, transportFactice } = await import('./envoiDemandeTache');
const q = (...a: unknown[]) => queryMock(...(a as [string, unknown[]]));
const ARNO = { id: 2, libelle: 'a.jorel@sansvisavis.com' };

beforeEach(() => { appels = []; ENVOIS_FACTICES.length = 0; envoiActive = false; process.env.SITE_URL = 'https://app.test'; });

describe('🔴 la demande', () => {
  it('confiée à moi : acceptée d’office, aucun jeton', async () => {
    const d = await poserDemande(q as never, { tacheId: 7, confieeA: 2, confieeLibelle: 'Arnaud Jorel', auteur: ARNO, nom: 'Arnaud Jorel' });
    expect(d).toEqual({ demandeId: 41, statut: 'acceptee', jeton: null });
    expect(appels.find((a) => a.sql.includes('INSERT INTO gestion_tache_demande'))?.sql).toContain("'acceptee', true");
  });
  it('confiée à un autre : en attente ; l’ancienne demande est remplacée ; le jeton n’est stocké qu’en empreinte', async () => {
    const d = await poserDemande(q as never, { tacheId: 7, confieeA: 3, confieeLibelle: 'Claire', auteur: ARNO, nom: 'Arnaud Jorel' });
    expect(d.statut).toBe('en_attente');
    expect(d.jeton).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(appels[0].sql).toContain("SET statut = 'remplacee'");
    const ins = appels.find((a) => a.sql.includes('INSERT INTO gestion_tache_demande'));
    expect(ins?.params).toContain(empreinteJeton(d.jeton!));
    expect(ins?.params).not.toContain(d.jeton);
  });
});

describe('🔴 le mail : aucun vrai envoi', () => {
  it('sous les tests, le transport par défaut est FACTICE', () => {
    expect(transportParDefaut()).toBe(transportFactice);
  });
  it('réglage désactivé (défaut) : rien n’est préparé ni envoyé, la demande dit « désactivé »', async () => {
    expect(await envoyerDemande(41, 'JETON')).toBe('desactive');
    expect(ENVOIS_FACTICES).toEqual([]);
    expect(appels.find((a) => a.sql.includes('SET mail_etat'))?.params.slice(0, 2)).toEqual([41, 'desactive']);
  });
  it('réglage activé : le mail est PRÉPARÉ par le transport factice, à l’adresse du Workspace, avec ses deux liens', async () => {
    envoiActive = true;
    expect(await envoyerDemande(41, 'JETON')).toBe('factice');
    const m = ENVOIS_FACTICES[0];
    expect(m.de).toBe('gestion@criterimmo.fr');
    expect(m.a).toEqual(['claire@criterimmo.fr']);
    expect(m.objet).toMatch(/^Tâche à accepter — 7 avenue de l’Union — Visite — .* · 9 h 30$/);
    expect(m.messageId).toMatch(/^<tache-acceptation\.[0-9a-f]+@criterimmo\.fr>$/);
    expect(m.corps).toContain('Accepter : https://app.test/admin/taches?j=JETON&d=accepter');
    expect(m.corps).toContain('Clés chez le gardien');
  });
});
