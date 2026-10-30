import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { libellesNegociateurs, nomAffiche } from './nomNegociateur';
import type { Vente } from './modele';

/** 🔴 LOT CG (Arno, 31/10/2026) — « Prénom NOM » : le compte, sinon la fiche sans compte, sinon le libellé en prénom (jamais en majuscules). */
describe('🔴 LOT CG — nomAffiche', () => {
  it('compte : CEDRIC → Cédric JULLIEN ; fiche renseignée : CATHERINE → Catherine TARRISSE ; fiche sans nom : JULIEN → Julien, JEAN CLAUDE → Jean Claude', () => {
    expect(nomAffiche('CEDRIC', { prenom: 'Cédric', nom: 'Jullien' }, null)).toBe('Cédric JULLIEN');
    expect(nomAffiche('CATHERINE', null, { prenom: 'Catherine', nom: 'Tarrisse' })).toBe('Catherine TARRISSE');
    expect(nomAffiche('JULIEN', null, { prenom: null, nom: null })).toBe('Julien');
    expect(nomAffiche('JEAN CLAUDE', null, null)).toBe('Jean Claude');
    // le compte l'emporte sur la fiche
    expect(nomAffiche('PIERRE', { prenom: 'Pierre', nom: 'Thevenin' }, { prenom: 'X', nom: 'Y' })).toBe('Pierre THEVENIN');
  });

  it('les libellés d’un ensemble de ventes : lignes, parties, dossier, ligne miroir, rétrocessions', () => {
    const v = { lignes: [{ negociateur: 'CEDRIC', role: 'negociateur' }], repartition: { parties: [{ negociateur: 'Arnaud Jorel' }, { negociateur: null }] },
      dossier: { entree: { nom: 'Arnaud Jorel' }, sortie: { nom: 'Pierre Thevenin' } }, miroir: null } as unknown as Vente;
    expect(libellesNegociateurs([v], [{ negociateur: 'CATHERINE' } as never]).sort()).toEqual(['Arnaud Jorel', 'CATHERINE', 'CEDRIC', 'Pierre Thevenin']);
  });

  it('la route envoie la table aux deux vues (société, compromis) ; la commande pose le prénom et le nom (essai par défaut, journalisé) ; migration 445', () => {
    const route = readFileSync('app/(admin)/api/admin/transaction/route.ts', 'utf8');
    expect(route.match(/nomsAffichesNegociateurs\(libellesNegociateurs\(/g)?.length).toBe(2);
    const cli = readFileSync('app/scripts/transaction-statut-negociateur.ts', 'utf8');
    expect(cli).toContain("if (prenom !== null || nomFamille !== null) return nommer(argv, libelles, prenom, nomFamille, ecrire);");
    const repo = readFileSync('app/lib/transaction/statutSansCompte.ts', 'utf8');
    expect(repo).toContain("'nommer'");
    expect(repo).not.toMatch(/DELETE\s+FROM/i);
    expect(readFileSync('db/migrations/445_transaction_negociateur_nom.sql', 'utf8')).toContain('ADD COLUMN IF NOT EXISTS prenom text');
  });
});
