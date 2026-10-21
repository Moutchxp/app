import { describe, expect, it } from 'vitest';
import { annexesARattacher, doitReintegrer, libelleLot, planifierBail, refusRattachement, type FicheBien, type LotDeFiche } from './regroupement';

/** Une fiche bien = les lots loués ensemble (Arno, 17 et 19/10/2026) — le module pur. */
const lot = (id: number, role: 'logement' | 'annexe', libelle: string, occupants: number[] = [], noms: string[] = []): LotDeFiche =>
  ({ id, role, libelle, type: null, etage: null, numeroLot: null, porte: null, place: false, occupants, noms });
const APPART = lot(1, 'logement', 'l’appartement T3');
const CAVE = lot(3, 'annexe', 'la cave n°3');
const PARKING = lot(14, 'annexe', 'le parking n°14');
const ORIGINE: FicheBien = { origineId: 1, origineLibelle: '4 rue Fictive', teteId: 1, sorte: 'origine', regroupementId: null, lots: [APPART, CAVE, PARKING] };

describe('planifierBail — au moins un lot, et seulement des lots libres', () => {
  it('refus : aucun lot ; un lot déjà loué ; un lot hors du bien', () => {
    expect(planifierBail(ORIGINE, [])).toEqual({ ok: false, motif: 'Cochez au moins un lot loué.' });
    expect(planifierBail({ ...ORIGINE, lots: [APPART, { ...CAVE, occupants: [9], noms: ['MARTIN Léa'] }, PARKING] }, [1, 3]))
      .toEqual({ ok: false, motif: 'La cave n°3 : lot déjà loué à MARTIN Léa, il ne peut pas être coché.' });
    expect(planifierBail(ORIGINE, [1, 99]).ok).toBe(false);
  });

  it('tous les lots : la fiche ne change pas', () => {
    const r = planifierBail(ORIGINE, [1, 3, 14]);
    expect(r).toMatchObject({ ok: true, plan: { lotsLoues: [1, 3, 14], actions: [] } });
  });
});

describe('logement coché : les lots non repris deviennent des biens autonomes', () => {
  it('lot LIBRE décoché → bien autonome « disponible à la location » ; lot loué à un autre → bien autonome aussi (annoncé)', () => {
    const fiche = { ...ORIGINE, lots: [APPART, CAVE, { ...PARKING, occupants: [9], noms: ['MARTIN Léa'] }] };
    const r = planifierBail(fiche, [1]);
    if (!r.ok) throw new Error(r.motif);
    expect(r.plan.actions).toEqual([
      { sorte: 'autonome', lotIds: [3], teteId: 3, motif: 'orphelin' },
      { sorte: 'autonome', lotIds: [14], teteId: 14, motif: 'autre_locataire' },
    ]);
    expect(r.plan.recap).toEqual([
      'La cave n°3 deviendra un bien autonome, disponible à la location.',
      'Le parking n°14 (lot loué à MARTIN Léa) deviendra un bien autonome.',
    ]);
  });
});

describe('logement NON coché : les lots cochés forment UNE nouvelle fiche ; le logement reste dans la sienne', () => {
  it('cave + parking → une fiche à deux lots ; l’appartement en attente d’un locataire', () => {
    const r = planifierBail(ORIGINE, [3, 14]);
    if (!r.ok) throw new Error(r.motif);
    expect(r.plan.actions).toEqual([{ sorte: 'autonome', lotIds: [3, 14], teteId: 3, motif: 'bail' }]);
    expect(r.plan.recap).toEqual([
      'La cave n°3 et le parking n°14 formeront une nouvelle fiche bien, louée à ce locataire.',
      'L’appartement T3 reste dans sa propre fiche, en attente d’un locataire.',
    ]);
  });
  it('un seul lot coché → bien autonome loué', () => {
    const r = planifierBail(ORIGINE, [14]);
    if (!r.ok) throw new Error(r.motif);
    expect(r.plan.actions).toEqual([{ sorte: 'autonome', lotIds: [14], teteId: 14, motif: 'bail' }]);
    expect(r.plan.recap[0]).toBe('Le parking n°14 deviendra un bien autonome, loué à ce locataire.');
  });
});

describe('une fiche autonome à plusieurs lots, louée en partie : elle se scinde (l’ancienne se clôt, jamais effacée)', () => {
  it('cave louée seule : la cave forme sa fiche, le parking libre la sienne', () => {
    const fiche: FicheBien = { ...ORIGINE, teteId: 3, sorte: 'regroupement', regroupementId: 40, lots: [CAVE, PARKING] };
    const r = planifierBail(fiche, [3]);
    if (!r.ok) throw new Error(r.motif);
    expect(r.plan.actions).toEqual([
      { sorte: 'clore', regroupementId: 40 },
      { sorte: 'autonome', lotIds: [3], teteId: 3, motif: 'bail' },
      { sorte: 'autonome', lotIds: [14], teteId: 14, motif: 'scission' },
    ]);
  });
});

describe('réintégration : TOUS les lots aux MÊMES locataires', () => {
  it('oui quand tous les lots ont exactement les mêmes locataires et qu’un lot est hors de la fiche d’origine', () => {
    expect(doitReintegrer([{ occupants: [5, 6] }, { occupants: [6, 5] }, { occupants: [5, 6] }], true)).toBe(true);
  });
  it('non : un lot libre, des locataires différents, ou rien de détaché', () => {
    expect(doitReintegrer([{ occupants: [5] }, { occupants: [] }], true)).toBe(false);
    expect(doitReintegrer([{ occupants: [5] }, { occupants: [5, 6] }], true)).toBe(false);
    expect(doitReintegrer([{ occupants: [5] }, { occupants: [5] }], false)).toBe(false);
  });
});

describe('le libellé d’un lot, avec son article', () => {
  it('la cave, le parking, l’appartement', () => {
    expect(libelleLot({ categorie: 'cave', nature: null, typeBien: null, porte: '3', role: 'annexe' })).toBe('la cave n°3');
    expect(libelleLot({ categorie: 'parking', nature: null, typeBien: null, porte: '14', role: 'annexe' })).toBe('le parking n°14');
    expect(libelleLot({ categorie: null, nature: 'Appartement', typeBien: 'T3', porte: null, role: 'logement' })).toBe('l’appartement T3');
  });
});

describe('🔴 Arno (21/10/2026) — refusRattachement / annexesARattacher (PURS)', () => {
  const P = { occupants: [5, 6], noms: ['DUPONT Jean', 'DUPONT Marie'], mot: 'le logement' };
  it('vacante ou mêmes locataires (ordre indifférent) : autorisé ; sinon la raison', () => {
    expect(refusRattachement({ occupants: [], noms: [] }, P)).toBeNull();
    expect(refusRattachement({ occupants: [6, 5], noms: [] }, P)).toBeNull();
    expect(refusRattachement({ occupants: [9], noms: ['MARTIN Léa'] }, P)).toBe('Rattachement impossible : cette annexe est louée à MARTIN Léa, le logement à DUPONT Jean, DUPONT Marie.');
    expect(refusRattachement({ occupants: [5], noms: ['DUPONT Jean'] }, P)).toMatch(/^Rattachement impossible/);
  });
  it('automatique : seulement les annexes DÉTACHÉES louées exactement aux mêmes locataires (jamais deux vacants)', () => {
    expect(annexesARattacher({ occupants: [5] }, [{ id: 3, occupants: [5], detachee: true }, { id: 14, occupants: [9], detachee: true }, { id: 7, occupants: [5], detachee: false }])).toEqual([3]);
    expect(annexesARattacher({ occupants: [] }, [{ id: 3, occupants: [], detachee: true }])).toEqual([]);
  });
});
