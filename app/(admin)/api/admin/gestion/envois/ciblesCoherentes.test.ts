import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ══ 🔴🔴 LOT RATTACHEMENT-BIENS-SUIT-LES-ADRESSES — LE FILET DE L'ENVOI, CÔTÉ SERVEUR ══════════════════════════════════
 * La route relit les biens des destinataires et écarte tout bien amené par une adresse absente ; un ajout manuel ne
 * part que confirmé ; la base passe. Les biens des destinataires sont doublés (la vraie lecture est éprouvée en base
 * par le parcours en transaction annulée, au compte rendu du lot).
 */
vi.mock('server-only', () => ({}));
const biensDesClients = vi.fn();
vi.mock('../../../../../lib/gestion/biensDesClientsRepo', () => ({ biensDesClients: (...a: unknown[]) => biensDesClients(...a) }));
const { ciblesCoherentes, ciblesDemandees } = await import('./route');

const b = (cle: string) => ({ lotId: Number(cle), cle, libelle: `lot ${cle}`, categorie: 'logement', role: 'proprietaire', nom: null });
beforeEach(() => {
  biensDesClients.mockReset().mockResolvedValue({ 'seul@x.fr': [b('900')], 'multi@x.fr': [b('432'), b('433')] });
});

describe('ciblesCoherentes — juste avant l’envoi', () => {
  it('🔴 le scénario d’Arno : le bien du multipropriétaire PARTI est écarté, celui du propriétaire présent gardé', async () => {
    const cibles = ciblesDemandees([
      { sorte: 'lot', cle: '432', id: 432, libelle: '1bis rue Manessier — lot 432', origine: 'client' },
      { sorte: 'lot', cle: '900', id: 900, libelle: 'lot 900', origine: 'client' },
    ]);
    const r = await ciblesCoherentes(cibles, ['seul@x.fr']);
    expect(r.gardees.map((c) => c.cle)).toEqual(['900']);
    expect(r.ecartees.map((c) => c.cle)).toEqual(['432']);
    expect(biensDesClients).toHaveBeenCalledWith(['seul@x.fr']);
  });
  it('ajout manuel : écarté sans confirmation, gardé confirmé ; la base (sans origine) passe sans lecture', async () => {
    const r = await ciblesCoherentes(ciblesDemandees([
      { sorte: 'lot', cle: '77', id: 77, libelle: 'lot 77', origine: 'manuel' },
      { sorte: 'lot', cle: '78', id: 78, libelle: 'lot 78', origine: 'manuel', manuelConfirme: true },
      { sorte: 'lot', cle: '219', id: null, libelle: 'lot 219' },
    ]), ['artisan@x.fr']);
    expect(r.gardees.map((c) => c.cle)).toEqual(['78', '219']);
    biensDesClients.mockClear();
    const base = await ciblesCoherentes(ciblesDemandees([{ sorte: 'lot', cle: '219', id: null, libelle: 'lot 219' }]), ['x@y.fr']);
    expect(base.gardees.map((c) => c.cle)).toEqual(['219']);
    expect(biensDesClients).not.toHaveBeenCalled();
  });
  it('l’origine est lue STRICTEMENT (liste fermée) ; une valeur inconnue = bien de base', () => {
    expect(ciblesDemandees([{ sorte: 'lot', cle: '1', id: 1, libelle: 'l', origine: 'pirate', manuelConfirme: 'oui' }]))
      .toEqual([{ sorte: 'lot', cle: '1', id: 1, libelle: 'l' }]);
  });
});
