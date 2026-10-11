import { describe, it, expect } from 'vitest';
import {
  accoladeInterneSuite, accoladesDeLaPage, accoladesDuBienDansLeFil, placerAccolades, LIBELLE_AJOUT, LIBELLE_RETRAIT,
} from './accoladesBien';
import type { Periode } from './periodesConversation';

/** 🔴🔴 LOT ACCOLADE-PARTOUT — les accolades d'un bien, sans écran. */

const mails = [1, 2, 3, 4, 5];
const periode = (id: number, depuis: number, biens: string[], par = 'a.jorel@sansvisavis.com'): Periode => ({
  id, depuisMessageId: depuis, parLibelle: par, le: `2026-10-0${id}T10:00:00Z`,
  classement: { sorte: 'biens', biens: biens.map((cle) => ({ cle, libelle: `bien ${cle}` })) },
});

describe('une accolade seulement si la période concerne CE bien', () => {
  it('🔴 ajout : « suivi aussi par ce bien », au mail qui ouvre la période', () => {
    const a = accoladesDuBienDansLeFil({ filId: 9, mails, periodes: [periode(1, 1, ['A']), periode(2, 3, ['A', 'B'])], cle: 'B' });
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ depuisMessageId: 3, sens: 'ajout', libelle: 'suivi aussi par ce bien', parLibelle: 'a.jorel@sansvisavis.com' });
    expect(LIBELLE_AJOUT).toBe('suivi aussi par ce bien');
    /* Le « i » : l'avant / après de la vue conversation, la portée « la suite ». */
    expect(a[0].comparatif?.choix).toBe('ce mail et la conversation à venir');
    expect(a[0].nbMails).toBe(3);
  });
  it('🔴 retrait : « sorti du suivi de ce bien »', () => {
    const a = accoladesDuBienDansLeFil({ filId: 9, mails, periodes: [periode(1, 1, ['A', 'B']), periode(2, 4, ['A'])], cle: 'B' });
    expect(a.map((x) => [x.depuisMessageId, x.libelle])).toEqual([[4, 'sorti du suivi de ce bien']]);
    expect(LIBELLE_RETRAIT).toBe('sorti du suivi de ce bien');
  });
  it('🔴 absente si la période ne change rien pour ce bien', () => {
    expect(accoladesDuBienDansLeFil({ filId: 9, mails, periodes: [periode(1, 1, ['A']), periode(2, 3, ['A', 'B'])], cle: 'A' })).toEqual([]);
    expect(accoladesDuBienDansLeFil({ filId: 9, mails, periodes: [periode(1, 1, ['A']), periode(2, 3, ['C'])], cle: 'Z' })).toEqual([]);
  });
  it('jamais pour la fenêtre du premier mail (elle ne sépare rien)', () => {
    expect(accoladesDuBienDansLeFil({ filId: 9, mails, periodes: [periode(1, 1, ['B'])], cle: 'B' })).toEqual([]);
  });
  it('🔴 plusieurs périodes successives : une accolade par changement, dans l’ordre chronologique', () => {
    const a = accoladesDuBienDansLeFil({
      filId: 9, mails,
      periodes: [periode(4, 5, ['B']), periode(1, 1, ['A']), periode(3, 4, []), periode(2, 2, ['B'])], cle: 'B',
    });
    expect(a.map((x) => [x.depuisMessageId, x.sens])).toEqual([[2, 'ajout'], [4, 'retrait'], [5, 'ajout']]);
  });
});

describe('la marque « Interne » posée « pour la suite »', () => {
  it('une accolade au premier mail du geste, avant = la fenêtre, après = Interne', () => {
    const a = accoladeInterneSuite({ filId: 9, mails, periodes: [periode(1, 1, ['A'])], marques: [5, 3, 4],
      parLibelle: 'x', le: '2026-10-11T10:00:00Z', libelle: 'Interne' });
    expect(a).toMatchObject({ depuisMessageId: 3, libelle: 'Interne', nbMails: 3 });
    expect(a?.comparatif?.apres.statut).toBe('Interne');
    expect(a?.comparatif?.avant?.biens).toBe('bien A');
  });
  it('rien si le geste commence au premier mail du fil', () => {
    expect(accoladeInterneSuite({ filId: 9, mails, periodes: [], marques: [1, 2], parLibelle: null, le: null, libelle: 'Interne' })).toBeNull();
  });
});

describe('placer les accolades dans une liste de mails', () => {
  const l = (messageId: number, recuLe: string) => ({ messageId, recuLe });
  const a = (depuisMessageId: number, recuLe: string) => ({ depuisMessageId, recuLe });
  const forme = (els: ReturnType<typeof placerAccolades>) => els.map((e) => (e.sorte === 'mail' ? `m${e.ligne.messageId}` : `A${e.accolade.depuisMessageId}:${e.cote}`));
  it('ordre croissant : au-dessus du premier mail concerné (« dessus »)', () => {
    expect(forme(placerAccolades([l(1, '2026-01-01'), l(3, '2026-03-01'), l(5, '2026-05-01')], [a(3, '2026-03-01')])))
      .toEqual(['m1', 'A3:dessus', 'm3', 'm5']);
  });
  it('ordre décroissant (plus récent en haut) : en dessous (« dessous »), du côté qui le précède dans le temps', () => {
    expect(forme(placerAccolades([l(5, '2026-05-01'), l(3, '2026-03-01'), l(1, '2026-01-01')], [a(3, '2026-03-01')])))
      .toEqual(['m5', 'm3', 'A3:dessous', 'm1']);
  });
  it('un retrait dont le mail n’est pas dans la liste se pose à sa place dans le temps ; plusieurs, dans l’ordre', () => {
    expect(forme(placerAccolades([l(5, '2026-05-01'), l(1, '2026-01-01')], [a(4, '2026-04-01'), a(2, '2026-02-01')])))
      .toEqual(['m5', 'A4:dessous', 'A2:dessous', 'm1']);
    expect(forme(placerAccolades([l(1, '2026-01-01'), l(5, '2026-05-01')], [a(4, '2026-04-01'), a(2, '2026-02-01')])))
      .toEqual(['m1', 'A2:dessus', 'A4:dessus', 'm5']);
  });
});

describe('une accolade hors de la page n’est pas collée au bord d’une page qui ne la concerne pas', () => {
  const lignes = [{ recuLe: '2026-05-01' }, { recuLe: '2026-03-01' }];
  const acc = [{ recuLe: '2026-06-01' }, { recuLe: '2026-04-01' }, { recuLe: '2026-01-01' }];
  it('dans la page : gardée ; au-delà d’un bout : seulement si ce bout est celui de toute la liste', () => {
    expect(accoladesDeLaPage({ lignes, accolades: acc, premierePage: false, dernierePage: false })).toEqual([{ recuLe: '2026-04-01' }]);
    expect(accoladesDeLaPage({ lignes, accolades: acc, premierePage: true, dernierePage: false }))
      .toEqual([{ recuLe: '2026-06-01' }, { recuLe: '2026-04-01' }]);
    expect(accoladesDeLaPage({ lignes, accolades: acc, premierePage: true, dernierePage: true })).toHaveLength(3);
  });
});
