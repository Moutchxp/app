import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { demandeADeNouvellesPieces, ligneEnCoursASignaler, demandeEnCoursIncomplete } from '../../../../lib/sitadel/demandesListe';
import { compterEnCoursASignaler } from './comptesActions';

/**
 * LOT 47 — signal « nouvelles pièces reçues » (ÉVÉNEMENT) et son acquittement. Coexiste avec « incomplet » (ÉTAT, LOT 46). Le
 * compteur d'onglet agrège les DEUX (ligneEnCoursASignaler) : une ligne = 1, même si elle porte les deux badges → invariant
 * compteur == lignes allumées. On teste les prédicats purs, l'invariant, puis le câblage (accroche depose_le, acquittement,
 * migration) par lecture de source.
 */
type D = Parameters<typeof ligneEnCoursASignaler>[0];
const base = (o: Partial<D>): D => ({ nbReponsesReelles: 0, dossiersSatisfaits: 0, dossiers: [], suspension: null, lienEnAttente: false, completudeManquantes: 0, saisissable: false, nouvellesPiecesNonVues: false, ...o });

describe('LOT 47 — prédicat demandeADeNouvellesPieces (événement)', () => {
  it('nouvelles pièces sur dossier partiel resté En cours → ALLUMÉ (cas 154)', () => {
    expect(demandeADeNouvellesPieces(base({ suspension: {}, nouvellesPiecesNonVues: true }))).toBe(true);
  });
  it('aucune nouvelle pièce → éteint', () => {
    expect(demandeADeNouvellesPieces(base({ suspension: {}, nouvellesPiecesNonVues: false }))).toBe(false);
  });
  it('saisissable → éteint (foyer Saisines CADA)', () => {
    expect(demandeADeNouvellesPieces(base({ suspension: {}, nouvellesPiecesNonVues: true, saisissable: true }))).toBe(false);
  });
  it('lien en attente / retour (foyer Réponses) → éteint', () => {
    expect(demandeADeNouvellesPieces(base({ suspension: {}, lienEnAttente: true, nouvellesPiecesNonVues: true }))).toBe(false);
    expect(demandeADeNouvellesPieces(base({ nbReponsesReelles: 1, nouvellesPiecesNonVues: true }))).toBe(false);
  });
});

describe('LOT 47 — événement et état COEXISTENT', () => {
  it('les deux prédicats peuvent être vrais en même temps', () => {
    const d = base({ suspension: {}, completudeManquantes: 2, nouvellesPiecesNonVues: true });
    expect(demandeEnCoursIncomplete(d)).toBe(true);
    expect(demandeADeNouvellesPieces(d)).toBe(true);
    expect(ligneEnCoursASignaler(d)).toBe(true);
  });
  it('nouvelles pièces SANS incomplet (dossier complété non acquitté) → ligne allumée', () => {
    const d = base({ suspension: {}, completudeManquantes: 0, nouvellesPiecesNonVues: true });
    expect(demandeEnCoursIncomplete(d)).toBe(false);
    expect(ligneEnCoursASignaler(d)).toBe(true);
  });
});

describe('LOT 47 — invariant : compteur d’onglet == lignes allumées (une ligne = 1, jamais 2)', () => {
  it('compterEnCoursASignaler == échantillon filtré par ligneEnCoursASignaler', () => {
    const echantillon: D[] = [
      base({ suspension: {}, completudeManquantes: 2, nouvellesPiecesNonVues: true }), // DEUX badges → compte pour 1
      base({ suspension: {}, completudeManquantes: 3 }),                               // incomplet seul → 1
      base({ suspension: {}, nouvellesPiecesNonVues: true }),                          // nouvelles seul → 1
      base({ suspension: {}, completudeManquantes: 0, nouvellesPiecesNonVues: false }),// éteint
      base({ nbReponsesReelles: 1, nouvellesPiecesNonVues: true }),                    // éteint (Réponses)
    ];
    expect(compterEnCoursASignaler(echantillon)).toBe(3);
    expect(compterEnCoursASignaler(echantillon)).toBe(echantillon.filter(ligneEnCoursASignaler).length);
  });
});

describe('LOT 47 — câblage (accroche, acquittement, migration)', () => {
  const lire = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8');
  it('le signal s’accroche au VERSEMENT réel (dossier_document.depose_le), pas au recalcul', () => {
    const s = lire('app/lib/veille/reponsesSuivi.ts');
    expect(s).toContain('nouvellesPiecesNonVues');
    expect(s).toContain('doc.depose_le > GREATEST(');           // pièce postérieure au dernier acquittement
    expect(s).toContain('dossier_pieces_acquittement');          // bouton « vu »
    expect(s).toContain('demande_journal');                      // relance dérivée (rétroactif)
    expect(s).toContain('note IS DISTINCT FROM $2');             // fiche de synthèse exclue
  });
  it('le compteur d’onglet agrège via le prédicat partagé', () => {
    expect(lire('app/(admin)/admin/(protected)/permis/comptesActions.ts')).toContain('demandes.filter(ligneEnCoursASignaler)');
  });
  it('le bouton « vu » passe par la route reponses (action acquitter_pieces) et un repo dédié', () => {
    expect(lire('app/(admin)/api/admin/permis/reponses/route.ts')).toContain("corps.action === 'acquitter_pieces'");
    expect(lire('app/lib/permis/piecesAcquittementRepo.ts')).toContain('ON CONFLICT (dossier_id) DO UPDATE');
  });
  it('la ligne porte le badge « nouvelles pièces » ET le bouton « vu » rafraîchit les pastilles', () => {
    const s = lire('app/(admin)/admin/(protected)/permis/SuiviDemandes.tsx');
    expect(s).toContain('demandeADeNouvellesPieces(r)');       // badge de ligne
    expect(s).toContain('nouvelles pièces reçues');
    expect(s).toContain("action: 'acquitter_pieces'");
    expect(s).toContain('onRecompter?.()');                     // invariant compteur après acquittement
    expect(lire('app/(admin)/admin/(protected)/permis/PermisTuile.tsx')).toContain('onRecompter={apresAction}');
  });
  it('la migration 188 crée la table d’acquittement (livrée, à appliquer à la main)', () => {
    const s = lire('db/migrations/188_dossier_pieces_acquittement.sql');
    expect(s).toContain('CREATE TABLE IF NOT EXISTS dossier_pieces_acquittement');
    expect(s).toContain('vu_le');
  });
});
