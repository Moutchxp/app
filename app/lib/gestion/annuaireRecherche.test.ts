import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  analyserTerme, CHIFFRES_MINIMUM_TELEPHONE, formaterDateIso, LONGUEUR_MAXIMALE, LONGUEUR_MINIMALE,
  messageRechercheVide, periodeOccupation, titreLogement,
} from './annuaireRecherche';

/**
 * LOT ANNUAIRE-1 — CE QU'ON TAPE, ET CE QUE ÇA VEUT DIRE.
 *
 * 🔴 TOUTES LES LECTURES SONT CUMULÉES, JAMAIS EXCLUSIVES. Décider qu'un terme « est un téléphone DONC pas un nom »
 * ferait disparaître les sociétés dont le nom porte des chiffres — et les adresses, qui commencent toutes par un
 * numéro. C'est la propriété la plus importante de ce module, et c'est la première éprouvée.
 *
 * 🔒 Noms, adresses et numéros inventés.
 */

describe('🔴 les lectures se CUMULENT', () => {
  it('« 12 rue de la Paix » est à la fois du texte et des chiffres', () => {
    const t = analyserTerme('12 rue de la Paix');
    expect(t.texte).toBe('12 rue de la paix');
    expect(t.mots).toContain('rue');
    expect(t.mots).toContain('paix');
    // Pas assez de chiffres pour être un bout de téléphone, et pas un nombre SEUL : donc pas un numéro de lot.
    expect(t.chiffres).toBeNull();
    expect(t.numeroLot).toBeNull();
  });

  it('un numéro complet est lu comme téléphone ET comme suite de chiffres', () => {
    const t = analyserTerme('06 99 99 12 34');
    expect(t.telephone).toBe('+33699991234');
    expect(t.chiffres).toBe('0699991234');
  });

  it('les quatre écritures d’un même numéro donnent le même E.164', () => {
    for (const e of ['0699991234', '06.99.99.12.34', '+33 6 99 99 12 34', '0033699991234']) {
      expect(analyserTerme(e).telephone, e).toBe('+33699991234');
    }
  });

  it('une FIN de numéro n’est pas un E.164, mais reste cherchable par ses chiffres', () => {
    const t = analyserTerme('99 12 34');
    expect(t.telephone).toBeNull();
    expect(t.chiffres).toBe('991234');
  });

  it('trop peu de chiffres pour être un bout de numéro : on ne cherche pas dans les téléphones', () => {
    expect(CHIFFRES_MINIMUM_TELEPHONE).toBe(4);
    expect(analyserTerme('92 8').chiffres).toBeNull();
  });

  it('un e-mail n’est lu comme e-mail que s’il porte une arobase', () => {
    expect(analyserTerme('Zoe@Fictif.FR').email).toBe('zoe@fictif.fr');
    expect(analyserTerme('zoe fictif fr').email).toBeNull();
    // Une arobase ne suffit pas : ce qui ne ressemble pas à une adresse n'en est pas une.
    expect(analyserTerme('arobase @ perdue').email).toBeNull();
  });

  it('un nombre SEUL et court est lu comme un numéro de lot ; un nombre suivi de mots, non', () => {
    expect(analyserTerme('103').numeroLot).toBe('103');
    expect(analyserTerme('54 avenue').numeroLot).toBeNull();
    expect(analyserTerme('1234567').numeroLot).toBeNull();
  });
});

describe('les bornes, et ce qu’on en dit', () => {
  it('trop court : rien n’est cherché, et l’écran le DIT', () => {
    const t = analyserTerme('a');
    expect(t.vide).toBe(true);
    expect(messageRechercheVide(t)).toContain(`${LONGUEUR_MINIMALE} caractères`);
  });

  it('vide ou absent ne casse rien', () => {
    expect(analyserTerme(null).vide).toBe(true);
    expect(analyserTerme(undefined).vide).toBe(true);
    expect(analyserTerme('   ').vide).toBe(true);
  });

  it('un copier-coller géant est TRONQUÉ, jamais refusé', () => {
    const t = analyserTerme('x'.repeat(500));
    expect(t.brut).toHaveLength(LONGUEUR_MAXIMALE);
    expect(t.vide).toBe(false);
  });

  it('« aucun résultat » rappelle ce qui a été cherché ET ce sur quoi porte la recherche', () => {
    const m = messageRechercheVide(analyserTerme('DUPONT'));
    expect(m).toContain('DUPONT');
    expect(m).toContain('téléphones');
    expect(m).toContain('numéros de lot');
  });
});

describe('les accents et la casse ne comptent jamais', () => {
  it('« PUTEAUX », « puteaux » et « Putéaux » donnent le même texte cherché', () => {
    expect(analyserTerme('PUTEAUX').texte).toBe('puteaux');
    expect(analyserTerme('puteaux').texte).toBe('puteaux');
    expect(analyserTerme('Putéaux').texte).toBe('puteaux');
  });

  it('une adresse tapée sans accent retrouve la même forme que celle qui en a', () => {
    expect(analyserTerme('54 avenue Puvis de Chavannes').texte)
      .toBe(analyserTerme('54 AVENUE PUVIS DE CHAVÂNNES').texte);
  });
});

describe('les mots de l’écran', () => {
  it('une date ISO se dit en français, et une date absente ne dit rien', () => {
    expect(formaterDateIso('2018-07-19')).toBe('19/07/2018');
    expect(formaterDateIso('2018-07-19T00:00:00.000Z')).toBe('19/07/2018');
    expect(formaterDateIso(null)).toBe('');
    expect(formaterDateIso('n’importe quoi')).toBe('');
  });

  it('une occupation se dit selon ce qu’on sait d’elle — jamais une date inventée', () => {
    expect(periodeOccupation('2022-09-01', null)).toBe('depuis le 01/09/2022');
    expect(periodeOccupation('2019-02-01', '2022-08-31')).toBe('du 01/02/2019 au 31/08/2022');
    expect(periodeOccupation(null, '2022-08-31')).toBe('jusqu’au 31/08/2022');
    expect(periodeOccupation(null, null)).toBe('dates inconnues');
  });

  it('un logement sans adresse le DIT, au lieu d’afficher une ligne vide', () => {
    expect(titreLogement('4 rue Fictive', 'PUTEAUX')).toBe('4 rue Fictive, PUTEAUX');
    expect(titreLogement('4 rue Fictive', null)).toBe('4 rue Fictive');
    expect(titreLogement(null, 'PUTEAUX')).toBe('PUTEAUX');
    expect(titreLogement(null, null)).toBe('Adresse non renseignée');
    expect(titreLogement('  ', '  ')).toBe('Adresse non renseignée');
  });
});

/**
 * GARANTIES D'ÉCRAN, lues dans la source — ce qu'aucun test de fonction pure ne peut tenir.
 */
describe('garanties statiques de l’écran « Annuaire »', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');

  it('UN SEUL champ de recherche, avec une étiquette VISIBLE', () => {
    expect(src.match(/<input/g) ?? []).toHaveLength(1);
    expect(src).toContain('<label className="ann-label"');
  });

  it('les trois fiches existent, et le rôle de chaque valeur est écrit en toutes lettres', () => {
    expect(src).toContain('function VueProprietaire');
    expect(src).toContain('function VueLot');
    expect(src).toContain('function VueLocataire');
    expect(src).toContain('Propriétaire');
    expect(src).toContain('Locataire actuel');
    expect(src).toContain('Locataires passés');
  });

  it('les coordonnées sont cliquables : `tel:` compose, `mailto:` (ou l’éditeur maison) écrit', () => {
    expect(src).toContain('href={`tel:${c.valeur}`}');
    expect(src).toContain('href={`mailto:${c.valeur}`}');
  });

  it('la date de début de relation est PRÉSENTÉE comme dérivée, jamais comme une saisie', () => {
    expect(src).toContain('Début de la relation');
    expect(src).toContain('début de gestion du plus ancien de ses lots');
  });

  it('mobile d’abord : cibles ≥ 44 px, et AUCUNE interaction au seul survol', () => {
    expect(src).toContain('min-height:44px');
    expect(src).not.toMatch(/:hover\{[^}]*(display|visibility)\s*:/);
  });

  it('« lot hors gestion » et « absent du dernier export » sont dits par des MOTS', () => {
    expect(src).toContain('lot hors gestion');
    expect(src).toContain('absent du dernier export');
  });

  it('l’écran DIT quand l’annuaire n’est pas installé, plutôt que de rester vide', () => {
    expect(src).toContain('sans_schema');
    expect(src).toContain('n’est pas encore installé');
  });
});
