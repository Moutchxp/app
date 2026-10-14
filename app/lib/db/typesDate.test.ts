import { describe, it, expect, afterEach } from 'vitest';
import { types } from 'pg';
import { analyserMuraleParis, elementsTableau, installerTypesDate } from './typesDate';

/**
 * LECTURE DES DATES SANS FUSEAU — lot PRÉPARATION-PORTABILITÉ. Le même `2026-10-14` lu en base doit donner le MÊME instant
 * sur le Mac (Paris) et sur un serveur en UTC : minuit de PARIS, ce que le Mac faisait déjà. Rejoué sous plusieurs fuseaux
 * de MACHINE (`process.env.TZ`, pris en compte à chaud par Node).
 */
const FUSEAUX_MACHINE = ['Europe/Paris', 'UTC', 'America/New_York', 'Asia/Tokyo'];
const TZ_ORIGINE = process.env.TZ;
afterEach(() => { if (TZ_ORIGINE === undefined) delete process.env.TZ; else process.env.TZ = TZ_ORIGINE; });
/** Analyseur texte installé dans `pg` pour un OID (les OID de tableaux ne figurent pas dans l'énumération typée de `pg`). */
const analyseur = (oid: number) => types.getTypeParser(oid as Parameters<typeof types.getTypeParser>[0], 'text') as (v: string) => unknown;
function partout(epreuve: () => void): void {
  for (const tz of FUSEAUX_MACHINE) { process.env.TZ = tz; epreuve(); }
}

describe('analyserMuraleParis', () => {
  it('une date = minuit de Paris (été et hiver)', () => partout(() => {
    expect(analyserMuraleParis('2026-10-14')?.toISOString()).toBe('2026-10-13T22:00:00.000Z');
    expect(analyserMuraleParis('2026-01-05')?.toISOString()).toBe('2026-01-04T23:00:00.000Z');
  }));
  it('un timestamp sans fuseau = heure murale de Paris, fractions comprises', () => partout(() => {
    expect(analyserMuraleParis('2026-09-23 14:00:00')?.toISOString()).toBe('2026-09-23T12:00:00.000Z');
    expect(analyserMuraleParis('2026-09-23 14:00:00.123456')?.toISOString()).toBe('2026-09-23T12:00:00.123Z');
    expect(analyserMuraleParis('2026-09-23 14:00:00.5')?.toISOString()).toBe('2026-09-23T12:00:00.500Z');
  }));
  it('changement d’heure : même choix que new Date(a, m, j, h) sur un Mac réglé sur Paris', () => partout(() => {
    expect(analyserMuraleParis('2026-03-29 02:30:00')?.toISOString()).toBe('2026-03-29T01:30:00.000Z'); // heure sautée → 03:30
    expect(analyserMuraleParis('2026-10-25 02:30:00')?.toISOString()).toBe('2026-10-25T00:30:00.000Z'); // heure doublée → la 1re
  }));
  it('format inattendu → null (l’analyseur d’origine prend le relais)', () => {
    for (const v of ['infinity', '-infinity', '0044-03-15 BC', '2026-10-14 10:00:00+02', 'n’importe quoi']) {
      expect(analyserMuraleParis(v)).toBeNull();
    }
  });
});

describe('elementsTableau', () => {
  it('tableau simple, NULL, guillemets, vide', () => {
    expect(elementsTableau('{2026-10-14,NULL,2026-10-15}')).toEqual(['2026-10-14', null, '2026-10-15']);
    expect(elementsTableau('{"2026-10-14 10:00:00"}')).toEqual(['2026-10-14 10:00:00']);
    expect(elementsTableau('{}')).toEqual([]);
    expect(elementsTableau('{{2026-10-14}}')).toBeNull();
  });
});

describe('analyseurs installés dans pg (OID 1082, 1114, 1182, 1115)', () => {
  it('le pilote rend minuit de Paris, quel que soit le fuseau de la machine', () => {
    installerTypesDate(); // idempotent
    partout(() => {
      const date = analyseur(1082) as (v: string) => Date;
      const horodatage = analyseur(1114) as (v: string) => Date;
      const dates = analyseur(1182) as (v: string) => (Date | null)[];
      const horodatages = analyseur(1115) as (v: string) => (Date | null)[];
      expect(date('2026-10-14').toISOString()).toBe('2026-10-13T22:00:00.000Z');
      expect(horodatage('2026-10-14 08:00:00').toISOString()).toBe('2026-10-14T06:00:00.000Z');
      expect(dates('{2026-10-14,NULL}').map((d) => d?.toISOString() ?? null)).toEqual(['2026-10-13T22:00:00.000Z', null]);
      expect(horodatages('{"2026-01-05 09:00:00"}')[0]?.toISOString()).toBe('2026-01-05T08:00:00.000Z');
    });
  });
  it('valeurs spéciales : l’analyseur d’origine répond (infinity reste infinity)', () => {
    const date = analyseur(1082);
    expect(date('infinity')).toBe(Infinity);
  });
});
