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

/** Compte SMTP d'AUTHENTIFICATION (host/port/user/pass) SANS adresse d'expédition — le `from` est fourni par l'appelant. */
export interface CompteSmtp {
  host: string;
  port: number;
  user: string; // s'authentifie (compte réel)
  pass: string; // mot de passe d'application — JAMAIS loggé
}
export interface ConfigEmail extends CompteSmtp {
  from: string; // s'affiche (alias) — MAIL_FROM
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lit UN compte SMTP depuis l'environnement par INFIXE de variable : `''` → `SMTP_HOST/PORT/USER/PASS` (compte par défaut) ;
 * `'PERSONNE_'` → `SMTP_PERSONNE_HOST/PORT/USER/PASS` (second compte, S43). Le `from` n'est PAS lu ici — l'appelant le
 * fournit (p. ex. l'adresse du profil). `null` si une variable manque/mal formée (repli sûr).
 */
export function lireCompteSmtp(infixe: string): CompteSmtp | null {
  const host = (process.env[`SMTP_${infixe}HOST`] ?? '').trim();
  const port = Number(process.env[`SMTP_${infixe}PORT`]);
  const user = (process.env[`SMTP_${infixe}USER`] ?? '').trim();
  const pass = process.env[`SMTP_${infixe}PASS`] ?? '';
  if (!host || !Number.isInteger(port) || port <= 0 || !user || !pass) return null;
  return { host, port, user, pass };
}

/** Compte IMAP de RELÈVE (lecture seule). Réutilise les identifiants SMTP (user/pass) ; host/port propres à l'IMAP. */
export interface CompteImap {
  host: string;
  port: number;
  user: string;
  pass: string;
  tls: boolean;
}

/**
 * Lit un compte IMAP par INFIXE (R3). Les identifiants (user/pass) sont RÉUTILISÉS de `lireCompteSmtp(infixe)` : si le
 * profil est inactif (variables SMTP absentes), on renvoie `null` (ce n'est pas une erreur). Host = `IMAP_{infixe}HOST`
 * sinon `imap.gmail.com` ; port = `IMAP_{infixe}PORT` sinon 993 ; TLS toujours actif. Fonction PUREMENT ADDITIVE : ne
 * modifie AUCUN comportement d'envoi.
 */
export function lireCompteImap(infixe: string): CompteImap | null {
  const compte = lireCompteSmtp(infixe);
  if (!compte) return null; // profil inactif (pas d'identifiants) → pas de relève
  const host = (process.env[`IMAP_${infixe}HOST`] ?? '').trim() || 'imap.gmail.com';
  const portBrut = Number(process.env[`IMAP_${infixe}PORT`]);
  const port = Number.isInteger(portBrut) && portBrut > 0 ? portBrut : 993;
  return { host, port, user: compte.user, pass: compte.pass, tls: true };
}

/** Config du compte PAR DÉFAUT (SMTP_* + MAIL_FROM alias). `null` si une variable manque/mal formée (repli sûr). */
export function lireConfigEmail(): ConfigEmail | null {
  const compte = lireCompteSmtp('');
  const from = (process.env.MAIL_FROM ?? '').trim();
  if (!compte || !EMAIL.test(from)) return null;
  return { ...compte, from };
}

// Cache PAR COMPTE (clé host:port:user) : plusieurs comptes SMTP coexistent (défaut + second compte S43) sans s'écraser.
const cache = new Map<string, Transporter>();
/** Transporteur nodemailer, LAZY et caché PAR COMPTE. `secure` déduit du port (465 = TLS implicite ; sinon STARTTLS). */
export function obtenirTransporteur(compte: CompteSmtp): Transporter {
  const cle = `${compte.host}:${compte.port}:${compte.user}`;
  const existant = cache.get(cle);
  if (existant) return existant;
  const transporteur = nodemailer.createTransport({
    host: compte.host,
    port: compte.port,
    secure: compte.port === 465,
    auth: { user: compte.user, pass: compte.pass }, // compte RÉEL (≠ from)
  });
  cache.set(cle, transporteur);
  return transporteur;
}

export interface MailCertificat {
  to: string;
  prenom: string | null; // peut être absent (formule sans prénom)
  numero: string;
  reference: string;
  siteUrl: string; // base absolue (sans slash final) → lien de vérification
  pdf: Buffer; // NOMINATIF (toujours présent — le certificat lui-même)
  pdfAnonyme?: Buffer; // version anonymisée à diffuser (best-effort : absente si sa génération a échoué)
  visuelPng?: Buffer; // visuel d'annonce PNG (best-effort : absent si sa génération a échoué)
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
  // Liste des documents joints — n'énumère QUE ceux réellement présents (les secondaires sont best-effort).
  const documents = ['- votre certificat Sans Vis-à-Vis® (PDF) ;'];
  if (m.pdfAnonyme) documents.push('- sa version anonymisée, à diffuser librement (PDF) ;');
  if (m.visuelPng) documents.push('- un visuel à joindre à votre annonce immobilière (PNG).');
  const lignes = [
    salut,
    '',
    documents.length > 1 ? 'Vous trouverez en pièces jointes :' : 'Votre certificat Sans Vis-à-Vis® est joint à ce message.',
    ...(documents.length > 1 ? documents : []),
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

  // Jusqu'à 3 pièces jointes ; on n'inclut QUE celles présentes (les secondaires sont best-effort côté publisher).
  const attachments: { filename: string; content: Buffer; contentType: string }[] = [
    { filename: `Certificat-${m.numero}.pdf`, content: m.pdf, contentType: 'application/pdf' },
  ];
  if (m.pdfAnonyme) attachments.push({ filename: `Certificat-anonymise-${m.numero}.pdf`, content: m.pdfAnonyme, contentType: 'application/pdf' });
  if (m.visuelPng) attachments.push({ filename: `Visuel-annonce-${m.reference}.png`, content: m.visuelPng, contentType: 'image/png' });

  await transporteur.sendMail({
    from,
    to: m.to,
    subject: `Votre certificat Sans Vis-à-Vis® — ${m.numero}`,
    text: corps,
    attachments,
  });
}

export interface MailReinitialisation {
  to: string;
  lien: string; // lien ABSOLU vers la page de saisie, portant le secret en query. Le secret ne vit QUE là — jamais ailleurs, jamais loggé.
}

/**
 * Envoie l'e-mail de RÉINITIALISATION de mot de passe (« mot de passe oublié »). ADDITIF : réutilise le transport injecté
 * (`from` = MAIL_FROM alias), NE TOUCHE PAS l'envoi du certificat. Texte brut, AUCUNE pièce jointe. Le secret n'apparaît
 * QUE dans `m.lien` (jamais dans le sujet, le reste du corps, ni un log). Corps sobre : qui, pourquoi, le lien, la durée
 * de validité (~1 h), et l'invite à ignorer si la demande n'émane pas du destinataire.
 */
export async function envoyerReinitialisation(transporteur: Transporter, from: string, m: MailReinitialisation): Promise<void> {
  const corps = [
    'Bonjour,',
    '',
    'Vous avez demandé la réinitialisation du mot de passe de votre espace client Sans Vis-à-Vis®.',
    'Pour choisir un nouveau mot de passe, ouvrez ce lien :',
    '',
    m.lien,
    '',
    'Ce lien est valable 1 heure. Passé ce délai, il faudra en redemander un.',
    'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe reste inchangé.',
    '',
    'Sans Vis-à-Vis® est une marque de la SARL CRITERIMMO.',
  ].join('\n');

  await transporteur.sendMail({
    from,
    to: m.to,
    subject: 'Réinitialisation de votre mot de passe — Sans Vis-à-Vis®',
    text: corps, // texte brut UNIQUEMENT ; aucune pièce jointe
  });
}

export interface MailAlerte { to: string; sujet: string; corps: string }

/**
 * R8 — envoie le récapitulatif d'alerte quotidien (texte brut, AUCUNE pièce jointe). Réutilise le TRANSPORT injecté ;
 * `from` = MAIL_FROM (alias). Distinct du certificat/demande : c'est un e-mail interne de suivi vers l'exploitant.
 */
export async function envoyerAlerte(transporteur: Transporter, from: string, m: MailAlerte): Promise<void> {
  await transporteur.sendMail({ from, to: m.to, subject: m.sujet, text: m.corps });
}

// ── Envoi d'une DEMANDE de communication à une mairie (S38) ──────────────────────────────────────────────────────────
export interface MailDemande {
  to: string;       // destinataire figé de la demande (dest_email) — canal 'email' UNIQUEMENT
  replyTo: string;  // boîte RELUE (config_veille.adresse_reponse) : c'est là que la mairie répond
  objet: string;    // demande.objet figé
  corps: string;    // demande.corps figé (texte brut)
}
export interface EmissionDemande { messageId: string; retourFournisseur: string }

/**
 * Envoie UNE demande à une mairie. DISTINCT de l'envoi de certificat : ne réutilise que le TRANSPORT (injecté). `from` =
 * alias d'expédition ; `reply-to` = la boîte relue (sinon la réponse de la mairie — donc la hauteur du bâti neuf — se perd).
 * ⚠️ CAPTURE OBLIGATOIRE : on renvoie le `messageId` ET la réponse du fournisseur. Si le `messageId` est absent, on JETTE —
 * un envoi non traçable est un ÉCHEC, pas un succès silencieux. Le transport peut être le SMTP réel OU un jsonTransport de
 * SIMULATION (aucune connexion, aucun octet) : cette fonction ne sait pas lequel, et c'est voulu.
 */
export async function envoyerDemande(transporteur: Transporter, from: string, m: MailDemande): Promise<EmissionDemande> {
  const info = await transporteur.sendMail({
    from,
    to: m.to,
    replyTo: m.replyTo,
    subject: m.objet,
    text: m.corps, // texte brut UNIQUEMENT ; aucune pièce jointe
  });
  const messageId = (info.messageId ?? '').toString().trim();
  if (messageId === '') throw new Error('émission sans messageId — capture impossible, échec (pas de succès silencieux)');
  // `response` = réponse SMTP réelle (ex. « 250 2.0.0 OK … ») ; en simulation jsonTransport elle est absente → repli explicite.
  const retour = (info.response ?? '').toString().trim();
  return { messageId, retourFournisseur: retour === '' ? '(simulation — aucune connexion SMTP)' : retour };
}
