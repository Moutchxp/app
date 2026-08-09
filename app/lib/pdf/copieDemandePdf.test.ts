import { describe, it, expect } from 'vitest';
import { composerCopieDemande, genererCopieDemandePdf, type CopieDemande } from './copieDemandePdf';

/** Nombre de pages (compte les objets /Page dans le flux) — même méthode que certificatPdf.test.ts. */
function nbPages(buf: Buffer): number {
  return (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

describe('X1 — composerCopieDemande : corps VERBATIM, aucune donnée inventée', () => {
  it('le corps est repris VERBATIM (dernier bloc, texte identique, retours à la ligne compris)', () => {
    const corps = 'Madame, Monsieur,\n\nPar la présente…\n\nSalutations.';
    const blocs = composerCopieDemande({ reference: 'SVAV-DEM-2026-000042', corps });
    const bloc = blocs.find((b) => b.role === 'corps');
    expect(bloc?.texte).toBe(corps); // ni tronqué ni reformaté
  });

  it('champs non fournis → NON imprimés (destinataire / date d’envoi absents)', () => {
    const blocs = composerCopieDemande({ reference: 'R1', corps: 'x' });
    const entetes = blocs.filter((b) => b.role === 'entete').map((b) => b.texte);
    expect(entetes).toEqual(['Référence : R1']); // aucune ligne « Destinataire »/« Envoyée le »
    expect(blocs.some((b) => b.texte.includes('Destinataire'))).toBe(false);
    expect(blocs.some((b) => b.texte.includes('Envoyée le'))).toBe(false);
  });

  it('champs fournis → imprimés (référence + destinataire + date d’envoi)', () => {
    const d: CopieDemande = { reference: 'R2', destinataire: 'urba@mairie.fr', dateEnvoi: '2026-03-14', corps: 'x' };
    const entetes = composerCopieDemande(d).filter((b) => b.role === 'entete').map((b) => b.texte);
    expect(entetes).toEqual(['Référence : R2', 'Destinataire : urba@mairie.fr', 'Envoyée le : 2026-03-14']);
  });

  it('valeurs vides/espaces → traitées comme absentes (pas de ligne vide inventée)', () => {
    const entetes = composerCopieDemande({ reference: 'R3', destinataire: '   ', dateEnvoi: '', corps: 'x' }).filter((b) => b.role === 'entete');
    expect(entetes.map((b) => b.texte)).toEqual(['Référence : R3']);
  });
});

describe('X1 — genererCopieDemandePdf : PDF valide, multi-pages', () => {
  it('PDF valide (%PDF… %%EOF), non vide', async () => {
    const buf = await genererCopieDemandePdf({ reference: 'SVAV-DEM-2026-000042', destinataire: 'urba@mairie.fr', dateEnvoi: '2026-03-14', corps: 'Corps court.' });
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.subarray(-6).toString()).toContain('%%EOF');
    expect(nbPages(buf)).toBe(1);
  });

  it('corps LONG → plusieurs pages (pagination automatique du flux)', async () => {
    const corpsLong = Array.from({ length: 400 }, (_, i) => `Ligne ${i} du corps de la demande de communication.`).join('\n');
    const buf = await genererCopieDemandePdf({ reference: 'SVAV-DEM-2026-000042', corps: corpsLong });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(nbPages(buf)).toBeGreaterThan(1);
  });
});
