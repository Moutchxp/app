import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Transporter } from 'nodemailer';
import { lireConfigEmail, envoyerCertificat } from './index';

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
