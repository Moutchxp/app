import { describe, it, expect } from 'vitest';
import { projeterParcours, partitionnerFrise, type EvenementFrise, type ReglagesParcours } from './friseSuivi';
import type { EnvoiHistorique } from './historiqueEnvois';
import type { EtatPartiel } from '../permis/dossierPartiel';

/**
 * LOT 18 — cœur PUR de la projection du parcours. On prouve : le parcours ORDINAIRE complet depuis l'envoi initial (toutes les étapes à
 * venir datées) ; le parcours APRÈS BIFURCATION (ordinaires non survenues retirées, partielles ajoutées, dates recalculées) ; la position
 * courante (liseré) sur la dernière étape franchie ; le basculement programmée→effectuée sur ENVOI RÉEL ; les cas « tout juste envoyée »
 * et « saisine CADA atteinte ».
 */
const REGLAGES: ReglagesParcours = {
  ordinaire: { rappelJoursAvant: 10, avisJoursAvant: 3, saisineDelaiJours: 4 },
  partiel: { relanceJours: 10, nbRelancesAvantAnnonce: 2, annonceJours: 10, saisineJours: 4 },
  cadaPartielMois: 1, cadaPartielJours: 4,
};
const INITIAL = '2026-08-04T21:00:00Z'; // échéance ordinaire = 04/09 ; rappel 25/08, avis 01/09, info 04/09, dépôt 08/09
const initiale = (destinataire: string | null = 'mairie@ex.fr'): EnvoiHistorique => ({ le: INITIAL, nature: 'initiale', grade: null, libelle: 'Demande initiale de communication', destinataire });
const relanceOrd = (le: string, grade: string, destinataire: string | null = 'mairie@ex.fr'): EnvoiHistorique => ({ le, nature: 'relance_ordinaire', grade, libelle: `Relance — ${grade}`, destinataire });
const relancePart = (le: string): EnvoiHistorique => ({ le, nature: 'relance_partielle', grade: '1re relance', libelle: 'Relance partielle — 1re relance', destinataire: null });
const suspension = (le: string): EtatPartiel => ({ le, familles: ['cerfa'], origine: 'declaree' });
const base = { envoyeLe: INITIAL, envois: [initiale()], suspension: null, saisineCadaEnvoyeeLe: null, annonceCadaEnvoyeeLe: null, destinataireCourant: 'urba@mairie.fr', bifurcationDestinataire: null, annonceCadaDestinataire: null, reglages: REGLAGES };
const jours = (ev: EvenementFrise[]) => ev.map((e) => ({ l: e.libelle, q: e.quand, d: e.le.slice(0, 10) }));

describe('projeterParcours — régime ORDINAIRE', () => {
  it('demande TOUT JUSTE envoyée : la ligne 1 est faite, toutes les suivantes déjà écrites « à venir » avec leurs dates', () => {
    const p = projeterParcours(base);
    expect(jours(p)).toEqual([
      { l: 'Demande initiale de communication', q: 'passe', d: '2026-08-04' },
      { l: 'Relance programmée', q: 'avenir', d: '2026-08-25' }, // rappel J-10
      { l: 'Relance programmée', q: 'avenir', d: '2026-09-01' }, // avis J-3
      { l: 'Information saisine CADA', q: 'avenir', d: '2026-09-04' }, // échéance
      { l: 'Dépôt de saisine CADA', q: 'avenir', d: '2026-09-08' }, // échéance + 4
    ]);
  });

  it('position courante (liseré) = la SEULE étape franchie = la demande initiale', () => {
    const p = projeterParcours(base);
    expect(p.filter((e) => e.courant).map((e) => e.libelle)).toEqual(['Demande initiale de communication']);
  });

  it('programmée → EFFECTUÉE sur envoi RÉEL (pas sur la date atteinte) ; le liseré descend sur la dernière franchie', () => {
    const p = projeterParcours({ ...base, envois: [initiale(), relanceOrd('2026-08-25T10:00:00Z', 'Rappel')] });
    const rappel = p.find((e) => e.le.startsWith('2026-08-25'))!;
    expect(rappel).toMatchObject({ libelle: 'Relance effectuée', quand: 'passe' });
    expect(p.filter((e) => e.courant).map((e) => e.le.slice(0, 10))).toEqual(['2026-08-25']); // liseré descendu
    expect(p.filter((e) => e.quand === 'passe').length).toBe(2); // initiale + rappel
  });

  it('saisine CADA ATTEINTE (dépôt réel) → « Dépôt de saisine CADA » effectué, liseré dessus', () => {
    const p = projeterParcours({ ...base, saisineCadaEnvoyeeLe: '2026-09-08T09:00:00Z' });
    const depot = p.find((e) => e.libelle === 'Dépôt de saisine CADA')!;
    expect(depot).toMatchObject({ quand: 'passe', courant: true });
  });
});

describe('projeterParcours — BIFURCATION (ordinaire → partiel)', () => {
  const bif = { ...base, envois: [initiale(), relanceOrd('2026-08-25T10:00:00Z', 'Rappel')], suspension: suspension('2026-08-28T12:00:00Z') };

  it('les étapes ordinaires NON survenues disparaissent ; les étapes partielles + dates recalculées apparaissent', () => {
    const p = projeterParcours(bif);
    expect(jours(p)).toEqual([
      { l: 'Demande initiale de communication', q: 'passe', d: '2026-08-04' },
      { l: 'Relance effectuée', q: 'passe', d: '2026-08-25' },                 // rappel réalisé AVANT bifurcation → reste (histoire)
      { l: 'Relance pièces complémentaires', q: 'passe', d: '2026-08-28' },    // bifurcation
      { l: 'Relance programmée', q: 'avenir', d: '2026-09-07' },               // partielle 1 : J+10
      { l: 'Relance programmée', q: 'avenir', d: '2026-09-17' },               // partielle 2 : J+20
      { l: 'Information saisine CADA', q: 'avenir', d: '2026-09-27' },         // annonce : J+30
      { l: 'Dépôt de saisine CADA', q: 'avenir', d: '2026-10-02' },           // max(annonce+4=01/10, butoir 28/08+1m+4j=02/10)
    ]);
    // JAMAIS deux futurs concurrents : aucune étape ordinaire à venir (avis/info/dépôt ordinaires) ne subsiste.
    expect(p.filter((e) => e.quand === 'avenir').length).toBe(4);
  });

  it('la bifurcation porte le badge + est la position courante (dernière franchie) sur la 154 d’aujourd’hui', () => {
    const p = projeterParcours(bif);
    const b = p.find((e) => e.bifurcation)!;
    expect(b.libelle).toBe('Relance pièces complémentaires');
    expect(b.courant).toBe(true);
    expect(p.filter((e) => e.bifurcation).length).toBe(1);
    expect(p.filter((e) => e.courant).length).toBe(1);
  });

  it('relance partielle réellement envoyée → « Relance effectuée », liseré descendu, dates suivantes toujours projetées', () => {
    const p = projeterParcours({ ...bif, envois: [...bif.envois, relancePart('2026-09-07T10:00:00Z')] });
    const r1 = p.find((e) => e.le.startsWith('2026-09-07'))!;
    expect(r1).toMatchObject({ libelle: 'Relance effectuée', quand: 'passe', courant: true });
    expect(p.filter((e) => e.courant).length).toBe(1);
  });

  it('annonce CADA réellement envoyée → « Information saisine CADA » effectuée', () => {
    const p = projeterParcours({ ...bif, annonceCadaEnvoyeeLe: '2026-09-27T09:00:00Z' });
    expect(p.find((e) => e.libelle === 'Information saisine CADA')).toMatchObject({ quand: 'passe' });
  });
});

describe('LOT 19 (C) — DESTINATAIRE sur chaque étape d’envoi', () => {
  it('étape FAITE → l’adresse RÉELLEMENT utilisée (destinataire de l’envoi) ; étape À VENIR ordinaire → le destinataire courant', () => {
    const p = projeterParcours({ ...base, envois: [initiale('mairie@ex.fr'), relanceOrd('2026-08-25T10:00:00Z', 'Rappel')] });
    const initialeEv = p.find((e) => e.libelle === 'Demande initiale de communication')!;
    expect(initialeEv.detail).toBe('à mairie@ex.fr');                              // faite : adresse réelle de l'envoi
    const rappel = p.find((e) => e.le.startsWith('2026-08-25'))!;
    expect(rappel.detail).toBe('à mairie@ex.fr · rappel courtois');               // faite : adresse réelle + nature
    const avis = p.find((e) => e.detail?.includes('avis'))!;
    expect(avis.detail).toBe('à urba@mairie.fr · avis d’échéance');               // à venir : destinataire courant + nature
  });

  it('étape À VENIR partielle (In-Reply-To) → PAS d’adresse figée trompeuse, mais « au dernier interlocuteur »', () => {
    const p = projeterParcours({ ...base, suspension: suspension('2026-08-28T12:00:00Z') });
    const r1 = p.find((e) => e.detail?.startsWith('1re relance'))!;
    expect(r1.detail).toBe('1re relance · au dernier interlocuteur de la mairie');
    const info = p.find((e) => e.libelle === 'Information saisine CADA')!;
    expect(info.detail).toBe('au dernier interlocuteur de la mairie');
  });

  it('étape qui n’est PAS un envoi (Dépôt de saisine CADA) → AUCUNE adresse', () => {
    const p = projeterParcours({ ...base, suspension: suspension('2026-08-28T12:00:00Z') });
    expect(p.find((e) => e.libelle === 'Dépôt de saisine CADA')!.detail).toBeNull();
  });

  it('LOT 22 — la BIFURCATION porte l’adresse STOCKÉE par la réclamation → CERTAINE, même déclarée hors outil (point 5)', () => {
    const p = projeterParcours({ ...base, suspension: suspension('2026-08-28T12:00:00Z'), bifurcationDestinataire: 'lauriane.pangui@mairie.fr' });
    const bif = p.find((e) => e.bifurcation)!;
    // adresse STOCKÉE (même origine 'declaree') → CERTAINE (pas de « présumé »), puis la nature, séparés par « · »
    expect(bif.detail).toBe('à lauriane.pangui@mairie.fr · relance de complément déclarée hors outil');
  });

  it('LOT 21 — bifurcation via l’OUTIL (origine « outil ») + adresse stockée → adresse CERTAINE (pas de « présumé »)', () => {
    const p = projeterParcours({ ...base, suspension: { le: '2026-08-28T12:00:00Z', familles: ['cerfa'], origine: 'outil' }, bifurcationDestinataire: 'urba@mairie.fr' });
    const bif = p.find((e) => e.bifurcation)!;
    expect(bif.detail).toBe('à urba@mairie.fr · complément de pièces réclamé par l’outil');
  });

  it('LOT 21 — AUCUNE adresse stockée pour la bifurcation → repli sur le destinataire connu, marqué PRÉSUMÉ (jamais sans adresse)', () => {
    const p = projeterParcours({ ...base, suspension: { le: '2026-08-28T12:00:00Z', familles: ['cerfa'], origine: 'outil' }, bifurcationDestinataire: null, destinataireCourant: 'urba@mairie.fr' });
    const bif = p.find((e) => e.bifurcation)!;
    expect(bif.detail).toBe('à urba@mairie.fr (présumé) · complément de pièces réclamé par l’outil');
  });

  it('LOT 21 — annonce CADA effectuée → adresse RÉELLEMENT servie (captée, certaine)', () => {
    const p = projeterParcours({ ...base, suspension: suspension('2026-08-28T12:00:00Z'), annonceCadaEnvoyeeLe: '2026-09-27T09:00:00Z', annonceCadaDestinataire: 'lauriane.pangui@mairie.fr' });
    const info = p.find((e) => e.libelle === 'Information saisine CADA')!;
    expect(info).toMatchObject({ quand: 'passe', detail: 'à lauriane.pangui@mairie.fr' });
  });
});

describe('projeterParcours — bornes', () => {
  it('demande en brouillon (pas d’envoi initial) → parcours VIDE', () => {
    expect(projeterParcours({ ...base, envoyeLe: null })).toEqual([]);
  });
});

describe('partitionnerFrise — repli des faits anciens, étapes à venir toujours visibles', () => {
  const f = (i: number): EvenementFrise => ({ le: `2026-08-0${i + 1}T08:00:00Z`, quand: 'passe', libelle: `Fait ${i}`, detail: null });
  const a: EvenementFrise = { le: '2026-09-07T00:00:00Z', quand: 'avenir', libelle: 'Relance programmée', detail: null };
  it('≤ 4 faits → tout visible ; l’à-venir à part', () => {
    expect(partitionnerFrise([f(0), f(1), a])).toEqual({ passeVisible: [f(0), f(1)], passeReplie: [], avenir: [a] });
  });
  it('> 4 faits → ancre + 3 récents visibles, milieu replié ; l’à-venir jamais replié', () => {
    const faits = [0, 1, 2, 3, 4, 5].map(f);
    const { passeVisible, passeReplie, avenir } = partitionnerFrise([...faits, a]);
    expect(passeVisible).toEqual([faits[0], faits[3], faits[4], faits[5]]);
    expect(passeReplie).toEqual([faits[1], faits[2]]);
    expect(avenir).toEqual([a]);
  });
});
