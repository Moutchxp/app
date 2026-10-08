import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  cartesDuReservoir, confirmationCarte, etatApresCarte, motEtape,
  TYPES_AJOUTABLES, TYPES_HERITES, TYPES_INFORMATION, TYPES_RESERVOIR,
} from '../../../../lib/gestion/mongaEtape';
/* 🔴 LOT FRISE-COULEURS-DATES — la couleur d'une carte posée est désormais une règle PURE : voir la section ⑤. */
import { couleurDeLaCarte } from '../../../../lib/gestion/frise';
/* 🔴 LOT ETAT-PAR-LA-FRISE — le compte rendu d'une carte de borne vient d'une fonction PURE, et l'épreuve la
   lit là où la route la lit : une phrase recopiée ici serait une seconde vérité. */
import { motCarteDeBorne } from '../../../../lib/gestion/etatParLaFrise';

/**
 * ══ 🔴🔴 LOT CLOTURE-REOUVERTURE — ON FERME ET ON ROUVRE PAR UNE CARTE, ET PAR RIEN D'AUTRE ════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (08/10/2026) :
 *   1. « Retire le bouton “Relance” de la grille “Ajouter une carte”. Les cartes “Relance” DÉJÀ posées restent
 *      affichées telles quelles. Ajoute un bouton “Réouverture”, placé EN DERNIER, juste après “Carte libre”. »
 *   2. « Ajouter la carte “Clôture” ferme l'événement […] Réutilise exactement ce code de fermeture, sans créer
 *      un second chemin. Retire la ligne ou le bouton qui permettait de fermer un événement en un seul clic. »
 *   3. « Ajouter la carte “Réouverture” rouvre un événement clos […] C'est le SEUL moyen de rouvrir. »
 *   4. « Sur la frise, la carte “Réouverture” est la SEULE à contour ROUGE. […] Dans la grille, le bouton
 *      “Réouverture” a aussi un contour rouge plus marqué. »
 *
 * ⚠️ LES RÈGLES PURES (ordre du réservoir, état imposé, confirmation) sont éprouvées dans `mongaEtape.test.ts`,
 * sur le module. Ce fichier-ci tient le CÂBLAGE : l'écran, la route, la feuille et la migration.
 *
 * 🔒 Aucun réseau, aucune base, aucun événement RÉEL.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const FRISE = readFileSync('app/(admin)/admin/(protected)/gestion/FriseAvancement.tsx', 'utf8');
const BLOC = readFileSync('app/(admin)/admin/(protected)/gestion/EvenementsDuBien.tsx', 'utf8');
const ROUTE = readFileSync('app/(admin)/api/admin/gestion/evenements/[id]/frise/route.ts', 'utf8');
const PUR = readFileSync('app/lib/gestion/mongaEtape.ts', 'utf8');
const MIGRATION = readFileSync('db/migrations/320_gestion_etape_reouverture.sql', 'utf8');

describe('🔴🔴 ① la grille : plus de Relance, Réouverture en dernier', () => {
  it('🔴🔴 « Réouverture » est la DERNIÈRE carte, juste après « Carte libre »', () => {
    expect(TYPES_RESERVOIR[TYPES_RESERVOIR.length - 1]).toBe('reouverture');
    expect(TYPES_RESERVOIR[TYPES_RESERVOIR.length - 2]).toBe('autre');
    expect(motEtape('reouverture')).toBe('Réouverture');
  });

  /**
   * 🔴🔴 LES DEUX FACES DE LA GRILLE PERDENT « RELANCE ». « Étape (carré) » lit `TYPES_RESERVOIR`, « Simple
   * information (point) » lit `TYPES_INFORMATION` : le laisser dans la seconde aurait fait survivre le bouton
   * derrière une bascule, c'est-à-dire ne pas l'avoir retiré.
   */
  it('🔴🔴 « Relance » a quitté les DEUX faces de la grille', () => {
    expect(TYPES_RESERVOIR).not.toContain('relance');
    expect(TYPES_INFORMATION).not.toContain('relance');
  });

  /**
   * 🔴🔴 ET LES CARTES DÉJÀ POSÉES SONT INTACTES. C'est la condition d'Arno (« aucune donnée supprimée, aucune
   * modifiée »), et elle tient à trois choses : le type reste valide pour les routes, son mot existe toujours,
   * et la contrainte de la base l'accepte encore. Mesuré le 08/10/2026 : **1 carte Relance** existe en base.
   */
  it('🔴🔴 le type « relance » reste valide, modifiable et affichable', () => {
    expect(TYPES_HERITES).toContain('relance');
    expect(TYPES_AJOUTABLES).toContain('relance');
    expect(motEtape('relance')).toBe('Relance');
    expect(MIGRATION).toContain("'relance'");
  });

  /**
   * 🔴 LA GRILLE LIT LE MODULE PUR, jamais une liste recopiée — et elle dépend de l'état.
   *
   * 🔴🔴 LOT ETAT-PAR-LA-FRISE — LES **DEUX** FACES LE LISENT MAINTENANT. Arno (08/10/2026, point 4) : « Quand
   * l'événement est clos, la grille ne propose QUE “Réouverture” : aucune autre carte ne peut être posée après
   * une Clôture. » La face « Simple information » n'était pas filtrée du tout ; elle l'est, par la fonction
   * pure jumelle `informationsDuReservoir`.
   */
  it('🔴 la grille lit le module pur, des DEUX côtés', () => {
    expect(FRISE).toContain("const liste = forme === 'etape'");
    expect(FRISE).toContain('cartesDuReservoir(evenementOuvert) : informationsDuReservoir(evenementOuvert)');
    expect(FRISE).toContain('evenementOuvert={vue.d.ouvert !== false}');
  });
});

describe('🔴🔴 ② clôturer : par la carte, et par le code de fermeture qui existe déjà', () => {
  /**
   * 🔴🔴 « RÉUTILISE EXACTEMENT CE CODE DE FERMETURE, SANS CRÉER UN SECOND CHEMIN » (Arno).
   * `changerEtatEvenement` est la SEULE fonction du dépôt qui écrive `gestion_evenement.etat` : elle pose
   * `traite_le`, `traite_par`, et JOURNALISE. Un `UPDATE` écrit dans la route aurait été le second chemin, et
   * il aurait perdu le journal.
   */
  /**
   * ══ 🔴🔴 LOT ETAT-PAR-LA-FRISE (08/10/2026) — IL N'Y A PLUS D'ÉTAT À ÉCRIRE DU TOUT ═══════════════════════
   *
   * L'épreuve exigeait que la route REPASSE par `changerEtatEvenement` plutôt que d'écrire l'état elle-même :
   * un seul chemin d'écriture, celui qui journalise. C'était la bonne exigence tant qu'il y avait une écriture.
   *
   * 🔴 LE CONSTAT D'ARNO A MONTRÉ QU'IL NE FALLAIT PAS UNE ÉCRITURE MIEUX RANGÉE, MAIS AUCUNE : il a retiré la
   * carte Clôture de GES-2026-000001, et l'état écrit est resté. La carte est donc désormais la SEULE écriture,
   * et l'état se DÉDUIT des cartes de borne à chaque lecture.
   *
   * ⚠️ L'EXIGENCE EST PLUS STRICTE QU'AVANT, pas moins : la route ne doit écrire l'état NI directement, NI par
   * la fonction qui le faisait.
   */
  it('🔴🔴 la route n’écrit AUCUN état : ni directement, ni par `changerEtatEvenement`', () => {
    expect(ROUTE).toContain('const etatVoulu = etatApresCarte(type);');
    expect(ROUTE).not.toContain('changerEtatEvenement(');
    expect(ROUTE).not.toContain('UPDATE gestion_evenement');
    /* 🔴 ELLE RELIT, et c'est tout : avant la carte, puis après, pour dire si l'état a bougé. */
    expect(ROUTE).toContain("sqlEvenementOuvertParLaFrise('e')");
  });

  /**
   * ⚠️ L'ÉTAT EST ÉCRIT APRÈS LA CARTE, et c'est un arbitrage : si l'écriture de l'état échouait, il resterait
   * une carte « Clôture » sur un événement ouvert — visible, donc réparable. L'inverse serait un dossier clos
   * par personne.
   */
  it('⚠️ la carte est posée d’abord, l’état ensuite', () => {
    const iCarte = ROUTE.indexOf('const idEtape = await ajouterEtapeManuelle(');
    const iEtat = ROUTE.indexOf('const etatVoulu = etatApresCarte(type);');
    expect(iCarte).toBeGreaterThan(-1);
    expect(iEtat).toBeGreaterThan(iCarte);
  });

  /**
   * 🔴 ET LE COMPTE RENDU DIT CE QUI S'EST PASSÉ, y compris quand l'état n'a pas changé.
   *
   * 🔴🔴 LOT ETAT-PAR-LA-FRISE — IL NE SE DEVINE PLUS DEPUIS LE TYPE POSÉ. Une Clôture datée AVANT une
   * Réouverture déjà présente ne ferme rien : annoncer « clôturé » dans ce cas serait faux. Le message vient
   * donc d'une fonction PURE qui compare l'état relu avant et après la carte.
   */
  it('🔴 le message distingue « clôturé », « rouvert », et un état qui n’a pas changé', () => {
    expect(ROUTE).toContain('motCarteDeBorne(ouvertAvant, ouvertApres)');
    expect(motCarteDeBorne(true, false)).toBe('Événement clôturé.');
    expect(motCarteDeBorne(false, true)).toBe('Événement rouvert.');
    expect(motCarteDeBorne(true, true)).toContain('reste ouvert');
    expect(motCarteDeBorne(false, false)).toContain('reste clos');
  });
});

describe('🔴🔴 ③ la fermeture en UN CLIC a été retirée', () => {
  /**
   * 🔴🔴 CE QUI PART, PIÈCE PAR PIÈCE : la ligne de la frise, sa propriété, le branchement de la fiche du bien,
   * le champ de la route, la fonction pure et la règle de feuille. Une seule de ces pièces laissée en place
   * aurait fini par être recâblée « parce qu'elle est encore là ».
   */
  it('🔴🔴 la ligne « Clôturer cet événement ? » n’est plus rendue nulle part', () => {
    expect(FRISE).not.toContain('className="fav-proposition"');
    expect(FRISE).not.toContain('onProposerCloture?:');
    expect(BLOC).not.toContain('onProposerCloture={');
    expect(ROUTE).not.toContain('proposerCloture: proposerCloture(');
    expect(PUR).not.toContain('export function proposerCloture(');
    /* ⚠️ ET SA RÈGLE DE FEUILLE PART AVEC ELLE : elle n'avait que cet unique porteur. */
    expect(FRISE).not.toMatch(/^\.fav-proposition\{/m);
  });

  /**
   * ⚠️ CE QUE LA ROUTE REND À LA PLACE : l'état, dont la GRILLE a besoin pour choisir entre les deux cartes.
   * C'est la même donnée (`traite`), déjà lue — aucune requête de plus.
   */
  /**
   * ⚠️ LA ROUTE DIT L'ÉTAT À LA PLACE, et c'est ce qui décide de la grille.
   *
   * 🔴🔴 LOT ETAT-PAR-LA-FRISE — ELLE LE DEMANDE À LA FRISE, PAS À `traite_le`. Le demander à la colonne, c'était
   * offrir « Réouverture » sur un dossier dont la carte Clôture n'existe plus : le cas exact d'Arno.
   */
  it('⚠️ la route dit l’état, lu sur la frise, et la grille en découle', () => {
    expect(ROUTE).toContain('const ouvertParLaFrise = rows[0].ouvert;');
    expect(ROUTE).toContain('ouvert: ouvertParLaFrise,');
    expect(ROUTE).toContain('typesReservoir: cartesDuReservoir(ouvertParLaFrise),');
  });
});

describe('🔴🔴 ④ la confirmation, avant de poser', () => {
  /** 🔴 LES MOTS D'ARNO, ET LES DEUX BOUTONS QU'IL NOMME. */
  it('🔴🔴 les deux questions sont posées dans le panneau, pas dans une boîte du navigateur', () => {
    expect(FRISE).toContain('const demande = modifie === null ? confirmationCarte(type) : null;');
    expect(FRISE).toContain('if (demande !== null && !confirme) { setConfirme(true); return; }');
    expect(FRISE).toContain('<p className="fav-confirme" role="alert">{demande.question}</p>');
    expect(FRISE).toContain('onClick={() => setConfirme(false)}>Annuler</button>');
    /* ⚠️ AUCUNE BOÎTE MODALE DU NAVIGATEUR : elle bloque la page et ne porte pas les mots du module.
       ⚠️ ON INTERDIT L'APPEL, PAS LA MENTION : l'encadré qui explique ce choix nomme forcément `confirm()`. */
    expect(FRISE).not.toContain('window.confirm(');
    expect(FRISE).not.toMatch(/(?<![`\w.])confirm\(/);
  });

  /**
   * ⚠️ ELLE NE S'APPLIQUE PAS À UNE MODIFICATION : corriger la date d'une Clôture déjà posée ne referme rien,
   * l'état a changé le jour où la carte a été posée.
   */
  it('⚠️ modifier une carte existante ne redemande rien', () => {
    expect(FRISE).toContain('modifie === null ? confirmationCarte(type) : null');
  });

  /** ⚠️ ET CHANGER DE TYPE REDEMANDE : une confirmation ne vaut jamais pour la carte suivante. */
  it('⚠️ changer de type remet la question', () => {
    expect(FRISE).toContain('useEffect(() => { setConfirme(false); }, [type]);');
  });
});

describe('🔴🔴 ⑤ les couleurs de la frise', () => {
  /**
   * ══ 🔴🔴 CE QUE CETTE SECTION DISAIT, ET POURQUOI ARNO L'A CORRIGÉE LE MÊME JOUR ════════════════════════════
   *
   * Elle tenait le point 4 de ce lot : « Sur la frise, la carte “Réouverture” est la SEULE à contour ROUGE.
   * Toutes les autres cartes posées (y compris Clôture) gardent leur contour VERT. »
   *
   * 🔴 LE LOT FRISE-COULEURS-DATES (08/10/2026) REMPLACE CETTE RÈGLE PAR UNE AUTRE, en toutes lettres : « Cartes
   * “Ouverture” et “Réouverture” : contour ROUGE. Carte “Clôture” […] ENTIÈREMENT verte, contour ET fond. »
   * Le rouge n'est donc plus réservé à la réouverture, et la clôture n'est plus verte comme les autres.
   *
   * 🔴 CE QUI NE CHANGE PAS, ET QUE CETTE SECTION GARDE : la réouverture reste rouge SUR LA FRISE, elle reste
   * rouge et plus marquée DANS LA GRILLE, et la couleur ne porte jamais l'information seule. Le reste — la
   * nouvelle règle, pièce par pièce — est éprouvé dans `friseCouleursDates.test.ts`, le fichier du lot qui l'a
   * décidée : deux fichiers qui tiendraient la même règle finiraient par n'en tenir qu'une moitié chacun.
   */
  it('🔴🔴 la réouverture est toujours rouge sur la frise, par la carte de BORNE', () => {
    /* 🔴 LA RÈGLE EST PURE, ET LA RÉOUVERTURE EST L'UNE DES DEUX CARTES QUI OUVRENT UNE PÉRIODE. */
    expect(couleurDeLaCarte('reouverture')).toBe('debut');
    expect(FRISE).toContain("debut: ' fav-carre--debut',");
    expect(FRISE).toContain('.fav-carre--debut{border-color:var(--color-svv-red)}');
    /* 🔴 ET LES AUTRES GARDENT LEUR VERT : `--dans` est toujours posé sans condition de type. */
    expect(FRISE).toContain("`fav-carre fav-carre--dans${aConfirmer ? ' fav-carre--doute' : ''}`");
  });

  /** 🔴 DANS LA GRILLE, UN TRAIT PLUS ÉPAIS : tous les carrés du réservoir sont déjà rouges (« à poser »). */
  it('🔴 dans la grille, le bouton « Réouverture » a un contour plus marqué', () => {
    expect(FRISE).toContain('.fav-carre--reserve.fav-carre--reouverture{border-width:2px}');
    /* ⚠️ ET IL EST TOUJOURS POSÉ SUR LA CARTE DE LA GRILLE, c'est-à-dire là où il sert encore. */
    expect(FRISE).toContain("t === 'reouverture' ? ' fav-carre--reouverture' : ''");
  });

  /**
   * 🔴 LA RÈGLE PASSE APRÈS CELLES QU'ELLE DOIT EMPORTER. En CSS, à spécificité égale, c'est l'ORDRE qui
   * tranche : posée avant `--dans`, elle serait recouverte par le vert et ne se verrait jamais.
   */
  it('🔴 sa règle vient après le vert de la frise et le rouge du réservoir', () => {
    expect(FRISE.indexOf('.fav-carre--reouverture{'))
      .toBeGreaterThan(FRISE.indexOf('.fav-carre--dans{'));
    expect(FRISE.indexOf('.fav-carre--debut{'))
      .toBeGreaterThan(FRISE.indexOf('.fav-carre--dans{'));
  });

  /** ⚠️ AUCUNE COULEUR EN DUR : la feuille de ce fichier n'accepte que des jetons, commentaire compris. */
  it('⚠️ elle ne tire que des jetons du thème', () => {
    for (const sel of ['.fav-carre--reouverture', '.fav-carre--debut']) {
      const regle = FRISE.match(new RegExp(`\\${sel}\\{([^}]*)\\}`));
      expect(regle, sel).not.toBeNull();
      expect(regle?.[1], sel).toContain('var(--color-svv-red)');
      expect(regle?.[1], sel).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });
});

describe('🔴🔴 ⑥ la base accepte le type, et n’a rien perdu', () => {
  /** 🔴 LA LISTE DE LA MIGRATION EST CELLE DU MODULE : une épreuve, pas une promesse. */
  it('🔴🔴 la migration 320 ajoute « reouverture » sans retirer aucun type', () => {
    expect(MIGRATION).toContain("'reouverture'");
    /* ⚠️ LES DIX-NEUF D'AVANT SONT TOUS LÀ : on élargit une contrainte, on ne la remplace pas. */
    for (const t of [
      'ouverture', 'prise_rdv', 'rdv_eu_lieu', 'devis_recu', 'devis_refuse', 'devis_accepte',
      'rdv_intervention', 'intervention', 'rapport', 'cloture', 'facture', 'rappel_devis',
      'contact_injoignable', 'commentaire', 'assurance', 'expertise', 'relance', 'autre', 'note',
    ]) {
      expect(MIGRATION, t).toContain(`'${t}'`);
    }
  });

  /** ⚠️ ET ELLE NE FAIT RIEN SI LA TABLE N'EXISTE PAS, plutôt que d'échouer. */
  it('⚠️ elle est gardée par l’existence de la table', () => {
    expect(MIGRATION).toContain("WHERE table_name = 'gestion_monga_etape'");
  });
});

describe('🔴🔴 ⑦ plusieurs cycles, et l’historique les garde', () => {
  /**
   * 🔴🔴 « Plusieurs cycles clôture / réouverture doivent fonctionner : chaque période ouverte est conservée
   * dans l'historique. » (Arno)
   *
   * 🔴 C'EST VRAI PAR CONSTRUCTION, ET VOICI POURQUOI : chaque geste pose une CARTE — une ligne de plus dans
   * `gestion_monga_etape`, jamais un remplacement. La frise garde donc Clôture, Réouverture, Clôture… dans
   * l'ordre de leurs dates. L'ÉTAT, lui, n'a qu'une valeur à la fois, et c'est juste : un dossier est ouvert ou
   * il ne l'est pas.
   *
   * ⚠️ RIEN N'EFFACE : la route n'émet aucun DELETE, et `changerEtatEvenement` ne touche qu'à l'état.
   */
  it('🔴🔴 chaque geste AJOUTE une carte, aucun n’en remplace une', () => {
    expect(ROUTE).toContain('await ajouterEtapeManuelle(');
    expect(ROUTE).not.toContain('DELETE');
    /* 🔴 ET LES DEUX SENS SONT POSSIBLES AUTANT DE FOIS QU'IL LE FAUT : l'état seul décide de la carte offerte. */
    expect(etatApresCarte('cloture')).toBe('traite');
    expect(etatApresCarte('reouverture')).toBe('en_cours');
    expect(cartesDuReservoir(true)).toContain('cloture');
    expect(cartesDuReservoir(false)).toContain('reouverture');
  });

  /**
   * 🔴🔴 ET LA FRISE D'UN ÉVÉNEMENT CLOS EST ATTEIGNABLE — sans quoi la carte « Réouverture » ne serait jamais
   * offerte. Dans le bloc « Événements » de la fiche du bien, les clos sont REPLIÉS (accord d'Arno au lot
   * MONGA-2) mais leur en-tête reste un bouton, et le déplier monte la frise comme pour un ouvert.
   */
  it('🔴🔴 on atteint la frise d’un événement clos depuis la fiche du bien', () => {
    expect(BLOC).toContain('className="evb-tete" aria-expanded={ouvert}');
    expect(BLOC).toContain('onClick={() => setDeplies((s) => {');
    /* 🔴 LA FRISE EST DANS LE `{ouvert && …}`, sans condition sur `clos` : un clos déplié la montre. */
    const i = BLOC.indexOf('{ouvert && (');
    expect(BLOC.slice(i, BLOC.indexOf('</>)}', i))).toContain('<FriseAvancement');
    /* ⚠️ ET LE REPLI D'OFFICE NE PORTE QUE SUR L'ÉTAT INITIAL, jamais sur la possibilité d'ouvrir. */
    expect(BLOC).toContain('const ouverts = new Set(evenements.filter((e) => !e.clos).map((e) => e.id));');
  });
});

describe('🔴🔴 ⑧ rouvrir rétablit tout ce qui dépend d’un événement ouvert', () => {
  /**
   * 🔴🔴 ARNO : « Le bien redevient un bien avec événement ouvert, avec toutes les conséquences : ligne orange
   * […] capsules orange […] compteur et liste des événements ouverts, filtre “Événement ouvert”, cartes de
   * l'écran partagé et du plein écran Événements. »
   *
   * 🔴 ET C'EST VRAI SANS QU'AUCUN DE CES SIX ÉCRANS N'AIT ÉTÉ TOUCHÉ, parce que tous lisent la MÊME chose :
   * « un événement NON traité ». Rouvrir, c'est écrire `etat = 'en_cours'` et effacer `traite_le` — ce que fait
   * `changerEtatEvenement`, et les six conséquences suivent d'elles-mêmes.
   *
   * ⚠️ C'EST AUSSI LA LEÇON DU LOT RETABLIR-MARQUES-EVENEMENT, le même jour : ces marques avaient « disparu »
   * parce que l'événement avait été clos. Elles reviennent par le même chemin, à l'envers.
   */
  /**
   * ══ 🔴🔴 LOT ETAT-PAR-LA-FRISE — LES CONSÉQUENCES TIENNENT À UNE SEULE **LECTURE**, PLUS À UNE ÉCRITURE ═══
   *
   * L'épreuve montrait que les six conséquences d'Arno suivaient d'une seule écriture, `etat`. Elles suivent
   * maintenant d'une seule RÈGLE, lue au même endroit par tous : `sqlEvenementOuvertParLaFrise`. C'est la même
   * idée — une seule source — portée un cran plus loin : il n'y a même plus de valeur à écrire.
   */
  it('🔴🔴 toutes les conséquences tiennent à une seule règle, lue par tous', () => {
    /* 🔴 LE CARTOUCHE ORANGE, LES CAPSULES ET LE BLOC ÉVÉNEMENTS APPELLENT LA MÊME FONCTION. */
    for (const f of ['app/lib/gestion/annuaireRepo.ts', 'app/lib/gestion/historiqueBienRepo.ts',
      'app/lib/gestion/fileRepo.ts', 'app/lib/gestion/recherche.ts', 'app/lib/gestion/mongaRepo.ts',
      'app/lib/gestion/carteRepo.ts', 'app/lib/gestion/historiqueRepo.ts']) {
      expect(readFileSync(f, 'utf8'), f).toContain('sqlEvenementOuvertParLaFrise');
    }
    /* 🔴 ET AUCUN D'EUX NE GARDE L'ANCIENNE COMPARAISON — une seule laissée en place serait une divergence. */
    for (const f of ['app/lib/gestion/annuaireRepo.ts', 'app/lib/gestion/historiqueBienRepo.ts',
      'app/lib/gestion/mongaRepo.ts']) {
      expect(readFileSync(f, 'utf8'), f).not.toContain("e.etat <> 'traite'");
    }
  });
});
