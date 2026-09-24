import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ecrireEtatUrl, etiquetteDepuisTexte, ETAT_DEFAUT, ETIQUETTE_ARRIVEE, ETIQUETTE_RECEPTION,
  autoImposeParEtiquette, lireEtatUrl, memeEtat, memeEtiquette, texteEtiquette,
  type EtatEcranUrl, type Etiquette,
} from './ecranUrl';

/**
 * LOT 5-FUSION — L'ÉTAT DE L'ÉCRAN DANS L'ADRESSE. Trois choses peuvent le rendre inutile, et chacune est éprouvée ici :
 *   ① une adresse abîmée fait écran blanc au lieu de retomber sur le défaut — et c'est le lien collé d'un collègue ;
 *   ② lire puis écrire ne redonne pas la même adresse — l'historique du navigateur se remplit alors de doublons ;
 *   ③ l'adresse nue du module ne l'est plus — on ne peut plus la mettre en signet sans traîner un écran d'hier.
 */

const etat = (o: Partial<EtatEcranUrl> = {}): EtatEcranUrl => ({ ...ETAT_DEFAUT, ...o });
const carte = (id: number): Etiquette => ({ sorte: 'carte', evenementId: id });

describe('🔴 ① une adresse abîmée ne casse jamais l’écran', () => {
  it('vide, absurde, ou pas une adresse du tout → l’écran par défaut', () => {
    for (const s of ['', '?', '???', 'ecran', '%%%', '?ecran=&etiquette=&fil=']) {
      expect(lireEtatUrl(s)).toEqual(ETAT_DEFAUT);
    }
  });

  it('un écran inconnu retombe sur l’écran partagé, il n’invente pas un quatrième écran', () => {
    expect(lireEtatUrl('?ecran=plein').ecran).toBe('partage');
    expect(lireEtatUrl('?ecran=BOITE').ecran).toBe('partage'); // la casse compte : une seule forme canonique
  });

  it('une étiquette inconnue retombe sur l’étiquette d’arrivée', () => {
    for (const s of ['nimportequoi', 'carte', 'carte-', 'carte-0', 'carte-zéro', 'carte--3']) {
      expect(lireEtatUrl(`?etiquette=${encodeURIComponent(s)}`).etiquette).toEqual(ETIQUETTE_ARRIVEE);
    }
  });

  it('🔴 un identifiant qui n’en est pas un vaut `null`, jamais `NaN` ni `0` — la requête ne part pas pour rien', () => {
    for (const s of ['0', '-1', '1.5', 'abc', '', '99999999999999999999']) {
      expect(lireEtatUrl(`?fil=${encodeURIComponent(s)}`).filOuvert).toBeNull();
    }
    expect(lireEtatUrl('?fil=412').filOuvert).toBe(412);
  });

  it('le `?` est facultatif : la chaîne vient parfois de `location.search`, parfois sans son préfixe', () => {
    expect(lireEtatUrl('?ecran=boite&fil=7')).toEqual(lireEtatUrl('ecran=boite&fil=7'));
  });
});

describe('🔴 ② lire puis écrire redonne la MÊME adresse', () => {
  const adresses = [
    '', '?ecran=boite', '?ecran=boite&etiquette=envoyes', '?ecran=boite&etiquette=carte-77&fil=412',
    '?ecran=evenements', '?fil=9', '?ecran=boite&etiquette=sans_suite',
  ];

  it('aller-retour stable sur toutes les formes canoniques', () => {
    for (const a of adresses) expect(ecrireEtatUrl(lireEtatUrl(a))).toBe(a);
  });

  it('…et une SECONDE fois : écrire ce qu’on vient d’écrire ne dérive pas', () => {
    for (const a of adresses) {
      const une = ecrireEtatUrl(lireEtatUrl(a));
      expect(ecrireEtatUrl(lireEtatUrl(une))).toBe(une);
    }
  });
});

describe('🔴 ③ l’adresse nue du module reste nue', () => {
  it('l’écran par défaut n’écrit RIEN — pas « ?ecran=partage&etiquette=a_classer »', () => {
    expect(ecrireEtatUrl(ETAT_DEFAUT)).toBe('');
  });

  it('l’étiquette n’est écrite que dans la boîte : ailleurs elle ne désigne rien', () => {
    expect(ecrireEtatUrl(etat({ ecran: 'evenements', etiquette: carte(3) }))).toBe('?ecran=evenements');
    expect(ecrireEtatUrl(etat({ ecran: 'partage', etiquette: ETIQUETTE_RECEPTION }))).toBe('');
  });

  it('…et l’étiquette d’arrivée non plus : entrer en plein écran donne « ?ecran=boite », rien de plus', () => {
    expect(ecrireEtatUrl(etat({ ecran: 'boite' }))).toBe('?ecran=boite');
    expect(ecrireEtatUrl(etat({ ecran: 'boite', etiquette: ETIQUETTE_RECEPTION }))).toBe('?ecran=boite&etiquette=reception');
  });
});

describe('l’étiquette d’arrivée, et ce qu’elle promet', () => {
  it('entrer en plein écran mène à « À classer » : on arrive sur ce qu’il y a à faire, pas sur la réserve', () => {
    expect(ETIQUETTE_ARRIVEE).toEqual({ sorte: 'a_classer', evenementId: null });
    expect(lireEtatUrl('?ecran=boite').etiquette).toEqual(ETIQUETTE_ARRIVEE);
  });

  it('une carte se lit et se réécrit avec son identifiant, jamais sans', () => {
    expect(etiquetteDepuisTexte('carte-412')).toEqual(carte(412));
    expect(texteEtiquette(carte(412))).toBe('carte-412');
    expect(memeEtiquette(carte(1), carte(2))).toBe(false);
    expect(memeEtiquette(carte(1), carte(1))).toBe(true);
  });

  it('🔴 il n’existe PAS d’étiquette « à traiter » : l’état par échange n’existe pas encore en base', () => {
    expect(etiquetteDepuisTexte('a_traiter')).toEqual(ETIQUETTE_ARRIVEE);
    expect(readFileSync('app/lib/gestion/ecranUrl.ts', 'utf8')).not.toContain("'a_traiter'");
  });
});

describe('le courrier automatique : ce que l’étiquette impose, et ce qu’elle laisse choisir', () => {
  it('« À classer » l’exclut — c’est le poste de tri, qui ne l’a jamais montré', () => {
    expect(autoImposeParEtiquette(ETIQUETTE_ARRIVEE)).toBe(false);
  });

  it('« Courrier automatique » ne montre QUE lui — l’exclure la laisserait vide par construction', () => {
    expect(autoImposeParEtiquette({ sorte: 'automatique', evenementId: null })).toBe(true);
  });

  it('partout ailleurs, l’interrupteur décide — il n’a rien perdu', () => {
    for (const s of ['reception', 'envoyes', 'sans_suite'] as const) {
      expect(autoImposeParEtiquette({ sorte: s, evenementId: null })).toBeNull();
    }
    expect(autoImposeParEtiquette(carte(9))).toBeNull();
  });
});

describe('quand empiler une entrée d’historique, et quand ne pas le faire', () => {
  it('le même écran deux fois n’en est qu’un : trois clics identiques ne coûtent pas trois « Précédent »', () => {
    expect(memeEtat(etat({ ecran: 'boite' }), etat({ ecran: 'boite' }))).toBe(true);
  });

  it('changer d’étiquette, d’écran ou d’échange ouvert change l’écran', () => {
    expect(memeEtat(etat({ ecran: 'boite' }), etat({ ecran: 'boite', etiquette: ETIQUETTE_RECEPTION }))).toBe(false);
    expect(memeEtat(etat({ ecran: 'boite' }), etat({ ecran: 'evenements' }))).toBe(false);
    expect(memeEtat(etat({ ecran: 'boite' }), etat({ ecran: 'boite', filOuvert: 3 }))).toBe(false);
  });

  it('hors de la boîte, l’étiquette ne compte pas — sinon deux adresses désigneraient le même écran', () => {
    expect(memeEtat(etat({ ecran: 'partage', etiquette: carte(1) }), etat({ ecran: 'partage', etiquette: carte(2) }))).toBe(true);
  });
});

describe('garanties STATIQUES', () => {
  it('🔴 module PUR : aucun import, donc rien qui puisse tirer `pg` jusque dans le navigateur', () => {
    const src = readFileSync('app/lib/gestion/ecranUrl.ts', 'utf8');
    expect(src.split('\n').filter((l) => /^\s*import\b/.test(l))).toEqual([]);
    expect(/require\(|from '/.test(src)).toBe(false);
  });

  it('il ne connaît ni base, ni React, ni réseau : il ne sait qu’écrire et relire une adresse', () => {
    // Sur les lignes de CODE seulement : un commentaire CITE `gestion_message` pour dire d'où les brouillons ne
    //   viennent PAS. Une assertion sur la prose rougirait pour une bonne explication.
    const code = readFileSync('app/lib/gestion/ecranUrl.ts', 'utf8')
      .split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l.trim())).join('\n');
    expect(/useState|fetch\(|query\(|gestion_/.test(code)).toBe(false);
  });
});
