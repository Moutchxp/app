import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * TRANSPORT E-MAIL (SMTP Google Workspace, via nodemailer). SERVEUR only.
 *
 * ⚠️ SMTP_USER ≠ MAIL_FROM : `noreply@…` est un ALIAS Workspace (pas une boîte, il ne peut pas s'authentifier). On
 * s'AUTHENTIFIE avec le compte réel (`SMTP_USER`) et on ENVOIE EN TANT QUE l'alias (`MAIL_FROM`). Ne jamais confondre.
 *
 * REPLI SÛR : lecture LAZY de la config ; une variable absente/mal formée → `lireConfigEmail()` renvoie `null`
 * (l'appelant n'envoie pas, log + return). Un envoi à moitié configuré est pire qu'un envoi absent (cf. SITE_URL).
 *
 * Le transporteur est INJECTABLE dans `envoyerCertificat` (tests) → aucun test n'ouvre de connexion SMTP réelle.
 */

export interface ConfigEmail {
  host: string;
  port: number;
  user: string; // s'authentifie (compte réel)
  pass: string; // mot de passe d'application — JAMAIS loggé
  from: string; // s'affiche (alias) — MAIL_FROM
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lit la config SMTP depuis l'environnement. `null` si une variable manque ou est mal formée (repli sûr). */
export function lireConfigEmail(): ConfigEmail | null {
  const host = (process.env.SMTP_HOST ?? '').trim();
  const port = Number(process.env.SMTP_PORT);
  const user = (process.env.SMTP_USER ?? '').trim();
  const pass = process.env.SMTP_PASS ?? '';
  const from = (process.env.MAIL_FROM ?? '').trim();
  if (!host || !Number.isInteger(port) || port <= 0 || !user || !pass || !EMAIL.test(from)) return null;
  return { host, port, user, pass, from };
}

let cache: Transporter | null = null;
/** Transporteur nodemailer (LAZY + caché). `secure` déduit du port (465 = TLS implicite ; sinon STARTTLS). */
export function obtenirTransporteur(config: ConfigEmail): Transporter {
  if (cache) return cache;
  cache = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass }, // compte RÉEL (≠ from)
  });
  return cache;
}

export interface MailCertificat {
  to: string;
  prenom: string | null; // peut être absent (formule sans prénom)
  numero: string;
  reference: string;
  siteUrl: string; // base absolue (sans slash final) → lien de vérification
  pdf: Buffer;
  jetonDesabonnement?: string | null; // jeton de RETRAIT (voie e-mail) → pied de désabonnement ; absent/null → pas de ligne
}

/**
 * Envoie le certificat en PIÈCE JOINTE (texte brut, aucune tournure commerciale). Le transporteur est INJECTÉ.
 * ⚠️ LE JETON DE VÉRIFICATION DU CERTIFICAT n'apparaît PAS dans le corps : il est déjà dans le PDF (QR + en clair). Un
 * mail se transfère ; le document, lui, est ce qu'on prouve détenir → l'y écrire divulguerait le contenu SANS le document.
 * NB : le jeton de DÉSABONNEMENT du pied ci-dessous est un objet DISTINCT — ancré sur la BOÎTE MAIL (le mail EST la preuve
 * d'ayant-droit pour se désabonner), pas sur le document → sa présence dans le corps ne viole PAS la règle du dessus.
 * `from` = MAIL_FROM (alias), distinct du compte authentifié.
 */
export async function envoyerCertificat(transporteur: Transporter, from: string, m: MailCertificat): Promise<void> {
  const salut = m.prenom && m.prenom.trim() ? `Bonjour ${m.prenom.trim()},` : 'Bonjour,';
  const lignes = [
    salut,
    '',
    'Votre certificat Sans Vis-à-Vis® est joint à ce message.',
    '',
    `Référence à indiquer dans votre annonce : ${m.reference}`,
    `Vérification : ${m.siteUrl}/verifier`,
    '',
  ];
  // Pied de DÉSABONNEMENT (voie de retrait e-mail) — SEULEMENT si le jeton a pu être frappé (best-effort côté publisher).
  if (m.jetonDesabonnement) {
    lignes.push(`Ne plus recevoir de mails de Sans Vis-à-Vis® : ${m.siteUrl}/desabonner?j=${m.jetonDesabonnement}`, '');
  }
  lignes.push('Sans Vis-à-Vis® est une marque de la SARL CRITERIMMO.');
  const corps = lignes.join('\n');

  await transporteur.sendMail({
    from,
    to: m.to,
    subject: `Votre certificat Sans Vis-à-Vis® — ${m.numero}`,
    text: corps,
    attachments: [{ filename: `Certificat-${m.numero}.pdf`, content: m.pdf, contentType: 'application/pdf' }],
  });
}
