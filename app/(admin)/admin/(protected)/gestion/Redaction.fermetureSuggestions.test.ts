// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import { rangerSuggestions } from '../../../../lib/gestion/suggestionsBien';

/**
 * ══ 🔴🔴 LOT COMPOSEUR-FERMETURE-SUGGESTIONS-PARTOUT ═══════════════════════════════════════════════════════════════════
 * DÉFAUT D'ARNO : une adresse validée dans Cc ou Cci, la liste de suggestions ne se fermait plus au clic ailleurs.
 * CAUSE : l'écouteur du clic ailleurs tenait pour « dedans » TOUT le bloc du champ (libellé, puces, rangée) ; un clic
 * sur le libellé rouvrait la liste (clic renvoyé à la saisie), et sur une puce ou la rangée elle ne se fermait que si
 * la saisie perdait le focus.
 * ⚠️ ICI, LES APPUIS NE FONT PAS PERDRE LE FOCUS (`appuyer`) : c'est l'écouteur SEUL qu'on éprouve, pas le ricochet
 * du `blur` — c'est exactement ce qui manquait.
 * Dans trois composeurs (Nouveau message, Répondre, Écrire depuis gestion@), pour À, Cc et Cci portant 1 puis 2
 * adresses : la liste ouverte se ferme sur chaque cible, et les adresses ne bougent pas.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test', delaiAnnulationS: 5,
};
const BASE = { id: null, cc: [], cci: [], citation: null, destinatairesApproximatifs: false, filId: null };
const COMPOSEURS: Array<[string, BrouillonEcran]> = [
  ['Nouveau message', { ...BASE, voie: 'nouveau', a: [], objet: '', corps: '\n\nService Gestion', repondALeMessageId: null } as BrouillonEcran],
  ['Répondre', { ...BASE, voie: 'repondre', a: [], objet: 'Re: Quittance', corps: '\n\nService Gestion',
    filId: 10, repondALeMessageId: 77 } as BrouillonEcran],
  ['Écrire depuis gestion@', { ...BASE, voie: 'nouveau', a: [], objet: 'XXXXXXXX / Cabinet Criterimmo', corps: 'Bonjour,\n\n\n',
    repondALeMessageId: null, depuisLeBien: true,
    suggestionsBien: rangerSuggestions({
      clients: [
        { adresse: 'jean@x.fr', nom: 'DUPONT Jean', role: 'Propriétaire', ton: 'proprietaire', propre: true, civilite: 'M.', nomFamille: 'DUPONT' },
        { adresse: 'valentin.talhouarn@gmail.com', nom: 'YOUENOU et TALHOUARN Marine et Valentin', role: 'Locataire', ton: 'locataire', propre: true, civilite: null, nomFamille: null },
      ],
      immeuble: [{ adresse: 'syndic@x.fr', nom: 'Cabinet', role: 'Syndic — e-mail général', ton: 'syndic', propre: true, civilite: null, nomFamille: null }],
    }) } as BrouillonEcran],
];
const CHAMPS = ['À', 'Cc', 'Cci'] as const;
type Champ = (typeof CHAMPS)[number];
const cleDe = (c: Champ): 'a' | 'cc' | 'cci' => (c === 'À' ? 'a' : c === 'Cc' ? 'cc' : 'cci');
const ADRESSES = ['un@exemple.fr', 'deux@exemple.fr'];

let container: HTMLDivElement;
let dehors: HTMLDivElement;
let root: Root;
let courant: BrouillonEcran;
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  dehors = document.createElement('div'); dehors.textContent = 'page derrière la fenêtre'; document.body.appendChild(dehors);
  vi.stubGlobal('fetch', vi.fn(async (u: unknown) => new Response(JSON.stringify(String(u).includes('correspondants')
    ? { correspondants: [{ adresse: 'artisan@exemple.fr', nom: 'Artisan' }, { adresse: 'agence@exemple.fr', nom: null }] }
    : { ok: true }), { status: 200 })));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); dehors.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async (b: BrouillonEcran) => {
  courant = b;
  const rendre = () => root.render(createElement(Redaction, {
    dansFenetre: true, brouillon: courant, contexte: CONTEXTE,
    onChange: (n: BrouillonEcran) => { courant = n; rendre(); },
    onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {},
  } as never));
  await act(async () => { rendre(); });
  await calmer();
};
const ligne = (c: string) => container.querySelector(`[data-champ="${c}"]`) as HTMLElement;
const saisie = (c: string) => ligne(c).querySelector('input.red-saisie') as HTMLInputElement;
const listeOuverte = (c: string) => !!ligne(c)?.querySelector('[role="listbox"]');
const listesOuvertes = () => [...container.querySelectorAll('[data-champ]')].filter((l) => l.querySelector('[role="listbox"]')).length;
/**
 * Un APPUI qui ne déplace PAS le focus : `pointerdown`, `mousedown` puis `click`, sans `blur`. Le navigateur, lui,
 * déplace parfois le focus (et le `blur` fermait alors par ricochet) ; ici, seul l'écouteur du composeur peut fermer.
 */
const appuyer = async (el: Element, { sansMousedown = false } = {}) => {
  await act(async () => {
    el.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    if (!sansMousedown) el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    (el as HTMLElement).click();
  });
  await calmer();
};
const taper = async (input: HTMLInputElement, texte: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(input, texte);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await calmer();
};
/** Ouvre la liste : un clic dans la saisie (adresses du bien), ou deux lettres tapées (correspondants). */
const ouvrir = async (c: Champ, b: BrouillonEcran) => {
  await act(async () => { saisie(c).focus(); });
  await appuyer(saisie(c));
  if (!b.suggestionsBien) await taper(saisie(c), 'ar');
  await act(async () => { vi.advanceTimersByTime(400); });
  await calmer();
  expect(listeOuverte(c), `liste de ${c} ouverte`).toBe(true);
};

/** Les cibles d'Arno, prises dans le composeur (la barre de titre est celle de la fenêtre flottante : voir plus bas). */
const CIBLES: Array<[string, (c: Champ) => Element | null]> = [
  ['le libellé du champ', (c) => ligne(c).querySelector('label')],
  ['une puce du champ', (c) => ligne(c).querySelector('.red-pastille-texte')],
  ['la rangée des puces (zone vide)', (c) => ligne(c).querySelector('.red-pastilles')],
  ['le libellé « Objet »', () => container.querySelector('label[for="red-objet"]')],
  ['l’objet', () => container.querySelector('#red-objet')],
  ['le libellé « Message »', () => container.querySelector('#red-corps-label')],
  ['le corps', () => container.querySelector('.red-corps-riche [contenteditable]') ?? container.querySelector('.red-corps-riche')],
  ['la ligne « De : » (marge)', () => container.querySelector('.gst-note')],
  ['la fenêtre elle-même (zone vide)', () => container.querySelector('section.red')],
  ['le bouton « Cc »', () => container.querySelector('[data-bascule="Cc"]')],
  ['le bouton « Cci »', () => container.querySelector('[data-bascule="Cci"]')],
  ['une puce d’un AUTRE champ', (c) => ligne(c === 'À' ? 'Cc' : 'À').querySelector('.red-pastille-texte')],
  ['hors de la fenêtre', () => dehors],
];

describe.each(COMPOSEURS)('composeur « %s »', (_nom, depart) => {
  for (const champ of CHAMPS) {
    for (const n of [1, 2]) {
      const adresses = ADRESSES.slice(0, n);
      // Toutes les lignes ouvertes et remplies : une puce d'un AUTRE champ existe toujours.
      const brouillon = (): BrouillonEcran => ({
        ...depart, a: ['a@exemple.fr'], cc: ['c@exemple.fr'], cci: ['k@exemple.fr'], [cleDe(champ)]: adresses,
      } as BrouillonEcran);

      it(`${champ} avec ${n} adresse(s) : la liste se ferme sur CHAQUE cible, adresses intactes`, async () => {
        await monter(brouillon());
        const avant = { a: [...courant.a], cc: [...courant.cc], cci: [...courant.cci] };
        for (const [nom, cible] of CIBLES) {
          await ouvrir(champ, depart);
          const el = cible(champ);
          expect(el, nom).not.toBeNull();
          await appuyer(el as Element);
          expect(listesOuvertes(), `après un appui sur ${nom}`).toBe(0);
          // Aucune adresse retirée. Seul ajout possible : les deux lettres TAPÉES pour ouvrir la liste des correspondants,
          //   validées quand un bouton « Cc » / « Cci » emmène le curseur ailleurs — la règle d'avant, inchangée.
          for (const k of ['a', 'cc', 'cci'] as const) {
            expect(courant[k].slice(0, avant[k].length), `${k} après ${nom}`).toEqual(avant[k]);
            expect(courant[k].slice(avant[k].length).filter((x) => x !== 'ar'), `${k} après ${nom}`).toEqual([]);
          }
          for (const k of ['a', 'cc', 'cci'] as const) avant[k] = [...courant[k]];
          // Rouvrir des lignes que l'appui aurait pu refermer n'a pas lieu d'être : elles sont remplies, elles restent.
          expect(ligne('Cc'), nom).not.toBeNull();
          expect(ligne('Cci'), nom).not.toBeNull();
        }
      });
    }
  }

  it('Échap ferme la liste, avec ou sans adresse ; rien n’est retiré', async () => {
    await monter({ ...depart, cci: ['un@exemple.fr'] } as BrouillonEcran);
    await ouvrir('Cci', depart);
    await act(async () => { saisie('Cci').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
    await calmer();
    expect(listesOuvertes()).toBe(0);
    expect(courant.cci).toEqual(['un@exemple.fr']);
  });

  it('🔴 le libellé du champ : la liste reste fermée, le curseur va dans le champ (le clic renvoyé ne la rouvre plus)', async () => {
    await monter({ ...depart, cci: ['un@exemple.fr'] } as BrouillonEcran);
    await ouvrir('Cci', depart);
    const libelle = ligne('Cci').querySelector('label') as HTMLLabelElement;
    await act(async () => { saisie('Cci').blur(); });
    await appuyer(libelle);
    expect(listesOuvertes()).toBe(0);
    expect(document.activeElement).toBe(saisie('Cci'));
    // …et un clic dans la saisie la rouvre, comme avant.
    await appuyer(saisie('Cci'));
    if (depart.suggestionsBien) expect(listeOuverte('Cci')).toBe(true);
  });

  it('un appui dont le `mousedown` n’arrive jamais (doigt, stylet) ferme aussi la liste', async () => {
    await monter({ ...depart, cc: ['un@exemple.fr', 'deux@exemple.fr'] } as BrouillonEcran);
    await ouvrir('Cc', depart);
    await appuyer(container.querySelector('#red-objet') as Element, { sansMousedown: true });
    expect(listesOuvertes()).toBe(0);
  });

  it('dans la saisie et dans la liste, rien ne se ferme ; choisir une adresse l’ajoute sans rien retirer', async () => {
    await monter({ ...depart, cci: ['un@exemple.fr'] } as BrouillonEcran);
    await ouvrir('Cci', depart);
    await appuyer(saisie('Cci'));
    expect(listeOuverte('Cci')).toBe(true);
    const option = ligne('Cci').querySelector('[role="option"]') as HTMLElement;
    await act(async () => { option.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true })); });
    expect(listeOuverte('Cci')).toBe(true);                       // l'appui sur la liste ne la ferme pas…
    await act(async () => { option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    await calmer();
    expect(courant.cci.length).toBe(2);                              // …et le choix est fait
    expect(courant.cci[0]).toBe('un@exemple.fr');
  });

  it('le « × » d’une puce du champ retire CETTE adresse seulement (son rôle) et ferme la liste', async () => {
    await monter({ ...depart, cci: ['un@exemple.fr', 'deux@exemple.fr'] } as BrouillonEcran);
    await ouvrir('Cci', depart);
    await appuyer(ligne('Cci').querySelector('button[aria-label="Retirer un@exemple.fr"]') as Element);
    expect(courant.cci).toEqual(['deux@exemple.fr']);
    expect(listesOuvertes()).toBe(0);
  });
});
