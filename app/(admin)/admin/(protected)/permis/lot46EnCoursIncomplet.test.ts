import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { demandeEnCoursIncomplete } from '../../../../lib/sitadel/demandesListe';
import { compterEnCoursIncomplet } from './comptesActions';

/**
 * LOT 46 — « En cours » scindé en deux groupes + pastilles ligne/onglet sur dossier INCOMPLET à relancer.
 * Le cœur est UN prédicat pur PARTAGÉ (demandeEnCoursIncomplete) : le compteur d'onglet est, par construction, la somme exacte
 * des lignes allumées (même prédicat, même donnée). On teste le prédicat, l'invariant compteur==filtre, puis le câblage (une
 * seule vérité, du serveur à la ligne) par lecture de source.
 */
type D = Parameters<typeof demandeEnCoursIncomplete>[0];
const base = (o: Partial<D>): D => ({ nbReponsesReelles: 0, dossiersSatisfaits: 0, dossiers: [], suspension: null, lienEnAttente: false, completudeManquantes: 0, saisissable: false, ...o });

describe('LOT 46 — prédicat partagé demandeEnCoursIncomplete', () => {
  it('dossier partiel resté En cours + familles manquantes → ALLUMÉ (cas demande 154)', () => {
    expect(demandeEnCoursIncomplete(base({ suspension: {}, lienEnAttente: false, completudeManquantes: 1 }))).toBe(true);
  });
  it('familles manquantes = 0 → éteint (rien à réclamer, jamais « incomplet (0) »)', () => {
    expect(demandeEnCoursIncomplete(base({ suspension: {}, completudeManquantes: 0 }))).toBe(false);
  });
  it('saisissable → éteint (foyer Saisines CADA)', () => {
    expect(demandeEnCoursIncomplete(base({ suspension: {}, completudeManquantes: 2, saisissable: true }))).toBe(false);
  });
  it('lien de téléchargement en attente → éteint (foyer Réponses, PART-D)', () => {
    expect(demandeEnCoursIncomplete(base({ suspension: {}, lienEnAttente: true, completudeManquantes: 2 }))).toBe(false);
  });
  it('non partiel avec réponse mairie → éteint (foyer Réponses)', () => {
    expect(demandeEnCoursIncomplete(base({ suspension: null, nbReponsesReelles: 1, completudeManquantes: 2 }))).toBe(false);
  });
  it('en attente de la première réponse (aucune pièce) → éteint', () => {
    expect(demandeEnCoursIncomplete(base({}))).toBe(false);
  });
});

describe('LOT 46 — invariant : compteur d’onglet == nombre de lignes allumées', () => {
  it('compterEnCoursIncomplet == échantillon filtré par le MÊME prédicat', () => {
    const echantillon: D[] = [
      base({ suspension: {}, completudeManquantes: 1 }),                       // allumé
      base({ suspension: {}, completudeManquantes: 3 }),                       // allumé
      base({ suspension: {}, completudeManquantes: 0 }),                       // éteint (complet)
      base({ suspension: {}, lienEnAttente: true, completudeManquantes: 2 }),  // éteint (Réponses)
      base({ nbReponsesReelles: 1, completudeManquantes: 2 }),                 // éteint (Réponses)
      base({}),                                                               // éteint (1re réponse)
    ];
    expect(compterEnCoursIncomplet(echantillon)).toBe(2);
    // égalité STRUCTURELLE : le compteur EST le filtrage par le prédicat, jamais une 2e implémentation qui « se ressemble ».
    expect(compterEnCoursIncomplet(echantillon)).toBe(echantillon.filter(demandeEnCoursIncomplete).length);
  });
});

describe('LOT 46 — câblage (une seule vérité, du serveur à la ligne)', () => {
  const lire = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8');
  it('comptesActions.compterEnCoursIncomplet dérive du prédicat partagé', () => {
    expect(lire('app/(admin)/admin/(protected)/permis/comptesActions.ts')).toContain('demandes.filter(demandeEnCoursIncomplete)');
  });
  it('la route actions passe enCours à assemblerComptes (LOT 72 : DANS le total) ; LOT 47 : agrégat = compterEnCoursASignaler', () => {
    const s = lire('app/(admin)/api/admin/permis/actions/route.ts');
    expect(s).toContain('compterEnCoursASignaler('); // LOT 47 : l'onglet agrège incomplet OU nouvelles pièces
    expect(s).toContain('surveillance, enCours)'); // LOT 72 : enCours entre dans assemblerComptes → compté dans le cumul de la tuile
  });
  it('la tuile passe enCours à l’onglet « En cours »', () => {
    expect(lire('app/(admin)/admin/(protected)/permis/PermisTuile.tsx')).toContain('en_cours: comptes.enCours');
  });
  it('la ligne « En cours » utilise le MÊME prédicat que le compteur', () => {
    const s = lire('app/(admin)/admin/(protected)/permis/SuiviDemandes.tsx');
    expect(s).toContain('demandeEnCoursIncomplete(r)');
    expect(s).toContain('marqueurParId={marqueurLigne}');
  });
  it('« En cours » est scindé en deux groupes repliables (1re réponse / à relancer)', () => {
    const s = lire('app/(admin)/admin/(protected)/permis/SuiviDemandes.tsx');
    expect(s).toContain("(['premiere', 'relance'] as const)");
    expect(s).toContain('titreGroupeEnCours');
    expect(s).toContain('BlocRepliable');
  });
});
