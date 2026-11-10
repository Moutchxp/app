import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (11/11/2026) — PLUS AUCUNE ADRESSE DE DESTINATAIRE DANS LE CODE : seules ses préférences (Paramètres Location › Destinataires mails)
 * décident. Liste « Nouvelles locations » vide ou absente = aucun destinataire proposé (la fenêtre le dit). Base simulée.
 */
let avecTable = true;
let lignes: { liste: unknown }[] = [];
vi.mock('../db/client', () => ({ query: vi.fn(async () => ({ rows: lignes })) }));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: vi.fn(async () => avecTable) }));
const { lireDestinatairesDefaut } = await import('./mailNouvelleLocationRepo');

beforeEach(() => { avecTable = true; lignes = []; });

describe('🔴 aucune liste de secours', () => {
  it('aucune liste enregistrée : aucun destinataire, pour les trois sortes', async () => {
    for (const s of ['nouvelle_location', 'preavis', 'sortie'] as const) expect(await lireDestinatairesDefaut(s)).toEqual([]);
  });
  it('sans la table des listes (base sans la 395) : aucun destinataire', async () => {
    avecTable = false;
    expect(await lireDestinatairesDefaut('nouvelle_location')).toEqual([]);
  });
  it('liste enregistrée vide : aucun destinataire ; liste enregistrée : exactement elle', async () => {
    lignes = [{ liste: [] }];
    expect(await lireDestinatairesDefaut('preavis')).toEqual([]);
    lignes = [{ liste: [{ adresse: 'partenaire@exemple.test', libelle: 'P' }] }];
    expect(await lireDestinatairesDefaut('nouvelle_location')).toEqual([{ adresse: 'partenaire@exemple.test', libelle: 'P' }]);
  });
  it('🔴 le code d’envoi ne porte aucune adresse de partenaire (ADHOC, MONGA)', () => {
    for (const f of ['app/lib/location/mailNouvelleLocationRepo.ts', 'app/lib/location/mailNouvelleLocation.ts', 'app/lib/location/mailsPreavisSortieRepo.ts']) {
      const code = readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n'); // hors commentaires
      expect(code, f).not.toMatch(/criterimmo@gmail|@monga\.io|DESTINATAIRES_DEFAUT/);
    }
  });
});
