import { describe, it, expect, vi } from 'vitest';
import { executerDemandePieces, type DepsDemandePieces, type CibleComplement } from './demanderPiecesRepo';

/**
 * PART-3a — orchestrateur du geste « demander les pièces manquantes » (par INJECTION : aucun SMTP, aucune base, aucun e-mail réel).
 */
const cible = (over: Partial<CibleComplement> = {}): CibleComplement => ({
  demandeId: 154, numDau: '0930012500081', destinataire: 'lauriane.pangui@mairie-aubervilliers.fr', deNom: 'Lauriane Pangui',
  messageId: '<abc@mairie-aubervilliers.fr>', referencesBrut: '<x@svav.com>', from: 'contact@sansvisavis.com', profil: 'entreprise',
  motifIndisponible: null, ...over,
});

function makeDeps(over: Partial<DepsDemandePieces> = {}): DepsDemandePieces {
  return {
    lireCible: vi.fn(async () => cible()),
    envoyer: vi.fn(async (_c: CibleComplement, _o: string, _co: string) => { void _c; void _o; void _co; return { messageId: '<envoye@svav.com>' }; }),
    journaliser: vi.fn(async (_d: number, _m: string, _a: string) => { void _d; void _m; void _a; }),
    ...over,
  };
}

describe('executerDemandePieces', () => {
  it('aucune famille cochée → refusé, aucun envoi', async () => {
    const deps = makeDeps();
    const r = await executerDemandePieces(deps, { dossierId: 7424, familles: [], auteur: 'admin:decision' });
    expect(r.ok).toBe(false);
    expect(deps.envoyer).not.toHaveBeenCalled();
  });

  it('adresse no-reply (motif indisponible) → refusé avec motif, aucun envoi', async () => {
    const deps = makeDeps({ lireCible: vi.fn(async () => cible({ motifIndisponible: 'adresse non répondable' })) });
    const r = await executerDemandePieces(deps, { dossierId: 7424, familles: ['cerfa'], auteur: 'admin:decision' });
    expect(r).toEqual({ ok: false, motif: 'adresse non répondable' });
    expect(deps.envoyer).not.toHaveBeenCalled();
  });

  it('aucun message de mairie (cible null) → refusé', async () => {
    const deps = makeDeps({ lireCible: vi.fn(async () => null) });
    expect((await executerDemandePieces(deps, { dossierId: 7424, familles: ['cerfa'], auteur: 'a' })).ok).toBe(false);
  });

  it('OK : envoie le corps ne citant QUE les familles cochées, PUIS journalise (envoi avant journal)', async () => {
    const ordre: string[] = [];
    let cibleEnvoyee: CibleComplement | null = null;
    let corpsEnvoye = '';
    let demandeJournalisee = 0;
    const deps = makeDeps({
      envoyer: async (c, _o, corps) => { ordre.push('envoyer'); cibleEnvoyee = c; corpsEnvoye = corps; return { messageId: '<m@svav.com>' }; },
      journaliser: async (d) => { ordre.push('journal'); demandeJournalisee = d; },
    });
    const r = await executerDemandePieces(deps, { dossierId: 7424, familles: ['cerfa'], auteur: 'admin:decision' });
    expect(r.ok).toBe(true);
    expect(r.destinataire).toBe('lauriane.pangui@mairie-aubervilliers.fr');
    expect(ordre).toEqual(['envoyer', 'journal']); // envoi AVANT journal
    expect(corpsEnvoye).toContain('formulaire Cerfa');
    expect(corpsEnvoye).not.toContain('plan de masse');
    expect(cibleEnvoyee!.messageId).toBe('<abc@mairie-aubervilliers.fr>'); // fil = dernier message reçu
    expect(demandeJournalisee).toBe(154);
  });
});
