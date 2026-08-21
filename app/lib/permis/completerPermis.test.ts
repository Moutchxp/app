import { describe, it, expect } from 'vitest';
import { executerEtapes, construireRapport, compterSansMotif, MOTIF_ABSENT, MOTIF_SANS_EXTRACTEUR, type Etape, type PrevisionAbstention } from './completerPermis';
import { motifEcartePrecedence } from './precedenceMethodes';
import type { GlobalPermis, CorpsBatiment } from './caracteristiquesRepo';
import type { JournalPermis, JournalChamp } from './journalLecture';

const etape = (nom: string, impl: () => Promise<{ resume: string; coutApiUsd?: number; abstentions?: PrevisionAbstention[] }>): Etape => ({ nom, executer: impl });

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

  it('N10-R — collecte l’overlay des abstentions PRÉVUES (par champ/corps), clé permis vs corps', async () => {
    const r = await executerEtapes([
      etape('champs', async () => ({ resume: 'ok', abstentions: [
        { champ: 'designation', corpsId: null, motif: 'aucune ligne « Nom de l’opération »' },
        { champ: 'hauteur_max_plu_ngf', corpsId: 7, motif: 'aucune planche « hauteur maximale PLU »' },
      ] })),
    ]);
    expect(r.overlay.get('permis:designation')).toBe('aucune ligne « Nom de l’opération »');
    expect(r.overlay.get('7:hauteur_max_plu_ngf')).toBe('aucune planche « hauteur maximale PLU »');
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

  it('N10-T — un champ REMPLI dont une lecture concurrente fut écartée par précédence : l’écart est VISIBLE (jamais un silence)', () => {
    const j: JournalPermis = { parCorps: {}, permis: {
      adresse_terrain: { confiance: 'confirmee', reserve: null, provenances: [{ piece: 'cerfa.pdf', page: 5 }], motif: null, methode: 'cerfa',
        ecartes: [{ valeur: null, piece: 'PC-scan.pdf', page: 5, motif: motifEcartePrecedence('ia', 'cerfa'), methode: 'ia', extrait: '3 AVENUE BENOIT FRACHON 75020 PARIS' }] },
    } };
    const a = construireRapport(global(), [], j).find((r) => r.champ === 'Adresse du terrain')!;
    expect(a.methode).toBe('cerfa'); // la valeur retenue est étiquetée de la méthode GAGNANTE
    expect(a.ecarts).toHaveLength(1);
    expect(a.ecarts[0]).toMatchObject({ methode: 'ia', extrait: '3 AVENUE BENOIT FRACHON 75020 PARIS' }); // le code postal « perdu » reste visible
  });

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

  it('N10-R (cause 2) — champ SANS extracteur → motif PERMANENT, distinct, jamais sansMotif (même sans journal)', () => {
    const corps: CorpsBatiment[] = [{ id: 7, repere: 'A' } as CorpsBatiment];
    const rows = construireRapport(global(), corps, { parCorps: {}, permis: {} }); // aucun journal
    for (const lib of ['Hauteur relative', 'Terrain naturel (NGF)']) {
      const m = rows.find((r) => r.niveau.startsWith('corps #7') && r.champ === lib)!;
      expect(m.valeur).toBeNull();
      expect(m.motif).toBe(MOTIF_SANS_EXTRACTEUR);
      expect(m.permanent).toBe(true);
      expect(m.sansMotif).toBe(false); // motif permanent = jamais un vide muet
    }
  });

  it('N10-R (cause 2) — le motif permanent PRIME sur un overlay (on a décidé de ne pas extraire, pas « corpus muet »)', () => {
    const corps: CorpsBatiment[] = [{ id: 7, repere: 'A' } as CorpsBatiment];
    const overlay = new Map<string, string>([['7:hauteur_relative_m', 'un motif circonstanciel qui ne doit PAS gagner']]);
    const hr = construireRapport(global(), corps, { parCorps: {}, permis: {} }, overlay).find((r) => r.niveau.startsWith('corps #7') && r.champ === 'Hauteur relative')!;
    expect(hr.motif).toBe(MOTIF_SANS_EXTRACTEUR);
    expect(hr.permanent).toBe(true);
  });

  it('N10-R (cause 1) — un champ vide sans journal mais couvert par l’OVERLAY porte ce motif (dry-run : rien écrit) → 0 sansMotif', () => {
    const corps: CorpsBatiment[] = [{ id: 7, repere: 'A' } as CorpsBatiment];
    const overlay = new Map<string, string>([
      ['permis:designation', 'aucune ligne « Nom de l’opération » dans le corpus'],
      ['7:hauteur_max_plu_ngf', 'aucune planche du corpus ne porte le libellé « hauteur maximale PLU »'],
      ['7:altitude_plateau_nivellement_ngf', 'aucune planche du corpus ne porte le libellé « plateau de nivellement »'],
    ]);
    const rows = construireRapport(global({ designation: null, designationOrigine: null }), corps, { parCorps: {}, permis: {} }, overlay);
    const desig = rows.find((r) => r.niveau === 'permis' && r.champ === 'Désignation de l’opération')!;
    expect(desig.motif).toContain('Nom de l’opération');
    expect(desig.sansMotif).toBe(false);
    const gab = rows.find((r) => r.niveau.startsWith('corps #7') && r.champ === 'Gabarit PLU (NGF)')!;
    expect(gab.motif).toContain('hauteur maximale PLU');
    expect(gab.sansMotif).toBe(false);
    // les 4 champs jadis « vides sans motif » (désignation + gabarit/plateau/hauteur relative/terrain naturel du corps) sont tous couverts
    const jadisMuets = ['Désignation de l’opération', 'Gabarit PLU (NGF)', 'Plateau de nivellement (NGF)', 'Hauteur relative', 'Terrain naturel (NGF)'];
    expect(compterSansMotif(rows.filter((r) => jadisMuets.includes(r.champ)))).toBe(0);
  });
});
