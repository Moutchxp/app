// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CreationProprietaires } from './CreationProprietaires';
import { CreationBien } from './CreationBien';
import { CreationLocataire } from './CreationLocataire';

/**
 * 🔴 TUILE LOCATION — « Créer un nouveau propriétaire » et « Ajouter un nouveau bien » (Arno, 17/10/2026).
 * Les VRAIS composants, routes simulées : rien ne part, rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return ok({ ids: [1, 2], logementId: 9 }); }
    if (u.includes('proprietairesIds=')) return ok([{ id: 1, titre: 'DUPONT Paul', detail: null }, { id: 2, titre: 'DUPONT Anne', detail: null }]);
    if (u.includes('proprietairesRecherche=')) return ok([{ id: 3, titre: 'MARTIN Léa', detail: '3 rue du Port, PARIS' }]);
    if (u.includes('syndics=1')) return ok([{ id: 5, nom: 'FONCIA', ville: 'Paris' }]);
    if (u.includes('syndicPourAdresse=')) return ok([{ id: 5, nom: 'FONCIA', ville: 'Paris', motif: 'un autre bien du portefeuille à cette adresse' }]);
    if (u.includes('syndic=5')) return ok({ id: 5, nom: 'FONCIA', contacts: [{ id: 51, civilite: 'Mme', prenom: 'Léa', nom: 'GESTION', titre: 'Gestionnaire', coordonnees: [{ id: 1, sorte: 'email', libelle: null, valeur: 'lea@foncia.test' }] }], coproprietes: [] });
    return ok([]);
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const bouton = (texte: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(texte)) as HTMLButtonElement;

describe('🔴 Créer un nouveau propriétaire', () => {
  const remplir = async (form: Element, nom: string, coord: { tel?: string; email?: string }) => {
    await act(async () => {
      const set = (el: HTMLInputElement, v: string) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      const nomInput = [...form.querySelectorAll('label.cp-champ')].find((l) => l.querySelector('.cp-champ-mot')?.textContent === 'Nom')?.querySelector('input') as HTMLInputElement;
      set(nomInput, nom);
      const v = form.querySelectorAll('.cp-saisie--valeur');
      if (coord.tel !== undefined) set(v[0] as HTMLInputElement, coord.tel);
      if (coord.email !== undefined) set(v[1] as HTMLInputElement, coord.email);
    });
  };

  it('« + Ajouter… » propose, comme la Gestion : Propriétaire (client) / Contact du propriétaire / Annuler ; étiquettes et Qualité mise en avant', async () => {
    await act(async () => { root.render(createElement(CreationProprietaires)); });
    expect(container.querySelectorAll('.cp-form')).toHaveLength(1);
    expect([...container.querySelectorAll('[data-badge]')].map((x) => x.getAttribute('data-badge'))).toEqual(['client']);
    await act(async () => { bouton('+ Ajouter…').click(); });
    expect([...container.querySelectorAll('[data-choix] button')].map((x) => x.textContent)).toEqual(['Propriétaire (client)', 'Contact du propriétaire', 'Annuler']);
    expect(container.querySelector('[data-choix] .cp-choix-btn--premier')?.textContent).toBe('Propriétaire (client)');
    await act(async () => { bouton('Contact du propriétaire').click(); });
    expect([...container.querySelectorAll('[data-badge]')].map((x) => x.textContent)).toEqual(['Propriétaire', 'Contact du propriétaire']);
    const contact = container.querySelector('[data-sorte="contact"] .cp-form') as HTMLElement;
    expect(contact.querySelector('.cp-form-titre')?.textContent).toBe('Nouveau contact du propriétaire');
    // « Qualité » juste sous le nom, avec les exemples d'Arno.
    const mots = [...contact.querySelectorAll('.cp-champ-mot')].map((m) => m.textContent?.trim());
    expect(mots.slice(1, 3)).toEqual(['Nom', 'Qualité']);
    expect((contact.querySelector('.cp-champ--en-avant input') as HTMLInputElement).placeholder).toBe('conjoint, gestionnaire, notaire, gardien…');
    // Aucune question « en gestion » ni mandat sur la carte contact : ils sont propres à la page (propriétaires).
    expect(contact.textContent).not.toMatch(/en gestion|mandat/i);
  });

  it('obligatoires ALLÉGÉS d’une carte client : le nom et un téléphone suffisent (civilité, prénom, adresse facultatifs)', async () => {
    await act(async () => { root.render(createElement(CreationProprietaires)); });
    const form = container.querySelector('.cp-form') as HTMLElement;
    const enregistrer = () => form.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(enregistrer().disabled).toBe(true);
    await remplir(form, 'Dupont', { tel: '06 12 34 56 78' });
    expect(enregistrer().disabled).toBe(false);
  });

  it('un contact SEUL ne suffit pas : au moins une carte « Propriétaire (client) »', async () => {
    await act(async () => { root.render(createElement(CreationProprietaires)); });
    await act(async () => { bouton('+ Ajouter…').click(); });
    await act(async () => { bouton('Contact du propriétaire').click(); });
    const contact = container.querySelector('[data-sorte="contact"] .cp-form') as HTMLElement;
    await remplir(contact, 'Martin', { email: 'martin@exemple.test' });
    await act(async () => { (contact.querySelector('button[type="submit"]') as HTMLButtonElement).click(); });
    // La carte client vide est annulée : il ne reste que le contact (validé).
    await act(async () => { [...(container.querySelector('[data-sorte="client"] .cp-form') as HTMLElement).querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Annuler')!.click(); });
    expect(container.querySelectorAll('[data-recap="contact"]')).toHaveLength(1);
    await act(async () => { bouton('Non').click(); });
    await act(async () => { bouton('Ajouter un bien à ce nouveau propriétaire').click(); });
    expect(container.textContent).toContain('Un contact n’est pas un client : ajoutez au moins une carte « Propriétaire (client) ».');
    expect(posts).toEqual([]);
  });

  it('« Propriétaire(s) en gestion ? » : rien sans réponse ; Oui → mandat puis bouton ; Non → bouton direct, mandat vidé', async () => {
    await act(async () => { root.render(createElement(CreationProprietaires)); });
    const mandat = () => container.querySelector('[data-mandat] input') as HTMLInputElement | null;
    const gros = () => container.querySelector('[data-continuer]');
    // Pas de choix : ni mandat, ni gros bouton.
    expect(container.querySelector('[data-question-gestion]')).not.toBeNull();
    expect(mandat()).toBeNull();
    expect(gros()).toBeNull();
    // Oui : le champ mandat ; le gros bouton seulement une fois le mandat rempli.
    await act(async () => { bouton('Oui').click(); });
    expect(bouton('✓ Oui').getAttribute('aria-pressed')).toBe('true');
    expect(mandat()).not.toBeNull();
    expect(gros()).toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(mandat(), 'MG 2026-041');
      mandat()!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(gros()).not.toBeNull();
    expect(gros()?.className).toContain('loc-gros-bouton--centre');
    // Non : plus de champ mandat, le gros bouton tout de suite ; repasser à Oui montre un mandat VIDÉ.
    await act(async () => { bouton('Non').click(); });
    expect(mandat()).toBeNull();
    expect(gros()).not.toBeNull();
    await act(async () => { bouton('Oui').click(); });
    expect(mandat()?.value).toBe('');
    expect(gros()).toBeNull();
    await act(async () => { bouton('Non').click(); });
    // Le gros bouton refuse tant qu'aucune carte n'est enregistrée, et le dit — rien n'est envoyé.
    await act(async () => { bouton('Ajouter un bien à ce nouveau propriétaire').click(); });
    expect(container.textContent).toContain('Remplissez et enregistrez au moins une carte');
    expect(posts).toEqual([]);
  });
});

describe('🔴 Ajouter un nouveau bien', () => {
  it('les propriétaires arrivés de la création sont déjà là ; 7 sections en entonnoir ; bouton collant', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [1, 2] })); });
    await calmer();
    expect([...container.querySelectorAll('[data-proprietaires] .loc-puce')].map((x) => x.textContent?.replace('✕', '').trim())).toEqual(['DUPONT Paul', 'DUPONT Anne']);
    expect([...container.querySelectorAll('.loc-section > h3')].map((h) => h.textContent?.replace(/^\d/, '').replace('*', '').trim()))
      .toEqual(['Propriétaire(s)', 'Le bien', 'Adresse et situation', 'Copropriété', 'Annexes', 'Caractéristiques complémentaires', 'Commentaires']);
    expect(container.querySelector('[data-collant] button[type="submit"]')?.textContent).toBe('Enregistrer le bien');
    // Syndic : libellé, loupe et « + » (désactivés tant que l'adresse n'est pas saisie).
    expect(container.querySelector('[data-syndic] .loc-syndic-mot')?.textContent).toBe('Syndic');
    expect((container.querySelector('[data-loupe]') as HTMLButtonElement).disabled).toBe(true);
    expect((container.querySelector('[data-creer-syndic]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('obligatoires : sans adresse ni type, « Enregistrer le bien » dit ce qui manque et n’envoie rien', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [] })); });
    await calmer();
    await act(async () => { (container.querySelector('[data-collant] button[type="submit"]') as HTMLButtonElement).click(); });
    expect(container.textContent).toContain('Choisissez au moins un propriétaire.');
    expect(container.textContent).toContain('L’adresse du bien est obligatoire.');
    expect(container.textContent).toContain('Choisissez la famille du bien : Logement, Local ou Parking nu.');
    expect(posts).toEqual([]);
  });

  const famille = async (f: string) => { await act(async () => { (container.querySelector(`[data-famille="${f}"]`) as HTMLButtonElement).click(); }); };
  const titres = () => [...container.querySelectorAll('.loc-section > h3')].map((h) => h.textContent?.replace(/^\d/, '').replace('*', '').trim());
  const soumettre = async () => { await act(async () => { (container.querySelector('[data-collant] button[type="submit"]') as HTMLButtonElement).click(); }); };

  it('FAMILLE : rien du bloc « Le bien » tant qu’aucune n’est choisie ; chaque famille montre ses champs', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [] })); });
    const bloc = () => container.querySelector('[data-bloc-bien]') as HTMLElement;
    expect([...bloc().querySelectorAll('[data-famille]')].map((x) => x.textContent)).toEqual(['Logement', 'Local', 'Parking nu']);
    expect(bloc().querySelector('.loc-gros-boutons--3d')).not.toBeNull();
    expect(bloc().querySelector('input')).toBeNull();
    // Logement : type, meublé, pièces et surfaces (aide SOUS le champ extérieur).
    await famille('logement');
    expect(bloc().textContent).toContain('Type de logement');
    expect(bloc().textContent).toContain('Meublé ?');
    expect(bloc().textContent).toContain('Nombre de pièces');
    expect(bloc().querySelector('.loc-aide')?.textContent).toBe('balcon, terrasse, jardin');
    // Un local : Local commercial / Bureaux, pièces facultatives renommées ; ni meublé ni type de logement.
    await famille('local');
    expect(bloc().textContent).toContain('Local commercial');
    expect(bloc().textContent).toContain('Nombre de bureaux / pièces');
    expect(bloc().textContent).not.toContain('Meublé ?');
    expect(bloc().textContent).not.toContain('Type de logement');
    // Parking nu : Intérieur / Extérieur, les 4 types ; ni pièces, ni meublé, ni Carrez ; ni Annexes, ni complémentaires.
    await famille('parking');
    expect(bloc().textContent).toContain('Intérieur');
    expect([...bloc().querySelectorAll('[aria-label="Type de parking"] button')].map((x) => x.textContent)).toEqual(['Place simple', 'Place double', 'Box simple', 'Box double']);
    expect(bloc().textContent).not.toMatch(/Nombre de pièces|Meublé|Carrez/);
    expect(titres()).toEqual(['Propriétaire(s)', 'Le bien', 'Adresse et situation', 'Copropriété', 'Commentaires']);
    // « N° de porte » devient « N° de place » dans la situation d'un parking nu.
    expect([...container.querySelectorAll('[data-ligne-situation] .loc-champ')].map((l) => l.firstChild?.textContent)).toContain('N° de place');
    expect([...container.querySelectorAll('.loc-num')].map((x) => x.textContent)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('obligatoires PAR FAMILLE : type de local, type de parking', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [] })); });
    await famille('local'); await soumettre();
    expect(container.textContent).toContain('Choisissez : Local commercial ou Bureaux.');
    await famille('parking'); await soumettre();
    expect(container.textContent).toContain('Choisissez : Place simple, Place double, Box simple ou Box double.');
    expect(posts).toEqual([]);
  });

  it('ACCÈS : le « Code » à droite des boutons du digicode — 8 caractères au plus, actif sur Oui, vidé sur Non ; « Précision »', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [] })); });
    expect(container.querySelector('[aria-label="Ascenseur"]')).not.toBeNull();
    const code = () => container.querySelector('[data-digicode] input') as HTMLInputElement;
    expect(code().placeholder).toBe('57B83');
    expect(code().maxLength).toBe(8);
    expect(code().disabled).toBe(true);
    const digi = (mot: string) => [...container.querySelectorAll('[aria-label="Digicode"] button')].find((x) => x.textContent?.replace('✓ ', '') === mot) as HTMLButtonElement;
    await act(async () => { digi('Oui').click(); });
    expect(code().disabled).toBe(false);
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(code(), '57B83XYZ99'); code().dispatchEvent(new Event('input', { bubbles: true })); });
    expect(code().value).toBe('57B83XYZ');
    await act(async () => { digi('Non').click(); });
    expect(code().value).toBe('');
    expect(code().disabled).toBe(true);
    const precision = container.querySelector('[data-precision] input') as HTMLInputElement;
    expect(precision.placeholder).toBe('À droite en sortant de l’ascenseur, deuxième porte à gauche');
  });

  it('SYNDIC : « déjà connu pour cette adresse » proposé, rattaché au CLIC ; ses contacts ; « + Ajouter un contact »', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [] })); });
    const adr = container.querySelector('.cab-enveloppe input') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(adr, '14 rue des Lilas'); adr.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { vi.advanceTimersByTime(700); });
    await calmer();
    vi.useRealTimers();
    expect(container.querySelector('[data-suggestions-syndic]')?.textContent).toContain('Syndic déjà connu pour cette adresse : FONCIA');
    // Rien n'est rattaché sans clic.
    expect(container.querySelector('[data-syndic-choisi]')).toBeNull();
    await act(async () => { bouton('Rattacher').click(); });
    await calmer();
    expect(container.querySelector('[data-syndic-choisi]')?.textContent).toContain('FONCIA');
    expect(container.querySelector('[data-syndic-choisi]')?.textContent).toContain('Mme Léa GESTION');
    expect((container.querySelector('[data-loupe]') as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { bouton('+ Ajouter un contact').click(); });
    expect(container.querySelector('[data-ajout-contact-syndic]')).not.toBeNull();
    await act(async () => { bouton('Ajouter ce contact').click(); });
    expect(container.textContent).toContain('Le nom du contact est obligatoire.');
  });

  it('ANNEXES : un parking a les options du parking nu ; « Autre adresse » fait apparaître une adresse', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [] })); });
    await famille('logement');
    await act(async () => { bouton('+ Parking').click(); });
    const annexe = () => container.querySelector('[data-annexes] > li.loc-enfant') as HTMLElement;
    expect([...annexe().querySelectorAll('[aria-label="Type de parking"] button')].map((x) => x.textContent)).toEqual(['Place simple', 'Place double', 'Box simple', 'Box double']);
    expect(annexe().querySelector('[aria-label="Adresse de l’annexe"] button[aria-pressed="true"]')?.textContent).toBe('Même adresse');
    expect(annexe().querySelector('[data-autre-adresse]')).toBeNull();
    await act(async () => { [...annexe().querySelectorAll('button')].find((x) => x.textContent === 'Autre adresse')!.click(); });
    expect(annexe().querySelector('[data-autre-adresse]')).not.toBeNull();
    await soumettre();
    expect(container.textContent).toContain('Annexe 1 : l’autre adresse est à renseigner.');
  });

  it('« + Cave » / « + Parking » : les annexes s’affichent SOUS le logement', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [] })); });
    await famille('logement');
    await act(async () => { bouton('+ Cave').click(); });
    await act(async () => { bouton('+ Parking').click(); });
    expect([...container.querySelectorAll('[data-annexes] > li')].map((li) => li.className)).toEqual(['loc-racine', 'loc-enfant', 'loc-enfant']);
    expect(container.textContent).toContain('N° de place');
  });
});

describe('🔴 Nouveau locataire : clients et contacts', () => {
  it('« + Ajouter… » : Locataire (client) / Contact du locataire ; un contact seul est refusé', async () => {
    await act(async () => { root.render(createElement(CreationLocataire)); });
    await act(async () => { bouton('+ Ajouter…').click(); });
    expect([...container.querySelectorAll('[data-choix] button')].map((x) => x.textContent)).toEqual(['Locataire (client)', 'Contact du locataire', 'Annuler']);
    await act(async () => { bouton('Contact du locataire').click(); });
    expect((container.querySelector('[data-sorte="contact"] .cp-champ--en-avant input') as HTMLInputElement).placeholder).toBe('garant, conjoint, employeur…');
    expect(container.querySelector('[data-sorte="client"] [data-badge]')?.className).toContain('cp-role--en_place');
    await act(async () => { (container.querySelector('[data-collant] button[type="submit"]') as HTMLButtonElement).click(); });
    expect(container.textContent).toContain('Remplissez et enregistrez au moins une carte « Locataire (client) »');
    expect(posts).toEqual([]);
  });
});
