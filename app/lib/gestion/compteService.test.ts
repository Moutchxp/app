import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import {
  construireAssertion, corpsEchange, delegationConfiguree, lireCleService, motifRefus,
  ASSERTION_DUREE_S, ENDPOINT_TOKEN, SCOPE_DRIVE, VARIABLE_CLE_FICHIER, VARIABLE_CLE_JSON,
} from './compteService';

/** Une paire de clés jetable : elle ne vaut rien hors de ce fichier, et permet de VÉRIFIER la signature produite. */
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PRIVEE = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const CLE_JSON = JSON.stringify({
  type: 'service_account',
  client_email: 'svav-drive@projet.iam.gserviceaccount.com',
  private_key: PRIVEE,
  client_id: '123456789012345678901',
});
const ENV = { [VARIABLE_CLE_JSON]: CLE_JSON };

const charge = (jwt: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));

describe('lire la clé du compte de service', () => {
  it('se lit depuis le JSON en ligne', () => {
    expect(lireCleService(ENV)).toMatchObject({
      clientEmail: 'svav-drive@projet.iam.gserviceaccount.com',
      clientId: '123456789012345678901',
    });
  });

  it('se lit aussi depuis un FICHIER — la forme recommandée, hors du dépôt', () => {
    const cle = lireCleService({ [VARIABLE_CLE_FICHIER]: '/secrets/svav.json' }, () => CLE_JSON);
    expect(cle?.clientEmail).toBe('svav-drive@projet.iam.gserviceaccount.com');
  });

  /** « Pas configuré » n'est pas une panne : c'est un état que l'écran doit pouvoir annoncer calmement. */
  it('rien de configuré → null, jamais une exception', () => {
    expect(lireCleService({})).toBeNull();
    expect(delegationConfiguree({})).toBe(false);
    expect(delegationConfiguree(ENV)).toBe(true);
  });

  it('un fichier introuvable → null, pas une exception qui remonterait à l’écran', () => {
    expect(lireCleService({ [VARIABLE_CLE_FICHIER]: '/nexiste/pas.json' }, () => { throw new Error('ENOENT'); })).toBeNull();
  });

  it('un JSON abîmé, ou sans clé privée → null', () => {
    expect(lireCleService({ [VARIABLE_CLE_JSON]: 'pas du json' })).toBeNull();
    expect(lireCleService({ [VARIABLE_CLE_JSON]: '{"client_email":"a@b"}' })).toBeNull();
  });
});

describe('l’attestation signée', () => {
  const cle = lireCleService(ENV)!;
  const MAINTENANT = new Date('2026-09-25T12:00:00Z');

  /**
   * 🔴 LA REVENDICATION QUI FAIT TOUT LE LOT : `sub`. C'est elle, et elle seule, qui dit à Google « donne-moi un
   * jeton AU NOM DE cette personne » — et c'est pour cela que Google appliquera ensuite SES droits, et pas ceux
   * d'un compte partagé.
   */
  it('demande un jeton AU NOM du subject', () => {
    const c = charge(construireAssertion({ cle, subject: 'a.jorel@sansvisavis.com', maintenant: MAINTENANT }));
    expect(c.sub).toBe('a.jorel@sansvisavis.com');
    expect(c.iss).toBe('svav-drive@projet.iam.gserviceaccount.com');
  });

  /**
   * 🔴 UN SEUL SCOPE. Une délégation est un pouvoir d'usurpation d'identité sur TOUT le domaine : elle ne doit
   * porter que sur ce dont on a besoin. Ni Gmail, ni l'Admin SDK, ni quoi que ce soit d'autre.
   */
  it('ne demande QUE Drive', () => {
    const c = charge(construireAssertion({ cle, subject: 'a@b.fr', maintenant: MAINTENANT }));
    expect(c.scope).toBe(SCOPE_DRIVE);
    expect(String(c.scope)).not.toContain('gmail');
    expect(String(c.scope)).not.toContain('admin');
    expect(String(c.scope).split(' ')).toHaveLength(1);
  });

  it('est destinée au point d’échange de Google, et à lui seul', () => {
    expect(charge(construireAssertion({ cle, subject: 'a@b.fr', maintenant: MAINTENANT })).aud).toBe(ENDPOINT_TOKEN);
  });

  it('porte une fenêtre de validité d’une heure au plus', () => {
    const c = charge(construireAssertion({ cle, subject: 'a@b.fr', maintenant: MAINTENANT }));
    expect(c.iat).toBe(Math.floor(MAINTENANT.getTime() / 1000));
    expect(Number(c.exp) - Number(c.iat)).toBe(ASSERTION_DUREE_S);
    expect(Number(c.exp) - Number(c.iat)).toBeLessThanOrEqual(3600);
  });

  /** Une attestation mal signée serait refusée par Google : on vérifie qu'elle l'est VRAIMENT, avec la clé publique. */
  it('est signée en RS256, et la signature se vérifie', () => {
    const jwt = construireAssertion({ cle, subject: 'a@b.fr', maintenant: MAINTENANT });
    const [entete, payload, signature] = jwt.split('.');
    expect(JSON.parse(Buffer.from(entete, 'base64url').toString('utf8'))).toEqual({ alg: 'RS256', typ: 'JWT' });
    const ok = createVerify('RSA-SHA256')
      .update(`${entete}.${payload}`)
      .end()
      .verify(publicKey, Buffer.from(signature, 'base64url'));
    expect(ok).toBe(true);
  });

  it('le corps d’échange porte le bon type d’autorisation', () => {
    const c = corpsEchange('ASSERTION');
    expect(c.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(c.get('assertion')).toBe('ASSERTION');
  });
});

describe('pourquoi Google a refusé, en français', () => {
  /** Trois refus se ressemblent dans la réponse brute et appellent trois gestes différents. */
  it('délégation non déclarée → c’est l’administrateur qui doit agir, pas l’utilisateur', () => {
    expect(motifRefus('unauthorized_client', undefined)).toContain('pas encore configuré par l’administrateur');
  });
  it('compte inconnu dans l’organisation → on le dit sans jargon', () => {
    expect(motifRefus('invalid_grant', 'Invalid email or User ID')).toContain('n’y est pas reconnue');
  });
  it('compte suspendu → le mot exact', () => {
    expect(motifRefus('invalid_grant', 'Account has been disabled')).toContain('suspendu');
  });
  it('clé non reconnue → encore l’administrateur', () => {
    expect(motifRefus('invalid_client', undefined)).toContain('administrateur');
  });
  it('un refus inconnu ne prétend pas savoir', () => {
    expect(motifRefus('quelque_chose', undefined)).toContain('quelque_chose');
  });
  /** Aucun message ne doit renvoyer vers un bouton qui n'existe plus. */
  it('aucun message ne propose de « connecter » quoi que ce soit', () => {
    for (const e of ['unauthorized_client', 'invalid_grant', 'invalid_client', 'autre']) {
      expect(motifRefus(e, undefined)).not.toContain('Connecter');
    }
  });
});
