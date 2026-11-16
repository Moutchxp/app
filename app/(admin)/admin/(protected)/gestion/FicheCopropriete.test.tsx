// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BoutonCopropriete, FicheCopropriete, refusContact } from './FicheCopropriete';

/** 🔴🔴 Arno (16/11/2026, fiche Copropriété, lot 2) — la fenêtre « Copropriété » et son bouton sous celui du syndic. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (c: unknown) => ({ ok: true, status: 200, json: async () => c }) as unknown as Response;
let container: HTMLDivElement; let root: Root; let posts: Record<string, unknown>[]; let lu: Record<string, unknown>; let parcelle: unknown[];
const FICHE = (o: Record<string, unknown> = {}) => ({ cle: 'residence les tilleuls', declaree: true, id: 7, libelle: 'Résidence Les Tilleuls', nom: null, horsCopropriete: false, nomenclature: null,
  codePostal: '75011', commune: 'Paris', adresses: [{ cle: 'residence les tilleuls', libelle: 'Résidence Les Tilleuls', codePostal: '75011', commune: 'Paris', principale: true },
    { cle: '12 rue des lilas', libelle: '12 rue des Lilas', codePostal: '75011', commune: 'Paris', principale: false }],
  syndic: { id: 2, nom: 'Cabinet A', ville: 'Paris', depuis: '2026-01-01' },
  gestionnaires: [{ id: 5, civilite: 'Mme', prenom: 'Claire', nom: 'Test', titre: 'Gestionnaire', coordonnees: [{ sorte: 'email', libelle: null, valeur: 'claire@cabinet-a.test' }] }],
  contacts: [{ id: 1, categorie: 'gardien', libelle: null, civilite: 'M.', prenom: 'Paul', nom: 'Loge', note: null, coordonnees: [{ id: 3, sorte: 'telephone', libelle: null, valeur: '0611223344' }] }],
  biens: [{ id: 1, numero: 'W1', adresse: '12 rue des Lilas', copropriete: true }], desaccord: false, avec476: true, ...o });
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); posts = [];
  lu = { fiche: FICHE(), coproprieteDuBien: true };
  parcelle = [{ libelle: '14 rue des Lilas', codePostal: '75011', commune: 'Paris', parcelle: 'AB12', etat: 'libre', copropriete: null, syndic: null },
    { libelle: '10 rue Voisine', codePostal: '75011', commune: 'Paris', parcelle: 'AB12', etat: 'prise', copropriete: '10 rue Voisine', syndic: { id: 9, nom: 'Cabinet B', ville: 'Lyon' } }];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith('/api/admin/gestion/coproprietes/fiche') && (init?.method ?? 'GET') === 'GET') return json({ etat: 'ok', data: lu });
    if (u.startsWith('/api/admin/gestion/coproprietes/fiche')) {
      const c = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (c.action === 'parcelle') return json({ etat: 'ok', data: parcelle });
      posts.push(c); return json({ etat: 'ok', data: FICHE() });
    }
    // la Base Adresse Nationale (les suggestions de ChampAdresseBan)
    if (u.startsWith('https://api-adresse.data.gouv.fr/search/')) return json({ features: u.includes('impasse') ? [{ properties: { label: '3 Impasse Neuve 75011 Paris', name: '3 Impasse Neuve', postcode: '75011', city: 'Paris' } }]
      : u.includes('lhomme') ? [{ properties: { label: 'Rue Pierre Lhomme 92400 Courbevoie', name: 'Rue Pierre Lhomme', postcode: '92400', city: 'Courbevoie' } }] : [] });
    if (u.startsWith('/api/admin/gestion/syndics?')) return json({ syndics: [{ id: 2, nom: 'Cabinet A', ville: 'Paris', nbCoproprietes: 3 }, { id: 4, nom: 'Cabinet C', ville: 'Nice', nbCoproprietes: 1 }] });
    return json({ etat: 'sans_schema' });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); document.body.innerHTML = ''; });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const $ = (s: string) => document.querySelector(s) as HTMLElement;
const clic = async (s: string) => { await act(async () => { $(s).click(); }); await calmer(); };
const saisir = async (s: string, v: string) => { const el = $(s) as HTMLInputElement; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }); };
const ouvrir = async () => { await act(async () => { root.render(createElement(FicheCopropriete, { lotId: 1, onFerme: () => {} })); }); await calmer(); };

describe('le bouton sous « Créer le syndic »', () => {
  it('« Copropriété » ; un bien noté « pas en copropriété » : « Bien hors copropriété » dès le départ, la fiche aussi', async () => {
    await act(async () => { root.render(createElement(BoutonCopropriete, { lotId: 1 })); }); await calmer();
    expect(container.textContent).toBe('Copropriété');
    act(() => root.unmount()); root = createRoot(container);
    lu = { fiche: FICHE({ declaree: false, id: null, syndic: null }), coproprieteDuBien: false };
    await act(async () => { root.render(createElement(BoutonCopropriete, { lotId: 1 })); }); await calmer();
    expect(container.textContent).toBe('Bien hors copropriété');
    await act(async () => { (container.querySelector('button') as HTMLButtonElement).click(); }); await calmer();
    expect($('[data-fcp-titre]').textContent).toBe('Bien hors copropriété · Résidence Les Tilleuls');
    expect(document.querySelector('[data-fcp-syndic]')).toBeNull(); // ni syndic
    expect(document.querySelector('[data-fcp-ag]')).toBeNull(); // ni AG
    expect(document.querySelector('[data-fcp-adresses]')).not.toBeNull(); // mais adresses, digicodes, habitants
    expect(document.querySelector('[data-fcp-digicodes]')).not.toBeNull();
    expect(document.querySelector('[data-fcp-contacts]')).not.toBeNull();
    expect(($('[data-fcp-hors]') as HTMLInputElement).checked).toBe(true);
  });
});

describe('un bien noté « pas en copropriété » sur une fiche déjà enregistrée', () => {
  it('le titre le dit, ni syndic ni AG ; la case reste celle de la fiche, avec la phrase qui propose de la cocher ; le syndic encore lié est dit', async () => {
    lu = { fiche: FICHE(), coproprieteDuBien: false };
    await ouvrir();
    expect($('[data-fcp-titre]').textContent).toBe('Bien hors copropriété · Résidence Les Tilleuls');
    expect(document.querySelector('[data-fcp-syndic]')).toBeNull();
    expect(document.querySelector('[data-fcp-ag]')).toBeNull();
    expect(($('[data-fcp-hors]') as HTMLInputElement).checked).toBe(false);
    expect($('[data-fcp-bien-hors]').textContent).toContain('rien n’est changé sans « Valider »');
    expect($('[data-fcp-hors-avec-syndic]').textContent).toContain('rien n’est retiré tout seul');
  });
});

describe('la fiche', () => {
  it('toutes ses adresses, un digicode par adresse, l’AG, le syndic (lien) et ses gestionnaires en lecture seule, les habitants et gardiens', async () => {
    await ouvrir();
    expect($('[data-fcp-titre]').textContent).toBe('Copropriété · Résidence Les Tilleuls');
    expect([...document.querySelectorAll('[data-fcp-adresse]')].map((x) => x.getAttribute('data-fcp-adresse'))).toEqual(['principale', 'secondaire']);
    expect($('[data-fcp-ouvrir-syndic]').textContent).toMatch(/^Cabinet A/i);
    expect($('[data-fcp-gestionnaires]').textContent).toContain('Claire TEST');
    expect($('[data-fcp-gestionnaires]').textContent).toContain('(lecture seule)');
    expect($('[data-fcp-contact="gardien"] [data-fcp-statut]').textContent).toBe('Gardien');
    expect($('[data-fcp-usage-interne]').textContent).toContain('jamais communiquées à un autre client');
    expect(document.querySelectorAll('[role="dialog"] select')).toHaveLength(0);
  });
  it('« + » : les adresses de la même parcelle (« Rattacher » ; prise par une autre copropriété : grisée avec son syndic) ; une autre adresse PAR LES SUGGESTIONS ; « × » retire', async () => {
    await ouvrir();
    await clic('[data-fcp-plus-adresse]');
    expect($('[data-fcp-prise]').textContent).toContain('déjà rattachée à une autre copropriété');
    expect($('[data-fcp-prise]').textContent).toContain('Lyon');
    await clic('[data-fcp-rattacher-parcelle]');
    // 🔴 (16/11/2026) plus de champs libres Rue / Code postal / Ville : le champ commun à suggestions (ChampAdresseBan)
    expect(document.querySelector('[data-fcp-rue], [data-fcp-cp], [data-fcp-ville]')).toBeNull();
    const champ = $('[data-fcp-autre-adresse] input.cp-saisie') as HTMLInputElement;
    await saisir('[data-fcp-autre-adresse] input', '3 impasse neuve');
    // tapée sans être choisie dans la liste : message clair, rien n'est ajouté
    await clic('[data-fcp-ajouter-adresse]');
    expect($('[data-fcp-adresse-introuvable]').textContent).toBe('Adresse introuvable dans les suggestions : choisissez-la dans la liste proposée (Base Adresse Nationale). Rien n’est ajouté.');
    expect(document.querySelectorAll('[data-fcp-adresse="secondaire"]')).toHaveLength(2);
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); }); await calmer();
    await act(async () => { $('.cab-prop').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }); await calmer();
    expect(champ.value).toBe('3 Impasse Neuve, 75011 PARIS'); // la commune en majuscules, comme partout où ce champ sert
    expect(document.querySelector('[data-fcp-adresse-introuvable]')).toBeNull();
    await clic('[data-fcp-ajouter-adresse]');
    expect([...document.querySelectorAll('[data-fcp-adresse="secondaire"]')].map((x) => x.textContent!.replace(/ ×$/, '').split(',')[0])).toEqual(['12 rue des Lilas', '14 rue des Lilas', '3 Impasse Neuve']);
    expect(champ.value).toBe('');
    await clic('[data-fcp-retirer]'); await clic('[data-fcp-retirer-oui]');
    await clic('[data-fcp-valider]');
    expect((posts[0].adresses as { libelle: string; codePostal: string }[]).map((a) => [a.libelle, a.codePostal])).toEqual([['14 rue des Lilas', '75011'], ['3 Impasse Neuve', '75011']]);
  });
  it('🔴 le serveur refuse une adresse non vérifiée : son message s’affiche, rien n’est enregistré', async () => {
    const f = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const avant = f.getMockImplementation() as (u: string | URL | Request, i?: RequestInit) => Promise<Response>;
    f.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const c = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
      if (c?.action === 'enregistrer') return json({ etat: 'refus', motif: 'L’adresse 3 Impasse Neuve, 75011 Paris est introuvable dans la Base Adresse Nationale : … Rien n’est enregistré.' });
      return avant(url, init);
    });
    await ouvrir();
    await clic('[data-fcp-valider]');
    expect($('[data-fcp-erreur]').textContent).toContain('introuvable dans la Base Adresse Nationale');
    expect(document.querySelector('[data-fcp-info]')).toBeNull();
  });
  it('habitants : statuts Gardien / Copropriétaire / Conseil syndical / Personnaliser (texte libre obligatoire) ; partent avec « Valider »', async () => {
    await ouvrir();
    await clic('[data-fcp-ajouter-contact]');
    expect([...document.querySelectorAll('[data-fcp-statut-choix]')].map((x) => x.textContent)).toEqual(['Gardien', 'Copropriétaire', 'Conseil syndical', 'Personnaliser']);
    expect($('[data-fcp-statut-choix="coproprietaire"]').getAttribute('aria-pressed')).toBe('true');
    await saisir('[data-fcp-prenom]', 'Léa'); await saisir('[data-fcp-nom-contact]', 'Martin');
    await clic('[data-fcp-plus-email]'); await saisir('[data-fcp-coord="email"]', 'lea@exemple.test');
    await clic('[data-fcp-statut-choix="personnalise"]');
    expect(($('[data-fcp-valider-contact]') as HTMLButtonElement).disabled).toBe(true);
    await saisir('[data-fcp-statut-libre]', 'Locataire');
    await clic('[data-fcp-valider-contact]');
    await clic('[data-fcp-valider]');
    expect(posts[0].contacts).toMatchObject([{ id: 1, categorie: 'gardien' }, { id: null, categorie: 'personnalise', libelle: 'Locataire', prenom: 'Léa', coordonnees: [{ sorte: 'email', valeur: 'lea@exemple.test' }] }]);
    expect(refusContact({ cle: 'x', id: null, categorie: 'coproprietaire', libelle: '', civilite: null, prenom: '', nom: '', note: '', coordonnees: [] })).toBe('Donnez au moins un nom ou un prénom.');
  });
  it('changer de syndic depuis la fiche ; une adresse de la parcelle gérée par un AUTRE syndic : « Oui, je confirme », le conflit part avec la saisie', async () => {
    await ouvrir();
    await clic('[data-fcp-choisir-syndic]');
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); }); await calmer();
    await clic('[data-fcp-syndic-propose="4"]');
    expect($('[data-fcp-syndic-choisi]').textContent).toContain('passera en historique');
    await clic('[data-fcp-valider]');
    expect($('[data-fcp-conflit]').textContent).toContain('10 rue Voisine');
    expect(posts).toHaveLength(0);
    await clic('[data-fcp-conflit-oui]');
    expect(posts[0]).toMatchObject({ syndicId: 4, conflitsParcelle: [{ autre: '10 rue Voisine', parcelle: 'AB12' }] });
  });
  it('🔴 la question est celle de la règle commune (mot pour mot celle de la fiche syndic) ; un refus du serveur sans confirmation s’affiche, rien n’est enregistré', async () => {
    await ouvrir();
    await clic('[data-fcp-choisir-syndic]');
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); }); await calmer();
    await clic('[data-fcp-syndic-propose="4"]');
    await clic('[data-fcp-valider]');
    expect($('[data-fcp-conflit] p').textContent).toBe('Sur la même parcelle, 10 rue Voisine, 75011 Paris (10 rue Voisine) est gérée par Cabinet B / Lyon. Confirmez-vous un autre syndic pour cette copropriété ?');
    await clic('[data-fcp-conflit] .svv-btn-outline:not([data-fcp-rattacher-a])'); // Annuler
    // la parcelle a changé entre-temps : l'écran ne voit plus de conflit, le serveur, lui, le voit — il refuse, la fiche le dit
    parcelle = [];
    const f = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const avant = f.getMockImplementation() as (u: string | URL | Request, i?: RequestInit) => Promise<Response>;
    f.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const c = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
      if (c?.action === 'enregistrer') { posts.push(c); return json({ etat: 'refus', motif: 'Conflit de parcelle non confirmé pour « Résidence Les Tilleuls » : …', conflitsParcelle: [{}] }); }
      return avant(url, init);
    });
    act(() => root.unmount()); root = createRoot(container);
    await ouvrir();
    await clic('[data-fcp-choisir-syndic]');
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); }); await calmer();
    await clic('[data-fcp-syndic-propose="4"]');
    await clic('[data-fcp-valider]');
    expect(posts.at(-1)).toMatchObject({ syndicId: 4, conflitsParcelle: [] });
    expect($('[data-fcp-erreur]').textContent).toContain('Conflit de parcelle non confirmé');
    expect(document.querySelector('[data-fcp-info]')).toBeNull();
  });
  it('une fiche encore à créer, d’autres adresses sur la parcelle non rattachées : l’alerte d’abord (« Voir les adresses » / « Valider quand même »)', async () => {
    lu = { fiche: FICHE({ declaree: false, id: null, syndic: null, gestionnaires: [] }), coproprieteDuBien: null };
    await ouvrir();
    expect($('[data-fcp-nouvelle]').textContent).toContain('créée au premier « Valider »');
    await clic('[data-fcp-valider]');
    expect($('[data-fcp-alerte-parcelle]').textContent).toContain('14 rue des Lilas');
    await clic('[data-fcp-valider-quand-meme]');
    expect(posts[0]).toMatchObject({ alerteParcelleVue: true });
  });
  it('des biens qui se contredisent : l’alerte, rien n’est corrigé tout seul', async () => {
    lu = { fiche: FICHE({ desaccord: true }), coproprieteDuBien: true };
    await ouvrir();
    expect($('[data-fcp-desaccord]').textContent).toContain('rien n’est corrigé tout seul');
  });
  it('🔴 (lot 3) la nouvelle saisie des digicodes : elle remplace l’ancienne dans cette fiche, et ce qui change part avec « Valider »', async () => {
    lu = { fiche: FICHE({ saisieDigicodes: true, nomenclatureEffective: null, batimentsConnus: [],
      digicodes: [{ cle: 'residence les tilleuls', voie: 'Résidence Les Tilleuls', codePostal: '75011', commune: 'Paris', commun: { digicode: null, code: null }, batiments: [] }] }), coproprieteDuBien: true };
    await ouvrir();
    expect(document.querySelector('[data-digicodes-copro]')).not.toBeNull();
    await saisir('[data-dcp-code-commun]', '4321');
    await clic('[data-dcp-plus]');
    await saisir('[data-dcp-nom-batiment]', '1');
    await clic('[data-fcp-valider]');
    expect(posts[0].digicodes).toEqual([{ cle: 'residence les tilleuls', commun: { code: '4321', aucun: false }, batiments: [{ libelle: '1', code: '', aucun: false, confirme: false }] }]);
  });
});

describe('🔴 (lot 6) « Même syndic : regrouper ? », déplacé de la fiche syndic dans la fiche copropriété', () => {
  const MEME = () => ({ fiche: FICHE({ syndic: { id: 9, nom: 'Cabinet B', ville: 'Lyon', depuis: '2026-01-01' }, contacts: [], gestionnaires: [] }), coproprieteDuBien: true });
  it('une adresse de la parcelle est la copropriété du MÊME syndic : la question, « Oui, regrouper » envoie le regroupement', async () => {
    lu = MEME();
    await ouvrir();
    await clic('[data-fcp-valider]');
    expect($('[data-fcp-meme-syndic]').textContent).toContain('est la copropriété « 10 rue Voisine », gérée par le même syndic');
    expect(posts).toHaveLength(0);
    await clic('[data-fcp-meme-oui]');
    expect(posts[0]).toMatchObject({ regrouperAvec: '10 rue Voisine' });
  });
  it('« Non, copropriété distincte » : enregistrée sans regroupement', async () => {
    lu = MEME();
    await ouvrir();
    await clic('[data-fcp-valider]');
    await clic('[data-fcp-meme-non]');
    expect(posts[0].regrouperAvec).toBeUndefined();
  });
  it('une copropriété qui a déjà ses habitants : la question n’est pas posée (rien ne serait déplacé)', async () => {
    lu = { fiche: FICHE({ syndic: { id: 9, nom: 'Cabinet B', ville: 'Lyon', depuis: '2026-01-01' } }), coproprieteDuBien: true };
    await ouvrir();
    await clic('[data-fcp-valider]');
    expect(document.querySelector('[data-fcp-meme-syndic]')).toBeNull();
    expect(posts).toHaveLength(1);
  });
  it('🔴 conflit de parcelle : « Rattacher à X » — la copropriété rejoint celle de la parcelle, avec le syndic X (regroupement)', async () => {
    lu = MEME();
    await ouvrir();
    await clic('[data-fcp-choisir-syndic]');
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); }); await calmer();
    await clic('[data-fcp-syndic-propose="4"]');
    await clic('[data-fcp-valider]');
    expect($('[data-fcp-rattacher-a="9"]').textContent).toBe('Rattacher à Cabinet B');
    await clic('[data-fcp-rattacher-a="9"]');
    expect(posts[0]).toMatchObject({ regrouperAvec: '10 rue Voisine', syndicId: 9 });
  });
});

describe('🔴🔴 (lot 6) AVANT de les retirer de la fiche syndic : chaque élément est présent dans la fiche copropriété', () => {
  it('① adresses (« + », champ, autres adresses avec « × », adresses de la parcelle avec « Rattacher ») ; ③ habitants et gardien, ajout d’un contact ; ④ digicodes et AG', async () => {
    await ouvrir();
    expect($('[data-fcp-adresses]').textContent).toContain('12 rue des Lilas');
    expect(document.querySelector('[data-fcp-retirer]')).not.toBeNull(); // « × » d'une autre adresse
    await clic('[data-fcp-plus-adresse]');
    expect(document.querySelector('[data-fcp-ajout-adresse]')).not.toBeNull(); // le champ d'adresse
    expect($('[data-fcp-rattacher-parcelle]').textContent).toBe('Rattacher'); // « N adresses sur la même parcelle »
    expect($('[data-fcp-contacts]').textContent).toContain('Paul');
    expect(document.querySelector('[data-fcp-ajouter-contact]')).not.toBeNull();
    expect(document.querySelector('[data-fcp-digicodes]')).not.toBeNull();
    expect(document.querySelector('[data-fcp-ag]')).not.toBeNull();
  });
  it('② contrôles de parcelle : conflit (« Rattacher à X », « Oui, je confirme »), « Même syndic : regrouper ? », alerte « autres adresses postales »', async () => {
    await ouvrir();
    await clic('[data-fcp-choisir-syndic]');
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); }); await calmer();
    await clic('[data-fcp-syndic-propose="4"]');
    await clic('[data-fcp-valider]');
    expect(document.querySelector('[data-fcp-rattacher-a="9"]')).not.toBeNull();
    expect(document.querySelector('[data-fcp-conflit-oui]')).not.toBeNull();
    // « Même syndic » et l'alerte : épreuves dédiées ci-dessus (data-fcp-meme-syndic, data-fcp-alerte-parcelle)
  });
});

describe('🔴 (lot 6, repris du cadre « Ajouter un contact de l’immeuble » de la fiche syndic) les contrôles d’un habitant ou gardien', () => {
  it('même NOM dans cet immeuble : bloqué ; une coordonnée déjà utilisée (ici ou ailleurs) : averti, « Valider quand même »', async () => {
    const base = global.fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>;
    global.fetch = vi.fn(async (u: string | URL | Request, i?: RequestInit) => (String(u).startsWith('/api/admin/gestion/syndics/doublons')
      ? json({ emails: [], noms: [], coordonnees: [{ sorte: 'email', cle: 'lea@exemple.test', proprietaire: { genre: 'syndic', contactId: 4, civilite: 'Mme', prenom: 'Léa', nom: 'Durand',
        titre: 'Gestionnaire', syndicId: 2, syndicNom: 'Cabinet A', syndicVille: 'Paris', coproprietes: [] } }] })
      : base(String(u), i))) as unknown as typeof fetch;
    await ouvrir();
    await clic('[data-fcp-ajouter-contact]');
    await saisir('[data-fcp-prenom]', 'paul'); await saisir('[data-fcp-nom-contact]', 'LOGE');
    expect($('[data-fcp-refus-contact]').textContent).toBe('Un contact nommé Paul LOGE existe déjà dans l’immeuble Résidence Les Tilleuls.');
    expect(($('[data-fcp-valider-contact]') as HTMLButtonElement).disabled).toBe(true);
    await saisir('[data-fcp-nom-contact]', 'Martin');
    await clic('[data-fcp-plus-tel]'); await saisir('[data-fcp-coord="telephone"]', '06 11 22 33 44');
    await clic('[data-fcp-plus-email]'); await saisir('[data-fcp-coord="email"]', 'Lea@Exemple.test');
    await clic('[data-fcp-valider-contact]');
    expect([...document.querySelectorAll('[data-fcp-avert-coord] span')].map((x) => x.textContent)).toEqual([
      'Le numéro 06 11 22 33 44 est déjà utilisé par M. Paul LOGE · Gardien · Résidence Les Tilleuls.',
      'L’adresse e-mail Lea@Exemple.test est déjà utilisée par Mme Léa DURAND · Gestionnaire · Cabinet A / Paris.']);
    expect(document.querySelector('[data-fcp-edition-contact]')).not.toBeNull(); // rien de validé
    expect($('[data-fcp-valider-contact]').textContent).toBe('Valider quand même');
    await clic('[data-fcp-valider-contact]');
    expect(document.querySelector('[data-fcp-edition-contact]')).toBeNull();
    expect($('[data-fcp-contacts]').textContent).toContain('MARTIN');
  });
});

describe('🔴 (16/11/2026, point 3) la mise en page : le Syndic en DERNIER, chaque partie en carte — rien retiré ni masqué', () => {
  const ordre = () => [...document.querySelectorAll('.fcp-corps > section.fcp-bloc')].map((x) => [...x.attributes].find((a) => a.name.startsWith('data-fcp-'))!.name);
  it('l’ordre : Identité, Adresses, Digicodes, AG, Habitants et gardiens, Syndic ; chaque carte a son titre', async () => {
    await ouvrir();
    expect(ordre()).toEqual(['data-fcp-identite', 'data-fcp-adresses', 'data-fcp-digicodes', 'data-fcp-ag', 'data-fcp-contacts', 'data-fcp-syndic']);
    expect([...document.querySelectorAll('.fcp-corps > section.fcp-bloc > h3.fcp-titre')].map((h) => h.childNodes[0].textContent))
      .toEqual(['Identité', 'Adresses', 'Digicodes', 'AG', 'Habitants et gardiens', 'Syndic']);
    // tout ce que portait chaque partie y est toujours
    for (const s of ['[data-fcp-plus-adresse]', '[data-fcp-ouvrir-syndic]', '[data-fcp-gestionnaires]', '[data-fcp-choisir-syndic]', '[data-fcp-ajouter-contact]', '[data-fcp-usage-interne]', '[data-fcp-nom]', '[data-fcp-hors]', '[data-fcp-biens]']) {
      expect(document.querySelector(s), s).not.toBeNull();
    }
  });
  it('« hors copropriété » : ni AG ni Syndic, comme avant ; le syndic encore lié reste dit, en fin de fenêtre', async () => {
    lu = { fiche: FICHE({ horsCopropriete: true }), coproprieteDuBien: null };
    await ouvrir();
    expect(ordre()).toEqual(['data-fcp-identite', 'data-fcp-adresses', 'data-fcp-digicodes', 'data-fcp-contacts']);
    expect(document.querySelector('.fcp-corps')!.lastElementChild!.hasAttribute('data-fcp-hors-avec-syndic')).toBe(true);
  });
  it('les cartes : fond et bordure distincts du fond de la fenêtre, titre souligné ; jetons de couleur (clair et sombre)', async () => {
    const { CSS_FICHE_COPROPRIETE } = await import('./FicheCopropriete');
    const regle = (sel: string) => CSS_FICHE_COPROPRIETE.split('\n').filter((l) => l.startsWith(`${sel}{`) || l.startsWith(`  `)).join('');
    expect(CSS_FICHE_COPROPRIETE).toMatch(/\.fcp-corps\{[^}]*background:var\(--color-svv-field\)/);
    expect(CSS_FICHE_COPROPRIETE).toMatch(/\.fcp-bloc\{[^}]*border:1px solid var\(--color-svv-line-strong\)[^}]*background:var\(--color-svv-surface\)/);
    expect(CSS_FICHE_COPROPRIETE).toMatch(/\.fcp-titre\{[^}]*border-bottom:1px solid var\(--color-svv-line\)/);
    expect(regle('.fcp-bloc')).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});

describe('🔴 (16/11/2026) une adresse SANS NUMÉRO : la fenêtre d’avertissement (« Corriger » / « Confirmer »)', () => {
  const choisirRue = async () => {
    await ouvrir();
    await clic('[data-fcp-plus-adresse]');
    await saisir('[data-fcp-autre-adresse] input', 'rue pierre lhomme');
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); }); await calmer();
    await act(async () => { $('.cab-prop').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }); await calmer();
    await clic('[data-fcp-ajouter-adresse]');
  };
  it('la fenêtre s’ouvre au moment de l’ajout, avec le même style que celle des noms de bâtiment ; rien n’est encore ajouté', async () => {
    await choisirRue();
    const f = $('[data-fcp-sans-numero] [role="alertdialog"]');
    expect(f.classList.contains('dcp-alerte')).toBe(true);
    expect(f.textContent).toContain('Adresse sans numéro');
    expect(f.textContent).toContain('Cette adresse n’a pas de numéro : Rue Pierre Lhomme, 92400 COURBEVOIE.');
    expect([...f.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Corriger', 'Confirmer']);
    expect(document.querySelectorAll('[data-fcp-adresse="secondaire"]')).toHaveLength(1);
  });
  it('« Corriger » : rien n’est ajouté, le champ est vidé et reprend la main', async () => {
    await choisirRue();
    await clic('[data-fcp-sans-numero-corriger]');
    expect(document.querySelector('[data-fcp-sans-numero]')).toBeNull();
    expect(document.querySelectorAll('[data-fcp-adresse="secondaire"]')).toHaveLength(1);
    expect(($('[data-fcp-autre-adresse] input') as HTMLInputElement).value).toBe('');
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(document.activeElement).toBe($('[data-fcp-autre-adresse] input'));
  });
  it('« Confirmer » : ajoutée, et la confirmation part avec « Valider »', async () => {
    await choisirRue();
    await clic('[data-fcp-sans-numero-confirmer]');
    expect([...document.querySelectorAll('[data-fcp-adresse="secondaire"]')].map((x) => x.textContent!.split(',')[0])).toEqual(['12 rue des Lilas', 'Rue Pierre Lhomme']);
    await clic('[data-fcp-valider]');
    expect(posts[0]).toMatchObject({ sansNumeroConfirmees: ['rue pierre lhomme'] });
  });
  it('une adresse numérotée : aucune fenêtre ; rien de confirmé ne part', async () => {
    await ouvrir();
    await clic('[data-fcp-valider]');
    expect(posts[0]).toMatchObject({ sansNumeroConfirmees: [] });
  });
});

describe('🔴🔴 (« Digicodes unifiés », lot 3) la fiche copropriété et les gestes immédiats', () => {
  const ETAT = { connu: true, valeur: { digicode: true, code: '1234' }, depuis: '2026-11-01T10:00:00.000Z', source: 'unifie', aVenir: [], aArbitrer: [], historique: [] };
  const DIGI = { saisieDigicodes: true, digicodesUnifies: true, batimentsConnus: [], nomenclatureEffective: null,
    digicodes: [{ cle: 'residence les tilleuls', voie: 'Résidence Les Tilleuls', codePostal: '75011', commune: 'Paris', commun: { digicode: true, code: '1234', etat: ETAT }, batiments: [] }] };
  it('« Corriger une erreur » part tout de suite (action « digicode-corriger », la place, la valeur) ; seuls les digicodes sont relus', async () => {
    lu = { fiche: FICHE(DIGI), coproprieteDuBien: true };
    const f = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const avant = f.getMockImplementation() as (u: string | URL | Request, i?: RequestInit) => Promise<Response>;
    f.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const c = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
      if (c?.action === 'digicode-corriger') { posts.push(c); return json({ etat: 'ok', data: FICHE({ ...DIGI, digicodes: [{ ...DIGI.digicodes[0], commun: { digicode: true, code: '1243', etat: { ...ETAT, valeur: { digicode: true, code: '1243' } } } }] }) }); }
      return avant(url, init);
    });
    await ouvrir();
    await saisir('[data-fcp-nom]', 'Les Tilleuls (en cours)');
    await clic('[data-dcp-corriger-erreur]');
    await saisir('[data-dcp-correction-code]', '1243');
    await clic('[data-dcp-correction-confirmer]');
    expect(posts.at(-1)).toEqual({ action: 'digicode-corriger', immeuble: 'residence les tilleuls', adresseCle: 'residence les tilleuls', batiment: null, digicode: true, code: '1243' });
    expect(($('[data-fcp-nom]') as HTMLInputElement).value).toBe('Les Tilleuls (en cours)'); // le reste de la saisie n'est pas perdu
    expect($('[data-fcp-info]').textContent).toBe('Digicode corrigé.');
    expect($('[data-dcp-lue-valeur]').textContent).toContain('code 1243');
  });
  it('des digicodes saisis et pas encore validés : le geste est refusé (ils seraient perdus), rien ne part', async () => {
    lu = { fiche: FICHE({ ...DIGI, digicodes: [{ ...DIGI.digicodes[0], batiments: [{ cle: 'b', libelle: 'B', digicode: null, code: null, etat: { ...ETAT, connu: false, valeur: null } }] }] }), coproprieteDuBien: true };
    await ouvrir();
    await saisir('[data-dcp-batiment="B"] [data-dcp-code-batiment]', 'B1');
    await clic('[data-dcp-corriger-erreur]');
    await saisir('[data-dcp-correction-code]', '1243');
    await clic('[data-dcp-correction-confirmer]');
    expect(posts).toEqual([]);
    expect($('[data-dcp-correction-erreur]').textContent).toContain('Validez (ou retirez) d’abord les digicodes en cours de saisie');
  });
});
