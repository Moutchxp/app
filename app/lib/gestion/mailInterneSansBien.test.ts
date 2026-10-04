import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { examinerMessage } from './rattachement';
import { interneDuMail } from './interneDuMail';
/* 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 2 — le garde « un humain, et lui seul » de la levée. */
import { auteurHumainInterne } from './interneRepo';

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
 * ⚠️ CE QUE LE REFUS NE TOUCHE PAS : le geste HUMAIN. Rattacher un bien à la main reste permis. L'arbitrage reste
 * possible ; il est simplement RÉSERVÉ À QUELQU'UN.
 *
 * 🔴🔴 SUITE DU 04/10/2026 (lot PHOTOS-ET-INTERNE-INVERSE, POINT 2) : l'arbitrage HUMAIN existe désormais pour de
 * vrai. Rattacher un bien à la main LÈVE la marque du mail, selon la fenêtre choisie, après une confirmation qui
 * annonce ce qu'elle fait (`interneLevee`, `leverInterneApresRattachementHumain`). La phrase « et lève la marque
 * comme avant » figurait ici : elle était fausse, puisque rien ne la levait. Le groupe ④ ci-dessous tient
 * l'essentiel — la passe AUTOMATIQUE, elle, n'en lève aucune.
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

/**
 * ══ 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 2 — ④ LA PASSE AUTOMATIQUE NE LÈVE JAMAIS LA MARQUE ════════════════
 *
 * DEMANDE D'ARNO (04/10/2026) : « La passe AUTOMATIQUE ne lève jamais la marque et ne pose jamais de bien sur un
 * mail Interne (garde le test). »
 *
 * 🔴 DEUX MOITIÉS, ET LES DEUX SONT GARDÉES ICI :
 *   · « ne pose jamais de bien sur un mail Interne » → les groupes ① et ② ci-dessus, inchangés ;
 *   · « ne lève jamais la marque »                   → ce groupe-ci.
 *
 * 🔴🔴 POURQUOI UNE LECTURE DE SOURCE ET NON UN APPEL : la passe tourne sur la base, et l'absence d'un appel ne se
 * prouve pas en l'exécutant une fois. Ce qu'on tient, c'est que le code de la passe NE NOMME PAS le verbe de la
 * levée — ce qui est exactement la garantie demandée, et elle se casserait bruyamment le jour où quelqu'un
 * l'ajouterait.
 */
describe('🔴🔴 ④ la passe automatique ne lève aucune marque « interne »', () => {
  const REPO = readFileSync('app/lib/gestion/rattachementRepo.ts', 'utf8');
  const INTERNE = readFileSync('app/lib/gestion/interneRepo.ts', 'utf8');

  /**
   * ══ 🔴🔴 CE QUI SÉPARE LE GESTE HUMAIN DE LA PASSE, ALORS QUE LES DEUX VIVENT DANS LE MÊME FICHIER ══════════
   *
   * ⚠️ LA LEVÉE EST APPELÉE PAR `rattacher()` — la porte du geste HUMAIN — et `rattachementRepo` porte AUSSI la
   * passe automatique. Un garde qui se contenterait de chercher le nom dans le fichier ne prouverait donc plus
   * rien : il faut regarder OÙ l'appel est, et CE QUI le refuse.
   *
   * 🔴 TROIS BARRIÈRES, ET CHACUNE SUFFIRAIT :
   *   ① la passe ne propose AUCUN bien sur un mail interne (groupes ① et ② ci-dessus) : elle n'atteint donc
   *      jamais `rattacher` pour un tel mail ;
   *   ② la levée refuse un auteur non humain en première ligne — et la passe signe « automatique » ;
   *   ③ la levée est appelée dans `leverLaMarque`, c'est-à-dire sur le chemin du geste manuel, après la
   *      transaction, et jamais depuis la boucle d'examen.
   */
  it('🔴🔴 ② la levée refuse un auteur non humain, et le dit en première ligne', () => {
    const corps = INTERNE.slice(INTERNE.indexOf('export async function leverInterneApresRattachementHumain'));
    const premiere = corps.slice(0, corps.indexOf('const internes'));
    expect(premiere).toContain('if (!auteurHumainInterne(o.auteur)) return [];');
  });

  it('⚠️ un auteur « automatique » n’est pas un humain', () => {
    expect(auteurHumainInterne({ libelle: 'automatique' })).toBe(false);
    expect(auteurHumainInterne({ libelle: 'Automatique' })).toBe(false);
    expect(auteurHumainInterne({ libelle: '' })).toBe(false);
    expect(auteurHumainInterne({ libelle: 'Arnaud JOREL' })).toBe(true);
  });

  /**
   * 🔴🔴 ③ L'APPEL EST SUR LE CHEMIN DU GESTE MANUEL, ET NULLE PART AILLEURS : une seule occurrence dans tout le
   * fichier, dans `leverLaMarque`, aux côtés de sa jumelle « hors gestion ». Une seconde occurrence — dans la
   * boucle d'examen, par exemple — ferait rougir cette épreuve.
   */
  it('🔴🔴 ③ un seul appel, dans `leverLaMarque`, après la transaction', () => {
    expect((REPO.match(/leverInterneApresRattachementHumain/g) ?? []).length).toBe(2); // l'import et l'appel
    const bloc = REPO.slice(REPO.indexOf('const leverLaMarque = async'));
    const corps = bloc.slice(0, bloc.indexOf('};'));
    expect(corps).toContain('leverInterneApresRattachementHumain({ messageIds: [o.messageId], auteur: o.auteur })');
    expect(REPO).toContain('if (issue.ok) await leverLaMarque();');
    /* ⚠️ ET JAMAIS POUR UN ÉVÉNEMENT : poser une carte ne dit rien des biens. */
    expect(corps).toContain("if (o.cible.sorte === 'evenement') return;");
  });

  /** 🔴 LA PASSE, ELLE, NE FAIT QUE LIRE LA MARQUE — et par le module pur (groupe ② ci-dessus). */
  it('🔴 la passe ne nomme aucun verbe d’écriture de la marque', () => {
    const passe = REPO.slice(REPO.indexOf('lireInterneDesMessages(paquet.messages'));
    const jusquAuGeste = passe.slice(0, passe.indexOf('// ── LES GESTES'));
    expect(jusquAuGeste).not.toContain('leverInterneApresRattachementHumain');
    expect(jusquAuGeste).not.toContain('annulerInterneDesMessages');
    expect(jusquAuGeste).not.toContain('declarerNonInterneDesMessages');
  });
});
