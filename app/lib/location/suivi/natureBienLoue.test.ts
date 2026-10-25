import { describe, expect, it } from 'vitest';
import { LIBELLE_NATURE_BIEN, NATURES_BIEN, natureBienLoue } from './tableauBord';
import { origineApresCases, ORIGINES_CONTACT, type OrigineContact } from './suivi';

/**
 * 🔴 Arno (24/10/2026) — la pastille « BIEN » de la feuille du mois : d'où vient le bien loué. Ordre : Relocation gestion > Client
 * hors gestion > à qualifier (origine à renseigner) > Nouveau · gestion / Nouveau · sans gestion. (25/10/2026 : renommés Relocation sans
 * gestion, À qualifier, Nouvelle gestion, Nouveau sans gestion ; l'ordre d'affichage : `NATURES_BIEN`.)
 */
const l = (origineContact: OrigineContact | null, avecGestion: boolean, mandatGestion: boolean) => ({ origineContact, avecGestion, mandatGestion });

describe('🔴 la nature du bien loué', () => {
  it('les cinq catégories, leurs libellés', () => {
    // 🔴 Arno (25/10/2026) — nouvel ordre, nouveaux libellés ; les valeurs internes ne changent pas.
    expect(NATURES_BIEN.map((n) => LIBELLE_NATURE_BIEN[n])).toEqual(['Nouvelle gestion', 'Relocation gestion', 'Nouveau sans gestion', 'Relocation sans gestion', 'À qualifier']);
    expect([...NATURES_BIEN]).toEqual(['nouveau_gestion', 'relocation', 'nouveau_sans_gestion', 'client_hors_gestion', 'a_qualifier']);
  });
  it('a. Relocation gestion : la case « Relocation » cochée (origine Relocation)', () => {
    expect(natureBienLoue(l('relocation', true, false))).toEqual({ nature: 'relocation', raison: 'case « Relocation » cochée (portefeuille de gestion)' });
    // la case impose l'origine, exactement comme la saisie
    expect(natureBienLoue(l(origineApresCases({ origine: null, auto: false, avecGestion: true, mandatGestion: false, dejaClient: true }).origine, true, false)).nature).toBe('relocation');
  });
  it('b. Relocation sans gestion (ex « Client hors gestion ») : propriétaire déjà client ET bien sans gestion', () => {
    expect(natureBienLoue(l('proprietaire_deja_client', false, false))).toEqual({ nature: 'client_hors_gestion', raison: 'propriétaire déjà client, bien sans gestion' });
  });
  it('c. Nouvelle gestion : origine renseignée, bien en gestion (ventilation « avec gestion » ou nouveau mandat)', () => {
    expect(natureBienLoue(l('apporteur', true, false))).toEqual({ nature: 'nouveau_gestion', raison: 'nouveau client, bien en gestion' });
    expect(natureBienLoue(l('internet', false, true))).toEqual({ nature: 'nouveau_gestion', raison: 'nouveau client, nouveau mandat de gestion signé (prime)' });
  });
  it('d. Nouveau sans gestion : origine renseignée, bien sans gestion', () => {
    expect(natureBienLoue(l('collegue', false, false))).toEqual({ nature: 'nouveau_sans_gestion', raison: 'nouveau client, bien sans gestion' });
  });
  it('e. À qualifier : pas de Relocation et origine à renseigner — même en gestion, on ne devine rien', () => {
    for (const [ag, mg] of [[false, false], [true, false], [false, true], [true, true]] as const) {
      expect(natureBienLoue(l(null, ag, mg))).toEqual({ nature: 'a_qualifier', raison: 'origine du contact à renseigner' });
    }
    expect(natureBienLoue({ origineContact: undefined, avecGestion: true, mandatGestion: false }).nature).toBe('a_qualifier');
  });

  describe('cas limites', () => {
    it('déjà client + nouvelle gestion → Nouvelle gestion (et la raison le dit)', () => {
      expect(natureBienLoue(l('proprietaire_deja_client', false, true)))
        .toEqual({ nature: 'nouveau_gestion', raison: 'propriétaire déjà client, nouveau bien confié en gestion, nouveau mandat de gestion signé (prime)' });
    });
    it('Relocation gestion l’emporte sur tout', () => {
      for (const [ag, mg] of [[false, false], [true, false], [false, true], [true, true]] as const) expect(natureBienLoue(l('relocation', ag, mg)).nature).toBe('relocation');
    });
    it('« avec gestion » seul (ligne reprise de l’Excel) n’est PAS la case Relocation : il faut l’origine', () => {
      expect(natureBienLoue(l('apporteur', true, false)).nature).toBe('nouveau_gestion');
      expect(natureBienLoue(l(null, true, false)).nature).toBe('a_qualifier');
    });
    it('toute autre origine renseignée tombe en « Nouveau · … »', () => {
      for (const o of ORIGINES_CONTACT.filter((x) => x !== 'relocation' && x !== 'proprietaire_deja_client')) {
        expect(natureBienLoue(l(o, true, false)).nature).toBe('nouveau_gestion');
        expect(natureBienLoue(l(o, false, false)).nature).toBe('nouveau_sans_gestion');
      }
    });
  });
});
