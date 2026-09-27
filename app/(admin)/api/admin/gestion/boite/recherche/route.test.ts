import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT 5c — LA ROUTE DE RECHERCHE. Ce qu'elle doit garantir, et qui ne se voit pas à l'écran :
 *   ① le DROIT, relu en base à chaque requête — chercher, c'est lire le courrier des locataires ;
 *   ② une recherche VIDE ne lance AUCUNE requête (un champ effacé ne doit pas balayer 56 000 messages) ;
 *   ③ une date malformée n'atteint jamais la base.
 */

const exigerCompteActif = vi.fn();
const chercherDansLeCourrier = vi.fn();
const chercherDansLesBrouillons = vi.fn();
const lirePartenairesInternes = vi.fn();

vi.mock('../../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => exigerCompteActif(...a) }));
vi.mock('../../../../../../lib/gestion/rechercheBoite', async () => {
  const vrai = await vi.importActual<typeof import('../../../../../../lib/gestion/rechercheBoite')>('../../../../../../lib/gestion/rechercheBoite');
  return {
    chercherDansLeCourrier: (...a: unknown[]) => chercherDansLeCourrier(...a),
    // LOT RECHERCHE-AVANCEE — les brouillons sont cherchés à part ; ici on les neutralise pour n'éprouver que la
    //   route. Leur propre comportement est éprouvé dans `rechercheBoite.test.ts`.
    chercherDansLesBrouillons: (...a: unknown[]) => chercherDansLesBrouillons(...a),
    rechercheUtile: vrai.rechercheUtile, // la VRAIE règle : c'est elle qu'on veut éprouver ici
    PAGE_RECHERCHE: 30,
  };
});
vi.mock('../../../../../../lib/gestion/partenaires', () => ({
  lirePartenairesInternes: (...a: unknown[]) => lirePartenairesInternes(...a),
}));

import { GET, listes, piece } from './route';

const req = (qs = '') => new Request(`http://local/api/admin/gestion/boite/recherche${qs}`);
const page = { lignes: [], suivant: null, total: null, pleinTexte: true, automatiquesMasques: null };
const SANS_BROUILLON = { lignes: [], tronque: false };

beforeEach(() => {
  exigerCompteActif.mockReset().mockResolvedValue(null);
  chercherDansLeCourrier.mockReset().mockResolvedValue(page);
  chercherDansLesBrouillons.mockReset().mockResolvedValue(SANS_BROUILLON);
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
      // LOT RECHERCHE-AVANCEE — trois champs de plus. `listes: undefined` est PORTEUR DE SENS : le panneau n'a rien
      //   dit, donc le critère se comporte comme avant ce lot (cf. `automatiquesInclus`).
      {
        saisie: 'fuite marceau', sansMots: '', du: '2026-01-01', au: '2026-03-31', expediteur: 'martin',
        piece: 'indifferent', listes: undefined, inclureAutomatiques: true,
      },
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

describe('LOT RECHERCHE-AVANCEE — ce que la route accepte du panneau', () => {
  /**
   * 🔴 ABSENT ≠ VIDE, et c'est toute la subtilité. Sans le paramètre, le critère doit se comporter comme AVANT ce
   * lot (les liens déjà envoyés, les appels d'avant) ; avec un paramètre VIDE, il doit dire « nulle part » et rendre
   * zéro résultat. Confondre les deux ferait, au choix, casser d'anciens liens ou ignorer une demande explicite.
   */
  it('« listes » absent ⇒ rien n’est imposé ; « listes= » vide ⇒ nulle part', () => {
    expect(listes(null)).toBeUndefined();
    expect(listes('')).toEqual([]);
  });

  it('une liste inconnue est IGNORÉE, jamais rejetée — un vieux lien doit rendre des résultats, pas une erreur', () => {
    expect(listes('reception,chaussette,envoyes')).toEqual(['reception', 'envoyes']);
    expect(listes('reception,reception')).toEqual(['reception']); // et jamais deux fois la même
  });

  it('le filtre de pièce jointe ne connaît que trois réponses ; tout le reste est « indifférent »', () => {
    expect(piece('avec')).toBe('avec');
    expect(piece('sans')).toBe('sans');
    expect(piece(null)).toBe('indifferent');
    expect(piece('peut-être')).toBe('indifferent');
  });

  it('les réglages du panneau atteignent la recherche', async () => {
    await GET(req('?q=fuite&sans=facture&pj=avec&listes=reception,envoyes'));
    expect(chercherDansLeCourrier).toHaveBeenCalledWith(
      expect.objectContaining({
        saisie: 'fuite', sansMots: 'facture', piece: 'avec', listes: ['reception', 'envoyes'],
      }),
      null, [], 30);
  });

  /** Les brouillons sont cherchés à part, et SEULEMENT à la première page : sinon ils s'empileraient à chaque « voir plus ». */
  it('les brouillons ne sont cherchés qu’à la première page', async () => {
    await GET(req('?q=fuite'));
    expect(chercherDansLesBrouillons).toHaveBeenCalledTimes(1);
    chercherDansLesBrouillons.mockClear();
    await GET(req('?q=fuite&depuis=2026-01-01T00:00:00Z&avant=12'));
    expect(chercherDansLesBrouillons).not.toHaveBeenCalled();
  });
});
