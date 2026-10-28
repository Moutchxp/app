// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EcranGlobal, EcranSociete } from './EcransTransaction';
import type { Vente } from '../../../../lib/transaction/modele';

/**
 * 🔴 TUILE « TRANSACTION », LOT D (27/10/2026) — les vrais écrans, route simulée (rien n'est écrit) : l'onglet « Compromis » AVANT « Le mois »
 * et « L'année », ses totaux et sa répartition, « Acte signé » puis « Revenir en compromis » ; le formulaire d'un compromis et son bloc
 * « Négociateurs et répartition » (50/50, même négociateur 100 %, partie extérieure, somme ≠ 100 % dite et refusée côté écran) ; le CA global.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const JB = { id: 5, nom: 'Jean-Baptiste PONS', societe: 'criterimmo' as const };
const MY = { id: 7, nom: 'Mylène EBERLIN', societe: 'macj' as const };
const AU = { id: 4, nom: 'Augustin Jorel', societe: null };
const compromis: Vente = { id: 41, societe: 'criterimmo', libelle: 'DUPONT / MARTIN', honorairesTtc: 12000, statut: 'compromis', annee: 2027, mois: null, dateCompromis: '2026-10-20',
  apporteur: 'Julien Deblois', note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, lignes: [], double: null,
  repartition: { retroApporteurTtc: 2400, parties: [
    { sorte: 'entree', compteId: 5, negociateur: JB.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 40, montantHt: null },
    { sorte: 'sortie', compteId: 7, negociateur: MY.nom, societe: 'macj', nom: null, coordonnees: null, pourcentage: 40, montantHt: null },
    { sorte: 'exterieure', compteId: null, negociateur: null, societe: null, nom: 'Agence du Parc', coordonnees: null, pourcentage: 20, montantHt: null }] },
  dossier: { adresseBien: '1 rue A, Puteaux', dateActePrevue: '2027-01-15', dateActe: null, entree: { id: 5, nom: JB.nom }, sortie: { id: 7, nom: MY.nom }, apporteurId: 4,
    personnes: [{ id: 3, role: 'vendeur', nom: 'DUPONT', telephone: '06 12 34 56 78', email: 'p.dupont@exemple.fr', adresse: null }, { id: 8, role: 'acquereur', nom: 'MARTIN', telephone: null, email: null, adresse: null }] } };
const importe: Vente = { ...compromis, id: 12, libelle: 'MARMONIER', honorairesTtc: 14000, origine: 'import', sourceFichier: 'TABLEAU DE BORD 2026.xlsx', sourceOnglet: 'CEDRIC',
  sourceLigne: 30, annee: 2026, dateCompromis: null, repartition: null, dossier: null, apporteur: null, prixVente: null };
const depasse: Vente = { ...compromis, id: 30, libelle: 'LEROY / PETIT', prixVente: 380000,
  dossier: { ...compromis.dossier!, adresseBien: '8 rue B, Puteaux', dateActePrevue: '2026-10-01', personnes: [{ id: 9, role: 'vendeur', nom: 'LEROY', telephone: null, email: null, adresse: null },
    { id: 10, role: 'acquereur', nom: 'PETIT', telephone: null, email: null, adresse: null }] } };
let listeCompromis: Vente[] = [compromis];
let listeAnnules: Vente[] = [];
const references = { lotD: true, prixVente: true, annulation: true, negociateurs: [JB, MY, AU], apporteurs: [{ id: 4, nom: 'Julien Deblois' }], personnes: [{ id: 3, nom: 'DUPONT', telephone: '06 12 34 56 78', email: 'p.dupont@exemple.fr', adresse: null }] };
const societe = { disponible: true, societe: 'criterimmo', aujourdhui: '2026-10-27', ventes: [], retrocessions: [], aRattacher: [], doubles: [] };
const global = { disponible: true, aujourdhui: '2026-10-27', location: {}, gestion: [], ventes: [] };

let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
let reponsePost: { etat: string; motif?: string };
beforeEach(() => {
  posts = []; reponsePost = { etat: 'ok' }; listeCompromis = [compromis]; listeAnnules = []; references.annulation = true;
  window.history.replaceState(null, '', '/');
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    // LOT H — la Base Adresse Nationale, simulée (le composant d'autocomplétion de l'administration l'interroge).
    if (String(url).startsWith('https://api-adresse.data.gouv.fr/')) {
      return { ok: true, status: 200, json: async () => ({ features: [{ properties: { label: '12 Rue de la République 92800 Puteaux', name: '12 Rue de la République', postcode: '92800', city: 'Puteaux' } }] }) };
    }
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return { ok: true, status: 200, json: async () => ({ ...reponsePost, data: null }) }; }
    const u = String(url);
    const data = u.includes('vue=compromis') ? { disponible: true, aujourdhui: '2026-10-27', societe: 'criterimmo', compromis: listeCompromis, annules: listeAnnules, ...references }
      : u.includes('vue=references') ? { disponible: true, aujourdhui: '2026-10-27', ...references } : u.includes('vue=global') ? global : u.includes('vue=journal') ? [] : societe;
    return { ok: true, status: 200, json: async () => ({ etat: 'ok', data }) };
  }) as unknown as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-27T10:00:00Z'));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const texte = (sel: string): string => container.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
const saisir = async (sel: string, valeur: string) => {
  const el = container.querySelector(sel) as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { set.call(el, valeur); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const ouvrir = async () => {
  await act(async () => { root.render(createElement(EcranSociete, { societe: 'criterimmo' })); });
  await calmer();
};

const deplier = async (id: number) => cliquer(`[data-deplier="compromis-${id}"]`);

describe('l’onglet « Compromis »', () => {
  it('placé AVANT « Le mois » et « L’année » ; LOT L : on ARRIVE sur « Compromis »', async () => {
    await ouvrir();
    expect([...container.querySelectorAll('.trx-vues [role="tab"]')].map((b) => b.textContent)).toEqual(['Compromis', 'Le mois', 'L’année']);
    expect(container.querySelector('[data-vue="compromis"]')!.getAttribute('aria-selected')).toBe('true');
  });
  it('🔴 LOT F — carte repliée : à gauche le titre puis adresse · prix · acte au plus tard ; à droite TTC (vert, « TTC »), HT, % du prix', async () => {
    listeCompromis = [{ ...compromis, prixVente: 240000 }];
    await ouvrir();
    await cliquer('[data-vue="compromis"]');
    const carte = '[data-compromis="41"]';
    expect(texte(`${carte} [data-carte="titre"]`)).toBe('DUPONT / MARTIN');
    expect(texte(`${carte} [data-carte-ligne="infos"]`)).toBe('1 rue A, Puteaux · prix 240 000,00 € · acte au plus tard le 15/01/2027');
    const montants = container.querySelector(`${carte} [data-carte="montants"]`)!;
    expect(montants.closest('.tdb-replie-resume')).not.toBeNull(); // le bloc de droite, aligné à droite
    expect([...montants.children].map((x) => x.textContent!.replace(/\s/g, ' '))).toEqual(['12 000,00 € TTC', '10 000,00 € HT', '5,00 % du prix']);
    expect(montants.querySelector('[data-carte="commission"]')!.className).toContain('trx-commission');
    // toute la ligne est le bouton qui déplie ; replié, le détail n'est pas là
    expect(montants.closest('button[data-deplier="compromis-41"]')).not.toBeNull();
    expect(container.querySelector(`${carte} [data-acte-signe]`)).toBeNull();
    await deplier(41);
    expect(container.querySelector(`${carte} [data-acte-signe]`)).not.toBeNull();
  });
  it('sans libellé propre : « VENDEURS / ACQUÉREURS », tirets entre les personnes d’un même côté ; le % seulement avec un prix', async () => {
    const deux = { ...compromis, libelle: 'DUPONT, DURANT / MARTIN', prixVente: null, dossier: { ...compromis.dossier!, personnes: [...compromis.dossier!.personnes,
      { id: 11, role: 'vendeur' as const, nom: 'DURANT', telephone: null, email: null, adresse: null }] } };
    listeCompromis = [deux];
    await ouvrir();
    await cliquer('[data-vue="compromis"]');
    expect(texte('[data-compromis="41"] [data-carte="titre"]')).toBe('DUPONT-DURANT / MARTIN');
    expect(container.querySelector('[data-compromis="41"] [data-carte="pct-prix"]')).toBeNull();
    expect(texte('[data-compromis="41"] [data-carte="prix"]')).toBe('prix à renseigner');
  });
  it('ce qui manque s’écrit « à renseigner » ; un compromis importé : son libellé en titre, « Aucun vendeur enregistré », « Libellé du fichier »', async () => {
    listeCompromis = [importe];
    await ouvrir();
    await cliquer('[data-vue="compromis"]');
    expect(texte('[data-compromis="12"] [data-carte="titre"]')).toBe('MARMONIER');
    expect(texte('[data-compromis="12"] [data-carte-ligne="infos"]')).toBe('adresse à renseigner · prix à renseigner · acte au plus tard le : à renseigner');
    expect(texte('[data-compromis="12"]')).not.toMatch(/(^|\s)—(\s|$)/);
    await deplier(12);
    expect(texte('[data-aucune-personne="vendeur"]')).toBe('Aucun vendeur enregistré');
    expect(texte('[data-aucune-personne="acquereur"]')).toBe('Aucun acquéreur enregistré');
    expect(container.querySelector('[data-colonne="vendeur"] [data-ajouter-personne-carte="vendeur"]')).not.toBeNull();
    expect(texte('[data-info="libelle"]')).toBe('Libellé du fichierMARMONIER');
    // LOT H — les négociateurs ne sont plus répétés dans les informations communes : ils sont sous les deux colonnes.
    expect(texte('[data-compromis="12"] [data-negociateur-carte="entree"]')).toBe('+ Ajouter un négociateur');
  });
  it('déplié : colonnes Vendeurs et Acquéreurs (téléphone et e-mail cliquables), puis les informations communes et la barre d’actions', async () => {
    await ouvrir();
    await cliquer('[data-vue="compromis"]');
    await deplier(41);
    expect([...container.querySelectorAll('[data-colonne]')].map((x) => x.getAttribute('data-colonne'))).toEqual(['vendeur', 'acquereur']);
    expect(container.querySelector('[data-colonne="vendeur"] a[href="tel:0612345678"]')).not.toBeNull();
    expect(container.querySelector('[data-colonne="vendeur"] a[href="mailto:p.dupont@exemple.fr"]')).not.toBeNull();
    expect(texte('[data-colonne="acquereur"]')).toContain('MARTIN');
    const ordre = [...container.querySelectorAll('[data-compromis="41"] [data-colonne], [data-compromis="41"] [data-informations-communes], [data-compromis="41"] .trx-barre-actions')]
      .map((x) => x.getAttribute('data-colonne') ?? (x.hasAttribute('data-informations-communes') ? 'communes' : 'actions'));
    expect(ordre).toEqual(['vendeur', 'acquereur', 'communes', 'actions']);
    expect(texte('[data-repartition-compromis]')).toContain('Part extérieure — Agence du Parc');
  });
  it('« + Ajouter un vendeur » depuis la carte : le formulaire s’ouvre sur une ligne neuve, la personne s’ajoute aux autres', async () => {
    await ouvrir();
    await cliquer('[data-vue="compromis"]');
    await deplier(41);
    await cliquer('[data-colonne="vendeur"] [data-ajouter-personne-carte="vendeur"]');
    const neuve = document.activeElement as HTMLInputElement;
    expect(neuve.getAttribute('data-personne-nom')).not.toBeNull();
    expect(neuve.value).toBe('');
    await saisir(`[data-personne-nom="${neuve.getAttribute('data-personne-nom')}"]`, 'DURANT');
    await cliquer('[data-enregistrer-dossier]');
    const envoi = posts.at(-1) as { action: string; id: number; dossier: { personnes: { id: number | null; role: string; nom: string }[] } };
    expect([envoi.action, envoi.id]).toEqual(['dossier-enregistrer', 41]);
    expect(envoi.dossier.personnes.map((p) => [p.role, p.nom, p.id])).toEqual([['vendeur', 'DUPONT', 3], ['acquereur', 'MARTIN', 8], ['vendeur', 'DURANT', null]]);
  });
  it('une date butoir dépassée est en rouge, avec le mot « dépassée » ; le tri : la plus proche d’abord, sans date à la fin', async () => {
    listeCompromis = [importe, compromis, depasse];
    await ouvrir();
    await cliquer('[data-vue="compromis"]');
    expect([...container.querySelectorAll('[data-compromis]')].map((x) => x.getAttribute('data-compromis'))).toEqual(['30', '41', '12']);
    const b = container.querySelector('[data-compromis="30"] [data-carte="butoir"]')!;
    expect(b.className).toBe('trx-depassee');
    expect(b.textContent).toBe('acte au plus tard le 01/10/2026 — dépassée');
    expect(container.querySelector('[data-compromis="41"] [data-carte="butoir"]')!.className).toBe('');
  });
  it('déplié : personnes et coordonnées, bien, dates, commission, négociateurs, apporteur, répartition par partie et par société ; les totaux', async () => {
    await ouvrir();
    await cliquer('[data-vue="compromis"]');
    expect(texte('[data-nb-compromis]')).toBe('1');
    expect(texte('[data-commission-en-cours]')).toBe('sur 10 000,00 € HT de commission · parts extérieures (hors CA) : 1 600,00 € HT');
    // (12 000 − 2 400) ÷ 1,2 = 8 000 HT nets ; 40 % = 3 200 nets — LOT I : le CA est la part (40 %) de la commission entière, 4 000 HT,
    // dont la quote-part de l'apporteur (800 HT) est une commission versée : le solde redonne la part nette d'avant, 3 200.
    expect(texte('[data-part-compromis="criterimmo"]')).toBe('Part CRITERIMMO : part de la société après répartition');
    expect(texte('[data-ca-ht]')).toBe('4 000,00 € HT');
    expect(texte('[data-solde-ht]')).toBe('3 200,00 € HT');
    await deplier(41);
    const fiche = texte('[data-compromis="41"]');
    for (const m of ['DUPONT', '06 12 34 56 78', 'p.dupont@exemple.fr', 'MARTIN', '1 rue A, Puteaux', '20/10/2026', '15/01/2027', '10 000,00 € HT', '12 000,00 € TTC',
      'Jean-Baptiste PONS', 'Mylène EBERLIN', 'Julien Deblois', '2 400,00 € TTC (2 000,00 € HT)', 'Part extérieure — Agence du Parc', '1 600,00 € HT']) expect(fiche).toContain(m);
    expect(texte('[data-part-societe-compromis="macj"]')).toBe('3 200,00 € HT');
  });
  it('« Acte signé » envoie la date de l’acte ; « Revenir en compromis » le défait', async () => {
    await ouvrir();
    await cliquer('[data-vue="compromis"]');
    await deplier(41);
    await cliquer('[data-acte-signe="41"]');
    await saisir('[data-date-acte]', '2026-12-18');
    await cliquer('[data-confirmer-acte]');
    expect(posts).toContainEqual({ action: 'acte-signe', id: 41, dateActe: '2026-12-18' });
    expect(texte('[data-acte-fait]')).toContain('vente encaissée au mois de l’acte');
    await cliquer('[data-revenir-compromis]');
    expect(posts).toContainEqual({ action: 'retour-compromis', id: 41 });
  });
  it('le CA global réunit les deux sociétés dans son onglet « Compromis »', async () => {
    await act(async () => { root.render(createElement(EcranGlobal)); });
    await calmer();
    expect([...container.querySelectorAll('[role="tab"]')].slice(0, 2).map((b) => b.textContent)).toEqual(['Compromis', 'Le mois et l’année']);
    await cliquer('[data-vue="compromis"]');
    expect(container.querySelector('[data-onglet-compromis="tous"]')).not.toBeNull();
    expect(texte('[data-part-compromis="macj"]')).toBe('Part MACJ : 4 000,00 € HT');
  });
});

describe('🔴 LOT E — la répartition, toujours visible et modifiable', () => {
  const nouveau = async () => {
    await ouvrir();
    await cliquer('[data-vue="compromis"]');
    await cliquer('[data-nouveau-compromis]');
    await saisir('[data-champ="commission"]', '12000');
  };
  const choisir = async (champ: string, id: number) => {
    await cliquer(`[data-champ="${champ}"]`);
    await cliquer(`[role="option"][data-option="${id}"]`);
  };
  const pcts = (): string[] => [...container.querySelectorAll('[data-partie-pct]')].map((i) => (i as HTMLInputElement).value);
  const enregistrer = () => container.querySelector('[data-enregistrer-dossier]') as HTMLButtonElement;

  it('le tableau est là DÈS l’ouverture, sans négociateur : « Entrée » et « Sortie », % et € HT, une ligne Total', async () => {
    await nouveau();
    expect([...container.querySelectorAll('[data-ligne-partie]')].map((x) => x.getAttribute('data-partie'))).toEqual(['entree', 'sortie']);
    expect(pcts()).toEqual(['50', '50']);
    expect([...container.querySelectorAll('[data-partie-eur]')].map((i) => (i as HTMLInputElement).value)).toEqual(['5000', '5000']);
    expect(texte('[data-societe-partie="0"]')).toBe('négociateur à choisir');
    expect(texte('[data-total-pct]')).toBe('100 %');
    expect(texte('[data-total-repartition]')).toContain('sur 10 000,00 € HT de commission nette');
    expect(container.querySelector('[data-revenir-5050]')).not.toBeNull();
    expect(enregistrer().disabled).toBe(false);
  });
  it('deux négociateurs ⇒ 50/50 (chacun sa société) ; le même ⇒ 100 / 0', async () => {
    await nouveau();
    await choisir('entree', 5);
    expect(pcts()).toEqual(['100', '0']);
    await choisir('sortie', 7);
    expect(pcts()).toEqual(['50', '50']);
    expect([texte('[data-societe-partie="0"]'), texte('[data-societe-partie="1"]')]).toEqual(['CRITERIMMO', 'MACJ']);
    expect(texte('[data-parts-societes]')).toContain('Part CRITERIMMO : 5 000,00 € HT · Part MACJ : 5 000,00 € HT');
    await choisir('sortie', 5);
    expect(pcts()).toEqual(['100', '0']);
  });
  it('saisie en % ou en € HT : l’un recalcule l’autre', async () => {
    await nouveau();
    await choisir('entree', 5); await choisir('sortie', 7);
    await saisir('[data-partie-pct="0"]', '60');
    expect((container.querySelector('[data-partie-eur="0"]') as HTMLInputElement).value).toBe('6000');
    await saisir('[data-partie-eur="1"]', '4000');
    expect((container.querySelector('[data-partie-pct="1"]') as HTMLInputElement).value).toBe('40');
    expect(texte('[data-total-pct]')).toBe('100 %');
    expect(enregistrer().disabled).toBe(false);
  });
  it('une partie extérieure s’ajoute (nom, %, €) et se retire par sa croix', async () => {
    await nouveau();
    await choisir('entree', 5); await choisir('sortie', 7);
    await cliquer('[data-ajouter-exterieure]');
    expect([...container.querySelectorAll('[data-ligne-partie]')].map((x) => x.getAttribute('data-partie'))).toEqual(['entree', 'sortie', 'exterieure']);
    await saisir('[data-partie-pct="0"]', '40'); await saisir('[data-partie-pct="1"]', '40'); await saisir('[data-partie-pct="2"]', '20');
    await saisir('[data-partie-nom]', 'Agence du Parc');
    expect(texte('[data-parts-societes]')).toContain('part extérieure (hors CA) : 2 000,00 € HT');
    expect(container.querySelector('[data-retirer-exterieure]')!.getAttribute('aria-label')).toBe('Retirer cette partie extérieure');
    await cliquer('[data-retirer-exterieure]');
    expect([...container.querySelectorAll('[data-ligne-partie]')].map((x) => x.getAttribute('data-partie'))).toEqual(['entree', 'sortie']);
    await cliquer('[data-revenir-5050]');
    expect(pcts()).toEqual(['50', '50']);
  });
  it('un total ≠ 100 % : message rouge, « Enregistrer » désactivé avec l’explication, la saisie reste', async () => {
    await nouveau();
    await choisir('entree', 5); await choisir('sortie', 7);
    await cliquer('[data-ajouter-exterieure]');
    await saisir('[data-partie-pct="0"]', '60');
    await saisir('[data-partie-pct="1"]', '50');
    await saisir('[data-partie-pct="2"]', '0');
    expect(texte('[data-motif-repartition]')).toMatch(/fait 110 %/);
    expect(container.querySelector('[data-motif-repartition]')!.className).toBe('trx-alerte');
    expect(enregistrer().disabled).toBe(true);
    expect(texte('[data-enregistrer-bloque]')).toMatch(/exactement 100 %/);
    expect(pcts()).toEqual(['60', '50', '0']);
  });
  it('un négociateur sans société : proposé, signalé, et la répartition dit pourquoi elle ne peut pas l’affecter', async () => {
    await nouveau();
    await cliquer('[data-champ="entree"]');
    expect(texte('[role="option"][data-option="4"]')).toBe('Augustin Jorel — société à renseigner dans Comptes');
    await cliquer('[role="option"][data-option="4"]');
    expect(texte('[data-societe-partie="0"]')).toBe('⚠ société à renseigner dans Comptes');
    expect(texte('[data-explication-societe="0"]')).toMatch(/ne peut pas affecter cette part : Augustin Jorel n’a pas de société/);
  });
  it('le prix de vente est envoyé ; un refus du serveur est dit, la saisie reste', async () => {
    await nouveau();
    await saisir('[data-personne-nom="0"]', 'DUPONT');
    await saisir('[data-champ="prix-vente"]', '450000');
    reponsePost = { etat: 'refus', motif: 'Refus de test.' };
    await cliquer('[data-enregistrer-dossier]');
    expect(posts.at(-1)).toMatchObject({ action: 'dossier-enregistrer', id: null, dossier: { societe: 'criterimmo', statut: 'compromis', honorairesTtc: '12000', prixVente: '450000' } });
    expect(texte('[data-motif-dossier]')).toBe('Refus de test.');
    expect((container.querySelector('[data-personne-nom="0"]') as HTMLInputElement).value).toBe('DUPONT');
  });
  it('choisir une personne de l’annuaire reprend sa fiche (aucun doublon)', async () => {
    await nouveau();
    await saisir('[data-personne-nom="0"]', 'DUPONT — 06 12 34 56 78 — p.dupont@exemple.fr');
    await cliquer('[data-enregistrer-dossier]');
    const p = (posts.at(-1)!.dossier as { personnes: { id: number | null; nom: string }[] }).personnes[0];
    expect(p).toMatchObject({ id: 3, nom: 'DUPONT' });
  });
});

describe('🔴 LOT G — auto-compensation à deux parties', () => {
  const nouveau = async () => {
    await ouvrir();
    await cliquer('[data-vue="compromis"]');
    await cliquer('[data-nouveau-compromis]');
    await saisir('[data-champ="commission"]', '12000');
    await cliquer('[data-champ="entree"]'); await cliquer('[role="option"][data-option="5"]');
    await cliquer('[data-champ="sortie"]'); await cliquer('[role="option"][data-option="7"]');
  };
  const pcts = (): string[] => [...container.querySelectorAll('[data-partie-pct]')].map((i) => (i as HTMLInputElement).value);
  it('en % : 60 → l’autre passe à 40 ; borné entre 0 et 100', async () => {
    await nouveau();
    await saisir('[data-partie-pct="0"]', '60');
    expect(pcts()).toEqual(['60', '40']);
    await saisir('[data-partie-pct="1"]', '150');
    expect(pcts()).toEqual(['0', '100']);
    expect(texte('[data-total-pct]')).toBe('100 %');
  });
  it('en € HT : 2 500 € sur 10 000 € nets → 25 %, l’autre 75 %', async () => {
    await nouveau();
    await saisir('[data-partie-eur="1"]', '2500');
    expect(pcts()).toEqual(['75', '25']);
    expect(texte('[data-total-pct]')).toBe('100 %');
  });
  it('à trois parties, pas de compensation ; retirer la troisième revient à deux, la première garde sa valeur', async () => {
    await nouveau();
    await cliquer('[data-ajouter-exterieure]');
    await saisir('[data-partie-pct="0"]', '70');
    expect(pcts()).toEqual(['70', '50', '0']);
    expect(texte('[data-motif-repartition]')).toMatch(/fait 120 %/);
    await cliquer('[data-retirer-exterieure]');
    expect(pcts()).toEqual(['70', '30']);
    expect(container.querySelector('[data-motif-repartition]')).toBeNull();
  });
});

describe('🔴 LOT G — le négociateur de chaque côté, depuis la carte', () => {
  const ouvrirCarte = async (id: number) => { await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(id); };
  const choisirEtValider = async (cote: string, id: number) => {
    await cliquer(`[data-negociateur-carte="${cote}"]`);
    await cliquer(`[data-liste-negociateur="${cote}"]`);
    await cliquer(`[role="option"][data-option="${id}"]`);
    await cliquer('[data-valider-negociateur]');
  };
  type Envoi = { action: string; id: number; dossier: { entreeId: number | null; sortieId: number | null; parties: { sorte: string; compteId: number | null; pourcentage: number | null }[] } };
  it('« Vendeurs » = négociateur d’ENTRÉE, « Acquéreurs » = de SORTIE (même donnée que le formulaire)', async () => {
    listeCompromis = [importe];
    await ouvrirCarte(12);
    expect(texte('[data-colonne="vendeur"] [data-negociateur-carte="entree"]')).toBe('+ Ajouter un négociateur');
    expect(texte('[data-colonne="acquereur"] [data-negociateur-carte="sortie"]')).toBe('+ Ajouter un négociateur');
    await choisirEtValider('entree', 5);
    let e = posts.at(-1) as Envoi;
    expect([e.action, e.id, e.dossier.entreeId, e.dossier.sortieId]).toEqual(['dossier-enregistrer', 12, 5, null]);
    expect(e.dossier.parties.map((p) => [p.sorte, p.compteId, p.pourcentage])).toEqual([['entree', 5, 100]]);
    await choisirEtValider('sortie', 7);
    e = posts.at(-1) as Envoi;
    expect([e.dossier.entreeId, e.dossier.sortieId]).toEqual([null, 7]);
  });
  it('choisi : « Négociateur : Prénom NOM (société) (part %) », relu identique dans « Modifier »', async () => {
    await ouvrirCarte(41);
    // LOT J — sa part de la vente entre parenthèses (40 / 40, la partie extérieure a 20 %).
    expect(texte('[data-colonne="vendeur"] [data-negociateur-carte="entree"]')).toBe('Négociateur : Jean-Baptiste PONS (CRITERIMMO) (40 %)');
    expect(texte('[data-colonne="acquereur"] [data-negociateur-carte="sortie"]')).toBe('Négociateur : Mylène EBERLIN (MACJ) (40 %)');
    await cliquer('[data-modifier-compromis="41"]');
    expect(texte('[data-champ="entree"]')).toContain('Jean-Baptiste PONS');
    expect(texte('[data-champ="sortie"]')).toContain('Mylène EBERLIN');
  });
  it('changer en gardant deux parties conserve la répartition personnalisée (60/40)', async () => {
    const deux = { ...compromis, repartition: { retroApporteurTtc: 0, parties: [compromis.repartition!.parties[0], compromis.repartition!.parties[1]]
      .map((p, i) => ({ ...p, pourcentage: i === 0 ? 60 : 40 })) } };
    listeCompromis = [deux];
    await ouvrirCarte(41);
    await choisirEtValider('sortie', 4);
    const e = posts.at(-1) as Envoi;
    expect(e.dossier.sortieId).toBe(4);
    expect(e.dossier.parties.map((p) => [p.compteId, p.pourcentage])).toEqual([[5, 60], [4, 40]]);
  });
  it('retirer un négociateur quand la répartition ne fait plus 100 % : rien n’est envoyé, le formulaire s’ouvre « à revoir »', async () => {
    await ouvrirCarte(41); // 40 / 40 / 20 avec une partie extérieure
    const avant = posts.length;
    await cliquer('[data-negociateur-carte="sortie"]');
    await cliquer('[data-retirer-negociateur]');
    expect(posts.length).toBe(avant);
    expect(texte('[data-message-revoir]')).toMatch(/négociateur de sortie a changé : la répartition est à revoir/);
    expect((container.querySelector('[data-enregistrer-dossier]') as HTMLButtonElement).disabled).toBe(true);
  });
  it('retirer le négociateur d’un côté (deux parties) : l’autre reçoit 100 %', async () => {
    const deux = { ...compromis, repartition: { retroApporteurTtc: 0, parties: [compromis.repartition!.parties[0], compromis.repartition!.parties[1]] } };
    listeCompromis = [deux];
    await ouvrirCarte(41);
    await cliquer('[data-negociateur-carte="sortie"]');
    await cliquer('[data-retirer-negociateur]');
    const e = posts.at(-1) as Envoi;
    expect([e.dossier.entreeId, e.dossier.sortieId]).toEqual([5, null]);
    expect(e.dossier.parties.map((p) => [p.compteId, p.pourcentage])).toEqual([[5, 100]]);
  });
});

describe('🔴 LOT G — « Annulation »', () => {
  const modale = async () => { await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(41); await cliquer('[data-annulation-compromis="41"]'); };
  it('le bouton : sur la ligne des actions, le mot « Annulation » ; la modale propose « Défaut de crédit » et la date du jour', async () => {
    await modale();
    const b = container.querySelector('.trx-barre-actions [data-annulation-compromis="41"]')!;
    expect([b.textContent, b.className]).toEqual(['Annulation', 'trx-btn-annulation']);
    expect((document.querySelector('[data-motif="defaut_credit"]') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('[data-date-annulation]') as HTMLInputElement).value).toBe('2026-10-27');
  });
  it('défaut de crédit, avec une note : envoyé', async () => {
    await modale();
    const note = document.querySelector('[data-note-annulation]') as HTMLTextAreaElement;
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => { set.call(note, 'Refus de la banque.'); note.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { (document.querySelector('[data-confirmer-annulation]') as HTMLElement).click(); }); await calmer();
    expect(posts.at(-1)).toEqual({ action: 'compromis-annuler', id: 41, annulation: { motif: 'defaut_credit', autre: '', date: '2026-10-27', note: 'Refus de la banque.' } });
    expect(document.querySelector('[data-modale-annulation]')).toBeNull();
  });
  it('« Autre motif » : le texte est obligatoire', async () => {
    await modale();
    await act(async () => { (document.querySelector('[data-motif="autre"]') as HTMLElement).click(); }); await calmer();
    const avant = posts.length;
    await act(async () => { (document.querySelector('[data-confirmer-annulation]') as HTMLElement).click(); }); await calmer();
    expect(posts.length).toBe(avant);
    expect(document.querySelector('[data-motif-refus-annulation]')!.textContent).toMatch(/Écrivez le motif/);
    const champ = document.querySelector('[data-motif-autre]') as HTMLInputElement; // la modale est dans un portail, hors du conteneur
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'Désistement de l’acquéreur'); champ.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { (document.querySelector('[data-confirmer-annulation]') as HTMLElement).click(); }); await calmer();
    expect(posts.at(-1)).toMatchObject({ action: 'compromis-annuler', annulation: { motif: 'autre', autre: 'Désistement de l’acquéreur' } });
  });
  it('un compromis annulé sort des compromis en cours et des totaux ; « Compromis annulés (1) » le montre et le rétablit', async () => {
    listeAnnules = [{ ...compromis, id: 77, libelle: 'BERNARD / THOMAS', statut: 'annulee', annulation: { date: '2026-10-20', motif: 'Défaut de crédit', note: 'Refus de la banque.' } }];
    listeCompromis = [importe];
    await ouvrir(); await cliquer('[data-vue="compromis"]');
    expect(texte('[data-nb-compromis]')).toBe('1');
    expect(texte('[data-commission-en-cours]')).toBe('sur 11 666,67 € HT de commission');
    expect(container.querySelector('[data-compromis="77"]')).toBeNull();
    expect(texte('#trx-compromis-annules .tdb-replie-mot')).toBe('Compromis annulés (1)');
    await cliquer('[data-deplier="compromis-annules"]');
    expect(texte('[data-compromis-annule="77"] [data-annulation-detail]')).toBe('Annulé le 20/10/2026 — motif : Défaut de crédit');
    expect(texte('[data-compromis-annule="77"] [data-annulation-note]')).toBe('Note : Refus de la banque.');
    await cliquer('[data-retablir-compromis="77"]');
    expect(posts.at(-1)).toEqual({ action: 'compromis-retablir', id: 77 });
  });
  it('sans la migration 436 : le bouton est visible mais inactif, avec la mention', async () => {
    references.annulation = false;
    await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(41);
    expect((container.querySelector('[data-annulation-compromis="41"]') as HTMLButtonElement).disabled).toBe(true);
    expect(texte('[data-annulation-indisponible]')).toMatch(/migration 436/);
  });
});

describe('🔴 LOT H — retouches de l’onglet Compromis', () => {
  it('l’adresse du bien passe par l’autocomplétion d’adresse partagée (Base Adresse Nationale)', async () => {
    await ouvrir(); await cliquer('[data-vue="compromis"]'); await cliquer('[data-nouveau-compromis]');
    const champ = container.querySelector('[data-champ-adresse-bien] input#trx-adresse-bien') as HTMLInputElement;
    expect(champ.getAttribute('role')).toBe('combobox');
    await saisir('#trx-adresse-bien', '12 rue de la Rép');
    await act(async () => { await new Promise((r) => setTimeout(r, 320)); });
    await calmer();
    expect(vi.mocked(globalThis.fetch).mock.calls.some(([u]) => String(u).startsWith('https://api-adresse.data.gouv.fr/search/?q=12%20rue%20de%20la%20R'))).toBe(true);
    const proposition = container.querySelector('.cab-prop') as HTMLButtonElement;
    await act(async () => { proposition.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }); await calmer();
    expect(champ.value).toMatch(/^12 Rue de la République, 92800 PUTEAUX$/i);
    await saisir('[data-personne-nom="0"]', 'DUPONT');
    await saisir('[data-champ="commission"]', '12000');
    await cliquer('[data-enregistrer-dossier]');
    expect((posts.at(-1) as { dossier: { adresseBien: string } }).dossier.adresseBien).toMatch(/^12 Rue de la République, 92800 PUTEAUX$/i);
  });
  it('aucun champ répété : les informations communes ne gardent que le taux de commission, la date du compromis, l’apporteur (et le libellé d’un import)', async () => {
    listeCompromis = [{ ...compromis, prixVente: 240000 }, importe];
    await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(41); await deplier(12);
    const intitules = (id: number) => [...container.querySelectorAll(`[data-compromis="${id}"] [data-informations-communes] dt`)].map((x) => x.textContent);
    expect(intitules(41)).toEqual(['Taux de commission', 'Dates', 'Apporteur']); // LOT K : « Dates » (compromis signé + vente définitive)
    expect(intitules(12)).toEqual(['Libellé du fichier', 'Taux de commission', 'Dates', 'Apporteur']);
    expect(texte('[data-compromis="41"] [data-info="taux"] dd')).toBe('5,00 % du prix de vente');
    expect(texte('[data-compromis="12"] [data-info="taux"] dd')).toBe('calculé dès la saisie du prix de vente');
    // ce qui est en tête de carte n'est pas répété dans le corps
    const corps = texte('[data-compromis="41"] [data-informations-communes]');
    // LOT K — accord d'Arno : la date butoir revient dans la case « Dates » (le reste du « zéro doublon » tient).
    for (const x of ['1 rue A, Puteaux', '240 000,00 €', '12 000,00 € TTC']) expect(corps).not.toContain(x);
  });
  it('plus de « (prévisionnel AAAA) », ni dans l’onglet Compromis ni dans « L’année »', async () => {
    listeCompromis = [importe];
    await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(12);
    expect(container.textContent).not.toMatch(/\(prévisionnel/);
    await cliquer('[data-vue="annee"]');
    expect(container.textContent).not.toMatch(/\(prévisionnel/);
  });
  it('« + Nouvelle vente » a disparu ; une vente se crée par « + Nouveau compromis » puis « Acte signé »', async () => {
    await ouvrir();
    expect(container.querySelector('[data-nouvelle-vente]')).toBeNull();
    expect([...container.querySelectorAll('button')].some((b) => /Nouvelle vente/.test(b.textContent ?? ''))).toBe(false);
    await cliquer('[data-vue="compromis"]');
    expect(container.querySelector('[data-nouveau-compromis]')).not.toBeNull();
    await deplier(41);
    await cliquer('[data-acte-signe="41"]');
    await cliquer('[data-confirmer-acte]');
    expect(posts.at(-1)).toEqual({ action: 'acte-signe', id: 41, dateActe: '2026-10-27' });
  });
});

describe('🔴 LOT I — commissions versées (HT / TTC) et les 4 tuiles', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const onglet = async () => { await ouvrir(); await cliquer('[data-vue="compromis"]'); };
  const choisir = async (champ: string, id: number) => { await cliquer(`[data-champ="${champ}"]`); await cliquer(`[role="option"][data-option="${id}"]`); };
  const presse = (champ: string, u: string) => container.querySelector(`[data-unite-de="${champ}"][data-unite="${u}"]`)!.getAttribute('aria-pressed');
  // 41 : 12 000 TTC ; JB (CRITERIMMO) entrée, commission 1 000 HT ; Mylène (MACJ) sortie, commission 600 TTC.
  const avecCommissions: Vente = { ...compromis, lignes: [
    { id: 1, negociateur: JB.nom, role: 'negociateur', montantTtc: 1200, montantHt: 1000, cote: 'entree', nature: 'compromis', compte: false, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null },
    { id: 2, negociateur: MY.nom, role: 'negociateur', montantTtc: 600, montantHt: null, cote: 'sortie', nature: 'compromis', compte: false, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null }] };

  it('QUATRE tuiles dans l’ordre ; le CA en vert avec « TTC », les commissions en rouge avec « TTC versées », le HT dessous', async () => {
    listeCompromis = [avecCommissions];
    await onglet();
    expect([...container.querySelectorAll('[data-totaux-compromis] .tdb-tuile-mot')].map((x) => x.textContent)).toEqual(['Compromis en cours', 'Chiffre d’affaires', 'Commissions versées', 'Solde net']);
    const ca = container.querySelector('[data-ca-ttc]')!;
    expect(ca.className).toContain('trx-vert');
    expect(texte('[data-ca-ttc]')).toBe('4 800,00 € TTC'); // 40 % de 10 000 HT = 4 000 HT
    expect(texte('[data-ca-ht]')).toBe('4 000,00 € HT');
    const co = container.querySelector('[data-commissions-ttc]')!;
    expect(co.className).toContain('trx-rouge');
    // JB 1 000 HT + apporteur 40 % × 2 000 HT = 800 HT ⇒ 1 800 HT, 2 160 TTC (Mylène est MACJ)
    expect(texte('[data-commissions-ttc]')).toBe('2 160,00 € TTC versées');
    expect(texte('[data-commissions-ht]')).toBe('1 800,00 € HT');
    expect(texte('[data-solde-ht]')).toBe('2 200,00 € HT');
    expect(texte('[data-solde-ttc]')).toBe('2 640,00 € TTC');
    expect(texte('[data-part-compromis="criterimmo"]')).toBe('Part CRITERIMMO : part de la société après répartition');
  });
  it('« Commissions versées » : le détail négociateurs / apporteurs au toucher (et au survol)', async () => {
    listeCompromis = [avecCommissions];
    await onglet();
    expect(container.querySelector('[data-detail-commissions]')).toBeNull();
    await cliquer('[data-tuile="commissions"]');
    expect(container.querySelector('[data-tuile="commissions"]')!.getAttribute('aria-expanded')).toBe('true');
    expect(texte('[data-detail="negociateurs"]')).toBe('Négociateurs : 1 000,00 € HT (1 200,00 € TTC)');
    expect(texte('[data-detail="apporteurs"]')).toBe('Apporteurs : 800,00 € HT (960,00 € TTC)');
  });
  it('un solde négatif s’affiche tel quel, avec le signe moins', async () => {
    listeCompromis = [{ ...avecCommissions, lignes: [{ ...avecCommissions.lignes[0], montantHt: 9000, montantTtc: 10800 }] }];
    await onglet();
    expect(texte('[data-solde-ht]')).toMatch(/^[-−]5 800,00 € HT$/);
  });
  it('les compromis annulés sont exclus des tuiles', async () => {
    listeCompromis = [avecCommissions];
    listeAnnules = [{ ...compromis, id: 77, statut: 'annulee', annulation: { date: '2026-10-20', motif: 'Défaut de crédit', note: null } }];
    await onglet();
    expect(texte('[data-nb-compromis]')).toBe('1');
    expect(texte('[data-ca-ht]')).toBe('4 000,00 € HT');
  });
  it('nouveau compromis : la rétrocession de l’apporteur proposée en HT ; sans la 437, en TTC (HT grisé)', async () => {
    await onglet();
    await cliquer('[data-nouveau-compromis]');
    expect(presse('retro', 'ht')).toBe('true');
    expect(presse('retro', 'ttc')).toBe('false');
    await cliquer('.tdb-x');
    delete ref.uniteCommission;
    await act(async () => { root.unmount(); }); root = createRoot(container);
    await onglet();
    await cliquer('[data-nouveau-compromis]');
    expect(presse('retro', 'ttc')).toBe('true');
    expect((container.querySelector('[data-unite-de="retro"][data-unite="ht"]') as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('[data-commission-indisponible]')).not.toBeNull();
  });
  it('un montant déjà enregistré garde son unité d’origine (TTC) : rien n’est converti', async () => {
    await onglet();
    await deplier(41);
    await cliquer('[data-modifier-compromis="41"]');
    expect(presse('retro', 'ttc')).toBe('true');
    expect((container.querySelector('[data-champ="retro"]') as HTMLInputElement).value).toBe('2400');
    expect(texte('[data-equivalent="retro"]')).toBe('soit 2 000,00 € HT');
    await cliquer('[data-enregistrer-dossier]');
    const d = (posts.at(-1) as { dossier: Record<string, unknown> }).dossier;
    expect([d.retroApporteurTtc, d.retroApporteurUnite]).toEqual(['2400', 'ttc']);
  });
  it('le formulaire : une commission par côté, chacune HT ou TTC, avec son équivalent', async () => {
    await onglet();
    await cliquer('[data-nouveau-compromis]');
    await saisir('[data-champ="commission"]', '12000');
    expect(container.querySelector('[data-commission-sans-negociateur="entree"]')).not.toBeNull();
    await choisir('entree', 5);
    await choisir('sortie', 7);
    await saisir('[data-champ="commission-entree"]', '1000');
    expect(texte('[data-equivalent="commission-entree"]')).toBe('soit 1 200,00 € TTC');
    await saisir('[data-champ="commission-sortie"]', '1200');
    await cliquer('[data-unite-de="commission-sortie"][data-unite="ttc"]');
    expect(texte('[data-equivalent="commission-sortie"]')).toBe('soit 1 000,00 € HT');
    await saisir('[data-personne-nom="0"]', 'DUPONT');
    await cliquer('[data-enregistrer-dossier]');
    const d = (posts.at(-1) as { dossier: Record<string, unknown> }).dossier;
    expect(d.commissions).toEqual({ entree: { montant: '1000', unite: 'ht' }, sortie: { montant: '1200', unite: 'ttc' } });
    expect(d.retroApporteurUnite).toBe('ht');
  });
  it('depuis la carte : le bouton du négociateur saisit sa commission (HT / TTC) et l’enregistre avec lui ; dessous, la commission enregistrée', async () => {
    listeCompromis = [avecCommissions];
    await onglet();
    await deplier(41);
    expect(texte('[data-commission-carte="entree"]')).toBe('Commission versée : 1 000,00 € HT (soit 1 200,00 € TTC)');
    expect(texte('[data-commission-carte="sortie"]')).toBe('Commission versée : 600,00 € TTC (soit 500,00 € HT)');
    await cliquer('[data-negociateur-carte="sortie"]');
    expect(presse('commission-carte-sortie', 'ttc')).toBe('true');
    await saisir('[data-champ="commission-carte-sortie"]', '700');
    await cliquer('[data-unite-de="commission-carte-sortie"][data-unite="ht"]');
    await cliquer('[data-valider-negociateur]');
    const envoi = posts.at(-1) as { action: string; dossier: { sortieId: number; commissions: unknown } };
    expect(envoi.action).toBe('dossier-enregistrer');
    expect(envoi.dossier.sortieId).toBe(7);
    expect(envoi.dossier.commissions).toEqual({ entree: { montant: '1000', unite: 'ht' }, sortie: { montant: '700', unite: 'ht' } });
  });
});

describe('🔴 LOT J — taux de commission, montant de l’apporteur, part du négociateur', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const carte = async (v: Vente) => { listeCompromis = [v]; await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(v.id); };
  const bouton = (cote: string) => texte(`[data-negociateur-carte="${cote}"]`);
  const pa = (sorte: 'entree' | 'sortie', id: number, nom: string, societe: 'criterimmo' | 'macj', pct: number) => ({ sorte, compteId: id, negociateur: nom, societe, nom: null, coordonnees: null, pourcentage: pct, montantHt: null });

  it('taux : commission TTC ÷ prix ; sans prix, « calculé dès la saisie du prix de vente »', async () => {
    await carte({ ...compromis, prixVente: 240000 });
    expect(texte('[data-info="taux"] dd')).toBe('5,00 % du prix de vente');
    act(() => { root.unmount(); }); root = createRoot(container);
    await carte({ ...compromis, prixVente: null });
    expect(texte('[data-info="taux"] dd')).toBe('calculé dès la saisie du prix de vente');
  });
  it('taux en direct dans le formulaire, au prix comme à la commission', async () => {
    await carte({ ...compromis, prixVente: null });
    await cliquer('[data-modifier-compromis="41"]');
    expect(texte('[data-taux-direct]')).toBe('Taux de commission : calculé dès la saisie du prix de vente');
    await saisir('[data-champ="prix-vente"]', '300 000');
    expect(texte('[data-taux-direct]')).toBe('soit 4,00 % du prix');
    await saisir('[data-champ="commission"]', '15000');
    expect(texte('[data-taux-direct]')).toBe('soit 5,00 % du prix');
  });
  it('apporteur : à droite du nom, la rétrocession avec son unité et son équivalent (HT, TTC) ; sans rétrocession, « montant à renseigner »', async () => {
    await carte({ ...compromis, retroApporteur: { montant: 800, unite: 'ht' } });
    expect(texte('[data-info="apporteur"] [data-apporteur-nom]')).toBe('Julien Deblois');
    expect(texte('[data-info="apporteur"] [data-apporteur-montant]')).toBe('800,00 € HT (960,00 € TTC)');
    act(() => { root.unmount(); }); root = createRoot(container);
    await carte({ ...compromis, retroApporteur: { montant: 960, unite: 'ttc' } });
    expect(texte('[data-apporteur-montant]')).toBe('960,00 € TTC (800,00 € HT)');
    act(() => { root.unmount(); }); root = createRoot(container);
    await carte({ ...compromis, retroApporteur: null, repartition: { ...compromis.repartition!, retroApporteurTtc: 0 } });
    expect(texte('[data-apporteur-montant]')).toBe('montant à renseigner');
  });
  it('part du négociateur dans le bouton : 50/50, 60/40, 100 %, et rien sans répartition ; la commission versée reste dessous', async () => {
    const avec = (parts: ReturnType<typeof pa>[], sortie: { id: number; nom: string } | null = { id: 7, nom: MY.nom }) =>
      ({ ...compromis, repartition: { retroApporteurTtc: 0, parties: parts }, dossier: { ...compromis.dossier!, sortie } });
    await carte(avec([pa('entree', 5, JB.nom, 'criterimmo', 50), pa('sortie', 7, MY.nom, 'macj', 50)]));
    expect([bouton('entree'), bouton('sortie')]).toEqual(['Négociateur : Jean-Baptiste PONS (CRITERIMMO) (50 %)', 'Négociateur : Mylène EBERLIN (MACJ) (50 %)']);
    expect(container.querySelector('[data-commission-carte="entree"]')).not.toBeNull();
    act(() => { root.unmount(); }); root = createRoot(container);
    await carte(avec([pa('entree', 5, JB.nom, 'criterimmo', 60), pa('sortie', 7, MY.nom, 'macj', 40)]));
    expect([bouton('entree'), bouton('sortie')]).toEqual(['Négociateur : Jean-Baptiste PONS (CRITERIMMO) (60 %)', 'Négociateur : Mylène EBERLIN (MACJ) (40 %)']);
    act(() => { root.unmount(); }); root = createRoot(container);
    await carte(avec([pa('entree', 5, JB.nom, 'criterimmo', 100)], null));
    expect([bouton('entree'), bouton('sortie')]).toEqual(['Négociateur : Jean-Baptiste PONS (CRITERIMMO) (100 %)', '+ Ajouter un négociateur']);
    act(() => { root.unmount(); }); root = createRoot(container);
    // Import « toute la commission à CRITERIMMO », négociateur posé sans répartition : pas de pourcentage.
    await carte({ ...importe, dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 5, nom: JB.nom }, sortie: null, apporteurId: null, personnes: [] } });
    expect(bouton('entree')).toBe('Négociateur : Jean-Baptiste PONS (CRITERIMMO)');
  });
});

describe('🔴 LOT K — collaborateur des deux sociétés ; la case « Dates »', () => {
  const CJ = { id: 9, nom: 'Cédric JULLIEN', societe: 'les_deux' as const };
  const negos = references.negociateurs;
  beforeEach(() => { (references as { negociateurs: unknown[] }).negociateurs = [JB, MY, AU, CJ]; });
  afterEach(() => { (references as { negociateurs: unknown[] }).negociateurs = negos; });
  const onglet = async () => { await ouvrir(); await cliquer('[data-vue="compromis"]'); };
  const choisir = async (champ: string, id: number) => { await cliquer(`[data-champ="${champ}"]`); await cliquer(`[role="option"][data-option="${id}"]`); };
  const enregistrer = () => container.querySelector('[data-enregistrer-dossier]') as HTMLButtonElement;
  type Envoi = { dossier: { parties: { sorte: string; compteId: number | null; societe: string | null }[] } };

  it('formulaire : un compte « les deux » ⇒ choix obligatoire ; sans choix, Enregistrer désactivé avec le message, saisie conservée', async () => {
    await onglet();
    await cliquer('[data-nouveau-compromis]');
    await saisir('[data-champ="commission"]', '12000');
    await saisir('[data-personne-nom="0"]', 'DUPONT');
    await choisir('entree', 9);
    expect(container.querySelector('[data-choix-societe-vente="partie-0"]')).not.toBeNull();
    expect(texte('[data-societe-partie="0"]')).toBe('société à choisir pour cette vente');
    expect(enregistrer().disabled).toBe(true);
    expect(texte('[data-enregistrer-bloque-societe]')).toMatch(/Cédric JULLIEN travaille pour CRITERIMMO et pour MACJ : choisissez/);
    expect((container.querySelector('[data-personne-nom="0"]') as HTMLInputElement).value).toBe('DUPONT');
    await cliquer('[data-choix-societe-vente="partie-0"] [data-societe-vente="macj"]');
    expect(enregistrer().disabled).toBe(false);
    await cliquer('[data-enregistrer-dossier]');
    const e = posts.at(-1) as Envoi;
    expect(e.dossier.parties.map((p) => [p.sorte, p.compteId, p.societe])).toEqual([['entree', 9, 'macj']]);
  });
  it('un compte à UNE société : aucune question', async () => {
    await onglet();
    await cliquer('[data-nouveau-compromis]');
    await choisir('entree', 5);
    expect(container.querySelector('[data-choix-societe-vente]')).toBeNull();
    expect(texte('[data-societe-partie="0"]')).toBe('CRITERIMMO');
  });
  it('bouton de la carte : la société de la VENTE dans le libellé « (MACJ) (50 %) » ; sans choix, refus clair ; changer de société se renvoie', async () => {
    const v: Vente = { ...compromis, repartition: { retroApporteurTtc: 0, parties: [
      { sorte: 'entree', compteId: 9, negociateur: CJ.nom, societe: 'macj', nom: null, coordonnees: null, pourcentage: 50, montantHt: null },
      { sorte: 'sortie', compteId: 7, negociateur: MY.nom, societe: 'macj', nom: null, coordonnees: null, pourcentage: 50, montantHt: null }] },
    dossier: { ...compromis.dossier!, entree: { id: 9, nom: CJ.nom } } };
    listeCompromis = [v];
    await onglet(); await deplier(41);
    expect(texte('[data-negociateur-carte="entree"]')).toBe('Négociateur : Cédric JULLIEN (MACJ) (50 %)');
    await cliquer('[data-negociateur-carte="entree"]');
    expect(container.querySelector('[data-choix-societe-vente="carte-entree"] [data-societe-vente="macj"]')!.getAttribute('aria-pressed')).toBe('true');
    await cliquer('[data-choix-societe-vente="carte-entree"] [data-societe-vente="criterimmo"]');
    await cliquer('[data-valider-negociateur]');
    const e = posts.at(-1) as Envoi;
    expect(e.dossier.parties.map((p) => [p.compteId, p.societe])).toEqual([[9, 'criterimmo'], [7, 'macj']]);
    // Un compromis sans lui : le choisir sans société est refusé, rien n'est envoyé.
    act(() => { root.unmount(); }); root = createRoot(container); posts = [];
    listeCompromis = [{ ...importe }];
    await onglet(); await deplier(12);
    await cliquer('[data-negociateur-carte="entree"]');
    await cliquer('[data-liste-negociateur="entree"]');
    await cliquer('[role="option"][data-option="9"]');
    await cliquer('[data-valider-negociateur]');
    expect(posts).toEqual([]);
    expect(texte('[data-choix-negociateur="entree"] [role="alert"]')).toMatch(/travaille pour CRITERIMMO et pour MACJ : choisissez/);
  });
  it('le CA va à la société CHOISIE sur la vente (tuiles)', async () => {
    const v: Vente = { ...compromis, repartition: { retroApporteurTtc: 0, parties: [
      { sorte: 'entree', compteId: 9, negociateur: CJ.nom, societe: 'macj', nom: null, coordonnees: null, pourcentage: 100, montantHt: null }] },
    dossier: { ...compromis.dossier!, entree: { id: 9, nom: CJ.nom }, sortie: null } };
    listeCompromis = [v];
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
    await cliquer('[data-vue="compromis"]');
    expect(texte('[data-part-compromis="macj"]')).toBe('Part MACJ : 10 000,00 € HT');
    expect(texte('[data-part-compromis="criterimmo"]')).toBe('Part CRITERIMMO : 0,00 € HT');
  });
  it('« Dates » : compromis signé au-dessus, vente définitive au-dessous ; absente « à renseigner » ; dépassée en rouge', async () => {
    listeCompromis = [compromis, { ...depasse, dateCompromis: null }];
    await onglet(); await deplier(41); await deplier(30);
    expect([...container.querySelectorAll('[data-compromis="41"] [data-info="dates"] dd [data-date]')].map((x) => x.textContent))
      .toEqual(['Compromis signé le 20/10/2026', 'Vente définitive au plus tard le 15/01/2027']);
    expect(texte('[data-compromis="30"] [data-date="compromis"]')).toBe('Compromis signé le : à renseigner');
    const b = container.querySelector('[data-compromis="30"] [data-date="butoir"]')!;
    expect(b.textContent).toBe('Vente définitive au plus tard le 01/10/2026 — dépassée');
    expect(b.className).toBe('trx-depassee');
    listeCompromis = [{ ...compromis, dossier: { ...compromis.dossier!, dateActePrevue: null } }];
    act(() => { root.unmount(); }); root = createRoot(container);
    await onglet(); await deplier(41);
    expect(texte('[data-compromis="41"] [data-date="butoir"]')).toBe('Vente définitive au plus tard le : à renseigner');
  });
});

describe('🔴 LOT L — Solde net et « + Nouveau compromis »', () => {
  it('Solde net : le TTC en premier, en grand et en vert (« TTC » écrit) ; le HT dessous', async () => {
    await ouvrir(); await cliquer('[data-vue="compromis"]');
    const tuile = container.querySelector('[data-tuile="solde"]')!;
    const ttc = tuile.querySelector('[data-solde-ttc]')!;
    expect(ttc.tagName).toBe('STRONG');
    expect(ttc.className).toContain('trx-vert');
    expect(ttc.className).toContain('tdb-tuile-valeur');
    expect(ttc.textContent!.replace(/\s/g, ' ')).toMatch(/ TTC$/);
    expect(tuile.querySelector('[data-solde-ht]')!.className).toBe('trx-tuile-ht');
    expect([...tuile.children].map((x) => x.getAttribute('data-solde-ttc') !== null ? 'ttc' : x.getAttribute('data-solde-ht') !== null ? 'ht' : '-')).toEqual(['-', 'ttc', 'ht', '-']);
  });
  it('« + Nouveau compromis » sur la ligne du titre, dans la même barre, AVANT les tuiles', async () => {
    await ouvrir(); await cliquer('[data-vue="compromis"]');
    const barre = container.querySelector('.trx-onglet-compromis > .trx-barre')!;
    expect(barre.querySelector('h3')!.textContent).toContain('Compromis en cours');
    expect(barre.querySelector('[data-nouveau-compromis]')).not.toBeNull();
    expect(barre.nextElementSibling?.matches('.tdb-tuiles') || barre.parentElement!.querySelector('.trx-barre ~ .tdb-tuiles') !== null).toBe(true);
  });
});
