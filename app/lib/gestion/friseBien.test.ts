import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  anneeAEcrire, bandeauxDesEvenements, bornesSurLaFrise, cleDuMois, joursDuMois, mailsRecus,
  moisDeLaFrise, moisSuivant, motDetailDuMois, motDuMois, motFriseTronquee, motRepere, motSurvolMail,
  MOIS_MAX, MOIS_VISIBLES_PAR_DEFAUT, motCourtRepere, positionDansLeMois, positionSurLaFrise,
  reperesDoccupation,
  totauxParMois, type MailDeLaFrise,
} from './friseBien';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-17, POINT 2 — LA FRISE CHRONOLOGIQUE ═══════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : « 12 derniers mois par défaut, aujourd'hui à droite […] un trait vertical fin par
 * MAIL REÇU, placé à sa date ET À SON HEURE […] un repère distinct pour chaque DATE D'ENTRÉE et chaque DATE DE
 * SORTIE […] la période d'un événement […] colore TOUT le fond […] un bloc par MOIS […] avec dedans le TOTAL. »
 *
 * 🔴 UNE FRISE EST UN CALCUL DE DATES DÉGUISÉ EN DESSIN. Tout ce qui se calcule est donc ici, et éprouvé ici :
 * l'écran ne fait que multiplier par une largeur. Le jeu d'essai est celui de lot-146 (trois locataires
 * successifs), mesuré en base.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const MAINTENANT = new Date('2026-10-05T12:00:00Z');

const mail = (o: Partial<MailDeLaFrise> = {}): MailDeLaFrise => ({
  messageId: 1, recuLe: '2026-09-15T09:00:00Z', sens: 'recu', de: 'qui@x.fr', deNom: null, objet: 'Objet',
  ...o,
});

describe('🔴🔴 ① les mois que la frise couvre', () => {
  /** 🔴 DOUZE MOIS AU MINIMUM, et « aujourd'hui » toujours en dernier — c'est ce qui le met à droite. */
  it('🔴🔴 un bien neuf couvre quand même douze mois, finissant au mois courant', () => {
    const m = moisDeLaFrise([mail({ recuLe: '2026-09-15T09:00:00Z' })], MAINTENANT);
    expect(m).toHaveLength(MOIS_VISIBLES_PAR_DEFAUT);
    expect(m[m.length - 1]).toBe('2026-10');
    expect(m[0]).toBe('2025-11');
  });

  /**
   * 🔴🔴 AUCUN TROU, ET C'EST CE QUI REND L'ÉCHELLE VRAIE. Sauter les mois vides aurait collé deux traits
   * séparés de trois mois de silence — la frise aurait menti sur le temps, qui est tout ce qu'elle montre.
   */
  it('🔴🔴 les mois vides sont là : l’échelle du temps ne saute pas', () => {
    const m = moisDeLaFrise([mail({ recuLe: '2022-04-01T09:00:00Z' })], MAINTENANT);
    expect(m[0]).toBe('2022-04');
    expect(m[m.length - 1]).toBe('2026-10');
    /* D'avril 2022 à octobre 2026 : 9 mois en 2022, 12+12+12 en 2023-2025, 10 en 2026. */
    expect(m).toHaveLength(9 + 36 + 10);
    expect(m).toContain('2023-07');
  });

  it('⚠️ une date illisible n’ouvre pas la frise au hasard', () => {
    expect(moisDeLaFrise([mail({ recuLe: 'n’importe quoi' })], MAINTENANT)).toHaveLength(12);
  });

  /** ⚠️ UN MAIL DANS LE FUTUR (horloge d'un serveur) NE REPOUSSE PAS LA FIN : « aujourd'hui » reste à droite. */
  it('⚠️ un mail postérieur à aujourd’hui ne déplace pas la fin', () => {
    const m = moisDeLaFrise([mail({ recuLe: '2027-05-01T09:00:00Z' })], MAINTENANT);
    expect(m[m.length - 1]).toBe('2026-10');
  });

  /** ⚠️ BORNÉE : quinze ans de courrier feraient 180 colonnes, et le dessin deviendrait illisible. */
  it('⚠️ la frise est bornée, et elle le DIT', () => {
    const m = moisDeLaFrise([mail({ recuLe: '2005-01-05T09:00:00Z' })], MAINTENANT);
    expect(m).toHaveLength(MOIS_MAX);
    const mot = motFriseTronquee([mail({ recuLe: '2005-01-05T09:00:00Z' })], m);
    expect(mot).toContain('plus ancien');
    /* 🔴 ET RIEN QUAND TOUT TIENT : une note permanente apprend à ne plus être lue. */
    expect(motFriseTronquee([mail()], moisDeLaFrise([mail()], MAINTENANT))).toBeNull();
  });

  it('⚠️ les outils de mois enchaînent les années correctement', () => {
    expect(moisSuivant('2025-12')).toBe('2026-01');
    expect(moisSuivant('2025-01')).toBe('2025-02');
    expect(joursDuMois('2024-02')).toBe(29);
    expect(joursDuMois('2025-02')).toBe(28);
    expect(joursDuMois('2025-07')).toBe(31);
  });
});

describe('🔴🔴 ② où tombe un mail — la date ET l’heure', () => {
  /**
   * 🔴🔴 L'HEURE COMPTE, ET C'EST CE QUI SÉPARE DEUX MAILS DU MÊME JOUR. Sans elle, dix mails d'une journée
   * auraient le même trait, et « sans se cacher » devenait impossible à tenir.
   */
  it('🔴🔴 deux mails du même jour ne tombent pas au même endroit', () => {
    const matin = positionDansLeMois('2026-03-10T07:00:00Z');
    const soir = positionDansLeMois('2026-03-10T21:00:00Z');
    expect(soir).toBeGreaterThan(matin);
  });

  it('🔴 le 1er à minuit est au début du mois, le dernier jour à la fin', () => {
    /* ⚠️ 00:00 À PARIS, donc 23:00 UTC la veille en heure d'hiver — c'est tout le piège du fuseau. */
    expect(positionDansLeMois('2026-02-28T23:00:00Z')).toBe(0);
    expect(positionDansLeMois('2026-03-31T21:00:00Z')).toBeGreaterThan(0.95);
    expect(positionDansLeMois('2026-03-31T21:00:00Z')).toBeLessThan(1);
  });

  /**
   * 🔴🔴 LE MOIS SE LIT EN HEURE DE PARIS. Un mail du 1er janvier à 00:30 à Paris est le 31 décembre en UTC :
   * compté en UTC, il aurait changé de mois, et le total de janvier aurait manqué d'une unité par rapport au
   * listing — qui, lui, affiche la date de Paris.
   */
  it('🔴🔴 le mois est celui de Paris, jamais celui d’UTC', () => {
    expect(cleDuMois('2025-12-31T23:30:00Z')).toBe('2026-01');
    expect(cleDuMois('2026-01-31T22:00:00Z')).toBe('2026-01');
  });

  it('⚠️ une date absente ou illisible ne donne aucun mois', () => {
    expect(cleDuMois(null)).toBeNull();
    expect(cleDuMois('')).toBeNull();
    expect(cleDuMois('pas une date')).toBeNull();
  });

  it('🔴 la position sur la frise mêle l’index du mois et la fraction', () => {
    const mois = ['2026-01', '2026-02', '2026-03'];
    const x = positionSurLaFrise('2026-03-16T12:00:00Z', mois);
    expect(x).not.toBeNull();
    expect(Math.floor(x as number)).toBe(2);
    expect((x as number) - 2).toBeGreaterThan(0.45);
  });

  /** ⚠️ HORS DES MOIS COUVERTS : RIEN. Un trait collé au bord ferait croire à un courrier qu'on n'a pas. */
  it('⚠️ une date hors de la frise ne se dessine pas', () => {
    expect(positionSurLaFrise('2020-01-01T00:00:00Z', ['2026-01', '2026-02'])).toBeNull();
    expect(positionSurLaFrise('2026-01-01T00:00:00Z', [])).toBeNull();
  });
});

describe('🔴🔴 ③ les totaux mensuels', () => {
  const MAILS = [
    mail({ messageId: 1, recuLe: '2026-03-02T09:00:00Z', sens: 'recu' }),
    mail({ messageId: 2, recuLe: '2026-03-20T09:00:00Z', sens: 'envoye' }),
    mail({ messageId: 3, recuLe: '2026-03-28T09:00:00Z', sens: 'recu' }),
    mail({ messageId: 4, recuLe: '2026-04-02T09:00:00Z', sens: 'recu' }),
  ];

  /**
   * 🔴🔴 LE TOTAL EST CELUI DE **TOUS** LES MAILS DU MOIS, reçus ET envoyés : c'est ce que le mot « total » dit,
   * et c'est ce que le listing affiche sur ce mois. La partie haute, elle, ne porte que les REÇUS (demande
   * d'Arno) : les deux nombres diffèrent, et le survol les sépare pour qu'on puisse le vérifier.
   */
  it('🔴🔴 le total mêle reçus et envoyés, le détail les sépare', () => {
    const t = totauxParMois(MAILS);
    expect(t.get('2026-03')).toEqual({ total: 3, recus: 2, envoyes: 1 });
    expect(t.get('2026-04')).toEqual({ total: 1, recus: 1, envoyes: 0 });
    expect(motDetailDuMois('2026-03', t.get('2026-03'))).toBe('mars 2026 — 2 reçus · 1 envoyé');
  });

  /** 🔴 LA PARTIE HAUTE NE PORTE QUE LES REÇUS — demande d'Arno, mot pour mot. */
  it('🔴🔴 la partie haute ne dessine que les mails REÇUS', () => {
    expect(mailsRecus(MAILS).map((m) => m.messageId)).toEqual([1, 3, 4]);
  });

  it('⚠️ un mois sans courrier dit zéro, il ne disparaît pas', () => {
    expect(motDetailDuMois('2026-05', undefined)).toBe('mai 2026 — 0 reçu · 0 envoyé');
  });

  it('🔴 le nom du mois porte l’année au changement d’année, et au début', () => {
    const mois = ['2025-11', '2025-12', '2026-01', '2026-02'];
    expect(mois.map((_, i) => anneeAEcrire(mois, i))).toEqual([true, false, true, false]);
    expect(motDuMois('2026-01', true)).toBe('janv. 2026');
    expect(motDuMois('2026-01', false)).toBe('janv.');
    expect(motDuMois('2026-08', false)).toBe('août');
  });
});

describe('🔴🔴 ④ les repères d’entrée et de sortie', () => {
  /** Les trois locataires successifs de lot-146, mesurés en base. */
  const OCCUPATIONS = [
    { libelle: 'BRASSET Mathilde et BRUERE Thomas', depuis: '2025-10-22', jusqua: null },
    { libelle: 'VAGLIO ARNAUD Aurélie et Louis', depuis: '2025-02-06', jusqua: '2025-10-22' },
    { libelle: 'ACKET GOEMAERE - DERRIEN Alizée et Thomas', depuis: '2022-04-01', jusqua: '2025-01-31' },
  ];

  it('🔴🔴 une entrée et une sortie par locataire, dans l’ordre du temps', () => {
    const r = reperesDoccupation(OCCUPATIONS);
    expect(r.map((x) => `${x.sorte} ${x.quand}`)).toEqual([
      'entree 2022-04-01', 'sortie 2025-01-31', 'entree 2025-02-06',
      'sortie 2025-10-22', 'entree 2025-10-22',
    ]);
  });

  /**
   * 🔴🔴 LE LOCATAIRE EN PLACE N'A PAS DE SORTIE. Poser un repère « sortie » à aujourd'hui aurait annoncé un
   * départ qui n'a pas eu lieu — sur la frise d'un bien occupé, c'est un contresens visible de loin.
   */
  it('🔴🔴 pas de repère de sortie pour le locataire en place', () => {
    const r = reperesDoccupation(OCCUPATIONS);
    expect(r.filter((x) => x.sorte === 'sortie')).toHaveLength(2);
    expect(r.some((x) => x.libelle.startsWith('BRASSET') && x.sorte === 'sortie')).toBe(false);
  });

  /** ⚠️ UNE DATE MANQUANTE NE POSE RIEN : l'inventer aurait placé le repère au hasard. */
  it('⚠️ une occupation sans dates ne pose aucun repère', () => {
    expect(reperesDoccupation([{ libelle: 'INCONNU', depuis: null, jusqua: null }])).toEqual([]);
    expect(reperesDoccupation([{ libelle: 'X', depuis: '', jusqua: '' }])).toEqual([]);
  });

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-18, POINT 2 — LE MOT COURT DU DRAPEAU ════════════════════════════════════════
   *
   * Arno : « petit drapeau en tête avec le texte court "Entrée" (vert) / "Sortie" (gris foncé) ».
   *
   * 🔴 LE MÊME MOT SERT LE DRAPEAU ET L'INFO-BULLE : deux écritures auraient fini par dire « Arrivée » d'un
   * côté et « Entrée » de l'autre.
   */
  it('🔴🔴 le mot du drapeau est celui de l’info-bulle', () => {
    expect(motCourtRepere('entree')).toBe('Entrée');
    expect(motCourtRepere('sortie')).toBe('Sortie');
    expect(motRepere({ sorte: 'entree', quand: '2025-02-06', libelle: 'VAGLIO' }))
      .toBe(`${motCourtRepere('entree')} — VAGLIO`);
  });

  it('🔴 le mot du survol nomme le locataire', () => {
    const [premier] = reperesDoccupation(OCCUPATIONS);
    expect(motRepere(premier)).toBe('Entrée — ACKET GOEMAERE - DERRIEN Alizée et Thomas');
    expect(motRepere({ sorte: 'sortie', quand: '2025-01-31', libelle: 'X' })).toBe('Sortie — X');
  });
});

describe('🔴🔴 ⑤ le fond orange des événements', () => {
  const evt = (o: Partial<{
    reference: string; objet: string | null; ouvert: boolean; ouvertLe: string | null; closLe: string | null;
  }> = {}) => ({
    reference: 'EV-2026-007', objet: 'Dégât des eaux', ouvert: false,
    ouvertLe: '2026-02-03T07:15:00Z', closLe: '2026-04-20T10:00:00Z', ...o,
  });

  /** 🔴 UN ÉVÉNEMENT CLOS VA DE SON OUVERTURE À SA CLÔTURE. */
  it('🔴🔴 clos : du jour d’ouverture au jour de clôture', () => {
    const [b] = bandeauxDesEvenements([evt()], MAINTENANT);
    expect(b.du).toBe('2026-02-03T07:15:00Z');
    expect(b.au).toBe('2026-04-20T10:00:00Z');
    expect(b.titre).toBe('EV-2026-007 — Dégât des eaux');
  });

  /** 🔴🔴 EN COURS : « ou → aujourd'hui s'il est en cours » (Arno), et le titre le dit. */
  it('🔴🔴 en cours : jusqu’à aujourd’hui, et le titre le dit', () => {
    const [b] = bandeauxDesEvenements([evt({ ouvert: true, closLe: null })], MAINTENANT);
    expect(b.au).toBe(MAINTENANT.toISOString());
    expect(b.titre).toContain('(en cours)');
  });

  /** ⚠️ UN ÉVÉNEMENT MARQUÉ OUVERT MAIS PORTANT UNE CLÔTURE VA QUAND MÊME À AUJOURD'HUI : c'est `ouvert` qui
      fait foi, comme partout ailleurs dans ce module. */
  it('⚠️ « ouvert » l’emporte sur une date de clôture restée en base', () => {
    const [b] = bandeauxDesEvenements([evt({ ouvert: true })], MAINTENANT);
    expect(b.au).toBe(MAINTENANT.toISOString());
  });

  it('⚠️ sans date d’ouverture, aucun bandeau : on ne sait pas où commencer', () => {
    expect(bandeauxDesEvenements([evt({ ouvertLe: null })], MAINTENANT)).toEqual([]);
  });

  it('⚠️ une clôture antérieure à l’ouverture est écartée, pas dessinée à l’envers', () => {
    expect(bandeauxDesEvenements([evt({ closLe: '2020-01-01T00:00:00Z' })], MAINTENANT)).toEqual([]);
  });

  /**
   * 🔴🔴 LE ROGNAGE EST INDISPENSABLE : un événement ouvert il y a trois ans, sur une frise qui n'en couvre
   * qu'un, doit colorier du bord gauche jusqu'à sa fin — et non disparaître parce que son début est hors champ.
   */
  it('🔴🔴 un bandeau qui déborde est rogné, jamais effacé', () => {
    const mois = ['2026-01', '2026-02', '2026-03'];
    const b = bornesSurLaFrise('2020-01-01T00:00:00Z', '2026-02-15T00:00:00Z', mois);
    expect(b).not.toBeNull();
    expect(b?.de).toBe(0);
    expect(b?.a).toBeGreaterThan(1);
    expect(b?.a).toBeLessThan(2);
  });

  it('⚠️ un bandeau entièrement hors champ ne se dessine pas', () => {
    expect(bornesSurLaFrise('2019-01-01T00:00:00Z', '2019-06-01T00:00:00Z', ['2026-01'])).toBeNull();
    expect(bornesSurLaFrise('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z', [])).toBeNull();
  });
});

describe('🔴 ⑥ le mot du survol d’un trait', () => {
  /** Arno : « Survol d'un trait : expéditeur, date et heure, objet. » */
  it('🔴 les trois, dans cet ordre', () => {
    expect(motSurvolMail(mail({ deNom: 'Blandine Piriou', objet: 'Quittance' }), 'le 15/09/2026 à 11:00'))
      .toBe('Blandine Piriou — le 15/09/2026 à 11:00 — Quittance');
  });

  /** ⚠️ SANS NOM, L'ADRESSE ; SANS OBJET, ON LE DIT — jamais une ligne qui se termine par un tiret nu. */
  it('⚠️ sans nom ni objet, le mot reste lisible', () => {
    expect(motSurvolMail(mail({ deNom: null, objet: null }), 'hier'))
      .toBe('qui@x.fr — hier — (sans objet)');
    expect(motSurvolMail(mail({ deNom: '   ', objet: '  ' }), 'hier'))
      .toBe('qui@x.fr — hier — (sans objet)');
  });
});

/**
 * ══ 🔴🔴 ⑦ LE NOMBRE 12 VIT À DEUX ENDROITS — ET IL NE DOIT PAS DIVERGER ═════════════════════════════════════════
 *
 * Une feuille de style ne peut pas lire une constante TypeScript : la largeur d'un mois est écrite en CSS
 * (`calc((100% - 2px) / 12)`), et le module pur garantit par ailleurs AU MOINS douze mois. Si l'un des deux
 * changeait sans l'autre, la frise n'afficherait plus « les 12 derniers mois » qu'Arno demande, et personne ne
 * le verrait avant de compter les colonnes à l'écran.
 */
describe('🔴🔴 ⑦ la feuille de style et le module disent le même nombre de mois', () => {
  it('🔴🔴 le douzième du cadre, et le plancher de douze mois, parlent du même 12', () => {
    const css = readFileSync('app/(admin)/admin/(protected)/gestion/FriseDuBien.tsx', 'utf8');
    expect(MOIS_VISIBLES_PAR_DEFAUT).toBe(12);
    expect(css).toContain(`/ ${MOIS_VISIBLES_PAR_DEFAUT})`);
  });
});
