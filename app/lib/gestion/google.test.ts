import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  COMPTE_GESTION, echangerCode, estCompteAttendu, lireCompte, lireIdentifiants, lireSignatures, listerDrivesPartages,
  masquerJeton, PORTEES_GESTION, rafraichirJeton, resumerSignature, urlConsentement,
  type IdentifiantsGoogle,
} from './google';
import { cheminJeton, lireJeton } from './googleJeton';

/**
 * LOT 5-GOOGLE — LA CONNEXION DE gestion@, ÉPROUVÉE SANS AUCUNE CONNEXION RÉELLE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 AUCUN APPEL SORT D'ICI : le `fetch` est INJECTÉ, et c'est un espion. Chaque test vérifie ce qui aurait été
 * demandé à Google, jamais ce que Google aurait répondu pour de vrai.
 *
 * Quatre façons de se tromper, et chacune coûte cher :
 *   ① les portées dérivent → on demande la lecture du courrier alors qu'on n'en a pas besoin, et l'écran de
 *      consentement effraie à juste titre celui qui le lit ;
 *   ② l'application enregistre un jeton pour un AUTRE compte → elle écrira au nom de quelqu'un d'autre, et cela ne se
 *      verra qu'au premier mail parti de la mauvaise adresse ;
 *   ③ un jeton s'affiche ou se journalise → il finit dans un historique de terminal ou une capture d'écran ;
 *   ④ la « vérification » écrit quelque chose → on ne peut plus la relancer sans conséquence, ce qui la rend inutile.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const IDENT: IdentifiantsGoogle = { clientId: 'client-essai.apps.googleusercontent.com', clientSecret: 'secret-essai', source: 'gestion' };
const JETON_ESSAI = '1//essai-jeton-de-rafraichissement-qui-ne-doit-jamais-s-afficher';

/** Un Google SIMULÉ : il note ce qu'on lui demande, et rend ce qu'on lui a dit de rendre. */
function googleSimule(reponses: Record<string, { status?: number; corps: unknown }>) {
  const appels: { url: string; methode: string; corps: string | null }[] = [];
  const faux = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    appels.push({ url: u, methode: init?.method ?? 'GET', corps: init?.body ? String(init.body) : null });
    const cle = Object.keys(reponses).find((k) => u.startsWith(k));
    const r = cle ? reponses[cle] : { status: 404, corps: {} };
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.corps } as unknown as Response;
  });
  return { appels, deps: { fetch: faux as unknown as typeof fetch } };
}

describe('🔴 ① LES PORTÉES — exactement trois, et pas la lecture du courrier', () => {
  it('les trois portées demandées sont celles qu’Arno a décidées, mot pour mot', () => {
    expect([...PORTEES_GESTION]).toEqual([
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.settings.basic',
      'https://www.googleapis.com/auth/drive',
    ]);
  });

  /**
   * 🔴 CHANGEMENT DU LOT 5-FIDÈLE — `gmail.modify` REMPLACE `gmail.send`, sur décision d'Arno. La boîte de l'écran
   * doit agir sur la VRAIE boîte Gmail de l'équipe : étoiler, marquer non lu, signaler un spam, lire l'original.
   * Rien de tout cela n'est possible avec `gmail.send`, qui ne sait qu'expédier.
   *
   * L'INVARIANT N'A PAS DISPARU, IL S'EST DÉPLACÉ : ce qu'on continue de refuser, c'est la portée qui permettrait
   * la SUPPRESSION DÉFINITIVE (`https://mail.google.com/`). Tout ce que l'outil fait à la boîte reste défaisable
   * depuis Gmail — un libellé se retire, un filtre se supprime. Aucun geste ne peut effacer un mail pour de bon.
   */
  it('🔴 la portée d’ACCÈS TOTAL — la seule qui permettrait d’effacer — n’est PAS demandée', () => {
    for (const p of PORTEES_GESTION) {
      expect(p).not.toBe('https://mail.google.com/');
      expect(p).not.toContain('mail.google.com/');
    }
  });

  it('la page de consentement porte ces trois portées, et les demande HORS LIGNE avec un consentement explicite', () => {
    const u = new URL(urlConsentement({ clientId: 'abc', redirectUri: 'http://127.0.0.1:1234', state: 'xyz' }));
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('scope')?.split(' ')).toEqual([...PORTEES_GESTION]);
    // Sans ces deux-là, Google ne rend pas de jeton de rafraîchissement à la 2ᵉ autorisation.
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('prompt')).toBe('consent');
    expect(u.searchParams.get('state')).toBe('xyz');
    expect(u.searchParams.get('login_hint')).toBe(COMPTE_GESTION);
  });
});

describe('🔴 ② LE COMPTE — aucun autre que gestion@criterimmo.fr', () => {
  it('reconnaît le bon compte, quelle que soit la casse ou les espaces', () => {
    expect(estCompteAttendu('gestion@criterimmo.fr')).toBe(true);
    expect(estCompteAttendu('  Gestion@Criterimmo.FR ')).toBe(true);
  });

  it('🔴 refuse tout le reste — y compris ce qui y ressemble', () => {
    for (const a of ['arno@criterimmo.fr', 'gestion@criterimmo.com', 'gestion@sansvisavis.com', '', null, undefined]) {
      expect(estCompteAttendu(a)).toBe(false);
    }
  });

  it('le compte est demandé à Drive, en LECTURE, et sur les seuls champs utiles', async () => {
    const g = googleSimule({
      'https://www.googleapis.com/drive/v3/about': { corps: { user: { emailAddress: COMPTE_GESTION, displayName: 'Gestion Criterimmo' } } },
    });
    const r = await lireCompte('jeton-acces', g.deps);
    expect(r).toEqual({ ok: true, valeur: { email: COMPTE_GESTION, nom: 'Gestion Criterimmo' } });
    expect(g.appels[0].methode).toBe('GET');
    expect(g.appels[0].url).toContain('fields=user(emailAddress,displayName)');
  });

  it('une adresse absente est un REFUS explicite, jamais une chaîne vide qui passerait le contrôle', async () => {
    const g = googleSimule({ 'https://www.googleapis.com/drive/v3/about': { corps: { user: {} } } });
    const r = await lireCompte('jeton-acces', g.deps);
    expect(r.ok).toBe(false);
  });
});

describe('L’ÉCHANGE DU CODE, et ses deux refus qui se réparent différemment', () => {
  it('rend le jeton de rafraîchissement quand tout va bien', async () => {
    const g = googleSimule({ 'https://oauth2.googleapis.com/token': { corps: { refresh_token: JETON_ESSAI, access_token: 'acces' } } });
    const r = await echangerCode({ identifiants: IDENT, code: 'c', redirectUri: 'http://127.0.0.1:1' }, g.deps);
    expect(r).toEqual({ ok: true, valeur: { refreshToken: JETON_ESSAI, accessToken: 'acces' } });
    expect(g.appels[0].methode).toBe('POST');
    expect(g.appels[0].corps).toContain('grant_type=authorization_code');
  });

  it('🔴 réponse SANS refresh_token → le motif dit le geste exact qui répare (révoquer, puis recommencer)', async () => {
    const g = googleSimule({ 'https://oauth2.googleapis.com/token': { corps: { access_token: 'acces' } } });
    const r = await echangerCode({ identifiants: IDENT, code: 'c', redirectUri: 'http://127.0.0.1:1' }, g.deps);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motif).toContain('myaccount.google.com/permissions');
      expect(r.motif).toContain('déjà autorisé');
    }
  });

  it('un refus de Google est rapporté TEL QUEL, pas noyé dans un « erreur interne »', async () => {
    const g = googleSimule({ 'https://oauth2.googleapis.com/token': { status: 400, corps: { error: 'invalid_grant', error_description: 'Code was already redeemed' } } });
    const r = await echangerCode({ identifiants: IDENT, code: 'c', redirectUri: 'http://127.0.0.1:1' }, g.deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain('invalid_grant');
  });

  it('un jeton périmé dit qu’il faut REFAIRE l’autorisation — pas « réessayez »', async () => {
    const g = googleSimule({ 'https://oauth2.googleapis.com/token': { status: 400, corps: { error: 'invalid_grant' } } });
    const r = await rafraichirJeton({ identifiants: IDENT, refreshToken: JETON_ESSAI }, g.deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain('refaire l’autorisation');
  });
});

describe('🔴 ③ UN JETON NE S’AFFICHE JAMAIS', () => {
  it('on en dit la longueur, jamais la valeur', () => {
    const dit = masquerJeton(JETON_ESSAI);
    expect(dit).not.toContain(JETON_ESSAI);
    expect(dit).toContain(String(JETON_ESSAI.length));
    expect(masquerJeton('')).toBe('absent');
    expect(masquerJeton(null)).toBe('absent');
  });

  it('🔴 aucun des deux CLI n’imprime un jeton : ils n’ont même pas de quoi le faire', () => {
    for (const f of ['gestion-google-autoriser', 'gestion-google-verifier']) {
      const src = readFileSync(`app/scripts/${f}.ts`, 'utf8');
      const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l.trim())).join('\n');
      // Toute mention d'un jeton dans une SORTIE doit passer par `masquerJeton` — jamais la valeur nue.
      for (const ligne of code.split('\n').filter((l) => /console\.\w+\(/.test(l))) {
        if (/refreshToken|accessToken|\baccès\b.*valeur/.test(ligne)) {
          expect(ligne.includes('masquerJeton'), `${f} : ${ligne.trim()}`).toBe(true);
        }
      }
      expect(code.includes('masquerJeton'), f).toBe(true);
    }
  });

  it('🔴 le fichier du jeton est IGNORÉ par git — même si on le déplaçait dans le dépôt', () => {
    const sortie = execFileSync('git', ['check-ignore', '-v', 'google-gestion.json'], { encoding: 'utf8' });
    expect(sortie).toContain('.gitignore');
    // …et le chemin par DÉFAUT est hors du dossier du projet.
    const defaut = cheminJeton({}, '/Users/essai');
    expect(defaut).toBe('/Users/essai/.config/sansvisavis/google-gestion.json');
    expect(defaut.startsWith(process.cwd())).toBe(false);
  });

  it('le jeton Drive existant n’est ni lu ni touché par le module de gestion', () => {
    // Sur les lignes de CODE seulement : l'en-tête CITE le jeton Drive pour dire qu'il n'y touche pas.
    const code = [readFileSync('app/lib/gestion/google.ts', 'utf8'), readFileSync('app/lib/gestion/googleJeton.ts', 'utf8')]
      .flatMap((f) => f.split('\n'))
      .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l.trim()))
      .join('\n');
    expect(code).not.toContain('GOOGLE_DRIVE_REFRESH_TOKEN');
    // Le CLIENT du Drive, lui, peut servir de repli : c'est le même client OAuth, pas le même jeton.
    expect(code).toContain('GOOGLE_DRIVE_CLIENT_ID');
  });
});

describe('LES IDENTIFIANTS — dédiés, ou ceux du Drive en repli', () => {
  it('les variables dédiées priment', () => {
    expect(lireIdentifiants({ GOOGLE_GESTION_CLIENT_ID: 'a', GOOGLE_GESTION_CLIENT_SECRET: 'b', GOOGLE_DRIVE_CLIENT_ID: 'x', GOOGLE_DRIVE_CLIENT_SECRET: 'y' }))
      .toEqual({ clientId: 'a', clientSecret: 'b', source: 'gestion' });
  });

  it('…sinon le client du Drive, et l’écran DIT lequel a servi', () => {
    expect(lireIdentifiants({ GOOGLE_DRIVE_CLIENT_ID: 'x', GOOGLE_DRIVE_CLIENT_SECRET: 'y' }))
      .toEqual({ clientId: 'x', clientSecret: 'y', source: 'drive' });
  });

  it('🔴 une DEMI-configuration n’en est pas une : elle échouerait après le clic, au pire moment', () => {
    expect(lireIdentifiants({ GOOGLE_GESTION_CLIENT_ID: 'a' })).toBeNull();
    expect(lireIdentifiants({ GOOGLE_DRIVE_CLIENT_SECRET: 'y' })).toBeNull();
    expect(lireIdentifiants({})).toBeNull();
  });
});

describe('🔴 ④ LA VÉRIFICATION NE PEUT RIEN CASSER', () => {
  it('signatures et Drive partagés : deux GET, aucune écriture', async () => {
    const g = googleSimule({
      'https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs': {
        corps: { sendAs: [{ sendAsEmail: COMPTE_GESTION, isDefault: true, signature: '<div>Service Gestion<br>CRITERIMMO</div>' }] },
      },
      'https://www.googleapis.com/drive/v3/drives': { corps: { drives: [{ name: 'Gestion locative' }, { name: 'Archives' }] } },
    });
    const sigs = await lireSignatures('acces', g.deps);
    const drives = await listerDrivesPartages('acces', g.deps);
    expect(sigs).toEqual({ ok: true, valeur: [{ adresse: COMPTE_GESTION, parDefaut: true, signature: '<div>Service Gestion<br>CRITERIMMO</div>' }] });
    expect(drives).toEqual({ ok: true, valeur: ['Gestion locative', 'Archives'] });
    // 🔴 Aucune méthode d'écriture, sur aucun appel.
    for (const a of g.appels) expect(a.methode).toBe('GET');
    // …et on ne demande QUE les noms des Drive : aucun fichier n'est listé.
    expect(g.appels.some((a) => a.url.includes('fields=drives(name)'))).toBe(true);
  });

  it('🔴 le CLI de vérification ne connaît aucun verbe d’écriture, ni aucun point d’envoi', () => {
    const src = readFileSync('app/scripts/gestion-google-verifier.ts', 'utf8');
    const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l.trim())).join('\n');
    expect(/method:\s*'(POST|PUT|PATCH|DELETE)'/.test(code)).toBe(false);
    expect(code).not.toContain('messages/send');
    expect(code).not.toContain('writeFileSync');
    expect(code).not.toContain('ecrireJeton');
  });

  it('les premiers mots d’une signature : du HTML, mais rendus en texte, coupés sur un mot entier', () => {
    expect(resumerSignature('<div>Service Gestion<br>CRITERIMMO &mdash; 01 23 45 67 89</div>'))
      .toContain('Service Gestion CRITERIMMO');
    expect(resumerSignature(null)).toBe('');
    expect(resumerSignature('<p>   </p>')).toBe('');
    const long = resumerSignature(`<p>${'mot '.repeat(60)}</p>`, 40);
    expect(long.length).toBeLessThanOrEqual(41);
    expect(long.endsWith('…')).toBe(true);
    expect(long).not.toContain('<');
  });
});

describe('garanties STATIQUES', () => {
  it('aucune dépendance npm Google : seulement le `fetch` natif, injecté', () => {
    const src = readFileSync('app/lib/gestion/google.ts', 'utf8');
    // Le paquet npm `googleapis` — pas les adresses `*.googleapis.com`, qui sont les points d'entrée de l'API.
    expect(/from '[^']*googleapis'|require\('[^']*googleapis'\)/.test(src)).toBe(false);
    expect(JSON.parse(readFileSync('package.json', 'utf8')).dependencies).not.toHaveProperty('googleapis');
    expect(src.split('\n').filter((l) => /^\s*import\b/.test(l))).toEqual([]);
  });

  it('🔴 le rangement du jeton touche au DISQUE : aucun composant du navigateur ne doit l’atteindre', async () => {
    const { readdirSync } = await import('node:fs');
    const clients = readdirSync('app', { recursive: true })
      .map((p) => `app/${String(p).split(/[\\/]/).join('/')}`)
      .filter((p) => /\.tsx?$/.test(p))
      .filter((p) => { try { return /^\s*(['"])use client\1/.test(readFileSync(p, 'utf8')); } catch { return false; } });
    expect(clients.length).toBeGreaterThan(50); // témoin : la découverte fonctionne
    for (const c of clients) {
      expect(readFileSync(c, 'utf8'), c).not.toContain('gestion/googleJeton');
      expect(readFileSync(c, 'utf8'), c).not.toContain('gestion/google');
    }
  });

  it('le jeton absent n’est pas une panne : on rend `null`, et l’écran le dit', () => {
    expect(lireJeton({}, '/chemin/qui/n/existe/pas/google-gestion.json')).toBeNull();
  });

  it('les deux CLI sont déclarés dans package.json, sous des noms qui disent ce qu’ils font', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['gestion:google:autoriser']).toBe('tsx app/scripts/gestion-google-autoriser.ts');
    expect(pkg.scripts['gestion:google:verifier']).toBe('tsx app/scripts/gestion-google-verifier.ts');
  });
});
