import { describe, it, expect } from 'vitest';
import { executerEtapes, construireRapport, compterSansMotif, MOTIF_ABSENT, type Etape } from './completerPermis';
import type { GlobalPermis, CorpsBatiment } from './caracteristiquesRepo';
import type { JournalPermis, JournalChamp } from './journalLecture';

const etape = (nom: string, impl: () => Promise<{ resume: string; coutApiUsd?: number }>): Etape => ({ nom, executer: impl });

describe('executerEtapes — ordre, continue-sur-échec, --sauter, coût cumulé', () => {
  it('respecte l’ORDRE et cumule le coût API', async () => {
    const ordre: string[] = [];
    const r = await executerEtapes([
      etape('niveaux', async () => { ordre.push('niveaux'); return { resume: 'ok' }; }),
      etape('champs', async () => { ordre.push('champs'); return { resume: 'ok' }; }),
      etape('parcelles', async () => { ordre.push('parcelles'); return { resume: 'ok' }; }),
      etape('cerfa-scan', async () => { ordre.push('cerfa-scan'); return { resume: 'ok', coutApiUsd: 0.022 }; }),
    ]);
    expect(ordre).toEqual(['niveaux', 'champs', 'parcelles', 'cerfa-scan']);
    expect(r.etapes.map((e) => e.statut)).toEqual(['ok', 'ok', 'ok', 'ok']);
    expect(r.coutApiUsd).toBeCloseTo(0.022, 5);
  });

  it('une étape en ÉCHEC n’emporte pas les autres (signalée, on continue)', async () => {
    const r = await executerEtapes([
      etape('niveaux', async () => { throw new Error('boom niveaux'); }),
      etape('champs', async () => ({ resume: 'ok' })),
    ]);
    expect(r.etapes[0]).toMatchObject({ nom: 'niveaux', statut: 'echec' });
    expect(r.etapes[0].resume).toContain('boom niveaux');
    expect(r.etapes[1]).toMatchObject({ nom: 'champs', statut: 'ok' }); // la suivante a bien tourné
  });

  it('--sauter marque l’étape « ignoree » sans l’exécuter', async () => {
    let lance = false;
    const r = await executerEtapes([etape('cerfa-scan', async () => { lance = true; return { resume: 'ok' }; })], ['cerfa-scan']);
    expect(lance).toBe(false);
    expect(r.etapes[0].statut).toBe('ignoree');
  });
});

describe('construireRapport — champ par champ, JAMAIS un vide muet', () => {
  const retenue = (methode: string): JournalChamp => ({ confiance: 'confirmee', reserve: null, provenances: [], motif: null, methode });
  const ecartee = (motif: string): JournalChamp => ({ confiance: null, reserve: null, provenances: [], motif, methode: null });
  const global = (over: Partial<GlobalPermis> = {}): GlobalPermis => ({
    parking: null, parkingOrigine: null, commentaire: null, majLe: null, majPar: null,
    natureProjet: null, natureProjetOrigine: null,
    surfacePlancherM2: 9470, surfacePlancherM2Origine: 'extraite',
    nbLogements: 0, nbLogementsOrigine: 'extraite',
    nbPlacesStationnement: null, nbPlacesStationnementOrigine: null,
    adresseTerrain: '30 rue Louis Lumière 75020 Paris', adresseTerrainOrigine: 'extraite',
    designation: 'Équipement Multisports', designationOrigine: 'extraite',
    destinations: ['Équipements sportifs'], destinationsOrigine: 'extraite',
    altitudeSommetNgf: null, altitudeSommetNgfOrigine: null, ...over,
  });
  const journal: JournalPermis = { parCorps: {}, permis: {
    surface_plancher_m2: retenue('ia'), nb_logements: retenue('ia'), adresse_terrain: retenue('ia'), designation: retenue('enonce'), destinations: retenue('ia'),
    nb_places_stationnement: ecartee('champ non renseigné (les deux lectures : case blanche)'),
    altitude_sommet_ngf: ecartee('aucune cote « acrotère » dans le corpus'),
  } };

  it('un champ REMPLI porte valeur + origine + méthode', () => {
    const rows = construireRapport(global(), [], journal);
    const surf = rows.find((r) => r.champ === 'Surface de plancher')!;
    expect(surf).toMatchObject({ valeur: '9470', origine: 'extraite', methode: 'ia', motif: null, sansMotif: false });
    expect(rows.find((r) => r.champ === 'Désignation de l’opération')!.methode).toBe('enonce');
  });

  it('un « 0 » écrit apparaît comme valeur 0 (vide ≠ 0)', () => {
    expect(construireRapport(global(), [], journal).find((r) => r.champ === 'Nombre de logements')!.valeur).toBe('0');
  });

  it('un champ VIDE porte son MOTIF journalisé (stationnement : case blanche)', () => {
    const sta = construireRapport(global(), [], journal).find((r) => r.champ === 'Places de stationnement')!;
    expect(sta.valeur).toBeNull();
    expect(sta.motif).toContain('case blanche');
    expect(sta.sansMotif).toBe(false);
  });

  it('un champ VIDE SANS trace journalisée → motif de secours + sansMotif=true (défaut à faire remonter)', () => {
    const rows = construireRapport(global({ altitudeSommetNgf: null }), [], { parCorps: {}, permis: {} }); // journal vide
    const surf = rows.find((r) => r.champ === 'Surface de plancher')!; // rempli en colonne mais journal absent
    expect(surf.valeur).toBe('9470'); // la valeur prime, pas de sansMotif
    const sta = rows.find((r) => r.champ === 'Places de stationnement')!; // vide + aucun journal
    expect(sta.motif).toBe(MOTIF_ABSENT);
    expect(sta.sansMotif).toBe(true);
  });

  it('dossier complété proprement → AUCUN champ vide sans motif (au niveau permis)', () => {
    const rows = construireRapport(global(), [], journal);
    // ici seuls surface/logements/adresse/designation/destinations sont remplis ; stationnement + sommet ont un motif ⇒ 0 sansMotif
    expect(compterSansMotif(rows.filter((r) => r.niveau === 'permis'))).toBe(0);
  });

  it('corps : chaque mesure vide sans journal est signalée (sansMotif)', () => {
    const corps: CorpsBatiment[] = [{ id: 7, repere: 'A' } as CorpsBatiment];
    const rows = construireRapport(global(), corps, journal);
    const etages = rows.find((r) => r.niveau.startsWith('corps #7') && r.champ === 'Étages')!;
    expect(etages.valeur).toBeNull();
    expect(etages.sansMotif).toBe(true); // aucune valeur, aucun journal → à faire remonter
  });
});
