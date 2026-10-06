import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  commentaireMonga, auteurCommentaire, etapesDuMailMonga, jourISO, motEtape,
  ouvertureDeRepli, proposerCloture, proposerPassageEnFiable, rangsDesDevis, rangEtape,
  estRepere, ETAPES_MAJEURES, TYPES_AJOUTABLES, TYPES_RESERVOIR, CONFIRMATIONS_POUR_PROPOSER,
} from './mongaEtape';

/**
 * ══ 🔴🔴 LOT MONGA-2, POINTS 1 ET 2 — CE QU'UN MAIL MONGA RACONTE ════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Les gabarits éprouvés ici sont RECOPIÉS DU CORPUS RÉEL, à la virgule près — apostrophes typographiques
 * comprises, et la faute de Monga (« en attende de validation ») comprise aussi. Les réécrire proprement
 * serait éprouver un mail que Monga n'envoie pas.
 *
 * 🔴 CE QUE L'AUDIT DU 06/10/2026 A MESURÉ, et que ces épreuves figent : 98 mails gabarités, 35 références,
 * 25 déjà à la corbeille. L'étape est dans le CORPS (53 mails ont pour objet « Nouveau commentaire », qui ne dit
 * rien), et quatre motifs seulement sont fiables : prise de rendez-vous (7/7), rendez-vous d'intervention
 * (15/15), devis reçu avec numéro (9/9), rappel de devis (21/21).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Un mail Monga réel, réduit à ce que le module lit. Le pied de page est tronqué, il ne sert à rien. */
const mail = (commentaire: string, auteur = 'Laura Dartiguemalle'): string =>
  `Monga\n\nBallon hs MNG-22816\n\n19 Rue Diderot, 92130 Issy-les-Moulineaux\nBonjour\n\n`
  + `Un nouveau message vous a été envoyé concernant la mission MNG-22816.\n\n${commentaire}\n\n`
  + `Envoyé par ${auteur}, le 06/10/2026 à 13:53\n \n\nVers Mission\n[https://app.monga.io/missions/view/2b03]`;

describe('① le commentaire se détache du gabarit', () => {
  it('🔴 le texte entre « concernant la mission » et « Envoyé par »', () => {
    expect(commentaireMonga(mail('Bonjour, tout va bien')))
      .toBe('Bonjour, tout va bien');
    expect(auteurCommentaire(mail('x'))).toBe('Laura Dartiguemalle');
  });

  /**
   * 🔴🔴 LE PIÈGE MESURÉ : UN MAIL DE RELANCE EMPILE DEUX BLOCS. Un découpage glouton aurait collé la signature
   * du premier dans le commentaire du second — c'est ce qui faisait apparaître DEUX dates dans un même
   * commentaire (1 cas sur 22 à l'audit) et rendait la date du rendez-vous ambiguë.
   */
  it('🔴🔴 on s’arrête à la PREMIÈRE signature, jamais à la dernière', () => {
    const double = `Un nouveau message vous a été envoyé concernant la mission MNG-23448.\n`
      + `Rappel : la facture est en attente.\nEnvoyé par Laura, le 05/10/2026 à 09:00\n`
      + `Un nouveau message vous a été envoyé concernant la mission MNG-23448.\n`
      + `Autre chose.\nEnvoyé par Laura, le 06/10/2026 à 09:00`;
    expect(commentaireMonga(double)).toBe('Rappel : la facture est en attente.');
  });

  /** ⚠️ CERTAINS MAILS N'ONT PAS DE SIGNATURE : on s'arrête alors à « Vers Mission », qui est toujours là. */
  it('⚠️ sans signature, le lien « Vers Mission » borne le commentaire', () => {
    const sansSignature = 'Un nouveau message vous a été envoyé concernant la mission MNG-1234.\n'
      + 'Votre devis N°DEV-20261002-19048 est désormais disponible.\n\nVers Mission\n[https://app.monga.io]';
    expect(commentaireMonga(sansSignature))
      .toBe('Votre devis N°DEV-20261002-19048 est désormais disponible.');
  });

  it('⚠️ un mail sans partie texte ne rend rien, et ne jette pas', () => {
    expect(commentaireMonga(null)).toBeNull();
    expect(commentaireMonga('')).toBeNull();
    expect(etapesDuMailMonga('Le ticket MONGA 23706 requiert votre attention', '')).toEqual([]);
  });
});

describe('② les quatre motifs FIABLES', () => {
  /**
   * 🔴🔴 L'INTERVENTION ET LE RENDEZ-VOUS NE DIFFÈRENT QUE PAR UN MOT, et ce mot sépare deux étapes distinctes de
   * la frise : le diagnostic (« le rendez-vous ») et l'intervention (« l'intervention »). Les confondre
   * mélangerait la visite de diagnostic et la réparation — c'est le piège central de ce gabarit.
   */
  it('🔴🔴 « l’intervention … a été fixée » ⇒ rendez-vous d’INTERVENTION, avec date et plage', () => {
    const [e] = etapesDuMailMonga('MNG-22816 - Nouveau commentaire',
      mail('Bonjour, l’intervention avec notre artisan partenaire a été fixée le 09/10/2026 entre 10h30 et 11h00'));
    expect(e.type).toBe('rdv_intervention');
    expect(e.certitude).toBe('fiable');
    expect(e.jour).toBe('2026-10-09');
    expect(e.heure).toEqual({ de: '10:30', a: '11:00' });
  });

  it('🔴🔴 « le rendez-vous … a été fixé » ⇒ PRISE DE RENDEZ-VOUS (diagnostic)', () => {
    const [e] = etapesDuMailMonga('MNG-23921 - Nouveau commentaire',
      mail('Bonjour, le rendez-vous avec notre artisan partenaire a été fixé le 03/10/2026 entre 15h00 et 16h00'));
    expect(e.type).toBe('prise_rdv');
    expect(e.jour).toBe('2026-10-03');
    expect(e.heure).toEqual({ de: '15:00', a: '16:00' });
  });

  /** ⚠️ LA VARIANTE « vers 10h00 » EXISTE (1 cas mesuré) : une plage sans fin, et non une absence d'heure. */
  it('⚠️ la variante « vers HHhMM » donne un début sans fin', () => {
    const [e] = etapesDuMailMonga('x',
      mail('Bonjour, l’intervention avec notre artisan partenaire a été fixée le 13/05/2026 vers 10h00'));
    expect(e.heure).toEqual({ de: '10:00', a: null });
  });

  /**
   * 🔴🔴 LE SEUL SIGNAL DE DEVIS QUI PORTE SON NUMÉRO — et il arrive dans un COMMENTAIRE, pas dans un objet
   * dédié. C'est l'étape que la première passe de l'audit avait manquée en ne lisant que les objets.
   */
  it('🔴🔴 « Votre devis N°DEV-… » ⇒ devis reçu, avec son numéro', () => {
    const [e] = etapesDuMailMonga('MNG-24544 - Nouveau commentaire',
      mail('Votre devis N°DEV-20261002-19048 est désormais disponible, nous vous invitons à en prendre connaissance.'));
    expect(e.type).toBe('devis_recu');
    expect(e.certitude).toBe('fiable');
    expect(e.numero).toBe('DEV-20261002-19048');
    /* 🔴 ET AUCUN MONTANT : l'audit a mesuré qu'il n'y en a jamais. Voir l'encadré du module. */
    expect(e).not.toHaveProperty('montant');
  });

  it('🔴🔴 « Rappel N : Devis en attende de validation » ⇒ rappel, avec son rang', () => {
    /* ⚠️ « attende » EST LA FAUTE DE MONGA, recopiée telle quelle : la corriger ne ferait plus rien détecter. */
    const [e] = etapesDuMailMonga('MNG-23830 - Rappel 2 : Devis en attende de validation - fuite sous baignoire', null);
    expect(e.type).toBe('rappel_devis');
    expect(e.rang).toBe(2);
  });
});

describe('③ les motifs À CONFIRMER', () => {
  const cas: [string, string, string][] = [
    ['ouverture', 'Bonjour, nous accusons bonne réception de votre demande et programmons le rendez-vous avec l’un de nos artisans partenaires dans les plus brefs délais', 'ouverture'],
    ['rendez-vous eu lieu', 'Bonjour, nous vous informons que le rendez-vous a bien eu lieu, nous sommes dans l\'attente du devis de notre artisan partenaire.', 'rdv_eu_lieu'],
    ['rapport de visite', 'Le rapport de visite est désormais disponible, nous vous invitons à en prendre connaissance.', 'rdv_eu_lieu'],
    ['intervention', 'Le rapport d’intervention est désormais disponible, nous vous invitons à en prendre connaissance.', 'intervention'],
    ['contact injoignable', 'Bonjour, nous n\'avons pas réussi à joindre le contact sur place. Un message vocal lui a été laissé.', 'contact_injoignable'],
  ];
  for (const [nom, texte, attendu] of cas) {
    it(`⚠️ « ${nom} » est lu, et porte la mention « à confirmer »`, () => {
      const [e] = etapesDuMailMonga('MNG-1 - Nouveau commentaire', mail(texte));
      expect(e.type).toBe(attendu);
      expect(e.certitude).toBe('a_confirmer');
    });
  }

  it('⚠️ la facture porte son numéro quand il y est', () => {
    const [e] = etapesDuMailMonga('x',
      mail('La facture d’intervention N°FACT-20260930-16424 est désormais disponible.'));
    expect(e.type).toBe('facture');
    expect(e.numero).toBe('FACT-20260930-16424');
  });

  it('⚠️ la clôture se lit dans l’objet', () => {
    const [e] = etapesDuMailMonga('MNG-21641 - Mission terminée : Votre paiement a été reçu', null);
    expect(e.type).toBe('cloture');
    expect(e.certitude).toBe('a_confirmer');
  });
});

describe('④ ce qui n’est pas une étape reste un repère', () => {
  /**
   * 🔴 19 DES 98 MAILS SONT DU TEXTE HUMAIN LIBRE (« Hello Anaïs… »). Les jeter perdrait l'historique ; en faire
   * des étapes encombrerait la frise de choses qui n'en sont pas. Arno : « simples petits repères discrets ».
   */
  it('🔴 un commentaire humain donne un repère « commentaire », jamais une étape majeure', () => {
    const [e] = etapesDuMailMonga('MNG-1 - Nouveau commentaire',
      mail('Hello Anaïs Je sépare les missions car ce n’est pas le même corps de métier'));
    expect(e.type).toBe('commentaire');
    expect(estRepere(e.type)).toBe(true);
    expect(ETAPES_MAJEURES).not.toContain('commentaire');
  });

  it('🔴 les quatre repères ne sont jamais des étapes majeures', () => {
    for (const t of ['facture', 'rappel_devis', 'contact_injoignable', 'commentaire'] as const) {
      expect(estRepere(t), t).toBe(true);
      expect(ETAPES_MAJEURES, t).not.toContain(t);
    }
  });

  /** ⚠️ `commentaire` N'EST PAS AJOUTABLE À LA MAIN : un commentaire est ce que MONGA dit. Voir le module. */
  it('⚠️ « + Ajouter une étape » ne propose pas « commentaire »', () => {
    expect(TYPES_AJOUTABLES).not.toContain('commentaire');
    for (const t of ['assurance', 'expertise', 'relance', 'autre'] as const) {
      expect(TYPES_AJOUTABLES, t).toContain(t);
    }
  });
});

describe('⑤ un mail peut porter DEUX étapes', () => {
  /**
   * 🔴 UN MAIL DE RELANCE PORTE SON RAPPEL (objet) ET SON COMMENTAIRE (corps). Rendre une seule étape aurait
   * obligé à choisir laquelle perdre — et c'est le rappel qu'on aurait perdu, puisque le corps est lu d'abord.
   */
  it('🔴 rappel dans l’objet + commentaire dans le corps ⇒ deux étapes', () => {
    const e = etapesDuMailMonga('MNG-23830 - Rappel 1 : Devis en attende de validation - fuite',
      mail('Hello Anaïs, je relance l’artisan'));
    expect(e.map((x) => x.type).sort()).toEqual(['commentaire', 'rappel_devis']);
  });

  /**
   * ⚠️ MAIS PAS DEUX DEVIS POUR UN SEUL : si le corps a déjà donné le devis AVEC son numéro, l'objet
   * « Devis envoyé » ne doit pas en ajouter un second — le rang affiché (« Devis 2 ») serait faux.
   */
  it('⚠️ le devis du corps empêche celui de l’objet de doubler', () => {
    const e = etapesDuMailMonga('MNG-1 - Devis envoyé : En attente de votre validation',
      mail('Votre devis N°DEV-20261002-19048 est désormais disponible.'));
    expect(e.filter((x) => x.type === 'devis_recu')).toHaveLength(1);
    expect(e[0].numero).toBe('DEV-20261002-19048');
  });
});

describe('⑥ le rang des devis', () => {
  it('🔴 par ordre d’arrivée', () => {
    const r = rangsDesDevis([
      { id: 2, numero: 'DEV-B', jour: '2026-10-02' },
      { id: 1, numero: 'DEV-A', jour: '2026-09-01' },
      { id: 3, numero: 'DEV-C', jour: '2026-10-05' },
    ]);
    expect([r.get(1), r.get(2), r.get(3)]).toEqual([1, 2, 3]);
  });

  /**
   * 🔴🔴 LE DOUBLON MESURÉ : la référence 23449 a reçu DEUX mails portant le MÊME numéro de devis. Les compter
   * deux fois afficherait « Devis 1 » et « Devis 2 » pour un seul devis.
   */
  it('🔴🔴 deux mails du même numéro ne font qu’un seul devis', () => {
    const r = rangsDesDevis([
      { id: 1, numero: 'DEV-20260911-18555', jour: '2026-09-11' },
      { id: 2, numero: 'DEV-20260911-18555', jour: '2026-09-11' },
      { id: 3, numero: 'DEV-20260930-18981', jour: '2026-09-30' },
    ]);
    expect([r.get(1), r.get(2), r.get(3)]).toEqual([1, 1, 2]);
  });

  /** ⚠️ UN DEVIS SANS NUMÉRO COMPTE QUAND MÊME : c'est le cas des devis posés à la main. */
  it('⚠️ les devis sans numéro gardent leur rang', () => {
    const r = rangsDesDevis([
      { id: 1, numero: null, jour: '2026-09-01' },
      { id: 2, numero: null, jour: '2026-09-02' },
    ]);
    expect([r.get(1), r.get(2)]).toEqual([1, 2]);
  });
});

describe('⑦ l’ouverture de repli (décision d’Arno)', () => {
  /**
   * 🔴 MESURÉ : aucun mail n'annonce l'ouverture. Le premier mail d'une référence est au hasard un commentaire
   * (15 références), un « ticket » (10) ou un rappel (7). Sans repli, la frise commencerait à « Prise de
   * rendez-vous » dans 33 cas sur 35, comme si le dossier était né là.
   */
  it('🔴 elle prend la date du premier mail, et reste « à confirmer »', () => {
    const e = ouvertureDeRepli('2026-09-23T17:02:00+02:00');
    expect(e.type).toBe('ouverture');
    expect(e.certitude).toBe('a_confirmer');
    expect(e.jour).toBe('2026-09-23');
    expect(e.texte).toContain('aucun accusé de réception');
  });
});

describe('⑧ la proposition de passage en fiable (décision d’Arno)', () => {
  it('🔴 cinq confirmations sans aucun écart', () => {
    expect(CONFIRMATIONS_POUR_PROPOSER).toBe(5);
    expect(proposerPassageEnFiable({ confirmees: 5, ecartees: 0 })).toBe(true);
    expect(proposerPassageEnFiable({ confirmees: 4, ecartees: 0 })).toBe(false);
  });

  /**
   * 🔴🔴 UN SEUL ÉCART SUFFIT À REFUSER, quel que soit le nombre de confirmations. C'est la lecture littérale de
   * « confirmée 5 fois SANS être écartée », et c'est la direction sûre : un motif qui s'est trompé une fois
   * n'est pas fiable, et le passer en automatique fabriquerait des étapes fausses sans contrôle.
   */
  it('🔴🔴 un seul écart annule tout, même à 50 confirmations', () => {
    expect(proposerPassageEnFiable({ confirmees: 50, ecartees: 1 })).toBe(false);
  });
});

describe('⑨ la proposition de clôture', () => {
  /** 🔴 « PROPOSITION de clôturer l'événement (jamais automatique) » — Arno. */
  it('🔴 proposée sur une intervention ou une clôture reçue', () => {
    expect(proposerCloture([{ type: 'intervention', statut: 'vif' }], false)).toBe(true);
    expect(proposerCloture([{ type: 'cloture', statut: 'vif' }], false)).toBe(true);
    expect(proposerCloture([{ type: 'prise_rdv', statut: 'vif' }], false)).toBe(false);
  });

  /** ⚠️ RIEN SUR UN ÉVÉNEMENT DÉJÀ TRAITÉ : une proposition qui porte sur ce qui est fait apprend à les ignorer. */
  it('⚠️ jamais sur un événement déjà traité, ni sur une étape retirée', () => {
    expect(proposerCloture([{ type: 'intervention', statut: 'vif' }], true)).toBe(false);
    expect(proposerCloture([{ type: 'intervention', statut: 'retire' }], false)).toBe(false);
  });
});

describe('⑩ les mots et l’ordre', () => {
  it('🔴 chaque type a son mot, et aucun n’est vide', () => {
    for (const t of [...ETAPES_MAJEURES, ...TYPES_AJOUTABLES, 'commentaire' as const]) {
      expect(motEtape(t), t).toBeTruthy();
    }
  });

  it('🔴 les étapes majeures se rangent dans l’ordre du dossier', () => {
    const rangs = ETAPES_MAJEURES.map(rangEtape);
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
  });

  /**
   * ══ 🔴🔴 CE QUE CES DEUX ÉPREUVES DISAIENT AVANT, ET POURQUOI ELLES ONT CHANGÉ ═════════════════════════════
   *
   * Elles tenaient `ETAPES_ATTENDUES` — la liste des étapes affichées EN POINTILLÉ tant qu'elles n'étaient pas
   * atteintes. Cette constante a été SUPPRIMÉE au lot FRISE-CONSTRUCTIBLE, sur accord explicite d'Arno : « la
   * frise d'avancement n'impose plus aucune suite d'étapes […] les carrés “attendue” en pointillé sont
   * supprimés. »
   *
   * 🔴 CE QUI LES REMPLACE EST AUSSI STRICT : la liste du RÉSERVOIR, qu'Arno a dictée carte par carte. Elle est
   * vérifiée à la lettre ci-dessous — c'est elle qui décide ce qu'un collaborateur peut poser.
   */
  it('🔴🔴 le réservoir contient exactement les cartes qu’Arno a nommées', () => {
    expect([...TYPES_RESERVOIR]).toEqual([
      'prise_rdv', 'rdv_eu_lieu', 'devis_recu', 'devis_refuse', 'devis_accepte',
      'rdv_intervention', 'intervention', 'rapport', 'facture',
      'assurance', 'expertise', 'relance', 'cloture', 'autre',
    ]);
  });

  /**
   * 🔴 `ouverture` N'EST PAS DANS LE RÉSERVOIR : la frise porte toujours sa propre carte d'ouverture, en
   * première position, venue de la date de l'ÉVÉNEMENT (Arno, point 1). L'offrir ici aurait permis d'en poser
   * une seconde, et deux ouvertures sur une frise ne veulent rien dire.
   *
   * ⚠️ MAIS ELLE RESTE **AJOUTABLE**, et c'est une garde, pas un oubli : des étapes d'ouverture manuelles
   * existent en base depuis MONGA-2, et une route qui cesserait de les accepter rendrait leur modification
   * impossible.
   */
  it('🔴 « ouverture » est hors du réservoir, mais la route l’accepte toujours', () => {
    expect(TYPES_RESERVOIR).not.toContain('ouverture');
    expect(TYPES_AJOUTABLES).toContain('ouverture');
  });

  /** ⚠️ ET LES MOTS DE MONGA N'Y SONT PAS : un commentaire ou un rappel est ce que MONGA dit, pas ce qu'on pose. */
  it('⚠️ ni « commentaire » ni « rappel_devis » ne sont posables', () => {
    for (const t of ['commentaire', 'rappel_devis'] as const) {
      expect(TYPES_RESERVOIR, t).not.toContain(t);
      expect(TYPES_AJOUTABLES, t).not.toContain(t);
    }
  });

  /**
   * 🔴🔴 LE RÉSERVOIR N'A RIEN RETIRÉ : tout ce que l'ancienne liste `TYPES_AJOUTABLES` offrait est encore
   * offert. C'est l'épreuve qui tient la règle d'Arno « ne retire, ne masque et ne conditionne aucune
   * fonctionnalité sans mon accord » sur ce point précis.
   */
  it('🔴🔴 rien de ce qu’on pouvait poser avant n’a disparu', () => {
    for (const t of ['ouverture', 'prise_rdv', 'rdv_eu_lieu', 'devis_recu', 'devis_accepte',
      'rdv_intervention', 'intervention', 'cloture', 'facture', 'assurance', 'expertise',
      'relance', 'autre'] as const) {
      expect(TYPES_AJOUTABLES, t).toContain(t);
    }
  });

  /**
   * 🔴 « Acceptation du devis » N'ARRIVE JAMAIS PAR MAIL : 0 cas mesuré sur 120 à l'audit — Monga ne notifie pas
   * la validation, c'est nous qui validons chez eux. Elle est donc posable, et aucun motif ne la produit.
   *
   * 🔴 ET C'EST VRAI AUSSI DU « Devis refusé » ajouté par ce lot, pour exactement la même raison mesurée.
   */
  it('🔴 « devis_accepte » et « devis_refuse » sont posables, et aucun motif ne les produit', () => {
    expect(TYPES_RESERVOIR).toContain('devis_accepte');
    expect(TYPES_RESERVOIR).toContain('devis_refuse');
    const src = readFileSync('app/lib/gestion/mongaEtape.ts', 'utf8');
    const corps = src.slice(src.indexOf('export function etapesDuMailMonga'));
    expect(corps).not.toContain("'devis_accepte'");
    expect(corps).not.toContain("'devis_refuse'");
  });

  /**
   * ⚠️ `rapport` NON PLUS N'EST PRODUIT PAR AUCUN MOTIF, et c'est voulu : les deux gabarits de rapport que
   * Monga envoie sont déjà rangés ailleurs (« rapport de visite » → `rdv_eu_lieu`, « rapport d'intervention »
   * → `intervention`). Ces deux lectures ne changent PAS — l'épreuve ⑤ de ce fichier les tient toujours.
   */
  it('⚠️ « rapport » est posable à la main, et ne change aucune lecture Monga', () => {
    expect(TYPES_RESERVOIR).toContain('rapport');
    const src = readFileSync('app/lib/gestion/mongaEtape.ts', 'utf8');
    const corps = src.slice(src.indexOf('export function etapesDuMailMonga'));
    expect(corps).not.toContain("'rapport'");
  });
});

describe('⑪ jourISO', () => {
  it('🔴 JJ/MM/AAAA → AAAA-MM-JJ, et rien d’autre', () => {
    expect(jourISO('09/10/2026')).toBe('2026-10-09');
    expect(jourISO('31/12/2026')).toBe('2026-12-31');
    expect(jourISO('2026-10-09')).toBeNull();
    expect(jourISO('09/13/2026')).toBeNull();
    expect(jourISO(null)).toBeNull();
  });
});

describe('⑫ le module reste pur', () => {
  /**
   * 🔴🔴 RÈGLE DU DÉPÔT DEPUIS L'INCIDENT DU 24/09/2026 : un module tiré par un composant client ne doit
   * atteindre ni `pg`, ni le réseau, ni React. Le garde de graphe l'attrape dans la suite ; ceci le dit à
   * l'endroit où l'on écrirait l'import de trop.
   */
  it('🔴🔴 aucun import, aucune I/O', () => {
    const src = readFileSync('app/lib/gestion/mongaEtape.ts', 'utf8');
    expect(src).not.toMatch(/^import /m);
    expect(src).not.toContain('fetch(');
    expect(src).not.toContain('require(');
    expect(src).not.toContain('new Date(');
  });
});
