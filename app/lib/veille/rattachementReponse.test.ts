import { describe, it, expect } from 'vitest';
import { rattacherReponse, estAccuseDeRebond, type MessageEntrant, type DemandeCandidate } from './rattachementReponse';

/**
 * R2 — module PUR de rattachement. Tests sans réseau ni base : on fabrique un message + des candidates et on vérifie la
 * cascade déterministe (threading → référence complète → référence discrète corps → aucun) et la détection de rebond.
 */
const A: DemandeCandidate = { id: 1, reference: 'SVAV-DEM-2026-000154', profilBoite: 'entreprise', statut: 'envoyee', messageIdsEmis: ['<abc-154@sansvisavis.com>'], numerosDossier: ['0930012500081'] };
const P: DemandeCandidate = { id: 2, reference: 'SVAV-DEM-2026-000200', profilBoite: 'personne', statut: 'envoyee', messageIdsEmis: ['<def-200@sansvisavis.com>'], numerosDossier: ['0930012500082'] };

const msg = (over: Partial<MessageEntrant>): MessageEntrant => ({ messageId: '<reply@mairie.fr>', deAdresse: 'urba@mairie.fr', ...over });

describe('R2 — threading (Message-ID normalisés : chevrons/casse du domaine)', () => {
  it('chevrons présents → rattache par message_id', () => {
    const r = rattacherReponse(msg({ references: ['<abc-154@sansvisavis.com>'] }), [A, P]);
    expect(r).toMatchObject({ demandeId: 1, methode: 'message_id' });
    expect(r.motif.length).toBeGreaterThan(0);
  });
  it('chevrons ABSENTS côté message → rattache quand même (normalisation)', () => {
    const r = rattacherReponse(msg({ inReplyTo: 'abc-154@sansvisavis.com' }), [A, P]);
    expect(r).toMatchObject({ demandeId: 1, methode: 'message_id' });
  });
  it('casse différente sur le DOMAINE → rattache (domaine insensible à la casse)', () => {
    const r = rattacherReponse(msg({ references: ['<abc-154@SANSVISAVIS.COM>'] }), [A, P]);
    expect(r).toMatchObject({ demandeId: 1, methode: 'message_id' });
  });
  it('deux demandes dans le même fil → AMBIGU, non rattaché', () => {
    const a2 = { ...A, messageIdsEmis: ['<x@sansvisavis.com>'] };
    const b2 = { ...P, messageIdsEmis: ['<y@sansvisavis.com>'] };
    const r = rattacherReponse(msg({ references: ['<x@sansvisavis.com>', '<y@sansvisavis.com>'] }), [a2, b2]);
    expect(r.demandeId).toBeNull();
    expect(r.methode).toBe('aucun');
  });
});

describe('R2 — référence complète (hors thread)', () => {
  it('référence dans l’OBJET (cas entreprise) → reference_objet', () => {
    const r = rattacherReponse(msg({ objet: 'RE: Demande — réf. SVAV-DEM-2026-000154', corpsTexte: 'Bonjour, voici les pièces.' }), [A, P]);
    expect(r).toMatchObject({ demandeId: 1, methode: 'reference_objet' });
  });
  it('référence uniquement dans le CORPS → reference_corps', () => {
    const r = rattacherReponse(msg({ objet: 'Votre demande', corpsTexte: 'En réponse à SVAV-DEM-2026-000154.' }), [A, P]);
    expect(r).toMatchObject({ demandeId: 1, methode: 'reference_corps' });
  });
});

describe('R2 — référence discrète (corps SEULEMENT, cas personne)', () => {
  it('discrète dans le corps + statut envoyee → reference_corps', () => {
    const r = rattacherReponse(msg({ objet: 'Demande de communication de documents administratifs', corpsTexte: 'Bonjour, votre référence 2026-000200 a été traitée.' }), [A, P]);
    expect(r).toMatchObject({ demandeId: 2, methode: 'reference_corps' });
  });
  it('discrète présente dans l’OBJET → IGNORÉE (corps sans référence) → aucun', () => {
    const r = rattacherReponse(msg({ objet: 'Réponse 2026-000200', corpsTexte: 'Bonjour, ci-joint le document.' }), [P]);
    expect(r.demandeId).toBeNull();
    expect(r.methode).toBe('aucun');
  });
  it('nombre parasite \\d{4}-\\d{6} ne correspondant à aucune demande → non rattaché', () => {
    const r = rattacherReponse(msg({ corpsTexte: 'Votre dossier 1234-567890 est en cours.' }), [P]);
    expect(r.demandeId).toBeNull();
    expect(r.methode).toBe('aucun');
  });
  it('demande retrouvée mais statut ≠ envoyee → non rattaché (motif explicite)', () => {
    const r = rattacherReponse(msg({ corpsTexte: 'réf 2026-000200' }), [{ ...P, statut: 'prete' }]);
    expect(r.demandeId).toBeNull();
    expect(r.methode).toBe('aucun');
    expect(r.motif).toMatch(/envoyee|prete/);
  });
});

describe('R3e — numéro de dossier Sitadel (après référence complète, avant discrète)', () => {
  it('numéro complet dans le CORPS → rattaché par numero_dossier', () => {
    const r = rattacherReponse(msg({ objet: 'Votre demande', corpsTexte: 'Concernant le dossier 0930012500081, voici les pièces.' }), [A, P]);
    expect(r).toMatchObject({ demandeId: 1, methode: 'numero_dossier' });
    expect(r.motif.length).toBeGreaterThan(0);
  });

  it('numéro avec séparateurs (PC 093 001 25 00081) → reconnu (comparaison normalisée)', () => {
    const r = rattacherReponse(msg({ corpsTexte: 'Réf. permis PC 093 001 25 00081 — transmis au service instructeur.' }), [A, P]);
    expect(r).toMatchObject({ demandeId: 1, methode: 'numero_dossier' });
  });

  it('numéro TRONQUÉ → NON rattaché (aucune correspondance partielle)', () => {
    const r = rattacherReponse(msg({ corpsTexte: 'dossier 093001250008 (numéro incomplet)' }), [A, P]);
    expect(r).toMatchObject({ demandeId: null, methode: 'aucun' });
  });

  it('deux numéros désignant DEUX demandes → AMBIGU → aucun', () => {
    const r = rattacherReponse(msg({ corpsTexte: 'dossiers 0930012500081 et 0930012500082' }), [A, P]);
    expect(r).toMatchObject({ demandeId: null, methode: 'aucun' });
  });

  it('la RÉFÉRENCE COMPLÈTE reste prioritaire sur le numéro de dossier (ordre de la cascade)', () => {
    // objet/corps contiennent la réf complète de A ET le n° de dossier de P → c'est la réf complète (A) qui l'emporte.
    const r = rattacherReponse(msg({ corpsTexte: 'SVAV-DEM-2026-000154 — voir aussi dossier 0930012500082' }), [A, P]);
    expect(r).toMatchObject({ demandeId: 1, methode: 'reference_corps' });
  });
});

describe('R3f — référence mairie (après numéro de dossier, avant discrète)', () => {
  // A porte une référence mairie (P1) ; P une autre. Cas Paris : la mairie cite SA référence dans l'objet ET le corps.
  const AM: DemandeCandidate = { ...A, referencesExternes: ['SLC260810440700'] };
  const PM: DemandeCandidate = { ...P, referencesExternes: ['ABC-2026-XYZ-42'] };

  it('référence mairie dans le CORPS → rattaché par reference_mairie', () => {
    const r = rattacherReponse(msg({ objet: 'Votre demande', corpsTexte: 'Bonjour, votre dossier SLC260810440700 est en cours d’instruction.' }), [AM, PM]);
    expect(r).toMatchObject({ demandeId: 1, methode: 'reference_mairie' });
    expect(r.motif.length).toBeGreaterThan(0);
  });

  it('référence mairie dans l’OBJET → rattaché (objet + corps couverts)', () => {
    const r = rattacherReponse(msg({ objet: 'Accusé — réf. SLC260810440700', corpsTexte: 'Ci-joint.' }), [AM, PM]);
    expect(r).toMatchObject({ demandeId: 1, methode: 'reference_mairie' });
  });

  it('référence mairie mise en forme (espaces/tirets) → reconnue (normalisation P1)', () => {
    const r = rattacherReponse(msg({ corpsTexte: 'Réf : SLC 260810-440700 — service urbanisme.' }), [AM, PM]);
    expect(r).toMatchObject({ demandeId: 1, methode: 'reference_mairie' });
  });

  it('MÊME référence mairie sur DEUX demandes → AMBIGU → aucun (jamais au jugé)', () => {
    const dup1 = { ...A, referencesExternes: ['SLC260810440700'] };
    const dup2 = { ...P, referencesExternes: ['SLC260810440700'] };
    const r = rattacherReponse(msg({ corpsTexte: 'dossier SLC260810440700' }), [dup1, dup2]);
    expect(r).toMatchObject({ demandeId: null, methode: 'aucun' });
    expect(r.motif).toMatch(/ambigu/i);
  });

  it('référence mairie INCONNUE → non rattaché', () => {
    const r = rattacherReponse(msg({ corpsTexte: 'référence SLC999999999999 inconnue' }), [AM, PM]);
    expect(r).toMatchObject({ demandeId: null, methode: 'aucun' });
  });

  it('référence externe TROP COURTE (< plancher) → jamais de faux positif par sous-chaîne', () => {
    const court = { ...A, referencesExternes: ['12'] };
    const r = rattacherReponse(msg({ corpsTexte: 'le 12 août, dossier 12345.' }), [court]);
    expect(r).toMatchObject({ demandeId: null, methode: 'aucun' });
  });

  it('le NUMÉRO DE DOSSIER reste prioritaire sur la référence mairie (ordre de la cascade)', () => {
    // corps = n° de dossier de A + réf mairie de P → c'est le n° de dossier (A, unique par construction) qui l’emporte.
    const r = rattacherReponse(msg({ corpsTexte: 'dossier 0930012500081 — réf mairie ABC-2026-XYZ-42' }), [A, PM]);
    expect(r).toMatchObject({ demandeId: 1, methode: 'numero_dossier' });
  });

  it('la référence mairie l’emporte sur la référence DISCRÈTE (placée avant dans la cascade)', () => {
    // corps = réf mairie de A + discrète de P (2026-000200) → reference_mairie (A) l’emporte, avant la discrète.
    const r = rattacherReponse(msg({ corpsTexte: 'réf SLC260810440700 ; ancien n° 2026-000200' }), [AM, P]);
    expect(r).toMatchObject({ demandeId: 1, methode: 'reference_mairie' });
  });

  it('candidate SANS referencesExternes → l’étape n’explose pas et n’ajoute rien', () => {
    const r = rattacherReponse(msg({ corpsTexte: 'un texte sans aucune référence connue' }), [A, P]);
    expect(r).toMatchObject({ demandeId: null, methode: 'aucun' });
  });
});

describe('R2 — ambiguïté & rien', () => {
  it('deux références complètes distinctes désignant deux demandes → aucun', () => {
    const r = rattacherReponse(msg({ corpsTexte: 'réfs SVAV-DEM-2026-000154 et SVAV-DEM-2026-000200 concernées' }), [A, P]);
    expect(r.demandeId).toBeNull();
    expect(r.methode).toBe('aucun');
    expect(r.motif.length).toBeGreaterThan(0);
  });
  it('rien du tout → aucun avec motif', () => {
    const r = rattacherReponse(msg({}), [A, P]);
    expect(r).toMatchObject({ demandeId: null, methode: 'aucun' });
    expect(r.motif.length).toBeGreaterThan(0);
  });
  it('ne rattache JAMAIS sur la seule adresse de l’expéditeur', () => {
    // même mairie, deux demandes ; aucun signal de référence/fil → aucun (pas de devinette par l'adresse)
    const r = rattacherReponse(msg({ deAdresse: 'urba@aubervilliers.fr', corpsTexte: 'Bonjour, bien reçu.' }), [A, P]);
    expect(r.demandeId).toBeNull();
  });
});

describe('R2 — estAccuseDeRebond', () => {
  it('expéditeur mailer-daemon (casse ignorée) → true', () => {
    expect(estAccuseDeRebond(msg({ deAdresse: 'MAILER-DAEMON@googlemail.com' }))).toBe(true);
  });
  it('expéditeur postmaster → true', () => {
    expect(estAccuseDeRebond(msg({ deAdresse: 'postmaster@mairie.fr' }))).toBe(true);
  });
  it('Content-Type multipart/report; report-type=delivery-status (clé insensible à la casse) → true', () => {
    expect(estAccuseDeRebond(msg({ entetes: { 'content-type': 'multipart/report; report-type=delivery-status; boundary=zz' } }))).toBe(true);
  });
  it('Auto-Submitted autre que « no » → true', () => {
    expect(estAccuseDeRebond(msg({ entetes: { 'Auto-Submitted': 'auto-replied' } }))).toBe(true);
  });
  it('message normal d’une mairie → false', () => {
    expect(estAccuseDeRebond(msg({ deAdresse: 'urba@mairie.fr', entetes: { 'Content-Type': 'text/plain; charset=utf-8', 'Auto-Submitted': 'no' } }))).toBe(false);
  });
});
