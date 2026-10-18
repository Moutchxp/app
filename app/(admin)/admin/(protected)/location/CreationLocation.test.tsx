// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
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
    if (u.includes('cartesProprietaires=')) return ok([{ id: 1, nom: 'DUPONT Paul', telephone: null, email: null, biens: [] }, { id: 2, nom: 'DUPONT Anne', telephone: null, email: null, biens: [] }]);
    if (u.includes('proprietairesRecherche=')) return ok([{ id: 3, titre: 'MARTIN Léa', detail: '3 rue du Port, PARIS' }]);
    if (u.includes('agPourAdresse=')) return ok(decodeURIComponent(u).includes('15 rue Carle Hebert') ? '2026-03-12' : null);
    if (u.includes('syndics=1')) return ok([{ id: 5, nom: 'FONCIA', ville: 'Paris' }]);
    if (u.includes('syndicPourAdresse=')) return ok([{ id: 5, nom: 'FONCIA', ville: 'Paris', motif: 'un autre bien du portefeuille à cette adresse' }]);
    if (u.includes('syndic=5')) return ok({ id: 5, nom: 'FONCIA', contacts: [{ id: 51, civilite: 'Mme', prenom: 'Léa', nom: 'GESTION', titre: 'Gestionnaire', coordonnees: [{ id: 1, sorte: 'email', libelle: null, valeur: 'lea@foncia.test' }] }], coproprietes: [] });
    return ok([]);
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const bouton = (texte: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(texte)) as HTMLButtonElement;
const transaction = async (v: string) => {
  const el = container.querySelector('[data-mandat-transaction] input') as HTMLInputElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};

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
    expect((contact.querySelector('.cp-champ--en-avant input') as HTMLInputElement).placeholder).toBe('ex. Conjoint, artisan, avocat, voisin…');
    // Aucune question « en gestion » ni mandat sur la carte contact : ils sont propres à la page (propriétaires).
    expect(contact.textContent).not.toMatch(/en gestion|mandat/i);
  });

  it('PREMIÈRE carte client : le nom, un téléphone ET un e-mail (civilité, prénom, adresse facultatifs) — Arno, 18/10/2026', async () => {
    await act(async () => { root.render(createElement(CreationProprietaires)); });
    const form = container.querySelector('.cp-form') as HTMLElement;
    const enregistrer = () => form.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(enregistrer().disabled).toBe(true);
    await remplir(form, 'Dupont', { tel: '06 12 34 56 78' });
    // Le téléphone seul ne suffit plus : le message est sous les champs.
    expect(enregistrer().disabled).toBe(true);
    expect(form.textContent).toContain('Première carte client : un e-mail est obligatoire.');
    await remplir(form, 'Dupont', { tel: '06 12 34 56 78', email: 'dupont@exemple.test' });
    expect(enregistrer().disabled).toBe(false);
  });

  it('carte client SUIVANTE incomplète → fenêtre des manques (retour / enregistrer quand même) ; retirer la dernière carte complète → refusé', async () => {
    await act(async () => { root.render(createElement(CreationProprietaires)); });
    const premiere = container.querySelector('[data-carte="1"] .cp-form') as HTMLElement;
    await remplir(premiere, 'Dupont', { tel: '06 12 34 56 78', email: 'dupont@exemple.test' });
    await act(async () => { (premiere.querySelector('button[type="submit"]') as HTMLButtonElement).click(); });
    expect(container.querySelectorAll('[data-recap="client"]')).toHaveLength(1);
    await act(async () => { bouton('+ Ajouter…').click(); });
    await act(async () => { bouton('Propriétaire (client)').click(); });
    const seconde = container.querySelector('[data-carte="2"] .cp-form') as HTMLElement;
    // Carte suivante : le nom suffit pour cliquer ; le téléphone et l'e-mail passent par la fenêtre.
    await remplir(seconde, 'Dupont', { tel: '06 98 76 54 32' });
    const enregistrer = seconde.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(enregistrer.disabled).toBe(false);
    await act(async () => { enregistrer.click(); });
    const fen = () => document.querySelector('[data-fenetre-carte]');
    expect([...(fen()?.querySelectorAll('li') ?? [])].map((l) => l.textContent)).toEqual(['E-mail manquant']);
    await act(async () => { [...document.querySelectorAll('[data-fenetre-carte] button')].find((b) => b.textContent === 'Revenir modifier la carte')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(fen()).toBeNull();
    expect(container.querySelectorAll('[data-recap="client"]')).toHaveLength(1);
    await act(async () => { enregistrer.click(); });
    await act(async () => { [...document.querySelectorAll('[data-fenetre-carte] button')].find((b) => b.textContent === 'Enregistrer quand même')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.querySelectorAll('[data-recap="client"]')).toHaveLength(2);
    // La première est la SEULE complète : la retirer est refusé, avec une fenêtre qui dit quoi faire.
    const retirer = [...(container.querySelector('[data-carte="1"]') as HTMLElement).querySelectorAll('button')].find((b) => b.textContent === 'Retirer cette carte')!;
    await act(async () => { retirer.click(); });
    expect(fen()?.textContent).toContain('Suppression impossible');
    expect(fen()?.textContent).toContain('dernière carte complète');
    expect(container.querySelectorAll('[data-recap="client"]')).toHaveLength(2);
    await act(async () => { [...document.querySelectorAll('[data-fenetre-carte] button')].find((b) => b.textContent === 'Compris')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    // La seconde (incomplète) se retire librement.
    await act(async () => { [...(container.querySelector('[data-carte="2"]') as HTMLElement).querySelectorAll('button')].find((b) => b.textContent === 'Retirer cette carte')!.click(); });
    expect(container.querySelectorAll('[data-recap="client"]')).toHaveLength(1);
  });

  it('un contact SEUL ne suffit pas : au moins une carte « Propriétaire (client) »', async () => {
    await act(async () => { root.render(createElement(CreationProprietaires)); });
    await act(async () => { bouton('+ Ajouter…').click(); });
    await act(async () => { bouton('Contact du propriétaire').click(); });
    const contact = container.querySelector('[data-sorte="contact"] .cp-form') as HTMLElement;
    await remplir(contact, 'Martin', { email: 'martin@exemple.test' });
    await act(async () => { (contact.querySelector('button[type="submit"]') as HTMLButtonElement).click(); });
    // Sans téléphone : la fenêtre d'alerte (Arno, 18/10/2026) — « Enregistrer quand même ».
    await act(async () => { [...document.querySelectorAll('[data-fenetre-carte] button')].find((b) => b.textContent === 'Enregistrer quand même')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    // La carte client vide est annulée : il ne reste que le contact (validé).
    await act(async () => { [...(container.querySelector('[data-sorte="client"] .cp-form') as HTMLElement).querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Annuler')!.click(); });
    expect(container.querySelectorAll('[data-recap="contact"]')).toHaveLength(1);
    await act(async () => { bouton('Non').click(); });
    await transaction('MT 2026-041');
    await act(async () => { bouton('Ajouter un bien à ce nouveau propriétaire').click(); });
    expect(container.textContent).toContain('Un contact n’est pas un client : ajoutez au moins une carte « Propriétaire (client) ».');
    expect(posts).toEqual([]);
  });

  it('« Propriétaire(s) en gestion ? » : rien sans réponse ; Oui → mandat de gestion puis bouton ; Non → mandat de TRANSACTION puis bouton ; changer d’avis vide l’autre', async () => {
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
    // Non : plus de mandat de gestion ; le bloc « Mandat de transaction locative », et le gros bouton seulement une fois rempli.
    await act(async () => { bouton('Non').click(); });
    expect(mandat()).toBeNull();
    const mt = () => container.querySelector('[data-mandat-transaction] input') as HTMLInputElement | null;
    expect(container.querySelector('[data-mandat-transaction] h3')?.textContent).toBe('3Mandat de transaction locative');
    expect(mt()?.placeholder).toBe('ex. MT 2026-041');
    expect(container.querySelector('[data-mandat-transaction] label')?.firstChild?.textContent).toBe('N° de mandat de transaction locative (texte libre)');
    expect(gros()).toBeNull();
    await transaction('MT 2026-041');
    expect(gros()).not.toBeNull();
    // Repasser à Oui : le mandat de transaction disparaît (vidé), le mandat de gestion est VIDE ; et inversement.
    await act(async () => { bouton('Oui').click(); });
    expect(mt()).toBeNull();
    expect(mandat()?.value).toBe('');
    expect(gros()).toBeNull();
    await act(async () => { bouton('Non').click(); });
    expect(mt()?.value).toBe('');
    await transaction('MT 2026-041');
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
    expect([...container.querySelectorAll('[data-proprietaires] [data-carte-proprietaire] .cp-nom')].map((x) => x.textContent)).toEqual(['DUPONT Paul', 'DUPONT Anne']);
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
    // Ordre des types voulu par Arno (17/10/2026).
    expect([...bloc().querySelectorAll('[aria-label="Type de logement"] button')].map((x) => x.textContent))
      .toEqual(['Appartement', 'Chambre', 'Studio', 'Duplex', 'Loft', 'Maison', 'Autre']);
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
    expect(code().placeholder).toBe('ex. 57B83');
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
    expect(precision.placeholder).toBe('ex. À droite en sortant de l’ascenseur, deuxième porte à gauche');
  });

  it('DERNIÈRE AG (bloc 6) : pré-remplie si connue pour l’immeuble, envoyée avec le bien ; absente pour un parking nu', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [1] })); });
    await calmer();
    await famille('logement');
    const ag = () => container.querySelector('[data-derniere-ag] input') as HTMLInputElement | null;
    expect(ag()?.type).toBe('date');
    expect(ag()?.closest('.loc-section')?.querySelector('h3')?.textContent).toContain('Caractéristiques complémentaires');
    expect(ag()?.value).toBe('');
    const adr = container.querySelector('.cab-enveloppe input') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(adr, '15 rue Carle Hebert'); adr.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    await calmer();
    expect(ag()?.value).toBe('2026-03-12');
    expect(container.querySelector('[data-derniere-ag] .loc-aide')?.textContent).toContain('Déjà connue pour cet immeuble');
    // Une phrase d'aide : dans le flux (elle passe à la ligne), jamais en `nowrap` absolu qui déborderait au téléphone.
    expect(container.querySelector('[data-derniere-ag] .loc-aide')?.classList.contains('loc-aide--long')).toBe(true);
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(ag(), '2026-06-30'); ag()!.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { [...container.querySelectorAll('[aria-label="Type de logement"] button')][0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    // Arno (18/10/2026) : DPE et « Entretien à prévoir » obligatoires pour un logement (classe D, date, Non).
    await act(async () => { [...container.querySelectorAll('[aria-label="Classe DPE"] button')].find((b) => b.textContent === 'D')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const dpeDate = container.querySelector('[data-dpe-date] input') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(dpeDate, '2024-03-01'); dpeDate.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { (container.querySelector('[data-entretien-reponse="non"]') as HTMLButtonElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await soumettre();
    await calmer();
    expect((posts[0]?.logement as Record<string, unknown> | undefined)?.derniereAg).toBe('2026-06-30');
    // Parking nu : pas de « Caractéristiques complémentaires », donc pas de date d'AG.
    await famille('parking');
    expect(ag()).toBeNull();
  });

  it('SYNDIC : plus de bandeau en double sous le champ ; la modale s’ouvre d’elle-même UNE fois pour une adresse connue', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [] })); });
    const adr = container.querySelector('.cab-enveloppe input') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(adr, '14 rue des Lilas'); adr.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { vi.advanceTimersByTime(700); });
    await calmer();
    vi.useRealTimers();
    // Le bandeau « déjà connu — Rattacher » sous le champ n'existe plus ; la modale (portail) est ouverte, rien n'est choisi.
    expect(container.querySelector('[data-suggestions-syndic]')).toBeNull();
    expect(document.querySelector('.fsy')).not.toBeNull();
    expect(container.querySelector('[data-syndic-choisi]')).toBeNull();
    expect((container.querySelector('[data-loupe]') as HTMLButtonElement).disabled).toBe(false);
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
    expect((container.querySelector('[data-sorte="contact"] .cp-champ--en-avant input') as HTMLInputElement).placeholder).toBe('ex. Conjoint, artisan, avocat, voisin…');
    expect(container.querySelector('[data-sorte="client"] [data-badge]')?.className).toContain('cp-role--en_place');
    await act(async () => { (container.querySelector('[data-collant] button[type="submit"]') as HTMLButtonElement).click(); });
    expect(container.textContent).toContain('Remplissez et enregistrez au moins une carte « Locataire (client) »');
    expect(posts).toEqual([]);
  });
});

/**
 * 🔴 CORRECTIF DU 19/10/2026 — « In HTML, <form> cannot be a descendant of <form> » puis échec d'hydratation sur
 * /admin/location/nouveau-locataire (CartesPersonnes.tsx:895, la carte dans le formulaire de la page). Le rendu SERVEUR
 * est celui que le navigateur lit : on y compte la profondeur des <form>.
 */
function profondeurMaxForm(html: string): number {
  let p = 0; let max = 0;
  for (const m of html.matchAll(/<(\/?)form\b/g)) { p += m[1] === '/' ? -1 : 1; max = Math.max(max, p); }
  return max;
}

describe('🔴 Nouveau locataire : aucun <form> dans un <form>', () => {
  it('le rendu serveur (carte client ouverte d’office) n’imbrique aucun formulaire', () => {
    const html = renderToString(createElement(CreationLocataire));
    expect(html).toContain('class="cp-form"');
    expect(profondeurMaxForm(html)).toBe(1);
    expect(profondeurMaxForm('<form><div><form></form></div></form>')).toBe(2);
  });

  it('rien ne change à l’écran : « Enregistrer », la recherche du bien et la date d’entrée restent reliés au formulaire de la page', async () => {
    await act(async () => { root.render(createElement(CreationLocataire)); });
    expect(container.querySelectorAll('form form')).toHaveLength(0);
    const page = container.querySelector('form[data-formulaire-page]') as HTMLFormElement;
    const bouton = container.querySelector('[data-collant] button[type="submit"]') as HTMLButtonElement;
    expect(bouton.textContent).toBe('Enregistrer');
    expect(bouton.form).toBe(page);
    expect((container.querySelector('input[placeholder="ex. rue des Lilas ou Dupont"]') as HTMLInputElement).form).toBe(page);
    expect((container.querySelector('input[type="date"]') as HTMLInputElement).form).toBe(page);
    // La carte garde SON formulaire, à elle.
    expect(container.querySelector('[data-sorte="client"] form.cp-form')).not.toBeNull();
    await act(async () => { bouton.click(); });
    expect(container.textContent).toContain('Remplissez et enregistrez au moins une carte « Locataire (client) »');
  });
});

describe('Arno (19/10/2026) — « Bien loué » : par l’adresse OU le nom du propriétaire', () => {
  it('libellé et exemple ; chaque résultat montre l’adresse, le type, l’étage et le propriétaire', async () => {
    const f = global.fetch as ReturnType<typeof vi.fn>;
    f.mockImplementation(async (url: string | URL | Request) => (String(url).includes('biensPourLocataire=')
      ? ok([{ id: 7, titre: '4 rue Fictive, Puteaux', detail: 'Appartement T3 · 3e étage · propriétaire : DUPONT Jean · libre' }]) : ok([])));
    await act(async () => { root.render(createElement(CreationLocataire)); });
    const champ = container.querySelector('input[data-recherche-bien]') as HTMLInputElement;
    expect(champ.placeholder).toBe('ex. rue des Lilas ou Dupont');
    expect(champ.closest('label')?.textContent).toContain('Chercher le bien par son adresse ou le nom du propriétaire (biens du portefeuille)');
    await act(async () => { await new Promise((r) => { setTimeout(r, 300); }); });
    expect(container.querySelector('.loc-choix li')?.textContent).toBe('4 rue Fictive, PuteauxAppartement T3 · 3e étage · propriétaire : DUPONT Jean · libre');
  });
});
