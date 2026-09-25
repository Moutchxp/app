/**
 * MODULE « GESTION » — LOT 5-PJ-C : LE COMPTE GOOGLE D'UN COLLABORATEUR. Partie PURE (aucune I/O).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE JETON N'EST PAS CELUI DE `gestion@`. Ils ne se rencontrent jamais :
 *   · le jeton de `gestion@criterimmo.fr` (lot 5-GOOGLE) sert à ENVOYER les mails, et servira à la copie automatique
 *     du lot D. Il n'est PAS modifié par ce lot ;
 *   · le jeton d'un collaborateur sert à PARCOURIR le Drive et à y DÉPOSER, avec ses droits à lui.
 * Les confondre reviendrait à donner à tout le monde les droits du compte partagé — c'est exactement le défaut que
 * ce lot répare.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * LES PORTÉES DEMANDÉES À UN COLLABORATEUR, et rien de plus.
 *   · `openid` + `email` — pour savoir QUI vient de se connecter, et donc vérifier son domaine. Sans elles, on
 *     devrait croire sur parole l'adresse annoncée ;
 *   · `drive` — pour voir SON arborescence (y compris ses raccourcis et ses « partagés avec moi ») et y déposer.
 *
 * ⚠️ AUCUNE PORTÉE GMAIL. Relier son compte pour classer des pièces ne doit jamais donner accès à son courrier — ce
 * serait demander bien plus que ce dont on a besoin, et personne ne cliquerait sur le bouton (à raison).
 */
export const PORTEES_COLLABORATEUR: readonly string[] = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/drive',
];

/** Ce que l'identité Google nous apprend, une fois le jeton obtenu. */
export interface IdentiteGoogle {
  email: string;
  /** Google a-t-il vérifié cette adresse ? Une adresse non vérifiée ne prouve rien. */
  verifie: boolean;
  /** Le domaine Workspace (`hd`), quand le compte en a un. `null` pour un compte Gmail ordinaire. */
  domaineWorkspace: string | null;
}

/**
 * LIT LE JETON D'IDENTITÉ (`id_token`) rendu par Google avec le jeton d'accès.
 *
 * ⚠️ ON NE VÉRIFIE PAS LA SIGNATURE, ET C'EST LÉGITIME ICI : ce jeton n'arrive pas par le navigateur, il est rendu
 * par l'endpoint de Google à NOTRE serveur, sur une connexion TLS, en réponse à un échange authentifié par notre
 * secret client. Google documente explicitement ce cas comme ne nécessitant pas de vérification locale. La règle
 * serait tout autre si le jeton transitait par la page.
 *
 * Rend `null` sur tout ce qui n'est pas un JWT lisible : on préfère refuser la connexion à deviner une identité. PUR.
 */
export function lireIdentite(idToken: string | null | undefined): IdentiteGoogle | null {
  const brut = (idToken ?? '').trim();
  const parts = brut.split('.');
  if (parts.length !== 3) return null;
  try {
    const charge = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      email?: string; email_verified?: boolean | string; hd?: string;
    };
    const email = (charge.email ?? '').trim().toLowerCase();
    if (email === '' || !email.includes('@')) return null;
    return {
      email,
      // Google rend parfois `"true"` en chaîne : les deux formes valent oui, et rien d'autre ne vaut oui.
      verifie: charge.email_verified === true || charge.email_verified === 'true',
      domaineWorkspace: (charge.hd ?? '').trim().toLowerCase() || null,
    };
  } catch {
    return null;
  }
}

/** Le domaine d'une adresse, en minuscules. Vide si l'adresse n'en a pas. PUR. */
export function domaineDe(email: string): string {
  const at = (email ?? '').lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).trim().toLowerCase();
}

/** La liste des domaines autorisés, telle qu'elle est écrite en configuration (« a.fr, b.com »). PUR. */
export function lireDomaines(brut: string | null | undefined): string[] {
  return (brut ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter((d) => d !== '');
}

export type VerdictIdentite =
  | { ok: true; email: string }
  | { ok: false; motif: string };

/**
 * LE COMPTE EST-IL ACCEPTABLE ? Trois conditions, et chacune a son propre message — « refusé » sans raison ferait
 * recliquer trois fois sur le même bouton.
 *
 * 🔴 LE DOMAINE EST COMPARÉ SUR L'ADRESSE, et confirmé par `hd` quand il existe. Un compte Workspace porte `hd` ;
 * un compte Gmail ordinaire n'en a pas, et son adresse ne sera de toute façon pas dans la liste. On n'exige donc pas
 * `hd` : on exige que le DOMAINE DE L'ADRESSE soit autorisé, ce qui couvre les deux cas sans en refuser un à tort.
 * PUR.
 */
export function verifierIdentite(identite: IdentiteGoogle | null, domainesAutorises: readonly string[]): VerdictIdentite {
  if (identite === null) {
    return { ok: false, motif: 'Google n’a pas rendu d’identité lisible : la connexion n’a pas pu être vérifiée.' };
  }
  if (!identite.verifie) {
    return { ok: false, motif: `L’adresse ${identite.email} n’est pas vérifiée par Google : elle ne peut pas être reliée.` };
  }
  const domaine = identite.domaineWorkspace ?? domaineDe(identite.email);
  const permis = domainesAutorises.map((d) => d.toLowerCase());
  if (!permis.includes(domaine) && !permis.includes(domaineDe(identite.email))) {
    return {
      ok: false,
      // On DIT quels domaines sont attendus : sinon on ne sait pas s'il faut changer de compte ou demander un droit.
      motif: `Le compte ${identite.email} n’appartient pas à l’entreprise. Comptes acceptés : ${permis.join(', ')}.`,
    };
  }
  return { ok: true, email: identite.email };
}

/** Ce que l'écran affiche selon l'état de la connexion Google d'un collaborateur. PUR. */
export type EtatCollaborateur =
  | { etat: 'connecte'; email: string }
  | { etat: 'jamais' }
  | { etat: 'a_reconnecter'; email: string; motif: string }
  | { etat: 'coffre_absent' }
  | { etat: 'sans_schema' };

/** Le message, en français, pour chaque état. Un seul endroit : trois formulations dériveraient. PUR. */
export function messageEtat(e: EtatCollaborateur): string {
  switch (e.etat) {
    case 'connecte': return `Connecté à Google en tant que ${e.email}`;
    case 'jamais': return 'Connecter mon Google Drive';
    case 'a_reconnecter': return `La connexion Google de ${e.email} n’est plus valable — se reconnecter`;
    case 'coffre_absent': return 'Connexion Google indisponible : la clé de chiffrement n’est pas configurée';
    case 'sans_schema': return 'Bientôt disponible — une mise à jour de la base est nécessaire';
  }
}
