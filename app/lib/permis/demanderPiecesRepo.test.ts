import { describe, it, expect, vi } from 'vitest';
import { executerDemandePieces, declarerRelanceComplement, type DepsDemandePieces, type DepsDeclaration, type CibleComplement, type TraceEnvoi, type TraceDeclaration } from './demanderPiecesRepo';

/**
 * PART-3a/3c — orchestrateur du geste « demander les pièces manquantes » (par INJECTION : aucun SMTP, aucune base, aucun e-mail réel).
 * PART-3c : l'objet + le corps sont FOURNIS (éventuellement modifiés à la main) et envoyés VERBATIM ; le journal les conserve.
 */
const cible = (over: Partial<CibleComplement> = {}): CibleComplement => ({
  demandeId: 154, numDau: '0930012500081', destinataire: 'lauriane.pangui@mairie-aubervilliers.fr', deNom: 'Lauriane Pangui',
  messageId: '<abc@mairie-aubervilliers.fr>', referencesBrut: '<x@svav.com>', from: 'contact@sansvisavis.com', profil: 'entreprise',
  recuLe: '2026-08-28T14:39:59+02:00', motifIndisponible: null, ...over,
});

const OBJET = 'Permis n° X — complément';
const CORPS = 'Madame, Monsieur,\n\nMerci de me communiquer le Cerfa.\n\nCordialement,';

function makeDeps(over: Partial<DepsDemandePieces> = {}): DepsDemandePieces {
  return {
    lireCible: vi.fn(async () => cible()),
    envoyer: vi.fn(async (_c: CibleComplement, _o: string, _co: string) => { void _c; void _o; void _co; return { messageId: '<envoye@svav.com>' }; }),
    journaliser: vi.fn(async (_d: number, _t: TraceEnvoi, _a: string) => { void _d; void _t; void _a; }),
    ...over,
  };
}
const arg = (over: Partial<{ dossierId: number; familles: ('cerfa'|'masse'|'coupe'|'etage')[]; objet: string; corps: string; auteur: string }> = {}) =>
  ({ dossierId: 7424, familles: ['cerfa'] as ('cerfa'|'masse'|'coupe'|'etage')[], objet: OBJET, corps: CORPS, auteur: 'admin:decision', ...over });

describe('executerDemandePieces', () => {
  it('texte MODIFIÉ à la main → envoyé BYTE-IDENTIQUE à la brique d’envoi', async () => {
    let corpsEnvoye = ''; let objetEnvoye = '';
    const custom = 'Bonjour,\n\nJ’ai édité ce texte à la main — merci pour le plan de coupe.\n\n— A.J.';
    const deps = makeDeps({ envoyer: async (_c, o, co) => { objetEnvoye = o; corpsEnvoye = co; return { messageId: '<m@svav.com>' }; } });
    const r = await executerDemandePieces(deps, arg({ objet: 'Objet édité', corps: custom }));
    expect(r.ok).toBe(true);
    expect(objetEnvoye).toBe('Objet édité');
    expect(corpsEnvoye).toBe(custom); // exactement, sans retraitement
  });

  it('le JOURNAL conserve l’objet ET le corps réellement envoyés + les familles', async () => {
    let trace: TraceEnvoi | null = null;
    const deps = makeDeps({ journaliser: async (_d, t) => { trace = t; } });
    await executerDemandePieces(deps, arg({ familles: ['cerfa', 'etage'], objet: 'O', corps: 'C' }));
    expect(trace!.objet).toBe('O');
    expect(trace!.corps).toBe('C');
    expect(trace!.familles).toEqual(['cerfa', 'etage']);
    expect(trace!.destinataire).toBe('lauriane.pangui@mairie-aubervilliers.fr');
  });

  it('corps VIDE → refus, aucun envoi', async () => {
    const deps = makeDeps();
    const r = await executerDemandePieces(deps, arg({ corps: '   ' }));
    expect(r.ok).toBe(false);
    expect(deps.envoyer).not.toHaveBeenCalled();
  });

  it('objet VIDE → refus, aucun envoi', async () => {
    const deps = makeDeps();
    const r = await executerDemandePieces(deps, arg({ objet: '' }));
    expect(r.ok).toBe(false);
    expect(deps.envoyer).not.toHaveBeenCalled();
  });

  it('entité HTML saisie à la main → refus, aucun envoi', async () => {
    const deps = makeDeps();
    const r = await executerDemandePieces(deps, arg({ corps: 'Bonjour&nbsp;&nbsp;merci' }));
    expect(r.ok).toBe(false);
    expect(deps.envoyer).not.toHaveBeenCalled();
  });

  it('aucune famille → refus', async () => {
    const deps = makeDeps();
    expect((await executerDemandePieces(deps, arg({ familles: [] }))).ok).toBe(false);
    expect(deps.envoyer).not.toHaveBeenCalled();
  });

  it('no-reply (motif indisponible) → refus avec motif inchangé, aucun envoi', async () => {
    const deps = makeDeps({ lireCible: vi.fn(async () => cible({ motifIndisponible: 'adresse non répondable' })) });
    const r = await executerDemandePieces(deps, arg());
    expect(r).toEqual({ ok: false, motif: 'adresse non répondable' });
    expect(deps.envoyer).not.toHaveBeenCalled();
  });

  it('OK : envoi AVANT journal, sur le fil du dernier message reçu', async () => {
    const ordre: string[] = [];
    let cibleEnvoyee: CibleComplement | null = null;
    const deps = makeDeps({
      envoyer: async (c) => { ordre.push('envoyer'); cibleEnvoyee = c; return { messageId: '<m@svav.com>' }; },
      journaliser: async () => { ordre.push('journal'); },
    });
    const r = await executerDemandePieces(deps, arg());
    expect(r.ok).toBe(true);
    expect(ordre).toEqual(['envoyer', 'journal']);
    expect(cibleEnvoyee!.messageId).toBe('<abc@mairie-aubervilliers.fr>');
  });
});

// ── PART-3e — DÉCLARER une relance faite hors outil (AUCUN envoi) ─────────────────────────────────────────────────────────────
const ctx = { demandeId: 154, destinataire: 'lauriane.pangui@mairie-aubervilliers.fr', dernierMessageLe: '2026-08-28T14:39:59+02:00' };
function makeDepsDecl(over: Partial<DepsDeclaration> = {}): DepsDeclaration {
  return {
    lireContexte: vi.fn(async () => ctx),
    journaliserDeclaration: vi.fn(async (_d: number, _t: TraceDeclaration, _a: string) => { void _d; void _t; void _a; }),
    aujourdhui: () => '2026-08-30',
    ...over,
  };
}
const argD = (over: Partial<{ dossierId: number; familles: ('cerfa'|'masse'|'coupe'|'etage')[]; dateRelance: string; auteur: string }> = {}) =>
  ({ dossierId: 7424, familles: ['cerfa'] as ('cerfa'|'masse'|'coupe'|'etage')[], dateRelance: '2026-08-29', auteur: 'admin:decision', ...over });

describe('declarerRelanceComplement — constat sans envoi', () => {
  it('AUCUN chemin d’envoi : les dépendances de déclaration ne comportent PAS de fonction envoyer', () => {
    const deps = makeDepsDecl();
    expect('envoyer' in deps).toBe(false); // structurellement, ce chemin ne peut pas envoyer d'e-mail
  });

  it('date valide → journalise (même état : dateRelance + familles), aucun envoi possible', async () => {
    let trace: TraceDeclaration | null = null;
    const deps = makeDepsDecl({ journaliserDeclaration: async (_d, t) => { trace = t; } });
    const r = await declarerRelanceComplement(deps, argD({ familles: ['cerfa', 'etage'] }));
    expect(r.ok).toBe(true);
    expect(trace!.dateRelance).toBe('2026-08-29');
    expect(trace!.familles).toEqual(['cerfa', 'etage']);
    expect(trace!.destinataire).toBe('lauriane.pangui@mairie-aubervilliers.fr');
  });

  it('date dans le FUTUR → refus, rien journalisé', async () => {
    const journaliserDeclaration = vi.fn(async () => {});
    const r = await declarerRelanceComplement(makeDepsDecl({ journaliserDeclaration }), argD({ dateRelance: '2026-09-15' }));
    expect(r.ok).toBe(false);
    expect(journaliserDeclaration).not.toHaveBeenCalled();
  });

  it('date ANTÉRIEURE au dernier message reçu → refus, rien journalisé', async () => {
    const journaliserDeclaration = vi.fn(async () => {});
    const r = await declarerRelanceComplement(makeDepsDecl({ journaliserDeclaration }), argD({ dateRelance: '2026-08-01' }));
    expect(r.ok).toBe(false);
    expect(journaliserDeclaration).not.toHaveBeenCalled();
  });

  it('aucune famille → refus ; aucun message de mairie → refus', async () => {
    expect((await declarerRelanceComplement(makeDepsDecl(), argD({ familles: [] }))).ok).toBe(false);
    expect((await declarerRelanceComplement(makeDepsDecl({ lireContexte: vi.fn(async () => null) }), argD())).ok).toBe(false);
  });
});
