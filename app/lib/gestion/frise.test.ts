import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  cleDOuverture, construireFrise, etapeOuvrable, motDateEtape, motDeLaCase, motGroupeMessages,
  motMailDOrigine, motMontant, motSource, pictoSource, rangerEnLigne,
  type EtapeAAfficher,
} from './frise';

/**
 * ══ 🔴🔴 LOT MONGA-2, POINT 3 — COMMENT LA FRISE SE RANGE ════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO : « Les ÉTAPES MAJEURES, bien visibles, dans l'ordre chronologique […] Les étapes attendues mais
 * pas encore atteintes s'affichent en pointillé. Les COMMENTAIRES Monga et les rappels : simples petits repères
 * discrets sur la frise […] Ce ne sont pas des étapes. »
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

let n = 0;
const etape = (p: Partial<EtapeAAfficher>): EtapeAAfficher => ({
  id: (n += 1), reference: 'MNG-10000', type: 'ouverture', survenuLe: '2026-09-01T00:00:00', heureConnue: false, heureFin: null,
  numero: null, rang: null, montantCents: null, texte: null, auteur: null, source: 'monga',
  certitude: 'fiable', messageId: 1, aEuUnMail: true, filId: 10, creeParLibelle: null, rangDevis: null, ...p,
});

describe('① l’ordre : chronologique, puis l’ordre du dossier', () => {
  it('🔴 les étapes atteintes se rangent par date', () => {
    const { majeures } = construireFrise([
      etape({ type: 'cloture', survenuLe: '2026-10-05T00:00:00' }),
      etape({ type: 'ouverture', survenuLe: '2026-09-01T00:00:00' }),
      etape({ type: 'prise_rdv', survenuLe: '2026-09-15T00:00:00' }),
    ]);
    const atteintes = majeures.filter((c) => c.etape !== null).map((c) => c.type);
    expect(atteintes).toEqual(['ouverture', 'prise_rdv', 'cloture']);
  });

  /**
   * 🔴 À DATE ÉGALE, L'ORDRE DU DOSSIER — et non celui de l'identifiant. Deux étapes du même jour (c'est le cas
   * ordinaire : un devis reçu et un rappel arrivent le même matin) s'afficheraient sinon au hasard de l'ordre
   * d'insertion en base, qui n'a aucun sens pour un lecteur.
   */
  it('🔴 à date égale, c’est l’ordre du dossier qui tranche', () => {
    const { majeures } = construireFrise([
      etape({ id: 99, type: 'intervention', survenuLe: '2026-10-01T00:00:00' }),
      etape({ id: 1, type: 'rdv_intervention', survenuLe: '2026-10-01T00:00:00' }),
    ]);
    const atteintes = majeures.filter((c) => c.etape !== null).map((c) => c.type);
    expect(atteintes).toEqual(['rdv_intervention', 'intervention']);
  });
});

describe('② les étapes attendues, en pointillé', () => {
  it('🔴🔴 une étape attendue absente apparaît, sans date, à sa place logique', () => {
    const { majeures } = construireFrise([
      etape({ type: 'ouverture', survenuLe: '2026-09-01T00:00:00' }),
      etape({ type: 'cloture', survenuLe: '2026-10-05T00:00:00' }),
    ]);
    const types = majeures.map((c) => c.type);
    /* Les cinq attendues manquantes se glissent entre l'ouverture et la clôture. */
    expect(types.indexOf('ouverture')).toBeLessThan(types.indexOf('prise_rdv'));
    expect(types.indexOf('prise_rdv')).toBeLessThan(types.indexOf('devis_recu'));
    expect(types.indexOf('devis_recu')).toBeLessThan(types.indexOf('devis_accepte'));
    expect(types.indexOf('devis_accepte')).toBeLessThan(types.indexOf('rdv_intervention'));
    expect(types.indexOf('rdv_intervention')).toBeLessThan(types.indexOf('intervention'));
    expect(types.indexOf('intervention')).toBeLessThan(types.indexOf('cloture'));
    /* ⚠️ UN POINTILLÉ N'A PAS D'ÉTAPE : c'est à cela que l'écran le reconnaît. */
    expect(majeures.find((c) => c.type === 'prise_rdv')?.etape).toBeNull();
  });

  it('🔴 une étape atteinte ne reçoit pas de pointillé en double', () => {
    const { majeures } = construireFrise([etape({ type: 'prise_rdv' })]);
    expect(majeures.filter((c) => c.type === 'prise_rdv')).toHaveLength(1);
    expect(majeures.find((c) => c.type === 'prise_rdv')?.etape).not.toBeNull();
  });

  /**
   * 🔴🔴 `rdv_eu_lieu` N'EST PAS ATTENDUE, et c'est mesuré : Monga ne l'envoie que dans 3 cas sur 35 références.
   * L'afficher en pointillé partout ferait croire à un trou dans le dossier là où il n'y a qu'un gabarit que
   * Monga n'émet pas toujours.
   */
  it('🔴🔴 aucun pointillé pour une étape que Monga n’envoie pas toujours', () => {
    const { majeures } = construireFrise([etape({ type: 'ouverture' })]);
    expect(majeures.some((c) => c.type === 'rdv_eu_lieu' && c.etape === null)).toBe(false);
  });

  /** ⚠️ MAIS ELLE S'AFFICHE QUAND ELLE ARRIVE : non attendue ne veut pas dire ignorée. */
  it('⚠️ `rdv_eu_lieu` s’affiche quand elle existe', () => {
    const { majeures } = construireFrise([etape({ type: 'rdv_eu_lieu' })]);
    expect(majeures.some((c) => c.type === 'rdv_eu_lieu' && c.etape !== null)).toBe(true);
  });

  /** 🔴 UNE FRISE VIDE EST DÉJÀ UNE FRISE : sept pointillés, et le dossier se lit d'un coup d'œil. */
  it('🔴 un événement sans aucune étape affiche les sept attendues', () => {
    const { majeures, reperes } = construireFrise([]);
    expect(majeures).toHaveLength(7);
    expect(majeures.every((c) => c.etape === null)).toBe(true);
    expect(reperes).toHaveLength(0);
  });
});

describe('③ les repères ne sont pas des étapes', () => {
  /** 🔴 « Ce ne sont pas des étapes » (Arno). Les mêler aurait noyé huit étapes sous cinquante-trois commentaires. */
  it('🔴🔴 commentaires, rappels, factures et injoignables sortent à part', () => {
    const { majeures, reperes } = construireFrise([
      etape({ type: 'commentaire' }), etape({ type: 'rappel_devis' }),
      etape({ type: 'facture' }), etape({ type: 'contact_injoignable' }),
      etape({ type: 'prise_rdv' }),
    ]);
    expect(reperes.map((r) => r.type).sort())
      .toEqual(['commentaire', 'contact_injoignable', 'facture', 'rappel_devis']);
    expect(majeures.filter((c) => c.etape !== null).map((c) => c.type)).toEqual(['prise_rdv']);
  });

  it('🔴 les repères gardent leur ordre chronologique', () => {
    const { reperes } = construireFrise([
      etape({ type: 'commentaire', survenuLe: '2026-10-05T00:00:00' }),
      etape({ type: 'commentaire', survenuLe: '2026-09-01T00:00:00' }),
    ]);
    expect(reperes.map((r) => r.survenuLe)).toEqual(['2026-09-01T00:00:00', '2026-10-05T00:00:00']);
  });
});

describe('④ les devis', () => {
  /**
   * ⚠️ PAS DE « Devis 1 » QUAND IL N'Y EN A QU'UN. Numéroter un ensemble d'un seul élément fait croire qu'il en
   * manque d'autres — exactement l'inverse de ce que la frise doit dire. Et c'est le cas ORDINAIRE : l'audit a
   * mesuré qu'aucune référence ne reçoit deux devis de numéros différents par mail.
   */
  it('⚠️ un devis seul ne porte pas de numéro d’ordre', () => {
    expect(motDeLaCase(etape({ type: 'devis_recu', rangDevis: 1 }), 'devis_recu', 1)).toBe('Devis reçu');
  });

  it('🔴 plusieurs devis portent leur rang', () => {
    expect(motDeLaCase(etape({ type: 'devis_recu', rangDevis: 2 }), 'devis_recu', 3)).toBe('Devis 2');
  });

  it('🔴 le montant s’écrit en euros, et son absence est une absence', () => {
    expect(motMontant(88550)).toBe('885,50 €');
    expect(motMontant(0)).toBe('0,00 €');
    expect(motMontant(null)).toBeNull();
  });
});

describe('⑤ la source, et le mail d’origine', () => {
  it('🔴 Monga, ou le nom de qui a posé l’étape', () => {
    expect(motSource(etape({ source: 'monga' }))).toBe('Monga');
    expect(motSource(etape({ source: 'manuelle', creeParLibelle: 'a.jorel' }))).toBe('ajoutée par a.jorel');
  });

  /** ⚠️ UNE ÉTAPE MANUELLE SANS AUTEUR CONNU NE MENT PAS : elle le dit, sans inventer un nom. */
  it('⚠️ sans auteur connu, « ajoutée à la main »', () => {
    expect(motSource(etape({ source: 'manuelle', creeParLibelle: null }))).toBe('ajoutée à la main');
    expect(motSource(etape({ source: 'manuelle', creeParLibelle: '  ' }))).toBe('ajoutée à la main');
  });

  /**
   * 🔴🔴 LA PHRASE QUI JUSTIFIE TOUT LE POINT 2. « un clic sur une étape Monga ouvre le mail d'origine s'il
   * existe encore (sinon : “mail supprimé — étape conservée”) » — Arno. Sans la table des étapes, il n'y aurait
   * rien à conserver : 25 des 98 mails Monga étaient déjà à la corbeille au moment du lot.
   */
  it('🔴🔴 une étape dont le mail n’existe plus le DIT, et n’est pas cliquable', () => {
    const perdue = etape({ source: 'monga', filId: null, messageId: null, aEuUnMail: true });
    expect(motMailDOrigine(perdue)).toBe('mail supprimé — étape conservée');
    expect(etapeOuvrable(perdue)).toBe(false);
  });

  it('🔴 une étape dont le mail vit encore est cliquable', () => {
    expect(etapeOuvrable(etape({ source: 'monga', filId: 10 }))).toBe(true);
    expect(motMailDOrigine(etape({ source: 'monga', filId: 10 }))).toBe('Voir le mail d’origine');
  });

  /**
   * 🔴🔴 « MAIL SUPPRIMÉ » NE SE DIT QUE D'UN MAIL QUI A EXISTÉ — défaut trouvé à l'écran le 06/10/2026.
   *
   * Les 33 ouvertures de repli sont DÉDUITES de la date du premier mail et n'en ont jamais eu : elles
   * annonçaient toutes « mail supprimé — étape conservée ». On annonçait une suppression qui n'avait pas eu
   * lieu, et c'est le genre de fausseté qui fait douter de tout le reste de la frise.
   */
  it('🔴🔴 une étape DÉDUITE ne prétend pas qu’un mail a été supprimé', () => {
    const deduite = etape({ source: 'monga', filId: null, messageId: null, aEuUnMail: false });
    expect(motMailDOrigine(deduite)).toBe('étape déduite — aucun mail');
    expect(etapeOuvrable(deduite)).toBe(false);
  });

  /** ⚠️ UNE ÉTAPE MANUELLE N'A PAS DE MAIL D'ORIGINE, et ne prétend pas en avoir un. */
  it('⚠️ une étape manuelle n’est jamais ouvrable', () => {
    expect(motMailDOrigine(etape({ source: 'manuelle' }))).toBeNull();
    expect(etapeOuvrable(etape({ source: 'manuelle', filId: 10 }))).toBe(false);
  });
});

describe('⑥ la date affichée', () => {
  it('🔴 sans heure connue, le jour seul', () => {
    expect(motDateEtape(etape({ survenuLe: '2026-10-09T00:00:00', heureConnue: false }))).toBe('09/10/2026');
  });

  /**
   * 🔴🔴 L'HEURE NE S'AFFICHE QUE SI ELLE EST CONNUE. Sans ce drapeau, tout rendez-vous sans heure se lirait
   * « à 00h00 » — ce qui est faux, et se voit.
   */
  it('🔴🔴 avec heure et fin, la plage entière', () => {
    expect(motDateEtape(etape({ survenuLe: '2026-10-09T10:30:00', heureConnue: true, heureFin: '11:00' })))
      .toBe('09/10/2026 de 10:30 à 11:00');
  });

  it('⚠️ la variante « vers » n’a pas de fin', () => {
    expect(motDateEtape(etape({ survenuLe: '2026-05-13T10:00:00', heureConnue: true, heureFin: null })))
      .toBe('13/05/2026 à 10:00');
  });

  /**
   * 🔴 AUCUN `new Date()` DANS CE MODULE : le fuseau du lecteur ne doit pas changer le jour affiché d'un
   * rendez-vous. Un mail annonçant le 09/10 à 00:30 se lirait « 08/10 » pour qui lit depuis l'ouest.
   */
  it('🔴 la date se lit par découpage, jamais par un objet Date', () => {
    const src = readFileSync('app/lib/gestion/frise.ts', 'utf8');
    expect(src).not.toContain('new Date(');
    expect(src).not.toContain('Date.parse');
  });
});

describe('⑦ une étape écartée ne revient pas', () => {
  /**
   * ⚠️ LE DÉPÔT NE LES REND DÉJÀ PAS (`statut = 'vif'`). Ce module filtre quand même : un appelant futur
   * pourrait les lui passer, et une étape écartée réapparue sur la frise serait un démenti silencieux du geste
   * qui l'a écartée.
   */
  it('⚠️ filtrée ici aussi, en ceinture et bretelles', () => {
    const { majeures, reperes } = construireFrise([
      etape({ type: 'prise_rdv', certitude: 'ecartee' }),
      etape({ type: 'commentaire', certitude: 'ecartee' }),
    ]);
    expect(majeures.every((c) => c.etape === null)).toBe(true);
    expect(reperes).toHaveLength(0);
  });
});

describe('⑧ le module reste pur', () => {
  it('🔴🔴 aucun accès base ni réseau : il est lu par un composant client', () => {
    const src = readFileSync('app/lib/gestion/frise.ts', 'utf8');
    expect(src).not.toContain('fetch(');
    expect(src).not.toMatch(/from '.*Repo'/);
    expect(src).not.toContain("from 'pg'");
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT FRISE-HORIZONTALE — LA MISE EN LIGNE ══════════════════════════════════════════════════════════════
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑨ la frise en ligne : carrés, points et « + »', () => {
  const ligne = (etapes: EtapeAAfficher[]) => {
    const { majeures, reperes } = construireFrise(etapes);
    return rangerEnLigne(majeures, reperes);
  };

  /**
   * 🔴🔴 LE « + » VIENT JUSTE APRÈS LE DERNIER CARRÉ RÉELLEMENT ATTEINT (Arno : « avant les carrés attendus en
   * pointillé »). C'est là qu'on ajoute : à la suite de ce qui s'est passé, pas au bout de ce qu'on attend.
   */
  it('🔴🔴 le « + » se place après le dernier carré atteint, avant les pointillés', () => {
    const l = ligne([
      etape({ type: 'ouverture', survenuLe: '2026-09-01T00:00:00' }),
      etape({ type: 'prise_rdv', survenuLe: '2026-09-15T00:00:00' }),
    ]);
    const sortes = l.map((e) => e.sorte);
    const iPlus = sortes.indexOf('plus');
    expect(iPlus).toBeGreaterThan(0);
    /* Tout ce qui précède le « + » est atteint ; tout ce qui suit est attendu. */
    const avant = l.slice(0, iPlus).filter((e) => e.sorte === 'carre');
    const apres = l.slice(iPlus + 1).filter((e) => e.sorte === 'carre');
    expect(avant.every((e) => e.case?.etape !== null)).toBe(true);
    expect(apres.every((e) => e.case?.etape === null)).toBe(true);
  });

  /**
   * 🔴 SUR UNE FRISE ENTIÈREMENT VIDE — un événement sans Monga, le cas que le lot MONGA-2 a rendu possible — le
   * « + » ouvre la marche. La première chose à faire est bien d'ajouter quelque chose.
   */
  it('🔴 sans aucune étape atteinte, le « + » vient en premier', () => {
    const l = ligne([]);
    expect(l[0].sorte).toBe('plus');
    expect(l.filter((e) => e.sorte === 'carre')).toHaveLength(7);
  });

  /**
   * 🔴🔴 LES POINTS SE PLACENT ENTRE LES CARRÉS, À LEUR PLACE CHRONOLOGIQUE (Arno). Un message du 14/09 tombe
   * après le carré du 14/09 et avant celui du 16/09 — c'est la seule façon de lire un dossier sans se demander
   * quand le commentaire est arrivé.
   */
  it('🔴🔴 les messages informatifs tombent à leur place dans le temps', () => {
    const l = ligne([
      etape({ type: 'ouverture', survenuLe: '2026-09-01T00:00:00' }),
      etape({ type: 'commentaire', survenuLe: '2026-09-10T00:00:00' }),
      etape({ type: 'prise_rdv', survenuLe: '2026-09-15T00:00:00' }),
    ]);
    const i = l.findIndex((e) => e.sorte === 'points');
    const iOuv = l.findIndex((e) => e.case?.etape?.type === 'ouverture');
    const iRdv = l.findIndex((e) => e.case?.etape?.type === 'prise_rdv');
    expect(iOuv).toBeLessThan(i);
    expect(i).toBeLessThan(iRdv);
  });

  /** 🔴 PLUSIEURS MESSAGES RAPPROCHÉS SE GROUPENT, et le groupe les garde dans l'ordre. */
  it('🔴 des messages du même intervalle se groupent, dans l’ordre', () => {
    const l = ligne([
      etape({ type: 'ouverture', survenuLe: '2026-09-01T00:00:00' }),
      etape({ type: 'commentaire', survenuLe: '2026-09-12T00:00:00', texte: 'deux' }),
      etape({ type: 'commentaire', survenuLe: '2026-09-10T00:00:00', texte: 'un' }),
      etape({ type: 'prise_rdv', survenuLe: '2026-09-15T00:00:00' }),
    ]);
    const groupe = l.find((e) => e.sorte === 'points');
    expect(groupe?.messages).toHaveLength(2);
    expect(groupe?.messages?.map((m) => m.texte)).toEqual(['un', 'deux']);
  });

  /**
   * ⚠️ AUCUN POINT ENTRE LES CARRÉS ATTENDUS : ils n'ont pas de date. Y ranger un message par sa date
   * reviendrait à lui inventer une place dans un futur qui n'existe pas encore.
   */
  it('⚠️ un message postérieur au dernier carré atteint se pose AVANT le « + », pas entre les pointillés', () => {
    const l = ligne([
      etape({ type: 'ouverture', survenuLe: '2026-09-01T00:00:00' }),
      etape({ type: 'commentaire', survenuLe: '2026-12-31T00:00:00' }),
    ]);
    const iPts = l.findIndex((e) => e.sorte === 'points');
    const iPlus = l.findIndex((e) => e.sorte === 'plus');
    expect(iPts).toBeGreaterThan(0);
    expect(iPts).toBeLessThan(iPlus);
  });

  /** 🔴 AUCUNE ÉTAPE NI AUCUN MESSAGE NE SE PERD en passant en ligne : la suite les porte tous. */
  it('🔴 rien ne se perd : autant de carrés et de messages qu’avant', () => {
    const etapes = [
      etape({ type: 'ouverture', survenuLe: '2026-09-01T00:00:00' }),
      etape({ type: 'commentaire', survenuLe: '2026-09-10T00:00:00' }),
      etape({ type: 'rappel_devis', survenuLe: '2026-09-11T00:00:00' }),
      etape({ type: 'prise_rdv', survenuLe: '2026-09-15T00:00:00' }),
    ];
    const { majeures, reperes } = construireFrise(etapes);
    const l = rangerEnLigne(majeures, reperes);
    expect(l.filter((e) => e.sorte === 'carre')).toHaveLength(majeures.length);
    expect(l.flatMap((e) => e.messages ?? [])).toHaveLength(reperes.length);
  });
});

describe('⑩ sur quoi la frise s’ouvre', () => {
  /** 🔴 « À l'ouverture, la frise est positionnée pour montrer la DERNIÈRE ÉTAPE ATTEINTE » (Arno). */
  it('🔴 la dernière atteinte, et non le premier pointillé', () => {
    const { majeures } = construireFrise([
      etape({ id: 1, type: 'ouverture', survenuLe: '2026-09-01T00:00:00' }),
      etape({ id: 2, type: 'prise_rdv', survenuLe: '2026-09-15T00:00:00' }),
    ]);
    expect(cleDOuverture(majeures)).toBe('e2');
  });

  /** ⚠️ RIEN D'ATTEINT : `null`, et l'écran reste au début — là où se trouve justement le « + ». */
  it('⚠️ sans rien d’atteint, aucun calage', () => {
    const { majeures } = construireFrise([]);
    expect(cleDOuverture(majeures)).toBeNull();
  });
});

describe('⑪ le pictogramme de source', () => {
  it('🔴 Monga et la main se distinguent', () => {
    expect(pictoSource(etape({ source: 'monga' }))).toBe('◆');
    expect(pictoSource(etape({ source: 'manuelle' }))).toBe('✎');
  });

  it('🔴 le compteur de messages s’accorde', () => {
    expect(motGroupeMessages(0)).toBe('0 message');
    expect(motGroupeMessages(1)).toBe('1 message');
    expect(motGroupeMessages(3)).toBe('3 messages');
  });
});
