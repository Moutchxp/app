import { describe, it, expect } from 'vitest';
import { executerRelancePartielle, type DepsRelancePartielle } from './cascadePartielleRepo';
import type { CibleComplement } from '../permis/demanderPiecesRepo';

/**
 * CASC-3 — orchestrateur de PRÉPARATION (envoi MANUEL verbatim). Testé PAR INJECTION : `envoyer` factice → AUCUN e-mail réel.
 * On vérifie : envoi AVANT journal, refus vide, refus sans message mairie, étape/rang relayés au journal.
 */
const cible = (over: Partial<CibleComplement> = {}): CibleComplement => ({
  demandeId: 154, destinataire: 'urba@mairie-aubervilliers.fr', messageId: '<m@mairie>', referencesBrut: null,
  from: 'contact@sansvisavis.com', profil: 'entreprise', recuLe: '2026-05-01T09:00:00Z', motifIndisponible: null, ...over,
});
function deps(over: Partial<DepsRelancePartielle> = {}): DepsRelancePartielle {
  return {
    lireCible: async () => cible(),
    envoyer: async () => ({ messageId: '<out@svav>' }),
    journaliser: async () => {},
    ...over,
  };
}
const arg = (over: Partial<{ demandeId: number; etape: 'relance' | 'annonce'; rang: number | null; objet: string; corps: string; auteur: string }> = {}) =>
  ({ demandeId: 154, etape: 'relance' as const, rang: 1, objet: 'Pièces manquantes — première relance', corps: 'Madame, Monsieur, …', auteur: 'admin:decision', ...over });

describe('CASC-3 — executerRelancePartielle (injection, aucun e-mail réel)', () => {
  it('envoi AVANT journal, retourne le messageId', async () => {
    const ordre: string[] = [];
    let journal: { etape: string; rang: number | null } | null = null;
    const r = await executerRelancePartielle(deps({
      envoyer: async () => { ordre.push('envoyer'); return { messageId: '<out@svav>' }; },
      journaliser: async (_d, etape, rang) => { ordre.push('journal'); journal = { etape, rang }; },
    }), arg());
    expect(r.ok).toBe(true);
    expect(r.messageId).toBe('<out@svav>');
    expect(ordre).toEqual(['envoyer', 'journal']);
    expect(journal).toEqual({ etape: 'relance', rang: 1 });
  });

  it('annonce : étape relayée au journal', async () => {
    let journal: { etape: string; rang: number | null } | null = null;
    await executerRelancePartielle(deps({ journaliser: async (_d, etape, rang) => { journal = { etape, rang }; } }),
      arg({ etape: 'annonce', rang: null, objet: 'Information CADA', corps: 'Madame, Monsieur, …' }));
    expect(journal).toEqual({ etape: 'annonce', rang: null });
  });

  it('objet ou corps vide → refus, AUCUN envoi', async () => {
    let envoye = false;
    const d = deps({ envoyer: async () => { envoye = true; return { messageId: 'x' }; } });
    expect((await executerRelancePartielle(d, arg({ corps: '   ' }))).ok).toBe(false);
    expect((await executerRelancePartielle(d, arg({ objet: '' }))).ok).toBe(false);
    expect(envoye).toBe(false);
  });

  it('aucun message de mairie (cible null) → refus, aucun envoi', async () => {
    let envoye = false;
    const r = await executerRelancePartielle(deps({ lireCible: async () => null, envoyer: async () => { envoye = true; return { messageId: 'x' }; } }), arg());
    expect(r.ok).toBe(false);
    expect(envoye).toBe(false);
  });

  it('expédition indisponible (motifIndisponible) → refus, aucun envoi', async () => {
    let envoye = false;
    const r = await executerRelancePartielle(deps({ lireCible: async () => cible({ motifIndisponible: 'expéditeur non répondable' }), envoyer: async () => { envoye = true; return { messageId: 'x' }; } }), arg());
    expect(r.ok).toBe(false);
    expect(envoye).toBe(false);
  });
});
