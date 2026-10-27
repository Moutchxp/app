// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ComptesPage, { LIBELLE_RESULTAT_NET } from './page';

/**
 * 🔴 Arno (26/10/2026, 428) — PAGE COMPTES : « Accès au Résultat net de l'agence ? » est RATTACHÉE à la tuile Location (dans son bloc, en
 * retrait) ; elle n'existe que tuile cochée ; Non par défaut ; Oui part avec les permissions ; décocher la tuile la fait disparaître et
 * retire le droit (envoyé à faux). Vraie page, `fetch` simulé : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const PERMS = (o: Record<string, boolean> = {}) => ({ pilotage: false, cartes_annee: false, statistiques: false, internautes: false, curation: false, banc_test: false, permis: false, gestion: false, location: false, transaction: false, ...o });
let posts: { url: string; corps: Record<string, unknown> }[];
let detail: Record<string, unknown>;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  posts = [];
  detail = { id: 9, identifiant: 'collab@exemple.test', prenom: 'Léa', nom: 'MARTIN', role: 'collaborateur', actif: true, derniere_connexion_a: null, cree_a: '2026-10-01T09:00:00Z',
    doit_changer_mot_de_passe: false, perms: PERMS({ location: true }), peutModifierPermis: false, etatEnvoiGestion: 'sans_objet',
    resultatNet: { valeur: false, disponible: true } };
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push({ url, corps });
      // La base simulée garde ce qui vient d'être enregistré (la page relit le compte ensuite).
      const rn = detail.resultatNet as { valeur: boolean; disponible: boolean };
      detail = { ...detail, perms: corps.perms, resultatNet: { ...rn, valeur: typeof corps.resultat_net === 'boolean' ? corps.resultat_net : rn.valeur } };
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
    }
    if (url === '/api/admin/comptes') return { ok: true, status: 200, json: async () => ({ comptes: [{ ...detail }] }) } as unknown as Response;
    return { ok: true, status: 200, json: async () => ({ compte: detail }) } as unknown as Response;
  }) as unknown as typeof fetch;
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
const tuile = (mot: string) => [...container.querySelectorAll('.cpt-detail .cpt-tuile')].find((t) => t.querySelector('.cpt-chip')?.textContent?.endsWith(mot)) as HTMLElement;
const question = () => container.querySelector('[data-question-resultat-net]') as HTMLElement | null;
const bouton = (mot: 'Oui' | 'Non') => [...(question()?.querySelectorAll('.cpt-ouinon__btn') ?? [])].find((b) => b.textContent?.endsWith(mot)) as HTMLButtonElement;
const ouvrir = async () => {
  await act(async () => { root.render(createElement(ComptesPage)); }); await calmer();
  await clic([...container.querySelectorAll('button')].find((b) => b.textContent === 'Détails')!);
};
const enregistrer = () => clic([...container.querySelectorAll('button')].find((b) => b.textContent === 'Enregistrer les permissions')!);

describe('🔴 « Accès au Résultat net de l’agence ? » — rattachée à la tuile Location', () => {
  it('juste sous la tuile Location cochée (dans son bloc) ; Non par défaut ; Oui part avec les permissions', async () => {
    await ouvrir();
    expect(question()).not.toBeNull();
    expect(tuile('Location').contains(question())).toBe(true);
    expect(question()?.querySelector('.cpt-sous-titre')?.textContent).toBe(LIBELLE_RESULTAT_NET);
    expect([bouton('Oui').getAttribute('aria-pressed'), bouton('Non').getAttribute('aria-pressed')]).toEqual(['false', 'true']);
    await clic(bouton('Oui'));
    await enregistrer();
    expect(posts.at(-1)).toMatchObject({ url: '/api/admin/comptes/9/permissions', corps: { perms: { location: true }, resultat_net: true } });
  });
  it('🔴 décocher la tuile Location : la question DISPARAÎT et le droit est retiré (envoyé à faux)', async () => {
    detail = { ...detail, resultatNet: { valeur: true, disponible: true } };
    await ouvrir();
    expect(bouton('Oui').getAttribute('aria-pressed')).toBe('true');
    await clic(tuile('Location').querySelector('.cpt-chip')!);
    expect(question()).toBeNull();
    await enregistrer();
    expect(posts.at(-1)?.corps).toMatchObject({ perms: { location: false }, resultat_net: false });
    // Recochée : la question revient à Non (rien ne revient en silence).
    await clic(tuile('Location').querySelector('.cpt-chip')!);
    expect([bouton('Oui').getAttribute('aria-pressed'), bouton('Non').getAttribute('aria-pressed')]).toEqual(['false', 'true']);
  });
  it('tuile Location non cochée au départ : pas de question', async () => {
    detail = { ...detail, perms: PERMS() };
    await ouvrir();
    expect(question()).toBeNull();
  });
  it('sans la migration 428 : la question est là, inactive, et le dit ; rien n’est envoyé pour elle', async () => {
    detail = { ...detail, resultatNet: { valeur: false, disponible: false } };
    await ouvrir();
    expect(bouton('Oui').disabled).toBe(true);
    expect(question()?.textContent).toContain('migration 428');
    await enregistrer();
    expect(posts.at(-1)?.corps).not.toHaveProperty('resultat_net');
  });
});
