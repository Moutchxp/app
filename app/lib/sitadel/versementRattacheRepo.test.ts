import { describe, it, expect, vi } from 'vitest';
import { executerVersementRattache, type DepsVersementRattache, type ReponseAVerser } from './versementRattacheRepo';

/**
 * PART-1 — orchestrateur du versement rattaché (par INJECTION, aucune base ni S3). On prouve : versement suivant le RATTACHEMENT
 * (expéditeur inconnu inclus), écart de la signature (empreinte), dédup GED (2e passage), multi-dossiers non traité, simulation.
 */
const SIG = 'e03ddb3adb387cd05867a7bf35fc731acc9a5a31075b3bf5cef1e9f5719b88e9';

// Une réponse rattachée (mono-dossier) : 1 vrai PDF, 1 signature (empreinte exclue), 1 doublon déjà en GED.
const reponseType = (over: Partial<ReponseAVerser> = {}): ReponseAVerser => ({
  reponseId: 17, demandeId: 154, deAdresse: 'lauriane.pangui@mairie-aubervilliers.fr', // expéditeur INCONNU (hors depot_adresses_connues)
  dossiers: [{ dossierId: 7424 }], dejaSatisfait: true,
  pieces: [
    { id: 1, nomFichier: 'PC02.pdf', typeMime: 'application/pdf', sha256: 'aa11', cleStockage: 'k/pc02' },
    { id: 2, nomFichier: 'Auber-Rouge.png', typeMime: 'image/png', sha256: SIG, cleStockage: 'k/sig' },
    { id: 3, nomFichier: 'deja.pdf', typeMime: 'application/pdf', sha256: 'dede', cleStockage: 'k/deja' },
  ],
  ...over,
});

function makeDeps(over: Partial<DepsVersementRattache> = {}): DepsVersementRattache {
  return {
    lireHachagesExclus: vi.fn(async () => [SIG]),
    chargerReponsesAVerser: vi.fn(async () => [reponseType()]),
    empreintesEnGed: vi.fn(async () => new Set<string>(['dede'])), // 'deja.pdf' déjà en GED
    marquerSatisfait: vi.fn(async () => {}),
    contenuPiece: vi.fn(async () => Buffer.from('x')),
    deposer: vi.fn(async () => ({ ok: true as const })),
    ...over,
  };
}

describe('executerVersementRattache', () => {
  it('rattaché + expéditeur INCONNU → pièces versées (le versement suit le rattachement, pas l’expéditeur)', async () => {
    const deposer = vi.fn(async (_d: number, _p: { nomFichier: string; typeMime: string | null; contenu: Buffer }, _e: string, _r: number) => { void _d; void _e; void _r; void _p; return { ok: true as const }; });
    const bilan = await executerVersementRattache(makeDeps({ deposer }), { appliquer: true });
    expect(bilan.versees).toBe(1);            // PC02.pdf
    expect(bilan.ecarteesSignature).toBe(1);  // Auber-Rouge.png (empreinte exclue)
    expect(bilan.ignoreesDoublon).toBe(1);    // deja.pdf (déjà en GED)
    expect(deposer).toHaveBeenCalledTimes(1);
    expect(deposer.mock.calls[0][1].nomFichier).toBe('PC02.pdf'); // ni la signature ni le doublon
  });

  it('déjà satisfait → pas de re-marquage ; NON satisfait → marque avant dépôt', async () => {
    const m1 = vi.fn(async () => {});
    await executerVersementRattache(makeDeps({ marquerSatisfait: m1 }), { appliquer: true });
    expect(m1).not.toHaveBeenCalled(); // dejaSatisfait: true

    const m2 = vi.fn(async () => {});
    await executerVersementRattache(makeDeps({ marquerSatisfait: m2, chargerReponsesAVerser: vi.fn(async () => [reponseType({ dejaSatisfait: false })]) }), { appliquer: true });
    expect(m2).toHaveBeenCalledTimes(1);
    expect(m2).toHaveBeenCalledWith(154, 7424);
  });

  it('SECOND passage → aucun doublon (toutes empreintes déjà en GED → rien de versé)', async () => {
    const deposer = vi.fn(async () => ({ ok: true as const }));
    const deps = makeDeps({ deposer, empreintesEnGed: vi.fn(async () => new Set<string>(['aa11', 'dede'])) }); // PC02 déjà versé au 1er passage
    const bilan = await executerVersementRattache(deps, { appliquer: true });
    expect(bilan.versees).toBe(0);
    expect(bilan.ignoreesDoublon).toBe(2); // PC02 + deja
    expect(deposer).not.toHaveBeenCalled();
  });

  it('MULTI-dossiers → NON traité (rien versé, compté)', async () => {
    const deposer = vi.fn(async () => ({ ok: true as const }));
    const deps = makeDeps({ deposer, chargerReponsesAVerser: vi.fn(async () => [reponseType({ dossiers: [{ dossierId: 1 }, { dossierId: 2 }] })]) });
    const bilan = await executerVersementRattache(deps, { appliquer: true });
    expect(bilan.multiNonTraite).toBe(1);
    expect(bilan.versees).toBe(0);
    expect(deposer).not.toHaveBeenCalled();
  });

  it('SIMULATION (appliquer=false) → n’écrit RIEN mais compte ce qui SERAIT versé', async () => {
    const deposer = vi.fn(async () => ({ ok: true as const }));
    const marquerSatisfait = vi.fn(async () => {});
    const contenuPiece = vi.fn(async () => Buffer.from('x'));
    const bilan = await executerVersementRattache(makeDeps({ deposer, marquerSatisfait, contenuPiece }), { appliquer: false });
    expect(bilan.versees).toBe(1);          // ce qui SERAIT versé
    expect(bilan.ecarteesSignature).toBe(1);
    expect(deposer).not.toHaveBeenCalled();
    expect(marquerSatisfait).not.toHaveBeenCalled();
    expect(contenuPiece).not.toHaveBeenCalled();
    expect(bilan.appliquer).toBe(false);
  });

  it('contenu introuvable en stockage → échec compté, jamais avalé', async () => {
    const bilan = await executerVersementRattache(makeDeps({
      contenuPiece: vi.fn(async () => null),
      chargerReponsesAVerser: vi.fn(async () => [reponseType({ pieces: [{ id: 1, nomFichier: 'PC02.pdf', typeMime: 'application/pdf', sha256: 'aa11', cleStockage: 'k/pc02' }] })]),
    }), { appliquer: true });
    expect(bilan.echecs).toBe(1);
    expect(bilan.versees).toBe(0);
  });
});
