import { describe, expect, it } from 'vitest';
import {
  agoApres, agosOfficielles, alerteRestitution, clotureExercice, datesManquantes, libelleAlerte, libelleExercice, MENTION_INCERTAINE, MENTION_SANS_AGO,
  suiviVingtPourcent, transposer, categorieVingt, classerVingtPourcent, joursRestantsVingt, montantEuros, montantFr, verifierRestitution, etiquetteAgo, compteAReboursVingt, correspondRecherche, filtrerVingtPourcent, blocsOuvertsPourRecherche, capsulesAgo, datesManquantesVisibles, nombreSansDate, pastilleVingt, agoAConfirmer, MENTION_AGO_A_CONFIRMER, nombreUrgences, nombreRetards, niveauBoutonVingt, nombreAPreparer, detailAPreparer, type LigneVingtPourcent,
} from './vingtPourcent';
import { ajouterMois } from './preavis';

/**
 * 🔴🔴 Arno (23/11/2026) — LE SUIVI DES 20 % RETENUS. Exemple de référence : aujourd'hui 23/11/2026, arrêté 31/12, dernière AGO 25/03/2026.
 * A sorti le 15/11/2026 → exercice 2026 → AGO projetée 25/03/2027 → restitution ≤ 25/04/2027. B sorti le 10/01/2027 → exercice 2027 → AGO
 * projetée 25/03/2028. AGO officielle 2027 saisie au 15/03/2027 → A : 15/03/2027 (≤ 15/04/2027) ; B : projetée recalée au 15/03/2028.
 */
const AUJ = '2026-11-23';
const AU_31_12 = { jour: 31, mois: 12 };

describe('l’exemple de référence d’Arno', () => {
  const avant = ['2026-03-25'];
  const apres = ['2026-03-25', '2027-03-15'];
  it('A (sorti le 15/11/2026) : exercice clos le 31/12/2026, AGO projetée 25/03/2027, restitution au plus tard le 25/04/2027', () => {
    const a = suiviVingtPourcent({ dateSortie: '2026-11-15', valideLe: '2026-11-20', arrete: AU_31_12, officielles: avant, aujourdhui: AUJ });
    expect(a).toMatchObject({ etat: 'ok', exercice: '2026-12-31', ago: { date: '2027-03-25', statut: 'projetee' }, incertaine: false, limite: '2027-04-25' });
    expect(libelleExercice(a.exercice)).toBe('Exercice clos le 31/12/2026');
  });
  it('B (sorti le 10/01/2027) : exercice 2027, AGO projetée 25/03/2028', () => {
    expect(suiviVingtPourcent({ dateSortie: '2027-01-10', valideLe: '2027-01-12', arrete: AU_31_12, officielles: avant, aujourdhui: AUJ }))
      .toMatchObject({ exercice: '2027-12-31', ago: { date: '2028-03-25', statut: 'projetee' }, limite: '2028-04-25' });
  });
  it('AGO officielle 2027 saisie au 15/03/2027 : A passe à l’officielle (≤ 15/04/2027), B se recale au 15/03/2028', () => {
    expect(suiviVingtPourcent({ dateSortie: '2026-11-15', valideLe: '2026-11-20', arrete: AU_31_12, officielles: apres, aujourdhui: AUJ }))
      .toMatchObject({ ago: { date: '2027-03-15', statut: 'officielle' }, limite: '2027-04-15' });
    expect(suiviVingtPourcent({ dateSortie: '2027-01-10', valideLe: '2027-01-12', arrete: AU_31_12, officielles: apres, aujourdhui: AUJ }))
      .toMatchObject({ ago: { date: '2028-03-15', statut: 'projetee' }, limite: '2028-04-15' });
  });
});

describe('les cas aux limites', () => {
  it('sortie LE JOUR de l’arrêté : cet exercice-là', () => {
    expect(clotureExercice('2026-12-31', AU_31_12)).toBe('2026-12-31');
    expect(suiviVingtPourcent({ dateSortie: '2026-12-31', valideLe: '2027-01-05', arrete: AU_31_12, officielles: ['2026-03-25'], aujourdhui: AUJ }))
      .toMatchObject({ exercice: '2026-12-31', ago: { date: '2027-03-25' } });
    expect(clotureExercice('2027-01-01', AU_31_12)).toBe('2027-12-31');
  });
  it('sortie APRÈS l’AGO de l’année (10/05/2026, AGO tenue le 25/03/2026) : exercice 2026, AGO de 2027', () => {
    expect(suiviVingtPourcent({ dateSortie: '2026-05-10', valideLe: '2026-05-12', arrete: AU_31_12, officielles: ['2026-03-25'], aujourdhui: AUJ }))
      .toMatchObject({ exercice: '2026-12-31', ago: { date: '2027-03-25', statut: 'projetee' } });
  });
  it('arrêté au 30/06 : une sortie du 15/11/2026 relève de l’exercice clos le 30/06/2027 ; l’AGO qui suit (septembre) est projetée en 2027', () => {
    const r = suiviVingtPourcent({ dateSortie: '2026-11-15', valideLe: '2026-11-20', arrete: { jour: 30, mois: 6 }, officielles: ['2026-09-22'], aujourdhui: AUJ });
    expect(r).toMatchObject({ exercice: '2027-06-30', ago: { date: '2027-09-22', statut: 'projetee' }, limite: '2027-10-22' });
    expect(clotureExercice('2026-06-30', { jour: 30, mois: 6 })).toBe('2026-06-30');
    expect(clotureExercice('2026-07-01', { jour: 30, mois: 6 })).toBe('2027-06-30');
  });
  it('arrêté MANQUANT : la première AGO après la validation, « Projection incertaine » ; jamais avant la validation (22/09/2020 → 22/09/2027)', () => {
    const r = suiviVingtPourcent({ dateSortie: '2026-11-15', valideLe: '2026-11-23', arrete: null, officielles: ['2020-09-22'], aujourdhui: AUJ });
    expect(r).toMatchObject({ etat: 'ok', exercice: null, ago: { date: '2027-09-22', statut: 'projetee' }, incertaine: true, limite: '2027-10-22' });
    expect(MENTION_INCERTAINE).toBe('Projection incertaine — date d’arrêté des comptes manquante');
    expect(libelleExercice(null)).toBe('Exercice inconnu (date d’arrêté des comptes manquante)');
  });
  it('arrêté connu mais la projection tomberait AVANT la validation : reportée à l’année suivante (jamais antérieure)', () => {
    // exercice clos le 31/12/2024 ; dernière AGO 22/09/2020 → projection 2025 < validation (23/11/2026) → 22/09/2027
    expect(suiviVingtPourcent({ dateSortie: '2024-06-01', valideLe: '2026-11-23', arrete: AU_31_12, officielles: ['2020-09-22'], aujourdhui: AUJ }))
      .toMatchObject({ exercice: '2024-12-31', ago: { date: '2027-09-22', statut: 'projetee' } });
  });
  it('dernière AGO MANQUANTE : pas de projection, « Dernière AGO inconnue »', () => {
    expect(suiviVingtPourcent({ dateSortie: '2026-11-15', valideLe: '2026-11-20', arrete: AU_31_12, officielles: [], aujourdhui: AUJ }))
      .toEqual({ etat: 'sans_ago', exercice: '2026-12-31', mention: MENTION_SANS_AGO });
    expect(MENTION_SANS_AGO).toBe('Dernière AGO inconnue');
  });
  it('un 29/02 se transpose au 28/02 hors année bissextile', () => {
    expect(transposer('2024-02-29', 2027)).toBe('2027-02-28');
    expect(transposer('2024-02-29', 2028)).toBe('2028-02-29');
    expect(agoApres(['2024-02-29'], '2026-12-31', '2026-12-31')).toEqual({ date: '2027-02-28', statut: 'projetee' });
  });
});

describe('ce qui sert au calcul, et l’alerte', () => {
  it('seules les AGO OFFICIELLES comptent : ni les projetées enregistrées à la sortie, ni les AGE', () => {
    expect(agosOfficielles([
      { statut: 'officielle', date: '2026-03-25', nature: 'ago' }, { statut: 'projetee', date: '2027-03-25', nature: 'ago' },
      { statut: 'officielle', date: '2026-06-01', nature: 'age' }, { statut: 'officielle', date: null, nature: 'ago' },
      { statut: 'officielle', date: '2026-03-25' },
    ])).toEqual(['2026-03-25']);
  });
  it('alerte : à venir, proche (≤ 30 jours), dépassée — toujours avec la date en mots', () => {
    expect(alerteRestitution('2027-04-25', AUJ)).toMatchObject({ alerte: 'a_venir' });
    expect(alerteRestitution('2026-12-20', AUJ)).toEqual({ alerte: 'proche', joursRestants: 27 });
    expect(alerteRestitution('2026-11-20', AUJ)).toEqual({ alerte: 'depassee', joursRestants: -3 });
    expect(libelleAlerte('depassee', '2026-11-20', -3)).toBe('Restitution en retard — la limite du 20/11/2026 est dépassée de 3 jours');
    expect(libelleAlerte('proche', '2026-12-20', 27)).toBe('Restitution à faire bientôt — au plus tard le 20/12/2026 (dans 27 jours)');
    expect(libelleAlerte('a_venir', '2027-04-25', 153)).toBe('À restituer au plus tard le 25/04/2027');
  });
});

describe('🔴 la rubrique « Dates / copropriétés manquantes » (règle 5)', () => {
  const copro = (cle: string, libelle: string, id: number | null = 1) => ({ cle, coproprieteId: id, libelle, immeuble: libelle, lotId: 9 });
  it('ce qui manque, les locataires (noms, sans doublon) ; une copropriété complète n’y figure pas ; triée par nom', () => {
    expect(datesManquantes([
      { copro: copro('b', 'B rue'), arrete: null, officielles: [], locataires: ['DUPONT'] },
      { copro: copro('b', 'B rue'), arrete: null, officielles: [], locataires: ['DUPONT', 'MARTIN'] },
      { copro: copro('a', 'A rue'), arrete: null, officielles: ['2026-03-25'], locataires: ['DURAND'] },
      { copro: copro('c', 'C rue'), arrete: AU_31_12, officielles: ['2026-03-25'], locataires: ['X'] },
    ])).toEqual([
      { ...copro('a', 'A rue'), manque: ['arrete'], locataires: ['DURAND'] },
      { ...copro('b', 'B rue'), manque: ['derniere_ago', 'arrete'], locataires: ['DUPONT', 'MARTIN'] },
    ]);
  });
});

/** 🔴🔴 Arno (24/11/2026) — les catégories exclusives de l'écran « 20 % à restituer » : bornes, tri, exclusivité. */
describe('🔴🔴 Arno (24/11/2026) — categorieVingt / classerVingtPourcent', () => {
  const AUJ = '2026-11-24';
  const plus = (j: number): string => { const d = new Date(Date.parse(`${AUJ}T12:00:00Z`) + j * 86_400_000); return d.toISOString().slice(0, 10); };
  let n = 0;
  const ligne = (ago: string | null, statut: 'officielle' | 'projetee' = 'projetee', o: Partial<LigneVingtPourcent> = {}): LigneVingtPourcent => ({
    sortieId: ++n, lotId: n, locataires: [`LOC ${n}`], logement: null, dateSortie: '2026-01-15', valideLe: '2026-01-20',
    copropriete: { id: 1, libelle: 'Copro', aRattacher: false }, arrete: { jour: 31, mois: 12 }, cleCopro: 'copro-1',
    suivi: ago === null ? { etat: 'sans_ago', exercice: null, mention: MENTION_SANS_AGO }
      : { etat: 'ok', exercice: '2026-12-31', ago: { date: ago, statut }, incertaine: false, limite: ajouterMois(ago, 1), alerte: 'a_venir', joursRestants: 0 },
    ...o,
  });
  it('b / c : 🔴 (25/11, nouvelle règle) AG + 18 jours → « AGO passée » ; AG + 19 jours (le 20e jour) → « Urgence » ; le jour de l’AG → « AGO passée »', () => {
    expect(categorieVingt(ligne(plus(-18)), AUJ)).toBe('ag_passee');
    expect(categorieVingt(ligne(plus(-19)), AUJ)).toBe('urgence');
    expect(categorieVingt(ligne(AUJ), AUJ)).toBe('ag_passee');
    // 🔴 (25/11/2026, choix d'Arno) date limite dépassée (AG il y a 3 mois) : « Alerte restitution en retard », OFFICIELLE comme PROJETÉE
    expect(categorieVingt(ligne(plus(-90), 'officielle'), AUJ)).toBe('retard');
    expect(categorieVingt(ligne(plus(-90), 'projetee'), AUJ)).toBe('retard');
  });
  it('d / e : AG dans 30 jours → « AGO < 1 mois – À préparer » ; dans 31 jours → « AGO > 1 mois – En attente » ; 🔴 (25/11/2026) OFFICIELLE : même règle', () => {
    expect(categorieVingt(ligne(plus(30)), AUJ)).toBe('a_preparer');
    expect(categorieVingt(ligne(plus(31)), AUJ)).toBe('en_attente');
    expect(categorieVingt(ligne(plus(1)), AUJ)).toBe('a_preparer');
    // Arno (25/11/2026) — « un locataire dont la prochaine AG est planifiée dans plus de 200 jours se trouve dans la catégorie des AGO qui doivent se
    // tenir dans moins d'un mois, c'est illogique » : l'officielle lointaine part en « En attente » ; à 30 jours, elle est « À préparer »
    expect(categorieVingt(ligne(plus(30), 'officielle'), AUJ)).toBe('a_preparer');
    expect(categorieVingt(ligne(plus(31), 'officielle'), AUJ)).toBe('en_attente');
    expect(categorieVingt(ligne(plus(200), 'officielle'), AUJ)).toBe('en_attente');
  });
  // 🔴🔴 DÉCISION D'ARNO (24/11/2026, 23h20) : seuls les locataires SANS AUCUNE date calculable restent dans « Dates / copropriétés manquantes » ; une date
  // PROVISOIRE (dernière AGO connue, arrêté manquant ; ou bien sans copropriété avec une AGO connue) classe dans la catégorie réelle
  it('a : SEULEMENT sans aucune date calculable ; une date provisoire classe dans la catégorie réelle', () => {
    expect(categorieVingt(ligne(null), AUJ)).toBe('manquantes');
    // date provisoire (arrêté manquant : incertaine) d'une AGO officielle, limite dépassée : 🔴 (25/11, choix d'Arno) « Alerte » aussi
    const prov = ligne(plus(-90), 'officielle', { arrete: null });
    expect(categorieVingt({ ...prov, suivi: { ...prov.suivi, incertaine: true } as typeof prov.suivi }, AUJ)).toBe('retard');
    expect(categorieVingt(ligne(plus(10), 'projetee', { copropriete: null, arrete: null }), AUJ)).toBe('a_preparer');
  });
  it('le cas « _TEST ARRETE COMPTES 20 POURCENT Locataire 3 » : AGO projetée 22/09/2026, arrêté manquant, limite 22/10/2026 dépassée de 33 jours → 🔴 (25/11) « Alerte »', () => {
    const l = ligne('2026-09-22', 'projetee', { arrete: null });
    expect(l.suivi.etat === 'ok' && l.suivi.limite).toBe('2026-10-22');
    expect(categorieVingt(l, AUJ)).toBe('retard');
    expect(agoAConfirmer(l, AUJ)).toBe(true);                                      // la mention « AGO à confirmer » reste
    expect(classerVingtPourcent({ aujourdhui: AUJ, lignes: [l], manquantes: [] }).retard).toHaveLength(1);
  });
  it('EXCLUSIVITÉ et TRI : chaque ligne dans une seule catégorie ; b à e par date limite croissante ; a groupé par copropriété, sortie la plus ancienne d’abord', () => {
    // 🔴 (25/11, nouvelle règle) u1 et u2 en Urgence : 20e jour passé, limite pas encore passée
    const u1 = ligne(plus(-25)); const u2 = ligne(plus(-28)); const p1 = ligne(plus(5)); const e1 = ligne(plus(100)); const e2 = ligne(plus(60));
    const m1 = ligne(null, 'projetee', { cleCopro: 'copro-9', copropriete: { id: 9, libelle: 'Copro Z', aRattacher: false }, dateSortie: '2026-05-01' });
    const m2 = ligne(null, 'projetee', { cleCopro: 'copro-8', copropriete: { id: 8, libelle: 'Copro A', aRattacher: false }, dateSortie: '2026-03-01' });
    const m3 = ligne(null, 'projetee', { cleCopro: 'copro-9', copropriete: { id: 9, libelle: 'Copro Z', aRattacher: false }, dateSortie: '2026-02-01' });
    const manq = [{ cle: 'copro-8', coproprieteId: 8, libelle: 'Copro A', immeuble: null, lotId: 1, manque: ['derniere_ago' as const], locataires: [] },
      { cle: 'copro-9', coproprieteId: 9, libelle: 'Copro Z', immeuble: null, lotId: 1, manque: ['derniere_ago' as const], locataires: [] }];
    const c = classerVingtPourcent({ aujourdhui: AUJ, lignes: [u1, e1, m1, p1, u2, m2, e2, m3], manquantes: manq });
    expect(c.urgence.map((x) => x.sortieId)).toEqual([u2.sortieId, u1.sortieId]);
    expect(c.a_preparer.map((x) => x.sortieId)).toEqual([p1.sortieId]);
    expect(c.en_attente.map((x) => x.sortieId)).toEqual([e2.sortieId, e1.sortieId]);
    expect(c.manquantes.map((g) => [g.copro.cle, g.lignes.map((x) => x.sortieId)])).toEqual([['copro-9', [m3.sortieId, m1.sortieId]], ['copro-8', [m2.sortieId]]]);
    const toutes = [...c.manquantes.flatMap((g) => g.lignes), ...c.urgence, ...c.ag_passee, ...c.a_preparer, ...c.en_attente].map((x) => x.sortieId);
    expect(toutes.sort((a, b) => a - b)).toEqual([u1, e1, m1, p1, u2, m2, e2, m3].map((x) => x.sortieId).sort((a, b) => a - b));
  });
  it('les jours restants : « Dans 3 jours », « Aujourd’hui », « Date limite dépassée de 2 jours » (rouge)', () => {
    expect(joursRestantsVingt(3)).toEqual({ texte: 'Dans 3 jours', depasse: false });
    expect(joursRestantsVingt(0)).toEqual({ texte: 'Aujourd’hui', depasse: false });
    expect(joursRestantsVingt(-2)).toEqual({ texte: 'Date limite dépassée de 2 jours', depasse: true });
  });
});

describe('🔴 Arno (24/11/2026) — la saisie « Restitution faite »', () => {
  const O = { dateSortie: '2026-03-01', aujourdhui: '2026-11-24' };
  it('montants : « 1 234,56 », « 312.5 », 0 ; vide = absent ; illisible ou 3 décimales = refus', () => {
    expect([montantEuros('1 234,56'), montantEuros('312.5'), montantEuros(0), montantEuros(''), montantEuros('abc'), montantEuros('1,234'), montantEuros(-3)]).toEqual([1234.56, 312.5, 0, undefined, null, null, null]);
    expect(montantFr(1234.5)).toBe('1 234,50 €');
  });
  it('date obligatoire, entre la sortie et aujourd’hui ; montant restitué obligatoire ; retenu facultatif ; commentaire borné', () => {
    expect(verifierRestitution({ date: '2026-11-24', montantRestitue: '312,50' }, O)).toEqual({ ok: true, valeur: { date: '2026-11-24', montantRestitue: 312.5, montantRetenuCharges: null, commentaire: null } });
    expect(verifierRestitution({ date: '', montantRestitue: '1' }, O)).toMatchObject({ ok: false, champ: 'date' });
    expect(verifierRestitution({ date: '2026-02-28', montantRestitue: '1' }, O)).toMatchObject({ ok: false, champ: 'date' });
    expect(verifierRestitution({ date: '2026-11-25', montantRestitue: '1' }, O)).toMatchObject({ ok: false, champ: 'date' });
    expect(verifierRestitution({ date: '2026-11-24', montantRestitue: '' }, O)).toMatchObject({ ok: false, champ: 'montantRestitue' });
    expect(verifierRestitution({ date: '2026-11-24', montantRestitue: '1', montantRetenuCharges: 'x' }, O)).toMatchObject({ ok: false, champ: 'montantRetenuCharges' });
    expect(verifierRestitution({ date: '2026-11-24', montantRestitue: '1', commentaire: 'x'.repeat(2001) }, O)).toMatchObject({ ok: false, champ: 'commentaire' });
  });
});

describe('🔴🔴 Arno (24/11/2026, 23h40) — étiquette de l’AG et compte à rebours', () => {
  it('étiquette : ROUGE « AGO vers mars 2027 (projetée) », VERTE « AGO 15/03/2027 (officielle) »', () => {
    expect(etiquetteAgo({ date: '2027-03-15', statut: 'projetee' })).toEqual({ texte: 'AGO vers mars 2027 (projetée)', ton: 'rouge' });
    expect(etiquetteAgo({ date: '2027-03-15', statut: 'officielle' })).toEqual({ texte: 'AGO 15/03/2027 (officielle)', ton: 'vert' });
  });
  it('compte à rebours : AVANT l’AG « AG dans 40 jours » (gris) ; le jour de l’AG « J-31 » ; PENDANT « J-12 » ; la date limite « J-0 » ; APRÈS « Dépassé de 5 jours » (rouge)', () => {
    const ago = { date: '2027-03-15' }; const limite = '2027-04-15'; // 31 jours entre l'AG et la limite
    expect(compteAReboursVingt({ ago, limite, joursRestants: 71 })).toEqual({ texte: 'AG dans 40 jours', ton: 'gris' });
    expect(compteAReboursVingt({ ago, limite, joursRestants: 32 })).toEqual({ texte: 'AG dans 1 jour', ton: 'gris' });
    expect(compteAReboursVingt({ ago, limite, joursRestants: 31 })).toEqual({ texte: 'J-31', ton: 'normal' });
    expect(compteAReboursVingt({ ago, limite, joursRestants: 12 })).toEqual({ texte: 'J-12', ton: 'normal' });
    expect(compteAReboursVingt({ ago, limite, joursRestants: 0 })).toEqual({ texte: 'J-0', ton: 'normal' });
    expect(compteAReboursVingt({ ago, limite, joursRestants: -5 })).toEqual({ texte: 'Dépassé de 5 jours', ton: 'rouge' });
  });
});

describe('🔴🔴 Arno (24/11/2026, 23h53) — la recherche', () => {
  it('sans accents ni majuscules, mots partiels : chaque mot tapé doit se trouver quelque part', () => {
    expect(correspondRecherche(['MARTIN Léa', '2 rue des Écoles, 92800 Puteaux'], 'lea ecol')).toBe(true);
    expect(correspondRecherche(['MARTIN Léa'], 'LÉA mart')).toBe(true);
    expect(correspondRecherche(['MARTIN Léa'], 'lea dupont')).toBe(false);
    expect(correspondRecherche(['x'], '   ')).toBe(true);
  });
  it('filtre lignes (locataire, adresse du logement, propriétaire), copropriétés à compléter et restitutions faites ; vide : rien ne change', () => {
    const base = { sortieId: 1, lotId: 1, logement: '2 rue des Écoles', dateSortie: '2026-01-01', valideLe: '2026-01-02', copropriete: { id: 9, libelle: '2 rue des Écoles', aRattacher: false },
      arrete: null, cleCopro: 'copro-9', suivi: { etat: 'sans_ago' as const, exercice: null, mention: MENTION_SANS_AGO } };
    const lu = { aujourdhui: '2026-11-24', manquantes: [{ cle: 'copro-9', coproprieteId: 9, libelle: '2 rue des Écoles', immeuble: null, lotId: 1, manque: ['arrete' as const], locataires: ['MARTIN Léa'] }],
      lignes: [{ ...base, locataires: ['MARTIN Léa'], contacts: { locataires: [], proprietaires: [{ nom: 'Hélène DURAND', email: null, telephone: null }] } },
        { ...base, sortieId: 2, lotId: 2, logement: '5 avenue Foch', locataires: ['NOËL Paul'], cleCopro: 'lot-2', copropriete: null }],
      faites: [{ id: 1, sortieId: 3, locataires: ['PETIT Zoé'], logement: '8 rue Haute', dateSortie: '2026-01-01', date: '2026-11-01', montantRestitue: 1, montantRetenuCharges: null, commentaire: null, par: 'x', le: '2026-11-01 10:00' }] };
    expect(filtrerVingtPourcent(lu, '')).toBe(lu);
    expect(filtrerVingtPourcent(lu, 'helene').lignes.map((l) => l.sortieId)).toEqual([1]); // par le propriétaire
    expect(filtrerVingtPourcent(lu, 'noel').lignes.map((l) => l.sortieId)).toEqual([2]); // par le locataire
    expect(filtrerVingtPourcent(lu, 'FOCH').lignes.map((l) => l.sortieId)).toEqual([2]); // par l'adresse
    expect(filtrerVingtPourcent(lu, 'noel').manquantes).toEqual([]);
    expect(filtrerVingtPourcent(lu, 'ecoles').manquantes.map((m) => m.cle)).toEqual(['copro-9']);
    expect(filtrerVingtPourcent(lu, 'zoe').faites?.map((f) => f.id)).toEqual([1]);
    expect(filtrerVingtPourcent(lu, 'zoe').lignes).toEqual([]);
  });
});

/** 🔴🔴 Arno (25/11/2026) — « par défaut toutes les lignes de chaque catégorie sont fermées » : la recherche ouvre les blocs qui ont des résultats. */
describe('🔴🔴 Arno (25/11/2026) — les blocs ouverts par la recherche', () => {
  const ok = (sortieId: number, ago: string, locataires: string[]): LigneVingtPourcent => ({ sortieId, lotId: sortieId, locataires, logement: `${sortieId} rue Test`, dateSortie: '2026-01-15',
    valideLe: '2026-01-20', copropriete: { id: 1, libelle: 'Copro', aRattacher: false }, arrete: { jour: 31, mois: 12 }, cleCopro: 'copro-1',
    suivi: { etat: 'ok', exercice: '2025-12-31', ago: { date: ago, statut: 'projetee' }, incertaine: false, limite: ajouterMois(ago, 1), alerte: 'a_venir', joursRestants: 0 } });
  const lu = { aujourdhui: '2026-11-24', manquantes: [], lignes: [ok(1, '2026-11-01', ['URGENT Ana']), ok(2, '2027-09-01', ['ATTENTE Bob'])], // 🔴 (25/11) Ana : 24e jour, limite 01/12 → Urgence
    faites: [{ id: 1, sortieId: 3, locataires: ['FAIT Zoé'], logement: '8 rue Haute', dateSortie: '2026-01-01', date: '2026-11-01', montantRestitue: 1, montantRetenuCharges: null, commentaire: null, par: 'x', le: '2026-11-01 10:00' }] };
  it('sans recherche (ou que des espaces) : rien d’ouvert ; avec : les blocs qui ont des résultats, dans l’ordre de l’écran', () => {
    expect(blocsOuvertsPourRecherche(lu, '')).toEqual([]);
    expect(blocsOuvertsPourRecherche(lu, '   ')).toEqual([]);
    expect(blocsOuvertsPourRecherche(lu, 'ana')).toEqual(['urgence']);
    expect(blocsOuvertsPourRecherche(lu, 'rue')).toEqual(['urgence', 'en_attente', 'faites']);
    expect(blocsOuvertsPourRecherche(lu, 'introuvable')).toEqual([]);
  });
});

/** 🔴🔴 Arno (25/11/2026) — les capsules : des LOCATAIRES ; officielle + projetée = total ; une date provisoire compte projetée. */
describe('🔴🔴 Arno (25/11/2026) — capsulesAgo', () => {
  const l = (locataires: string[], statut: 'officielle' | 'projetee', incertaine = false): Pick<LigneVingtPourcent, 'locataires' | 'suivi'> => ({ locataires,
    suivi: { etat: 'ok', exercice: null, ago: { date: '2027-03-15', statut }, incertaine, limite: '2027-04-15', alerte: 'a_venir', joursRestants: 0 } });
  it('colocataires comptés un par un, sortie sans nom = 1, provisoire = projetée, la somme = le total', () => {
    expect(capsulesAgo([])).toEqual({ officielle: 0, projetee: 0, total: 0 });
    const c = capsulesAgo([l(['A', 'B'], 'officielle'), l([], 'officielle'), l(['C'], 'officielle', true), l(['D'], 'projetee')]);
    expect(c).toEqual({ officielle: 3, projetee: 2, total: 5 });
    expect(c.officielle + c.projetee).toBe(c.total);
  });
});

/** 🔴 Arno (25/11/2026, 10h14) — le bloc des dates manquantes n'apparaît que s'il contient des locataires. */
describe('🔴 Arno (25/11/2026, 10h14) — datesManquantesVisibles', () => {
  const m = (cle: string, locataires: string[]) => ({ cle, coproprieteId: 1, libelle: 'Copro', immeuble: null, lotId: 1, manque: ['arrete' as const], locataires });
  const sansDate: LigneVingtPourcent = { sortieId: 1, lotId: 1, locataires: ['X'], logement: null, dateSortie: '2026-01-01', valideLe: '2026-01-02',
    copropriete: { id: 1, libelle: 'Copro', aRattacher: false }, arrete: null, cleCopro: 'copro-1', suivi: { etat: 'sans_ago', exercice: null, mention: MENTION_SANS_AGO } };
  // 🔴🔴 DÉCISION D'ARNO (26/11/2026) : le bloc suit le CLASSEMENT — seule une ligne SANS date l'ouvre ; une copropriété « à compléter » (ex. arrêté seul
  //    manquant) dont les locataires ont une date provisoire ne l'ouvre plus (avant : « un nom » suffisait)
  it('rien à compléter, ou des copropriétés sans locataire sans date : non ; une ligne sans date : oui', () => {
    expect(datesManquantesVisibles({ aujourdhui: AUJ, lignes: [], manquantes: [] })).toBe(false);
    expect(datesManquantesVisibles({ aujourdhui: AUJ, lignes: [], manquantes: [m('copro-1', [])] })).toBe(false);
    expect(datesManquantesVisibles({ aujourdhui: AUJ, lignes: [], manquantes: [m('copro-1', ['A'])] })).toBe(false);
    expect(datesManquantesVisibles({ aujourdhui: AUJ, lignes: [sansDate], manquantes: [] })).toBe(true);
    const provisoire: LigneVingtPourcent = { ...sansDate, suivi: { etat: 'ok', exercice: null, ago: { date: '2027-03-01', statut: 'projetee' }, incertaine: true, limite: '2027-04-01', alerte: 'a_venir', joursRestants: 120 } };
    expect(datesManquantesVisibles({ aujourdhui: AUJ, lignes: [provisoire], manquantes: [m('copro-1', ['X'])] })).toBe(false);
  });
  it('🔴 26/11 — nombreSansDate : les LOCATAIRES sans date (colocataires un par un), comme les autres catégories ; = le compteur du bloc', () => {
    const provisoire: LigneVingtPourcent = { ...sansDate, sortieId: 3, suivi: { etat: 'ok', exercice: null, ago: { date: '2027-03-01', statut: 'projetee' }, incertaine: true, limite: '2027-04-01', alerte: 'a_venir', joursRestants: 120 } };
    const coloc: LigneVingtPourcent = { ...sansDate, sortieId: 2, locataires: ['A', 'B'] };
    const lu = { aujourdhui: AUJ, lignes: [sansDate, coloc, provisoire], manquantes: [m('copro-1', ['X', 'A', 'B'])] };
    expect(nombreSansDate(lu)).toBe(3);
    expect(nombreSansDate(null)).toBe(0);
    const c = classerVingtPourcent(lu);
    expect(c.manquantes.flatMap((g) => g.lignes.map((l) => l.sortieId))).toEqual([1, 2]); // la provisoire est ailleurs : aucun doublon
    expect(c.en_attente.map((l) => l.sortieId)).toEqual([3]);
  });
});

/** 🔴🔴 Arno (25/11/2026) — « faire une seule capsule rouge qui cumule le nombre d'alertes ». */
describe('🔴🔴 Arno (25/11/2026) — pastilleVingt', () => {
  // 🔴 (26/11) le 3e terme compte les LOCATAIRES sans date (`nombreSansDate`), plus les copropriétés
  it('total = urgences + locataires sans date ; détail au singulier / pluriel', () => {
    expect(pastilleVingt({ urgences: 2, copros: 4 })).toEqual({ total: 6, detail: '0 locataire en retard de restitution · 2 locataires en urgence · 4 locataires sans date d’AGO (copropriété à compléter)', niveau: 'orange' });
    expect(pastilleVingt({ urgences: 1, copros: 1 })).toEqual({ total: 2, detail: '0 locataire en retard de restitution · 1 locataire en urgence · 1 locataire sans date d’AGO (copropriété à compléter)', niveau: 'orange' });
    expect(pastilleVingt({ urgences: 0, copros: 0 }).total).toBe(0);
  });
});

/** 🔴🔴 Arno (25/11/2026) — « Alerte restitution en retard » (AGO officielle, date limite dépassée) et la nouvelle « Urgence » (AGO + 21 j → date limite incluse). */
describe('🔴🔴 Arno (25/11/2026) — retard / urgence : les bornes', () => {
  const L = (ago: string, limite: string, statut: 'officielle' | 'projetee', incertaine = false): LigneVingtPourcent => ({ sortieId: 1, lotId: 1, locataires: ['X'], logement: null,
    dateSortie: '2026-01-15', valideLe: '2026-01-20', copropriete: { id: 1, libelle: 'C', aRattacher: false }, arrete: { jour: 31, mois: 12 }, cleCopro: 'copro-1',
    suivi: { etat: 'ok', exercice: '2025-12-31', ago: { date: ago, statut }, incertaine, limite, alerte: 'a_venir', joursRestants: 0 } });
  const AG = '2026-09-15'; const LIMITE = '2026-10-15';
  it('🔴 (25/11, nouvelle règle) AGO + 18 j → « AGO passée » ; AGO + 19 j → « Urgence » ; la date limite elle-même → « Urgence » ; le lendemain → « Alerte »', () => {
    expect(categorieVingt(L(AG, LIMITE, 'officielle'), '2026-10-03')).toBe('ag_passee');
    expect(categorieVingt(L(AG, LIMITE, 'officielle'), '2026-10-04')).toBe('urgence');
    expect(categorieVingt(L(AG, LIMITE, 'officielle'), LIMITE)).toBe('urgence');
    expect(categorieVingt(L(AG, LIMITE, 'officielle'), '2026-10-16')).toBe('retard');
  });
  it('🔴 (25/11, choix d’Arno) PROJETÉE dont la limite est passée : « Alerte » + mention « AGO à confirmer — saisir la date officielle » ; provisoire (arrêté manquant) : « Alerte »', () => {
    expect(categorieVingt(L(AG, LIMITE, 'projetee'), '2026-10-16')).toBe('retard');
    expect(agoAConfirmer(L(AG, LIMITE, 'projetee'), '2026-10-16')).toBe(true);
    expect(agoAConfirmer(L(AG, LIMITE, 'projetee'), LIMITE)).toBe(false); // le jour même : pas encore passée
    expect(agoAConfirmer(L(AG, LIMITE, 'officielle'), '2026-10-16')).toBe(false);
    expect(MENTION_AGO_A_CONFIRMER).toBe('AGO à confirmer — saisir la date officielle');
    expect(categorieVingt(L(AG, LIMITE, 'officielle', true), '2026-10-16')).toBe('retard');
  });
  it('catégories exclusives ; « Alerte » en tête des catégories datées ; 🔴 (point 3) urgences et retards comptés à part', () => {
    const lu = { aujourdhui: '2026-10-16', manquantes: [], lignes: [L(AG, LIMITE, 'officielle'), { ...L(AG, LIMITE, 'projetee'), sortieId: 2 }, { ...L('2026-09-20', '2026-10-20', 'officielle'), sortieId: 3 }] };
    const c = classerVingtPourcent(lu);
    // 🔴 (25/11, nouvelle règle) l'officielle (1) et la projetée (2) dépassées sont en « Alerte » ; 3 (AGO 20/09, 27e jour) en « Urgence »
    expect([c.retard, c.urgence, c.ag_passee].map((x) => x.map((l) => l.sortieId))).toEqual([[1, 2], [3], []]);
    expect(nombreUrgences(lu)).toBe(1);
    expect(nombreRetards(lu)).toBe(2);
  });

  /**
   * 🔴🔴 Arno (25/11/2026) — « si l'AGO a eu lieu le 1 septembre, le locataire à qui on n'a pas restitué les 20 % passe le 20 septembre dans la catégorie
   * Urgence jusqu'au 1 octobre inclus, puis le 2 octobre il passera dans la catégorie Alerte restitution en retard ». Date limite = AGO + 1 mois (la même
   * que l'écran : `ajouterMois`), officielle comme projetée.
   */
  it('AGO le 01/09/2026 : AGO passée le 19/09, Urgence du 20/09 au 01/10 inclus, Alerte le 02/10 — officielle comme projetée', () => {
    for (const statut of ['officielle', 'projetee'] as const) {
      const l = L('2026-09-01', ajouterMois('2026-09-01', 1), statut);
      expect(ajouterMois('2026-09-01', 1)).toBe('2026-10-01');
      expect(categorieVingt(l, '2026-09-01')).toBe('ag_passee');
      expect(categorieVingt(l, '2026-09-19')).toBe('ag_passee');
      expect(categorieVingt(l, '2026-09-20')).toBe('urgence');
      expect(categorieVingt(l, '2026-10-01')).toBe('urgence');
      expect(categorieVingt(l, '2026-10-02')).toBe('retard');
      expect(agoAConfirmer(l, '2026-10-02')).toBe(statut === 'projetee');           // la mention ne vaut que pour la projetée
    }
  });
  it('fin de mois : AGO le 31/01/2027 → date limite 28/02/2027 ; AGO passée le 18/02, Urgence du 19/02 au 28/02, Alerte le 01/03 (bissextile : limite 29/02/2028)', () => {
    const l = L('2027-01-31', ajouterMois('2027-01-31', 1), 'officielle');
    expect(ajouterMois('2027-01-31', 1)).toBe('2027-02-28');
    expect(categorieVingt(l, '2027-02-18')).toBe('ag_passee');
    expect(categorieVingt(l, '2027-02-19')).toBe('urgence');                        // le 20e jour
    expect(categorieVingt(l, '2027-02-28')).toBe('urgence');
    expect(categorieVingt(l, '2027-03-01')).toBe('retard');
    const b = L('2028-01-31', ajouterMois('2028-01-31', 1), 'projetee');
    expect(ajouterMois('2028-01-31', 1)).toBe('2028-02-29');
    expect(categorieVingt(b, '2028-02-29')).toBe('urgence');
    expect(categorieVingt(b, '2028-03-01')).toBe('retard');
  });
});

/** 🔴🔴 Arno (25/11/2026) — la couleur des boutons « 20 % à restituer » et la pastille à trois nombres. */
describe('🔴🔴 Arno (25/11/2026) — niveauBoutonVingt et la pastille', () => {
  it('rouge si au moins un en retard ; sinon orange si au moins une urgence ; sinon couleur d’origine (les copropriétés ne colorent pas)', () => {
    expect(niveauBoutonVingt({ retards: 1, urgences: 0 })).toBe('rouge');
    expect(niveauBoutonVingt({ retards: 1, urgences: 5 })).toBe('rouge');
    expect(niveauBoutonVingt({ retards: 0, urgences: 1 })).toBe('orange');
    expect(niveauBoutonVingt({ retards: 0, urgences: 0 })).toBeNull();
    expect(pastilleVingt({ retards: 0, urgences: 0, copros: 3 }).niveau).toBeNull();
  });
  it('total = retard + urgence + locataires sans date (🔴 26/11) ; le détail dit les trois nombres', () => {
    expect(pastilleVingt({ retards: 1, urgences: 2, copros: 4 })).toEqual({ total: 7, niveau: 'rouge',
      detail: '1 locataire en retard de restitution · 2 locataires en urgence · 4 locataires sans date d’AGO (copropriété à compléter)' });
    expect(pastilleVingt({ retards: 0, urgences: 0, copros: 0 }).total).toBe(0);
  });
});

/** 🔴 Arno (25/11/2026) — la pastille verte des boutons : « AGO passée » + « AGO < 1 mois – À préparer », en locataires. */
describe('🔴 Arno (25/11/2026) — nombreAPreparer', () => {
  const L = (sortieId: number, ago: string, limite: string, locataires: string[]): LigneVingtPourcent => ({ sortieId, lotId: sortieId, locataires, logement: null, dateSortie: '2026-01-15',
    valideLe: '2026-01-20', copropriete: { id: 1, libelle: 'C', aRattacher: false }, arrete: { jour: 31, mois: 12 }, cleCopro: 'copro-1',
    suivi: { etat: 'ok', exercice: '2025-12-31', ago: { date: ago, statut: 'officielle' }, incertaine: false, limite, alerte: 'a_venir', joursRestants: 0 } });
  it('AGO passée (1) + À préparer (colocation de 2) = 3 ; urgence, retard et en attente ne comptent pas ; détail au singulier / pluriel', () => {
    const lu = { aujourdhui: '2026-11-24', manquantes: [], lignes: [L(1, '2026-11-10', '2026-12-10', ['A']), L(2, '2026-12-12', '2027-01-12', ['B', 'C']), /* 🔴 25/11 : À préparer = dans les 30 jours */
      L(3, '2026-09-01', '2026-10-01', ['D']), L(4, '2026-10-25', '2026-11-25', ['E'])] };
    expect(nombreAPreparer(lu)).toBe(3);
    expect(nombreAPreparer(null)).toBe(0);
    expect(detailAPreparer(3)).toBe('3 restitutions à préparer ou à faire');
    expect(detailAPreparer(1)).toBe('1 restitution à préparer ou à faire');
  });
});

import { calculVingtPourcent, origineDite, origineMontantVingt, vingtPourcentDuDepot } from './vingtPourcent';
/** 🔴🔴 Arno (25/11/2026, 22h06) — le montant des 20 % retenus : calculé sur le dépôt connu (centimes), arrondi au centime, sinon saisi. */
describe('🔴🔴 le calcul des 20 %', () => {
  it('20 % du dépôt (centimes) en euros, arrondi au centime ; « 20 % de 2 000,00 € = 400,00 € »', () => {
    expect(vingtPourcentDuDepot(200000)).toBe(400);
    expect(vingtPourcentDuDepot(123457)).toBe(246.91);                             // 246,914 → 246,91
    expect(vingtPourcentDuDepot(123458)).toBe(246.92);                             // 246,916 → 246,92
    expect(vingtPourcentDuDepot(0)).toBe(0);
    expect(calculVingtPourcent(200000)).toBe('20 % de 2 000,00 € = 400,00 €');
  });
  it('origine : exactement 20 % du dépôt connu → « calcule » ; autre montant, ou dépôt inconnu → « saisi » ; la mention qui va avec', () => {
    expect(origineMontantVingt(400, 200000)).toBe('calcule');
    expect(origineMontantVingt(399.99, 200000)).toBe('saisi');
    expect(origineMontantVingt(400, null)).toBe('saisi');
    expect(origineDite({ montant: 400, origine: 'calcule', depot: 2000 })).toBe('calculé : 20 % de 2 000,00 €');
    expect(origineDite({ montant: 380, origine: 'saisi', depot: 2000 })).toBe('saisi à la main');
  });
});

/** 🔴🔴 (Arno, 25/11/2026, 23h12) le montant des 20 % tapé dans « Valider la sortie » : lu quelle que soit l'écriture ; vide, nul, négatif, illisible : refus clair. */
describe('🔴🔴 verifierMontantVingt', () => {
  it.each([['1200', 1200], ['1200,00', 1200], ['1 200,50', 1200.5], ['1200.5', 1200.5], ['1 200 €', 1200], ['1 200,50 €', 1200.5], ['1 200', 1200], [1200, 1200]])(
    '« %s » → %s', async (brut, attendu) => {
      const { verifierMontantVingt } = await import('./vingtPourcent');
      expect(verifierMontantVingt(brut)).toEqual({ ok: true, montant: attendu });
    });
  it('vide, zéro, négatif, illisible : un refus qui dit lequel', async () => {
    const { verifierMontantVingt, MOTIF_MONTANT_VINGT_OBLIGATOIRE, MOTIF_MONTANT_VINGT_NUL, MOTIF_MONTANT_VINGT_ILLISIBLE, estMotifMontantVingt } = await import('./vingtPourcent');
    for (const x of ['', '   ', undefined, null]) expect(verifierMontantVingt(x)).toEqual({ ok: false, motif: MOTIF_MONTANT_VINGT_OBLIGATOIRE });
    for (const x of ['0', '0,00', '-50', '- 1 200,50', 0, -3]) expect(verifierMontantVingt(x)).toEqual({ ok: false, motif: MOTIF_MONTANT_VINGT_NUL });
    for (const x of ['abc', '12,345', '1,2,3', '99999999999']) expect(verifierMontantVingt(x)).toEqual({ ok: false, motif: MOTIF_MONTANT_VINGT_ILLISIBLE });
    expect([MOTIF_MONTANT_VINGT_OBLIGATOIRE, MOTIF_MONTANT_VINGT_NUL, MOTIF_MONTANT_VINGT_ILLISIBLE].every(estMotifMontantVingt)).toBe(true);
    expect(estMotifMontantVingt('Autre refus.')).toBe(false);
  });
});

// ══ 🔴🔴 Arno (27/11/2026, 22h17) — « le nom (en majuscules) et le prénom (première lettre en majuscule, les autres en minuscules) » ══
describe('🔴 22h17 — les coordonnées de la ligne dépliée : « NOM Prénom », tous les téléphones, tous les mails', async () => {
  const { coordonneesDuContact, nomContactAffiche, nomEnMajuscules, prenomCapitalise } = await import('./vingtPourcent');
  it('NOM en majuscules (accents gardés), Prénom capitalisé (composés et doubles prénoms respectés)', () => {
    expect(nomEnMajuscules(' benoît  de la tour ')).toBe('BENOÎT DE LA TOUR');
    expect(prenomCapitalise('JEAN-BAPTISTE')).toBe('Jean-Baptiste');
    expect(prenomCapitalise('marie claire')).toBe('Marie Claire');
    expect(prenomCapitalise('éLODIE')).toBe('Élodie');
    expect(prenomCapitalise('anne-marie josé')).toBe('Anne-Marie José');
  });
  it('champs nom ET prénom séparés → « NOM Prénom » ; sinon le nom TEL QU’IL EST ENREGISTRÉ (société, représentant, fiche sans prénom : aucune devinette)', () => {
    expect(nomContactAffiche({ nom: 'Sarah Benoît', prenom: 'sarah', nomSepare: 'Benoît' })).toBe('BENOÎT Sarah');
    expect(nomContactAffiche({ nom: 'Jean-Baptiste PONS', prenom: 'JEAN-BAPTISTE', nomSepare: 'pons' })).toBe('PONS Jean-Baptiste');
    expect(nomContactAffiche({ nom: 'SCI Les Tilleuls', prenom: null, nomSepare: 'SCI Les Tilleuls' })).toBe('SCI Les Tilleuls');
    expect(nomContactAffiche({ nom: 'M. et Mme Martin', prenom: '', nomSepare: 'Martin' })).toBe('M. et Mme Martin');
    expect(nomContactAffiche({ nom: 'DUPONT Alice' })).toBe('DUPONT Alice');
  });
  it('TOUS les téléphones et TOUS les mails, sans doublon, dans l’ordre de la fiche ; un ancien appel sans la liste : le premier seul', () => {
    const t1 = { affiche: '06 12 34 56 78', lien: 'tel:+33612345678' }; const t2 = { affiche: '01 45 67 89 01', lien: 'tel:+33145678901' };
    expect(coordonneesDuContact({ email: 'a@exemple.test', emails: ['a@exemple.test', 'B@exemple.test', 'b@exemple.test'], telephone: t1, telephones: [t1, t2, { ...t1 }] }))
      .toEqual({ telephones: [t1, t2], emails: ['a@exemple.test', 'B@exemple.test'] });
    expect(coordonneesDuContact({ email: null, telephone: t1 })).toEqual({ telephones: [t1], emails: [] });
    expect(coordonneesDuContact({ email: null, telephone: null })).toEqual({ telephones: [], emails: [] });
  });
});
