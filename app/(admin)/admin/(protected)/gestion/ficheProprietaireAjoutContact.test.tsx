// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * 🔴🔴 FICHE PROPRIÉTAIRE COMMUNE — « + Ajouter un contact » (Arno, 18/10/2026, accord pour la Gestion).
 *   ① la tuile dit « Ajouter un contact » et ouvre le MÊME petit choix que la fiche du bien (« AJOUTER… », rouge
 *      « Propriétaire (client) », blanc « Contact du propriétaire », « Annuler ») ;
 *   ② « Propriétaire (client) » = l'ajout d'avant (fiche créée, rattachée comme co-propriétaire aux biens en gestion) ;
 *   ③ « Contact du propriétaire » = une carte CONTACT DU PROPRIÉTAIRE rangée sur CHACUN des biens en gestion, côté
 *      propriétaire (pas un client), affichée UNE fois ; ses gestes valent pour toutes ses copies ;
 *   ④ le même comportement depuis la Gestion (annuaire) et la Location (fiche commune) ;
 *   ⑤ fiche archivée : pas de tuile.
 * Les vrais composants, routes simulées : rien ne part, rien n'est écrit.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
import { Annuaire } from './Annuaire';
import { FicheCommuneLocation } from './FicheCommune';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const personne = (o: Record<string, unknown> = {}) => ({
  sujet: 'proprietaire' as const, id: 9, cle: 'P9', civilite: 'M.', prenom: 'Paul', nom: 'MARTIN', nomAffiche: 'M. MARTIN Paul', qualite: null, note: null,
  rang: 0, archive: false, archiveLe: null, archivePar: null, adresse: null, commune: null, codePostal: null, absent: false,
  creeLe: null, importeLe: '2026-09-25T10:00:00Z', contacts: [], ...o,
});
const bien = (id: number, numero: string) => ({
  id, numero, adresse: `${id} rue des Lilas`, commune: 'Paris', codePostal: '75011', nature: 'Appartement', typeBien: 'Studio', immeuble: null,
  surfaceM2: null, debut: '2020-01-01', fin: null, locataire: null, locataireId: null, locataireDepuis: null, mails: 0, dernierEchange: null,
  evenementsOuverts: 0, driveDossierId: null,
});
const carte = (id: number, lotCle: string, o: Record<string, unknown> = {}) => ({
  id, lotCle, cote: 'proprietaire', locataireId: null, adresse: 'notaire@fictif.test', nom: 'Maître DUPONT', telephone: null, origine: 'manuel',
  verifieLe: null, verifiePar: null, creeLe: '2026-10-01T10:00:00Z', creePar: 'Arno', note: null, civilite: null, prenom: null, qualite: 'Notaire',
  adressePostale: null, codePostal: null, commune: null, coordonnees: [{ sorte: 'email', libelle: 'E-mail', valeur: 'notaire@fictif.test' }], ...o,
});

let hote: HTMLDivElement;
let racine: Root;
let archive: boolean;
let posts: { url: string; corps: Record<string, unknown> }[];
const reponse = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote);
  archive = false; posts = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push({ url: u, corps });
      return reponse({ etat: 'ok', data: { id: 77 } });
    }
    if (u.includes('/api/admin/gestion/annuaire?proprietaire=')) {
      return reponse({ etat: 'ok', data: {
        id: 9, cle: 'P9', nom: 'MARTIN Paul', civilite: 'M.', adresse: null, commune: null, codePostal: null, relationDepuis: '2020-01-01', absent: false,
        contacts: [], driveDossierId: null, lots: [], biens: [bien(101, '501'), bien(102, '502')], personnes: [personne({ archive })],
        modifiable: true, suppressionDisponible: true,
      } });
    }
    // Le même contact rangé sur les DEUX biens : une seule carte à l'écran.
    if (u.includes('/api/admin/gestion/historique/parties?cible=lot-501')) return reponse({ etat: 'ok', data: { cartes: [carte(11, '501')] } });
    if (u.includes('/api/admin/gestion/historique/parties?cible=lot-502')) return reponse({ etat: 'ok', data: { cartes: [carte(12, '502')] } });
    return reponse({ etat: 'inconnu' });
  }));
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); vi.unstubAllGlobals(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); }); };
const cliquer = async (el: Element | null | undefined) => { if (!el) throw new Error('absent'); await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
const bouton = (t: string) => [...hote.querySelectorAll('button')].find((b) => b.textContent === t);
const coord = () => hote.querySelector('#ann-coord')?.closest('section') ?? null;
const tuile = () => coord()?.querySelector('.cp-carte--ajout') ?? null;

const MONTAGES = {
  Gestion: () => createElement(Annuaire as never, { fiche: { sorte: 'proprietaire', id: 9 }, onFiche: () => {}, onRetour: () => {} }),
  Location: () => createElement(FicheCommuneLocation, { fiche: { sorte: 'proprietaire', id: 9 } }),
} as const;

for (const [ou, monter] of Object.entries(MONTAGES)) {
  describe(`🔴 fiche propriétaire (${ou}) : « + Ajouter un contact »`, () => {
    beforeEach(async () => { await act(async () => { racine.render(monter()); }); await calmer(); });

    it('① la tuile dit « Ajouter un contact » ; le choix « AJOUTER… » propose les 2 rôles et « Annuler »', async () => {
      expect(tuile()?.textContent).toContain('Ajouter un contact');
      expect(tuile()?.textContent).not.toContain('Ajouter un propriétaire');
      await cliquer(tuile());
      const choix = coord()?.querySelector('.cp-carte--choix');
      expect(choix?.querySelector('.cp-choix-titre')?.textContent).toBe('Ajouter…');
      expect([...(choix?.querySelectorAll('button') ?? [])].map((b) => [b.textContent, b.className])).toEqual([
        ['Propriétaire (client)', 'cp-choix-btn cp-choix-btn--premier'], ['Contact du propriétaire', 'cp-choix-btn'], ['Annuler', 'gst-lien-bouton']]);
      await cliquer(bouton('Annuler'));
      expect(tuile()).not.toBeNull();
      expect(posts).toEqual([]);
    });

    it('② « Propriétaire (client) » : l’ajout d’avant — fiche propriétaire créée puis rattachée aux deux biens en gestion', async () => {
      await cliquer(tuile());
      await cliquer(bouton('Propriétaire (client)'));
      expect(coord()?.querySelector('.cp-rappel')?.textContent).toContain('co-propriétaire sur les 2 biens');
      const champ = (mot: string) => [...hote.querySelectorAll('.cp-champ')].find((l) => (l.textContent ?? '').startsWith(mot));
      const poser = (el: HTMLInputElement | HTMLSelectElement, v: string) => {
        const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, v);
        el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
      };
      const civ = champ('Civilité')?.querySelector('select, input') as HTMLSelectElement | HTMLInputElement | null;
      if (civ) await act(async () => { poser(civ, civ instanceof HTMLSelectElement ? (civ.options[1]?.value ?? 'Mme') : 'Mme'); });
      await act(async () => { poser(champ('Nom')?.querySelector('input') as HTMLInputElement, 'DURAND'); });
      for (const [mot, v] of [['Prénom', 'Léa'], ['Adresse', '3 rue des Lilas'], ['Code postal', '75011']] as const) {
        const el = champ(mot)?.querySelector('input') as HTMLInputElement | null;
        if (el) await act(async () => { poser(el, v); });
      }
      // Code postal et commune partagent un même libellé : la commune est le second champ.
      const commune = champ('Code postal')?.querySelectorAll('input')[1] as HTMLInputElement | undefined;
      if (commune) await act(async () => { poser(commune, 'Paris'); });
      const valeurs = [...hote.querySelectorAll('[aria-label="Valeur"]')] as HTMLInputElement[];
      await act(async () => { poser(valeurs[0], '06 11 22 33 44'); });
      await act(async () => { poser(valeurs[valeurs.length - 1], 'durand@fictif.test'); });
      await cliquer(bouton('Enregistrer'));
      const creer = posts.find((p) => p.corps.action === 'creer');
      expect(creer?.corps).toMatchObject({ action: 'creer', sujet: 'proprietaire', nom: 'DURAND' });
      expect(posts.filter((p) => p.corps.action === 'ajouter-proprietaire').map((p) => p.corps.lotId)).toEqual([101, 102]);
      expect(posts.some((p) => p.url.includes('historique/parties'))).toBe(false);
    });

    it('③ « Contact du propriétaire » : carte de contact rangée sur CHAQUE bien, côté propriétaire — pas un client', async () => {
      await cliquer(tuile());
      await cliquer(bouton('Contact du propriétaire'));
      expect(coord()?.querySelector('.cp-form-titre')?.textContent).toBe('Nouveau contact');
      expect(coord()?.querySelector('.cp-rappel')?.textContent).toContain('contact du propriétaire sur les 2 biens');
      const poser = (el: HTMLInputElement, v: string) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const nom = [...hote.querySelectorAll('.cp-champ')].find((l) => (l.textContent ?? '').startsWith('Nom'))?.querySelector('input') as HTMLInputElement;
      await act(async () => { poser(nom, 'AXA'); });
      const valeurs = [...hote.querySelectorAll('[aria-label="Valeur"]')] as HTMLInputElement[];
      await act(async () => { poser(valeurs[valeurs.length - 1], 'axa@fictif.test'); });
      await cliquer(bouton('Enregistrer'));
      const ranges = posts.filter((p) => p.url === '/api/admin/gestion/historique/parties');
      expect(ranges.map((p) => [p.corps.cible, p.corps.adresse, p.corps.categorie])).toEqual([
        ['lot-501', 'axa@fictif.test', 'proprietaire'], ['lot-502', 'axa@fictif.test', 'proprietaire']]);
      expect(posts.some((p) => p.corps.action === 'creer' || p.corps.action === 'ajouter-proprietaire')).toBe(false);
    });

    it('④ la carte « contact du propriétaire » existante : UNE fois (étiquette du contact, Qualité), ses gestes valent pour toutes ses copies', async () => {
      const cartes = [...(coord()?.querySelectorAll('article.cp-carte') ?? [])].filter((c) => /DUPONT/i.test(c.textContent ?? ''));
      expect(cartes).toHaveLength(1);
      expect((cartes[0].textContent ?? '').toUpperCase()).toContain('CONTACT DU PROPRIÉTAIRE');
      expect(cartes[0].textContent).toContain('Notaire');
      // Le compteur ne compte que les clients.
      expect(coord()?.querySelector('.gst-compte')?.textContent).toBe('1');
      await cliquer(cartes[0].querySelector('[aria-label="Autres gestes"]'));
      await cliquer([...hote.querySelectorAll('button, [role="menuitem"]')].find((b) => (b.textContent ?? '').startsWith('Retirer')) ?? null);
      const confirmer = [...hote.querySelectorAll('button')].find((b) => /^(Oui|Retirer|Confirmer)/.test(b.textContent ?? '') && b !== null);
      if (confirmer && posts.length === 0) await cliquer(confirmer);
      expect(posts.filter((p) => p.corps.action === 'retirer').map((p) => p.corps.id)).toEqual([11, 12]);
    });

    it('⑤ fiche archivée : la tuile n’apparaît pas', async () => {
      archive = true;
      await act(async () => { racine.unmount(); });
      racine = createRoot(hote);
      await act(async () => { racine.render(monter()); }); await calmer();
      expect(coord()).not.toBeNull();
      expect(tuile()).toBeNull();
      expect(coord()?.querySelector('.cp-carte--choix')).toBeNull();
    });
  });
}
