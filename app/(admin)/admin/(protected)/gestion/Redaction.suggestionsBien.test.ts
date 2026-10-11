// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import { lignesVersHtml } from '../../../../lib/gestion/mailSyndic';
import { rangerSuggestions, type SuggestionAdresse } from '../../../../lib/gestion/suggestionsBien';

/**
 * ══ 🔴🔴 LOT MAIL-DEPUIS-BIEN-RATTACHEMENT-ET-SUGGESTIONS — LE VRAI ÉDITEUR, SES TROIS CHAMPS ═══════════════════════
 * « Dès qu'on clique dans À, Cc ou Cci, une liste s'ouvre sous le champ avec TOUTES les adresses liées à ce bien […]
 * Clic ou Entrée pour ajouter, Échap pour fermer. La formule d'appel se recalcule (À seulement). »
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test', delaiAnnulationS: 5,
};
const l = (adresse: string, o: Partial<SuggestionAdresse>): SuggestionAdresse => ({
  adresse, nom: null, role: 'r', ton: 'neutre', propre: true, civilite: null, nomFamille: null, ...o,
});
const GROUPES = rangerSuggestions({
  clients: [
    l('jean@x.fr', { nom: 'DUPONT Jean', role: 'Propriétaire', ton: 'proprietaire', civilite: 'M.', nomFamille: 'DUPONT' }),
    l('notaire@x.fr', { nom: null, role: 'Contact du propriétaire', ton: 'proprietaire', propre: false }),
    l('lea@x.fr', { nom: 'ROI Léa', role: 'Locataire', ton: 'locataire', civilite: 'Mme', nomFamille: 'ROI' }),
    l('garant@x.fr', { nom: 'ROI Marc', role: 'Garant', ton: 'locataire', propre: false, civilite: 'M.', nomFamille: 'ROI' }),
  ],
  immeuble: [
    l('m.bercier@criterimmo.fr', { nom: 'Mathis Bercier', role: 'Gestionnaire · Cabinet', ton: 'syndic', civilite: 'M.', nomFamille: 'Bercier' }),
    l('gardienne@x.fr', { nom: 'Rose Petit', role: 'Gardien', ton: 'immeuble', civilite: 'Mme', nomFamille: 'Petit' }),
  ],
  autres: [l('inconnu@y.fr', { role: 'vue dans 4 mails du bien' })],
});
const CIVILITES = {
  'jean@x.fr': { civilite: 'M.' as const, nom: 'DUPONT' }, 'lea@x.fr': { civilite: 'Mme' as const, nom: 'ROI' },
  'm.bercier@criterimmo.fr': { civilite: 'M.' as const, nom: 'Bercier' }, 'gardienne@x.fr': { civilite: 'Mme' as const, nom: 'Petit' },
};
const CORPS = 'Bonjour Monsieur BERCIER,\n\n\nJe prends contact…\n\n\n';
const DEPART: BrouillonEcran = {
  id: null, voie: 'nouveau', a: ['m.bercier@criterimmo.fr'], cc: [], cci: [], objet: 'XXXXXXXX / Cabinet', citation: null,
  destinatairesApproximatifs: false, filId: null, repondALeMessageId: null,
  corps: `${CORPS}Service Gestion`, corpsHtml: `${lignesVersHtml(CORPS.slice(0, -1))}<p>Service Gestion</p>`,
  cibles: [{ sorte: 'lot', cle: '219', id: 176, libelle: '25 rue X — lot 219' }],
  suggestionsBien: GROUPES, appel: { formule: 'Bonjour Monsieur BERCIER,', civilites: CIVILITES },
};

let container: HTMLDivElement;
let root: Root;
let courant: BrouillonEcran;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, correspondants: [] }), { status: 200 })));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async (b: BrouillonEcran = DEPART) => {
  courant = b;
  const rendre = () => root.render(createElement(Redaction, {
    dansFenetre: true, brouillon: courant, contexte: CONTEXTE,
    onChange: (n: BrouillonEcran) => { courant = n; rendre(); },
    onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {},
  } as never));
  await act(async () => { rendre(); });
  await calmer();
};
const champDe = (libelle: string): HTMLInputElement => {
  const lab = [...container.querySelectorAll('label.red-label')].find((x) => x.textContent === libelle) as HTMLLabelElement;
  return container.querySelector(`#${lab.htmlFor}`) as HTMLInputElement;
};
const cliquerDans = async (libelle: string) => {
  await act(async () => { const c = champDe(libelle); c.focus(); c.click(); });
  await calmer();
};
const liste = (libelle: string) => container.querySelector(`#${champDe(libelle).id}-liste`);
const titres = (libelle: string) => [...(liste(libelle)?.querySelectorAll('.red-sugg-titre') ?? [])].map((x) => x.textContent);
const adresses = (libelle: string) => [...(liste(libelle)?.querySelectorAll('.red-suggestion') ?? [])]
  .map((b) => b.querySelector('.red-sugg-adresse')?.textContent ?? b.querySelector('.red-sugg-nom')?.textContent);
const choisir = async (libelle: string, adresse: string) => {
  const b = [...(liste(libelle)?.querySelectorAll('.red-suggestion') ?? [])].find((x) => x.textContent?.includes(adresse)) as HTMLElement;
  await act(async () => { b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
  await calmer();
};
const taper = async (libelle: string, texte: string) => {
  await act(async () => {
    const e = champDe(libelle);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(e, texte);
    e.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await calmer();
};
const touche = async (libelle: string, key: string) => {
  await act(async () => { champDe(libelle).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
  await calmer();
};
const premiereLigne = () => container.querySelector('.red-corps-riche [contenteditable] p, .red-corps-riche p')?.textContent;
const ouvrirChamp = async (bouton: 'Cc' | 'Cci') => {
  const b = [...container.querySelectorAll('button.red-copie-bouton')].find((x) => x.textContent === bouton) as HTMLElement;
  await act(async () => { b.click(); });
  await calmer();
};

describe('🔴 la liste s’ouvre au CLIC dans le champ, sans rien taper', () => {
  it('fermée avant, ouverte après le clic : les 3 groupes, dans l’ordre, avec leurs intertitres', async () => {
    await monter();
    expect(liste('À')).toBeNull();
    await cliquerDans('À');
    expect(titres('À')).toEqual(['Clients de l’agence', 'Immeuble', 'Autres adresses liées au bien']);
  });
  it('propriétaires AVANT locataires ; l’adresse déjà en À (le gestionnaire) n’est plus proposée', async () => {
    await monter();
    await cliquerDans('À');
    expect(adresses('À')).toEqual(['jean@x.fr', 'notaire@x.fr', 'lea@x.fr', 'garant@x.fr', 'gardienne@x.fr', 'inconnu@y.fr']);
  });
  it('chaque ligne : pastille PLEINE (e-mail propre) ou en CONTOUR + « rattaché », nom, rôle et adresse', async () => {
    await monter();
    await cliquerDans('À');
    const ligne = (a: string) => [...(liste('À')?.querySelectorAll('.red-suggestion') ?? [])].find((x) => x.textContent?.includes(a)) as HTMLElement;
    const jean = ligne('jean@x.fr');
    expect(jean.querySelector('.red-sugg-pastille')?.className).toBe('red-sugg-pastille red-sugg-pastille--proprietaire');
    expect(jean.querySelector('.red-sugg-nom')?.textContent).toBe('DUPONT Jean');
    expect(jean.querySelector('.red-sugg-role')?.textContent).toBe('Propriétaire');
    expect(jean.textContent).not.toContain('rattaché');
    const garant = ligne('garant@x.fr');
    expect(garant.querySelector('.red-sugg-pastille')?.className)
      .toBe('red-sugg-pastille red-sugg-pastille--locataire red-sugg-pastille--contour');
    expect(garant.querySelector('.red-sugg-role')?.textContent).toBe('Garant · rattaché');
    expect(ligne('gardienne@x.fr').querySelector('.red-sugg-pastille')?.className).toContain('red-sugg-pastille--immeuble');
    expect(ligne('inconnu@y.fr').querySelector('.red-sugg-pastille')?.className).toContain('red-sugg-pastille--neutre');
  });
  it('taper filtre (nom ou adresse, sans accents ni casse) ; Échap ferme', async () => {
    await monter();
    await cliquerDans('À');
    await taper('À', 'LEA');
    expect(adresses('À')).toEqual(['lea@x.fr']);
    await taper('À', 'ROI');
    expect(adresses('À')).toEqual(['lea@x.fr', 'garant@x.fr']);
    await touche('À', 'Escape');
    expect(liste('À')).toBeNull();
  });
  it('une adresse LIBRE reste possible (Entrée sans proposition mise en avant)', async () => {
    await monter();
    await cliquerDans('À');
    await taper('À', 'libre@ailleurs.fr');
    await touche('À', 'Enter');
    expect(courant.a).toEqual(['m.bercier@criterimmo.fr', 'libre@ailleurs.fr']);
  });
});

describe('🔴 ajouter en À, en Cc, en Cci — et la formule d’appel ne suit QUE le À', () => {
  it('clic en À : ajoutée, et la formule se recalcule (un homme + une femme)', async () => {
    await monter();
    expect(premiereLigne()).toBe('Bonjour Monsieur BERCIER,');
    await cliquerDans('À');
    await choisir('À', 'lea@x.fr');
    expect(courant.a).toEqual(['m.bercier@criterimmo.fr', 'lea@x.fr']);
    expect(premiereLigne()).toBe('Bonjour Madame, Monsieur,');
    expect(courant.corps.split('\n')[0]).toBe('Bonjour Madame, Monsieur,');
    expect(courant.appel?.formule).toBe('Bonjour Madame, Monsieur,');
    // Ajoutée, elle n'est plus proposée.
    expect(adresses('À')).not.toContain('lea@x.fr');
  });
  it('en Cc : ajoutée, exclue des propositions, et la formule NE change PAS', async () => {
    await monter();
    await ouvrirChamp('Cc');
    await cliquerDans('Cc');
    expect(adresses('Cc')).not.toContain('m.bercier@criterimmo.fr');
    await choisir('Cc', 'jean@x.fr');
    expect(courant.cc).toEqual(['jean@x.fr']);
    expect(premiereLigne()).toBe('Bonjour Monsieur BERCIER,');
    await cliquerDans('À');
    expect(adresses('À')).not.toContain('jean@x.fr');
  });
  it('en Cci, au CLAVIER (flèche puis Entrée) : ajoutée, et la formule NE change PAS', async () => {
    await monter();
    await ouvrirChamp('Cci');
    await cliquerDans('Cci');
    await taper('Cci', 'gardi');
    await touche('Cci', 'ArrowDown');
    await touche('Cci', 'Enter');
    expect(courant.cci).toEqual(['gardienne@x.fr']);
    expect(premiereLigne()).toBe('Bonjour Monsieur BERCIER,');
  });
  it('retirer du À recalcule aussi ; une formule retouchée à la main n’est jamais réécrite', async () => {
    await monter({ ...DEPART, a: ['m.bercier@criterimmo.fr', 'gardienne@x.fr'], appel: { ...DEPART.appel!, formule: 'Bonjour Monsieur BERCIER,' } });
    // La première ligne affichée vaut la formule retenue ; on retire la gardienne : « Monsieur BERCIER » reste juste.
    const retirer = container.querySelector('button[aria-label="Retirer gardienne@x.fr"]') as HTMLElement;
    await act(async () => { retirer.click(); });
    await calmer();
    expect(premiereLigne()).toBe('Bonjour Monsieur BERCIER,');
    // La première ligne n'est plus la formule retenue (comme si Arno l'avait retouchée) : ajouter quelqu'un ne la touche pas.
    await monter({ ...DEPART, appel: { ...DEPART.appel!, formule: 'Bonjour Madame PETIT,' } });
    await cliquerDans('À');
    await choisir('À', 'lea@x.fr');
    expect(premiereLigne()).toBe('Bonjour Monsieur BERCIER,');
  });
});

describe('sans adresses du bien (message ordinaire) : le champ se comporte comme avant', () => {
  it('aucune liste au clic', async () => {
    await monter({ ...DEPART, suggestionsBien: null, appel: null });
    await cliquerDans('À');
    expect(liste('À')).toBeNull();
  });
});

describe('LOT SUGGESTIONS-COULEUR-IMMEUBLE-ROSE — chaque partie sa couleur, le rose pour l’immeuble', () => {
  const css = readFileSync(join(__dirname, 'Redaction.tsx'), 'utf8');
  const tonDe = (classe: string): string | undefined =>
    new RegExp(`\\.red-sugg-pastille--${classe}[^{]*\\{--red-sugg-ton:var\\((--[a-z-]+)\\)\\}`).exec(css)?.[1];

  it('🔴 propriétaire rouge, locataire vert, ancien locataire violet, IMMEUBLE ROSE (le jeton des boutons du syndic), autres gris', () => {
    // LOT PROFIL-GESTION-ET-ROUGE-PROPRIETAIRE — CE QU'IL DISAIT AVANT : '--color-svv-red'. Le rouge propriétaire a désormais
    //   son jeton (rouge PUR, sans jaune), le même que la trame des puces ; il reste le seul rouge des pastilles.
    expect(tonDe('proprietaire')).toBe('--color-svv-proprio');
    expect(tonDe('locataire')).toBe('--color-svv-green');
    expect(tonDe('ancien_locataire')).toBe('--color-svv-violet');
    expect(tonDe('syndic')).toBe('--color-svv-syndic-bord');
    expect(css).toContain('.red-sugg-pastille--syndic,.red-sugg-pastille--immeuble{--red-sugg-ton:var(--color-svv-syndic-bord)}');
    expect(tonDe('neutre')).toBe('--color-svv-muted');
    // le même jeton que les boutons roses du syndic sur les cartes de bien
    expect(readFileSync(join(__dirname, 'BoutonSyndic.tsx'), 'utf8')).toContain('border-color:var(--color-svv-syndic-bord)');
  });
  it('🔴 le rouge est réservé aux propriétaires, et le rose à l’immeuble : aucune autre pastille ne les emprunte', () => {
    const regles = css.match(/\.red-sugg-pastille--[a-z_,.\-]+\{--red-sugg-ton:var\(--[a-z-]+\)\}/g) ?? [];
    // LOT PROFIL-GESTION — CE QU'IL DISAIT AVANT : la seule règle portant '--color-svv-red)' était celle du propriétaire.
    //   Le propriétaire a désormais son jeton ; la règle reste la même : AUCUNE autre pastille n'emprunte un rouge.
    expect(regles.filter((r) => r.includes('--color-svv-red)'))).toEqual([]);
    expect(regles.filter((r) => r.includes('--color-svv-proprio)'))).toEqual(['.red-sugg-pastille--proprietaire{--red-sugg-ton:var(--color-svv-proprio)}']);
    expect(regles.filter((r) => r.includes('syndic'))).toEqual(['.red-sugg-pastille--syndic,.red-sugg-pastille--immeuble{--red-sugg-ton:var(--color-svv-syndic-bord)}']);
    expect(css).not.toMatch(/red-sugg[^{]*\{[^}]*--color-svv-syndic-texte/);
  });
  it('à l’écran : toutes les lignes du groupe IMMEUBLE sont roses (pleines), et seules les lignes de propriétaire sont rouges', async () => {
    await monter();
    await cliquerDans('À');
    const lignes = [...(liste('À')?.querySelectorAll('.red-suggestion') ?? [])] as HTMLElement[];
    const immeuble = lignes.filter((b) => b.dataset.groupe === 'immeuble');
    expect(immeuble.length).toBeGreaterThan(0);
    for (const b of immeuble) {
      const c = b.querySelector('.red-sugg-pastille')?.className ?? '';
      expect(c).toMatch(/red-sugg-pastille--(syndic|immeuble)/);
      expect(c).not.toContain('--contour');
    }
    for (const b of lignes) {
      if ((b.querySelector('.red-sugg-pastille')?.className ?? '').includes('--proprietaire')) {
        expect(b.querySelector('.red-sugg-role')?.textContent).toMatch(/propriétaire/i);
      }
    }
  });
});
