import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { emissionDirecteConnecte, lireIssueIngestion } from './finTunnelConnecte';

/**
 * LOT TUNNEL-CONNECTE (décisions d'Arno du 17/10/2026 : 1d, 2 recommandé, écran B → émission directe sans clic fictif).
 * Le module PUR décide ; la page ne fait que le brancher (épreuves de câblage plus bas, même méthode que
 * `coordonneesConnuesTunnel.test.ts`). La preuve de bout en bout avec une vraie session est `finTunnelConnecte.itest.ts`.
 */
const OK = { jetonRectification: null, jetonEmission: 'JETON', projetId: 42 };

describe('emissionDirecteConnecte — quand sauter les écrans A et B', () => {
  it('connecté, dossier existant, jeton d’émission et projet → émission directe', () => {
    expect(emissionDirecteConnecte({ connecte: true, ingestion: OK })).toEqual({ jetonEmission: 'JETON', projetId: 42 });
  });
  it('non connecté → jamais (parcours inchangé)', () => {
    expect(emissionDirecteConnecte({ connecte: false, ingestion: OK })).toBeNull();
  });
  it('ingestion en échec → parcours d’avant (écran A avec son message)', () => {
    expect(emissionDirecteConnecte({ connecte: true, ingestion: null })).toBeNull();
  });
  it('dossier NEUF (jeton de rectification) → parcours d’avant, qui sait le compléter', () => {
    expect(emissionDirecteConnecte({ connecte: true, ingestion: { ...OK, jetonRectification: 'R' } })).toBeNull();
  });
  it('sans jeton d’émission ou sans projet → parcours d’avant', () => {
    expect(emissionDirecteConnecte({ connecte: true, ingestion: { ...OK, jetonEmission: null } })).toBeNull();
    expect(emissionDirecteConnecte({ connecte: true, ingestion: { ...OK, projetId: null } })).toBeNull();
  });
  it('lecture défensive de la réponse d’ingestion', () => {
    expect(lireIssueIngestion({ jetonRectification: null, jetonEmission: 'E', projetId: 7 })).toEqual({ jetonRectification: null, jetonEmission: 'E', projetId: 7 });
    expect(lireIssueIngestion(null)).toEqual({ jetonRectification: null, jetonEmission: null, projetId: null });
    expect(lireIssueIngestion({ projetId: '7' }).projetId).toBeNull();
  });
});

const page = readFileSync(path.join(process.cwd(), 'app/page.tsx'), 'utf8').replace(/\s+/g, ' ');
const ecran = page.slice(page.indexOf('function EcranCertificat('), page.indexOf('function appliqueMasqueTel('));

describe('câblage dans la page de demande de certificat', () => {
  it('après l’ingestion, un connecté émet directement : confirmation, puis émission (ni écran A ni écran B)', () => {
    expect(ecran).toContain('const issue = await soumettre();');
    expect(ecran).toContain('const direct = emissionDirecteConnecte({ connecte: compte !== null, ingestion: issue });');
    expect(ecran).toContain('if (direct !== null) { setCoordsValidees(true); setConfirme(true); void emettreCertificat(direct.jetonEmission, direct.projetId); }');
  });
  it('aucun clic fictif dans les statistiques sur ce chemin', () => {
    const chemin = ecran.slice(ecran.indexOf('const issue = await soumettre();'), ecran.indexOf('})();', ecran.indexOf('const issue = await soumettre();')));
    expect(chemin).not.toContain('mesure(');
  });
  it('non connecté : les écrans A et B et leur logique sont inchangés', () => {
    expect(ecran).toContain('if (soumis && !coordsValidees) {');
    expect(ecran).toContain('Validez vos coordonnées d’envoi');
    expect(ecran).toContain('Comment souhaitez-vous continuer&nbsp;?®');
    expect(ecran).toContain('const onValiderCoordonnees = () => { setCoordsValidees(true); };');
    expect(ecran).toContain('if (choix === "unique") void recevoirCertificat(); else if (choix === "illimite") void validerIllimite();');
  });
  it('F2 : proposée dans le formulaire à un connecté qui ne l’a pas (et envoyée avec l’ingestion), jamais à un visiteur', () => {
    expect(ecran).toContain('const f2AuFormulaire = compte === null ? [] : finalitesActivesTunnel().filter( (t) => t.finalite === "email_marketing" && !consentementDejaValable(compte, t.finalite), );');
    expect(ecran).toContain('const finalitesAProposerA = [...finalitesHorsF2A, ...f2AuFormulaire];');
    expect(ecran).toContain('consentements: finalitesActivesTunnel() .filter((t) => consentements[t.finalite])');
  });
  it('F2 déjà valable pour un connecté : la mention de l’écran A est dite dans le formulaire', () => {
    expect(ecran).toContain('{compte !== null && consentementDejaValable(compte, "email_marketing") && (');
    expect(ecran.split('Votre accord pour l’envoi de mails est déjà enregistré sur votre compte.').length - 1).toBe(2);
  });
});
