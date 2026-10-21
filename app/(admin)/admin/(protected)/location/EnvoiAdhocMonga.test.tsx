// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BlocEnvoiFicheLocataire, EnvoiAdhocMonga } from './EnvoiAdhocMonga';
import { listeProposee } from '../../../../lib/location/mailNouvelleLocation';

/**
 * 🔴 Arno (21/10/2026) — le bouton « Envoi ADHOC & MONGA » et sa fenêtre de confirmation. Les VRAIS composants, route simulée :
 * rien ne part. On éprouve : la copie personnelle EN TÊTE puis les trois adresses par défaut ; pas de doublon ; ajouter /
 * modifier / supprimer une ligne pour CET envoi sans toucher la configuration ; rien n'est envoyé sans « Envoyer » ; échec puis
 * « Réessayer » ; la mention « Envoyé le … » et « Renvoyer à ADHOC & MONGA ».
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONFIG = [
  { adresse: 'gestion@criterimmo.fr', libelle: 'Service gestion (copie de confirmation)' },
  { adresse: 'gestion.criterimmo@gmail.com', libelle: 'ADHOC' },
  { adresse: 'laura@monga.io', libelle: 'MONGA' },
];
const json = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let appels: { methode: string; url: string; corps: Record<string, unknown> | null }[];
let session: { email: string | null; nom: string };
/** Les réponses successives au POST d'envoi. */
let reponsesEnvoi: unknown[];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = []; session = { email: 'a.jorel@sansvisavis.com', nom: 'Arnaud Jorel' }; reponsesEnvoi = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const methode = init?.method ?? 'GET';
    appels.push({ methode, url: String(url), corps: typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null });
    if (methode === 'POST') return json(reponsesEnvoi.shift() ?? { etat: 'echec', motif: 'rien de prévu' });
    if (String(url).includes('locataire=')) {
      return json({ etat: 'ok', data: [{ bailId: 536, titre: '4 rue Fictive, Puteaux', entree: '2026-11-01', dernierEnvoi: null },
        { bailId: 12, titre: '9 rue Ancienne, Paris', entree: '2025-01-01', dernierEnvoi: { quand: '2026-10-20T08:00:00Z', par: 'Arnaud Jorel', destinataires: ['laura@monga.io'], objet: 'o', mention: 'Envoyé le 20/10/2026 à 10:00 par Arnaud Jorel à laura@monga.io' } }] });
    }
    return json({ etat: 'ok', data: {
      bailId: 536, objet: 'Nouvelle location · NOUVEAU PROPRIÉTAIRE · 4 rue Fictive, Puteaux · ESSAI BAIL DRIVE · 01/11/2026 · GARANTIE À VÉRIFIER',
      html: '<html><body><p>Aperçu fictif</p></body></html>', texte: 'x', expediteur: 'gestion@criterimmo.fr',
      destinataires: listeProposee(CONFIG, session), dernierEnvoi: null, envoiPossible: true,
    } });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const clic = async (el: Element | null) => { expect(el).not.toBeNull(); await act(async () => { el!.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const lignes = () => [...container.querySelectorAll('[data-ligne-destinataire]')].map((li) => [
  (li.querySelector('[data-adresse]') as HTMLInputElement).value, (li.querySelector('[data-libelle]') as HTMLInputElement).value]);
const ouvrir = async () => {
  await act(async () => { root.render(createElement(EnvoiAdhocMonga, { bailId: 536 })); });
  await clic(container.querySelector('[data-ouvrir-envoi]'));
};
const posts = () => appels.filter((a) => a.methode === 'POST');

describe('🔴 la fenêtre de confirmation « Envoi ADHOC & MONGA »', () => {
  it('le gros bouton ; au clic, la fenêtre : la COPIE PERSONNELLE EN TÊTE, puis les trois destinataires par défaut, l’objet, l’aperçu', async () => {
    await act(async () => { root.render(createElement(EnvoiAdhocMonga, { bailId: 536 })); });
    expect(container.querySelector('[data-ouvrir-envoi]')?.textContent).toBe('Envoi ADHOC & MONGA');
    expect(container.querySelector('[data-fenetre-envoi]')).toBeNull();
    await clic(container.querySelector('[data-ouvrir-envoi]'));
    expect(container.querySelector('[data-fenetre-envoi]')?.getAttribute('role')).toBe('dialog');
    expect(lignes()).toEqual([
      ['a.jorel@sansvisavis.com', 'Vous (Arnaud Jorel) · copie personnelle'],
      ['gestion@criterimmo.fr', 'Service gestion (copie de confirmation)'], ['gestion.criterimmo@gmail.com', 'ADHOC'], ['laura@monga.io', 'MONGA'],
    ]);
    expect(container.querySelector('[data-objet-mail]')?.textContent).toContain('Nouvelle location · NOUVEAU PROPRIÉTAIRE');
    expect(container.querySelector('iframe[data-apercu-mail]')?.getAttribute('srcdoc')).toContain('Aperçu fictif');
    expect(container.querySelector('iframe[data-apercu-mail]')?.getAttribute('sandbox')).toBe('');
    expect([...container.querySelectorAll('[data-envoyer], [data-annuler-envoi]')].map((b) => b.textContent)).toEqual(['Annuler', 'Envoyer']);
  });

  it('PAS DE DOUBLON : la personne connectée déjà dans la liste n’apparaît qu’une fois', async () => {
    session = { email: 'laura@monga.io', nom: 'Laura' };
    await ouvrir();
    expect(lignes().map((l) => l[0])).toEqual(['gestion@criterimmo.fr', 'gestion.criterimmo@gmail.com', 'laura@monga.io']);
  });

  it('🔴 RIEN N’EST ENVOYÉ SANS « Envoyer » : ouvrir lit seulement ; « Annuler » ferme sans rien envoyer', async () => {
    await ouvrir();
    await clic(container.querySelector('[data-annuler-envoi]'));
    expect(container.querySelector('[data-fenetre-envoi]')).toBeNull();
    expect(appels.map((a) => a.methode)).toEqual(['GET']);
    expect(appels[0].url).toBe('/api/admin/location/nouvelle-location?bail=536');
  });

  it('AJOUTER, MODIFIER, SUPPRIMER une ligne pour CET envoi ; la configuration n’est pas touchée (aucun appel aux paramètres)', async () => {
    reponsesEnvoi = [{ etat: 'ok', data: { n: 4, envoi: { quand: '2026-10-21T12:32:00Z', par: 'Arnaud Jorel', destinataires: [], objet: 'o', mention: 'Envoyé le 21/10/2026 à 14:32 par Arnaud Jorel à …' } } }];
    await ouvrir();
    // Supprimer ADHOC, modifier le libellé de MONGA, ajouter une ligne.
    await clic(container.querySelector('[data-ligne-destinataire="2"] [data-retirer]'));
    await saisir(container.querySelector('[data-ligne-destinataire="2"] [data-libelle]') as HTMLInputElement, 'MONGA — Laura');
    await clic(container.querySelector('[data-ajouter-destinataire]'));
    const neuve = container.querySelector('[data-ligne-destinataire="3"]') as HTMLElement;
    await saisir(neuve.querySelector('[data-adresse]') as HTMLInputElement, 'pas-une-adresse');
    expect(neuve.textContent).toContain('Ce n’est pas une adresse e-mail valide.');
    expect((container.querySelector('[data-envoyer]') as HTMLButtonElement).disabled).toBe(true);
    await saisir(neuve.querySelector('[data-adresse]') as HTMLInputElement, 'GESTION@criterimmo.fr');
    expect(neuve.textContent).toContain('Cette adresse figure déjà dans la liste.');
    await saisir(neuve.querySelector('[data-adresse]') as HTMLInputElement, 'compta@exemple.test');
    await saisir(neuve.querySelector('[data-libelle]') as HTMLInputElement, 'Compta');
    expect((container.querySelector('[data-envoyer]') as HTMLButtonElement).disabled).toBe(false);
    await clic(container.querySelector('[data-envoyer]'));
    expect(posts()).toHaveLength(1);
    expect(posts()[0].url).toBe('/api/admin/location/nouvelle-location');
    expect(posts()[0].corps).toEqual({ bailId: 536, destinataires: [
      { adresse: 'a.jorel@sansvisavis.com', libelle: 'Vous (Arnaud Jorel) · copie personnelle' },
      { adresse: 'gestion@criterimmo.fr', libelle: 'Service gestion (copie de confirmation)' },
      { adresse: 'laura@monga.io', libelle: 'MONGA — Laura' },
      { adresse: 'compta@exemple.test', libelle: 'Compta' },
    ] });
    expect(appels.some((a) => a.url.includes('/parametres'))).toBe(false);
    expect(container.querySelector('[data-fenetre-envoi]')).toBeNull();
    expect(container.querySelector('[data-envoi-ok]')?.textContent).toBe('Mail envoyé à 4 destinataires.');
    expect(container.querySelector('[data-ouvrir-envoi]')?.textContent).toBe('Renvoyer à ADHOC & MONGA');
    expect(container.querySelector('[data-mention-envoi]')?.textContent).toBe('Envoyé le 21/10/2026 à 14:32 par Arnaud Jorel à …');
  });

  it('la copie personnelle se supprime aussi ; une liste vide ne s’envoie pas', async () => {
    await ouvrir();
    for (let i = 0; i < 4; i++) await clic(container.querySelector('[data-ligne-destinataire="0"] [data-retirer]'));
    expect(lignes()).toEqual([]);
    expect(container.textContent).toContain('Ajoutez au moins un destinataire.');
    expect((container.querySelector('[data-envoyer]') as HTMLButtonElement).disabled).toBe(true);
    expect(posts()).toEqual([]);
  });

  it('ÉCHEC puis « Réessayer » : « Envoi impossible » + la raison ; le second essai réussit', async () => {
    reponsesEnvoi = [{ etat: 'echec', motif: 'Le jeton de gestion@ n’a pas pu être rafraîchi.' },
      { etat: 'ok', data: { n: 4, envoi: { quand: '2026-10-21T12:40:00Z', par: 'Arnaud Jorel', destinataires: [], objet: 'o', mention: 'Envoyé le 21/10/2026 à 14:40 par Arnaud Jorel à …' } } }];
    await ouvrir();
    await clic(container.querySelector('[data-envoyer]'));
    expect(container.querySelector('[data-envoi-echec]')?.textContent).toBe('Envoi impossible : Le jeton de gestion@ n’a pas pu être rafraîchi.');
    expect(container.querySelector('[data-envoyer]')?.textContent).toBe('Réessayer');
    expect(container.querySelector('[data-fenetre-envoi]')).not.toBeNull();
    await clic(container.querySelector('[data-envoyer]'));
    expect(posts()).toHaveLength(2);
    expect(posts()[1].corps).toEqual(posts()[0].corps);
    expect(container.querySelector('[data-envoi-ok]')?.textContent).toBe('Mail envoyé à 4 destinataires.');
  });

  it('sans la migration 395 : l’aperçu se lit, « Envoyer » reste inactif et la fenêtre le dit', async () => {
    const avant = global.fetch;
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const r = await (avant as (u: unknown, i?: RequestInit) => Promise<Response>)(url, init);
      const d = await r.json() as { data: Record<string, unknown> };
      return json({ ...d, data: { ...d.data, envoiPossible: false } });
    }) as unknown as typeof fetch;
    await ouvrir();
    expect(container.querySelector('[data-envoi-sans-migration]')?.textContent).toContain('migration 395');
    expect((container.querySelector('[data-envoyer]') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('🔴 Arno (21/10/2026) — le message d’accompagnement', () => {
  const D = { bailId: 536, entree: '2026-11-01', bien: { voie: '4 rue Fictive', codePostal: '92800', commune: 'Puteaux' },
    statut: { sorte: 'nouveau', pastille: ['NOUVEAU', 'PROPRIÉTAIRE'], objet: 'NOUVEAU PROPRIÉTAIRE', phrase: 'Premier bien', mandat: null },
    proprietaires: [], lots: [], gli: { etat: 'inconnue', titre: 'ASSURANCE LOYERS IMPAYÉS NON RENSEIGNÉE', detail: null }, locataires: [], garants: [],
    bail: { loyer: null, lignes: [] }, driveUrl: null, expediteur: 'gestion@criterimmo.fr' };
  it('au-dessus des destinataires ; l’aperçu le montre en direct ; envoyé avec les destinataires ; vide : rien n’est envoyé de plus', async () => {
    const avant = global.fetch;
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') {
        const r = await (avant as (u: unknown, i?: RequestInit) => Promise<Response>)(url, init);
        const d = await r.json() as { data: Record<string, unknown> };
        return json({ ...d, data: { ...d.data, donnees: D, auteurNom: 'Arnaud Jorel' } });
      }
      return (avant as (u: unknown, i?: RequestInit) => Promise<Response>)(url, init);
    }) as unknown as typeof fetch;
    reponsesEnvoi = [{ etat: 'ok', data: { n: 4, envoi: { quand: '2026-10-21T12:32:00Z', par: 'Arnaud Jorel', destinataires: [], objet: 'o', mention: 'Envoyé' } } }];
    await ouvrir();
    const zone = container.querySelector('textarea[data-message]') as HTMLTextAreaElement;
    expect(zone).not.toBeNull();
    expect(container.querySelector('[data-message-accompagnement]')?.textContent).toContain('Message d’accompagnement (facultatif)');
    expect(zone.compareDocumentPosition(container.querySelector('[data-destinataires]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(zone.hasAttribute('maxlength')).toBe(false);
    const texte = 'Bonjour,\nle bail démarre le 1er.\n<b>merci</b>';
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(zone, texte); zone.dispatchEvent(new Event('input', { bubbles: true })); });
    const apercu = container.querySelector('iframe[data-apercu-mail]')?.getAttribute('srcdoc') ?? '';
    expect(apercu).toContain('Message de Arnaud Jorel');
    expect(apercu).toContain('Bonjour,<br>le bail démarre le 1er.<br>&lt;b&gt;merci&lt;/b&gt;');
    await clic(container.querySelector('[data-envoyer]'));
    expect(posts()[0].corps).toMatchObject({ bailId: 536, message: texte });
  });
});

describe('la fiche locataire : un bouton par bail EN COURS, « Renvoyer » et la mention après un envoi', () => {
  it('deux baux en cours : deux boutons ; celui déjà envoyé dit « Renvoyer à ADHOC & MONGA » et « Envoyé le … »', async () => {
    await act(async () => { root.render(createElement(BlocEnvoiFicheLocataire, { locataireId: 524 })); });
    await calmer();
    expect(appels[0].url).toBe('/api/admin/location/nouvelle-location?locataire=524');
    const blocs = [...container.querySelectorAll('[data-bail-en-cours]')];
    expect(blocs.map((b) => b.querySelector('[data-ouvrir-envoi]')?.textContent)).toEqual(['Envoi ADHOC & MONGA', 'Renvoyer à ADHOC & MONGA']);
    expect(blocs[1].querySelector('[data-mention-envoi]')?.textContent).toBe('Envoyé le 20/10/2026 à 10:00 par Arnaud Jorel à laura@monga.io');
    expect(posts()).toEqual([]);
  });
});
