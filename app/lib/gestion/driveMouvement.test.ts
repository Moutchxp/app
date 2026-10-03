import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { copierFichier, creerDossierPourCopie, deplacerVers } from './driveMouvement';

/**
 * LOT DRIVE-DEPLACER — CE QUE LE MODULE D'ÉCRITURE A LE DROIT DE FAIRE, ET RIEN DE PLUS.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 POURQUOI CE FICHIER DE TEST EXISTE À PART.
 *
 * `driveEcriture.ts` ne fait que des `POST`, et son test statique l'exige : il compte les verbes HTTP de son source
 * et refuse tout le reste. Ce lot ajoute un `PATCH` (`files.update`, pour déplacer). Le mettre là-bas aurait obligé
 * à relâcher ce test — et un garde qu'on relâche une fois se relâche une seconde fois.
 *
 * Le nouveau module a donc SON propre garde statique, qui dit exactement ce qu'il a le droit d'émettre, et surtout
 * ce qu'il n'a pas le droit de connaître : aucun `DELETE`, aucun `trashed`, aucun `name` dans le corps d'un
 * déplacement (ce serait un renommage), aucune `permissions` (ce serait un partage).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

type Appel = { url: string; init: RequestInit };

function faux(reponse: unknown, statut = 200): { deps: { fetch: typeof fetch }; appels: Appel[] } {
  const appels: Appel[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    appels.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(reponse), { status: statut, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { deps: { fetch: f }, appels };
}

describe('déplacer — files.update avec addParents/removeParents, et rien d’autre', () => {
  it('🔴 le corps de la requête est VIDE : tout passe par les paramètres d’URL', async () => {
    const { deps, appels } = faux({ id: 'F1', name: 'bail.pdf', parents: ['CIBLE'] });
    const r = await deplacerVers('jeton', { id: 'F1', parentOrigine: 'SOURCE', parentCible: 'CIBLE' }, deps);

    expect(r.ok).toBe(true);
    expect(appels).toHaveLength(1);
    expect(appels[0].init.method).toBe('PATCH');
    /* 🔴 UN CORPS QUI CONTIENDRAIT « name » SERAIT UN RENOMMAGE, et « trashed » une mise à la corbeille. C'est
       la raison d'être de ce corps vide, et la raison d'être de cette assertion. */
    expect(appels[0].init.body).toBe('{}');
    expect(appels[0].url).toContain('addParents=CIBLE');
    expect(appels[0].url).toContain('removeParents=SOURCE');
  });

  /**
   * ⚠️ `removeParents` EST OBLIGATOIRE. Sans lui, Drive AJOUTE un parent au lieu de déplacer : le fichier se
   * retrouve dans les deux dossiers à la fois et l'on croit l'avoir déplacé alors qu'on l'a dupliqué en place.
   * C'est le piège classique de cette API, et ce test est là pour qu'il ne se referme pas un jour.
   */
  it('🔴 removeParents est TOUJOURS envoyé — sans lui, Drive ajoute au lieu de déplacer', async () => {
    const { deps, appels } = faux({ id: 'F1', name: 'x', parents: ['CIBLE'] });
    await deplacerVers('jeton', { id: 'F1', parentOrigine: 'SOURCE', parentCible: 'CIBLE' }, deps);
    expect(appels[0].url).toMatch(/removeParents=/);
  });

  it('un refus de Google devient un motif lisible, jamais un code nu', async () => {
    const { deps } = faux({}, 403);
    const r = await deplacerVers('jeton', { id: 'F1', parentOrigine: 'A', parentCible: 'B' }, deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain('droits insuffisants');
  });

  it('le Drive muet n’est pas un succès silencieux', async () => {
    const deps = { fetch: (async () => { throw new Error('réseau coupé'); }) as unknown as typeof fetch };
    const r = await deplacerVers('jeton', { id: 'F1', parentOrigine: 'A', parentCible: 'B' }, deps);
    expect(r.ok).toBe(false);
  });
});

describe('copier — files.copy, et le nom n’est imposé que si on le demande', () => {
  /**
   * 🔴 SANS NOM DEMANDÉ, LE CORPS NE PORTE QUE LE PARENT, et c'est ce qui donne le comportement attendu pour les
   * doublons : « les deux sont conservés, jamais d'écrasement ». C'est le cas du geste « copier » du navigateur
   * de fichiers, qui ne passe pas de nom — il n'a donc pas changé d'un octet à ce lot.
   */
  it('le corps ne porte que le parent — pas de nom, donc pas de renommage déguisé', async () => {
    const { deps, appels } = faux({ id: 'C1', name: 'bail.pdf', parents: ['CIBLE'] });
    const r = await copierFichier('jeton', { id: 'F1', parentCible: 'CIBLE' }, deps);

    expect(r.ok).toBe(true);
    expect(appels[0].init.method).toBe('POST');
    expect(appels[0].url).toContain('/copy');
    const corps = JSON.parse(String(appels[0].init.body)) as Record<string, unknown>;
    expect(Object.keys(corps)).toEqual(['parents']);
  });

  /**
   * ══ 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — LA COPIE PEUT NAÎTRE SOUS LE NOM CHOISI ═══════════════════════════
   *
   * DÉFAUT RÉEL : une pièce renommée au stylo puis rangée passait par ici quand ses octets locaux avaient été
   * libérés, et Google nommait la copie comme l'ORIGINAL. La même pièce se rangeait donc sous deux noms selon
   * la voie empruntée — le contraire exact de « un seul nom, partout ».
   *
   * 🔒 ET CE N'EST PAS UN RENOMMAGE : le fichier NAÎT de cet appel. Rien d'existant n'est touché, et le corps du
   * `PATCH` de `deplacerVers` reste vide — c'est lui que le garde statique surveille.
   */
  it('🔴 un nom demandé part dans le corps, et la copie naît sous ce nom', async () => {
    const { deps, appels } = faux({ id: 'C2', name: 'Recommandé M Ahmed KHARRAT.pdf', parents: ['CIBLE'] });
    const r = await copierFichier(
      'jeton', { id: 'F1', parentCible: 'CIBLE', nom: 'Recommandé M Ahmed KHARRAT.pdf' }, deps);

    expect(r.ok).toBe(true);
    const corps = JSON.parse(String(appels[0].init.body)) as Record<string, unknown>;
    expect(corps).toEqual({ parents: ['CIBLE'], name: 'Recommandé M Ahmed KHARRAT.pdf' });
  });

  it('⚠️ un nom blanc ne s’impose pas : le corps redevient celui d’avant ce lot', async () => {
    const { deps, appels } = faux({ id: 'C3', name: 'bail.pdf', parents: ['CIBLE'] });
    await copierFichier('jeton', { id: 'F1', parentCible: 'CIBLE', nom: '   ' }, deps);
    expect(Object.keys(JSON.parse(String(appels[0].init.body)) as object)).toEqual(['parents']);
  });

  it('une copie sans identifiant rendu est un échec, pas une réussite vide', async () => {
    const { deps } = faux({ name: 'sans id' });
    const r = await copierFichier('jeton', { id: 'F1', parentCible: 'CIBLE' }, deps);
    expect(r.ok).toBe(false);
  });

  it('le dossier d’accueil d’une copie récursive est un POST ordinaire, avec son parent', async () => {
    const { deps, appels } = faux({ id: 'D1', name: 'Travaux', parents: ['CIBLE'] });
    const r = await creerDossierPourCopie('jeton', { nom: 'Travaux', parentCible: 'CIBLE' }, deps);
    expect(r.ok).toBe(true);
    const corps = JSON.parse(String(appels[0].init.body)) as { mimeType?: string; parents?: string[] };
    expect(corps.mimeType).toBe('application/vnd.google-apps.folder');
    expect(corps.parents).toEqual(['CIBLE']);
  });
});

/**
 * ══ 🔴🔴 LE GARDE STATIQUE — CE QUE CE MODULE NE SAURA JAMAIS FAIRE ═════════════════════════════════════════════
 *
 * Aucun test de fonction ne peut tenir cette promesse-là : il faut regarder le SOURCE. On y compte les verbes HTTP
 * un par un, et l'on y cherche les mots des gestes que l'application ne fait pas.
 */
describe('🔴 aucune porte dérobée dans driveMouvement', () => {
  const src = readFileSync('app/lib/gestion/driveMouvement.ts', 'utf8');
  /** ⚠️ On examine le CODE, pas la prose : l'encadré du fichier NOMME justement ce qu'il s'interdit. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');

  it('exactement trois écritures : un PATCH et deux POST', () => {
    const verbes = (code.match(/method:\s*'(GET|POST|PATCH|PUT|DELETE)'/g) ?? []).sort();
    expect(verbes).toEqual([`method: 'PATCH'`, `method: 'POST'`, `method: 'POST'`].sort());
  });

  it('🔴 aucune suppression, aucune corbeille, aucun renommage, aucun partage', () => {
    for (const mot of ['delete', 'trashed', 'permissions', 'emptyTrash']) {
      expect(code.toLowerCase()).not.toContain(mot.toLowerCase());
    }
    /* 🔴🔴 « name: » N'EST PERMIS QUE LÀ OÙ LE FICHIER N'EXISTE PAS ENCORE. Deux endroits, deux naissances :
       la CRÉATION du dossier d'accueil d'une copie récursive, et la COPIE elle-même (lot RANGER-INSTANTANE-ET-NOM,
       pour qu'une pièce renommée se range sous son nom par les DEUX voies de dépôt). Une troisième occurrence
       voudrait dire qu'on a commencé à renommer de l'EXISTANT — et c'est cela, et cela seul, qui est interdit ici.

       🔴 LA VRAIE BARRIÈRE EST JUSTE À CÔTÉ, et elle n'a pas bougé : le corps du `PATCH` de `deplacerVers` est
       `'{}'`, éprouvé plus haut. Un `name` LÀ serait un renommage ; un `name` sur un fichier qui naît n'en est
       pas un. */
    expect((code.match(/\bname:/g) ?? [])).toHaveLength(2);
  });

  it('aucun identifiant de dossier en dur — surtout pas celui de l’archive', () => {
    expect(code).not.toContain('1Urt6vEZSBaZXu1VJV5rq6ylEwmgtWqRI');
    expect(code).not.toMatch(/'1[A-Za-z0-9_-]{25,}'/);
  });

  it('ni contournement, ni mode « forcer »', () => {
    expect(code).not.toMatch(/--force|forcer|ignorerGarde|sansGarde|bypass/i);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — `files.copy` RAPPORTE L'EMPREINTE DE LA COPIE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   🔴 POURQUOI CETTE VOIE COMPTE AUTANT QUE L'AUTRE. Depuis le lot RANGER-INSTANTANE-ET-NOM, `files.copy` est la
   voie ORDINAIRE du rangement d'une pièce : presque toutes ont déjà une copie dans « 00 Arrivée des mails », et
   copier de dossier à dossier ne fait transiter aucun octet. Si elle ne rapportait pas son `md5Checksum` là où
   `deposerFichier` rapporte le sien, la même pièce entrerait au registre AVEC son empreinte par un chemin et SANS
   elle par l'autre — selon qu'une copie d'arrivée existe ou non.

   ⚠️ UN DÉPLACEMENT, LUI, NE CRÉE RIEN : il n'a aucune métadonnée neuve à faire entrer dans l'index, et il n'en
   demande pas. C'est éprouvé en négatif ci-dessous.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 copier — les métadonnées de la copie', () => {
  const COPIE = {
    id: 'C1', name: 'bail.pdf', parents: ['CIBLE'], webViewLink: 'https://drive/C1',
    md5Checksum: '7b2364ff4527e7a55365f506f98bf888', size: '4096',
    mimeType: 'application/pdf', modifiedTime: '2026-10-03T19:37:35.000Z', driveId: 'DRV',
  };

  it('🔴🔴 elle les DEMANDE, et elle les rend', async () => {
    const { deps, appels } = faux(COPIE);
    const r = await copierFichier('j', { id: 'F1', parentCible: 'CIBLE' }, deps);
    expect(appels[0].url).toContain('md5Checksum');
    expect(r.ok && r.valeur).toMatchObject({
      id: 'C1', md5: COPIE.md5Checksum, tailleOctets: 4096,
      typeMime: 'application/pdf', modifieLe: COPIE.modifiedTime, driveId: 'DRV',
    });
  });

  /** ⚠️ `size` EN CHAÎNE : illisible ⇒ `null`, jamais `NaN` — qui ferait échouer l'`INSERT` du registre. */
  it('⚠️ une taille illisible rend `null`, jamais `NaN`', async () => {
    const { deps } = faux({ ...COPIE, size: 'beaucoup' });
    const r = await copierFichier('j', { id: 'F1', parentCible: 'CIBLE' }, deps);
    expect(r.ok && r.valeur.tailleOctets).toBeNull();
  });

  /** ⚠️ UN DOCUMENT GOOGLE NATIF N'A PAS D'EMPREINTE : `null`, et la copie réussit quand même. */
  it('⚠️ pas d’empreinte ⇒ `null`, et la copie réussit', async () => {
    const { deps } = faux({ id: 'C1', name: 'a', parents: ['CIBLE'] });
    const r = await copierFichier('j', { id: 'F1', parentCible: 'CIBLE' }, deps);
    expect(r.ok).toBe(true);
    expect(r.ok && r.valeur.md5).toBeNull();
  });

  /** 🔴 LE DÉPLACEMENT NE DEMANDE RIEN DE TOUT CELA : il ne crée aucun fichier. */
  it('🔴 un déplacement ne demande pas d’empreinte', async () => {
    const { deps, appels } = faux({ id: 'F1', name: 'bail.pdf', parents: ['CIBLE'] });
    await deplacerVers('j', { id: 'F1', parentOrigine: 'SOURCE', parentCible: 'CIBLE' }, deps);
    expect(appels[0].url).not.toContain('md5Checksum');
  });
});
