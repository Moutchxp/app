import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Transporter } from 'nodemailer';
import { lireConfigEmail, lireCompteSmtp, obtenirTransporteur, envoyerCertificat, envoyerReinitialisation, envoyerDemande, type CompteSmtp, type MailDemande } from './index';

interface ArgsSendMail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: unknown;
  attachments: { filename: string; content: Buffer; contentType: string }[];
}
/** Faux transporteur : AUCUNE connexion SMTP réelle. */
function faux() {
  const sendMail = vi.fn();
  sendMail.mockResolvedValue({ messageId: 'x' });
  return { transporteur: { sendMail } as unknown as Transporter, sendMail };
}

const MAIL = { to: 'client@example.com', prenom: 'Jean', numero: 'SAVV-2026-000123', reference: 'SVAV-K7M2-9QX4', siteUrl: 'https://www.sansvisavis.com', pdf: Buffer.from('pdf') };

describe('envoyerCertificat — texte brut, pièce jointe, from = alias', () => {
  it('sendMail reçoit le bon from/to/sujet + pièce jointe nommée', async () => {
    const { transporteur, sendMail } = faux();
    await envoyerCertificat(transporteur, 'noreply@sansvisavis.com', MAIL);
    const arg = sendMail.mock.calls[0]![0] as ArgsSendMail;
    expect(arg.from).toBe('noreply@sansvisavis.com'); // MAIL_FROM (alias), distinct du compte authentifié
    expect(arg.to).toBe('client@example.com');
    expect(arg.subject).toBe('Votre certificat Sans Vis-à-Vis® — SAVV-2026-000123');
    expect(arg.html).toBeUndefined(); // texte brut UNIQUEMENT
    expect(arg.attachments).toEqual([{ filename: 'Certificat-SAVV-2026-000123.pdf', content: MAIL.pdf, contentType: 'application/pdf' }]);
  });

  it('corps : salutation avec prénom, référence, lien de vérification, marque — et JAMAIS de jeton', async () => {
    const { transporteur, sendMail } = faux();
    await envoyerCertificat(transporteur, 'noreply@sansvisavis.com', MAIL);
    const texte = (sendMail.mock.calls[0]![0] as ArgsSendMail).text;
    expect(texte).toContain('Bonjour Jean,');
    expect(texte).toContain('Référence à indiquer dans votre annonce : SVAV-K7M2-9QX4');
    expect(texte).toContain('Vérification : https://www.sansvisavis.com/verifier');
    expect(texte).toContain('Sans Vis-à-Vis® est une marque de la SARL CRITERIMMO.');
    // Le jeton n'est pas une entrée de ce module ; on prouve qu'aucun code de vérification 16-car. n'y figure.
    expect(texte).not.toMatch(/[0-9A-HJKMNP-TV-Z]{16}/);
  });

  it('prénom absent → « Bonjour, » (tient sans lui)', async () => {
    const { transporteur, sendMail } = faux();
    await envoyerCertificat(transporteur, 'noreply@sansvisavis.com', { ...MAIL, prenom: null });
    expect(((sendMail.mock.calls[0]![0] as ArgsSendMail).text).startsWith('Bonjour,')).toBe(true);
  });
});

describe('envoyerCertificat — jusqu’à 3 pièces jointes (n’inclut que les présentes)', () => {
  const ANON = Buffer.from('pdf-anonyme');
  const VIS = Buffer.from('visuel-png');

  it('nominatif seul (aucun secondaire) → 1 PJ', async () => {
    const { transporteur, sendMail } = faux();
    await envoyerCertificat(transporteur, 'noreply@sansvisavis.com', MAIL);
    const arg = sendMail.mock.calls[0]![0] as ArgsSendMail;
    expect(arg.attachments.map((a) => a.filename)).toEqual(['Certificat-SAVV-2026-000123.pdf']);
  });

  it('nominatif + anonymisé (sans visuel) → 2 PJ', async () => {
    const { transporteur, sendMail } = faux();
    await envoyerCertificat(transporteur, 'noreply@sansvisavis.com', { ...MAIL, pdfAnonyme: ANON });
    const arg = sendMail.mock.calls[0]![0] as ArgsSendMail;
    expect(arg.attachments).toEqual([
      { filename: 'Certificat-SAVV-2026-000123.pdf', content: MAIL.pdf, contentType: 'application/pdf' },
      { filename: 'Certificat-anonymise-SAVV-2026-000123.pdf', content: ANON, contentType: 'application/pdf' },
    ]);
  });

  it('nominatif + visuel (sans anonymisé) → 2 PJ (le PNG)', async () => {
    const { transporteur, sendMail } = faux();
    await envoyerCertificat(transporteur, 'noreply@sansvisavis.com', { ...MAIL, visuelPng: VIS });
    const arg = sendMail.mock.calls[0]![0] as ArgsSendMail;
    expect(arg.attachments.map((a) => `${a.filename}|${a.contentType}`)).toEqual([
      'Certificat-SAVV-2026-000123.pdf|application/pdf',
      'Visuel-annonce-SVAV-K7M2-9QX4.png|image/png',
    ]);
  });

  it('les 3 documents → 3 PJ (nominatif, anonymisé, visuel) + corps qui les liste', async () => {
    const { transporteur, sendMail } = faux();
    await envoyerCertificat(transporteur, 'noreply@sansvisavis.com', { ...MAIL, pdfAnonyme: ANON, visuelPng: VIS });
    const arg = sendMail.mock.calls[0]![0] as ArgsSendMail;
    expect(arg.attachments).toEqual([
      { filename: 'Certificat-SAVV-2026-000123.pdf', content: MAIL.pdf, contentType: 'application/pdf' },
      { filename: 'Certificat-anonymise-SAVV-2026-000123.pdf', content: ANON, contentType: 'application/pdf' },
      { filename: 'Visuel-annonce-SVAV-K7M2-9QX4.png', content: VIS, contentType: 'image/png' },
    ]);
    expect(arg.text).toContain('Vous trouverez en pièces jointes :');
    expect(arg.text).toContain('version anonymisée');
    expect(arg.text).toContain('visuel');
  });
});

describe('envoyerReinitialisation — texte brut, aucune PJ, secret seulement dans le lien', () => {
  const LIEN = 'https://www.sansvisavis.com/espace/reinitialiser?j=SECRET-xyz-123';

  it('sendMail : bon from/to/sujet, texte brut, AUCUNE pièce jointe', async () => {
    const { transporteur, sendMail } = faux();
    await envoyerReinitialisation(transporteur, 'noreply@sansvisavis.com', { to: 'client@example.com', lien: LIEN });
    const arg = sendMail.mock.calls[0]![0] as ArgsSendMail;
    expect(arg.from).toBe('noreply@sansvisavis.com'); // alias MAIL_FROM
    expect(arg.to).toBe('client@example.com');
    expect(arg.subject).toBe('Réinitialisation de votre mot de passe — Sans Vis-à-Vis®');
    expect(arg.html).toBeUndefined(); // texte brut
    expect(arg.attachments).toBeUndefined(); // AUCUNE pièce jointe
  });

  it('corps : lien, durée ~1 h, invite à ignorer, marque', async () => {
    const { transporteur, sendMail } = faux();
    await envoyerReinitialisation(transporteur, 'noreply@sansvisavis.com', { to: 'client@example.com', lien: LIEN });
    const texte = (sendMail.mock.calls[0]![0] as ArgsSendMail).text;
    expect(texte).toContain(LIEN); // le secret ne vit QUE dans le lien
    expect(texte).toMatch(/valable 1 heure/i);
    expect(texte).toMatch(/ignorez cet e-mail/i);
    expect(texte).toContain('Sans Vis-à-Vis® est une marque de la SARL CRITERIMMO.');
  });

  it('le secret n’apparaît nulle part AILLEURS que dans le lien (ni sujet, ni autre ligne)', async () => {
    const { transporteur, sendMail } = faux();
    await envoyerReinitialisation(transporteur, 'noreply@sansvisavis.com', { to: 'client@example.com', lien: LIEN });
    const arg = sendMail.mock.calls[0]![0] as ArgsSendMail;
    expect(arg.subject).not.toContain('SECRET-xyz-123');
    // La seule occurrence du secret dans le corps est celle du lien (une, pas deux).
    const occurrences = arg.text.split('SECRET-xyz-123').length - 1;
    expect(occurrences).toBe(1);
  });
});

describe('lireConfigEmail — repli sûr', () => {
  const ORIG = { ...process.env };
  beforeEach(() => {
    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_PORT = '465';
    process.env.SMTP_USER = 'compte-reel@sansvisavis.com';
    process.env.SMTP_PASS = 'app-password';
    process.env.MAIL_FROM = 'noreply@sansvisavis.com';
  });
  afterEach(() => {
    process.env = { ...ORIG };
  });

  it('toutes les variables présentes et valides → config (user ≠ from)', () => {
    const c = lireConfigEmail();
    expect(c).toEqual({ host: 'smtp.gmail.com', port: 465, user: 'compte-reel@sansvisavis.com', pass: 'app-password', from: 'noreply@sansvisavis.com' });
    expect(c!.user).not.toBe(c!.from);
  });

  it.each(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'])('%s manquante → null', (cle) => {
    delete process.env[cle];
    expect(lireConfigEmail()).toBeNull();
  });

  it('SMTP_PORT non numérique → null', () => {
    process.env.SMTP_PORT = 'abc';
    expect(lireConfigEmail()).toBeNull();
  });

  it('MAIL_FROM mal formée → null', () => {
    process.env.MAIL_FROM = 'pas-une-adresse';
    expect(lireConfigEmail()).toBeNull();
  });
});

describe('S43 — lireCompteSmtp : compte par infixe, SANS from', () => {
  const ORIG = { ...process.env };
  beforeEach(() => {
    process.env.SMTP_HOST = 'smtp.workspace.google.com';
    process.env.SMTP_PORT = '465';
    process.env.SMTP_USER = 'a.jorel@sansvisavis.com';
    process.env.SMTP_PASS = 'app-pass-workspace';
    delete process.env.SMTP_PERSONNE_HOST; delete process.env.SMTP_PERSONNE_PORT;
    delete process.env.SMTP_PERSONNE_USER; delete process.env.SMTP_PERSONNE_PASS;
  });
  afterEach(() => { process.env = { ...ORIG }; });

  it('infixe "" → compte par défaut (SMTP_*), sans champ from', () => {
    expect(lireCompteSmtp('')).toEqual({ host: 'smtp.workspace.google.com', port: 465, user: 'a.jorel@sansvisavis.com', pass: 'app-pass-workspace' });
  });
  it('infixe "PERSONNE_" absent → null ; renseigné → second compte', () => {
    expect(lireCompteSmtp('PERSONNE_')).toBeNull();
    process.env.SMTP_PERSONNE_HOST = 'smtp.gmail.com';
    process.env.SMTP_PERSONNE_PORT = '465';
    process.env.SMTP_PERSONNE_USER = 'arnaud.jorel@gmail.com';
    process.env.SMTP_PERSONNE_PASS = 'app-pass-perso';
    expect(lireCompteSmtp('PERSONNE_')).toEqual({ host: 'smtp.gmail.com', port: 465, user: 'arnaud.jorel@gmail.com', pass: 'app-pass-perso' });
  });
});

describe('S43 — obtenirTransporteur : cache PAR COMPTE (aucune régression pour certificat/réinitialisation)', () => {
  const DEFAUT: CompteSmtp = { host: 'smtp.workspace.google.com', port: 465, user: 'a.jorel@sansvisavis.com', pass: 'p1' };
  const PERSO: CompteSmtp = { host: 'smtp.gmail.com', port: 465, user: 'arnaud.jorel@gmail.com', pass: 'p2' };

  it('même compte (celui de certificat/réinitialisation) → MÊME transporteur réutilisé', () => {
    expect(obtenirTransporteur(DEFAUT)).toBe(obtenirTransporteur(DEFAUT));
  });
  it('comptes DISTINCTS → transporteurs distincts (le second compte n’écrase pas le premier)', () => {
    expect(obtenirTransporteur(DEFAUT)).not.toBe(obtenirTransporteur(PERSO));
    // et le compte par défaut reste inchangé après la création du second (pas d'écrasement de cache)
    expect(obtenirTransporteur(DEFAUT)).toBe(obtenirTransporteur(DEFAUT));
  });
});

describe('X1 — envoyerDemande : pièce jointe OPTIONNELLE (non-régression)', () => {
  const DEM: MailDemande = { to: 'urba@mairie.fr', replyTo: 'a.jorel@sansvisavis.com', objet: 'Demande', corps: 'Corps de la demande.' };

  it('SANS pieces → sendMail reçoit EXACTEMENT l’objet actuel (aucune clé attachments)', async () => {
    const { transporteur, sendMail } = faux();
    await envoyerDemande(transporteur, 'noreply@sansvisavis.com', DEM);
    const arg = sendMail.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg).toEqual({ from: 'noreply@sansvisavis.com', to: 'urba@mairie.fr', replyTo: 'a.jorel@sansvisavis.com', subject: 'Demande', text: 'Corps de la demande.' });
    expect('attachments' in arg).toBe(false); // identique à aujourd'hui : nodemailer ne reçoit aucune pièce
  });

  it('AVEC pieces → les attachments sont transmis TELS QUELS', async () => {
    const { transporteur, sendMail } = faux();
    const pieces = [{ filename: 'Copie-demande.pdf', content: Buffer.from('%PDF-1.7'), contentType: 'application/pdf' }];
    await envoyerDemande(transporteur, 'noreply@sansvisavis.com', { ...DEM, pieces });
    const arg = sendMail.mock.calls[0]![0] as { attachments?: unknown };
    expect(arg.attachments).toEqual(pieces);
  });

  it('pieces = tableau VIDE → traité comme absent (aucune clé attachments)', async () => {
    const { transporteur, sendMail } = faux();
    await envoyerDemande(transporteur, 'noreply@sansvisavis.com', { ...DEM, pieces: [] });
    expect('attachments' in (sendMail.mock.calls[0]![0] as Record<string, unknown>)).toBe(false);
  });
});
