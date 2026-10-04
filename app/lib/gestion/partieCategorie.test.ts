import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  categorieParDefaut, categorieRetenue, coteDeLaCategorie, libelleDuCote, motCartesRepliees,
  replierLesCartes, sertALAutomatisation, LIBELLE_CARTE_AUTO, LIBELLE_CONTACT_LOCATAIRE,
  LIBELLE_CONTACT_PROPRIETAIRE, LIBELLE_INDEPENDANT_PROPOSE, SEUIL_REPLI_CARTES,
} from './partieCategorie';
import type { Categorie, Origine } from './partieCategorie';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-1 — LA RÈGLE DES TROIS CATÉGORIES DE PARTIES ════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'ARNO A DÉCIDÉ (04/10/2026), ET QUI EST LA RAISON D'ÊTRE DE CE FICHIER.
 *
 * Trois catégories de parties, et un contact n'est JAMAIS un client : côté propriétaire (le client + ses CONTACTS),
 * côté locataire (le client + ses CONTACTS), et INDÉPENDANT — diagnostiqueurs, artisans, prestataires — catégorie
 * GLOBALE, rangée une fois pour tous les biens et JAMAIS rattachée à un bien. Plus une liste « À répartir ».
 *
 * 🔒 LE GARDE LE PLUS IMPORTANT, ET IL EST ÉCRIT ICI : un indépendant — proposé OU vérifié — ne sert JAMAIS à
 * l'automatisation. Aucune déduction de bien, aucun rattachement automatique à partir de son adresse.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * 🔴 LE CODE SANS SES COMMENTAIRES. Un encadré qui EXPLIQUE ce qu'il interdit doit pouvoir l'écrire en clair sans
 * faire échouer un garde — précédent écrit dans `uneSeuleRegleDuLienDeBien.guard.test.ts`, et repayé ici.
 */
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 LA RÈGLE À TROIS ÉTAGES, CAS PAR CAS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① la règle par défaut, à trois étages', () => {
  /**
   * 🔴 ÉTAGE ① — PLUSIEURS BIENS ⇒ INDÉPENDANT PROPOSÉ, et il passe AVANT la règle des conversations.
   *
   * Les quatre cas mesurés le 04/10/2026 sont joués ici, avec leur nombre de biens réel : c'est ce passage en
   * premier qui sort 312 paires du mauvais tiroir et ramène les cartes de 750 à 485.
   */
  it.each([
    ['gdsproprete@gmail.com (société de ménage)', 40],
    ['assistance@wipimo.fr (éditeur du logiciel)', 31],
    ['noreply@emailing.caf.fr (la CAF)', 12],
    ['deux biens seulement, le minimum de l’étage ①', 2],
  ])('🔴 %s sur %i biens → indépendant PROPOSÉ', (_nom, biens) => {
    /* ⚠️ ET LES SIGNAUX DE CONVERSATION SONT IGNORÉS, quels qu'ils soient : l'étage ① ne les consulte pas. */
    for (const prop of [true, false]) {
      for (const loc of [true, false]) {
        expect(categorieParDefaut({
          biensDeLAdresse: biens as number, parleAvecProprietaire: prop, parleAvecLocataire: loc,
        })).toEqual({ categorie: 'independant', origine: 'propose' });
      }
    }
  });

  /**
   * 🔴 ÉTAGE ② — UN SEUL BIEN, UN SEUL INTERLOCUTEUR ⇒ LE CÔTÉ DE CET INTERLOCUTEUR, origine `defaut`.
   *
   * ⚠️ `defaut` ET NON `propose` : la distinction est utile et mesurable. Un indépendant est une PROPOSITION à
   * vérifier (le signal « plusieurs biens » est fort mais pas une preuve) ; un contact déduit d'une conversation
   * est un rangement par défaut, qu'on ne met pas en avant comme une alerte.
   */
  it('🔴 un seul bien + parle avec le propriétaire → contact du propriétaire', () => {
    expect(categorieParDefaut({
      biensDeLAdresse: 1, parleAvecProprietaire: true, parleAvecLocataire: false,
    })).toEqual({ categorie: 'proprietaire', origine: 'defaut' });
  });

  it('🔴 un seul bien + parle avec le locataire → contact du locataire', () => {
    expect(categorieParDefaut({
      biensDeLAdresse: 1, parleAvecProprietaire: false, parleAvecLocataire: true,
    })).toEqual({ categorie: 'locataire', origine: 'defaut' });
  });

  /**
   * 🔴🔴 ÉTAGE ③ — LES DEUX, OU AUCUN ⇒ « À RÉPARTIR ». Les deux cas sont des aveux, pas des erreurs, et les deux
   * ont été mesurés : `louisvaglio@live.fr` (lot 104) parle avec les deux, `sandeep.chawla@capgemini.com`
   * (lot 119) avec aucun des deux.
   *
   * ⚠️ TÉMOIN NÉGATIF INDISPENSABLE : « aucun des deux » ne doit PAS retomber côté propriétaire faute de mieux.
   * Ce serait inventer une relation, et personne ne le verrait — la carte aurait l'air normale.
   */
  it('🔴🔴 un seul bien + parle avec LES DEUX → à répartir', () => {
    expect(categorieParDefaut({
      biensDeLAdresse: 1, parleAvecProprietaire: true, parleAvecLocataire: true,
    })).toEqual({ categorie: 'a_repartir', origine: 'defaut' });
  });

  it('🔴🔴 un seul bien + parle avec AUCUN des deux → à répartir, jamais « propriétaire par défaut »', () => {
    const r = categorieParDefaut({
      biensDeLAdresse: 1, parleAvecProprietaire: false, parleAvecLocataire: false,
    });
    expect(r).toEqual({ categorie: 'a_repartir', origine: 'defaut' });
    expect(r.categorie).not.toBe('proprietaire');
    expect(r.categorie).not.toBe('locataire');
  });

  /**
   * ⚠️ ZÉRO BIEN NE PEUT PAS DEVENIR UN INDÉPENDANT. Le cas ne devrait pas arriver (une paire vient forcément d'un
   * bien), mais si un appelant passait 0, l'étage ① ne doit pas se déclencher : `0 > 1` est faux, et c'est la règle
   * des conversations qui répond. Figé pour qu'un `>=` posé par distraction fasse rougir ce test.
   */
  it('⚠️ zéro bien ne déclenche pas l’étage ① (témoin négatif de la comparaison)', () => {
    expect(categorieParDefaut({
      biensDeLAdresse: 0, parleAvecProprietaire: true, parleAvecLocataire: false,
    })).toEqual({ categorie: 'proprietaire', origine: 'defaut' });
    expect(categorieParDefaut({
      biensDeLAdresse: 1, parleAvecProprietaire: true, parleAvecLocataire: false,
    }).categorie).toBe('proprietaire');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔒🔒 LE GARDE D'AUTOMATISATION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒🔒 ② un indépendant ne sert JAMAIS à l’automatisation', () => {
  /**
   * 🔒🔒 L'ASSERTION CENTRALE DU LOT. `false` pour `independant`, et il ne dépend d'AUCUNE origine : proposé,
   * posé par défaut ou vérifié à la main, la réponse est la même.
   */
  it('🔒🔒 sertALAutomatisation(« independant ») est faux — proposé comme vérifié', () => {
    expect(sertALAutomatisation('independant')).toBe(false);
    /* La fonction ne PREND PAS d'origine, exprès : il n'y a aucun paramètre par lequel l'ouvrir. */
    expect(sertALAutomatisation.length).toBe(1);
  });

  /**
   * 🔒 « À RÉPARTIR » NON PLUS, et pour une autre raison : on ne sait pas encore de qui c'est le contact. Une
   * automatisation là-dessus devinerait au hasard entre deux parties.
   */
  it('🔒 « a_repartir » ne sert pas davantage', () => {
    expect(sertALAutomatisation('a_repartir')).toBe(false);
  });

  /** ⚠️ LE TÉMOIN POSITIF : les deux catégories de CONTACT, elles, sont exploitables — sinon le garde ne dirait rien. */
  it('⚠️ les contacts du propriétaire et du locataire, eux, servent', () => {
    expect(sertALAutomatisation('proprietaire')).toBe(true);
    expect(sertALAutomatisation('locataire')).toBe(true);
  });

  /**
   * 🔒 VU DE L'ÉCRAN, LA MÊME RÈGLE : aucune carte n'est créée pour un indépendant ni pour un « à répartir ».
   * `coteDeLaCategorie` rend `null`, et c'est ce `null` que la reprise filtre avant d'écrire une carte.
   */
  it('🔒 aucun côté d’affichage pour un indépendant ni pour un « à répartir »', () => {
    expect(coteDeLaCategorie('independant')).toBeNull();
    expect(coteDeLaCategorie('a_repartir')).toBeNull();
    expect(coteDeLaCategorie('proprietaire')).toBe('proprietaire');
    expect(coteDeLaCategorie('locataire')).toBe('locataire');
  });

  /**
   * 🔒🔒 GARDE DE SOURCE — LA PASSE DE RATTACHEMENT NE NOMME NULLE PART LA TABLE DES CATÉGORIES.
   *
   * 🔴 C'EST LE GARDE QUI TIENT LA PROMESSE, et pas seulement la fonction ci-dessus : `sertALAutomatisation` ne
   * protège que le code qui pense à l'appeler. Ce test-là échoue si l'automatisation apprend à LIRE les catégories
   * — par où qu'elle s'y prenne —, c'est-à-dire si quelqu'un, un jour, décide « puisqu'on sait que cette adresse
   * est le contact du propriétaire du lot 504, déduisons le bien ». Même pour un contact légitime, cette déduction
   * n'est pas décidée, et pour un indépendant elle rattacherait le courrier de la société de ménage à 40 logements.
   */
  it('🔒🔒 ni la passe de rattachement ni le relevé des adresses ne lisent les catégories', () => {
    const SURVEILLES = [
      'app/lib/gestion/rattachement.ts',
      'app/lib/gestion/rattachementRepo.ts',
      'app/lib/gestion/adressesMessage.ts',
      'app/lib/gestion/adressesRepo.ts',
      'app/lib/gestion/propositionsBien.ts',
      'app/lib/gestion/propositionRepo.ts',
    ];
    for (const fichier of SURVEILLES) {
      const source = readFileSync(fichier, 'utf8');
      for (const interdit of ['gestion_partie_categorie', 'gestion_contact_carte', 'partieCategorieRepo']) {
        expect(source, `${fichier} nomme ${interdit}`).not.toContain(interdit);
      }
    }
  });

  /**
   * 🔒 ET LA RÈGLE EST PURE : elle est lue par le navigateur ET par le serveur, et doit répondre pareil. Un
   * `fetch`, un `SELECT` ou un `useState` ici voudrait dire que la règle a deux visages.
   */
  it('🔒 le module de la règle ne sait ni lire ni écrire', () => {
    /**
     * 🔴 ON RETIRE LES COMMENTAIRES AVANT DE CHERCHER, et cette leçon a déjà été payée deux fois dans ce dépôt
     * (`uneSeuleRegleDuLienDeBien.guard.test.ts` l'écrit en toutes lettres) : l'encadré du module EXPLIQUE qu'il
     * n'a pas de `server-only`, donc il écrit le mot — et le garde se dénonçait lui-même.
     */
    const pur = sansCommentaires(readFileSync('app/lib/gestion/partieCategorie.ts', 'utf8'));
    for (const mot of ['fetch(', 'SELECT ', 'UPDATE ', 'INSERT ', 'useState', "from 'react'", 'server-only',
      "from '../db/", 'node:fs']) {
      expect(pur, mot).not.toContain(mot);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 UN CONTACT N'EST PAS UN CLIENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ un contact n’est jamais un client', () => {
  /**
   * 🔴🔴 LES COMPTEURS DE LA FICHE NE LISENT PAS CES TABLES. « PROPRIÉTAIRE N » et « LOCATAIRE EN PLACE N »
   * comptent des CLIENTS, lus dans l'annuaire WIPPIMMO ; un contact du propriétaire n'en est pas un, et ne doit
   * donc jamais faire bouger le nombre affiché.
   *
   * ⚠️ C'EST UN GARDE DE SOURCE, et c'est le seul moyen honnête de le prouver sans base : la fiche calcule ses
   * compteurs ailleurs, et il suffirait d'un `+ cartes.length` pour que le nombre mente. Le test échoue le jour où
   * la fiche apprend à lire les contacts.
   */
  it('🔴🔴 la fiche de bien ne compte aucun contact parmi ses clients', () => {
    for (const fichier of ['app/lib/gestion/ficheBien.ts', 'app/lib/gestion/annuaireRepo.ts',
      'app/lib/gestion/annuaireContenuRepo.ts']) {
      const source = readFileSync(fichier, 'utf8');
      for (const interdit of ['gestion_partie_categorie', 'gestion_contact_carte', 'partieCategorieRepo']) {
        expect(source, `${fichier} nomme ${interdit}`).not.toContain(interdit);
      }
    }
  });

  /**
   * 🔴🔴 `roleLocataireALaDate` N'EST PAS AFFECTÉ. Le rôle d'un locataire à la date d'un mail se déduit des
   * OCCUPATIONS de l'annuaire (entrée / sortie), et de rien d'autre. Un contact du locataire — sa sœur, son
   * assureur — ne doit jamais devenir « locataire occupant » parce qu'il a écrit pendant le bail.
   *
   * Le module qui porte ce rôle est `contactExterne.ts` : il ne connaît pas les catégories, et ne doit pas les
   * apprendre.
   */
  it('🔴🔴 le rôle du locataire à une date ignore totalement les catégories', () => {
    const source = readFileSync('app/lib/gestion/contactExterne.ts', 'utf8');
    expect(source).toContain('roleLocataireALaDate');
    for (const interdit of ['gestion_partie_categorie', 'gestion_contact_carte', 'partieCategorie']) {
      expect(source, `contactExterne.ts nomme ${interdit}`).not.toContain(interdit);
    }
  });

  /**
   * 🔴 ET LE MODULE DE LA RÈGLE N'OFFRE AUCUNE PORTE : pas de fonction qui rendrait un statut, un badge ou un
   * compteur de clients. On ne peut pas la brancher par erreur sur une fiche — il n'y a rien à brancher.
   */
  it('🔴 la règle n’expose ni statut, ni badge, ni compteur de clients', () => {
    const pur = readFileSync('app/lib/gestion/partieCategorie.ts', 'utf8');
    for (const interdit of ['export function statut', 'export function badge', 'export function compter',
      'export function estProprietaire', 'export function estLocataire']) {
      expect(pur, interdit).not.toContain(interdit);
    }
  });

  /**
   * ⚠️ LES LIBELLÉS DISENT « CONTACT DE », ET C'EST CE MOT QUI TIENT LA DISTINCTION À L'ÉCRAN. « PROPRIÉTAIRE »
   * tout court sur une carte de contact serait un mensonge d'affichage — exactement celui que ce lot évite.
   */
  it('⚠️ les libellés disent « CONTACT DU … », jamais « PROPRIÉTAIRE » seul', () => {
    expect(LIBELLE_CONTACT_PROPRIETAIRE).toBe('CONTACT DU PROPRIÉTAIRE');
    expect(LIBELLE_CONTACT_LOCATAIRE).toBe('CONTACT DU LOCATAIRE');
    expect(LIBELLE_CONTACT_PROPRIETAIRE.startsWith('CONTACT DU ')).toBe(true);
    expect(LIBELLE_CONTACT_LOCATAIRE.startsWith('CONTACT DU ')).toBe(true);
    expect(libelleDuCote('proprietaire')).toBe(LIBELLE_CONTACT_PROPRIETAIRE);
    expect(libelleDuCote('locataire')).toBe(LIBELLE_CONTACT_LOCATAIRE);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ 🔴🔴 LA RÉSOLUTION — LE MANUEL L'EMPORTE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ④ ce qui vaut quand deux lignes parlent de la même adresse', () => {
  const r = (categorie: Categorie, origine: Origine) => ({ categorie, origine });

  /**
   * 🔴🔴 LE CAS RÉEL, ET IL EST LA RAISON DE L'ORDRE. `jcordel@mavimmo.fr` est une AUTRE AGENCE, rangée
   * `independant` À LA MAIN en global. La règle par défaut, elle, voudrait la poser « contact du propriétaire » sur
   * le lot 504. Si le « plus spécifique » passait avant le manuel, l'erreur corrigée à la main reviendrait.
   */
  it('🔴🔴 un manuel GLOBAL bat une ligne par défaut POSÉE SUR LE BIEN', () => {
    expect(categorieRetenue({
      parBien: r('proprietaire', 'defaut'),
      globale: r('independant', 'manuel'),
    })).toEqual(r('independant', 'manuel'));
  });

  /** 🔴 ET DANS L'AUTRE SENS : un manuel par bien bat une proposition globale. */
  it('🔴 un manuel PAR BIEN bat une proposition globale', () => {
    expect(categorieRetenue({
      parBien: r('locataire', 'manuel'),
      globale: r('independant', 'propose'),
    })).toEqual(r('locataire', 'manuel'));
  });

  /**
   * ⚠️ DEUX MANUELS NE S'ANNULENT PAS : le plus spécifique gagne. « En général c'est un prestataire, MAIS sur ce
   * bien précis c'est le contact du propriétaire » est une phrase cohérente — le gardien de l'immeuble du lot 155.
   */
  it('⚠️ deux manuels : le plus spécifique gagne', () => {
    expect(categorieRetenue({
      parBien: r('proprietaire', 'manuel'),
      globale: r('independant', 'manuel'),
    })).toEqual(r('proprietaire', 'manuel'));
  });

  /** 🔴 À ÉGALITÉ D'ORIGINE, LE PLUS SPÉCIFIQUE : la ligne du bien bat la ligne globale. */
  it('🔴 sans manuel, la ligne du bien bat la globale', () => {
    expect(categorieRetenue({
      parBien: r('locataire', 'defaut'),
      globale: r('independant', 'propose'),
    })).toEqual(r('locataire', 'defaut'));
  });

  /** ⚠️ UNE SEULE LIGNE SUFFIT, d'un côté comme de l'autre. */
  it('⚠️ une seule ligne répond seule', () => {
    expect(categorieRetenue({ parBien: r('proprietaire', 'defaut'), globale: null }))
      .toEqual(r('proprietaire', 'defaut'));
    expect(categorieRetenue({ parBien: null, globale: r('independant', 'propose') }))
      .toEqual(r('independant', 'propose'));
  });

  /**
   * 🔴 PERSONNE NE S'EST PRONONCÉ ⇒ `null`, ET SURTOUT PAS UNE CATÉGORIE INVENTÉE. C'est ce `null` qui dit à
   * l'appelant d'appliquer `categorieParDefaut` — rendre « a_repartir » ici aurait confondu « on a tranché que
   * c'est indécidable » et « on n'a pas encore regardé ».
   */
  it('🔴 rien de rangé → null, jamais une catégorie devinée', () => {
    expect(categorieRetenue({ parBien: null, globale: null })).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ LE REPLI AU-DELÀ DE SIX
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ⑤ le repli des cartes créées automatiquement', () => {
  /** 🔴 LE SEUIL EST SIX, et c'est la décision d'Arno : on replie AU-DELÀ, donc à sept. */
  it('🔴 six tiennent à l’écran, sept se replient', () => {
    expect(SEUIL_REPLI_CARTES).toBe(6);
    expect(replierLesCartes(6)).toBe(false);
    expect(replierLesCartes(7)).toBe(true);
    /* ⚠️ LES TÉMOINS DES DEUX CÔTÉS : un `>=` posé par distraction replierait à six, et ce test le dirait. */
    expect(replierLesCartes(0)).toBe(false);
    expect(replierLesCartes(1)).toBe(false);
    expect(replierLesCartes(5)).toBe(false);
  });

  /**
   * 🔴 LE CAS QUI A MOTIVÉ LA DÉCISION : le lot 155 et ses 55 cartes. 130 mails, 41 conversations, une affaire qui
   * concerne tout l'immeuble — « 55 cartes dans un carrousel seraient inutilisables ».
   */
  it('🔴 le lot 155 et ses 55 cartes se replient, avec leur nombre écrit', () => {
    expect(replierLesCartes(55)).toBe(true);
    expect(motCartesRepliees(55)).toBe('55 contacts créés automatiquement — à vérifier');
  });

  it('🔴 le mot du repli, au mot près', () => {
    expect(motCartesRepliees(7)).toBe('7 contacts créés automatiquement — à vérifier');
    expect(motCartesRepliees(14)).toBe('14 contacts créés automatiquement — à vérifier');
  });

  /**
   * ⚠️ LE SINGULIER N'ARRIVE JAMAIS EN PRATIQUE (on ne replie qu'au-delà de six) mais il est écrit : un libellé qui
   * dit « 1 contacts » est le genre de détail qui fait douter de tout le reste.
   */
  it('⚠️ le singulier est correct, même s’il ne s’affiche jamais', () => {
    expect(motCartesRepliees(1)).toBe('1 contact créé automatiquement — à vérifier');
    expect(motCartesRepliees(0)).toBe('0 contact créé automatiquement — à vérifier');
    /* ⚠️ Et une entrée absurde ne produit ni « -3 » ni « 2.5 » : on borne, on ne lève pas. */
    expect(motCartesRepliees(-3)).toBe('0 contact créé automatiquement — à vérifier');
    expect(motCartesRepliees(7.9)).toBe('7 contacts créés automatiquement — à vérifier');
  });

  /** ⚠️ LA TRAME D'UNE CARTE AUTOMATIQUE PROMET DEUX CHOSES, parce que les deux manquent : vérifier ET compléter. */
  it('⚠️ la mention d’une carte automatique, au mot près', () => {
    expect(LIBELLE_CARTE_AUTO).toBe('Créée automatiquement — à vérifier et compléter');
    expect(LIBELLE_INDEPENDANT_PROPOSE).toBe('Indépendant proposé — à vérifier');
    /* 🔴 LES DEUX MENTIONS SONT DISTINCTES : l'une annonce un rangement à confirmer, l'autre un contenu à finir. */
    expect(LIBELLE_CARTE_AUTO).not.toBe(LIBELLE_INDEPENDANT_PROPOSE);
  });
});
