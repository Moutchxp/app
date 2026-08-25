import { describe, it, expect, vi } from 'vitest';
import {
  compterReponses, compterSaisines, compterRattachement, assemblerComptes, recompterSiSucces,
  dossierATrancher, messageAQualifier, type DemandeComptable,
} from './comptesActions';

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
  it('Rattachement : permis en arbitrage_demande (les autres états ne comptent pas)', () => {
    expect(compterRattachement({ arbitrage_demande: 4, en_attente_bati: 7, valide: 99, suivi_aucun_signal: 3 })).toBe(4);
    expect(compterRattachement({ valide: 10 })).toBe(0); // clé absente → 0
  });
});

describe('PASTILLES — cumul (source unique serveur)', () => {
  it('total = somme exacte des quatre (PROJ-2c : + projection)', () => {
    expect(assemblerComptes(2, 3, 4, 5)).toEqual({ reponses: 2, saisines: 3, rattachement: 4, projection: 5, total: 14 });
    expect(assemblerComptes(0, 0, 0, 0)).toEqual({ reponses: 0, saisines: 0, rattachement: 0, projection: 0, total: 0 });
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
