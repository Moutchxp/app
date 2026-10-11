import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ══ 🔴🔴 LOT FORMULE-CONTACT-PRIME-ET-PUCES-COLOREES — LA FAMILLE DES ADRESSES, LUE PAR LES PORTES EXISTANTES ═══════
 * Doublures de chaque porte (la fiche bien, l'annuaire, les cartes, les syndics et carnets, les contacts externes) :
 * on éprouve l'ORDRE (le bien ouvert d'abord, puis propriétaire, locataire, ancien locataire, rattaché, syndic,
 * immeuble, externe) et l'inconnue. Lecture seule : le module n'importe aucune fonction d'écriture.
 */
const query = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => query(...a) }));
vi.mock('./coordonneeVivante', () => ({ conditionCoordonneeVivante: async () => '' }));
const ecrireDepuisLeBien = vi.fn();
vi.mock('./suggestionsBienRepo', () => ({ ecrireDepuisLeBien: (...a: unknown[]) => ecrireDepuisLeBien(...a) }));
const biensEtCotesDesContacts = vi.fn();
vi.mock('./partieCategorieRepo', () => ({ biensEtCotesDesContacts: (...a: unknown[]) => biensEtCotesDesContacts(...a) }));
const chargerAdressesExternes = vi.fn();
vi.mock('./envoiPartiesRepo', () => ({ chargerAdressesExternes: (...a: unknown[]) => chargerAdressesExternes(...a) }));
const lireContactExterne = vi.fn();
vi.mock('./contactExterneRepo', () => ({ lireContactExterne: (...a: unknown[]) => lireContactExterne(...a) }));

const { famillesDesAdresses } = await import('./famillesAdressesRepo');

beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [
    { adresse: 'proprio@x.fr', sujet: 'proprietaire', nom: 'DUPONT Jean', en_place: false },
    { adresse: 'loc@x.fr', sujet: 'locataire', nom: 'ROI Léa', en_place: true },
    { adresse: 'ancien@x.fr', sujet: 'locataire', nom: 'HIRSCH Thibaut', en_place: false },
    { adresse: 'double@x.fr', sujet: 'locataire', nom: 'ROI Léa', en_place: true },
    { adresse: 'double@x.fr', sujet: 'proprietaire', nom: 'DUPONT Jean', en_place: false },
  ] });
  ecrireDepuisLeBien.mockReset().mockResolvedValue({ groupes: [
    { cle: 'immeuble', titre: 'I', lignes: [{ adresse: 'Double@x.fr', nom: 'Gardienne', role: 'Gardien', ton: 'immeuble', propre: true, civilite: null, nomFamille: null }] },
  ] });
  biensEtCotesDesContacts.mockReset().mockResolvedValue(new Map([['garant@x.fr', [{ lotCle: '219', cote: 'locataire' }]]]));
  chargerAdressesExternes.mockReset().mockResolvedValue([
    { email: 'arnaud.jorel@gmail.com', sorte: 'syndic', syndicId: 2, syndicContactId: null, coproprieteContactId: null, libelle: 'e-mail du syndic TEST ARNAUD' },
    { email: 'arnaud.jorel@gmail.com', sorte: 'syndic_contact', syndicId: 2, syndicContactId: 51, coproprieteContactId: null, libelle: 'contact du syndic TEST ARNAUD' },
    { email: 'cs@x.fr', sorte: 'immeuble_contact', syndicId: null, syndicContactId: null, coproprieteContactId: 4, libelle: "contact de l'immeuble 25 rue Edith Cavell" },
  ]);
  lireContactExterne.mockReset().mockImplementation(async (a: string) => (a === 'artisan@x.fr' ? { email: a, nom: 'Plomberie Martin', telephone: null, type: 'plombier' } : null));
});

const TOUTES = ['proprio@x.fr', 'LOC@x.fr', 'ancien@x.fr', 'garant@x.fr', 'arnaud.jorel@gmail.com', 'cs@x.fr', 'artisan@x.fr', 'z@ailleurs.fr', 'double@x.fr'];

describe('famillesDesAdresses', () => {
  it('chaque famille, propre ou rattachée, et l’inconnue (`null`) — sans bien ouvert', async () => {
    const f = await famillesDesAdresses(TOUTES, null);
    expect(Object.fromEntries(Object.entries(f).map(([a, x]) => [a, x === null ? null : `${x.ton}${x.propre ? '' : ' (rattaché)'}`]))).toEqual({
      'proprio@x.fr': 'proprietaire', 'loc@x.fr': 'locataire', 'ancien@x.fr': 'ancien_locataire', 'garant@x.fr': 'locataire (rattaché)',
      'arnaud.jorel@gmail.com': 'syndic', 'cs@x.fr': 'immeuble', 'artisan@x.fr': 'neutre', 'z@ailleurs.fr': null,
      'double@x.fr': 'proprietaire',                                        // propriétaire avant locataire
    });
    expect(f['arnaud.jorel@gmail.com']?.role).toBe('Contact du syndic · TEST ARNAUD');   // le contact nommé d'abord
    expect(f['artisan@x.fr']).toMatchObject({ nom: 'Plomberie Martin', role: 'Contact externe · plombier' });
    expect(ecrireDepuisLeBien).not.toHaveBeenCalled();
  });
  it('🔴 depuis un bien : la famille la PLUS PROCHE du bien ouvert l’emporte', async () => {
    const f = await famillesDesAdresses(['double@x.fr', 'proprio@x.fr'], 176);
    expect(ecrireDepuisLeBien).toHaveBeenCalledWith(176);
    expect(f['double@x.fr']).toEqual({ ton: 'immeuble', propre: true, nom: 'Gardienne', role: 'Gardien' });
    expect(f['proprio@x.fr']?.ton).toBe('proprietaire');
  });
  it('une carte d’ANCIEN locataire : violet, en contour ; un côté propriétaire l’emporte sur les autres', async () => {
    biensEtCotesDesContacts.mockResolvedValue(new Map([
      ['vieux@x.fr', [{ lotCle: '1', cote: 'ancien_locataire' }]],
      ['mixte@x.fr', [{ lotCle: '1', cote: 'locataire' }, { lotCle: '2', cote: 'proprietaire' }]],
    ]));
    const f = await famillesDesAdresses(['vieux@x.fr', 'mixte@x.fr'], null);
    expect(f['vieux@x.fr']).toEqual({ ton: 'ancien_locataire', propre: false, nom: null, role: 'Contact d’un ancien locataire' });
    expect(f['mixte@x.fr']?.ton).toBe('proprietaire');
  });
  it('lecture BORNÉE aux adresses demandées (paramètre lié), rien sans adresse', async () => {
    await famillesDesAdresses(['proprio@x.fr'], null);
    expect(query.mock.calls[0][1]).toEqual([['proprio@x.fr']]);
    expect(String(query.mock.calls[0][0]).replace(/\s+/g, ' ')).toContain("c.sorte = 'email' AND c.absent_le IS NULL");
    query.mockClear();
    expect(await famillesDesAdresses(['', 'pas-une-adresse'], null)).toEqual({});
    expect(query).not.toHaveBeenCalled();
  });
});
