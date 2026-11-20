import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 🔴🔴 Arno (20/11/2026, lot 7c) — l'aperçu du mail « Nouvelle location » : l'adresse d'une personne est son adresse OFFICIELLE quand elle existe, le texte
 * sinon ; les DESTINATAIRES du mail ne dépendent pas de l'adresse postale (ils viennent de la liste confirmée dans la fenêtre).
 */
vi.mock('../db/client', () => ({ query: async () => ({ rows: [] }), withTransaction: async () => undefined }));
const { personneDuMail } = await import('./mailNouvelleLocationRepo');
const { listeProposee } = await import('./mailNouvelleLocation');

const LIGNE = { civilite: 'M.', nom: 'DUPONT', prenom: 'Jean', qualite: null, adresse: '1 villa des lilas', code_postal: '92400', commune: 'COURBEVOIE', note: null };

describe('l’adresse d’une personne dans le mail', () => {
  it('avec une adresse officielle : le libellé officiel (« 1 villa des Lilas, 92400 Courbevoie ») ; sans : le texte tel qu’il est enregistré', () => {
    expect(personneDuMail(LIGNE, [], { libelle: '1 villa des Lilas, 92400 Courbevoie' }).adresse).toBe('1 villa des Lilas, 92400 Courbevoie');
    expect(personneDuMail(LIGNE, []).adresse).toBe('1 villa des lilas, 92400 COURBEVOIE');
  });
  it('aucun envoi ne change de destinataire : la liste proposée et l’envoi ne lisent jamais l’adresse postale d’une personne', () => {
    expect(listeProposee.length).toBeGreaterThanOrEqual(1);
    const repo = readFileSync('app/lib/location/mailNouvelleLocationRepo.ts', 'utf8');
    expect(repo).toContain('a: v.liste.map((x) => x.adresse)');
    const envoi = repo.slice(repo.indexOf('export async function envoyerNouvelleLocation'));
    expect(envoi.slice(0, envoi.indexOf('\n}\n'))).not.toMatch(/adressesOfficielles|adresse_postale|libelle_officiel/);
    const portefeuille = readFileSync('app/lib/location/mailPortefeuilleRepo.ts', 'utf8');
    expect(portefeuille.slice(portefeuille.indexOf('export async function destinatairesDe'), portefeuille.indexOf('export async function destinatairesDe') + 1500)).not.toMatch(/adressesOfficielles/);
  });
});
