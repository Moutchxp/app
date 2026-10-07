import { describe, it, expect } from 'vitest';
import {
  adresseGardeeDansLencart, anciensLocataires, carteChoisie, choixLocataireParDefaut,
  CHOIX_LOCATAIRE_DEFAUT, ilYAUnLocataireEnPlace, locatairesEnPlace,
  aideBoutonAnciensLocataires, campsDesLocataires, exclusiviteLocataires, motBasculeLocataires,
  motAnciensLocataires, motAncienLocataire, motBoutonAnciensLocataires, MOT_LOCATAIRE_EN_PLACE,
  MOT_LOCATAIRES_ACTUELS, periodeDuChoixLocataire,
  type CarteLocataireBien,
} from './historiqueBien';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-13, POINT 1 — UN SEUL LOCATAIRE À LA FOIS DANS L'ENCART ════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (05/10/2026, lot-146) : « L'encart affiche “Locataire 6” : il mêle le locataire en place
 * (BRASSET Mathilde et BRUERE Thomas) et les adresses des anciens (VAGLIO ARNAUD, ACKET GOEMAERE - DERRIEN). »
 *
 * 🔴 MESURÉ EN BASE, ET IL A RAISON À L'UNITÉ — le bien 104 (fiche lot-146) porte TROIS occupations de deux
 * adresses chacune, soit les 6 capsules qu'il voit. Le jeu d'essai de ce fichier EST ce bien-là.
 *
 * SA RÈGLE : « Jamais deux périodes de locataires dans la même recherche. »
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Le bien 104, tel que la base le porte au 05/10/2026. */
const EN_PLACE: CarteLocataireBien = {
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
const CARTES = [EN_PLACE, VAGLIO, ACKET];

describe('🔴🔴 ① par défaut, le locataire EN PLACE et lui seul', () => {
  it('🔴🔴 les deux adresses du locataire en place sont gardées', () => {
    for (const a of EN_PLACE.adresses) {
      expect(adresseGardeeDansLencart(a, CARTES, CHOIX_LOCATAIRE_DEFAUT), a).toBe(true);
    }
  });

  /** 🔴🔴 LE DÉFAUT D'ARNO, FERMÉ : les quatre adresses des anciens ne sont plus dans l'encart. */
  it('🔴🔴 les quatre adresses des anciens sont écartées', () => {
    for (const a of [...VAGLIO.adresses, ...ACKET.adresses]) {
      expect(adresseGardeeDansLencart(a, CARTES, CHOIX_LOCATAIRE_DEFAUT), a).toBe(false);
    }
  });

  /** 🔴 LE COMPTEUR SUIT, puisqu'il compte ce que l'encart garde : 6 capsules deviennent 2. */
  it('🔴 six adresses, deux gardées', () => {
    const toutes = CARTES.flatMap((c) => c.adresses);
    expect(toutes).toHaveLength(6);
    expect(toutes.filter((a) => adresseGardeeDansLencart(a, CARTES, CHOIX_LOCATAIRE_DEFAUT))).toHaveLength(2);
  });

  it('⚠️ plusieurs occupants EN PLACE du même bail sont gardés ensemble', () => {
    const duo = [{ ...EN_PLACE, cle: 'occ-92a', adresses: ['a@x.fr'] },
      { ...EN_PLACE, cle: 'occ-92b', adresses: ['b@x.fr'] }, VAGLIO];
    expect(adresseGardeeDansLencart('a@x.fr', duo, CHOIX_LOCATAIRE_DEFAUT)).toBe(true);
    expect(adresseGardeeDansLencart('b@x.fr', duo, CHOIX_LOCATAIRE_DEFAUT)).toBe(true);
  });
});

describe('🔴🔴 ② un ancien choisi REMPLACE le locataire en place', () => {
  const choix = { sorte: 'ancien' as const, cle: VAGLIO.cle };

  it('🔴🔴 ses deux adresses, et aucune autre', () => {
    for (const a of VAGLIO.adresses) expect(adresseGardeeDansLencart(a, CARTES, choix), a).toBe(true);
    for (const a of [...EN_PLACE.adresses, ...ACKET.adresses]) {
      expect(adresseGardeeDansLencart(a, CARTES, choix), a).toBe(false);
    }
  });

  /**
   * 🔴🔴 « JAMAIS DEUX PÉRIODES DE LOCATAIRES DANS LA MÊME RECHERCHE » (Arno). Le choix est un SEUL objet : il
   * ne PEUT pas en désigner deux. C'est la forme du type qui tient la règle, pas une vérification.
   */
  it('🔴🔴 on ne peut pas en choisir deux : le choix est unique par construction', () => {
    const gardees = CARTES.flatMap((c) => c.adresses)
      .filter((a) => adresseGardeeDansLencart(a, CARTES, choix));
    expect(gardees).toHaveLength(2);
    expect(new Set(gardees)).toEqual(new Set(VAGLIO.adresses));
  });

  it('🔴 revenir au locataire en place rend l’encart du départ', () => {
    const gardees = CARTES.flatMap((c) => c.adresses)
      .filter((a) => adresseGardeeDansLencart(a, CARTES, CHOIX_LOCATAIRE_DEFAUT));
    expect(new Set(gardees)).toEqual(new Set(EN_PLACE.adresses));
  });

  /** ⚠️ UNE CLÉ INCONNUE (carte disparue d'un ré-import) N'EFFACE PAS TOUT : elle ne désigne rien. */
  it('⚠️ une clé inconnue ne garde que les adresses sans carte', () => {
    const inconnu = { sorte: 'ancien' as const, cle: 'occ-9999' };
    for (const a of CARTES.flatMap((c) => c.adresses)) {
      expect(adresseGardeeDansLencart(a, CARTES, inconnu), a).toBe(false);
    }
    expect(adresseGardeeDansLencart('syndic@x.fr', CARTES, inconnu)).toBe(true);
  });
});

describe('🔴🔴 ③ ce qui n’appartient à aucune carte n’est jamais caché', () => {
  /**
   * 🔴🔴 LA RÈGLE QUI PROTÈGE. Une adresse rangée « locataire » à la main dans le carrousel — la sœur du
   * locataire, son employeur, un ami qui écrit pour lui — n'appartient à aucune occupation : aucune période ne
   * peut donc l'exclure. L'écarter aurait fait disparaître sa capsule sans que rien ne le dise.
   */
  it('🔴🔴 une adresse sans carte reste, quel que soit le choix', () => {
    for (const choix of [CHOIX_LOCATAIRE_DEFAUT, { sorte: 'ancien' as const, cle: ACKET.cle }]) {
      expect(adresseGardeeDansLencart('soeur@x.fr', CARTES, choix)).toBe(true);
    }
  });

  /**
   * ⚠️ AUCUNE CARTE CONNUE ⇒ L'ENCART EST EXACTEMENT CELUI D'AVANT CE LOT. C'est ce qui rend le changement
   * gratuit pour un bien dont la fiche ne porte aucune occupation.
   */
  it('⚠️ sans aucune carte, rien n’est écarté', () => {
    for (const a of ['a@x.fr', 'b@y.fr']) {
      expect(adresseGardeeDansLencart(a, [], CHOIX_LOCATAIRE_DEFAUT), a).toBe(true);
    }
  });

  it('⚠️ la comparaison ignore la casse et les espaces', () => {
    expect(adresseGardeeDansLencart('  MATHILDE.BRASSET@GMAIL.COM ', CARTES, CHOIX_LOCATAIRE_DEFAUT)).toBe(true);
    expect(adresseGardeeDansLencart(' LOUIS.VAGLIO@AUDENCIA.COM ', CARTES, CHOIX_LOCATAIRE_DEFAUT)).toBe(false);
  });
});

describe('🔴 ④ les listes et les mots', () => {
  it('🔴 un en place, deux anciens, du plus récent au plus ancien', () => {
    expect(locatairesEnPlace(CARTES).map((c) => c.cle)).toEqual(['occ-92']);
    expect(anciensLocataires(CARTES).map((c) => c.cle)).toEqual(['occ-503', 'occ-11']);
  });

  /** ⚠️ UNE DATE INCONNUE PASSE EN DERNIER : on ne met pas en avant ce qu'on ne sait pas situer. */
  it('⚠️ une carte sans dates finit la liste', () => {
    const sansDates: CarteLocataireBien = {
      cle: 'occ-0', libelle: 'INCONNU', depuis: null, jusqua: null, enPlace: false, adresses: [],
    };
    expect(anciensLocataires([sansDates, VAGLIO, ACKET]).map((c) => c.cle))
      .toEqual(['occ-503', 'occ-11', 'occ-0']);
  });

  /** 🔴 LA LIGNE D'ARNO : nom + période + nombre d'adresses, et la période écrite comme sur la fiche. */
  it('🔴🔴 la ligne d’un ancien locataire, mot pour mot', () => {
    expect(motAncienLocataire(VAGLIO))
      .toBe('VAGLIO ARNAUD Aurélie et Louis · du 06/02/2025 au 22/10/2025 · 2 adresses');
    expect(motAncienLocataire({ ...ACKET, adresses: ['un@x.fr'] }))
      .toBe('ACKET GOEMAERE - DERRIEN Alizée et Thomas · du 01/04/2022 au 31/01/2025 · 1 adresse');
    expect(motAncienLocataire({ ...ACKET, adresses: [] }))
      .toContain('aucune adresse');
  });

  it('⚠️ une période partielle se dit, jamais une date inventée', () => {
    expect(motAncienLocataire({ ...VAGLIO, jusqua: null })).toContain('depuis le 06/02/2025');
    expect(motAncienLocataire({ ...VAGLIO, depuis: null })).toContain('jusqu’au 22/10/2025');
    expect(motAncienLocataire({ ...VAGLIO, depuis: null, jusqua: null })).toContain('dates inconnues');
  });

  it('🔴 le titre de la ligne dépliable dit combien', () => {
    expect(motAnciensLocataires(2)).toBe('Anciens locataires (2)');
    expect(MOT_LOCATAIRE_EN_PLACE).toBe('Locataire en place');
  });

  /**
   * ══ 🔴 CE VERDICT A CHANGÉ AU LOT HISTORIQUE-BIEN-15, ET IL FAUT DIRE POURQUOI ═══════════════════════════════
   *
   * Il tenait sur `motPiedAnciensLocataires` et figeait « Anciens locataires (2) · ACKET … » : le compte ET le
   * nom, parce que ce mot titrait une ligne REPLIABLE en bas de l'encart, dont le compte disait « il y a quelque
   * chose là-dessous ».
   *
   * 🔴 ARNO A DÉPLACÉ CE MOT DANS UN BOUTON D'EN-TÊTE (lot 15), et il l'écrit lui-même :
   * « Anciens locataires · VAGLIO ARNAUD Aurélie et Louis » — sans le compte. C'est aussi ce qui est juste : le
   * compte répond à « y a-t-il quelque chose là-dessous ? », et cette question ne se pose plus une fois qu'on a
   * choisi. Les garder tous les deux donnait « Anciens locataires (2) · VAGLIO … », où la parenthèse se lit
   * comme le nombre d'adresses de VAGLIO alors que c'est le nombre de CARTES.
   *
   * 🔴 CE QUE LE GARDE PROTÈGE N'A PAS BOUGÉ D'UN MOT : le nom de la carte choisie EST à l'écran, et la période
   * n'y est PAS. Le premier ferme la confusion de périodes du lot 13 ; la seconde éviterait deux sources pour la
   * même borne, qui divergent dès qu'on retouche les dates (« modifiable ensuite », Arno).
   */
  /**
   * ══ 🔴 CE VERDICT A ENCORE CHANGÉ AU LOT HISTORIQUE-BIEN-16, POINT 2 ═══════════════════════════════════════
   *
   * Au lot 15, le bouton devenait « Anciens locataires · ACKET … » dès qu'une carte était choisie. Arno l'a vu à
   * l'écran et tranche : « le bouton reste "Anciens locataires (2)", simplement écrit en noir. On n'ajoute PLUS
   * le nom de la carte, qui fait DOUBLON avec les capsules affichées dessous. »
   *
   * 🔴 ET LA MISE EN PAGE LE CONFIRME : un libellé qui s'allonge au clic faisait passer l'en-tête de une à deux
   * lignes, donc déplaçait la case « tout le groupe » et décalait l'encart sous le curseur, au moment précis où
   * l'on vient de cliquer.
   *
   * 🔴 CE QUE LE GARDE PROTÈGE RESTE LE MÊME, IL A CHANGÉ DE PLACE : le nom de la carte choisie est À L'ÉCRAN —
   * en info-bulle — et la période n'y est toujours pas. Rien n'a disparu.
   */
  it('🔴🔴 le libellé du bouton ne bouge plus, et l’info-bulle nomme la carte', () => {
    expect(motBoutonAnciensLocataires(2)).toBe('Anciens locataires (2)');
    expect(aideBoutonAnciensLocataires(ACKET))
      .toBe('Ancien locataire affiché : ACKET GOEMAERE - DERRIEN Alizée et Thomas');
    /* ⚠️ PAS LES DATES : elles sont déjà dans les deux champs du tableau de bord, et modifiables. */
    expect(aideBoutonAnciensLocataires(ACKET)).not.toContain('01/04/2022');
    /* 🔴 RIEN À DIRE SANS CARTE CHOISIE : une info-bulle qui répète le libellé apprend à ne plus la lire. */
    expect(aideBoutonAnciensLocataires(undefined)).toBeUndefined();
  });

  /** 🔴 LE MOT DU BOUTON DE GAUCHE, AU CARACTÈRE PRÈS — parenthèses comprises : un logement peut avoir un
      occupant ou un couple, et le même bouton sert les deux. */
  it('🔴🔴 « Locataire(s) actuel(s) », mot pour mot', () => {
    expect(MOT_LOCATAIRES_ACTUELS).toBe('Locataire(s) actuel(s)');
  });
});

describe('🔴🔴 ⑤ la période suit le choix', () => {
  /**
   * DEMANDE D'ARNO : « Choisir un ancien locataire règle automatiquement la PÉRIODE sur ses dates d'occupation
   * (modifiable ensuite) ; revenir au locataire en place remet la période précédente. »
   */
  /**
   * 🔴 LA SORTE EST `dates` — celle des DEUX CHAMPS, donc « modifiable ensuite » comme Arno le demande, et
   * celle que `reglerPeriodeSurLeBail` emploie déjà pour le même geste depuis une capsule. `occupation` aurait
   * allumé le bouton « Depuis l'entrée du dernier locataire », qui désigne un AUTRE locataire.
   */
  it('🔴🔴 choisir un ancien donne SES dates, dans les champs modifiables', () => {
    expect(periodeDuChoixLocataire(CARTES, { sorte: 'ancien', cle: VAGLIO.cle }))
      .toEqual({ sorte: 'dates', du: '2025-02-06', au: '2025-10-22' });
  });

  /**
   * 🔴 `null` POUR LE LOCATAIRE EN PLACE : ce n'est pas « aucune période », c'est « ce n'est pas à moi d'en
   * poser une ». C'est l'écran qui remet celle qu'il avait mise de côté — lui seul s'en souvient.
   */
  it('🔴 le locataire en place n’impose aucune période', () => {
    expect(periodeDuChoixLocataire(CARTES, CHOIX_LOCATAIRE_DEFAUT)).toBeNull();
    expect(periodeDuChoixLocataire(CARTES, { sorte: 'ancien', cle: 'occ-9999' })).toBeNull();
  });

  it('⚠️ une carte sans date de sortie garde une borne haute vide', () => {
    expect(periodeDuChoixLocataire([{ ...VAGLIO, jusqua: null }], { sorte: 'ancien', cle: VAGLIO.cle }))
      .toEqual({ sorte: 'dates', du: '2025-02-06', au: null });
  });

  it('⚠️ `carteChoisie` ne désigne rien pour le locataire en place', () => {
    expect(carteChoisie(CARTES, CHOIX_LOCATAIRE_DEFAUT)).toBeUndefined();
    expect(carteChoisie(CARTES, { sorte: 'ancien', cle: ACKET.cle })?.libelle).toContain('ACKET');
  });
});

/**
 * ══ 🔴🔴 ⑥ LE LOGEMENT VACANT — LE CAS QUE LA MESURE A TROUVÉ ═══════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 MESURÉ EN BASE, ET C'EST L'UN DES TROIS BIENS QU'ARNO DEMANDE DE VÉRIFIER. « Bien 315 » (fiche lot-237,
 * 67 rue de Normandie à COURBEVOIE) **n'a aucun locataire en place** : LEON GUIMAREY DI FIORE Isabella et Hugo
 * (sortis le 28/09/2026) et MOUDNI Imane (sortie le 16/01/2025).
 *
 * « Par défaut : seulement le locataire EN PLACE » y désigne PERSONNE. Pris au mot, l'encart Locataire serait
 * arrivé VIDE sur un bien qui porte des années d'échanges — un masquage, que le dépôt interdit sans l'accord
 * d'Arno. Le défaut tombe donc sur le DERNIER locataire connu, et la ligne du pied le nomme.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴🔴 ⑥ un logement vacant n’arrive jamais avec un encart vide', () => {
  const LEON: CarteLocataireBien = {
    cle: 'occ-315', libelle: 'LEON GUIMAREY DI FIORE Isabella et Hugo',
    depuis: '2025-05-01', jusqua: '2026-09-28', enPlace: false,
    adresses: ['isabella.leon@fictif.test', 'hugo.difiore@fictif.test'],
  };
  const MOUDNI: CarteLocataireBien = {
    cle: 'occ-361', libelle: 'MOUDNI Imane',
    depuis: '2022-04-16', jusqua: '2025-01-16', enPlace: false,
    adresses: ['imane.moudni@fictif.test'],
  };
  const VACANT = [LEON, MOUDNI];

  it('🔴🔴 le défaut est le DERNIER locataire sorti, pas le vide', () => {
    expect(ilYAUnLocataireEnPlace(VACANT)).toBe(false);
    expect(choixLocataireParDefaut(VACANT)).toEqual({ sorte: 'ancien', cle: 'occ-315' });
  });

  it('🔴🔴 et ses adresses sont bien celles qu’on voit, pas les trois', () => {
    const choix = choixLocataireParDefaut(VACANT);
    const gardees = VACANT.flatMap((c) => c.adresses)
      .filter((a) => adresseGardeeDansLencart(a, VACANT, choix));
    expect(new Set(gardees)).toEqual(new Set(LEON.adresses));
    expect(gardees).not.toContain('imane.moudni@fictif.test');
  });

  it('🔴 un logement occupé garde le locataire en place, lui', () => {
    const occupe = [{ ...MOUDNI, enPlace: true, jusqua: null }, LEON];
    expect(ilYAUnLocataireEnPlace(occupe)).toBe(true);
    expect(choixLocataireParDefaut(occupe)).toEqual(CHOIX_LOCATAIRE_DEFAUT);
  });

  /** ⚠️ AUCUNE CARTE : le défaut reste « en place », et la règle ② garde alors TOUT. Rien ne change. */
  it('⚠️ sans aucune carte, le défaut reste « locataire en place »', () => {
    expect(choixLocataireParDefaut([])).toEqual(CHOIX_LOCATAIRE_DEFAUT);
    expect(ilYAUnLocataireEnPlace([])).toBe(false);
    expect(adresseGardeeDansLencart('qui@x.fr', [], choixLocataireParDefaut([]))).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT PARTIES-LOCATAIRES-EXCLUSIF — ACTUELS ET ANCIENS NE SE COCHENT JAMAIS ENSEMBLE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   CONSTAT D'ARNO (07/10/2026, lot-49) : « Quand on coche des anciens locataires, la frise et la liste des mails
   montrent EN MÊME TEMPS les mails du locataire actuel (liseré vert) et ceux de l'ancienne locataire (violet). »

   SA RÈGLE : « les locataires actuels et les anciens locataires ne peuvent JAMAIS être cochés en même temps.
   […] Plusieurs anciens locataires peuvent être cochés ensemble, et plusieurs locataires actuels aussi :
   l'exclusivité est entre les deux groupes. » */

describe('🔴🔴 ⑤ l’exclusivité entre locataires actuels et anciens', () => {
  const CARTES = [EN_PLACE, VAGLIO, ACKET];
  const ACTUEL = 'mathilde.brasset@gmail.com';
  const ACTUEL2 = 'thomas.bruere1996@gmail.com';
  const VAG = 'louis.vaglio@audencia.com';
  const VAG2 = 'aurelie.arnaud1402@gmail.com';
  const ACK = 'thomas.derrien@hec.edu';
  /** Un contact annexe rangé « locataire » à la main : il n'est sur AUCUNE carte, donc dans aucun camp. */
  const SOEUR = 'soeur@fictif.test';
  const PROPRIO = 'proprio@fictif.test';

  it('🔴 les deux camps viennent des cartes, et une adresse sans carte n’est dans aucun', () => {
    const { actuels, anciens } = campsDesLocataires(CARTES);
    expect([...actuels].sort()).toEqual([ACTUEL2, ACTUEL].sort());
    expect(anciens.has(VAG)).toBe(true);
    expect(anciens.has(ACK)).toBe(true);
    expect(actuels.has(SOEUR)).toBe(false);
    expect(anciens.has(SOEUR)).toBe(false);
  });

  /**
   * ⚠️ QUELQU'UN QUI EST REVENU DANS LE LOGEMENT COMPTE COMME ACTUEL : le présent l'emporte, et c'est la lecture
   * qu'on fait du mot « locataire » sans y réfléchir. Sans cette levée d'ambiguïté, son adresse aurait été
   * décochée par les DEUX camps, donc par n'importe quel geste.
   */
  it('⚠️ une adresse présente des deux côtés compte comme actuelle', () => {
    const revenu: CarteLocataireBien = { ...VAGLIO, adresses: [ACTUEL] };
    const { actuels, anciens } = campsDesLocataires([EN_PLACE, revenu]);
    expect(actuels.has(ACTUEL)).toBe(true);
    expect(anciens.has(ACTUEL)).toBe(false);
  });

  it('🔴🔴 cocher un ancien décoche TOUS les locataires actuels', () => {
    const r = exclusiviteLocataires([ACTUEL, ACTUEL2], [ACTUEL, ACTUEL2, VAG], CARTES);
    expect(r.parties).toEqual([VAG]);
    expect(r.decoche).toBe('actuels');
    expect(motBasculeLocataires('actuels'))
      .toBe('Locataires actuels décochés : on n’affiche pas actuels et anciens ensemble.');
  });

  it('🔴🔴 et inversement : cocher un actuel décoche tous les anciens', () => {
    const r = exclusiviteLocataires([VAG, ACK], [VAG, ACK, ACTUEL], CARTES);
    expect(r.parties).toEqual([ACTUEL]);
    expect(r.decoche).toBe('anciens');
    expect(motBasculeLocataires('anciens'))
      .toBe('Anciens locataires décochés : on n’affiche pas actuels et anciens ensemble.');
  });

  it('🔴🔴 deux anciens cochés ensemble : rien n’est décoché', () => {
    const r = exclusiviteLocataires([VAG], [VAG, VAG2, ACK], CARTES);
    expect(r.parties).toEqual([VAG, VAG2, ACK]);
    expect(r.decoche).toBeNull();
  });

  it('🔴 deux locataires actuels cochés ensemble : rien n’est décoché non plus', () => {
    const r = exclusiviteLocataires([ACTUEL], [ACTUEL, ACTUEL2], CARTES);
    expect(r.parties).toEqual([ACTUEL, ACTUEL2]);
    expect(r.decoche).toBeNull();
  });

  /** 🔴 « Les autres groupes restent cumulables avec l'un OU l'autre, comme aujourd'hui » (Arno). */
  it('🔴🔴 le propriétaire et un contact annexe traversent intacts', () => {
    const r = exclusiviteLocataires([PROPRIO, SOEUR, ACTUEL], [PROPRIO, SOEUR, ACTUEL, VAG], CARTES);
    expect(r.parties).toEqual([PROPRIO, SOEUR, VAG]);
    expect(r.decoche).toBe('actuels');
  });

  /** 🔴 DÉCOCHER NE BASCULE RIEN : on n'a pas demandé l'autre camp. */
  it('🔴 décocher ne déclenche aucune bascule', () => {
    const r = exclusiviteLocataires([ACTUEL, ACTUEL2], [ACTUEL], CARTES);
    expect(r.parties).toEqual([ACTUEL]);
    expect(r.decoche).toBeNull();
  });

  /** 🔴 ET RIEN À DÉCOCHER ⇒ AUCUNE MENTION : une phrase qui paraît sans raison fait chercher ce qui a changé. */
  it('🔴 cocher un ancien quand aucun actuel n’est coché n’annonce rien', () => {
    const r = exclusiviteLocataires([PROPRIO], [PROPRIO, VAG], CARTES);
    expect(r.parties).toEqual([PROPRIO, VAG]);
    expect(r.decoche).toBeNull();
  });

  /** ⚠️ SANS CARTE, LA RÈGLE NE PEUT RIEN RANGER : la sélection passe telle quelle, comme avant ce lot. */
  it('⚠️ sans aucune carte, rien n’est jamais décoché', () => {
    const r = exclusiviteLocataires([ACTUEL], [ACTUEL, VAG], []);
    expect(r.parties).toEqual([ACTUEL, VAG]);
    expect(r.decoche).toBeNull();
  });
});
