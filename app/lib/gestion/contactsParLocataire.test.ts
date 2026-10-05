import { describe, it, expect } from 'vitest';
import {
  adresseGardeeDansLencart, clesDesCartesDeLadresse, completerAvecLesContactsDuLocataire,
  CHOIX_LOCATAIRE_DEFAUT, type CarteLocataireBien, type ContactDeLocataire,
} from './historiqueBien';
import type { Interlocuteur } from './historique';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-16, POINT 1 — UN CONTACT ANNEXE SUIT SA LOCATION ════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (05/10/2026, lot-146) : « locataire actuel (BRASSET / BRUERE) sélectionné → "Non affectés" montre
 * louisvaglio@live.fr (a écrit 2, en copie 2), qui appartient à la location VAGLIO ARNAUD. Quand on choisit
 * l'ancien locataire VAGLIO ARNAUD, cette adresse DISPARAÎT. C'est l'inverse de ce qu'il faut. »
 *
 * ═══ 🔴 CE QUE LA BASE DIT, ET POURQUOI LA RÈGLE DEMANDÉE NE POUVAIT PAS MARCHER ═════════════════════════════════
 *
 * Les SEPT mails de cette adresse sur le bien tiennent dans UN fil (« Dépôt de garantie ») et vont du 11/11/2025
 * au 30/09/2026. L'occupation de VAGLIO s'est achevée le 22/10/2025 : ils sont TOUS postérieurs à son départ —
 * ce qui est le cours normal d'un dépôt de garantie. Cinq portent `aurelie.arnaud1402@gmail.com`, une adresse de
 * SA carte ; aucun ne porte la moindre adresse de BRASSET / BRUERE.
 *
 * 🔴 « UNIQUEMENT les adresses qui ont participé à des mails DANS LA PÉRIODE D'OCCUPATION » échoue donc sur le cas
 * d'épreuve d'Arno, et DES DEUX CÔTÉS : avec VAGLIO l'adresse reste absente (tout est hors de son bail), et avec
 * BRASSET elle reste présente (tout est dans sa période). C'est l'exact contraire de ce qu'il demande.
 *
 * 🔴 L'AXE JUSTE EST LA CO-PARTICIPATION, pas le temps. Le jeu d'essai de ce fichier EST ce bien-là, mesuré.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const BRASSET: CarteLocataireBien = {
  cle: 'occ-92', libelle: 'BRASSET Mathilde et BRUERE Thomas',
  depuis: '2025-10-22', jusqua: null, enPlace: true,
  adresses: ['mathilde.brasset@gmail.com', 'thomas.bruere1996@gmail.com'],
};
const VAGLIO: CarteLocataireBien = {
  cle: 'occ-503', libelle: 'VAGLIO ARNAUD Aurélie et Louis',
  depuis: '2025-02-06', jusqua: '2025-10-22', enPlace: false,
  adresses: ['louis.vaglio@audencia.com', 'aurelie.arnaud1402@gmail.com'],
};
const ACKET: CarteLocataireBien = {
  cle: 'occ-11', libelle: 'ACKET GOEMAERE - DERRIEN Alizée et Thomas',
  depuis: '2022-04-01', jusqua: '2025-01-31', enPlace: false,
  adresses: ['thomas.derrien@hec.edu', 'alizee.acket@hec.edu'],
};
const CARTES = [BRASSET, VAGLIO, ACKET];

/** Mesuré en base : l'adresse du constat n'est réclamée QUE par la carte de VAGLIO, avec 3 écrits et 2 copies. */
const LIVE: ContactDeLocataire = {
  cle: 'occ-503', adresse: 'louisvaglio@live.fr', nom: 'Louis Vaglio',
  aEcrit: 3, enCopie: 2, nbMails: 5,
};
const CONTACTS = [LIVE];

const VAGLIO_CHOISI = { sorte: 'ancien' as const, cle: 'occ-503' };
const ACKET_CHOISI = { sorte: 'ancien' as const, cle: 'occ-11' };

describe('🔴🔴 ① le défaut d’Arno, fermé dans les deux sens', () => {
  /** 🔴🔴 LE CAS QU'ARNO DEMANDE D'ÉPROUVER, MOT POUR MOT. */
  it('🔴🔴 louisvaglio@live.fr : PRÉSENT avec VAGLIO, ABSENT avec BRASSET / BRUERE', () => {
    expect(adresseGardeeDansLencart('louisvaglio@live.fr', CARTES, VAGLIO_CHOISI, CONTACTS)).toBe(true);
    expect(adresseGardeeDansLencart('louisvaglio@live.fr', CARTES, CHOIX_LOCATAIRE_DEFAUT, CONTACTS)).toBe(false);
  });

  it('🔴 et absent de la troisième location, qui ne le réclame pas non plus', () => {
    expect(adresseGardeeDansLencart('louisvaglio@live.fr', CARTES, ACKET_CHOISI, CONTACTS)).toBe(false);
  });

  /**
   * 🔴🔴 LA PREUVE QUE LA PÉRIODE N'AURAIT PAS SUFFI. Cette épreuve ne vérifie pas du code : elle fige le FAIT
   * mesuré qui a fait écarter la règle demandée — les sept mails sont tous postérieurs au départ de VAGLIO.
   * Si quelqu'un revient un jour à un filtre par période, qu'il relise ces dates avant.
   */
  it('🔴🔴 les mails du constat sont TOUS postérieurs au bail de VAGLIO', () => {
    const duFil = ['2025-11-11', '2026-06-12', '2026-06-15', '2026-06-30', '2026-09-30'];
    for (const d of duFil) expect(d > (VAGLIO.jusqua ?? ''), d).toBe(true);
    /* …et tous DANS la période du locataire en place, ce qui aurait gardé le défaut tel quel. */
    for (const d of duFil) expect(d > (BRASSET.depuis ?? ''), d).toBe(true);
  });
});

describe('🔴 ② quelles cartes réclament une adresse', () => {
  it('🔴 les deux sources se rejoignent : adresses du bail ET contacts annexes', () => {
    expect(clesDesCartesDeLadresse('mathilde.brasset@gmail.com', CARTES, CONTACTS)).toEqual(['occ-92']);
    expect(clesDesCartesDeLadresse('louisvaglio@live.fr', CARTES, CONTACTS)).toEqual(['occ-503']);
  });

  /** ⚠️ UNE ADRESSE QUE PERSONNE NE RÉCLAME RESTE VISIBLE : la période décide seule, comme avant ce lot. */
  it('⚠️ une adresse qu’aucune carte ne réclame reste, quel que soit le choix', () => {
    expect(clesDesCartesDeLadresse('syndic@immeuble.test', CARTES, CONTACTS)).toEqual([]);
    for (const choix of [CHOIX_LOCATAIRE_DEFAUT, VAGLIO_CHOISI, ACKET_CHOISI]) {
      expect(adresseGardeeDansLencart('syndic@immeuble.test', CARTES, choix, CONTACTS)).toBe(true);
    }
  });

  /** ⚠️ SANS CONTACTS, LA RÈGLE EST CELLE D'AVANT CE LOT, AU CARACTÈRE PRÈS. */
  it('⚠️ sans contacts annexes, le verdict est celui du lot 13', () => {
    expect(adresseGardeeDansLencart('louisvaglio@live.fr', CARTES, CHOIX_LOCATAIRE_DEFAUT)).toBe(true);
    expect(adresseGardeeDansLencart('louisvaglio@live.fr', CARTES, VAGLIO_CHOISI)).toBe(true);
  });

  it('⚠️ la casse et les espaces sont ignorés des deux côtés', () => {
    expect(adresseGardeeDansLencart(' LOUISVAGLIO@LIVE.FR ', CARTES, VAGLIO_CHOISI, CONTACTS)).toBe(true);
    expect(clesDesCartesDeLadresse('LOUISVAGLIO@LIVE.FR', CARTES,
      [{ ...LIVE, adresse: ' LouisVaglio@Live.fr ' }])).toEqual(['occ-503']);
  });

  /** ⚠️ UNE ADRESSE RÉCLAMÉE PAR DEUX LOCATIONS SUIT LES DEUX : on ne tranche pas à sa place. */
  it('⚠️ une adresse réclamée par deux locations paraît avec chacune', () => {
    const deux = [LIVE, { ...LIVE, cle: 'occ-11' }];
    expect(clesDesCartesDeLadresse('louisvaglio@live.fr', CARTES, deux).sort())
      .toEqual(['occ-11', 'occ-503']);
    expect(adresseGardeeDansLencart('louisvaglio@live.fr', CARTES, ACKET_CHOISI, deux)).toBe(true);
    expect(adresseGardeeDansLencart('louisvaglio@live.fr', CARTES, VAGLIO_CHOISI, deux)).toBe(true);
    expect(adresseGardeeDansLencart('louisvaglio@live.fr', CARTES, CHOIX_LOCATAIRE_DEFAUT, deux)).toBe(false);
  });
});

describe('🔴🔴 ③ le contact est AJOUTÉ, avec les compteurs qui le justifient', () => {
  const inter = (o: Partial<Interlocuteur> = {}): Interlocuteur => ({
    adresse: 'qui@x.fr', nom: null, nbMails: 1, aEcrit: 1, enCopie: 0, interne: false, ...o,
  });

  /**
   * 🔴🔴 SANS L'AJOUT, LE FILTRE N'AURAIT RIEN EU À GARDER. Choisir VAGLIO règle la période sur son occupation,
   * et ses sept mails sont postérieurs : la route ne rend donc PAS cette adresse. C'est la moitié de la
   * correction qu'un simple filtre aurait manquée.
   */
  it('🔴🔴 absent de la période, le contact est quand même posé', () => {
    const liste = completerAvecLesContactsDuLocataire([inter()], CONTACTS, CARTES, VAGLIO_CHOISI);
    const pose = liste.find((i) => i.adresse === 'louisvaglio@live.fr');
    expect(pose).toBeDefined();
    expect(pose?.nom).toBe('Louis Vaglio');
    /* 🔴 LES COMPTEURS SONT CEUX DES MAILS PARTAGÉS : « 0 · 0 » sous une capsule présente serait un mensonge. */
    expect(pose?.aEcrit).toBe(3);
    expect(pose?.enCopie).toBe(2);
    expect(pose?.nbMails).toBe(5);
  });

  /** 🔴 UNE ADRESSE DÉJÀ LÀ EST RÉÉCRITE, JAMAIS DOUBLÉE : deux capsules de la même personne avec deux nombres
      différents est pire que l'absence. */
  it('🔴🔴 déjà présente, elle est réécrite et non doublée', () => {
    const liste = completerAvecLesContactsDuLocataire(
      [inter({ adresse: 'louisvaglio@live.fr', nbMails: 99, aEcrit: 99, enCopie: 99 })],
      CONTACTS, CARTES, VAGLIO_CHOISI);
    expect(liste.filter((i) => i.adresse === 'louisvaglio@live.fr')).toHaveLength(1);
    expect(liste[0].aEcrit).toBe(3);
  });

  /** 🔴 RIEN N'EST POSÉ POUR UNE AUTRE LOCATION : c'est l'autre moitié du défaut d'Arno. */
  it('🔴🔴 le contact de VAGLIO n’est pas posé chez le locataire en place', () => {
    const liste = completerAvecLesContactsDuLocataire([inter()], CONTACTS, CARTES, CHOIX_LOCATAIRE_DEFAUT);
    expect(liste.some((i) => i.adresse === 'louisvaglio@live.fr')).toBe(false);
    expect(liste).toHaveLength(1);
  });

  /** ⚠️ UN COUPLE EN PLACE (deux cartes) : le compte le plus complet gagne, jamais le premier rencontré. */
  it('⚠️ deux cartes choisies qui réclament la même adresse : le plus fourni gagne', () => {
    const duo = [{ ...BRASSET, cle: 'occ-92a' }, { ...BRASSET, cle: 'occ-92b' }];
    const deux = [
      { ...LIVE, cle: 'occ-92a', aEcrit: 1, enCopie: 0, nbMails: 1 },
      { ...LIVE, cle: 'occ-92b', aEcrit: 4, enCopie: 3, nbMails: 7 },
    ];
    const liste = completerAvecLesContactsDuLocataire([], deux, duo, CHOIX_LOCATAIRE_DEFAUT);
    expect(liste).toHaveLength(1);
    expect(liste[0].nbMails).toBe(7);
  });

  /** ⚠️ LOGEMENT VACANT SANS CHOIX POSSIBLE : rien n'est posé, et rien ne casse. */
  it('⚠️ aucune carte choisie ⇒ la liste est rendue telle quelle', () => {
    const vacant = [VAGLIO, ACKET];
    expect(completerAvecLesContactsDuLocataire([inter()], CONTACTS, vacant, CHOIX_LOCATAIRE_DEFAUT))
      .toHaveLength(1);
  });

  it('⚠️ aucun contact connu ⇒ la liste est rendue telle quelle', () => {
    expect(completerAvecLesContactsDuLocataire([inter()], [], CARTES, VAGLIO_CHOISI)).toHaveLength(1);
  });
});
