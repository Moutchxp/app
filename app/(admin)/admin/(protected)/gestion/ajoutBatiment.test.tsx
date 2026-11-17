// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CSS_DIGICODES_COPRO, ChoixBatimentCopro, DUREE_BULLE_MS, DigicodesCopropriete, exempleNom, saisieDigicodesInitiale, type DigicodesAdresseSaisis } from './DigicodesCopropriete';
import type { BatimentConnu, Nomenclature } from '../../../../lib/gestion/batimentsCopropriete';

/**
 * 🔴🔴 Arno (17/11/2026) — « impossible d'ajouter un bâtiment. Cliquer sur « Ajouter nouveau bâtiment » referme le menu et ramène dans le champ :
 * on tourne en rond. Le menu pousse aussi « Étage » et « N° de porte » vers le bas. » — le COMPOSANT UNIQUE du choix / de l'ajout d'un bâtiment.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root; let choix: [string, boolean][];
const CONNUS: BatimentConnu[] = [{ cle: 'a', libelle: 'A', sorte: 'lettre' }, { cle: 'c', libelle: 'C', sorte: 'lettre' }];
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); choix = []; });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });
const $ = (s: string) => container.querySelector(s) as HTMLElement;
const saisir = async (el: HTMLElement, v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }); };
const clic = async (el: HTMLElement) => { await act(async () => { el.click(); }); };
const touche = async (el: HTMLElement, key: string) => { await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }); };
const menu = () => [...container.querySelectorAll('[data-cbc-menu] button')].map((b) => b.textContent);

function HoteBien({ nomenclature = 'lettres' as Nomenclature | null, sansAdresse = false, connus = CONNUS }) {
  const [bat, setBat] = useState('');
  return createElement(ChoixBatimentCopro, { valeur: bat, connus, nomenclature, escalier: '', desactive: false, sansAdresse,
    onChoix: (l: string, c: boolean) => { choix.push([l, c]); setBat(l); } });
}
const monter = async (p: Parameters<typeof HoteBien>[0] = {}) => { await act(async () => { root.render(createElement(HoteBien, p)); }); };

describe('① le menu PAR-DESSUS la page', () => {
  it('superposé (position absolue, ombre) : il ne décale aucun champ', () => {
    expect(CSS_DIGICODES_COPRO).toContain('.cb-menu{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:40');
    expect(CSS_DIGICODES_COPRO).toContain('box-shadow');
  });
});

describe('② l’ajout PAR LA SAISIE', () => {
  it('un nom qui n’existe pas : « + Ajouter le bâtiment « 1 » » EN PREMIER ; choisi, il est ajouté au menu et le message le confirme', async () => {
    await monter({ nomenclature: null });
    await clic($('[data-cbc-champ]'));
    await saisir($('[data-cbc-champ]'), '1');
    expect(menu()[0]).toBe('+ Ajouter le bâtiment « 1 »');
    await clic($('[data-cb-ajouter-saisi]'));
    expect(choix.at(-1)).toEqual(['1', false]);
    expect($('[data-cb-message]').textContent).toBe('Bâtiment 1 ajouté — il sera enregistré avec le bien');
    await clic($('[data-cbc-champ]'));
    await saisir($('[data-cbc-champ]'), '');
    expect(menu()).toContain('1');
  });
  it('au clavier : flèche bas puis Entrée choisit la première proposition ; Échap referme', async () => {
    await monter({ nomenclature: null });
    await clic($('[data-cbc-champ]'));
    await saisir($('[data-cbc-champ]'), 'Z');
    await touche($('[data-cbc-champ]'), 'ArrowDown');
    expect($('.cb-actif').textContent).toBe('+ Ajouter le bâtiment « Z »');
    await touche($('[data-cbc-champ]'), 'Enter');
    expect(choix.at(-1)).toEqual(['Z', false]);
    await clic($('[data-cbc-champ]'));
    await touche($('[data-cbc-champ]'), 'Escape');
    expect($('[data-cbc-menu]')).toBeNull();
  });
  it('un nom existant (« a ») : pas de proposition d’ajout, le bâtiment connu', async () => {
    await monter();
    await clic($('[data-cbc-champ]'));
    await saisir($('[data-cbc-champ]'), 'a');
    expect(menu().slice(0, 2)).toEqual(['Aucun bâtiment (code commun)', 'A']);
    expect(menu().some((m) => m?.startsWith('+ Ajouter'))).toBe(false);
  });
});

describe('③ « Ajouter nouveau bâtiment » : l’ENCADRÉ, qui ne se referme pas tout seul', () => {
  it('nom, exemple adapté à la règle, la règle en une phrase, « Valider ce bâtiment » / « Annuler » ; Entrée = Valider', async () => {
    await monter();
    await clic($('[data-cbc-champ]'));
    await clic($('[data-cbc-nouveau]'));
    expect($('[data-cb-encadre]')).not.toBeNull();
    expect(($('[data-cb-encadre-nom]') as HTMLInputElement).placeholder).toBe('ex. A');
    expect($('[data-cb-regle]').textContent).toContain('bâtiments en lettres (A, B, C…)');
    expect([$('[data-cb-valider]').textContent, $('[data-cb-annuler]').textContent]).toEqual(['Valider ce bâtiment', 'Annuler']);
    expect([exempleNom('chiffres'), exempleNom(null)]).toEqual(['ex. 1', 'ex. A, 1 ou Côté cour']);
    await saisir($('[data-cb-encadre-nom]'), 'D');
    await touche($('[data-cb-encadre-nom]'), 'Enter');
    expect(choix.at(-1)).toEqual(['D', false]);
    expect($('[data-cb-encadre]')).toBeNull();
    expect($('[data-cb-message]').textContent).toBe('Bâtiment D ajouté — il sera enregistré avec le bien');
  });
  it('🔴 annulation : « Annuler » ou Échap referme l’encadré, rien n’est choisi', async () => {
    await monter();
    await clic($('[data-cbc-champ]')); await clic($('[data-cbc-nouveau]'));
    await saisir($('[data-cb-encadre-nom]'), 'D');
    await clic($('[data-cb-annuler]'));
    expect($('[data-cb-encadre]')).toBeNull();
    await clic($('[data-cbc-champ]')); await clic($('[data-cbc-nouveau]'));
    await touche($('[data-cb-encadre-nom]'), 'Escape');
    expect($('[data-cb-encadre]')).toBeNull();
    expect(choix).toEqual([]);
  });
  it('nom vide : refusé avec un message (l’encadré reste ouvert) ; DOUBLON (« c ») : simplement choisi, sans message d’ajout', async () => {
    await monter();
    await clic($('[data-cbc-champ]')); await clic($('[data-cbc-nouveau]'));
    await clic($('[data-cb-valider]'));
    expect($('[data-cb-erreur]').textContent).toBe('Donnez un nom au bâtiment ou à la cage.');
    expect($('[data-cb-encadre]')).not.toBeNull();
    await saisir($('[data-cb-encadre-nom]'), 'c');
    await clic($('[data-cb-valider]'));
    expect(choix.at(-1)).toEqual(['C', false]);
    expect($('[data-cb-message]')).toBeNull();
  });
  it('hors numérotation (« 1 » parmi des lettres) : la fenêtre d’avertissement ; « Corriger » ramène à l’encadré vide ; « Confirmer » le choisit, confirmé', async () => {
    await monter();
    await clic($('[data-cbc-champ]')); await clic($('[data-cbc-nouveau]'));
    await saisir($('[data-cb-encadre-nom]'), '1');
    await clic($('[data-cb-valider]'));
    expect(document.querySelector('[data-dcp-avertissement]')).not.toBeNull();
    await clic($('[data-dcp-corriger]'));
    expect(($('[data-cb-encadre-nom]') as HTMLInputElement).value).toBe('');
    expect(choix).toEqual([]);
    await saisir($('[data-cb-encadre-nom]'), '1');
    await clic($('[data-cb-valider]'));
    await clic($('[data-dcp-confirmer]'));
    expect(choix.at(-1)).toEqual(['1', true]);
    expect($('[data-cb-message]').textContent).toBe('Bâtiment 1 ajouté — il sera enregistré avec le bien');
  });
});

describe('⑤ adresse du bien pas encore choisie', () => {
  it('le menu le dit ; l’encadré reste utilisable', async () => {
    await monter({ nomenclature: null, sansAdresse: true, connus: [] });
    await clic($('[data-cbc-champ]'));
    expect($('[data-cb-sans-adresse]').textContent).toBe('Choisissez d’abord l’adresse du bien pour voir ses bâtiments');
    await clic($('[data-cbc-nouveau]'));
    await saisir($('[data-cb-encadre-nom]'), 'B');
    await clic($('[data-cb-valider]'));
    expect(choix.at(-1)).toEqual(['B', false]);
  });
});

describe('le MÊME composant dans la fiche Copropriété (ligne « + »)', () => {
  const FICHE = { digicodes: [{ cle: 'residence les tilleuls', voie: 'Résidence Les Tilleuls', codePostal: '75011', commune: 'Paris', commun: { digicode: true, code: '1234' }, batiments: [] }] };
  function Hote() {
    const [s, setS] = useState<DigicodesAdresseSaisis[]>(saisieDigicodesInitiale(FICHE as never));
    return createElement(DigicodesCopropriete, { s, onChange: setS, connus: CONNUS, nomenclature: 'lettres', desactive: false });
  }
  it('« + » puis « Ajouter nouveau bâtiment » : l’encadré ; validé, le bâtiment est choisi dans la ligne, « …avec la copropriété »', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    await clic($('[data-dcp-plus]'));
    await clic($('[data-dcp-ajouter-nouveau]'));
    await saisir($('[data-cb-encadre-nom]'), 'D');
    await clic($('[data-cb-valider]'));
    // 🔴 (Arno, 17/11/2026) validé : l'intitulé « Digicode bâtiment D » (le menu laisse la place)
    expect($('[data-dcp-intitule-batiment="D"]').textContent).toBe('Digicode bâtiment D');
    expect($('[data-cb-message]').textContent).toBe('Bâtiment D ajouté — il sera enregistré avec la copropriété');
    expect($('[data-dcp-code-batiment]')).not.toBeNull(); // sa ligne de digicode est là
  });
});

/**
 * 🔴🔴 Arno (17/11/2026) — deux réglages : ① la confirmation est une BULLE temporaire, superposée à la page (elle ne décale aucun champ) et qui
 * disparaît seule après environ 4 secondes ; ② un clic dans le champ, même vide, ouvre AUSSITÔT le menu : « Aucun bâtiment (code commun) », tous
 * les bâtiments dans l'ordre naturel (1, 2… 10 après 9 ; A, B…), les intitulés libres par ordre alphabétique, « Ajouter nouveau bâtiment » en bas.
 */
describe('① la bulle de confirmation', () => {
  it('superposée (position fixe, hors du flux : aucun champ décalé) et retirée seule après 4 secondes', async () => {
    expect(CSS_DIGICODES_COPRO).toContain('.cb-bulle{position:fixed;');
    expect(DUREE_BULLE_MS).toBe(4000);
    vi.useFakeTimers();
    try {
      await monter({ nomenclature: null });
      await clic($('[data-cbc-champ]'));
      await saisir($('[data-cbc-champ]'), '7');
      await clic($('[data-cb-ajouter-saisi]'));
      expect($('[data-cb-message]').className).toBe('cb-bulle');
      expect($('[data-cb-message]').textContent).toBe('Bâtiment 7 ajouté — il sera enregistré avec le bien');
      await act(async () => { vi.advanceTimersByTime(3900); });
      expect($('[data-cb-message]')).not.toBeNull();
      await act(async () => { vi.advanceTimersByTime(200); });
      expect($('[data-cb-message]')).toBeNull();
    } finally { vi.useRealTimers(); }
  });
});

describe('② le menu au clic sur le champ vide', () => {
  const MELANGE: BatimentConnu[] = [{ cle: '10', libelle: '10', sorte: 'chiffre' }, { cle: 'b', libelle: 'B', sorte: 'lettre' }, { cle: 'cote rue', libelle: 'Côté rue', sorte: 'libre' },
    { cle: '2', libelle: '2', sorte: 'chiffre' }, { cle: 'a', libelle: 'A', sorte: 'lettre' }, { cle: '1', libelle: '1', sorte: 'chiffre' }, { cle: 'cote cour', libelle: 'Côté cour', sorte: 'libre' }];
  it('ouvert AUSSITÔT : « Aucun », 1, 2, 10, A, B, puis Côté cour, Côté rue, et « Ajouter nouveau bâtiment » en bas', async () => {
    await monter({ connus: MELANGE, nomenclature: null });
    expect($('[data-cbc-menu]')).toBeNull();
    await clic($('[data-cbc-champ]'));
    expect(menu()).toEqual(['Aucun bâtiment (code commun)', '1', '2', '10', 'A', 'B', 'Côté cour', 'Côté rue', 'Ajouter nouveau bâtiment']);
  });
  it('en tapant, la liste se filtre ; un nom nouveau garde « + Ajouter le bâtiment « … » » en premier', async () => {
    await monter({ connus: MELANGE, nomenclature: null });
    await clic($('[data-cbc-champ]'));
    await saisir($('[data-cbc-champ]'), 'Côté');
    expect(menu()).toEqual(['+ Ajouter le bâtiment « Côté »', 'Aucun bâtiment (code commun)', 'Côté cour', 'Côté rue', 'Ajouter nouveau bâtiment']);
  });
});

/** 🔴 Arno (17/11/2026) : « un clic dans le champ qui contient déjà une valeur montre TOUTE la liste (la valeur actuelle mise en évidence) ; le filtre ne s'applique que lorsqu'on tape. » */
describe('④ un champ déjà rempli', () => {
  function HoteRempli() {
    const [bat, setBat] = useState('A');
    return createElement(ChoixBatimentCopro, { valeur: bat, connus: CONNUS, nomenclature: 'lettres', escalier: '', desactive: false, onChoix: (l: string) => setBat(l) });
  }
  it('un clic : TOUTE la liste, « A » mise en évidence ; en tapant, la liste se filtre', async () => {
    await act(async () => { root.render(createElement(HoteRempli)); });
    await clic($('[data-cbc-champ]'));
    expect(menu()).toEqual(['Aucun bâtiment (code commun)', 'A', 'C', 'Ajouter nouveau bâtiment']);
    expect($('[data-cbc-option="A"]').className).toContain('cb-choisi');
    expect($('[data-cbc-option="A"]').getAttribute('aria-selected')).toBe('true');
    await saisir($('[data-cbc-champ]'), 'C');
    expect(menu()).toEqual(['Aucun bâtiment (code commun)', 'C', 'Ajouter nouveau bâtiment']);
  });
});

/** 🔴 Arno (17/11/2026) : « le message rouge […] est illisible : le menu « Ajouter nouveau bâtiment » le recouvre et il s'affiche avant toute saisie. Le message n'apparaît qu'après une tentative de validation, sous la ligne, entièrement lisible […]. Le menu se ferme dès qu'on clique ailleurs. » */
describe('① le message d’une ligne de bâtiment', () => {
  const FICHE = { digicodes: [{ cle: 'residence les tilleuls', voie: 'Résidence Les Tilleuls', codePostal: '75011', commune: 'Paris', commun: { digicode: true, code: '1234' }, batiments: [] }] };
  function Hote({ tente }: { tente: boolean }) {
    const [s, setS] = useState<DigicodesAdresseSaisis[]>(saisieDigicodesInitiale(FICHE as never));
    return createElement('div', null, createElement(DigicodesCopropriete, { s, onChange: setS, connus: CONNUS, nomenclature: 'lettres', desactive: false, tente }),
      createElement('button', { type: 'button', 'data-ailleurs': '' }, 'ailleurs'));
  }
  it('« + » : AUCUN message avant une tentative de validation', async () => {
    await act(async () => { root.render(createElement(Hote, { tente: false })); });
    await clic($('[data-dcp-plus]'));
    expect($('[data-dcp-erreur-ligne]')).toBeNull();
    expect($('[data-dcp-refus]')).toBeNull();
  });
  it('après une tentative : le message SOUS la ligne (dans la ligne du bâtiment, sa propre boîte lisible), une seule fois', async () => {
    await act(async () => { root.render(createElement(Hote, { tente: true })); });
    await clic($('[data-dcp-plus]'));
    const m = $('[data-dcp-erreur-ligne]');
    expect(m.textContent).toBe('Donnez un nom au bâtiment ou à la cage d’escalier.');
    expect(m.closest('[data-dcp-batiment]')).not.toBeNull();
    expect(m.className).toBe('dcp-ligne-erreur');
    expect(container.querySelectorAll('[data-dcp-refus]')).toHaveLength(0);
    expect(CSS_DIGICODES_COPRO).toContain('.dcp-ligne-erreur{flex:1 1 100%');
    expect(CSS_DIGICODES_COPRO).toContain('background:var(--color-svv-red-soft);\n  color:var(--color-svv-red-dark)');
  });
  it('le menu se ferme dès qu’on clique ailleurs (même ouvert par le « + », sans focus dans le champ)', async () => {
    await act(async () => { root.render(createElement(Hote, { tente: false })); });
    await clic($('[data-dcp-plus]'));
    expect($('[data-dcp-menu]')).not.toBeNull();
    await act(async () => { $('[data-ailleurs]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect($('[data-dcp-menu]')).toBeNull();
  });
});

/** 🔴 Arno (17/11/2026) : « CHAMP DIGICODE plus court : largeur adaptée à 15 caractères au plus (même largeur pour le commun et pour chaque bâtiment), saisie limitée à 15 caractères ; les boutons « pas de digicode » et « + » restent alignés juste à côté, sur la même ligne. Un code existant plus long reste affiché tel quel, jamais tronqué en base. » */
describe('② le champ du code : 15 caractères', () => {
  const FICHE = { digicodes: [{ cle: 'residence test', voie: 'Résidence _TEST', codePostal: '75011', commune: 'Paris', commun: { digicode: true, code: '1234' },
    batiments: [{ cle: 'a', libelle: 'A', digicode: true, code: 'CODE-EXISTANT-DE-18' }] }] };
  function Hote() {
    const [s, setS] = useState<DigicodesAdresseSaisis[]>(saisieDigicodesInitiale(FICHE as never));
    return createElement(DigicodesCopropriete, { s, onChange: setS, connus: CONNUS, nomenclature: 'lettres', desactive: false });
  }
  it('commun et bâtiment : saisie bornée à 15, la MÊME largeur (classe commune) ; « pas de digicode » et « + » dans la même ligne ; un code plus long gardé tel quel', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    const commun = $('[data-dcp-code-commun]') as HTMLInputElement;
    const bat = $('[data-dcp-code-batiment]') as HTMLInputElement;
    expect([commun.maxLength, bat.maxLength]).toEqual([15, 15]);
    expect([commun.closest('label')?.className, bat.closest('label')?.className]).toEqual(['dcp-champ dcp-champ-code', 'dcp-champ dcp-champ-code']);
    expect(CSS_DIGICODES_COPRO).toContain('.dcp-champ.dcp-champ-code input{width:calc(15ch + 20px);max-width:100%}');
    expect(CSS_DIGICODES_COPRO).toContain('.dcp-code-groupe{display:flex;flex-wrap:nowrap;');
    expect(commun.closest('.dcp-code-groupe')?.querySelector('[data-dcp-plus]')).not.toBeNull();
    expect(bat.closest('.dcp-code-groupe')?.querySelector('.dcp-aucun')).not.toBeNull();
    const ligne = commun.closest('[data-dcp-commun]') as HTMLElement;
    expect(ligne.querySelector('.dcp-aucun')).not.toBeNull();
    expect(ligne.querySelector('[data-dcp-plus]')).not.toBeNull();
    expect(bat.value).toBe('CODE-EXISTANT-DE-18');
  });
});

/** 🔴🔴 Arno (17/11/2026) : « UNE LIGNE PAR BÂTIMENT […] supprime l'en-tête « Bâtiment / cage » et la ligne qui affiche le nom seul (ex. « 1 »). L'intitulé du champ devient « Digicode bâtiment 1 » […] avec le champ de 15 caractères, « pas de digicode », « Modifier » / « Corriger » et « × » sur la même ligne. Pour une nouvelle ligne pas encore nommée, l'intitulé reste le menu de choix du bâtiment, puis devient « Digicode bâtiment X » une fois validé. » */
describe('🔴🔴 une ligne par bâtiment', () => {
  const ETAT = (o: Record<string, unknown> = {}) => ({ connu: true, valeur: { digicode: true, code: 'A1' }, depuis: '2026-11-01T10:00:00.000Z', source: 'unifie', aVenir: [], aArbitrer: [], historique: [], ...o });
  const FICHE = { digicodes: [{ cle: 'residence test digicode', voie: 'Résidence _TEST DIGICODE', codePostal: '75011', commune: 'Paris', commun: { digicode: true, code: '1234', etat: ETAT({ valeur: { digicode: true, code: '1234' } }) },
    batiments: [{ cle: 'a', libelle: 'A', digicode: true, code: 'A1', etat: ETAT() }, { cle: 'b', libelle: 'B', digicode: null, code: null, etat: ETAT({ connu: false, valeur: null }) }] }] };
  function Hote() {
    const [s, setS] = useState<DigicodesAdresseSaisis[]>(saisieDigicodesInitiale(FICHE as never));
    return createElement(DigicodesCopropriete, { s, onChange: setS, connus: CONNUS, nomenclature: 'lettres', desactive: false, onCorriger: async () => null, onPlanifier: async () => null });
  }
  it('code connu : « Digicode bâtiment A », la valeur puis « Modifier » / « Corriger » sur la même ligne ; à saisir : « Digicode bâtiment B » — plus d’en-tête « Bâtiment / cage » ni de nom seul', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    const a = $('[data-dcp-batiment="A"] [data-dcp-lue]');
    expect(a.className).toContain('dcp-lue--en-ligne');
    expect(a.querySelector('.dcp-lue-titre')?.textContent).toBe('Digicode bâtiment A');
    expect(a.querySelector('[data-dcp-modifier]')).not.toBeNull();
    expect(a.querySelector('[data-dcp-corriger-erreur]')).not.toBeNull();
    expect($('[data-dcp-batiment="B"] [data-dcp-intitule-batiment="B"]').textContent).toBe('Digicode bâtiment B');
    expect([...container.querySelectorAll('[data-dcp-batiment] span')].some((x) => x.textContent === 'Bâtiment / cage')).toBe(false);
    expect(container.querySelector('[data-dcp-nom-existant]')).toBeNull();
    expect(CSS_DIGICODES_COPRO).toContain('.dcp-lue--en-ligne{display:grid;grid-template-columns:auto 1fr;');
  });
  it('nouvelle ligne : l’intitulé est le MENU tant qu’aucun nom n’est choisi ; choisi : « Digicode bâtiment D », la bulle reste ; « × » et « pas de digicode » dans le même groupe que le champ', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    await clic($('[data-dcp-plus]'));
    const nouvelle = () => $('[data-dcp-batiment="nouveau"]');
    expect(nouvelle().querySelector('[data-dcp-nom-batiment]')).not.toBeNull();
    expect(nouvelle().querySelector('.dcp-champ-code > span')?.textContent).toBe('Digicode');
    const groupe = nouvelle().querySelector('.dcp-code-groupe') as HTMLElement;
    expect([!!groupe.querySelector('[data-dcp-code-batiment]'), !!groupe.querySelector('.dcp-aucun'), !!groupe.querySelector('[data-dcp-retirer-ligne]')]).toEqual([true, true, true]);
    await clic($('[data-dcp-ajouter-nouveau]'));
    await saisir($('[data-cb-encadre-nom]'), 'D');
    await clic($('[data-cb-valider]'));
    expect(nouvelle().querySelector('[data-dcp-nom-batiment]')).toBeNull();
    expect(nouvelle().querySelector('[data-dcp-intitule-batiment="D"]')?.textContent).toBe('Digicode bâtiment D');
    expect($('[data-cb-message]').textContent).toBe('Bâtiment D ajouté — il sera enregistré avec la copropriété');
  });
});
