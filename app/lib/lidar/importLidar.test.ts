import { describe, it, expect } from 'vitest';
import { chargerDalles, type DepsChargement, type EvenementJournal } from './importLidar';
import { etatDalle, nomDalle, type CoucheLidar, type Dalle, type EtatDalle } from './grilleLidar';

/**
 * Lot IMPORT LiDAR HD — les règles du chargement, sur une FAUSSE base en mémoire (aucun réseau, aucun fichier) :
 * idempotence, reprise après coupure, refus de toucher une dalle existante ou incohérente, une transaction par dalle.
 */
const D = (x: number, y = 6868): Dalle => ({ xKm: x, yKm: y });

/** Fausse base : nombre de tuiles par dalle et par couche ; `importer` écrit les deux couches d'un coup (transaction). */
function fausseBase(initial: Record<string, { MNS: number; MNT: number }> = {}) {
  const tuiles = new Map<string, { MNS: number; MNT: number }>(Object.entries(initial));
  const appels = { telecharger: [] as string[], importer: [] as string[], effacer: [] as string[][] };
  const journal: EvenementJournal[] = [];
  let enVol = 0, maxEnVol = 0;
  let pannes = new Set<string>(); // dalles dont l'import « coupe » (exception avant validation)
  const deps: DepsChargement = {
    etats: async (ds) => new Map<string, EtatDalle>(ds.map((d) => [nomDalle(d), etatDalle(tuiles.get(nomDalle(d)) ?? { MNS: 0, MNT: 0 })])),
    telecharger: async (d: Dalle, c: CoucheLidar) => { appels.telecharger.push(`${nomDalle(d)}/${c}`); return `/tmp/${nomDalle(d)}_${c}.tif`; },
    verifier: async () => ({ ok: true }),
    importer: async (d) => {
      const nom = nomDalle(d);
      enVol += 1; maxEnVol = Math.max(maxEnVol, enVol);
      await new Promise((r) => setTimeout(r, 1));
      enVol -= 1;
      appels.importer.push(nom);
      if (pannes.has(nom)) throw new Error('connexion coupée'); // rien n'est écrit : la transaction n'a pas été validée
      if ((tuiles.get(nom)?.MNS ?? 0) > 0) return 'deja_presente';
      tuiles.set(nom, { MNS: 64, MNT: 64 });
      return 'importee';
    },
    effacer: async (ch) => { appels.effacer.push([...ch]); },
    journal: (e) => { journal.push(e); },
  };
  return { deps, tuiles, appels, journal, pannes: (s: string[]) => { pannes = new Set(s); }, maxEnVol: () => maxEnVol };
}

describe('idempotence et préservation', () => {
  it('une dalle PRÉSENTE (Asnières) est sautée : ni téléchargée, ni importée, ni effacée — jamais modifiée', async () => {
    const b = fausseBase({ '0646_6868': { MNS: 64, MNT: 64 } });
    const bilan = await chargerDalles([D(646), D(647)], 4, b.deps);
    expect(bilan).toMatchObject({ demandees: 2, sautees: 1, importees: 1, echecs: [] });
    expect(b.appels.telecharger.some((a) => a.startsWith('0646_6868'))).toBe(false);
    expect(b.appels.importer).toEqual(['0647_6868']);
    expect(b.tuiles.get('0646_6868')).toEqual({ MNS: 64, MNT: 64 });
  });

  it('relancer sur une zone déjà chargée : tout est sauté, aucun appel d’écriture', async () => {
    const b = fausseBase();
    await chargerDalles([D(646), D(647), D(648)], 2, b.deps);
    const avant = b.appels.importer.length;
    const bilan = await chargerDalles([D(646), D(647), D(648)], 2, b.deps);
    expect(bilan).toMatchObject({ sautees: 3, importees: 0 });
    expect(b.appels.importer.length).toBe(avant);
  });

  it('une dalle INCOHÉRENTE (trou ou doublon) n’est jamais touchée, seulement signalée', async () => {
    const b = fausseBase({ '0647_6868': { MNS: 64, MNT: 10 } });
    const bilan = await chargerDalles([D(647)], 1, b.deps);
    expect(bilan.incoherentes).toEqual(['0647_6868']);
    expect(b.appels.telecharger).toEqual([]);
    expect(b.appels.importer).toEqual([]);
    expect(b.tuiles.get('0647_6868')).toEqual({ MNS: 64, MNT: 10 });
  });

  it('apparue entre la lecture et l’import (autre lancement) : « déjà présente », rien d’écrit en double', async () => {
    const b = fausseBase();
    const etats = b.deps.etats;
    b.deps.etats = async (ds) => { const m = await etats(ds); b.tuiles.set('0647_6868', { MNS: 64, MNT: 64 }); return m; };
    const bilan = await chargerDalles([D(647)], 1, b.deps);
    expect(bilan).toMatchObject({ importees: 0, dejaPresentes: 1 });
  });
});

describe('reprise après coupure', () => {
  it('une coupure pendant une dalle : les autres sont chargées, celle-ci reste ABSENTE (jamais à moitié), et la relance la reprend', async () => {
    const b = fausseBase();
    b.pannes(['0647_6868']);
    const premier = await chargerDalles([D(646), D(647), D(648)], 2, b.deps);
    expect(premier.importees).toBe(2);
    expect(premier.echecs).toEqual([{ dalle: '0647_6868', motif: 'connexion coupée' }]);
    expect(b.tuiles.has('0647_6868')).toBe(false); // aucune tuile : la transaction n'a rien validé
    expect(b.appels.effacer.flat().some((f) => f.includes('0647_6868'))).toBe(false); // fichiers gardés pour diagnostic
    b.pannes([]);
    const reprise = await chargerDalles([D(646), D(647), D(648)], 2, b.deps);
    expect(reprise).toMatchObject({ sautees: 2, importees: 1, echecs: [] });
    expect(b.tuiles.get('0647_6868')).toEqual({ MNS: 64, MNT: 64 });
  });

  it('fichier refusé par le contrôle d’intégrité : rien n’est importé pour cette dalle', async () => {
    const b = fausseBase();
    b.deps.verifier = async (_d, c) => (c === 'MNT' ? { ok: false, motif: 'nodata 0' } : { ok: true });
    const bilan = await chargerDalles([D(647)], 1, b.deps);
    expect(bilan.echecs[0].motif).toBe('MNT refusé : nodata 0');
    expect(b.appels.importer).toEqual([]);
  });

  it('fichiers effacés après import réussi ; parallélisme borné par --paralleles', async () => {
    const b = fausseBase();
    await chargerDalles([D(640), D(641), D(642), D(643), D(644), D(645)], 3, b.deps);
    expect(b.appels.effacer).toHaveLength(6);
    expect(b.appels.effacer[0]).toHaveLength(2); // MNS + MNT de la dalle
    expect(b.maxEnVol()).toBeLessThanOrEqual(3);
  });
});
