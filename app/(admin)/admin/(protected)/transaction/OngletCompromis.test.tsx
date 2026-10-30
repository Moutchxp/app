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
    // LOT P — JB et Mylène sont INDÉPENDANTS (leurs commissions versées entrent dans le cumul).
    { sorte: 'entree', compteId: 5, negociateur: JB.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 40, montantHt: null, statut: 'independant' },
    { sorte: 'sortie', compteId: 7, negociateur: MY.nom, societe: 'macj', nom: null, coordonnees: null, pourcentage: 40, montantHt: null, statut: 'independant' },
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
// LOT AL — la présentation choisie dans la fenêtre est retenue par le navigateur : chaque test part du défaut (« Par catégorie »).
beforeEach(() => { try { window.localStorage.removeItem('trx-commissions-versees-mode'); window.localStorage.removeItem('trx-solde-net-mode'); } catch { /* sans stockage */ } });
// 🔴 LOT AM — « HT | TTC » : les tests d'avant ce lot lisent les montants dans l'ordre d'alors (HT en grand, TTC dessous) ; le défaut (TTC) et la
// bascule sont éprouvés au describe « LOT AM ».
beforeEach(() => { try { window.localStorage.setItem('trx-affichage-montants', 'ht'); } catch { /* sans stockage */ } });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const texte = (sel: string): string => container.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
// 🔴 LOT AL — le détail des « Commissions versées » est dans la FENÊTRE (portail, hors du conteneur) : une catégorie lue
// « Libellé : X € HT (Y € TTC) » (mode « Par catégorie », par défaut) ; `fenetre(sel)` : un texte de la fenêtre.
const fenetre = (sel: string): string => document.querySelector(`[data-fenetre-commissions] ${sel}`)?.textContent?.replace(/\s/g, ' ') ?? '';
const categorie = (cle: string): string => {
  const c = document.querySelector(`[data-fenetre-commissions] [data-categorie="${cle}"]`);
  if (c === null) return '';
  const m = c.querySelector('[data-sous-total]')!;
  return `${c.querySelector('h3')!.textContent} : ${m.children[0].textContent} ${m.children[1].textContent}`.replace(/\s/g, ' ');
};
// 🔴 LOT AN — le sélecteur général « HT | TTC » décide aussi des champs de montant : `saisirTtc` tape un montant TTC (bascule en TTC, frappe,
// retour au HT des tests d'avant) ; `uniteChamp` : l'unité d'un champ de montant.
const basculerUnite = async (u: 'ht' | 'ttc') => { await act(async () => { (container.querySelector(`[data-afficher="${u}"]`) as HTMLElement).click(); }); await calmer(); };
const saisirTtc = async (sel: string, valeur: string) => { await basculerUnite('ttc'); await saisir(sel, valeur); await basculerUnite('ht'); };
// 🔴 LOT AN / AO — les lignes « CA de la vente … dont reversé … sur … de commission » ont quitté la tuile CA ; depuis le lot AO, elles se lisent
// dans la fenêtre « Solde net » (portail, hors du conteneur) ; `lireCa` l'ouvre, lit, puis la referme (Échap).
const lireCa = async (sels: string[]): Promise<string[]> => {
  if (document.querySelector('[data-fenetre-solde]') === null) await act(async () => { (container.querySelector('[data-tuile="solde"]') as HTMLElement).click(); });
  await calmer();
  const lus = sels.map((sel) => document.querySelector(`[data-fenetre-solde] ${sel}`)?.textContent?.replace(/\s/g, ' ') ?? '');
  await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); }); await calmer();
  return lus;
};
const uniteChamp = (champ: string) => container.querySelector(`[data-montant-unite="${champ}"]`)!.getAttribute('data-unite-champ');
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
    expect(texte(`${carte} [data-carte-ligne="infos"]`)).toBe('1 rue A, Puteaux · prix 240 000 € · acte au plus tard le 15/01/2027');
    const montants = container.querySelector(`${carte} [data-carte="montants"]`)!;
    expect(montants.closest('.tdb-replie-resume')).not.toBeNull(); // le bloc de droite, aligné à droite
    // LOT AM — les deux montants ensemble (l'unité choisie en grand, ici HT ; l'autre dessous), en vert (le CA), puis le % du prix.
    expect([...montants.children].map((x) => x.textContent!.replace(/\s/g, ' '))).toEqual(['10 000 € HT(12 000 € TTC)', '5,00 % du prix']);
    expect(montants.querySelector('[data-carte="commission"]')!.className).toContain('trx-vert');
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
    // LOT AN — dans la fenêtre « Chiffre d'affaires » : les ventes portées (le CA), l'inter-cabinet extérieur reversé (non déduit du CA).
    expect(await lireCa(['[data-solde-dont="portee-criterimmo"] .trx-fc-montant', '[data-sous-total-solde="exterieur"]', '[data-ca-solde]'])).toEqual(['10 000 € HT(12 000 € TTC)', '1 600 € HT(1 920 € TTC)', '10 000 € HT(12 000 € TTC)']);
    // (12 000 − 2 400) ÷ 1,2 = 8 000 HT nets ; 40 % = 3 200 nets — 🔴 LOT R : CRITERIMMO (JB à l'entrée) PORTE la vente : son CA est la
    // commission entière, 10 000 HT ; elle reverse MACJ (3 200) et l'extérieur (1 600) et paie l'apporteur (2 000) : le solde redonne sa part, 3 200.
    // LOT AN — dans la fenêtre « Chiffre d'affaires » : la vente portée ; le reversé (3 200 à MACJ + 1 600 à l'extérieur = 4 800), non déduit.
    expect(await lireCa(['[data-solde-dont="portee-criterimmo"] .trx-fc-montant', '[data-sous-total-solde="inter-cabinet-macj"]', '[data-sous-total-solde="exterieur"]'])).toEqual(['10 000 € HT(12 000 € TTC)', '3 200 € HT(3 840 € TTC)', '1 600 € HT(1 920 € TTC)']);
    expect(texte('[data-ca-ht]')).toBe('10 000 € HT');
    expect(texte('[data-solde-ht]')).toBe('3 200 € HT');
    await deplier(41);
    const fiche = texte('[data-compromis="41"]');
    for (const m of ['DUPONT', '06 12 34 56 78', 'p.dupont@exemple.fr', 'MARTIN', '1 rue A, Puteaux', '20/10/2026', '15/01/2027', '10 000 € HT', '12 000 € TTC',
      'Jean-Baptiste PONS', 'Mylène EBERLIN', 'Julien Deblois', '2 000 € HT (2 400 € TTC)', 'Part extérieure — Agence du Parc', '1 600 € HT']) expect(fiche).toContain(m);
    expect(texte('[data-part-societe-compromis="macj"]')).toBe('3 200 € HT(3 840 € TTC)');
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
    // 🔴 LOT R — au global : le CA de chaque société (CRITERIMMO porte : 10 000 ; MACJ reçoit 3 200), l'inter-cabinet neutralisé.
    expect(await lireCa(['[data-ca-societe="macj"]'])).toEqual(['CA MACJ : 3 200 € HT (3 840 € TTC)']); // LOT AN : dans la fenêtre
    expect(texte('[data-ca-ht]')).toBe('10 000 € HT');
    expect(await lireCa(['[data-info-solde="neutralise"] .trx-fc-tete .trx-fc-montant'])).toEqual(['3 200 € HT(3 840 € TTC)']); // LOT AN : dans la fenêtre
  });
});

describe('🔴 LOT E — la répartition, toujours visible et modifiable', () => {
  const nouveau = async () => {
    await ouvrir();
    await cliquer('[data-vue="compromis"]');
    await cliquer('[data-nouveau-compromis]');
    await saisirTtc('[data-champ="commission"]', '12000');
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
    // LOT U — les parts calculées au centime.
    expect([...container.querySelectorAll('[data-partie-eur]')].map((i) => (i as HTMLInputElement).value.replace(/\s/g, ' '))).toEqual(['5 000', '5 000']);
    expect(texte('[data-societe-partie="0"]')).toBe('négociateur à choisir');
    expect(texte('[data-total-pct]')).toBe('100 %');
    // LOT U — la phrase « sur … de commission nette » est remplacée par la base de répartition en tête.
    expect(texte('[data-total-repartition]')).not.toContain('de commission nette');
    expect(texte('[data-resume="base"] [data-resume-ht="base"]')).toBe('10 000 € HT');
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
    // LOT N : le % de chaque part ; 🔴 LOT AJ — la part reçue par MACJ et son reversement ne font qu'UNE mention (fusion autorisée par Arno)
    // LOT AM — chaque montant avec son équivalent entre parenthèses, puis le %.
    expect(texte('[data-parts-societes]')).toContain('Part CRITERIMMO : 5 000 € HT (6 000 € TTC) · 50 % · Part MACJ − Reversé en inter-cabinet vers MACJ : 5 000 € HT (6 000 € TTC) · 50 %');
    await choisir('sortie', 5);
    expect(pcts()).toEqual(['100', '0']);
  });
  it('saisie en % ou en € HT : l’un recalcule l’autre', async () => {
    await nouveau();
    await choisir('entree', 5); await choisir('sortie', 7);
    await saisir('[data-partie-pct="0"]', '60');
    expect((container.querySelector('[data-partie-eur="0"]') as HTMLInputElement).value.replace(/\s/g, ' ')).toBe('6 000');
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
    // 🔴 LOT AJ — « dont reversé … » et les parts ne font plus doublon : une mention par société qui reçoit, en rouge.
    expect(texte('[data-parts-societes]')).toBe('Part CRITERIMMO : 4 000 € HT (4 800 € TTC) · 40 % · Part MACJ − Reversé en inter-cabinet vers MACJ : 4 000 € HT (4 800 € TTC) · 40 % · Part Agence du Parc − Reversé à Agence du Parc : 2 000 € HT (2 400 € TTC) · 20 %'); // LOT AM
    expect(texte('[data-inter-cabinet-form]')).toBe('CA de la vente : CRITERIMMO (société porteuse), 10 000 € HT (12 000 € TTC)'); // LOT AM
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
    await saisirTtc('[data-champ="commission"]', '12000');
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
  it('choisi : « Négociateur : Prénom NOM · taux % » ; LOT T : la société et la part (40 / 40, l’extérieur 20 %) dans le bouton de la première ligne ; relu identique dans « Modifier »', async () => {
    await ouvrirCarte(41);
    expect(texte('[data-colonne="vendeur"] [data-negociateur-carte="entree"]')).toBe('Négociateur : Jean-Baptiste PONS · 50 %');
    expect(texte('[data-colonne="acquereur"] [data-negociateur-carte="sortie"]')).toBe('Négociateur : Mylène EBERLIN · 50 %');
    expect(texte('[data-colonne="vendeur"] [data-societe-cote="entree"]')).toBe('CRITERIMMO · 40 %');
    expect(texte('[data-colonne="acquereur"] [data-societe-cote="sortie"]')).toBe('MACJ · 40 %');
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
    expect(await lireCa(['[data-ca-solde]'])).toEqual(['11 666,67 € HT(14 000 € TTC)']); // LOT AN : dans la fenêtre
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
    await saisirTtc('[data-champ="commission"]', '12000');
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
    // LOT AH — à la demande d'Arno, la commission de la vente (TTC) ouvre le tableau « Répartition » (logique comptable) : elle y est.
    for (const x of ['1 rue A, Puteaux', '240 000 €']) expect(corps).not.toContain(x);
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
    expect(texte('[data-ca-ttc]')).toBe('12 000 € TTC'); // 🔴 LOT R : CRITERIMMO porte la vente, toute la commission
    expect(texte('[data-ca-ht]')).toBe('10 000 € HT');
    const co = container.querySelector('[data-commissions-ttc]')!;
    expect(co.className).toContain('trx-rouge');
    // JB 1 000 HT + apporteur 2 000 HT + inter-cabinet MACJ 3 200 HT + extérieur 1 600 HT ⇒ 7 800 HT, 9 360 TTC (Mylène est MACJ)
    expect(texte('[data-commissions-ttc]')).toBe('9 360 € TTC');
    expect(texte('[data-commissions-ht]')).toBe('7 800 € HT');
    expect(texte('[data-solde-ht]')).toBe('2 200 € HT');
    expect(texte('[data-solde-ttc]')).toBe('2 640 € TTC');
    // LOT AN — dans la fenêtre « Chiffre d'affaires » : la vente portée ; le reversé (3 200 à MACJ + 1 600 à l'extérieur = 4 800), non déduit.
    expect(await lireCa(['[data-solde-dont="portee-criterimmo"] .trx-fc-montant', '[data-sous-total-solde="inter-cabinet-macj"]', '[data-sous-total-solde="exterieur"]'])).toEqual(['10 000 € HT(12 000 € TTC)', '3 200 € HT(3 840 € TTC)', '1 600 € HT(1 920 € TTC)']);
  });
  it('« Commissions versées » : le détail négociateurs / apporteurs au toucher (et au survol)', async () => {
    listeCompromis = [avecCommissions];
    await onglet();
    // LOT AL — le détail n'est plus dans la tuile : « Voir le détail » ouvre la fenêtre.
    expect(document.querySelector('[data-fenetre-commissions]')).toBeNull();
    await cliquer('[data-tuile="commissions"]');
    expect(container.querySelector('[data-tuile="commissions"]')!.getAttribute('aria-expanded')).toBe('true');
    expect(categorie('independants')).toBe('Indépendants : 1 000 € HT (1 200 € TTC)');
    expect(categorie('apporteurs')).toBe('Apporteurs d’affaires : 2 000 € HT (2 400 € TTC)');
    expect(categorie('inter-cabinet-macj')).toBe('Inter-cabinet vers MACJ : 3 200 € HT (3 840 € TTC)');
    expect(categorie('exterieur')).toBe('Agences extérieures : 1 600 € HT (1 920 € TTC)');
  });
  it('un solde négatif s’affiche tel quel, avec le signe moins', async () => {
    listeCompromis = [{ ...avecCommissions, lignes: [{ ...avecCommissions.lignes[0], montantHt: 9000, montantTtc: 10800 }] }];
    await onglet();
    expect(texte('[data-solde-ht]')).toMatch(/^[-−]5 800 € HT$/);
  });
  it('les compromis annulés sont exclus des tuiles', async () => {
    listeCompromis = [avecCommissions];
    listeAnnules = [{ ...compromis, id: 77, statut: 'annulee', annulation: { date: '2026-10-20', motif: 'Défaut de crédit', note: null } }];
    await onglet();
    expect(texte('[data-nb-compromis]')).toBe('1');
    expect(texte('[data-ca-ht]')).toBe('10 000 € HT');
  });
  it('nouveau compromis : la rétrocession de l’apporteur dans l’unité du sélecteur général (LOT AN : plus de boutons HT / TTC au champ) ; sans la 437, en TTC', async () => {
    await onglet();
    await cliquer('[data-nouveau-compromis]');
    expect(uniteChamp('retro')).toBe('ht');
    expect(container.querySelector('[data-unite-de="retro"]')).toBeNull();
    await basculerUnite('ttc');
    expect(uniteChamp('retro')).toBe('ttc');
    await basculerUnite('ht');
    await cliquer('.tdb-x');
    delete ref.uniteCommission;
    await act(async () => { root.unmount(); }); root = createRoot(container);
    await onglet();
    await cliquer('[data-nouveau-compromis]');
    expect(uniteChamp('retro')).toBe('ttc');
    expect(container.querySelector('[data-ht-indisponible="retro"]')).not.toBeNull();
    expect(container.querySelector('[data-commission-indisponible]')).not.toBeNull();
  });
  it('un montant déjà enregistré (TTC), non retouché : MONTRÉ dans l’unité choisie, ENREGISTRÉ tel quel, même après plusieurs bascules', async () => {
    await onglet();
    await deplier(41);
    await cliquer('[data-modifier-compromis="41"]');
    expect(uniteChamp('retro')).toBe('ht');
    expect((container.querySelector('[data-champ="retro"]') as HTMLInputElement).value.replace(/\s/g, ' ')).toBe('2 000');
    expect(texte('[data-equivalent="retro"]')).toBe('soit 2 400 € TTC');
    for (const u of ['ttc', 'ht', 'ttc', 'ht'] as const) await basculerUnite(u);
    await cliquer('[data-enregistrer-dossier]');
    const d = (posts.at(-1) as { dossier: Record<string, unknown> }).dossier;
    expect([d.retroApporteurTtc, d.retroApporteurUnite]).toEqual(['2400', 'ttc']);
  });
  it('le formulaire : une commission par côté, chacune HT ou TTC, avec son équivalent', async () => {
    await onglet();
    await cliquer('[data-nouveau-compromis]');
    await saisirTtc('[data-champ="commission"]', '12000');
    expect(container.querySelector('[data-commission-sans-negociateur="entree"]')).not.toBeNull();
    await choisir('entree', 5);
    await choisir('sortie', 7);
    // LOT AN — l'unité du sélecteur général : HT pour l'entrée, puis TTC pour la sortie ; chacune s'enregistre dans l'unité où elle est tapée.
    await saisir('[data-champ="commission-entree"]', '1000');
    expect(texte('[data-equivalent="commission-entree"]')).toBe('soit 1 200 € TTC');
    await saisirTtc('[data-champ="commission-sortie"]', '1200');
    expect(texte('[data-equivalent="commission-sortie"]')).toBe('soit 1 200 € TTC');
    await saisir('[data-personne-nom="0"]', 'DUPONT');
    await cliquer('[data-enregistrer-dossier]');
    const d = (posts.at(-1) as { dossier: Record<string, unknown> }).dossier;
    const cs = d.commissions as Record<'entree' | 'sortie', { montant: string; unite: string; taux: string | null }>;
    expect([cs.entree.montant, cs.entree.unite, cs.sortie.montant, cs.sortie.unite]).toEqual(['1000', 'ht', '1200', 'ttc']);
    // 🔴 LOT R — un montant saisi recalcule le taux : 1 200 TTC ÷ 6 000 TTC (50 % de 12 000) = 20 %.
    expect(cs.sortie.taux).toBe('20');
    expect(d.retroApporteurUnite).toBe('ht');
  });
  it('depuis la carte : le bouton du négociateur saisit sa commission (HT / TTC) et l’enregistre avec lui ; dessous, la commission enregistrée', async () => {
    listeCompromis = [avecCommissions];
    await onglet();
    await deplier(41);
    // LOT T — la commission enregistrée diffère du calcul (40 % de 9 600 = 3 840 ; × 50 % = 1 920) : en rouge, dans son unité.
    expect(texte('[data-commission-enregistree="entree"]')).toBe('Commission enregistrée : 1 000 € HT (1 200 € TTC)');
    // LOTS AA / AB — Mylène travaille pour MACJ : sur la carte de CRITERIMMO, ses honoraires sont versés à MACJ (liseré rouge), sans bloc de commission.
    // LOT BA — l'en-tête sans cadre, puis le cadre rouge « Reversé en inter-cabinet à MACJ »
    expect(texte('[data-reverse-cote="sortie"] [data-mention-commission]')).toBe('Comptabilisé dans « Commissions versées »');
    expect(container.querySelector('[data-commission-negociateur="sortie"]')).toBeNull();
    await cliquer('[data-negociateur-carte="entree"]');
    expect(uniteChamp('commission-carte-entree')).toBe('ht');
    await saisirTtc('[data-champ="commission-carte-entree"]', '700');
    await cliquer('[data-valider-negociateur]');
    const envoi = posts.at(-1) as { action: string; dossier: { entreeId: number; commissions: unknown } };
    expect(envoi.action).toBe('dossier-enregistrer');
    expect(envoi.dossier.entreeId).toBe(5);
    const cs = envoi.dossier.commissions as Record<'entree' | 'sortie', { montant: string; unite: string }>;
    expect([cs.entree.montant, cs.entree.unite, cs.sortie.montant, cs.sortie.unite]).toEqual(['700', 'ttc', '600', 'ttc']);
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
    await saisirTtc('[data-champ="commission"]', '15000');
    expect(texte('[data-taux-direct]')).toBe('soit 5,00 % du prix');
  });
  it('apporteur : à droite du nom, la rétrocession avec son unité et son équivalent (HT, TTC) ; sans rétrocession, « montant à renseigner »', async () => {
    await carte({ ...compromis, retroApporteur: { montant: 800, unite: 'ht' } });
    expect(texte('[data-info="apporteur"] [data-apporteur-nom]')).toBe('Julien Deblois');
    expect(texte('[data-info="apporteur"] [data-apporteur-montant]')).toBe('800 € HT (960 € TTC)');
    act(() => { root.unmount(); }); root = createRoot(container);
    await carte({ ...compromis, retroApporteur: { montant: 960, unite: 'ttc' } });
    // LOT AM — l'affichage suit « HT | TTC » (ici HT), quelle que soit l'unité de la saisie ; la valeur enregistrée ne change pas.
    expect(texte('[data-apporteur-montant]')).toBe('800 € HT (960 € TTC)');
    act(() => { root.unmount(); }); root = createRoot(container);
    await carte({ ...compromis, retroApporteur: null, repartition: { ...compromis.repartition!, retroApporteurTtc: 0 } });
    expect(texte('[data-apporteur-montant]')).toBe('montant à renseigner');
  });
  it('LOT T — la part dans le bouton de la première ligne : 50/50, 60/40, 100 % ; le taux dans le bouton du négociateur ; sans répartition, la commission versée comme avant', async () => {
    const avec = (parts: ReturnType<typeof pa>[], sortie: { id: number; nom: string } | null = { id: 7, nom: MY.nom }) =>
      ({ ...compromis, repartition: { retroApporteurTtc: 0, parties: parts }, dossier: { ...compromis.dossier!, sortie } });
    await carte(avec([pa('entree', 5, JB.nom, 'criterimmo', 50), pa('sortie', 7, MY.nom, 'macj', 50)]));
    const societes = () => [texte('[data-societe-cote="entree"]'), texte('[data-societe-cote="sortie"]')];
    expect(societes()).toEqual(['CRITERIMMO · 50 %', 'MACJ · 50 %']);
    expect([bouton('entree'), bouton('sortie')]).toEqual(['Négociateur : Jean-Baptiste PONS · 50 %', 'Négociateur : Mylène EBERLIN · 50 %']);
    expect(container.querySelector('[data-commission-carte="entree"]')).not.toBeNull(); // rien d'enregistré : « à renseigner »
    act(() => { root.unmount(); }); root = createRoot(container);
    await carte(avec([pa('entree', 5, JB.nom, 'criterimmo', 60), pa('sortie', 7, MY.nom, 'macj', 40)]));
    expect(societes()).toEqual(['CRITERIMMO · 60 %', 'MACJ · 40 %']);
    act(() => { root.unmount(); }); root = createRoot(container);
    await carte(avec([pa('entree', 5, JB.nom, 'criterimmo', 100)], null));
    expect(societes()).toEqual(['CRITERIMMO · 100 %', 'Société à définir · 0 %']);
    expect([bouton('entree'), bouton('sortie')]).toEqual(['Négociateur : Jean-Baptiste PONS · 50 %', '+ Ajouter un négociateur']);
    act(() => { root.unmount(); }); root = createRoot(container);
    // Import « toute la commission à CRITERIMMO », négociateur posé sans répartition : sa société (son compte), aucun calcul, la commission versée.
    await carte({ ...importe, dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 5, nom: JB.nom }, sortie: null, apporteurId: null, personnes: [] } });
    expect([texte('[data-societe-cote="entree"]'), bouton('entree')]).toEqual(['CRITERIMMO · 100 %', 'Négociateur : Jean-Baptiste PONS · 50 %']);
    expect(container.querySelector('[data-honoraires-cote="entree"]')).toBeNull();
    expect(texte('[data-commission-carte="entree"]')).toBe('Commission versée : à renseigner');
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
    await saisirTtc('[data-champ="commission"]', '12000');
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
  it('LOT T — bouton de la première ligne : la société de la VENTE « MACJ · 50 % » ; sans choix, refus clair ; changer de société se renvoie', async () => {
    const v: Vente = { ...compromis, repartition: { retroApporteurTtc: 0, parties: [
      { sorte: 'entree', compteId: 9, negociateur: CJ.nom, societe: 'macj', nom: null, coordonnees: null, pourcentage: 50, montantHt: null },
      { sorte: 'sortie', compteId: 7, negociateur: MY.nom, societe: 'macj', nom: null, coordonnees: null, pourcentage: 50, montantHt: null }] },
    dossier: { ...compromis.dossier!, entree: { id: 9, nom: CJ.nom } } };
    listeCompromis = [v];
    await onglet(); await deplier(41);
    expect(texte('[data-societe-cote="entree"]')).toBe('MACJ · 50 %');
    expect(texte('[data-negociateur-carte="entree"]')).toBe('Négociateur : Cédric JULLIEN · 50 %');
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
    // 🔴 LOT R — Cédric à l'entrée pour MACJ : MACJ porte la vente.
    expect(await lireCa(['[data-ca-societe="macj"]', '[data-ca-societe="criterimmo"]'])).toEqual(['CA MACJ : 10 000 € HT (12 000 € TTC)', 'CA CRITERIMMO : 0 € HT (0 € TTC)']); // LOT AN
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
  it('Solde net : en vert ; LOT AM — l’unité choisie en grand (ici HT), l’autre dessous entre parenthèses, de la même couleur', async () => {
    await ouvrir(); await cliquer('[data-vue="compromis"]');
    const tuile = container.querySelector('[data-tuile="solde"]')!;
    const grand = tuile.querySelector('[data-montant-grand]')!;
    expect(grand.tagName).toBe('STRONG');
    expect(grand.className).toContain('trx-vert');
    expect(grand.querySelector('[data-solde-ht]')).not.toBeNull();
    expect(tuile.querySelector('[data-montant-petit]')!.className).toContain('trx-vert');
    expect(texte('[data-tuile="solde"] [data-montant-petit]')).toMatch(/^\(.* TTC\)$/);
    expect(await lireCa(['[data-solde-explication]'])).toEqual(['CA HT − commissions versées HT']); // LOT AO : dans la fenêtre « Solde net »
  });
  it('« + Nouveau compromis » sur la ligne du titre, dans la même barre, AVANT les tuiles', async () => {
    await ouvrir(); await cliquer('[data-vue="compromis"]');
    const barre = container.querySelector('.trx-onglet-compromis > .trx-barre')!;
    expect(barre.querySelector('h3')!.textContent).toContain('Compromis en cours');
    expect(barre.querySelector('[data-nouveau-compromis]')).not.toBeNull();
    expect(barre.nextElementSibling?.matches('.tdb-tuiles') || barre.parentElement!.querySelector('.trx-barre ~ .tdb-tuiles') !== null).toBe(true);
  });
});

describe('🔴 LOT N — la colonne « % » des lignes « Part CRITERIMMO / MACJ / extérieure »', () => {
  const pa = (sorte: 'entree' | 'sortie', id: number, nom: string, societe: 'criterimmo' | 'macj', pct: number) => ({ sorte, compteId: id, negociateur: nom, societe, nom: null, coordonnees: null, pourcentage: pct, montantHt: null });
  const ext = { sorte: 'exterieure' as const, compteId: null, negociateur: null, societe: null, nom: 'Agence du Parc', coordonnees: null, pourcentage: 20, montantHt: null };
  const pcts = async (parties: unknown[]) => {
    listeCompromis = [{ ...compromis, repartition: { retroApporteurTtc: 2400, parties: parties as never } }];
    act(() => { root.unmount(); }); root = createRoot(container);
    await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(41);
    return [texte('[data-pct-societe-compromis="criterimmo"]'), texte('[data-pct-societe-compromis="macj"]'), texte('[data-pct-exterieur-compromis]')];
  };
  it('100 / 0 (les deux négociateurs chez CRITERIMMO), 50 / 50 entre sociétés, 60 / 40, et 40 / 40 / 20 avec une part extérieure', async () => {
    expect(await pcts([pa('entree', 5, JB.nom, 'criterimmo', 50), pa('sortie', 4, 'Augustin Jorel', 'criterimmo', 50)])).toEqual(['100 %', '0 %', '']);
    expect(await pcts([pa('entree', 5, JB.nom, 'criterimmo', 50), pa('sortie', 7, MY.nom, 'macj', 50)])).toEqual(['50 %', '50 %', '']);
    expect(await pcts([pa('entree', 5, JB.nom, 'criterimmo', 60), pa('sortie', 7, MY.nom, 'macj', 40)])).toEqual(['60 %', '40 %', '']);
    expect(await pcts([pa('entree', 5, JB.nom, 'criterimmo', 40), pa('sortie', 7, MY.nom, 'macj', 40), ext])).toEqual(['40 %', '40 %', '20 %']);
  });
});

describe('🔴 LOT O / R — la rémunération PROPOSÉE (taux 50 % × la part de ce côté, sur la commission nette)', () => {
  const ref = references as Record<string, unknown>;
  // LOT AN — l'unité des champs est celle du sélecteur général : ces tests partent en TTC (le défaut).
  beforeEach(() => { ref.uniteCommission = true; window.localStorage.setItem('trx-affichage-montants', 'ttc'); });
  afterEach(() => { delete ref.uniteCommission; });
  const champ = (sel: string) => (container.querySelector(sel) as HTMLInputElement).value.replace(/\s/g, ' ');
  const pa = (sorte: 'entree' | 'sortie', id: number, nom: string, societe: 'criterimmo' | 'macj', pct: number) => ({ sorte, compteId: id, negociateur: nom, societe, nom: null, coordonnees: null, pourcentage: pct, montantHt: null });
  const v = (pE: number, pS: number, o: Partial<Vente> = {}): Vente => ({ ...compromis, honorairesTtc: 7500, repartition: { retroApporteurTtc: 0, parties: [pa('entree', 5, JB.nom, 'criterimmo', pE), pa('sortie', 7, MY.nom, 'macj', pS)] }, ...o });
  const carte = async (x: Vente) => { listeCompromis = [x]; await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(x.id); };

  it('50/50 : depuis la carte, 50 % × (50 % × 7 500 €) = 1 875 TTC (TTC enfoncé), avec la mention ; bascule HT : 1 562,50', async () => {
    await carte(v(50, 50));
    await cliquer('[data-negociateur-carte="entree"]');
    expect(champ('[data-champ="commission-carte-entree"]')).toBe('1 875');
    expect(uniteChamp('commission-carte-entree')).toBe('ttc');
    expect(texte('[data-propose="commission-carte-entree"]')).toBe('proposé : 50 % de 3 750 € TTC (sa part : 50 % de la commission nette)');
    // LOT AN — le sélecteur du panneau (synchronisé avec le bloc) : le champ passe en HT
    await cliquer('[data-affichage-panneau="negociateur-entree"] [data-afficher="ht"]');
    expect(champ('[data-champ="commission-carte-entree"]')).toBe('1 562,50');
    expect(container.querySelector('[data-affichage-montants]')!.getAttribute('data-affichage-montants')).toBe('ht');
  });
  it('60/40 : le formulaire Modifier propose 2 250 et 1 500 TTC ; une frappe remplace la proposition', async () => {
    await carte(v(60, 40));
    await cliquer('[data-modifier-compromis="41"]');
    expect([champ('[data-champ="commission-entree"]'), champ('[data-champ="commission-sortie"]')]).toEqual(['2 250', '1 500']);
    await saisir('[data-champ="commission-sortie"]', '2800');
    expect(champ('[data-champ="commission-sortie"]')).toBe('2 800'); // LOT AN : hors saisie, mis en forme (le texte saisi reste « 2800 »)
    expect(container.querySelector('[data-propose="commission-sortie"]')).toBeNull();
  });
  it('une commission déjà enregistrée s’affiche telle quelle, jamais recalculée', async () => {
    await carte(v(50, 50, { lignes: [{ id: 1, negociateur: JB.nom, role: 'negociateur', montantTtc: 1200, montantHt: 1000, cote: 'entree', nature: 'compromis', compte: false, origine: 'saisie',
      sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null }] }));
    await cliquer('[data-negociateur-carte="entree"]');
    // LOT AN — enregistrée en HT (1 000) : montrée en TTC (1 200), puis telle quelle en HT
    expect(champ('[data-champ="commission-carte-entree"]')).toBe('1 200');
    await basculerUnite('ht');
    expect(champ('[data-champ="commission-carte-entree"]')).toBe('1 000');
    expect(container.querySelector('[data-propose="commission-carte-entree"]')).toBeNull();
  });
  it('rien n’est écrit sans « Valider » ; LOT V : « Valider » envoie SON côté et l’autre côté, tous deux CALCULÉS (le serveur les recalcule)', async () => {
    await carte(v(50, 50));
    await cliquer('[data-negociateur-carte="entree"]');
    await cliquer('[data-negociateur-carte="sortie"]');
    expect(posts).toEqual([]);
    // la proposition n'est pas dans les tuiles tant qu'elle n'est pas validée : seul l'inter-cabinet vers MACJ (50 % de 6 250 HT) y est
    expect(texte('[data-commissions-ht]')).toBe('3 125 € HT');
    await cliquer('[data-choix-negociateur="entree"] [data-valider-negociateur]');
    const e = posts.at(-1) as { dossier: { commissions: { entree: { montant: string; unite: string }; sortie: { montant: string; unite: string } } } };
    // (l'espace des milliers est insécable : le serveur, `montant()` de saisie.ts, l'ignore comme toute espace)
    expect({ ...e.dossier.commissions.entree, montant: e.dossier.commissions.entree.montant.replace(/\s/g, ' ') }).toEqual({ montant: '1 875', unite: 'ttc', taux: null, mode: 'calculee' });
    expect({ ...e.dossier.commissions.sortie, montant: e.dossier.commissions.sortie.montant.replace(/\s/g, ' ') }).toEqual({ montant: '1 875', unite: 'ttc', taux: null, mode: 'calculee' });
  });
  it('sans répartition (import « toute la commission à CRITERIMMO ») : champ vide, TTC par défaut, aucune mention', async () => {
    await carte({ ...importe, honorairesTtc: 7500, dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 5, nom: JB.nom }, sortie: null, apporteurId: null, personnes: [] } });
    await cliquer('[data-negociateur-carte="entree"]');
    expect(champ('[data-champ="commission-carte-entree"]')).toBe('');
    expect(uniteChamp('commission-carte-entree')).toBe('ttc');
    expect(container.querySelector('[data-propose="commission-carte-entree"]')).toBeNull();
  });
});

describe('🔴 LOT P — le détail de « Commissions versées » : indépendants, apporteurs, et les internes à part', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const ligneC = (id: number, nego: string, cote: 'entree' | 'sortie', ht: number) => ({ id, negociateur: nego, role: 'negociateur' as const, montantTtc: ht * 1.2, montantHt: ht, cote,
    nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  it('JB indépendant (1 000 HT) déduit ; Mylène associée (600 HT) « Internes … — non déduits » ; un statut inconnu signalé à part', async () => {
    const parties = compromis.repartition!.parties.map((p) => (p.compteId === 7 ? { ...p, statut: 'associe' as const } : p));
    listeCompromis = [{ ...compromis, repartition: { ...compromis.repartition!, parties }, lignes: [ligneC(1, JB.nom, 'entree', 1000), ligneC(2, MY.nom, 'sortie', 600)] }];
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
    await cliquer('[data-vue="compromis"]');
    await cliquer('[data-tuile="commissions"]');
    expect(categorie('independants')).toBe('Indépendants : 1 000 € HT (1 200 € TTC)');
    expect(categorie('internes')).toBe('Internes (associés, salariés) — non déduits : 600 € HT (720 € TTC)');
    expect(categorie('a-renseigner')).toBe('');
    // global : JB 1 000 + l'apporteur 2 000 + l'inter-cabinet extérieur 1 600 ; MACJ (3 200) neutralisé ; Mylène (associée) n'est pas déduite.
    expect(texte('[data-commissions-ht]')).toBe('4 600 € HT');
    const inconnu = compromis.repartition!.parties.map((p) => (p.compteId === 7 ? { ...p, statut: null, statutCompte: null } : p));
    listeCompromis = [{ ...compromis, repartition: { ...compromis.repartition!, parties: inconnu }, lignes: [ligneC(1, JB.nom, 'entree', 1000), ligneC(2, MY.nom, 'sortie', 600)] }];
    act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
    await cliquer('[data-vue="compromis"]');
    await cliquer('[data-tuile="commissions"]');
    expect(categorie('a-renseigner')).toBe('Statut à renseigner — non déduits : 600 € HT (720 € TTC)');
    expect(texte('[data-commissions-ht]')).toBe('4 600 € HT');
  });
});

describe('🔴 LOT P — sous le bouton négociateur : son statut à la date de la vente', () => {
  it('figé (« Indépendant — commission déduite ») ; vente d’avant : statut actuel du compte ; compte « à renseigner » : « à confirmer », non déduite', async () => {
    // (Mylène dans la société de la carte : son bloc de commission s'y affiche — LOT AA)
    const parties = compromis.repartition!.parties.map((p) => (p.compteId === 7 ? { ...p, societe: 'criterimmo' as const, statut: null, statutCompte: 'salarie' as const } : p));
    listeCompromis = [{ ...compromis, repartition: { ...compromis.repartition!, parties } }];
    await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(41);
    // 🔴 LOT Z — la ligne « Statut à la vente » est retirée quand le bloc existe : le statut et sa précision sont dans la mention du bloc.
    expect(container.querySelector('[data-statut-vente]')).toBeNull();
    expect(texte('[data-commission-negociateur="entree"] [data-mention-commission]')).toBe('Indépendant — comptabilisé dans « Commissions versées »');
    expect(texte('[data-commission-negociateur="sortie"] [data-mention-commission]')).toBe('Salarié interne (statut actuel du compte) — non comptabilisé dans « Commissions versées »');
    const inconnu = compromis.repartition!.parties.map((p) => (p.compteId === 7 ? { ...p, societe: 'criterimmo' as const, statut: null, statutCompte: null } : p));
    listeCompromis = [{ ...compromis, repartition: { ...compromis.repartition!, parties: inconnu } }];
    act(() => { root.unmount(); }); root = createRoot(container);
    await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(41);
    expect(texte('[data-commission-negociateur="sortie"] [data-mention-commission]')).toBe('Statut à renseigner (à confirmer) — non comptabilisé dans « Commissions versées »');
  });
});

describe('🔴 LOT R — l’inter-cabinet à l’écran : la ligne miroir, la rémunération (taux × la part), « Appliquer le calcul »', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const AR = { id: 2, nom: 'Arnaud Jorel', societe: 'criterimmo' as const };
  const PT = { id: 8, nom: 'Pierre Thevenin', societe: 'macj' as const };
  const lc = (id: number, nego: string, cote: 'entree' | 'sortie', ttc: number) => ({ id, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc, montantHt: null, cote,
    nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  // HEIDIDON, telle que la recette la porte : 4 000 TTC, Arnaud (CRITERIMMO, associé) 50 % à l'entrée, Pierre (MACJ, indépendant) 50 % à la sortie, 2 000 TTC saisis chacun.
  const heididon: Vente = { ...compromis, id: 38, libelle: 'HEIDIDON', honorairesTtc: 4000, origine: 'import', apporteur: null, prixVente: null,
    repartition: { retroApporteurTtc: 0, parties: [
      { sorte: 'entree', compteId: 2, negociateur: AR.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'associe' },
      { sorte: 'sortie', compteId: 8, negociateur: PT.nom, societe: 'macj', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' }] },
    dossier: { ...compromis.dossier!, entree: { id: 2, nom: AR.nom }, sortie: { id: 8, nom: PT.nom }, apporteurId: null },
    lignes: [lc(443, AR.nom, 'entree', 2000), lc(444, PT.nom, 'sortie', 2000)] };
  const miroir = async () => (await import('../../../../lib/transaction/interCabinet')).venteDansSociete(heididon, 'macj')!;
  const ouvrirMacj = async () => { await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer(); };

  it('CRITERIMMO : CA 4 000 TTC ; « Inter-cabinet vers MACJ » 2 000 TTC dans les commissions versées ; solde 2 000 TTC ; la répartition dit qui porte et ce qui est reversé', async () => {
    listeCompromis = [heididon];
    await ouvrir(); await cliquer('[data-vue="compromis"]');
    expect(texte('[data-ca-ttc]')).toBe('4 000 € TTC');
    expect(texte('[data-commissions-ttc]')).toBe('2 000 € TTC');
    expect(texte('[data-solde-ttc]')).toBe('2 000 € TTC');
    await cliquer('[data-tuile="commissions"]');
    expect(categorie('inter-cabinet-macj')).toBe('Inter-cabinet vers MACJ : 1 666,67 € HT (2 000 € TTC)');
    expect(categorie('internes')).toBe('Internes (associés, salariés) — non déduits : 1 666,67 € HT (2 000 € TTC)');
    await deplier(38);
    // LOT AH — « Commission de la vente — CA de CRITERIMMO (société porteuse) » ; LOT AJ — « Part MACJ − Reversé en inter-cabinet vers MACJ », en rouge.
    expect(texte('[data-ligne-repartition="commission"]')).toBe('Commission de la vente — CA de CRITERIMMO (société porteuse)CRITERIMMO100 %3 333,33 € HT(4 000 € TTC)');
    expect(texte('[data-ligne-repartition="part-reverse-macj"]')).toBe('Part MACJ − Reversé en inter-cabinet vers MACJMACJ50 %1 666,67 € HT(2 000 € TTC)');
    // Arnaud : 2 000 saisis ; le calcul (50 % × sa part, 2 000) = 1 000 — la valeur saisie n'est pas recalculée, le calcul est proposé
    // LOT T — les deux lignes de calcul, puis la valeur enregistrée en rouge et « Appliquer le calcul ».
    expect(texte('[data-honoraires-cote="entree"]')).toBe('Honoraires partie vendeur : 3 333,33 € HT × 50 % = 1 666,66 € HT (2 000 € TTC)'); // LOT BA : centimes AH
    // 🔴 LOT BI — Arnaud, associé : sa commission n'est pas distinguée — un seul cadre vert, tout son côté compté dans son CA
    expect(container.querySelector('[data-commission-negociateur="entree"]')).toBeNull();
    expect(texte('[data-part-agence="entree"] [data-mention-commission]')).toBe('Comptés dans le CA de Arnaud Jorel (associé, commissionné)');
    expect(texte('[data-ecart-remuneration="entree"]')).toBe('Commission enregistrée : 1 666,67 € HT (2 000 € TTC)Appliquer le calcul');
    expect(posts).toEqual([]);
    await cliquer('[data-appliquer-calcul-carte="entree"]');
    expect(posts.at(-1)).toEqual({ action: 'commission-cote', id: 38, cote: 'entree', montant: { montant: 1000, unite: 'ttc' }, taux: 50, mode: 'calculee' });
  });

  it('MACJ : la LIGNE MIROIR « HEIDIDON — inter-cabinet reçu de CRITERIMMO », 2 000 TTC en tête (jamais 4 000) ; non modifiable ; « Voir la vente d’origine »', async () => {
    listeCompromis = [await miroir()];
    await ouvrirMacj(); await cliquer('[data-vue="compromis"]');
    const carte = '[data-compromis="38"]';
    expect(container.querySelector(carte)!.getAttribute('data-miroir')).toBe('38');
    expect(texte(`${carte} [data-carte="titre"]`)).toBe('HEIDIDON — inter-cabinet reçu de CRITERIMMO');
    expect([...container.querySelector(`${carte} [data-carte="montants"]`)!.children].map((x) => x.textContent!.replace(/\s/g, ' '))).toEqual(['1 666,67 € HT(2 000 € TTC)', 'inter-cabinet reçu']); // LOT AM
    expect(texte(carte)).not.toContain('4 000');
    // les tuiles : CA = sa part ; Pierre (indépendant, 2 000 saisis) déduit ; solde 0 tant que le calcul n'est pas appliqué
    expect(texte('[data-ca-ttc]')).toBe('2 000 € TTC');
    expect(texte('[data-commissions-ttc]')).toBe('2 000 € TTC');
    expect(texte('[data-solde-ttc]')).toBe('0 € TTC');
    // LOT AN — dans la fenêtre « Chiffre d'affaires » de MACJ : rien de porté, rien de reversé, 1 666,67 reçus de CRITERIMMO = son CA.
    expect(await lireCa(['[data-solde-dont="portee-macj"] .trx-fc-montant', '[data-aucun-solde="inter-cabinet-criterimmo"]', '[data-solde-dont="recu-criterimmo"] .trx-fc-montant', '[data-ca-solde]']))
      .toEqual(['0 € HT(0 € TTC)', 'Aucun0 €', '1 666,67 € HT(2 000 € TTC)', '1 666,67 € HT(2 000 € TTC)']);
    await cliquer('[data-deplier="miroir-38"]');
    expect(container.querySelector(`${carte} [data-modifier-compromis]`)).toBeNull();
    expect(container.querySelector(`${carte} [data-acte-signe]`)).toBeNull();
    expect(container.querySelector(`${carte} [data-annulation-compromis]`)).toBeNull();
    expect(container.querySelector(`${carte} [data-voir-origine="38"]`)!.getAttribute('href')).toBe('/admin/transaction/criterimmo?vente=38');
    // LOT AK — « Honoraires reçus de CRITERIMMO » retiré de la ligne miroir ; 🔴 LOT BA (Arno) — il revient en tête, sans cadre (référence de la carte).
    expect(texte('[data-honoraires-cote="sortie"]')).toBe('Honoraires reçus de CRITERIMMO 1 666,67 € HT (2 000 € TTC)');
    expect(texte('[data-commission-negociateur="sortie"]')).toBe('Commission du négociateur : 1 666,67 € HT × 50 % = 833,33 € HT (1 000 € TTC) Indépendant — comptabilisé dans « Commissions versées »');
    expect(texte('[data-commission-enregistree="sortie"]')).toBe('Commission enregistrée : 1 666,67 € HT (2 000 € TTC)');
    expect(posts).toEqual([]);
    await cliquer('[data-appliquer-calcul-carte="sortie"]');
    // enregistrée sur la VENTE D'ORIGINE (n° 38), côté sortie : aucune donnée dupliquée
    expect(posts.at(-1)).toEqual({ action: 'commission-cote', id: 38, cote: 'sortie', montant: { montant: 1000, unite: 'ttc' }, taux: 50, mode: 'calculee' });
  });

  it('MACJ : « Modifier la rémunération » — un taux de 60 % recalcule le montant (1 200), un montant recalcule le taux ; « Valider » l’enregistre', async () => {
    listeCompromis = [await miroir()];
    await ouvrirMacj(); await cliquer('[data-vue="compromis"]'); await cliquer('[data-deplier="miroir-38"]');
    await cliquer('[data-modifier-remuneration="sortie"]');
    await basculerUnite('ttc'); // LOT AN : les champs suivent le sélecteur général
    await saisir('[data-taux="remuneration-sortie"]', '60');
    expect((container.querySelector('[data-champ="remuneration-sortie"]') as HTMLInputElement).value.replace(/\s/g, ' ')).toBe('1 200');
    await cliquer('[data-valider-remuneration="sortie"]');
    expect(posts.at(-1)).toMatchObject({ action: 'commission-cote', id: 38, cote: 'sortie', montant: { montant: 1200, unite: 'ttc' }, taux: 60, mode: 'calculee' });
    await cliquer('[data-modifier-remuneration="sortie"]');
    await saisir('[data-champ="remuneration-sortie"]', '500');
    expect((container.querySelector('[data-taux="remuneration-sortie"]') as HTMLInputElement).value).toBe('25');
  });

  it('une ligne miroir annulée (vente annulée, ou plus de part) : dans « Compromis annulés », sans « Rétablir » — elle suit la vente d’origine', async () => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    listeCompromis = [];
    listeAnnules = [venteDansSociete({ ...heididon, statut: 'annulee', annulation: { date: '2026-10-28', motif: 'Défaut de crédit', note: null } }, 'macj')!];
    await ouvrirMacj(); await cliquer('[data-vue="compromis"]');
    await cliquer('[data-deplier="compromis-annules"]');
    expect(texte('[data-compromis-annule="38"]')).toContain('HEIDIDON — inter-cabinet reçu de CRITERIMMO');
    expect(container.querySelector('[data-retablir-compromis="38"]')).toBeNull();
    expect(container.querySelector('[data-miroir-annule="38"] [data-voir-origine="38"]')).not.toBeNull();
  });

  it('le CA global : 4 000 TTC une fois ; « Inter-cabinet entre nos sociétés : 1 666,67 € HT (neutralisé) »', async () => {
    listeCompromis = [heididon];
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
    await cliquer('[data-vue="compromis"]');
    expect(texte('[data-ca-ttc]')).toBe('4 000 € TTC');
    // LOT AN — dans la fenêtre « Chiffre d'affaires » (nos deux sociétés) : l'inter-cabinet neutralisé, et le CA de chaque société.
    expect(await lireCa(['[data-info-solde="neutralise"] .trx-fc-tete .trx-fc-montant', '[data-ca-societe="criterimmo"]', '[data-ca-societe="macj"]']))
      .toEqual(['1 666,67 € HT(2 000 € TTC)', 'CA CRITERIMMO : 3 333,33 € HT (4 000 € TTC)', 'CA MACJ : 1 666,67 € HT (2 000 € TTC)']);
  });

  it('« Voir la vente d’origine » : la carte visée s’ouvre (?vente=38)', async () => {
    listeCompromis = [heididon];
    window.history.replaceState(null, '', '/admin/transaction/criterimmo?vente=38');
    await ouvrir();
    expect(container.querySelector('[data-carte-compromis="38"]')!.getAttribute('data-replie')).toBe('ouvert');
  });
});

describe('🔴 LOT S — un administrateur NON COMMISSIONNÉ sur la vente', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const lc = (id: number, nego: string, cote: 'entree' | 'sortie', ttc: number) => ({ id, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc, montantHt: null, cote,
    nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  const vente = (commissionneCompte: boolean): Vente => ({ ...compromis, id: 38, libelle: 'HEIDIDON', honorairesTtc: 4000, apporteur: null,
    repartition: { retroApporteurTtc: 0, parties: [
      { sorte: 'entree', compteId: 2, negociateur: 'Arnaud Jorel', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'associe', commissionneCompte },
      { sorte: 'sortie', compteId: 8, negociateur: 'Pierre Thevenin', societe: 'macj', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant', commissionneCompte: true }] },
    dossier: { ...compromis.dossier!, entree: { id: 2, nom: 'Arnaud Jorel' }, sortie: { id: 8, nom: 'Pierre Thevenin' }, apporteurId: null },
    lignes: [lc(445, 'Arnaud Jorel', 'entree', 2000), lc(446, 'Pierre Thevenin', 'sortie', 1000)] });
  const negos = references.negociateurs;
  beforeEach(() => { (references as { negociateurs: unknown[] }).negociateurs = [...negos, { id: 2, nom: 'Arnaud Jorel', societe: 'criterimmo', commissionne: false }, { id: 8, nom: 'Pierre Thevenin', societe: 'macj' }]; });
  afterEach(() => { (references as { negociateurs: unknown[] }).negociateurs = negos; });
  const carte = async (v: Vente) => { listeCompromis = [v]; await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(38); };

  it('la carte : « · non commissionné » dans son bouton (LOT T) ; seule la ligne des honoraires — ni commission, ni calcul, ni « Appliquer le calcul » ; Pierre inchangé ; tuiles sans sa commission', async () => {
    await carte(vente(false));
    expect(texte('[data-negociateur-carte="entree"]')).toBe('Négociateur : Arnaud Jorel · non commissionné');
    expect(texte('[data-honoraires-cote="entree"]')).toBe('Honoraires partie vendeur : 3 333,33 € HT × 50 % = 1 666,66 € HT (2 000 € TTC)'); // LOT BA : centimes AH
    expect(container.querySelector('[data-commission-negociateur="entree"]')).toBeNull();
    expect(container.querySelector('[data-commission-carte="entree"]')).toBeNull();
    expect(container.querySelector('[data-ecart-remuneration="entree"]')).toBeNull();
    expect(container.querySelector('[data-appliquer-calcul-carte="entree"]')).toBeNull();
    expect(container.querySelector('[data-statut-vente="entree"]')).toBeNull(); // LOT BE : « Statut à la vente » retiré (accord d'Arno)
    // Pierre (MACJ) : LOTS AA / AB — sur la carte de CRITERIMMO, pas de bloc de commission ; ses honoraires, versés à MACJ, en rouge.
    expect(container.querySelector('[data-commission-negociateur="sortie"]')).toBeNull();
    expect(texte('[data-reverse-cote="sortie"] [data-mention-commission]')).toBe('Comptabilisé dans « Commissions versées »'); // LOT BA : le cadre « Reversé en inter-cabinet à MACJ »
    expect(container.querySelector('[data-ecart-remuneration="sortie"]')).toBeNull();
    // sa part et le CA : inchangés ; sa commission : ni versée, ni interne
    expect(texte('[data-societe-cote="entree"]')).toBe('CRITERIMMO · 50 %');
    expect(texte('[data-ca-ttc]')).toBe('4 000 € TTC');
    await cliquer('[data-tuile="commissions"]');
    expect(categorie('internes')).toBe('Internes (associés, salariés) — non déduits : 0 € HT (0 € TTC)');
    // le bouton ouvert : aucun champ « Commission versée » ni taux pour lui
    await cliquer('[data-negociateur-carte="entree"]');
    expect(texte('[data-non-commissionne-choix="entree"]')).toBe('Non commissionné');
    expect(container.querySelector('[data-champ="commission-carte-entree"]')).toBeNull();
    expect(container.querySelector('[data-taux="commission-carte-entree"]')).toBeNull();
  });
  it('« Modifier » : ni champ ni taux pour lui ; ses 2 000 € déjà saisis repartent TELS QUELS (rien n’est effacé) ; Pierre a son champ', async () => {
    await carte(vente(false));
    await cliquer('[data-modifier-compromis="38"]');
    expect(texte('[data-non-commissionne-form="entree"]')).toBe('Non commissionné');
    expect(container.querySelector('[data-champ="commission-entree"]')).toBeNull();
    expect(container.querySelector('[data-taux="commission-entree"]')).toBeNull();
    expect(container.querySelector('[data-champ="commission-sortie"]')).not.toBeNull();
    await cliquer('[data-enregistrer-dossier]');
    const cs = (posts.at(-1) as { dossier: { commissions: Record<string, { montant: string; unite: string }> } }).dossier.commissions;
    expect([cs.entree.montant, cs.entree.unite]).toEqual(['2000', 'ttc']);
  });
  it('commissionné (le même administrateur) : le comportement actuel — sa commission, le calcul proposé, « Appliquer le calcul »', async () => {
    (references as { negociateurs: { id: number; commissionne?: boolean }[] }).negociateurs = (references.negociateurs as { id: number; commissionne?: boolean }[]).map((n) => (n.id === 2 ? { ...n, commissionne: true } : n));
    await carte(vente(true));
    expect(texte('[data-negociateur-carte="entree"]')).toBe('Négociateur : Arnaud Jorel · 50 %');
    // 🔴 LOT BI — Arnaud, associé : sa commission n'est pas distinguée — un seul cadre vert, tout son côté compté dans son CA
    expect(container.querySelector('[data-commission-negociateur="entree"]')).toBeNull();
    expect(texte('[data-part-agence="entree"] [data-mention-commission]')).toBe('Comptés dans le CA de Arnaud Jorel (associé, commissionné)');
    expect(texte('[data-ecart-remuneration="entree"]')).toBe('Commission enregistrée : 1 666,67 € HT (2 000 € TTC)Appliquer le calcul');
  });
});

describe('🔴 LOT T — colonnes Vendeurs / Acquéreurs : la société et la part en tête, le taux dans le bouton du négociateur, deux lignes de calcul', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const lc = (id: number, nego: string, cote: 'entree' | 'sortie', ttc: number, taux: number | null = null) => ({ id, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc,
    montantHt: null, cote, taux, nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  const pa = (sorte: 'entree' | 'sortie', id: number, nom: string, societe: 'criterimmo' | 'macj' | null, pct: number) =>
    ({ sorte, compteId: id, negociateur: nom, societe, nom: null, coordonnees: null, pourcentage: pct, montantHt: null, statut: 'independant' as const });
  // (LOT AA — Mylène dans la société de la carte, pour que son bloc de commission s'y affiche.)
  // L'exemple d'Arno : 7 500 TTC − 1 000 TTC d'apporteur = 6 500 TTC nets ; JB 60 % (1 950 = le calcul), Mylène 40 % au taux de 25 %, 1 625 enregistrés.
  const exemple: Vente = { ...compromis, honorairesTtc: 7500, retroApporteur: { montant: 1000, unite: 'ttc' },
    repartition: { retroApporteurTtc: 1000, parties: [pa('entree', 5, JB.nom, 'criterimmo', 60), pa('sortie', 7, MY.nom, 'criterimmo', 40)] },
    lignes: [lc(1, JB.nom, 'entree', 1950), lc(2, MY.nom, 'sortie', 1625, 25)] };
  const carte = async (v: Vente) => { listeCompromis = [v]; await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(v.id); };
  type Envoi = { action: string; dossier: { parties: { sorte: string; compteId: number | null; societe: string | null; pourcentage: number | null; nom: string | null }[];
    commissions: Record<'entree' | 'sortie', { montant: string; unite: string; taux: string | null } | null> } };

  it('première ligne : le titre à gauche, « CRITERIMMO · 60 % » / « MACJ · 40 % » à droite ; sur téléphone le bouton passe sous le titre', async () => {
    await carte(exemple);
    for (const [col, cote, mot, lib] of [['vendeur', 'entree', 'Vendeurs', 'CRITERIMMO · 60 %'], ['acquereur', 'sortie', 'Acquéreurs', 'CRITERIMMO · 40 %']]) {
      const tete = container.querySelector(`[data-colonne="${col}"] > .trx-colonne-tete`)!;
      expect([...tete.children].map((x) => [x.tagName, x.textContent])).toEqual([['H4', mot], ['BUTTON', lib]]);
      expect(tete.querySelector(`[data-societe-cote="${cote}"]`)).not.toBeNull();
    }
    const { CSS_TRANSACTION } = await import('./commun');
    const css = CSS_TRANSACTION.replace(/\s+/g, ' ');
    expect(css.slice(css.lastIndexOf('@media (max-width:640px){'))).toContain('.trx-colonne-tete{flex-direction:column;align-items:flex-start}');
  });

  it('taux 25 %, apporteur déduit : « 6 500 × 40 % = 2 600 » puis « 2 600 × 25 % = 650 » ; enregistrée différente : 1 625 en rouge et « Appliquer le calcul »', async () => {
    await carte(exemple);
    expect(texte('[data-negociateur-carte="sortie"]')).toBe('Négociateur : Mylène EBERLIN · 25 %');
    expect(texte('[data-honoraires-cote="sortie"]')).toBe('= Honoraires partie acquéreur : (6 250 € HT − 833,33 € HT) × 40 % = 2 166,67 € HT (2 600 € TTC)'); // LOT BB : (commission − apporteur) × part
    expect(texte('[data-commission-negociateur="sortie"]')).toBe('Commission du négociateur : 2 166,67 € HT × 25 % = 541,67 € HT (650 € TTC) Indépendant — comptabilisé dans « Commissions versées »');
    expect(texte('[data-commission-enregistree="sortie"]')).toBe('Commission enregistrée : 1 354,17 € HT (1 625 € TTC)');
    expect(container.querySelector('[data-commission-enregistree="sortie"]')!.className).toContain('trx-alerte');
    // l'ordre sous le bouton : les deux calculs, la ligne rouge, puis « Statut à la vente » (inchangé)
    const bloc = container.querySelector('[data-negociateur-cote="sortie"]')!;
    expect([...bloc.children].map((x) => [...x.attributes].map((a) => a.name).find((n) => n.startsWith('data-')))).toEqual(
      ['data-negociateur-carte', 'data-ventilation', 'data-ventilation', 'data-commission-negociateur', 'data-ecart-remuneration']); // LOT AZ / BA / BB : l'en-tête (avec l'apporteur), vert, puis la commission (plus de cadre d'apporteur)
    // LOT Z — « Statut à la vente » retirée (doublon) : le statut est dans la mention du bloc
    expect(container.querySelector('[data-statut-vente="sortie"]')).toBeNull();
    await cliquer('[data-appliquer-calcul-carte="sortie"]');
    expect(posts.at(-1)).toEqual({ action: 'commission-cote', id: 41, cote: 'sortie', montant: { montant: 650, unite: 'ttc' }, taux: 25, mode: 'calculee' });
  });

  it('enregistrée = le calcul : pas de ligne rouge (JB : 6 500 × 60 % = 3 900 ; × 50 % = 1 950)', async () => {
    await carte(exemple);
    expect(texte('[data-negociateur-carte="entree"]')).toBe('Négociateur : Jean-Baptiste PONS · 50 %');
    expect(texte('[data-honoraires-cote="entree"]')).toBe('= Honoraires partie vendeur : (6 250 € HT − 833,33 € HT) × 60 % = 3 250 € HT (3 900 € TTC)'); // LOT BB : (commission − apporteur) × part
    expect(texte('[data-commission-negociateur="entree"]')).toBe('Commission du négociateur : 3 250 € HT × 50 % = 1 625 € HT (1 950 € TTC) Indépendant — comptabilisé dans « Commissions versées »');
    expect(container.querySelector('[data-ecart-remuneration="entree"]')).toBeNull();
    expect(container.querySelector('[data-colonne="vendeur"] .trx-alerte')).toBeNull();
  });

  it('60/40 → 70/30 par le bouton de la première ligne (auto-compensation à deux parties) ; LOT V : la commission calculée suit, la saisie à la main reste', async () => {
    await carte(exemple);
    expect(container.querySelector('[data-reglage-repartition]')).toBeNull();
    await cliquer('[data-societe-cote="entree"]');
    const reglage = '[data-reglage-repartition="entree"]';
    // les parts seules : ni apporteur, ni liste de négociateurs, ni commission
    expect(container.querySelector(`${reglage} [data-champ="apporteur-annuaire"]`)).toBeNull();
    expect(container.querySelector(`${reglage} [data-champ="entree"]`)).toBeNull();
    expect(container.querySelector(`${reglage} [data-montant-unite]`)).toBeNull();
    expect(texte(`${reglage} [data-nego-partie="0"]`)).toBe(JB.nom);
    await saisir(`${reglage} [data-partie-pct="0"]`, '70');
    expect((container.querySelector(`${reglage} [data-partie-pct="1"]`) as HTMLInputElement).value).toBe('30');
    await cliquer('[data-valider-repartition="entree"]');
    const e = posts.at(-1) as Envoi;
    expect(e.action).toBe('dossier-enregistrer');
    expect(e.dossier.parties.map((p) => [p.compteId, p.pourcentage])).toEqual([[5, 70], [7, 30]]);
    // 🔴 LOT V — JB (1 950 = le calcul) est CALCULÉ : il suit 70 % (6 500 × 70 % × 50 % = 2 275) ; Mylène (1 625 ≠ 650) est saisie à la main : telle quelle.
    const sans = (c: { montant: string } | null) => (c === null ? null : { ...c, montant: c.montant.replace(/\s/g, ' ') });
    expect([sans(e.dossier.commissions.entree), sans(e.dossier.commissions.sortie)]).toEqual([{ montant: '2 275', unite: 'ttc', taux: null, mode: 'calculee' },
      { montant: '1625', unite: 'ttc', taux: '25', mode: 'manuelle' }]);
  });

  it('50/50, sans commission enregistrée : LOT V — le côté est CALCULÉ, il s’écrit avec la nouvelle répartition ; rien de changé : rien n’est envoyé', async () => {
    await carte({ ...exemple, repartition: { retroApporteurTtc: 1000, parties: [pa('entree', 5, JB.nom, 'criterimmo', 50), pa('sortie', 7, MY.nom, 'criterimmo', 50)] }, lignes: [] });
    expect([texte('[data-societe-cote="entree"]'), texte('[data-societe-cote="sortie"]')]).toEqual(['CRITERIMMO · 50 %', 'CRITERIMMO · 50 %']);
    expect(texte('[data-commission-carte="sortie"]')).toBe('Commission enregistrée : à renseigner');
    await cliquer('[data-societe-cote="sortie"]');
    await cliquer('[data-valider-repartition="sortie"]');
    expect(posts).toEqual([]);
    await cliquer('[data-societe-cote="sortie"]');
    await saisir('[data-reglage-repartition="sortie"] [data-partie-pct="1"]', '45');
    await cliquer('[data-valider-repartition="sortie"]');
    const e = posts.at(-1) as Envoi;
    expect(e.dossier.parties.map((p) => [p.compteId, p.pourcentage])).toEqual([[5, 55], [7, 45]]);
    // 6 500 × 55 % × 50 % = 1 787,50 ; 6 500 × 45 % × 50 % = 1 462,50 — calculées (le serveur refait le calcul sur ce qui s'enregistre)
    expect([e.dossier.commissions.entree, e.dossier.commissions.sortie].map((c) => [c?.montant.replace(/\s/g, ' '), (c as { mode?: string } | null)?.mode]))
      .toEqual([['1 787,50', 'calculee'], ['1 462,50', 'calculee']]);
  });

  it('partie extérieure : ajoutée depuis le réglage, la somme dite (Valider désactivé tant qu’elle ne fait pas 100 %), puis enregistrée', async () => {
    await carte(exemple);
    await cliquer('[data-societe-cote="sortie"]');
    const reglage = '[data-reglage-repartition="sortie"]';
    await cliquer(`${reglage} [data-ajouter-exterieure]`);
    await saisir(`${reglage} [data-partie-nom]`, 'Agence du Parc');
    await saisir(`${reglage} [data-partie-pct="2"]`, '20');
    expect(texte(`${reglage} [data-motif-repartition]`)).toMatch(/fait 120 %/);
    expect((container.querySelector('[data-valider-repartition="sortie"]') as HTMLButtonElement).disabled).toBe(true);
    await saisir(`${reglage} [data-partie-pct="1"]`, '20');
    expect((container.querySelector('[data-valider-repartition="sortie"]') as HTMLButtonElement).disabled).toBe(false);
    await cliquer('[data-valider-repartition="sortie"]');
    const e = posts.at(-1) as Envoi;
    expect(e.dossier.parties.map((p) => [p.sorte, p.compteId ?? p.nom, p.pourcentage])).toEqual([['entree', 5, 60], ['sortie', 7, 20], ['exterieure', 'Agence du Parc', 20]]);
  });

  it('avec une partie extérieure (40 / 40 / 20) : chaque côté lit sa part ; la carte relue garde le tableau « Répartition » des informations communes', async () => {
    await carte(compromis);
    expect([texte('[data-societe-cote="entree"]'), texte('[data-societe-cote="sortie"]')]).toEqual(['CRITERIMMO · 40 %', 'MACJ · 40 %']);
    expect(texte('[data-honoraires-cote="entree"]')).toBe('= Honoraires partie vendeur : (10 000 € HT − 2 000 € HT) × 50 % = 4 000 € HT (4 800 € TTC)'); // LOT BB : (commission − apporteur) × part parmi nos parties (40 / 80, agence extérieure comprise)
    expect(container.querySelector('[data-repartition-compromis] table')).not.toBeNull();
  });

  it('sans négociateur : « Société à définir · 50 % » ; le bouton du négociateur, « + Ajouter un négociateur », sans ligne de calcul', async () => {
    await carte({ ...compromis, repartition: null, dossier: { ...compromis.dossier!, entree: null, sortie: null } });
    expect([texte('[data-societe-cote="entree"]'), texte('[data-societe-cote="sortie"]')]).toEqual(['Société à définir · 50 %', 'Société à définir · 50 %']);
    expect(texte('[data-negociateur-carte="entree"]')).toBe('+ Ajouter un négociateur');
    expect(container.querySelector('[data-honoraires-cote]')).toBeNull();
  });

  it('« CRITERIMMO et MACJ » sans société sur la vente : « Société à choisir », le choix dans le réglage, obligatoire, puis enregistré', async () => {
    const CJ = { id: 9, nom: 'Cédric JULLIEN', societe: 'les_deux' as const };
    const negos = references.negociateurs;
    (references as { negociateurs: unknown[] }).negociateurs = [JB, MY, AU, CJ];
    try {
      await carte({ ...exemple, repartition: { retroApporteurTtc: 1000, parties: [pa('entree', 9, CJ.nom, null, 60), pa('sortie', 7, MY.nom, 'criterimmo', 40)] },
        dossier: { ...compromis.dossier!, entree: { id: 9, nom: CJ.nom } }, lignes: [] });
      expect(texte('[data-societe-cote="entree"]')).toBe('Société à choisir · 60 %');
      await cliquer('[data-societe-cote="entree"]');
      expect(container.querySelector('[data-reglage-repartition="entree"] [data-choix-societe-vente="partie-0"]')).not.toBeNull();
      expect((container.querySelector('[data-valider-repartition="entree"]') as HTMLButtonElement).disabled).toBe(true);
      await cliquer('[data-reglage-repartition="entree"] [data-choix-societe-vente="partie-0"] [data-societe-vente="criterimmo"]');
      await cliquer('[data-valider-repartition="entree"]');
      const e = posts.at(-1) as Envoi;
      expect(e.dossier.parties.map((p) => [p.compteId, p.societe])).toEqual([[9, 'criterimmo'], [7, 'criterimmo']]);
    } finally { (references as { negociateurs: unknown[] }).negociateurs = negos; }
  });

  it('non commissionné : « · non commissionné » dans le bouton et SEULE la ligne des honoraires', async () => {
    const negos = references.negociateurs;
    (references as { negociateurs: unknown[] }).negociateurs = [...negos, { id: 2, nom: 'Arnaud Jorel', societe: 'criterimmo', commissionne: false }];
    try {
      await carte({ ...exemple, repartition: { retroApporteurTtc: 1000, parties: [{ ...pa('entree', 2, 'Arnaud Jorel', 'criterimmo', 60), statut: 'associe', commissionneCompte: false },
        pa('sortie', 7, MY.nom, 'criterimmo', 40)] }, dossier: { ...compromis.dossier!, entree: { id: 2, nom: 'Arnaud Jorel' } }, lignes: [lc(1, 'Arnaud Jorel', 'entree', 2000)] });
      expect(texte('[data-negociateur-carte="entree"]')).toBe('Négociateur : Arnaud Jorel · non commissionné');
      expect(texte('[data-societe-cote="entree"]')).toBe('CRITERIMMO · 60 %');
      const bloc = container.querySelector('[data-negociateur-cote="entree"]')!;
      expect([...bloc.children].map((x) => [...x.attributes].map((a) => a.name).find((n) => n.startsWith('data-')))).toEqual(['data-negociateur-carte', 'data-ventilation', 'data-ventilation']); // LOT BE : plus de « Statut à la vente » — // LOT AZ / BA / BB : l'en-tête (avec l'apporteur), le statut, la part de l'agence
      expect(texte('[data-colonne="vendeur"]')).not.toContain('2 000 € TTC');
    } finally { (references as { negociateurs: unknown[] }).negociateurs = negos; }
  });
});

describe('🔴 LOT U — la base de répartition en tête du panneau ; les parts en € au centime', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const pa = (sorte: 'entree' | 'sortie', id: number, nom: string, societe: 'criterimmo' | 'macj', pct: number) =>
    ({ sorte, compteId: id, negociateur: nom, societe, nom: null, coordonnees: null, pourcentage: pct, montantHt: null, statut: 'independant' as const });
  // « Location ? » : 7 500 TTC, apporteur 1 000 TTC, 60 / 40.
  const vente = (parts: [number, number], apporteur = true): Vente => ({ ...compromis, honorairesTtc: 7500, retroApporteur: apporteur ? { montant: 1000, unite: 'ttc' } : null,
    apporteur: apporteur ? 'Julien Deblois' : null, repartition: { retroApporteurTtc: apporteur ? 1000 : 0, parties: [pa('entree', 5, JB.nom, 'criterimmo', parts[0]), pa('sortie', 7, MY.nom, 'macj', parts[1])] },
    dossier: { ...compromis.dossier!, apporteurId: apporteur ? 4 : null }, lignes: [] });
  const ligne = (sel: string) => [...container.querySelectorAll(`${sel} th, ${sel} td`)].map((x) => x.textContent!.replace(/\s/g, ' '));
  const eurs = (r: string) => [...container.querySelectorAll(`${r} [data-partie-eur]`)].map((i) => (i as HTMLInputElement).value.replace(/\s/g, ' '));
  const panneau = async (v: Vente) => { listeCompromis = [v]; await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(v.id); await cliquer('[data-societe-cote="entree"]'); };

  it('avec apporteur : « Commission de la vente », « − Apporteur : Nom » (montant en rouge), « = Base de répartition » en gras ; en tête, avant les parties', async () => {
    await panneau(vente([60, 40]));
    const r = '[data-reglage-repartition="entree"]';
    expect(ligne(`${r} [data-resume-base] thead`)).toEqual(['', 'HT (TTC)']);
    expect(ligne(`${r} [data-resume="commission"]`)).toEqual(['Commission de la vente', '6 250 € HT (7 500 € TTC)']);
    expect(ligne(`${r} [data-resume="apporteur"]`)).toEqual(['− Apporteur : Julien Deblois', '833,33 € HT (1 000 € TTC)']);
    expect(container.querySelector(`${r} [data-resume-ttc="apporteur-0"]`)!.className).toBe('trx-mt-petit trx-rouge'); // LOT AM : le petit, même couleur
    expect(container.querySelector(`${r} [data-resume="apporteur"] th`)!.className).not.toContain('trx-rouge');
    expect(ligne(`${r} [data-resume="base"]`)).toEqual(['= Base de répartition tous les calculs ci-dessous partent de cette base', '5 416,67 € HT (6 500 € TTC)']);
    expect(container.querySelector(`${r} [data-resume="base"]`)!.className).toBe('trx-resume-base-total trx-somme-ligne'); // LOT AP : la trame des sommes
    const bloc = container.querySelector(`${r} [data-bloc-repartition]`)!;
    expect(bloc.querySelector('[data-resume-base]')!.compareDocumentPosition(bloc.querySelector('[data-parties]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 60 / 40 de 5 416,67 HT : au centime, et la somme tombe juste
    expect(eurs(r)).toEqual(['3 250', '2 166,67']);
    // le bas du panneau garde le total, le CA de la vente et les parts par société ; plus la phrase « commission nette »
    expect(texte(`${r} [data-total-repartition]`)).not.toContain('de commission nette');
    expect(container.querySelector(`${r} [data-inter-cabinet-form]`)).not.toBeNull();
    expect(container.querySelector(`${r} [data-parts-societes]`)).not.toBeNull();
  });

  it('sans apporteur : « Aucun apporteur » (sans rouge), la base = la commission de la vente', async () => {
    await panneau(vente([50, 50], false));
    const r = '[data-reglage-repartition="entree"]';
    expect(ligne(`${r} [data-resume="aucun-apporteur"]`)).toEqual(['Aucun apporteur', '']);
    expect(container.querySelector(`${r} [data-resume-base] .trx-rouge`)).toBeNull();
    expect(ligne(`${r} [data-resume="base"]`).slice(1)).toEqual(['6 250 € HT (7 500 € TTC)']);
  });

  it('50 / 50 de 5 416,67 € HT : la somme juste au centime — LOT AH : l’écart sur la part de la PORTEUSE (JB, CRITERIMMO), celle de MACJ = sa part partout', async () => {
    await panneau(vente([50, 50]));
    expect(eurs('[data-reglage-repartition="entree"]')).toEqual(['2 708,34', '2 708,33']);
    const { montantsAffiches } = await import('./Repartition');
    const net = 6500 / 1.2;
    const pct = (t: string) => ({ mode: 'pct' as const, texte: t });
    const tiers = montantsAffiches([pct('33,3333'), pct('33,3333'), pct('33,3334')], [net * 0.333333, net * 0.333333, net * 0.333334], net);
    expect(tiers.map((x) => x.toFixed(2))).toEqual(['1805.55', '1805.55', '1805.57']);
    expect(Math.round(tiers.reduce((t, x) => t + x, 0) * 100)).toBe(Math.round(net * 100));
    // une part SAISIE en € garde sa saisie ; l'écart va sur la dernière part calculée
    const saisie = montantsAffiches([{ mode: 'eur', texte: '1000,005' }, pct('81,5385')], [1000.005, net - 1000.005], net);
    expect(saisie[0]).toBe(1000.005);
    expect(saisie[1].toFixed(2)).toBe('4416.66');
    // une somme qui ne fait pas la base (total ≠ 100 %) : simple arrondi, rien de reporté
    expect(montantsAffiches([pct('50'), pct('60')], [net * 0.5, net * 0.6], net).map((x) => x.toFixed(2))).toEqual(['2708.33', '3250.00']);
  });

  it('formulaire (Nouveau compromis) : le résumé se met à jour en direct quand la commission ou l’apporteur change', async () => {
    await ouvrir(); await cliquer('[data-vue="compromis"]'); await cliquer('[data-nouveau-compromis]');
    await saisirTtc('[data-champ="commission"]', '7500');
    expect(ligne('[data-resume="commission"]')).toEqual(['Commission de la vente', '6 250 € HT (7 500 € TTC)']);
    expect(container.querySelector('[data-resume="aucun-apporteur"]')).not.toBeNull();
    await cliquer('[data-champ="apporteur-annuaire"]'); await cliquer('[role="option"][data-option="4"]');
    await saisirTtc('[data-champ="retro"]', '1000'); // LOT AN : le sélecteur général (plus de boutons au champ)
    expect(ligne('[data-resume="apporteur"]')).toEqual(['− Apporteur : Julien Deblois', '833,33 € HT (1 000 € TTC)']);
    expect(ligne('[data-resume="base"]').slice(1)).toEqual(['5 416,67 € HT (6 500 € TTC)']);
    await saisirTtc('[data-champ="commission"]', '8500');
    expect(ligne('[data-resume="base"]').slice(1)).toEqual(['6 250 € HT (7 500 € TTC)']);
  });

  it('deux apporteurs : une ligne chacun, retranchés tous deux de la base', async () => {
    const { ResumeBase } = await import('./Repartition');
    await act(async () => { root.render(createElement(ResumeBase, { commissionTtc: 7500, apporteurs: [{ nom: 'Julien Deblois', ttc: 1000 }, { nom: 'Gardien Dacquet', ttc: 600 }] })); });
    expect([...container.querySelectorAll('[data-resume="apporteur"]')].map((x) => x.textContent!.replace(/\s/g, ' '))).toEqual(
      ['− Apporteur : Julien Deblois1 000 € TTC (833,33 € HT)', '− Apporteur : Gardien Dacquet600 € TTC (500 € HT)']); // LOT AM : hors onglet, le défaut TTC
    expect(ligne('[data-resume="base"]').slice(1)).toEqual(['5 900 € TTC (4 916,67 € HT)']);
  });
});

describe('🔴 LOT V — la commission du négociateur suit le calcul ; HT en gras, TTC en vert ; le tableau au centime', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const lc = (id: number, nego: string, cote: 'entree' | 'sortie', ttc: number, taux: number | null = null, mode: 'calculee' | 'manuelle' | null = null) => ({ id, negociateur: nego,
    role: 'negociateur' as const, montantTtc: ttc, montantHt: null, cote, taux, mode, nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  const pa = (sorte: 'entree' | 'sortie', id: number, nom: string, pct: number) =>
    ({ sorte, compteId: id, negociateur: nom, societe: 'criterimmo' as const, nom: null, coordonnees: null, pourcentage: pct, montantHt: null, statut: 'salarie' as const });
  // « Location ? » : 7 500 TTC − 1 000 d'apporteur ; 70 / 30, Mylène au taux de 25 %.
  const location = (lignes: ReturnType<typeof lc>[], parts: [number, number] = [70, 30]): Vente => ({ ...compromis, id: 37, libelle: 'Location ?', honorairesTtc: 7500, retroApporteur: { montant: 1000, unite: 'ttc' },
    repartition: { retroApporteurTtc: 1000, parties: [pa('entree', 5, JB.nom, parts[0]), pa('sortie', 7, MY.nom, parts[1])] }, lignes });
  const carte = async (v: Vente) => { listeCompromis = [v]; await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(v.id); };
  const champ = (sel: string) => (container.querySelector(sel) as HTMLInputElement).value.replace(/\s/g, ' ');
  type Envoi = { action: string; dossier: { commissions: Record<'entree' | 'sortie', { montant: string; unite: string; taux: string | null; mode: string } | null> } };

  it('le constat d’Arno : 650 € gardés quand le calcul dit 487,50 € — une commission d’avant égale au calcul est CALCULÉE : le champ suit le calcul', async () => {
    // 650 € (= 6 500 × 40 % × 25 %, le calcul d'AVANT le passage à 70/30) : à l'écran, la répartition est déjà 70/30 et le calcul 487,50.
    await carte(location([lc(450, MY.nom, 'sortie', 487.5, 25)]));
    expect(container.querySelector('[data-ecart-remuneration="sortie"]')).toBeNull();
    await cliquer('[data-negociateur-carte="sortie"]');
    await basculerUnite('ttc'); // LOT AN : les champs suivent le sélecteur général
    expect(champ('[data-champ="commission-carte-sortie"]')).toBe('487,50');
    // le taux recalcule le montant, en direct (l'un recalcule l'autre)
    await saisir('[data-taux="commission-carte-sortie"]', '40');
    expect(champ('[data-champ="commission-carte-sortie"]')).toBe('780');
    await cliquer('[data-valider-negociateur]');
    const e = posts.at(-1) as Envoi;
    expect([e.dossier.commissions.sortie?.taux, e.dossier.commissions.sortie?.mode]).toEqual(['40', 'calculee']);
  });

  it('un montant tapé : envoyé « à la main » ; relu, « saisi à la main — calcul : X » et « Revenir au calcul » (mode calculée)', async () => {
    await carte(location([lc(450, MY.nom, 'sortie', 487.5, 25)]));
    await cliquer('[data-negociateur-carte="sortie"]');
    await saisir('[data-champ="commission-carte-sortie"]', '1000');
    await cliquer('[data-valider-negociateur]');
    expect((posts.at(-1) as Envoi).dossier.commissions.sortie).toMatchObject({ montant: '1000', mode: 'manuelle' });
    act(() => { root.unmount(); }); root = createRoot(container); posts = [];
    await carte(location([lc(450, MY.nom, 'sortie', 1000, 51.282051282, 'manuelle')]));
    expect(texte('[data-commission-manuelle="sortie"]')).toBe('Commission enregistrée : 833,33 € HT (1 000 € TTC) — saisi à la main — calcul : 833,33 € HT (1 000 € TTC)Revenir au calcul');
    expect(container.querySelector('[data-commission-manuelle="sortie"] .trx-alerte')).toBeNull();
    await cliquer('[data-appliquer-calcul-carte="sortie"]');
    expect(posts.at(-1)).toMatchObject({ action: 'commission-cote', id: 37, cote: 'sortie', mode: 'calculee' });
  });

  it('une saisie à la main survit au changement de répartition (relue sur 50/50 : calcul 812,50, la ligne le dit, le montant reste 1 000)', async () => {
    await carte(location([lc(450, MY.nom, 'sortie', 1000, 25, 'manuelle')], [50, 50]));
    expect(texte('[data-commission-manuelle="sortie"]')).toBe('Commission enregistrée : 833,33 € HT (1 000 € TTC) — saisi à la main — calcul : 677,08 € HT (812,50 € TTC)Revenir au calcul');
    await cliquer('[data-societe-cote="sortie"]');
    await saisir('[data-reglage-repartition="sortie"] [data-partie-pct="1"]', '40');
    await cliquer('[data-valider-repartition="sortie"]');
    expect((posts.at(-1) as Envoi).dossier.commissions.sortie).toMatchObject({ montant: '1000', mode: 'manuelle' });
  });

  it('existantes : égale au calcul → calculée (aucune ligne de plus) ; différente (650 € d’avant, sans mode) → rouge et « Appliquer le calcul »', async () => {
    await carte(location([lc(449, JB.nom, 'entree', 2275), lc(450, MY.nom, 'sortie', 650, 25)]));
    expect(container.querySelector('[data-ecart-remuneration="entree"]')).toBeNull();
    expect(container.querySelector('[data-commission-manuelle="entree"]')).toBeNull();
    expect(texte('[data-ecart-remuneration="sortie"]')).toBe('Commission enregistrée : 541,67 € HT (650 € TTC)Appliquer le calcul');
    // dans « Modifier » : JB suit le calcul, Mylène reste à 650 (rien n'est réécrit sans geste)
    await cliquer('[data-modifier-compromis="37"]');
    await cliquer('[data-enregistrer-dossier]');
    const cs = (posts.at(-1) as Envoi).dossier.commissions;
    expect([cs.entree?.mode, cs.sortie?.montant, cs.sortie?.mode]).toEqual(['calculee', '650', 'manuelle']);
  });

  it('affichage : le HT en gras d’abord, puis le TTC entre parenthèses, en vert (« TTC » écrit) ; l’apporteur reste rouge', async () => {
    await carte(location([lc(449, JB.nom, 'entree', 2275)]));
    const h = container.querySelector('[data-honoraires-cote="sortie"][data-ht-ttc]')!;
    expect(h.querySelector('strong')!.textContent!.replace(/\s/g, ' ')).toBe('1 625 € HT'); // LOT BB : les honoraires nets de l'apporteur
    expect(h.querySelector('.trx-calcul-ttc')!.textContent!.replace(/\s/g, ' ')).toBe('(1 950 € TTC)'); // LOT AM : l'encre (couleur selon le sens) ; LOT BB : nets de l'apporteur
    expect(h.querySelector('.trx-vert')).toBeNull();
    expect(texte('[data-honoraires-cote="sortie"]')).toBe('= Honoraires partie acquéreur : (6 250 € HT − 833,33 € HT) × 30 % = 1 625 € HT (1 950 € TTC)');
    expect(texte('[data-commission-negociateur="sortie"]')).toBe('Commission du négociateur : 1 625 € HT × 50 % = 812,50 € HT (975 € TTC) Salarié interne — non comptabilisé dans « Commissions versées »');
    await cliquer('[data-societe-cote="entree"]');
    const r = '[data-reglage-repartition="entree"]';
    expect(container.querySelector(`${r} [data-resume-ht="commission"] strong`)!.textContent!.replace(/\s/g, ' ')).toBe('6 250 € HT');
    expect(container.querySelector(`${r} [data-resume-ttc="commission"]`)!.className).toBe('trx-mt-petit trx-vert'); // LOT AM : le CA en vert
    expect([container.querySelector(`${r} [data-resume-ht="apporteur-0"]`)!.className, container.querySelector(`${r} [data-resume-ttc="apporteur-0"]`)!.className]).toEqual(['trx-rouge', 'trx-mt-petit trx-rouge']); // LOT AM : le grand puis le petit
  });

  it('tableau « Répartition » des informations communes : 50 / 50 de 5 416,67 € HT = 2 708,33 + 2 708,34, la somme juste au centime', async () => {
    await carte(location([], [50, 50]));
    expect([texte('[data-part-partie-compromis="0"]'), texte('[data-part-partie-compromis="1"]')]).toEqual(['2 708,33 € HT(3 250 € TTC)', '2 708,34 € HT(3 250 € TTC)']);
    expect(texte('[data-part-societe-compromis="criterimmo"]')).toBe('5 416,67 € HT(6 500 € TTC)');
  });

  it('ligne miroir : « Modifier la rémunération » envoie le mode (taux → calculée ; montant tapé → à la main)', async () => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    const heididon: Vente = { ...compromis, id: 38, libelle: 'HEIDIDON', honorairesTtc: 4000, apporteur: null, prixVente: null, repartition: { retroApporteurTtc: 0, parties: [
      { sorte: 'entree', compteId: 2, negociateur: 'Arnaud Jorel', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'associe' },
      { sorte: 'sortie', compteId: 8, negociateur: 'Pierre Thevenin', societe: 'macj', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' }] },
    dossier: { ...compromis.dossier!, entree: { id: 2, nom: 'Arnaud Jorel' }, sortie: { id: 8, nom: 'Pierre Thevenin' }, apporteurId: null }, lignes: [lc(446, 'Pierre Thevenin', 'sortie', 1000)] };
    listeCompromis = [venteDansSociete(heididon, 'macj')!];
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
    await cliquer('[data-vue="compromis"]'); await cliquer('[data-deplier="miroir-38"]');
    // 1 000 = le calcul : calculée, aucune ligne de plus
    expect(container.querySelector('[data-ecart-remuneration="sortie"]')).toBeNull();
    await cliquer('[data-modifier-remuneration="sortie"]');
    await basculerUnite('ttc'); // LOT AN : les champs suivent le sélecteur général
    await saisir('[data-taux="remuneration-sortie"]', '60');
    await cliquer('[data-valider-remuneration="sortie"]');
    expect(posts.at(-1)).toMatchObject({ action: 'commission-cote', id: 38, cote: 'sortie', montant: { montant: 1200, unite: 'ttc' }, taux: 60, mode: 'calculee' });
    await cliquer('[data-modifier-remuneration="sortie"]');
    await saisir('[data-champ="remuneration-sortie"]', '900');
    await cliquer('[data-valider-remuneration="sortie"]');
    expect(posts.at(-1)).toMatchObject({ montant: { montant: 900, unite: 'ttc' }, mode: 'manuelle' });
  });
});

describe('🔴 LOT W — les lignes de calcul sur deux lignes : HT en gras puis TTC en vert dessous, dans une colonne fixe', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const pa = (sorte: 'entree' | 'sortie', id: number, nom: string, pct: number, o: Record<string, unknown> = {}) =>
    ({ sorte, compteId: id, negociateur: nom, societe: 'criterimmo' as const, nom: null, coordonnees: null, pourcentage: pct, montantHt: null, statut: 'salarie' as const, ...o });
  const structure = (sel: string) => { const p = container.querySelector(sel)!; return [...p.children].map((x) => [x.tagName, x.className, x.textContent!.replace(/\s/g, ' ')]); };

  it('montants très longs (2 962 962,94 € TTC de commission) : libellé, puis HT (gras) et TTC (vert) en deux éléments distincts, l’un sous l’autre', async () => {
    listeCompromis = [{ ...compromis, honorairesTtc: 2962962.94, retroApporteur: null, repartition: { retroApporteurTtc: 0, parties: [pa('entree', 5, JB.nom, 50), pa('sortie', 7, MY.nom, 50)] }, lignes: [] }];
    await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(41);
    expect(structure('[data-honoraires-cote="sortie"]')).toEqual([
      ['SPAN', 'trx-calcul-libelle', 'Honoraires partie acquéreur : 2 469 135,78 € HT × 50 % ='],
      ['STRONG', 'trx-calcul-resultat', '1 234 567,89 € HT'],
      ['SPAN', 'trx-calcul-ttc trx-mt-petit', '(1 481 481,47 € TTC)']]);
    expect(structure('[data-commission-negociateur="sortie"]').map((x) => x[1])).toEqual(['trx-calcul-libelle', 'trx-calcul-resultat', 'trx-calcul-ttc trx-mt-petit', 'trx-calcul-mention']);
    // l'opération est d'un seul tenant (jamais un « = » seul à la ligne)
    expect(texte('[data-honoraires-cote="sortie"] .trx-calcul-operation')).toBe('2 469 135,78 € HT × 50 % =');
    // le texte lu (lecteur d'écran) garde ses espaces
    expect(texte('[data-commission-negociateur="sortie"]')).toBe('Commission du négociateur : 1 234 567,89 € HT × 50 % = 617 283,95 € HT (740 740,74 € TTC) Salarié interne — non comptabilisé dans « Commissions versées »');
  });

  it('montants courts ; non commissionné : la ligne des honoraires seule, même disposition', async () => {
    const negos = references.negociateurs;
    (references as { negociateurs: unknown[] }).negociateurs = [...negos, { id: 2, nom: 'Arnaud Jorel', societe: 'criterimmo', commissionne: false }];
    try {
      listeCompromis = [{ ...compromis, honorairesTtc: 120, retroApporteur: null, repartition: { retroApporteurTtc: 0, parties: [pa('entree', 2, 'Arnaud Jorel', 50, { commissionneCompte: false }), pa('sortie', 7, MY.nom, 50)] },
        dossier: { ...compromis.dossier!, entree: { id: 2, nom: 'Arnaud Jorel' } }, lignes: [] }];
      await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(41);
      expect(structure('[data-honoraires-cote="entree"]').map((x) => x[2])).toEqual(['Honoraires partie vendeur : 100 € HT × 50 % =', '50 € HT', '(60 € TTC)']);
      expect(container.querySelector('[data-commission-negociateur="entree"]')).toBeNull();
    } finally { (references as { negociateurs: unknown[] }).negociateurs = negos; }
  });

  it('ligne miroir : « Commission du négociateur », même disposition (LOT AK : plus de « Honoraires reçus de … »)', async () => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    const v: Vente = { ...compromis, id: 38, honorairesTtc: 4000, retroApporteur: null, repartition: { retroApporteurTtc: 0, parties: [pa('entree', 5, JB.nom, 50),
      { ...pa('sortie', 7, MY.nom, 50), societe: 'macj' as const, statut: 'independant' as const }] }, lignes: [] };
    listeCompromis = [venteDansSociete(v, 'macj')!];
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
    await cliquer('[data-vue="compromis"]'); await cliquer('[data-deplier="miroir-38"]');
    expect(texte('[data-honoraires-cote="sortie"]')).toContain('Honoraires reçus de CRITERIMMO'); // LOT BA : en tête, sans cadre
    expect(structure('[data-commission-negociateur="sortie"]').map((x) => x[2])).toEqual(['Commission du négociateur : 1 666,67 € HT × 50 % =', '833,33 € HT', '(1 000 € TTC)', 'Indépendant — comptabilisé dans « Commissions versées »']);
  });

  it('le résumé du panneau Répartition : HT puis TTC l’un sous l’autre, dans la même cellule ; les règles CSS (colonne fixe, aucun retour à la ligne, libellé au-dessus si étroit)', async () => {
    const { ResumeBase } = await import('./Repartition');
    await act(async () => { root.render(createElement(ResumeBase, { commissionTtc: 2962962.94, apporteurs: [{ nom: 'Julien Deblois', ttc: 1000 }] })); });
    const td = container.querySelector('[data-resume="base"] td')!;
    expect([...td.children].map((x) => x.textContent!.replace(/\s/g, ' '))).toEqual(['2 961 962,94 € TTC', '(2 468 302,45 € HT)']); // LOT AM : hors onglet, le défaut TTC
    const { CSS_TRANSACTION } = await import('./commun');
    const css = CSS_TRANSACTION.replace(/\s+/g, ' ');
    for (const r of ['.trx-calcul-grille{display:grid;grid-template-columns:minmax(0,1fr) 12em;', '.trx-calcul-resultat,.trx-calcul-ttc{grid-column:2;text-align:right;white-space:nowrap}',
      '@container (max-width:30rem){', '.trx-calcul-operation{white-space:nowrap}', '.trx-resume-base td.trx-resume-montants{width:12em}', '.trx-resume-montants > span{display:block;white-space:nowrap}']) expect(css).toContain(r);
  });
});

describe('🔴 LOT X — « Commission du négociateur » entourée d’un liseré rouge fin', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const pa = (sorte: 'entree' | 'sortie', id: number, nom: string, societe: 'criterimmo' | 'macj', o: Record<string, unknown> = {}) =>
    ({ sorte, compteId: id, negociateur: nom, societe, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' as const, ...o });
  const encadre = (sel: string) => container.querySelector(sel)?.classList.contains('trx-calcul-encadre') ?? null;

  it('chaque côté : la commission encadrée (le mot avec), les honoraires non ; non commissionné : aucun liseré (pas de ligne de commission)', async () => {
    const negos = references.negociateurs;
    (references as { negociateurs: unknown[] }).negociateurs = [...negos, { id: 2, nom: 'Arnaud Jorel', societe: 'criterimmo', commissionne: false }];
    try {
      listeCompromis = [{ ...compromis, retroApporteur: null, repartition: { retroApporteurTtc: 0, parties: [pa('entree', 2, 'Arnaud Jorel', 'criterimmo', { commissionneCompte: false }), pa('sortie', 7, MY.nom, 'criterimmo')] },
        dossier: { ...compromis.dossier!, entree: { id: 2, nom: 'Arnaud Jorel' } }, lignes: [] }];
      await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(41);
      expect([encadre('[data-commission-negociateur="sortie"]'), encadre('[data-honoraires-cote="sortie"]'), encadre('[data-honoraires-cote="entree"]')]).toEqual([true, false, false]);
      expect(texte('[data-commission-negociateur="sortie"] .trx-calcul-mot')).toBe('Commission du négociateur');
      expect(container.querySelector('[data-colonne="vendeur"] .trx-calcul-encadre:not(.trx-calcul-encadre--agence)')).toBeNull(); // LOT AY : seule la part de l'agence
    } finally { (references as { negociateurs: unknown[] }).negociateurs = negos; }
    const { CSS_TRANSACTION } = await import('./commun');
    expect(CSS_TRANSACTION.replace(/\s+/g, ' ')).toContain('.trx-calcul-encadre{border:1.5px solid var(--color-svv-red);border-radius:10px;padding:6px 8px;box-sizing:border-box}');
  });

  it('ligne miroir : la commission encadrée (LOT AK : plus de ligne d’honoraires reçus)', async () => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    const v: Vente = { ...compromis, id: 38, honorairesTtc: 4000, retroApporteur: null, repartition: { retroApporteurTtc: 0, parties: [pa('entree', 5, JB.nom, 'criterimmo'), pa('sortie', 7, MY.nom, 'macj')] }, lignes: [] };
    listeCompromis = [venteDansSociete(v, 'macj')!];
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
    await cliquer('[data-vue="compromis"]'); await cliquer('[data-deplier="miroir-38"]');
    expect([encadre('[data-commission-negociateur="sortie"]'), encadre('[data-honoraires-cote="sortie"]')]).toEqual([true, false]); // LOT BA : « Honoraires reçus de … », sans cadre
  });
});

describe('🔴 LOT Y — la couleur du liseré suit la règle du cumul « Commissions versées » (la même fonction que les tuiles)', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const lc = (nego: string, cote: 'entree' | 'sortie', ttc: number) => ({ id: cote === 'entree' ? 1 : 2, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc, montantHt: null, cote,
    nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  // 12 000 TTC, sans apporteur : JB (CRITERIMMO) 50 % à l'entrée, Mylène (CRITERIMMO) 50 % à la sortie ; 3 000 TTC chacun (= le calcul).
  const vente = (statutJB: string | null, o: Record<string, unknown> = {}): Vente => ({ ...compromis, retroApporteur: null, repartition: { retroApporteurTtc: 0, parties: [
    { sorte: 'entree', compteId: 5, negociateur: JB.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: statutJB as 'associe', statutCompte: null, ...o },
    { sorte: 'sortie', compteId: 7, negociateur: MY.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'salarie' }] },
    lignes: [lc(JB.nom, 'entree', 3000), lc(MY.nom, 'sortie', 3000)] });
  const lire = (cote: string) => { const p = container.querySelector(`[data-commission-negociateur="${cote}"]`); return p === null ? null
    : [p.getAttribute('data-classe-commission'), p.classList.contains('trx-calcul-encadre--deduite') ? 'rouge' : p.classList.contains('trx-calcul-encadre--interne') ? 'vert' : '—', texte(`[data-commission-negociateur="${cote}"] [data-mention-commission]`)]; };
  const carte = async (v: Vente) => { listeCompromis = [v]; act(() => { root.unmount(); }); root = createRoot(container); await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(v.id); };

  it('indépendant → rouge (la tuile le compte) ; associé, salarié, à renseigner → vert (la tuile ne le compte pas) ; LOT Z : la mention dit le statut', async () => {
    // LOT Z — la mention dit le statut à la vente (« (à confirmer) » quand rien n'est figé ni connu).
    for (const [statut, attendu] of [['independant', ['deduite', 'rouge', 'Indépendant — comptabilisé dans « Commissions versées »']], ['associe', null],
      ['salarie', ['interne', 'vert', 'Salarié interne — non comptabilisé dans « Commissions versées »']], [null, ['interne', 'vert', 'Statut à renseigner (à confirmer) — non comptabilisé dans « Commissions versées »']]] as const) {
      await carte(vente(statut));
      expect(lire('entree')).toEqual(attendu); // 🔴 LOT BI — l'associé : pas de cadre de commission (son côté est un seul cadre vert)
      if (statut === 'associe') expect(texte('[data-part-agence="entree"] [data-mention-commission]')).toBe('Comptés dans le CA de Jean-Baptiste PONS (associé, commissionné)');
      // la même règle que la tuile : seul l'indépendant entre dans « Commissions versées » (JB : 2 500 € HT)
      await cliquer('[data-tuile="commissions"]');
      expect(categorie('independants')).toBe(statut === 'independant' ? 'Indépendants : 2 500 € HT (3 000 € TTC)' : 'Indépendants : 0 € HT (0 € TTC)');
      // LOT Z — la ligne « Statut à la vente » est retirée (doublon) : le bloc est le dernier
      const bloc = container.querySelector('[data-negociateur-cote="entree"]')!;
      expect([...bloc.children].map((x) => [...x.attributes].map((a) => a.name).find((n) => n.startsWith('data-'))).slice(-2))
        .toEqual(statut === 'associe' ? ['data-ventilation', 'data-ventilation'] : ['data-ventilation', 'data-commission-negociateur']); // LOT AZ / BI
    }
  });

  it('sans statut figé : le statut du compte (indépendant) → rouge, comme la tuile', async () => {
    await carte(vente(null, { statutCompte: 'independant' }));
    expect(lire('entree')).toEqual(['deduite', 'rouge', 'Indépendant (statut actuel du compte) — comptabilisé dans « Commissions versées »']);
  });

  it('non commissionné : aucun liseré (aucune ligne de commission)', async () => {
    const negos = references.negociateurs;
    (references as { negociateurs: unknown[] }).negociateurs = [...negos, { id: 2, nom: 'Arnaud Jorel', societe: 'criterimmo', commissionne: false }];
    try {
      await carte({ ...vente('associe', { compteId: 2, negociateur: 'Arnaud Jorel', commissionneCompte: false }), dossier: { ...compromis.dossier!, entree: { id: 2, nom: 'Arnaud Jorel' } } });
      expect(lire('entree')).toBeNull();
      expect(container.querySelector('[data-colonne="vendeur"] .trx-calcul-encadre:not(.trx-calcul-encadre--agence)')).toBeNull(); // LOT AY : seule la part de l'agence
      expect(lire('sortie')).toEqual(['interne', 'vert', 'Salarié interne — non comptabilisé dans « Commissions versées »']);
    } finally { (references as { negociateurs: unknown[] }).negociateurs = negos; }
  });

  it('ligne miroir : Mylène indépendante chez MACJ → rouge ; un salarié de MACJ → vert', async () => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    const origine = (statut: 'independant' | 'salarie'): Vente => ({ ...compromis, id: 38, honorairesTtc: 4000, retroApporteur: null, repartition: { retroApporteurTtc: 0, parties: [
      { sorte: 'entree', compteId: 5, negociateur: JB.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'associe' },
      { sorte: 'sortie', compteId: 7, negociateur: MY.nom, societe: 'macj', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut }] }, lignes: [lc(MY.nom, 'sortie', 1000)] });
    for (const [statut, couleur] of [['independant', 'rouge'], ['salarie', 'vert']] as const) {
      listeCompromis = [venteDansSociete(origine(statut), 'macj')!];
      act(() => { root.unmount(); }); root = createRoot(container);
      await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
      await cliquer('[data-vue="compromis"]'); await cliquer('[data-deplier="miroir-38"]');
      expect(lire('sortie')?.[1]).toBe(couleur);
    }
  });

  it('les jetons : alerte pour « déduite », succès pour « interne » ; la mention de la même couleur', async () => {
    const { CSS_TRANSACTION } = await import('./commun');
    const css = CSS_TRANSACTION.replace(/\s+/g, ' ');
    for (const r of ['.trx-calcul-encadre--deduite{border-color:var(--color-svv-red)}', '.trx-calcul-encadre--interne{border-color:var(--color-svv-green-ink)}',
      '.trx-calcul-encadre--deduite .trx-calcul-mention{color:var(--color-svv-red)}', '.trx-calcul-encadre--interne .trx-calcul-mention{color:var(--color-svv-green-ink)}']) expect(css).toContain(r);
  });
});

describe('🔴 LOT Z — la mention du bloc dit le statut ; la ligne « Statut à la vente » retirée quand le bloc existe', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const C = ' — comptabilisé dans « Commissions versées »';
  const N = ' — non comptabilisé dans « Commissions versées »';
  const pa = (sorte: 'entree' | 'sortie', id: number, nom: string, o: Record<string, unknown>) =>
    ({ sorte, compteId: id, negociateur: nom, societe: 'criterimmo' as const, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, ...o });
  const carte = async (statutJB: Record<string, unknown>) => {
    listeCompromis = [{ ...compromis, retroApporteur: null, repartition: { retroApporteurTtc: 0, parties: [pa('entree', 5, JB.nom, statutJB), pa('sortie', 7, MY.nom, { statut: 'salarie' })] }, lignes: [] }];
    act(() => { root.unmount(); }); root = createRoot(container);
    await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(41);
  };
  // 🔴 LOT BI — un associé n'a plus de cadre de commission : la mention se lit dans son cadre vert (« Comptés dans le CA de … »).
  const mention = (cote: string) => texte(`[data-commission-negociateur="${cote}"] [data-mention-commission]`) || texte(`[data-part-agence="${cote}"] [data-mention-commission]`);

  it('salarié, associé commissionné, indépendant, à renseigner : la mention exacte ; plus de ligne « Statut à la vente » sous le bloc', async () => {
    for (const [o, attendu] of [[{ statut: 'salarie' }, `Salarié interne${N}`], [{ statut: 'associe', commissionneCompte: true }, 'Comptés dans le CA de Jean-Baptiste PONS (associé, commissionné)'],
      [{ statut: 'independant' }, `Indépendant${C}`], [{ statut: null, statutCompte: null }, `Statut à renseigner (à confirmer)${N}`],
      [{ statut: null, statutCompte: 'associe' }, 'Comptés dans le CA de Jean-Baptiste PONS (associé, commissionné)']] as const) {
      await carte(o);
      expect(mention('entree')).toBe(attendu);
      expect(container.querySelector('[data-statut-vente="entree"]')).toBeNull();
    }
  });

  it('non commissionné : pas de bloc, la ligne reste — « Statut à la vente : Associé — non commissionné »', async () => {
    const negos = references.negociateurs;
    (references as { negociateurs: unknown[] }).negociateurs = [...negos, { id: 2, nom: 'Arnaud Jorel', societe: 'criterimmo', commissionne: false }];
    try {
      listeCompromis = [{ ...compromis, retroApporteur: null, repartition: { retroApporteurTtc: 0, parties: [pa('entree', 2, 'Arnaud Jorel', { statut: 'associe', commissionneCompte: false }),
        pa('sortie', 7, MY.nom, { statut: 'salarie' })] }, dossier: { ...compromis.dossier!, entree: { id: 2, nom: 'Arnaud Jorel' } }, lignes: [] }];
      await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(41);
      expect(container.querySelector('[data-commission-negociateur="entree"]')).toBeNull();
      expect(container.querySelector('[data-statut-vente="entree"]')).toBeNull(); // LOT BE : « Statut à la vente » retiré (accord d'Arno)
      expect(container.querySelector('[data-statut-vente="sortie"]')).toBeNull();
    } finally { (references as { negociateurs: unknown[] }).negociateurs = negos; }
  });

  it('ligne miroir : la mention dit le statut recopié (Mylène indépendante chez MACJ)', async () => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    const v: Vente = { ...compromis, id: 38, honorairesTtc: 4000, retroApporteur: null, repartition: { retroApporteurTtc: 0, parties: [pa('entree', 5, JB.nom, { statut: 'associe' }),
      { ...pa('sortie', 7, MY.nom, { statut: 'independant' }), societe: 'macj' as const }] }, lignes: [] };
    listeCompromis = [venteDansSociete(v, 'macj')!];
    act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
    await cliquer('[data-vue="compromis"]'); await cliquer('[data-deplier="miroir-38"]');
    expect(mention('sortie')).toBe(`Indépendant${C}`);
  });

  it('mentionCommission : pure, la règle du cumul', async () => {
    const { mentionCommission } = await import('./OngletCompromis');
    expect([mentionCommission('independant'), mentionCommission('salarie'), mentionCommission('associe'), mentionCommission(null, '(à confirmer)'), mentionCommission('observateur')])
      .toEqual([`Indépendant${C}`, `Salarié interne${N}`, `Associé${N}`, `Statut à renseigner (à confirmer)${N}`, `Statut à renseigner${N}`]);
  });
});

describe('🔴 LOT AA — un négociateur de l’autre société : « Rémunéré par … » sur la carte de la porteuse ; sa commission se règle chez elle', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const lc = (nego: string, cote: 'entree' | 'sortie', ttc: number) => ({ id: cote === 'entree' ? 445 : 446, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc, montantHt: null, cote,
    nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  const pa = (sorte: 'entree' | 'sortie', id: number, nom: string, societe: 'criterimmo' | 'macj', statut: 'associe' | 'independant' | 'salarie') =>
    ({ sorte, compteId: id, negociateur: nom, societe, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut });
  // HEIDIDON : Arnaud (CRITERIMMO, associé, porteuse) / Pierre (MACJ, indépendant, 1 000 TTC). Le sens inverse : la porteuse est MACJ.
  const heididon = (porteuse: 'criterimmo' | 'macj', statutAutre: 'independant' | 'salarie' = 'independant'): Vente => {
    const autre = porteuse === 'criterimmo' ? 'macj' as const : 'criterimmo' as const;
    return { ...compromis, id: 38, societe: porteuse, libelle: 'HEIDIDON', honorairesTtc: 4000, retroApporteur: null, apporteur: null, repartition: { retroApporteurTtc: 0, parties: [
      pa('entree', 2, 'Arnaud Jorel', porteuse, 'associe'), pa('sortie', 8, 'Pierre Thevenin', autre, statutAutre)] },
    dossier: { ...compromis.dossier!, entree: { id: 2, nom: 'Arnaud Jorel' }, sortie: { id: 8, nom: 'Pierre Thevenin' }, apporteurId: null },
    lignes: [lc('Arnaud Jorel', 'entree', 2000), lc('Pierre Thevenin', 'sortie', 1000)] };
  };
  const ecran = async (societe: 'criterimmo' | 'macj', v: Vente) => {
    listeCompromis = [v]; act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(createElement(EcranSociete, { societe })); }); await calmer();
    await cliquer('[data-vue="compromis"]');
  };

  for (const porteuse of ['criterimmo', 'macj'] as const) {
    const autre = porteuse === 'criterimmo' ? 'macj' : 'criterimmo';
    const AUTRE = autre.toUpperCase();
    it(`${porteuse.toUpperCase()} porteuse : Pierre (${AUTRE}) — LOT AB : plus de bloc « Rémunéré par » sous les honoraires ; ni commission, ni « Appliquer », ni champ ; « Voir chez ${AUTRE} » dans le panneau`, async () => {
      await ecran(porteuse, heididon(porteuse));
      await deplier(38);
      expect(container.querySelector('[data-remunere-par]')).toBeNull();
      expect(container.querySelector('[data-commission-negociateur="sortie"]')).toBeNull();
      expect(container.querySelector('[data-appliquer-calcul-carte="sortie"]')).toBeNull();
      // les honoraires de ce côté restent (le CA que la vente lui apporte)
      expect(container.querySelector('[data-honoraires-cote="sortie"]')).not.toBeNull();
      // le panneau du négociateur : aucun champ de commission pour lui, « Voir chez … »
      await cliquer('[data-negociateur-carte="sortie"]');
      // LOT AG — le champ (taux, montant) est là aussi pour lui ; la mention « Commission réglée chez … » dessous
      expect(container.querySelector('[data-champ="commission-carte-sortie"]')).not.toBeNull();
      expect(texte('[data-commission-chez="sortie"]')).toBe(`Commission réglée chez ${AUTRE} : Voir chez ${AUTRE}`);
      expect(container.querySelector('[data-commission-chez="sortie"] a')!.getAttribute('href')).toBe(`/admin/transaction/${autre}?vente=38`);
      // Arnaud (associé de la porteuse) — 🔴 LOT BI : son côté, un seul cadre vert compté dans son CA (sa commission n'est pas distinguée)
      expect(container.querySelector('[data-commission-negociateur="entree"]')).toBeNull();
      expect(container.querySelector('[data-part-agence="entree"]')!.className).toContain('trx-calcul-encadre--agence');
      // le détail de la tuile : la phrase claire
      await cliquer('[data-tuile="commissions"]');
      expect(fenetre('[data-detail="autre-societe"]')).toBe('Négociateurs de l’autre société : rémunérés par elle — non comptés ici');
      expect(categorie('independants')).toBe('Indépendants : 0 € HT (0 € TTC)');
    });
    it(`chez ${AUTRE} (ligne miroir) : comportement actuel — liseré rouge (indépendant) ou vert (salarié), modifiable ; « Voir chez » l’ouvre`, async () => {
      const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
      for (const [statut, classe] of [['independant', 'trx-calcul-encadre--deduite'], ['salarie', 'trx-calcul-encadre--interne']] as const) {
        window.history.replaceState(null, '', `/admin/transaction/${autre}?vente=38`);
        await ecran(autre, venteDansSociete(heididon(porteuse, statut), autre)!);
        expect(container.querySelector('[data-carte-miroir="38"]')!.getAttribute('data-replie')).toBe('ouvert');
        expect(container.querySelector('[data-commission-negociateur="sortie"]')!.className).toContain(classe);
        expect(container.querySelector('[data-remunere-par]')).toBeNull();
        expect(container.querySelector('[data-modifier-remuneration="sortie"]')).not.toBeNull();
      }
    });
  }

  it('le CA global : le bloc de commission de chacun, comme avant (le global compte chaque commission une fois)', async () => {
    listeCompromis = [heididon('criterimmo')];
    act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
    await cliquer('[data-vue="compromis"]'); await deplier(38);
    expect(container.querySelector('[data-remunere-par]')).toBeNull();
    expect(container.querySelector('[data-commission-negociateur="sortie"]')!.className).toContain('trx-calcul-encadre--deduite');
    expect(container.querySelector('[data-detail="autre-societe"]')).toBeNull();
  });

  it('même société des deux côtés : aucune phrase « autre société », aucun bloc neutre (inchangé)', async () => {
    const v = heididon('criterimmo');
    await ecran('criterimmo', { ...v, repartition: { ...v.repartition!, parties: v.repartition!.parties.map((p) => ({ ...p, societe: 'criterimmo' as const })) } });
    await deplier(38);
    expect(container.querySelector('[data-remunere-par]')).toBeNull();
    await cliquer('[data-tuile="commissions"]');
    expect(document.querySelector('[data-fenetre-commissions] [data-detail="autre-societe"]')).toBeNull();
  });
});

describe('🔴 LOT AB — les honoraires versés en inter-cabinet, encadrés de rouge sur la carte de la porteuse', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const lc = (nego: string, cote: 'entree' | 'sortie', ttc: number) => ({ id: cote === 'entree' ? 445 : 446, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc, montantHt: null, cote,
    nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  const pa = (sorte: 'entree' | 'sortie', id: number, nom: string, societe: 'criterimmo' | 'macj', pct = 50) =>
    ({ sorte, compteId: id, negociateur: nom, societe, nom: null, coordonnees: null, pourcentage: pct, montantHt: null, statut: 'independant' as const });
  const heididon = (porteuse: 'criterimmo' | 'macj', autre: 'criterimmo' | 'macj', exterieure = false): Vente => ({ ...compromis, id: 38, societe: porteuse, libelle: 'HEIDIDON', honorairesTtc: 4000,
    retroApporteur: null, apporteur: null, repartition: { retroApporteurTtc: 0, parties: [pa('entree', 2, 'Arnaud Jorel', porteuse, exterieure ? 40 : 50), pa('sortie', 8, 'Pierre Thevenin', autre, exterieure ? 40 : 50),
      ...(exterieure ? [{ sorte: 'exterieure' as const, compteId: null, negociateur: null, societe: null, nom: 'Agence du Parc', coordonnees: null, pourcentage: 20, montantHt: null }] : [])] },
    dossier: { ...compromis.dossier!, entree: { id: 2, nom: 'Arnaud Jorel' }, sortie: { id: 8, nom: 'Pierre Thevenin' }, apporteurId: null },
    lignes: [lc('Arnaud Jorel', 'entree', 1000), lc('Pierre Thevenin', 'sortie', 1000)] });
  const ecran = async (societe: 'criterimmo' | 'macj' | null, v: Vente) => {
    listeCompromis = [v]; act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(societe === null ? createElement(EcranGlobal) : createElement(EcranSociete, { societe })); }); await calmer();
    await cliquer('[data-vue="compromis"]'); await deplier(38);
  };
  const versement = (vers: string) => `Honoraires versés vers ${vers} — comptabilisés dans « Commissions versées »`;
  const encadre = (sel: string) => { const p = container.querySelector(sel); return p === null ? null : p.classList.contains('trx-calcul-encadre--deduite') ? 'rouge' : p.classList.contains('trx-calcul-encadre') ? 'autre' : 'aucun'; };

  for (const [porteuse, autre, AUTRE] of [['criterimmo', 'macj', 'MACJ'], ['macj', 'criterimmo', 'CRITERIMMO']] as const) {
    it(`${porteuse.toUpperCase()} porteuse, Pierre chez ${AUTRE} : ses honoraires en rouge « ${versement(AUTRE)} » — le montant de « Inter-cabinet vers ${AUTRE} »`, async () => {
      await ecran(porteuse, heididon(porteuse, autre));
      // 🔴 LOT BA (Arno) — l'en-tête sans cadre (la part du CA de la partie) ; le reversé, son cadre rouge « Reversé en inter-cabinet à … » (le montant
      // de « Inter-cabinet vers … »), avec en petit la commission de Pierre (payée par l'autre société) et la part de l'agence de l'autre société.
      expect(encadre('[data-honoraires-cote="sortie"]')).toBe('aucun');
      expect(texte('[data-honoraires-cote="sortie"]')).toBe('Honoraires partie acquéreur : 3 333,33 € HT × 50 % = 1 666,67 € HT (2 000 € TTC)');
      expect(encadre('[data-reverse-cote="sortie"]')).toBe('rouge');
      expect(texte('[data-reverse-cote="sortie"]')).toBe(`Reversé en inter-cabinet à ${AUTRE} 1 666,67 € HT (2 000 € TTC) Comptabilisé dans « Commissions versées »`
        + `dont commission de Pierre Thevenin (${AUTRE}, 50 %) : 833,33 € HT — payée par ${AUTRE}dont part de l’agence ${AUTRE} : 833,34 € HT`);
      // ce sont ces honoraires qui entrent dans les commissions versées de la porteuse
      await cliquer('[data-tuile="commissions"]');
      expect(categorie(`inter-cabinet-${autre}`)).toBe(`Inter-cabinet vers ${AUTRE} : 1 666,67 € HT (2 000 € TTC)`);
      // l'entrée (même société que l'onglet) : honoraires sans liseré ; sa commission garde le sien
      expect(encadre('[data-honoraires-cote="entree"]')).toBe('aucun');
      expect(encadre('[data-commission-negociateur="entree"]')).toBe('rouge');
      // plus de bloc « Rémunéré par » ; le panneau du négociateur garde « Commission réglée chez … »
      expect(container.querySelector('[data-remunere-par]')).toBeNull();
      await cliquer('[data-negociateur-carte="sortie"]');
      expect(texte('[data-commission-chez="sortie"]')).toBe(`Commission réglée chez ${AUTRE} : Voir chez ${AUTRE}`);
    });
  }

  it('partie extérieure : sous les colonnes, ses honoraires en rouge « Honoraires versés vers Agence du Parc »', async () => {
    await ecran('criterimmo', heididon('criterimmo', 'macj', true));
    expect(encadre('[data-honoraires-exterieure="0"]')).toBe('rouge');
    expect(texte('[data-honoraires-exterieure="0"]')).toBe(`Honoraires partie extérieure — Agence du Parc : 3 333,33 € HT × 20 % = 666,67 € HT (800 € TTC) ${versement('Agence du Parc')}`);
    await cliquer('[data-tuile="commissions"]');
    expect(categorie('exterieur')).toBe('Agences extérieures : 666,67 € HT (800 € TTC)');
  });

  it('même société des deux côtés : aucun liseré sur les honoraires (inchangé) ; le CA global : aucun non plus (neutralisé)', async () => {
    await ecran('criterimmo', heididon('criterimmo', 'criterimmo'));
    expect([encadre('[data-honoraires-cote="entree"]'), encadre('[data-honoraires-cote="sortie"]')]).toEqual(['aucun', 'aucun']);
    await ecran(null, heididon('criterimmo', 'macj'));
    expect(encadre('[data-honoraires-cote="sortie"]')).toBe('aucun');
  });

  it('ligne miroir chez MACJ : la commission garde son liseré (LOT AK : plus de ligne d’honoraires reçus)', async () => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    listeCompromis = [venteDansSociete(heididon('criterimmo', 'macj'), 'macj')!];
    act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
    await cliquer('[data-vue="compromis"]'); await cliquer('[data-deplier="miroir-38"]');
    expect(texte('[data-honoraires-cote="sortie"]')).toContain('Honoraires reçus de CRITERIMMO'); // LOT BA : en tête, sans cadre
    expect(encadre('[data-commission-negociateur="sortie"]')).toBe('rouge');
  });
});

describe('🔴 LOT AC — négociateurs « CRITERIMMO et MACJ » ; l’apporteur avec recherche et création', () => {
  const ref = references as Record<string, unknown>;
  const CJ = { id: 9, nom: 'Cédric JULLIEN', societe: 'les_deux' as const };
  const negos = references.negociateurs;
  const apporteurs = references.apporteurs;
  beforeEach(() => {
    (references as { negociateurs: unknown[] }).negociateurs = [JB, MY, AU, CJ];
    ref.apporteurs = [{ id: 4, nom: 'Julien Deblois', libelle: 'DEBLOIS Julien', recherche: 'Julien Deblois ; Deblois ; Julien ; Foncia Puteaux' },
      { id: 16, nom: 'Gardien Dacquet', libelle: 'DACQUET Gardien', recherche: 'Gardien Dacquet ; Century 21 Courbevoie' }];
    ref.collegues = [{ id: 2, libelle: 'Arnaud Jorel', actif: true }, { id: 5, libelle: 'Jean-Baptiste PONS', actif: true }];
  });
  afterEach(() => { (references as { negociateurs: unknown[] }).negociateurs = negos; ref.apporteurs = apporteurs; delete ref.collegues; });
  const formulaire = async () => { await ouvrir(); await cliquer('[data-vue="compromis"]'); await cliquer('[data-nouveau-compromis]'); await saisirTtc('[data-champ="commission"]', '12000'); };
  const options = () => [...container.querySelectorAll('[role="option"]')].map((o) => o.textContent!.replace(/\s/g, ' ').replace(/^✓/, '').trim());
  const ouvrirApporteur = async () => cliquer('[data-champ="apporteur-annuaire"]');
  // la création, simulée : la route rend l'id du nouvel apporteur (rien n'est écrit)
  const avecCreation = (id: number) => {
    const avant = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const corps = init?.method === 'POST' ? JSON.parse(String(init.body)) : null;
      if (corps?.action === 'apporteur-creer') { posts.push(corps); return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: { id } }) }; }
      return (avant as unknown as (u: string, i?: RequestInit) => Promise<unknown>)(url, init);
    }) as unknown as typeof fetch;
  };

  it('Cédric (« CRITERIMMO et MACJ ») est proposé : « Cédric JULLIEN — CRITERIMMO et MACJ », et déclenche le choix de société (lot K)', async () => {
    await formulaire();
    await cliquer('[data-champ="entree"]');
    expect(options()).toContain('Cédric JULLIEN — CRITERIMMO et MACJ');
    await cliquer('[role="option"][data-option="9"]');
    expect(container.querySelector('[data-choix-societe-vente="partie-0"]')).not.toBeNull();
  });

  it('la recherche d’apporteur : « Rechercher un apporteur », filtre en direct sur le nom, le prénom et la société ; « + Ajouter un nouvel apporteur » tout en bas', async () => {
    await formulaire();
    await ouvrirApporteur();
    expect((container.querySelector('[data-recherche-liste]') as HTMLInputElement).placeholder).toBe('Rechercher un apporteur');
    expect(options()).toEqual(['Aucun', 'Julien Deblois', 'Gardien Dacquet', '+ Ajouter un nouvel apporteur']);
    await saisir('[data-recherche-liste]', 'century');
    expect(options()).toEqual(['Gardien Dacquet', '+ Ajouter un nouvel apporteur « century »']);
    await saisir('[data-recherche-liste]', 'julien');
    expect(options()[0]).toBe('Julien Deblois');
    await cliquer('[role="option"][data-option="4"]');
    expect(texte('[data-champ="apporteur-annuaire"]')).toBe('Julien Deblois');
  });

  it('création depuis le BAS de la liste : la fenêtre (nom, prénom, société, téléphone, e-mail, interne / externe, collègue) ; créé, il est choisi et s’enregistre avec le compromis', async () => {
    avecCreation(99);
    await formulaire();
    await ouvrirApporteur();
    await cliquer('[role="option"][data-option="+"]');
    for (const c of ['nom', 'prenom', 'societe', 'telephone', 'email']) expect(container.querySelector(`[data-nouvel-apporteur-champ="${c}"]`)).not.toBeNull();
    expect(container.querySelector('[data-nouvel-apporteur-type="externe"]')!.getAttribute('aria-pressed')).toBe('true');
    await saisir('[data-nouvel-apporteur-champ="nom"]', 'Dupont');
    await saisir('[data-nouvel-apporteur-champ="prenom"]', 'Léa');
    await saisir('[data-nouvel-apporteur-champ="societe"]', 'Agence du Parc');
    await cliquer('[data-nouvel-apporteur-collegue]'); await cliquer('[role="option"][data-option="5"]');
    await cliquer('[data-creer-apporteur-transaction]');
    expect(posts.at(-1)).toEqual({ action: 'apporteur-creer', apporteur: { nom: 'Léa Dupont', type: 'partenaire', taux: '', interne: false, collegueId: 5, societe: 'Agence du Parc', telephone: '', email: '' } });
    expect(container.querySelector('[data-nouvel-apporteur-transaction]')).toBeNull();
    expect(texte('[data-champ="apporteur-annuaire"]')).toBe('Léa Dupont');
    await saisir('[data-personne-nom="0"]', 'DUPONT');
    await cliquer('[data-enregistrer-dossier]');
    expect((posts.at(-1) as { dossier: { apporteurId: number } }).dossier.apporteurId).toBe(99);
  });

  it('création depuis une recherche SANS résultat : seul choix « + Ajouter un nouvel apporteur « Zorro » », le nom pré-rempli', async () => {
    await formulaire();
    await ouvrirApporteur();
    await saisir('[data-recherche-liste]', 'Zorro');
    expect(options()).toEqual([]);
    expect(texte('[data-creer-depuis-recherche]')).toBe('+ Ajouter un nouvel apporteur « Zorro »');
    expect(container.querySelector('[data-annuaire-depuis-recherche]')).toBeNull();
    await cliquer('[data-creer-depuis-recherche]');
    expect((container.querySelector('[data-nouvel-apporteur-champ="nom"]') as HTMLInputElement).value).toBe('Zorro');
  });

  it('un HOMONYME est proposé avant création (« Choisir « DEBLOIS Julien » »), le choisir le sélectionne ; rien n’est créé', async () => {
    await formulaire();
    await ouvrirApporteur();
    await cliquer('[role="option"][data-option="+"]');
    await saisir('[data-nouvel-apporteur-champ="nom"]', 'deblois');
    await saisir('[data-nouvel-apporteur-champ="prenom"]', 'Julien');
    expect(texte('[data-homonymes]')).toBe('Déjà dans l’annuaire : un apporteur porte ce nom.Choisir « DEBLOIS Julien »');
    expect(texte('[data-creer-apporteur-transaction]')).toBe('Créer quand même');
    await cliquer('[data-choisir-homonyme="4"]');
    expect(texte('[data-champ="apporteur-annuaire"]')).toBe('Julien Deblois');
    expect(posts.filter((p) => p.action === 'apporteur-creer')).toEqual([]);
  });

  it('homonymes : pure — prénom et nom dans un ordre ou l’autre, accents ignorés ; rien de tapé : aucun', async () => {
    const { homonymes } = await import('./NouvelApporteur');
    const annuaire = [{ id: 4, nom: 'Julien Deblois' }, { id: 16, nom: 'Gardien Dacquet', recherche: 'Century 21' }, { id: 7, nom: 'Hélène Dupont' }];
    expect(homonymes('Julien', 'Deblois', annuaire).map((a) => a.id)).toEqual([4]);
    expect(homonymes('', 'deblois julien', annuaire).map((a) => a.id)).toEqual([4]);
    expect(homonymes('helene', 'DUPONT', annuaire).map((a) => a.id)).toEqual([7]);
    expect(homonymes('Léa', 'Dupont', annuaire)).toEqual([]);
    expect(homonymes('', '', annuaire)).toEqual([]);
  });
});

describe('🔴 LOT AD — les montants qui entrent dans « Commissions versées » de la société affichée : HT et TTC en rouge', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const lc = (nego: string, cote: 'entree' | 'sortie', ttc: number) => ({ id: cote === 'entree' ? 445 : 446, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc, montantHt: null, cote,
    nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  type St = 'independant' | 'salarie' | 'associe';
  const pa = (sorte: 'entree' | 'sortie', id: number, nom: string, societe: 'criterimmo' | 'macj', statut: St, pct = 50) =>
    ({ sorte, compteId: id, negociateur: nom, societe, nom: null, coordonnees: null, pourcentage: pct, montantHt: null, statut });
  const vente = (o: { porteuse?: 'criterimmo' | 'macj'; autre?: 'criterimmo' | 'macj'; entree?: St; sortie?: St; exterieure?: boolean; apporteur?: boolean } = {}): Vente => {
    const porteuse = o.porteuse ?? 'criterimmo';
    return { ...compromis, id: 38, societe: porteuse, libelle: 'HEIDIDON', honorairesTtc: 4000, apporteur: o.apporteur ? 'Gardien Dacquet' : null,
      retroApporteur: o.apporteur ? { montant: 1000, unite: 'ttc' } : null,
      repartition: { retroApporteurTtc: o.apporteur ? 1000 : 0, parties: [pa('entree', 2, 'Arnaud Jorel', porteuse, o.entree ?? 'associe', o.exterieure ? 40 : 50),
        pa('sortie', 8, 'Pierre Thevenin', o.autre ?? (porteuse === 'criterimmo' ? 'macj' : 'criterimmo'), o.sortie ?? 'independant', o.exterieure ? 40 : 50),
        ...(o.exterieure ? [{ sorte: 'exterieure' as const, compteId: null, negociateur: null, societe: null, nom: 'Agence du Parc', coordonnees: null, pourcentage: 20, montantHt: null }] : [])] },
      dossier: { ...compromis.dossier!, entree: { id: 2, nom: 'Arnaud Jorel' }, sortie: { id: 8, nom: 'Pierre Thevenin' }, apporteurId: o.apporteur ? 4 : null },
      lignes: [lc('Arnaud Jorel', 'entree', 1000), lc('Pierre Thevenin', 'sortie', 1000)] };
  };
  const ecran = async (societe: 'criterimmo' | 'macj', v: Vente) => {
    listeCompromis = [v]; act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(createElement(EcranSociete, { societe })); }); await calmer();
    await cliquer('[data-vue="compromis"]'); await deplier(38);
  };
  /** Les classes du HT et du TTC d'une ligne de calcul : « rouge » (les deux en rouge) ou « normal » (🔴 LOT AM : les deux à l'encre — la couleur suit le sens, plus HT / TTC). */
  const style = (sel: string) => { const p = container.querySelector(sel); if (p === null) return null;
    const ht = p.querySelector('[data-montant-ht]')!.className, ttc = p.querySelector('[data-montant-ttc]')!.className;
    return ht.includes('trx-rouge') && ttc.includes('trx-rouge') && !ttc.includes('trx-vert') ? 'rouge' : ![ht, ttc].some((c) => c.includes('trx-rouge') || c.includes('trx-vert')) ? 'normal' : `mélange (${ht} / ${ttc})`; };

  for (const [porteuse, AUTRE] of [['criterimmo', 'MACJ'], ['macj', 'CRITERIMMO']] as const) {
    it(`${porteuse.toUpperCase()} : les honoraires reversés vers ${AUTRE} en rouge ; ceux de la porteuse, normaux`, async () => {
      await ecran(porteuse, vente({ porteuse }));
      // LOT BA — l'en-tête à l'encre ; le reversé, son cadre rouge
      expect(style('[data-honoraires-cote="sortie"]')).toBe('normal');
      expect(style('[data-reverse-cote="sortie"]')).toBe('rouge');
      expect(texte('[data-reverse-cote="sortie"] [data-mention-commission]')).toBe('Comptabilisé dans « Commissions versées »');
      expect(style('[data-honoraires-cote="entree"]')).toBe('normal');
    });
  }

  it('partie extérieure : ses honoraires versés en rouge (2 666,67 € HT de base × 20 %)', async () => {
    await ecran('criterimmo', vente({ exterieure: true }));
    expect(style('[data-honoraires-exterieure="0"]')).toBe('rouge');
  });

  it('commission du négociateur : indépendant → rouge ; salarié et associé → normale (liseré vert) ; même société : honoraires normaux', async () => {
    await ecran('criterimmo', vente({ autre: 'criterimmo', entree: 'independant', sortie: 'salarie' }));
    expect(style('[data-commission-negociateur="entree"]')).toBe('rouge');
    expect(style('[data-commission-negociateur="sortie"]')).toBe('normal');
    expect([style('[data-honoraires-cote="entree"]'), style('[data-honoraires-cote="sortie"]')]).toEqual(['normal', 'normal']);
    await ecran('criterimmo', vente({ autre: 'criterimmo', entree: 'associe', sortie: 'associe' }));
    // 🔴 LOT BI — deux associés : chaque côté un seul cadre vert (« Honoraires conservés par … »), pas de cadre de commission
    expect([container.querySelector('[data-commission-negociateur="entree"]'), container.querySelector('[data-commission-negociateur="sortie"]')]).toEqual([null, null]);
    expect([texte('[data-conserve="entree"]'), texte('[data-conserve="sortie"]')]).toEqual(['Honoraires conservés par CRITERIMMO', 'Honoraires conservés par CRITERIMMO']);
  });

  it('l’apporteur (Informations communes) : « 1 000 € TTC (833,33 € HT) » en rouge ; le résumé du panneau : HT et TTC en rouge', async () => {
    await ecran('criterimmo', vente({ apporteur: true }));
    const m = container.querySelector('[data-info="apporteur"] [data-apporteur-montant]')!;
    expect([m.textContent!.replace(/\s/g, ' '), m.className]).toEqual(['833,33 € HT (1 000 € TTC)', 'trx-apporteur-montant trx-rouge']); // LOT AM : l'unité choisie d'abord
    await cliquer('[data-societe-cote="entree"]');
    const r = '[data-reglage-repartition="entree"]';
    expect([container.querySelector(`${r} [data-resume-ht="apporteur-0"]`)!.className, container.querySelector(`${r} [data-resume-ttc="apporteur-0"]`)!.className]).toEqual(['trx-rouge', 'trx-mt-petit trx-rouge']); // LOT AM : le grand puis le petit
    // sans apporteur : « montant à renseigner », sans rouge
    await ecran('criterimmo', vente());
    expect(container.querySelector('[data-info="apporteur"] [data-apporteur-montant]')!.className).toBe('trx-apporteur-montant trx-a-renseigner');
  });

  it('ligne miroir chez MACJ : la commission de l’indépendant de MACJ, en rouge (elle entre dans ses commissions versées) ; LOT AK : plus de ligne d’honoraires reçus', async () => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    listeCompromis = [venteDansSociete(vente(), 'macj')!];
    act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
    await cliquer('[data-vue="compromis"]'); await cliquer('[data-deplier="miroir-38"]');
    expect(texte('[data-honoraires-cote="sortie"]')).toContain('Honoraires reçus de CRITERIMMO'); // LOT BA : en tête, sans cadre
    expect(style('[data-commission-negociateur="sortie"]')).toBe('rouge');
  });
});

describe('🔴 LOT AE — à l’enregistrement, la société porteuse est dite (« portée par MACJ … », « Voir chez MACJ »)', () => {
  const CJ = { id: 9, nom: 'Cédric JULLIEN', societe: 'les_deux' as const };
  const negos = references.negociateurs;
  beforeEach(() => { (references as { negociateurs: unknown[] }).negociateurs = [JB, MY, AU, CJ]; });
  afterEach(() => { (references as { negociateurs: unknown[] }).negociateurs = negos; });
  // la route rend l'id de la vente enregistrée (rien n'est écrit)
  const avecId = (id: number) => {
    const avant = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const corps = init?.method === 'POST' ? JSON.parse(String(init.body)) : null;
      if (corps?.action === 'dossier-enregistrer') { posts.push(corps); return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: id }) }; }
      return (avant as unknown as (u: string, i?: RequestInit) => Promise<unknown>)(url, init);
    }) as unknown as typeof fetch;
  };
  const choisir = async (champ: string, id: number) => { await cliquer(`[data-champ="${champ}"]`); await cliquer(`[role="option"][data-option="${id}"]`); };
  const nouveau = async (societe: 'criterimmo' | 'macj', entree: number | null, sortie: number | null) => {
    await act(async () => { root.render(createElement(EcranSociete, { societe })); }); await calmer();
    await cliquer('[data-vue="compromis"]'); await cliquer('[data-nouveau-compromis]');
    await saisirTtc('[data-champ="commission"]', '6000'); await saisir('[data-personne-nom="0"]', 'DURAND');
    if (entree !== null) await choisir('entree', entree);
    if (sortie !== null) await choisir('sortie', sortie);
  };

  it('créé dans CRITERIMMO, entrée chez MACJ (Mylène), sortie CRITERIMMO (JB) : « portée par MACJ. Elle apparaît ici en inter-cabinet reçu. » + « Voir chez MACJ »', async () => {
    avecId(77);
    await nouveau('criterimmo', 7, 5);
    await cliquer('[data-enregistrer-dossier]');
    expect(texte('[data-portee-par="macj"]')).toBe('Le négociateur côté vendeurs est chez MACJ : la vente est portée par MACJ. Elle apparaît ici en inter-cabinet reçu. Voir chez MACJ');
    expect(container.querySelector('[data-voir-chez-porteuse]')!.getAttribute('href')).toBe('/admin/transaction/macj?vente=77');
  });

  it('sans part CRITERIMMO (Mylène seule) : « Elle n’apparaît que chez MACJ. »', async () => {
    avecId(78);
    await nouveau('criterimmo', 7, null);
    await cliquer('[data-enregistrer-dossier]');
    expect(texte('[data-portee-par="macj"]')).toBe('Le négociateur côté vendeurs est chez MACJ : la vente est portée par MACJ. Elle n’apparaît que chez MACJ. Voir chez MACJ');
  });

  it('sens inverse : créé dans MACJ, entrée CRITERIMMO (JB) → « portée par CRITERIMMO », « Voir chez CRITERIMMO »', async () => {
    avecId(79);
    await nouveau('macj', 5, 7);
    await cliquer('[data-enregistrer-dossier]');
    expect(texte('[data-portee-par="criterimmo"]')).toMatch(/^Le négociateur côté vendeurs est chez CRITERIMMO : la vente est portée par CRITERIMMO\. Elle apparaît ici en inter-cabinet reçu\./);
    expect(container.querySelector('[data-voir-chez-porteuse]')!.getAttribute('href')).toBe('/admin/transaction/criterimmo?vente=79');
  });

  it('Cédric à l’entrée, MACJ choisie pour la vente : portée par MACJ ; CRITERIMMO choisie : rien à dire', async () => {
    avecId(80);
    await nouveau('criterimmo', 9, 5);
    await cliquer('[data-choix-societe-vente="partie-0"] [data-societe-vente="macj"]');
    await cliquer('[data-enregistrer-dossier]');
    expect(container.querySelector('[data-portee-par="macj"]')).not.toBeNull();
    act(() => { root.unmount(); }); root = createRoot(container);
    await nouveau('criterimmo', 9, 5);
    await cliquer('[data-choix-societe-vente="partie-0"] [data-societe-vente="criterimmo"]');
    await cliquer('[data-enregistrer-dossier]');
    expect(container.querySelector('[data-portee-par]')).toBeNull();
  });

  it('sans négociateur d’entrée : la page de saisie porte la vente, aucun message', async () => {
    avecId(81);
    await nouveau('criterimmo', null, 7);
    await cliquer('[data-enregistrer-dossier]');
    expect(container.querySelector('[data-portee-par]')).toBeNull();
  });

  it('modification depuis la carte : l’entrée passe à Mylène (MACJ) → le message dit la bascule', async () => {
    listeCompromis = [{ ...compromis, repartition: { retroApporteurTtc: 0, parties: [compromis.repartition!.parties[0], compromis.repartition!.parties[1]].map((p) => ({ ...p, pourcentage: 50 })) } }];
    await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(41);
    await cliquer('[data-negociateur-carte="entree"]');
    await cliquer('[data-liste-negociateur="entree"]'); await cliquer('[role="option"][data-option="7"]');
    await cliquer('[data-valider-negociateur]');
    expect(texte('[data-portee-par="macj"]')).toBe('Le négociateur côté vendeurs est chez MACJ : la vente est portée par MACJ. Elle n’apparaît que chez MACJ. Voir chez MACJ');
  });
});

describe('🔴 LOT AF — la carte d’une ligne miroir : « Inter-cabinet reçu » en couples libellé / valeur, la note, le négociateur en lignes', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  it('MACJ › HEIDIDON : porteuse, vente d’origine (lien), part reçue, CA (HT puis TTC vert), dates ; note d’une ligne ; « Négociateur de sortie », Pierre (MACJ), statut — sans « commission déduite » répété', async () => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    const v: Vente = { ...compromis, id: 38, libelle: 'HEIDIDON', honorairesTtc: 4000, retroApporteur: null, apporteur: null, repartition: { retroApporteurTtc: 0, parties: [
      { sorte: 'entree', compteId: 2, negociateur: 'Arnaud Jorel', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 20, montantHt: null, statut: 'associe' },
      { sorte: 'sortie', compteId: 8, negociateur: 'Pierre Thevenin', societe: 'macj', nom: null, coordonnees: null, pourcentage: 80, montantHt: null, statut: 'independant' }] },
    dossier: { ...compromis.dossier!, entree: { id: 2, nom: 'Arnaud Jorel' }, sortie: { id: 8, nom: 'Pierre Thevenin' }, apporteurId: null }, lignes: [] };
    listeCompromis = [venteDansSociete(v, 'macj')!];
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
    await cliquer('[data-vue="compromis"]'); await cliquer('[data-deplier="miroir-38"]');
    const couples = [...container.querySelectorAll('[data-miroir-bloc] .trx-couple')].map((c) => [c.querySelector('dt')!.textContent, c.querySelector('dd')!.textContent!.replace(/\s/g, ' ')]);
    expect(couples).toEqual([['Société porteuse', 'CRITERIMMO'], ['Vente d’origine', 'HEIDIDON Voir la vente d’origine'], ['Part reçue', '80 % de la commission nette'],
      ['CA de MACJ sur cette vente', '2 666,67 € HT(3 200 € TTC)'], ['Dates', 'Compromis signé le 20/10/2026Vente définitive au plus tard le 15/01/2027']]);
    expect(container.querySelector('[data-miroir-info="ca"] .trx-mt-petit')!.textContent!.replace(/\s/g, ' ')).toBe('(3 200 € TTC)'); // LOT AM
    expect(container.querySelector('[data-miroir-info="ca"] .trx-mt-petit')!.className).toContain('trx-vert');
    expect(container.querySelector('[data-miroir-bloc] [data-voir-origine="38"]')!.getAttribute('href')).toBe('/admin/transaction/criterimmo?vente=38');
    expect(texte('[data-miroir-lecture-seule]')).toBe('Ligne miroir : suit la vente d’origine ; seule la rémunération du négociateur se modifie ici.');
    // LOT AK — « Statut à la vente » et « Honoraires reçus de … » retirés de la ligne miroir (accord d'Arno) ; le statut se lit dans la mention.
    expect([texte('[data-remuneration-titre="sortie"]'), texte('[data-remuneration-negociateur="sortie"]')]).toEqual(['Négociateur de sortie', 'Pierre Thevenin (MACJ) · 50 %']);
    expect(container.querySelector('[data-remuneration="sortie"] [data-remuneration-statut]')).toBeNull();
    const ordre = [...container.querySelector('[data-remuneration="sortie"]')!.children].map((x) => [...x.attributes].map((a) => a.name).find((n) => n.startsWith('data-')));
    expect(ordre).toEqual(['data-remuneration-titre', 'data-remuneration-negociateur', 'data-ventilation', 'data-ventilation', 'data-commission-negociateur', 'data-commission-carte', 'data-modifier-remuneration']); // LOT AZ / BA : « Honoraires reçus de … », vert, puis la commission
    const { CSS_TRANSACTION } = await import('./commun');
    expect(CSS_TRANSACTION.replace(/\s+/g, ' ')).toContain('.trx-couples{grid-template-columns:minmax(0,1fr);gap:2px}');
  });
});

describe('🔴 LOT AG — le taux d’un négociateur de l’autre société se règle aussi depuis la carte de la porteuse (une seule source)', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const lc = (nego: string, cote: 'entree' | 'sortie', ttc: number, taux: number | null = null) => ({ id: cote === 'entree' ? 445 : 446, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc,
    montantHt: null, cote, taux, nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  // HEIDIDON : 4 000 TTC, Arnaud (CRITERIMMO, associé, porteuse) 50 % / Pierre (MACJ, indépendant) 50 % ; sa commission : `ttc` au taux `taux`.
  const heididon = (ttc: number, taux: number | null, autre: 'criterimmo' | 'macj' = 'macj'): Vente => ({ ...compromis, id: 38, libelle: 'HEIDIDON', honorairesTtc: 4000, retroApporteur: null,
    apporteur: null, repartition: { retroApporteurTtc: 0, parties: [
      { sorte: 'entree', compteId: 2, negociateur: 'Arnaud Jorel', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'associe' },
      { sorte: 'sortie', compteId: 8, negociateur: 'Pierre Thevenin', societe: autre, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' }] },
    dossier: { ...compromis.dossier!, entree: { id: 2, nom: 'Arnaud Jorel' }, sortie: { id: 8, nom: 'Pierre Thevenin' }, apporteurId: null },
    lignes: [lc('Pierre Thevenin', 'sortie', ttc, taux)] });
  const negos = references.negociateurs;
  beforeEach(() => { (references as { negociateurs: unknown[] }).negociateurs = [...negos, { id: 2, nom: 'Arnaud Jorel', societe: 'criterimmo' }, { id: 8, nom: 'Pierre Thevenin', societe: 'macj' }]; });
  afterEach(() => { (references as { negociateurs: unknown[] }).negociateurs = negos; });
  const ecran = async (societe: 'criterimmo' | 'macj', v: Vente) => {
    listeCompromis = [v]; act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(createElement(EcranSociete, { societe })); }); await calmer();
    await cliquer('[data-vue="compromis"]');
  };
  const champ = (sel: string) => (container.querySelector(sel) as HTMLInputElement).value.replace(/\s/g, ' ');

  it('depuis la carte de CRITERIMMO : le taux de Pierre (MACJ) à 40 % → 800 € en direct ; « Valider » l’enregistre sur la vente d’origine (calculée), « Commission réglée chez MACJ » dessous', async () => {
    await ecran('criterimmo', heididon(1000, null));
    await deplier(38);
    await cliquer('[data-negociateur-carte="sortie"]');
    expect(texte('[data-commission-chez="sortie"]')).toBe('Commission réglée chez MACJ : Voir chez MACJ');
    await basculerUnite('ttc'); // LOT AN : les champs suivent le sélecteur général
    await saisir('[data-taux="commission-carte-sortie"]', '40');
    expect(champ('[data-champ="commission-carte-sortie"]')).toBe('800');
    await cliquer('[data-valider-negociateur]');
    const e = posts.at(-1) as { action: string; id: number; dossier: { commissions: { sortie: { montant: string; taux: string; mode: string } } } };
    expect([e.action, e.id]).toEqual(['dossier-enregistrer', 38]);
    expect({ ...e.dossier.commissions.sortie, montant: e.dossier.commissions.sortie.montant.replace(/\s/g, ' ') }).toEqual({ montant: '800', unite: 'ttc', taux: '40', mode: 'calculee' });
  });

  it('une seule source : enregistrée à 40 % (800 €), la carte de la porteuse ET la ligne miroir disent 40 % ; comptée une fois, chez MACJ seule', async () => {
    const v = heididon(800, 40);
    await ecran('criterimmo', v);
    await deplier(38);
    expect(texte('[data-negociateur-carte="sortie"]')).toBe('Négociateur : Pierre Thevenin · 40 %');
    await cliquer('[data-tuile="commissions"]');
    expect(categorie('independants')).toBe('Indépendants : 0 € HT (0 € TTC)');
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    await ecran('macj', venteDansSociete(v, 'macj')!);
    await cliquer('[data-deplier="miroir-38"]');
    expect(texte('[data-remuneration-negociateur="sortie"]')).toBe('Pierre Thevenin (MACJ) · 40 %');
    expect(texte('[data-commission-negociateur="sortie"] .trx-calcul-operation')).toBe('1 666,67 € HT × 40 % =');
    await cliquer('[data-tuile="commissions"]');
    expect(categorie('independants')).toBe('Indépendants : 666,67 € HT (800 € TTC)');
  });

  it('depuis la ligne miroir : « Modifier la rémunération » à 40 % s’enregistre sur la MÊME ligne (vente d’origine n° 38, côté sortie)', async () => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    await ecran('macj', venteDansSociete(heididon(1000, null), 'macj')!);
    await cliquer('[data-deplier="miroir-38"]');
    await cliquer('[data-modifier-remuneration="sortie"]');
    await saisir('[data-taux="remuneration-sortie"]', '40');
    await cliquer('[data-valider-remuneration="sortie"]');
    expect(posts.at(-1)).toMatchObject({ action: 'commission-cote', id: 38, cote: 'sortie', montant: { montant: 800, unite: 'ttc' }, taux: 40, mode: 'calculee' });
  });

  it('même société : le champ, sans mention « réglée chez » (inchangé) ; non commissionné : pas de champ', async () => {
    await ecran('criterimmo', heididon(1000, null, 'criterimmo'));
    await deplier(38);
    await cliquer('[data-negociateur-carte="sortie"]');
    expect(container.querySelector('[data-champ="commission-carte-sortie"]')).not.toBeNull();
    expect(container.querySelector('[data-commission-chez]')).toBeNull();
    (references as { negociateurs: { id: number; commissionne?: boolean }[] }).negociateurs = (references.negociateurs as { id: number; commissionne?: boolean }[]).map((n) => (n.id === 2 ? { ...n, commissionne: false } : n));
    const v = heididon(1000, null);
    await ecran('criterimmo', { ...v, repartition: { ...v.repartition!, parties: v.repartition!.parties.map((p) => (p.compteId === 2 ? { ...p, commissionneCompte: false } : p)) } });
    await deplier(38);
    await cliquer('[data-negociateur-carte="entree"]');
    expect(container.querySelector('[data-champ="commission-carte-entree"]')).toBeNull();
    expect(texte('[data-non-commissionne-choix="entree"]')).toBe('Non commissionné');
  });
});

describe('🔴 LOT AH — le tableau « Répartition » en logique comptable, au centime partout', () => {
  const pa = (sorte: 'entree' | 'sortie', id: number, nom: string, societe: 'criterimmo' | 'macj', pct: number) =>
    ({ sorte, compteId: id, negociateur: nom, societe, nom: null, coordonnees: null, pourcentage: pct, montantHt: null, statut: 'independant' as const });
  const vente = (o: { apporteur?: boolean; autre?: 'criterimmo' | 'macj'; exterieure?: boolean } = {}): Vente => ({ ...compromis, id: 37, libelle: 'Location ?', honorairesTtc: 7500,
    apporteur: o.apporteur ? 'Gardien Dacquet' : null, retroApporteur: o.apporteur ? { montant: 1000, unite: 'ttc' } : null,
    repartition: { retroApporteurTtc: o.apporteur ? 1000 : 0, parties: [pa('entree', 2, 'Arnaud Jorel', 'criterimmo', o.exterieure ? 40 : 50), pa('sortie', 8, 'Pierre Thevenin', o.autre ?? 'macj', o.exterieure ? 40 : 50),
      ...(o.exterieure ? [{ sorte: 'exterieure' as const, compteId: null, negociateur: null, societe: null, nom: 'Agence du Parc', coordonnees: null, pourcentage: 20, montantHt: null }] : [])] },
    dossier: { ...compromis.dossier!, entree: { id: 2, nom: 'Arnaud Jorel' }, sortie: { id: 8, nom: 'Pierre Thevenin' } }, lignes: [] });
  const carte = async (v: Vente) => { listeCompromis = [v]; act(() => { root.unmount(); }); root = createRoot(container); await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(37); };
  const lignes = () => [...container.querySelectorAll('[data-repartition-compromis] [data-ligne-repartition]')].map((x) => x.getAttribute('data-ligne-repartition'));
  const valeur = (cle: string) => texte(`[data-ligne-repartition="${cle}"] td:last-child`);
  const rouge = (cle: string) => container.querySelector(`[data-ligne-repartition="${cle}"] .trx-montant-repartition`)!.classList.contains('trx-rouge');

  it('avec apporteur, inter-cabinet : commission, − apporteur, = base, parties, parts, − reversé vers MACJ, = reste — et les mêmes centimes partout', async () => {
    await carte(vente({ apporteur: true }));
    // 🔴 LOT AJ — « Part MACJ » et « − Reversé en inter-cabinet vers MACJ » ne font plus qu'une ligne.
    expect(lignes()).toEqual(['commission', 'apporteur', 'base', 'partie-0', 'partie-1', 'part-criterimmo', 'part-reverse-macj', 'reste']);
    expect(texte('[data-ligne-repartition="commission"] th')).toBe('Commission de la vente — CA de CRITERIMMO (société porteuse)');
    expect(valeur('commission')).toBe('6 250 € HT(7 500 € TTC)');
    expect([texte('[data-ligne-repartition="apporteur"] th'), valeur('apporteur'), rouge('apporteur')]).toEqual(['− Apporteur : Gardien Dacquet', '833,33 € HT(1 000 € TTC)', true]);
    expect([texte('[data-ligne-repartition="base"] th'), valeur('base')]).toEqual(['= Base de répartition (commission nette)', '5 416,67 € HT(6 500 € TTC)']);
    // l'incohérence d'Arno : la partie MACJ, la Part MACJ et le reversé — 2 708,33 partout ; CRITERIMMO (porteuse) absorbe le centime
    expect([valeur('partie-1'), valeur('part-reverse-macj')]).toEqual(Array(2).fill('2 708,33 € HT(3 250 € TTC)'));
    expect([valeur('partie-0'), valeur('part-criterimmo'), valeur('reste')]).toEqual(Array(3).fill('2 708,34 € HT(3 250 € TTC)'));
    expect([rouge('part-reverse-macj'), rouge('reste'), rouge('base')]).toEqual([true, false, false]);
    expect(texte('[data-ligne-repartition="reste"] th')).toBe('= Reste à CRITERIMMO');
    // la phrase « Répartition — commission nette (après apporteur) » est remplacée par la ligne « = Base de répartition »
    expect(texte('[data-informations-communes]')).not.toContain('Répartition — commission nette');
    // la tuile « Inter-cabinet vers MACJ » dit le même nombre
    await cliquer('[data-tuile="commissions"]');
    expect(categorie('inter-cabinet-macj')).toBe('Inter-cabinet vers MACJ : 2 708,33 € HT (3 250 € TTC)');
  });

  it('sans apporteur, même société : « Aucun apporteur » 0, sans rouge ; rien de reversé ; le reste = la base', async () => {
    await carte(vente({ autre: 'criterimmo' }));
    expect(lignes()).toEqual(['commission', 'apporteur', 'base', 'partie-0', 'partie-1', 'part-criterimmo', 'part-macj', 'reste']);
    expect([texte('[data-ligne-repartition="apporteur"] th'), valeur('apporteur'), rouge('apporteur')]).toEqual(['Aucun apporteur', '0 € HT(0 € TTC)', false]);
    expect(valeur('reste')).toBe('6 250 € HT(7 500 € TTC)');
  });

  it('partie extérieure : « − Reversé à Agence du Parc » en rouge, et le reste', async () => {
    await carte(vente({ exterieure: true }));
    // 🔴 LOT AJ — une partie extérieure seule : « Part Agence du Parc − Reversé à Agence du Parc », une ligne.
    expect(lignes()).toEqual(['commission', 'apporteur', 'base', 'partie-0', 'partie-1', 'partie-2', 'part-criterimmo', 'part-reverse-macj', 'part-reverse-exterieur-0', 'reste']);
    expect([texte('[data-ligne-repartition="part-reverse-exterieur-0"] th'), valeur('part-reverse-exterieur-0'), rouge('part-reverse-exterieur-0')]).toEqual(['Part Agence du Parc − Reversé à Agence du Parc', '1 250 € HT(1 500 € TTC)', true]);
    expect(valeur('reste')).toBe('2 500 € HT(3 000 € TTC)');
  });
});

describe('🔴 LOT AI — plus de « Taux de rémunération » à côté de l’apporteur : le taux ne s’affiche que pour la commission d’un négociateur', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const onglet = async () => { await ouvrir(); await cliquer('[data-vue="compromis"]'); };
  const tauxDans = (sel: string) => [...container.querySelectorAll(`${sel} label`)].filter((l) => l.textContent!.startsWith('Taux de rémunération')).length;

  it('Nouveau compromis : la rétrocession de l’apporteur n’a pas de champ taux ; son montant et son unité restent', async () => {
    await onglet();
    await cliquer('[data-nouveau-compromis]');
    expect(container.querySelector('[data-montant-unite="retro"]')).not.toBeNull();
    expect(container.querySelector('[data-taux="retro"]')).toBeNull();
    expect(tauxDans('[data-montant-unite="retro"]')).toBe(0);
    await basculerUnite('ttc'); // LOT AN : le sélecteur général (plus de boutons au champ)
    await saisir('[data-champ="retro"]', '1000');
    expect(texte('[data-equivalent="retro"]')).toBe('soit 833,33 € HT');
  });
  it('Modifier : ni l’apporteur ni une partie extérieure n’ont de taux ; les négociateurs gardent « Taux de rémunération (%) »', async () => {
    await onglet();
    await deplier(41);
    await cliquer('[data-modifier-compromis="41"]');
    expect(container.querySelector('[data-taux="retro"]')).toBeNull();
    // LOT AN — 2 400 TTC enregistrés, montrés dans l'unité du sélecteur (ici HT)
    expect((container.querySelector('[data-champ="retro"]') as HTMLInputElement).value.replace(/\s/g, ' ')).toBe('2 000');
    await cliquer('[data-ajouter-exterieure]');
    expect(tauxDans('[data-partie="exterieure"]')).toBe(0);
    const taux = [...container.querySelectorAll('[data-taux]')].map((x) => x.getAttribute('data-taux'));
    expect(taux.length).toBeGreaterThan(0);
    expect(taux.every((t) => t!.startsWith('commission-'))).toBe(true);
    expect(tauxDans('[data-montant-unite^="commission-"]')).toBe(taux.length);
  });
  it('Modifier puis Enregistrer : la rétrocession repart telle quelle (aucun calcul ne change)', async () => {
    await onglet();
    await deplier(41);
    await cliquer('[data-modifier-compromis="41"]');
    await cliquer('[data-enregistrer-dossier]');
    const d = (posts.at(-1) as { dossier: Record<string, unknown> }).dossier;
    expect([d.retroApporteurTtc, d.retroApporteurUnite]).toEqual(['2400', 'ttc']);
  });
});

describe('🔴 LOT AJ — « Part X − Reversé en inter-cabinet vers X » : une ligne au lieu de deux ; le total du formulaire au centime (règle du lot AH)', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const pa = (sorte: 'entree' | 'sortie', id: number, nom: string, societe: 'criterimmo' | 'macj', pct: number) =>
    ({ sorte, compteId: id, negociateur: nom, societe, nom: null, coordonnees: null, pourcentage: pct, montantHt: null, statut: 'independant' as const });
  const agence = (nom: string, pct: number) => ({ sorte: 'exterieure' as const, compteId: null, negociateur: null, societe: null, nom, coordonnees: null, pourcentage: pct, montantHt: null });
  const vente = (parties: unknown[]): Vente => ({ ...compromis, id: 37, libelle: 'Location ?', honorairesTtc: 7500, apporteur: 'Gardien Dacquet', retroApporteur: { montant: 1000, unite: 'ttc' },
    repartition: { retroApporteurTtc: 1000, parties: parties as never }, dossier: { ...compromis.dossier!, entree: { id: 2, nom: 'Arnaud Jorel' }, sortie: { id: 8, nom: 'Pierre Thevenin' } }, lignes: [] });
  const carte = async (v: Vente) => { listeCompromis = [v]; act(() => { root.unmount(); }); root = createRoot(container); await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(37); };
  const lignes = () => [...container.querySelectorAll('[data-repartition-compromis] [data-ligne-repartition]')].map((x) => x.getAttribute('data-ligne-repartition'));
  const th = (cle: string) => texte(`[data-ligne-repartition="${cle}"] th`);
  const valeur = (cle: string) => texte(`[data-ligne-repartition="${cle}"] td:last-child`);
  const rouge = (cle: string) => container.querySelector(`[data-ligne-repartition="${cle}"] .trx-montant-repartition`)!.classList.contains('trx-rouge');
  const cellule = (cle: string, mot: string) => texte(`[data-ligne-repartition="${cle}"] td[data-mot="${mot}"]`);

  it('porteuse CRITERIMMO → MACJ : « Part MACJ − Reversé en inter-cabinet vers MACJ », MACJ, 50 %, en rouge ; la Part CRITERIMMO et le Reste restent', async () => {
    await carte(vente([pa('entree', 2, 'Arnaud Jorel', 'criterimmo', 50), pa('sortie', 8, 'Pierre Thevenin', 'macj', 50)]));
    expect(lignes()).toEqual(['commission', 'apporteur', 'base', 'partie-0', 'partie-1', 'part-criterimmo', 'part-reverse-macj', 'reste']);
    expect([th('part-reverse-macj'), cellule('part-reverse-macj', 'Société'), cellule('part-reverse-macj', '%'), valeur('part-reverse-macj'), rouge('part-reverse-macj')])
      .toEqual(['Part MACJ − Reversé en inter-cabinet vers MACJ', 'MACJ', '50 %', '2 708,33 € HT(3 250 € TTC)', true]);
    expect([th('part-criterimmo'), valeur('part-criterimmo'), rouge('part-criterimmo')]).toEqual(['Part CRITERIMMO', '2 708,34 € HT(3 250 € TTC)', false]);
    expect([th('reste'), valeur('reste'), container.querySelector('[data-ligne-repartition="reste"]')!.className]).toEqual(['= Reste à CRITERIMMO', '2 708,34 € HT(3 250 € TTC)', 'tdb-fort trx-ligne-base trx-somme-ligne']); // LOT AP
    expect(container.querySelector('[data-ligne-repartition="part-macj"]')).toBeNull();
    expect(container.querySelector('[data-ligne-repartition="reverse-macj"]')).toBeNull();
    // les mêmes centimes : la partie de Pierre, la ligne fusionnée, la tuile
    expect(valeur('partie-1')).toBe(valeur('part-reverse-macj'));
    await cliquer('[data-tuile="commissions"]');
    expect(categorie('inter-cabinet-macj')).toBe('Inter-cabinet vers MACJ : 2 708,33 € HT (3 250 € TTC)');
  });
  it('porteuse MACJ → CRITERIMMO : « Part MACJ » (porteuse) en tête, puis « Part CRITERIMMO − Reversé en inter-cabinet vers CRITERIMMO », « = Reste à MACJ »', async () => {
    await carte(vente([pa('entree', 8, 'Pierre Thevenin', 'macj', 50), pa('sortie', 2, 'Arnaud Jorel', 'criterimmo', 50)]));
    expect(lignes()).toEqual(['commission', 'apporteur', 'base', 'partie-0', 'partie-1', 'part-macj', 'part-reverse-criterimmo', 'reste']);
    expect([th('part-reverse-criterimmo'), cellule('part-reverse-criterimmo', 'Société'), cellule('part-reverse-criterimmo', '%'), valeur('part-reverse-criterimmo'), rouge('part-reverse-criterimmo')])
      .toEqual(['Part CRITERIMMO − Reversé en inter-cabinet vers CRITERIMMO', 'CRITERIMMO', '50 %', '2 708,33 € HT(3 250 € TTC)', true]);
    expect([th('part-macj'), valeur('part-macj'), th('reste'), valeur('reste')]).toEqual(['Part MACJ', '2 708,34 € HT(3 250 € TTC)', '= Reste à MACJ', '2 708,34 € HT(3 250 € TTC)']);
    expect(th('commission')).toBe('Commission de la vente — CA de MACJ (société porteuse)');
  });
  it('même société : aucune ligne inter-cabinet ; « Part MACJ » à 0 reste ; rien n’est en rouge hors l’apporteur', async () => {
    await carte(vente([pa('entree', 2, 'Arnaud Jorel', 'criterimmo', 50), pa('sortie', 4, 'Augustin Jorel', 'criterimmo', 50)]));
    expect(lignes()).toEqual(['commission', 'apporteur', 'base', 'partie-0', 'partie-1', 'part-criterimmo', 'part-macj', 'reste']);
    expect(lignes().some((l) => l!.includes('reverse'))).toBe(false);
    expect([valeur('part-macj'), valeur('reste')]).toEqual(['0 € HT(0 € TTC)', '5 416,67 € HT(6 500 € TTC)']);
  });
  it('deux parties extérieures : pas de doublon (leur part commune ≠ chaque reversement) — la part extérieure et un reversement par agence restent', async () => {
    await carte(vente([pa('entree', 2, 'Arnaud Jorel', 'criterimmo', 40), pa('sortie', 8, 'Pierre Thevenin', 'macj', 40), agence('Agence du Parc', 10), agence('Agence du Lac', 10)]));
    expect(lignes()).toEqual(['commission', 'apporteur', 'base', 'partie-0', 'partie-1', 'partie-2', 'partie-3', 'part-criterimmo', 'part-reverse-macj', 'part-exterieure', 'reverse-exterieur-0', 'reverse-exterieur-1', 'reste']);
    expect([th('reverse-exterieur-0'), th('reverse-exterieur-1')]).toEqual(['− Reversé à Agence du Parc', '− Reversé à Agence du Lac']);
  });
  it('les centimes s’additionnent : reste + reversements + apporteur = commission de la vente', async () => {
    await carte(vente([pa('entree', 2, 'Arnaud Jorel', 'criterimmo', 40), pa('sortie', 8, 'Pierre Thevenin', 'macj', 40), agence('Agence du Parc', 20)]));
    const ht = (cle: string) => Number(texte(`[data-ligne-repartition="${cle}"] td:last-child strong`).replace(/\s/g, '').replace('€HT', '').replace(',', '.'));
    expect(Math.round((ht('reste') + ht('part-reverse-macj') + ht('part-reverse-exterieur-0') + ht('apporteur')) * 100)).toBe(Math.round(ht('commission') * 100));
  });
  it('formulaire : le total au centime comme la carte (Part CRITERIMMO 2 708,34) ; une mention fusionnée en rouge pour MACJ', async () => {
    await ouvrir(); await cliquer('[data-vue="compromis"]'); await cliquer('[data-nouveau-compromis]');
    await saisirTtc('[data-champ="commission"]', '7500');
    await cliquer('[data-champ="apporteur-annuaire"]'); await cliquer('[role="option"][data-option="4"]');
    await saisirTtc('[data-champ="retro"]', '1000'); // LOT AN : le sélecteur général (plus de boutons au champ)
    await cliquer('[data-champ="entree"]'); await cliquer('[role="option"][data-option="5"]');
    await cliquer('[data-champ="sortie"]'); await cliquer('[role="option"][data-option="7"]');
    expect((container.querySelector('[data-partie-eur="0"]') as HTMLInputElement).value.replace(/\s/g, ' ')).toBe('2 708,34');
    // LOT AM — chaque montant avec son équivalent, puis le % ; les centimes de la carte (2 708,34 / 2 708,33 ; 3 250 TTC chacun).
    expect(texte('[data-part-societe-form="criterimmo"]')).toBe('Part CRITERIMMO : 2 708,34 € HT (3 250 € TTC) · 50 %');
    expect(texte('[data-reverse-form="macj"]')).toBe(' · Part MACJ − Reversé en inter-cabinet vers MACJ : 2 708,33 € HT (3 250 € TTC) · 50 %');
    expect(container.querySelector('[data-reverse-form="macj"]')!.className).toBe('trx-rouge');
    expect(texte('[data-inter-cabinet-form]')).toBe('CA de la vente : CRITERIMMO (société porteuse), 6 250 € HT (7 500 € TTC)'); // LOT AM
  });
});

describe('🔴 LOT AK — ligne miroir, « Négociateur de sortie » : sans « Statut à la vente » ni « Honoraires reçus de … » (doublon du CA), retrait autorisé par Arno', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  // « Location ? » : 6 500 TTC, sans apporteur ; Arnaud (porteuse) 50 % à l'entrée, Pierre (l'autre société) 50 % à la sortie, taux 50 %, 1 625 TTC enregistrés.
  const location = (porteuse: 'criterimmo' | 'macj', statut: 'independant' | 'salarie'): Vente => {
    const autre = porteuse === 'criterimmo' ? 'macj' as const : 'criterimmo' as const;
    return { ...compromis, id: 44, libelle: 'Location ?', societe: porteuse, honorairesTtc: 6500, retroApporteur: null, apporteur: null, repartition: { retroApporteurTtc: 0, parties: [
      { sorte: 'entree', compteId: 2, negociateur: 'Arnaud Jorel', societe: porteuse, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'associe' },
      { sorte: 'sortie', compteId: 8, negociateur: 'Pierre Thevenin', societe: autre, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut }] },
    dossier: { ...compromis.dossier!, entree: { id: 2, nom: 'Arnaud Jorel' }, sortie: { id: 8, nom: 'Pierre Thevenin' }, apporteurId: null },
    lignes: [{ id: 2, negociateur: 'Pierre Thevenin', role: 'negociateur', montantTtc: 1625, montantHt: null, cote: 'sortie', nature: 'compromis', compte: false, origine: 'saisie',
      sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null }] } as Vente;
  };
  const miroir = async (porteuse: 'criterimmo' | 'macj', statut: 'independant' | 'salarie'): Promise<void> => {
    const autre = porteuse === 'criterimmo' ? 'macj' : 'criterimmo';
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    listeCompromis = [venteDansSociete(location(porteuse, statut), autre)!];
    act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(createElement(EcranSociete, { societe: autre })); }); await calmer();
    await cliquer('[data-vue="compromis"]'); await cliquer('[data-deplier="miroir-44"]');
  };
  const bloc = () => [...container.querySelector('[data-remuneration="sortie"]')!.children].map((x) => [...x.attributes].map((a) => a.name).find((n) => n.startsWith('data-')));
  const tuiles = () => [texte('[data-ca-ttc]'), texte('[data-commissions-ttc]'), texte('[data-solde-ttc]')];

  for (const [porteuse, A, P] of [['criterimmo', 'MACJ', 'CRITERIMMO'], ['macj', 'CRITERIMMO', 'MACJ']] as const) {
    it(`miroir chez ${A} (porteuse ${P}), indépendant : titre, négociateur, cadre rouge et sa mention, « Modifier la rémunération » — ni statut ni honoraires reçus ; tuiles au centime`, async () => {
      await miroir(porteuse, 'independant');
      expect(texte('[data-miroir-info="ca"]')).toBe(`CA de ${A} sur cette vente2 708,33 € HT(3 250 € TTC)`);
      expect(bloc()).toEqual(['data-remuneration-titre', 'data-remuneration-negociateur', 'data-ventilation', 'data-ventilation', 'data-commission-negociateur', 'data-modifier-remuneration']); // LOT AZ / BA
      expect(texte('[data-remuneration-titre="sortie"]')).toBe('Négociateur de sortie');
      expect(texte('[data-remuneration-negociateur="sortie"]')).toBe(`Pierre Thevenin (${A}) · 50 %`);
      expect(texte('[data-commission-negociateur="sortie"]')).toBe('Commission du négociateur : 2 708,33 € HT × 50 % = 1 354,17 € HT (1 625 € TTC) Indépendant — comptabilisé dans « Commissions versées »');
      expect(container.querySelector('[data-commission-negociateur="sortie"]')!.classList.contains('trx-calcul-encadre--deduite')).toBe(true);
      const carte = texte('[data-compromis="44"]');
      expect(carte).not.toContain('Statut à la vente');
      // 🔴 LOT BA (Arno) — « Honoraires reçus de [porteuse] » revient en tête, sans cadre (la référence de la carte)
      expect(texte('[data-honoraires-cote="sortie"]')).toBe(`Honoraires reçus de ${P.toUpperCase()} 2 708,33 € HT (3 250 € TTC)`);
      expect(container.querySelector('[data-honoraires-cote]')!.className).not.toContain('trx-calcul-encadre');
      expect(texte('[data-modifier-remuneration="sortie"]')).toBe('Modifier la rémunération');
      expect(tuiles()).toEqual(['3 250 € TTC', '1 625 € TTC', '1 625 € TTC']);
    });
  }

  it('miroir, salarié : même retrait ; le cadre vert et sa mention restent ; la commission ne compte pas dans « Commissions versées »', async () => {
    await miroir('criterimmo', 'salarie');
    expect(bloc()).toEqual(['data-remuneration-titre', 'data-remuneration-negociateur', 'data-ventilation', 'data-ventilation', 'data-commission-negociateur', 'data-modifier-remuneration']); // LOT AZ / BA
    expect(texte('[data-commission-negociateur="sortie"]')).toBe('Commission du négociateur : 2 708,33 € HT × 50 % = 1 354,17 € HT (1 625 € TTC) Salarié interne — non comptabilisé dans « Commissions versées »');
    // LOT AM — la commission d'un salarié n'est ni versée ni du CA : à l'encre ; son liseré (vert, lot Y) ne change pas.
    expect(container.querySelector('[data-commission-negociateur="sortie"]')!.classList.contains('trx-calcul-encadre--interne')).toBe(true);
    expect(container.querySelector('[data-commission-negociateur="sortie"] .trx-rouge')).toBeNull();
    expect(texte('[data-compromis="44"]')).not.toContain('Statut à la vente');
    expect(tuiles()).toEqual(['3 250 € TTC', '0 € TTC', '3 250 € TTC']);
  });

  it('la carte de la vente d’origine (porteuse) ne change pas : « Honoraires partie vendeur / acquéreur » et la mention du statut y restent', async () => {
    listeCompromis = [location('criterimmo', 'independant')];
    act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'criterimmo' })); }); await calmer();
    await cliquer('[data-vue="compromis"]'); await deplier(44);
    // LOT BA — centimes AH : la porteuse (l'entrée) prend l'écart
    expect(texte('[data-honoraires-cote="sortie"]')).toContain('Honoraires partie acquéreur : 5 416,67 € HT × 50 % = 2 708,33 € HT (3 250 € TTC)');
    expect(texte('[data-honoraires-cote="entree"]')).toBe('Honoraires partie vendeur : 5 416,67 € HT × 50 % = 2 708,34 € HT (3 250 € TTC)');
    expect(texte('[data-part-agence="entree"] [data-mention-commission]')).toMatch(/^Comptés dans le CA de .* \(associé/); // LOT BI : l'associé, son côté compté dans son CA
  });
});

describe('🔴 LOT AL — la tuile « Commissions versées » ouvre une fenêtre : par catégorie (défaut) ou par transaction ; total = tuile au centime', () => {
  // 41 « DUPONT / MARTIN » : 12 000 TTC, apporteur Julien Deblois 2 400 TTC ; JB (CRITERIMMO, indépendant) 40 %, 1 000 HT ; Mylène (MACJ) 40 % ;
  // Agence du Parc 20 %. 50 « SANS FRAIS » : plus récente, Augustin (CRITERIMMO, associé) seul, sans commission saisie.
  const avec: Vente = { ...compromis, lignes: [{ id: 1, negociateur: JB.nom, role: 'negociateur', montantTtc: 1200, montantHt: 1000, cote: 'entree', nature: 'compromis', compte: false,
    origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null }] };
  const sansFrais: Vente = { ...compromis, id: 50, libelle: 'SANS FRAIS', dateCompromis: '2026-10-25', honorairesTtc: 6000, apporteur: null, retroApporteur: null,
    repartition: { retroApporteurTtc: 0, parties: [{ sorte: 'entree', compteId: 4, negociateur: AU.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 100, montantHt: null, statut: 'associe' }] },
    dossier: { ...compromis.dossier!, entree: { id: 4, nom: AU.nom }, sortie: null }, lignes: [] };
  const centimes = (t: string): number => Math.round(Number(t.replace(/[^\d,-]/g, '').replace(',', '.')) * 100);
  const montants = (sel: string): number[] => [...document.querySelectorAll(`[data-fenetre-commissions] ${sel}`)].map((x) => centimes(x.children[0].textContent!));
  const ouvert = (): boolean => document.querySelector('[data-fenetre-commissions]') !== null;
  const cliquerDoc = async (sel: string) => { await act(async () => { (document.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const onglet = async () => { await ouvrir(); await cliquer('[data-vue="compromis"]'); };

  it('la tuile : titre, total rouge, HT, « Voir le détail » — plus de lignes ni de bulle ; un bouton (souris, Entrée / Espace, toucher)', async () => {
    listeCompromis = [avec, sansFrais];
    await onglet();
    const tuile = container.querySelector('[data-tuile="commissions"]')!;
    expect(tuile.tagName).toBe('BUTTON');
    expect([...tuile.children].map((x) => x.textContent!.replace(/\s/g, ' '))).toEqual(['Commissions versées', '7 800 € HT versées(9 360 € TTC)', 'Voir le détail']); // LOT AM : ici HT en grand
    expect(tuile.getAttribute('title')).toBeNull();
    expect(tuile.getAttribute('aria-haspopup')).toBe('dialog');
    expect(container.querySelector('[data-detail]')).toBeNull();
    expect(ouvert()).toBe(false);
    await cliquer('[data-tuile="commissions"]');
    expect(ouvert()).toBe(true);
    expect(fenetre('h2')).toBe('Commissions versées — CRITERIMMO — compromis en cours');
    expect(fenetre('[data-fenetre-total-haut]')).toBe('7 800 € HT versées(9 360 € TTC)'); // LOT AM : ici HT en grand
    expect(fenetre('[data-fenetre-total]')).toBe('7 800 € HT(9 360 € TTC)');
  });

  it('par catégorie (défaut) : les 4 catégories et leurs lignes, sous-totaux = total ; à part, les internes et l’autre société', async () => {
    listeCompromis = [avec, sansFrais];
    await onglet(); await cliquer('[data-tuile="commissions"]');
    expect(document.querySelector('[data-mode-fenetre="categorie"]')!.getAttribute('aria-pressed')).toBe('true');
    expect([...document.querySelectorAll('[data-fenetre-commissions] [data-categorie]')].map((x) => x.getAttribute('data-categorie'))).toEqual(['independants', 'inter-cabinet-macj', 'apporteurs', 'exterieur', 'internes']);
    expect(categorie('apporteurs')).toBe('Apporteurs d’affaires : 2 000 € HT (2 400 € TTC)');
    expect(fenetre('[data-categorie="apporteurs"] [data-ligne-cout]')).toBe('Julien Deblois · DUPONT / MARTIN2 000 € HT(2 400 € TTC)');
    expect(fenetre('[data-categorie="inter-cabinet-macj"] [data-ligne-cout]')).toBe('Mylène EBERLIN · DUPONT / MARTIN3 200 € HT(3 840 € TTC)');
    expect(fenetre('[data-categorie="exterieur"] [data-ligne-cout]')).toBe('Agence du Parc · DUPONT / MARTIN1 600 € HT(1 920 € TTC)');
    expect(fenetre('[data-categorie="independants"] [data-ligne-cout]')).toBe('Jean-Baptiste PONS · DUPONT / MARTIN1 000 € HT(1 200 € TTC)');
    // sous-totaux en rouge, alignés à droite ; leur somme = le total = la tuile
    expect(document.querySelector('[data-sous-total="apporteurs"]')!.classList.contains('trx-rouge')).toBe(true);
    const versees = montants('[data-categorie]:not(.trx-fc-section--info) [data-sous-total]');
    expect(versees.reduce((t, x) => t + x, 0)).toBe(centimes(texte('[data-commissions-ht]')));
    expect(categorie('internes')).toBe('Internes (associés, salariés) — non déduits : 0 € HT (0 € TTC)');
    expect(fenetre('[data-categorie="internes"] [data-aucune]')).toBe('Aucune');
    expect(document.querySelector('[data-sous-total="internes"]')!.classList.contains('trx-rouge')).toBe(false);
    expect(fenetre('[data-non-deduits] [data-detail="autre-societe"]')).toBe('Négociateurs de l’autre société : rémunérés par elle — non comptés ici');
  });

  it('par transaction : un bloc par affaire AYANT une commission versée (LOT AN : plus de bloc « Aucune commission versée »), la plus récente d’abord ; étiquettes ; le choix est retenu', async () => {
    listeCompromis = [avec, sansFrais];
    await onglet(); await cliquer('[data-tuile="commissions"]');
    await cliquerDoc('[data-mode-fenetre="transaction"]');
    expect(document.querySelector('[data-mode-fenetre="transaction"]')!.getAttribute('aria-pressed')).toBe('true');
    // LOT AN — « SANS FRAIS » (50) n'a aucune commission versée : ni bloc, ni compté dans « 1 dossier concerné »
    expect([...document.querySelectorAll('[data-fenetre-commissions] [data-affaire]')].map((x) => x.getAttribute('data-affaire'))).toEqual(['41']);
    expect(fenetre('[data-dossiers]')).toBe('1 dossier concerné');
    expect(document.querySelector('[data-aucune-versee]')).toBeNull();
    expect(fenetre('[data-affaire="41"] .trx-fc-sous')).toBe('Compromis du 20/10/2026');
    expect(fenetre('[data-commission-affaire="41"]')).toBe('10 000 € HT(12 000 € TTC)commission de la vente');
    expect([...document.querySelectorAll('[data-affaire="41"] [data-ligne-cout]')].map((x) => x.textContent!.replace(/\s/g, ' '))).toEqual([
      'IndépendantJean-Baptiste PONS1 000 € HT(1 200 € TTC)', 'Inter-cabinetMylène EBERLIN3 200 € HT(3 840 € TTC)',
      'ApporteurJulien Deblois2 000 € HT(2 400 € TTC)', 'Agence extérieureAgence du Parc1 600 € HT(1 920 € TTC)']);
    expect(montants('[data-verse-affaire]').reduce((t, x) => t + x, 0)).toBe(centimes(texte('[data-commissions-ht]')));
    expect(fenetre('[data-fenetre-total]')).toBe('7 800 € HT(9 360 € TTC)');
    expect(window.localStorage.getItem('trx-commissions-versees-mode')).toBe('transaction');
    // fermée puis rouverte : « Par transaction » retenu
    await cliquerDoc('[data-fermer-fenetre]');
    expect(ouvert()).toBe(false);
    await cliquer('[data-tuile="commissions"]');
    expect(document.querySelector('[data-mode-fenetre="transaction"]')!.getAttribute('aria-pressed')).toBe('true');
    await cliquerDoc('[data-mode-fenetre="categorie"]');
    expect(document.querySelector('[data-fenetre-commissions] [data-categorie="apporteurs"]')).not.toBeNull();
  });

  it('fermeture : Échap, clic hors de la fenêtre, croix — le focus revient sur la tuile', async () => {
    await onglet();
    await cliquer('[data-tuile="commissions"]');
    expect(document.activeElement).toBe(document.querySelector('[data-fermer-fenetre]'));
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); }); await calmer();
    expect(ouvert()).toBe(false);
    expect(document.activeElement).toBe(container.querySelector('[data-tuile="commissions"]'));
    await cliquer('[data-tuile="commissions"]');
    await act(async () => { document.querySelector('.trx-fc-voile')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }); await calmer();
    expect(ouvert()).toBe(false);
    await cliquer('[data-tuile="commissions"]');
    await act(async () => { document.querySelector('[data-fenetre-commissions]')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }); await calmer();
    expect(ouvert()).toBe(true);
  });

  it('le nom d’une affaire : la fenêtre se ferme et sa carte se déplie', async () => {
    listeCompromis = [avec, sansFrais];
    await onglet(); await cliquer('[data-tuile="commissions"]');
    expect(container.querySelector('[data-deplier="compromis-41"]')!.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('[data-aller-affaire="41"]')!.getAttribute('href')).toBe('?vente=41');
    await cliquerDoc('[data-categorie="apporteurs"] [data-aller-affaire="41"]');
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); await calmer();
    expect(ouvert()).toBe(false);
    expect(container.querySelector('[data-deplier="compromis-41"]')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('aucune affaire : 0 partout, chaque catégorie « Aucune » ; par transaction : « Aucun compromis en cours. »', async () => {
    listeCompromis = [];
    await onglet();
    expect(texte('[data-commissions-ttc]')).toBe('0 € TTC');
    await cliquer('[data-tuile="commissions"]');
    expect([...document.querySelectorAll('[data-fenetre-commissions] [data-aucune]')].map((x) => x.getAttribute('data-aucune'))).toEqual(['independants', 'inter-cabinet-macj', 'apporteurs', 'exterieur', 'internes']);
    expect(fenetre('[data-fenetre-total]')).toBe('0 € HT(0 € TTC)');
    await cliquerDoc('[data-mode-fenetre="transaction"]');
    expect(fenetre('[data-aucune-affaire]')).toBe('Aucun dossier concerné.'); // LOT AN
    expect(fenetre('[data-dossiers]')).toBe('0 dossier concerné');
  });

  it('MACJ : la ligne miroir — son indépendant seul ; « Inter-cabinet vers CRITERIMMO » à « Aucune » ; total = tuile', async () => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    const v: Vente = { ...compromis, id: 37, libelle: 'Location ?', honorairesTtc: 7500, apporteur: 'Gardien Dacquet', retroApporteur: { montant: 1000, unite: 'ttc' }, repartition: { retroApporteurTtc: 1000, parties: [
      { sorte: 'entree', compteId: 4, negociateur: AU.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'associe' },
      { sorte: 'sortie', compteId: 7, negociateur: MY.nom, societe: 'macj', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' }] },
    dossier: { ...compromis.dossier!, entree: { id: 4, nom: AU.nom }, sortie: { id: 7, nom: MY.nom } },
    lignes: [{ id: 2, negociateur: MY.nom, role: 'negociateur', montantTtc: 1625, montantHt: null, cote: 'sortie', nature: 'compromis', compte: false, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null }] };
    listeCompromis = [venteDansSociete(v, 'macj')!];
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
    await cliquer('[data-vue="compromis"]');
    expect([texte('[data-commissions-ttc]'), texte('[data-commissions-ht]')]).toEqual(['1 625 € TTC', '1 354,17 € HT']); // LOT AM : « versées » suit le grand montant, hors de la marque
    await cliquer('[data-tuile="commissions"]');
    expect(fenetre('h2')).toBe('Commissions versées — MACJ — compromis en cours');
    expect(categorie('inter-cabinet-criterimmo')).toBe('Inter-cabinet vers CRITERIMMO : 0 € HT (0 € TTC)');
    expect(categorie('independants')).toBe('Indépendants : 1 354,17 € HT (1 625 € TTC)');
    expect(fenetre('[data-fenetre-total]')).toBe('1 354,17 € HT(1 625 € TTC)');
    // et chez CRITERIMMO (porteuse) : apporteur 833,33 + reversé 2 708,33 — les centimes de la carte — font la tuile ; le solde = le reste de la carte
    listeCompromis = [v];
    act(() => { root.unmount(); }); root = createRoot(container);
    await onglet();
    expect([texte('[data-commissions-ht]'), texte('[data-solde-ht]')]).toEqual(['3 541,66 € HT', '2 708,34 € HT']);
    await deplier(37);
    expect(texte('[data-ligne-repartition="reste"] td:last-child')).toBe('2 708,34 € HT(3 250 € TTC)');
    await cliquer('[data-tuile="commissions"]');
    expect([categorie('apporteurs'), categorie('inter-cabinet-macj')]).toEqual(['Apporteurs d’affaires : 833,33 € HT (1 000 € TTC)', 'Inter-cabinet vers MACJ : 2 708,33 € HT (3 250 € TTC)']);
    expect(categorie('internes')).toBe('Internes (associés, salariés) — non déduits : 0 € HT (0 € TTC)');
    expect(fenetre('[data-fenetre-total]')).toBe('3 541,66 € HT(4 250 € TTC)');
  });

  it('un observateur (écriture indisponible) ouvre la fenêtre, en lecture seule ; le CA global : « CRITERIMMO et MACJ », l’inter-cabinet neutralisé à part', async () => {
    (references as Record<string, unknown>).disponible = false;
    try {
      await onglet();
      expect(container.querySelector('[data-nouveau-compromis]')!.hasAttribute('disabled')).toBe(true);
      await cliquer('[data-tuile="commissions"]');
      expect(ouvert()).toBe(true);
      expect(document.querySelectorAll('[data-fenetre-commissions] input, [data-fenetre-commissions] form').length).toBe(0);
    } finally { delete (references as Record<string, unknown>).disponible; }
    act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
    await cliquer('[data-vue="compromis"]');
    await cliquer('[data-tuile="commissions"]');
    expect(fenetre('h2')).toBe('Commissions versées — CRITERIMMO et MACJ — compromis en cours');
    expect([...document.querySelectorAll('[data-fenetre-commissions] [data-categorie]')].map((x) => x.getAttribute('data-categorie'))).toEqual(['independants', 'apporteurs', 'exterieur', 'internes', 'neutralise']);
    expect(categorie('neutralise')).toBe('Inter-cabinet entre nos sociétés — neutralisé : 3 200 € HT (3 840 € TTC)');
    expect(fenetre('[data-fenetre-total]').replace(/\(.*$/, '')).toBe(texte('[data-commissions-ht]'));
  });
});

describe('🔴 LOT AM — « HT | TTC » : l’unité choisie en grand dans tout le bloc ; couleurs selon le sens ; espaces des milliers', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; try { window.localStorage.removeItem('trx-affichage-montants'); } catch { /* sans stockage */ } });
  afterEach(() => { delete ref.uniteCommission; });
  // 41 « DUPONT / MARTIN » : 12 000 TTC, apporteur 2 400 TTC ; JB (CRITERIMMO, indépendant) 40 %, 1 000 HT ; Mylène (MACJ) 40 % ; Agence du Parc 20 %.
  const avec: Vente = { ...compromis, lignes: [{ id: 1, negociateur: JB.nom, role: 'negociateur', montantTtc: 1200, montantHt: 1000, cote: 'entree', nature: 'compromis', compte: false,
    origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null }] };
  const doc = (sel: string): string => document.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
  const grand = (sel: string): string => doc(`${sel} [data-montant-grand]`);
  const petit = (sel: string): string => doc(`${sel} [data-montant-petit]`);
  const basculer = async (u: 'ht' | 'ttc') => cliquer(`[data-afficher="${u}"]`);
  const onglet = async () => { listeCompromis = [avec]; await ouvrir(); await cliquer('[data-vue="compromis"]'); };

  it('le sélecteur « HT | TTC » est juste à gauche de « + Nouveau compromis » ; par défaut TTC : TTC en grand, HT en petit entre parenthèses, dans les 4 tuiles et l’en-tête des cartes', async () => {
    await onglet();
    const actions = container.querySelector('[data-onglet-compromis] > .trx-barre > .trx-actions')!;
    expect([...actions.children].map((x) => x.getAttribute('data-affichage-montants') ?? (x.hasAttribute('data-nouveau-compromis') ? 'nouveau' : '?'))).toEqual(['ttc', 'nouveau']);
    expect([...container.querySelectorAll('[data-afficher]')].map((x) => [x.textContent, x.getAttribute('aria-pressed')])).toEqual([['HT', 'false'], ['TTC', 'true']]);
    expect([grand('[data-tuile="ca"]'), petit('[data-tuile="ca"]')]).toEqual(['12 000 € TTC', '(10 000 € HT)']);
    expect([grand('[data-tuile="commissions"]'), petit('[data-tuile="commissions"]')]).toEqual(['9 360 € TTC versées', '(7 800 € HT)']);
    expect([grand('[data-tuile="solde"]'), petit('[data-tuile="solde"]')]).toEqual(['2 640 € TTC', '(2 200 € HT)']);
    expect(await lireCa(['[data-solde-explication]'])).toEqual(['CA TTC − commissions versées TTC']); // LOT AO : dans la fenêtre « Solde net »
    // LOT AN — les lignes de la tuile CA sont dans sa fenêtre (en TTC : le reversé 3 840 + 1 920 = 5 760, non déduit)
    expect(await lireCa(['[data-solde-dont="portee-criterimmo"] .trx-fc-montant', '[data-sous-total-solde="inter-cabinet-macj"]', '[data-sous-total-solde="exterieur"]'])).toEqual(['12 000 € TTC(10 000 € HT)', '3 840 € TTC(3 200 € HT)', '1 920 € TTC(1 600 € HT)']);
    expect([grand('[data-carte-compromis="41"]'), petit('[data-carte-compromis="41"] [data-carte="montants"]')]).toEqual(['12 000 € TTC', '(10 000 € HT)']);
  });

  it('bascule HT : instantanée, partout ; mêmes valeurs au centime dans les deux modes ; rien n’est envoyé ; retenue après rechargement', async () => {
    await onglet();
    const paires = () => ['ca', 'commissions', 'solde'].map((t) => [texte(`[data-tuile="${t}"] [data-${t === 'commissions' ? 'commissions' : t}-ht]`), texte(`[data-tuile="${t}"] [data-${t === 'commissions' ? 'commissions' : t}-ttc]`)]);
    const avant = paires();
    await basculer('ht');
    expect([...container.querySelectorAll('[data-afficher]')].map((x) => x.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect([grand('[data-tuile="ca"]'), petit('[data-tuile="ca"]')]).toEqual(['10 000 € HT', '(12 000 € TTC)']);
    expect([grand('[data-tuile="commissions"]'), petit('[data-tuile="commissions"]')]).toEqual(['7 800 € HT versées', '(9 360 € TTC)']);
    expect(await lireCa(['[data-solde-explication]'])).toEqual(['CA HT − commissions versées HT']); // LOT AO : dans la fenêtre « Solde net »
    expect(paires()).toEqual(avant);
    expect(avant).toEqual([['10 000 € HT', '12 000 € TTC'], ['7 800 € HT', '9 360 € TTC'], ['2 200 € HT', '2 640 € TTC']]);
    expect(window.localStorage.getItem('trx-affichage-montants')).toBe('ht');
    expect(posts).toEqual([]);
    // « rechargement » : un nouvel écran (MACJ aussi : le choix est partagé) relit HT
    act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
    await cliquer('[data-vue="compromis"]');
    expect(container.querySelector('[data-afficher="ht"]')!.getAttribute('aria-pressed')).toBe('true');
    await basculer('ttc');
    expect(window.localStorage.getItem('trx-affichage-montants')).toBe('ttc');
  });

  it('la carte dépliée : lignes de calcul, tableau « Répartition » et apporteur suivent le choix ; couleurs selon le sens', async () => {
    await onglet(); await deplier(41);
    // TTC : l'opérande et le résultat en TTC ; versé (l'acquéreur MACJ, l'indépendant JB) en rouge, le reste à l'encre
    // LOT BA — l'en-tête : la commission de la vente × la part ; le reversé à MACJ, son cadre rouge
    expect(texte('[data-honoraires-cote="sortie"]')).toBe('= Honoraires partie acquéreur : (12 000 € TTC − 2 400 € TTC) × 50 % = 4 800 € TTC (4 000 € HT)'); // LOT BB
    expect(texte('[data-reverse-cote="sortie"] .trx-calcul-resultat')).toBe('3 840 € TTC');
    expect(texte('[data-honoraires-cote="entree"]')).toBe('= Honoraires partie vendeur : (12 000 € TTC − 2 400 € TTC) × 50 % = 4 800 € TTC (4 000 € HT)'); // LOT BB
    expect(container.querySelector('[data-honoraires-cote="entree"] .trx-calcul-resultat')!.className).toBe('trx-calcul-resultat');
    expect(container.querySelector('[data-commission-negociateur="entree"] .trx-calcul-resultat')!.className).toContain('trx-rouge');
    expect(texte('[data-colonne-montants]')).toBe('€ TTC (HT)');
    const ligne = (cle: string) => [doc(`[data-ligne-repartition="${cle}"] [data-montant-grand]`), container.querySelector(`[data-ligne-repartition="${cle}"] [data-montant-grand]`)!.className];
    expect(ligne('commission')).toEqual(['12 000 € TTC', 'trx-mt-grand trx-vert']);
    expect(ligne('apporteur')).toEqual(['2 400 € TTC', 'trx-mt-grand trx-rouge']);
    expect(ligne('base')).toEqual(['9 600 € TTC', 'trx-mt-grand']);
    expect(ligne('part-reverse-macj')).toEqual(['3 840 € TTC', 'trx-mt-grand trx-rouge']);
    expect(ligne('reste')).toEqual(['3 840 € TTC', 'trx-mt-grand trx-vert']);
    expect(texte('[data-apporteur-montant]')).toBe('2 400 € TTC (2 000 € HT)');
    // le petit : même couleur que le grand
    expect(container.querySelector('[data-ligne-repartition="apporteur"] [data-montant-petit]')!.className).toBe('trx-mt-petit trx-rouge');
    await basculer('ht');
    expect(texte('[data-honoraires-cote="entree"]')).toBe('= Honoraires partie vendeur : (10 000 € HT − 2 000 € HT) × 50 % = 4 000 € HT (4 800 € TTC)'); // LOT BB : (commission − apporteur) × part parmi nos parties (40 / 80, agence extérieure comprise)
    expect(texte('[data-colonne-montants]')).toBe('€ HT (TTC)');
    expect(ligne('reste')).toEqual(['3 200 € HT', 'trx-mt-grand trx-vert']);
    expect(texte('[data-apporteur-montant]')).toBe('2 000 € HT (2 400 € TTC)');
    // aucune carte ne mêle HT en grand ici et en petit ailleurs : chaque grand montant de la carte est en HT
    expect([...container.querySelectorAll('[data-compromis="41"] [data-montant-grand], [data-compromis="41"] .trx-calcul-resultat')].every((x) => / HT( versées)?$/.test(x.textContent!.replace(/\s/g, ' ')))).toBe(true);
  });

  it('la ligne miroir (MACJ) : en-tête, « CA de MACJ », commission du négociateur — dans l’unité choisie', async () => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    const v: Vente = { ...compromis, id: 37, libelle: 'Location ?', honorairesTtc: 6500, apporteur: null, retroApporteur: null, repartition: { retroApporteurTtc: 0, parties: [
      { sorte: 'entree', compteId: 4, negociateur: AU.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'associe' },
      { sorte: 'sortie', compteId: 7, negociateur: MY.nom, societe: 'macj', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' }] },
    dossier: { ...compromis.dossier!, entree: { id: 4, nom: AU.nom }, sortie: { id: 7, nom: MY.nom } },
    lignes: [{ id: 2, negociateur: MY.nom, role: 'negociateur', montantTtc: 1625, montantHt: null, cote: 'sortie', nature: 'compromis', compte: false, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null }] };
    listeCompromis = [venteDansSociete(v, 'macj')!];
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
    await cliquer('[data-vue="compromis"]'); await cliquer('[data-deplier="miroir-37"]');
    expect([grand('[data-carte-miroir="37"] [data-carte="montants"]'), petit('[data-carte-miroir="37"] [data-carte="montants"]')]).toEqual(['3 250 € TTC', '(2 708,33 € HT)']);
    expect(doc('[data-miroir-info="ca"] dd')).toBe('3 250 € TTC(2 708,33 € HT)');
    expect(container.querySelector('[data-miroir-info="ca"] [data-montant-grand]')!.className).toContain('trx-vert');
    expect(texte('[data-commission-negociateur="sortie"]')).toBe('Commission du négociateur : 3 250 € TTC × 50 % = 1 625 € TTC (1 354,17 € HT) Indépendant — comptabilisé dans « Commissions versées »');
    await basculer('ht');
    expect(doc('[data-miroir-info="ca"] dd')).toBe('2 708,33 € HT(3 250 € TTC)');
    expect(texte('[data-commission-negociateur="sortie"]')).toBe('Commission du négociateur : 2 708,33 € HT × 50 % = 1 354,17 € HT (1 625 € TTC) Indépendant — comptabilisé dans « Commissions versées »');
  });

  it('la fenêtre « Commissions versées », dans ses deux modes : l’unité choisie en grand ; total = tuile au centime ; la bascule s’y voit à tout moment', async () => {
    await onglet();
    await cliquer('[data-tuile="commissions"]');
    expect(doc('[data-fenetre-total-haut]')).toBe('9 360 € TTC versées(7 800 € HT)');
    const sousTotal = (cle: string) => [...document.querySelector(`[data-fenetre-commissions] [data-sous-total="${cle}"]`)!.children].map((x) => x.textContent!.replace(/\s/g, ' '));
    expect(sousTotal('apporteurs')).toEqual(['2 400 € TTC', '(2 000 € HT)']);
    expect(doc('[data-fenetre-total]')).toBe('9 360 € TTC(7 800 € HT)');
    await act(async () => { (document.querySelector('[data-mode-fenetre="transaction"]') as HTMLElement).click(); }); await calmer();
    expect(doc('[data-commission-affaire="41"]')).toBe('12 000 € TTC(10 000 € HT)commission de la vente');
    expect(document.querySelector('[data-commission-affaire="41"]')!.className).toContain('trx-vert');
    expect(doc('[data-verse-affaire="41"]')).toBe('9 360 € TTC(7 800 € HT)');
    await basculer('ht');
    expect(doc('[data-verse-affaire="41"]')).toBe('7 800 € HT(9 360 € TTC)');
    expect(doc('[data-fenetre-total]')).toBe('7 800 € HT(9 360 € TTC)');
    expect(doc('[data-fenetre-total]').startsWith(texte('[data-commissions-ht]'))).toBe(true);
    await act(async () => { (document.querySelector('[data-mode-fenetre="categorie"]') as HTMLElement).click(); }); await calmer();
    expect(sousTotal('apporteurs')).toEqual(['2 000 € HT', '(2 400 € TTC)']);
  });

  it('« Modifier » : les montants AFFICHÉS suivent le choix ; les champs gardent leur unité ; la commission regroupée à la sortie du champ, la valeur envoyée inchangée', async () => {
    await onglet(); await deplier(41);
    await cliquer('[data-modifier-compromis="41"]');
    const r = '[data-resume-base]';
    expect(doc(`${r} thead th`)).toBe('TTC (HT)');
    expect(doc(`${r} [data-resume="commission"] td`)).toBe('12 000 € TTC (10 000 € HT)');
    expect(texte('[data-part-societe-form="criterimmo"]')).toBe('Part CRITERIMMO : 3 840 € TTC (3 200 € HT) · 40 %');
    // le champ « Commission TTC » (sélecteur en TTC) ; à la sortie, « 12000 » devient « 12 000 » (espace insécable) ; envoyée : la même valeur
    await saisir('[data-champ="commission"]', '12000');
    await act(async () => { container.querySelector('[data-champ="commission"]')!.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    expect((container.querySelector('[data-champ="commission"]') as HTMLInputElement).value).toBe('12\u00a0000');
    await basculer('ht');
    expect(doc(`${r} [data-resume="commission"] td`)).toBe('10 000 € HT (12 000 € TTC)');
    await cliquer('[data-enregistrer-dossier]');
    const { montant } = await import('../../../../lib/transaction/saisie');
    const envoye = (posts.at(-1) as { dossier: { honorairesTtc: string } }).dossier.honorairesTtc;
    expect(montant(envoye)).toBe(12000);
  });

  it('espaces des milliers : U+00A0 visible partout dans l’onglet, jamais l’espace fine', async () => {
    await onglet(); await deplier(41);
    expect(container.querySelector('[data-ca-ttc]')!.textContent).toBe('12\u00a0000\u00a0€\u00a0TTC');
    expect(container.textContent).not.toMatch(/\u202f/);
    expect(container.textContent).toMatch(/9\u00a0600\u00a0€/);
  });

  it('le CA global : pas de sélecteur, le choix retenu s’y applique', async () => {
    window.localStorage.setItem('trx-affichage-montants', 'ht');
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
    await cliquer('[data-vue="compromis"]');
    expect(container.querySelector('[data-afficher]')).toBeNull();
    expect(grand('[data-tuile="ca"]')).toMatch(/ HT$/);
  });
});

describe('🔴 LOT AN — fenêtre « Chiffre d’affaires » ; « N dossiers » ; le sélecteur « HT | TTC » décide aussi des champs ; pas de « ,00 »', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; window.localStorage.setItem('trx-affichage-montants', 'ttc'); });
  afterEach(() => { delete ref.uniteCommission; });
  const lc = (id: number, nego: string, cote: 'entree' | 'sortie', ttc: number) => ({ id, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc, montantHt: null, cote,
    nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  // 41 : JB indépendant (1 200 TTC versés) ; 51 « INTERNE SEUL » : Augustin associé, 600 TTC (non déduit) ; 52 « RIEN » : aucune commission.
  const avec: Vente = { ...compromis, lignes: [lc(1, JB.nom, 'entree', 1200)] };
  const seul = (id: number, libelle: string, lignes: Vente['lignes']): Vente => ({ ...compromis, id, libelle, dateCompromis: '2026-10-25', honorairesTtc: 6000, apporteur: null, retroApporteur: null,
    repartition: { retroApporteurTtc: 0, parties: [{ sorte: 'entree', compteId: 4, negociateur: AU.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 100, montantHt: null, statut: 'associe' }] },
    dossier: { ...compromis.dossier!, entree: { id: 4, nom: AU.nom }, sortie: null }, lignes });
  const doc = (sel: string): string => document.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
  const cliquerDoc = async (sel: string) => { await act(async () => { (document.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const onglet = async (liste: Vente[] = [avec, seul(51, 'INTERNE SEUL', [lc(2, AU.nom, 'entree', 600)]), seul(52, 'RIEN', [])]) => {
    listeCompromis = liste; await ouvrir(); await cliquer('[data-vue="compromis"]');
  };

  it('« Commissions versées » : « 1 dossier concerné » dans les deux modes ; par transaction, ni l’affaire aux seuls internes ni celle sans commission ; les internes restent dans la section grise', async () => {
    await onglet();
    await cliquer('[data-tuile="commissions"]');
    expect(doc('[data-fenetre-commissions] [data-dossiers]')).toBe('1 dossier concerné');
    expect(doc('[data-categorie="internes"] [data-ligne-cout]')).toBe('Augustin Jorel · INTERNE SEUL500 € HT(600 € TTC)'.replace('500 € HT(600 € TTC)', '600 € TTC(500 € HT)'));
    await cliquerDoc('[data-mode-fenetre="transaction"]');
    expect(doc('[data-fenetre-commissions] [data-dossiers]')).toBe('1 dossier concerné');
    expect([...document.querySelectorAll('[data-fenetre-commissions] [data-affaire]')].map((x) => x.getAttribute('data-affaire'))).toEqual(['41']);
    expect(document.querySelector('[data-aucune-versee]')).toBeNull();
  });

  it('les champs suivent le sélecteur : plus aucun bouton HT / TTC propre à un champ ; le formulaire montre le même sélecteur, synchronisé ; libellés « Part (€ TTC) », « Commission TTC »', async () => {
    await onglet([avec]); await deplier(41);
    await cliquer('[data-modifier-compromis="41"]');
    expect(container.querySelector('[data-unite-de]')).toBeNull();
    expect(container.querySelector('[data-affichage-formulaire] [data-afficher="ttc"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(texte('[data-champ="commission"]') === '' && (container.querySelector('[data-champ="commission"]') as HTMLInputElement).closest('label')!.textContent!.startsWith('Commission TTC')).toBe(true);
    expect((container.querySelector('[data-partie-eur="0"]') as HTMLInputElement).closest('label')!.textContent).toBe('Part (€ TTC)');
    expect((container.querySelector('[data-partie-eur="0"]') as HTMLInputElement).value.replace(/\s/g, ' ')).toBe('3 840');
    await cliquer('[data-affichage-formulaire] [data-afficher="ht"]');
    expect(container.querySelector('[data-onglet-compromis] > .trx-barre [data-afficher="ht"]')!.getAttribute('aria-pressed')).toBe('true');
    expect((container.querySelector('[data-partie-eur="0"]') as HTMLInputElement).closest('label')!.textContent).toBe('Part (€ HT)');
    expect((container.querySelector('[data-partie-eur="0"]') as HTMLInputElement).value.replace(/\s/g, ' ')).toBe('3 200');
    expect((container.querySelector('[data-champ="commission"]') as HTMLInputElement).value.replace(/\s/g, ' ')).toBe('10 000');
  });

  it('ouvrir et basculer plusieurs fois n’écrit rien ; enregistré sans retouche, le dossier envoyé est identique au centime', async () => {
    await onglet([avec]); await deplier(41);
    await cliquer('[data-modifier-compromis="41"]');
    await cliquer('[data-enregistrer-dossier]');
    const sans = JSON.stringify(posts.at(-1));
    await cliquer('[data-modifier-compromis="41"]');
    const avant = posts.length;
    for (const u of ['ht', 'ttc', 'ht', 'ttc', 'ht'] as const) await cliquer(`[data-affichage-formulaire] [data-afficher="${u}"]`);
    expect(posts.length).toBe(avant);
    await cliquer('[data-enregistrer-dossier]');
    expect(JSON.stringify(posts.at(-1))).toBe(sans);
  });

  it('une saisie en TTC puis « Enregistrer » = la même valeur HT, au centime, que la saisie HT équivalente (commission, part en €)', async () => {
    const { montant } = await import('../../../../lib/transaction/saisie');
    const envoi = async (u: 'ht' | 'ttc', commission: string, part: string) => {
      act(() => { root.unmount(); }); root = createRoot(container);
      window.localStorage.setItem('trx-affichage-montants', u);
      await onglet([avec]); await deplier(41);
      await cliquer('[data-modifier-compromis="41"]');
      await saisir('[data-champ="commission-entree"]', commission);
      await saisir('[data-partie-eur="0"]', part);
      await cliquer('[data-enregistrer-dossier]');
      const d = (posts.at(-1) as { dossier: { commissions: { entree: { montant: string; unite: string } }; parties: { montantHt: number | null }[] } }).dossier;
      const c = montant(d.commissions.entree.montant)!;
      return { commissionHt: Math.round((d.commissions.entree.unite === 'ht' ? c : c / 1.2) * 100), partHt: d.parties[0].montantHt };
    };
    const ttc = await envoi('ttc', '1200', '3840');
    const ht = await envoi('ht', '1000', '3200');
    expect(ttc).toEqual(ht);
    expect(ttc).toEqual({ commissionHt: 100000, partHt: 3200 });
    // un montant TTC qui ne tombe pas juste en HT : 1 625 TTC = 1 354,17 HT au centime (enregistré tel que tapé, en TTC)
    const tiers = await envoi('ttc', '1625', '3840');
    expect(tiers).toEqual({ commissionHt: 135417, partHt: 3200 });
  });

  it('pas de « ,00 » : « 12 000 € TTC » ; de vrais centimes gardés : « 2 708,34 »', async () => {
    const v: Vente = { ...compromis, id: 37, libelle: 'Location ?', honorairesTtc: 7500, apporteur: 'Gardien Dacquet', retroApporteur: { montant: 1000, unite: 'ttc' }, repartition: { retroApporteurTtc: 1000, parties: [
      { sorte: 'entree', compteId: 4, negociateur: AU.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'associe' },
      { sorte: 'sortie', compteId: 7, negociateur: MY.nom, societe: 'macj', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' }] }, lignes: [] };
    await onglet([v]); await deplier(37);
    await cliquer('[data-afficher="ht"]');
    expect(texte('[data-carte-compromis="37"] [data-carte="commission-ht"]')).toBe('6 250 € HT');
    expect(texte('[data-ligne-repartition="reste"] [data-montant-grand]')).toBe('2 708,34 € HT');
    expect(texte('[data-ligne-repartition="apporteur"] [data-montant-grand]')).toBe('833,33 € HT');
    expect(container.textContent).not.toMatch(/\d,00\D/);
  });
});

describe('🔴 LOT AO — tuile CA sans fenêtre ; la fenêtre « Solde net » : CA − commissions versées = solde, au centime', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; window.localStorage.setItem('trx-affichage-montants', 'ttc'); });
  afterEach(() => { delete ref.uniteCommission; });
  const lc = (id: number, nego: string, cote: 'entree' | 'sortie', ttc: number) => ({ id, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc, montantHt: null, cote,
    nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  // 41 : 12 000 TTC, apporteur 2 400, JB indépendant (1 200 TTC versés), Mylène (MACJ) 40 %, Agence du Parc 20 % ; 50 « SANS FRAIS » : 6 000 TTC, aucune commission.
  const avec: Vente = { ...compromis, lignes: [lc(1, JB.nom, 'entree', 1200)] };
  const sansFrais: Vente = { ...compromis, id: 50, libelle: 'SANS FRAIS', dateCompromis: '2026-10-25', honorairesTtc: 6000, apporteur: null, retroApporteur: null,
    repartition: { retroApporteurTtc: 0, parties: [{ sorte: 'entree', compteId: 4, negociateur: AU.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 100, montantHt: null, statut: 'associe' }] },
    dossier: { ...compromis.dossier!, entree: { id: 4, nom: AU.nom }, sortie: null }, lignes: [] };
  const doc = (sel: string): string => document.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
  const cliquerDoc = async (sel: string) => { await act(async () => { (document.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const centimes = (t: string): number => Math.round(Number(t.replace(/[^\d,-]/g, '').replace(',', '.')) * 100);
  const grand = (sel: string): number => centimes(document.querySelector(sel)!.children[0].textContent!);
  const fermer = async () => { await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); }); await calmer(); };
  const onglet = async (liste: Vente[] = [avec, sansFrais]) => { listeCompromis = liste; await ouvrir(); await cliquer('[data-vue="compromis"]'); };

  it('la tuile « Chiffre d’affaires » : le titre et le total, plus de « Voir le détail », pas cliquable ; la tuile « Solde net » : titre, total, « Voir le détail », cliquable', async () => {
    await onglet();
    const ca = container.querySelector('[data-tuile="ca"]')!;
    expect(ca.tagName).toBe('DIV');
    expect(ca.getAttribute('aria-haspopup')).toBeNull();
    expect([...ca.children].map((x) => x.textContent!.replace(/\s/g, ' '))).toEqual(['Chiffre d’affaires', '18 000 € TTC(15 000 € HT)']);
    await act(async () => { (ca as HTMLElement).click(); }); await calmer();
    expect(document.querySelector('[data-fenetre-ca], [data-fenetre-solde]')).toBeNull();
    const solde = container.querySelector('[data-tuile="solde"]')!;
    expect(solde.tagName).toBe('BUTTON');
    expect([...solde.children].map((x) => x.textContent!.replace(/\s/g, ' '))).toEqual(['Solde net', '8 640 € TTC(7 200 € HT)', 'Voir le détail']);
    expect(container.querySelector('[data-solde-explication]')).toBeNull();
    await cliquer('[data-tuile="solde"]');
    expect(doc('[data-fenetre-solde] h2')).toBe('Solde net — CRITERIMMO — compromis en cours');
    expect(document.querySelector('[data-fenetre-solde] [data-fenetre-total-haut]')!.className).toContain('trx-vert');
    expect(doc('[data-fenetre-solde] [data-dossiers]')).toBe('2 dossiers');
    expect(doc('[data-fenetre-solde] [data-solde-explication]')).toBe('CA TTC − commissions versées TTC');
  });

  it('par catégorie : le CA (= tuile, dont ventes portées / reçu), − chaque catégorie (= fenêtre « Commissions versées »), = Solde net (= tuile) ; une catégorie vide : « Aucun » ; les internes à part', async () => {
    await onglet();
    await cliquer('[data-tuile="commissions"]');
    const sousTotauxCommissions = [...document.querySelectorAll('[data-fenetre-commissions] [data-sous-total]')].filter((x) => !x.closest('.trx-fc-section--info'))
      .map((x) => [x.getAttribute('data-sous-total'), x.textContent!.replace(/\s/g, ' ')]);
    await fermer();
    await cliquer('[data-tuile="solde"]');
    expect([...document.querySelectorAll('[data-fenetre-solde] [data-categorie-solde]')].map((x) => x.getAttribute('data-categorie-solde'))).toEqual(['independants', 'inter-cabinet-macj', 'apporteurs', 'exterieur']);
    expect(doc('[data-solde-dont="portee-criterimmo"]')).toBe('dont ventes portées18 000 € TTC(15 000 € HT)');
    expect(doc('[data-categorie-solde="apporteurs"] h3')).toBe('− Apporteurs d’affaires');
    expect(document.querySelector('[data-sous-total-solde="apporteurs"]')!.className).toContain('trx-rouge');
    // les sous-totaux non vides : les mêmes qu'en « Commissions versées », au centime
    const sousTotauxSolde = [...document.querySelectorAll('[data-fenetre-solde] [data-sous-total-solde]')].map((x) => [x.getAttribute('data-sous-total-solde'), x.textContent!.replace(/\s/g, ' ')]);
    expect(sousTotauxSolde).toEqual(sousTotauxCommissions.filter(([, t]) => centimes(t!) !== 0));
    expect(doc('[data-categorie-solde="independants"] [data-ligne-solde]')).toBe('Jean-Baptiste PONS · DUPONT / MARTIN1 200 € TTC(1 000 € HT)');
    expect(doc('[data-info-solde="internes"] h3')).toBe('Internes (associés, salariés) — non déduits');
    expect(doc('[data-fenetre-solde] [data-detail="autre-societe"]')).toBe('Négociateurs de l’autre société : rémunérés par elle — non comptés ici');
    expect(doc('[data-total-solde]')).toBe('= Solde net de CRITERIMMO8 640 € TTC(7 200 € HT)');
    await fermer();
    // une catégorie vide : « Aucun » à 0 (SANS FRAIS seule : aucune commission)
    act(() => { root.unmount(); }); root = createRoot(container);
    await onglet([sansFrais]);
    await cliquer('[data-tuile="solde"]');
    expect(doc('[data-aucun-solde="apporteurs"]')).toBe('Aucun0 €');
    expect(doc('[data-total-solde]')).toBe('= Solde net de CRITERIMMO6 000 € TTC(5 000 € HT)');
  });

  it('égalités au centime, dans les deux modes et les deux unités : CA (fenêtre) = tuile CA ; CA − sous-totaux = solde = tuile Solde net', async () => {
    await onglet();
    await cliquer('[data-tuile="solde"]');
    for (const u of ['ttc', 'ht'] as const) {
      await cliquer(`[data-afficher="${u}"]`);
      for (const m of ['categorie', 'transaction'] as const) {
        await cliquerDoc(`[data-fenetre-solde] [data-mode-fenetre="${m}"]`);
        const solde = grand('[data-fenetre-solde] [data-fenetre-total]');
        expect(solde).toBe(centimes(texte(`[data-tuile="solde"] [data-solde-${u}]`)));
        if (m === 'categorie') {
          const ca = grand('[data-ca-solde]');
          expect(ca).toBe(centimes(texte(`[data-tuile="ca"] [data-ca-${u}]`)));
          const sous = [...document.querySelectorAll('[data-fenetre-solde] [data-sous-total-solde]')].reduce((t, x) => t + centimes(x.children[0].textContent!), 0);
          expect(ca - sous).toBe(solde);
        } else {
          const blocs = [...document.querySelectorAll('[data-fenetre-solde] [data-solde-affaire]')].reduce((t, x) => t + centimes(x.children[0].textContent!), 0);
          expect(blocs).toBe(solde);
        }
      }
    }
  });

  it('par transaction : toutes les affaires du CA, la plus récente d’abord ; CA, commissions étiquetées en rouge, « = Solde net de l’affaire » ; sans commission, solde = CA ; le nom ferme et déplie', async () => {
    await onglet();
    await cliquer('[data-tuile="solde"]');
    await cliquerDoc('[data-fenetre-solde] [data-mode-fenetre="transaction"]');
    expect(window.localStorage.getItem('trx-solde-net-mode')).toBe('transaction');
    expect([...document.querySelectorAll('[data-fenetre-solde] [data-affaire-solde]')].map((x) => x.getAttribute('data-affaire-solde'))).toEqual(['50', '41']);
    expect([doc('[data-ca-affaire-solde="50"]'), doc('[data-solde-affaire="50"]')]).toEqual(['CA de CRITERIMMO sur cette affaire6 000 € TTC(5 000 € HT)', '6 000 € TTC(5 000 € HT)']);
    expect(document.querySelectorAll('[data-affaire-solde="50"] [data-ligne-solde]').length).toBe(0);
    expect([...document.querySelectorAll('[data-affaire-solde="41"] [data-ligne-solde] [data-etiquette]')].map((x) => x.textContent)).toEqual(['Indépendant', 'Inter-cabinet', 'Apporteur', 'Agence extérieure']);
    expect(document.querySelector('[data-affaire-solde="41"] [data-etiquette]')!.className).toContain('trx-rouge');
    expect(doc('[data-solde-affaire="41"]')).toBe('2 640 € TTC(2 200 € HT)');
    await cliquerDoc('[data-fenetre-solde] [data-aller-affaire="41"]');
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); await calmer();
    expect(document.querySelector('[data-fenetre-solde]')).toBeNull();
    expect(container.querySelector('[data-deplier="compromis-41"]')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('MACJ : la ligne miroir — le CA « dont reçu en inter-cabinet de CRITERIMMO », son indépendant déduit ; inter-cabinet dans l’autre sens', async () => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    const m = venteDansSociete({ ...avec, lignes: [lc(2, MY.nom, 'sortie', 960)] }, 'macj')!;
    listeCompromis = [m];
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
    await cliquer('[data-vue="compromis"]');
    await cliquer('[data-tuile="solde"]');
    expect(doc('[data-solde-dont="recu-criterimmo"]')).toBe('dont reçu en inter-cabinet de CRITERIMMO3 840 € TTC(3 200 € HT)');
    expect(doc('[data-sous-total-solde="independants"]')).toBe('960 € TTC(800 € HT)');
    expect(doc('[data-aucun-solde="inter-cabinet-criterimmo"]')).toBe('Aucun0 €');
    expect(doc('[data-total-solde]')).toBe('= Solde net de MACJ2 880 € TTC(2 400 € HT)');
    expect(grand('[data-fenetre-solde] [data-fenetre-total]')).toBe(centimes(texte('[data-solde-ttc]')));
  });

  it('le CA global : les ventes portées par chaque société, le CA de chacune (part reçue comprise), l’inter-cabinet neutralisé à part', async () => {
    listeCompromis = [avec];
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
    await cliquer('[data-vue="compromis"]');
    await cliquer('[data-tuile="solde"]');
    expect(doc('[data-fenetre-solde] h2')).toBe('Solde net — CRITERIMMO et MACJ — compromis en cours');
    expect([...document.querySelectorAll('[data-fenetre-solde] [data-categorie-solde]')].map((x) => x.getAttribute('data-categorie-solde'))).toEqual(['independants', 'apporteurs', 'exterieur']);
    expect(doc('[data-solde-dont="portee-criterimmo"]')).toBe('dont ventes portées par CRITERIMMO12 000 € TTC(10 000 € HT)');
    expect(doc('[data-ca-societe="macj"]')).toBe('CA MACJ : 3 840 € TTC (3 200 € HT)');
    expect(doc('[data-info-solde="neutralise"] .trx-fc-tete .trx-fc-montant')).toBe('3 840 € TTC(3 200 € HT)');
    expect(grand('[data-fenetre-solde] [data-fenetre-total]')).toBe(centimes(texte('[data-solde-ttc]')));
  });
});

describe('🔴 LOT AP — la trame des lignes de SOMME (présentation seule)', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; window.localStorage.setItem('trx-affichage-montants', 'ttc'); });
  afterEach(() => { delete ref.uniteCommission; });
  const avec: Vente = { ...compromis, lignes: [{ id: 1, negociateur: JB.nom, role: 'negociateur', montantTtc: 1200, montantHt: 1000, cote: 'entree', nature: 'compromis', compte: false,
    origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null }] };
  const fermer = async () => { await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); }); await calmer(); };
  const cliquerDoc = async (sel: string) => { await act(async () => { (document.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const trame = (sel: string): string[] => [...document.querySelectorAll(sel)].map((x) => (x.classList.contains('trx-somme--finale') ? 'finale' : x.classList.contains('trx-somme') ? 'somme' : 'detail'));

  it('« Solde net » et « Commissions versées », dans les deux modes : sous-totaux sur la trame, total final plus marqué, détails sans trame', async () => {
    listeCompromis = [avec]; await ouvrir(); await cliquer('[data-vue="compromis"]');
    await cliquer('[data-tuile="solde"]');
    expect(trame('[data-solde-ca] .trx-fc-tete, [data-categorie-solde] .trx-fc-tete')).toEqual(['somme', 'somme', 'somme', 'somme', 'somme']);
    expect(trame('[data-total-solde], [data-fenetre-solde] [data-pied-fenetre]')).toEqual(['finale', 'finale']);
    expect(trame('[data-fenetre-solde] [data-ligne-solde]').every((x) => x === 'detail')).toBe(true);
    await cliquerDoc('[data-fenetre-solde] [data-mode-fenetre="transaction"]');
    expect(trame('[data-affaire-solde] .trx-fc-sous-total')).toEqual(['somme']);
    expect(trame('[data-fenetre-solde] [data-ca-affaire-solde]')).toEqual(['detail']);
    await fermer();
    await cliquer('[data-tuile="commissions"]');
    expect(trame('[data-fenetre-commissions] [data-categorie]:not(.trx-fc-section--info) > .trx-fc-tete')).toEqual(['somme', 'somme', 'somme', 'somme']);
    expect(trame('[data-fenetre-commissions] [data-pied-fenetre]')).toEqual(['finale']);
    await cliquerDoc('[data-fenetre-commissions] [data-mode-fenetre="transaction"]');
    expect(trame('[data-fenetre-commissions] [data-affaire] .trx-fc-sous-total')).toEqual(['somme']);
    expect(trame('[data-fenetre-commissions] [data-ligne-cout]').every((x) => x === 'detail')).toBe(true);
  });

  it('le tableau « Répartition » : la commission de la vente, la base et le reste sur la trame ; les parties et parts non', async () => {
    listeCompromis = [avec]; await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(41);
    const lignes = [...container.querySelectorAll('[data-repartition-compromis] [data-ligne-repartition]')].map((x) => [x.getAttribute('data-ligne-repartition'), x.classList.contains('trx-somme-ligne')]);
    expect(lignes.filter(([, t]) => t).map(([c]) => c)).toEqual(['commission', 'base', 'reste']);
    const { CSS_TRANSACTION } = await import('./commun');
    const css = CSS_TRANSACTION.replace(/\s+/g, ' ');
    for (const r of [".svv-adm-root{--trx-trame:#f3f5f7;--trx-trame-finale:#e9edf1;", ".svv-adm-root[data-theme='dark']{--trx-trame:#263140;--trx-trame-finale:#283445;",
      'tr.trx-somme-ligne > th,tr.trx-somme-ligne > td{background:var(--trx-trame)}', '.trx-somme--finale{background:var(--trx-trame-finale)']) expect(css).toContain(r);
  });
});

describe('🔴 LOT AQ — « Ce que l’on doit — compromis non encore signés »', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => {
    ref.uniteCommission = true; window.localStorage.setItem('trx-affichage-montants', 'ttc');
    for (const c of ['negociateurs', 'apporteurs', 'agences', 'inter-cabinet']) window.localStorage.removeItem(`trx-du-section-${c}`);
  });
  afterEach(() => { delete ref.uniteCommission; });
  const lc = (id: number, nego: string, cote: 'entree' | 'sortie', ttc: number) => ({ id, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc, montantHt: null, cote,
    nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  // 41 (20/10) : JB indépendant 1 200 TTC, Mylène (MACJ) 40 % → 3 840 reversés, Agence du Parc 20 %, apporteur 2 400 ; 42 (12/08, mois précédent) : JB 600 TTC.
  // 60 : portée par MACJ (Mylène à l'entrée), JB à la sortie → CRITERIMMO reçoit 50 % de 5 000 HT.
  const v41: Vente = { ...compromis, lignes: [lc(1, JB.nom, 'entree', 1200)] };
  const v42: Vente = { ...compromis, id: 42, libelle: 'ANCIEN', dateCompromis: '2026-08-12', honorairesTtc: 6000, apporteur: null, retroApporteur: null,
    repartition: { retroApporteurTtc: 0, parties: [{ sorte: 'entree', compteId: 5, negociateur: JB.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 100, montantHt: null, statut: 'independant' }] },
    lignes: [lc(2, JB.nom, 'entree', 600)] };
  const v60: Vente = { ...compromis, id: 60, libelle: 'PORTÉE PAR MACJ', societe: 'macj', dateCompromis: null, honorairesTtc: 6000, apporteur: null, retroApporteur: null,
    repartition: { retroApporteurTtc: 0, parties: [{ sorte: 'entree', compteId: 7, negociateur: MY.nom, societe: 'macj', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' },
      { sorte: 'sortie', compteId: 5, negociateur: JB.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' }] }, lignes: [] };
  const doc = (sel: string): string => container.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
  const page = async (societe: 'criterimmo' | 'macj') => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    listeCompromis = [v41, v42, v60].map((x) => venteDansSociete(x, societe)).filter((x): x is Vente => x !== null);
    act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(createElement(EcranSociete, { societe })); }); await calmer();
    await cliquer('[data-vue="compromis"]');
    await cliquer('[data-ouvrir-du]'); // LOT AV — la synthèse est fermée à l'arrivée
  };

  it('sous la liste, au-dessus de « Compromis annulés » : titre, « N dossiers », quatre sections ouvertes', async () => {
    await page('criterimmo');
    const bloc = container.querySelector('[data-bloc-du="criterimmo"]')!;
    expect(bloc.compareDocumentPosition(container.querySelector('[data-liste-compromis]')!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    // LOT AR — le titre d'une section (niveau de « Compromis en cours ») ; le périmètre dessous
    expect(doc('#trx-du-titre')).toBe('Synthèse — ce que l’on doit et à qui');
    expect(doc('[data-sous-titre-du]')).toBe('Compromis non encore signés, quel que soit leur mois');
    expect(doc('[data-dossiers-du-bloc]')).toBe('3 dossiers');
    expect([...container.querySelectorAll('[data-section-du]')].map((x) => x.getAttribute('data-section-du'))).toEqual(['negociateurs', 'inter-cabinet', 'apporteurs', 'agences']); // LOT AS — l'ordre
    expect([...container.querySelectorAll('[data-replier-du]')].every((x) => x.getAttribute('aria-expanded') === 'true')).toBe(true);
  });

  it('négociateurs : JB cumule ses deux compromis (dont ce mois), indépendant comptabilisé ; dépliée, la liste de ses affaires ; l’autre société rappelée', async () => {
    await page('criterimmo');
    const jb = `[data-ligne-du="negociateur-independants|${JB.nom}"]`;
    expect(doc(`${jb} [data-cumul-du]`)).toBe('1 800 € TTC(1 500 € HT)');
    expect(doc(`${jb} [data-dossiers-du]`)).toBe('2 dossiers');
    expect(doc(`${jb} [data-mention-du]`)).toBe('Indépendant — comptabilisé dans « Commissions versées »');
    expect(doc(`${jb} [data-dont-mois]`)).toBe('dont ce mois : 1 200 € TTC');
    // LOT AR — les dossiers sont visibles sans clic (plus de flèche par intervenant)
    expect(container.querySelector('[data-deplier-du]')).toBeNull();
    expect([...container.querySelectorAll(`${jb} [data-aller-affaire-du]`)].map((x) => x.textContent)).toEqual(['DUPONT / MARTIN', 'ANCIEN']);
    expect(doc('[data-autre-societe-du]')).toBe('Négociateurs de MACJ : rémunérés par MACJ — non comptés ici');
    await cliquer(`${jb} [data-aller-affaire-du="41"]`);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); await calmer();
    expect(container.querySelector('[data-deplier="compromis-41"]')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('apporteurs, agences, inter-cabinet (reversé, reçu, solde) ; Total à verser = tuile « Commissions versées » au centime, en TTC et en HT', async () => {
    await page('criterimmo');
    expect(doc('[data-ligne-du="apporteur-apporteurs|Julien Deblois"] [data-cumul-du]')).toBe('2 400 € TTC(2 000 € HT)');
    expect(doc('[data-ligne-du="agence-exterieur|Agence du Parc"] [data-cumul-du]')).toBe('1 920 € TTC(1 600 € HT)');
    expect(doc('[data-ligne-du="reverse"] [data-cumul-du]')).toBe('3 840 € TTC(3 200 € HT)');
    expect(doc('[data-ligne-du="recu"] [data-cumul-du]')).toBe('3 000 € TTC(2 500 € HT)');
    expect(doc('[data-ligne-du="recu"] [data-dont-sans-date]')).toBe('dont date à renseigner : 3 000 € TTC');
    expect(doc('[data-solde-inter]')).toBe('= Solde inter-cabinetCRITERIMMO doit 840 € TTC à MACJ');
    for (const u of ['ttc', 'ht'] as const) {
      await cliquer(`[data-afficher="${u}"]`);
      expect(texte('[data-total-a-verser] [data-montant-grand]').replace(' versées', '')).toBe(texte(`[data-tuile="commissions"] [data-commissions-${u}]`));
    }
    expect(doc('[data-internes-du]')).toBe('Commissions internes (non déduites) : 0 € HT');
  });

  it('MACJ : le même solde, vu dans l’autre sens', async () => {
    await page('macj');
    expect(doc('[data-solde-inter]')).toBe('= Solde inter-cabinetCRITERIMMO doit 840 € TTC à MACJ');
    expect(doc('[data-ligne-du="reverse"] [data-cumul-du]')).toBe('3 000 € TTC(2 500 € HT)');
    expect(doc('[data-ligne-du="recu"] [data-cumul-du]')).toBe('3 840 € TTC(3 200 € HT)');
  });

  it('une section se replie ; LOT AV : le repli n’est plus retenu — à la visite suivante, la synthèse ouverte montre tout', async () => {
    await page('criterimmo');
    await cliquer('[data-replier-du="apporteurs"]');
    expect(container.querySelector('[data-section-du="apporteurs"] .trx-du-corps')).toBeNull();
    expect(window.localStorage.getItem('trx-du-section-apporteurs')).toBeNull();
    await page('criterimmo');
    expect(container.querySelector('[data-replier-du="apporteurs"]')!.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('🔴 LOT AS — la synthèse : l’ordre des catégories, chacune une carte à part (présentation seule)', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => {
    ref.uniteCommission = true; window.localStorage.setItem('trx-affichage-montants', 'ttc');
    for (const c of ['negociateurs', 'apporteurs', 'agences', 'inter-cabinet']) window.localStorage.removeItem(`trx-du-section-${c}`);
  });
  afterEach(() => { delete ref.uniteCommission; });
  const lc = (id: number, nego: string, cote: 'entree' | 'sortie', ttc: number) => ({ id, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc, montantHt: null, cote,
    nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  // les mêmes affaires qu'au lot AQ : 41 (JB, apporteur, agence, Mylène de MACJ), 42 (JB, mois précédent), 60 (portée par MACJ, JB à la sortie)
  const v41: Vente = { ...compromis, lignes: [lc(1, JB.nom, 'entree', 1200)] };
  const v42: Vente = { ...compromis, id: 42, libelle: 'ANCIEN', dateCompromis: '2026-08-12', honorairesTtc: 6000, apporteur: null, retroApporteur: null,
    repartition: { retroApporteurTtc: 0, parties: [{ sorte: 'entree', compteId: 5, negociateur: JB.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 100, montantHt: null, statut: 'independant' }] },
    lignes: [lc(2, JB.nom, 'entree', 600)] };
  const v60: Vente = { ...compromis, id: 60, libelle: 'PORTÉE PAR MACJ', societe: 'macj', dateCompromis: null, honorairesTtc: 6000, apporteur: null, retroApporteur: null,
    repartition: { retroApporteurTtc: 0, parties: [{ sorte: 'entree', compteId: 7, negociateur: MY.nom, societe: 'macj', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' },
      { sorte: 'sortie', compteId: 5, negociateur: JB.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' }] }, lignes: [] };
  const page = async (societe: 'criterimmo' | 'macj') => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    listeCompromis = [v41, v42, v60].map((x) => venteDansSociete(x, societe)).filter((x): x is Vente => x !== null);
    act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(createElement(EcranSociete, { societe })); }); await calmer();
    await cliquer('[data-vue="compromis"]');
    await cliquer('[data-ouvrir-du]'); // LOT AV — la synthèse est fermée à l'arrivée
  };
  const centimes = (t: string): number => Math.round(Number(t.replace(/[^\d,-]/g, '').replace(',', '.')) * 100);
  const grand = (sel: string): number => centimes(container.querySelector(`${sel} [data-montant-grand]`)!.textContent!);

  it('l’ordre : Négociateurs, Inter-cabinet (avec « = Solde inter-cabinet »), Apporteurs d’affaires, Agences extérieures ; puis Total à verser et internes — CRITERIMMO et MACJ', async () => {
    for (const societe of ['criterimmo', 'macj'] as const) {
      await page(societe);
      const autre = societe === 'criterimmo' ? 'MACJ' : 'CRITERIMMO';
      const cartes = [...container.querySelectorAll('[data-cartes-du] > [data-section-du]')];
      expect(cartes.map((x) => x.getAttribute('data-section-du'))).toEqual(['negociateurs', 'inter-cabinet', 'apporteurs', 'agences']);
      expect(cartes.map((x) => x.querySelector('.trx-du-titre strong')!.textContent)).toEqual(['Négociateurs', `Inter-cabinet ${societe.toUpperCase()} ↔ ${autre}`, 'Apporteurs d’affaires', 'Agences extérieures']);
      expect(cartes[1].querySelector('[data-solde-inter]')).not.toBeNull();
      // chaque carte : l'en-tête de catégorie (sur la trame) en tête, puis son corps
      for (const c of cartes) expect(c.firstElementChild!.matches('.trx-du-tete.trx-somme')).toBe(true);
      // « Négociateurs de [autre société] … » reste dans la carte des négociateurs
      expect(cartes[0].querySelector('[data-autre-societe-du]')).not.toBeNull();
      // Total à verser et internes, après les quatre cartes, hors d'elles
      const bloc = container.querySelector('[data-bloc-du]')!;
      const ordre = [...bloc.querySelectorAll('[data-cartes-du], [data-total-du], [data-internes-du]')].map((x) => x.hasAttribute('data-cartes-du') ? 'cartes' : x.hasAttribute('data-total-du') ? 'total' : 'internes');
      expect(ordre).toEqual(['cartes', 'total', 'internes']);
    }
  });

  it('totaux inchangés au centime, en TTC et en HT : Total à verser = tuile = négociateurs comptabilisés + reversé + apporteurs + agences — CRITERIMMO et MACJ', async () => {
    for (const societe of ['criterimmo', 'macj'] as const) {
      await page(societe);
      for (const u of ['ttc', 'ht'] as const) {
        await cliquer(`[data-afficher="${u}"]`);
        const total = grand('[data-total-a-verser]');
        expect(total).toBe(centimes(texte(`[data-tuile="commissions"] [data-commissions-${u}]`)));
        const parties = grand('[data-sous-total-du="negociateurs"]') + grand('[data-ligne-du="reverse"] [data-cumul-du]') + grand('[data-sous-total-du="apporteurs"]') + grand('[data-sous-total-du="agences"]');
        expect(parties).toBe(total);
      }
    }
    // les valeurs du lot AQ, à l'identique
    await page('criterimmo');
    await cliquer('[data-afficher="ttc"]');
    expect(texte('[data-total-a-verser] [data-montant-grand]')).toBe('9 960 € TTC');
    await cliquer('[data-afficher="ht"]');
    expect(texte('[data-total-a-verser] [data-montant-grand]')).toBe('8 300 € HT');
  });

  it('replier une catégorie replie sa carte entière (l’en-tête reste) ; LOT AV : le choix n’est plus retenu', async () => {
    await page('macj');
    await cliquer('[data-replier-du="inter-cabinet"]');
    const carte = container.querySelector('[data-section-du="inter-cabinet"]')!;
    expect([...carte.children].map((x) => x.className)).toEqual(['trx-du-tete trx-somme']);
    expect(carte.querySelector('[data-solde-inter]')).toBeNull();
    // LOT AV — plus retenu : à la visite suivante, la synthèse ouverte montre toutes ses cartes
    expect(window.localStorage.getItem('trx-du-section-inter-cabinet')).toBeNull();
    await page('criterimmo');
    expect(container.querySelector('[data-replier-du="inter-cabinet"]')!.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[data-replier-du="negociateurs"]')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('la carte : surface, bordure fine, coins arrondis, ombre légère, liseré par catégorie (variables clair / sombre, jamais le rouge) ; titre en gras', async () => {
    const { CSS_BLOC_DU } = await import('./BlocDu');
    const { CSS_TRANSACTION } = await import('./commun');
    const css = CSS_BLOC_DU.replace(/\s+/g, ' ');
    expect(css).toContain('.trx-du-cartes{display:flex;flex-direction:column;gap:16px}');
    expect(css).toContain('border:1px solid var(--color-svv-line);border-left:5px solid var(--trx-du-lisere');
    expect(css).toContain('border-radius:12px; background:var(--color-svv-surface-raised);box-shadow:');
    expect(css).toContain('.trx-du-entete{margin:0;font-size:1rem;font-weight:800}'); // LOT AV : le h3 porte le bouton de la ligne
    for (const c of ['negociateurs', 'inter', 'apporteurs', 'agences']) {
      expect(css).toContain(`var(--trx-lisere-${c})`);
      // défini en clair, en sombre (thème choisi) et en sombre (thème du système)
      expect(CSS_TRANSACTION.match(new RegExp(`--trx-lisere-${c}:#[0-9a-f]{6}`, 'g'))!.length).toBe(3);
    }
    expect(CSS_TRANSACTION).not.toMatch(/--trx-lisere-[a-z]+:var\(--color-svv-red/);
  });
});

describe('🔴 LOT AR — la synthèse : une section à part, les dossiers toujours visibles sous chaque intervenant', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => {
    ref.uniteCommission = true; window.localStorage.setItem('trx-affichage-montants', 'ttc');
    for (const c of ['negociateurs', 'apporteurs', 'agences', 'inter-cabinet']) window.localStorage.removeItem(`trx-du-section-${c}`);
  });
  afterEach(() => { delete ref.uniteCommission; });
  const lc = (id: number, nego: string, cote: 'entree' | 'sortie', ttc: number) => ({ id, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc, montantHt: null, cote,
    nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  const v41: Vente = { ...compromis, lignes: [lc(1, JB.nom, 'entree', 1200)] };
  const v42: Vente = { ...compromis, id: 42, libelle: 'ANCIEN', dateCompromis: '2026-08-12', honorairesTtc: 6000, apporteur: 'Julien Deblois', retroApporteur: { montant: 500, unite: 'ttc' },
    repartition: { retroApporteurTtc: 500, parties: [{ sorte: 'entree', compteId: 5, negociateur: JB.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 100, montantHt: null, statut: 'independant' }] },
    lignes: [lc(2, JB.nom, 'entree', 601)] };
  const centimes = (t: string): number => Math.round(Number(t.replace(/[^\d,-]/g, '').replace(',', '.')) * 100);
  const onglet = async () => { listeCompromis = [v41, v42]; await ouvrir(); await cliquer('[data-vue="compromis"]'); await cliquer('[data-ouvrir-du]'); }; // LOT AV

  it('sans clic, sous chaque intervenant, ses dossiers (lien, montant principal seul, sans parenthèse) ; leur somme = le cumul au centime, en TTC et en HT', async () => {
    await onglet();
    for (const u of ['ttc', 'ht'] as const) {
      await cliquer(`[data-afficher="${u}"]`);
      const lignes = [...container.querySelectorAll('[data-bloc-du] [data-ligne-du]')];
      expect(lignes.length).toBeGreaterThan(3);
      for (const l of lignes) {
        const cumul = l.querySelector('[data-cumul-du] [data-montant-grand]')!.textContent!;
        expect(cumul).toMatch(u === 'ttc' ? /\sTTC$/ : /\sHT$/);
        const dossiers = [...l.querySelectorAll('[data-montant-dossier-du]')].map((x) => x.textContent!);
        expect(dossiers.every((x) => !x.includes('(') && x.endsWith(u === 'ttc' ? 'TTC' : 'HT'))).toBe(true);
        if (dossiers.length > 0) expect(dossiers.reduce((t, x) => t + centimes(x), 0)).toBe(centimes(cumul));
      }
    }
    // JB : 1 200 + 601 = 1 801 TTC ; en HT 1 000 + 500,83 = 1 500,83
    expect(texte(`[data-ligne-du="negociateur-independants|${JB.nom}"] [data-cumul-du] [data-montant-grand]`)).toBe('1 500,83 € HT');
    expect([...container.querySelectorAll(`[data-ligne-du="negociateur-independants|${JB.nom}"] [data-montant-dossier-du]`)].map((x) => x.textContent!.replace(/\s/g, ' '))).toEqual(['1 000 € HT', '500,83 € HT']);
  });

  it('« dont ce mois / date à renseigner » sur la ligne du nombre de dossiers ; le lien d’un dossier déplie sa carte ; une catégorie repliée le reste', async () => {
    await onglet();
    const jb = `[data-ligne-du="negociateur-independants|${JB.nom}"]`;
    expect(texte(`${jb} .trx-du-detail`)).toBe('2 dossiers · dont ce mois : 1 200 € TTC');
    await cliquer(`${jb} [data-aller-affaire-du="42"]`);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); await calmer();
    expect(container.querySelector('[data-deplier="compromis-42"]')!.getAttribute('aria-expanded')).toBe('true');
    await cliquer('[data-replier-du="negociateurs"]');
    expect(container.querySelector(jb)).toBeNull();
    act(() => { root.unmount(); }); root = createRoot(container);
    await onglet();
    expect(container.querySelector('[data-replier-du="negociateurs"]')!.getAttribute('aria-expanded')).toBe('true'); // LOT AV : plus retenu
  });

  it('une section à part : après la liste, avant « Compromis annulés » ; fond propre (variable commune clair / sombre)', async () => {
    await onglet();
    const bloc = container.querySelector('[data-bloc-du]')!;
    expect(bloc.compareDocumentPosition(container.querySelector('[data-liste-compromis]')!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    const { CSS_BLOC_DU } = await import('./BlocDu');
    const { CSS_TRANSACTION } = await import('./commun');
    expect(CSS_BLOC_DU.replace(/\s+/g, ' ')).toContain('margin:48px 0 0;padding:16px 14px 14px;border-top:2px solid var(--color-svv-line-strong);border-radius:0 0 14px 14px;background:var(--trx-fond-synthese)');
    expect(CSS_TRANSACTION).toContain('--trx-fond-synthese:#f6f8fb');
    expect(CSS_TRANSACTION).toContain('--trx-fond-synthese:#161e29');
  });
});

describe('🔴 LOT AT — « Compromis annulés » : dernier bloc de la liste, affiché seulement s’il y en a au moins un (accord d’Arno)', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => {
    ref.uniteCommission = true; window.localStorage.setItem('trx-affichage-montants', 'ttc');
    for (const c of ['negociateurs', 'apporteurs', 'agences', 'inter-cabinet']) window.localStorage.removeItem(`trx-du-section-${c}`);
  });
  afterEach(() => { delete ref.uniteCommission; });
  const lc = (id: number, nego: string, cote: 'entree' | 'sortie', ttc: number) => ({ id, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc, montantHt: null, cote,
    nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  const v41: Vente = { ...compromis, lignes: [lc(1, JB.nom, 'entree', 1200)] };
  const v60: Vente = { ...compromis, id: 60, libelle: 'PORTÉE PAR MACJ', societe: 'macj', dateCompromis: null, honorairesTtc: 6000, apporteur: null, retroApporteur: null,
    repartition: { retroApporteurTtc: 0, parties: [{ sorte: 'entree', compteId: 7, negociateur: MY.nom, societe: 'macj', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' },
      { sorte: 'sortie', compteId: 5, negociateur: JB.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' }] }, lignes: [] };
  // l'annulé de chaque société : un apporteur et une agence à lui, pour vérifier qu'il reste hors de la synthèse
  const annule = (societe: 'criterimmo' | 'macj'): Vente => ({ ...compromis, id: 77, libelle: 'BERNARD / THOMAS', societe, apporteur: 'Apporteur Annulé', statut: 'annulee',
    annulation: { date: '2026-10-20', motif: 'Défaut de crédit', note: null } });
  const page = async (societe: 'criterimmo' | 'macj', annules: Vente[]) => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    listeCompromis = [v41, v60].map((x) => venteDansSociete(x, societe)).filter((x): x is Vente => x !== null);
    listeAnnules = annules;
    act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(createElement(EcranSociete, { societe })); }); await calmer();
    await cliquer('[data-vue="compromis"]');
    await cliquer('[data-ouvrir-du]'); // LOT AV — la synthèse est fermée à l'arrivée
  };
  const bloc = () => container.querySelector('[data-bloc="compromis-annules"]');
  const avant = (a: Element, b: Element): boolean => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  const synthese = () => ({ texte: container.querySelector('[data-bloc-du]')!.textContent!, total: texte('[data-total-a-verser] [data-montant-grand]'),
    tuiles: [texte('[data-nb-compromis]'), texte('[data-tuile="commissions"] [data-commissions-ttc]')] });

  it('0 annulé : aucun bloc, aucun espace ; la synthèse est le dernier bloc de la page — CRITERIMMO et MACJ', async () => {
    for (const societe of ['criterimmo', 'macj'] as const) {
      await page(societe, []);
      expect(bloc()).toBeNull();
      expect(container.querySelector('#trx-compromis-annules')).toBeNull();
      expect(container.querySelector('.trx-espace-annules')).toBeNull();
      const du = container.querySelector('[data-bloc-du]')!;
      expect(du.nextElementSibling).toBeNull();
    }
  });

  it('1 annulé : le bloc, replié, avec son compteur, sous la dernière carte et au-dessus de la synthèse ; hors de la synthèse et des tuiles — CRITERIMMO et MACJ', async () => {
    for (const societe of ['criterimmo', 'macj'] as const) {
      await page(societe, []);
      const sans = synthese();
      await page(societe, [annule(societe)]);
      const b = bloc()!;
      expect(texte('#trx-compromis-annules .tdb-replie-mot')).toBe('Compromis annulés (1)');
      expect(container.querySelector('[data-deplier="compromis-annules"]')!.getAttribute('aria-expanded')).toBe('false');
      // place : après la liste (et son espace de deux cartes), avant la synthèse
      const liste = container.querySelector('[data-liste-compromis]')!;
      const espace = container.querySelector('.trx-espace-annules')!;
      expect(liste.nextElementSibling).toBe(espace);
      expect(espace.nextElementSibling).toBe(b);
      expect(avant(b, container.querySelector('[data-bloc-du]')!)).toBe(true);
      // l'annulé n'entre ni dans la synthèse ni dans les tuiles
      expect(synthese()).toEqual(sans);
      expect(container.querySelector('[data-bloc-du] [data-aller-affaire-du="77"]')).toBeNull();
      expect(container.querySelector('[data-bloc-du]')!.textContent).not.toContain('Apporteur Annulé');
    }
  });

  it('annuler fait apparaître le bloc ; rétablir le dernier le fait disparaître', async () => {
    await page('criterimmo', []);
    expect(bloc()).toBeNull();
    await deplier(41); await cliquer('[data-annulation-compromis="41"]');
    // le serveur (simulé) : 41 passe dans les annulés
    listeCompromis = [v60].map((x) => x); listeAnnules = [{ ...v41, statut: 'annulee', annulation: { date: '2026-10-27', motif: 'Défaut de crédit', note: null } }];
    await act(async () => { (document.querySelector('[data-confirmer-annulation]') as HTMLElement).click(); }); await calmer();
    expect(posts.at(-1)).toMatchObject({ action: 'compromis-annuler', id: 41 });
    expect(texte('#trx-compromis-annules .tdb-replie-mot')).toBe('Compromis annulés (1)');
    expect(avant(bloc()!, container.querySelector('[data-bloc-du]')!)).toBe(true);
    await cliquer('[data-deplier="compromis-annules"]');
    listeCompromis = [v41, v60]; listeAnnules = [];
    await cliquer('[data-retablir-compromis="41"]');
    expect(posts.at(-1)).toEqual({ action: 'compromis-retablir', id: 41 });
    expect(bloc()).toBeNull();
    expect(container.querySelector('[data-compromis="41"]')).not.toBeNull();
  });
});

describe('🔴 LOT AU — « Total à verser par … » : le nom de la société de l’écran', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; window.localStorage.setItem('trx-affichage-montants', 'ttc'); });
  afterEach(() => { delete ref.uniteCommission; });
  const rendre = async (el: ReturnType<typeof createElement>) => {
    act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(el); }); await calmer();
    await cliquer('[data-vue="compromis"]');
    await cliquer('[data-ouvrir-du]'); // LOT AV — la synthèse est fermée à l'arrivée
  };
  it('CRITERIMMO, MACJ et le CA global ; le montant ne change pas', async () => {
    const { LIBELLE_SOCIETE } = await import('../../../../lib/transaction/modele');
    for (const societe of ['criterimmo', 'macj'] as const) {
      await rendre(createElement(EcranSociete, { societe }));
      expect(texte('[data-libelle-total-du]')).toBe(`Total à verser par ${LIBELLE_SOCIETE[societe]}`);
      expect(texte('[data-total-a-verser] [data-montant-grand]').replace(' versées', '')).toBe(texte('[data-tuile="commissions"] [data-commissions-ttc]'));
    }
    await rendre(createElement(EcranGlobal));
    expect(texte('[data-libelle-total-du]')).toBe('Total à verser par CRITERIMMO et MACJ');
    expect(container.querySelector('[data-total-du]')!.textContent).not.toContain('—');
  });
});

describe('🔴 LOT AV — la synthèse fermée à l’arrivée, sur une ligne ; un clic ouvre tout, un clic referme (accord d’Arno)', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; window.localStorage.setItem('trx-affichage-montants', 'ttc'); });
  afterEach(() => { delete ref.uniteCommission; });
  const lc = (id: number, nego: string, cote: 'entree' | 'sortie', ttc: number) => ({ id, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc, montantHt: null, cote,
    nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  const v41: Vente = { ...compromis, lignes: [lc(1, JB.nom, 'entree', 1200)] };
  const v60: Vente = { ...compromis, id: 60, libelle: 'PORTÉE PAR MACJ', societe: 'macj', dateCompromis: null, honorairesTtc: 6000, apporteur: null, retroApporteur: null,
    repartition: { retroApporteurTtc: 0, parties: [{ sorte: 'entree', compteId: 7, negociateur: MY.nom, societe: 'macj', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' },
      { sorte: 'sortie', compteId: 5, negociateur: JB.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' }] }, lignes: [] };
  const page = async (societe: 'criterimmo' | 'macj') => {
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    listeCompromis = [v41, v60].map((x) => venteDansSociete(x, societe)).filter((x): x is Vente => x !== null);
    act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(createElement(EcranSociete, { societe })); }); await calmer();
    await cliquer('[data-vue="compromis"]');
  };
  const bouton = () => container.querySelector('[data-ouvrir-du]') as HTMLButtonElement;
  const ouvertes = () => [...container.querySelectorAll('[data-replier-du]')].map((x) => x.getAttribute('aria-expanded'));

  it('fermé à l’arrivée, une seule ligne : la flèche et le titre ; « N dossiers » et « Total à verser par … » = tuile, en TTC et en HT — CRITERIMMO et MACJ', async () => {
    const { LIBELLE_SOCIETE } = await import('../../../../lib/transaction/modele');
    for (const societe of ['criterimmo', 'macj'] as const) {
      await page(societe);
      const b = bouton();
      expect([b.tagName, b.type, b.getAttribute('aria-expanded'), b.closest('h3') !== null]).toEqual(['BUTTON', 'button', 'false', true]);
      expect(b.querySelector('#trx-du-titre')!.textContent).toBe('Synthèse — ce que l’on doit et à qui');
      expect(b.querySelector('.trx-du-chevron')!.textContent).toBe('▸');
      expect(b.querySelector('[data-dossiers-du-bloc]')!.textContent).toMatch(/^\d+ dossiers?$/);
      expect(b.querySelector('.trx-du-mot-total')!.textContent).toBe(`Total à verser par ${LIBELLE_SOCIETE[societe]}`);
      // fermé : rien d'autre que la ligne
      expect(container.querySelector('[data-cartes-du]')).toBeNull();
      expect(container.querySelector('[data-total-du]')).toBeNull();
      expect(container.querySelector('[data-bloc-du]')!.children.length).toBe(2); // le style et la ligne
      for (const u of ['ttc', 'ht'] as const) {
        await cliquer(`[data-afficher="${u}"]`);
        const grand = b.querySelector('[data-total-entete-du] [data-montant-grand]')!;
        expect(texte('[data-total-entete-du] [data-montant-grand]').replace(' versées', '')).toBe(texte(`[data-tuile="commissions"] [data-commissions-${u}]`));
        expect(grand.className).toContain('trx-rouge');
        expect(b.querySelector('[data-total-entete-du] [data-montant-petit]')!.textContent).toMatch(u === 'ttc' ? /HT\)$/ : /TTC\)$/);
      }
      expect(bouton().getAttribute('aria-expanded')).toBe('false');
    }
  });

  it('un clic ouvre TOUT (les 4 cartes ouvertes, même repliées à l’ouverture précédente) ; un clic referme ; le choix n’est pas retenu — CRITERIMMO et MACJ', async () => {
    for (const societe of ['criterimmo', 'macj'] as const) {
      await page(societe);
      await cliquer('[data-ouvrir-du]');
      expect(bouton().getAttribute('aria-expanded')).toBe('true');
      expect(bouton().querySelector('.trx-du-chevron')!.textContent).toBe('▾');
      expect(ouvertes()).toEqual(['true', 'true', 'true', 'true']);
      for (const sel of ['[data-solde-inter]', '[data-total-du]', '[data-internes-du]', '[data-affaires-du]', '[data-sous-titre-du]']) expect(container.querySelector(sel)).not.toBeNull();
      // le total du bas et celui de la ligne : le même montant
      expect(texte('[data-total-a-verser] [data-montant-grand]')).toBe(texte('[data-total-entete-du] [data-montant-grand]'));
      // une catégorie repliée, puis le bloc refermé et rouvert : tout est ouvert
      await cliquer('[data-replier-du="apporteurs"]');
      expect(ouvertes()).toEqual(['true', 'true', 'false', 'true']);
      await cliquer('[data-ouvrir-du]');
      expect(bouton().getAttribute('aria-expanded')).toBe('false');
      expect(container.querySelector('[data-cartes-du]')).toBeNull();
      await cliquer('[data-ouvrir-du]');
      expect(ouvertes()).toEqual(['true', 'true', 'true', 'true']);
      // visite suivante : fermé
      await page(societe);
      expect(bouton().getAttribute('aria-expanded')).toBe('false');
      expect(Object.keys(window.localStorage).filter((k) => k.startsWith('trx-du'))).toEqual([]);
    }
  });

  it('clavier : un vrai bouton, atteignable au clavier (Entrée et Espace le déclenchent), le focus visible', async () => {
    await page('criterimmo');
    const b = bouton();
    b.focus();
    expect(document.activeElement).toBe(b);
    expect(b.tabIndex).toBe(0);
    // Entrée / Espace sur un <button> produisent son clic (navigateur) : le geste est le même
    await act(async () => { b.click(); }); await calmer();
    expect(bouton().getAttribute('aria-expanded')).toBe('true');
    expect(bouton().getAttribute('aria-controls')).toBe('trx-du-contenu');
    expect(container.querySelector('#trx-du-contenu')).not.toBeNull();
    const { CSS_BLOC_DU } = await import('./BlocDu');
    expect(CSS_BLOC_DU).toContain('.trx-du-bascule:focus-visible{outline:2px solid var(--color-svv-red)');
  });
});

describe('🔴 LOT AW — téléphone : la ligne fermée en deux lignes, titre court et montant principal seul (accord d’Arno, cette ligne seulement)', () => {
  it('le titre court est dans la ligne à côté du complet ; au téléphone seulement : titre complet et petit montant de la ligne fermée retirés, rien d’autre', async () => {
    const { CSS_BLOC_DU } = await import('./BlocDu');
    const css = CSS_BLOC_DU.replace(/\s+/g, ' ');
    // ordinateur : le titre court n'est pas affiché
    expect(css).toContain('.trx-du-titre-court{display:none}');
    const tel = css.slice(css.indexOf('@media (max-width:560px)'));
    expect(tel).toContain('.trx-du-titre-long{display:none}');
    expect(tel).toContain('.trx-du-titre-court{display:inline}');
    // le petit montant : retiré seulement dans la ligne fermée (.trx-du-total-entete), jamais dans le bloc ouvert
    expect(tel).toContain('.trx-du-total-entete [data-montant-petit]{display:none}');
    expect(css.match(/\[data-montant-petit\]\{display:none\}/g)!.length).toBe(1);
    expect(css.match(/display:none/g)!.length).toBe(3);
  });
  it('la ligne porte les deux titres, le nombre de dossiers et le total (grand et petit) — CRITERIMMO et MACJ', async () => {
    for (const societe of ['criterimmo', 'macj'] as const) {
      listeCompromis = [compromis];
      act(() => { root.unmount(); }); root = createRoot(container);
      await act(async () => { root.render(createElement(EcranSociete, { societe })); }); await calmer();
      await cliquer('[data-vue="compromis"]');
      const b = container.querySelector('[data-ouvrir-du]')!;
      expect(b.querySelector('#trx-du-titre')!.textContent).toBe('Synthèse — ce que l’on doit et à qui');
      expect(b.querySelector('[data-titre-court-du]')!.textContent).toBe('Ce que l’on doit');
      expect(b.querySelector('[data-dossiers-du-bloc]')).not.toBeNull();
      expect(b.querySelector('[data-total-entete-du] [data-montant-grand]')).not.toBeNull();
      expect(b.querySelector('[data-total-entete-du] [data-montant-petit]')).not.toBeNull();
    }
  });
});

describe('🔴 LOT AX — l’ordre des catégories, de haut en bas : Indépendants, Inter-cabinet vers [autre société], Apporteurs d’affaires, Agences extérieures', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const lc = (id: number, nego: string, cote: 'entree' | 'sortie', ttc: number) => ({ id, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc, montantHt: null, cote,
    nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  // CRITERIMMO : 41 (JB indépendant 1 200 TTC versés, Mylène MACJ 40 %, apporteur 2 400 TTC, Agence du Parc 20 %).
  const criterimmo: Vente = { ...compromis, lignes: [lc(1, JB.nom, 'entree', 1200)] };
  // MACJ : la même affaire, portée par MACJ — Mylène indépendante (MACJ) 1 200 TTC versés, JB (CRITERIMMO) 40 % en inter-cabinet.
  const macj: Vente = { ...compromis, id: 61, societe: 'macj', libelle: 'BERNARD / ROUX', lignes: [lc(2, MY.nom, 'entree', 1200)],
    repartition: { retroApporteurTtc: 2400, parties: [
      { sorte: 'entree', compteId: 7, negociateur: MY.nom, societe: 'macj', nom: null, coordonnees: null, pourcentage: 40, montantHt: null, statut: 'independant' },
      { sorte: 'sortie', compteId: 5, negociateur: JB.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 40, montantHt: null, statut: 'independant' },
      { sorte: 'exterieure', compteId: null, negociateur: null, societe: null, nom: 'Agence du Parc', coordonnees: null, pourcentage: 20, montantHt: null }] },
    dossier: { ...compromis.dossier!, entree: { id: 7, nom: MY.nom }, sortie: { id: 5, nom: JB.nom } } };
  const cas = {
    criterimmo: { vente: criterimmo, inter: 'inter-cabinet-macj', libelleInter: 'Inter-cabinet vers MACJ' },
    macj: { vente: macj, inter: 'inter-cabinet-criterimmo', libelleInter: 'Inter-cabinet vers CRITERIMMO' },
  } as const;
  const doc = (sel: string): string => document.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
  const tous = (sel: string, attr?: string): string[] => [...document.querySelectorAll(sel)].map((x) => (attr ? x.getAttribute(attr)! : x.textContent!.replace(/\s/g, ' ')));
  const cliquerDoc = async (sel: string) => { await act(async () => { (document.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const centimes = (t: string): number => Math.round(Number(t.replace(/[^\d,-]/g, '').replace(',', '.')) * 100);
  const grands = (sel: string): number[] => [...document.querySelectorAll(sel)].map((x) => centimes(x.children[0].textContent!));
  const fermer = async () => { await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); }); await calmer(); };
  const ecran = async (s: 'criterimmo' | 'macj', u: 'ht' | 'ttc') => {
    window.localStorage.setItem('trx-affichage-montants', u);
    act(() => { root.unmount(); }); root = createRoot(container);
    listeCompromis = [cas[s].vente];
    await act(async () => { root.render(createElement(EcranSociete, { societe: s })); }); await calmer();
    await cliquer('[data-vue="compromis"]');
  };

  for (const s of ['criterimmo', 'macj'] as const) {
    for (const u of ['ht', 'ttc'] as const) {
      it(`${s.toUpperCase()} en ${u.toUpperCase()} : « Commissions versées » et « Solde net », par catégorie et par transaction, dans l’ordre ; internes et autre société en dessous ; totaux = tuiles au centime`, async () => {
        await ecran(s, u);
        const ordre = ['independants', cas[s].inter, 'apporteurs', 'exterieur'];
        const etiquettes = ['Indépendant', 'Inter-cabinet', 'Apporteur', 'Agence extérieure'];
        const unite = u === 'ht' ? '€ HT' : '€ TTC';
        const tuileCommissions = centimes(container.querySelector('[data-tuile="commissions"]')!.children[1].children[0].textContent!);
        const tuileSolde = centimes(container.querySelector('[data-tuile="solde"]')!.children[1].children[0].textContent!);
        // ── « Commissions versées », par catégorie (défaut) : les 4 catégories, puis la section grise et la mention de l'autre société
        await cliquer('[data-tuile="commissions"]');
        expect(tous('[data-fenetre-commissions] [data-categorie]:not(.trx-fc-section--info)', 'data-categorie')).toEqual(ordre);
        expect(tous('[data-fenetre-commissions] [data-categorie]:not(.trx-fc-section--info) h3')).toEqual(['Indépendants', cas[s].libelleInter, 'Apporteurs d’affaires', 'Agences extérieures']);
        const corps = document.querySelector('[data-fenetre-commissions]')!;
        const derniere = corps.querySelector(`[data-categorie="exterieur"]`)!;
        const aPart = corps.querySelector('[data-non-deduits]')!;
        expect(derniere.compareDocumentPosition(aPart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(aPart.querySelector('[data-categorie="internes"]')).not.toBeNull();
        expect(aPart.querySelector('[data-detail="autre-societe"]')).not.toBeNull();
        expect(doc('[data-fenetre-commissions] [data-sous-total="independants"]')).toContain(unite);
        const sousTotaux = grands('[data-fenetre-commissions] [data-categorie]:not(.trx-fc-section--info) [data-sous-total]');
        expect(sousTotaux.every((x) => x > 0)).toBe(true);
        expect(sousTotaux.reduce((t, x) => t + x, 0)).toBe(tuileCommissions);
        expect(grands('[data-fenetre-commissions] [data-fenetre-total]')).toEqual([tuileCommissions]);
        // ── par transaction : les lignes de coût de l'affaire, dans le même ordre
        await cliquerDoc('[data-mode-fenetre="transaction"]');
        expect(tous('[data-fenetre-commissions] [data-affaire] [data-ligne-cout] [data-etiquette]')).toEqual(etiquettes);
        expect(tous('[data-fenetre-commissions] [data-affaire] [data-ligne-cout]', 'data-ligne-cout')).toEqual(ordre);
        expect(grands('[data-fenetre-commissions] [data-verse-affaire]')).toEqual([tuileCommissions]);
        expect(document.querySelector('[data-fenetre-commissions] [data-affaire]')!.compareDocumentPosition(document.querySelector('[data-fenetre-commissions] [data-detail="autre-societe"]')!)
          & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        await fermer();
        // ── « Solde net », par catégorie : entre « Chiffre d'affaires » et « = Solde net », le même ordre ; les internes en dessous
        await cliquer('[data-tuile="solde"]');
        await cliquerDoc('[data-fenetre-solde] [data-mode-fenetre="categorie"]');
        expect(tous('[data-fenetre-solde] [data-categorie-solde]', 'data-categorie-solde')).toEqual(ordre);
        const solde = document.querySelector('[data-fenetre-solde]')!;
        const sections = [solde.querySelector('[data-solde-ca]')!, ...solde.querySelectorAll('[data-categorie-solde]'), solde.querySelector('[data-total-solde]')!, solde.querySelector('[data-non-deduits]')!];
        for (let i = 1; i < sections.length; i++) expect(sections[i - 1].compareDocumentPosition(sections[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(grands('[data-fenetre-solde] [data-sous-total-solde]')).toEqual(sousTotaux);
        expect(grands('[data-fenetre-solde] [data-ca-solde]')[0] - sousTotaux.reduce((t, x) => t + x, 0)).toBe(tuileSolde);
        expect(grands('[data-fenetre-solde] [data-fenetre-total]')).toEqual([tuileSolde, tuileSolde]); // « = Solde net » et le pied
        // ── par transaction : CA, puis les commissions de l'affaire dans le même ordre, puis le solde
        await cliquerDoc('[data-fenetre-solde] [data-mode-fenetre="transaction"]');
        expect(tous('[data-fenetre-solde] [data-affaire-solde] [data-ligne-solde] [data-etiquette]')).toEqual(etiquettes);
        expect(tous('[data-fenetre-solde] [data-affaire-solde] [data-ligne-solde]', 'data-ligne-solde')).toEqual(ordre);
        expect(grands('[data-fenetre-solde] [data-solde-affaire]')).toEqual([tuileSolde]);
        expect(doc('[data-fenetre-solde] [data-solde-affaire]')).toContain(unite);
        await fermer();
        // ── et la synthèse « Ce que l'on doit » garde son ordre, qui est le même
        await cliquer('[data-ouvrir-du]');
        expect(tous('[data-cartes-du] > [data-section-du]', 'data-section-du')).toEqual(['negociateurs', 'inter-cabinet', 'apporteurs', 'agences']);
      });
    }
  }

  it('les montants, au centime, inchangés par le nouvel ordre (CRITERIMMO et MACJ, HT et TTC)', async () => {
    const lus: Record<string, string[]> = {};
    for (const s of ['criterimmo', 'macj'] as const) {
      for (const u of ['ht', 'ttc'] as const) {
        await ecran(s, u);
        await cliquer('[data-tuile="commissions"]');
        lus[`${s}-${u}`] = [...tous('[data-fenetre-commissions] [data-categorie]:not(.trx-fc-section--info) [data-sous-total]'), doc('[data-fenetre-commissions] [data-fenetre-total]')];
        await fermer();
      }
    }
    // la même affaire portée par l'une ou l'autre société : les mêmes montants, dans le même ordre
    const ht = ['1 000 € HT(1 200 € TTC)', '3 200 € HT(3 840 € TTC)', '2 000 € HT(2 400 € TTC)', '1 600 € HT(1 920 € TTC)', '7 800 € HT(9 360 € TTC)'];
    const ttc = ['1 200 € TTC(1 000 € HT)', '3 840 € TTC(3 200 € HT)', '2 400 € TTC(2 000 € HT)', '1 920 € TTC(1 600 € HT)', '9 360 € TTC(7 800 € HT)'];
    expect(lus).toEqual({ 'criterimmo-ht': ht, 'criterimmo-ttc': ttc, 'macj-ht': ht, 'macj-ttc': ttc });
  });
});

describe('🔴 LOT AY — cartes « Vendeurs » / « Acquéreurs » : 100 % des honoraires de chaque partie ventilés, jusqu’à la « Part de l’agence »', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const lc = (id: number, nego: string, cote: 'entree' | 'sortie', ttc: number) => ({ id, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc, montantHt: null, cote,
    nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  // CRITERIMMO, 41 : 12 000 TTC, apporteur 2 400 ; JB (CRITERIMMO, indépendant) 40 %, 1 200 TTC enregistrés ; Mylène (MACJ) 40 % ; Agence du Parc 20 %.
  const avec: Vente = { ...compromis, lignes: [lc(1, JB.nom, 'entree', 1200)] };
  // MACJ, FABARRO : 25 000 TTC ; Cédric JULLIEN (MACJ, associé non commissionné) vendeurs ; Pierre Thevenin (MACJ, indépendant) 50 % acquéreurs.
  const fabarro: Vente = { ...compromis, id: 260, societe: 'macj', libelle: 'FABARRO', honorairesTtc: 25000, apporteur: null, retroApporteur: null, lignes: [],
    repartition: { retroApporteurTtc: 0, parties: [
      { sorte: 'entree', compteId: 9, negociateur: 'Cédric JULLIEN', societe: 'macj', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'associe', commissionne: false },
      { sorte: 'sortie', compteId: 8, negociateur: 'Pierre Thevenin', societe: 'macj', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut: 'independant' }] },
    dossier: { ...compromis.dossier!, entree: { id: 9, nom: 'Cédric JULLIEN' }, sortie: { id: 8, nom: 'Pierre Thevenin' } } };
  const ecran = async (s: 'criterimmo' | 'macj', u: 'ht' | 'ttc', liste: Vente[]) => {
    window.localStorage.setItem('trx-affichage-montants', u);
    act(() => { root.unmount(); }); root = createRoot(container);
    listeCompromis = liste;
    await act(async () => { root.render(createElement(EcranSociete, { societe: s })); }); await calmer();
    await cliquer('[data-vue="compromis"]');
  };
  const lire = (): Record<string, string> => Object.fromEntries([...container.querySelectorAll('[data-ventilation] [data-honoraires-cote], [data-ventilation] [data-part-agence], [data-ventilation] [data-quote-part], [data-ventilation] [data-reverse-cote]')]
    .map((x, i) => [`${i}:${x.closest('[data-ventilation]')!.getAttribute('data-ventilation')}`, x.textContent!.replace(/\s/g, ' ')]));

  const centimes = (t: string): number => Math.round(Number(t.replace(/[^\d,-]/g, '').replace(',', '.')) * 100);
  /** Le montant principal (l'unité choisie) d'une ligne de calcul. */
  const grand = (sel: string): number => centimes(container.querySelector(`${sel} .trx-calcul-resultat`)!.textContent!);
  const tous = (sel: string): number[] => [...container.querySelectorAll(`${sel} .trx-calcul-resultat`)].map((x) => centimes(x.textContent!));

  for (const u of ['ttc', 'ht'] as const) {
    it(`CRITERIMMO en ${u.toUpperCase()} : apporteur, agence extérieure, indépendant, inter-cabinet — chaque carte = honoraires de la partie, au centime ; mention`, async () => {
      await ecran('criterimmo', u, [avec]); await deplier(41);
      const T = u === 'ttc';
      const m = (ttc: string, ht: string): string => (T ? `${ttc} € TTC` : `${ht} € HT`);
      const p = (ttc: string, ht: string): string => (T ? `(${ht} € HT)` : `(${ttc} € TTC)`);
      const lus = lire();
      // LOT AZ / BA / BB — l'en-tête (« Commission de la vente », « − Apporteur », « = Honoraires partie … » nette), la part de l'agence (vert), puis
      // le rouge (agence extérieure, reversé) ; plus de cadre d'apporteur ; un cadre à 0 n'est pas affiché (la part de l'agence des acquéreurs)
      const q = 'Quote-part de cette partie — comptabilisée dans « Commissions versées »';
      const tete = (mot: string) => `= Honoraires partie ${mot} : (${m('12 000', '10 000')} − ${m('2 400', '2 000')}) × 50 % = ${m('4 800', '4 000')} ${p('4 800', '4 000')}`;
      expect(Object.values(lus)).toEqual([
        tete('vendeur'),
        `Part de l’agence CRITERIMMO : ${m('4 800', '4 000')} − ${m('1 200', '1 000')} − ${m('960', '800')} = ${m('2 640', '2 200')} ${p('2 640', '2 200')} Reste dans le CA de CRITERIMMO — non reversé`,
        `Agence extérieure — Agence du Parc : ${m('1 920', '1 600')} × 50 % = ${m('960', '800')} ${p('960', '800')} ${q}`,
        tete('acquéreur'),
        `Agence extérieure — Agence du Parc : ${m('1 920', '1 600')} × 50 % = ${m('960', '800')} ${p('960', '800')} ${q}`,
        `Reversé en inter-cabinet à MACJ ${m('3 840', '3 200')} ${p('3 840', '3 200')} Comptabilisé dans « Commissions versées »dont commission de Mylène EBERLIN (MACJ, 50 %) : ${m('1 920', '1 600')} — payée par MACJdont part de l’agence MACJ : ${m('1 920', '1 600')}`,
      ]);
      expect(texte('[data-entete-commission="entree"]')).toBe(`Commission de la vente ${m('12 000', '10 000')} ${p('12 000', '10 000')}`);
      expect(texte('[data-entete-apporteur="entree"]')).toBe(`− Apporteur : Julien Deblois ${m('2 400', '2 000')} ${p('2 400', '2 000')}`); // LOT BC : une ligne
      expect(container.querySelector('[data-entete-apporteur="entree"] .trx-calcul-resultat')!.className).toContain('trx-rouge');
      expect(container.querySelector('[data-entete-apporteur="entree"]')!.className).not.toContain('trx-calcul-encadre');
      expect(container.querySelector('[data-quote-part="apporteur"]')).toBeNull();
      // La règle d'Arno, lue à l'écran : commission enregistrée (1 200 TTC) + quote-parts + part de l'agence = honoraires nets de la partie.
      const jb = centimes(texte('[data-commission-enregistree="entree"] [data-montant-' + u + ']'));
      expect(jb + tous('[data-ventilation="entree"] [data-quote-part]').reduce((t, x) => t + x, 0) + grand('[data-part-agence="entree"]')).toBe(grand('[data-honoraires-cote="entree"]'));
      // acquéreurs : le reversé à MACJ + la quote-part de l'agence extérieure = les honoraires nets (la part de l'agence, 0, n'est pas affichée)
      expect(container.querySelector('[data-part-agence="sortie"]')).toBeNull();
      expect(grand('[data-reverse-cote="sortie"]') + tous('[data-ventilation="sortie"] [data-quote-part]').reduce((t, x) => t + x, 0)).toBe(grand('[data-honoraires-cote="sortie"]'));
      // les deux cartes (nettes) + l'apporteur = la commission de la vente
      expect(grand('[data-honoraires-cote="entree"]') + grand('[data-honoraires-cote="sortie"]') + grand('[data-entete-apporteur="entree"]')).toBe(T ? 1200000 : 1000000);
      // le liseré vert, le montant et la mention en vert ; la ventilation SOUS l'en-tête
      const part = container.querySelector('[data-part-agence="entree"]')!;
      expect([part.className.includes('trx-calcul-encadre--agence'), part.querySelector('.trx-calcul-resultat')!.className.includes('trx-vert')]).toEqual([true, true]);
      const bloc = container.querySelector('[data-negociateur-cote="entree"]')!;
      // LOT AZ — la part de l'agence (verte) AU-DESSUS de la commission de l'indépendant (rouge)
      expect(bloc.querySelector('[data-part-agence]')!.compareDocumentPosition(bloc.querySelector('[data-commission-negociateur]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // aucune tuile ni synthèse ne change au centime (les mêmes chiffres qu'au lot AL)
      const tuile = (t: string): string => [...container.querySelector(`[data-tuile="${t}"]`)!.children].slice(1, 2).map((x) => x.textContent!.replace(/\s/g, ' '))[0];
      expect([tuile('ca'), tuile('commissions'), tuile('solde')]).toEqual(T ? ['12 000 € TTC(10 000 € HT)', '9 360 € TTC versées(7 800 € HT)', '2 640 € TTC(2 200 € HT)']
        : ['10 000 € HT(12 000 € TTC)', '7 800 € HT versées(9 360 € TTC)', '2 200 € HT(2 640 € TTC)']);
      await cliquer('[data-ouvrir-du]');
      expect(texte('[data-total-a-verser] [data-montant-grand]')).toBe(T ? '9 360 € TTC' : '7 800 € HT');
    });

    it(`MACJ en ${u.toUpperCase()} : FABARRO — 🔴 LOT BI : Vendeurs (Cédric JULLIEN, associé) conservés et comptés dans son CA ; Acquéreurs (Pierre, indépendant) : commission + part de l’agence NON rattachée`, async () => {
      await ecran('macj', u, [fabarro]); await deplier(260);
      // LOT BA — l'en-tête de chaque carte ; HT au centime du lot AH (la porteuse prend l'écart sur sa dernière partie, la sortie)
      expect(Object.values(lire())).toEqual(u === 'ttc' ? [
        'Honoraires partie vendeur : 25 000 € TTC × 50 % = 12 500 € TTC (10 416,67 € HT)',
        'Honoraires conservés par MACJ : 12 500 € TTC (10 416,67 € HT) Comptés dans le CA de Cédric JULLIEN (associé)',
        'Honoraires partie acquéreur : 25 000 € TTC × 50 % = 12 500 € TTC (10 416,66 € HT)',
        'Part de l’agence MACJ : 12 500 € TTC − 6 250 € TTC = 6 250 € TTC (5 208,33 € HT) Reste dans le CA de MACJ — non reversé',
      ] : [
        'Honoraires partie vendeur : 20 833,33 € HT × 50 % = 10 416,67 € HT (12 500 € TTC)',
        'Honoraires conservés par MACJ : 10 416,67 € HT (12 500 € TTC) Comptés dans le CA de Cédric JULLIEN (associé)',
        'Honoraires partie acquéreur : 20 833,33 € HT × 50 % = 10 416,66 € HT (12 500 € TTC)',
        'Part de l’agence MACJ : 10 416,66 € HT − 5 208,33 € HT = 5 208,33 € HT (6 250 € TTC) Reste dans le CA de MACJ — non reversé',
      ]);
      // chaque carte : honoraires de la partie (ligne existante) = commission + part de l'agence, au centime
      expect(grand('[data-honoraires-cote="entree"]')).toBe(grand('[data-part-agence="entree"]'));
      expect(grand('[data-commission-negociateur="sortie"]') + grand('[data-part-agence="sortie"]')).toBe(grand('[data-honoraires-cote="sortie"]'));
      // la carte du non commissionné garde son « Statut à la vente », puis la part de l'agence
      expect(container.querySelector('[data-statut-vente="entree"]')).toBeNull(); // LOT BE : « Statut à la vente » retiré (accord d'Arno)
    });

    it(`ligne miroir chez MACJ en ${u.toUpperCase()} : la part de l’agence de MACJ, à partir de sa part reçue`, async () => {
      const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
      await ecran('macj', u, [venteDansSociete(avec, 'macj')!]);
      await cliquer('[data-deplier="miroir-41"]');
      expect(texte('[data-remuneration="sortie"] [data-part-agence="sortie"]')).toBe(u === 'ttc'
        ? 'Part de l’agence MACJ : 3 840 € TTC − 1 920 € TTC = 1 920 € TTC (1 600 € HT) Reste dans le CA de MACJ — non reversé'
        : 'Part de l’agence MACJ : 3 200 € HT − 1 600 € HT = 1 600 € HT (1 920 € TTC) Reste dans le CA de MACJ — non reversé');
      expect(grand('[data-remuneration="sortie"] [data-commission-negociateur]') + grand('[data-part-agence="sortie"]')).toBe(u === 'ttc' ? 384000 : 320000);
    });
  }
});

describe('🔴 LOT AZ — les cadres verts au-dessus des rouges ; « Revenir au 50/50 » ; le panneau relit les parts des pastilles', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const lc = (id: number, nego: string, cote: 'entree' | 'sortie', ttc: number) => ({ id, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc, montantHt: null, cote,
    nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  const p = (sorte: 'entree' | 'sortie' | 'exterieure', n: { id: number; nom: string; societe: 'criterimmo' | 'macj' } | null, pct: number, o: Record<string, unknown> = {}) => ({ sorte, compteId: n?.id ?? null,
    negociateur: n?.nom ?? null, societe: n?.societe ?? null, nom: n === null ? 'Agence du Parc' : null, coordonnees: null, pourcentage: pct, montantHt: null, ...(n === null ? {} : { statut: 'independant' as const }), ...o });
  // MACJ : Mylène des DEUX côtés (le cas de FABARRO, Pierre Thevenin en entrée et en sortie), 25 000 TTC.
  const meme = (e: number, s: number): Vente => ({ ...compromis, id: 260, societe: 'macj', libelle: 'FABARRO', honorairesTtc: 25000, apporteur: null, retroApporteur: null, lignes: [],
    repartition: { retroApporteurTtc: 0, parties: [p('entree', MY, e), ...(s > 0 ? [p('sortie', MY, s)] : [])] as never },
    dossier: { ...compromis.dossier!, entree: { id: MY.id, nom: MY.nom }, sortie: { id: MY.id, nom: MY.nom } } });
  // CRITERIMMO : JB (CRITERIMMO) en entrée, Mylène (MACJ) en sortie — inter-cabinet ; avec ou sans Agence du Parc.
  const inter = (e: number, s: number, ext = 0): Vente => ({ ...compromis, lignes: [lc(1, JB.nom, 'entree', 1200)],
    repartition: { retroApporteurTtc: 2400, parties: [p('entree', JB, e), p('sortie', MY, s), ...(ext > 0 ? [p('exterieure', null, ext)] : [])] as never } });
  const ecran = async (s: 'criterimmo' | 'macj', liste: Vente[]) => {
    act(() => { root.unmount(); }); root = createRoot(container);
    listeCompromis = liste;
    await act(async () => { root.render(createElement(EcranSociete, { societe: s })); }); await calmer();
    await cliquer('[data-vue="compromis"]');
  };
  const pcts = (cote: string): string[] => [...container.querySelectorAll(`[data-reglage-repartition="${cote}"] [data-partie-pct]`)].map((x) => (x as HTMLInputElement).value);
  const pastilles = (): string[] => ['entree', 'sortie'].map((c) => texte(`[data-societe-cote="${c}"]`));
  /** Les liserés de la carte d'un côté, de haut en bas : vert (part de l'agence, commission interne) ou rouge. */
  const lisieres = (cote: string): string[] => [...container.querySelectorAll(`[data-negociateur-cote="${cote}"] .trx-calcul-encadre`)]
    .map((x) => (x.className.includes('--deduite') ? 'rouge' : 'vert'));
  const centimes = (t: string): number => Math.round(Number(t.replace(/[^\d,-]/g, '').replace(',', '.')) * 100);

  it('1 — indépendant + part de l’agence : le vert au-dessus du rouge (vendeurs) ; inter-cabinet versé et quote-parts en rouge, dessous (acquéreurs) ; textes inchangés', async () => {
    await ecran('criterimmo', [inter(40, 40, 20)]); await deplier(41);
    // LOT BB — l'apporteur est dans l'en-tête (plus de cadre) ; la part de l'agence des acquéreurs, à 0, n'est pas affichée
    expect(lisieres('entree')).toEqual(['vert', 'rouge', 'rouge']); // part de l'agence ; commission JB, Agence du Parc
    expect([...container.querySelectorAll('[data-negociateur-cote="entree"] .trx-calcul-encadre')].map((x) => [...x.attributes].map((a) => a.name).find((n) => n.startsWith('data-') && n !== 'data-ht-ttc')))
      .toEqual(['data-part-agence', 'data-commission-negociateur', 'data-quote-part']);
    expect(lisieres('sortie')).toEqual(['rouge', 'rouge']); // Agence du Parc, reversé à MACJ
    expect([...container.querySelectorAll('[data-negociateur-cote="sortie"] .trx-calcul-encadre')].at(-1)!.getAttribute('data-reverse-cote')).toBe('sortie'); // LOT BA : le reversé, en dernier
    // la ventilation totalise toujours les honoraires de la partie, au centime (vendeurs : JB 1 000 HT enregistrés)
    const g = (sel: string): number => centimes(container.querySelector(`${sel} .trx-calcul-resultat`)!.textContent!);
    const quotes = [...container.querySelectorAll('[data-negociateur-cote="entree"] [data-quote-part] .trx-calcul-resultat')].reduce((t, x) => t + centimes(x.textContent!), 0);
    expect(100000 + quotes + g('[data-part-agence="entree"]')).toBe(g('[data-honoraires-cote="entree"]'));
  });

  it('1 — salarié + apporteur : part de l’agence puis commission interne (verts), puis l’apporteur (rouge) ; ligne miroir : la part de l’agence au-dessus de la commission', async () => {
    const v = inter(50, 50);
    const salarie: Vente = { ...v, repartition: { ...v.repartition!, parties: v.repartition!.parties.map((x, i) => (i === 0 ? { ...x, statut: 'salarie' } : x)) } };
    await ecran('criterimmo', [salarie]); await deplier(41);
    expect(lisieres('entree')).toEqual(['vert', 'vert']); // LOT BB : l'apporteur est dans l'en-tête (en rouge, sans cadre)
    expect(container.querySelector('[data-entete-apporteur="entree"]')).not.toBeNull();
    expect(container.querySelector('[data-negociateur-cote="entree"] .trx-calcul-encadre--interne')!.getAttribute('data-commission-negociateur')).toBe('entree');
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    await ecran('macj', [venteDansSociete(v, 'macj')!]); await cliquer('[data-deplier="miroir-41"]');
    expect([...container.querySelectorAll('[data-remuneration="sortie"] .trx-calcul-encadre')].map((x) => (x.className.includes('--deduite') ? 'rouge' : 'vert'))).toEqual(['vert', 'rouge']);
  });

  it('3 — à l’ouverture, le panneau relit exactement les parts des pastilles (80/20, 100/0 du même négociateur, inter-cabinet, partie extérieure) ; « Fermer » n’enregistre rien', async () => {
    for (const [s, v, attendu] of [['macj', meme(80, 20), ['80', '20']], ['macj', meme(100, 0), ['100', '0']], ['criterimmo', inter(80, 20), ['80', '20']], ['criterimmo', inter(60, 20, 20), ['60', '20', '20']]] as const) {
      await ecran(s, [v]); await deplier(v.id);
      expect(pastilles().map((x) => x.replace(/^.* · /, ''))).toEqual([`${attendu[0]} %`, `${attendu[1]} %`]);
      for (const cote of ['entree', 'sortie']) {
        await cliquer(`[data-societe-cote="${cote}"]`);
        expect(pcts(cote)).toEqual([...attendu]);
        // le même négociateur des deux côtés : la ligne de sortie le nomme, même à 0 %
        if (v.id === 260) expect(texte(`[data-reglage-repartition="${cote}"] [data-nego-partie="1"]`)).toBe(MY.nom);
        await cliquer(`[data-reglage-repartition="${cote}"] [data-revenir-5050]`);
        const fermer = [...container.querySelectorAll(`[data-reglage-repartition="${cote}"] button`)].find((b) => b.textContent === 'Fermer') as HTMLElement;
        await act(async () => { fermer.click(); }); await calmer();
      }
      expect(posts).toEqual([]);
      expect(pastilles().map((x) => x.replace(/^.* · /, ''))).toEqual([`${attendu[0]} %`, `${attendu[1]} %`]);
      await cliquer('[data-societe-cote="entree"]');
      expect(pcts('entree')).toEqual([...attendu]);
    }
  });

  it('2 — « Revenir au 50/50 » : 80/20 et 100/0 du MÊME négociateur, inter-cabinet, partie extérieure gardée (le 50/50 sur le reste) — rien d’enregistré avant « Valider »', async () => {
    for (const [s, v, attendu] of [['macj', meme(80, 20), ['50', '50']], ['macj', meme(100, 0), ['50', '50']], ['criterimmo', inter(80, 20), ['50', '50']], ['criterimmo', inter(60, 20, 20), ['40', '40', '20']]] as const) {
      await ecran(s, [v]); await deplier(v.id);
      await cliquer('[data-societe-cote="sortie"]');
      await cliquer('[data-reglage-repartition="sortie"] [data-revenir-5050]');
      expect(pcts('sortie')).toEqual([...attendu]);
      // Part € recalculée depuis la base : les lignes font la base de répartition, au centime (la ligne « Total »)
      const eurs = [...container.querySelectorAll('[data-reglage-repartition="sortie"] [data-partie-eur]')].map((x) => centimes((x as HTMLInputElement).value));
      const net = Math.round(((v.honorairesTtc - v.repartition!.retroApporteurTtc) / 1.2) * 100);
      expect(Math.abs(eurs.reduce((t, x) => t + x, 0) - net)).toBeLessThanOrEqual(1);
      expect(Math.abs(eurs[0] - eurs[1])).toBeLessThanOrEqual(1); // centimes du lot AH : la porteuse prend l'écart d'un centime
      expect(posts).toEqual([]);
      expect(container.querySelector('[data-reglage-repartition="sortie"] [data-motif-repartition]')).toBeNull();
    }
  });

  it('2 — « Valider » après « Revenir au 50/50 » (même négociateur, 100/0) : 50 % / 50 % enregistrés ; les cartes passent à « MACJ · 50 % », honoraires, commissions et parts de l’agence à 50 % ; tuiles cohérentes', async () => {
    await ecran('macj', [meme(100, 0)]); await deplier(260);
    await cliquer('[data-societe-cote="entree"]');
    await cliquer('[data-reglage-repartition="entree"] [data-revenir-5050]');
    listeCompromis = [meme(50, 50)]; // ce que le serveur relit après l'enregistrement (simulé : rien n'est écrit)
    await cliquer('[data-valider-repartition="entree"]');
    const envoi = posts.find((x) => x.action === 'dossier-enregistrer') as { dossier: { parties: { sorte: string; compteId: number; pourcentage: number }[] } };
    expect(envoi.dossier.parties.map((x) => [x.sorte, x.compteId, x.pourcentage])).toEqual([['entree', MY.id, 50], ['sortie', MY.id, 50]]);
    await calmer();
    if (container.querySelector('[data-honoraires-cote="entree"]') === null) await deplier(260);
    expect(pastilles()).toEqual(['MACJ · 50 %', 'MACJ · 50 %']);
    for (const cote of ['entree', 'sortie']) {
      expect(texte(`[data-honoraires-cote="${cote}"]`)).toContain(cote === 'entree' ? '× 50 % = 10 416,67 € HT' : '× 50 % = 10 416,66 € HT'); // LOT BA : centimes AH
      expect(texte(`[data-commission-negociateur="${cote}"] .trx-calcul-resultat`)).toBe('5 208,33 € HT');
      expect(texte(`[data-part-agence="${cote}"] .trx-calcul-resultat`)).toBe(cote === 'entree' ? '5 208,34 € HT' : '5 208,33 € HT'); // LOT BA : centimes AH
    }
    // tuiles : CA − commissions versées = solde, au centime
    const grand = (t: string): number => centimes(container.querySelector(`[data-tuile="${t}"]`)!.children[1].children[0].textContent!);
    expect(grand('ca') - grand('commissions')).toBe(grand('solde'));
    expect(grand('ca')).toBe(2083333);
  });
});

describe('🔴 LOT BA — chaque carte part de « Honoraires partie … » (sans cadre) et ses cadres la totalisent ; l’inter-cabinet ; le contrôle à l’écran', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const PT = { id: 8, nom: 'Pierre Thevenin', societe: 'macj' as const };
  const AJ = { id: 2, nom: 'Arnaud Jorel', societe: 'criterimmo' as const };
  const lt = (id: number, nego: string, cote: 'entree' | 'sortie', ttc: number, taux?: number) => ({ id, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc, montantHt: null, cote,
    nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null, ...(taux === undefined ? {} : { taux }) });
  const pa = (sorte: 'entree' | 'sortie', n: { id: number; nom: string; societe: 'criterimmo' | 'macj' }, pct: number, o: Record<string, unknown> = {}) => ({ sorte, compteId: n.id,
    negociateur: n.nom, societe: n.societe, nom: null, coordonnees: null, pourcentage: pct, montantHt: null, statut: 'independant' as const, ...o });
  const v = (o: { id: number; libelle: string; ttc: number; retro?: number; parties: ReturnType<typeof pa>[]; lignes: ReturnType<typeof lt>[]; e: { id: number; nom: string }; s: { id: number; nom: string } }): Vente => ({
    ...compromis, id: o.id, libelle: o.libelle, honorairesTtc: o.ttc, apporteur: o.retro ? 'Gardien Dacquet' : null, retroApporteur: o.retro ? { montant: o.retro, unite: 'ttc' } : null, lignes: o.lignes,
    repartition: { retroApporteurTtc: o.retro ?? 0, parties: o.parties as never }, dossier: { ...compromis.dossier!, entree: o.e, sortie: o.s } });
  // FABARRO tel qu'Arno l'a laissé : CRITERIMMO porteuse ; JB PONS salarié 25 % (vendeurs), Pierre Thevenin (MACJ) indépendant 60 % (acquéreurs).
  const fabarro = v({ id: 260, libelle: 'FABARRO', ttc: 25000, parties: [pa('entree', JB, 50, { statut: 'salarie' }), pa('sortie', PT, 50)],
    lignes: [lt(1, JB.nom, 'entree', 3125, 25), lt(2, PT.nom, 'sortie', 7500, 60)], e: JB, s: PT });
  const location = v({ id: 37, libelle: 'Location ?', ttc: 7500, retro: 1000, parties: [pa('entree', AJ, 50, { statut: 'associe', commissionne: false }), pa('sortie', PT, 50)],
    lignes: [lt(3, PT.nom, 'sortie', 1625, 50)], e: AJ, s: PT });
  const heididon = v({ id: 38, libelle: 'HEIDIDON', ttc: 4000, parties: [pa('entree', AJ, 50, { statut: 'associe', commissionne: false }), pa('sortie', PT, 50)],
    lignes: [lt(4, PT.nom, 'sortie', 1000)], e: AJ, s: PT });
  const ecran = async (s: 'criterimmo' | 'macj', u: 'ht' | 'ttc', liste: Vente[]) => {
    window.localStorage.setItem('trx-affichage-montants', u);
    act(() => { root.unmount(); }); root = createRoot(container);
    listeCompromis = liste;
    await act(async () => { root.render(createElement(EcranSociete, { societe: s })); }); await calmer();
    await cliquer('[data-vue="compromis"]');
  };
  const centimes = (t: string): number => Math.round(Number(t.replace(/[^\d,-]/g, '').replace(',', '.')) * 100);
  /** Une carte de partie : l'en-tête et la somme de ses CADRES (vert + rouge ; jamais les lignes « dont »). */
  const carte = (sel: string): { entete: number; cadres: number; couleurs: string[] } => {
    const b = container.querySelector(sel)!;
    const cadres = [...b.querySelectorAll('.trx-calcul-encadre')];
    return { entete: centimes(b.querySelector('[data-honoraires-cote] .trx-calcul-resultat')!.textContent!),
      cadres: cadres.reduce((t, x) => t + centimes(x.querySelector('.trx-calcul-resultat')!.textContent!), 0),
      couleurs: cadres.map((x) => (x.className.includes('--deduite') ? 'rouge' : 'vert')) };
  };

  for (const u of ['ttc', 'ht'] as const) {
    it(`FABARRO, page CRITERIMMO, en ${u.toUpperCase()} : l’en-tête sans cadre ; vendeurs 9 375 + 3 125 ; acquéreurs part de l’agence 0 + reversé 12 500 (dont Pierre 7 500, dont MACJ 5 000) ; tuiles et synthèse inchangées`, async () => {
      await ecran('criterimmo', u, [fabarro]); await deplier(260);
      const T = u === 'ttc';
      const m = (ttc: string, ht: string): string => (T ? `${ttc} € TTC` : `${ht} € HT`);
      const p = (ttc: string, ht: string): string => (T ? `(${ht} € HT)` : `(${ttc} € TTC)`);
      expect(texte('[data-honoraires-cote="entree"]')).toBe(`Honoraires partie vendeur : ${m('25 000', '20 833,33')} × 50 % = ${m('12 500', '10 416,66')} ${p('12 500', '10 416,66')}`);
      expect(texte('[data-honoraires-cote="sortie"]')).toBe(`Honoraires partie acquéreur : ${m('25 000', '20 833,33')} × 50 % = ${m('12 500', '10 416,67')} ${p('12 500', '10 416,67')}`);
      expect(container.querySelector('[data-honoraires-cote="sortie"]')!.className).not.toContain('trx-calcul-encadre');
      expect(texte('[data-part-agence="entree"]')).toBe(`Part de l’agence CRITERIMMO : ${m('12 500', '10 416,66')} − ${m('3 125', '2 604,17')} = ${m('9 375', '7 812,49')} ${p('9 375', '7 812,49')} Reste dans le CA de CRITERIMMO — non reversé`);
      expect(texte('[data-commission-negociateur="entree"] .trx-calcul-resultat')).toBe(m('3 125', '2 604,17'));
      expect(texte('[data-reverse-cote="sortie"]')).toBe(`Reversé en inter-cabinet à MACJ ${m('12 500', '10 416,67')} ${p('12 500', '10 416,67')} Comptabilisé dans « Commissions versées »`
        + `dont commission de Pierre Thevenin (MACJ, 60 %) : ${m('7 500', '6 250')} — payée par MACJdont part de l’agence MACJ : ${m('5 000', '4 166,67')}`);
      // chaque carte : la somme des cadres = l'en-tête, au centime (les « dont » n'y entrent pas) ; verts puis rouges
      for (const cote of ['entree', 'sortie']) { const c = carte(`[data-negociateur-cote="${cote}"]`); expect(c.cadres).toBe(c.entete); }
      expect(carte('[data-negociateur-cote="entree"]').couleurs).toEqual(['vert', 'vert']);
      expect(carte('[data-negociateur-cote="sortie"]').couleurs).toEqual(['rouge']); // LOT BB : la part de l'agence CRITERIMMO, à 0, n'est pas affichée
      expect(container.querySelector('[data-part-agence="sortie"]')).toBeNull();
      expect(carte('[data-negociateur-cote="entree"]').entete + carte('[data-negociateur-cote="sortie"]').entete).toBe(T ? 2500000 : 2083333);
      expect(container.querySelector('[data-ventilation-incomplete]')).toBeNull();
      // tuiles et synthèse : inchangées (le reversé seul est versé ; JB, salarié, n'y est pas)
      const tuile = (t: string): number => centimes(container.querySelector(`[data-tuile="${t}"]`)!.children[1].children[0].textContent!);
      expect([tuile('ca'), tuile('commissions'), tuile('solde')]).toEqual(T ? [2500000, 1250000, 1250000] : [2083333, 1041667, 1041666]);
      await cliquer('[data-ouvrir-du]');
      expect(texte('[data-total-a-verser] [data-montant-grand]')).toBe(m('12 500', '10 416,67'));
    });

    it(`FABARRO, ligne miroir MACJ, en ${u.toUpperCase()} : « Honoraires reçus de CRITERIMMO » (sans cadre) = part de l’agence MACJ 5 000 + commission de Pierre 7 500`, async () => {
      const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
      await ecran('macj', u, [venteDansSociete(fabarro, 'macj')!]); await cliquer('[data-deplier="miroir-260"]');
      const T = u === 'ttc';
      expect(texte('[data-remuneration="sortie"] [data-honoraires-cote="sortie"]')).toBe(T ? 'Honoraires reçus de CRITERIMMO 12 500 € TTC (10 416,67 € HT)' : 'Honoraires reçus de CRITERIMMO 10 416,67 € HT (12 500 € TTC)');
      expect(texte('[data-part-agence="sortie"] .trx-calcul-resultat')).toBe(T ? '5 000 € TTC' : '4 166,67 € HT');
      expect(texte('[data-remuneration="sortie"] [data-commission-negociateur] .trx-calcul-resultat')).toBe(T ? '7 500 € TTC' : '6 250 € HT');
      const c = carte('[data-remuneration="sortie"]');
      expect([c.cadres, c.couleurs]).toEqual([c.entete, ['vert', 'rouge']]);
      expect(container.querySelector('[data-ventilation-incomplete]')).toBeNull();
    });

    it(`« Location ? » et HEIDIDON, page CRITERIMMO, en ${u.toUpperCase()} : chaque carte totalise son en-tête ; les deux cartes = la commission de la vente`, async () => {
      for (const x of [location, heididon]) {
        await ecran('criterimmo', u, [x]); await deplier(x.id);
        const e = carte('[data-negociateur-cote="entree"]'); const s = carte('[data-negociateur-cote="sortie"]');
        expect([e.cadres, s.cadres]).toEqual([e.entete, s.entete]);
        // LOT BB — les honoraires nets des deux cartes + l'apporteur (en-tête) = la commission de la vente
        const app = container.querySelector('[data-entete-apporteur="entree"] .trx-calcul-resultat');
        expect(e.entete + s.entete + (app === null ? 0 : centimes(app.textContent!))).toBe(Math.round((u === 'ttc' ? x.honorairesTtc : x.honorairesTtc / 1.2) * 100));
        expect(s.couleurs.at(-1)).toBe('rouge'); // le reversé à MACJ, en dernier
        expect(container.querySelector('[data-ventilation-incomplete]')).toBeNull();
      }
    });
  }

  it('partie à 0 % (le même négociateur porte tout, 100 / 0) : la carte de sortie à 0, sans alerte', async () => {
    const tout = v({ id: 261, libelle: 'TOUT À L’ENTRÉE', ttc: 25000, parties: [pa('entree', PT, 100)], lignes: [lt(5, PT.nom, 'entree', 12500)], e: PT, s: PT });
    await ecran('macj', 'ttc', [{ ...tout, societe: 'macj' }]); await deplier(261);
    expect(texte('[data-honoraires-cote="sortie"]')).toBe('Honoraires partie acquéreur : 25 000 € TTC × 0 % = 0 € TTC (0 € HT)');
    expect(texte('[data-honoraires-cote="entree"]')).toBe('Honoraires partie vendeur : 25 000 € TTC × 100 % = 25 000 € TTC (20 833,33 € HT)');
    expect(container.querySelector('[data-ventilation-incomplete]')).toBeNull();
  });

  it('données incomplètes (une partie ni d’entrée ni de sortie) : « Ventilation incomplète : X non affectés », discrète, sur la carte', async () => {
    const incomplete = v({ id: 262, libelle: 'INCOMPLÈTE', ttc: 12000, parties: [pa('entree', JB, 40), pa('sortie', MY, 40), pa('sortie', { id: 4, nom: AU.nom, societe: 'criterimmo' }, 20)],
      lignes: [], e: JB, s: MY });
    await ecran('criterimmo', 'ttc', [incomplete]); await deplier(262);
    expect(texte('[data-ventilation-incomplete]')).toBe('Ventilation incomplète : 2 400 € TTC non affectés');
    expect(container.querySelector('[data-ventilation-incomplete]')!.closest('[data-compromis="262"]')).not.toBeNull();
  });
});

describe('🔴 LOT BB — l’en-tête = la part NETTE de la partie (« − Apporteur » dedans) ; plus de cadre d’apporteur ; les cadres à 0 masqués ; les centimes', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const PT = { id: 8, nom: 'Pierre Thevenin', societe: 'macj' as const };
  const AJ = { id: 2, nom: 'Arnaud Jorel', societe: 'criterimmo' as const };
  const lt = (id: number, nego: string, cote: 'entree' | 'sortie', ttc: number, taux?: number) => ({ id, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc, montantHt: null, cote,
    nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null, ...(taux === undefined ? {} : { taux }) });
  const pa = (sorte: 'entree' | 'sortie', n: { id: number; nom: string; societe: 'criterimmo' | 'macj' }, pct: number, o: Record<string, unknown> = {}) => ({ sorte, compteId: n.id,
    negociateur: n.nom, societe: n.societe, nom: null, coordonnees: null, pourcentage: pct, montantHt: null, statut: 'independant' as const, ...o });
  const v = (o: { id: number; libelle: string; ttc: number; retro?: number; parties: ReturnType<typeof pa>[]; lignes: ReturnType<typeof lt>[]; e: { id: number; nom: string }; s: { id: number; nom: string }; societe?: 'criterimmo' | 'macj' }): Vente => ({
    ...compromis, id: o.id, societe: o.societe ?? 'criterimmo', libelle: o.libelle, honorairesTtc: o.ttc, apporteur: o.retro ? 'Gardien Dacquet' : null, retroApporteur: o.retro ? { montant: o.retro, unite: 'ttc' } : null,
    lignes: o.lignes, repartition: { retroApporteurTtc: o.retro ?? 0, parties: o.parties as never }, dossier: { ...compromis.dossier!, entree: o.e, sortie: o.s } });
  const location = v({ id: 37, libelle: 'Location ?', ttc: 7500, retro: 1000, parties: [pa('entree', AJ, 50, { statut: 'associe', commissionne: false }), pa('sortie', PT, 50)],
    lignes: [lt(3, PT.nom, 'sortie', 1625, 50)], e: AJ, s: PT });
  const fabarro = v({ id: 260, libelle: 'FABARRO', ttc: 25000, parties: [pa('entree', JB, 50, { statut: 'salarie' }), pa('sortie', PT, 50)],
    lignes: [lt(1, JB.nom, 'entree', 3125, 25), lt(2, PT.nom, 'sortie', 7500, 60)], e: JB, s: PT });
  const ecran = async (s: 'criterimmo' | 'macj', u: 'ht' | 'ttc', liste: Vente[]) => {
    window.localStorage.setItem('trx-affichage-montants', u);
    act(() => { root.unmount(); }); root = createRoot(container);
    listeCompromis = liste;
    await act(async () => { root.render(createElement(EcranSociete, { societe: s })); }); await calmer();
    await cliquer('[data-vue="compromis"]');
  };
  const centimes = (t: string): number => Math.round(Number(t.replace(/[^\d,-]/g, '').replace(',', '.')) * 100);
  const cadres = (sel: string): number => [...container.querySelectorAll(`${sel} .trx-calcul-encadre`)].reduce((t, x) => t + centimes(x.querySelector('.trx-calcul-resultat')!.textContent!), 0);
  const res = (sel: string): number => centimes(container.querySelector(`${sel} .trx-calcul-resultat`)!.textContent!);

  for (const u of ['ttc', 'ht'] as const) {
    it(`« Location ? » en ${u.toUpperCase()} : Commission 7 500, − Apporteur 1 000 (rouge, « Gardien Dacquet » dessous), = Honoraires (7 500 − 1 000) × 50 % = 3 250 de chaque côté ; plus de cadre d’apporteur`, async () => {
      await ecran('criterimmo', u, [location]); await deplier(37);
      const T = u === 'ttc';
      const m = (ttc: string, ht: string): string => (T ? `${ttc} € TTC` : `${ht} € HT`);
      const p = (ttc: string, ht: string): string => (T ? `(${ht} € HT)` : `(${ttc} € TTC)`);
      for (const [cote, mot, h] of [['entree', 'vendeur', '2 708,34'], ['sortie', 'acquéreur', '2 708,33']] as const) {
        const b = `[data-negociateur-cote="${cote}"]`;
        expect(texte(`${b} [data-entete-commission]`)).toBe(`Commission de la vente ${m('7 500', '6 250')} ${p('7 500', '6 250')}`);
        expect(texte(`${b} [data-entete-apporteur]`)).toBe(`− Apporteur : Gardien Dacquet ${m('1 000', '833,33')} ${p('1 000', '833,33')}`); // LOT BC : une ligne
        expect(container.querySelector(`${b} [data-entete-apporteur] .trx-calcul-resultat`)!.className).toContain('trx-rouge');
        expect(texte(`${b} [data-entete-apporteur-nom]`)).toBe('Gardien Dacquet');
        // HT : la nette (5 416,67) ne se partage pas juste en deux (2 708,333…) : le centime va à la porteuse (CRITERIMMO, l'entrée) — lot AH
        expect(texte(`${b} [data-honoraires-cote]`)).toBe(`= Honoraires partie ${mot} : (${m('7 500', '6 250')} − ${m('1 000', '833,33')}) × 50 % = ${m('3 250', h)} ${p('3 250', h)}`);
        expect(container.querySelector(`${b} [data-honoraires-cote]`)!.className).toContain('trx-calcul-total');
        expect(container.querySelector(`${b} [data-quote-part]`)).toBeNull();
        // la ventilation = les honoraires nets de la partie, au centime
        expect(cadres(b)).toBe(res(`${b} [data-honoraires-cote]`));
      }
      // les deux nets + l'apporteur = la commission de la vente ; les mêmes nets que le tableau « Répartition »
      expect(res('[data-negociateur-cote="entree"] [data-honoraires-cote]') + res('[data-negociateur-cote="sortie"] [data-honoraires-cote]') + res('[data-negociateur-cote="entree"] [data-entete-apporteur]'))
        .toBe(T ? 750000 : 625000);
      const table = [0, 1].map((i) => centimes(container.querySelector(`[data-part-partie-compromis="${i}"] [data-montant-grand]`)!.textContent!));
      expect(table).toEqual([res('[data-negociateur-cote="entree"] [data-honoraires-cote]'), res('[data-negociateur-cote="sortie"] [data-honoraires-cote]')]);
      expect(container.querySelector('[data-ventilation-incomplete]')).toBeNull();
    });
  }

  it('sans apporteur : l’en-tête sur une seule ligne (FABARRO, « Honoraires partie vendeur : 25 000 € TTC × 50 % = 12 500 € TTC ») ; le cadre à 0 n’est pas affiché', async () => {
    await ecran('criterimmo', 'ttc', [fabarro]); await deplier(260);
    expect(texte('[data-honoraires-cote="entree"]')).toBe('Honoraires partie vendeur : 25 000 € TTC × 50 % = 12 500 € TTC (10 416,66 € HT)');
    expect(container.querySelector('[data-entete-commission], [data-entete-apporteur]')).toBeNull();
    // acquéreurs côté CRITERIMMO : « Part de l'agence CRITERIMMO 0 € » disparaît, il ne reste que le reversé à MACJ (12 500)
    expect(container.querySelector('[data-part-agence="sortie"]')).toBeNull();
    expect([...container.querySelectorAll('[data-negociateur-cote="sortie"] .trx-calcul-encadre')].map((x) => x.getAttribute('data-reverse-cote'))).toEqual(['sortie']);
    expect(cadres('[data-negociateur-cote="sortie"]')).toBe(res('[data-honoraires-cote="sortie"]'));
  });

  it('cadres à 0 : la carte d’une partie à 0 % n’a plus aucun cadre (ni part de l’agence 0, ni commission 0) ; « Statut à la vente » d’un non commissionné reste', async () => {
    const tout = v({ id: 261, societe: 'macj', libelle: 'TOUT À L’ENTRÉE', ttc: 25000, parties: [pa('entree', PT, 100)], lignes: [lt(5, PT.nom, 'entree', 12500), lt(6, PT.nom, 'sortie', 0)], e: PT, s: PT });
    await ecran('macj', 'ttc', [tout]); await deplier(261);
    expect(texte('[data-honoraires-cote="sortie"]')).toBe('Honoraires partie acquéreur : 25 000 € TTC × 0 % = 0 € TTC (0 € HT)');
    expect(container.querySelectorAll('[data-negociateur-cote="sortie"] .trx-calcul-encadre')).toHaveLength(0);
    await ecran('criterimmo', 'ttc', [location]); await deplier(37);
    expect(container.querySelector('[data-statut-vente="entree"]')).toBeNull(); // LOT BE : « Statut à la vente » retiré (accord d'Arno)
    expect(container.querySelector('[data-commission-negociateur="entree"]')).toBeNull();
  });

  it('les centimes (lot AH, chaque unité à part, depuis les valeurs exactes) : une division juste ne reporte aucun centime — 7 200 TTC à 50 / 50 : 3 000,00 € HT de chaque côté, partout', async () => {
    const juste = v({ id: 263, libelle: 'JUSTE', ttc: 7200, parties: [pa('entree', JB, 50), pa('sortie', PT, 50)], lignes: [], e: JB, s: PT });
    await ecran('criterimmo', 'ht', [juste]); await deplier(263);
    expect(['entree', 'sortie'].map((c) => texte(`[data-honoraires-cote="${c}"] .trx-calcul-resultat`))).toEqual(['3 000 € HT', '3 000 € HT']);
    expect([0, 1].map((i) => texte(`[data-part-partie-compromis="${i}"] [data-montant-grand]`))).toEqual(['3 000 € HT', '3 000 € HT']);
    expect(texte('[data-reverse-cote="sortie"] .trx-calcul-resultat')).toBe('3 000 € HT');
    await cliquer('[data-tuile="commissions"]');
    expect(document.querySelector('[data-fenetre-commissions] [data-sous-total="inter-cabinet-macj"]')!.textContent!.replace(/\s/g, ' ')).toContain('3 000 € HT');
  });

  it('plusieurs apporteurs : une ligne rouge par apporteur dans l’en-tête, chacun son nom dessous', async () => {
    const { VentilationPartie } = await import('./OngletCompromis');
    const { ventilationVente } = await import('../../../../lib/transaction/partAgence');
    const x = ventilationVente(location, 'criterimmo').entree!;
    const deux = { ...x, apporteurs: [{ nom: 'Gardien Dacquet', m: { htC: 41667, ttcC: 50000 } }, { nom: 'Julien Deblois', m: { htC: 41666, ttcC: 50000 } }] };
    window.localStorage.setItem('trx-affichage-montants', 'ttc');
    await act(async () => { root.render(createElement(VentilationPartie, { x: deux, groupe: 'tete' })); }); await calmer();
    expect([...container.querySelectorAll('[data-entete-apporteur]')].map((e) => e.textContent!.replace(/\s/g, ' '))).toEqual([
      '− Apporteur : Gardien Dacquet 500 € TTC (416,67 € HT)', '− Apporteur : Julien Deblois 500 € TTC (416,66 € HT)']); // LOT BC : une ligne par apporteur
    expect(texte('[data-honoraires-cote]')).toBe('= Honoraires partie vendeur : (7 500 € TTC − 500 € TTC − 500 € TTC) × 50 % = 3 250 € TTC (2 708,34 € HT)');
  });
});

describe('🔴 LOT BC — « − Apporteur : [nom] » sur une seule ligne, le montant rouge à droite', () => {
  it('sans nom : « − Apporteur : à renseigner » ; le nom et le montant dans la même ligne de calcul (le montant ne s’en sépare jamais)', async () => {
    const { VentilationPartie } = await import('./OngletCompromis');
    const { ventilationVente } = await import('../../../../lib/transaction/partAgence');
    const v: Vente = { ...compromis, honorairesTtc: 7500, apporteur: null, retroApporteur: { montant: 1000, unite: 'ttc' }, lignes: [],
      repartition: { retroApporteurTtc: 1000, parties: [compromis.repartition!.parties[0], { ...compromis.repartition!.parties[1], pourcentage: 60 }] } };
    const x = ventilationVente(v, 'criterimmo').entree!;
    window.localStorage.setItem('trx-affichage-montants', 'ttc');
    await act(async () => { root.render(createElement(VentilationPartie, { x, groupe: 'tete' })); }); await calmer();
    const ligne = container.querySelector('[data-entete-apporteur]')!;
    expect(ligne.textContent!.replace(/\s/g, ' ')).toBe('− Apporteur : à renseigner 1 000 € TTC (833,33 € HT)');
    expect(ligne.querySelector('[data-entete-apporteur-nom]')!.className).toBe('trx-a-renseigner');
    // une seule ligne de calcul : le libellé (avec le nom) et le montant rouge, dans la même grille ; plus de ligne de nom à part
    expect([ligne.querySelector('.trx-calcul-libelle [data-entete-apporteur-nom]') !== null, ligne.querySelector('.trx-calcul-resultat')!.className.includes('trx-rouge'),
      ligne.querySelector('.trx-calcul-dont')]).toEqual([true, true, null]);
  });
});

describe('🔴 LOT BD — l’en-tête de chaque carte (la base) dans un cadre à liseré gris ; puis les verts, puis les rouges', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const lc = (id: number, nego: string, cote: 'entree' | 'sortie', ttc: number) => ({ id, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc, montantHt: null, cote,
    nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  // 41 : 12 000 TTC, apporteur Julien Deblois 2 400 ; JB (CRITERIMMO, indépendant) 40 %, 1 200 TTC ; Mylène (MACJ) 40 % ; Agence du Parc 20 %.
  const avec: Vente = { ...compromis, lignes: [lc(1, JB.nom, 'entree', 1200)] };
  const groupes = (sel: string): string[] => [...container.querySelectorAll(`${sel} .trx-cadre-base, ${sel} .trx-calcul-encadre`)]
    .map((x) => (x.classList.contains('trx-cadre-base') ? 'gris' : x.className.includes('--deduite') ? 'rouge' : 'vert'));

  it('carte avec apporteur : le cadre gris contient « Commission de la vente », « − Apporteur : … » et « = Honoraires partie … » ; ordre gris, verts, rouges', async () => {
    window.localStorage.setItem('trx-affichage-montants', 'ttc');
    listeCompromis = [avec]; await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(41);
    const base = container.querySelector('[data-negociateur-cote="entree"] .trx-cadre-base')!;
    expect([...base.querySelectorAll('[data-entete-commission], [data-entete-apporteur], [data-honoraires-cote]')].map((x) => [...x.attributes].map((a) => a.name).find((n) => n.startsWith('data-entete') || n === 'data-honoraires-cote')))
      .toEqual(['data-entete-commission', 'data-entete-apporteur', 'data-honoraires-cote']);
    expect(base.querySelector('.trx-calcul-encadre')).toBeNull(); // les lignes de la base ne sont pas des cadres
    expect(groupes('[data-negociateur-cote="entree"]')).toEqual(['gris', 'vert', 'rouge', 'rouge']);
    expect(groupes('[data-negociateur-cote="sortie"]')).toEqual(['gris', 'rouge', 'rouge']);
    // la ligne miroir : « Honoraires reçus de … » dans le cadre gris, puis le vert, puis la commission
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    listeCompromis = [venteDansSociete(avec, 'macj')!];
    act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
    await cliquer('[data-vue="compromis"]'); await cliquer('[data-deplier="miroir-41"]');
    expect(container.querySelector('[data-remuneration="sortie"] .trx-cadre-base [data-honoraires-cote]')!.textContent).toContain('Honoraires reçus de CRITERIMMO');
    expect(groupes('[data-remuneration="sortie"]')).toEqual(['gris', 'vert', 'rouge']);
  });

  it('le gris : une variable commune, en clair et en sombre, distincte du vert et du rouge ; même forme que les autres cadres ; même espacement', async () => {
    const { CSS_TRANSACTION } = await import('./commun');
    const css = CSS_TRANSACTION.replace(/\s+/g, ' ');
    for (const r of ['.svv-adm-root{--trx-lisere-base:#7b8594}', ".svv-adm-root[data-theme='dark']{--trx-lisere-base:#a3adbb}", ".svv-adm-root[data-theme='system']{--trx-lisere-base:#a3adbb}",
      '.trx-cadre-base{border:1.5px solid var(--trx-lisere-base);border-radius:10px;padding:6px 8px;', '.trx-ventilation{display:flex;flex-direction:column;gap:8px}',
      '.trx-calcul-encadre{border:1.5px solid var(--color-svv-red);border-radius:10px;padding:6px 8px;']) expect(css).toContain(r);
  });
});

describe('🔴 LOT BE — « Statut à la vente : … — non commissionné » retiré partout (accord d’Arno) ; le nom reste lisible ; aucun montant ne change', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; window.localStorage.setItem('trx-affichage-montants', 'ttc'); });
  afterEach(() => { delete ref.uniteCommission; });
  const CJ = { id: 9, nom: 'Cédric JULLIEN', societe: 'macj' as const };
  const pa = (sorte: 'entree' | 'sortie', n: { id: number; nom: string; societe: 'criterimmo' | 'macj' }, pct: number, o: Record<string, unknown> = {}) => ({ sorte, compteId: n.id,
    negociateur: n.nom, societe: n.societe, nom: null, coordonnees: null, pourcentage: pct, montantHt: null, statut: 'independant' as const, ...o });
  const vente = (statut: 'associe' | 'salarie'): Vente => ({ ...compromis, id: 70, honorairesTtc: 6000, apporteur: null, retroApporteur: null, lignes: [],
    repartition: { retroApporteurTtc: 0, parties: [pa('entree', JB, 50, { statut, commissionne: false }), pa('sortie', CJ, 50, { statut, commissionne: false })] as never },
    dossier: { ...compromis.dossier!, entree: { id: JB.id, nom: JB.nom }, sortie: { id: CJ.id, nom: CJ.nom } } });
  const ecran = async (s: 'criterimmo' | 'macj', liste: Vente[]) => {
    act(() => { root.unmount(); }); root = createRoot(container);
    listeCompromis = liste;
    await act(async () => { root.render(createElement(EcranSociete, { societe: s })); }); await calmer();
    await cliquer('[data-vue="compromis"]');
  };

  for (const statut of ['associe', 'salarie'] as const) {
    it(`${statut === 'associe' ? 'associé' : 'salarié'} non commissionné : ni sur la carte (CRITERIMMO), ni sur la ligne miroir (MACJ) ; nom sur le bouton ; montants inchangés`, async () => {
      await ecran('criterimmo', [vente(statut)]); await deplier(70);
      expect(container.textContent).not.toContain('Statut à la vente');
      expect(container.querySelector('[data-statut-vente]')).toBeNull();
      expect(texte('[data-negociateur-carte="entree"]')).toBe('Négociateur : Jean-Baptiste PONS · non commissionné');
      expect(texte('[data-part-agence="entree"] .trx-calcul-resultat')).toBe('3 000 € TTC');
      expect(texte('[data-part-agence="entree"] [data-mention-commission]')).toBe(statut === 'associe' ? 'Comptés dans le CA de Jean-Baptiste PONS (associé)' : 'Reste dans le CA de CRITERIMMO — non reversé'); // LOT BI
      expect(texte('[data-reverse-cote="sortie"] .trx-calcul-resultat')).toBe('3 000 € TTC');
      const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
      await ecran('macj', [venteDansSociete(vente(statut), 'macj')!]); await cliquer('[data-deplier="miroir-70"]');
      expect(container.textContent).not.toContain('Statut à la vente');
      expect(container.querySelector('[data-remuneration-statut]')).toBeNull();
      expect(texte('[data-remuneration-negociateur="sortie"]')).toBe('Cédric JULLIEN (MACJ) · non commissionné');
      expect(texte('[data-non-commissionne="sortie"]')).toBe('Non commissionné');
      expect(texte('[data-remuneration="sortie"] [data-honoraires-cote]')).toBe('Honoraires reçus de CRITERIMMO 3 000 € TTC (2 500 € HT)');
      expect(texte('[data-part-agence="sortie"] [data-mention-commission]')).toBe(statut === 'associe' ? 'Comptés dans le CA de Cédric JULLIEN (associé)' : 'Reste dans le CA de MACJ — non reversé'); // LOT BI
      expect(texte('[data-part-agence="sortie"] .trx-calcul-resultat')).toBe('3 000 € TTC');
    });
  }
});

describe('🔴 LOT BG — la ligne résultat du cadre gris ressort : trame, filet (avec apporteur), montant plus grand, « base des calculs ci-dessous »', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; window.localStorage.setItem('trx-affichage-montants', 'ttc'); });
  afterEach(() => { delete ref.uniteCommission; });
  const ecran = async (s: 'criterimmo' | 'macj', liste: Vente[]) => {
    act(() => { root.unmount(); }); root = createRoot(container);
    listeCompromis = liste;
    await act(async () => { root.render(createElement(EcranSociete, { societe: s })); }); await calmer();
    await cliquer('[data-vue="compromis"]');
  };
  const sansApporteur: Vente = { ...compromis, id: 71, apporteur: null, retroApporteur: null, lignes: [], repartition: { ...compromis.repartition!, retroApporteurTtc: 0 } };

  it('avec apporteur (41) : la ligne « = Honoraires partie … » dans le bloc résultat, avec filet, après l’apporteur ; la note dessous ; le texte de la ligne inchangé', async () => {
    await ecran('criterimmo', [compromis]); await deplier(41);
    const base = container.querySelector('[data-negociateur-cote="entree"] .trx-cadre-base')!;
    const bloc = base.querySelector('[data-base-resultat="entree"]')!;
    expect(bloc.className).toBe('trx-calcul-base-resultat trx-calcul-base-resultat--filet');
    expect(bloc.querySelector('[data-honoraires-cote="entree"]')).not.toBeNull();
    expect(texte('[data-base-note="entree"]')).toBe('base des calculs ci-dessous');
    expect(base.querySelector('[data-entete-apporteur]')!.compareDocumentPosition(bloc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bloc.lastElementChild!.getAttribute('data-base-note')).toBe('entree'); // la dernière ligne du cadre gris
    expect(texte('[data-honoraires-cote="entree"]')).toBe('= Honoraires partie vendeur : (12 000 € TTC − 2 400 € TTC) × 50 % = 4 800 € TTC (4 000 € HT)');
  });

  it('sans apporteur et sur la ligne miroir : le bloc résultat est seul (trame sur tout le cadre, sans filet), avec sa note', async () => {
    await ecran('criterimmo', [sansApporteur]); await deplier(71);
    expect(container.querySelector('[data-base-resultat="entree"]')!.className).toBe('trx-calcul-base-resultat trx-calcul-base-resultat--seule');
    expect(container.querySelector('[data-negociateur-cote="entree"] .trx-cadre-base')!.children).toHaveLength(1);
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    await ecran('macj', [venteDansSociete(compromis, 'macj')!]); await cliquer('[data-deplier="miroir-41"]');
    const b = container.querySelector('[data-remuneration="sortie"] [data-base-resultat]')!;
    expect([b.className, texte('[data-remuneration="sortie"] [data-base-note]')]).toEqual(['trx-calcul-base-resultat trx-calcul-base-resultat--seule', 'base des calculs ci-dessous']);
    expect(b.querySelector('[data-honoraires-cote]')!.textContent).toContain('Honoraires reçus de CRITERIMMO');
  });

  it('le style : trame des sommes, coins du bas assortis au cadre, filet, libellé en gras, montant un cran au-dessus, note petite et grise', async () => {
    const { CSS_TRANSACTION } = await import('./commun');
    const css = CSS_TRANSACTION.replace(/\s+/g, ' ');
    for (const r of ['.trx-calcul-base-resultat{display:flex;flex-direction:column;gap:2px;background:var(--trx-trame);margin:0 -8px -6px;padding:6px 8px;border-radius:0 0 8.5px 8.5px}',
      '.trx-calcul-base-resultat--seule{margin:-6px -8px;border-radius:8.5px}', '.trx-calcul-base-resultat--filet{border-top:1px solid var(--color-svv-line)}',
      '.trx-calcul-base-resultat .trx-calcul-libelle{font-weight:700}', '.trx-calcul-base-resultat .trx-calcul-resultat{font-size:1.15rem;font-weight:800}',
      '.trx-calcul-base-note{font-size:.75rem;color:var(--color-svv-muted)}', '.trx-calcul-cote{margin:0;font-size:.88rem;']) expect(css).toContain(r);
  });
});

describe('🔴 LOT BH — l’apporteur d’une affaire déjà créée : ajouter, modifier, changer, créer, retirer (Informations communes et « Modifier »)', () => {
  const ref = references as Record<string, unknown>;
  const apporteurs = ref.apporteurs;
  beforeEach(() => {
    ref.uniteCommission = true;
    ref.apporteurs = [{ id: 4, nom: 'Julien Deblois' }, { id: 16, nom: 'Gardien Dacquet' }];
    ref.collegues = [{ id: 2, libelle: 'Arnaud Jorel', actif: true }, { id: 5, libelle: 'Jean-Baptiste PONS', actif: true }];
    window.localStorage.setItem('trx-affichage-montants', 'ttc');
  });
  afterEach(() => { delete ref.uniteCommission; ref.apporteurs = apporteurs; delete ref.collegues; delete ref.disponible; });
  const lc = (id: number, nego: string, cote: 'entree' | 'sortie', ttc: number) => ({ id, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc, montantHt: null, cote,
    nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  // 41 : apporteur Julien Deblois (annuaire n° 4), 2 400 TTC ; JB (CRITERIMMO, indépendant) avec 1 200 TTC SAISIS À LA MAIN (le calcul en diffère).
  const avec: Vente = { ...compromis, lignes: [lc(1, JB.nom, 'entree', 1200)] };
  const sans: Vente = { ...compromis, id: 72, apporteur: null, retroApporteur: null, lignes: [], repartition: { ...compromis.repartition!, retroApporteurTtc: 0 },
    dossier: { ...compromis.dossier!, apporteurId: null } };
  const doc = (sel: string): string => document.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
  const cliquerDoc = async (sel: string) => { await act(async () => { (document.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const saisirDoc = async (sel: string, valeur: string) => {
    const el = document.querySelector(sel) as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { set.call(el, valeur); el.dispatchEvent(new Event('input', { bubbles: true })); });
  };
  const ecran = async (liste: Vente[], id: number) => {
    act(() => { root.unmount(); }); root = createRoot(container);
    listeCompromis = liste;
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'criterimmo' })); }); await calmer();
    await cliquer('[data-vue="compromis"]'); await deplier(id);
  };
  const envoi = () => (posts.filter((p) => p.action === 'dossier-enregistrer').at(-1) as { id: number; dossier: Record<string, unknown> } | undefined);
  const choisir = async (id: number | '+') => { await cliquerDoc('[data-champ="apporteur-fenetre-annuaire"]'); await cliquerDoc(`[role="option"][data-option="${id}"]`); };

  it('sans apporteur : « + Ajouter un apporteur » (ni Modifier ni Supprimer) ; la fenêtre : l’annuaire et le montant ; « Valider » enregistre (dossier, journalisé) et tout se relit', async () => {
    await ecran([sans], 72);
    const ligne = '[data-info="apporteur"]';
    expect(container.querySelector(`${ligne} [data-ajouter-apporteur]`)).not.toBeNull();
    expect(container.querySelector(`${ligne} [data-modifier-apporteur], ${ligne} [data-supprimer-apporteur]`)).toBeNull();
    await cliquer(`${ligne} [data-ajouter-apporteur]`);
    expect(document.querySelector('[data-fenetre-apporteur="choix"]')!.getAttribute('role')).toBe('dialog');
    expect(doc('.trx-ap-titre')).toBe('Ajouter un apporteur');
    await choisir(16);
    await saisirDoc('[data-champ="apporteur-fenetre"]', '1000');
    // ce que le serveur relira après l'enregistrement (simulé : rien n'est écrit)
    listeCompromis = [{ ...sans, apporteur: 'Gardien Dacquet', retroApporteur: { montant: 1000, unite: 'ttc' }, repartition: { ...sans.repartition!, retroApporteurTtc: 1000 },
      dossier: { ...sans.dossier!, apporteurId: 16 } }];
    await cliquerDoc('[data-valider-apporteur]');
    const e = envoi()!;
    expect([e.id, e.dossier.apporteurId, e.dossier.retroApporteurTtc, e.dossier.retroApporteurUnite, e.dossier.retirerApporteur]).toEqual([72, 16, '1000', 'ttc', undefined]);
    expect(document.querySelector('[data-fenetre-apporteur]')).toBeNull();
    // recalculé, sans recharger : le cadre gris des deux cartes, la Répartition, les boutons
    if (container.querySelector('[data-entete-apporteur="entree"]') === null) await deplier(72);
    expect(texte('[data-entete-apporteur="entree"]')).toBe('− Apporteur : Gardien Dacquet 1 000 € TTC (833,33 € HT)');
    expect(texte('[data-honoraires-cote="sortie"]')).toBe('= Honoraires partie acquéreur : (12 000 € TTC − 1 000 € TTC) × 50 % = 5 500 € TTC (4 583,33 € HT)');
    expect(texte('[data-ligne-repartition="base"] [data-montant-grand]')).toBe('11 000 € TTC');
    expect(container.querySelector(`${ligne} [data-modifier-apporteur]`)).not.toBeNull();
    expect(container.querySelector('[data-ventilation-incomplete]')).toBeNull();
    // les tuiles : CA − commissions versées = solde, au centime
    const centimes = (t: string): number => Math.round(Number(t.replace(/[^\d,-]/g, '').replace(',', '.')) * 100);
    const grand = (t: string): number => centimes(container.querySelector(`[data-tuile="${t}"]`)!.children[1].children[0].textContent!);
    expect(grand('ca') - grand('commissions')).toBe(grand('solde'));
  });

  it('un montant vide ou nul est refusé (message clair, rien n’est envoyé) ; « Annuler » ferme sans rien changer', async () => {
    await ecran([sans], 72);
    await cliquer('[data-info="apporteur"] [data-ajouter-apporteur]');
    await cliquerDoc('[data-valider-apporteur]');
    expect(doc('[data-motif-apporteur]')).toBe('Choisissez l’apporteur dans l’annuaire (ou créez-le). Rien n’a été enregistré.');
    await choisir(16);
    await saisirDoc('[data-champ="apporteur-fenetre"]', '0');
    await cliquerDoc('[data-valider-apporteur]');
    expect(doc('[data-motif-apporteur]')).toBe('Le montant de la commission de l’apporteur doit être supérieur à 0. Pour retirer l’apporteur de cette affaire, utilisez « Supprimer ».');
    expect(envoi()).toBeUndefined();
    await cliquerDoc('[data-annuler-apporteur]');
    expect(document.querySelector('[data-fenetre-apporteur]')).toBeNull();
    expect(envoi()).toBeUndefined();
  });

  it('avec apporteur : « Modifier » (montant, puis autre apporteur) ; la commission saisie à la main n’est pas recalculée (elle part « manuelle »)', async () => {
    await ecran([avec], 41);
    expect(texte('[data-info="apporteur"]')).toContain('Julien Deblois2 400 € TTC (2 000 € HT)');
    await cliquer('[data-info="apporteur"] [data-modifier-apporteur]');
    expect(doc('.trx-ap-titre')).toBe('Modifier l’apporteur');
    expect((document.querySelector('[data-champ="apporteur-fenetre"]') as HTMLInputElement).value.replace(/\s/g, ' ')).toBe('2 400');
    await saisirDoc('[data-champ="apporteur-fenetre"]', '3000');
    await cliquerDoc('[data-valider-apporteur]');
    let e = envoi()!;
    expect([e.dossier.apporteurId, e.dossier.retroApporteurTtc, e.dossier.retroApporteurUnite]).toEqual([4, '3000', 'ttc']);
    expect((e.dossier.commissions as { entree: { montant: string; mode: string } }).entree).toMatchObject({ montant: '1200', mode: 'manuelle' });
    await cliquer('[data-info="apporteur"] [data-modifier-apporteur]');
    await choisir(16);
    await cliquerDoc('[data-valider-apporteur]');
    e = envoi()!;
    expect([e.dossier.apporteurId, e.dossier.retroApporteurTtc]).toEqual([16, '2400']);
  });

  it('créer un nouvel apporteur depuis la fenêtre (comme à la création) : créé, il est choisi, et « Valider » l’enregistre sur l’affaire', async () => {
    const avant = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const corps = init?.method === 'POST' ? JSON.parse(String(init.body)) : null;
      if (corps?.action === 'apporteur-creer') { posts.push(corps); return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: { id: 99 } }) }; }
      return (avant as unknown as (u: string, i?: RequestInit) => Promise<unknown>)(url, init);
    }) as unknown as typeof fetch;
    try {
      await ecran([sans], 72);
      await cliquer('[data-info="apporteur"] [data-ajouter-apporteur]');
      await choisir('+');
      await saisirDoc('[data-nouvel-apporteur-champ="nom"]', 'Dupont');
      await saisirDoc('[data-nouvel-apporteur-champ="prenom"]', 'Léa');
      await cliquerDoc('[data-nouvel-apporteur-collegue]'); await cliquerDoc('[role="option"][data-option="5"]');
      await cliquerDoc('[data-creer-apporteur-transaction]');
      expect(posts.find((p) => p.action === 'apporteur-creer')).toMatchObject({ apporteur: { nom: 'Léa Dupont', collegueId: 5 } });
      expect(doc('[data-champ="apporteur-fenetre-annuaire"]')).toBe('Léa Dupont');
      await saisirDoc('[data-champ="apporteur-fenetre"]', '500');
      await cliquerDoc('[data-valider-apporteur]');
      expect([envoi()!.dossier.apporteurId, envoi()!.dossier.retroApporteurTtc]).toEqual([99, '500']);
    } finally { globalThis.fetch = avant; }
  });

  for (const u of ['ttc', 'ht'] as const) {
    it(`« Supprimer » (${u.toUpperCase()}) : la confirmation dit qui et combien ; « Annuler » ne fait rien ; « Oui, retirer » retire le seul lien (retirerApporteur)`, async () => {
      window.localStorage.setItem('trx-affichage-montants', u);
      await ecran([avec], 41);
      await cliquer('[data-info="apporteur"] [data-supprimer-apporteur]');
      expect(doc('[data-question-retrait]')).toBe(`Retirer Julien Deblois de cette affaire ? Sa commission de ${u === 'ttc' ? '2 400 € TTC' : '2 000 € HT'} ne sera plus déduite.`);
      await cliquerDoc('[data-annuler-apporteur]');
      expect([document.querySelector('[data-fenetre-apporteur]'), envoi()]).toEqual([null, undefined]);
      await cliquer('[data-info="apporteur"] [data-supprimer-apporteur]');
      await cliquerDoc('[data-confirmer-retrait-apporteur]');
      const e = envoi()!;
      expect([e.dossier.apporteurId, e.dossier.retroApporteurTtc, e.dossier.retirerApporteur, e.dossier.apporteurNom]).toEqual([null, '', true, undefined]);
    });
  }

  it('le formulaire « Modifier » : le même composant (ligne, Modifier / Supprimer) ; « Supprimer » change le formulaire, « Enregistrer » l’écrit', async () => {
    await ecran([avec], 41);
    await cliquer('[data-modifier-compromis="41"]');
    expect(texte('[data-apporteur-formulaire] [data-apporteur-affiche]')).toBe('Julien Deblois2 400 € TTC (2 000 € HT)');
    await cliquer('[data-apporteur-formulaire] [data-supprimer-apporteur]');
    await cliquerDoc('[data-confirmer-retrait-apporteur]');
    expect(envoi()).toBeUndefined(); // rien d'écrit avant « Enregistrer »
    expect(texte('[data-apporteur-formulaire] [data-apporteur-affiche]')).toBe('Aucun apporteur');
    await cliquer('[data-enregistrer-dossier]');
    expect([envoi()!.dossier.apporteurId, envoi()!.dossier.retirerApporteur]).toEqual([null, true]);
  });

  it('un observateur ne voit aucun bouton (et le serveur refuse ses écritures : 403, la garde centrale) ; la ligne miroir n’a pas ces boutons', async () => {
    ref.disponible = false;
    await ecran([avec], 41);
    expect(container.querySelector('[data-ajouter-apporteur], [data-modifier-apporteur], [data-supprimer-apporteur]')).toBeNull();
    expect(texte('[data-info="apporteur"]')).toContain('Julien Deblois');
    const { ecritureRefuseeObservateur } = await import('../../../../lib/admin/observateur');
    expect(ecritureRefuseeObservateur('observateur', 'POST', '/api/admin/transaction')).toBe(true);
    delete ref.disponible;
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    act(() => { root.unmount(); }); root = createRoot(container);
    listeCompromis = [venteDansSociete(avec, 'macj')!];
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
    await cliquer('[data-vue="compromis"]'); await cliquer('[data-deplier="miroir-41"]');
    expect(container.querySelector('[data-ajouter-apporteur], [data-modifier-apporteur], [data-supprimer-apporteur]')).toBeNull();
  });
});

describe('🔴 LOT BI — rattachement aux associés côté par côté : « Honoraires conservés par … », « Comptés dans le CA de … » ; plus aucun « pour moitié »', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const CJ = { id: 9, nom: 'Cédric JULLIEN', societe: 'criterimmo' as const };
  const AJ = { id: 2, nom: 'Arnaud Jorel', societe: 'criterimmo' as const };
  const PT = { id: 8, nom: 'Pierre Thevenin', societe: 'macj' as const };
  const lt = (id: number, nego: string, cote: 'entree' | 'sortie', ttc: number) => ({ id, negociateur: nego, role: 'negociateur' as const, montantTtc: ttc, montantHt: null, cote,
    nature: 'compromis' as const, compte: false, origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  const pa = (sorte: 'entree' | 'sortie', n: { id: number; nom: string; societe: 'criterimmo' | 'macj' }, statut: string, o: Record<string, unknown> = {}) => ({ sorte, compteId: n.id,
    negociateur: n.nom, societe: n.societe, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut, ...o });
  const v = (id: number, e: ReturnType<typeof pa>, s: ReturnType<typeof pa>, lignes: ReturnType<typeof lt>[] = [], o: Partial<Vente> = {}): Vente => ({
    ...compromis, id, libelle: `V${id}`, honorairesTtc: 7500, apporteur: 'Gardien Dacquet', retroApporteur: { montant: 1000, unite: 'ttc' }, lignes,
    repartition: { retroApporteurTtc: 1000, parties: [e, s] as never }, dossier: { ...compromis.dossier!, entree: { id: e.compteId, nom: e.negociateur }, sortie: { id: s.compteId, nom: s.negociateur } }, ...o });
  const ecran = async (societe: 'criterimmo' | 'macj', u: 'ht' | 'ttc', liste: Vente[], deplierSel: string) => {
    window.localStorage.setItem('trx-affichage-montants', u);
    act(() => { root.unmount(); }); root = createRoot(container);
    listeCompromis = liste;
    await act(async () => { root.render(createElement(EcranSociete, { societe })); }); await calmer();
    await cliquer('[data-vue="compromis"]'); await cliquer(deplierSel);
  };
  const vert = (cote: string) => texte(`[data-part-agence="${cote}"]`);

  for (const u of ['ttc', 'ht'] as const) {
    it(`« Location ? » en ${u.toUpperCase()} : deux associés, un par côté — vendeurs → Cédric JULLIEN, acquéreurs → Arnaud Jorel ; 3 250 / 3 250 ; aucun « pour moitié »`, async () => {
      const location = v(37, pa('entree', CJ, 'associe', { commissionne: false }), pa('sortie', AJ, 'associe', { commissionne: false }), [], { libelle: 'Location ?' });
      await ecran('criterimmo', u, [location], '[data-deplier="compromis-37"]');
      const m = u === 'ttc' ? (t: string, h: string) => `${t} € TTC (${h} € HT)` : (t: string, h: string) => `${h} € HT (${t} € TTC)`;
      expect(vert('entree')).toBe(`Honoraires conservés par CRITERIMMO : ${m('3 250', '2 708,33')} Comptés dans le CA de Cédric JULLIEN (associé)`);
      expect(vert('sortie')).toBe(`Honoraires conservés par CRITERIMMO : ${m('3 250', '2 708,34')} Comptés dans le CA de Arnaud Jorel (associé)`);
      expect(container.textContent).not.toContain('pour moitié');
      expect(container.textContent).not.toContain('aucune commission');
      // les montants de la société : inchangés (CA 7 500, versées = l'apporteur seul, solde 6 500)
      const t = (x: string) => texte(`[data-tuile="${x}"]`);
      expect([t('ca'), t('commissions'), t('solde')].map((x) => x.includes(u === 'ttc' ? '7 500 € TTC' : '6 250 € HT') || x.includes(u === 'ttc' ? '1 000 € TTC' : '833,33 € HT') || x.includes(u === 'ttc' ? '6 500 € TTC' : '5 416,67 € HT')))
        .toEqual([true, true, true]);
      expect(container.querySelector('[data-ventilation-incomplete]')).toBeNull();
    });
  }

  it('associé d’un côté, indépendant de l’autre : seul le côté de l’associé lui est compté ; l’autre : commission + part de l’agence non rattachée', async () => {
    await ecran('criterimmo', 'ttc', [v(80, pa('entree', CJ, 'associe', { commissionne: false }), pa('sortie', JB, 'independant'))], '[data-deplier="compromis-80"]');
    expect(vert('entree')).toBe('Honoraires conservés par CRITERIMMO : 3 250 € TTC (2 708,33 € HT) Comptés dans le CA de Cédric JULLIEN (associé)');
    expect(texte('[data-commission-negociateur="sortie"] .trx-calcul-resultat')).toBe('1 625 € TTC');
    expect(vert('sortie')).toBe('Part de l’agence CRITERIMMO : 3 250 € TTC − 1 625 € TTC = 1 625 € TTC (1 354,17 € HT) Reste dans le CA de CRITERIMMO — non reversé');
  });

  it('même associé des deux côtés : les deux côtés comptés dans son CA (100 % de la vente) ; associé commissionné : un seul cadre, « (associé, commissionné) »', async () => {
    await ecran('criterimmo', 'ttc', [v(81, pa('entree', CJ, 'associe'), pa('sortie', CJ, 'associe'), [lt(1, CJ.nom, 'entree', 1625)])], '[data-deplier="compromis-81"]');
    for (const cote of ['entree', 'sortie']) {
      expect(vert(cote)).toBe('Honoraires conservés par CRITERIMMO : 3 250 € TTC (2 708,3' + (cote === 'entree' ? '3' : '4') + ' € HT) Comptés dans le CA de Cédric JULLIEN (associé, commissionné)');
      expect(container.querySelector(`[data-commission-negociateur="${cote}"]`)).toBeNull();
    }
  });

  it('salarié des deux côtés : aucun rattachement (commission interne + part de l’agence qui reste dans le CA de la société)', async () => {
    await ecran('criterimmo', 'ttc', [v(82, pa('entree', JB, 'salarie'), pa('sortie', CJ, 'salarie'))], '[data-deplier="compromis-82"]');
    expect(container.textContent).not.toContain('Comptés dans le CA de');
    expect(container.querySelector('[data-commission-negociateur="entree"]')!.className).toContain('trx-calcul-encadre--interne');
    expect(texte('[data-part-agence="entree"] [data-mention-commission]')).toBe('Reste dans le CA de CRITERIMMO — non reversé');
  });

  it('ligne miroir : Pierre, associé de MACJ (la société qui reçoit) — la part reçue est comptée dans son CA ; côté porteuse, le reversé reste rouge', async () => {
    const x = v(83, pa('entree', JB, 'independant'), pa('sortie', PT, 'associe'), [lt(2, PT.nom, 'sortie', 1625)]);
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    await ecran('macj', 'ttc', [venteDansSociete(x, 'macj')!], '[data-deplier="miroir-83"]');
    expect(vert('sortie')).toBe('Honoraires conservés par MACJ : 3 250 € TTC (2 708,33 € HT) Comptés dans le CA de Pierre Thevenin (associé, commissionné)');
    expect(container.querySelector('[data-remuneration="sortie"] .trx-calcul-encadre--deduite, [data-remuneration="sortie"] .trx-calcul-encadre--interne')).toBeNull();
    await ecran('criterimmo', 'ttc', [x], '[data-deplier="compromis-83"]');
    expect(container.querySelector('[data-reverse-cote="sortie"]')!.className).toContain('trx-calcul-encadre--deduite');
    expect(container.textContent).not.toContain('Comptés dans le CA de Pierre');
  });
});

describe('🔴 LOT BJ — vendeurs / acquéreurs : particulier ou société ; un bouton par personne sur la carte, sa fenêtre de détail ; le formulaire', () => {
  const ref = references as Record<string, unknown>;
  beforeEach(() => { ref.personneType = true; ref.uniteCommission = true; window.localStorage.setItem('trx-affichage-montants', 'ttc'); });
  afterEach(() => { delete ref.personneType; delete ref.uniteCommission; delete ref.disponible; });
  const doc = (sel: string): string => document.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
  const cliquerDoc = async (sel: string) => { await act(async () => { (document.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
  const rep = (id: number, nom: string, prenom: string, o: Record<string, unknown> = {}) => ({ id, civilite: null, nom, prenom, telephone: null, email: null, adresse: null, ...o });
  const avecPersonnes: Vente = { ...compromis, dossier: { ...compromis.dossier!, personnes: [
    { id: 20, role: 'vendeur', nom: 'BERCIER', prenom: 'Mira', civilite: 'Mme', type: 'particulier', telephone: '06 11 22 33 44', email: 'mira@exemple.fr', adresse: '1 rue A, Puteaux' },
    { id: 21, role: 'vendeur', nom: 'DUPONT Jean', telephone: null, email: null, adresse: null }, // une fiche d'avant (sans type)
    { id: 22, role: 'acquereur', nom: 'CRITERIMMO', type: 'societe', civilite: null, prenom: null, telephone: null, email: null, adresse: null,
      representants: [rep(30, 'MARTIN', 'Paul', { civilite: 'M.', telephone: '06 99 88 77 66' }), rep(31, 'DURAND', 'Léa', { email: 'lea@x.fr' }), rep(32, 'PETIT', 'Ana')] },
  ] as never } };
  const ecran = async (liste: Vente[] = [avecPersonnes]) => {
    act(() => { root.unmount(); }); root = createRoot(container);
    listeCompromis = liste;
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'criterimmo' })); }); await calmer();
    await cliquer('[data-vue="compromis"]'); await deplier(41);
  };

  it('la carte : un bouton par personne (« Mme Mira BERCIER », « DUPONT Jean », « CRITERIMMO »), du style de « + Ajouter … », au-dessus de lui ; plus de coordonnées en clair', async () => {
    await ecran();
    const vendeurs = [...container.querySelectorAll('[data-colonne="vendeur"] [data-bouton-personne]')];
    expect(vendeurs.map((b) => b.textContent)).toEqual(['Mme Mira BERCIER', 'DUPONT Jean']);
    expect(vendeurs[0].className).toContain('svv-btn svv-btn-outline gst-btn');
    expect(texte('[data-colonne="acquereur"] [data-bouton-personne="22"]')).toBe('CRITERIMMO');
    expect(container.querySelector('[data-colonne="vendeur"]')!.textContent).not.toContain('06 11 22 33 44');
    const bloc = container.querySelector('[data-colonne="vendeur"] [data-personnes-compromis="vendeur"]')!;
    expect(bloc.compareDocumentPosition(container.querySelector('[data-colonne="vendeur"] [data-ajouter-personne-carte]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('la fenêtre de détail d’une société : type, ses 3 représentants et leurs coordonnées (liens) ; « Modifier » ouvre le formulaire sur elle ; Échap et la croix ferment', async () => {
    await ecran();
    await cliquer('[data-bouton-personne="22"]');
    const f = '[data-fenetre-personne="22"]';
    expect(document.querySelector(f)!.getAttribute('role')).toBe('dialog');
    expect(doc(`${f} [data-type-detail]`)).toBe('Société · acquéreur');
    expect(doc(`${f} [data-nb-representants]`)).toBe('3 représentants');
    expect([...document.querySelectorAll(`${f} [data-representant-detail] strong`)].map((x) => x.textContent)).toEqual(['M. Paul MARTIN', 'Léa DURAND', 'Ana PETIT']);
    expect(document.querySelector(`${f} [data-representant-detail="30"] a[href="tel:0699887766"]`)).not.toBeNull();
    expect(document.querySelector(`${f} [data-representant-detail="31"] a[href="mailto:lea@x.fr"]`)).not.toBeNull();
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); }); await calmer();
    expect(document.querySelector(f)).toBeNull();
    await cliquer('[data-bouton-personne="20"]');
    expect(document.querySelector('[data-fenetre-personne="20"] a[href="tel:0611223344"]')).not.toBeNull();
    await cliquerDoc('[data-fermer-personne]');
    expect(document.querySelector('[data-fenetre-personne]')).toBeNull();
    await cliquer('[data-bouton-personne="22"]');
    await cliquerDoc('[data-modifier-personne="22"]');
    expect(container.querySelector('[data-formulaire-dossier="41"]')).not.toBeNull();
    const focus = document.activeElement as HTMLInputElement;
    expect([focus.getAttribute('data-personne-nom') !== null, focus.value]).toEqual([true, 'CRITERIMMO']);
  });

  it('observateur : la fenêtre en lecture seule (sans « Modifier ») ; ligne miroir : les boutons, en lecture seule', async () => {
    ref.disponible = false;
    await ecran();
    await cliquer('[data-bouton-personne="20"]');
    expect(document.querySelector('[data-fenetre-personne="20"] [data-modifier-personne]')).toBeNull();
    await cliquerDoc('[data-fermer-personne]');
    delete ref.disponible;
    const { venteDansSociete } = await import('../../../../lib/transaction/interCabinet');
    act(() => { root.unmount(); }); root = createRoot(container);
    listeCompromis = [venteDansSociete(avecPersonnes, 'macj')!];
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); }); await calmer();
    await cliquer('[data-vue="compromis"]'); await cliquer('[data-deplier="miroir-41"]');
    expect([...container.querySelectorAll('[data-miroir-personnes] [data-bouton-personne]')].map((b) => b.textContent)).toEqual(['Mme Mira BERCIER', 'DUPONT Jean', 'CRITERIMMO']);
    await cliquer('[data-miroir-personnes] [data-bouton-personne="22"]');
    expect([doc('[data-fenetre-personne="22"] [data-nb-representants]'), document.querySelector('[data-fenetre-personne="22"] [data-modifier-personne]')]).toEqual(['3 représentants', null]);
  });

  it('le formulaire : « Particulier » | « Société » ; une société et ses représentants (+ / Enlever) ; passer de l’un à l’autre demande confirmation s’il y a quelque chose à perdre ; tout part au serveur', async () => {
    await ecran();
    await cliquer('[data-modifier-compromis="41"]');
    // la fiche d'avant (DUPONT Jean) : un particulier, son texte dans « Nom », un prénom vide
    const iDupont = [...container.querySelectorAll('[data-personne]')].findIndex((x) => (x.querySelector('[data-personne-nom]') as HTMLInputElement)?.value === 'DUPONT Jean');
    expect(iDupont).toBeGreaterThanOrEqual(0);
    expect((container.querySelector(`[data-personne-prenom="${iDupont}"]`) as HTMLInputElement).value).toBe('');
    // Mira (particulier, téléphone…) → Société : confirmation ; « Annuler » ne change rien
    await cliquer('[data-choix-type="0-societe"]');
    expect(texte('[data-confirmer-bascule="0"]')).toContain('Passer en Société : la civilité, le prénom, le téléphone, l’e-mail et l’adresse ne seront pas gardés. Continuer ?');
    await cliquer('[data-non-bascule]');
    expect(container.querySelector('[data-choix-type="0-particulier"]')!.getAttribute('aria-pressed')).toBe('true');
    // la société (CRITERIMMO) : 3 représentants ; on en enlève un, on en ajoute un ; Société → Particulier demande confirmation
    const iSoc = [...container.querySelectorAll('[data-personne]')].findIndex((x) => x.getAttribute('data-type-personne') === 'societe');
    expect(texte(`[data-representants="${iSoc}"] > span`)).toBe('3 représentants');
    await cliquer(`[data-enlever-representant="${iSoc}-2"]`);
    await cliquer(`[data-ajouter-representant="${iSoc}"]`);
    await saisir(`[data-personne-nom="${iSoc}-2"]`, 'NOUVEAU');
    await cliquer(`[data-choix-type="${iSoc}-particulier"]`);
    expect(texte(`[data-confirmer-bascule="${iSoc}"]`)).toContain('ses 3 représentants ne seront pas gardés');
    await cliquer('[data-non-bascule]');
    await cliquer('[data-enregistrer-dossier]');
    const envoi = posts.filter((p) => p.action === 'dossier-enregistrer').at(-1) as { dossier: { personnes: { nom: string; type: string; civilite: string; prenom: string; representants: { nom: string; id: number | null }[] }[] } };
    const soc = envoi.dossier.personnes.find((p) => p.type === 'societe')!;
    expect([soc.nom, soc.representants.map((r) => [r.id, r.nom])]).toEqual(['CRITERIMMO', [[30, 'MARTIN'], [31, 'DURAND'], [null, 'NOUVEAU']]]);
    expect(envoi.dossier.personnes.find((p) => p.nom === 'BERCIER')).toMatchObject({ type: 'particulier', civilite: 'Mme', prenom: 'Mira' });
  });

  it('une société avec 0 représentant ; un particulier sans civilité (« non renseignée ») ; rien à perdre : le passage se fait sans question', async () => {
    await ecran([{ ...compromis, dossier: { ...compromis.dossier!, personnes: [] } }]);
    await cliquer('[data-modifier-compromis="41"]');
    await saisir('[data-personne-nom="0"]', 'SCI DU PARC');
    await cliquer('[data-choix-type="0-societe"]');
    expect(container.querySelector('[data-confirmer-bascule]')).toBeNull();
    expect(texte('[data-representants="0"] > span')).toBe('Aucun représentant');
    await saisir('[data-personne-nom="1"]', 'BERCIER');
    expect((container.querySelector('[data-civilite="1"]') as HTMLSelectElement).value).toBe('');
    await cliquer('[data-enregistrer-dossier]');
    const p = (posts.filter((x) => x.action === 'dossier-enregistrer').at(-1) as { dossier: { personnes: Record<string, unknown>[] } }).dossier.personnes;
    expect(p.map((x) => [x.nom, x.type, x.civilite, (x.representants as unknown[]).length])).toEqual([['SCI DU PARC', 'societe', '', 0], ['BERCIER', 'particulier', '', 0]]);
  });

  it('sans la migration 443 : la liste d’avant sur la carte, et l’ancien formulaire (ni civilité, ni prénom, ni Particulier / Société)', async () => {
    delete ref.personneType;
    await ecran();
    expect(container.querySelector('[data-bouton-personne]')).toBeNull();
    expect(container.querySelector('ul[data-personnes-compromis="vendeur"]')).not.toBeNull();
    await cliquer('[data-modifier-compromis="41"]');
    expect(container.querySelector('[data-choix-type], [data-civilite], [data-personne-prenom]')).toBeNull();
    expect(container.querySelector('[data-personne-nom="0"]')).not.toBeNull();
  });
});
