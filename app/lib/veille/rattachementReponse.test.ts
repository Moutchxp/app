import { describe, it, expect } from 'vitest';
import { rattacherReponse, estRebondNonRemise, estAccuseAutomatique, referenceCiteeDans, type MessageEntrant, type DemandeCandidate } from './rattachementReponse';

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

  // AUTO-1 (téléservice Paris) — un n° de dossier à LETTRE INTERNE (« …V0006 »). Le candidat stocké est « 07512025V0006 » (sans
  //   préfixe) ; l'accusé Paris cite le permis COMPLET « PC07512025V0006 ». La normalisation SYMÉTRIQUE (normaliserNumeroDossier,
  //   lettres conservées) doit rattacher — là où l'ancien « chiffres seuls » côté candidat manquait tout numéro à lettre interne.
  const PARIS: DemandeCandidate = { id: 3, reference: 'SVAV-DEM-2026-000160', profilBoite: 'personne', statut: 'envoyee', messageIdsEmis: [], numerosDossier: ['07512025V0006'] };

  it('n° à lettre interne cité AVEC préfixe (accusé Paris « PC07512025V0006 ») → rattaché par numero_dossier', () => {
    const r = rattacherReponse(msg({
      objet: 'Accusé de réception (référence SLC260828893279)',
      corpsTexte: 'Rappel de votre message : Permis concerné : PC07512025V0006 — autorisé le 28 octobre 2025 — 7 RUE ALPHONSE PENAUD PARIS 20.',
    }), [PARIS]);
    expect(r).toMatchObject({ demandeId: 3, methode: 'numero_dossier' });
  });

  it('n° à lettre interne cité SANS préfixe → rattaché aussi (candidat = sous-chaîne, « V » conservé)', () => {
    const r = rattacherReponse(msg({ corpsTexte: 'dossier 07512025V0006 en cours d’instruction.' }), [PARIS]);
    expect(r).toMatchObject({ demandeId: 3, methode: 'numero_dossier' });
  });

  it('les CHIFFRES SEULS (« V » retiré) ne matchent PAS un n° à lettre interne → pas de faux positif (Option C exacte)', () => {
    const r = rattacherReponse(msg({ corpsTexte: 'numéro 075120250006 (chiffres seuls, sans le V).' }), [PARIS]);
    expect(r).toMatchObject({ demandeId: null, methode: 'aucun' });
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

describe('LOT 2 — la cascade compare des identifiants uniques, TOUS PROFILS confondus (la garde d’ambiguïté aussi)', () => {
  // A = entreprise, P = personne : la cascade est agnostique au profil ; c'est releverBoite qui lui fournit désormais des
  //   candidates tous profils. Ces cas prouvent que, quand les candidates MÊLENT les profils, l'identifiant unique rattache
  //   à travers eux et la garde d'ambiguïté (≥2 → aucun) s'entend tous profils confondus.
  it('② même référence MAIRIE sur deux demandes de profils DIFFÉRENTS → aucun (garde d’ambiguïté inter-profils)', () => {
    const ent = { ...A, referencesExternes: ['SLC260818242370'] };       // entreprise
    const pers = { ...P, referencesExternes: ['SLC260818242370'] };      // personne, MÊME référence mairie
    const r = rattacherReponse(msg({ objet: 'Réponse — référence SLC260818242370' }), [ent, pers]);
    expect(r).toMatchObject({ demandeId: null, methode: 'aucun' });
    expect(r.motif).toMatch(/ambigu/i);
  });

  it('③ référence MAIRIE d’une demande PERSONNE citée, candidates mêlées → rattaché à la personne (2ter, à travers les profils)', () => {
    const ent = { ...A, referencesExternes: ['SLC260810440700'] };       // entreprise (autre réf)
    const pers = { ...P, referencesExternes: ['SLC260818242370'] };      // personne (la réf citée)
    const r = rattacherReponse(msg({ objet: 'Réponse à votre demande numéro SLC260818242370' }), [ent, pers]);
    expect(r).toMatchObject({ demandeId: 2, methode: 'reference_mairie' }); // P = personne
  });

  it('③ référence DISCRÈTE d’une demande PERSONNE (corps) parmi des candidates mêlées → reference_corps (à travers les profils)', () => {
    const r = rattacherReponse(msg({ objet: 'Demande de communication de documents administratifs', corpsTexte: 'Votre référence 2026-000200 a été traitée.' }), [A, P]);
    expect(r).toMatchObject({ demandeId: 2, methode: 'reference_corps' }); // P = personne, relève pouvant être entreprise
  });

  it('③ discrète désignant DEUX demandes de profils différents (deux réfs dans le corps) → aucun', () => {
    const r = rattacherReponse(msg({ corpsTexte: 'anciens numéros 2026-000154 et 2026-000200 traités.' }), [A, P]);
    expect(r).toMatchObject({ demandeId: null, methode: 'aucun' }); // A entreprise + P personne toutes deux désignées
    expect(r.motif).toMatch(/ambigu/i);
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

describe('T3 — estRebondNonRemise (signaux DSN FIABLES uniquement, PAS Auto-Submitted)', () => {
  it('expéditeur mailer-daemon (casse ignorée) → true', () => {
    expect(estRebondNonRemise(msg({ deAdresse: 'MAILER-DAEMON@googlemail.com' }))).toBe(true);
  });
  it('expéditeur postmaster → true', () => {
    expect(estRebondNonRemise(msg({ deAdresse: 'postmaster@mairie.fr' }))).toBe(true);
  });
  it('Content-Type multipart/report; report-type=delivery-status (clé insensible à la casse) → true', () => {
    expect(estRebondNonRemise(msg({ entetes: { 'content-type': 'multipart/report; report-type=delivery-status; boundary=zz' } }))).toBe(true);
  });
  it('⚠️ Auto-Submitted seul (mairie ordinaire) → false : ce N’EST PLUS un rebond (c’est un accusé)', () => {
    expect(estRebondNonRemise(msg({ deAdresse: 'urba@mairie.fr', entetes: { 'Auto-Submitted': 'auto-replied' } }))).toBe(false);
  });
  it('message normal d’une mairie → false', () => {
    expect(estRebondNonRemise(msg({ deAdresse: 'urba@mairie.fr', entetes: { 'Content-Type': 'text/plain; charset=utf-8' } }))).toBe(false);
  });
});

describe('T3 — estAccuseAutomatique (Auto-Submitted ≠ no, et PAS un DSN)', () => {
  it('Auto-Submitted: auto-replied depuis une mairie → true (accusé, à ENREGISTRER)', () => {
    expect(estAccuseAutomatique(msg({ deAdresse: 'urba@mairie.fr', entetes: { 'Auto-Submitted': 'auto-replied' } }))).toBe(true);
  });
  it('Auto-Submitted: auto-generated → true', () => {
    expect(estAccuseAutomatique(msg({ entetes: { 'auto-submitted': 'auto-generated' } }))).toBe(true);
  });
  it('Auto-Submitted: no → false (message humain explicite)', () => {
    expect(estAccuseAutomatique(msg({ entetes: { 'Auto-Submitted': 'no' } }))).toBe(false);
  });
  it('DSN (mailer-daemon) même AVEC Auto-Submitted → false : un rebond n’est pas un accusé', () => {
    expect(estAccuseAutomatique(msg({ deAdresse: 'mailer-daemon@google.com', entetes: { 'Auto-Submitted': 'auto-replied' } }))).toBe(false);
  });
  it('message normal SANS Auto-Submitted → false (reste indetermine côté relève)', () => {
    expect(estAccuseAutomatique(msg({ deAdresse: 'urba@mairie.fr', entetes: { 'Content-Type': 'text/plain' } }))).toBe(false);
  });
});

describe('R3f / FUS-4 ② — referenceCiteeDans (helper PUR, source unique de la comparaison de référence)', () => {
  it('table de vérité : plancher ≥ 6, sous-chaîne, insensible aux accents ET à la casse (le texte est normalisé)', () => {
    // La réf est passée DÉJÀ normalisée (normaliserReference = MAJUSCULES, sans espaces ni tirets).
    expect(referenceCiteeDans('SLC260818242370', 'Accusé de réception (référence SLC260818242370) | Urbanisme')).toBe(true);
    expect(referenceCiteeDans('SLC260818242370', 'objet: slc-260818242370 (minuscules + tirets)')).toBe(true); // normalisation du texte
    expect(referenceCiteeDans('SLC260818242370', 'aucune référence ici')).toBe(false);
    expect(referenceCiteeDans('AB12', 'contient AB12 mais trop court')).toBe(false); // plancher de longueur (6)
    expect(referenceCiteeDans('', 'texte quelconque')).toBe(false);
  });
});
