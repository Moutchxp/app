import { describe, it, expect, vi, beforeEach } from 'vitest';

// Lot A — LECTURE SEULE : `lireBaseCommune` lit la fiche contact d'une commune par code INSEE et la mappe en BaseCommune. On
//   teste le COMPORTEMENT (mapping, cas « sans contact », commune inconnue, paramètre LIÉ), jamais la forme du SQL. `query` mocké.
vi.mock('../db/client', () => ({ query: vi.fn() }));
import { query } from '../db/client';
import { lireBaseCommune } from './communeContactRepo';

const q = query as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => q.mockReset());

// Ligne SQL brute (snake_case) telle que renvoyée par pg ; `o` surcharge les colonnes utiles au cas testé.
const ligne = (o: Record<string, unknown> = {}) => ({
  code_insee: '75056', commune_nom: 'Paris',
  dest_email: null, dest_statut: null, dest_source: null, dest_canal: null, dest_url_formulaire: null, dest_adresse_postale: null,
  dest_telephone: null, dest_responsable_nom: null, dest_protocole_verifie_le: null, dest_telephone_standard: null, dest_email_type: null,
  dest_protocole_source: null, dest_note: null,
  prada_courriel: null, prada_nom: null, prada_prenom: null, prada_adresse: null, prada_millesime: null, prada_statut: null, prada_origine: null, prada_rapprochement: null,
  ...o,
});

describe('lireBaseCommune — lecture de la fiche contact par code INSEE', () => {
  it('commune inconnue (aucune ligne) → null', async () => {
    q.mockResolvedValueOnce({ rows: [] });
    expect(await lireBaseCommune('99999')).toBeNull();
  });

  it('lie le code INSEE en paramètre (jamais interpolé dans le SQL)', async () => {
    q.mockResolvedValueOnce({ rows: [ligne()] });
    await lireBaseCommune('92050');
    expect(q.mock.calls[0][1]).toEqual(['92050']);
  });

  it('commune SANS contact → BaseCommune avec le nom et tous les dest* à null (cas « communes sans adresse »)', async () => {
    q.mockResolvedValueOnce({ rows: [ligne({ code_insee: '93066', commune_nom: 'Saint-Denis' })] });
    expect(await lireBaseCommune('93066')).toMatchObject({
      codeInsee: '93066', communeNom: 'Saint-Denis', destCanal: null, destEmail: null, destUrlFormulaire: null, destPradaNom: null,
    });
  });

  it('mappe le contact + PRADA complets (canal, e-mail, protocole, note, nom PRADA composé)', async () => {
    q.mockResolvedValueOnce({ rows: [ligne({
      dest_email: 'urbanisme@paris.fr', dest_statut: 'confirme', dest_source: 'saisie_manuelle', dest_canal: 'email',
      dest_url_formulaire: 'https://teleservice.paris.fr', dest_adresse_postale: 'BASU', dest_telephone: '0140', dest_responsable_nom: 'C. Chenel',
      dest_protocole_verifie_le: '2026-08-03', dest_telephone_standard: '3975', dest_email_type: 'urbanisme', dest_protocole_source: 'https://paris.fr/urba', dest_note: 'RAS',
      prada_courriel: 'prada@paris.fr', prada_nom: 'DUPONT', prada_prenom: 'Jean', prada_adresse: '1 rue X', prada_millesime: '2026-07', prada_statut: 'presume', prada_origine: 'annuaire_cada', prada_rapprochement: 'automatique',
    })] });
    expect(await lireBaseCommune('75056')).toEqual({
      codeInsee: '75056', communeNom: 'Paris',
      destCanal: 'email', destEmail: 'urbanisme@paris.fr', destUrlFormulaire: 'https://teleservice.paris.fr', destAdressePostale: 'BASU',
      destTelephone: '0140', destResponsableNom: 'C. Chenel', destProtocoleVerifieLe: '2026-08-03',
      destTelephoneStandard: '3975', destEmailType: 'urbanisme', destNote: 'RAS',
      destStatut: 'confirme', destSource: 'saisie_manuelle', destProtocoleSource: 'https://paris.fr/urba',
      destPradaCourriel: 'prada@paris.fr', destPradaNom: 'Jean DUPONT', destPradaAdresse: '1 rue X', destPradaMillesime: '2026-07',
      destPradaStatut: 'presume', destPradaOrigine: 'annuaire_cada', destPradaRapprochement: 'automatique',
    });
  });

  it('nom PRADA : prénom seul → prénom ; nom seul → nom ; les deux vides → null', async () => {
    q.mockResolvedValueOnce({ rows: [ligne({ prada_prenom: 'Jean', prada_nom: '  ' })] });
    expect((await lireBaseCommune('75056'))?.destPradaNom).toBe('Jean');
    q.mockResolvedValueOnce({ rows: [ligne({ prada_prenom: null, prada_nom: 'DUPONT' })] });
    expect((await lireBaseCommune('75056'))?.destPradaNom).toBe('DUPONT');
    q.mockResolvedValueOnce({ rows: [ligne({ prada_prenom: '', prada_nom: null })] });
    expect((await lireBaseCommune('75056'))?.destPradaNom).toBeNull();
  });
});
