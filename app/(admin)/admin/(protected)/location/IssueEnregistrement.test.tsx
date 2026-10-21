// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CreationBien } from './CreationBien';
import { CreationLocataire } from './CreationLocataire';

/**
 * 🔴 Arno (21/10/2026) — PLUS AUCUN ÉCHEC SILENCIEUX (« Enregistrer le bien » semblait ne rien faire en production) :
 *   · pendant l'enregistrement : « Enregistrement… », double clic sans effet ;
 *   · SUCCÈS : modale « ✓ Bien enregistré » (résumé, « Voir la fiche du bien », « Créer un autre bien », « Fermer ») ; le bien
 *     n'est jamais recréé ; « Nouveau locataire » : « ✓ Locataire enregistré et rattaché à … » ;
 *   · ÉCHEC : modale ROUGE — quoi, pourquoi (droit, champ, technique), quoi faire ; la saisie reste ;
 *   · le récapitulatif « Confirmer » ne se quitte pas par erreur.
 * Les vrais composants, routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
/** La réponse du serveur à la création (simulée). */
let reponseCreation: () => Promise<Response>;
let balises: string[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; balises = [];
  reponseCreation = async () => ok({ logementId: 9 });
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: (_u: string, b: Blob) => { void b.text().then((t) => balises.push(t)); return true; } });
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push(corps);
      return reponseCreation();
    }
    if (String(url).includes('cartesProprietaires=')) return ok([{ id: 1, nom: 'CHALAH Ramdane', telephone: null, email: null, biens: [] }]);
    return ok(null);
  }) as unknown as typeof fetch;
  Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true });
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const modale = () => document.querySelector('[data-modale-issue]') as HTMLElement | null;
const texte = (sel: string) => modale()?.querySelector(sel)?.textContent ?? null;
const bouton = () => container.querySelector('[data-collant] button[type="submit"]') as HTMLButtonElement;
const soumettre = async () => { await act(async () => { bouton().click(); }); await calmer(); };
const rendreBien = async () => { await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [1] })); }); await calmer(); };
const parkingComplet = async () => {
  await clic(container.querySelector('[data-famille="parking"]')!);
  await clic(container.querySelectorAll('[aria-label="Type de parking"] button')[0]);
  await saisir(container.querySelector('.cab-enveloppe input') as HTMLInputElement, '27 rue Royer Bendélé');
  await clic([...container.querySelectorAll('[data-question-gestion="bien"] button')].find((b) => b.textContent?.replace('✓ ', '') === 'En gestion')!);
};

describe('🔴 « Nouveau bien » — jamais de silence', () => {
  it('champs manquants : modale ROUGE « Il manque des informations » (quoi, pourquoi, quoi faire) ; rien n’est envoyé ; journal par balise', async () => {
    await rendreBien();
    await soumettre();
    expect(modale()?.getAttribute('data-modale-issue')).toBe('erreur');
    expect(modale()?.getAttribute('role')).toBe('alertdialog');
    expect(texte('h2')).toBe('✕ Il manque des informations');
    expect(texte('[data-echec-quoi]')).toBe('Le bien n’a pas été enregistré.');
    expect(texte('[data-echec-pourquoi]')).toMatch(/^Il manque : .*adresse/i);
    expect(texte('[data-echec-faire]')).toMatch(/signalé en rouge sous chaque champ/);
    expect(texte('[data-echec-conserve]')).toBe('Rien n’a été enregistré. Votre saisie est conservée : vous pouvez réessayer.');
    expect(posts).toEqual([]);
    await calmer();
    expect(JSON.parse(balises[0])).toMatchObject({ action: 'journal-echec', ecran: 'nouveau-bien', pour: 'creer-bien', cause: 'champs' });
    await clic(modale()!.querySelector('[data-fermer-issue]')!);
    expect(modale()).toBeNull();
  });

  it('droit manquant (403 ACCES_REVOQUE du serveur) : la modale dit le DROIT et quoi faire ; la saisie reste ; on peut réessayer', async () => {
    reponseCreation = async () => ({ ok: false, status: 403, json: async () => ({ erreur: 'ACCES_REVOQUE' }) }) as unknown as Response;
    await rendreBien();
    await parkingComplet();
    await soumettre();
    expect(posts).toHaveLength(1);
    expect(texte('h2')).toBe('✕ Enregistrement impossible');
    expect(texte('[data-echec-pourquoi]')).toBe('Votre compte n’a pas le droit « Location », ou votre session a expiré.');
    expect(texte('[data-echec-faire]')).toMatch(/demandez à un administrateur d’activer le droit « Location »/);
    // La barre du bas dit le refus en ROUGE (plus du gris discret), et la saisie est toujours là.
    expect(container.querySelector('[data-collant] .loc-manques')?.className).toContain('loc-manques--refus');
    expect((container.querySelector('.cab-enveloppe input') as HTMLInputElement).value).toBe('27 rue Royer Bendélé');
    await clic(modale()!.querySelector('[data-fermer-issue]')!);
    expect(bouton().disabled).toBe(false);
    reponseCreation = async () => ok({ logementId: 9 });
    await soumettre();
    expect(posts).toHaveLength(2);
    expect(modale()?.getAttribute('data-modale-issue')).toBe('succes');
  });

  it('refus du serveur (motif) et serveur injoignable : la modale dit pourquoi', async () => {
    reponseCreation = async () => ({ ok: false, status: 400, json: async () => ({ etat: 'refus', motif: 'Ce syndic n’est pas (ou plus) un syndic connu de la Gestion.' }) }) as unknown as Response;
    await rendreBien();
    await parkingComplet();
    await soumettre();
    expect(texte('[data-echec-pourquoi]')).toBe('Ce syndic n’est pas (ou plus) un syndic connu de la Gestion.');
    await clic(modale()!.querySelector('[data-fermer-issue]')!);
    reponseCreation = async () => { throw new TypeError('Failed to fetch'); };
    await soumettre();
    expect(texte('[data-echec-pourquoi]')).toMatch(/^Le serveur n’a pas répondu ou a rencontré une erreur technique\./);
    expect(texte('[data-echec-faire]')).toMatch(/Vérifiez votre connexion et réessayez/);
  });

  it('pendant l’enregistrement : « Enregistrement… », DOUBLE CLIC sans effet (un seul envoi)', async () => {
    let liberer: (r: Response) => void = () => {};
    reponseCreation = () => new Promise<Response>((r) => { liberer = r; });
    await rendreBien();
    await parkingComplet();
    await act(async () => { bouton().click(); bouton().click(); });
    await act(async () => { bouton().click(); });
    expect(bouton().textContent).toBe('Enregistrement…');
    expect(bouton().disabled).toBe(true);
    expect(posts).toHaveLength(1);
    await act(async () => { liberer(ok({ logementId: 9 })); });
    await calmer();
    expect(posts).toHaveLength(1);
  });

  it('SUCCÈS : modale « ✓ Bien enregistré », résumé (propriétaire, adresse), « Voir la fiche du bien » / « Créer un autre bien » / « Fermer » ; jamais recréé', async () => {
    await rendreBien();
    await parkingComplet();
    await soumettre();
    expect(modale()?.getAttribute('data-modale-issue')).toBe('succes');
    expect(texte('h2')).toBe('✓ Bien enregistré');
    expect([...modale()!.querySelectorAll('[data-resume] dt')].map((d) => d.textContent)).toEqual(['Propriétaire', 'Adresse', 'Bien']);
    expect(texte('[data-resume] div:nth-child(1) dd')).toBe('CHALAH Ramdane');
    expect(texte('[data-resume] div:nth-child(2) dd')).toBe('27 rue Royer Bendélé');
    expect(modale()!.querySelector('[data-voir-fiche-bien]')?.getAttribute('href')).toBe('/admin/location/bien/9');
    expect(modale()!.querySelector('[data-creer-autre]')?.getAttribute('href')).toBe('/admin/location/nouveau-bien');
    expect(window.location.href).toBe('');
    await clic(modale()!.querySelector('[data-fermer-issue]')!);
    expect(container.querySelector('[data-bien-enregistre] a')?.getAttribute('href')).toBe('/admin/location/bien/9');
    expect(bouton().textContent).toBe('✓ Bien enregistré');
    await soumettre();
    expect(posts).toHaveLength(1);
  });
});

describe('🔴 « Nouveau locataire » — succès, échec, récapitulatif', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = decodeURIComponent(String(url));
      if (init?.method === 'POST') {
        const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
        posts.push(corps);
        if (corps.action === 'apercu-lots') return ok({ recap: ['Le logement est loué.'] });
        return reponseCreation();
      }
      if (u.includes('schemaConditionsEntree')) return ok({ conditions: false, loyer: false, manquantes: ['391', '392', '370'] });
      if (u.includes('biensPourLocataire=')) return ok([{ id: 7, titre: '27 rue Royer Bendélé, Gennevilliers', detail: 'Appartement', loue: false }]);
      if (u.includes('lotsBail=7')) return ok({ lots: [{ id: 7, role: 'logement', libelle: 'logement', type: null, etage: null, numeroLot: null, porte: null, place: false, occupants: [], noms: [] }], sorte: 'simple', origineLibelle: '' });
      if (u.includes('lot=7')) return ok({ bien: { id: 7, categorie: 'parking' }, complements: {} });
      return ok([]);
    }) as unknown as typeof fetch;
    reponseCreation = async () => ok({ locataireIds: [50], reintegrations: [], bailId: 536 });
  });
  const preparer = async () => {
    await act(async () => { root.render(createElement(CreationLocataire)); });
    await calmer();
    const form = container.querySelector('[data-sorte="client"] .cp-form') as HTMLElement;
    const nom = [...form.querySelectorAll('label.cp-champ')].find((l) => l.querySelector('.cp-champ-mot')?.textContent === 'Nom')?.querySelector('input') as HTMLInputElement;
    await saisir(nom, 'FICTIF');
    const v = form.querySelectorAll('.cp-saisie--valeur');
    await saisir(v[0] as HTMLInputElement, '06 12 34 56 78');
    await saisir(v[1] as HTMLInputElement, 'fictif@exemple.test');
    await clic(form.querySelector('button[type="submit"]')!);
    await saisir(container.querySelector('input[data-recherche-bien]') as HTMLInputElement, 'Royer');
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    await calmer();
    await clic(container.querySelector('.loc-choix button')!);
    await calmer();
    await saisir(container.querySelector('input[data-date-entree]') as HTMLInputElement, '2026-11-01');
    await calmer();
  };
  const enregistrer = () => container.querySelector('[data-enregistrer-locataire]') as HTMLButtonElement;

  it('SUCCÈS : « ✓ Locataire enregistré et rattaché à … », résumé (locataire, bien, date d’entrée), fiche / ADHOC & MONGA / un autre / fermer', async () => {
    await preparer();
    await act(async () => { enregistrer().click(); }); await calmer();
    await act(async () => { enregistrer().click(); }); await calmer();
    expect(posts.map((p) => p.action)).toEqual(['apercu-lots', 'creer-locataires']);
    expect(texte('h2')).toBe('✓ Locataire enregistré et rattaché à 27 rue Royer Bendélé, Gennevilliers');
    expect([...modale()!.querySelectorAll('[data-resume] dd')].map((d) => d.textContent)).toEqual(['FICTIF', '27 rue Royer Bendélé, Gennevilliers', '01/11/2026']);
    expect(modale()!.querySelector('[data-voir-fiche-locataire]')?.getAttribute('href')).toBe('/admin/location/locataire/50');
    expect(modale()!.querySelector('[data-creer-autre]')?.getAttribute('href')).toBe('/admin/location/nouveau-locataire');
    expect(modale()!.querySelector('[data-envoi-depuis-issue]')).not.toBeNull();
    expect(window.location.href).toBe('');
  });

  it('🔴 Arno (21/10/2026) — un RATTACHEMENT AUTOMATIQUE (annexe louée au même locataire) est signalé dans la modale de succès', async () => {
    reponseCreation = async () => ok({ locataireIds: [50], reintegrations: ['Rattachement automatique : la cave n°56 revient sous 25 Rue Henri Barbusse — même locataire.'], bailId: 536 });
    await preparer();
    await act(async () => { enregistrer().click(); }); await calmer();
    await act(async () => { enregistrer().click(); }); await calmer();
    expect([...modale()!.querySelectorAll('[data-note]')].map((n) => n.textContent)).toEqual(['Rattachement automatique : la cave n°56 revient sous 25 Rue Henri Barbusse — même locataire.']);
  });

  it('« Envoi ADHOC & MONGA » depuis la modale : ferme la modale et ouvre la fenêtre d’envoi du bail créé', async () => {
    await preparer();
    await act(async () => { enregistrer().click(); }); await calmer();
    await act(async () => { enregistrer().click(); }); await calmer();
    await clic(modale()!.querySelector('[data-envoi-depuis-issue]')!);
    await calmer();
    expect(document.querySelector('[data-modale-issue]')).toBeNull();
    expect(document.querySelector('[data-fenetre-envoi]')).not.toBeNull();
    expect((global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => String(c[0]).includes('nouvelle-location?bail=536'))).toBe(true);
  });

  it('ÉCHEC de la création : modale rouge, la saisie reste (le bien, la date)', async () => {
    reponseCreation = async () => ({ ok: false, status: 403, json: async () => ({ erreur: 'ACCES_REVOQUE' }) }) as unknown as Response;
    await preparer();
    await act(async () => { enregistrer().click(); }); await calmer();
    await act(async () => { enregistrer().click(); }); await calmer();
    expect(texte('[data-echec-quoi]')).toBe('Le locataire n’a pas été enregistré.');
    expect(texte('[data-echec-pourquoi]')).toBe('Votre compte n’a pas le droit « Location », ou votre session a expiré.');
    expect((container.querySelector('input[data-date-entree]') as HTMLInputElement).value).toBe('2026-11-01');
  });

  it('le RÉCAPITULATIF ne se quitte pas par erreur : « Annuler » demande confirmation (« Rester » / « Quitter sans enregistrer »)', async () => {
    await preparer();
    await act(async () => { enregistrer().click(); }); await calmer();
    expect(container.querySelector('[data-recap-lots]')).not.toBeNull();
    const annuler = container.querySelector('[data-annuler-locataire]') as HTMLAnchorElement;
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    await act(async () => { annuler.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(true);
    expect(modale()?.getAttribute('data-modale-issue')).toBe('attention');
    expect(texte('h2')).toBe('⚠ Quitter sans confirmer ?');
    expect(modale()!.querySelector('[data-quitter-sans-enregistrer]')?.getAttribute('href')).toBe('/admin/location/locataires');
    await clic(modale()!.querySelector('[data-rester]')!);
    expect(modale()).toBeNull();
    expect(container.querySelector('[data-recap-lots]')).not.toBeNull();
    // Avant le récapitulatif, « Annuler » reste un lien ordinaire.
    act(() => { root.unmount(); }); root = createRoot(container);
    await preparer();
    const ev2 = new MouseEvent('click', { bubbles: true, cancelable: true });
    await act(async () => { (container.querySelector('[data-annuler-locataire]') as HTMLAnchorElement).dispatchEvent(ev2); });
    expect(ev2.defaultPrevented).toBe(false);
  });
});
