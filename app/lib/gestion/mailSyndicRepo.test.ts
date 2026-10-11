import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ══ 🔴🔴 LOT MAIL-SYNDIC-PREREMPLI — CE QUE LE SERVEUR LIT AU CLIC ═══════════════════════════════════════════════════
 * Doublures des trois lectures (fiche du syndic, fiche du bien, carnet de l'immeuble) : on éprouve ce qu'en tire
 * `preparerMailSyndic` — la civilité du destinataire, la résidence, les propriétaires, les locataires en place.
 * Aucune écriture n'est possible : le module n'importe aucune fonction d'écriture.
 */
const ficheSyndic = vi.fn();
const ficheLot = vi.fn();
const contactsDeLImmeuble = vi.fn();
vi.mock('./syndicRepo', () => ({ ficheSyndic: (...a: unknown[]) => ficheSyndic(...a) }));
vi.mock('./annuaireRepo', () => ({ ficheLot: (...a: unknown[]) => ficheLot(...a) }));
vi.mock('./contactsImmeubleRepo', () => ({ contactsDeLImmeuble: (...a: unknown[]) => contactsDeLImmeuble(...a) }));

const { preparerMailSyndic } = await import('./mailSyndicRepo');

const email = (valeur: string) => ({ id: 1, sorte: 'email' as const, libelle: null, valeur });
const FICHE = {
  id: 40, nom: 'Cabinet Criterimmo', email: 'contact@criterimmo.fr',
  contacts: [
    { id: 1, titre: 'Gestionnaire', prenom: 'Mathis', nom: 'Bercier', civilite: 'M.', coordonnees: [email('m.bercier@criterimmo.fr')] },
    { id: 2, titre: 'Comptable', prenom: 'Léa', nom: 'Durand', civilite: null, coordonnees: [email('l.durand@criterimmo.fr')] },
  ],
};
const personne = (nom: string, prenom: string | null, o: Record<string, unknown> = {}) => ({
  sujet: 'proprietaire', id: 1, cle: 'k', civilite: null, prenom, nom, archive: false, contacts: [], ...o,
});
const LOT = {
  id: 176, numero: '219', nature: 'Appartement meublé', typeBien: 'Type 2', immeuble: '25 rue Edith Cavell',
  adresse: '25 rue Edith Cavell', codePostal: '92400', commune: 'COURBEVOIE', surfaceM2: null,
  proprietaires: [personne('LOPES', 'Alberto'), personne('ARCHIVÉ', 'Paul', { archive: true }), personne('JULLIEN - GARRIDO Cédric', null)],
  occupants: [personne('ROI', 'Nathan', { contacts: [
    { id: 9, sorte: 'telephone', valeur: '0612345678', affichage: '06 12 34 56 78', absent: false },
    { id: 8, sorte: 'email', valeur: 'ancien@x.fr', affichage: 'ancien@x.fr', absent: true },
    { id: 7, sorte: 'email', valeur: 'n.roi@x.fr', affichage: 'n.roi@x.fr', absent: false },
  ] })],
};

beforeEach(() => {
  ficheSyndic.mockReset().mockResolvedValue(FICHE);
  ficheLot.mockReset().mockResolvedValue({ etat: 'ok', data: LOT });
  contactsDeLImmeuble.mockReset().mockResolvedValue([
    { id: 5, categorie: 'gardien', libelle: null, civilite: 'Mme', prenom: 'Rose', nom: 'Petit', note: null, coordonnees: [email('gardienne@x.fr')] },
  ]);
});

describe('preparerMailSyndic — depuis une fiche bien', () => {
  it('objet avec la résidence (adresse du bien, commune lisible) et « XXXXXXXX » à sélectionner', async () => {
    const p = await preparerMailSyndic(40, 176, ['m.bercier@criterimmo.fr']);
    expect(p?.objet).toBe('XXXXXXXX / Cabinet Criterimmo / résidence 25 rue Edith Cavell, 92400 Courbevoie');
    expect(p?.selection).toEqual([0, 8]);
    expect(ficheSyndic).toHaveBeenCalledWith(40, 176);
    expect(contactsDeLImmeuble).toHaveBeenCalledWith('25 rue Edith Cavell');
  });
  it('un contact du syndic avec civilité ⇒ « Bonjour Monsieur BERCIER, » (adresse comparée sans la casse)', async () => {
    const p = await preparerMailSyndic(40, 176, ['M.Bercier@Criterimmo.fr']);
    expect(p?.corps.split('\n')[0]).toBe('Bonjour Monsieur BERCIER,');
  });
  it('un contact SANS civilité, l’e-mail générique ou une adresse inconnue ⇒ « Bonjour Madame, Monsieur, »', async () => {
    for (const a of ['l.durand@criterimmo.fr', 'contact@criterimmo.fr', 'inconnu@ailleurs.fr']) {
      expect((await preparerMailSyndic(40, 176, [a]))?.corps.split('\n')[0]).toBe('Bonjour Madame, Monsieur,');
    }
  });
  it('⚠️ l’e-mail générique PRIME même s’il est aussi l’adresse d’un contact ⇒ « Bonjour Madame, Monsieur, »', async () => {
    ficheSyndic.mockResolvedValue({ ...FICHE, email: 'm.bercier@criterimmo.fr' });
    expect((await preparerMailSyndic(40, 176, ['m.bercier@criterimmo.fr']))?.corps.split('\n')[0]).toBe('Bonjour Madame, Monsieur,');
  });
  it('un contact du CARNET de l’immeuble ⇒ sa civilité compte aussi', async () => {
    expect((await preparerMailSyndic(40, 176, ['gardienne@x.fr']))?.corps.split('\n')[0]).toBe('Bonjour Madame PETIT,');
  });
  it('propriétaires « NOM Prénom » tels qu’en base (archivés exclus), bien, locataire en place avec téléphone et e-mail EN COURS', async () => {
    const l = (await preparerMailSyndic(40, 176, ['m.bercier@criterimmo.fr']))?.corps.split('\n') ?? [];
    expect(l.slice(3, 7)).toEqual([
      'Je prends contact auprès de vous concernant la résidence dont vous êtes le syndic, en qualité de gestionnaire locatif pour le compte des copropriétaires suivants :',
      '', 'LOPES Alberto', 'JULLIEN - GARRIDO Cédric',
    ]);
    expect(l).toContain('Concernant un appartement meublé de 2 pièces.');
    expect(l).toContain('Il est actuellement occupé par le locataire suivant :');
    expect(l).toContain('ROI Nathan · 06 12 34 56 78 · n.roi@x.fr');
    // 🔴 Le numéro WIPPIMMO n'est JAMAIS écrit comme un lot de copropriété.
    expect(l.join('\n')).not.toContain('219');
  });
});

describe('🔴 LOT MAIL-DEPUIS-BIEN-MISE-EN-PAGE-OBJET-DRIVE — l’objet porte NOTRE cabinet, jamais le syndic', () => {
  it('quel que soit le nom du syndic, l’objet dit « Cabinet Criterimmo » et ne contient JAMAIS le nom du syndic', async () => {
    for (const nom of ['TEST ARNAUD', 'Foncia Courbevoie', 'Nexity Lamy']) {
      ficheSyndic.mockResolvedValue({ ...FICHE, nom });
      const avecBien = await preparerMailSyndic(40, 176, ['m.bercier@criterimmo.fr']);
      const sansBien = await preparerMailSyndic(40, null, ['m.bercier@criterimmo.fr']);
      expect(avecBien?.objet).toBe('XXXXXXXX / Cabinet Criterimmo / résidence 25 rue Edith Cavell, 92400 Courbevoie');
      expect(sansBien?.objet).toBe('XXXXXXXX / Cabinet Criterimmo');
      expect(avecBien?.objet).not.toContain(nom);
      expect(sansBien?.objet).not.toContain(nom);
    }
  });
});

describe('preparerMailSyndic — hors fiche bien, et les refus', () => {
  it('écran « Syndics » (pas de bien) : objet sans résidence, formule seule, aucune lecture du bien', async () => {
    const p = await preparerMailSyndic(40, null, ['m.bercier@criterimmo.fr']);
    expect(p).toMatchObject({ objet: 'XXXXXXXX / Cabinet Criterimmo', selection: [0, 8], corps: 'Bonjour Monsieur BERCIER,\n\n\n' });
    // LOT MAIL-DEPUIS-BIEN — la civilité des contacts connus voyage, pour recalculer la formule (le générique n'y est pas).
    expect(p?.civilites).toEqual({
      'm.bercier@criterimmo.fr': { civilite: 'M.', nom: 'Bercier' }, 'l.durand@criterimmo.fr': { civilite: null, nom: 'Durand' } });
    expect(ficheLot).not.toHaveBeenCalled();
    expect(contactsDeLImmeuble).not.toHaveBeenCalled();
  });
  it('syndic inconnu ⇒ `null` (la route répond 404, l’écran ouvre le message simplement adressé)', async () => {
    ficheSyndic.mockResolvedValue(null);
    expect(await preparerMailSyndic(99, 176, ['x@y.fr'])).toBeNull();
  });
});
