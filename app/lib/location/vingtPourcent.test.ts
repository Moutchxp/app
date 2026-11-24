import { describe, expect, it } from 'vitest';
import {
  agoApres, agosOfficielles, alerteRestitution, clotureExercice, datesManquantes, libelleAlerte, libelleExercice, MENTION_INCERTAINE, MENTION_SANS_AGO,
  suiviVingtPourcent, transposer, categorieVingt, classerVingtPourcent, joursRestantsVingt, montantEuros, montantFr, verifierRestitution, etiquetteAgo, compteAReboursVingt, correspondRecherche, filtrerVingtPourcent, type LigneVingtPourcent,
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

describe('🔴 la rubrique « Dates manquantes » (règle 5)', () => {
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
  it('b / c : AG + 20 jours EXACT → « AG passée » ; AG + 21 jours → « Urgence » ; le jour de l’AG → « AG passée »', () => {
    expect(categorieVingt(ligne(plus(-20)), AUJ)).toBe('ag_passee');
    expect(categorieVingt(ligne(plus(-21)), AUJ)).toBe('urgence');
    expect(categorieVingt(ligne(AUJ), AUJ)).toBe('ag_passee');
    // date limite dépassée (AG il y a 3 mois) : toujours « Urgence »
    expect(categorieVingt(ligne(plus(-90), 'officielle'), AUJ)).toBe('urgence');
  });
  it('d / e : AG dans 30 jours → « À préparer » ; dans 31 jours → « En attente » ; OFFICIELLE lointaine → « À préparer »', () => {
    expect(categorieVingt(ligne(plus(30)), AUJ)).toBe('a_preparer');
    expect(categorieVingt(ligne(plus(31)), AUJ)).toBe('en_attente');
    expect(categorieVingt(ligne(plus(1)), AUJ)).toBe('a_preparer');
    expect(categorieVingt(ligne(plus(200), 'officielle'), AUJ)).toBe('a_preparer');
  });
  // 🔴🔴 DÉCISION D'ARNO (24/11/2026, 23h20) : seuls les locataires SANS AUCUNE date calculable restent dans « Dates manquantes » ; une date
  // PROVISOIRE (dernière AGO connue, arrêté manquant ; ou bien sans copropriété avec une AGO connue) classe dans la catégorie réelle
  it('a : SEULEMENT sans aucune date calculable ; une date provisoire classe dans la catégorie réelle', () => {
    expect(categorieVingt(ligne(null), AUJ)).toBe('manquantes');
    expect(categorieVingt(ligne(plus(-90), 'officielle', { arrete: null }), AUJ)).toBe('urgence');
    expect(categorieVingt(ligne(plus(10), 'projetee', { copropriete: null, arrete: null }), AUJ)).toBe('a_preparer');
  });
  it('le cas « _TEST ARRETE COMPTES 20 POURCENT Locataire 3 » : AGO projetée 22/09/2026, arrêté manquant, limite 22/10/2026 dépassée de 33 jours → « Urgence »', () => {
    const l = ligne('2026-09-22', 'projetee', { arrete: null });
    expect(l.suivi.etat === 'ok' && l.suivi.limite).toBe('2026-10-22');
    expect(categorieVingt(l, AUJ)).toBe('urgence');
    expect(classerVingtPourcent({ aujourdhui: AUJ, lignes: [l], manquantes: [] }).urgence).toHaveLength(1);
  });
  it('EXCLUSIVITÉ et TRI : chaque ligne dans une seule catégorie ; b à e par date limite croissante ; a groupé par copropriété, sortie la plus ancienne d’abord', () => {
    const u1 = ligne(plus(-40)); const u2 = ligne(plus(-60)); const p1 = ligne(plus(5)); const e1 = ligne(plus(100)); const e2 = ligne(plus(60));
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
