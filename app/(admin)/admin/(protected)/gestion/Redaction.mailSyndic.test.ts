// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import { brouillonMailSyndic, corpsMailSyndic, objetMailSyndic, surlignageObjet } from '../../../../lib/gestion/mailSyndic';

/**
 * ══ 🔴🔴 LOT MAIL-SYNDIC-PREREMPLI — LE VRAI ÉDITEUR, OUVERT PRÉ-REMPLI ══════════════════════════════════════════════
 * LOT MAIL-PREREMPLI-TEXTE-B-ET-NOM-DANS-OBJET : à l'ouverture, le curseur est à la FIN de l'objet, rien n'est
 * sélectionné, le nom du compte est SURLIGNÉ (jamais effacé par la frappe). Le corps s'affiche ligne par ligne, avec
 * ses lignes vides. Et RIEN n'est enregistré : un brouillon pré-rempli qu'on n'a pas touché n'existe pas (aucun POST
 * vers les brouillons, donc aucun brouillon Gmail), et rien n'est envoyé.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test',
  delaiAnnulationS: 5,
};

const pret = (bien: Parameters<typeof corpsMailSyndic>[0]['bien'], residence: string | null, nom: string | null = 'Arnaud JOREL') => {
  const objet = objetMailSyndic(residence, nom);
  return { objet, surlignage: surlignageObjet(objet, nom), corps: corpsMailSyndic({ destinataires: [{ civilite: 'Mme', nom: 'Durand' }], bien }) };
};
const brouillon = (p: ReturnType<typeof pret>): BrouillonEcran => ({
  id: null, voie: 'nouveau', a: ['l.durand@criterimmo.fr'], cc: [], cci: [], citation: null,
  destinatairesApproximatifs: false, filId: null, repondALeMessageId: null,
  ...brouillonMailSyndic(p, { texte: CONTEXTE.signature }),
});

let container: HTMLDivElement;
let root: Root;
let requetes: { url: string; methode: string }[];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  requetes = [];
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, init?: { method?: string }) => {
    requetes.push({ url: String(entree), methode: init?.method ?? 'GET' });
    return new Response(JSON.stringify({ ok: true, suggestions: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
let courant: BrouillonEcran;
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
/** Les lignes du corps telles que l'éditeur les affiche : un paragraphe par ligne, vide = « ». */
const lignesAffichees = (): string[] => {
  const zone = container.querySelector('.red-corps-riche [contenteditable]') ?? container.querySelector('.red-corps-riche');
  return [...(zone?.querySelectorAll('p') ?? [])].map((p) => p.textContent ?? '');
};

const BIEN = {
  proprietaires: ['LOPES Alberto'],
  descriptif: { nature: 'Appartement meublé', typeBien: 'Type 2' },
  locataires: [{ nom: 'ROI Nathan', telephone: '06 12 34 56 78', email: 'n.roi@x.fr' }],
};

const objetDe = () => container.querySelector('#red-objet') as HTMLInputElement;
const surligne = () => container.querySelector('.red-objet-nom')?.textContent ?? null;
const taperDansObjet = async (valeur: string, curseur = valeur.length) => {
  await act(async () => {
    const champ = objetDe();
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(champ, valeur);
    champ.setSelectionRange(curseur, curseur);
    champ.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await calmer();
};

describe('🔴🔴 LOT MAIL-PREREMPLI-TEXTE-B-ET-NOM-DANS-OBJET — l’objet : le nom surligné, le curseur à la fin, rien de sélectionné', () => {
  it('depuis une fiche bien : le nom du compte en tête, SURLIGNÉ ; curseur à la FIN ; aucune sélection', async () => {
    await monter(brouillon(pret(BIEN, '25 rue Edith Cavell, 92400 Courbevoie')));
    const objet = objetDe();
    expect(objet.value).toBe('Arnaud JOREL / Cabinet Criterimmo / résidence 25 rue Edith Cavell, 92400 Courbevoie');
    expect(document.activeElement).toBe(objet);
    expect([objet.selectionStart, objet.selectionEnd]).toEqual([objet.value.length, objet.value.length]);
    expect(surligne()).toBe('Arnaud JOREL');
    expect(objet.classList.contains('red-objet--surligne')).toBe(true);
    // Le miroir dessine EXACTEMENT le texte du champ, et n'est pas lu deux fois.
    expect(container.querySelector('.red-objet-miroir')?.textContent).toBe(objet.value);
    expect(container.querySelector('.red-objet-miroir')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.red-pastille')?.textContent).toContain('l.durand@criterimmo.fr');
  });

  it('🔴 taper au clavier n’efface PAS le nom : la frappe s’ajoute à la fin, le nom reste surligné', async () => {
    await monter(brouillon(pret(BIEN, 'R')));
    await taperDansObjet(`${objetDe().value} — urgent`);
    expect(courant.objet).toBe('Arnaud JOREL / Cabinet Criterimmo / résidence R — urgent');
    expect(surligne()).toBe('Arnaud JOREL');
  });

  it('nom modifié à la main : le surlignage suit ; nom effacé : il disparaît proprement (champ ordinaire)', async () => {
    await monter(brouillon(pret(BIEN, 'R')));
    await taperDansObjet('Arnaud J. / Cabinet Criterimmo / résidence R', 9);
    expect(surligne()).toBe('Arnaud J.');
    await taperDansObjet('Cabinet Criterimmo / résidence R', 0);
    expect(surligne()).toBeNull();
    expect(container.querySelector('.red-objet-miroir')).toBeNull();
    expect(objetDe().classList.contains('red-objet--surligne')).toBe(false);
    expect(objetDe().value).toBe('Cabinet Criterimmo / résidence R');
  });

  it('compte sans nom : « Cabinet Criterimmo / … », rien de surligné, curseur à la fin', async () => {
    await monter(brouillon(pret(BIEN, 'R', null)));
    const objet = objetDe();
    expect(objet.value).toBe('Cabinet Criterimmo / résidence R');
    expect(surligne()).toBeNull();
    expect(document.activeElement).toBe(objet);
    expect([objet.selectionStart, objet.selectionEnd]).toEqual([objet.value.length, objet.value.length]);
  });

  it('depuis l’écran « Syndics » : objet sans résidence, corps = formule seule puis la signature', async () => {
    await monter(brouillon(pret(null, null)));
    expect(objetDe().value).toBe('Arnaud JOREL / Cabinet Criterimmo');
    expect(lignesAffichees()).toEqual(['Bonjour Madame DURAND,', '', '', 'Service Gestion']);
  });

  it('🔴🔴 l’enregistrement du brouillon (qui lui donne un numéro) ne relance AUCUNE sélection, ne reprend pas le curseur', async () => {
    await monter(brouillon(pret(BIEN, 'R')));
    // On travaille dans « À » ; puis le brouillon reçoit son numéro (ce que fait le premier enregistrement).
    const a = container.querySelector('[data-champ="À"] input.red-saisie') as HTMLInputElement;
    await act(async () => { a.focus(); });
    await act(async () => { courant = { ...courant, id: 4242 }; root.render(createElement(Redaction, {
      dansFenetre: true, brouillon: courant, contexte: CONTEXTE, onChange: () => {}, onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {},
    } as never)); });
    await calmer();
    expect(document.activeElement).toBe(a);
    const objet = objetDe();
    expect(objet.selectionStart).toBe(objet.selectionEnd);
    expect(surligne()).toBe('Arnaud JOREL');
  });

  it('⚠️ un message ordinaire (pas de pré-remplissage) ne vole pas le curseur à l’objet, et rien n’y est surligné', async () => {
    await monter({ ...brouillon(pret(null, null)), curseurEnFinDObjet: undefined, surlignageObjet: undefined });
    expect(document.activeElement).not.toBe(objetDe());
    expect(container.querySelector('.red-objet-miroir')).toBeNull();
  });
});

describe('🔴 le corps dans l’éditeur, ligne par ligne (version B)', () => {
  const ADR = '25 rue Edith Cavell, 92400 Courbevoie';
  const ANNONCE = 'Le Cabinet Criterimmo assure la gestion locative d\'un bien situé dans la résidence du '
    + '25 rue Edith Cavell, 92400 Courbevoie, dont vous êtes le syndic. Ce bien appartient à :';
  it('formule, deux lignes vides, blocs séparés d’une ligne vide, deux lignes vides, signature', async () => {
    await monter(brouillon(pret({ ...BIEN, adresse: ADR }, ADR)));
    expect(lignesAffichees()).toEqual([
      'Bonjour Madame DURAND,', '', '',
      ANNONCE, '', 'LOPES Alberto', '',
      'Il s\'agit d\'un appartement meublé de 2 pièces, actuellement occupé par :', '',
      'ROI Nathan · 06 12 34 56 78 · n.roi@x.fr', '', '',
      'Service Gestion',
    ]);
  });
  it('plusieurs propriétaires, deux locataires', async () => {
    await monter(brouillon(pret({ ...BIEN, adresse: ADR, proprietaires: ['A Un', 'B Deux'], locataires: [{ nom: 'C Trois' }, { nom: 'D Quatre', email: 'd@x.fr' }] }, ADR)));
    const l = lignesAffichees();
    expect(l[3]).toBe(ANNONCE);
    expect(l.slice(5, 7)).toEqual(['A Un', 'B Deux']);
    expect(l).toContain('Il s\'agit d\'un appartement meublé de 2 pièces, actuellement occupé par :');
    expect(l.slice(-5)).toEqual(['C Trois', 'D Quatre · d@x.fr', '', '', 'Service Gestion']);
  });
  it('aucun propriétaire, bien vacant, description absente', async () => {
    await monter(brouillon(pret({ adresse: ADR, proprietaires: [], descriptif: {}, locataires: [] }, ADR)));
    const l = lignesAffichees();
    expect(l.slice(5)).toEqual(['(propriétaire non renseigné)', '', 'Il s\'agit d\'un logement, actuellement vacant.', '', '', 'Service Gestion']);
  });
});

describe('🔴 le mail ENVOYÉ porte l’objet en texte brut (aucune mise en forme du surlignage)', () => {
  it('l’envoi (doublé, rien ne part) : `objet` est la chaîne seule, sans balise, sans plage', async () => {
    await monter(brouillon(pret(BIEN, 'R')));
    const envoyer = [...container.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Envoyer') as HTMLButtonElement;
    await act(async () => { envoyer.click(); });
    await act(async () => { vi.advanceTimersByTime(8000); });
    await calmer();
    const envoi = (fetch as unknown as { mock: { calls: Array<[unknown, { method?: string; body?: string }?]> } }).mock.calls
      .find((c) => String(c[0]).includes('/envois') && c[1]?.method === 'POST');
    expect(envoi, 'POST /envois').toBeDefined();
    const corps = JSON.parse(String(envoi?.[1]?.body)) as Record<string, unknown>;
    expect(corps.objet).toBe('Arnaud JOREL / Cabinet Criterimmo / résidence R');
    expect(JSON.stringify(corps)).not.toMatch(/surlign|<mark|red-objet/);
  });
});

describe('🔴🔴 rien n’est enregistré ni envoyé tant qu’Arno n’a rien modifié', () => {
  it('aucune écriture (ni brouillon, ni envoi) après l’ouverture, même plusieurs secondes après', async () => {
    await monter(brouillon(pret(BIEN, 'R')));
    await act(async () => { vi.advanceTimersByTime(6000); });
    await calmer();
    expect(requetes.filter((r) => r.methode !== 'GET')).toEqual([]);
  });
});

describe('🔴🔴 LOT FORMULE-CONTACT-PRIME — la formule ne dépend QUE de « À » ; Cc et Cci ne la changent jamais', () => {
  const CIV = {
    'arnaud.jorel@gmail.com': { civilite: 'M.' as const, nom: 'JOREL' },
    'f@x.fr': { civilite: 'Mme' as const, nom: 'Durand' },
    'h@x.fr': { civilite: 'M.' as const, nom: 'Martin' },
  };
  const ouvrir = async () => {
    const b = brouillon(pret(null, null));
    const corps = b.corps.replace(/^[^\n]*/, 'Bonjour Monsieur JOREL,');
    await monter({ ...b, a: ['arnaud.jorel@gmail.com'], corps, corpsHtml: (b.corpsHtml ?? '').replace(/^<p>[^<]*<\/p>/, '<p>Bonjour Monsieur JOREL,</p>'),
      appel: { formule: 'Bonjour Monsieur JOREL,', civilites: CIV } } as BrouillonEcran);
  };
  const champ = (l: string) => container.querySelector(`[data-champ="${l}"] input.red-saisie`) as HTMLInputElement;
  const ajouter = async (l: string, adresse: string) => {
    if (champ(l) === null) {
      await act(async () => { (container.querySelector(`[data-bascule="${l}"]`) as HTMLButtonElement).click(); });
      await calmer();
    }
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(champ(l), adresse);
      champ(l).dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { champ(l).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    await calmer();
  };
  const retirer = async (l: string, adresse: string) => {
    await act(async () => { (container.querySelector(`[data-champ="${l}"] button[aria-label="Retirer ${adresse}"]`) as HTMLButtonElement).click(); });
    await calmer();
  };

  it('🔴 un contact connu avec civilité seul en À : « Bonjour Monsieur JOREL, »', async () => {
    await ouvrir();
    expect(lignesAffichees()[0]).toBe('Bonjour Monsieur JOREL,');
  });
  it('🔴 ajouter puis retirer des contacts connus en Cc et en Cci : la formule NE BOUGE PAS', async () => {
    await ouvrir();
    await ajouter('Cc', 'f@x.fr');
    await ajouter('Cci', 'h@x.fr');
    expect([courant.cc, courant.cci]).toEqual([['f@x.fr'], ['h@x.fr']]);
    expect(lignesAffichees()[0]).toBe('Bonjour Monsieur JOREL,');
    expect(courant.corps.split('\n')[0]).toBe('Bonjour Monsieur JOREL,');
    await retirer('Cc', 'f@x.fr');
    await retirer('Cci', 'h@x.fr');
    expect(lignesAffichees()[0]).toBe('Bonjour Monsieur JOREL,');
  });
  it('…mais ajouter ou retirer en À la recalcule (même fonction qu’à l’ouverture)', async () => {
    await ouvrir();
    await ajouter('À', 'f@x.fr');
    expect(lignesAffichees()[0]).toBe('Bonjour Madame, Monsieur,');
    await retirer('À', 'f@x.fr');
    expect(lignesAffichees()[0]).toBe('Bonjour Monsieur JOREL,');
  });
});

describe('🔴 LOT OBJET-CARTOUCHE-NOM-SELON-PROFIL-GESTION, POINT 1 — un clic sur le cartouche le retire, le nom reste', () => {
  const RECT = { left: 10, right: 100, top: 0, bottom: 20, width: 90, height: 20, x: 10, y: 0, toJSON: () => ({}) } as DOMRect;
  const poserRect = () => {
    const nom = container.querySelector('.red-objet-nom') as HTMLElement;
    nom.getBoundingClientRect = () => RECT;
  };
  const souris = async (type: string, x: number) => {
    await act(async () => { objetDe().dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 10 })); });
    await calmer();
  };
  it('survol du nom : « Cliquer pour valider le nom » ; ailleurs : aucune info-bulle', async () => {
    await monter(brouillon(pret(BIEN, 'R')));
    poserRect();
    await souris('mousemove', 50);
    expect(objetDe().title).toBe('Cliquer pour valider le nom');
    await souris('mousemove', 300);
    expect(objetDe().getAttribute('title')).toBeNull();
  });
  it('🔴 clic sur le cartouche : il disparaît ; le nom et l’objet restent intacts ; rien n’est enregistré', async () => {
    await monter(brouillon(pret(BIEN, 'R')));
    poserRect();
    const avant = courant.objet;
    await souris('mousedown', 50);
    await act(async () => { objetDe().click(); });
    await calmer();
    expect(surligne()).toBeNull();
    expect(container.querySelector('.red-objet-miroir')).toBeNull();
    expect(objetDe().classList.contains('red-objet--surligne')).toBe(false);
    expect(objetDe().value).toBe(avant);
    expect(courant.objet).toBe('Arnaud JOREL / Cabinet Criterimmo / résidence R');
    expect(objetDe().selectionStart).toBe(objetDe().selectionEnd);                   // rien de sélectionné
    await act(async () => { vi.advanceTimersByTime(6000); });
    await calmer();
    expect(requetes.filter((r) => r.methode !== 'GET')).toEqual([]);
  });
  it('le cartouche ne revient pas, même en modifiant l’objet (y compris le nom)', async () => {
    await monter(brouillon(pret(BIEN, 'R')));
    poserRect();
    await souris('mousedown', 50);
    await act(async () => { objetDe().click(); });
    await calmer();
    await taperDansObjet('Arnaud J. / Cabinet Criterimmo / résidence R — suite');
    expect(surligne()).toBeNull();
    expect(container.querySelector('.red-objet-miroir')).toBeNull();
  });
  it('un clic AILLEURS dans l’objet ne retire pas le cartouche', async () => {
    await monter(brouillon(pret(BIEN, 'R')));
    poserRect();
    await souris('mousedown', 300);
    await act(async () => { objetDe().click(); });
    await calmer();
    expect(surligne()).toBe('Arnaud JOREL');
  });
});

describe('🔴🔴 LOT FORMULE-APPEL-RECALCUL-AU-RETRAIT — la formule suit « À » en temps réel, ajouts ET retraits', () => {
  const CIV = {
    'arnaud.jorel@gmail.com': { civilite: 'M.' as const, nom: 'JOREL' },
    'f@x.fr': { civilite: 'Mme' as const, nom: 'Durand' },
    'thibaut@x.fr': { civilite: null, nom: 'HIRSCH' },
  };
  const SUITE = ['', '', 'Le Cabinet Criterimmo assure la gestion locative d’un bien.', '', 'Service Gestion'];
  const ouvrir = async () => {
    const lignes = ['Bonjour Monsieur JOREL,', ...SUITE];
    await monter({ ...brouillon(pret(null, null)), a: ['arnaud.jorel@gmail.com'], corps: lignes.join('\n'),
      corpsHtml: lignes.map((l) => (l === '' ? '<p><br /></p>' : `<p>${l}</p>`)).join(''),
      appel: { formule: 'Bonjour Monsieur JOREL,', civilites: CIV } } as BrouillonEcran);
  };
  const champA = () => container.querySelector('[data-champ="À"] input.red-saisie') as HTMLInputElement;
  const ajouter = async (adresse: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(champA(), adresse);
      champA().dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { champA().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    await calmer();
  };
  const retirer = async (adresse: string) => {
    await act(async () => { (container.querySelector(`[data-champ="À"] button[aria-label="Retirer ${adresse}"]`) as HTMLButtonElement).click(); });
    await calmer();
  };
  const premiere = () => lignesAffichees()[0];

  it('🔴 1 homme, + 1 femme, − la femme, − tout : JOREL → Madame, Monsieur → JOREL → Madame, Monsieur ; le reste du corps intact', async () => {
    await ouvrir();
    expect(premiere()).toBe('Bonjour Monsieur JOREL,');
    await ajouter('f@x.fr');
    expect(premiere()).toBe('Bonjour Madame, Monsieur,');
    await retirer('f@x.fr');
    expect(premiere()).toBe('Bonjour Monsieur JOREL,');
    await retirer('arnaud.jorel@gmail.com');
    expect(courant.a).toEqual([]);
    expect(premiere()).toBe('Bonjour Madame, Monsieur,');
    expect(lignesAffichees().slice(1)).toEqual(SUITE);
    // La version TEXTE (htmlVersTexte, inchangée) fond deux lignes vides en une ; l'éditeur, lui, les garde (ci-dessus).
    expect(courant.corps).toContain('Le Cabinet Criterimmo assure la gestion locative d\u2019un bien.');
    expect(courant.corps.trimEnd().endsWith('Service Gestion')).toBe(true);
  });
  it('retrait par Retour arrière au clavier', async () => {
    await ouvrir();
    await ajouter('f@x.fr');
    await act(async () => { champA().dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })); });
    await calmer();
    expect(courant.a).toEqual(['arnaud.jorel@gmail.com']);
    expect(premiere()).toBe('Bonjour Monsieur JOREL,');
  });
  it('un contact SANS civilité seul en À (cas HIRSCH Thibaut) : « Madame, Monsieur », et le retour fonctionne', async () => {
    await ouvrir();
    await ajouter('thibaut@x.fr');
    await retirer('arnaud.jorel@gmail.com');
    expect(premiere()).toBe('Bonjour Madame, Monsieur,');
    await ajouter('arnaud.jorel@gmail.com');
    await retirer('thibaut@x.fr');
    expect(premiere()).toBe('Bonjour Monsieur JOREL,');
  });
  it('🔴 1re ligne modifiée à la main : jamais écrasée, la mention apparaît ; « rétablir l’automatique » la remet', async () => {
    await ouvrir();
    // La personne retouche la première ligne (ce que l'éditeur remonte : le corps change, la formule mémorisée non).
    const lignes = ['Bonjour Monsieur le Directeur,', ...SUITE];
    await act(async () => {
      const p = container.querySelector('.red-corps-riche [contenteditable] p') as HTMLElement;
      p.textContent = lignes[0];
      courant = { ...courant, corps: lignes.join('\n') };
    });
    await monter(courant);
    expect(container.querySelector('.red-formule-main')?.textContent).toBe('Formule d’appel modifiée à la main — rétablir l’automatique');
    await ajouter('f@x.fr');
    expect(courant.corps.split('\n')[0]).toBe('Bonjour Monsieur le Directeur,');      // jamais écrasée
    await act(async () => { (container.querySelector('.red-formule-retablir') as HTMLButtonElement).click(); });
    await calmer();
    expect(courant.corps.split('\n')[0]).toBe('Bonjour Madame, Monsieur,');
    expect(container.querySelector('.red-formule-main')).toBeNull();
  });
  it('sans formule automatique (message ordinaire) : aucune mention, rien ne bouge', async () => {
    await monter({ ...brouillon(pret(null, null)), appel: undefined } as BrouillonEcran);
    expect(container.querySelector('.red-formule-main')).toBeNull();
  });
});
