import { describe, it, expect } from 'vitest';
import { adressesEnAttente, biensAutomatiques, clesDuContexte, recalculerCibles, type BiensDesClients } from './contexteClients';
import {
  motifBienCoche, MOTIF_AJOUT_MANUEL_SANS_CLIENT, MOTIF_AJOUT_RECHERCHE, MOTIF_DEJA_RATTACHE, MOTIF_DEPUIS_LA_FICHE,
} from './motifBienRattache';

/**
 * ══ 🔴🔴 LOT PARTENAIRE-INTERNE-JAMAIS-UNE-CLE (Arno, 26/10/2026) ══════════════════════════════════════════════════════
 * Un Nouveau message à « Service Gestion » (gestion.criterimmo@gmail.com, ADHOC) arrivait « Rattaché · 1 logement » (JOYCE,
 * lot 281). La lecture des biens d'une adresse (`biensDesClients`) rend désormais `[]` pour un partenaire interne (épreuve
 * dans `biensDesClientsRepo.test.ts`) ; ici, ce que le COMPOSEUR en fait, par ses règles pures existantes. PUR.
 */
const JOYCE = { lotId: 64, cle: '281', libelle: '54 avenue Puvis de Chavannes, 92400 COURBEVOIE — lot 281', categorie: 'logement' as const };
const ADHOC = 'gestion.criterimmo@gmail.com';

describe('R2 — le partenaire interne seul : rien d’office, rien en attente', () => {
  const lus: BiensDesClients = { [ADHOC]: [] };
  it('aucun bien n’entre d’office, le bouton ne pulse pas', () => {
    expect(biensAutomatiques([ADHOC], lus, new Set(), new Set())).toEqual([]);
    expect(adressesEnAttente([ADHOC], lus, new Set(), { actif: true, refuses: new Set() })).toEqual([]);
  });
  it('un brouillon d’avant la correction qui porte JOYCE amené par ADHOC se remet d’aplomb : le bien part', () => {
    const r = recalculerCibles([{ sorte: 'lot', cle: '281', origine: 'client' as const }], [ADHOC], lus);
    expect(r.cibles).toEqual([]);
    expect(r.retirees.map((c) => c.cle)).toEqual(['281']);
  });
});

describe('R2 — transparent quand un extérieur est présent', () => {
  const lus: BiensDesClients = { [ADHOC]: [], 'locataire@x.fr': [{ ...JOYCE, role: 'locataire', nom: 'ELIAS Gaelle' }] };
  it('le bien du locataire entre d’office, amené par le locataire — et par lui seul', () => {
    expect(biensAutomatiques([ADHOC, 'locataire@x.fr'], lus, new Set(), new Set()))
      .toEqual([{ bien: { ...JOYCE, role: 'locataire', nom: 'ELIAS Gaelle' }, adresse: 'locataire@x.fr' }]);
  });
  it('le locataire retiré, le bien part avec lui : ADHOC ne le retient pas', () => {
    const r = recalculerCibles([{ sorte: 'lot', cle: '281', origine: 'client' as const }], [ADHOC], lus);
    expect(clesDuContexte(r.cibles).size).toBe(0);
  });
});

describe('R3 — la raison écrite à côté d’un bien coché', () => {
  const base = { clesClients: new Set<string>(), clesDeBase: new Set(['281']), clesDeFiche: new Set(['281']) };
  it('le bien de la fiche : « rattaché car écrit depuis la fiche du bien », quel que soit le destinataire', () => {
    expect(motifBienCoche({ cle: '281', origine: 'deja', ...base })).toBe(MOTIF_DEPUIS_LA_FICHE);
    expect(motifBienCoche({ cle: '281', origine: 'deja', ...base, clesClients: new Set(['281']) })).toBe(MOTIF_DEPUIS_LA_FICHE);
    expect(MOTIF_DEPUIS_LA_FICHE).toBe('rattaché car écrit depuis la fiche du bien');
  });
  it('les autres mentions, au mot près, comme avant', () => {
    expect(motifBienCoche({ cle: '9', origine: 'attente', motifAttente: 'locataire de ce bien', ...base })).toBe('locataire de ce bien');
    expect(motifBienCoche({ cle: '9', origine: 'deja', ...base })).toBe(MOTIF_AJOUT_MANUEL_SANS_CLIENT);
    expect(motifBienCoche({ cle: '9', origine: 'recherche', ...base, clesClients: null })).toBe(MOTIF_AJOUT_RECHERCHE);
    expect(motifBienCoche({ cle: '281', origine: 'deja', clesClients: null, clesDeBase: null, clesDeFiche: null })).toBe(MOTIF_DEJA_RATTACHE);
    /* Réponse héritée (bien de base, pas de fiche) : « déjà rattaché », jamais « manuel ». */
    expect(motifBienCoche({ cle: '281', origine: 'deja', clesClients: new Set(), clesDeBase: new Set(['281']), clesDeFiche: null }))
      .toBe(MOTIF_DEJA_RATTACHE);
  });
});
