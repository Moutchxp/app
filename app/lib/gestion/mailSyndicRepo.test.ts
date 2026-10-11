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
  it('LOT MAIL-PREREMPLI-TEXTE-B-ET-NOM-DANS-OBJET — objet : le nom du compte connecté (surligné), puis la résidence', async () => {
    const p = await preparerMailSyndic(40, 176, ['m.bercier@criterimmo.fr'], 'Arnaud JOREL');
    expect(p?.objet).toBe('Arnaud JOREL / Cabinet Criterimmo / résidence 25 rue Edith Cavell, 92400 Courbevoie');
    expect(p?.surlignage).toEqual([0, 12]);
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
  it('🔴🔴 LOT FORMULE-CONTACT-PRIME — l’e-mail général AUSSI porté par un contact avec civilité ⇒ c’est le CONTACT qui compte', async () => {
    // CE QU'IL DISAIT AVANT (lot MAIL-SYNDIC-PREREMPLI) : « l'e-mail générique prime » ⇒ « Bonjour Madame, Monsieur, ».
    //   Décision d'Arno du 11/10/2026 : le contact l'emporte. (Cas réel : arnaud.jorel@gmail.com, e-mail général du
    //   syndic TEST ARNAUD ET adresse du contact Arnaud JOREL, M.)
    ficheSyndic.mockResolvedValue({ ...FICHE, email: 'm.bercier@criterimmo.fr' });
    const p = await preparerMailSyndic(40, 176, ['m.bercier@criterimmo.fr']);
    expect(p?.corps.split('\n')[0]).toBe('Bonjour Monsieur BERCIER,');
    expect(p?.civilites['m.bercier@criterimmo.fr']).toEqual({ civilite: 'M.', nom: 'Bercier' });
  });
  it('une adresse qui n’est QUE l’e-mail général ⇒ toujours « Bonjour Madame, Monsieur, », et absente de la table', async () => {
    const p = await preparerMailSyndic(40, 176, ['contact@criterimmo.fr']);
    expect(p?.corps.split('\n')[0]).toBe('Bonjour Madame, Monsieur,');
    expect(p?.civilites['contact@criterimmo.fr']).toBeUndefined();
  });
  it('un contact du CARNET de l’immeuble ⇒ sa civilité compte aussi', async () => {
    expect((await preparerMailSyndic(40, 176, ['gardienne@x.fr']))?.corps.split('\n')[0]).toBe('Bonjour Madame PETIT,');
  });
  it('compte sans nom : l’objet commence par « Cabinet Criterimmo », rien n’est surligné', async () => {
    const p = await preparerMailSyndic(40, 176, ['m.bercier@criterimmo.fr'], null);
    expect(p?.objet).toBe('Cabinet Criterimmo / résidence 25 rue Edith Cavell, 92400 Courbevoie');
    expect(p?.surlignage).toBeNull();
  });
  it('propriétaires « NOM Prénom » tels qu’en base (archivés exclus), ADRESSE DU BIEN, bien, locataire en place avec téléphone et e-mail EN COURS', async () => {
    const l = (await preparerMailSyndic(40, 176, ['m.bercier@criterimmo.fr']))?.corps.split('\n') ?? [];
    expect(l.slice(3, 8)).toEqual([
      'Le Cabinet Criterimmo assure la gestion locative d\'un bien situé dans la résidence du 25 rue Edith Cavell, 92400 Courbevoie, dont vous êtes le syndic. Ce bien appartient à :',
      '', 'LOPES Alberto', 'JULLIEN - GARRIDO Cédric', '',
    ]);
    expect(l).toContain('Il s\'agit d\'un appartement meublé de 2 pièces, actuellement occupé par :');
    expect(l).toContain('ROI Nathan · 06 12 34 56 78 · n.roi@x.fr');
    // 🔴 Le numéro WIPPIMMO n'est JAMAIS écrit comme un lot de copropriété.
    expect(l.join('\n')).not.toContain('219');
  });
});

describe('LOT MAIL-PREREMPLI-TEXTE-B — l’adresse du corps est celle du BIEN (sa carte), même adresse secondaire', () => {
  it('un bien à l’adresse secondaire d’une copropriété : c’est SON adresse qui est écrite, pas celle de l’immeuble', async () => {
    ficheLot.mockResolvedValue({ etat: 'ok', data: { ...LOT, adresse: '2 rue Secondaire', immeuble: '25 rue Edith Cavell' } });
    const p = await preparerMailSyndic(40, 176, ['m.bercier@criterimmo.fr'], 'Arnaud JOREL');
    expect(p?.corps).toContain('dans la résidence du 2 rue Secondaire, 92400 Courbevoie, dont vous êtes le syndic.');
    expect(p?.objet).toBe('Arnaud JOREL / Cabinet Criterimmo / résidence 2 rue Secondaire, 92400 Courbevoie');
  });
});

describe('🔴 LOT MAIL-DEPUIS-BIEN-MISE-EN-PAGE-OBJET-DRIVE — l’objet porte NOTRE cabinet, jamais le syndic', () => {
  it('quel que soit le nom du syndic, l’objet dit « Cabinet Criterimmo » et ne contient JAMAIS le nom du syndic', async () => {
    for (const nom of ['TEST ARNAUD', 'Foncia Courbevoie', 'Nexity Lamy']) {
      ficheSyndic.mockResolvedValue({ ...FICHE, nom });
      const avecBien = await preparerMailSyndic(40, 176, ['m.bercier@criterimmo.fr'], 'Arnaud JOREL');
      const sansBien = await preparerMailSyndic(40, null, ['m.bercier@criterimmo.fr'], 'Arnaud JOREL');
      expect(avecBien?.objet).toBe('Arnaud JOREL / Cabinet Criterimmo / résidence 25 rue Edith Cavell, 92400 Courbevoie');
      expect(sansBien?.objet).toBe('Arnaud JOREL / Cabinet Criterimmo');
      expect(avecBien?.objet).not.toContain(nom);
      expect(sansBien?.objet).not.toContain(nom);
    }
  });
});

describe('preparerMailSyndic — hors fiche bien, et les refus', () => {
  it('écran « Syndics » (pas de bien) : objet sans résidence, formule seule, aucune lecture du bien', async () => {
    const p = await preparerMailSyndic(40, null, ['m.bercier@criterimmo.fr'], 'Arnaud JOREL');
    expect(p).toMatchObject({ objet: 'Arnaud JOREL / Cabinet Criterimmo', surlignage: [0, 12], corps: 'Bonjour Monsieur BERCIER,\n\n\n' });
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
