import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (23/10/2026) — la ROUTE de la fiche commune, « Modifier » la fiche entière : `?ficheEntiere=N` (le formulaire pré-rempli),
 * `?versionBien=N` (la mise à jour automatique), action `modifier-fiche-bien` (la saisie, l'auteur, la tuile d'origine). La Gestion
 * et la Location passent par la MÊME route et la MÊME fonction : une modification faite d'un côté se lit de l'autre. Dépôt simulé
 * en mémoire : rien n'est écrit en base.
 */
vi.mock('server-only', () => ({}));
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerCompteActif: async () => null }));
vi.mock('../../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 5, libelle: 'arno@exemple.test' }) }));
vi.mock('../../../../../../lib/db/client', () => ({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })), withTransaction: vi.fn(), closePool: vi.fn() }));
// Le dépôt en mémoire : une fiche, son empreinte, et l'écriture qui la change.
let base: { commentaire: string; version: string };
const appels: unknown[][] = [];
vi.mock('../../../../../../lib/location/ficheBienEntiereRepo', () => ({
  lireFicheEntiere: async (id: number) => ({ etat: 'ok', data: { id, version: base.version, encart: { valeurs: { commentaire: base.commentaire } } } }),
  versionDuBien: async () => ({ etat: 'ok', data: { version: base.version } }),
  modifierFicheEntiere: async (...a: unknown[]) => {
    appels.push(a);
    const s = a[1] as { version: string; valeurs: { commentaire: string } };
    if (s.version !== base.version) return { etat: 'conflit', motif: 'Ce bien a été modifié par ailleurs — recharger ?' };
    base = { commentaire: s.valeurs.commentaire, version: `${base.version}+` };
    return { etat: 'ok', data: { changements: [{ cle: 'commentaire', champ: 'Commentaire libre', avant: 'Avant.', apres: s.valeurs.commentaire }], notes: [] } };
  },
}));
const { GET, POST } = await import('./route');

const URL_API = 'http://localhost/api/admin/gestion/annuaire/location';
const entetes = (location: boolean): Record<string, string> => ({ 'Content-Type': 'application/json', ...(location ? { 'x-svav-contexte': 'location' } : {}) });
const lire = async (q: string, location = false) => (await GET(new Request(`${URL_API}?${q}`, { headers: entetes(location) }))).json();
const poste = async (corps: unknown, location = false) => (await POST(new Request(URL_API, { method: 'POST', headers: entetes(location), body: JSON.stringify(corps) }))).json();
beforeEach(() => { base = { commentaire: 'Avant.', version: 'v1' }; appels.length = 0; });

describe('🔴 la fiche entière : la route', () => {
  it('?ficheEntiere=N → la fiche pré-remplie ; ?versionBien=N → sa seule empreinte', async () => {
    expect(await lire('ficheEntiere=176')).toEqual({ etat: 'ok', data: { id: 176, version: 'v1', encart: { valeurs: { commentaire: 'Avant.' } } } });
    expect(await lire('versionBien=176')).toEqual({ etat: 'ok', data: { version: 'v1' } });
  });

  it('la Gestion et la Location lisent EXACTEMENT la même fiche', async () => {
    expect(await lire('ficheEntiere=176', true)).toEqual(await lire('ficheEntiere=176', false));
  });

  it('modifiée depuis la Location → lue depuis la Gestion (et inversement) ; la tuile d’origine part avec la saisie', async () => {
    const r = await poste({ action: 'modifier-fiche-bien', id: 176, saisie: { version: 'v1', valeurs: { commentaire: 'Depuis la Location.' } } }, true);
    expect(r.etat).toBe('ok');
    expect(appels[0]).toEqual([176, { version: 'v1', valeurs: { commentaire: 'Depuis la Location.' } }, { id: 5, libelle: 'arno@exemple.test' }, 'Location']);
    const g = await lire('ficheEntiere=176', false);
    expect(g.data.encart.valeurs.commentaire).toBe('Depuis la Location.');
    await poste({ action: 'modifier-fiche-bien', id: 176, saisie: { version: g.data.version, valeurs: { commentaire: 'Depuis la Gestion.' } } }, false);
    expect(appels[1][3]).toBe('Gestion');
    expect((await lire('ficheEntiere=176', true)).data.encart.valeurs.commentaire).toBe('Depuis la Gestion.');
  });

  it('conflit de version : l’autre côté a écrit entre-temps → « Ce bien a été modifié par ailleurs — recharger ? », rien d’écrit', async () => {
    await poste({ action: 'modifier-fiche-bien', id: 176, saisie: { version: 'v1', valeurs: { commentaire: 'Premier.' } } }, true);
    const r = await poste({ action: 'modifier-fiche-bien', id: 176, saisie: { version: 'v1', valeurs: { commentaire: 'Second.' } } }, false);
    expect(r).toEqual({ etat: 'conflit', motif: 'Ce bien a été modifié par ailleurs — recharger ?' });
    expect((await lire('ficheEntiere=176')).data.encart.valeurs.commentaire).toBe('Premier.');
  });

  it('demande incomplète (sans identifiant ou sans saisie) : refusée, le dépôt n’est pas appelé', async () => {
    for (const corps of [{ action: 'modifier-fiche-bien', saisie: {} }, { action: 'modifier-fiche-bien', id: 176 }, { action: 'modifier-fiche-bien', id: 176, saisie: null }]) {
      expect((await poste(corps)).etat).toBe('refus');
    }
    expect(appels).toHaveLength(0);
  });
});
