import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ligneEnCoursASignaler, estEnCoursAffichee, compterEnCoursParProcess } from '../../../../lib/sitadel/demandesListe';
import { compterEnCoursASignaler } from './comptesActions';

/**
 * LOT 51 — « Tester le dossier en analyse » (aller-retour RÉVERSIBLE, PAS un changement de statut). Décision (a) = OPTION B : pendant le
 * test le dossier DISPARAÎT de « En cours » et n'est visible qu'en Analyse (exclusivité, compté une seule fois). Les relances tournent
 * quand même en fond. On teste : (1) l'exclusion dans les DEUX prédicats partagés d'onglet ; (2) l'invariant « compteur == somme des
 * lignes allumées » APRÈS exclusion (pastille ET commutateur) ; (3) le câblage par lecture de source, dont la PREUVE que le marqueur
 * n'écrit NI statut NI partiel_leve_le (donc n'arrête AUCUNE relance — sortie définitive = LOT 51-C) et que les deux retours existent.
 */
type L = Parameters<typeof ligneEnCoursASignaler>[0];
const baseL = (o: Partial<L>): L => ({ nbReponsesReelles: 0, dossiersSatisfaits: 0, dossiers: [], suspension: null, lienEnAttente: false, completudeManquantes: 0, saisissable: false, nouvellesPiecesNonVues: false, testeEnAnalyse: false, ...o });

type E = Parameters<typeof estEnCoursAffichee>[0];
const baseE = (o: Partial<E>): E => ({ statut: 'envoyee', canal: 'email', dossiersActifs: 1, dossiersSatisfaits: 0, nbReponsesReelles: 0, dossiers: [], suspension: null, testeEnAnalyse: false, ...o });

describe('LOT 51 — exclusion du dossier « testé en analyse » des prédicats d’onglet « En cours »', () => {
  it('ligneEnCoursASignaler : un dossier incomplet TESTÉ n’allume PAS la pastille (foyer Analyse)', () => {
    expect(ligneEnCoursASignaler(baseL({ suspension: {}, completudeManquantes: 2 }))).toBe(true);                    // témoin : incomplet, non testé → allumé
    expect(ligneEnCoursASignaler(baseL({ suspension: {}, completudeManquantes: 2, testeEnAnalyse: true }))).toBe(false);
    expect(ligneEnCoursASignaler(baseL({ suspension: {}, nouvellesPiecesNonVues: true, testeEnAnalyse: true }))).toBe(false); // ni via l'événement « nouvelles pièces »
  });
  it('estEnCoursAffichee : un dossier TESTÉ quitte l’affichage « En cours » (retour dès le retrait du marqueur)', () => {
    expect(estEnCoursAffichee(baseE({}))).toBe(true);                              // témoin : vivante, non testée → affichée
    expect(estEnCoursAffichee(baseE({ testeEnAnalyse: true }))).toBe(false);
  });
});

describe('LOT 51 — invariant « compteur d’onglet == somme des lignes allumées » APRÈS exclusion (option B)', () => {
  it('pastille « à signaler » : le testé est écarté du compteur exactement comme de l’affichage', () => {
    const echantillon: L[] = [
      baseL({ suspension: {}, completudeManquantes: 2 }),                    // incomplet visible → 1
      baseL({ suspension: {}, nouvellesPiecesNonVues: true }),               // nouvelles pièces visible → 1
      baseL({ suspension: {}, completudeManquantes: 3, testeEnAnalyse: true }), // incomplet MAIS testé → 0 (foyer Analyse)
      baseL({ suspension: {}, nouvellesPiecesNonVues: true, testeEnAnalyse: true }), // nouvelles MAIS testé → 0
    ];
    expect(compterEnCoursASignaler(echantillon)).toBe(2);
    expect(compterEnCoursASignaler(echantillon)).toBe(echantillon.filter(ligneEnCoursASignaler).length); // compteur == lignes allumées
  });
  it('commutateur : le testé est aussi écarté du décompte par process (même foyer estEnCoursAffichee)', () => {
    const demandes: E[] = [
      baseE({ canal: 'email' }),                        // affichée → 1 email
      baseE({ canal: 'email', testeEnAnalyse: true }),  // testée → écartée
      baseE({ canal: 'formulaire' }),                   // affichée → 1 formulaire
    ];
    expect(compterEnCoursParProcess(demandes)).toEqual({ email: 1, formulaire: 1 });
  });
});

describe('LOT 51 — câblage (source) : porte FIX-2, données, routes, deux retours, migration', () => {
  const lire = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8');

  it('51-A — la porte FIX-2 s’ouvre pour un dossier testé (OR s.id = ANY(...)) sans lever le partiel ; marqueur lu à part et résilient', () => {
    const s = lire('app/lib/permis/projectionFileRepo.ts');
    expect(s).toContain('OR s.id = ANY($1)');           // porte ouverte pour les dossiers testés, marqueur partiel INCHANGÉ (toujours dans le WHERE)
    expect(s).toContain('lireDossiersEnTest');           // lecture SÉPARÉE et résiliente (189 absente → ∅ → comportement d'avant)
    expect(s).toContain('testeEnAnalyse');               // exposé sur la ligne → l'UI propose le retour
  });
  it('51-A — la donnée riche marque la demande testée (batch résilient, WHERE dd.actif)', () => {
    const s = lire('app/lib/veille/reponsesSuivi.ts');
    expect(s).toContain('dossier_test_analyse');
    expect(s).toContain('testeEnAnalyse: testeEnAnalyseIds.has(r.id)');
  });
  it('51-A — l’affichage « En cours » exclut le testé (comme soldées/retour/saisissables) avec mention non silencieuse', () => {
    const s = lire('app/(admin)/admin/(protected)/permis/SuiviDemandes.tsx');
    expect(s).toContain('testesIds');                    // ensemble exclu de dansVueAffiche
    expect(s).toContain('!testesIds.has(d.id)');
    expect(s).toContain('en test dans l’onglet Analyse et projection'); // mention (jamais un masquage muet)
    expect(s).toContain("action: 'tester_en_analyse'");  // bouton « Tester » → route reponses
  });
  it('51-B — DEUX retours : bouton manuel (retour_en_cours, sans envoi) + relance (envoyée OU déclarée) efface le marqueur', () => {
    expect(lire('app/(admin)/api/admin/permis/projection/route.ts')).toContain("body.action === 'retour_en_cours'");
    const dp = lire('app/(admin)/api/admin/permis/demander-pieces/route.ts');
    expect((dp.match(/retirerTestAnalyse\(dossierId\)/g) ?? []).length).toBe(2); // après executerDemandePieces (envoi) ET declarerRelanceComplement (déclaration)
    expect(lire('app/(admin)/admin/(protected)/permis/ProjectionVue.tsx')).toContain('Renvoyer ce permis dans l’onglet « En cours »');
  });
  it('51 — PREUVE « aucun changement de statut, aucune relance arrêtée » : le marqueur n’écrit QUE dossier_test_analyse', () => {
    const s = lire('app/lib/permis/testAnalyseRepo.ts');
    expect(s).toContain('INSERT INTO dossier_test_analyse');
    expect(s).toContain('DELETE FROM dossier_test_analyse');
    // Les 3 systèmes de relance s'arrêtent par demande.statut='close' et/ou partiel_leve_le (recon LOT 51). PREUVE sur les VERBES SQL
    //   ÉMIS (insensible aux commentaires) : aucun UPDATE, et toute écriture INSERT/DELETE ne cible QUE dossier_test_analyse.
    expect(s).not.toMatch(/\bUPDATE\b/);                                          // aucun UPDATE (ni demande, ni cascade, ni partiel)
    for (const m of s.match(/\b(?:INSERT INTO|DELETE FROM)\s+(\w+)/g) ?? []) {
      expect(m).toContain('dossier_test_analyse');                                // toute écriture cible la seule table du marqueur
    }
  });
  it('51-A — migration 189 crée la table du marqueur (livrée, à appliquer à la main)', () => {
    const s = lire('db/migrations/189_dossier_test_analyse.sql');
    expect(s).toContain('CREATE TABLE IF NOT EXISTS dossier_test_analyse');
    expect(s).toContain('ON DELETE CASCADE'); // un dossier supprimé emporte son marqueur (jamais de marqueur orphelin)
  });
});
