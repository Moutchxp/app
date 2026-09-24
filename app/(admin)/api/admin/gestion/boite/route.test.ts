import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT 5a — LA ROUTE DE LA BOÎTE MAIL. Deux choses comptent ici, et une seule est visible à l'œil :
 *   ① le DROIT est vérifié par le garde du module, relu en base à chaque requête — un collaborateur sans `perm_gestion`
 *      ne lit pas le courrier des locataires, jamais ;
 *   ② le CURSEUR n'est accepté qu'ENTIER. Une moitié de curseur donnerait une page décalée, en silence — le pire des
 *      défauts de pagination, parce qu'il ne se voit pas.
 */

const exigerCompteActif = vi.fn();
const lireBoiteMail = vi.fn();
const comptesBoite = vi.fn();
const lirePartenairesInternes = vi.fn();
const chargerConfigGestion = vi.fn();

vi.mock('../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => exigerCompteActif(...a) }));
vi.mock('../../../../../lib/gestion/boiteRepo', () => ({
  lireBoiteMail: (...a: unknown[]) => lireBoiteMail(...a),
  comptesBoite: (...a: unknown[]) => comptesBoite(...a),
  PAGE_BOITE: 30,
}));
vi.mock('../../../../../lib/gestion/partenaires', () => ({
  lirePartenairesInternes: (...a: unknown[]) => lirePartenairesInternes(...a),
}));
vi.mock('../../../../../lib/gestion/config', () => ({
  chargerConfigGestion: (...a: unknown[]) => chargerConfigGestion(...a),
}));

import { GET } from './route';

const req = (qs = '') => new Request(`http://local/api/admin/gestion/boite${qs}`);
const page = { lignes: [], suivant: null, total: 0 };

beforeEach(() => {
  exigerCompteActif.mockReset().mockResolvedValue(null); // null = autorisé
  lireBoiteMail.mockReset().mockResolvedValue(page);
  comptesBoite.mockReset().mockResolvedValue({ lisibles: 4944, automatiques: 12262 });
  lirePartenairesInternes.mockReset().mockResolvedValue([]);
  // 45 et non 30 : une valeur DIFFÉRENTE du repli du code, sinon le test passerait même si la base n'était pas lue.
  chargerConfigGestion.mockReset().mockResolvedValue({ fenetreActiviteJours: 45 });
});

describe('① le droit', () => {
  it('passe par le garde du module « gestion », et pas par un autre', async () => {
    await GET(req());
    expect(exigerCompteActif).toHaveBeenCalledWith(expect.anything(), 'gestion');
  });

  it('SANS le droit → la réponse du garde est rendue telle quelle, et RIEN n’est lu', async () => {
    exigerCompteActif.mockResolvedValue(new Response('non', { status: 403 }));
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(lireBoiteMail).not.toHaveBeenCalled();
  });
});

describe('② le curseur', () => {
  it('sans curseur → première page', async () => {
    await GET(req());
    expect(lireBoiteMail).toHaveBeenCalledWith(null, [], 30, expect.objectContaining({ inclureAutomatiques: false }));
  });

  it('curseur complet → transmis tel quel', async () => {
    await GET(req('?depuis=2026-08-01T09:00:00Z&avant=412'));
    expect(lireBoiteMail).toHaveBeenCalledWith(
      { dernierLe: '2026-08-01T09:00:00Z', filId: '412' }, [], 30, expect.objectContaining({ inclureAutomatiques: false }));
  });

  it('🔴 curseur À MOITIÉ fourni → 422, plutôt qu’une page décalée en silence', async () => {
    for (const qs of ['?depuis=2026-08-01T09:00:00Z', '?avant=412']) {
      lireBoiteMail.mockClear();
      const res = await GET(req(qs));
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ erreur: expect.stringContaining('Curseur incomplet') });
      expect(lireBoiteMail).not.toHaveBeenCalled();
    }
  });

  it('un identifiant qui n’est pas un entier est ignoré → on repart de la première page', async () => {
    await GET(req('?depuis=2026-08-01T09:00:00Z&avant=zéro'));
    expect(lireBoiteMail).toHaveBeenCalledWith(null, [], 30, expect.anything());
  });
});

describe('le courrier automatique', () => {
  it('éteint par défaut', async () => {
    await GET(req());
    expect(lireBoiteMail).toHaveBeenCalledWith(null, [], 30, expect.objectContaining({ inclureAutomatiques: false }));
  });

  it('allumé sur demande explicite', async () => {
    await GET(req('?auto=1'));
    expect(lireBoiteMail).toHaveBeenCalledWith(null, [], 30, expect.objectContaining({ inclureAutomatiques: true }));
  });
});

/**
 * LOT 5-FUSION — L'ÉTIQUETTE. Elle ne fait que RESTREINDRE la même lecture : la route n'a gagné ni table, ni écriture,
 * ni second chemin. Ce qui compte ici est qu'ABSENT et INCONNU ne se confondent pas — sans quoi un vieux lien collé
 * changerait ce que la boîte montre, sans prévenir.
 */
describe('l’étiquette', () => {
  it('ABSENTE → la boîte entière, exactement comme avant ce lot', async () => {
    await GET(req());
    expect(lireBoiteMail).toHaveBeenCalledWith(null, [], 30,
      expect.objectContaining({ etiquette: { sorte: 'reception', evenementId: null } }));
  });

  it('une étiquette fixe est transmise telle quelle', async () => {
    await GET(req('?etiquette=envoyes'));
    expect(lireBoiteMail).toHaveBeenCalledWith(null, [], 30,
      expect.objectContaining({ etiquette: { sorte: 'envoyes', evenementId: null } }));
  });

  it('une CARTE porte son identifiant', async () => {
    await GET(req('?etiquette=carte-77'));
    expect(lireBoiteMail).toHaveBeenCalledWith(null, [], 30,
      expect.objectContaining({ etiquette: { sorte: 'carte', evenementId: 77 } }));
  });

  it('🔴 une étiquette ABÎMÉE ne rend pas une erreur : elle retombe sur le défaut, et l’écran reste utilisable', async () => {
    for (const qs of ['?etiquette=nimportequoi', '?etiquette=carte-zéro', '?etiquette=']) {
      lireBoiteMail.mockClear();
      const res = await GET(req(qs));
      expect(res.status).toBe(200);
      expect(lireBoiteMail).toHaveBeenCalledWith(null, [], 30,
        expect.objectContaining({ etiquette: { sorte: 'a_classer', evenementId: null } }));
    }
  });

  it('« À classer » reçoit la fenêtre d’activité LUE EN BASE, jamais une valeur en dur du code', async () => {
    await GET(req('?etiquette=a_classer'));
    expect(chargerConfigGestion).toHaveBeenCalled();
    expect(lireBoiteMail).toHaveBeenCalledWith(null, [], 30, expect.objectContaining({ fenetreJours: 45 }));
  });
});

describe('ce que la réponse porte', () => {
  it('les deux comptes à la PREMIÈRE page — l’écran doit pouvoir dire ce qu’il ne montre pas', async () => {
    const res = await GET(req());
    expect(await res.json()).toMatchObject({ comptes: { lisibles: 4944, automatiques: 12262 } });
  });

  it('…et PAS aux suivantes : ils ne bougent pas entre deux pages', async () => {
    const res = await GET(req('?depuis=2026-08-01T09:00:00Z&avant=412'));
    expect((await res.json()).comptes).toBeNull();
    expect(comptesBoite).not.toHaveBeenCalled();
  });

  it('jamais de cache : cette réponse contient des extraits de mails de locataires', async () => {
    const res = await GET(req());
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('une panne de base est DITE — une liste vide ferait croire à une boîte vide', async () => {
    lireBoiteMail.mockRejectedValue(new Error('base injoignable'));
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ erreur: expect.stringContaining('n’a pas répondu') });
  });
});
