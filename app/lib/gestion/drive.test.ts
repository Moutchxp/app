import { describe, it, expect, vi } from 'vitest';
import {
  chercherDossiers, deposerFichier, echapperQ, filAriane, listerDossiers, lireDossier, motifHttp,
  MIME_DOSSIER, SIMPLE_JUSQUA_OCTETS,
} from './drive';

/** Un `fetch` de doublure : rend des réponses scriptées et retient les requêtes émises. */
function faussefetch(reponses: (Response | ((url: string, init?: RequestInit) => Response))[]) {
  const appels: { url: string; init?: RequestInit }[] = [];
  let i = 0;
  const f = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    appels.push({ url: String(url), init });
    const r = reponses[Math.min(i, reponses.length - 1)];
    i += 1;
    return typeof r === 'function' ? r(String(url), init) : r;
  });
  return { fetch: f as unknown as typeof fetch, appels };
}

const rep = (corps: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(corps), { status: 200, ...init });

/**
 * L'adresse rendue LISIBLE. `URLSearchParams` encode l'espace en `+`, que `decodeURIComponent` ne défait pas :
 * sans cette conversion, l'assertion cherche « name contains 'x' » dans une chaîne qui dit « name+contains+'x' ».
 */
const lisible = (url: string): string => decodeURIComponent(url.replace(/\+/g, ' '));

describe('échappement des requêtes Drive', () => {
  /** Un dossier nommé « L'Orne » couperait la requête en deux : l'apostrophe est un délimiteur, pas une lettre. */
  it('une apostrophe ne casse pas la requête', () => {
    expect(echapperQ("L'Orne")).toBe("L\\'Orne");
  });
  it('un antislash est échappé avant les apostrophes', () => {
    expect(echapperQ('a\\b')).toBe('a\\\\b');
  });
});

describe('lister les dossiers', () => {
  it('ne demande QUE des dossiers, et jamais la corbeille', async () => {
    const d = faussefetch([rep({ files: [] })]);
    await listerDossiers('jeton', { parentId: 'abc' }, d);
    const url = lisible(d.appels[0].url);
    expect(url).toContain(`mimeType = '${MIME_DOSSIER}'`);
    expect(url).toContain('trashed = false');
    expect(url).toContain("'abc' in parents");
  });

  /**
   * 🔴 SANS `corpora=drive` + `driveId`, l'API cherche dans Mon Drive et rend une liste VIDE pour un dossier
   * d'équipe : une panne SILENCIEUSE, la pire sorte — l'écran dirait « ce dossier est vide ».
   */
  it('un Drive partagé est interrogé avec son corpus, sinon la réponse serait vide sans erreur', async () => {
    const d = faussefetch([rep({ files: [] })]);
    await listerDossiers('jeton', { parentId: 'abc', driveId: 'DRV' }, d);
    const url = d.appels[0].url;
    expect(url).toContain('corpora=drive');
    expect(url).toContain('driveId=DRV');
    expect(url).toContain('supportsAllDrives=true');
    expect(url).toContain('includeItemsFromAllDrives=true');
  });

  it('le jeton part en en-tête, jamais dans l’adresse', async () => {
    const d = faussefetch([rep({ files: [] })]);
    await listerDossiers('SECRET', { parentId: 'abc' }, d);
    expect(d.appels[0].url).not.toContain('SECRET');
    expect((d.appels[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer SECRET');
  });

  it('rend les dossiers avec leur Drive d’origine', async () => {
    const d = faussefetch([rep({ files: [{ id: '1', name: 'Baux', driveId: 'DRV' }, { id: '2', name: 'Quittances' }] })]);
    const r = await listerDossiers('j', { parentId: 'root' }, d);
    expect(r.ok && r.valeur).toEqual([
      { id: '1', nom: 'Baux', driveId: 'DRV' },
      { id: '2', nom: 'Quittances', driveId: null },
    ]);
  });

  it('un refus devient un motif LISIBLE, jamais « HTTP 403 »', async () => {
    const d = faussefetch([new Response('', { status: 403 })]);
    const r = await listerDossiers('j', { parentId: 'x' }, d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain('n’a pas le droit d’écrire');
  });
});

describe('chercher un dossier par son nom', () => {
  it('cherche sur TOUS les Drive', async () => {
    const d = faussefetch([rep({ files: [] })]);
    await chercherDossiers('j', 'Dupont', d);
    const url = lisible(d.appels[0].url);
    expect(url).toContain("name contains 'Dupont'");
    expect(url).toContain('corpora=allDrives');
  });
  it('une recherche vide n’interroge PAS Google', async () => {
    const d = faussefetch([rep({ files: [] })]);
    const r = await chercherDossiers('j', '   ', d);
    expect(r.ok && r.valeur).toEqual([]);
    expect(d.appels).toHaveLength(0);
  });
});

describe('le fil d’Ariane', () => {
  it('remonte jusqu’à la racine, et rend le chemin dans le bon ordre', async () => {
    const d = faussefetch([
      rep({ id: 'c', name: 'Quittances', parents: ['b'] }),
      rep({ id: 'b', name: 'Dupont', parents: ['a'] }),
      rep({ id: 'a', name: '1 actifs', parents: [] }),
    ]);
    const r = await filAriane('j', 'c', d);
    expect(r.ok && r.valeur.map((e) => e.nom)).toEqual(['1 actifs', 'Dupont', 'Quittances']);
  });

  /** Un cycle n'est pas interdit par l'API : sans garde, la requête tournerait jusqu'au délai du navigateur. */
  it('un cycle ne fait pas tourner indéfiniment', async () => {
    const d = faussefetch([
      rep({ id: 'x', name: 'X', parents: ['y'] }),
      rep({ id: 'y', name: 'Y', parents: ['x'] }),
      rep({ id: 'x', name: 'X', parents: ['y'] }),
    ]);
    const r = await filAriane('j', 'x', d);
    expect(r.ok).toBe(true);
    expect(d.appels.length).toBeLessThanOrEqual(3);
  });

  /**
   * LOT 5-PJ-D — MESURÉ contre le Drive réel : `files.get` appelle « Drive » la racine de N'IMPORTE quel Drive
   * partagé. La miette emporte donc l'identifiant du Drive, seul moyen de lui rendre son vrai nom plus haut.
   */
  it('la racine d’un Drive partagé emporte son identifiant de Drive ; un dossier ordinaire non', async () => {
    const d = faussefetch([
      rep({ id: 'c', name: 'Quittances', parents: ['r'], driveId: 'DRV' }),
      rep({ id: 'r', name: 'Drive', parents: [], driveId: 'DRV' }),
    ]);
    const r = await filAriane('j', 'c', d);
    expect(r.ok && r.valeur).toEqual([
      { id: 'r', nom: 'Drive', driveId: 'DRV' },
      { id: 'c', nom: 'Quittances' },
    ]);
  });

  it('un dossier disparu le DIT', async () => {
    const d = faussefetch([new Response('', { status: 404 })]);
    const r = await lireDossier('j', 'perdu', d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain('n’existe plus');
  });
});

/**
 * ══ 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — DEUX ENVOIS, UN SEUIL ════════════════════════════════════════════════
 *
 * MESURÉ le 30/09/2026 sur le vrai Drive, fichier de 130 ko, trois fois : reprenable 2 953 / 3 556 / 2 608 ms,
 * multipart 2 466 / 2 476 / 2 058 ms. L'envoi reprenable paie un aller-retour entier pour ouvrir sa session —
 * une reprise dont un petit fichier n'a aucun besoin.
 */
describe('déposer un PETIT fichier — une seule requête (multipart)', () => {
  it('🔴 une seule requête, et `uploadType=multipart`', async () => {
    const d = faussefetch([rep({ id: 'F1', name: 'bail.pdf', webViewLink: 'https://drive/F1' })]);
    const r = await deposerFichier(
      'j', { nom: 'bail.pdf', typeMime: 'application/pdf', octets: new Uint8Array(10), dossierId: 'DOS' }, d);
    expect(r.ok && r.valeur).toEqual({ id: 'F1', nom: 'bail.pdf', webViewLink: 'https://drive/F1' });
    expect(d.appels).toHaveLength(1);
    expect(d.appels[0].url).toContain('uploadType=multipart');
    expect(d.appels[0].url).toContain('supportsAllDrives=true');
  });

  /** Le nom d'origine est ce que l'équipe reconnaîtra dans le Drive : le « nettoyer » romprait le lien avec le mail. */
  it('le NOM D’ORIGINE et le dossier partent dans les métadonnées, et nulle part ailleurs', async () => {
    const d = faussefetch([rep({ id: 'F1' })]);
    await deposerFichier(
      'j', { nom: 'Reçu de loyer.pdf', typeMime: null, octets: new Uint8Array(1), dossierId: 'DOS' }, d);
    const texte = new TextDecoder().decode(d.appels[0].init?.body as ArrayBuffer);
    expect(texte).toContain('{"name":"Reçu de loyer.pdf","parents":["DOS"]}');
    expect(d.appels[0].url).not.toContain('Re%C3%A7u');
  });

  /**
   * ⚠️ LA FRONTIÈRE EST TIRÉE AU HASARD, et il le faut : une frontière FIXE finirait un jour par se trouver dans
   * les octets d'un PDF, Google couperait le corps au mauvais endroit, et le fichier arriverait tronqué — sans
   * que rien ne le dise.
   */
  it('⚠️ la frontière multipart change d’un envoi à l’autre', async () => {
    const frontiere = async (): Promise<string> => {
      const d = faussefetch([rep({ id: 'F1' })]);
      await deposerFichier('j', { nom: 'a', typeMime: null, octets: new Uint8Array(1), dossierId: 'D' }, d);
      const t = (d.appels[0].init?.headers as Record<string, string>)['Content-Type'];
      return t.split('boundary=')[1];
    };
    expect(await frontiere()).not.toBe(await frontiere());
  });

  it('un refus rend un motif lisible, en une seule requête', async () => {
    const d = faussefetch([new Response('', { status: 403 })]);
    const r = await deposerFichier('j', { nom: 'a', typeMime: null, octets: new Uint8Array(1), dossierId: 'D' }, d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain('droit d’écrire');
  });
});

describe('déposer un GROS fichier — envoi REPRENABLE', () => {
  const ouverture = (): Response => new Response('', { status: 200, headers: { Location: 'https://upload/session-1' } });
  /** Au-dessus du seuil : c'est là qu'une reprise vaut son aller-retour. */
  const gros = (n = SIMPLE_JUSQUA_OCTETS + 10): Uint8Array => new Uint8Array(n);

  it('ouvre une session, puis pousse le contenu', async () => {
    const d = faussefetch([ouverture(), rep({ id: 'F1', name: 'bail.pdf', webViewLink: 'https://drive/F1' })]);
    const r = await deposerFichier(
      'j', { nom: 'bail.pdf', typeMime: 'application/pdf', octets: gros(), dossierId: 'DOS' }, d);
    expect(r.ok && r.valeur).toEqual({ id: 'F1', nom: 'bail.pdf', webViewLink: 'https://drive/F1' });
    expect(d.appels[0].url).toContain('uploadType=resumable');
    expect(d.appels[1].url).toBe('https://upload/session-1');
  });

  it('le NOM D’ORIGINE et le dossier partent dans les métadonnées, et nulle part ailleurs', async () => {
    const d = faussefetch([ouverture(), rep({ id: 'F1' })]);
    await deposerFichier('j', { nom: 'Reçu de loyer.pdf', typeMime: null, octets: gros(), dossierId: 'DOS' }, d);
    const corps = JSON.parse(String(d.appels[0].init?.body));
    expect(corps).toEqual({ name: 'Reçu de loyer.pdf', parents: ['DOS'] });
  });

  it('sans `supportsAllDrives`, un dépôt en Drive partagé serait refusé : le paramètre est là', async () => {
    const d = faussefetch([ouverture(), rep({ id: 'F1' })]);
    await deposerFichier('j', { nom: 'a', typeMime: null, octets: gros(), dossierId: 'DOS' }, d);
    expect(d.appels[0].url).toContain('supportsAllDrives=true');
  });

  /**
   * 🔴 LE CŒUR DE L'ENVOI REPRENABLE : sur un 308, l'API dit jusqu'où elle a REÇU. On repart de LÀ, et non de ce
   * qu'on croyait avoir envoyé — sinon une coupure à 90 % ferait tout recommencer.
   */
  it('un 308 fait reprendre à l’octet que Google dit avoir reçu', async () => {
    const taille = SIMPLE_JUSQUA_OCTETS + 20;
    const d = faussefetch([
      ouverture(),
      new Response('', { status: 308, headers: { Range: 'bytes=0-4' } }),
      rep({ id: 'F1', webViewLink: 'https://drive/F1' }),
    ]);
    const r = await deposerFichier('j', { nom: 'a', typeMime: null, octets: gros(taille), dossierId: 'D' }, d);
    expect(r.ok).toBe(true);
    // Le second morceau repart de l'octet 5, celui qui suit ce que Google dit avoir reçu.
    expect((d.appels[2].init?.headers as Record<string, string>)['Content-Range'])
      .toBe(`bytes 5-${taille - 1}/${taille}`);
  });

  it('une session non ouverte est dite, pas devinée', async () => {
    const d = faussefetch([new Response('', { status: 200 })]); // 200 mais sans Location
    const r = await deposerFichier('j', { nom: 'a', typeMime: null, octets: gros(), dossierId: 'D' }, d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain('session');
  });

  it('un refus de dépôt rend un motif lisible', async () => {
    const d = faussefetch([ouverture(), new Response('', { status: 403 })]);
    const r = await deposerFichier('j', { nom: 'a', typeMime: null, octets: gros(), dossierId: 'D' }, d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain('droit d’écrire');
  });

  /** ⚠️ UN FICHIER VIDE n'a aucun morceau : il garde le chemin reprenable, qui sait clore une session à vide. */
  it('⚠️ un fichier VIDE passe par le reprenable, et clôt sa session', async () => {
    const d = faussefetch([ouverture(), rep({ id: 'F1' })]);
    const r = await deposerFichier('j', { nom: 'a', typeMime: null, octets: new Uint8Array(0), dossierId: 'D' }, d);
    expect(r.ok).toBe(true);
    expect(d.appels[0].url).toContain('uploadType=resumable');
  });
});

describe('les motifs, écrits pour un humain', () => {
  it('401 envoie refaire l’autorisation', () => {
    expect(motifHttp(401, 'le dépôt')).toContain('refaire l’autorisation');
  });
  it('429 et 5xx disent d’attendre, pas de corriger', () => {
    expect(motifHttp(429, 'x')).toContain('réessayer');
    expect(motifHttp(503, 'x')).toContain('réessayer');
  });
});
