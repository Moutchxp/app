/**
 * ══ 🔴🔴 LOT ETAT-PAR-LA-FRISE — LE PLI, JOUÉ PAR POSTGRESQL, SUR DES BORNES LITTÉRALES. LECTURE SEULE. ══════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE CE FICHIER ÉPROUVE, ET POURQUOI IL EXISTE. La règle d'Arno du 08/10/2026 est un PLI : on parcourt les
 * cartes de borne dans l'ordre, une ouverture ouvre, une clôture ferme. Ce pli est écrit UNE fois, en SQL émis
 * par `etatParLaFrise` — c'est le seul langage où il puisse s'appliquer AVANT la pagination et le compteur, donc
 * le seul qui évite une seconde version en TypeScript.
 *
 * 🔴 UN PLI NE SE VÉRIFIE PAS EN LISANT SON TEXTE. Les cas qui comptent — deux ouvertures de suite, une clôture
 * sans rien d'ouvert avant elle, trois cycles, deux bornes le même jour — ne se jugent qu'en les JOUANT. Il faut
 * donc PostgreSQL, et ce fichier est hors de `npm test` (motif `*.itest.ts`, `npm run test:integration`).
 *
 * ═══ 🔒 LECTURE SEULE, ET SANS LA MOINDRE LIGNE CRÉÉE ═══════════════════════════════════════════════════════════
 *
 * 🔴 AUCUN ÉVÉNEMENT N'EST FABRIQUÉ, PAS MÊME DANS UNE TRANSACTION ANNULÉE. Les scénarios sont des bornes
 * LITTÉRALES, passées au pli par un `VALUES` — c'est possible parce que la source des bornes est un PARAMÈTRE du
 * générateur (`sqlPeriodes`), exactement comme `sqlEvenementsDesMessages` prend son ensemble de messages.
 *
 * ⚠️ C'EST DONC LE **MÊME PLI** QUE LA PRODUCTION, au caractère près : seules les bornes changent de source. Un
 * pli recopié dans l'épreuve n'aurait rien prouvé — on aurait comparé ma version à ma version.
 *
 * ⚠️ LA SEULE PARTIE QUI LIT DE VRAIES DONNÉES est la dernière section, et elle ne fait que CONSTATER l'état des
 * deux événements de la base locale. Aucune écriture, aucun geste sur un événement réel (interdit d'Arno).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { sqlPeriodes } from './etatParLaFrise';
import { rangEtape } from './mongaEtape';

afterAll(async () => { await closePool(); });

/** Une borne de scénario : un jour, un sens, et le type qui donne son rang à date égale. */
interface Borne {
  jour: string;
  type: 'ouverture' | 'cloture' | 'reouverture';
}

const SENS = (t: Borne['type']): string => (t === 'cloture' ? 'ferme' : 'ouvre');

/**
 * Joue le pli de PRODUCTION sur des bornes littérales, et rend les périodes.
 *
 * 🔴 LE RANG VIENT DE `rangEtape`, comme dans le SQL de production : c'est lui qui départage deux bornes du
 * MÊME JOUR, et c'est le cas qui a motivé l'épreuve ⑤.
 */
async function periodes(bornes: readonly Borne[]): Promise<{ du: string; au: string | null }[]> {
  if (bornes.length === 0) return [];
  const valeurs = bornes.map((b, i) =>
    `('${b.jour}'::timestamptz, '${SENS(b.type)}'::text, ${rangEtape(b.type)}::numeric, ${i}::bigint)`).join(', ');
  const source = `SELECT * FROM (VALUES ${valeurs}) AS v(quand, sens, rang, carte)`;
  const { rows } = await query<{ du: string; au: string | null }>(
    `SELECT p.du::date::text AS du, p.au::date::text AS au FROM (${sqlPeriodes(source)}) p ORDER BY p.du, p.cycle`);
  return rows.map((r) => ({ du: r.du, au: r.au }));
}

/** « L'événement est-il ouvert ? » — il reste une période sans borne haute (la règle d'Arno, point 1). */
const ouvert = (p: readonly { au: string | null }[]): boolean => p.some((x) => x.au === null);

/** « Ce mail est-il dans une période ouverte ? » — la règle du point 5, jouée sur les périodes rendues. */
const etiquete = (p: readonly { du: string; au: string | null }[], jour: string): boolean =>
  p.some((x) => jour >= x.du && (x.au === null || jour <= x.au));

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LA RÈGLE D'ARNO, POINT 1 — LA DERNIÈRE BORNE DÉCIDE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① la dernière borne décide de l’état', () => {
  it('🔴🔴 dernière borne = Clôture ⇒ CLOS', async () => {
    const p = await periodes([
      { jour: '2026-09-01', type: 'ouverture' },
      { jour: '2026-09-20', type: 'cloture' },
    ]);
    expect(ouvert(p)).toBe(false);
    expect(p).toEqual([{ du: '2026-09-01', au: '2026-09-20' }]);
  });

  it('🔴🔴 dernière borne = Réouverture ⇒ OUVERT', async () => {
    const p = await periodes([
      { jour: '2026-09-01', type: 'ouverture' },
      { jour: '2026-09-20', type: 'cloture' },
      { jour: '2026-09-25', type: 'reouverture' },
    ]);
    expect(ouvert(p)).toBe(true);
    expect(p).toEqual([
      { du: '2026-09-01', au: '2026-09-20' },
      { du: '2026-09-25', au: null },
    ]);
  });

  /**
   * 🔴🔴 LE CAS D'ARNO, EXACTEMENT : GES-2026-000001. Il a RETIRÉ la carte Clôture, il ne reste que l'ouverture
   * dérivée, et l'événement doit être OUVERT — « sans carte Réouverture » (point 2).
   */
  it('🔴🔴 plus aucune Clôture ⇒ OUVERT, sans carte Réouverture (le cas GES-2026-000001)', async () => {
    const p = await periodes([{ jour: '2026-09-23', type: 'ouverture' }]);
    expect(ouvert(p)).toBe(true);
    expect(p).toEqual([{ du: '2026-09-23', au: null }]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② PLUSIEURS CYCLES, ET LES CAS QUI CASSENT LES BOUCLES ÉCRITES À LA MAIN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② plusieurs cycles clôture / réouverture', () => {
  it('🔴🔴 trois cycles sortent dans l’ordre, le dernier ouvert', async () => {
    const p = await periodes([
      { jour: '2026-01-05', type: 'ouverture' },
      { jour: '2026-02-10', type: 'cloture' },
      { jour: '2026-03-01', type: 'reouverture' },
      { jour: '2026-04-15', type: 'cloture' },
      { jour: '2026-06-02', type: 'reouverture' },
    ]);
    expect(p).toEqual([
      { du: '2026-01-05', au: '2026-02-10' },
      { du: '2026-03-01', au: '2026-04-15' },
      { du: '2026-06-02', au: null },
    ]);
    expect(ouvert(p)).toBe(true);
  });

  /**
   * ⚠️ DEUX OUVERTURES DE SUITE NE REDÉMARRENT RIEN, et c'est juste : rien ne s'était arrêté. Une Réouverture
   * posée sur un dossier déjà ouvert est un geste qui arrive (deux onglets, une main qui hésite).
   */
  it('⚠️ deux ouvertures de suite ne font qu’une période, qui commence à la PREMIÈRE', async () => {
    const p = await periodes([
      { jour: '2026-09-01', type: 'ouverture' },
      { jour: '2026-09-10', type: 'reouverture' },
    ]);
    expect(p).toEqual([{ du: '2026-09-01', au: null }]);
  });

  /**
   * ⚠️ UNE CLÔTURE SANS RIEN D'OUVERT AVANT ELLE N'INVENTE PAS DE PÉRIODE. Le cycle n'a pas de borne basse, et
   * le `HAVING` l'écarte : on ne fabrique pas une période qui n'a jamais commencé.
   */
  it('⚠️ une Clôture en tête de frise ne fabrique aucune période', async () => {
    const p = await periodes([{ jour: '2026-09-01', type: 'cloture' }]);
    expect(p).toEqual([]);
    /* 🔴 ET L'ÉVÉNEMENT EST ALORS CLOS : il ne reste aucune période sans borne haute. */
    expect(ouvert(p)).toBe(false);
  });

  it('⚠️ deux clôtures de suite ne ferment qu’une fois, à la PREMIÈRE', async () => {
    const p = await periodes([
      { jour: '2026-09-01', type: 'ouverture' },
      { jour: '2026-09-10', type: 'cloture' },
      { jour: '2026-09-20', type: 'cloture' },
    ]);
    expect(p).toEqual([{ du: '2026-09-01', au: '2026-09-10' }]);
    expect(ouvert(p)).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ L'ORDRE À DATE ÉGALE EST CELUI DE LA FRISE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ deux bornes le même jour se lisent comme la frise les montre', () => {
  /**
   * 🔴🔴 LE CAS N'EST PAS THÉORIQUE : l'événement d'essai GES-2026-900001 porte, LE MÊME JOUR, une réouverture
   * (438), une clôture (439) et une réouverture (440). Lues par identifiant : ouvre, ferme, ouvre. Lues comme la
   * frise les montre (`cloture` rang 9 avant `reouverture` rang 9,5) : ferme, ouvre, ouvre.
   *
   * ⚠️ LES DEUX LECTURES NE DONNENT PAS LES MÊMES PÉRIODES, et c'est pour cela que le rang vient de `rangEtape`
   * et non de l'ordre d'insertion.
   */
  it('🔴🔴 le rang de la frise départage, pas l’identifiant', async () => {
    const p = await periodes([
      { jour: '2026-09-30', type: 'ouverture' },
      /* L'ordre d'insertion est celui des identifiants 438, 439, 440 — la frise, elle, met la clôture devant. */
      { jour: '2026-10-08', type: 'reouverture' },
      { jour: '2026-10-08', type: 'cloture' },
      { jour: '2026-10-08', type: 'reouverture' },
    ]);
    expect(p).toEqual([
      { du: '2026-09-30', au: '2026-10-08' },
      { du: '2026-10-08', au: null },
    ]);
    expect(ouvert(p)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LE TROU FERMÉ — RÈGLE D'ARNO, POINT 5
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ④ un mail n’est étiqueté que DANS une période ouverte', () => {
  /** La frise d'Arno : ouverte le 1er, close le 20, rouverte le 25. Le trou va du 20 au 25. */
  const AVEC_CLOTURE: Borne[] = [
    { jour: '2026-09-01', type: 'ouverture' },
    { jour: '2026-09-20', type: 'cloture' },
    { jour: '2026-09-25', type: 'reouverture' },
  ];

  it('🔴🔴 un mail DANS le trou fermé n’est PAS étiqueté', async () => {
    const p = await periodes(AVEC_CLOTURE);
    expect(etiquete(p, '2026-09-22')).toBe(false);
  });

  it('🔴 un mail de chaque période ouverte EST étiqueté', async () => {
    const p = await periodes(AVEC_CLOTURE);
    expect(etiquete(p, '2026-09-05')).toBe(true);
    expect(etiquete(p, '2026-09-28')).toBe(true);
  });

  /**
   * ⚠️ LES BORNES SONT INCLUSES DES DEUX CÔTÉS, comme la fenêtre d'avant ce lot (`>=` et `<=`) : un mail arrivé
   * le jour même de la clôture appartient encore au dossier qu'il clôt — c'est souvent LUI qui l'a clos.
   */
  it('⚠️ le jour de l’ouverture et celui de la clôture sont DANS la période', async () => {
    const p = await periodes(AVEC_CLOTURE);
    expect(etiquete(p, '2026-09-01')).toBe(true);
    expect(etiquete(p, '2026-09-20')).toBe(true);
  });

  /**
   * 🔴🔴 « SI UNE CLÔTURE EST SUPPRIMÉE, LA PÉRIODE SE RECALCULE : les mails de l'ancien trou redeviennent dans
   * l'événement. » (Arno, point 5) — et c'est VRAI SANS AUCUNE ÉCRITURE : la carte disparaît de la frise, le pli
   * la relit, le trou n'existe plus. C'est la démonstration du choix de conception du lot.
   */
  it('🔴🔴 retirer la Clôture rend le trou à l’événement, sans rien écrire', async () => {
    const sansCloture = AVEC_CLOTURE.filter((b) => b.type !== 'cloture');
    const p = await periodes(sansCloture);
    expect(p).toEqual([{ du: '2026-09-01', au: null }]);
    expect(etiquete(p, '2026-09-22')).toBe(true);
    expect(ouvert(p)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ LA VRAIE BASE — CONSTAT, SANS LA MOINDRE ÉCRITURE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ⑤ ce que la règle dit des événements de la base locale', () => {
  /**
   * ⚠️ CETTE SECTION CONSTATE, ELLE NE FIGE PAS. Les deux événements de la base locale peuvent changer d'un
   * jour à l'autre (Arno pose et retire des cartes) : l'épreuve vérifie donc la COHÉRENCE — l'état rendu par la
   * règle est bien celui que les périodes racontent — et non des valeurs écrites en dur.
   */
  it('🔴 l’état rendu par la règle est cohérent avec les périodes rendues, pour chaque événement', async () => {
    const { rows } = await query<{ id: string; ouvert: boolean; nb_ouvertes: string }>(
      `SELECT e.id::text,
              ${(await import('./etatParLaFrise')).sqlEvenementOuvertParLaFrise('e')} AS ouvert,
              (SELECT count(*) FROM (${(await import('./etatParLaFrise')).sqlPeriodesDeLEvenement('e')}) p
                WHERE p.au IS NULL)::text AS nb_ouvertes
         FROM gestion_evenement e`);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.ouvert, r.id).toBe(Number(r.nb_ouvertes) > 0);
  });

  /** 🔴 ET « CLOS LE » EST NUL DÈS QUE L'ÉVÉNEMENT EST OUVERT — y compris après un cycle clos puis rouvert. */
  it('🔴 « clos le » ne vaut que sur un événement clos', async () => {
    const m = await import('./etatParLaFrise');
    const { rows } = await query<{ id: string; ouvert: boolean; clos_le: string | null }>(
      `SELECT e.id::text, ${m.sqlEvenementOuvertParLaFrise('e')} AS ouvert,
              ${m.sqlClosLeParLaFrise('e')}::text AS clos_le
         FROM gestion_evenement e`);
    for (const r of rows) {
      if (r.ouvert) expect(r.clos_le, r.id).toBeNull();
      else expect(r.clos_le, r.id).not.toBeNull();
    }
  });
});
