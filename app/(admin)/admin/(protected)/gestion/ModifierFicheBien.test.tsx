// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { ResumeBienFiche } from './ResumeBien';
import { EVENEMENT_BIEN_MODIFIE, AVERTISSEMENT_SORTIE, HistoriqueEncart, INTERVALLE_VERSION_MS } from './EditionEncart';
import { valeursDepuis } from '../../../../lib/location/encartBien';
import { gestesPour } from '../../../../lib/gestion/statutBien';
import type { ComplementsFiche } from '../../../../lib/location/bienComplet';
import type { FicheLot } from '../../../../lib/gestion/annuaireRepo';
import type { LectureFiche } from '../../../../lib/location/ficheBienEntiereRepo';

/**
 * 🔴 Arno (23/10/2026, réponse « B ») — LA FICHE DU BIEN SE MODIFIE EN ENTIER, avec le vrai composant et un `fetch` simulé :
 *   · UN seul « Modifier » (les cinq « Modifier » par groupe sont retirés, accord d'Arno) ouvre le formulaire « Nouveau bien » ENTIER,
 *     pré-rempli (adresse, famille, caractéristiques, situation, annexes, copropriété, DPE, PNO, statut, commentaire) ;
 *   · aucune valeur perdue : relue telle quelle, la saisie ne compte aucun changement, et l'envoi rend chaque valeur lue ;
 *   · Valider → contre-validation « Champ : ancienne → nouvelle » → Confirmer → UNE requête (version jointe) → succès ; refus, conflit
 *     de version (« Ce bien a été modifié par ailleurs — recharger ? ») ; Annuler / Échap ; « Modifications non enregistrées » ;
 *   · la mise à jour automatique : l'empreinte relue toutes les quelques secondes ; un changement prévient la page et le formulaire ;
 *   · le MÊME composant dans la Gestion et dans la Location.
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
const VALEURS = valeursDepuis({ categorie: 'logement', adresse: '15 rue Carle Hebert', codePostal: '92400', commune: 'COURBEVOIE', etage: '2', porte: '21', numLotCopro: '12',
  surfaceCarrezM2: 61.8, surfaceExterieureM2: null },
{ typeLogement: 'appartement', meuble: false, nombrePieces: 3, surfaceHabitableM2: 64.2, batiment: 'B', ascenseur: true, digicode: false, commentaire: 'Avant.',
  dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: true, entretiens: [{ sorte: 'chaudiere', nom: null, dateAnniversaire: '2026-11-01' }], assurancePno: true,
  pnoDateAnniversaire: '2026-05-01', epoqueConstruction: '1949-1974', chauffage: null, idFiscal: '921234567890', chargesCopro: 'agence', derniereAg: '2026-06-15',
  syndicId: 31, syndicNom: 'CABINET ESSAI', precisionAcces: 'Au fond', escalier: '2' } as unknown as ComplementsFiche);
const CAVE = { id: 31, categorie: 'cave' as const, etage: '-1', porte: '', numLotCopro: '40', nomAnnexe: '', annotation: 'Clé chez le gardien', detachee: false,
  parkingSituation: '', parkingType: '', autreAdresse: false, adresse: '15 rue Carle Hebert', codePostal: '92400', commune: 'COURBEVOIE', adresseModifiable: true };
const LECTURE: LectureFiche = {
  version: 'v1',
  encart: { valeurs: VALEURS, famille: 'logement', annexe: false, avecIdFiscal: true, avecCharges: true, avecAg: true, avecEntretien: true, adresseModifiable: true, avecPno: true,
    digicodeImmeuble: null, categorie: 'logement', adresse: '15 rue Carle Hebert', codePostal: '92400', commune: 'COURBEVOIE', nomAnnexe: null },
  annexes: [CAVE],
  statut: { statut: 'en_gestion', depuis: '2019-03-01', gestes: gestesPour('en_gestion'), disponible: true, suitLot: null },
  proprietaires: ['DURAND Léa'], mandat: { sorte: 'gestion', lignes: ['Mandat de gestion n° MG-41'] },
};

let container: HTMLDivElement;
let root: Root;
let reponsePost: () => Promise<Response>;
let version: string;
let lecture: LectureFiche;
let occupees: unknown[];
let appels: { url: string; init?: RequestInit }[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = []; version = 'v1'; lecture = LECTURE; occupees = [];
  reponsePost = async () => ok({ changements: [{ cle: 'commentaire', champ: 'Commentaire libre', avant: 'Avant.', apres: 'Après.' }], notes: [] });
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    appels.push({ url: u, init });
    if (init?.method === 'POST') return reponsePost();
    if (u.includes('?resume=')) return ok(RESUME);
    if (u.includes('?versionBien=')) return ok({ version });
    if (u.includes('?ficheEntiere=')) return ok(lecture);
    if (u.includes('?apercuArchivage=')) return ok({ occupees });
    return ok(null);
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => root.unmount()); container.remove(); document.body.innerHTML = ''; vi.restoreAllMocks(); vi.useRealTimers(); });

const attendre = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const rendre = async (modifiable = true) => { await act(async () => { root.render(createElement(ResumeBienFiche, { f: FICHE, ouvrir: () => {}, modifiable })); }); await attendre(); };
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const clic = async (sel: string | HTMLElement) => { const e = typeof sel === 'string' ? q(sel) : sel; if (!e) throw new Error(`absent : ${String(sel)}`); await act(async () => { e.click(); }); await attendre(); };
const saisir = async (e: HTMLInputElement | HTMLTextAreaElement, v: string) => {
  const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })); });
  await attendre();
};
/** Le champ d'un libellé du formulaire (« Commune », « Surface Carrez/Boutin m² »…). */
const champ = (mot: string): HTMLInputElement | HTMLTextAreaElement => {
  const l = [...document.querySelectorAll('[data-modifier-fiche-bien] label')].find((x) => (x.firstChild?.textContent ?? x.textContent ?? '').trim().startsWith(mot));
  const e = l?.querySelector('input, textarea, select');
  if (!e) throw new Error(`champ absent : ${mot}`);
  return e as HTMLInputElement;
};
const commentaire = () => q('[data-modifier-fiche-bien] textarea[maxlength="4000"]') as HTMLTextAreaElement;
const modale = () => q('.mis-boite') as HTMLElement | null;
const posts = () => appels.filter((a) => a.init?.method === 'POST');
const ouvrir = async () => { await rendre(); await clic('[data-modifier-fiche]'); };

describe('🔴 UN seul « Modifier » ouvre le formulaire « Nouveau bien » entier', () => {
  it('sans droit de modifier : aucun « Modifier »', async () => {
    await rendre(false);
    expect(q('[data-modifier-fiche]')).toBeNull();
  });

  it('un seul « Modifier » ; les cinq « Modifier » par groupe ont disparu ; l’encart n’a aucun champ de saisie', async () => {
    await rendre();
    expect(document.querySelectorAll('[data-modifier-fiche]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-modifier-groupe]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-resume-bien] input, [data-resume-bien] textarea, [data-resume-bien] select')).toHaveLength(0);
  });

  it('ouvert : TOUS les blocs de « Nouveau bien », pré-remplis des valeurs lues ; rien à valider', async () => {
    await ouvrir();
    expect(q('[data-modifier-fiche-bien]')?.getAttribute('role')).toBe('dialog');
    expect(q('.loc-titre')?.textContent).toBe('Modifier le bien');
    expect(q('[data-rappel-proprietaires]')?.textContent).toContain('DURAND Léa');
    expect(q('[data-famille="logement"]')?.getAttribute('aria-pressed')).toBe('true');
    expect((q('[data-bloc-bien] [aria-label="Type de logement"] [aria-pressed="true"]'))?.textContent).toMatch(/Appartement/);
    expect(champ('Surface Carrez/Boutin m²').value).toBe('61,8');
    expect(champ('Surface habitable (m²)').value).toBe('64,2');
    expect(champ('Code postal').value).toBe('92400');
    expect(champ('Commune').value).toBe('COURBEVOIE');
    expect(champ('Bâtiment').value).toBe('B');
    expect(champ('Escalier').value).toBe('2');
    expect(champ('N° de lot (règlement de copropriété)').value).toBe('12');
    expect((q('[data-id-fiscal] input') as HTMLInputElement).value).toBe('921234567890');
    expect((q('[data-derniere-ag] input') as HTMLInputElement).value).toBe('2026-06-15');
    expect((q('[data-pno-date] input') as HTMLInputElement).value).toBe('2026-05-01');
    expect(q('[data-annexe-id="31"]')).not.toBeNull();
    expect(q('[data-bloc-statut-modification]')?.textContent).toContain('Mandat de gestion n° MG-41');
    expect(commentaire().value).toBe('Avant.');
    expect(q('[data-etat-modification]')?.textContent).toBe('Aucune modification.');
    expect((q('[data-valider-modification]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('les valeurs de l’import WIPPIMMO, quand la Location est vide, sont DITES (jamais recopiées)', async () => {
    lecture = { ...LECTURE, encart: { ...LECTURE.encart, valeurs: { ...VALEURS, typeLogement: '', nombrePieces: '', meuble: '' } } };
    await act(async () => { root.render(createElement(ResumeBienFiche, { f: { ...FICHE, nature: 'Appartement meublé', typeBien: 'T3' } as FicheLot, ouvrir: () => {}, modifiable: true })); });
    await attendre();
    await clic('[data-modifier-fiche]');
    expect(q('[data-importe]')?.textContent).toBe('Affiché d’après l’import WIPPIMMO tant que ces champs sont vides : Type : Logement · Appartement · Meublé : oui · Pièces : 3.');
    expect(q('[data-etat-modification]')?.textContent).toBe('Aucune modification.');
  });
});

describe('🔴 aucune valeur perdue, contre-validation, enregistrement', () => {
  it('un changement → contre-validation « Champ : ancienne → nouvelle » ; Confirmer → UNE requête qui rend CHAQUE valeur lue ; succès ; la page est prévenue', async () => {
    await ouvrir();
    await saisir(commentaire(), 'Après.');
    expect(q('[data-etat-modification]')?.textContent).toBe('1 modification à valider.');
    await clic('[data-valider-modification]');
    expect([...document.querySelectorAll('[data-contre-validation] li')].map((l) => l.textContent)).toEqual(['Commentaire libre : Avant. → Après.']);
    const annonces: unknown[] = [];
    const ecoute = (e: Event) => annonces.push((e as CustomEvent).detail);
    window.addEventListener(EVENEMENT_BIEN_MODIFIE, ecoute);
    const confirmer = q('[data-confirmer-modification]')!;
    await act(async () => { confirmer.click(); confirmer.click(); });
    await attendre();
    expect(posts()).toHaveLength(1);
    const p = posts()[0];
    expect((p.init?.headers as Record<string, string>)['x-svav-confirmation']).toBe('propre');
    expect(p.url).toBe('/api/admin/gestion/annuaire/location');
    const corps = JSON.parse(String(p.init?.body));
    expect(corps).toMatchObject({ action: 'modifier-fiche-bien', id: 7, saisie: { version: 'v1', statut: null } });
    // AUCUN CHAMP PERDU : chaque valeur lue repart telle quelle, seul le commentaire change.
    expect(corps.saisie.valeurs).toEqual({ ...VALEURS, commentaire: 'Après.' });
    const { adresseModifiable: _x, ...cave } = CAVE;
    expect(corps.saisie.annexes).toEqual([cave]);
    expect(modale()?.textContent).toContain('Modifications enregistrées');
    expect(annonces).toContainEqual({ lotId: 7 });
    window.removeEventListener(EVENEMENT_BIEN_MODIFIE, ecoute);
    await clic('[data-fermer-succes-modification]');
    expect(q('[data-modifier-fiche-bien]')).toBeNull();
  });

  it('« Revenir à la saisie » garde la saisie ; refus du serveur → modale rouge, la saisie reste', async () => {
    await ouvrir();
    await saisir(commentaire(), 'Après.');
    await clic('[data-valider-modification]');
    await clic('[data-revenir-saisie]');
    expect(commentaire().value).toBe('Après.');
    reponsePost = async () => ({ ok: false, status: 400, json: async () => ({ etat: 'refus', motif: 'La date du DPE ne peut pas être dans le futur.' }) }) as unknown as Response;
    await clic('[data-valider-modification]');
    await clic('[data-confirmer-modification]');
    expect(modale()?.getAttribute('role')).toBe('alertdialog');
    expect(modale()?.textContent).toContain('La date du DPE ne peut pas être dans le futur.');
    await clic('[data-fermer-erreur-modification]');
    expect(commentaire().value).toBe('Après.');
  });

  it('le statut : seules les transitions permises ; la contre-validation dit ce que le dossier Drive deviendra', async () => {
    await ouvrir();
    expect([...document.querySelectorAll('[data-statut-vers]')].map((e) => (e as HTMLElement).dataset.statutVers)).toEqual(['inchange', 'ancienne_gestion', 'location_seule']);
    await clic('[data-statut-vers="location_seule"]');
    await clic('[data-valider-modification]');
    const lignes = [...document.querySelectorAll('[data-contre-validation] li')].map((l) => l.textContent);
    expect(lignes[0]).toMatch(/^Statut du bien : En gestion → Location seule \(au \d{2}\/\d{2}\/\d{4}\)$/);
    expect(modale()?.textContent).toContain('son dossier Drive passe dans « Base de données location seule »');
    expect(modale()?.textContent).toContain('Le mail de portefeuille part');
  });

  it('« Supprimer » une annexe existante = la sortir du portefeuille ; louée : l’avertissement, puis la confirmation part avec la saisie', async () => {
    occupees = [{ occupationId: 4 }];
    await ouvrir();
    const carte = q('[data-annexe-id="31"]')!;
    await clic([...carte.querySelectorAll('button')].find((b) => b.textContent === 'Supprimer') as HTMLElement);
    expect(q('[data-confirmer-suppression]')?.textContent).toContain('Sortir cette annexe du portefeuille à la validation');
    await clic([...document.querySelectorAll('[data-confirmer-suppression] button')].find((b) => b.textContent === 'Oui, supprimer') as HTMLElement);
    expect(q('[data-annexe-sortie="31"]')).not.toBeNull();
    await clic('[data-valider-modification]');
    expect(modale()?.textContent).toContain('est louée : la sortir du portefeuille clôt sa location en cours');
    await clic('[data-confirmer-modification]');
    expect(JSON.parse(String(posts()[0].init?.body)).saisie).toMatchObject({ confirmeOccupation: true, annexes: [{ id: 31, sortir: true }] });
  });
});

describe('🔴 « Ce bien a été modifié par ailleurs — recharger ? » et la mise à jour automatique', () => {
  it('le serveur refuse une version dépassée → la modale le dit ; « Recharger » relit la fiche', async () => {
    await ouvrir();
    reponsePost = async () => ({ ok: true, status: 200, json: async () => ({ etat: 'conflit', motif: 'Ce bien a été modifié par ailleurs — recharger ?' }) }) as unknown as Response;
    await saisir(commentaire(), 'Après.');
    await clic('[data-valider-modification]');
    await clic('[data-confirmer-modification]');
    expect(modale()?.textContent).toContain('Ce bien a été modifié par ailleurs — recharger ?');
    const lectures = () => appels.filter((a) => a.url.includes('?ficheEntiere=')).length;
    const avant = lectures();
    lecture = { ...LECTURE, version: 'v2', encart: { ...LECTURE.encart, valeurs: { ...VALEURS, commentaire: 'D’un collègue.' } } };
    await clic('[data-recharger-conflit]');
    expect(lectures()).toBe(avant + 1);
    expect(commentaire().value).toBe('D’un collègue.');
  });

  it('toutes les quelques secondes : une autre empreinte prévient la page ET le formulaire ouvert (bandeau « Recharger »)', async () => {
    vi.useFakeTimers();
    await ouvrir();
    expect(q('[data-conflit-version]')).toBeNull();
    const resumes = () => appels.filter((a) => a.url.includes('?resume=')).length;
    const avant = resumes();
    version = 'v2';
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALLE_VERSION_MS); });
    await attendre();
    expect(resumes()).toBe(avant + 1);   // l'encart s'est relu de lui-même
    expect(q('[data-conflit-version]')?.textContent).toContain('Ce bien a été modifié par ailleurs — recharger ?');
    expect(q('[data-etat-modification]')?.textContent).toBe('Ce bien a été modifié par ailleurs — recharger ?');
  });
});

describe('🔴 Annuler, Échap, sortie de page', () => {
  it('sans changement : « Annuler » et Échap referment ; avec changement : la question, « Abandonner » referme', async () => {
    await ouvrir();
    await clic('[data-annuler-modification]');
    expect(q('[data-modifier-fiche-bien]')).toBeNull();
    await clic('[data-modifier-fiche]');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await attendre();
    expect(q('[data-modifier-fiche-bien]')).toBeNull();
    await clic('[data-modifier-fiche]');
    await saisir(commentaire(), 'Après.');
    await clic('[data-annuler-modification]');
    expect(modale()?.textContent).toContain('Abandonner les modifications ?');
    await clic('[data-abandonner-modification]');
    expect(q('[data-modifier-fiche-bien]')).toBeNull();
    expect(posts()).toHaveLength(0);
  });

  it('« Modifications non enregistrées » en quittant, seulement s’il y a des changements', async () => {
    await ouvrir();
    const quitter = () => { const e = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent; window.dispatchEvent(e); return e; };
    expect(quitter().defaultPrevented).toBe(false);
    await saisir(commentaire(), 'Après.');
    expect(quitter().defaultPrevented).toBe(true);
    expect(AVERTISSEMENT_SORTIE).toMatch(/^Modifications non enregistrées/);
    const lien = document.createElement('a'); lien.href = '/admin/location'; document.body.appendChild(lien);
    const question = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }); lien.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(question).toHaveBeenCalledWith(`${AVERTISSEMENT_SORTIE} Quitter quand même ?`);
  });

  it('un clic dans le formulaire ne replie ni ne déplie l’encart', async () => {
    await rendre();
    await clic('[data-bascule-detail]');
    expect(q('[data-resume-bien]')?.dataset.deplie).toBe('oui');
    await clic('[data-modifier-fiche]');
    await clic(q('[data-bloc-bien] h3') as HTMLElement);
    expect(q('[data-resume-bien]')?.dataset.deplie).toBe('oui');
  });
});

describe('🔴 relecture et Historique', () => {
  it('le bien modifié ailleurs dans la page ou le retour sur l’onglet : l’encart se relit', async () => {
    await rendre();
    const resumes = () => appels.filter((a) => a.url.includes('?resume=')).length;
    const avant = resumes();
    await act(async () => { window.dispatchEvent(new CustomEvent(EVENEMENT_BIEN_MODIFIE, { detail: { lotId: 7 } })); });
    await attendre();
    expect(resumes()).toBe(avant + 1);
    await act(async () => { window.dispatchEvent(new CustomEvent(EVENEMENT_BIEN_MODIFIE, { detail: { lotId: 8 } })); });
    await attendre();
    expect(resumes()).toBe(avant + 1);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await attendre();
    expect(resumes()).toBe(avant + 2);
  });

  it('« Modifications de la fiche du bien » : repliée avec son compte ; dépliée : la ligne, la date, l’auteur', async () => {
    global.fetch = vi.fn(async (url: string) => { appels.push({ url: String(url) }); return ok([{ id: 12, quand: '2026-10-21 23:55:18.553996+02', texte: 'Commentaire — Commentaire libre : Avant. → Après.', par: 'arno@exemple.test' }]); }) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(HistoriqueEncart, { lotId: 7 })); }); await attendre();
    expect(q('[data-historique-encart] .gst-compte')?.textContent).toBe('1');
    await clic('[data-historique-encart] button');
    expect(q('[data-modification-encart="12"]')?.textContent).toBe('Commentaire — Commentaire libre : Avant. → Après.21/10/2026 à 23:55 · par arno@exemple.test');
  });
});

describe('🔴 le MÊME écran dans la Gestion et dans la Location', () => {
  const src = (f: string) => readFileSync(f, 'utf8');
  it('la fiche Location rend la fiche commune de la Gestion, qui rend l’encart, dont « Modifier » ouvre le composant de « Nouveau bien »', () => {
    expect(src('app/(admin)/admin/(protected)/location/bien/[id]/page.tsx')).toContain('<FicheCommuneLocation');
    expect(src('app/(admin)/admin/(protected)/gestion/FicheCommune.tsx')).toContain('<Annuaire ');
    expect(src('app/(admin)/admin/(protected)/gestion/Annuaire.tsx')).toContain('<ResumeBienFiche ');
    expect(src('app/(admin)/admin/(protected)/gestion/ResumeBien.tsx')).toContain('<ModifierFicheBien ');
    expect(src('app/(admin)/admin/(protected)/gestion/ModifierFicheBien.tsx')).toContain('<CreationBien ');
    expect(src('app/(admin)/admin/(protected)/location/nouveau-bien/page.tsx')).toContain('<CreationBien ');
  });
});
