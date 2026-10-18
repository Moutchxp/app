// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * 🔴🔴 LA CARTE COMPLÈTE SUR LA FICHE COMMUNE (Arno, 18/10/2026 — Gestion ET Location, même composant).
 *   ① supprimer / archiver la DERNIÈRE carte complète : fenêtre « Suppression impossible », rien ne part ;
 *   ② la modifier en lui retirant son téléphone : fenêtre de refus, rien ne part ;
 *   ③ une carte client SUIVANTE incomplète : fenêtre d'alerte des manques → « Revenir modifier la carte » (rien ne
 *      part) / « Enregistrer quand même » (la fiche est créée) ;
 *   ④ une fiche ANCIENNE sans carte complète : bandeau rouge avec les manques ; une carte incomplète s'y archive.
 * Les vrais composants, routes simulées : rien ne part, rien n'est écrit.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
import { Annuaire } from './Annuaire';
import { FicheCommuneLocation } from './FicheCommune';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const coord = (id: number, sorte: 'telephone' | 'email', valeur: string) => ({
  id, sorte, valeur, affichage: valeur, absent: false, note: null, typeAnnotation: null, libelle: sorte === 'email' ? 'E-mail' : 'Mobile',
});
const personne = (id: number, nom: string, contacts: ReturnType<typeof coord>[]) => ({
  sujet: 'proprietaire' as const, id, cle: `P${id}`, civilite: 'M.', prenom: 'Paul', nom, nomAffiche: `M. ${nom} Paul`, qualite: null, note: null,
  rang: id, archive: false, archiveLe: null, archivePar: null, adresse: '1 rue A', commune: 'Paris', codePostal: '75011', absent: false,
  creeLe: null, importeLe: '2026-09-25T10:00:00Z', contacts, dernierProprietaire: false,
});
const COMPLET = () => personne(9, 'MARTIN', [coord(1, 'telephone', '06 12 34 56 78'), coord(2, 'email', 'martin@fictif.test')]);
const INCOMPLET = () => personne(10, 'DURAND', [coord(3, 'email', 'durand@fictif.test')]);

let hote: HTMLDivElement;
let racine: Root;
let personnes: unknown[];
let posts: Record<string, unknown>[];
const reponse = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote);
  posts = []; personnes = [COMPLET(), INCOMPLET()];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return reponse({ etat: 'ok', data: { id: 77 } }); }
    if (u.includes('/api/admin/gestion/annuaire?proprietaire=')) {
      return reponse({ etat: 'ok', data: {
        id: 9, cle: 'P9', nom: 'MARTIN Paul', civilite: 'M.', adresse: null, commune: null, codePostal: null, relationDepuis: null, absent: false,
        contacts: [], driveDossierId: null, lots: [], biens: [], personnes, modifiable: true, suppressionDisponible: true,
      } });
    }
    if (u.includes('historique/parties')) return reponse({ etat: 'ok', data: { cartes: [] } });
    return reponse({ etat: 'inconnu' });
  }));
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); document.body.innerHTML = ''; vi.unstubAllGlobals(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); }); };
const cliquer = async (el: Element | null | undefined) => { if (!el) throw new Error('absent'); await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
const carte = (nom: string) => [...hote.querySelectorAll('#ann-coord ~ * article.cp-carte, section article.cp-carte')].find((c) => (c.textContent ?? '').includes(nom)) ?? null;
const fenetre = () => document.querySelector('[data-fenetre-carte]');
const boutonFenetre = (t: string) => [...document.querySelectorAll('[data-fenetre-carte] button')].find((b) => b.textContent === t);
const poser = (el: HTMLInputElement, v: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
async function archiver(nom: string): Promise<void> {
  await cliquer(carte(nom)?.querySelector('[aria-label="Autres gestes"]'));
  await cliquer([...hote.querySelectorAll('button')].find((b) => (b.textContent ?? '').startsWith('Archiver (restaurable)')));
  await cliquer([...hote.querySelectorAll('.cp-confirme button')].find((b) => b.textContent === 'Archiver'));
}

const MONTAGES = {
  Gestion: () => createElement(Annuaire as never, { fiche: { sorte: 'proprietaire', id: 9 }, onFiche: () => {}, onRetour: () => {} }),
  Location: () => createElement(FicheCommuneLocation, { fiche: { sorte: 'proprietaire', id: 9 } }),
} as const;

for (const [ou, monter] of Object.entries(MONTAGES)) {
  describe(`🔴 la carte complète — fiche propriétaire (${ou})`, () => {
    const ouvrir = async () => { await act(async () => { racine.render(monter()); }); await calmer(); };

    it('① archiver la DERNIÈRE carte complète : fenêtre « Suppression impossible », rien ne part ; l’incomplète s’archive', async () => {
      await ouvrir();
      expect(hote.querySelector('[data-sans-carte-complete]')).toBeNull();
      await archiver('MARTIN');
      expect(fenetre()?.textContent).toContain('Suppression impossible');
      expect(fenetre()?.textContent).toContain('dernière carte complète');
      expect(posts).toEqual([]);
      await cliquer(boutonFenetre('Compris'));
      expect(fenetre()).toBeNull();
      await archiver('DURAND');
      expect(posts.map((p) => [p.action, p.id])).toEqual([['archiver', 10]]);
    });

    it('② retirer le téléphone de la dernière carte complète : fenêtre de refus, rien ne part', async () => {
      await ouvrir();
      await cliquer(carte('MARTIN')?.querySelector('[aria-label="Modifier"]'));
      const form = hote.querySelector('.cp-carte--edition .cp-form') as HTMLElement;
      const valeurs = [...form.querySelectorAll('[aria-label="Valeur"]')] as HTMLInputElement[];
      const telInput = valeurs.find((v) => v.value.includes('06'));
      await act(async () => { poser(telInput as HTMLInputElement, ''); });
      await cliquer([...form.querySelectorAll('button')].find((b) => b.textContent === 'Enregistrer'));
      expect(fenetre()?.textContent).toContain('Modification impossible');
      expect(fenetre()?.textContent).toContain('son téléphone et son e-mail ne peuvent pas être retirés');
      expect(posts).toEqual([]);
    });

    it('③ une carte client SUIVANTE sans téléphone : alerte des manques → retour (rien) / enregistrer quand même (créée)', async () => {
      await ouvrir();
      await cliquer(hote.querySelector('.cp-carte--ajout'));
      await cliquer([...hote.querySelectorAll('button')].find((b) => b.textContent === 'Propriétaire (client)'));
      const form = hote.querySelector('.cp-carte--edition .cp-form') as HTMLElement;
      const champ = (mot: string) => [...form.querySelectorAll('.cp-champ')].find((l) => (l.textContent ?? '').startsWith(mot));
      const civ = champ('Civilité')?.querySelector('select') as HTMLSelectElement;
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(civ, civ.options[1].value); civ.dispatchEvent(new Event('change', { bubbles: true })); });
      for (const [mot, v] of [['Nom', 'LEROY'], ['Prénom', 'Anne'], ['Adresse', '2 rue B'], ['Code postal', '75012']] as const) {
        await act(async () => { poser(champ(mot)?.querySelector('input') as HTMLInputElement, v); });
      }
      await act(async () => { poser(champ('Code postal')?.querySelectorAll('input')[1] as HTMLInputElement, 'Paris'); });
      const valeurs = [...form.querySelectorAll('[aria-label="Valeur"]')] as HTMLInputElement[];
      await act(async () => { poser(valeurs[valeurs.length - 1], 'leroy@fictif.test'); });
      // Le téléphone n'est PLUS bloquant pour une carte suivante : « Enregistrer » est cliquable.
      const enregistrer = [...form.querySelectorAll('button')].find((b) => b.textContent === 'Enregistrer') as HTMLButtonElement;
      expect(enregistrer.disabled).toBe(false);
      await cliquer(enregistrer);
      expect(fenetre()?.textContent).toContain('Carte incomplète');
      expect([...(fenetre()?.querySelectorAll('li') ?? [])].map((l) => l.textContent)).toEqual(['Téléphone manquant']);
      await cliquer(boutonFenetre('Revenir modifier la carte'));
      expect(fenetre()).toBeNull();
      expect(posts).toEqual([]);
      await cliquer(enregistrer);
      await cliquer(boutonFenetre('Enregistrer quand même'));
      expect(posts[0]).toMatchObject({ action: 'creer', sujet: 'proprietaire', nom: 'LEROY' });
    });

    it('④ fiche ancienne sans carte complète : bandeau rouge des manques, jamais bloquée ; une carte incomplète s’archive', async () => {
      personnes = [personne(9, 'MARTIN', [coord(1, 'telephone', '06 12 34 56 78')]), INCOMPLET()];
      await ouvrir();
      const bandeau = hote.querySelector('[data-sans-carte-complete]');
      expect(bandeau?.textContent).toContain('Aucune carte complète pour ce propriétaire');
      expect([...(bandeau?.querySelectorAll('li') ?? [])].map((l) => l.textContent)).toEqual([
        'M. MARTIN Paul : E-mail manquant', 'M. DURAND Paul : Téléphone manquant']);
      await archiver('MARTIN');
      expect(fenetre()).toBeNull();
      expect(posts.map((p) => [p.action, p.id])).toEqual([['archiver', 9]]);
    });
  });
}
