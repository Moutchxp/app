import { describe, it, expect } from 'vitest';
import {
  domaineDe, lireDomaines, lireIdentite, messageEtat, verifierIdentite, PORTEES_COLLABORATEUR,
} from './googleCollaborateur';

/** Fabrique un `id_token` de test : seule la charge utile compte ici (cf. le commentaire de `lireIdentite`). */
function jeton(charge: Record<string, unknown>): string {
  const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256' })}.${b64(charge)}.signature-non-verifiee`;
}

const DOMAINES = ['criterimmo.fr', 'sansvisavis.com'];

describe('les portées demandées à un collaborateur', () => {
  /**
   * 🔴 AUCUNE PORTÉE GMAIL. Relier son compte pour classer des pièces ne doit jamais donner accès à son courrier —
   * ce serait demander bien plus que nécessaire, et personne ne cliquerait sur le bouton (à raison).
   */
  it('Drive, plus de quoi savoir qui se connecte — et rien de plus', () => {
    expect([...PORTEES_COLLABORATEUR]).toEqual(['openid', 'email', 'https://www.googleapis.com/auth/drive']);
    expect(PORTEES_COLLABORATEUR.some((p) => p.includes('gmail'))).toBe(false);
    expect(PORTEES_COLLABORATEUR).not.toContain('https://mail.google.com/');
  });
});

describe('lire l’identité Google', () => {
  it('rend l’adresse, sa vérification et le domaine Workspace', () => {
    const i = lireIdentite(jeton({ email: 'A.Jorel@Criterimmo.fr', email_verified: true, hd: 'criterimmo.fr' }));
    expect(i).toEqual({ email: 'a.jorel@criterimmo.fr', verifie: true, domaineWorkspace: 'criterimmo.fr' });
  });
  it('accepte la vérification rendue en CHAÎNE par Google', () => {
    expect(lireIdentite(jeton({ email: 'a@b.fr', email_verified: 'true' }))?.verifie).toBe(true);
  });
  it('un compte sans Workspace n’a pas de domaine `hd`, et ce n’est pas une anomalie', () => {
    expect(lireIdentite(jeton({ email: 'a@gmail.com', email_verified: true }))?.domaineWorkspace).toBeNull();
  });
  it('un jeton illisible rend null — on préfère refuser à deviner une identité', () => {
    expect(lireIdentite('pas un jwt')).toBeNull();
    expect(lireIdentite(null)).toBeNull();
    expect(lireIdentite(jeton({ email: '' }))).toBeNull();
  });
});

describe('les domaines autorisés', () => {
  it('se lisent depuis la configuration, virgules et espaces compris', () => {
    expect(lireDomaines(' criterimmo.fr , @sansvisavis.com ')).toEqual(['criterimmo.fr', 'sansvisavis.com']);
  });
  it('une configuration vide ne donne aucun domaine — donc aucun compte accepté', () => {
    expect(lireDomaines('')).toEqual([]);
  });
  it('le domaine d’une adresse se lit après le dernier @', () => {
    expect(domaineDe('a.b@criterimmo.fr')).toBe('criterimmo.fr');
  });
});

describe('accepter ou refuser un compte', () => {
  it('un compte de l’entreprise est accepté', () => {
    const v = verifierIdentite(lireIdentite(jeton({ email: 'a.jorel@criterimmo.fr', email_verified: true, hd: 'criterimmo.fr' })), DOMAINES);
    expect(v).toEqual({ ok: true, email: 'a.jorel@criterimmo.fr' });
  });

  it('l’autre domaine de la maison est accepté aussi', () => {
    const v = verifierIdentite(lireIdentite(jeton({ email: 'x@sansvisavis.com', email_verified: true })), DOMAINES);
    expect(v.ok).toBe(true);
  });

  /** Un refus muet ferait recliquer trois fois : le motif DIT quels comptes sont attendus. */
  it('un compte personnel est REFUSÉ, et le message dit quels comptes sont acceptés', () => {
    const v = verifierIdentite(lireIdentite(jeton({ email: 'moi@gmail.com', email_verified: true })), DOMAINES);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.motif).toContain('moi@gmail.com');
      expect(v.motif).toContain('criterimmo.fr');
      expect(v.motif).toContain('sansvisavis.com');
    }
  });

  it('une adresse NON VÉRIFIÉE par Google est refusée — elle ne prouve rien', () => {
    const v = verifierIdentite(lireIdentite(jeton({ email: 'a@criterimmo.fr', email_verified: false })), DOMAINES);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motif).toContain('pas vérifiée');
  });

  it('aucune identité lisible → refus, jamais un passage en force', () => {
    expect(verifierIdentite(null, DOMAINES).ok).toBe(false);
  });

  /** La liste vient de la configuration : la vider ferme la porte à tout le monde, et c'est le comportement voulu. */
  it('aucun domaine configuré → personne n’est accepté', () => {
    expect(verifierIdentite(lireIdentite(jeton({ email: 'a@criterimmo.fr', email_verified: true })), []).ok).toBe(false);
  });

  it('un compte Workspace d’un domaine autorisé passe même si `hd` diffère de l’adresse', () => {
    // Cas réel : un alias. L'adresse fait foi si son domaine est autorisé.
    const v = verifierIdentite(lireIdentite(jeton({ email: 'a@criterimmo.fr', email_verified: true, hd: 'autre.fr' })), DOMAINES);
    expect(v.ok).toBe(true);
  });
});

describe('ce que l’écran dit, selon l’état', () => {
  /** Quatre situations, quatre gestes différents : un message unique enverrait au mauvais endroit. */
  it('chaque état a SON message', () => {
    expect(messageEtat({ etat: 'connecte', email: 'a@criterimmo.fr' })).toContain('a@criterimmo.fr');
    expect(messageEtat({ etat: 'jamais' })).toBe('Connecter mon Google Drive');
    expect(messageEtat({ etat: 'a_reconnecter', email: 'a@criterimmo.fr', motif: 'x' })).toContain('se reconnecter');
    expect(messageEtat({ etat: 'coffre_absent' })).toContain('clé de chiffrement');
    expect(messageEtat({ etat: 'sans_schema' })).toContain('mise à jour de la base');
  });
});
