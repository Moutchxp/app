import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ecrireEtatUrl, etiquetteDepuisTexte, ETAT_DEFAUT, ETIQUETTE_ARRIVEE, ETIQUETTE_RECEPTION,
  autoImposeParEtiquette, jetonPropre, lireEtatUrl, memeEtat, memeEtiquette, texteEtiquette,
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
    // LOT ERGO-BOITE — l'écran par défaut est la BOÎTE : un écran inconnu y retombe, il n'en invente pas un autre.
    expect(lireEtatUrl('?ecran=plein').ecran).toBe('boite');
    expect(lireEtatUrl('?ecran=BOITE').ecran).toBe('boite'); // la casse compte : une seule forme canonique
  });

  /**
   * 🔴 LOT ERGO-BOITE — ABSENTE, VIDE OU ABÎMÉE : LE MÊME REPLI, « Réception ». Avant ce lot, `?etiquette=` ouvrait
   * « Réception » et `?etiquette=nimportequoi` ouvrait « À classer » : deux replis pour une seule situation — une
   * adresse qui ne désigne rien. Sur l'écran partagé, en revanche, le repli reste sa file de tri.
   */
  it('une étiquette inconnue, vide ou absente retombe sur l’étiquette par défaut de l’écran', () => {
    for (const s of ['nimportequoi', 'carte', 'carte-', 'carte-0', 'carte-zéro', 'carte--3', '']) {
      expect(lireEtatUrl(`?etiquette=${encodeURIComponent(s)}`).etiquette, s).toEqual(ETIQUETTE_RECEPTION);
      expect(lireEtatUrl(`?ecran=partage&etiquette=${encodeURIComponent(s)}`).etiquette, s).toEqual(ETIQUETTE_ARRIVEE);
    }
    // …et une étiquette qui EXISTE est respectée, dans les deux écrans.
    expect(lireEtatUrl('?etiquette=carte-12').etiquette).toEqual({ sorte: 'carte', evenementId: 12 });
    expect(lireEtatUrl('?etiquette=a_classer').etiquette).toEqual(ETIQUETTE_ARRIVEE);
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
  /**
   * LOT ERGO-BOITE — LES FORMES CANONIQUES ONT CHANGÉ AVEC LE DÉFAUT. La boîte sur « Réception » est désormais
   * l'adresse NUE ; l'écran partagé, lui, s'écrit. Ce qui est éprouvé reste le même : écrire ce qu'on vient de lire
   * doit redonner exactement la même adresse.
   */
  const adresses = [
    '', '?ecran=partage', '?etiquette=envoyes', '?etiquette=carte-77&fil=412',
    '?ecran=evenements', '?fil=9', '?etiquette=sans_suite', '?etiquette=a_classer',
    /* 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 0 — la fiche d'un bien, posée sur « Vie du bien ». Elle entre
       dans les formes canoniques : c'est une adresse qu'on envoie à un collègue, donc elle doit se relire. */
    '?ecran=annuaire&fiche=lot-287&bloc=vie',
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
  it('l’écran par défaut n’écrit RIEN — et le défaut est la BOÎTE sur « Réception »', () => {
    expect(ecrireEtatUrl(ETAT_DEFAUT)).toBe('');
    expect(ETAT_DEFAUT.ecran).toBe('boite');
    expect(ETAT_DEFAUT.etiquette).toEqual(ETIQUETTE_RECEPTION);
  });

  /**
   * 🔴 LOT ERGO-BOITE — L'ÉCRAN PARTAGÉ S'ÉCRIT DÉSORMAIS. Il n'est plus le défaut : sans ce paramètre, on ouvrirait
   * la boîte. Le taire ferait d'un lien vers l'écran partagé un lien vers la boîte, ce qui est pire qu'un paramètre
   * de plus dans l'adresse.
   */
  it('« ← Écran partagé » produit une adresse qui le DIT', () => {
    expect(ecrireEtatUrl(etat({ ecran: 'partage' }))).toBe('?ecran=partage');
    expect(lireEtatUrl('?ecran=partage').ecran).toBe('partage');
  });

  it('l’étiquette n’est écrite que dans la boîte : ailleurs elle ne désigne rien', () => {
    expect(ecrireEtatUrl(etat({ ecran: 'evenements', etiquette: carte(3) }))).toBe('?ecran=evenements');
    expect(ecrireEtatUrl(etat({ ecran: 'partage', etiquette: ETIQUETTE_RECEPTION }))).toBe('?ecran=partage');
  });

  it('…et l’étiquette par défaut non plus : la boîte sur « Réception » est l’adresse NUE', () => {
    expect(ecrireEtatUrl(etat({ ecran: 'boite', etiquette: ETIQUETTE_RECEPTION }))).toBe('');
    // Toute AUTRE étiquette de la boîte, elle, s'écrit : c'est elle qui rend le lien partageable.
    expect(ecrireEtatUrl(etat({ ecran: 'boite', etiquette: ETIQUETTE_ARRIVEE }))).toBe('?etiquette=a_classer');
    expect(ecrireEtatUrl(etat({ ecran: 'boite', etiquette: { sorte: 'envoyes', evenementId: null } })))
      .toBe('?etiquette=envoyes');
  });

  /**
   * 🔴 UN LIEN DIRECT L'EMPORTE TOUJOURS SUR LE DÉFAUT — c'est la condition posée par Arno en changeant l'écran
   * d'arrivée : « un lien vers un autre dossier ou un mail précis continue d'ouvrir ce qu'il vise ».
   */
  it('un lien qui désigne quelque chose ouvre ce qu’il vise, jamais « Réception »', () => {
    expect(lireEtatUrl('?etiquette=envoyes').etiquette).toEqual({ sorte: 'envoyes', evenementId: null });
    expect(lireEtatUrl('?etiquette=carte-12').etiquette).toEqual({ sorte: 'carte', evenementId: 12 });
    expect(lireEtatUrl('?fil=4321').filOuvert).toBe(4321);
    expect(lireEtatUrl('?ecran=annuaire').ecran).toBe('annuaire');
    // …et l'étiquette par défaut ne s'applique qu'à la boîte : l'écran partagé garde « À classer ».
    expect(lireEtatUrl('?ecran=partage').etiquette).toEqual(ETIQUETTE_ARRIVEE);
  });
});

describe('l’étiquette d’arrivée, et ce qu’elle promet', () => {
  /**
   * 🔴 LOT ERGO-BOITE — ON ARRIVE DÉSORMAIS SUR « RÉCEPTION », plus sur « À classer ». Décision d'Arno du
   * 27/09/2026 : c'est le courrier reçu qu'il ouvre en arrivant. `ETIQUETTE_ARRIVEE` garde son sens — c'est
   * l'étiquette de l'ÉCRAN PARTAGÉ, la file de tri — et n'est plus celle de la boîte.
   */
  it('entrer dans la boîte mène à « Réception » ; l’écran partagé garde « À classer »', () => {
    expect(ETIQUETTE_ARRIVEE).toEqual({ sorte: 'a_classer', evenementId: null });
    expect(lireEtatUrl('?ecran=boite').etiquette).toEqual(ETIQUETTE_RECEPTION);
    expect(lireEtatUrl('').etiquette).toEqual(ETIQUETTE_RECEPTION);
    expect(lireEtatUrl('?ecran=partage').etiquette).toEqual(ETIQUETTE_ARRIVEE);
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
    // LOT ERGO-BOITE — `etat()` part du défaut, qui EST « Réception » : on compare donc à une AUTRE étiquette,
    //   sans quoi le test comparerait un état avec lui-même et passerait pour de mauvaises raisons.
    expect(memeEtat(etat({ ecran: 'boite' }), etat({ ecran: 'boite', etiquette: ETIQUETTE_ARRIVEE }))).toBe(false);
    expect(memeEtat(etat({ ecran: 'boite' }), etat({ ecran: 'evenements' }))).toBe(false);
    expect(memeEtat(etat({ ecran: 'boite' }), etat({ ecran: 'boite', filOuvert: 3 }))).toBe(false);
  });

  it('hors de la boîte, l’étiquette ne compte pas — sinon deux adresses désigneraient le même écran', () => {
    expect(memeEtat(etat({ ecran: 'partage', etiquette: carte(1) }), etat({ ecran: 'partage', etiquette: carte(2) }))).toBe(true);
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LOT MESSAGE-CLIQUÉ — `?fil=354&message=…`
 *
 * CE QUE CE BLOC PROTÈGE : que le message qu'on lisait SURVIVE au rechargement et au bouton « Précédent ». Sans ce
 * paramètre, l'adresse ne désigne que l'échange, et recharger rouvrirait son dernier message — pas celui qu'on
 * était venu lire, ni celui qu'on vient d'envoyer à un collègue.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴 le message visé dans l’adresse', () => {
  it('lu et rendu tel quel quand un échange est ouvert', () => {
    const e = lireEtatUrl('?fil=354&message=8123');
    expect(e.filOuvert).toBe(354);
    expect(e.messageOuvert).toBe(8123);
  });

  it('écrit avec son échange — le rechargement rouvre le MÊME message', () => {
    expect(ecrireEtatUrl(etat({ ecran: 'boite', filOuvert: 354, messageOuvert: 8123 })))
      .toBe('?fil=354&message=8123');
    // Aller-retour : lire puis réécrire redonne exactement la même adresse (règle ② du fichier).
    expect(ecrireEtatUrl(lireEtatUrl('?fil=354&message=8123'))).toBe('?fil=354&message=8123');
  });

  /** ⚠️ IL NE VAUT RIEN SANS SON ÉCHANGE, et c'est vérifié aux deux bouts : ni lu, ni écrit. */
  it('un `?message=` ORPHELIN ne désigne rien — ni à la lecture, ni à l’écriture', () => {
    expect(lireEtatUrl('?message=8123').messageOuvert).toBeNull();
    expect(ecrireEtatUrl(etat({ ecran: 'boite', filOuvert: null, messageOuvert: 8123 }))).toBe('');
  });

  it('absent ou abîmé → aucun message visé, jamais une erreur : l’échange s’ouvre normalement', () => {
    expect(lireEtatUrl('?fil=354').messageOuvert).toBeNull();
    expect(lireEtatUrl('?fil=354&message=0').messageOuvert).toBeNull();
    expect(lireEtatUrl('?fil=354&message=abc').messageOuvert).toBeNull();
    expect(lireEtatUrl('?fil=354&message=-3').messageOuvert).toBeNull();
    // …et l'échange, lui, reste bel et bien ouvert dans les quatre cas.
    expect(lireEtatUrl('?fil=354&message=abc').filOuvert).toBe(354);
  });

  /**
   * 🔴 DEUX MESSAGES DU MÊME ÉCHANGE SONT DEUX ENDROITS DIFFÉRENTS. Sans cela, passer de l'un à l'autre écraserait
   * l'entrée d'historique (`replaceState`) et « Précédent » ne ramènerait pas au message d'où l'on vient.
   */
  it('changer de message visé CHANGE l’écran — « Précédent » doit y ramener', () => {
    const a = etat({ ecran: 'boite', filOuvert: 354, messageOuvert: 8123 });
    expect(memeEtat(a, etat({ ecran: 'boite', filOuvert: 354, messageOuvert: 8124 }))).toBe(false);
    expect(memeEtat(a, etat({ ecran: 'boite', filOuvert: 354, messageOuvert: 8123 }))).toBe(true);
    // Sans échange ouvert, il ne désigne rien : il ne doit pas non plus distinguer deux écrans.
    expect(memeEtat(etat({ filOuvert: null, messageOuvert: 1 }), etat({ filOuvert: null, messageOuvert: 2 }))).toBe(true);
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

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 4 — LE JETON DE RETOUR À « L'HISTORIQUE DU BIEN »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 le jeton de retour (hdb)', () => {
  /**
   * DEMANDE D'ARNO (05/10/2026) : « L'état vit dans l'adresse de la page (paramètres d'URL) pour survivre au
   * retour. » Ce qui voyage est un JETON — une clé courte et anonyme — et non l'état lui-même : l'état porte les
   * adresses des personnes cochées et le texte de recherche, que ce dépôt refuse d'écrire dans une adresse.
   */
  it('🔴 il se lit et s’écrit sur les DEUX écrans du va-et-vient', () => {
    const a = lireEtatUrl('?ecran=annuaire&fiche=lot-31&hdb=abc123');
    expect(a.hdb).toBe('abc123');
    expect(ecrireEtatUrl(a)).toContain('hdb=abc123');

    const b = lireEtatUrl('?ecran=boite&fil=12&hdb=abc123');
    expect(b.hdb).toBe('abc123');
    expect(ecrireEtatUrl(b)).toContain('hdb=abc123');
  });

  /** ⚠️ ET NULLE PART AILLEURS : un jeton traîné sur un écran qui n'en fait rien est un paramètre mort. */
  it('⚠️ il ne vaut rien sur les autres écrans', () => {
    expect(lireEtatUrl('?ecran=historique&cible=lot-31&hdb=abc123').hdb).toBeNull();
    expect(lireEtatUrl('?ecran=a_trier&hdb=abc123').hdb).toBeNull();
    expect(ecrireEtatUrl({ ...ETAT_DEFAUT, ecran: 'historique', cible: 'lot-31', hdb: 'abc123' }))
      .not.toContain('hdb=');
  });

  /**
   * 🔴🔴 IL EST NETTOYÉ PAR UNE LISTE BLANCHE. Ce jeton sert de clé dans le `sessionStorage` : une valeur venue
   * de l'adresse ne doit pas pouvoir y désigner autre chose que ce qu'on y a rangé. Filtrer ce qui est PERMIS
   * ferme la question ; filtrer ce qui est interdit la rouvre à chaque idée neuve.
   */
  it('🔴🔴 une valeur abîmée vaut null, et n’ouvre jamais une erreur', () => {
    for (const v of ['', '   ', 'a b', 'a/b', '../../etc', 'a:b', '<x>', 'é', 'x'.repeat(65)]) {
      expect(jetonPropre(v)).toBeNull();
      expect(lireEtatUrl(`?ecran=annuaire&fiche=lot-31&hdb=${encodeURIComponent(v)}`).hdb).toBeNull();
    }
    expect(jetonPropre('A-1b2C3')).toBe('A-1b2C3');
    expect(jetonPropre('x'.repeat(64))).toBe('x'.repeat(64));
  });

  /**
   * 🔴🔴 `hdb` N'ENTRE PAS DANS `memeEtat`, ET C'EST TOUT LE MÉCANISME. Le jeton ne dit pas quel ÉCRAN on
   * regarde : le compter aurait empilé une entrée d'historique au moment où le bloc pose son jeton, et
   * « Précédent » aurait alors ramené à la même fiche SANS son état — exactement le défaut qu'Arno signale.
   */
  it('🔴🔴 poser un jeton ne change pas d’écran', () => {
    const avant = lireEtatUrl('?ecran=annuaire&fiche=lot-31');
    expect(memeEtat(avant, { ...avant, hdb: 'abc123' })).toBe(true);
  });
});
