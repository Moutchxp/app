import { describe, it, expect } from 'vitest';
import {
  clePersonne, cleProprietaire, contactsDeCellules, decouperCellule, lireDateFr, nomComplet,
  normaliserEmail, normaliserTelephone, normaliserTexte, plusAncienne,
} from './annuaire';

/**
 * LOT ANNUAIRE-1 — LA NORMALISATION, ÉPROUVÉE SUR DES JEUX FICTIFS.
 *
 * 🔒 AUCUNE DONNÉE RÉELLE ICI. Les exports WIPPIMMO portent les coordonnées de 800 personnes ; aucune ne doit entrer
 * dans le dépôt, ni dans un test, ni dans un commentaire. Tous les noms, numéros et adresses ci-dessous sont
 * inventés, et les numéros suivent le préfixe 06 99 99 … que l'ARCEP réserve à la fiction.
 *
 * 🔴 CE QUI EST ÉPROUVÉ, ET POURQUOI :
 *   ① deux écritures d'une même chose tombent sur la MÊME forme canonique — sinon l'import double, et la recherche
 *      ne retrouve pas ce que l'import a écrit (deux défauts qui se cachent l'un l'autre) ;
 *   ② une cellule qui porte plusieurs valeurs les rend TOUTES — 45 bailleurs et 134 locataires sont dans ce cas ;
 *   ③ ce qui ne se normalise pas n'est JAMAIS jeté ;
 *   ④ deux baux ne deviennent une personne que sur un nom ET un contact, jamais sur le nom seul.
 */

describe('🔴 ① une chose, une forme canonique', () => {
  it('le texte perd accents, casse et ponctuation — « Jullien-Garrido » fait DEUX mots', () => {
    expect(normaliserTexte('JULLIEN - GARRIDO Cédric')).toBe('jullien garrido cedric');
    expect(normaliserTexte('jullien-garrido cédric')).toBe('jullien garrido cedric');
    expect(normaliserTexte('  Éléonore   D’ARSU  ')).toBe('eleonore d arsu');
  });

  it('un nom vide ou absent ne fait pas tomber la normalisation', () => {
    expect(normaliserTexte(null)).toBe('');
    expect(normaliserTexte(undefined)).toBe('');
    expect(normaliserTexte('   ')).toBe('');
  });

  it('les cinq écritures d’un même numéro français donnent le même E.164', () => {
    for (const ecriture of [
      '0699991234', '06 99 99 12 34', '06.99.99.12.34', '+33699991234', '+33 6 99 99 12 34',
      '0033699991234', '06-99-99-12-34', '(0)6 99 99 12 34'.replace('(0)', '0'),
    ]) {
      expect(normaliserTelephone(ecriture), ecriture).toBe('+33699991234');
    }
  });

  it('le zéro national écrit APRÈS l’indicatif est rattrapé — c’est la faute de saisie la plus fréquente', () => {
    expect(normaliserTelephone('+330699991234')).toBe('+33699991234');
  });

  it('le zéro de tête mangé par un tableur est rattrapé lui aussi', () => {
    expect(normaliserTelephone('699991234')).toBe('+33699991234');
  });

  it('un numéro étranger garde son indicatif : on range, on ne juge pas', () => {
    expect(normaliserTelephone('+1 415 555 2671')).toBe('+14155552671');
    expect(normaliserTelephone('+32 476 12 34 56')).toBe('+32476123456');
  });

  it('ce qui n’est pas un numéro rend null — jamais une chaîne bancale', () => {
    for (const non of ['', '   ', 'à rappeler', '12', '0099', '+33', 'poste 412']) {
      expect(normaliserTelephone(non), non).toBeNull();
    }
  });

  it('un e-mail descend en minuscules ; ce qui n’en est pas un rend null', () => {
    expect(normaliserEmail('  Jean.EXEMPLE@Fictif.FR ')).toBe('jean.exemple@fictif.fr');
    for (const non of ['', 'jean', 'jean@', '@fictif.fr', 'jean@fictif', 'a b@fictif.fr']) {
      expect(normaliserEmail(non), non).toBeNull();
    }
  });

  it('une date JJ/MM/AAAA devient une date ISO, et une date impossible est refusée', () => {
    expect(lireDateFr('19/07/2018')).toBe('2018-07-19');
    expect(lireDateFr('1/3/2020')).toBe('2020-03-01');
    // 🔴 Le 31/02 lu comme le 03/03 fausserait une ancienneté de relation commerciale sans que rien ne le dise.
    expect(lireDateFr('31/02/2020')).toBeNull();
    for (const non of ['', '2018-07-19', '19/07/18', 'hier', '19/13/2020']) {
      expect(lireDateFr(non), non).toBeNull();
    }
  });

  it('le 29 février d’une année bissextile, lui, est accepté', () => {
    expect(lireDateFr('29/02/2024')).toBe('2024-02-29');
    expect(lireDateFr('29/02/2023')).toBeNull();
  });
});

describe('🔴 ② une cellule, plusieurs valeurs', () => {
  it('point-virgule, barre oblique, virgule et « et » séparent tous', () => {
    expect(decouperCellule('a@f.fr;b@f.fr')).toEqual(['a@f.fr', 'b@f.fr']);
    expect(decouperCellule('06 99 99 12 34 / 06 99 99 56 78')).toEqual(['06 99 99 12 34', '06 99 99 56 78']);
    expect(decouperCellule('a@f.fr, b@f.fr')).toEqual(['a@f.fr', 'b@f.fr']);
    expect(decouperCellule('a@f.fr et b@f.fr')).toEqual(['a@f.fr', 'b@f.fr']);
  });

  it('une cellule vide ne rend rien, et ne casse rien', () => {
    expect(decouperCellule('')).toEqual([]);
    expect(decouperCellule(null)).toEqual([]);
    expect(decouperCellule(' ; ; ')).toEqual([]);
  });

  it('« cabinet@… » n’est pas coupé sur le « et » de son nom', () => {
    expect(decouperCellule('cabinet@fictif.fr')).toEqual(['cabinet@fictif.fr']);
  });

  it('deux téléphones et deux e-mails sortent normalisés, numérotés dans l’ordre de saisie', () => {
    const c = contactsDeCellules([
      { sorte: 'telephone', texte: '06.99.99.12.34 ; 06 99 99 56 78' },
      { sorte: 'email', texte: 'A@Fictif.FR;b@fictif.fr' },
    ]);
    expect(c).toEqual([
      { sorte: 'telephone', valeur: '+33699991234', valeurBrute: '06.99.99.12.34', rang: 0 },
      { sorte: 'telephone', valeur: '+33699995678', valeurBrute: '06 99 99 56 78', rang: 1 },
      { sorte: 'email', valeur: 'a@fictif.fr', valeurBrute: 'A@Fictif.FR', rang: 0 },
      { sorte: 'email', valeur: 'b@fictif.fr', valeurBrute: 'b@fictif.fr', rang: 1 },
    ]);
  });

  it('le même numéro écrit deux fois dans la cellule ne fait qu’une ligne', () => {
    const c = contactsDeCellules([{ sorte: 'telephone', texte: '0699991234 ; 0699991234' }]);
    expect(c).toHaveLength(1);
  });

  it('le même numéro écrit DIFFÉREMMENT dans deux cellules ne fait qu’une ligne non plus', () => {
    const c = contactsDeCellules([
      { sorte: 'telephone', texte: '06 99 99 12 34' },
      { sorte: 'telephone', texte: '+33699991234' },
    ]);
    expect(c).toHaveLength(1);
  });
});

describe('🔴 ③ ce qui ne se normalise pas n’est pas jeté', () => {
  it('un numéro illisible garde ses chiffres, et reste AFFICHABLE tel qu’il était écrit', () => {
    const c = contactsDeCellules([{ sorte: 'telephone', texte: '04 99 99 12 34 poste 412' }]);
    expect(c).toHaveLength(1);
    expect(c[0].valeurBrute).toBe('04 99 99 12 34 poste 412');
    expect(c[0].valeur).toMatch(/^\d{6,}$/);
  });

  it('une note qui n’a aucun chiffre n’est PAS un numéro : elle ne crée pas de contact fantôme', () => {
    expect(contactsDeCellules([{ sorte: 'telephone', texte: 'à rappeler' }])).toEqual([]);
  });

  it('un e-mail malformé, lui, est écarté : un « mailto: » qui ne part pas ferait perdre du temps', () => {
    expect(contactsDeCellules([{ sorte: 'email', texte: 'pas un mail' }])).toEqual([]);
  });
});

describe('🔴 ④ deux baux, une personne : nom ET contact', () => {
  const tel = contactsDeCellules([{ sorte: 'telephone', texte: '0699991234' }]);
  const mail = contactsDeCellules([{ sorte: 'email', texte: 'a@fictif.fr' }]);
  const autre = contactsDeCellules([{ sorte: 'email', texte: 'z@fictif.fr' }]);

  it('même nom, même e-mail → la même personne', () => {
    expect(clePersonne('dupont jean', mail, '1')).toBe(clePersonne('dupont jean', mail, '2'));
  });

  it('même nom, e-mail DIFFÉRENT → deux personnes, et c’est voulu', () => {
    expect(clePersonne('dupont jean', mail, '1')).not.toBe(clePersonne('dupont jean', autre, '2'));
  });

  it('même nom, aucun contact → deux personnes : quand on ne sait pas, on ne fusionne pas', () => {
    expect(clePersonne('dupont jean', [], '1')).not.toBe(clePersonne('dupont jean', [], '2'));
  });

  it('l’e-mail prime sur le téléphone : c’est lui qui identifie le plus sûrement', () => {
    const deux = contactsDeCellules([
      { sorte: 'telephone', texte: '0699991234' },
      { sorte: 'email', texte: 'a@fictif.fr' },
    ]);
    expect(clePersonne('dupont jean', deux, '1')).toBe(clePersonne('dupont jean', mail, '9'));
    expect(clePersonne('dupont jean', deux, '1')).not.toBe(clePersonne('dupont jean', tel, '9'));
  });
});

describe('le nom d’un propriétaire, et sa clé', () => {
  it('« NOM Prénom » est la forme affichée, et la clé en est la normalisation', () => {
    expect(nomComplet('DUPONT', 'Jean')).toBe('DUPONT Jean');
    expect(nomComplet('SCI DU PARC', null)).toBe('SCI DU PARC');
    expect(cleProprietaire('DUPONT', 'Jean')).toBe('dupont jean');
    expect(cleProprietaire('Dupont', ' jean ')).toBe('dupont jean');
  });
});

describe('la plus ancienne date — celle qui DÉRIVE le début de relation', () => {
  it('rend la plus ancienne, et ignore les manquantes', () => {
    expect(plusAncienne(['2020-01-05', null, '2018-07-19', '2024-03-02'])).toBe('2018-07-19');
  });
  it('aucune date connue → null, jamais une date inventée', () => {
    expect(plusAncienne([])).toBeNull();
    expect(plusAncienne([null, null])).toBeNull();
  });
});
