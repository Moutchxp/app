// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FriseAvancement } from './FriseAvancement';

/**
 * 🔴🔴 LOT GESTION-TRADUCTION (Arno, 10/11/2026) — LE COMMENTAIRE TRADUIT, À L'ÉCRAN. Les VRAIS composants, route simulée.
 *
 * Règle 1 : le texte d'origine n'est jamais modifié ; la traduction s'affiche sous « Traduit automatiquement de l’espagnol », avec
 * « Voir l’original » ; un commentaire français ne change pas. Règle 3 : échec du service → l'original + « Traduction indisponible ».
 * Le commentaire espagnol est un texte RÉEL de production (`.captures/monga-espagnol/resultat-prod.txt`).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ORIGINAL_ES = 'No hemos podido contactar al contacto en el lugar durante nuestra llamada, le hemos dejado un mensaje, de voz '
  + 'complementado con un SMS, un recordatorio está programado para el final del día.';
const TRADUIT = 'Nous n’avons pas pu joindre le contact sur place lors de notre appel ; nous lui avons laissé un message vocal, '
  + 'complété par un SMS, et un rappel est programmé pour la fin de la journée.';
const FRANCAIS = 'Bonjour, le technicien passera demain matin pour vérifier la fuite.';

type Etape = Record<string, unknown>;
const etape = (id: number, p: Etape = {}): Etape => ({ id, reference: 'MNG-10001', type: 'commentaire', survenuLe: '2026-11-09 12:22:00', heureConnue: true,
  jourConnu: true, heureFin: null, numero: null, rang: null, montantCents: null, texte: FRANCAIS, auteur: 'Prénom Nom', source: 'monga',
  certitude: 'fiable', statut: 'vif', messageId: 900 + id, aEuUnMail: true, filId: 50, pieceNom: null, creeParLibelle: null,
  creeLe: '2026-11-09 12:22:00', titre: null, rangPose: id, poseChoisie: false, rangDevis: null, expediteurNom: 'Monga', expediteurAdresse: 'noreply@monga.io', ...p });

let container: HTMLDivElement; let root: Root; let etapes: Etape[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  Element.prototype.scrollIntoView = vi.fn();
  etapes = [
    etape(1, { texte: ORIGINAL_ES, traduction: { statut: 'traduite', langue: 'es', texte: TRADUIT } }),
    etape(2),                                                                                   // français : aucune traduction
    etape(3, { texte: ORIGINAL_ES, traduction: { statut: 'echec', langue: null, texte: null } }),
  ];
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({
    etat: 'ok', ouvert: true, ouvertLe: '2026-11-09 09:00:00', typesAjoutables: [], passagesEnFiableProposes: [], correction: true, etapes, taches: [] })));
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });
const monter = async () => {
  await act(async () => { root.render(createElement(FriseAvancement, { evenementId: 37, onOuvrirFil: () => {} })); });
  await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); });
};
const ouvrir = async (id: number) => {
  await act(async () => { (container.querySelector(`.fav-point[data-carte="${id}"]`) as HTMLButtonElement).click(); });
  return container.querySelector('.fav-zone .fav-bulle') as HTMLElement;
};

describe('🔴🔴 un commentaire espagnol : la traduction affichée, l’original intact et à portée', () => {
  it('« Traduit automatiquement de l’espagnol », la traduction ; l’original n’apparaît qu’après « Voir l’original », mot pour mot', async () => {
    await monter();
    const b = await ouvrir(1);
    expect(b.querySelector('.trad-titre')?.textContent).toBe('Traduit automatiquement de l’espagnol');
    expect(b.querySelector('.fav-bulle-texte')?.textContent).toBe(TRADUIT);
    expect(b.textContent).not.toContain(ORIGINAL_ES);
    const lien = b.querySelector('.trad-lien') as HTMLButtonElement;
    expect(lien.textContent).toBe('Voir l’original');
    expect(lien.getAttribute('aria-expanded')).toBe('false');
    await act(async () => { lien.click(); });
    const original = b.querySelector('[data-original]') as HTMLElement;
    expect(original.textContent).toBe(ORIGINAL_ES);           // le texte d'origine, intact
    expect(original.getAttribute('lang')).toBe('es');
    expect(lien.textContent).toBe('Masquer l’original');
    expect(b.querySelector('.fav-bulle-texte')?.textContent).toBe(TRADUIT);   // la traduction reste au-dessus
  });
  it('la donnée reçue n’est pas réécrite : `texte` reste l’original, la traduction voyage à côté', () => {
    expect(etapes[0].texte).toBe(ORIGINAL_ES);
  });
});

describe('🔴 un commentaire français ne change pas', () => {
  it('le même paragraphe qu’avant : ni titre, ni lien, ni enveloppe', async () => {
    await monter();
    const b = await ouvrir(2);
    const p = b.querySelector('.fav-bulle-texte') as HTMLElement;
    expect(p.tagName).toBe('P');
    expect(p.textContent).toBe(FRANCAIS);
    expect(p.parentElement).toBe(b);
    expect(b.querySelector('.trad, .trad-titre, .trad-lien, .trad-indispo')).toBeNull();
  });
});

describe('🔴 échec du service : l’original, et « Traduction indisponible »', () => {
  it('le texte d’origine s’affiche, avec la mention ; ni titre de traduction, ni lien', async () => {
    await monter();
    const b = await ouvrir(3);
    expect(b.querySelector('.fav-bulle-texte')?.textContent).toBe(ORIGINAL_ES);
    expect(b.querySelector('.trad-indispo')?.textContent).toBe('Traduction indisponible');
    expect(b.querySelector('.trad-titre, .trad-lien')).toBeNull();
  });
});

describe('le panneau de correction montre le même texte traduit (même composant)', () => {
  it('PanneauCorrectionEtape rend `TexteTraduit` à la place du paragraphe brut', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/PanneauCorrectionEtape.tsx', 'utf8');
    expect(src).toContain('<TexteTraduit key={e.id} texte={e.texte as string} traduction={e.traduction} classe="pce-mail-texte" />');
    const frise = readFileSync('app/(admin)/admin/(protected)/gestion/FriseAvancement.tsx', 'utf8');
    expect(frise).toContain('classe="fav-commentaire-texte" balise="span"');
  });
});

/**
 * 🔴🔴 2e TEMPS (Arno, 10/11/2026) — le texte des ÉTAPES reconnues depuis un mail non français, même présentation, affichage seul.
 * Un rendez-vous espagnol RÉEL, À VALIDER : la bulle du « i » le montre traduit ; le carré garde son mot, sa date, sa plage et ses ✓/✗.
 */
const RDV_ES = 'Hola, la intervención con nuestro artesano asociado ha sido fijada para el 11/11/2026 entre 17h00 y 19h00';
const RDV_FR = 'Bonjour, l’intervention avec notre artisan partenaire a été fixée au 11/11/2026 entre 17h00 et 19h00';
describe('🔴🔴 une étape reconnue (rendez-vous espagnol, à valider) : traduite dans sa bulle, l’étape inchangée', () => {
  const rdv = (traduction: unknown) => etape(10, { type: 'rdv_intervention', texte: RDV_ES, certitude: 'a_confirmer', survenuLe: '2026-11-11 17:00:00',
    heureFin: '19:00', traduction });
  const carre = () => container.querySelector('li.fav-el--carre[data-carte="10"]') as HTMLElement;
  const survolerI = async () => {
    const i = carre().querySelector('.fav-picto-i') as HTMLButtonElement;
    await act(async () => { i.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); i.focus(); });
    return container.querySelector('.fav-commentaire') as HTMLElement;
  };
  it('la bulle du « i » : « Traduit automatiquement de l’espagnol », la traduction, « Voir l’original » qui rend l’original intact', async () => {
    etapes = [rdv({ statut: 'traduite', langue: 'es', texte: RDV_FR })];
    await monter();
    const b = await survolerI();
    expect(b.querySelector('.trad-titre')?.textContent).toBe('Traduit automatiquement de l’espagnol');
    expect(b.querySelector('.fav-commentaire-texte')?.textContent).toBe(RDV_FR);
    await act(async () => { (b.querySelector('.trad-lien') as HTMLButtonElement).click(); });
    expect(b.querySelector('[data-original]')?.textContent).toBe(RDV_ES);
  });
  it('🔴 l’étape ne change pas : même carré (mot, date, plage, ✓/✗, encadré à valider) avec ou sans traduction', async () => {
    etapes = [rdv(null)];
    await monter();
    const sans = carre().cloneNode(true) as HTMLElement;
    act(() => root.unmount()); root = createRoot(container);
    etapes = [rdv({ statut: 'traduite', langue: 'es', texte: RDV_FR })];
    await monter();
    const avec = carre();
    expect(avec.outerHTML).toBe(sans.outerHTML);
    expect(avec.querySelector('[data-valider-etape]')).not.toBeNull();
    expect(avec.querySelector('[data-refuser-etape]')).not.toBeNull();
    expect(avec.textContent).toContain('11/11/2026');
  });
  it('un contact injoignable espagnol (point) : même présentation dans sa bulle', async () => {
    etapes = [etape(11, { type: 'contact_injoignable', certitude: 'a_confirmer', texte: ORIGINAL_ES, traduction: { statut: 'traduite', langue: 'es', texte: TRADUIT } })];
    await monter();
    const b = await ouvrir(11);
    expect(b.querySelector('.trad-titre')?.textContent).toBe('Traduit automatiquement de l’espagnol');
    expect(b.querySelector('.fav-bulle-texte')?.textContent).toBe(TRADUIT);
  });
});
