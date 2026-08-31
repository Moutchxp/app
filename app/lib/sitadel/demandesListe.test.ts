import { describe, it, expect } from 'vitest';
import {
  basculerTri, filtrerDemandes, trierDemandes, OPTIONS_TRI, cleTri, triDepuisCle, SENS_DEFAUT, typeDemande, normaliserReference,
  correspondReference,
  dansPerimetre, statutsDuPerimetre, STATUTS_A_DEMANDER, STATUTS_EN_COURS,
  statutsVivants, statutsMorts, statutsAffiches, CHOIX_STATUT_DEFAUT, partitionnerParDus, visiblesEnCours,
  categorieEnCours, CATEGORIE_EN_COURS_LIBELLE, estVivanteEnCours, estEnCoursAffichee, compterEnCoursParProcess,
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

describe('T2-C — partitionnerParDus : « En cours » masque les demandes sans dossier dû (comme Réponses)', () => {
  it('≥ 1 dossier dû → vivante (reste visible) ; ex. 4 attachés dont 1 dû', () => {
    const { vivantes, soldees, sansDossier } = partitionnerParDus([D({ id: 1, nbDossiers: 4, dossiersDus: 1 })]);
    expect(vivantes.map((d) => d.id)).toEqual([1]);
    expect(soldees).toHaveLength(0); expect(sansDossier).toHaveLength(0);
  });
  it('des dossiers attachés, tous obtenus (0 dû) → soldée (masquée)', () => {
    const { vivantes, soldees } = partitionnerParDus([D({ id: 2, nbDossiers: 1, dossiersDus: 0 })]);
    expect(vivantes).toHaveLength(0);
    expect(soldees.map((d) => d.id)).toEqual([2]);
  });
  it('plus aucun dossier attaché (tous retirés) → sans dossier actif (masquée)', () => {
    const { soldees, sansDossier } = partitionnerParDus([D({ id: 3, nbDossiers: 0, dossiersDus: 0 })]);
    expect(soldees).toHaveLength(0);
    expect(sansDossier.map((d) => d.id)).toEqual([3]);
  });
  it('repli SÛR : dossiersDus absent → tout dû → jamais masqué à tort', () => {
    const { vivantes } = partitionnerParDus([D({ id: 4, nbDossiers: 2, dossiersDus: undefined })]);
    expect(vivantes.map((d) => d.id)).toEqual([4]);
  });
});

describe('T8 — visiblesEnCours : les soldées sont TOUJOURS exclues (non révélable), les sansDossier restent révélables', () => {
  const vivante = D({ id: 1, nbDossiers: 2, dossiersDus: 1 });
  const soldee119 = D({ id: 119, nbDossiers: 1, dossiersDus: 0 });  // tous dossiers marqués reçus (satisfait_le) → foyer Archives
  const sansDoss = D({ id: 3, nbDossiers: 0, dossiersDus: 0 });
  const liste = [vivante, soldee119, sansDoss];

  it('la 119 (soldée) est ABSENTE au défaut ET sous un filtre explicite (quel que soit le statut choisi)', () => {
    expect(visiblesEnCours(liste, true).map((d) => d.id)).toEqual([1]);        // défaut : vivante seule
    expect(visiblesEnCours(liste, false).map((d) => d.id).sort()).toEqual([1, 3]); // filtre explicite : sansDossier révélé, MAIS pas la 119
    expect(visiblesEnCours(liste, false).some((d) => d.id === 119)).toBe(false); // la soldée n'apparaît JAMAIS
  });

  it('une demande PARTIELLEMENT satisfaite (≥ 1 dossier dû) reste dans « En cours »', () => {
    expect(visiblesEnCours([vivante], true).map((d) => d.id)).toEqual([1]);
    expect(visiblesEnCours([vivante], false).map((d) => d.id)).toEqual([1]);
  });
});

// 🔴 FIX-2 — un « dossier partiel » ACTIF garde le permis dans « En cours » MÊME à 0 dossier dû (dossier satisfait mais incomplet, la
//   réclamation court). Foyer UNIQUE estVivanteEnCours : liste (partitionnerParDus/visiblesEnCours) ET compteur (estEnCoursAffichee).
describe('FIX-2 — le marqueur « dossier partiel » actif garde la demande dans « En cours » à 0 dossier dû', () => {
  const suspension = { le: '2026-08-31T00:23:55Z', familles: ['etage', 'cerfa'], origine: 'declaree' as const };

  it('estVivanteEnCours : suspension active → vivant même à 0 dû ; sans suspension + 0 dû → non vivant', () => {
    expect(estVivanteEnCours({ nbDossiers: 1, dossiersDus: 0, suspension })).toBe(true);   // partiel actif
    expect(estVivanteEnCours({ nbDossiers: 1, dossiersDus: 0 })).toBe(false);               // soldée ordinaire
    expect(estVivanteEnCours({ nbDossiers: 2, dossiersDus: 1 })).toBe(true);                // ≥ 1 dû
  });

  it('partitionnerParDus : la partielle à 0 dû est VIVANTE (plus soldée) quand le marqueur est attaché', () => {
    const partielle = D({ id: 154, nbDossiers: 1, dossiersDus: 0, suspension } as Partial<LigneDemande>);
    const { vivantes, soldees } = partitionnerParDus([partielle]);
    expect(vivantes.map((d) => d.id)).toEqual([154]);
    expect(soldees).toHaveLength(0);
    // sans le marqueur, la MÊME demande (dus=0) reste soldée : le marqueur est le seul discriminant.
    expect(partitionnerParDus([D({ id: 154, nbDossiers: 1, dossiersDus: 0 })]).soldees.map((d) => d.id)).toEqual([154]);
  });

  it('visiblesEnCours : la partielle à 0 dû apparaît (défaut ET filtre explicite)', () => {
    const partielle = D({ id: 154, nbDossiers: 1, dossiersDus: 0, suspension } as Partial<LigneDemande>);
    expect(visiblesEnCours([partielle], true).map((d) => d.id)).toEqual([154]);
    expect(visiblesEnCours([partielle], false).map((d) => d.id)).toEqual([154]);
  });

  // Cas RÉEL demande 154 : statut envoyée, 1 dossier actif satisfait (dus=0), partiel 'declaree' actif, aucun lien en attente.
  it('cas réel 154 : estEnCoursAffichee = true et catégorie « En relance »', () => {
    const d154 = { statut: 'envoyee', dossiersActifs: 1, dossiersSatisfaits: 1, nbReponsesReelles: 3, dossiers: [{ triage: 'documents' }], suspension, lienEnAttente: false };
    expect(estEnCoursAffichee(d154)).toBe(true); // AVANT FIX-2 : dus=0 → false (permis piégé hors En cours)
    expect(categorieEnCours(d154)).toBe('relance');
    expect(CATEGORIE_EN_COURS_LIBELLE.relance).toBe('En relance');
  });

  // LOT-10 — une demande SAISISSABLE (saisine CADA possible) quitte « En cours » pour « Saisines CADA » (invariant « jamais dans deux
  //   onglets »). Le flag est DÉRIVÉ → réversible : dès qu'il retombe, la demande revient. MÊME prédicat pour la liste ET le compteur.
  const enCoursBase = { statut: 'envoyee', canal: 'email', dossiersActifs: 1, dossiersSatisfaits: 0, nbReponsesReelles: 0, dossiers: [{ triage: null }] };
  it('LOT-10 — saisissable → hors En cours ; flag retombé → de retour (réversible)', () => {
    expect(estEnCoursAffichee({ ...enCoursBase }), 'non saisissable → en En cours').toBe(true);
    expect(estEnCoursAffichee({ ...enCoursBase, saisissable: true }), 'saisissable → hors En cours').toBe(false);
    expect(estEnCoursAffichee({ ...enCoursBase, saisissable: false }), 'flag retombé → de retour').toBe(true);
  });
  it('LOT-10 — compterEnCoursParProcess : le compteur SUIT la liste (les saisissables ne comptent plus)', () => {
    const compte = compterEnCoursParProcess([{ ...enCoursBase }, { ...enCoursBase, saisissable: true }]);
    expect(compte.email, 'seule la non-saisissable reste en En cours').toBe(1);
  });
});

describe('PART-B — categorieEnCours : deux catégories exhaustives et exclusives (1re demande / en relance)', () => {
  it('suspension active → « relance » (dossier partiel)', () => {
    expect(categorieEnCours({ suspension: { le: '2026-08-30', familles: [], origine: 'outil' } })).toBe('relance');
  });
  it('sans suspension (null / absente) → « premiere » (attend une 1re réponse)', () => {
    expect(categorieEnCours({ suspension: null })).toBe('premiere');
    expect(categorieEnCours({})).toBe('premiere');
  });
  it('exhaustif ET exclusif : tout jeu se répartit dans les deux catégories, la somme = total (compteur exact)', () => {
    const jeu = [{ suspension: null }, { suspension: {} }, {}, { suspension: { le: 'x', familles: [], origine: 'declaree' as const } }];
    const relance = jeu.filter((d) => categorieEnCours(d) === 'relance').length;
    const premiere = jeu.filter((d) => categorieEnCours(d) === 'premiere').length;
    expect(relance).toBe(2);
    expect(premiere).toBe(2);
    expect(relance + premiere).toBe(jeu.length); // aucun permis hors catégorie, aucun compté deux fois
  });
  it('libellés d’affichage exposés (une seule vérité, réutilisée en-tête + colonne)', () => {
    expect(CATEGORIE_EN_COURS_LIBELLE.premiere).toBe('1re demande');
    expect(CATEGORIE_EN_COURS_LIBELLE.relance).toBe('En relance');
  });
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
    D({ id: 5, statut: 'annulee' }),
  ];

  it('« en cours » n’affiche NI brouillon, NI prête, NI annulée — même avec « Tous » en aval', () => {
    const enCours = dansPerimetre(cinq, 'en_cours');
    expect(enCours.map((d) => d.statut).sort()).toEqual(['close', 'envoyee']);
    // même en filtrant explicitement sur un statut de l'AUTRE périmètre : jamais dans l'ensemble
    expect(filtrerDemandes(enCours, { statut: 'brouillon', profil: '', commune: '', types: [] })).toHaveLength(0);
    // « Tous » (statut '') ne ramène QUE le périmètre, jamais l'autre
    expect(filtrerDemandes(enCours, { statut: '', profil: '', commune: '', types: [] }).map((d) => d.statut).sort()).toEqual(['close', 'envoyee']);
  });

  it('« à demander » n’affiche NI envoyée, NI close — même avec « Tous »', () => {
    const aDemander = dansPerimetre(cinq, 'a_demander');
    expect(aDemander.map((d) => d.statut).sort()).toEqual(['annulee', 'brouillon', 'prete']);
    expect(filtrerDemandes(aDemander, { statut: 'envoyee', profil: '', commune: '', types: [] })).toHaveLength(0);
    expect(filtrerDemandes(aDemander, { statut: '', profil: '', commune: '', types: [] })).toHaveLength(3);
  });

  it('le sélecteur Statut de chaque onglet ne propose QUE ses statuts', () => {
    expect(statutsDuPerimetre('a_demander')).toEqual(['brouillon', 'prete', 'annulee']);
    expect(statutsDuPerimetre('en_cours')).toEqual(['envoyee', 'close']);
  });

  it('périmètres DISJOINTS et COUVRANT les cinq statuts (aucun orphelin)', () => {
    const a = new Set(STATUTS_A_DEMANDER), b = new Set(STATUTS_EN_COURS);
    expect([...a].some((s) => b.has(s))).toBe(false); // disjoints
    expect(new Set([...a, ...b])).toEqual(new Set(['brouillon', 'prete', 'annulee', 'envoyee', 'close'])); // couvrants
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

describe('D3 — correspondReference cherche AUSSI par n° de permis (num_dau)', () => {
  const d = (over: Partial<Parameters<typeof correspondReference>[0]> = {}) => ({
    id: 1, reference: 'SVAV-DEM-2026-000119', communeNom: 'Paris', codeInsee: '75056', nbDossiers: 1, statut: 'envoyee', profil: 'entreprise', creeLe: '2026-08-01',
    referencesExternes: ['SLC260810440700'], numeros: ['07510124V0034'], ...over,
  });
  it('trouve par SVAV, par référence mairie ET par num_dau', () => {
    expect(correspondReference(d(), 'SVAV-DEM-2026-000119')).toBe(true);
    expect(correspondReference(d(), 'SLC2608')).toBe(true);
    expect(correspondReference(d(), '07510124V0034')).toBe(true); // n° de permis
    expect(correspondReference(d(), 'v0034')).toBe(true);         // sous-chaîne, casse/tirets ignorés
  });
  it('num_dau absent → pas de faux positif', () => {
    expect(correspondReference(d({ numeros: [] }), '07510124V0034')).toBe(false);
  });
});

describe('Q6b — statuts vivants / morts + défaut qui masque les morts (sans toucher au périmètre Q6)', () => {
  it('le DÉFAUT est « vivants », pas « tous »', () => {
    expect(CHOIX_STATUT_DEFAUT).toBe('vivants');
  });

  it('vivants / morts par onglet (partition exacte du périmètre)', () => {
    expect(statutsVivants('a_demander')).toEqual(['brouillon', 'prete']);
    expect(statutsMorts('a_demander')).toEqual(['annulee']);
    expect(statutsVivants('en_cours')).toEqual(['envoyee']);
    expect(statutsMorts('en_cours')).toEqual(['close']);
    // vivants ∪ morts = périmètre (rien perdu, rien ajouté)
    for (const p of ['a_demander', 'en_cours'] as const) {
      expect([...statutsVivants(p), ...statutsMorts(p)].sort()).toEqual([...statutsDuPerimetre(p)].sort());
    }
  });

  it('le DÉFAUT (vivants) n’inclut NI annulée NI close', () => {
    expect(statutsAffiches('a_demander', CHOIX_STATUT_DEFAUT)).not.toContain('annulee');
    expect(statutsAffiches('a_demander', CHOIX_STATUT_DEFAUT)).toEqual(['brouillon', 'prete']);
    expect(statutsAffiches('en_cours', CHOIX_STATUT_DEFAUT)).not.toContain('close');
    expect(statutsAffiches('en_cours', CHOIX_STATUT_DEFAUT)).toEqual(['envoyee']);
  });

  it('« tous » ramène TOUT le périmètre (morts compris) — et JAMAIS l’autre onglet (non-régression Q6)', () => {
    expect([...statutsAffiches('a_demander', 'tous')].sort()).toEqual(['annulee', 'brouillon', 'prete']);
    expect([...statutsAffiches('en_cours', 'tous')].sort()).toEqual(['close', 'envoyee']);
    // hermeticité : « tous » de « à demander » ne contient aucun statut de « en cours », et réciproquement
    expect(statutsAffiches('a_demander', 'tous').some((s) => (STATUTS_EN_COURS as string[]).includes(s))).toBe(false);
    expect(statutsAffiches('en_cours', 'tous').some((s) => (STATUTS_A_DEMANDER as string[]).includes(s))).toBe(false);
  });

  it('un statut PRÉCIS n’est rendu que s’il appartient au périmètre (sinon [] : jamais l’autre onglet)', () => {
    expect(statutsAffiches('a_demander', 'annulee')).toEqual(['annulee']); // un mort, isolable à la demande
    expect(statutsAffiches('a_demander', 'brouillon')).toEqual(['brouillon']);
    expect(statutsAffiches('a_demander', 'close')).toEqual([]);   // 'close' est de l’AUTRE onglet → rien
    expect(statutsAffiches('en_cours', 'brouillon')).toEqual([]); // 'brouillon' est de l’AUTRE onglet → rien
  });
});
