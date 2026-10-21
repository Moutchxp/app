// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ResumeBienFiche } from './ResumeBien';
import { EVENEMENT_BIEN_MODIFIE, AVERTISSEMENT_SORTIE, HistoriqueEncart } from './EditionEncart';
import { valeursDepuis } from '../../../../lib/location/encartBien';
import type { LectureEncart } from '../../../../lib/location/encartBienRepo';
import type { ComplementsFiche } from '../../../../lib/location/bienComplet';
import type { FicheLot } from '../../../../lib/gestion/annuaireRepo';

/**
 * 🔴 Arno (21/10/2026) — L'ENCART DU BIEN MODIFIABLE SUR PLACE, avec le vrai composant et un `fetch` simulé :
 *   · « Modifier » → « Fermer » tant que rien n'a changé ; un changement → « Annuler les modifications » / « Valider les
 *     modifications » ; revenu à la main aux valeurs d'origine → « Fermer » ; « Annuler » rend les valeurs d'origine ;
 *   · « Valider » → contre-validation « Champ : ancienne → nouvelle » → « Confirmer » → enregistrement (une seule requête,
 *     « Enregistrement… ») → modale verte ; refus du serveur → modale rouge, la saisie reste ;
 *   · un bloc à la fois ; « Modifications non enregistrées » en quittant ; la page relit le bien quand il change ailleurs.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;

const FICHE = { id: 7, numero: '373', nature: 'Appartement', typeBien: 'T3', immeuble: '15 rue Carle Hebert', adresse: '15 rue Carle Hebert', commune: 'COURBEVOIE',
  codePostal: '92400', debut: '2019-03-01', fin: null, absent: false, surfaceM2: null, proprietaireId: 146, proprietaireNom: 'X' } as unknown as FicheLot;
const RESUME = {
  caracteristiques: { famille: 'Logement', type: 'Appartement', meuble: false, nombrePieces: 3, etage: '2', porte: '21', batiment: 'B', escalier: null, numLotCopro: '12',
    surfaceHabitableM2: 64.2, surfaceCarrezM2: 61.8, surfaceExterieureM2: null, surfaceM2: null, annexes: [], familleCle: 'logement', typeLogement: 'Appartement',
    typeLocal: null, parkingSituation: null, parkingType: null, epoqueConstruction: null, chauffage: null, annexesDetail: [] },
  situation: { batiment: 'B', escalier: null, etage: '2', porte: '21', precisionAcces: null, ascenseur: true, digicode: false, digicodeCode: null },
  copropriete: { numLotCopro: '12', syndic: null, derniereAg: null, agApplicable: true },
  dpe: { classe: 'D', nonSoumis: false, date: '2024-03-01', assurancePno: null, pnoDateAnniversaire: null },
  commentaire: 'Avant.',
  proprietaires: [], gestion: { enGestionBien: true, zone: 'autre', bareme: null, entretienAPrevoir: false, entretiens: [] },
  location: { statut: 'libre', locataires: [], entree: null, loyer: null, loyerSource: null, depot: null, prelevement: null },
};
const LECTURE: LectureEncart = {
  valeurs: valeursDepuis({ etage: '2', porte: '21', numLotCopro: '12', surfaceCarrezM2: 61.8, surfaceExterieureM2: null },
    { typeLogement: 'appartement', meuble: false, nombrePieces: 3, surfaceHabitableM2: 64.2, batiment: 'B', ascenseur: true, digicode: false, commentaire: 'Avant.',
      dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: false, entretiens: [] } as unknown as ComplementsFiche),
  famille: 'logement', annexe: false, avecIdFiscal: true, avecCharges: true, avecAg: true, avecEntretien: true, digicodeImmeuble: null,
};

let container: HTMLDivElement;
let root: Root;
let reponsePost: () => Promise<Response>;
let appels: { url: string; init?: RequestInit }[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  reponsePost = async () => ok({ changements: [{ cle: 'commentaire', champ: 'Commentaire libre', avant: 'Avant.', apres: 'Après.' }] });
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    appels.push({ url: String(url), init });
    if (init?.method === 'POST') return reponsePost();
    if (String(url).includes('?encart=')) return ok(LECTURE);
    if (String(url).includes('?resume=')) return ok(RESUME);
    return ok([]);
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

const attendre = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const rendre = async (modifiable = true) => { await act(async () => { root.render(createElement(ResumeBienFiche, { f: FICHE, ouvrir: () => {}, modifiable })); }); await attendre(); };
const q = (sel: string) => container.querySelector(sel) as HTMLElement | null;
const clic = async (sel: string) => { const e = q(sel) ?? document.querySelector(sel) as HTMLElement | null; if (!e) throw new Error(`absent : ${sel}`); await act(async () => { e.click(); }); await attendre(); };
const saisir = async (sel: string, v: string) => {
  const e = q(sel) as HTMLInputElement | HTMLTextAreaElement;
  const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })); });
};
const boutons = (g: string) => ({
  modifier: !!q(`[data-modifier-groupe="${g}"]`), fermer: !!q(`[data-fermer-groupe="${g}"]`), annuler: !!q(`[data-annuler-groupe="${g}"]`), valider: !!q(`[data-valider-groupe="${g}"]`),
});
const ZONE = '[data-formulaire-encart="commentaire"] textarea';
const posts = () => appels.filter((a) => a.init?.method === 'POST');
const modale = () => document.querySelector('[role=dialog],[role=alertdialog]') as HTMLElement | null;

describe('🔴 les boutons du bloc', () => {
  it('sans droit de modifier : aucun bouton « Modifier »', async () => {
    await rendre(false);
    expect(container.querySelectorAll('[data-modifier-groupe]')).toHaveLength(0);
  });

  it('un « Modifier » par bloc ; ouvert sans changement → « Fermer » seul ; « Fermer » rend l’encart', async () => {
    await rendre();
    expect([...container.querySelectorAll('[data-modifier-groupe]')].map((e) => (e as HTMLElement).dataset.modifierGroupe))
      .toEqual(['caracteristiques', 'situation', 'copropriete', 'dpe', 'commentaire']);
    await clic('[data-modifier-groupe="commentaire"]');
    expect(boutons('commentaire')).toEqual({ modifier: false, fermer: true, annuler: false, valider: false });
    expect((q(ZONE) as HTMLTextAreaElement).value).toBe('Avant.');   // pré-rempli
    await clic('[data-fermer-groupe="commentaire"]');
    expect(boutons('commentaire')).toEqual({ modifier: true, fermer: false, annuler: false, valider: false });
    expect(q('[data-formulaire-encart]')).toBeNull();
  });

  it('un changement → Annuler / Valider ; revenu à la main → « Fermer » ; « Annuler » rend les valeurs d’origine', async () => {
    await rendre();
    await clic('[data-modifier-groupe="commentaire"]');
    await saisir(ZONE, 'Après.');
    expect(boutons('commentaire')).toEqual({ modifier: false, fermer: false, annuler: true, valider: true });
    await saisir(ZONE, 'Avant.');
    expect(boutons('commentaire')).toEqual({ modifier: false, fermer: true, annuler: false, valider: false });
    await saisir(ZONE, 'Après.');
    await clic('[data-annuler-groupe="commentaire"]');
    expect((q(ZONE) as HTMLTextAreaElement).value).toBe('Avant.');
    expect(boutons('commentaire')).toEqual({ modifier: false, fermer: true, annuler: false, valider: false });
    expect(posts()).toHaveLength(0);
  });

  it('champs de Location vides : l’import WIPPIMMO affiché par l’encart est DIT, jamais recopié dans la saisie', async () => {
    const vide = { ...LECTURE, valeurs: { ...LECTURE.valeurs, typeLogement: '', nombrePieces: '', meuble: '' } };
    global.fetch = vi.fn(async (url: string) => ok(String(url).includes('?encart=') ? vide : RESUME)) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(ResumeBienFiche, { f: { ...FICHE, nature: 'Appartement meublé', typeBien: 'T3' } as FicheLot, ouvrir: () => {}, modifiable: true })); });
    await attendre();
    await clic('[data-modifier-groupe="caracteristiques"]');
    expect(q('[data-importe]')?.textContent).toBe('Affiché d’après l’import WIPPIMMO tant que ces champs sont vides : Type : Logement · Appartement · Meublé : oui · Pièces : 3.');
    expect(boutons('caracteristiques').fermer).toBe(true);   // rien n'est compté comme changé
  });

  it('les champs de Caractéristiques sont ceux de « Nouveau bien », pré-remplis', async () => {
    await rendre();
    await clic('[data-modifier-groupe="caracteristiques"]');
    expect((q('[data-champ-encart="surfaceCarrezM2"]') as HTMLInputElement).value).toBe('61,8');
    await saisir('[data-champ-encart="surfaceCarrezM2"]', '61.8');   // même nombre : rien n'a changé
    expect(boutons('caracteristiques').fermer).toBe(true);
  });
});

describe('🔴 contre-validation, enregistrement, issues', () => {
  it('Valider → « Champ : ancienne → nouvelle » ; « Revenir à la saisie » garde la saisie', async () => {
    await rendre();
    await clic('[data-modifier-groupe="commentaire"]');
    await saisir(ZONE, 'Après.');
    await clic('[data-valider-groupe="commentaire"]');
    expect([...document.querySelectorAll('[data-contre-validation] li')].map((l) => l.textContent)).toEqual(['Commentaire libre : Avant. → Après.']);
    expect(modale()?.textContent).toContain('Valider les modifications ?');
    await clic('[data-revenir-saisie]');
    expect(modale()).toBeNull();
    expect((q(ZONE) as HTMLTextAreaElement).value).toBe('Après.');
    expect(posts()).toHaveLength(0);
  });

  it('Confirmer → UNE requête (« Enregistrement… », double clic sans effet), en-tête « propre » → modale verte ; la page est prévenue', async () => {
    await rendre();
    let liberer: (r: Response) => void = () => {};
    reponsePost = () => new Promise<Response>((r) => { liberer = r; });
    const annonces: unknown[] = [];
    const ecoute = (e: Event) => annonces.push((e as CustomEvent).detail);
    window.addEventListener(EVENEMENT_BIEN_MODIFIE, ecoute);
    await clic('[data-modifier-groupe="commentaire"]');
    await saisir(ZONE, 'Après.');
    await clic('[data-valider-groupe="commentaire"]');
    const confirmer = document.querySelector('[data-confirmer-encart]') as HTMLElement;
    await act(async () => { confirmer.click(); confirmer.click(); });
    await attendre();
    expect(posts()).toHaveLength(1);
    expect(document.querySelector('[data-confirmer-encart]')?.textContent).toBe('Enregistrement…');
    const p = posts()[0];
    expect((p.init?.headers as Record<string, string>)['x-svav-confirmation']).toBe('propre');
    expect(JSON.parse(String(p.init?.body))).toMatchObject({ action: 'modifier-encart', id: 7, groupe: 'commentaire', valeurs: { commentaire: 'Après.' } });
    await act(async () => { liberer(ok({ changements: [{ cle: 'commentaire', champ: 'Commentaire libre', avant: 'Avant.', apres: 'Après.' }] })); });
    await attendre();
    expect(modale()?.textContent).toContain('Modifications enregistrées');
    expect(modale()?.textContent).toContain('Avant. → Après.');
    expect(q('[data-formulaire-encart]')).toBeNull();
    expect(annonces).toEqual([{ lotId: 7 }]);
    window.removeEventListener(EVENEMENT_BIEN_MODIFIE, ecoute);
  });

  it('refus du serveur → modale rouge en clair, la saisie reste', async () => {
    await rendre();
    reponsePost = async () => ({ ok: false, status: 400, json: async () => ({ etat: 'refuse', motif: 'La date du DPE ne peut pas être dans le futur.' }) }) as unknown as Response;
    await clic('[data-modifier-groupe="commentaire"]');
    await saisir(ZONE, 'Après.');
    await clic('[data-valider-groupe="commentaire"]');
    await clic('[data-confirmer-encart]');
    expect(modale()?.getAttribute('role')).toBe('alertdialog');
    expect(modale()?.textContent).toContain('Les modifications n’ont pas été enregistrées.');
    expect(modale()?.textContent).toContain('La date du DPE ne peut pas être dans le futur.');
    await clic('[data-fermer-erreur-encart]');
    expect((q(ZONE) as HTMLTextAreaElement).value).toBe('Après.');
    expect(boutons('commentaire').valider).toBe(true);
  });

  it('serveur injoignable → modale rouge, la saisie reste', async () => {
    await rendre();
    reponsePost = async () => { throw new TypeError('Failed to fetch'); };
    await clic('[data-modifier-groupe="commentaire"]');
    await saisir(ZONE, 'Après.');
    await clic('[data-valider-groupe="commentaire"]');
    await clic('[data-confirmer-encart]');
    expect(modale()?.getAttribute('role')).toBe('alertdialog');
    await clic('[data-fermer-erreur-encart]');
    expect((q(ZONE) as HTMLTextAreaElement).value).toBe('Après.');
  });
});

describe('🔴 un bloc à la fois, sortie de page, relecture', () => {
  it('ouvrir un 2e bloc pendant des changements → il faut d’abord annuler ou valider ; sans changement, on passe', async () => {
    await rendre();
    await clic('[data-modifier-groupe="commentaire"]');
    await saisir(ZONE, 'Après.');
    await clic('[data-modifier-groupe="situation"]');
    expect(modale()?.textContent).toContain('Un bloc à la fois');
    expect(q('[data-formulaire-encart]')?.dataset.formulaireEncart).toBe('commentaire');
    await clic('[data-un-a-la-fois]');
    await clic('[data-annuler-groupe="commentaire"]');
    await clic('[data-modifier-groupe="situation"]');
    expect(q('[data-formulaire-encart]')?.dataset.formulaireEncart).toBe('situation');
    expect(container.querySelectorAll('[data-formulaire-encart]')).toHaveLength(1);
  });

  it('« Modifications non enregistrées » en quittant, seulement s’il y a des changements', async () => {
    await rendre();
    const quitter = () => { const e = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent; window.dispatchEvent(e); return e; };
    expect(quitter().defaultPrevented).toBe(false);
    await clic('[data-modifier-groupe="commentaire"]');
    expect(quitter().defaultPrevented).toBe(false);
    await saisir(ZONE, 'Après.');
    const e = quitter();
    expect(e.defaultPrevented).toBe(true);
    expect(AVERTISSEMENT_SORTIE).toMatch(/^Modifications non enregistrées/);   // le mot posé sur l’événement (jsdom n’a pas de BeforeUnloadEvent)
    await clic('[data-annuler-groupe="commentaire"]');
    expect(quitter().defaultPrevented).toBe(false);
  });

  it('le bien modifié ailleurs dans la page (section « Le bien ») ou le retour sur l’onglet : l’encart se relit', async () => {
    await rendre();
    const resumes = () => appels.filter((a) => a.url.includes('?resume=')).length;
    const avant = resumes();
    await act(async () => { window.dispatchEvent(new CustomEvent(EVENEMENT_BIEN_MODIFIE, { detail: { lotId: 7 } })); });
    await attendre();
    expect(resumes()).toBe(avant + 1);
    await act(async () => { window.dispatchEvent(new CustomEvent(EVENEMENT_BIEN_MODIFIE, { detail: { lotId: 8 } })); });   // un autre bien
    await attendre();
    expect(resumes()).toBe(avant + 1);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await attendre();
    expect(resumes()).toBe(avant + 2);
  });
});

describe('🔴 l’Historique du bien : « Modifications de la fiche du bien »', () => {
  const LIGNES = [{ id: 12, quand: '2026-10-21 23:55:18.553996+02', texte: 'Commentaire — Commentaire libre : Avant. → Après.', par: 'arno@exemple.test' }];
  const rendreHisto = async () => { await act(async () => { root.render(createElement(HistoriqueEncart, { lotId: 7 })); }); await attendre(); };

  it('aucune modification : la bande n’est pas montrée', async () => {
    await rendreHisto();
    expect(q('[data-historique-encart]')).toBeNull();
  });

  it('repliée avec son compte ; dépliée : « Champ : ancienne → nouvelle », la date, l’auteur ; relue quand le bien change', async () => {
    global.fetch = vi.fn(async (url: string) => { appels.push({ url: String(url) }); return ok(LIGNES); }) as unknown as typeof fetch;
    await rendreHisto();
    expect(q('[data-historique-encart] .gst-compte')?.textContent).toBe('1');
    expect(q('[data-modification-encart]')).toBeNull();
    await clic('[data-historique-encart] button');
    expect(q('[data-modification-encart="12"]')?.textContent).toBe('Commentaire — Commentaire libre : Avant. → Après.21/10/2026 à 23:55 · par arno@exemple.test');
    const n = appels.length;
    await act(async () => { window.dispatchEvent(new CustomEvent(EVENEMENT_BIEN_MODIFIE, { detail: { lotId: 7 } })); });
    await attendre();
    expect(appels.length).toBe(n + 1);
    expect(appels.at(-1)?.url).toContain('?modifsEncart=7');
  });
});

describe('🔴 le dépliage de l’encart n’est pas conditionné par la modification', () => {
  it('un clic DANS le formulaire ne replie pas ; « Masquer le détail » et un clic hors formulaire replient ; la saisie survit', async () => {
    await rendre();
    await clic('[data-bascule-detail]');
    expect(q('[data-resume-bien]')?.dataset.deplie).toBe('oui');
    await clic('[data-modifier-groupe="commentaire"]');
    await saisir(ZONE, 'Après.');
    await clic('[data-formulaire-encart="commentaire"]');
    expect(q('[data-resume-bien]')?.dataset.deplie).toBe('oui');
    await clic('[data-bascule-detail]');
    expect(q('[data-resume-bien]')?.dataset.deplie).toBe('non');
    await clic('[data-bascule-detail]');
    expect((q(ZONE) as HTMLTextAreaElement).value).toBe('Après.');
    await clic('[data-groupe="situation"] dt');
    expect(q('[data-resume-bien]')?.dataset.deplie).toBe('non');
  });
});

describe('🔴 « Modifications non enregistrées » aussi sur un lien de l’application', () => {
  it('avec des changements : la question est posée ; « Annuler » reste sur la page ; sans changement : aucune question', async () => {
    await rendre();
    const lien = document.createElement('a'); lien.href = '/admin/location'; lien.textContent = 'Location'; document.body.appendChild(lien);
    const suivre = () => { const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }); lien.dispatchEvent(e); return e.defaultPrevented; };
    const question = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(suivre()).toBe(false); expect(question).not.toHaveBeenCalled();
    await clic('[data-modifier-groupe="commentaire"]');
    await saisir(ZONE, 'Après.');
    expect(suivre()).toBe(true);
    expect(question).toHaveBeenCalledWith(`${AVERTISSEMENT_SORTIE} Quitter quand même ?`);
    question.mockReturnValue(true);
    expect(suivre()).toBe(false);
    lien.remove();
  });
});
