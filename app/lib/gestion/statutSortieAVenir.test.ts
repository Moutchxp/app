import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as historique from './historiqueBien';
import { estAncienLocataire, estLocataireEnPlace, locataireEnPlace, statutLocataire } from './historiqueBien';

/**
 * 🔴🔴 (Arno, 20/11/2026) LA RÈGLE DU STATUT EST CELLE D'AVANT LE COMMIT 8ecd8369 — « on ne va pas changer les règles pour un cas particulier
 * lié à un import ». Une date de sortie enregistrée, passée OU À VENIR, fait un « ancien locataire » ; seule une occupation sans date est en
 * place. Les destinataires des digicodes gardent leur propre condition d'avant (sans sortie, ou sortie après aujourd'hui). Ces épreuves
 * verrouillent ce retour : la règle « en place, sortie prévue le … » ne doit pas revenir sans une décision d'Arno.
 */
describe('statut du locataire : la règle d’avant 8ecd8369', () => {
  it('sortie passée, aujourd’hui, À VENIR : ancien locataire', () => {
    for (const sortie of ['2020-01-01', '2026-11-20', '2999-11-30']) {
      expect(estAncienLocataire({ sortie })).toBe(true);
      expect(statutLocataire([{ sortie }], false)).toBe('ancien');
      expect(statutLocataire([{ sortie }], true)).toBe('ancien');
    }
  });
  it('sans date de sortie : en place (ou en préavis)', () => {
    expect(estLocataireEnPlace({ sortie: null })).toBe(true);
    expect(estLocataireEnPlace({ sortie: '  ' })).toBe(true);
    expect(statutLocataire([{ sortie: null }], false)).toBe('en_place');
    expect(statutLocataire([{ sortie: null }], true)).toBe('en_preavis');
    expect(locataireEnPlace([{ sortie: '2999-11-30' }, { sortie: null }])).toBe(true);
  });
  it('la règle « sortie prévue le … » n’existe plus', () => {
    for (const nom of ['estAncienLocataireAu', 'estLocataireEnPlaceAu', 'sortiePrevue', 'motSortiePrevue', 'sqlOccupationEnPlace']) {
      expect(nom in historique).toBe(false);
    }
  });
});

describe('destinataires des digicodes : la condition d’avant 8ecd8369', () => {
  const src = readFileSync('app/lib/gestion/digicodesEnvoiRepo.ts', 'utf8').replace(/\s+/g, ' ');
  it('un locataire reste destinataire jusqu’au jour de sa sortie (sans sortie, ou sortie après aujourd’hui)', () => {
    expect(src).toContain('AND o.entree <= ${SQL_AUJOURDHUI_PARIS} AND (o.sortie IS NULL OR o.sortie > ${SQL_AUJOURDHUI_PARIS})');
    expect(src).not.toContain('sqlOccupationEnPlace');
  });
});
