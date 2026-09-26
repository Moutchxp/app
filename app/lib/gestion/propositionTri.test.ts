import { describe, it, expect } from 'vitest';
import {
  AUCUNE, depuisAdresses, memeDestination, memeProposition, proposerPourPiece, proprietaireCommun,
  propositionCourte, type AdresseEchange,
} from './propositionTri';
import type { Reconnaissance } from './adressesMessage';

/**
 * LOT DRIVE-2-bis — LA PROPOSITION DE TRI, ÉPROUVÉE SANS RÉSEAU NI BASE.
 *
 * 🔒 Aucune donnée réelle.
 *
 * 🔴 CE QUI EST ÉPROUVÉ :
 *   ① la proposition s'appuie sur TOUT L'ÉCHANGE, pas seulement sur le mail qui porte la pièce ;
 *   ② les adresses DU MAIL priment sur celles de ses voisins ;
 *   ③ une contradiction ne donne jamais « le premier » : propriétaire commun, sinon « aucune » ;
 *   ④ « aucune » est une proposition à part entière — elle dit qu'on ne sait pas.
 */

const rec = (o: Partial<Reconnaissance> = {}): Reconnaissance => ({
  partie: null, proprietaireCle: null, locataireId: null, lotCle: null, motif: '', ...o,
});

const a = (adresse: string, messageId: number, r: Reconnaissance, interne = false): AdresseEchange =>
  ({ adresse, messageId, interne, reconnaissance: r });

const LOC_100 = rec({ partie: 'locataire', lotCle: '100', proprietaireCle: 'P1', locataireId: 10 });
const LOC_200 = rec({ partie: 'locataire', lotCle: '200', proprietaireCle: 'P2', locataireId: 20 });
const LOC_101 = rec({ partie: 'locataire', lotCle: '101', proprietaireCle: 'P1', locataireId: 11 });
const PROP_1 = rec({ partie: 'proprietaire', proprietaireCle: 'P1' });
const INCONNU = rec();

describe('🔴 ① la proposition s’appuie sur TOUT l’échange', () => {
  it('une pièce dont le mail ne dit rien hérite des adresses de l’échange', () => {
    const p = proposerPourPiece({
      messageId: 2,
      adressesEchange: [a('alice@fictif.fr', 1, LOC_100), a('artisan@fictif.fr', 2, INCONNU)],
    });
    expect(p.destination).toEqual({ sorte: 'bien', cle: '100' });
    expect(p.regle).toBe('b');
    expect(p.motif).toContain('adresses de l’échange');
    expect(p.adressesFondatrices).toContain('alice@fictif.fr');
  });

  it('c’est le changement de fond : le mail seul ne suffisait pas', () => {
    // Le mail 2 n'a QUE des inconnus : sans l'échange, la proposition serait « aucune ».
    const seul = proposerPourPiece({
      messageId: 2, adressesEchange: [a('artisan@fictif.fr', 2, INCONNU)],
    });
    expect(seul.destination.sorte).toBe('aucune');
  });
});

describe('🔴 ② les adresses DU MAIL priment sur celles de l’échange', () => {
  it('le mail désigne le bien 200, l’échange le bien 100 : c’est 200 qui gagne', () => {
    const p = proposerPourPiece({
      messageId: 2,
      adressesEchange: [a('alice@fictif.fr', 1, LOC_100), a('zoe@fictif.fr', 2, LOC_200)],
    });
    expect(p.destination).toEqual({ sorte: 'bien', cle: '200' });
    expect(p.regle).toBe('a');
    expect(p.confiance).toBe('haute');
    expect(p.motif).toContain('adresses du mail');
  });

  it('la confiance est MOINDRE quand la proposition vient de l’échange', () => {
    const p = proposerPourPiece({
      messageId: 2, adressesEchange: [a('alice@fictif.fr', 1, LOC_100), a('x@fictif.fr', 2, INCONNU)],
    });
    expect(p.confiance).toBe('moyenne');
  });
});

describe('🔴 ③ une contradiction ne donne jamais « le premier »', () => {
  it('deux biens du MÊME propriétaire → le propriétaire', () => {
    const p = proposerPourPiece({
      messageId: 1, adressesEchange: [a('alice@fictif.fr', 1, LOC_100), a('bob@fictif.fr', 1, LOC_101)],
    });
    expect(p.destination).toEqual({ sorte: 'proprietaire', cle: 'P1' });
    expect(p.motif).toContain('2 biens désignés, mais un seul propriétaire');
  });

  it('🔴 deux biens de propriétaires DIFFÉRENTS → « aucune »', () => {
    const p = proposerPourPiece({
      messageId: 1, adressesEchange: [a('alice@fictif.fr', 1, LOC_100), a('zoe@fictif.fr', 1, LOC_200)],
    });
    expect(p.destination.sorte).toBe('aucune');
    expect(p.motif).toContain('non tranché');
    // Les adresses fondatrices sont quand même rendues : c'est ce qui permet de comprendre le refus.
    expect(p.adressesFondatrices).toHaveLength(2);
  });

  it('le propriétaire commun n’existe que s’il est vraiment commun', () => {
    expect(proprietaireCommun(['P1', 'P1'])).toBe('P1');
    expect(proprietaireCommun(['P1', 'P2'])).toBeNull();
    expect(proprietaireCommun(['P1', null])).toBe('P1');
    expect(proprietaireCommun([null, null])).toBeNull();
    expect(proprietaireCommun([])).toBeNull();
  });
});

describe('les adresses internes ne fondent jamais rien', () => {
  it('un échange où seule notre adresse est connue ne propose rien', () => {
    const p = proposerPourPiece({
      messageId: 1,
      adressesEchange: [a('gestion@criterimmo.fr', 1, PROP_1, true), a('x@ailleurs.fr', 1, INCONNU)],
    });
    expect(p.destination.sorte).toBe('aucune');
  });

  it('elles n’apparaissent pas dans les adresses fondatrices', () => {
    const p = proposerPourPiece({
      messageId: 1,
      adressesEchange: [a('gestion@criterimmo.fr', 1, PROP_1, true), a('alice@fictif.fr', 1, LOC_100)],
    });
    expect(p.adressesFondatrices).not.toContain('gestion@criterimmo.fr');
  });
});

describe('les renforts, seulement quand les adresses n’ont rien donné', () => {
  it('ils servent quand aucune adresse n’est reconnue', () => {
    const p = proposerPourPiece({
      messageId: 1, adressesEchange: [a('x@ailleurs.fr', 1, INCONNU)],
      renforts: { destination: { sorte: 'bien', cle: '300' }, motif: 'adresse citée dans l’objet', confiance: 'basse' },
    });
    expect(p.destination).toEqual({ sorte: 'bien', cle: '300' });
    expect(p.regle).toBe('c');
  });

  it('🔴 ils ne servent PAS quand une adresse a déjà désigné un dossier', () => {
    const p = proposerPourPiece({
      messageId: 1, adressesEchange: [a('alice@fictif.fr', 1, LOC_100)],
      renforts: { destination: { sorte: 'bien', cle: '999' }, motif: 'x', confiance: 'basse' },
    });
    expect(p.destination).toEqual({ sorte: 'bien', cle: '100' });
  });

  it('🔴 une CONTRADICTION d’adresses n’empêche pas les renforts de parler', () => {
    const p = proposerPourPiece({
      messageId: 1,
      adressesEchange: [a('alice@fictif.fr', 1, LOC_100), a('zoe@fictif.fr', 1, LOC_200)],
      renforts: { destination: { sorte: 'bien', cle: '300' }, motif: 'carte d’événement', confiance: 'moyenne' },
    });
    expect(p.destination).toEqual({ sorte: 'bien', cle: '300' });
    expect(p.regle).toBe('c');
  });
});

describe('🔴 ④ « aucune » est une proposition à part entière', () => {
  it('sans rien de reconnaissable, elle est rendue avec son motif', () => {
    const p = proposerPourPiece({ messageId: 1, adressesEchange: [] });
    expect(p).toEqual(AUCUNE);
    expect(p.motif).toContain('aucune adresse connue');
  });

  it('elle s’écrit « aucune » dans les appProperties', () => {
    expect(propositionCourte(AUCUNE)).toBe('aucune');
    expect(propositionCourte({ ...AUCUNE, destination: { sorte: 'bien', cle: '315' } })).toBe('bien:315');
    expect(propositionCourte({ ...AUCUNE, destination: { sorte: 'proprietaire', cle: '223' } })).toBe('proprio:223');
  });
});

describe('l’historisation : on n’ajoute une ligne que si la proposition CHANGE', () => {
  const base = { destination: { sorte: 'bien' as const, cle: '100' }, regle: 'a' as const, confiance: 'haute' as const, motif: 'x', adressesFondatrices: [] };

  it('deux propositions identiques sont reconnues comme telles', () => {
    expect(memeProposition(base, { ...base, motif: 'formulé autrement' })).toBe(true);
  });

  it('un changement de destination, de règle ou de confiance est un changement', () => {
    expect(memeProposition(base, { ...base, destination: { sorte: 'bien', cle: '200' } })).toBe(false);
    expect(memeProposition(base, { ...base, regle: 'b' })).toBe(false);
    expect(memeProposition(base, { ...base, confiance: 'basse' })).toBe(false);
  });

  it('deux destinations se comparent sans se tromper de sorte', () => {
    expect(memeDestination({ sorte: 'bien', cle: '1' }, { sorte: 'bien', cle: '1' })).toBe(true);
    expect(memeDestination({ sorte: 'bien', cle: '1' }, { sorte: 'proprietaire', cle: '1' })).toBe(false);
  });
});

describe('le calcul isolé sur un groupe d’adresses', () => {
  it('rend null quand aucune adresse n’apporte rien — l’appelant sait alors passer à la suite', () => {
    expect(depuisAdresses([], 'x', 'haute')).toBeNull();
    expect(depuisAdresses([a('x@ailleurs.fr', 1, INCONNU)], 'x', 'haute')).toBeNull();
    expect(depuisAdresses([a('gestion@criterimmo.fr', 1, PROP_1, true)], 'x', 'haute')).toBeNull();
  });

  it('un propriétaire seul, sans lot, propose le propriétaire', () => {
    const p = depuisAdresses([a('jean@fictif.fr', 1, PROP_1)], 'adresses du mail', 'haute');
    expect(p?.destination).toEqual({ sorte: 'proprietaire', cle: 'P1' });
  });
});
