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

describe('copier — files.copy, et le nom n’est jamais imposé', () => {
  /**
   * 🔴 LE NOM N'EST PAS IMPOSÉ, et c'est ce qui donne le comportement demandé par Arno pour les doublons : « les
   * deux sont conservés, jamais d'écrasement ». Imposer un nom serait, techniquement, un renommage.
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
    /* 🔴 « name: » DANS LE CORPS D'UN DÉPLACEMENT SERAIT UN RENOMMAGE. Il n'est permis qu'une fois : à la
       CRÉATION du dossier d'accueil d'une copie récursive, où il n'y a rien à renommer — le dossier n'existe pas
       encore. Une deuxième occurrence voudrait dire qu'on a commencé à renommer l'existant. */
    expect((code.match(/\bname:/g) ?? [])).toHaveLength(1);
  });

  it('aucun identifiant de dossier en dur — surtout pas celui de l’archive', () => {
    expect(code).not.toContain('1Urt6vEZSBaZXu1VJV5rq6ylEwmgtWqRI');
    expect(code).not.toMatch(/'1[A-Za-z0-9_-]{25,}'/);
  });

  it('ni contournement, ni mode « forcer »', () => {
    expect(code).not.toMatch(/--force|forcer|ignorerGarde|sansGarde|bypass/i);
  });
});
