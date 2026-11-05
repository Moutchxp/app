import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { issueSortie, verifierSortie } from './sortieLocataires';
import { estLocataireEnPlace } from '../gestion/historiqueBien';

/**
 * 🔴 Arno (05/11/2026) — LE LOGEMENT LIBRE AU JOUR DU DÉPART : vérifié et VERROUILLÉ.
 *   · un PRÉAVIS ne change JAMAIS l'occupation (le locataire reste occupant, en bleu ; le logement reste loué) ;
 *   · une sortie PARTIELLE : le logement reste loué aux autres ;
 *   · la sortie du DERNIER locataire : le logement devient libre (« vacant ») ;
 *   · la date de sortie ne peut PAS être dans le futur (règle du 18-19/10/2026 : « enregistrez plutôt un préavis ») — un logement ne passe
 *     donc jamais « libre » avant la date de départ réelle.
 */
const BAIL = { locataires: [{ occupationId: 11, locataireId: 1, nom: 'ALICE', entree: '2022-09-01' }, { occupationId: 12, locataireId: 2, nom: 'PAUL', entree: '2022-09-01' }],
  autresOccupants: [] as string[] };

describe('le statut du logement', () => {
  it('🔴 le préavis n’écrit JAMAIS l’occupation (aucune date de sortie posée par un préavis)', () => {
    const src = readFileSync('app/lib/location/preavisRepo.ts', 'utf8');
    expect(src).not.toMatch(/UPDATE gestion_annuaire_occupation SET[^`]*?\bsortie\s*=/);
    expect(src).not.toMatch(/ecrireDateSortie/);
    expect(src).toContain('LE PRÉAVIS NE TOUCHE JAMAIS L\'OCCUPATION');
    // Un locataire en préavis n'a pas de date de sortie : il est EN PLACE.
    expect(estLocataireEnPlace({ sortie: null })).toBe(true);
  });
  it('sortie PARTIELLE : le logement reste loué aux autres', () => {
    expect(issueSortie(BAIL, [11])).toEqual({ vacant: false, restants: ['PAUL'] });
  });
  it('sortie du DERNIER locataire en place : le logement devient libre', () => {
    expect(issueSortie(BAIL, [11, 12])).toEqual({ vacant: true, restants: [] });
    expect(estLocataireEnPlace({ sortie: '2026-11-05' })).toBe(false);
  });
  it('🔴 une date de sortie dans le FUTUR est refusée (jamais « libre » avant le départ réel) ; aujourd’hui : acceptée', () => {
    expect(verifierSortie(BAIL, [11, 12], '2026-11-06', '2026-11-05')).toEqual({ ok: false, motif: 'La date de sortie ne peut pas être dans le futur : enregistrez plutôt un préavis.' });
    expect(verifierSortie(BAIL, [11, 12], '2026-11-05', '2026-11-05')).toEqual({ ok: true });
  });
});
