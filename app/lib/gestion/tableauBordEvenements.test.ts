import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  tableauBordEvenements, ligneDeSynthese, delaiDe, douzeMois, moisDe, motDuMois, motJours,
  sansNouvelles, infosManquantes, estTableauBord, ecartJours,
  SEUIL_SANS_NOUVELLES_JOURS, MOT_SANS_DONNEES, CLE_SANS_TYPE, CLE_SANS_URGENCE,
  type FaitsEvenement, type PeriodeEvenement,
} from './tableauBordEvenements';

/**
 * ══ 🔴🔴 LOT EVENEMENTS-TABLEAU-DE-BORD — CHAQUE INDICATEUR, SUR DES DATES CONNUES ═══════════════════════════════
 *
 * ARNO : « Écris un test qui vérifie chaque indicateur sur un petit jeu d'événements de test aux dates connues. »
 *
 * ══ 🔴🔴 POURQUOI CETTE ÉPREUVE EST LA MOITIÉ DU LOT ═══════════════════════════════════════════════════════════
 *
 * UN CHIFFRE FAUX DANS UN TABLEAU DE BORD NE SE VOIT PAS. Personne ne recompte douze mois de flux à la main, et
 * une médiane fausse a exactement l'air d'une médiane. Un écran qui rougit ment une fois ; un tableau de bord
 * qui se trompe ment tous les jours, et on lui fait confiance. La seule défense est un jeu de données dont on
 * connaît la réponse — et c'est ce que ce fichier tient, indicateur par indicateur.
 *
 * ⚠️ LE JEU EST CALCULÉ À PARTIR D'UNE DATE FIXE (`MAINTENANT`), jamais de `new Date()` : une épreuve qui
 * dépend du jour où on la joue finit par rougir un matin sans que rien n'ait changé.
 */

/** Le présent de l'épreuve : 9 octobre 2026, midi (heure de Paris). */
const MAINTENANT = new Date('2026-10-09T12:00:00+02:00');

/** Un événement sans rien : chaque cas ne décrit que ce qui le distingue. */
const vide = (id: number, o: Partial<FaitsEvenement> = {}): FaitsEvenement => ({
  id, type: null, urgence: null, ouvert: true,
  ouvertureLe: null, clotureLe: null, premierDevisLe: null, acceptationLe: null, interventionLe: null,
  montantAttenteCents: 0, montantAccepteCents: 0,
  nbDevisEnAttente: 0, nbDevisAcceptes: 0, nbDevisRefuses: 0, nbReouvertures: 0,
  derniereActiviteLe: null, avecMonga: false, avecBien: false, ...o,
});

/**
 * ══ LE JEU D'ESSAI, ÉVÉNEMENT PAR ÉVÉNEMENT ════════════════════════════════════════════════════════════════
 *
 *   1 TRAVAUX, urgent, OUVERT, bien + Monga. Ouvert le 1er sept., devis le 7 (900 €, en attente),
 *     dernière activité le 7 sept. → 32 jours sans nouvelles. Délai 1er devis : 6 j.
 *   2 TRAVAUX, normal, CLOS. Ouvert le 1er août, devis le 11 (1 000 €, accepté le 16), intervention le 21,
 *     clôturé le 31. Délais : 10 / 15 / 20 / 30 j.
 *   3 FUITE D'EAU, urgent, OUVERT, rouvert une fois, dernière activité hier → PAS sans nouvelles.
 *   4 SANS TYPE, SANS URGENCE, SANS BIEN, OUVERT → le seul « infos manquantes » complet.
 *   5 ADMINISTRATIF, normal, CLOS, un devis REFUSÉ. Ouvert le 1er oct., clos le 6 → 5 j.
 */
const FAITS: FaitsEvenement[] = [
  vide(1, {
    type: 'travaux', urgence: 'urgent', ouvert: true, avecBien: true, avecMonga: true,
    ouvertureLe: '2026-09-01T09:00:00+02:00',
    premierDevisLe: '2026-09-07T09:00:00+02:00',
    derniereActiviteLe: '2026-09-07T09:00:00+02:00',
    montantAttenteCents: 90_000, nbDevisEnAttente: 1,
  }),
  vide(2, {
    type: 'travaux', urgence: 'normale', ouvert: false, avecBien: true,
    ouvertureLe: '2026-08-01T09:00:00+02:00',
    premierDevisLe: '2026-08-11T09:00:00+02:00',
    acceptationLe: '2026-08-16T09:00:00+02:00',
    interventionLe: '2026-08-21T09:00:00+02:00',
    clotureLe: '2026-08-31T09:00:00+02:00',
    derniereActiviteLe: '2026-08-31T09:00:00+02:00',
    montantAccepteCents: 100_000, nbDevisAcceptes: 1,
  }),
  vide(3, {
    type: 'fuite_eau', urgence: 'urgent', ouvert: true, avecBien: true,
    ouvertureLe: '2026-07-01T09:00:00+02:00',
    derniereActiviteLe: '2026-10-08T09:00:00+02:00',
    nbReouvertures: 1,
  }),
  vide(4, { ouvert: true, ouvertureLe: '2026-10-05T09:00:00+02:00', derniereActiviteLe: '2026-10-05T09:00:00+02:00' }),
  vide(5, {
    type: 'administratif', urgence: 'normale', ouvert: false, avecBien: true,
    ouvertureLe: '2026-10-01T09:00:00+02:00',
    clotureLe: '2026-10-06T09:00:00+02:00',
    derniereActiviteLe: '2026-10-06T09:00:00+02:00',
    nbDevisRefuses: 1,
  }),
];

/** Les périodes : l'événement 3 en a DEUX (il a été rouvert), les autres une seule. */
const PERIODES: PeriodeEvenement[] = [
  { evenementId: 1, du: '2026-09-01T09:00:00+02:00', au: null },
  { evenementId: 2, du: '2026-08-01T09:00:00+02:00', au: '2026-08-31T09:00:00+02:00' },
  { evenementId: 3, du: '2026-07-01T09:00:00+02:00', au: '2026-07-20T09:00:00+02:00' },
  { evenementId: 3, du: '2026-09-15T09:00:00+02:00', au: null },
  { evenementId: 4, du: '2026-10-05T09:00:00+02:00', au: null },
  { evenementId: 5, du: '2026-10-01T09:00:00+02:00', au: '2026-10-06T09:00:00+02:00' },
];

const TB = tableauBordEvenements(FAITS, PERIODES, MAINTENANT);

describe('🔴🔴 a) les volumes', () => {
  it('🔴 en cours, clôturés, total', () => {
    expect(TB.volumes.enCours).toBe(3);
    expect(TB.volumes.clos).toBe(2);
    expect(TB.volumes.total).toBe(5);
  });

  /** 🔴 CHAQUE TYPE, Y COMPRIS « non précisé » : un événement sans type ne doit pas s'évaporer du total. */
  it('🔴🔴 la répartition par type couvre TOUS les événements', () => {
    const parType = Object.fromEntries(TB.volumes.parType.map((t) => [t.cle, t.n]));
    expect(parType).toEqual({ travaux: 2, fuite_eau: 1, administratif: 1, litige: 0, [CLE_SANS_TYPE]: 1 });
    /* 🔴 LA SOMME FAIT LE TOTAL, et c'est la propriété qui compte : une répartition qui ne somme pas au total
       a perdu quelqu'un en route, et c'est invisible à l'œil. */
    expect(TB.volumes.parType.reduce((s, t) => s + t.n, 0)).toBe(TB.volumes.total);
  });

  it('🔴🔴 la répartition par urgence couvre TOUS les événements', () => {
    const parUrgence = Object.fromEntries(TB.volumes.parUrgence.map((u) => [u.cle, u.n]));
    expect(parUrgence).toEqual({ normale: 2, haute: 0, urgent: 2, [CLE_SANS_URGENCE]: 1 });
    expect(TB.volumes.parUrgence.reduce((s, u) => s + u.n, 0)).toBe(TB.volumes.total);
  });

  it('🔴 avec et sans Monga', () => {
    expect(TB.volumes.avecMonga).toBe(1);
    expect(TB.volumes.sansMonga).toBe(4);
    expect(TB.volumes.avecMonga + TB.volumes.sansMonga).toBe(TB.volumes.total);
  });
});

describe('🔴🔴 b) le flux sur 12 mois', () => {
  it('🔴 douze mois, du plus ancien au plus récent, finissant par le mois courant', () => {
    expect(TB.flux).toHaveLength(12);
    expect(TB.flux[11].mois).toBe('2026-10');
    expect(TB.flux[0].mois).toBe('2025-11');
    expect(TB.flux[11].mot).toBe('oct. 2026');
    /* 🔴 L'AXE PORTE LE MOT COURT, et l'année seulement quand elle change — ou sur la première colonne, qui
       appartient à l'année d'avant et dont rien d'autre ne le dirait. */
    expect(TB.flux[11].motCourt).toBe('oct.');
    expect(TB.flux[0].motCourt).toBe('nov. 25');
    expect(TB.flux.find((m) => m.mois === '2026-01')?.motCourt).toBe('janv. 26');
  });

  /**
   * 🔴🔴 LES PÉRIODES, ET NON LES ÉVÉNEMENTS : l'événement 3 a été ouvert en juillet, clos en juillet, puis
   * ROUVERT en septembre. Il compte donc DEUX ouvertures sur l'année. Un flux qui compterait les événements
   * raterait toutes les réouvertures — exactement ce qu'un responsable veut voir.
   */
  it('🔴🔴 une réouverture compte comme une ouverture de plus', () => {
    const mois = Object.fromEntries(TB.flux.map((m) => [m.mois, { o: m.ouverts, c: m.clos }]));
    expect(mois['2026-07']).toEqual({ o: 1, c: 1 });
    expect(mois['2026-08']).toEqual({ o: 1, c: 1 });
    expect(mois['2026-09']).toEqual({ o: 2, c: 0 });
    expect(mois['2026-10']).toEqual({ o: 2, c: 1 });
    expect(mois['2026-06']).toEqual({ o: 0, c: 0 });
  });

  /** ⚠️ UN MOIS CALCULÉ EN HEURE DE PARIS : le 1er octobre à 00h30 de Paris n'est pas en septembre. */
  it('⚠️ le mois se calcule à Paris, jamais en UTC', () => {
    expect(moisDe('2026-10-01T00:30:00+02:00')).toBe('2026-10');
    expect(moisDe('2026-09-30T23:30:00+02:00')).toBe('2026-09');
    expect(motDuMois('2026-01')).toBe('janv. 2026');
  });

  /** ⚠️ ET LA FENÊTRE EST GLISSANTE : en janvier, l'année civile ne montrerait qu'un mois. */
  it('⚠️ douze mois glissants, même à cheval sur deux années', () => {
    expect(douzeMois(new Date('2026-01-15T12:00:00+01:00'))).toEqual([
      '2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07',
      '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01',
    ]);
  });
});

describe('🔴🔴 c) les délais, moyenne ET médiane', () => {
  /**
   * 🔴🔴 LES QUATRE DÉLAIS, SUR DES ÉCARTS CHOISIS POUR ÊTRE RECALCULABLES DE TÊTE :
   *   · 1er devis : événement 1 → 6 j, événement 2 → 10 j. Moyenne 8, médiane 8.
   *   · acceptation : seul l'événement 2 → 15 j. n = 1.
   *   · intervention : seul l'événement 2 → 20 j. n = 1.
   *   · clôture : événement 2 → 30 j, événement 5 → 5 j. Moyenne 17,5, médiane 17,5.
   */
  it('🔴🔴 les quatre délais globaux, avec leurs effectifs', () => {
    expect(TB.delais.global.premierDevis).toEqual({ n: 2, moyenneJours: 8, medianeJours: 8 });
    expect(TB.delais.global.acceptation).toEqual({ n: 1, moyenneJours: 15, medianeJours: 15 });
    expect(TB.delais.global.intervention).toEqual({ n: 1, moyenneJours: 20, medianeJours: 20 });
    expect(TB.delais.global.cloture).toEqual({ n: 2, moyenneJours: 17.5, medianeJours: 17.5 });
  });

  /** 🔴 PAR TYPE, et seulement les types peuplés : quatre colonnes de tirets n'apprennent rien. */
  it('🔴🔴 les délais par type ne listent que les types peuplés', () => {
    expect(TB.delais.parType.map((t) => t.cle)).toEqual(['travaux', 'fuite_eau', 'administratif', CLE_SANS_TYPE]);
    const travaux = TB.delais.parType.find((t) => t.cle === 'travaux');
    expect(travaux?.delais.premierDevis).toEqual({ n: 2, moyenneJours: 8, medianeJours: 8 });
    /* 🔴 ET « Travaux » N'A QU'UNE CLÔTURE (l'événement 2) : l'événement 1 est encore ouvert. */
    expect(travaux?.delais.cloture).toEqual({ n: 1, moyenneJours: 30, medianeJours: 30 });
    /* ⚠️ « Litige » N'EST PAS LÀ : aucun événement, donc aucune ligne. */
    expect(TB.delais.parType.map((t) => t.cle)).not.toContain('litige');
  });

  /**
   * 🔴🔴 MOYENNE ET MÉDIANE DISENT DEUX CHOSES, ET C'EST POUR CELA QUE LES DEUX SONT DEMANDÉES. Sur une série
   * où un dossier traîne, la moyenne s'envole et la médiane décrit le travail ordinaire.
   */
  it('🔴🔴 la médiane résiste à ce qui fait s’envoler la moyenne', () => {
    expect(delaiDe([1, 2, 3, 300])).toEqual({ n: 4, moyenneJours: 76.5, medianeJours: 2.5 });
    expect(delaiDe([5])).toEqual({ n: 1, moyenneJours: 5, medianeJours: 5 });
    expect(delaiDe([1, 2, 3])).toEqual({ n: 3, moyenneJours: 2, medianeJours: 2 });
  });

  /** 🔴🔴 SÉRIE VIDE ⇒ `null`, JAMAIS `0` : « pas encore de données » n'est pas « zéro jour ». */
  it('🔴🔴 sans donnée, la moyenne est nulle et non zéro', () => {
    expect(delaiDe([])).toEqual({ n: 0, moyenneJours: null, medianeJours: null });
    expect(motJours(null)).toBe('—');
    expect(MOT_SANS_DONNEES).toContain('pas encore de données');
    /* ⚠️ ET UN ÉVÉNEMENT SANS OUVERTURE N'ENTRE DANS AUCUN DÉLAI, plutôt que d'en inventer un. */
    const sansOuverture = tableauBordEvenements(
      [vide(9, { premierDevisLe: '2026-10-01T09:00:00+02:00' })], [], MAINTENANT);
    expect(sansOuverture.delais.global.premierDevis.n).toBe(0);
  });

  /**
   * ⚠️ UN JALON ANTÉRIEUR À L'OUVERTURE EST ÉCARTÉ, et pas compté comme zéro : une carte peut porter
   * n'importe quelle date (elle est saisie à la main), et un délai négatif tirerait la moyenne vers le bas
   * sans que rien ne le signale.
   */
  it('⚠️ un jalon antérieur à l’ouverture ne compte nulle part', () => {
    const tordu = tableauBordEvenements([vide(9, {
      ouvertureLe: '2026-10-05T09:00:00+02:00', premierDevisLe: '2026-10-01T09:00:00+02:00',
    })], [], MAINTENANT);
    expect(tordu.delais.global.premierDevis).toEqual({ n: 0, moyenneJours: null, medianeJours: null });
  });

  it('⚠️ l’écart se compte en jours, fuseau compris', () => {
    expect(ecartJours('2026-09-01T09:00:00+02:00', '2026-09-07T09:00:00+02:00')).toBe(6);
    /* Le passage à l'heure d'hiver : 1er novembre 09:00+01:00 — 25 octobre 09:00+02:00 = 7 j et 1 h. */
    expect(ecartJours('2026-10-25T09:00:00+02:00', '2026-11-01T09:00:00+01:00')).toBeCloseTo(7.04, 2);
  });
});

describe('🔴🔴 d) l’argent', () => {
  it('🔴 les montants et les effectifs, séparément', () => {
    expect(TB.argent.attenteCents).toBe(90_000);
    expect(TB.argent.attenteN).toBe(1);
    expect(TB.argent.accepteCents).toBe(100_000);
    expect(TB.argent.accepteN).toBe(1);
    expect(TB.argent.refusesN).toBe(1);
  });

  /**
   * 🔴🔴 UN DEVIS SANS MONTANT COMPTE DANS LE NOMBRE ET POUR RIEN DANS LA SOMME, et c'est voulu : annoncer
   * « 0 € » pour trois devis dont personne n'a saisi le prix ferait lire « des travaux gratuits » là où il
   * faut lire « des montants à renseigner ». C'est l'effectif qui le dit.
   */
  it('🔴🔴 un devis sans montant gonfle l’effectif, pas la somme', () => {
    const tb = tableauBordEvenements(
      [vide(9, { nbDevisEnAttente: 2, montantAttenteCents: 50_000 })], [], MAINTENANT);
    expect(tb.argent.attenteN).toBe(2);
    expect(tb.argent.attenteCents).toBe(50_000);
  });
});

describe('🔴🔴 e) les points d’attention', () => {
  it('🔴 les quatre compteurs', () => {
    expect(TB.attention.devisEnAttente).toBe(1);
    expect(TB.attention.sansNouvelles).toBe(1);
    expect(TB.attention.infosManquantes).toBe(1);
    expect(TB.attention.reouvertures).toBe(1);
  });

  /**
   * 🔴🔴 LE SEUIL EST STRICT, et les deux bords sont éprouvés : à 15 jours pile, l'événement n'y est PAS
   * encore. Un seuil « à peu près » dans un indicateur d'attention fait des listes qui ne se vident jamais.
   */
  it('🔴🔴 « > 15 j » est strict, et des deux côtés', () => {
    const a15 = vide(9, { ouvert: true, derniereActiviteLe: '2026-09-24T12:00:00+02:00' });
    const a16 = vide(9, { ouvert: true, derniereActiviteLe: '2026-09-23T11:00:00+02:00' });
    expect(SEUIL_SANS_NOUVELLES_JOURS).toBe(15);
    expect(sansNouvelles(a15, MAINTENANT)).toBe(false);
    expect(sansNouvelles(a16, MAINTENANT)).toBe(true);
  });

  /** 🔴🔴 UN ÉVÉNEMENT CLOS N'EST JAMAIS « SANS NOUVELLES » : on n'en attend plus. */
  it('🔴🔴 un dossier clos ne vient pas encombrer les points d’attention', () => {
    const clos = vide(9, { ouvert: false, derniereActiviteLe: '2026-01-01T09:00:00+01:00' });
    expect(sansNouvelles(clos, MAINTENANT)).toBe(false);
  });

  /** 🔴 LA DÉFINITION DE « INFOS MANQUANTES », éprouvée manque par manque. */
  it('🔴🔴 « infos manquantes » = sans type, sans urgence, ou sans bien', () => {
    expect(infosManquantes(vide(9, { type: 'travaux', urgence: 'urgent', avecBien: true }))).toBe(false);
    expect(infosManquantes(vide(9, { type: null, urgence: 'urgent', avecBien: true }))).toBe(true);
    expect(infosManquantes(vide(9, { type: 'travaux', urgence: null, avecBien: true }))).toBe(true);
    expect(infosManquantes(vide(9, { type: 'travaux', urgence: 'urgent', avecBien: false }))).toBe(true);
  });
});

describe('🔴🔴 chaque chiffre cliquable emporte la liste de ce qu’il compte', () => {
  /**
   * 🔴🔴 LA PROPRIÉTÉ QUI REND LE TABLEAU DE BORD FIABLE : le chiffre affiché EST la taille de l'ensemble que
   * le clic ouvre. Si les deux étaient calculés séparément, ils finiraient par différer d'un — et c'est le
   * tableau de bord qu'on croirait faux, pas la liste.
   */
  it('🔴🔴 chaque chiffre vaut la taille de son ensemble', () => {
    const t = TB.idsParFiltre;
    expect(t['encours']).toHaveLength(TB.volumes.enCours);
    expect(t['clos']).toHaveLength(TB.volumes.clos);
    expect(t['tous']).toHaveLength(TB.volumes.total);
    expect(t['monga']).toHaveLength(TB.volumes.avecMonga);
    expect(t['sans-monga']).toHaveLength(TB.volumes.sansMonga);
    expect(t['devis-attente']).toHaveLength(TB.attention.devisEnAttente);
    expect(t['sans-nouvelles']).toHaveLength(TB.attention.sansNouvelles);
    expect(t['infos-manquantes']).toHaveLength(TB.attention.infosManquantes);
    expect(t['reouverts']).toHaveLength(TB.attention.reouvertures);
    for (const r of TB.volumes.parType) expect(t[`type:${r.cle}`], r.cle).toHaveLength(r.n);
    for (const r of TB.volumes.parUrgence) expect(t[`urgence:${r.cle}`], r.cle).toHaveLength(r.n);
  });

  /** 🔴 ET CE SONT LES BONS ÉVÉNEMENTS, pas seulement le bon nombre. */
  it('🔴 les ensembles désignent les bons événements', () => {
    expect(TB.idsParFiltre['encours']).toEqual([1, 3, 4]);
    expect(TB.idsParFiltre['clos']).toEqual([2, 5]);
    expect(TB.idsParFiltre['devis-attente']).toEqual([1]);
    expect(TB.idsParFiltre['sans-nouvelles']).toEqual([1]);
    expect(TB.idsParFiltre['infos-manquantes']).toEqual([4]);
    expect(TB.idsParFiltre['reouverts']).toEqual([3]);
    expect(TB.idsParFiltre['type:travaux']).toEqual([1, 2]);
    expect(TB.idsParFiltre['urgence:urgent']).toEqual([1, 3]);
  });
});

describe('🔴🔴 la ligne repliée', () => {
  /** 🔴 LA PHRASE D'ARNO, dans son ordre et avec ses mots. */
  it('🔴🔴 elle dit en cours, urgents, devis en attente, sans nouvelles, et le délai', () => {
    expect(ligneDeSynthese(TB))
      .toBe('3 en cours · 2 urgents · 1 devis en attente · 1 sans nouvelles > 15 j · ouverture → 1er devis : 8 j en moyenne');
  });

  /**
   * ⚠️ LE DERNIER MORCEAU DISPARAÎT QUAND IL N'Y A PAS DE DEVIS : une ligne qui se termine par « — en
   * moyenne » ferait douter de tout ce qui précède. Les quatre comptes, eux, restent — un zéro compté est
   * une information.
   */
  it('⚠️ sans aucun devis, la ligne s’arrête avant le délai', () => {
    const tb = tableauBordEvenements([vide(9, { ouvert: true })], [], MAINTENANT);
    expect(ligneDeSynthese(tb)).toBe('1 en cours · 0 urgent · 0 devis en attente · 0 sans nouvelles > 15 j');
  });
});

describe('🔴🔴 une réponse d’une autre forme ne fait pas tomber l’écran', () => {
  /**
   * 🔴🔴 TROUVÉ EN ÉPROUVANT, ET C'ÉTAIT GRAVE : l'écran lisait tout ce que la route rendait. Une réponse
   * d'une autre forme — une route qui change, une doublure, un intermédiaire bavard — et la PAGE ENTIÈRE
   * tombait sur un `Cannot read properties of undefined`, pour un panneau de chiffres.
   */
  it('🔴🔴 la forme est vérifiée avant d’être lue', () => {
    expect(estTableauBord(TB)).toBe(true);
    expect(estTableauBord(null)).toBe(false);
    expect(estTableauBord({})).toBe(false);
    expect(estTableauBord({ ok: true })).toBe(false);
    expect(estTableauBord({ ...TB, volumes: undefined })).toBe(false);
    expect(estTableauBord({ ...TB, idsParFiltre: undefined })).toBe(false);
  });
});

describe('⚠️ les gardes du lot', () => {
  const REPO = readFileSync('app/lib/gestion/tableauBordRepo.ts', 'utf8');
  const ROUTE = readFileSync('app/(admin)/api/admin/gestion/evenements/tableau-bord/route.ts', 'utf8');

  /**
   * 🔴🔴 LECTURE SEULE, ET CELA SE VÉRIFIE PLUTÔT QUE DE SE PROMETTRE. Arno : « Calcul côté serveur, en
   * LECTURE SEULE (aucune écriture, aucune table nouvelle obligatoire) ».
   */
  it('🔴🔴 ni le dépôt ni la route n’écrivent quoi que ce soit', () => {
    /**
     * ⚠️ ON RETIRE LES COMMENTAIRES AVANT DE CHERCHER, et ce n'est pas une facilité : sans cela, l'encadré qui
     * ANNONCE « il n'y a pas un seul INSERT dans ce fichier » ferait rougir l'épreuve — et, pire, un vrai
     * `INSERT` pourrait se cacher derrière un commentaire qui contient le mot. On cherche dans le CODE.
     */
    const sansCommentaires = (s: string): string => s
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const [nom, src] of [['dépôt', REPO], ['route', ROUTE]] as const) {
      expect(sansCommentaires(src), nom).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/);
    }
    /* ⚠️ ET LE DÉCAPAGE N'A PAS TOUT EMPORTÉ : sans cette ligne, une expression qui rendrait la chaîne vide
       ferait passer le cas pour toujours, en ne prouvant plus rien. Le SQL de lecture doit rester là. */
    expect(sansCommentaires(REPO)).toContain('SELECT');
    /* 🔴 ET LA ROUTE N'OFFRE QUE `GET` : pas de `POST`, pas de `PATCH`, pas de `DELETE`. */
    expect(ROUTE).toContain('export async function GET(');
    expect(ROUTE).not.toMatch(/export async function (POST|PATCH|PUT|DELETE)\(/);
    /* 🔒 ET ELLE EST GARDÉE : les chiffres portent sur le portefeuille entier. */
    expect(ROUTE).toContain("exigerCompteActif(request, 'gestion')");
  });

  /**
   * 🔴🔴 « OUVERT ? » ET « QUELLES PÉRIODES ? » VIENNENT DE `etatParLaFrise`, jamais d'une seconde écriture.
   * Une deuxième définition de « ouvert » dans un tableau de bord serait la pire place pour en avoir une :
   * personne ne recompte un chiffre de synthèse, et l'écart ne se verrait jamais.
   */
  it('🔴🔴 l’état et les périodes viennent de la règle commune', () => {
    expect(REPO).toContain("from './etatParLaFrise'");
    expect(REPO).toContain("sqlEvenementOuvertParLaFrise('e')");
    expect(REPO).toContain("sqlPeriodesDeLEvenement('e')");
    expect(REPO).not.toContain("etat = 'traite'");
  });
});
