import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT 5c — LA ROUTE DE RECHERCHE. Ce qu'elle doit garantir, et qui ne se voit pas à l'écran :
 *   ① le DROIT, relu en base à chaque requête — chercher, c'est lire le courrier des locataires ;
 *   ② une recherche VIDE ne lance AUCUNE requête (un champ effacé ne doit pas balayer 56 000 messages) ;
 *   ③ une date malformée n'atteint jamais la base.
 */

const exigerCompteActif = vi.fn();
const chercherDansLeCourrier = vi.fn();
const lirePartenairesInternes = vi.fn();

vi.mock('../../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => exigerCompteActif(...a) }));
vi.mock('../../../../../../lib/gestion/rechercheBoite', async () => {
  const vrai = await vi.importActual<typeof import('../../../../../../lib/gestion/rechercheBoite')>('../../../../../../lib/gestion/rechercheBoite');
  return {
    chercherDansLeCourrier: (...a: unknown[]) => chercherDansLeCourrier(...a),
    rechercheUtile: vrai.rechercheUtile, // la VRAIE règle : c'est elle qu'on veut éprouver ici
    PAGE_RECHERCHE: 30,
  };
});
vi.mock('../../../../../../lib/gestion/partenaires', () => ({
  lirePartenairesInternes: (...a: unknown[]) => lirePartenairesInternes(...a),
}));

import { GET } from './route';

const req = (qs = '') => new Request(`http://local/api/admin/gestion/boite/recherche${qs}`);
const page = { lignes: [], suivant: null, total: null, pleinTexte: true, automatiquesMasques: null };

beforeEach(() => {
  exigerCompteActif.mockReset().mockResolvedValue(null);
  chercherDansLeCourrier.mockReset().mockResolvedValue(page);
  lirePartenairesInternes.mockReset().mockResolvedValue([]);
});

describe('① le droit', () => {
  it('passe par le garde du module « gestion »', async () => {
    await GET(req('?q=fuite'));
    expect(exigerCompteActif).toHaveBeenCalledWith(expect.anything(), 'gestion');
  });

  it('SANS le droit → refus rendu tel quel, et RIEN n’est cherché', async () => {
    exigerCompteActif.mockResolvedValue(new Response('non', { status: 403 }));
    const res = await GET(req('?q=fuite'));
    expect(res.status).toBe(403);
    expect(chercherDansLeCourrier).not.toHaveBeenCalled();
  });
});

describe('② une recherche vide ne coûte rien', () => {
  it('aucun critère → page vide, et AUCUNE requête', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ lignes: [], vide: true });
    expect(chercherDansLeCourrier).not.toHaveBeenCalled();
  });

  it('une seule lettre ne déclenche rien non plus', async () => {
    await GET(req('?q=a'));
    expect(chercherDansLeCourrier).not.toHaveBeenCalled();
  });

  it('un FILTRE seul suffit, lui, à chercher', async () => {
    await GET(req('?de=martin'));
    expect(chercherDansLeCourrier).toHaveBeenCalled();
  });
});

describe('③ ce qui atteint la base', () => {
  it('les critères sont transmis tels quels', async () => {
    await GET(req('?q=fuite%20marceau&du=2026-01-01&au=2026-03-31&de=martin&auto=1'));
    expect(chercherDansLeCourrier).toHaveBeenCalledWith(
      { saisie: 'fuite marceau', du: '2026-01-01', au: '2026-03-31', expediteur: 'martin', inclureAutomatiques: true },
      null, [], 30);
  });

  it('🔴 une date MALFORMÉE est écartée, jamais transmise', async () => {
    await GET(req('?q=fuite&du=hier&au=2026-13-99'));
    expect(chercherDansLeCourrier).toHaveBeenCalledWith(
      expect.objectContaining({ du: null, au: null }), null, [], 30);
  });

  it('la saisie est BORNÉE : une requête démesurée ne passe pas', async () => {
    await GET(req(`?q=${'a'.repeat(500)}`));
    const saisie = (chercherDansLeCourrier.mock.calls[0][0] as { saisie: string }).saisie;
    expect(saisie).toHaveLength(200);
  });

  it('le courrier automatique est éteint par défaut', async () => {
    await GET(req('?q=fuite'));
    expect(chercherDansLeCourrier).toHaveBeenCalledWith(
      expect.objectContaining({ inclureAutomatiques: false }), null, [], 30);
  });

  it('curseur complet → transmis ; à moitié fourni → 422 plutôt qu’une page décalée en silence', async () => {
    await GET(req('?q=fuite&depuis=2026-08-01T09:00:00Z&avant=412'));
    expect(chercherDansLeCourrier).toHaveBeenCalledWith(
      expect.anything(), { dernierLe: '2026-08-01T09:00:00Z', filId: '412' }, [], 30);
    chercherDansLeCourrier.mockClear();
    const res = await GET(req('?q=fuite&depuis=2026-08-01T09:00:00Z'));
    expect(res.status).toBe(422);
    expect(chercherDansLeCourrier).not.toHaveBeenCalled();
  });
});

describe('ce que la réponse porte', () => {
  it('jamais de cache : ce sont des extraits de mails de locataires', async () => {
    expect((await GET(req('?q=fuite'))).headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('une panne est DITE — une liste vide ferait croire qu’on n’a rien trouvé', async () => {
    chercherDansLeCourrier.mockRejectedValue(new Error('base injoignable'));
    const res = await GET(req('?q=fuite'));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ erreur: expect.stringContaining('n’a pas répondu') });
  });
});
