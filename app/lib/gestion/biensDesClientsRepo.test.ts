import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT NOUVEAU-MESSAGE-CONTEXTE-BIEN-PAR-CLIENT — les biens d'une adresse cliente, par la recherche EXISTANTE
 * (`chercherBiens`) : seules les correspondances PAR L'E-MAIL comptent ; rôle propriétaire / locataire en place /
 * ancien locataire.
 */
const chercherBiens = vi.fn();
vi.mock('./rechercheBienRepo', () => ({ chercherBiens: (...a: unknown[]) => chercherBiens(...a) }));
const { biensDesClients } = await import('./biensDesClientsRepo');

const ligne = (cle: string, raisons: Array<{ sorte: string; detail: string }>, locataires: string[] = []) => ({
  cle, lotId: Number(cle), libelle: `${cle} rue X, 75000 PARIS — lot ${cle}`, adresse: '', adresseVoie: null, commune: null,
  nature: 'Appartement', typeBien: 'Type 2', raisons,
  parties: locataires.map((e) => ({ role: 'locataire', cle: 'L', nom: 'ROI', emails: [{ valeur: e }], telephones: [] })),
});

beforeEach(() => {
  chercherBiens.mockReset().mockImplementation(async (a: string) => ({ disponible: true, tronque: false, lignes: a === 'p@x.fr'
    ? [ligne('1', [{ sorte: 'email_proprietaire', detail: 'DUPONT Jean' }]), ligne('2', [{ sorte: 'email_proprietaire', detail: 'DUPONT Jean' }]),
      ligne('9', [{ sorte: 'proprietaire', detail: 'P X' }])]                                   // un NOM qui ressemble : ignoré
    : a === 'l@x.fr'
      ? [ligne('3', [{ sorte: 'email_locataire', detail: 'ROI Léa' }], ['l@x.fr']), ligne('4', [{ sorte: 'email_locataire', detail: 'ROI Léa' }])]
      : [] }));
});

describe('biensDesClients', () => {
  it('propriétaire de 2 biens ; locataire en place d’un bien et ANCIEN d’un autre ; une adresse inconnue : []', async () => {
    const r = await biensDesClients(['P@x.fr', 'l@x.fr', 'z@x.fr', 'pas-une-adresse']);
    expect(Object.keys(r)).toEqual(['p@x.fr', 'l@x.fr', 'z@x.fr']);
    expect(r['p@x.fr'].map((b) => [b.cle, b.role, b.lotId, b.nom, b.categorie])).toEqual([
      ['1', 'proprietaire', 1, 'DUPONT Jean', 'logement'], ['2', 'proprietaire', 2, 'DUPONT Jean', 'logement']]);
    expect(r['l@x.fr'].map((b) => [b.cle, b.role])).toEqual([['3', 'locataire'], ['4', 'ancien_locataire']]);
    expect(r['z@x.fr']).toEqual([]);
    expect(chercherBiens).toHaveBeenCalledWith('p@x.fr', { limite: 50 });
  });
});
