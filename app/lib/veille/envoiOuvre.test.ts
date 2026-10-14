import { describe, it, expect } from 'vitest';
import {
  momentEnvoiRelance, fenetreEnvoiOuverte, etatFiltreHoraire, prochainCreneauEnvoi, momentPrevuRelance,
  jourEcheanceEtape, estJourOuvre, type FiltreHoraire,
} from './envoiOuvre';
import { etapeCible, type ReglagesCascade } from './cascadeRelance';
import { motifDesalignement } from '../sitadel/envoiRelance';
import { instantParis, partiesParis } from '../temps/paris';

/**
 * ENVOI EN JOUR ET HEURE OUVRÉS — cœur PUR. Dates construites via `instantParis(a, mois, jour, heure)` = heure de PARIS,
 * quel que soit le fuseau du runner (lot PRÉPARATION-PORTABILITÉ : la suite doit être verte sous TZ=UTC comme sous Paris). Repères 2026 : lun 24/08 … dim 30/08 août.
 */
// Semaine repère : lundi 24/08/2026 → dimanche 30/08/2026.
const LUN = instantParis(2026, 8, 24, 10); // lundi
const MAR = instantParis(2026, 8, 25, 10);
const MER = instantParis(2026, 8, 26, 10);
const JEU = instantParis(2026, 8, 27, 10);
const VEN = instantParis(2026, 8, 28, 10);
const SAM = instantParis(2026, 8, 29, 10);
const DIM = instantParis(2026, 8, 30, 10);
const ymd = (d: Date) => { const p = partiesParis(d); return `${p.annee}-${p.mois}-${p.jour} ${p.heure}h`; };
const REG: ReglagesCascade = { rappelJoursAvant: 10, avisJoursAvant: 3, saisineDelaiJours: 4 };

describe('estJourOuvre', () => {
  it('lundi→vendredi ouvrés, samedi/dimanche non', () => {
    expect([LUN, MAR, MER, JEU, VEN].every(estJourOuvre)).toBe(true);
    expect(estJourOuvre(SAM)).toBe(false);
    expect(estJourOuvre(DIM)).toBe(false);
  });
});

describe('momentEnvoiRelance — chaque variante × chaque jour (heureDebut = 9)', () => {
  it('jour ouvré → le jour même à 9 h, pour les trois variantes', () => {
    for (const j of [LUN, MAR, MER, JEU, VEN]) {
      for (const v of ['rappel', 'avis', 'saisine'] as const) {
        const m = momentEnvoiRelance(v, j, 9);
        const pj = partiesParis(j);
        expect(ymd(m)).toBe(`${pj.annee}-${pj.mois}-${pj.jour} 9h`);
      }
    }
  });
  it('rappel / avis un SAMEDI → vendredi (avance)', () => {
    expect(ymd(momentEnvoiRelance('rappel', SAM, 9))).toBe('2026-8-28 9h'); // ven 28/08
    expect(ymd(momentEnvoiRelance('avis', SAM, 9))).toBe('2026-8-28 9h');
  });
  it('rappel / avis un DIMANCHE → vendredi (avance)', () => {
    expect(ymd(momentEnvoiRelance('rappel', DIM, 9))).toBe('2026-8-28 9h'); // ven 28/08
    expect(ymd(momentEnvoiRelance('avis', DIM, 9))).toBe('2026-8-28 9h');
  });
  it('saisine un SAMEDI → lundi (recule)', () => {
    expect(ymd(momentEnvoiRelance('saisine', SAM, 9))).toBe('2026-8-31 9h'); // lun 31/08
  });
  it('saisine un DIMANCHE → lundi (recule)', () => {
    expect(ymd(momentEnvoiRelance('saisine', DIM, 9))).toBe('2026-8-31 9h'); // lun 31/08
  });
});

describe('fenetreEnvoiOuverte', () => {
  it('jour ouvré DANS la fenêtre → ouverte', () => {
    expect(fenetreEnvoiOuverte(instantParis(2026, 8, 25, 10), 9, 11)).toEqual({ coherente: true, ouverte: true });
  });
  it('jour ouvré HORS fenêtre (avant / après) → fermée', () => {
    expect(fenetreEnvoiOuverte(instantParis(2026, 8, 25, 8), 9, 11).ouverte).toBe(false);
    expect(fenetreEnvoiOuverte(instantParis(2026, 8, 25, 11), 9, 11).ouverte).toBe(false); // fin exclue
    expect(fenetreEnvoiOuverte(instantParis(2026, 8, 25, 21), 9, 11).ouverte).toBe(false);
  });
  it('week-end même en heure ouvrée → fermée', () => {
    expect(fenetreEnvoiOuverte(instantParis(2026, 8, 29, 10), 9, 11).ouverte).toBe(false); // samedi
    expect(fenetreEnvoiOuverte(instantParis(2026, 8, 30, 10), 9, 11).ouverte).toBe(false); // dimanche
  });
  it('bornes incohérentes (début ≥ fin) → coherente false, ouverte false', () => {
    expect(fenetreEnvoiOuverte(instantParis(2026, 8, 25, 10), 11, 9)).toEqual({ coherente: false, ouverte: false });
    expect(fenetreEnvoiOuverte(instantParis(2026, 8, 25, 10), 9, 9)).toEqual({ coherente: false, ouverte: false });
  });
});

describe('etatFiltreHoraire — décision d’envoi (manuel jamais bridé)', () => {
  const f = (over: Partial<FiltreHoraire>): FiltreHoraire => ({ coherente: true, ouverte: true, heureDebut: 9, heureFin: 11, maintenant: MAR, ...over });
  it('filtre ABSENT (envoi manuel) → envoie toujours', () => {
    expect(etatFiltreHoraire(undefined)).toEqual({ envoie: true, incoherente: false });
  });
  it('fenêtre ouverte → envoie', () => expect(etatFiltreHoraire(f({ ouverte: true })).envoie).toBe(true));
  it('fenêtre fermée (jour/heure) → n’envoie pas', () => expect(etatFiltreHoraire(f({ ouverte: false })).envoie).toBe(false));
  it('config incohérente → n’envoie pas, signalé', () => {
    expect(etatFiltreHoraire(f({ coherente: false, ouverte: false }))).toEqual({ envoie: false, incoherente: true });
  });
});

describe('prochainCreneauEnvoi', () => {
  it('jour ouvré avant la fenêtre → aujourd’hui à heureDebut', () => {
    expect(ymd(prochainCreneauEnvoi(instantParis(2026, 8, 25, 7), 9))).toBe('2026-8-25 9h'); // mardi 7h → mardi 9h
  });
  it('jour ouvré APRÈS la fenêtre → lendemain matin', () => {
    expect(ymd(prochainCreneauEnvoi(instantParis(2026, 8, 25, 21), 9))).toBe('2026-8-26 9h'); // mardi soir → mercredi 9h
  });
  it('samedi / dimanche → lundi matin', () => {
    expect(ymd(prochainCreneauEnvoi(SAM, 9))).toBe('2026-8-31 9h'); // lundi 31/08
    expect(ymd(prochainCreneauEnvoi(DIM, 9))).toBe('2026-8-31 9h');
  });
});

describe('un décalage ne déclenche PAS la garde d’obsolescence (lot 3)', () => {
  // Une demande dont l'échéance tombe un mardi : avis dû mardi (J-3). Décalé au lundi ouvré suivant ? Ici on vérifie le principe :
  // ré-dériver l'étape le jour d'envoi RÉEL reste aligné tant qu'on est dans la fenêtre de la variante.
  it('avis envoyé un jour encore dans SA fenêtre → etapeCible = avis → non bloqué', () => {
    // échéance = 2026-09-04. Un envoi le 02/09 (mer) → reste 3 → 'avis' → aligné (le décalage n'a pas franchi la fenêtre).
    const envoye = instantParis(2026, 8, 4, 10); // envoi 04/08 → échéance 04/09
    const jourEnvoi = instantParis(2026, 9, 2, 9); // 02/09, reste 3 = avis
    expect(etapeCible(envoye, jourEnvoi, REG)).toBe('avis');
    expect(motifDesalignement('avis', envoye, jourEnvoi, REG)).toBeNull(); // AUCUN blocage
  });
  it('saisine reculée au lundi (échéance passée le week-end) → etapeCible = saisine → non bloqué', () => {
    const envoye = instantParis(2026, 8, 4, 10); // échéance 04/09
    const lundiApres = instantParis(2026, 9, 7, 9); // 07/09 (lundi) > échéance → reste < 0 → saisine
    expect(etapeCible(envoye, lundiApres, REG)).toBe('saisine');
    expect(motifDesalignement('saisine', envoye, lundiApres, REG)).toBeNull();
  });
});

describe('jourEcheanceEtape / momentPrevuRelance', () => {
  it('jour d’échéance de chaque étape (échéance 04/09/2026 = vendredi)', () => {
    const env = instantParis(2026, 8, 4, 21, 21); // Aubervilliers : envoi 04/08 21:21 → échéance 04/09
    expect(ymd(jourEcheanceEtape('rappel', env, REG))).toBe('2026-8-25 0h'); // 25/08 (mardi)
    expect(ymd(jourEcheanceEtape('avis', env, REG))).toBe('2026-9-1 0h');    // 01/09 (mardi)
    expect(partiesParis(jourEcheanceEtape('saisine', env, REG)).mois).toBe(9); // septembre (04/09)
  });
  it('momentPrevuRelance : jours ouvrés → le jour d’étape à 9 h (aucun décalage)', () => {
    const env = instantParis(2026, 8, 4, 21, 21);
    const tic = instantParis(2026, 8, 25, 8); // 25/08 8h (avant la fenêtre)
    expect(ymd(momentPrevuRelance('rappel', env, REG, 9, tic))).toBe('2026-8-25 9h'); // rappel prévu mardi 25/08 9h
  });
});
