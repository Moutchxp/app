import { describe, it, expect } from 'vitest';
import { estReponse, type CandidatRepondu, type SortantEntete } from './preCochageRepondu';

/**
 * T7-C — logique PURE du pré-cochage : un sortant est une réponse SSI fil (In-Reply-To/References ⊇ Message-ID mairie) ET
 * destinataire (To/Cc ⊇ adresse mairie). En cas de doute → false (jamais un marquage).
 */
const MID = '<abc-154@mairie-x.fr>';
const CAND: CandidatRepondu = { reponseId: 7, messageId: MID, mairieAdresse: 'urba@mairie-x.fr', recuLe: new Date('2026-08-12T09:00:00Z') };
const sortant = (over: Partial<SortantEntete> = {}): SortantEntete => ({ inReplyTo: MID, references: [], destinataires: ['urba@mairie-x.fr'], ...over });

describe('T7-C — estReponse : fil ET destinataire mairie', () => {
  it('fil (In-Reply-To) + destinataire mairie → true (pré-cochage légitime)', () => {
    expect(estReponse(CAND, sortant())).toBe(true);
  });

  it('fil porté par References (pas In-Reply-To) + destinataire → true', () => {
    expect(estReponse(CAND, sortant({ inReplyTo: null, references: ['<autre@x>', MID] }))).toBe(true);
  });

  it('chevrons et casse du domaine ignorés (normalisation Message-ID)', () => {
    expect(estReponse(CAND, sortant({ inReplyTo: 'abc-154@MAIRIE-X.FR' }))).toBe(true);
    expect(estReponse(CAND, sortant({ destinataires: ['URBA@Mairie-X.fr'] }))).toBe(true);
  });

  it('TRANSFERT À UN TIERS : fil correct mais To/Cc SANS la mairie → false (faux positif écarté)', () => {
    expect(estReponse(CAND, sortant({ destinataires: ['tiers@autre.fr'] }))).toBe(false);
  });

  it('destinataire mairie mais AUCUN fil (nouveau message) → false', () => {
    expect(estReponse(CAND, sortant({ inReplyTo: null, references: [] }))).toBe(false);
    expect(estReponse(CAND, sortant({ inReplyTo: '<sans-rapport@x>', references: ['<autre@x>'] }))).toBe(false);
  });

  it('destinataire en Cc (pas To) suffit s’il y a le fil', () => {
    expect(estReponse(CAND, sortant({ destinataires: ['autre@x', 'urba@mairie-x.fr'] }))).toBe(true);
  });

  it('Message-ID mairie vide OU adresse mairie vide → false (jamais un marquage dans le doute)', () => {
    expect(estReponse({ ...CAND, messageId: '' }, sortant())).toBe(false);
    expect(estReponse({ ...CAND, mairieAdresse: '' }, sortant())).toBe(false);
  });
});
