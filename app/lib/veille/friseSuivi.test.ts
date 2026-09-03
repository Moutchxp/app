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
  multiAdresse: { active: false, nbDernieres: 2 }, // par défaut inactif dans ces cas de base (les cas Règle B sont testés à part, LOT 27)
};
const INITIAL = '2026-08-04T21:00:00Z'; // échéance ordinaire = 04/09 ; rappel 25/08, avis 01/09, info 04/09, dépôt 08/09
const initiale = (destinataire: string | null = 'mairie@ex.fr'): EnvoiHistorique => ({ le: INITIAL, nature: 'initiale', grade: null, libelle: 'Demande initiale de communication', destinataire });
const relanceOrd = (le: string, grade: string, destinataire: string | null = 'mairie@ex.fr'): EnvoiHistorique => ({ le, nature: 'relance_ordinaire', grade, libelle: `Relance — ${grade}`, destinataire });
const relancePart = (le: string): EnvoiHistorique => ({ le, nature: 'relance_partielle', grade: '1re relance', libelle: 'Relance partielle — 1re relance', destinataire: null });
const suspension = (le: string): EtatPartiel => ({ le, familles: ['cerfa'], origine: 'declaree' });
// LOT 48 — relance sur réponse partielle (mécanisme DISTINCT de la cascade) : étape à part entière.
const relanceReponse = (le: string): EnvoiHistorique => ({ le, nature: 'relance_reponse', grade: '1re relance', libelle: 'Relance après réponse partielle', destinataire: 'lauriane.pangui@mairie.fr' });
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

describe('LOT 30 (③) — frise véridique : relance COMPTÉE faite à la main vs envoi SUPPLÉMENTAIRE non compté', () => {
  const J = '2026-08-28T12:00:00Z';
  it('une relance partielle COMPTÉE + faite à la main porte la mention « fait à la main »', () => {
    const manuelle: EnvoiHistorique = { le: '2026-09-05T09:00:00Z', nature: 'relance_partielle', grade: '1re relance', libelle: 'Relance partielle — 1re relance', destinataire: 'urba@m.fr', manuel: true };
    const p = projeterParcours({ ...base, suspension: suspension(J), envois: [initiale(), manuelle] });
    const eff = p.find((e) => e.libelle === 'Relance effectuée' && e.detail?.includes('1re relance'))!;
    expect(eff.detail).toBe('à urba@m.fr · 1re relance · fait à la main');
  });
  it('un envoi SUPPLÉMENTAIRE (non compté) apparaît « Envoi supplémentaire », sans masquer le futur créneau', () => {
    const extra: EnvoiHistorique = { le: '2026-09-06T09:00:00Z', nature: 'complement_extra', grade: null, libelle: 'Envoi supplémentaire', destinataire: 'urba@m.fr' };
    const p = projeterParcours({ ...base, suspension: suspension(J), envois: [initiale(), extra] });
    expect(p.find((e) => e.libelle === 'Envoi supplémentaire')?.detail).toBe('à urba@m.fr · relance manuelle, hors calendrier');
    // le créneau « 1re relance » reste À VENIR (non consommé) : l'extra ne fait pas avancer la cascade.
    expect(p.some((e) => e.libelle === 'Relance programmée' && e.detail?.startsWith('1re relance'))).toBe(true);
  });
});

describe('projeterParcours — bornes', () => {
  it('demande en brouillon (pas d’envoi initial) → parcours VIDE', () => {
    expect(projeterParcours({ ...base, envoyeLe: null })).toEqual([]);
  });
});

describe('LOT 27 — Règle B : les 2 dernières étapes À VENIR de chaque cascade annoncent « à toutes les adresses » (la frise ne ment pas)', () => {
  const MULTI: ReglagesParcours = { ...REGLAGES, multiAdresse: { active: true, nbDernieres: 2 } };
  it('ORDINAIRE : rappel (rang 1) = destinataire courant ; avis (2) + information saisine CADA (3) = toutes les adresses', () => {
    const p = projeterParcours({ ...base, reglages: MULTI });
    const rappel = p.find((e) => e.detail?.includes('rappel'))!;
    expect(rappel.detail).toBe('à urba@mairie.fr · rappel courtois');                                   // rang 1 : PAS multi → Règle A (destinataire courant)
    const avis = p.find((e) => e.detail?.includes('avis'))!;
    expect(avis.detail).toBe('à toutes les adresses de la mairie ayant participé · avis d’échéance');   // rang 2 : multi
    const info = p.find((e) => e.libelle === 'Information saisine CADA')!;
    expect(info.detail).toBe('à toutes les adresses de la mairie ayant participé');                     // rang 3 : multi
  });
  it('ORDINAIRE, drapeau INACTIF : avis reste au destinataire courant (arrêt d’urgence → Règle B off)', () => {
    const p = projeterParcours({ ...base, reglages: { ...MULTI, multiAdresse: { active: false, nbDernieres: 2 } } });
    expect(p.find((e) => e.detail?.includes('avis'))!.detail).toBe('à urba@mairie.fr · avis d’échéance');
  });
  it('PARTIEL : 1re relance (rang 1) = interlocuteur ; 2e relance (rang 2) + annonce CADA (rang 3) = toutes les adresses', () => {
    const p = projeterParcours({ ...base, suspension: suspension('2026-08-28T12:00:00Z'), reglages: MULTI });
    const r1 = p.find((e) => e.detail?.startsWith('1re relance'))!;
    expect(r1.detail).toBe('1re relance · au dernier interlocuteur de la mairie');                       // rang 1 sur 3 : PAS multi
    const r2 = p.find((e) => e.detail?.startsWith('2e relance'))!;
    expect(r2.detail).toBe('2e relance · à toutes les adresses de la mairie ayant participé');           // rang 2 : multi
    const info = p.find((e) => e.libelle === 'Information saisine CADA')!;
    expect(info.detail).toBe('à toutes les adresses de la mairie ayant participé');                      // annonce (rang 3) : multi
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

describe('LOT 48 — relance sur réponse partielle : étape à part dans la frise', () => {
  const J = '2026-08-28T12:00:00Z';
  const bif = { ...base, envois: [initiale()], suspension: suspension(J) };

  it('apparaît comme ÉTAPE FRANCHIE « Relance après réponse partielle » à sa date, sans jargon interne', () => {
    const p = projeterParcours({ ...bif, envois: [...bif.envois, relanceReponse('2026-09-03T09:16:00Z')] });
    const et = p.find((e) => e.libelle === 'Relance après réponse partielle');
    expect(et).toBeDefined();
    expect(et!.quand).toBe('passe');
    expect(et!.le.slice(0, 10)).toBe('2026-09-03');
    // aucun code interne à l'écran
    expect(JSON.stringify(p)).not.toMatch(/PART-E|CASC-3|relance_reponse|MOTIF_/);
  });

  it('déplace le LISERÉ (courant) sur elle quand c’est la dernière étape franchie (symptôme d’origine)', () => {
    const p = projeterParcours({ ...bif, envois: [...bif.envois, relanceReponse('2026-09-03T09:16:00Z')] });
    const courant = p.find((e) => e.courant);
    expect(courant?.libelle).toBe('Relance après réponse partielle');
  });

  it('N’ALTÈRE PAS le calendrier de la cascade : la 1re relance programmée reste à venir à sa date (bif + 10 j)', () => {
    const sans = projeterParcours(bif);
    const avec = projeterParcours({ ...bif, envois: [...bif.envois, relanceReponse('2026-09-03T09:16:00Z')] });
    const relanceProg = (p: EvenementFrise[]) => p.find((e) => e.quand === 'avenir' && e.libelle === 'Relance programmée');
    // la relance sur réponse n'est PAS slottée dans la cascade → la 1re relance cascade demeure « à venir » à la même date.
    expect(relanceProg(avec)?.le).toBe(relanceProg(sans)?.le);
    expect(relanceProg(avec)?.le?.slice(0, 10)).toBe('2026-09-07'); // 28/08 + 10 j
  });
});
