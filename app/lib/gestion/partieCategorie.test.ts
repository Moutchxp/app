import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  categorieParDefaut, categorieRetenue, coteDeLaCategorie, libelleDuCote, motCartesRepliees,
  replierLesCartes, sertALAutomatisation, LIBELLE_CARTE_AUTO, LIBELLE_CONTACT_LOCATAIRE,
  CONTACTS_MONTRES, motAutresContacts, motContactsDuCarrousel, MOT_REPLIER_CONTACTS,
  roleDeContactPermis, ROLES_INTERDITS_AUX_CONTACTS,
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
   * ══ 🔒🔒 GARDE DE SOURCE — RESSERRÉ LE 05/10/2026 SUR DÉCISION D'ARNO (lot HISTORIQUE-BIEN-6, point 1) ════════
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * CE QUE CE GARDE DISAIT, ET QUI AVAIT RAISON DE LE DIRE : « la passe de rattachement ne nomme nulle part la
   * table des catégories […] Ce test-là échoue si l'automatisation apprend à LIRE les catégories — par où qu'elle
   * s'y prenne —, c'est-à-dire si quelqu'un, un jour, décide “puisqu'on sait que cette adresse est le contact du
   * propriétaire du lot 504, déduisons le bien”. **Même pour un contact légitime, cette déduction n'est pas
   * décidée**, et pour un indépendant elle rattacherait le courrier de la société de ménage à 40 logements. »
   *
   * 🔴 ELLE EST DÉCIDÉE MAINTENANT, ET C'EST ARNO QUI L'A DÉCIDÉE, par écrit : « Vérifie que la passe de
   * rattachement automatique utilise bien ces cartes de contact (côté propriétaire et côté locataire) ; si ce
   * n'est pas le cas, branche-la. **Les Tiers indépendants restent exclus de l'automatisation.** »
   *
   * ⚠️ JE N'AI PAS ÉLARGI LE GARDE : JE L'AI COUPÉ EN DEUX, le long de la ligne qu'Arno trace lui-même.
   *
   *   ① **LES CATÉGORIES RESTENT INTERDITES À LA PASSE, PARTOUT.** `gestion_partie_categorie` porte `independant`,
   *      et c'est exactement le danger que l'ancien encadré décrivait : lire les catégories ferait un jour
   *      rattacher le courrier d'une société de ménage à quarante logements. Cette moitié du garde ne bouge pas
   *      d'une ligne, et Arno la maintient en toutes lettres.
   *
   *   ② **LES CARTES DE CONTACT DEVIENNENT LISIBLES, ET SEULEMENT PAR LE DÉPÔT.** `gestion_contact_carte` ne peut
   *      pas porter d'indépendant : sa colonne `cote` est contrainte à `proprietaire | locataire`
   *      (`gestion_contact_carte_cote_chk`). Le schéma tient donc la promesse d'Arno AVANT le code — ce n'est pas
   *      une discipline, c'est une impossibilité. Et la lecture passe par UNE porte nommée,
   *      `biensDesContacts`, qui vit dans le dépôt de la 304 : c'est le garde voisin
   *      (`partieCategorieRepo.test.ts`) qui l'impose, et il refuse toute liste blanche qu'on allongerait.
   *
   * ⚠️ LE MOTEUR PUR RESTE AVEUGLE : `propositionsBien.ts` ne nomme AUCUNE des deux tables et n'en nommera jamais.
   * Il reçoit `cartesLots` comme une donnée, et c'est ce qui permet de l'éprouver sans base — la règle du module.
   *
   * ⚠️ ET LA PROPOSITION QUI EN NAÎT NE COCHE RIEN. Le cas (f) est de confiance BASSE et `preCoche: false` :
   * aucune carte ne classe un mail toute seule. MESURÉ sur la base du 05/10/2026 : 485 cartes actives touchent
   * 3 290 mails et produisent 3 324 couples (mail, bien), dont 1 234 sans aucun lien aujourd'hui. Pré-cochées,
   * c'eussent été 1 234 classements posés sans qu'on les lise — la faute du cas (d) et de ses 76 cases.
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  it('🔒🔒 la passe ne lit JAMAIS les catégories — la moitié du garde qu’Arno maintient', () => {
    const SURVEILLES = [
      'app/lib/gestion/rattachement.ts',
      'app/lib/gestion/rattachementRepo.ts',
      'app/lib/gestion/adressesMessage.ts',
      'app/lib/gestion/adressesRepo.ts',
      'app/lib/gestion/propositionsBien.ts',
      'app/lib/gestion/propositionRepo.ts',
      'app/lib/gestion/classementBien.ts',
    ];
    for (const fichier of SURVEILLES) {
      const source = sansCommentaires(readFileSync(fichier, 'utf8'));
      expect(source, `${fichier} nomme gestion_partie_categorie`).not.toContain('gestion_partie_categorie');
    }
  });

  it('🔒🔒 LE MOTEUR PUR RESTE AVEUGLE AUX DEUX TABLES : il reçoit des données, il ne lit rien', () => {
    for (const fichier of [
      'app/lib/gestion/propositionsBien.ts',
      'app/lib/gestion/propositionRepo.ts',
      'app/lib/gestion/rattachement.ts',
      'app/lib/gestion/adressesMessage.ts',
      'app/lib/gestion/adressesRepo.ts',
    ]) {
      const source = sansCommentaires(readFileSync(fichier, 'utf8'));
      for (const interdit of ['gestion_partie_categorie', 'gestion_contact_carte', 'partieCategorieRepo']) {
        expect(source, `${fichier} nomme ${interdit}`).not.toContain(interdit);
      }
    }
  });

  /**
   * 🔒🔒 LA SECONDE MOITIÉ, ÉPROUVÉE POSITIVEMENT : les cartes n'entrent dans la passe que par la porte nommée.
   *
   * ⚠️ UN GARDE QUI N'INTERDIT PLUS RIEN NE PROTÈGE PLUS RIEN. Celui-ci vérifie donc que les deux appelants
   * passent bien par `biensDesContacts` et ne refont pas la requête chez eux — c'est ce qui ferait réapparaître
   * deux définitions de « carte vivante ».
   */
  it('🔒🔒 les cartes n’entrent dans la passe que par `biensDesContacts`', () => {
    for (const fichier of ['app/lib/gestion/rattachementRepo.ts', 'app/lib/gestion/classementBien.ts']) {
      const source = sansCommentaires(readFileSync(fichier, 'utf8'));
      expect(source, `${fichier} doit passer par biensDesContacts`).toContain('biensDesContacts(');
      /* Et ne nomme pas la table lui-même : la requête vit dans le dépôt de la 304, et nulle part ailleurs. */
      expect(source, `${fichier} nomme gestion_contact_carte`).not.toContain('gestion_contact_carte');
    }
  });

  /**
   * 🔒 ET LA GARANTIE DE FOND : une carte ne peut PAS porter un indépendant. Ce n'est pas une discipline de code,
   * c'est une contrainte de base — `gestion_contact_carte_cote_chk`. La promesse d'Arno (« les Tiers indépendants
   * restent exclus de l'automatisation ») est donc tenue par le schéma, et la migration l'écrit.
   */
  it('🔒 le schéma interdit à une carte de porter un tiers indépendant', () => {
    const migration = readFileSync('db/migrations/304_gestion_partie_categorie.sql', 'utf8');
    expect(migration).toContain('gestion_contact_carte_cote_chk');
    /* La clause tient sur une ligne : on la lit jusqu'au saut, et non jusqu'à la première virgule — il y en a
       une ENTRE les deux valeurs permises, et la couper là ne lisait que la première. */
    const chk = migration.split('gestion_contact_carte_cote_chk')[1]?.split('\n')[0] ?? '';
    expect(chk).toContain("'proprietaire'");
    expect(chk).toContain("'locataire'");
    expect(chk).not.toContain("'independant'");
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

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-7 — LES CARTES DE CONTACT DANS LES CARROUSELS DU HAUT ══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (05/10/2026) : « le “+” sert à enrichir le carrousel de la partie concernée. »
 *
 * 🔴 CE LOT RÉPARE CE QUE J'AVAIS SIGNALÉ À LA FIN DU LOT 6 : les deux libellés de contact existaient et étaient
 * éprouvés depuis le lot 1, mais AUCUN ÉCRAN NE LES RENDAIT. Une carte créée par le « + » n'était visible que
 * comme capsule dans le bloc du bas — un geste à l'effet invisible.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('les deux compteurs d’un carrousel ne se mêlent pas', () => {
  /**
   * 🔴 LA RÈGLE D'ARNO, MOT POUR MOT : « Les compteurs “PROPRIÉTAIRE N” et “LOCATAIRE EN PLACE N” ne comptent QUE
   * les clients ; les contacts ont leur propre petit compteur (“+ 2 contacts”). »
   */
  it('🔴🔴 le compteur des contacts est À PART, et son « + » est un signe d’addition', () => {
    expect(motContactsDuCarrousel(2)).toBe('+ 2 contacts');
    expect(motContactsDuCarrousel(1)).toBe('+ 1 contact');
    expect(motContactsDuCarrousel(55)).toBe('+ 55 contacts');
  });

  it('⚠️ AUCUN CONTACT ⇒ AUCUN MOT : « + 0 contact » serait du bruit', () => {
    expect(motContactsDuCarrousel(0)).toBeNull();
    expect(motContactsDuCarrousel(-3)).toBeNull();
  });
});

describe('six cartes de contact, puis « Voir les N autres »', () => {
  /**
   * 🔴 SIX, ET MESURÉ : le bien 155 porte 55 contacts côté propriétaire. Cinquante-cinq cartes dans une piste
   * horizontale, ce n'est pas un carrousel, c'est un mur — et les cartes CLIENTS, celles qu'on vient voir, s'y
   * retrouvent noyées au bout d'un ruban de six écrans de large.
   */
  it('🔴🔴 LE CAS DU BIEN 155 : 55 contacts ⇒ 6 montrés, 49 derrière une carte qui le DIT', () => {
    expect(CONTACTS_MONTRES).toBe(6);
    expect(motAutresContacts(55)).toBe('Voir les 49 autres contacts');
  });

  it('⚠️ LA BORNE NE CACHE RIEN : le nombre restant est toujours écrit', () => {
    expect(motAutresContacts(8)).toBe('Voir les 2 autres contacts');
    expect(motAutresContacts(7)).toBe('Voir le dernier contact');
  });

  it('⚠️ SIX OU MOINS : aucune carte de dépliage, tout est déjà là', () => {
    for (const n of [0, 1, 5, 6]) expect(motAutresContacts(n)).toBeNull();
  });

  it('⚠️ LES DEUX ÉTATS DU MÊME BOUTON VIVENT AU MÊME ENDROIT', () => {
    expect(MOT_REPLIER_CONTACTS).toContain('Masquer');
  });

  it('🔴 LA BORNE EST UN PARAMÈTRE, pas un chiffre écrit dans l’écran', () => {
    expect(motAutresContacts(10, 3)).toBe('Voir les 7 autres contacts');
    expect(motAutresContacts(3, 3)).toBeNull();
  });
});

describe('ce qu’un contact n’est JAMAIS', () => {
  /**
   * 🔴🔴 RÈGLE D'ARNO : « Un contact ne reçoit jamais le badge PROPRIÉTAIRE ni EN PLACE, et ne compte jamais comme
   * occupant. » Le garde est une FONCTION et non un commentaire, pour qu'une épreuve puisse le tenir : le jour où
   * quelqu'un passera le rôle d'un client à une carte de contact, c'est ici que ça se verra — et pas trois mois
   * plus tard sur une fiche où un artisan sera annoncé propriétaire du logement.
   */
  it('🔴🔴 LES RÔLES DES CLIENTS SONT REFUSÉS À UN CONTACT', () => {
    for (const r of ROLES_INTERDITS_AUX_CONTACTS) expect(roleDeContactPermis(r)).toBe(false);
    expect(roleDeContactPermis('propriétaire')).toBe(false);
    expect(roleDeContactPermis('  EN PLACE  ')).toBe(false);
  });

  it('🔴 ET LES DEUX LIBELLÉS DE CONTACT SONT PERMIS, eux — malgré le mot « PROPRIÉTAIRE » qu’ils contiennent', () => {
    /* ⚠️ LE PIÈGE QUE CE CAS FERME : une comparaison par INCLUSION aurait refusé « CONTACT DU PROPRIÉTAIRE »
       par son propre garde. On compare au libellé ENTIER. */
    expect(roleDeContactPermis(LIBELLE_CONTACT_PROPRIETAIRE)).toBe(true);
    expect(roleDeContactPermis(LIBELLE_CONTACT_LOCATAIRE)).toBe(true);
  });
});
