import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  cleNomDrive, memoireNoms, MEMOIRE_NOMS_MS, oublierCesNoms, oublierLesNomsDrive, tailleMemoireNoms,
} from './nomsDriveMemoire';
import { nomsDriveMemo } from './relectureNomsDrive';
import type { DepsReprise } from './reprendreNomsDrive';

/**
 * ══ 🔴🔴 LOT RENOMMAGE-UN-SEUL-NOM — LE RENOMMAGE NE DOIT PLUS S'ANNULER TOUT SEUL ══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LE DÉFAUT QUE CE FICHIER EMPÊCHE DE REVENIR, et il a été vu EN VRAI le 03/10/2026, pièce 27087 :
 *
 *     journal 81  11:36:40.334  app    « test renomage.pdf » → « epreuve lot extension.pdf »
 *     journal 82  11:36:40.397  drive  « epreuve lot extension.pdf » → « test renomage.pdf »
 *
 * 63 millisecondes. Le renommage avait été DÉFAIT par la reprise, qui relisait sa mémoire de 30 secondes —
 * remplie à l'ouverture de la visionneuse, donc avant l'écriture — et croyait qu'un humain avait renommé dans
 * Google Drive. Le nom final était celui d'avant, dans la base comme dans le Drive, et rien ne le disait.
 *
 * 🔴 CE N'EST PAS UNE COURSE RARE : c'est la suite NORMALE des gestes. Renommer, c'est toujours renommer un
 * document qu'on vient de regarder — donc dont la mémoire est pleine, et fraîche.
 *
 * ⚠️ LE PREMIER TEST CI-DESSOUS REJOUE LA SÉQUENCE ENTIÈRE, dans l'ordre, avec la mémoire comme seule variable.
 * Sans l'oubli, il échoue : c'est le seul test de ce fichier qui prouve la correction plutôt que l'outil.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const T0 = 1_000_000;
const SUJET = 'a.jorel@sansvisavis.com';
const ID = '1EkymbIKbaHxaLCz-l1NWetTts5eqA1q9';

/** Google, qui rend le nom courant du fichier — et compte combien de fois on le lui a demandé. */
const google = (nom: { v: string }, lectures: { n: number }): DepsReprise => ({
  fetch: (async () => {
    lectures.n += 1;
    return new Response(JSON.stringify({
      id: ID, name: nom.v, modifiedTime: '2026-10-03T09:36:40.000Z',
    }), { status: 200 });
  }) as unknown as typeof fetch,
});

beforeEach(() => { oublierLesNomsDrive(); });

describe('🔴🔴 la séquence réelle : regarder, renommer, recharger', () => {
  it('🔴🔴 après notre écriture, la relecture rend le NOUVEAU nom, pas celui d’avant', async () => {
    const nomChezGoogle = { v: 'test renomage.pdf' };
    const lectures = { n: 0 };
    const deps = google(nomChezGoogle, lectures);

    // ① ON OUVRE LA VISIONNEUSE : la mémoire se remplit avec le nom d'avant.
    const avant = await nomsDriveMemo('JETON', [ID], deps, T0, SUJET);
    expect(avant.get(ID)?.nom).toBe('test renomage.pdf');
    expect(lectures.n).toBe(1);

    // ② ON RENOMME : le fichier change de nom chez Google, et le chemin d'écriture oublie ce qu'il a périmé.
    nomChezGoogle.v = 'epreuve lot extension.pdf';
    oublierCesNoms([ID]);

    // ③ L'ÉCRAN SE RECHARGE, 63 ms plus tard — bien DANS la fenêtre de 30 secondes.
    const apres = await nomsDriveMemo('JETON', [ID], deps, T0 + 63, SUJET);
    expect(apres.get(ID)?.nom).toBe('epreuve lot extension.pdf');
    expect(lectures.n).toBe(2);
  });

  /**
   * 🔴 ET SANS L'OUBLI, LA MÉMOIRE RENDRAIT L'ANCIEN — c'est-à-dire exactement ce que la reprise prenait pour
   * « un humain a renommé dans Drive ». Ce test fige la cause, pour qu'on la reconnaisse si elle revient.
   */
  it('🔴 sans oubli, la mémoire rend encore l’ancien nom : la cause, figée', async () => {
    const nomChezGoogle = { v: 'test renomage.pdf' };
    const lectures = { n: 0 };
    const deps = google(nomChezGoogle, lectures);

    await nomsDriveMemo('JETON', [ID], deps, T0, SUJET);
    nomChezGoogle.v = 'epreuve lot extension.pdf';
    const apres = await nomsDriveMemo('JETON', [ID], deps, T0 + 63, SUJET);
    expect(apres.get(ID)?.nom).toBe('test renomage.pdf');
    expect(lectures.n).toBe(1);
  });
});

describe('🔴 l’oubli, dans le détail', () => {
  it('🔴🔴 il oublie TOUS LES SUJETS : le fichier a changé de nom pour tout le monde', () => {
    memoireNoms.set(cleNomDrive('a@x.fr', ID), { valeur: null, expireA: T0 });
    memoireNoms.set(cleNomDrive('b@x.fr', ID), { valeur: null, expireA: T0 });
    memoireNoms.set(cleNomDrive('a@x.fr', 'AUTRE'), { valeur: null, expireA: T0 });
    expect(oublierCesNoms([ID])).toBe(2);
    expect(tailleMemoireNoms()).toBe(1);
    expect(memoireNoms.has(cleNomDrive('a@x.fr', 'AUTRE'))).toBe(true);
  });

  /** ⚠️ ON N'OUBLIE QUE L'IDENTIFIANT DEMANDÉ : un identifiant dont un autre est le préfixe reste en place. */
  it('⚠️ un identifiant voisin n’est pas emporté', () => {
    memoireNoms.set(cleNomDrive(SUJET, 'ABC'), { valeur: null, expireA: T0 });
    memoireNoms.set(cleNomDrive(SUJET, 'ABCD'), { valeur: null, expireA: T0 });
    expect(oublierCesNoms(['ABC'])).toBe(1);
    expect(memoireNoms.has(cleNomDrive(SUJET, 'ABCD'))).toBe(true);
  });

  it('un identifiant vide ou blanc n’oublie rien et ne lève pas', () => {
    memoireNoms.set(cleNomDrive(SUJET, ID), { valeur: null, expireA: T0 });
    expect(oublierCesNoms(['', '   '])).toBe(0);
    expect(tailleMemoireNoms()).toBe(1);
  });

  /** ⚠️ LA MÉMOIRE GARDE SA DURÉE : ce lot n'a pas raccourci la fraîcheur, il a supprimé un mensonge. */
  it('⚠️ la durée de mémoire n’a pas bougé', () => {
    expect(MEMOIRE_NOMS_MS).toBe(30_000);
  });
});

/**
 * ══ 🔴🔴 ET L'OUBLI EST BRANCHÉ AU SEUL ENDROIT QUI ÉCRIT DANS LE DRIVE ═════════════════════════════════════════
 *
 * Un outil d'oubli que personne n'appelle ne répare rien. `noterNomEcritDansDrive` est la seule fonction qui
 * note « voilà ce que nous avons écrit chez Google » : c'est elle, et elle seule, qui doit oublier.
 */
describe('🔴🔴 l’oubli est branché au chemin d’écriture', () => {
  const repo = readFileSync('app/lib/gestion/nomUsageRepo.ts', 'utf8');

  it('🔴🔴 `noterNomEcritDansDrive` oublie les noms mémorisés', () => {
    const i = repo.indexOf('export async function noterNomEcritDansDrive');
    expect(i).toBeGreaterThan(0);
    const corps = repo.slice(i, i + 600);
    expect(corps).toContain('oublierCesNoms(ids);');
  });

  /** 🔴 AVANT LA SONDE DE MIGRATION : sans la colonne `nom_drive`, la mémoire est tout autant périmée. */
  it('🔴 il oublie AVANT de pouvoir renoncer', () => {
    const i = repo.indexOf('export async function noterNomEcritDansDrive');
    const corps = repo.slice(i, i + 600);
    expect(corps.indexOf('oublierCesNoms(ids);')).toBeLessThan(corps.indexOf('nomUsageDisponible()'));
  });

  /** ⚠️ ET LA MÉMOIRE N'IMPORTE RIEN : c'est ce qui lui permet d'être importée des deux côtés sans cycle. */
  it('⚠️ le module de mémoire ne dépend que d’un type', () => {
    const src = readFileSync('app/lib/gestion/nomsDriveMemoire.ts', 'utf8');
    const imports = src.match(/^import .*$/gm) ?? [];
    expect(imports).toEqual(["import type { NomVuDansDrive } from './nomUsagePiece';"]);
  });
});
