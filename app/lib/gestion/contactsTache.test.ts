import { describe, expect, it } from 'vitest';
import {
  blocContacts, chercherContacts, coordonneesLisibles, empreinteContact, etatCopie, grouperParFamille, lienTelephone,
  lireClesContacts, texteCompletTache, type ContactSource,
} from './contactsTache';
import { phraseTrace } from './taches';

/**
 * LOT TACHES-1-BIS — LA RÈGLE PURE DES CONTACTS D'UNE TÂCHE : le bloc « Contacts » généré, la note jamais touchée,
 * la copie datée et son état face à la fiche d'aujourd'hui.
 */
const PROPRIO: ContactSource = {
  cle: 'proprietaire:12', famille: 'proprietaire', nom: 'M. DUPONT Jean', qualite: 'Gérant de la SCI', organisation: null,
  adresse: null,
  coordonnees: [
    { sorte: 'telephone', libelle: 'Mobile', valeur: '0612345678', affichage: '06 12 34 56 78' },
    { sorte: 'telephone', libelle: 'Ligne directe', valeur: '0144556677', affichage: '01 44 55 66 77' },
    { sorte: 'email', libelle: 'Personnel', valeur: 'jean@dupont.fr', affichage: null },
    { sorte: 'email', libelle: null, valeur: 'sci@dupont.fr', affichage: null },
  ],
};
const LOCATAIRE: ContactSource = {
  cle: 'locataire:45', famille: 'locataire', nom: 'Mme MARTIN Claire', qualite: null, organisation: null, adresse: null,
  coordonnees: [{ sorte: 'telephone', libelle: 'Portable', valeur: '0700000000', affichage: '07 00 00 00 00' }],
};
const SYNDIC: ContactSource = {
  cle: 'syndic_contact:9', famille: 'syndic_immeuble', nom: 'M. GESTION Paul', qualite: 'Responsable de copropriété',
  organisation: 'Cabinet LOISEAU', adresse: '3 rue du Syndic, 75011 Paris',
  coordonnees: [
    { sorte: 'email', libelle: null, valeur: 'paul@loiseau.fr', affichage: null },
    { sorte: 'telephone', libelle: 'Standard du cabinet', valeur: '0140000000', affichage: null },
    { sorte: 'telephone', libelle: 'Standard 2 du cabinet', valeur: '0140000001', affichage: null },
  ],
};
const TIERS: ContactSource = {
  cle: 'adresse:plombier@x.fr', famille: 'independant', nom: 'Plomberie X', qualite: null, organisation: null,
  adresse: null, coordonnees: [{ sorte: 'email', libelle: null, valeur: 'plombier@x.fr', affichage: null }],
};

describe('🔴 le bloc « Contacts » généré', () => {
  it('plusieurs familles, tous les téléphones et e-mails avec leur libellé, le syndic avec cabinet, standards et adresse', () => {
    // Donnés dans le désordre : le bloc suit l'ordre des familles du bloc PARTIES.
    expect(blocContacts([TIERS, SYNDIC, LOCATAIRE, PROPRIO])).toBe([
      'Contacts',
      '— M. DUPONT Jean · Propriétaire · Gérant de la SCI',
      '  Mobile : 06 12 34 56 78',
      '  Ligne directe : 01 44 55 66 77',
      '  Personnel : jean@dupont.fr',
      '  E-mail : sci@dupont.fr',
      '— Mme MARTIN Claire · Locataire en place',
      '  Portable : 07 00 00 00 00',
      '— M. GESTION Paul · Syndic & immeuble · Responsable de copropriété',
      '  Cabinet : Cabinet LOISEAU',
      '  E-mail : paul@loiseau.fr',
      '  Standard du cabinet : 0140000000',
      '  Standard 2 du cabinet : 0140000001',
      '  Adresse : 3 rue du Syndic, 75011 Paris',
      '— Plomberie X · Tiers indépendant',
      '  E-mail : plombier@x.fr',
    ].join('\n'));
  });

  it('aucun contact ⇒ aucun bloc', () => {
    expect(blocContacts([])).toBe('');
  });
});

describe('🔴 la note libre n’est jamais touchée', () => {
  const NOTE = 'Passer avec les clés.\nSonner deux fois.   ';
  it('texte = note, puis le bloc ; cocher ou décocher ne change que le bloc', () => {
    const avecUn = texteCompletTache(NOTE, [PROPRIO]);
    const avecDeux = texteCompletTache(NOTE, [PROPRIO, LOCATAIRE]);
    const sansRien = texteCompletTache(NOTE, []);
    for (const t of [avecUn, avecDeux]) expect(t.startsWith('Passer avec les clés.\nSonner deux fois.\n\nContacts\n')).toBe(true);
    expect(avecDeux).toContain('Mme MARTIN Claire');
    expect(avecUn).not.toContain('Mme MARTIN Claire');
    expect(sansRien).toBe('Passer avec les clés.\nSonner deux fois.');
    // Le bloc seul ne lit pas la note : impossible qu'il la modifie.
    expect(blocContacts([PROPRIO])).not.toContain('Passer');
  });
  it('sans note, le texte est le bloc seul', () => {
    expect(texteCompletTache(null, [LOCATAIRE])).toBe(blocContacts([LOCATAIRE]));
  });
});

describe('🔴 la copie datée et « Mettre à jour »', () => {
  it('à jour, modifiée depuis, ou plus liée au bien', () => {
    expect(etatCopie(PROPRIO, [PROPRIO, LOCATAIRE])).toBe('a_jour');
    const nouveauNumero = { ...PROPRIO, coordonnees: [...PROPRIO.coordonnees.slice(1), { sorte: 'telephone' as const, libelle: 'Mobile', valeur: '0699999999', affichage: null }] };
    expect(etatCopie(PROPRIO, [nouveauNumero])).toBe('modifie');
    expect(etatCopie(PROPRIO, [{ ...PROPRIO, qualite: 'Associé' }])).toBe('modifie');
    // 🔴 Locataire sorti, syndic changé : la copie reste, et dit seulement qu'elle n'est plus liée.
    expect(etatCopie(LOCATAIRE, [PROPRIO])).toBe('plus_lie');
  });
  it('l’ordre des coordonnées, les espaces d’un numéro et la casse d’un e-mail ne font pas une modification', () => {
    const autreForme = {
      ...PROPRIO,
      coordonnees: [...PROPRIO.coordonnees].reverse().map((k) => (k.sorte === 'email'
        ? { ...k, valeur: k.valeur.toUpperCase() } : { ...k, valeur: k.valeur.replace(/(\d\d)/g, '$1 ').trim() })),
    };
    expect(empreinteContact(autreForme)).toBe(empreinteContact(PROPRIO));
  });
});

describe('le reste de la règle', () => {
  it('groupe par famille, dans l’ordre du bloc PARTIES', () => {
    expect(grouperParFamille([TIERS, PROPRIO, SYNDIC]).map((g) => g.famille)).toEqual(['proprietaire', 'syndic_immeuble', 'independant']);
  });
  it('cherche sans accents, dans le nom, la famille, la qualité, le cabinet et les numéros', () => {
    const l = [PROPRIO, LOCATAIRE, SYNDIC, TIERS];
    expect(chercherContacts(l, 'loiseau').map((c) => c.cle)).toEqual(['syndic_contact:9']);
    expect(chercherContacts(l, 'locataire').map((c) => c.cle)).toEqual(['locataire:45']);
    expect(chercherContacts(l, 'gerant').map((c) => c.cle)).toEqual(['proprietaire:12']);
    expect(chercherContacts(l, '07 00').map((c) => c.cle)).toEqual(['locataire:45']);
    expect(chercherContacts(l, '  ')).toHaveLength(4);
  });
  it('relit ce qui vient du navigateur et de la base sans rien deviner', () => {
    expect(lireClesContacts(['a', ' a ', 3, '', 'b'])).toEqual(['a', 'b']);
    expect(lireClesContacts(undefined)).toBeUndefined();
    expect(coordonneesLisibles([{ sorte: 'telephone', valeur: ' 06 ', libelle: '' }, { sorte: 'fax', valeur: 'x' }, null]))
      .toEqual([{ sorte: 'telephone', valeur: '06', libelle: null, affichage: null }]);
    expect(lienTelephone('+33 6 12 34 56 78')).toBe('tel:+33612345678');
  });
  it('🔴 traçabilité : contact ajouté, retiré, mis à jour', () => {
    const le = '2026-10-13T17:20:00.000Z';
    expect(phraseTrace({ action: 'modification', avant: null, apres: { contactAjoute: 'Mme MARTIN Claire' }, survenuLe: le, auteurLibelle: 'Arno Jorel' }))
      .toBe('Contact ajouté par Arno Jorel le 13/10/2026 à 19:20 (Mme MARTIN Claire)');
    expect(phraseTrace({ action: 'modification', avant: null, apres: { contactRetire: 'X' }, survenuLe: le, auteurLibelle: 'A' }))
      .toBe('Contact retiré par A le 13/10/2026 à 19:20 (X)');
    expect(phraseTrace({ action: 'modification', avant: null, apres: { contactMisAJour: 'X' }, survenuLe: le, auteurLibelle: 'A' }))
      .toBe('Coordonnées mises à jour par A le 13/10/2026 à 19:20 (X)');
  });
});
