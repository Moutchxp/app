import { describe, it, expect, vi } from 'vitest';
import {
  compterReponses, compterSaisines, compterRattachement, assemblerComptes, recompterSiSucces,
  compterEnCoursASignaler, dossierATrancher, messageAQualifier, type DemandeComptable,
} from './comptesActions';
import { ligneEnCoursASignaler } from '../../../../lib/sitadel/demandesListe';

/** Fixture minimale d'une demande « En cours » (mêmes champs que le prédicat partagé ligneEnCoursASignaler). */
const baseL = (o: Partial<Parameters<typeof ligneEnCoursASignaler>[0]>): Parameters<typeof ligneEnCoursASignaler>[0] =>
  ({ nbReponsesReelles: 0, dossiersSatisfaits: 0, dossiers: [], suspension: null, lienEnAttente: false, completudeManquantes: 0, saisissable: false, nouvellesPiecesNonVues: false, testeEnAnalyse: false, ...o });

/**
 * PASTILLES — comptage PUR. Un test par compteur (N éléments → N), le cumul, la règle « recompter si succès », et la PREUVE que
 * le comptage vient des définitions EXISTANTES : en modifiant une fixture qui change le contenu de l'onglet, la pastille suit.
 */
const dem = (over: Partial<DemandeComptable> = {}): DemandeComptable =>
  ({ nbReponsesReelles: 0, dossiersSatisfaits: 0, dossiers: [], messagesAutre: [], ...over });
const duNonTranche = { satisfait: false, triage: null };

describe('PASTILLES — prédicats atomiques', () => {
  it('dossierATrancher : dû non tranché → true ; satisfait ou trié → false', () => {
    expect(dossierATrancher({ satisfait: false, triage: null })).toBe(true);
    expect(dossierATrancher({ satisfait: true, triage: null })).toBe(false);
    expect(dossierATrancher({ satisfait: false, triage: 'non_fourni' })).toBe(false);
  });
  it('messageAQualifier : non répondu → true ; répondu → false', () => {
    expect(messageAQualifier({ reponduLe: null })).toBe(true);
    expect(messageAQualifier({ reponduLe: '2026-08-01T00:00:00Z' })).toBe(false);
  });
});

describe('PASTILLES — compteur Réponses', () => {
  it('dossiers à trancher : une demande AVEC retour et 2 dossiers dus non tranchés → 2', () => {
    const data = { demandes: [dem({ nbReponsesReelles: 1, dossiers: [duNonTranche, duNonTranche] })], aRattacher: [], propositions: [] };
    expect(compterReponses(data)).toBe(2);
  });
  it('dossiers satisfaits / triés ne comptent pas (déjà traités par Arno)', () => {
    const data = { demandes: [dem({ dossiersSatisfaits: 1, dossiers: [{ satisfait: true, triage: null }, { satisfait: false, triage: 'refus_mairie' }] })], aRattacher: [], propositions: [] };
    expect(compterReponses(data)).toBe(0);
  });
  it('messages « autre » non répondus → à qualifier ; orphelins + dépôts → additionnés', () => {
    const data = {
      demandes: [dem({ nbReponsesReelles: 1, messagesAutre: [{ reponduLe: null }, { reponduLe: '2026-08-01' }] })],
      aRattacher: [{ id: 1 }, { id: 2 }, { id: 3 }],
      propositions: [{ id: 9 }],
    };
    expect(compterReponses(data)).toBe(1 /* autre non répondu */ + 3 /* orphelins */ + 1 /* dépôt */);
  });
  it('les dossiers dus d’une demande SANS retour ne comptent PAS (attente mairie = automatique)', () => {
    const data = { demandes: [dem({ nbReponsesReelles: 0, dossiers: [duNonTranche, duNonTranche] })], aRattacher: [], propositions: [] };
    expect(compterReponses(data)).toBe(0);
  });
  it('GED-1 — chaque « lien de téléchargement disponible » compte dans la pastille Réponses', () => {
    const data = { demandes: [], aRattacher: [], propositions: [], liensATelecharger: [{ dossierId: 531 }, { dossierId: 12 }] };
    expect(compterReponses(data)).toBe(2);
  });
  it('GED-1 — rétrocompat : liensATelecharger absent → compte inchangé (0)', () => {
    expect(compterReponses({ demandes: [], aRattacher: [], propositions: [] })).toBe(0);
  });
});

describe('PASTILLES — le comptage suit les définitions existantes (demandeADuRetour)', () => {
  it('même demande, même dossier dû : SANS retour → 0 ; l’arrivée d’une réponse (change le contenu) → 1', () => {
    const base = dem({ dossiers: [duNonTranche] });
    expect(compterReponses({ demandes: [base], aRattacher: [], propositions: [] })).toBe(0);
    const avecRetour = { ...base, nbReponsesReelles: 1 }; // une réponse arrive → la demande entre dans « Réponses »
    expect(compterReponses({ demandes: [avecRetour], aRattacher: [], propositions: [] })).toBe(1);
  });
});

describe('PASTILLES — compteurs Saisines & Rattachement', () => {
  it('Saisines : saisissables non lancées + file à finaliser', () => {
    expect(compterSaisines({ saisissables: [1, 2], fileADeposer: [3] })).toBe(3);
    expect(compterSaisines({ saisissables: [], fileADeposer: [] })).toBe(0);
  });
  it('Rattachement : états « à faire » = arbitrage_demande + acheve_sans_bati (ÉTAGE 1) ; les autres ne comptent pas', () => {
    // 4 en arbitrage + 2 achevés-à-confirmer = 6 ; en_attente_bati / clos_sans_bati / valide / suivi ne comptent pas.
    expect(compterRattachement({ arbitrage_demande: 4, acheve_sans_bati: 2, en_attente_bati: 7, clos_sans_bati: 5, valide: 99, suivi_aucun_signal: 3 })).toBe(6);
    expect(compterRattachement({ acheve_sans_bati: 3 })).toBe(3); // le nouvel état seul compte aussi
    expect(compterRattachement({ valide: 10 })).toBe(0); // clé absente → 0
  });
});

describe('PASTILLES — cumul (source unique serveur)', () => {
  it('total = somme exacte des SIX (PROJ-2c : + projection ; SURV-1 : + surveillance ; LOT 72 : + en cours)', () => {
    expect(assemblerComptes(2, 3, 4, 5, 6, 7)).toEqual({ reponses: 2, saisines: 3, rattachement: 4, projection: 5, surveillance: 6, enCours: 7, total: 27 });
    expect(assemblerComptes(0, 0, 0, 0, 0, 0)).toEqual({ reponses: 0, saisines: 0, rattachement: 0, projection: 0, surveillance: 0, enCours: 0, total: 0 });
  });

  // 🔒 LOT 72 — INVARIANT FIGÉ : le `total` de la tuile == somme EXACTE de TOUS les termes agrégés (pastilles d'onglet). Puissances de 2
  //   distinctes → tout terme oublié ou ajouté au total sans mise à jour de l'autre côté change la somme et FAIT ÉCHOUER ce test.
  it('le total est la somme de TOUS les autres champs — ni terme oublié (En cours !), ni double-compte', () => {
    const c = assemblerComptes(1, 2, 4, 8, 16, 32);
    const { total, ...termes } = c;
    expect(Object.values(termes).reduce((s, v) => s + v, 0)).toBe(total); // échoue si un onglet cesse d'entrer dans le cumul
    expect(total).toBe(63);
  });

  // LOT 72 — un permis d'« En cours » DOIT peser dans le cumul (défaut mesuré : 1 en cours + 2 en analyse affichait 2 au lieu de 3).
  it('un permis en « En cours » seul compte dans le total (cœur du défaut LOT 72)', () => {
    expect(assemblerComptes(0, 0, 0, 0, 0, 1).total).toBe(1);              // 1 en cours, 0 ailleurs → 1
    expect(assemblerComptes(0, 0, 0, 2, 0, 1).total).toBe(3);              // scénario d'Arno : 1 en cours + 2 en analyse → 3
    // Après bascule du permis « En cours » → « Analyse » (exclusivité 51-C : il quitte En cours) : 0 en cours + 3 en analyse → 3.
    expect(assemblerComptes(0, 0, 0, 3, 0, 0).total).toBe(3);              // même total, quel que soit l'onglet
  });

  // LOT 72 — un dossier EN TEST est compté UNE SEULE FOIS. Il est exclu de « En cours » (ligneEnCoursASignaler, exclusivité 51-C) et
  //   figure dans la file Analyse (projection). Le cumul ne doit donc PAS l'additionner deux fois.
  it('un dossier en test compte via « projection », jamais aussi via « En cours » (pas de double-compte)', () => {
    const enCoursSample: Parameters<typeof ligneEnCoursASignaler>[0][] = [
      baseL({ suspension: {}, completudeManquantes: 2 }),                        // incomplet visible → 1 en cours
      baseL({ suspension: {}, completudeManquantes: 3, testeEnAnalyse: true }),  // incomplet MAIS testé → 0 en cours (foyer Analyse)
    ];
    const enCours = compterEnCoursASignaler(enCoursSample);
    expect(enCours).toBe(1);                                                     // le testé n'entre PAS dans En cours
    // Le testé est dans la file Analyse → projection=1. Total = 1 (en cours) + 1 (projection, le testé) = 2 permis, chacun 1 fois.
    expect(assemblerComptes(0, 0, 0, 1, 0, enCours).total).toBe(2);             // jamais 3 : aucun double-compte
  });
});

describe('PASTILLES — recompterSiSucces (câblage)', () => {
  it('action réussie → recompte ; action en échec → ne recompte pas', () => {
    const fn = vi.fn();
    recompterSiSucces(true, fn);
    expect(fn).toHaveBeenCalledTimes(1);
    recompterSiSucces(false, fn);
    expect(fn).toHaveBeenCalledTimes(1); // inchangé
  });
});
