import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Lecture des coordonnées connues (lot COORDONNEES-CONNU). PROUVE : consentement « valable » = accordé sur la version
 * COURANTE du texte ; adresse de résidence = la dernière SAISIE par l'internaute (réponse « Non »), jamais une adresse
 * analysée ; tout est scopé par l'id passé.
 */
const { query, lireCompte } = vi.hoisted(() => ({ query: vi.fn(), lireCompte: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ query }));
vi.mock('./espace', () => ({ lireCompte }));

import { lireCoordonneesTunnel } from './coordonneesTunnel';
import { texteCourant } from './textesConsentement';

const sqlDe = (i: number) => String(query.mock.calls[i][0]).replace(/\s+/g, ' ');

describe('lireCoordonneesTunnel', () => {
  beforeEach(() => {
    query.mockReset(); lireCompte.mockReset();
    lireCompte.mockResolvedValue({ prenom: 'Arno', nom: 'Essai', email: 'a@example.com', telephone: null });
  });

  it('consentement valable seulement sur la version courante ; résidence = dernière saisie', async () => {
    const vF1 = texteCourant('recontact_interne')!.version;
    query
      .mockResolvedValueOnce({ rows: [{ finalite: 'recontact_interne', version: vF1 }, { finalite: 'email_marketing', version: -1 }] })
      .mockResolvedValueOnce({ rows: [{ adresse: ' 1 rue de la Paix 75002 Paris ' }] });
    const c = await lireCoordonneesTunnel('uuid-1');
    expect(c).toEqual({
      prenom: 'Arno', nom: 'Essai', email: 'a@example.com', telephone: null,
      consentementsValables: ['recontact_interne'], derniereResidence: '1 rue de la Paix 75002 Paris',
    });
    expect(lireCompte).toHaveBeenCalledWith('uuid-1');
    for (const call of query.mock.calls) expect(call[1]).toEqual(['uuid-1']);
  });

  it('les consentements lus sont l’état COURANT accordé (vue append-only)', async () => {
    query.mockResolvedValue({ rows: [] });
    await lireCoordonneesTunnel('uuid-1');
    expect(sqlDe(0)).toContain('FROM internaute_consentement_actif ca');
    expect(sqlDe(0)).toContain('ca.actif = true');
  });

  it('résidence : uniquement l’adresse SAISIE à une réponse « Non », jamais une adresse analysée', async () => {
    query.mockResolvedValue({ rows: [] });
    const c = await lireCoordonneesTunnel('uuid-1');
    expect(sqlDe(1)).toContain("payload->>'adresseResidence'");
    expect(sqlDe(1)).toContain('residence_principale = false');
    expect(sqlDe(1)).not.toContain('adresse_normalisee');
    expect(sqlDe(1)).not.toContain('adresse_saisie');
    expect(c.derniereResidence).toBeNull();
  });
});
