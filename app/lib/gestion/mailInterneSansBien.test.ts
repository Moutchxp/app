import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { examinerMessage } from './rattachement';
import { interneDuMail } from './interneDuMail';

/**
 * ══ 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 4 — UN MAIL « INTERNE » N'A PAS DE BIEN ═══════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (04/10/2026) : « Trouve quel chemin a contourné la règle et ferme-le, avec un test. »
 *
 * ═══ 🔴🔴 LE CHEMIN, ET POURQUOI CE N'ÉTAIT PAS CELUI QU'ON CROYAIT ══════════════════════════════════════════════
 *
 * Les SIX liens « Interne avec bien » n'ont contourné aucune règle : la chronologie le dit à la seconde — le bien a
 * été rattaché d'abord, la marque posée ENSUITE (liens 172463/172464 posés le 03/10 à 11:58:53, échange 36694 marqué
 * à 13:09:55 ; lien 172477 posé le 03/10 à 15:11:21, mail 5499 marqué le 04/10 à 09:20:25). Rien ne retire un
 * rattachement quand on marque un mail « interne », et ce n'est pas un défaut : c'est un arbitrage qui n'a jamais
 * été tranché dans ce sens.
 *
 * 🔴 LE VRAI TROU ÉTAIT AILLEURS, ET IL ÉTAIT OUVERT POUR L'AVENIR : la passe AUTOMATIQUE ne regardait pas la
 * marque. Elle pouvait donc poser un bien confirmé sur un mail qu'Arno venait de marquer interne — sans arbitrage
 * et sans trace. L'état interdit naissait en silence.
 *
 * ⚠️ CORRECTION DU 04/10/2026 (lot PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE) : mon encadré d'origine ajoutait que
 * « le module sait arbitrer ce conflit » parce que `leverInterneApresRattachement` lève la marque quand un HUMAIN
 * rattache un bien. **C'était faux : cette fonction n'a jamais eu d'appelant** (vérifié sur tout le dépôt et
 * depuis son commit d'origine). L'arbitrage décrit n'a jamais tourné — je m'étais fié à un nom de fonction et à
 * son encadré au lieu de chercher qui l'appelle.
 *
 * 🔴 MESURÉ AVANT CORRECTION (04/10/2026) : repassé au moteur, le mail 57433 de l'échange 36665 — marqué interne le
 * 03/10 à 15:37:59 — rendait encore `issue=automatique, certain=448`.
 *
 * ⚠️ CE QUE LE REFUS NE TOUCHE PAS : le geste HUMAIN. Rattacher un bien à la main reste permis, et lève la marque
 * comme avant. L'arbitrage reste possible ; il est simplement RÉSERVÉ À QUELQU'UN.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Un échange minimal où une adresse connue désigne un bien certain — de quoi obtenir un lien automatique. */
const ADRESSE = {
  messageId: 1,
  adresse: 'locataire@exemple.fr',
  adresseBrute: 'locataire@exemple.fr',
  interne: false,
  reconnaissance: {
    partie: 'locataire' as const, lotCle: '100', proprietaireCle: null,
    motif: 'adresse du locataire en place',
  },
};

const BIEN = {
  cle: '100', adresse: '4 rue Fictive', codePostal: '92400', commune: 'PUTEAUX',
  nature: 'Appartement', typeBien: 'Type 2', proprietaireCle: 'P1', proprietaireNom: 'DUPONT Jean',
};

function examiner(interne: boolean | undefined) {
  return examinerMessage({
    messageId: 1,
    adressesEchange: [ADRESSE] as never,
    biens: [BIEN] as never,
    textes: { objet: 'Fuite dans la salle de bain', corps: '', pieces: [] },
    sens: 'recu',
    exclusionRegleId: null,
    interne,
  });
}

describe('🔴🔴 ① le moteur refuse un bien sur un mail marqué « interne »', () => {
  /**
   * 🔴🔴 LE TÉMOIN NÉGATIF D'ABORD : sans la marque, ce mail DOIT obtenir son bien. Sans cette assertion, le test
   * passerait aussi avec un moteur qui ne propose plus rien du tout — on prouverait un refus là où il n'y a qu'une
   * panne.
   */
  it('🔴🔴 sans la marque, le bien est bien trouvé', () => {
    const ex = examiner(undefined);
    expect(ex.issue).toBe('automatique');
    expect(ex.certain?.cible.cle).toBe('100');
  });

  /** 🔴🔴 ET AVEC LA MARQUE, PLUS RIEN — ni lien, ni candidat à trancher. */
  it('🔴🔴 avec la marque, aucun bien et aucun candidat', () => {
    const ex = examiner(true);
    expect(ex.issue).toBe('sans_candidat');
    expect(ex.certain).toBeNull();
    expect(ex.candidats).toEqual([]);
    /* 🔴 LE MOTIF EST ÉCRIT, et il nomme la décision humaine : la file dira POURQUOI il n'y a rien à proposer. */
    expect(ex.motif).toBe('mail marqué « interne » par une personne : il ne concerne aucun bien');
  });

  /**
   * ⚠️ `false` SE COMPORTE COMME L'ABSENCE. Un appelant qui calcule le verdict et le passe à `false` doit obtenir
   * EXACTEMENT le comportement d'avant ce lot — sinon la correction changerait le sort de 11 632 mails sains.
   */
  it('⚠️ `false` et absent donnent le même résultat', () => {
    expect(examiner(false)).toEqual(examiner(undefined));
  });

  /**
   * 🔴 LE REFUS EST EN AMONT DE TOUT CALCUL, et pas un filtrage des candidats à la sortie. On le vérifie par
   * l'ordre du code : il passe AVANT le refus des documents envoyés, lui-même avant `proposerBiens`.
   */
  it('🔴 le refus précède le calcul des propositions', () => {
    const src = readFileSync('app/lib/gestion/rattachement.ts', 'utf8');
    const iInterne = src.indexOf('if (o.interne === true) {');
    const iDocument = src.indexOf('if (estDocumentEnvoye(');
    const iMoteur = src.indexOf('const examen = proposerBiens(');
    expect(iInterne).toBeGreaterThan(0);
    expect(iInterne).toBeLessThan(iDocument);
    expect(iDocument).toBeLessThan(iMoteur);
  });
});

describe('🔴🔴 ② la passe automatique lit la marque, et par le module pur', () => {
  const REPO = readFileSync('app/lib/gestion/rattachementRepo.ts', 'utf8');

  /**
   * 🔴🔴 LA RÈGLE DES TROIS CAS N'EST PAS RÉÉCRITE DANS LA PASSE. `interneDuMail` la porte seul — marque par mail
   * vivante, sinon marque retirée (qui dit « non »), sinon marque de l'échange. La réécrire en SQL ou en ligne ici
   * en ferait une seconde vérité, exactement ce que le point 1 de ce lot vient de défaire.
   */
  it('🔴🔴 le verdict vient de `interneDuMail`, pas d’un calcul local', () => {
    expect(REPO).toContain("const { interneDuMail } = await import('./interneDuMail');");
    expect(REPO).toContain('const interne = interneDuMail({');
    expect(REPO).toContain('marqueDuMailVivante: marque?.vivante === true,');
    expect(REPO).toContain('marqueDuMailConnue: marque !== undefined,');
    expect(REPO).toContain('marqueDeLEchange: marquesDesFils.has(m.filId),');
    /* 🔴 ET IL EST PASSÉ AU MOTEUR : sans cette ligne, tout ce qui précède ne servirait à rien. */
    expect(REPO).toContain('interne,');
  });

  /**
   * ⚠️ DEUX LECTURES POUR TOUT LE PAQUET, jamais une par mail : règle du module. Une requête par mail coûterait
   * un aller-retour par ligne sur une passe qui en traite des milliers.
   */
  it('⚠️ les marques sont lues en deux requêtes pour tout le paquet', () => {
    expect(REPO).toContain('lireInterneDesMessages(paquet.messages.map((m) => m.id)),');
    expect(REPO).toContain('lireInterne(paquet.fils),');
  });

  /**
   * 🔴 LES TROIS CAS D'ARNO, REDITS ICI PARCE QUE C'EST EUX QUI DÉCIDENT. Le deuxième est le piège : une marque
   * RETIRÉE dit « non », et la marque de l'échange ne la ressuscite pas.
   */
  it('🔴 marque vivante ⇒ interne · marque retirée ⇒ non · rien ⇒ l’échange répond', () => {
    expect(interneDuMail({ marqueDuMailVivante: true, marqueDuMailConnue: true, marqueDeLEchange: false }))
      .toBe(true);
    expect(interneDuMail({ marqueDuMailVivante: false, marqueDuMailConnue: true, marqueDeLEchange: true }))
      .toBe(false);
    expect(interneDuMail({ marqueDuMailVivante: false, marqueDuMailConnue: false, marqueDeLEchange: true }))
      .toBe(true);
    expect(interneDuMail({ marqueDuMailVivante: false, marqueDuMailConnue: false, marqueDeLEchange: false }))
      .toBe(false);
  });
});

describe('🔴🔴 ③ ce que le point 4 n’a PAS retiré, et pourquoi', () => {
  /**
   * ══ 🔴🔴 MON AUDIT S'EST TROMPÉ, ET LE TEST GARDE LA TRACE DE L'ERREUR ═══════════════════════════════════════
   *
   * Mon audit comptait « 8 Documents CRITERIMMO avec bien » sur l'OBJET SEUL, sans regarder le SENS. Mesuré le
   * 04/10/2026 : sur 26 126 documents que NOUS avons envoyés, **0** porte un bien — la règle du 01/10 marche. Les
   * 8 étaient des mails REÇUS, des réponses de clients renvoyées par une messagerie qui n'ajoute pas « Re: ».
   *
   * 🔴 ET LA RÈGLE LES PROTÈGE EXPLICITEMENT : « Une RÉPONSE humaine à un document est du vrai courrier client :
   * elle repasse par le moteur normalement et garde ses biens. » Les retirer aurait effacé du courrier client de
   * 5 historiques de biens, sur la foi d'une erreur de comptage.
   *
   * ⚠️ CE TEST FIGE DONC LA DISTINCTION, pour qu'un futur « nettoyage » ne la refasse pas sauter.
   */
  it('🔴🔴 une réponse de client à un document garde son bien', () => {
    const recu = examinerMessage({
      messageId: 1,
      adressesEchange: [ADRESSE] as never,
      biens: [BIEN] as never,
      textes: { objet: 'Document CRITERIMMO - Décompte N°259323', corps: '', pieces: [] },
      /* 🔴 LE SENS EST TOUTE LA DIFFÉRENCE : reçu = du client ; envoyé = de nous. */
      sens: 'recu',
      exclusionRegleId: null,
    });
    expect(recu.issue).toBe('automatique');
    expect(recu.certain?.cible.cle).toBe('100');
  });

  it('🔴 le même objet, mais ENVOYÉ par nous, n’a pas de bien', () => {
    const envoye = examinerMessage({
      messageId: 1,
      adressesEchange: [ADRESSE] as never,
      biens: [BIEN] as never,
      textes: { objet: 'Document CRITERIMMO - Décompte N°259323', corps: '', pieces: [] },
      sens: 'envoye',
      exclusionRegleId: null,
    });
    expect(envoye.issue).toBe('sans_candidat');
    expect(envoye.motif)
      .toBe('document automatique envoyé par l’agence : il se range dans une fiche, jamais dans un bien');
  });
});
