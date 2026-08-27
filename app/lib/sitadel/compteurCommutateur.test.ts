import { describe, it, expect } from 'vitest';
import {
  compterEnCoursParProcess, estEnCoursAffichee, demandeADuRetour, visiblesEnCours,
  type DemandeEnCoursAffichable,
} from './demandesListe';
import { processDeCanal, type Process } from './process';

/**
 * 🔑 D2-fix — GARDE : le compteur « demandes en cours » du COMMUTATEUR doit compter EXACTEMENT ce que l'onglet En cours affiche.
 * Ce défaut s'est déjà produit DEUX fois (18/08 dans SuiviDemandes ; puis dans la route process-compteurs). Ce test CASSE si le
 * compteur (compterEnCoursParProcess) et le décompte de l'onglet (visiblesEnCours + demandeADuRetour, les briques MÊMES de la Vue)
 * divergent sur un même jeu de données.
 */

const d = (over: Partial<DemandeEnCoursAffichable> = {}): DemandeEnCoursAffichable => ({
  statut: 'envoyee', canal: 'formulaire', dossiersActifs: 1, dossiersSatisfaits: 0, nbReponsesReelles: 0, dossiers: [{ triage: null }], ...over,
});

/** Reproduit le décompte de l'onglet En cours (par défaut) AVEC LES BRIQUES DE LA VUE — indépendamment du compteur. */
function decompteOngletEnCours(demandes: readonly DemandeEnCoursAffichable[], process: Process): number {
  const duProcess = demandes.filter((x) => x.statut === 'envoyee' && processDeCanal(x.canal) === process);
  // La Vue partitionne via visiblesEnCours ({nbDossiers, dossiersDus}) puis retire les demandes à retour (→ Réponses).
  const liste = duProcess.map((x) => ({ ...x, nbDossiers: x.dossiersActifs, dossiersDus: x.dossiersActifs - x.dossiersSatisfaits }));
  return visiblesEnCours(liste, true).filter((x) => !demandeADuRetour(x)).length;
}

describe('D2-fix — le compteur du commutateur suit le MÊME périmètre que l’onglet En cours', () => {
  // Le cas EXACT du porteur : 2 demandes formulaire SOLDÉES (tous dossiers reçus) → l'onglet affiche 0, le compteur DOIT dire 0.
  it('2 soldées formulaire → compteur 0 (et non « 2 en cours »)', () => {
    const jeu = [
      d({ dossiersActifs: 2, dossiersSatisfaits: 2 }),
      d({ dossiersActifs: 3, dossiersSatisfaits: 3 }),
    ];
    expect(compterEnCoursParProcess(jeu).formulaire).toBe(0);
    expect(decompteOngletEnCours(jeu, 'formulaire')).toBe(0);
  });

  it('mélange complet : le compteur == le décompte de l’onglet, pour chaque process', () => {
    const jeu: DemandeEnCoursAffichable[] = [
      d({ canal: 'formulaire', dossiersActifs: 1, dossiersSatisfaits: 0 }),                      // vivante → comptée
      d({ canal: 'formulaire', dossiersActifs: 2, dossiersSatisfaits: 2 }),                      // soldée → exclue
      d({ canal: 'formulaire', dossiersActifs: 2, dossiersSatisfaits: 0, nbReponsesReelles: 1 }), // à retour → Réponses, exclue
      d({ canal: 'formulaire', dossiersActifs: 0, dossiersSatisfaits: 0 }),                      // sans dossier → exclue
      d({ canal: 'email', dossiersActifs: 1, dossiersSatisfaits: 0 }),                           // vivante → comptée
      d({ canal: 'email', statut: 'close', dossiersActifs: 1, dossiersSatisfaits: 0 }),          // close → exclue
      d({ canal: 'email', dossiersActifs: 1, dossiersSatisfaits: 0, dossiers: [{ triage: 'refus_mairie' }] }), // triage → retour, exclue
      d({ canal: 'courrier', dossiersActifs: 1, dossiersSatisfaits: 0 }),                        // hors process → aucun
    ];
    const compteur = compterEnCoursParProcess(jeu);
    expect(compteur.formulaire).toBe(decompteOngletEnCours(jeu, 'formulaire'));
    expect(compteur.email).toBe(decompteOngletEnCours(jeu, 'email'));
    // valeurs attendues explicites (pas seulement l'égalité) : 1 formulaire, 1 email.
    expect(compteur).toEqual({ formulaire: 1, email: 1 });
  });

  it('estEnCoursAffichee : envoyee + dus>0 + sans retour', () => {
    expect(estEnCoursAffichee(d())).toBe(true);
    expect(estEnCoursAffichee(d({ dossiersActifs: 2, dossiersSatisfaits: 2 }))).toBe(false); // soldée
    expect(estEnCoursAffichee(d({ nbReponsesReelles: 1 }))).toBe(false);                     // à retour
    expect(estEnCoursAffichee(d({ statut: 'close' }))).toBe(false);                          // pas envoyee
  });

  it('le courrier (hors process) n’est jamais compté', () => {
    expect(compterEnCoursParProcess([d({ canal: 'courrier' })])).toEqual({ email: 0, formulaire: 0 });
  });
});
