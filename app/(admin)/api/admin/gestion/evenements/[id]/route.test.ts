import { describe, it, expect, vi, beforeEach } from 'vitest';

const gardeMock = vi.fn();
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => gardeMock(...a) }));
const repo = { lireCarte: vi.fn() };
vi.mock('../../../../../../lib/gestion/carteRepo', () => ({ lireCarte: (...a: unknown[]) => repo.lireCarte(...a) }));
const gestes = { modifierEvenement: vi.fn(), changerEtatEvenement: vi.fn() };
vi.mock('../../../../../../lib/gestion/gestes', async (importOriginal) => {
  const vrai = await importOriginal<typeof import('../../../../../../lib/gestion/gestes')>();
  return {
    estEtat: vrai.estEtat, // la VRAIE validation d'état : c'est elle qu'on veut éprouver ici
    modifierEvenement: (...a: unknown[]) => gestes.modifierEvenement(...a),
    changerEtatEvenement: (...a: unknown[]) => gestes.changerEtatEvenement(...a),
  };
});
vi.mock('../../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 1, libelle: 'arno' }) }));

import { GET, PATCH } from './route';

/** LOT 4c — le détail d'une carte, et ses corrections. Contrat de la route : qui passe, quoi est transmis, quoi est rendu. */
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (corps?: unknown) => new Request('http://local/x', {
  method: 'PATCH', ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
});
const CARTE = { evenementId: 9, reference: 'GES-2026-000009', objet: 'Fuite', fils: [] };

beforeEach(() => {
  gardeMock.mockReset(); gardeMock.mockResolvedValue(null);
  repo.lireCarte.mockReset(); repo.lireCarte.mockResolvedValue(CARTE);
  gestes.modifierEvenement.mockReset(); gestes.modifierEvenement.mockResolvedValue({ ok: true, evenementId: 9 });
  gestes.changerEtatEvenement.mockReset(); gestes.changerEtatEvenement.mockResolvedValue({ ok: true, evenementId: 9 });
});

describe('GET — le détail, servi seulement à qui a le droit', () => {
  it('exige le droit « gestion » : le détail contient le texte de mails de locataires', async () => {
    await GET(new Request('http://local/x'), ctx('9'));
    expect(gardeMock.mock.calls[0][1]).toBe('gestion');
  });

  it('refus → aucune lecture en base', async () => {
    gardeMock.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await GET(new Request('http://local/x'), ctx('9'))).status).toBe(403);
    expect(repo.lireCarte).not.toHaveBeenCalled();
  });

  it('rend la carte, et INTERDIT toute mise en cache partagée', async () => {
    const res = await GET(new Request('http://local/x'), ctx('9'));
    expect(await res.json()).toEqual(CARTE);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('carte inconnue → 404 ; identifiant absurde → 400 sans toucher la base', async () => {
    repo.lireCarte.mockResolvedValue(null);
    expect((await GET(new Request('http://local/x'), ctx('9'))).status).toBe(404);
    repo.lireCarte.mockClear();
    expect((await GET(new Request('http://local/x'), ctx('abc'))).status).toBe(400);
    expect(repo.lireCarte).not.toHaveBeenCalled();
  });

  it('panne → 503, jamais une carte vide qui ferait croire à une carte sans échange', async () => {
    repo.lireCarte.mockRejectedValue(new Error('base indisponible'));
    expect((await GET(new Request('http://local/x'), ctx('9'))).status).toBe(503);
  });
});

describe('PATCH — changer l’état', () => {
  it('transmet l’état et l’auteur', async () => {
    const res = await PATCH(req({ etat: 'traite' }), ctx('9'));
    expect(gestes.changerEtatEvenement.mock.calls[0]).toEqual([9, 'traite', { id: 1, libelle: 'arno' }]);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('un état inventé est REFUSÉ à la porte — rien ne descend vers la base', async () => {
    for (const faux of ['archive', 'TRAITE', '', 42]) {
      const res = await PATCH(req({ etat: faux }), ctx('9'));
      expect(res.status).toBe(400);
    }
    expect(gestes.changerEtatEvenement).not.toHaveBeenCalled();
  });

  it('refus métier (déjà dans cet état) → 409 avec le motif lisible', async () => {
    gestes.changerEtatEvenement.mockResolvedValue({ ok: false, motif: 'Cet événement est déjà « traite ».' });
    const res = await PATCH(req({ etat: 'traite' }), ctx('9'));
    expect(res.status).toBe(409);
    expect((await res.json() as { erreur: string }).erreur).toContain('déjà');
  });
});

describe('PATCH — corriger ce que le pré-remplissage n’a pu que proposer', () => {
  it('transmet les champs donnés, et EUX SEULS (un champ absent n’est pas un champ vidé)', async () => {
    await PATCH(req({ adresseLibre: '28 avenue Marceau' }), ctx('9'));
    const champs = gestes.modifierEvenement.mock.calls[0][1] as Record<string, unknown>;
    expect(champs.adresseLibre).toBe('28 avenue Marceau');
    expect(champs.objet).toBeUndefined();
    expect(gestes.changerEtatEvenement).not.toHaveBeenCalled();
  });

  it('vider explicitement un champ est transmis comme tel — effacer une donnée fausse est légitime', async () => {
    await PATCH(req({ adresseLibre: '' }), ctx('9'));
    expect((gestes.modifierEvenement.mock.calls[0][1] as Record<string, unknown>).adresseLibre).toBe('');
  });

  it('corps illisible → 422, sans rien écrire', async () => {
    const res = await PATCH(new Request('http://local/x', { method: 'PATCH', body: 'pas du json' }), ctx('9'));
    expect(res.status).toBe(422);
    expect(gestes.modifierEvenement).not.toHaveBeenCalled();
  });

  it('panne → 503, jamais un faux succès', async () => {
    gestes.modifierEvenement.mockRejectedValue(new Error('base indisponible'));
    expect((await PATCH(req({ objet: 'x' }), ctx('9'))).status).toBe(503);
  });

  it('la garde protège aussi l’écriture', async () => {
    gardeMock.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await PATCH(req({ objet: 'x' }), ctx('9'))).status).toBe(403);
    expect(gestes.modifierEvenement).not.toHaveBeenCalled();
  });
});
