import { describe, it, expect, vi, beforeEach } from 'vitest';

const gardeMock = vi.fn();
vi.mock('../../../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => gardeMock(...a) }));
const repo = { lireMessagesDuFil: vi.fn() };
vi.mock('../../../../../../../lib/gestion/carteRepo', () => ({ lireMessagesDuFil: (...a: unknown[]) => repo.lireMessagesDuFil(...a) }));
vi.mock('../../../../../../../lib/gestion/partenaires', () => ({ lirePartenairesInternes: async () => [] }));
vi.mock('../../../../../../../lib/gestion/schema', () => ({ deplacementsDeMailsDisponibles: async () => true }));

import { GET } from './route';

/** LOT 4c — le contenu d'un échange, chargé au dépliage. Le point dur : aucune clé de stockage ne doit sortir d'ici. */
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const MESSAGES = [{
  messageId: 1, sens: 'recu', de: 'locataire@exemple.test', deNom: 'Mme M.', recuLe: '2026-09-20T12:00:00Z',
  objet: 'Fuite', corps: 'Bonjour, fuite dans la salle de bain.', automatique: false,
  pieces: [{ pieceId: 7, nomFichier: 'constat.pdf', typeMime: 'application/pdf', tailleOctets: 120, disponible: true, motifNonStocke: null }],
}];

beforeEach(() => {
  gardeMock.mockReset(); gardeMock.mockResolvedValue(null);
  repo.lireMessagesDuFil.mockReset(); repo.lireMessagesDuFil.mockResolvedValue({ messages: MESSAGES, partis: [] });
});

describe('les messages d’un échange', () => {
  it('exige le droit « gestion »', async () => {
    await GET(new Request('http://local/x'), ctx('5'));
    expect(gardeMock.mock.calls[0][1]).toBe('gestion');
  });

  it('refus → aucune lecture', async () => {
    gardeMock.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await GET(new Request('http://local/x'), ctx('5'))).status).toBe(403);
    expect(repo.lireMessagesDuFil).not.toHaveBeenCalled();
  });

  it('rend les messages, sans cache partagé', async () => {
    const res = await GET(new Request('http://local/x'), ctx('5'));
    expect((await res.json() as { messages: unknown[] }).messages).toHaveLength(1);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('AUCUNE clé de stockage ne franchit la route : une pièce n’est qu’un IDENTIFIANT', async () => {
    const texte = await (await GET(new Request('http://local/x'), ctx('5'))).text();
    expect(texte).toContain('"pieceId":7');
    expect(texte).not.toMatch(/cle_?[Ss]tockage|gestion\/\d{4}\/|https?:\/\//);
  });

  it('annonce les mails SORTIS de cet échange — on ne retire rien en silence', async () => {
    repo.lireMessagesDuFil.mockResolvedValue({
      messages: MESSAGES,
      partis: [{ messageId: 9, objet: 'Fuite', recuLe: '2026-09-21T10:00:00Z', reference: 'GES-2026-000042', evenementId: 42 }],
    });
    const corps = await (await GET(new Request('http://local/x'), ctx('5'))).json() as { partis: { reference: string }[] };
    expect(corps.partis[0].reference).toBe('GES-2026-000042');
  });

  it('échange inconnu → 404 ; identifiant absurde → 400 sans lecture', async () => {
    repo.lireMessagesDuFil.mockResolvedValue(null);
    expect((await GET(new Request('http://local/x'), ctx('5'))).status).toBe(404);
    repo.lireMessagesDuFil.mockClear();
    for (const mauvais of ['abc', '0', '-2']) {
      expect((await GET(new Request('http://local/x'), ctx(mauvais))).status).toBe(400);
    }
    expect(repo.lireMessagesDuFil).not.toHaveBeenCalled();
  });

  it('panne → 503', async () => {
    repo.lireMessagesDuFil.mockRejectedValue(new Error('base indisponible'));
    expect((await GET(new Request('http://local/x'), ctx('5'))).status).toBe(503);
  });
});
