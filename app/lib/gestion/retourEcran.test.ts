import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  decisionRetour, lireMemoire, memoirePour, parentDe, repliDe, MEMOIRE_VIDE, type MemoireEntree,
} from './retourEcran';
import {
  ETAT_DEFAUT, ETIQUETTE_ARRIVEE, ETIQUETTE_RECEPTION, memeEtat, type EtatEcranUrl,
} from './ecranUrl';

/**
 * ══ 🔴🔴 LOT FLECHES-RETOUR — LES HUIT CAS D'ARNO, UN PAR UN ═══════════════════════════════════════════════════
 *
 * RÈGLE : « Toute flèche ou tout bouton de retour ramène à l'ÉCRAN PRÉCÉDENT réellement visité, dans l'état exact
 * où on l'a quitté […]. Jamais vers une destination fixe (accueil, Réception…) quand on venait d'ailleurs. »
 *
 * ═══ POURQUOI UN PETIT NAVIGATEUR DE PAPIER ═════════════════════════════════════════════════════════════════════
 *
 * Le mécanisme est fait de deux fonctions pures et de QUATRE LIGNES dans `GestionVue` : ranger une mémoire dans
 * l'entrée d'historique en partant, la relire en revenant. Le `Navigateur` ci-dessous rejoue ces quatre lignes,
 * sans rien inventer — même ordre, mêmes appels. C'est ce qui permet d'éprouver des PARCOURS (« À rattacher →
 * mail → ← ») et pas seulement des fonctions, sans monter une page entière ni un navigateur.
 *
 * ⚠️ ET UN GARDE DE CÂBLAGE, à la fin : il lit `GestionVue.tsx` et vérifie que les flèches passent bien par le
 * retour commun. Sans lui, ce fichier prouverait une mécanique que l'écran pourrait très bien ne pas employer.
 */

const boite = (o: Partial<EtatEcranUrl> = {}): EtatEcranUrl => ({ ...ETAT_DEFAUT, ...o });

/** La boîte, sur « Réception », avec le filtre étoile. */
const RECEPTION_ETOILE = boite({ etoile: true });
/** La file « À rattacher ». */
const A_RATTACHER = boite({ ecran: 'a_trier' });
/** L'annuaire, sans fiche ouverte. */
const ANNUAIRE = boite({ ecran: 'annuaire' });

/**
 * L'HISTORIQUE DU NAVIGATEUR, RÉDUIT À CE QUI COMPTE : une pile d'entrées, un curseur, et un objet de mémoire par
 * entrée. `aller` et `retour` reproduisent EXACTEMENT ce que fait `GestionVue`.
 */
class Navigateur {
  private readonly pile: { etat: EtatEcranUrl; memoire: MemoireEntree }[];
  private i = 0;
  /** Vrai quand le dernier retour a reculé dans l'historique — c'est-à-dire quand « ← » a fait « Précédent ». */
  public aRecule = false;

  constructor(depart: EtatEcranUrl, memoire: MemoireEntree = MEMOIRE_VIDE) {
    this.pile = [{ etat: depart, memoire }];
  }

  get etat(): EtatEcranUrl { return this.pile[this.i].etat; }
  get memoire(): MemoireEntree { return this.pile[this.i].memoire; }
  /** Combien d'entrées vivent derrière le curseur : de quoi vérifier qu'un retour n'empile pas au lieu de reculer. */
  get profondeur(): number { return this.i; }

  aller(suivant: EtatEcranUrl): void {
    const memoire = memoirePour(this.etat, suivant, this.memoire);
    if (memeEtat(this.etat, suivant)) { this.pile[this.i] = { etat: suivant, memoire }; return; }
    this.pile.length = this.i + 1;           // partir en avant efface ce qui était « Suivant », comme un vrai navigateur
    this.pile.push({ etat: suivant, memoire });
    this.i += 1;
  }

  retour(): void {
    const d = decisionRetour(this.etat, this.memoire);
    this.aRecule = d.sorte === 'reculer';
    if (d.sorte === 'reculer') { this.precedent(); return; }
    this.aller(d.etat);
  }

  precedent(): void { if (this.i > 0) this.i -= 1; }
  suivantNavigateur(): void { if (this.i < this.pile.length - 1) this.i += 1; }
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LA BOÎTE : DOSSIER, FILTRE, RECHERCHE, POSITION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('① depuis la boîte : le dossier et ses filtres sont rendus', () => {
  /**
   * 🔴 « Réception page 3, filtre étoile → ouvrir un mail → ← : retour page 3, filtre étoile, même position. »
   *
   * ⚠️ LA PAGE ET LE DÉFILEMENT NE SONT PAS DANS L'ADRESSE, et c'est délibéré : ils sont rendus par le RECUL dans
   * l'historique (le navigateur les tient) et par la liste, qui reste montée pendant qu'on lit. L'essai vérifie
   * donc les deux choses qui en dépendent : que le retour RECULE, et qu'il rend l'état exact du dossier.
   */
  it('🔴 un mail ouvert depuis « Réception » étoilée : « ← » recule et rend le dossier étoilé', () => {
    const n = new Navigateur(RECEPTION_ETOILE);
    n.aller({ ...RECEPTION_ETOILE, filOuvert: 36558, messageOuvert: 57392 });

    n.retour();
    expect(n.aRecule).toBe(true);                       // → le navigateur rend la position de défilement lui-même
    expect(n.etat).toEqual(RECEPTION_ETOILE);
    expect(n.etat.etoile).toBe(true);
    expect(n.profondeur).toBe(0);                       // on a reculé, on n'a pas empilé un écran de plus
  });

  /** 🔴 « Recherche “scan” → ouvrir un résultat → ← : retour aux résultats de “scan”. » */
  it('🔴 un résultat de recherche : « ← » recule, donc la recherche reste à l’écran', () => {
    // Le texte cherché vit dans la liste, qui reste montée : ce qu'on éprouve ici, c'est que le retour RECULE —
    //   la seule façon de ne rien lui faire perdre.
    const n = new Navigateur(boite());
    n.aller({ ...boite(), filOuvert: 4242, messageOuvert: 99 });
    n.retour();
    expect(n.aRecule).toBe(true);
    expect(n.etat).toEqual(boite());
  });

  /**
   * 🔴🔴 LE DÉFAUT CONSTATÉ PAR ARNO : « À rattacher → mail → ← : retour à À rattacher, pas à Réception. »
   *
   * Avant ce lot, la flèche du mail faisait `aller({ ...étatCourant, filOuvert: null })` — or l'état courant portait
   * l'étiquette « Réception », parce que c'est elle que la file à trier passe en ouvrant un mail. On revenait donc
   * TOUJOURS dans la boîte, quelle que soit la porte par laquelle on était entré.
   */
  it('🔴🔴 depuis « À rattacher » : « ← » rend « À rattacher », jamais « Réception »', () => {
    const n = new Navigateur(A_RATTACHER);
    // La file ouvre le mail dans la boîte, sur « Réception » — c'est ce que fait `onOuvrirFil`.
    n.aller({ ...boite({ etiquette: ETIQUETTE_RECEPTION }), filOuvert: 36620, messageOuvert: 57335 });

    n.retour();
    expect(n.etat.ecran).toBe('a_trier');
    expect(n.etat).toEqual(A_RATTACHER);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② L'ANNUAIRE : LA LISTE, OU LE MAIL D'OÙ L'ON VIENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('② l’annuaire : « ← Retour » dépend d’où l’on vient', () => {
  /** 🔴 « Annuaire → fiche propriétaire → ← : retour à l'annuaire, même recherche. » */
  it('🔴 une fiche ouverte DEPUIS l’annuaire rend l’annuaire', () => {
    const n = new Navigateur(ANNUAIRE);
    n.aller({ ...ANNUAIRE, fiche: { sorte: 'proprietaire', id: 339 } });

    n.retour();
    expect(n.aRecule).toBe(true);        // reculer = la recherche tapée reste telle quelle, personne n'a à la sauver
    expect(n.etat).toEqual(ANNUAIRE);
  });

  /**
   * 🔴🔴 LE SECOND DÉFAUT CONSTATÉ PAR ARNO : « Mail → lien vers la fiche d'un bien → ← : retour au mail. »
   *
   * Avant ce lot, le bouton avait DEUX destinations fixes — la liste de l'annuaire si une fiche était ouverte, la
   * boîte sinon — et aucune des deux n'était le mail.
   */
  it('🔴🔴 une fiche ouverte DEPUIS un mail rend le mail, pas la liste de l’annuaire', () => {
    const mail = { ...boite(), filOuvert: 36558, messageOuvert: 57392 };
    const n = new Navigateur(mail);
    n.aller({ ...ANNUAIRE, fiche: { sorte: 'lot', id: 260 } });

    n.retour();
    expect(n.etat.ecran).toBe('boite');
    expect(n.etat.filOuvert).toBe(36558);
    expect(n.etat.messageOuvert).toBe(57392);          // le MÊME mail, pas seulement le même échange
  });

  /** ⚠️ ET D'UNE FICHE À L'AUTRE, LE PARENT NE BOUGE PAS : on reste au même niveau. */
  it('⚠️ de fiche en fiche, « ← » rend toujours l’écran d’où l’on venait', () => {
    const n = new Navigateur(ANNUAIRE);
    n.aller({ ...ANNUAIRE, fiche: { sorte: 'proprietaire', id: 339 } });
    n.aller({ ...ANNUAIRE, fiche: { sorte: 'lot', id: 260 } });

    n.retour();
    expect(n.etat).toEqual(ANNUAIRE);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ L'ADRESSE COLLÉE : UN REPLI, JAMAIS UNE PAGE VIDE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('③ ouverture directe par une adresse : le repli', () => {
  /**
   * 🔴 « Ouverture directe par URL (lien collé, nouvel onglet, sans historique dans l'appli) → ← : repli
   * raisonnable sur l'écran parent logique (ex. le dossier du mail), jamais une page vide ni la sortie de l'appli. »
   */
  it('🔴 un mail ouvert par une adresse collée : « ← » rend SON DOSSIER, filtres compris', () => {
    const colle = { ...boite({ etiquette: { sorte: 'envoyes', evenementId: null }, etoile: true }), filOuvert: 7 };
    const n = new Navigateur(colle);                 // aucune mémoire : on arrive de nulle part

    n.retour();
    expect(n.aRecule).toBe(false);                   // reculer sortirait de l'application : on ne recule pas
    expect(n.etat.filOuvert).toBeNull();
    expect(n.etat.etiquette.sorte).toBe('envoyes');  // le dossier du mail, pas « Réception »
    expect(n.etat.etoile).toBe(true);
  });

  it('🔴 une fiche d’annuaire collée rend la liste de l’annuaire', () => {
    const n = new Navigateur({ ...ANNUAIRE, fiche: { sorte: 'locataire', id: 12 } });
    n.retour();
    expect(n.etat.ecran).toBe('annuaire');
    expect(n.etat.fiche ?? null).toBeNull();
  });

  it('🔴 un écran sans rien d’ouvert rend l’écran d’arrivée du module — jamais rien', () => {
    expect(repliDe(boite({ ecran: 'historique', cible: 'lot-282' })).ecran).toBe('boite');
    expect(repliDe(boite({ ecran: 'a_trier' })).ecran).toBe('boite');
    // ⚠️ LA BOÎTE NUE EST DÉJÀ L'ÉCRAN D'ARRIVÉE : y « revenir » ne serait pas un retour, on remonte d'un cran.
    expect(repliDe(boite()).ecran).toBe('partage');
  });

  it('⚠️ une mémoire abîmée vaut une absence de mémoire : on retombe sur le repli, jamais une exception', () => {
    expect(lireMemoire(null)).toBeNull();
    expect(lireMemoire('coucou')).toBeNull();
    expect(lireMemoire({})).toBeNull();
    expect(lireMemoire({ parent: 3 })).toBeNull();
    expect(lireMemoire({ parent: { ecran: 'boite' } })).toBeNull();   // sans étiquette, ce n'est pas un état
    const bon = lireMemoire({ parent: A_RATTACHER, parentEstPrecedent: true });
    expect(bon?.parent?.ecran).toBe('a_trier');
    expect(bon?.parentEstPrecedent).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ « PRÉCÉDENT » DU NAVIGATEUR ET LA FLÈCHE DE L'ÉCRAN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('④ la flèche et le bouton « Précédent » donnent le même résultat', () => {
  it('🔴 même parcours, deux gestes, un seul résultat', () => {
    const parcours = (): Navigateur => {
      const n = new Navigateur(A_RATTACHER);
      n.aller({ ...boite(), filOuvert: 36620, messageOuvert: 57335 });
      return n;
    };
    const parLaFleche = parcours(); parLaFleche.retour();
    const parLeNavigateur = parcours(); parLeNavigateur.precedent();
    expect(parLaFleche.etat).toEqual(parLeNavigateur.etat);
  });

  /**
   * 🔴🔴 « Mail ouvert depuis Précédent/Suivant : ← retourne à la liste, pas au mail précédent. »
   *
   * C'est le cas que le DRAPEAU `parentEstPrecedent` protège : l'entrée juste avant ce mail-ci est un AUTRE mail,
   * donc reculer rendrait ce mail. Le retour va alors droit à la liste, en avant.
   */
  it('🔴🔴 d’un mail à l’autre, « ← » rend la LISTE, jamais le mail précédent', () => {
    const n = new Navigateur(RECEPTION_ETOILE);
    n.aller({ ...RECEPTION_ETOILE, filOuvert: 100, messageOuvert: 1 });
    // On passe directement au mail voisin (lien dans le fil, navigation interne) : même niveau, pas une descente.
    n.aller({ ...RECEPTION_ETOILE, filOuvert: 200, messageOuvert: 2 });

    n.retour();
    expect(n.aRecule).toBe(false);                 // reculer aurait rendu le mail 100
    expect(n.etat.filOuvert).toBeNull();
    expect(n.etat).toEqual(RECEPTION_ETOILE);
  });

  it('🔴 un mail retrouvé par « Précédent » garde son parent : « ← » rend toujours la liste', () => {
    const n = new Navigateur(A_RATTACHER);
    n.aller({ ...boite(), filOuvert: 36620, messageOuvert: 57335 });
    n.precedent();                                  // retour à « À rattacher » par le bouton du navigateur
    n.suivantNavigateur();                          // puis « Suivant » : on revient sur le mail

    n.retour();
    expect(n.etat).toEqual(A_RATTACHER);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ LA RÈGLE PURE, CAS PAR CAS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑤ `parentDe` — descendre pose un parent, se déplacer l’hérite', () => {
  const LISTE = RECEPTION_ETOILE;
  const MAIL = { ...RECEPTION_ETOILE, filOuvert: 1 };

  it('ouvrir un mail depuis une liste : le parent est la liste', () => {
    expect(parentDe(LISTE, MAIL, null)).toEqual(LISTE);
  });

  it('changer d’écran : le parent est l’écran qu’on quitte', () => {
    expect(parentDe(LISTE, ANNUAIRE, null)).toEqual(LISTE);
  });

  it('🔴 d’un mail à l’autre : le parent est HÉRITÉ, jamais remplacé', () => {
    expect(parentDe(MAIL, { ...MAIL, filOuvert: 2 }, LISTE)).toEqual(LISTE);
  });

  it('🔴 changer d’étiquette ou de filtre : on reste au même niveau, le parent ne bouge pas', () => {
    expect(parentDe(LISTE, boite({ etiquette: ETIQUETTE_ARRIVEE }), A_RATTACHER)).toEqual(A_RATTACHER);
    expect(parentDe(LISTE, boite({ etoile: false }), A_RATTACHER)).toEqual(A_RATTACHER);
  });

  it('🔴 fermer un mail par une voie programmatique remonte d’un cran, il n’ajoute pas de niveau', () => {
    // Un échange mis à la corbeille disparaît sous les yeux : la vue ferme le mail elle-même.
    expect(parentDe(MAIL, LISTE, A_RATTACHER)).toEqual(A_RATTACHER);
  });

  it('⚠️ aller là où l’on est déjà ne change rien', () => {
    expect(parentDe(LISTE, { ...LISTE }, A_RATTACHER)).toEqual(A_RATTACHER);
  });

  it('⚠️ `memoirePour` marque le parent comme « juste avant » quand c’est l’écran qu’on quitte', () => {
    expect(memoirePour(LISTE, MAIL, null)).toEqual({ parent: LISTE, parentEstPrecedent: true });
    // Hérité : le parent n'est PAS l'entrée précédente, car celle-ci est l'autre mail.
    expect(memoirePour(MAIL, { ...MAIL, filOuvert: 2 }, { parent: LISTE, parentEstPrecedent: true }))
      .toEqual({ parent: LISTE, parentEstPrecedent: false });
  });

  it('⚠️ `decisionRetour` sans parent rend le repli, avec parent voisin recule, sinon va au parent', () => {
    expect(decisionRetour(MAIL, null)).toEqual({ sorte: 'aller', etat: repliDe(MAIL) });
    expect(decisionRetour(MAIL, { parent: LISTE, parentEstPrecedent: true })).toEqual({ sorte: 'reculer' });
    expect(decisionRetour(MAIL, { parent: A_RATTACHER, parentEstPrecedent: false }))
      .toEqual({ sorte: 'aller', etat: A_RATTACHER });
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔒 LE GARDE DE CÂBLAGE — LES FLÈCHES PASSENT-ELLES VRAIMENT PAR LE RETOUR COMMUN ?
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒 un seul mécanisme, et il est bien branché', () => {
  const SOURCE = 'app/(admin)/admin/(protected)/gestion/GestionVue.tsx';
  const code = readFileSync(SOURCE, 'utf8').replace(/\s+/g, ' ');

  /**
   * 🔴 CE GARDE EXISTE PARCE QU'UN MÉCANISME COMMUN NE PROUVE RIEN S'IL N'EST PAS EMPLOYÉ. Le défaut d'origine
   * n'était pas une mauvaise fonction de retour : c'était CINQ retours écrits à la main. Rien n'empêche d'en
   * réécrire un sixième — sauf cette lecture.
   */
  it('🔴 la vue définit le retour commun et le passe aux flèches', () => {
    expect(code).toContain('const retour = useCallback(');
    expect(code).toContain('decisionRetour(courant, lireMemoire(window.history.state))');
    // La flèche de fermeture d'un mail, dans les trois endroits où une conversation s'affiche.
    expect(code).toContain('onFermerFil={retour}');
    expect((code.match(/onFerme=\{retour\}/g) ?? []).length).toBe(2);
    // Le « ← Retour » de l'annuaire.
    expect(code).toContain('onRetour={retour}');
  });

  /**
   * 🔴 ET AUCUNE FLÈCHE NE REFERME UN MAIL « À LA MAIN ». C'est la formule qui produisait le défaut d'Arno :
   * elle repart de l'étiquette COURANTE, qui n'est pas celle d'où l'on vient.
   */
  it('🔴 plus aucune flèche ne reconstruit sa destination par « étatCourant sans le fil »', () => {
    expect(code).not.toContain('onFermerFil={() => aller(');
    expect(code).not.toContain('onFerme={() => aller({ ...etatUrl, filOuvert: null })}');
  });

  it('🔴 le « ← Retour » de l’annuaire n’a plus sa double destination fixe', () => {
    const annuaire = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8')
      .replace(/\s+/g, ' ');
    expect(annuaire).not.toContain('fiche !== null ? onFiche(null) : onRetour()');
    // ⚠️ LE BOUTON RESTE, ET SA PRÉSENTATION AUSSI : c'est un choix d'Arno, pas une variable.
    expect(annuaire).toContain('ann-retour-haut');
    expect(annuaire).toContain('← Retour');
  });
});
