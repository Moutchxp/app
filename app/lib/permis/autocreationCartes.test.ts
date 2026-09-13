import { describe, it, expect, vi } from 'vitest';
import { decisionAutocreationCartes } from './autocreationCartes';
import { autocreerCartes, type DepsAutocreation } from './autocreationCartesRepo';

/** BAT-1 — décision PURE + orchestrateur (deps injectées, aucune base). Comportement asserté, jamais la forme d'un SQL. */

describe('decisionAutocreationCartes — pure', () => {
  it('aucun nombre validé, N détecté = max(corps, décompte) → pose N, crée le manque', () => {
    expect(decisionAutocreationCartes({ nbValide: null, nbCorps: 1, nbDecompte: 3 })).toMatchObject({ poser: 3, creer: 2, detecte: 3 }); // décompte > corps → 2 cartes vides
    expect(decisionAutocreationCartes({ nbValide: null, nbCorps: 3, nbDecompte: 0 })).toMatchObject({ poser: 3, creer: 0, detecte: 3 }); // corps déjà là → 0 création
  });
  it('nombre déjà validé → INTOUCHÉ (décision humaine, jamais recalculée)', () => {
    expect(decisionAutocreationCartes({ nbValide: 2, nbCorps: 5, nbDecompte: 5 })).toEqual(expect.objectContaining({ poser: null, creer: 0 }));
  });
  it('0 détecté → NO-OP (NULL préservé, jamais 0 par défaut)', () => {
    const d = decisionAutocreationCartes({ nbValide: null, nbCorps: 0, nbDecompte: 0 });
    expect(d).toMatchObject({ poser: null, creer: 0, detecte: 0 });
    expect(d.motif).toMatch(/jamais 0/);
  });
});

// ── Orchestrateur avec deps SIMULÉES ────────────────────────────────────────────────────────────────────────────────────────────
function deps(over: Partial<DepsAutocreation> & { etatVal: { nbValide: number | null; nbCorps: number; nbDecompte: number } }): DepsAutocreation & { creer: ReturnType<typeof vi.fn>; poser: ReturnType<typeof vi.fn>; nommer: ReturnType<typeof vi.fn>; poserDetecteFn: ReturnType<typeof vi.fn> } {
  const creer = vi.fn(async () => {});
  const poser = vi.fn(async () => {});
  const nommer = vi.fn(async () => {});
  const poserDetecte = vi.fn(async () => {});
  return {
    colonneDisponible: over.colonneDisponible ?? (async () => true),
    etat: async () => over.etatVal,
    creerCarteVide: creer,
    nommer,
    poserNombre: poser,
    poserDetecte,
    creer, poser, nommerFn: nommer, poserDetecteFn: poserDetecte, // exposés pour assertion
  } as unknown as DepsAutocreation & { creer: ReturnType<typeof vi.fn>; poser: ReturnType<typeof vi.fn>; nommer: ReturnType<typeof vi.fn>; poserDetecteFn: ReturnType<typeof vi.fn> };
}

describe('autocreerCartes — orchestrateur', () => {
  it('dossier sans carte, N détecté (décompte) → N cartes créées + nombre validé posé + nommage', async () => {
    const d = deps({ etatVal: { nbValide: null, nbCorps: 0, nbDecompte: 3 } });
    const r = await autocreerCartes(468, 'x', d, { appliquer: true });
    expect(r).toMatchObject({ creees: 3, nombrePose: 3 });
    expect(d.creer).toHaveBeenCalledTimes(3);
    expect(d.poser).toHaveBeenCalledWith(468, 3, 'x');
    expect(d.nommer).toHaveBeenCalledOnce(); // numérotation des cartes créées
  });

  it('SECONDE PASSE (nombre déjà validé) → NO-OP : aucune carte, aucune pose', async () => {
    const d = deps({ etatVal: { nbValide: 3, nbCorps: 3, nbDecompte: 3 } });
    const r = await autocreerCartes(468, 'x', d, { appliquer: true });
    expect(r.intouche).toBe(true);
    expect(d.creer).not.toHaveBeenCalled();
    expect(d.poser).not.toHaveBeenCalled();
  });

  it('cartes déjà présentes = détecté, jamais validé → 0 création, pose le nombre (ne renomme pas les existants)', async () => {
    const d = deps({ etatVal: { nbValide: null, nbCorps: 2, nbDecompte: 0 } });
    const r = await autocreerCartes(11434, 'x', d, { appliquer: true });
    expect(r).toMatchObject({ creees: 0, nombrePose: 2 });
    expect(d.creer).not.toHaveBeenCalled();      // aucune carte créée → repères existants intacts
    expect(d.nommer).not.toHaveBeenCalled();     // pas de nommage puisque rien créé
    expect(d.poser).toHaveBeenCalledWith(11434, 2, 'x');
  });

  it('0 détecté → NO-OP explicite (aucune carte, aucun nombre posé)', async () => {
    const d = deps({ etatVal: { nbValide: null, nbCorps: 0, nbDecompte: 0 } });
    const r = await autocreerCartes(999, 'x', d, { appliquer: true });
    expect(r).toMatchObject({ intouche: true, creees: 0, nombrePose: null });
    expect(d.creer).not.toHaveBeenCalled();
    expect(d.poser).not.toHaveBeenCalled();
  });

  it('migration 218 absente → NO-OP complet, jamais de carte', async () => {
    const d = deps({ etatVal: { nbValide: null, nbCorps: 0, nbDecompte: 3 }, colonneDisponible: async () => false });
    const r = await autocreerCartes(468, 'x', d, { appliquer: true });
    expect(r.migrationAbsente).toBe(true);
    expect(d.creer).not.toHaveBeenCalled();
    expect(d.poser).not.toHaveBeenCalled();
  });

  it('DRY-RUN → plan calculé (aCreer/aPoser), AUCUNE écriture', async () => {
    const d = deps({ etatVal: { nbValide: null, nbCorps: 1, nbDecompte: 3 } });
    const r = await autocreerCartes(468, 'x', d, { appliquer: false });
    expect(r).toMatchObject({ aCreer: 2, aPoser: 3, creees: 0, nombrePose: null });
    expect(d.creer).not.toHaveBeenCalled();
    expect(d.poser).not.toHaveBeenCalled();
    expect(d.poserDetecteFn).not.toHaveBeenCalled(); // dry-run → aucun snapshot du détecté non plus
  });
});

describe('autocreerCartes — SNAPSHOT du nombre DÉTECTÉ (constat d’analyse, immunisé du manuel)', () => {
  it('applique + détecté > 0 → poserDetecte(dossier, détecté)', async () => {
    const d = deps({ etatVal: { nbValide: null, nbCorps: 0, nbDecompte: 3 } });
    await autocreerCartes(468, 'analyse:auto', d, { appliquer: true });
    expect(d.poserDetecteFn).toHaveBeenCalledWith(468, 3, 'analyse:auto'); // le détecté est snapshoté par l'analyse
  });

  it('nombre DÉJÀ validé (décision humaine, poser=null) → le détecté est QUAND MÊME snapshoté', async () => {
    const d = deps({ etatVal: { nbValide: 2, nbCorps: 2, nbDecompte: 4 } }); // détecté = max(2,4) = 4
    const r = await autocreerCartes(468, 'analyse:auto', d, { appliquer: true });
    expect(r.intouche).toBe(true);                       // la décision humaine (validé) n'est pas recalculée
    expect(d.poser).not.toHaveBeenCalled();               // nb_batiments_valide intouché
    expect(d.poserDetecteFn).toHaveBeenCalledWith(468, 4, 'analyse:auto'); // mais le CONSTAT détecté est mis à jour
  });

  it('détecté snapshoté MÊME si la migration 218 (nombre validé) est absente — colonne 220 indépendante', async () => {
    const d = deps({ etatVal: { nbValide: null, nbCorps: 0, nbDecompte: 3 }, colonneDisponible: async () => false });
    await autocreerCartes(468, 'analyse:auto', d, { appliquer: true });
    expect(d.poser).not.toHaveBeenCalled();               // 218 absente → pas de pose du validé
    expect(d.poserDetecteFn).toHaveBeenCalledWith(468, 3, 'analyse:auto'); // le détecté (220) est indépendant
  });

  it('0 détecté → poserDetecte PAS appelé (NULL préservé → « aucun futur bâtiment identifié »)', async () => {
    const d = deps({ etatVal: { nbValide: null, nbCorps: 0, nbDecompte: 0 } });
    await autocreerCartes(999, 'analyse:auto', d, { appliquer: true });
    expect(d.poserDetecteFn).not.toHaveBeenCalled();
  });
});
