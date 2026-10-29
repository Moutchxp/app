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
    expect(texte('[data-commission-en-cours]')).toBe('sur 10 000,00 € HT de commission · dont inter-cabinet extérieur : 1 600,00 € HT');
    // (12 000 − 2 400) ÷ 1,2 = 8 000 HT nets ; 40 % = 3 200 nets — 🔴 LOT R : CRITERIMMO (JB à l'entrée) PORTE la vente : son CA est la
    // commission entière, 10 000 HT ; elle reverse MACJ (3 200) et l'extérieur (1 600) et paie l'apporteur (2 000) : le solde redonne sa part, 3 200.
    expect(texte('[data-part-compromis="criterimmo"]')).toBe('CA de la vente : 10 000,00 € HT · dont reversé en inter-cabinet : 4 800,00 € HT');
    expect(texte('[data-ca-ht]')).toBe('10 000,00 € HT');
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
    // 🔴 LOT R — au global : le CA de chaque société (CRITERIMMO porte : 10 000 ; MACJ reçoit 3 200), l'inter-cabinet neutralisé.
    expect(texte('[data-part-compromis="macj"]')).toBe('CA MACJ : 3 200,00 € HT');
    expect(texte('[data-ca-ht]')).toBe('10 000,00 € HT');
    expect(texte('[data-neutralise-compromis]')).toBe('Inter-cabinet entre nos sociétés : 3 200,00 € HT (neutralisé)');
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
    // LOT U — les parts calculées au centime.
    expect([...container.querySelectorAll('[data-partie-eur]')].map((i) => (i as HTMLInputElement).value.replace(/\s/g, ' '))).toEqual(['5 000,00', '5 000,00']);
    expect(texte('[data-societe-partie="0"]')).toBe('négociateur à choisir');
    expect(texte('[data-total-pct]')).toBe('100 %');
    // LOT U — la phrase « sur … de commission nette » est remplacée par la base de répartition en tête.
    expect(texte('[data-total-repartition]')).not.toContain('de commission nette');
    expect(texte('[data-resume="base"] [data-resume-ht="base"]')).toBe('10 000,00 €');
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
    expect(texte('[data-parts-societes]')).toContain('Part CRITERIMMO : 5 000,00 € HT (50 %) · Part MACJ : 5 000,00 € HT (50 %)'); // LOT N : le % de chaque part
    await choisir('sortie', 5);
    expect(pcts()).toEqual(['100', '0']);
  });
  it('saisie en % ou en € HT : l’un recalcule l’autre', async () => {
    await nouveau();
    await choisir('entree', 5); await choisir('sortie', 7);
    await saisir('[data-partie-pct="0"]', '60');
    expect((container.querySelector('[data-partie-eur="0"]') as HTMLInputElement).value.replace(/\s/g, ' ')).toBe('6 000,00');
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
    expect(texte('[data-parts-societes]')).toContain('part extérieure (inter-cabinet extérieur) : 2 000,00 € HT (20 %)');
    expect(texte('[data-inter-cabinet-form]')).toBe('CA de la vente : CRITERIMMO (société porteuse), 10 000,00 € HT · dont reversé en inter-cabinet : vers MACJ 4 000,00 € HT · extérieur 2 000,00 € HT');
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
    expect(texte('[data-ca-ttc]')).toBe('12 000,00 € TTC'); // 🔴 LOT R : CRITERIMMO porte la vente, toute la commission
    expect(texte('[data-ca-ht]')).toBe('10 000,00 € HT');
    const co = container.querySelector('[data-commissions-ttc]')!;
    expect(co.className).toContain('trx-rouge');
    // JB 1 000 HT + apporteur 2 000 HT + inter-cabinet MACJ 3 200 HT + extérieur 1 600 HT ⇒ 7 800 HT, 9 360 TTC (Mylène est MACJ)
    expect(texte('[data-commissions-ttc]')).toBe('9 360,00 € TTC versées');
    expect(texte('[data-commissions-ht]')).toBe('7 800,00 € HT');
    expect(texte('[data-solde-ht]')).toBe('2 200,00 € HT');
    expect(texte('[data-solde-ttc]')).toBe('2 640,00 € TTC');
    expect(texte('[data-part-compromis="criterimmo"]')).toBe('CA de la vente : 10 000,00 € HT · dont reversé en inter-cabinet : 4 800,00 € HT');
  });
  it('« Commissions versées » : le détail négociateurs / apporteurs au toucher (et au survol)', async () => {
    listeCompromis = [avecCommissions];
    await onglet();
    expect(container.querySelector('[data-detail-commissions]')).toBeNull();
    await cliquer('[data-tuile="commissions"]');
    expect(container.querySelector('[data-tuile="commissions"]')!.getAttribute('aria-expanded')).toBe('true');
    expect(texte('[data-detail="independants"]')).toBe('Indépendants : 1 000,00 € HT (1 200,00 € TTC)');
    expect(texte('[data-detail="apporteurs"]')).toBe('Apporteurs : 2 000,00 € HT (2 400,00 € TTC)');
    expect(texte('[data-detail="inter-cabinet-macj"]')).toBe('Inter-cabinet vers MACJ : 3 200,00 € HT (3 840,00 € TTC)');
    expect(texte('[data-detail="inter-cabinet-exterieur"]')).toBe('Inter-cabinet extérieur : 1 600,00 € HT (1 920,00 € TTC)');
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
    expect(texte('[data-ca-ht]')).toBe('10 000,00 € HT');
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
    await cliquer('[data-unite-de="commission-entree"][data-unite="ht"]'); // LOT O : TTC par défaut ; on choisit HT
    expect(texte('[data-equivalent="commission-entree"]')).toBe('soit 1 200,00 € TTC');
    await saisir('[data-champ="commission-sortie"]', '1200');
    await cliquer('[data-unite-de="commission-sortie"][data-unite="ttc"]');
    expect(texte('[data-equivalent="commission-sortie"]')).toBe('soit 1 000,00 € HT');
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
    expect(texte('[data-commission-enregistree="entree"]')).toBe('Commission enregistrée : 1 000,00 € HT (1 200,00 € TTC)');
    expect(texte('[data-commission-enregistree="sortie"]')).toBe('Commission enregistrée : 600,00 € TTC');
    await cliquer('[data-negociateur-carte="sortie"]');
    expect(presse('commission-carte-sortie', 'ttc')).toBe('true');
    await saisir('[data-champ="commission-carte-sortie"]', '700');
    await cliquer('[data-unite-de="commission-carte-sortie"][data-unite="ht"]');
    await cliquer('[data-valider-negociateur]');
    const envoi = posts.at(-1) as { action: string; dossier: { sortieId: number; commissions: unknown } };
    expect(envoi.action).toBe('dossier-enregistrer');
    expect(envoi.dossier.sortieId).toBe(7);
    const cs = envoi.dossier.commissions as Record<'entree' | 'sortie', { montant: string; unite: string }>;
    expect([cs.entree.montant, cs.entree.unite, cs.sortie.montant, cs.sortie.unite]).toEqual(['1000', 'ht', '700', 'ht']);
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
    expect(texte('[data-part-compromis="macj"]')).toBe('CA MACJ : 10 000,00 € HT');
    expect(texte('[data-part-compromis="criterimmo"]')).toBe('CA CRITERIMMO : 0,00 € HT');
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
  beforeEach(() => { ref.uniteCommission = true; });
  afterEach(() => { delete ref.uniteCommission; });
  const champ = (sel: string) => (container.querySelector(sel) as HTMLInputElement).value.replace(/\s/g, ' ');
  const presse = (c: string, u: string) => container.querySelector(`[data-unite-de="${c}"][data-unite="${u}"]`)!.getAttribute('aria-pressed');
  const pa = (sorte: 'entree' | 'sortie', id: number, nom: string, societe: 'criterimmo' | 'macj', pct: number) => ({ sorte, compteId: id, negociateur: nom, societe, nom: null, coordonnees: null, pourcentage: pct, montantHt: null });
  const v = (pE: number, pS: number, o: Partial<Vente> = {}): Vente => ({ ...compromis, honorairesTtc: 7500, repartition: { retroApporteurTtc: 0, parties: [pa('entree', 5, JB.nom, 'criterimmo', pE), pa('sortie', 7, MY.nom, 'macj', pS)] }, ...o });
  const carte = async (x: Vente) => { listeCompromis = [x]; await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(x.id); };

  it('50/50 : depuis la carte, 50 % × (50 % × 7 500 €) = 1 875,00 TTC (TTC enfoncé), avec la mention ; bascule HT : 1 562,50', async () => {
    await carte(v(50, 50));
    await cliquer('[data-negociateur-carte="entree"]');
    expect(champ('[data-champ="commission-carte-entree"]')).toBe('1 875,00');
    expect(presse('commission-carte-entree', 'ttc')).toBe('true');
    expect(texte('[data-propose="commission-carte-entree"]')).toBe('proposé : 50 % de 3 750,00 € TTC (sa part : 50 % de la commission nette)');
    await cliquer('[data-unite-de="commission-carte-entree"][data-unite="ht"]');
    expect(champ('[data-champ="commission-carte-entree"]')).toBe('1 562,50');
  });
  it('60/40 : le formulaire Modifier propose 2 250,00 et 1 500,00 TTC ; une frappe remplace la proposition', async () => {
    await carte(v(60, 40));
    await cliquer('[data-modifier-compromis="41"]');
    expect([champ('[data-champ="commission-entree"]'), champ('[data-champ="commission-sortie"]')]).toEqual(['2 250,00', '1 500,00']);
    await saisir('[data-champ="commission-sortie"]', '2800');
    expect(champ('[data-champ="commission-sortie"]')).toBe('2800');
    expect(container.querySelector('[data-propose="commission-sortie"]')).toBeNull();
  });
  it('une commission déjà enregistrée s’affiche telle quelle, jamais recalculée', async () => {
    await carte(v(50, 50, { lignes: [{ id: 1, negociateur: JB.nom, role: 'negociateur', montantTtc: 1200, montantHt: 1000, cote: 'entree', nature: 'compromis', compte: false, origine: 'saisie',
      sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null }] }));
    await cliquer('[data-negociateur-carte="entree"]');
    expect(champ('[data-champ="commission-carte-entree"]')).toBe('1000');
    expect(presse('commission-carte-entree', 'ht')).toBe('true');
    expect(container.querySelector('[data-propose="commission-carte-entree"]')).toBeNull();
  });
  it('rien n’est écrit sans « Valider » ; « Valider » n’envoie que la proposition de SON côté (celle de l’autre côté ne part pas)', async () => {
    await carte(v(50, 50));
    await cliquer('[data-negociateur-carte="entree"]');
    await cliquer('[data-negociateur-carte="sortie"]');
    expect(posts).toEqual([]);
    // la proposition n'est pas dans les tuiles tant qu'elle n'est pas validée : seul l'inter-cabinet vers MACJ (50 % de 6 250 HT) y est
    expect(texte('[data-commissions-ht]')).toBe('3 125,00 € HT');
    await cliquer('[data-choix-negociateur="entree"] [data-valider-negociateur]');
    const e = posts.at(-1) as { dossier: { commissions: { entree: { montant: string; unite: string }; sortie: { montant: string; unite: string } } } };
    // (l'espace des milliers est insécable : le serveur, `montant()` de saisie.ts, l'ignore comme toute espace)
    expect({ ...e.dossier.commissions.entree, montant: e.dossier.commissions.entree.montant.replace(/\s/g, ' ') }).toEqual({ montant: '1 875,00', unite: 'ttc', taux: null });
    expect(e.dossier.commissions.sortie).toEqual({ montant: '', unite: 'ttc', taux: null });
  });
  it('sans répartition (import « toute la commission à CRITERIMMO ») : champ vide, TTC par défaut, aucune mention', async () => {
    await carte({ ...importe, honorairesTtc: 7500, dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 5, nom: JB.nom }, sortie: null, apporteurId: null, personnes: [] } });
    await cliquer('[data-negociateur-carte="entree"]');
    expect(champ('[data-champ="commission-carte-entree"]')).toBe('');
    expect(presse('commission-carte-entree', 'ttc')).toBe('true');
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
    expect(texte('[data-detail="independants"]')).toBe('Indépendants : 1 000,00 € HT (1 200,00 € TTC)');
    expect(texte('[data-detail="internes"]')).toBe('Internes (associés, salariés) : 600,00 € HT — non déduits');
    expect(container.querySelector('[data-detail="a-renseigner"]')).toBeNull();
    // global : JB 1 000 + l'apporteur 2 000 + l'inter-cabinet extérieur 1 600 ; MACJ (3 200) neutralisé ; Mylène (associée) n'est pas déduite.
    expect(texte('[data-commissions-ht]')).toBe('4 600,00 € HT');
    const inconnu = compromis.repartition!.parties.map((p) => (p.compteId === 7 ? { ...p, statut: null, statutCompte: null } : p));
    listeCompromis = [{ ...compromis, repartition: { ...compromis.repartition!, parties: inconnu }, lignes: [ligneC(1, JB.nom, 'entree', 1000), ligneC(2, MY.nom, 'sortie', 600)] }];
    act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(createElement(EcranGlobal)); }); await calmer();
    await cliquer('[data-vue="compromis"]');
    await cliquer('[data-tuile="commissions"]');
    expect(texte('[data-detail="a-renseigner"]')).toBe('Statut à renseigner : 600,00 € HT — non déduits');
    expect(texte('[data-commissions-ht]')).toBe('4 600,00 € HT');
  });
});

describe('🔴 LOT P — sous le bouton négociateur : son statut à la date de la vente', () => {
  it('figé (« Indépendant — commission déduite ») ; vente d’avant : statut actuel du compte ; compte « à renseigner » : « à confirmer », non déduite', async () => {
    const parties = compromis.repartition!.parties.map((p) => (p.compteId === 7 ? { ...p, statut: null, statutCompte: 'salarie' as const } : p));
    listeCompromis = [{ ...compromis, repartition: { ...compromis.repartition!, parties } }];
    await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(41);
    expect(texte('[data-statut-vente="entree"]')).toBe('Statut à la vente : Indépendant — commission déduite');
    expect(texte('[data-statut-vente="sortie"]')).toBe('Statut à la vente : Salarié (statut actuel du compte) — commission interne, non déduite');
    const inconnu = compromis.repartition!.parties.map((p) => (p.compteId === 7 ? { ...p, statut: null, statutCompte: null } : p));
    listeCompromis = [{ ...compromis, repartition: { ...compromis.repartition!, parties: inconnu } }];
    act(() => { root.unmount(); }); root = createRoot(container);
    await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(41);
    expect(texte('[data-statut-vente="sortie"]')).toBe('Statut à la vente : à renseigner (à confirmer) — commission non déduite');
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
    expect(texte('[data-ca-ttc]')).toBe('4 000,00 € TTC');
    expect(texte('[data-commissions-ttc]')).toBe('2 000,00 € TTC versées');
    expect(texte('[data-solde-ttc]')).toBe('2 000,00 € TTC');
    await cliquer('[data-tuile="commissions"]');
    expect(texte('[data-detail="inter-cabinet-macj"]')).toBe('Inter-cabinet vers MACJ : 1 666,67 € HT (2 000,00 € TTC)');
    expect(texte('[data-detail="internes"]')).toBe('Internes (associés, salariés) : 1 666,67 € HT — non déduits');
    await deplier(38);
    expect(texte('[data-ca-vente-compromis="criterimmo"]')).toBe('CA de la vente — CRITERIMMO (société porteuse)CRITERIMMO100 %3 333,33 € HT');
    expect(texte('[data-reverse-compromis="macj"]')).toBe('dont reversé en inter-cabinet vers MACJMACJ50 %1 666,67 € HT');
    // Arnaud : 2 000 saisis ; le calcul (50 % × sa part, 2 000) = 1 000 — la valeur saisie n'est pas recalculée, le calcul est proposé
    // LOT T — les deux lignes de calcul, puis la valeur enregistrée en rouge et « Appliquer le calcul ».
    expect(texte('[data-honoraires-cote="entree"]')).toBe('Honoraires partie vendeur : 4 000,00 € × 50 % = 2 000,00 € TTC (1 666,67 € HT)');
    expect(texte('[data-commission-negociateur="entree"]')).toBe('Commission du négociateur : 2 000,00 € × 50 % = 1 000,00 € TTC');
    expect(texte('[data-ecart-remuneration="entree"]')).toBe('Commission enregistrée : 2 000,00 € TTCAppliquer le calcul');
    expect(posts).toEqual([]);
    await cliquer('[data-appliquer-calcul-carte="entree"]');
    expect(posts.at(-1)).toEqual({ action: 'commission-cote', id: 38, cote: 'entree', montant: { montant: 1000, unite: 'ttc' }, taux: 50 });
  });

  it('MACJ : la LIGNE MIROIR « HEIDIDON — inter-cabinet reçu de CRITERIMMO », 2 000 TTC en tête (jamais 4 000) ; non modifiable ; « Voir la vente d’origine »', async () => {
    listeCompromis = [await miroir()];
    await ouvrirMacj(); await cliquer('[data-vue="compromis"]');
    const carte = '[data-compromis="38"]';
    expect(container.querySelector(carte)!.getAttribute('data-miroir')).toBe('38');
    expect(texte(`${carte} [data-carte="titre"]`)).toBe('HEIDIDON — inter-cabinet reçu de CRITERIMMO');
    expect([...container.querySelector(`${carte} [data-carte="montants"]`)!.children].map((x) => x.textContent!.replace(/\s/g, ' '))).toEqual(['2 000,00 € TTC', '1 666,67 € HT', 'inter-cabinet reçu']);
    expect(texte(carte)).not.toContain('4 000');
    // les tuiles : CA = sa part ; Pierre (indépendant, 2 000 saisis) déduit ; solde 0 tant que le calcul n'est pas appliqué
    expect(texte('[data-ca-ttc]')).toBe('2 000,00 € TTC');
    expect(texte('[data-commissions-ttc]')).toBe('2 000,00 € TTC versées');
    expect(texte('[data-solde-ttc]')).toBe('0,00 € TTC');
    expect(texte('[data-part-compromis="macj"]')).toBe('CA de la vente : 1 666,67 € HT · dont reversé en inter-cabinet : 0,00 € HT · dont reçu en inter-cabinet : 1 666,67 € HT');
    await cliquer('[data-deplier="miroir-38"]');
    expect(container.querySelector(`${carte} [data-modifier-compromis]`)).toBeNull();
    expect(container.querySelector(`${carte} [data-acte-signe]`)).toBeNull();
    expect(container.querySelector(`${carte} [data-annulation-compromis]`)).toBeNull();
    expect(container.querySelector(`${carte} [data-voir-origine="38"]`)!.getAttribute('href')).toBe('/admin/transaction/criterimmo?vente=38');
    // LOT T — « Honoraires reçus de CRITERIMMO » à la place de la première ligne.
    expect(texte('[data-honoraires-cote="sortie"]')).toBe('Honoraires reçus de CRITERIMMO : 4 000,00 € × 50 % = 2 000,00 € TTC (1 666,67 € HT)');
    expect(texte('[data-commission-negociateur="sortie"]')).toBe('Commission du négociateur : 2 000,00 € × 50 % = 1 000,00 € TTC');
    expect(texte('[data-commission-enregistree="sortie"]')).toBe('Commission enregistrée : 2 000,00 € TTC');
    expect(posts).toEqual([]);
    await cliquer('[data-appliquer-calcul-carte="sortie"]');
    // enregistrée sur la VENTE D'ORIGINE (n° 38), côté sortie : aucune donnée dupliquée
    expect(posts.at(-1)).toEqual({ action: 'commission-cote', id: 38, cote: 'sortie', montant: { montant: 1000, unite: 'ttc' }, taux: 50 });
  });

  it('MACJ : « Modifier la rémunération » — un taux de 60 % recalcule le montant (1 200), un montant recalcule le taux ; « Valider » l’enregistre', async () => {
    listeCompromis = [await miroir()];
    await ouvrirMacj(); await cliquer('[data-vue="compromis"]'); await cliquer('[data-deplier="miroir-38"]');
    await cliquer('[data-modifier-remuneration="sortie"]');
    await saisir('[data-taux="remuneration-sortie"]', '60');
    expect((container.querySelector('[data-champ="remuneration-sortie"]') as HTMLInputElement).value.replace(/\s/g, ' ')).toBe('1 200,00');
    await cliquer('[data-valider-remuneration="sortie"]');
    expect(posts.at(-1)).toMatchObject({ action: 'commission-cote', id: 38, cote: 'sortie', montant: { montant: 1200, unite: 'ttc' }, taux: 60 });
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
    expect(texte('[data-ca-ttc]')).toBe('4 000,00 € TTC');
    expect(texte('[data-neutralise-compromis]')).toBe('Inter-cabinet entre nos sociétés : 1 666,67 € HT (neutralisé)');
    expect([texte('[data-part-compromis="criterimmo"]'), texte('[data-part-compromis="macj"]')]).toEqual(['CA CRITERIMMO : 3 333,33 € HT', 'CA MACJ : 1 666,67 € HT']);
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
    expect(texte('[data-honoraires-cote="entree"]')).toBe('Honoraires partie vendeur : 4 000,00 € × 50 % = 2 000,00 € TTC (1 666,67 € HT)');
    expect(container.querySelector('[data-commission-negociateur="entree"]')).toBeNull();
    expect(container.querySelector('[data-commission-carte="entree"]')).toBeNull();
    expect(container.querySelector('[data-ecart-remuneration="entree"]')).toBeNull();
    expect(container.querySelector('[data-appliquer-calcul-carte="entree"]')).toBeNull();
    expect(texte('[data-statut-vente="entree"]')).toBe('Statut à la vente : Associé');
    // Pierre : 1 000 enregistrés = le calcul (50 % × 2 000) : pas de ligne rouge.
    expect(texte('[data-commission-negociateur="sortie"]')).toBe('Commission du négociateur : 2 000,00 € × 50 % = 1 000,00 € TTC');
    expect(container.querySelector('[data-ecart-remuneration="sortie"]')).toBeNull();
    // sa part et le CA : inchangés ; sa commission : ni versée, ni interne
    expect(texte('[data-societe-cote="entree"]')).toBe('CRITERIMMO · 50 %');
    expect(texte('[data-ca-ttc]')).toBe('4 000,00 € TTC');
    await cliquer('[data-tuile="commissions"]');
    expect(texte('[data-detail="internes"]')).toBe('Internes (associés, salariés) : 0,00 € HT — non déduits');
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
    expect(texte('[data-commission-negociateur="entree"]')).toBe('Commission du négociateur : 2 000,00 € × 50 % = 1 000,00 € TTC');
    expect(texte('[data-ecart-remuneration="entree"]')).toBe('Commission enregistrée : 2 000,00 € TTCAppliquer le calcul');
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
  // L'exemple d'Arno : 7 500 TTC − 1 000 TTC d'apporteur = 6 500 TTC nets ; JB 60 % (1 950 = le calcul), Mylène 40 % au taux de 25 %, 1 625 enregistrés.
  const exemple: Vente = { ...compromis, honorairesTtc: 7500, retroApporteur: { montant: 1000, unite: 'ttc' },
    repartition: { retroApporteurTtc: 1000, parties: [pa('entree', 5, JB.nom, 'criterimmo', 60), pa('sortie', 7, MY.nom, 'macj', 40)] },
    lignes: [lc(1, JB.nom, 'entree', 1950), lc(2, MY.nom, 'sortie', 1625, 25)] };
  const carte = async (v: Vente) => { listeCompromis = [v]; await ouvrir(); await cliquer('[data-vue="compromis"]'); await deplier(v.id); };
  type Envoi = { action: string; dossier: { parties: { sorte: string; compteId: number | null; societe: string | null; pourcentage: number | null; nom: string | null }[];
    commissions: Record<'entree' | 'sortie', { montant: string; unite: string; taux: string | null } | null> } };

  it('première ligne : le titre à gauche, « CRITERIMMO · 60 % » / « MACJ · 40 % » à droite ; sur téléphone le bouton passe sous le titre', async () => {
    await carte(exemple);
    for (const [col, cote, mot, lib] of [['vendeur', 'entree', 'Vendeurs', 'CRITERIMMO · 60 %'], ['acquereur', 'sortie', 'Acquéreurs', 'MACJ · 40 %']]) {
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
    expect(texte('[data-honoraires-cote="sortie"]')).toBe('Honoraires partie acquéreur : 6 500,00 € × 40 % = 2 600,00 € TTC (2 166,67 € HT)');
    expect(texte('[data-commission-negociateur="sortie"]')).toBe('Commission du négociateur : 2 600,00 € × 25 % = 650,00 € TTC');
    expect(texte('[data-commission-enregistree="sortie"]')).toBe('Commission enregistrée : 1 625,00 € TTC');
    expect(container.querySelector('[data-commission-enregistree="sortie"]')!.className).toContain('trx-alerte');
    // l'ordre sous le bouton : les deux calculs, la ligne rouge, puis « Statut à la vente » (inchangé)
    const bloc = container.querySelector('[data-negociateur-cote="sortie"]')!;
    expect([...bloc.children].map((x) => [...x.attributes].map((a) => a.name).find((n) => n.startsWith('data-')))).toEqual(
      ['data-negociateur-carte', 'data-honoraires-cote', 'data-commission-negociateur', 'data-ecart-remuneration', 'data-statut-vente']);
    expect(texte('[data-statut-vente="sortie"]')).toBe('Statut à la vente : Indépendant — commission déduite');
    await cliquer('[data-appliquer-calcul-carte="sortie"]');
    expect(posts.at(-1)).toEqual({ action: 'commission-cote', id: 41, cote: 'sortie', montant: { montant: 650, unite: 'ttc' }, taux: 25 });
  });

  it('enregistrée = le calcul : pas de ligne rouge (JB : 6 500 × 60 % = 3 900 ; × 50 % = 1 950)', async () => {
    await carte(exemple);
    expect(texte('[data-negociateur-carte="entree"]')).toBe('Négociateur : Jean-Baptiste PONS · 50 %');
    expect(texte('[data-honoraires-cote="entree"]')).toBe('Honoraires partie vendeur : 6 500,00 € × 60 % = 3 900,00 € TTC (3 250,00 € HT)');
    expect(texte('[data-commission-negociateur="entree"]')).toBe('Commission du négociateur : 3 900,00 € × 50 % = 1 950,00 € TTC');
    expect(container.querySelector('[data-ecart-remuneration="entree"]')).toBeNull();
    expect(container.querySelector('[data-colonne="vendeur"] .trx-alerte')).toBeNull();
  });

  it('60/40 → 70/30 par le bouton de la première ligne (auto-compensation à deux parties) ; les commissions enregistrées repartent telles quelles', async () => {
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
    expect([e.dossier.commissions.entree, e.dossier.commissions.sortie]).toEqual([{ montant: '1950', unite: 'ttc', taux: null }, { montant: '1625', unite: 'ttc', taux: '25' }]);
  });

  it('50/50, sans commission enregistrée : la proposition ne s’écrit pas ; rien de changé : rien n’est envoyé', async () => {
    await carte({ ...exemple, repartition: { retroApporteurTtc: 1000, parties: [pa('entree', 5, JB.nom, 'criterimmo', 50), pa('sortie', 7, MY.nom, 'macj', 50)] }, lignes: [] });
    expect([texte('[data-societe-cote="entree"]'), texte('[data-societe-cote="sortie"]')]).toEqual(['CRITERIMMO · 50 %', 'MACJ · 50 %']);
    expect(texte('[data-commission-carte="sortie"]')).toBe('Commission enregistrée : à renseigner');
    await cliquer('[data-societe-cote="sortie"]');
    await cliquer('[data-valider-repartition="sortie"]');
    expect(posts).toEqual([]);
    await cliquer('[data-societe-cote="sortie"]');
    await saisir('[data-reglage-repartition="sortie"] [data-partie-pct="1"]', '45');
    await cliquer('[data-valider-repartition="sortie"]');
    const e = posts.at(-1) as Envoi;
    expect(e.dossier.parties.map((p) => [p.compteId, p.pourcentage])).toEqual([[5, 55], [7, 45]]);
    expect([e.dossier.commissions.entree?.montant, e.dossier.commissions.sortie?.montant]).toEqual(['', '']);
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
    expect(texte('[data-honoraires-cote="entree"]')).toBe('Honoraires partie vendeur : 9 600,00 € × 40 % = 3 840,00 € TTC (3 200,00 € HT)');
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
      await carte({ ...exemple, repartition: { retroApporteurTtc: 1000, parties: [pa('entree', 9, CJ.nom, null, 60), pa('sortie', 7, MY.nom, 'macj', 40)] },
        dossier: { ...compromis.dossier!, entree: { id: 9, nom: CJ.nom } }, lignes: [] });
      expect(texte('[data-societe-cote="entree"]')).toBe('Société à choisir · 60 %');
      await cliquer('[data-societe-cote="entree"]');
      expect(container.querySelector('[data-reglage-repartition="entree"] [data-choix-societe-vente="partie-0"]')).not.toBeNull();
      expect((container.querySelector('[data-valider-repartition="entree"]') as HTMLButtonElement).disabled).toBe(true);
      await cliquer('[data-reglage-repartition="entree"] [data-choix-societe-vente="partie-0"] [data-societe-vente="criterimmo"]');
      await cliquer('[data-valider-repartition="entree"]');
      const e = posts.at(-1) as Envoi;
      expect(e.dossier.parties.map((p) => [p.compteId, p.societe])).toEqual([[9, 'criterimmo'], [7, 'macj']]);
    } finally { (references as { negociateurs: unknown[] }).negociateurs = negos; }
  });

  it('non commissionné : « · non commissionné » dans le bouton et SEULE la ligne des honoraires', async () => {
    const negos = references.negociateurs;
    (references as { negociateurs: unknown[] }).negociateurs = [...negos, { id: 2, nom: 'Arnaud Jorel', societe: 'criterimmo', commissionne: false }];
    try {
      await carte({ ...exemple, repartition: { retroApporteurTtc: 1000, parties: [{ ...pa('entree', 2, 'Arnaud Jorel', 'criterimmo', 60), statut: 'associe', commissionneCompte: false },
        pa('sortie', 7, MY.nom, 'macj', 40)] }, dossier: { ...compromis.dossier!, entree: { id: 2, nom: 'Arnaud Jorel' } }, lignes: [lc(1, 'Arnaud Jorel', 'entree', 2000)] });
      expect(texte('[data-negociateur-carte="entree"]')).toBe('Négociateur : Arnaud Jorel · non commissionné');
      expect(texte('[data-societe-cote="entree"]')).toBe('CRITERIMMO · 60 %');
      const bloc = container.querySelector('[data-negociateur-cote="entree"]')!;
      expect([...bloc.children].map((x) => [...x.attributes].map((a) => a.name).find((n) => n.startsWith('data-')))).toEqual(['data-negociateur-carte', 'data-honoraires-cote', 'data-statut-vente']);
      expect(texte('[data-colonne="vendeur"]')).not.toContain('2 000,00 € TTC');
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
    expect(ligne(`${r} [data-resume-base] thead`)).toEqual(['', 'TTC', 'HT']);
    expect(ligne(`${r} [data-resume="commission"]`)).toEqual(['Commission de la vente', '7 500,00 €', '6 250,00 €']);
    expect(ligne(`${r} [data-resume="apporteur"]`)).toEqual(['− Apporteur : Julien Deblois', '1 000,00 €', '833,33 €']);
    expect(container.querySelector(`${r} [data-resume-ttc="apporteur-0"]`)!.className).toBe('trx-rouge');
    expect(container.querySelector(`${r} [data-resume="apporteur"] th`)!.className).not.toContain('trx-rouge');
    expect(ligne(`${r} [data-resume="base"]`)).toEqual(['= Base de répartition tous les calculs ci-dessous partent de cette base', '6 500,00 €', '5 416,67 €']);
    expect(container.querySelector(`${r} [data-resume="base"]`)!.className).toBe('trx-resume-base-total');
    const bloc = container.querySelector(`${r} [data-bloc-repartition]`)!;
    expect(bloc.querySelector('[data-resume-base]')!.compareDocumentPosition(bloc.querySelector('[data-parties]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 60 / 40 de 5 416,67 HT : au centime, et la somme tombe juste
    expect(eurs(r)).toEqual(['3 250,00', '2 166,67']);
    // le bas du panneau garde le total, le CA de la vente et les parts par société ; plus la phrase « commission nette »
    expect(texte(`${r} [data-total-repartition]`)).not.toContain('de commission nette');
    expect(container.querySelector(`${r} [data-inter-cabinet-form]`)).not.toBeNull();
    expect(container.querySelector(`${r} [data-parts-societes]`)).not.toBeNull();
  });

  it('sans apporteur : « Aucun apporteur » (sans rouge), la base = la commission de la vente', async () => {
    await panneau(vente([50, 50], false));
    const r = '[data-reglage-repartition="entree"]';
    expect(ligne(`${r} [data-resume="aucun-apporteur"]`)).toEqual(['Aucun apporteur', '', '']);
    expect(container.querySelector(`${r} [data-resume-base] .trx-rouge`)).toBeNull();
    expect(ligne(`${r} [data-resume="base"]`).slice(1)).toEqual(['7 500,00 €', '6 250,00 €']);
  });

  it('50 / 50 de 5 416,67 € HT : 2 708,33 + 2 708,34 — l’écart d’arrondi sur la dernière partie, la somme juste au centime', async () => {
    await panneau(vente([50, 50]));
    expect(eurs('[data-reglage-repartition="entree"]')).toEqual(['2 708,33', '2 708,34']);
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
    await saisir('[data-champ="commission"]', '7500');
    expect(ligne('[data-resume="commission"]')).toEqual(['Commission de la vente', '7 500,00 €', '6 250,00 €']);
    expect(container.querySelector('[data-resume="aucun-apporteur"]')).not.toBeNull();
    await cliquer('[data-champ="apporteur-annuaire"]'); await cliquer('[role="option"][data-option="4"]');
    await cliquer('[data-unite-de="retro"][data-unite="ttc"]');
    await saisir('[data-champ="retro"]', '1000');
    expect(ligne('[data-resume="apporteur"]')).toEqual(['− Apporteur : Julien Deblois', '1 000,00 €', '833,33 €']);
    expect(ligne('[data-resume="base"]').slice(1)).toEqual(['6 500,00 €', '5 416,67 €']);
    await saisir('[data-champ="commission"]', '8500');
    expect(ligne('[data-resume="base"]').slice(1)).toEqual(['7 500,00 €', '6 250,00 €']);
  });

  it('deux apporteurs : une ligne chacun, retranchés tous deux de la base', async () => {
    const { ResumeBase } = await import('./Repartition');
    await act(async () => { root.render(createElement(ResumeBase, { commissionTtc: 7500, apporteurs: [{ nom: 'Julien Deblois', ttc: 1000 }, { nom: 'Gardien Dacquet', ttc: 600 }] })); });
    expect([...container.querySelectorAll('[data-resume="apporteur"]')].map((x) => x.textContent!.replace(/\s/g, ' '))).toEqual(
      ['− Apporteur : Julien Deblois1 000,00 €833,33 €', '− Apporteur : Gardien Dacquet600,00 €500,00 €']);
    expect(ligne('[data-resume="base"]').slice(1)).toEqual(['5 900,00 €', '4 916,67 €']);
  });
});
