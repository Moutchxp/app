import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { estAncienLocataireAu, estLocataireEnPlaceAu, locataireEnPlace, motSortiePrevue, sortiePrevue, sqlOccupationEnPlace, statutLocataire } from './historiqueBien';

/**
 * 🔴🔴 Arno (20/11/2026 — « EMMAIMA Fathi », 4 square Léon Blum : une sortie WIPPIMMO au 30/11/2026 le faisait « ancien » dès le 20/10) — UNE SEULE RÈGLE :
 * « ancien » seulement si la date de sortie est PASSÉE (le jour même compris, comme le mail de digicode), comparée à aujourd'hui en date de Paris ;
 * avant : « en place, sortie prévue le JJ/MM/AAAA ».
 */
const AUJ = '2026-11-20';
describe('la règle, à une date donnée', () => {
  it.each([
    ['sortie passée', '2026-11-03', true],
    ['sortie aujourd’hui (le jour même : parti)', '2026-11-20', true],
    ['sortie à venir', '2026-11-30', false],
    ['sans date', null, false],
    ['date vide', '  ', false],
    ['date abîmée (illisible) : un départ', 'bientôt', true],
  ])('%s → ancien : %s', (_mot, sortie, ancien) => {
    expect(estAncienLocataireAu({ sortie }, AUJ)).toBe(ancien);
    expect(estLocataireEnPlaceAu({ sortie }, AUJ)).toBe(!ancien);
  });
  it('le statut de la fiche suit : sortie à venir → en place ; passée → ancien ; un bail à venir à côté d’un bail fini → en place', () => {
    expect(statutLocataire([{ sortie: '2026-11-30' }], false, AUJ)).toBe('en_place');
    expect(statutLocataire([{ sortie: '2026-11-30' }], true, AUJ)).toBe('en_preavis');
    expect(statutLocataire([{ sortie: '2026-11-03' }], false, AUJ)).toBe('ancien');
    expect(locataireEnPlace([{ sortie: '2024-01-31' }, { sortie: '2026-11-30' }], AUJ)).toBe(true);
  });
});

describe('« en place, sortie prévue le … »', () => {
  it('toutes les occupations en place ont une sortie à venir : la plus tardive ; un bail sans date ou parti : aucune', () => {
    expect(sortiePrevue([{ sortie: '2026-11-30' }], AUJ)).toBe('2026-11-30');
    expect(sortiePrevue([{ sortie: '2026-11-30' }, { sortie: '2027-01-15' }], AUJ)).toBe('2027-01-15');
    expect(sortiePrevue([{ sortie: '2026-11-30' }, { sortie: null }], AUJ)).toBeNull();
    expect(sortiePrevue([{ sortie: '2026-11-03' }], AUJ)).toBeNull();
    expect(sortiePrevue([{ sortie: null }], AUJ)).toBeNull();
    expect(motSortiePrevue('2026-11-30')).toBe('sortie prévue le 30/11/2026');
    expect(motSortiePrevue(null)).toBe('');
  });
});

describe('une seule règle, aussi en SQL', () => {
  it('le mail de digicode lit la règle partagée (sortie absente ou à venir, date de Paris)', () => {
    expect(sqlOccupationEnPlace('o')).toBe("(o.sortie IS NULL OR o.sortie > (now() AT TIME ZONE 'Europe/Paris')::date)");
    expect(readFileSync('app/lib/gestion/digicodesEnvoiRepo.ts', 'utf8')).toContain("${sqlOccupationEnPlace('o')}");
  });
});
