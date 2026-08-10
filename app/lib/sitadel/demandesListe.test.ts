import { describe, it, expect } from 'vitest';
import {
  basculerTri, filtrerDemandes, trierDemandes, OPTIONS_TRI, cleTri, triDepuisCle, SENS_DEFAUT, typeDemande, normaliserReference,
  dansPerimetre, statutsDuPerimetre, STATUTS_A_DEMANDER, STATUTS_EN_COURS,
  type Tri, type LigneDemande,
} from './demandesListe';

/**
 * D2 — tri + filtres PURS de la liste des demandes. « Plus ancien » = inverse EXACT de « Plus récentes » ; filtre type =
 * « au moins un dossier de l'un des types cochés » (OU) ; tri sur l'ENSEMBLE ; en-tête réversible ; sélecteur ↔ état synchro.
 */
const D = (over: Partial<LigneDemande> = {}): LigneDemande => ({
  id: 1, reference: 'SVAV-DEM-2026-000001', communeNom: 'Asnières', codeInsee: '92004',
  nbDossiers: 3, statut: 'brouillon', profil: 'entreprise', creeLe: '2026-01-01T00:00:00', rangs: [3], ...over,
});

describe('D2 — tri : « Plus ancien » est l’inverse EXACT de « Plus récentes »', () => {
  const liste = Array.from({ length: 12 }, (_, i) => D({ id: i + 1, creeLe: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00` }));
  it('date asc = reverse(date desc), à l’identité près', () => {
    const recentes = trierDemandes(liste, { colonne: 'date', sens: 'desc' }).map((d) => d.id);
    const ancien = trierDemandes(liste, { colonne: 'date', sens: 'asc' }).map((d) => d.id);
    expect(ancien).toEqual([...recentes].reverse());
    expect(recentes[0]).toBe(12); // la plus récente d'abord
    expect(ancien[0]).toBe(1);    // la plus ancienne d'abord
  });
  it('propriété d’inverse exact vraie pour TOUTES les colonnes (départage stable par id)', () => {
    const memes = Array.from({ length: 6 }, (_, i) => D({ id: i + 1, nbDossiers: i % 2, statut: i < 3 ? 'prete' : 'brouillon', communeNom: ['B', 'A', 'B', 'A', 'C', 'A'][i] }));
    for (const colonne of ['reference', 'commune', 'dossiers', 'statut'] as const) {
      const asc = trierDemandes(memes, { colonne, sens: 'asc' }).map((d) => d.id);
      const desc = trierDemandes(memes, { colonne, sens: 'desc' }).map((d) => d.id);
      expect(desc).toEqual([...asc].reverse());
    }
  });
});

describe('D2 — tri porte sur l’ENSEMBLE, jamais sur la page', () => {
  it('trie la liste complète (la pagination slice APRÈS)', () => {
    const liste = Array.from({ length: 30 }, (_, i) => D({ id: i + 1, nbDossiers: (i * 7) % 30 }));
    const trie = trierDemandes(liste, { colonne: 'dossiers', sens: 'desc' });
    expect(trie).toHaveLength(30);                              // tout est trié, pas une page
    expect(trie[0].nbDossiers).toBe(Math.max(...liste.map((d) => d.nbDossiers))); // le max global est en tête
    // la page 2 (slice 20..30) contient bien les 10 plus PETITS, ce qui serait faux si on triait la page seule
    const page2 = trie.slice(20, 30);
    expect(Math.max(...page2.map((d) => d.nbDossiers))).toBeLessThan(trie[19].nbDossiers + 1);
  });
  it('ne mute PAS la liste d’entrée (copie)', () => {
    const liste = [D({ id: 2 }), D({ id: 1 })];
    trierDemandes(liste, { colonne: 'reference', sens: 'asc' });
    expect(liste.map((d) => d.id)).toEqual([2, 1]);
  });
});

describe('D2 — basculerTri : réversibilité + colonne par défaut', () => {
  it('même colonne → inverse le sens ; second clic revient', () => {
    const t0: Tri = { colonne: 'commune', sens: 'asc' };
    const t1 = basculerTri(t0, 'commune');
    expect(t1).toEqual({ colonne: 'commune', sens: 'desc' });
    expect(basculerTri(t1, 'commune')).toEqual({ colonne: 'commune', sens: 'asc' });
  });
  it('autre colonne → sens PAR DÉFAUT (croissant, sauf dossiers = décroissant)', () => {
    expect(basculerTri({ colonne: 'commune', sens: 'desc' }, 'dossiers')).toEqual({ colonne: 'dossiers', sens: 'desc' });
    expect(basculerTri({ colonne: 'dossiers', sens: 'asc' }, 'statut')).toEqual({ colonne: 'statut', sens: 'asc' });
    expect(SENS_DEFAUT.dossiers).toBe('desc');
    expect(SENS_DEFAUT.commune).toBe('asc');
  });
});

describe('D2 — sélecteur Tri ↔ état : une seule vérité', () => {
  it('cleTri(tri) correspond TOUJOURS à une option du sélecteur (donc l’en-tête met à jour le sélecteur)', () => {
    for (const colonne of ['date', 'reference', 'commune', 'dossiers', 'statut'] as const) {
      for (const sens of ['asc', 'desc'] as const) {
        // les combos réellement atteignables par les en-têtes/sélecteur
        if (colonne === 'reference' && sens === 'desc') continue; // référence n'a pas d'en-tête réversible
        expect(OPTIONS_TRI.some((o) => o.valeur === cleTri({ colonne, sens }))).toBe(true);
      }
    }
  });
  it('triDepuisCle est l’inverse de cleTri (round-trip)', () => {
    const t: Tri = { colonne: 'statut', sens: 'desc' };
    expect(triDepuisCle(cleTri(t))).toEqual(t);
    expect(triDepuisCle('inconnu:xxx')).toEqual({ colonne: 'date', sens: 'desc' }); // repli sûr
  });
});

describe('D2 — filtre par TYPE (rangs) : « au moins un dossier », OU, aucun = tous', () => {
  const liste = [
    D({ id: 1, rangs: [1, 4] }),   // immeuble + extension
    D({ id: 2, rangs: [3] }),      // construction neuve
    D({ id: 3, rangs: [2] }),      // surélévation
    D({ id: 4, rangs: [] }),       // aucun dossier classé
  ];
  it('aucun type coché → AUCUN filtre (toutes les demandes)', () => {
    expect(filtrerDemandes(liste, { statut: '', profil: '', commune: '', types: [] }).map((d) => d.id)).toEqual([1, 2, 3, 4]);
  });
  it('un type coché → retient la demande dès qu’UN de ses dossiers correspond', () => {
    expect(filtrerDemandes(liste, { statut: '', profil: '', commune: '', types: [4] }).map((d) => d.id)).toEqual([1]); // 1 contient un rang 4
    expect(filtrerDemandes(liste, { statut: '', profil: '', commune: '', types: [1] }).map((d) => d.id)).toEqual([1]);
  });
  it('plusieurs types cochés se CUMULENT en OU', () => {
    expect(filtrerDemandes(liste, { statut: '', profil: '', commune: '', types: [2, 3] }).map((d) => d.id)).toEqual([2, 3]);
  });
  it('se combine avec statut / profil / commune', () => {
    const l2 = [D({ id: 1, rangs: [1], statut: 'prete' }), D({ id: 2, rangs: [1], statut: 'brouillon' })];
    expect(filtrerDemandes(l2, { statut: 'prete', profil: '', commune: '', types: [1] }).map((d) => d.id)).toEqual([1]);
  });
});

/**
 * D3 — dérivation PURE du TYPE affiché (colonne « Type »). Libellés = ceux du dépôt (priorite.ts). Le rang le plus PETIT
 * l'emporte (le plus prioritaire) ; les rangs sont DISTINCTS (array_agg DISTINCT côté SQL) → un même type ne compte jamais 2×.
 */
describe('D3 — typeDemande (rangs → libellé + « +N » + title)', () => {
  // Libellés réels du dépôt (rangs distincts, valeurs d'exemple : seule leur relation d'ordre compte).
  const CATS = [
    { libelle: 'Immeuble neuf', rang: 1 },
    { libelle: 'Surélévation', rang: 2 },
    { libelle: 'Construction neuve', rang: 3 },
    { libelle: 'Extension', rang: 4 },
    { libelle: 'Démolition', rang: 5 },
  ];

  it('un seul type → un badge, pas de « +N »', () => {
    expect(typeDemande([3], CATS)).toEqual({ vide: false, libelle: 'Construction neuve', nAutres: 0, attenue: false, titre: 'Construction neuve' });
  });

  it('plusieurs dossiers du MÊME type (rangs dupliqués) → un seul badge, PAS de « +N »', () => {
    expect(typeDemande([3, 3, 3], CATS)).toMatchObject({ libelle: 'Construction neuve', nAutres: 0 });
  });

  it('types différents → badge du plus prioritaire (rang le plus petit) + « +N » + title de TOUS les types', () => {
    const t = typeDemande([4, 1, 3], CATS); // sortis dans le désordre
    expect(t.libelle).toBe('Immeuble neuf'); // rang 1 = le plus prioritaire
    expect(t.nAutres).toBe(2);
    expect(t.titre).toBe('Immeuble neuf, Construction neuve, Extension'); // ordre de priorité
    expect(t.attenue).toBe(false);
  });

  it('catégorie « autre » (rang 9999) → libellé « Autre » atténué, jamais vide', () => {
    expect(typeDemande([9999], CATS)).toEqual({ vide: false, libelle: 'Autre', nAutres: 0, attenue: true, titre: 'Autre' });
  });

  it('« autre » combiné à un vrai type → le vrai type prime, « Autre » listé en dernier dans le title', () => {
    const t = typeDemande([9999, 1], CATS);
    expect(t.libelle).toBe('Immeuble neuf');
    expect(t.attenue).toBe(false);
    expect(t.nAutres).toBe(1);
    expect(t.titre).toBe('Immeuble neuf, Autre');
  });

  it('aucun rang (liste vide, undefined, ou rang hors référentiel) → vide (la cellule affichera « — »)', () => {
    expect(typeDemande([], CATS).vide).toBe(true);
    expect(typeDemande(undefined, CATS).vide).toBe(true);
    expect(typeDemande([7777], CATS).vide).toBe(true); // rang inconnu, ni catégorie ni 9999
  });
});

/**
 * P1 — recherche par RÉFÉRENCE (un seul champ pour la réf. SVAV ET la réf. mairie). Comparaison sur forme NORMALISÉE des deux
 * côtés (majuscules, espaces et tirets ignorés), en sous-chaîne → la forme courte de la SVAV et une réf. dictée au téléphone
 * matchent. Absente/'' = aucun filtre (OPT-IN, défaut off) → les tests D2 ci-dessus (sans `reference`) restent inchangés.
 */
describe('P1 — filtrerDemandes : recherche par référence (SVAV ou mairie)', () => {
  const liste = [
    D({ id: 1, reference: 'SVAV-DEM-2026-000119', referencesExternes: ['SLC260810440700'] }),
    D({ id: 2, reference: 'SVAV-DEM-2026-000042', referencesExternes: [] }),
  ];
  const cherche = (reference: string) => filtrerDemandes(liste, { statut: '', profil: '', commune: '', types: [], reference }).map((d) => d.id);

  it('trouve par référence mairie EXACTE', () => { expect(cherche('SLC260810440700')).toEqual([1]); });
  it('trouve malgré une CASSE différente', () => { expect(cherche('slc260810440700')).toEqual([1]); });
  it('trouve malgré des ESPACES/tirets parasites (dictée au téléphone)', () => { expect(cherche('  slc-2608 1044 0700 ')).toEqual([1]); });
  it('trouve par référence SVAV COMPLÈTE', () => { expect(cherche('SVAV-DEM-2026-000042')).toEqual([2]); });
  it('trouve par FORME COURTE de la SVAV (2026-000119)', () => { expect(cherche('2026-000119')).toEqual([1]); });
  it('rien trouvé → liste vide (la Vue affiche un message explicite)', () => { expect(cherche('ZZZ-INEXISTANTE')).toEqual([]); });
  it('référence vide → aucun filtre (toutes les demandes)', () => { expect(cherche('')).toEqual([1, 2]); });
  it('la référence se combine (ET) avec les autres filtres', () => {
    // D() par défaut statut 'brouillon' : la réf. 000119 (demande 1) passe avec statut 'brouillon', mais pas avec 'prete'.
    expect(filtrerDemandes(liste, { statut: 'brouillon', profil: '', commune: '', types: [], reference: '000119' }).map((d) => d.id)).toEqual([1]);
    expect(filtrerDemandes(liste, { statut: 'prete', profil: '', commune: '', types: [], reference: '000119' }).map((d) => d.id)).toEqual([]);
  });

  it('normaliserReference : MAJUSCULES, espaces et tirets supprimés', () => {
    expect(normaliserReference(' slc-2608 1044 ')).toBe('SLC26081044');
    expect(normaliserReference('SVAV-DEM-2026-000119')).toBe('SVAVDEM2026000119');
  });
});

describe('Q6 — périmètres des onglets (« À demander » / « En cours ») : hermétiques et disjoints', () => {
  const cinq = [
    D({ id: 1, statut: 'brouillon' }),
    D({ id: 2, statut: 'prete' }),
    D({ id: 3, statut: 'envoyee' }),
    D({ id: 4, statut: 'close' }),
    D({ id: 5, statut: 'abandonnee' }),
  ];

  it('« en cours » n’affiche NI brouillon, NI prête, NI abandonnée — même avec « Tous » en aval', () => {
    const enCours = dansPerimetre(cinq, 'en_cours');
    expect(enCours.map((d) => d.statut).sort()).toEqual(['close', 'envoyee']);
    // même en filtrant explicitement sur un statut de l'AUTRE périmètre : jamais dans l'ensemble
    expect(filtrerDemandes(enCours, { statut: 'brouillon', profil: '', commune: '', types: [] })).toHaveLength(0);
    // « Tous » (statut '') ne ramène QUE le périmètre, jamais l'autre
    expect(filtrerDemandes(enCours, { statut: '', profil: '', commune: '', types: [] }).map((d) => d.statut).sort()).toEqual(['close', 'envoyee']);
  });

  it('« à demander » n’affiche NI envoyée, NI close — même avec « Tous »', () => {
    const aDemander = dansPerimetre(cinq, 'a_demander');
    expect(aDemander.map((d) => d.statut).sort()).toEqual(['abandonnee', 'brouillon', 'prete']);
    expect(filtrerDemandes(aDemander, { statut: 'envoyee', profil: '', commune: '', types: [] })).toHaveLength(0);
    expect(filtrerDemandes(aDemander, { statut: '', profil: '', commune: '', types: [] })).toHaveLength(3);
  });

  it('le sélecteur Statut de chaque onglet ne propose QUE ses statuts', () => {
    expect(statutsDuPerimetre('a_demander')).toEqual(['brouillon', 'prete', 'abandonnee']);
    expect(statutsDuPerimetre('en_cours')).toEqual(['envoyee', 'close']);
  });

  it('périmètres DISJOINTS et COUVRANT les cinq statuts (aucun orphelin)', () => {
    const a = new Set(STATUTS_A_DEMANDER), b = new Set(STATUTS_EN_COURS);
    expect([...a].some((s) => b.has(s))).toBe(false); // disjoints
    expect(new Set([...a, ...b])).toEqual(new Set(['brouillon', 'prete', 'abandonnee', 'envoyee', 'close'])); // couvrants
  });

  it('les actions groupées (« à demander ») ne peuvent viser que des statuts du périmètre : leur ensemble sélectionnable n’a aucun envoyée/close', () => {
    // la sélection ne porte que sur les demandes AFFICHÉES = dansPerimetre('a_demander')
    const selectionnables = dansPerimetre(cinq, 'a_demander');
    expect(selectionnables.every((d) => STATUTS_A_DEMANDER.includes(d.statut))).toBe(true);
    expect(selectionnables.some((d) => d.statut === 'envoyee' || d.statut === 'close')).toBe(false);
  });

  it('tri/pagination sur l’ENSEMBLE du périmètre : dansPerimetre renvoie tout le périmètre AVANT tout slice', () => {
    const envoyees = Array.from({ length: 25 }, (_, i) => D({ id: i + 1, statut: 'envoyee' }));
    const bruit = Array.from({ length: 10 }, (_, i) => D({ id: 100 + i, statut: 'brouillon' }));
    const enCours = dansPerimetre([...envoyees, ...bruit], 'en_cours');
    expect(enCours).toHaveLength(25);                                   // tout le périmètre (pas une page de 20)
    expect(trierDemandes(enCours, { colonne: 'dossiers', sens: 'desc' })).toHaveLength(25);
  });
});
