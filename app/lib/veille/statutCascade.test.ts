import { describe, it, expect } from 'vitest';
import { statutCascade, prochaineEtape, libelleCourtCascade, statutSaisine, type EntreeStatutCascade, type EntreeStatutSaisine } from './statutCascade';
import type { ReglagesCascade } from './cascadeRelance';

/**
 * Lot 4/6 — statut DÉRIVÉ de la cascade (pur) : un test par valeur du libellé STATUT (dont « préparé mais non envoyé »), et la
 * prochaine étape (affichée / absence explicitement dite). Heures en Europe/Paris (10:00 UTC en avril = 12:00 CEST).
 */
const REG: ReglagesCascade = { rappelJoursAvant: 10, avisJoursAvant: 3, saisineDelaiJours: 4 };
const ENVOI = '2026-03-14T10:00:00Z'; // échéance 14/04 ; jalons rappel 04/04, avis 11/04, saisine 14/04, CADA 18/04
function e(over: Partial<EntreeStatutCascade> = {}): EntreeStatutCascade {
  return {
    statut: 'envoyee', envoyeLe: ENVOI, statutAcheminement: 'envoye', dossiersDus: 1,
    dernierEnvoiRelance: null, relancePreparee: null, saisineCadaEnvoyeeLe: null, ...over,
  };
}
const j = (iso: string) => new Date(iso);

describe('lot 4 — statutCascade : un libellé par état', () => {
  it('défaut : aucune relance, avant la fenêtre de saisine → « Envoyée le … à … » (Europe/Paris)', () => {
    expect(statutCascade(e(), j('2026-04-10T10:00:00Z'), REG)).toBe('Envoyée le 14 mars 2026 à 11:00'); // 14 mars = CET (+1, avant l'heure d'été)
  });
  it('brouillon PRÉPARÉ non envoyé, SANS info d’envoi → « Rappel prêt, non envoyé » (compat, jamais « envoyé »)', () => {
    expect(statutCascade(e({ relancePreparee: { variante: 'rappel' } }), j('2026-04-06T10:00:00Z'), REG)).toBe('Rappel prêt, non envoyé');
  });
  // « dire quand ça part » — deux états de l'interrupteur + horaires venus des RÉGLAGES (jamais en dur).
  it('brouillon préparé + envoi auto ON → dit qu’il PART TOUT SEUL et la fenêtre (heures des réglages)', () => {
    const s = statutCascade(e({ relancePreparee: { variante: 'rappel' } }), j('2026-04-06T10:00:00Z'), REG, { relanceAutoActive: true, envoiHeureDebut: 9, envoiHeureFin: 11 });
    expect(s).toMatch(/partira tout seul/);
    expect(s).toMatch(/de 9 h à 11 h/);      // horaires = réglages
    expect(s).not.toMatch(/non envoyé/);
  });
  it('brouillon préparé + envoi auto OFF → dit qu’il ne partira PAS seul (à envoyer à la main)', () => {
    const s = statutCascade(e({ relancePreparee: { variante: 'rappel' } }), j('2026-04-06T10:00:00Z'), REG, { relanceAutoActive: false, envoiHeureDebut: 9, envoiHeureFin: 11 });
    expect(s).toMatch(/désactivé/);
    expect(s).toMatch(/à la main/);
    expect(s).not.toMatch(/partira tout seul/);
  });
  it('brouillon préparé + fenêtre mal réglée (début ≥ fin) → dit que rien ne partira', () => {
    const s = statutCascade(e({ relancePreparee: { variante: 'rappel' } }), j('2026-04-06T10:00:00Z'), REG, { relanceAutoActive: true, envoiHeureDebut: 11, envoiHeureFin: 9 });
    expect(s).toMatch(/mal réglée/);
    expect(s).toMatch(/rien ne partira/);
  });
  it('rappel RÉELLEMENT envoyé → « Rappel envoyé le … à … »', () => {
    expect(statutCascade(e({ dernierEnvoiRelance: { variante: 'rappel', envoyeLe: '2026-04-04T10:00:00Z' } }), j('2026-04-04T12:00:00Z'), REG))
      .toBe('Rappel envoyé le 4 avril 2026 à 12:00');
  });
  it('avis envoyé → « Avis d’échéance envoyé le … à … »', () => {
    expect(statutCascade(e({ dernierEnvoiRelance: { variante: 'avis', envoyeLe: '2026-04-11T10:00:00Z' } }), j('2026-04-11T12:00:00Z'), REG))
      .toBe('Avis d’échéance envoyé le 11 avril 2026 à 12:00');
  });
  it('saisine (relance) envoyée, avant le délai de dépôt → « Saisine annoncée le … à … »', () => {
    expect(statutCascade(e({ dernierEnvoiRelance: { variante: 'saisine', envoyeLe: '2026-04-14T10:00:00Z' } }), j('2026-04-14T12:00:00Z'), REG))
      .toBe('Saisine annoncée le 14 avril 2026 à 12:00');
  });
  it('échéance + délai atteinte, saisine CADA pas partie → « Saisine CADA à lancer » (prioritaire sur « annoncée »)', () => {
    expect(statutCascade(e({ dernierEnvoiRelance: { variante: 'saisine', envoyeLe: '2026-04-14T10:00:00Z' } }), j('2026-04-20T10:00:00Z'), REG))
      .toBe('Saisine CADA à lancer'); // maintenant 20/04 ≥ saisineLe 18/04
  });
  it('saisine CADA envoyée → « Saisine CADA envoyée le … »', () => {
    expect(statutCascade(e({ saisineCadaEnvoyeeLe: '2026-04-19T10:00:00Z' }), j('2026-04-25T10:00:00Z'), REG))
      .toBe('Saisine CADA envoyée le 19 avril 2026');
  });
  it('demande close, aucune relance → « Clôturée »', () => {
    expect(statutCascade(e({ statut: 'close' }), j('2026-04-10T10:00:00Z'), REG)).toBe('Clôturée');
  });
});

describe('lot 4 — prochaineEtape : étape suivante datée, ou absence explicitement dite', () => {
  it('avant le rappel → « Rappel prévu le … »', () => {
    expect(prochaineEtape(e(), j('2026-04-01T10:00:00Z'), REG)).toBe('Rappel prévu le 4 avril 2026');
  });
  it('entre rappel et avis → « Avis d’échéance prévu le … »', () => {
    expect(prochaineEtape(e(), j('2026-04-06T10:00:00Z'), REG)).toBe('Avis d’échéance prévu le 11 avril 2026');
  });
  it('entre avis et échéance → « Saisine prévu le … »', () => {
    expect(prochaineEtape(e(), j('2026-04-12T10:00:00Z'), REG)).toBe('Saisine prévu le 14 avril 2026');
  });
  it('après l’échéance, avant le dépôt → « Saisine CADA prévu le … »', () => {
    expect(prochaineEtape(e(), j('2026-04-15T10:00:00Z'), REG)).toBe('Saisine CADA prévu le 18 avril 2026');
  });
  it('après le délai de dépôt → « Saisine CADA à lancer — aucune étape ultérieure. »', () => {
    expect(prochaineEtape(e(), j('2026-04-20T10:00:00Z'), REG)).toBe('Saisine CADA à lancer — aucune étape ultérieure.');
  });
  it('ABSENCE dite : close / non délivrée / tous dossiers obtenus / saisine partie', () => {
    expect(prochaineEtape(e({ statut: 'close' }), j('2026-04-06T10:00:00Z'), REG)).toBe('Demande clôturée — aucune étape prévue.');
    expect(prochaineEtape(e({ statutAcheminement: 'rebond' }), j('2026-04-06T10:00:00Z'), REG)).toBe('Demande non délivrée — aucune étape prévue.');
    expect(prochaineEtape(e({ dossiersDus: 0 }), j('2026-04-06T10:00:00Z'), REG)).toBe('Tous les dossiers obtenus — cascade terminée.');
    expect(prochaineEtape(e({ saisineCadaEnvoyeeLe: '2026-04-19T10:00:00Z' }), j('2026-04-20T10:00:00Z'), REG)).toBe('Saisine CADA envoyée — plus d’étape de relance.');
  });
});

describe('lot 5b (B) — statutSaisine : un libellé lisible par état, e-mail vs dépôt formulaire distingués', () => {
  const s = (over: Partial<EntreeStatutSaisine> = {}): EntreeStatutSaisine =>
    ({ materialisee: true, cadaEmailVide: false, ...over });

  it('pas encore matérialisée (rien en base) → « Saisine à lancer »', () => {
    expect(statutSaisine(s({ materialisee: false }))).toBe('Saisine à lancer');
  });
  it('abandonnée → « Saisine abandonnée »', () => {
    expect(statutSaisine(s({ statut: 'abandonnee' }))).toBe('Saisine abandonnée');
  });
  it('envoyée par e-mail (acheminement canal=email) → « Saisine envoyée le … »', () => {
    expect(statutSaisine(s({ statut: 'envoyee', canal: 'email', envoyeeLe: '2026-05-10T09:00:00Z' })))
      .toBe('Saisine envoyée le 10 mai 2026');
  });
  it('déposée sur le formulaire (envoyée SANS acheminement → canal null) → « Saisine déposée le … »', () => {
    expect(statutSaisine(s({ statut: 'envoyee', canal: null, envoyeeLe: '2026-05-10T09:00:00Z' })))
      .toBe('Saisine déposée le 10 mai 2026');
  });
  it('préparée mais pas envoyée, adresse CADA vide → « Saisine à déposer sur le formulaire »', () => {
    expect(statutSaisine(s({ statut: 'brouillon', cadaEmailVide: true }))).toBe('Saisine à déposer sur le formulaire');
  });
  it('préparée mais pas envoyée, adresse CADA configurée → « Saisine préparée, non envoyée »', () => {
    expect(statutSaisine(s({ statut: 'brouillon', cadaEmailVide: false }))).toBe('Saisine préparée, non envoyée');
  });
});

/**
 * LOT-7 (A) — libelleCourtCascade : un ÉTAT court (une ligne), MÊME priorité que statutCascade. Sert la colonne « Statut » (texte
 * complet en infobulle). La suspension (« Arrêtée ») est décidée en amont, hors de cette fonction.
 */
describe('LOT-7 — libelleCourtCascade : état compact, jamais une phrase', () => {
  const maint = j('2026-04-20T12:00:00Z'); // après tous les jalons (échéance 14/04, CADA 18/04)
  it('saisine CADA envoyée → « Saisine CADA envoyée »', () => {
    expect(libelleCourtCascade(e({ saisineCadaEnvoyeeLe: '2026-04-19T00:00:00Z' }), maint, REG)).toBe('Saisine CADA envoyée');
  });
  it('délai CADA atteint + dossiers dus → « Saisine CADA à lancer »', () => {
    expect(libelleCourtCascade(e({ dossiersDus: 1 }), maint, REG)).toBe('Saisine CADA à lancer');
  });
  it('dernier envoi réel : rappel / avis / saisine annoncée → libellés courts', () => {
    expect(libelleCourtCascade(e({ dernierEnvoiRelance: { variante: 'rappel', envoyeLe: ENVOI } }), j('2026-04-05T12:00:00Z'), REG)).toBe('Rappel envoyé');
    expect(libelleCourtCascade(e({ dernierEnvoiRelance: { variante: 'avis', envoyeLe: ENVOI } }), j('2026-04-12T12:00:00Z'), REG)).toBe('Avis d’échéance envoyé');
    expect(libelleCourtCascade(e({ dernierEnvoiRelance: { variante: 'saisine', envoyeLe: ENVOI } }), j('2026-04-15T12:00:00Z'), REG)).toBe('Saisine annoncée');
  });
  it('relance PRÉPARÉE non envoyée → « <nom> prêt » (jamais la longue phrase d’envoi auto)', () => {
    expect(libelleCourtCascade(e({ relancePreparee: { variante: 'rappel' } }), j('2026-04-01T12:00:00Z'), REG)).toBe('Rappel prêt');
  });
  it('clôturée → « Clôturée » ; sinon → « Envoyée »', () => {
    expect(libelleCourtCascade(e({ statut: 'close', dossiersDus: 0 }), maint, REG)).toBe('Clôturée');
    expect(libelleCourtCascade(e({ envoyeLe: null, statutAcheminement: 'en_attente' }), j('2026-03-01T12:00:00Z'), REG)).toBe('Envoyée');
  });
});
