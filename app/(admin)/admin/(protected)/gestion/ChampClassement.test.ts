// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChampClassement, CSS_CHAMP_CLASSEMENT } from './ChampClassement';
import type { CibleBrouillon } from '../../../../lib/gestion/redaction';
import {
  ANIM_COURBE_ELASTIQUE, ANIM_EFFACER_MS, ANIM_ETENDRE_MS, ANIM_REBOND_MS, ANIM_TOTAL_MS,
} from '../../../../lib/gestion/classementAvantEnvoi';

/**
 * ══ 🔴🔴 LOT CLASSER-DEUX-BOUTONS — LES TROIS ÉTATS DU BLOC « CLASSER CE MAIL » ═══════════════════════════════
 *
 * CE QU'IL Y AVAIT : une phrase grise (« Aucun classement — ce message partira à classer ») suivie de deux liens
 * en petit. Le geste principal — rattacher ce mail à un bien — était caché dans un lien de la taille d'une note
 * de bas de page.
 *
 * 🔴 LA DEMANDE D'ARNO : deux grandes cases côte à côte, de même hauteur ; rouge plein « Rattacher » à gauche,
 * blanche « Interne » à droite. Puis UNE case verte quand c'est décidé, et « Réinitialiser » dessous.
 *
 * ⚠️ CE FICHIER MONTE LE VRAI COMPOSANT et clique dessus. Un test qui chercherait les mots dans le source
 * prouverait qu'ils sont écrits, pas qu'ils arrivent à l'écran ni que le clic fait ce qu'il promet.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const gestes = { onRattacher: vi.fn(), onInterne: vi.fn(), onReinitialiser: vi.fn() };

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  gestes.onRattacher.mockReset(); gestes.onInterne.mockReset(); gestes.onReinitialiser.mockReset();
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

const LOT = (cle: string, libelle: string, categorie?: 'logement' | 'parking' | 'cave'): CibleBrouillon =>
  ({ sorte: 'lot', cle, id: null, libelle, ...(categorie ? { categorie } : {}) });

const monter = (o: {
  cibles?: CibleBrouillon[]; interne?: boolean; horsGestion?: boolean; sansDestinataire?: boolean;
  interneDisponible?: boolean; persistant?: boolean; persistantHorsGestion?: boolean; compact?: boolean;
} = {}) => {
  act(() => {
    root.render(createElement(ChampClassement, {
      cibles: o.cibles ?? [],
      interne: o.interne === true,
      horsGestion: o.horsGestion === true,
      onRattacher: o.sansDestinataire === true ? undefined : gestes.onRattacher,
      onInterne: gestes.onInterne,
      onReinitialiser: gestes.onReinitialiser,
      interneDisponible: o.interneDisponible !== false,
      persistant: o.persistant !== false,
      persistantHorsGestion: o.persistantHorsGestion !== false,
      compact: o.compact === true,
    } as never));
  });
};

const cases = () => [...container.querySelectorAll('.ccl-case')];
const boutonPar = (re: RegExp) => [...container.querySelectorAll('button')]
  .find((b) => re.test((b.textContent ?? '').trim())) as HTMLButtonElement | undefined;

describe('🔴 ① rien n’est décidé : DEUX cases, moitié-moitié', () => {
  it('🔴 « Rattacher » en ROUGE à gauche, « Interne » en BLANC à droite', () => {
    monter();
    const c = cases();
    expect(c).toHaveLength(2);
    expect(c[0].textContent).toContain('Rattacher');
    expect(c[0].className).toContain('ccl-case--rouge');
    expect(c[1].textContent).toContain('Interne');
    expect(c[1].className).toContain('ccl-case--blanche');
  });

  it('🔴 « Rattacher » ouvre la modale', () => {
    monter();
    act(() => { (cases()[0] as HTMLButtonElement).click(); });
    expect(gestes.onRattacher).toHaveBeenCalledTimes(1);
  });

  /**
   * 🔴🔴 LOT CLASSER-AVANT-ENVOI — CE TEST A CHANGÉ DE PROMESSE, PARCE QUE LE COMPORTEMENT A CHANGÉ.
   *
   * IL DISAIT : « le mail part “à classer” tant que rien n'est choisi, et le bloc le DIT ». Ce n'est plus vrai :
   * le mail NE PART PLUS (demande d'Arno : « Envoyer est inactif tant que le bloc n'est pas une case VERTE »).
   * Garder l'ancienne phrase à l'écran aurait été la seule de ce bloc à annoncer quelque chose qui n'arrive pas.
   */
  it('🔴🔴 sans choix, le bloc dit que le mail NE PARTIRA PAS — et non plus qu’il partira « à classer »', () => {
    monter();
    expect(container.textContent).toContain('ne part plus sans classement');
    expect(container.textContent).not.toContain('partira « à classer »');
  });

  /** ⚠️ UN BOUTON INERTE DIT POURQUOI. Éteint sans motif, il se lit comme une panne. */
  it('⚠️ sans destinataire, « Rattacher » est inerte et dit pourquoi', () => {
    monter({ sansDestinataire: true });
    expect((cases()[0] as HTMLButtonElement).disabled).toBe(true);
    expect(container.textContent).toContain('Ajoutez d’abord un destinataire');
  });

  it('⚠️ sans la migration 281, « Interne » est inerte et dit pourquoi', () => {
    monter({ interneDisponible: false });
    expect((cases()[1] as HTMLButtonElement).disabled).toBe(true);
    expect(container.textContent).toContain('migration 281');
  });
});

describe('🔴 ② des biens cochés : UNE case VERTE « Rattaché »', () => {
  it('🔴 une seule case, verte, et le MOT porte l’information', () => {
    monter({ cibles: [LOT('421', '28 av. Marceau — lot 421')] });
    const c = cases();
    expect(c).toHaveLength(1);
    expect(c[0].className).toContain('ccl-case--verte');
    expect(c[0].textContent).toContain('Rattaché');
  });

  /**
   * ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — CE TEST A CHANGÉ DE PROMESSE, PARCE QUE LA CASE A CHANGÉ DE TEXTE.
   *
   * IL DISAIT : « la liste courte des biens est SOUS le mot » (« 28 av. Marceau — lot 421, +2 »). Demande
   * d'Arno : la case verte porte désormais un RÉSUMÉ PAR CATÉGORIE, sans adresse — « 1 logement + 1 parking ».
   * Au-dessus d'un mail, l'adresse est déjà écrite en entier juste à gauche : la répéter tronquée la faisait
   * lire deux fois, et mal la seconde fois.
   */
  it('🔴🔴 sous le mot : le RÉSUMÉ PAR CATÉGORIE, sans aucune adresse', () => {
    monter({ cibles: [LOT('421', '28 av. Marceau — lot 421', 'logement')] });
    const detail = container.querySelector('.ccl-case-detail')?.textContent;
    expect(detail).toBe('1 logement');
    expect(detail).not.toContain('Marceau');
  });

  it('🔴 plusieurs catégories : « 1 logement + 2 parkings »', () => {
    monter({ cibles: [
      LOT('360', 'A', 'logement'), LOT('397', 'B', 'parking'), LOT('398', 'C', 'parking'),
    ] });
    expect(container.querySelector('.ccl-case-detail')?.textContent).toBe('1 logement + 2 parkings');
  });

  it('🔴 quatre logements ne sont plus « A, B, +2 » mais « 4 logements »', () => {
    monter({ cibles: [LOT('1', 'A'), LOT('2', 'B'), LOT('3', 'C'), LOT('4', 'D')] });
    expect(container.querySelector('.ccl-case-detail')?.textContent).toBe('4 logements');
  });

  it('🔴 un clic sur la case verte ROUVRE la modale', () => {
    monter({ cibles: [LOT('421', '28 av. Marceau — lot 421')] });
    act(() => { (cases()[0] as HTMLButtonElement).click(); });
    expect(gestes.onRattacher).toHaveBeenCalledTimes(1);
  });
});

describe('🔴 ③ « Interne » : UNE case VERTE, et une animation', () => {
  it('🔴 le clic pose le choix TOUT DE SUITE — l’animation n’attend rien', () => {
    monter();
    act(() => { (cases()[1] as HTMLButtonElement).click(); });
    expect(gestes.onInterne).toHaveBeenCalledTimes(1);
  });

  it('🔴 une seule case verte « Interne », et plus de case rouge', () => {
    monter({ interne: true });
    const c = cases();
    expect(c).toHaveLength(1);
    expect(c[0].className).toContain('ccl-case--verte');
    expect(c[0].textContent).toContain('Interne');
    expect(container.querySelector('.ccl-case--rouge')).toBeNull();
  });

  /** 🔴 LES DEUX RÉPONSES S'EXCLUENT : il n'y a JAMAIS deux cases vertes. */
  it('🔴 jamais deux cases vertes, même si les deux états arrivaient ensemble', () => {
    monter({ interne: true, cibles: [LOT('421', 'A')] });
    expect(container.querySelectorAll('.ccl-case--verte')).toHaveLength(1);
  });
});

/**
 * ══ 🔴🔴 LOT CLASSER-AVANT-ENVOI — ④ « HORS GESTION », HÉRITÉ ET JAMAIS CHOISI ICI ════════════════════════════
 *
 * ARNO (01/10/2026) : « si la conversation est déjà rattachée, interne ou hors gestion, la case est pré-remplie
 * en vert dans le même état (avec Réinitialiser) ».
 */
describe('🔴🔴 ④ « Hors gestion » : la troisième case verte, héritée', () => {
  it('🔴 une seule case verte, et le MOT porte l’information', () => {
    monter({ horsGestion: true });
    const c = cases();
    expect(c).toHaveLength(1);
    expect(c[0].className).toContain('ccl-case--verte');
    expect(c[0].textContent).toContain('Hors gestion');
  });

  /**
   * 🔴 LA CASE DIT CE QU'ELLE SIGNIFIE : « ce courrier ne concerne aucun bien ».
   *
   * ⚠️ ELLE NE DIT PLUS « repris de la conversation » (lot CLASSER-SUR-CHAQUE-MAIL) : depuis que le même
   * composant vit AUSSI au-dessus de chaque mail reçu, cet état n'est plus seulement hérité — sur un mail, il
   * est SA propre marque. Une phrase vraie dans un cas sur deux ne vaut pas mieux qu'une phrase fausse.
   */
  it('🔴 elle dit ce que « Hors gestion » veut dire', () => {
    monter({ horsGestion: true });
    expect(container.textContent).toContain('ne concerne aucun bien');
  });

  /** 🔴 IL N'Y A PAS DE QUATRIÈME BOUTON : on ne propose jamais de POSER cet état depuis la rédaction. */
  it('🔴🔴 aucun bouton « Hors gestion » à l’état initial', () => {
    monter();
    expect(container.textContent).not.toContain('Hors gestion');
    expect(cases()).toHaveLength(2);
  });

  it('🔴 « Réinitialiser » est là, comme pour les deux autres', () => {
    monter({ horsGestion: true });
    expect(boutonPar(/^Réinitialiser$/)).toBeDefined();
  });

  /** 🔴 L'ORDRE DE PRIORITÉ : un bien rattaché l'emporte — il n'y a jamais deux cases vertes. */
  it('🔴 un bien rattaché l’emporte sur l’héritage « hors gestion »', () => {
    monter({ horsGestion: true, cibles: [LOT('421', 'A')] });
    expect(container.querySelectorAll('.ccl-case--verte')).toHaveLength(1);
    expect(cases()[0].textContent).toContain('Rattaché');
  });

  it('🔴 sans la migration 289, le bloc prévient — et SEULEMENT quand l’héritage sert', () => {
    monter({ horsGestion: true, persistantHorsGestion: false });
    expect(container.textContent).toContain('migration 289');
    monter({ interne: true, persistantHorsGestion: false });
    expect(container.textContent).not.toContain('migration 289');
  });
});

/**
 * ══ 🔴🔴 L'ANIMATION « D — ÉLASTIQUE », VALIDÉE PAR ARNO — ÉPROUVÉE SUR LE VRAI COMPOSANT ═════════════════════
 *
 * « Clic sur “Interne” : la case blanche s'étend vers la GAUCHE […]. “Valider” dans la modale : la case rouge
 * s'étend vers la DROITE […]. Le choix est enregistré au clic, sans attendre la fin de l'animation.
 * “Réinitialiser” : retour instantané aux deux boutons. »
 *
 * ⚠️ ON ÉPROUVE LE PASSAGE D'UN ÉTAT À L'AUTRE, pas un montage : c'est tout l'objet de cette animation, et c'est
 * aussi la seule façon de prouver qu'une fenêtre qui s'OUVRE déjà classée n'anime rien.
 */
describe('🔴🔴 l’animation « D — Élastique », dans les deux sens', () => {
  it('🔴 « Interne » : la case s’étend vers la GAUCHE, depuis le blanc', () => {
    monter();
    monter({ interne: true });
    const verte = container.querySelector('.ccl-case--verte') as HTMLElement;
    expect(verte.className).toContain('ccl-case--elastique');
    expect(verte.className).toContain('ccl-case--vers-gauche');
    expect(verte.className).toContain('ccl-depuis-blanc');
  });

  it('🔴 « Rattaché » : la case s’étend vers la DROITE, depuis le rouge', () => {
    monter();
    monter({ cibles: [LOT('421', 'A')] });
    const verte = container.querySelector('.ccl-case--verte') as HTMLElement;
    expect(verte.className).toContain('ccl-case--vers-droite');
    expect(verte.className).toContain('ccl-depuis-rouge');
  });

  /** 🔴 « L'AUTRE CASE S'EFFACE » : encore faut-il qu'elle soit là pour s'effacer. */
  it('🔴 l’autre case reste le temps de s’effacer, à sa place, et muette', () => {
    monter();
    monter({ interne: true });
    const f = container.querySelector('.ccl-fantome') as HTMLElement;
    expect(f).not.toBeNull();
    // « Interne » était à DROITE : c'est donc « Rattacher », à GAUCHE, qui s'efface.
    expect(f.className).toContain('ccl-fantome--gauche');
    expect(f.textContent).toContain('Rattacher');
    expect(f.getAttribute('aria-hidden')).toBe('true');
  });

  it('🔴 et dans l’autre sens, c’est « Interne », à droite, qui s’efface', () => {
    monter();
    monter({ cibles: [LOT('421', 'A')] });
    const f = container.querySelector('.ccl-fantome') as HTMLElement;
    expect(f.className).toContain('ccl-fantome--droite');
    expect(f.textContent).toContain('Interne');
  });

  /**
   * 🔴🔴 UNE FENÊTRE QUI S'OUVRE DÉJÀ CLASSÉE N'ANIME RIEN. C'est le cas d'une réponse dans une conversation
   * rattachée : sans cette règle, chaque ouverture aurait déclenché un mouvement que personne n'a demandé.
   */
  it('🔴🔴 un montage DIRECT en vert n’anime pas', () => {
    monter({ cibles: [LOT('421', 'A')] });
    expect(container.querySelector('.ccl-case--elastique')).toBeNull();
    expect(container.querySelector('.ccl-fantome')).toBeNull();
  });

  it('⚠️ changer les biens d’une case DÉJÀ verte n’anime pas non plus', () => {
    monter({ cibles: [LOT('421', 'A')] });
    monter({ cibles: [LOT('421', 'A'), LOT('12', 'B')] });
    expect(container.querySelector('.ccl-case--elastique')).toBeNull();
  });

  /** 🔴 « Réinitialiser » : retour INSTANTANÉ aux deux boutons. */
  it('🔴 le retour à zéro n’anime rien, et rend les deux cases', () => {
    monter();
    monter({ interne: true });
    monter({ interne: false });
    expect(cases()).toHaveLength(2);
    expect(container.querySelector('.ccl-case--elastique')).toBeNull();
    expect(container.querySelector('.ccl-fantome')).toBeNull();
  });

  /** ⚠️ ET L'ANIMATION SE TERMINE : passé le total annoncé, il ne reste ni classe ni fantôme. */
  it('⚠️ après 560 ms, plus aucune trace de l’animation', async () => {
    monter();
    monter({ interne: true });
    expect(container.querySelector('.ccl-case--elastique')).not.toBeNull();
    await act(async () => { await new Promise((r) => { setTimeout(r, ANIM_TOTAL_MS + 40); }); });
    expect(container.querySelector('.ccl-case--elastique')).toBeNull();
    expect(container.querySelector('.ccl-fantome')).toBeNull();
  });
});

/**
 * ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LA CASE VERTE SE DÉFAIT D'UN CLIC, ET LA VERSION COMPACTE ══════════════
 *
 * ARNO (point 4) : « Clic sur la case verte “Interne” (ou “Hors gestion”) → retour immédiat aux deux boutons
 * rouge et blanc, prêts à reclasser. » — et (point 1) « Version compacte, à la hauteur du bloc ».
 */
describe('🔴🔴 la case verte « Interne » / « Hors gestion » se défait d’un clic', () => {
  it('🔴 « Interne » est un BOUTON, et le clic demande le retour aux deux cases', () => {
    monter({ interne: true });
    const verte = cases()[0] as HTMLButtonElement;
    expect(verte.tagName).toBe('BUTTON');
    act(() => { verte.click(); });
    expect(gestes.onReinitialiser).toHaveBeenCalledTimes(1);
  });

  it('🔴 « Hors gestion » aussi', () => {
    monter({ horsGestion: true });
    act(() => { (cases()[0] as HTMLButtonElement).click(); });
    expect(gestes.onReinitialiser).toHaveBeenCalledTimes(1);
  });

  /**
   * 🔴 « RATTACHÉ » NE SE DÉFAIT PAS AU CLIC : il ROUVRE la modale (« avec les biens actuellement rattachés
   * cochés »). Les deux cases vertes ne répondent pas à la même question, et c'est voulu.
   */
  it('🔴 « Rattaché », lui, rouvre la modale — il ne se défait pas', () => {
    monter({ cibles: [LOT('421', 'A')] });
    act(() => { (cases()[0] as HTMLButtonElement).click(); });
    expect(gestes.onRattacher).toHaveBeenCalledTimes(1);
    expect(gestes.onReinitialiser).not.toHaveBeenCalled();
  });

  /** ⚠️ ET « Réinitialiser » RESTE (Arno le demande) : la case est le geste évident, le lien le geste nommé. */
  it('⚠️ le lien « Réinitialiser » est toujours là, sous les trois cases vertes', () => {
    for (const o of [{ interne: true }, { horsGestion: true }, { cibles: [LOT('421', 'A')] }]) {
      monter(o);
      expect(boutonPar(/^Réinitialiser$/), JSON.stringify(o)).toBeDefined();
    }
  });
});

describe('🔴🔴 la version COMPACTE, pour le bloc gris d’un mail', () => {
  it('🔴 elle porte sa classe, et le titre disparaît', () => {
    monter({ compact: true });
    expect(container.querySelector('.ccl')?.className).toContain('ccl--compact');
    expect(container.textContent).not.toContain('Classer ce mail');
  });

  /** 🔴 LES NOTES AUSSI : trente mails dans une conversation, quatre lignes de notes chacun — illisible. */
  it('🔴 les notes du bas ne sont pas rendues', () => {
    monter({ compact: true, persistant: false, interneDisponible: false });
    expect(container.textContent).not.toContain('migration 285');
    expect(container.textContent).not.toContain('migration 281');
    expect(container.textContent).not.toContain('ne part plus sans classement');
  });

  /** ⚠️ MAIS LES MOTIFS RESTENT ATTEIGNABLES : ils passent par l'infobulle du bouton, jamais dans le vide. */
  it('⚠️ le motif d’un bouton inerte reste dans son infobulle', () => {
    monter({ compact: true, interneDisponible: false });
    const blanche = cases()[1] as HTMLButtonElement;
    expect(blanche.disabled).toBe(true);
    expect(blanche.getAttribute('title')).toContain('migration 281');
  });

  /** 🔴 RIEN N'EST RETIRÉ DE LA FONCTION : mêmes états, mêmes mots, même animation. */
  it('🔴 les trois états verts existent aussi en compact', () => {
    monter({ compact: true, cibles: [LOT('421', 'A', 'parking')] });
    expect(cases()[0].textContent).toContain('Rattaché');
    expect(container.querySelector('.ccl-case-detail')?.textContent).toBe('1 parking');
    monter({ compact: true, interne: true });
    expect(cases()[0].textContent).toContain('Interne');
    monter({ compact: true, horsGestion: true });
    expect(cases()[0].textContent).toContain('Hors gestion');
  });
});

describe('🔴 « Réinitialiser » revient à l’état initial', () => {
  it('🔴 il est là dès qu’une décision est prise, et pas avant', () => {
    monter();
    expect(boutonPar(/^Réinitialiser$/)).toBeUndefined();
    monter({ interne: true });
    expect(boutonPar(/^Réinitialiser$/)).toBeDefined();
    monter({ cibles: [LOT('421', 'A')] });
    expect(boutonPar(/^Réinitialiser$/)).toBeDefined();
  });

  it('🔴 le clic demande la remise à zéro', () => {
    monter({ cibles: [LOT('421', 'A')] });
    act(() => { boutonPar(/^Réinitialiser$/)?.click(); });
    expect(gestes.onReinitialiser).toHaveBeenCalledTimes(1);
  });

  it('🔴 remis à zéro, on retrouve EXACTEMENT les deux cases du départ', () => {
    monter({ cibles: [LOT('421', 'A')] });
    monter({ cibles: [], interne: false });
    const c = cases();
    expect(c).toHaveLength(2);
    expect(c[0].className).toContain('ccl-case--rouge');
    expect(c[1].className).toContain('ccl-case--blanche');
  });
});

/**
 * ⚠️ SANS LA MIGRATION 285, LE CHOIX NE SURVIT PAS À LA FERMETURE DE LA FENÊTRE. On le DIT : laisser croire
 * qu'un travail de classement est gardé alors qu'il est perdu est exactement le silence que ce module refuse.
 */
describe('⚠️ la persistance se dit quand elle manque', () => {
  it('rien n’est annoncé dans le cas ordinaire', () => {
    monter();
    expect(container.textContent).not.toContain('migration 285');
  });

  it('🔴 sans la migration 285, le bloc prévient que le choix ne sera pas retrouvé', () => {
    monter({ persistant: false });
    expect(container.textContent).toContain('migration 285');
    expect(container.textContent).toContain('ne sera pas retrouvé');
  });
});

describe('garanties d’écran (statiques)', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/ChampClassement.tsx', 'utf8');

  /** Règle du module : aucune couleur en dur, uniquement des jetons de charte. Le blanc du texte sur le rouge
   *  plein est la seule exception admise — c'est une valeur de contraste, pas une couleur de marque. */
  it('aucune couleur en dur hors le blanc du texte sur fond rouge', () => {
    const couleurs = (src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).filter((c) => c !== '#fff' && c !== '#000');
    expect(couleurs).toEqual([]);
  });

  /** 🔴 LES DEUX CASES FONT CHACUNE LA MOITIÉ, et de même hauteur : c'est la demande, au mot près. */
  it('🔴 deux colonnes égales, et des hauteurs alignées', () => {
    expect(src).toContain('grid-template-columns:1fr 1fr');
    expect(src).toContain('align-items:stretch');
  });

  /** EXIGENCE TRANSVERSE DU DÉPÔT : qui demande moins de mouvement n'en reçoit aucun. */
  it('⚠️ l’animation respecte `prefers-reduced-motion`', () => {
    expect(src).toContain('prefers-reduced-motion');
    const bloc = src.slice(src.indexOf('prefers-reduced-motion'));
    expect(bloc).toContain('animation:none');
    // 🔴 ET L'ÉTAT FINAL EST LÀ DIRECTEMENT : le fantôme ne s'efface pas, il n'apparaît pas.
    expect(bloc).toContain('.ccl-fantome{display:none}');
  });

  /**
   * 🔴🔴 LES DURÉES D'ARNO SONT DANS LA FEUILLE DE STYLE, et elles y viennent du module PUR. Deux chiffres
   * écrits séparément (le délai du composant, la durée du CSS) finissent par diverger d'une dizaine de
   * millisecondes, et la case reste figée dans son état d'arrivée — un défaut qu'on ne voit qu'une fois sur dix.
   */
  it('🔴🔴 300 / 180 / 260 ms et le léger dépassement arrivent bien dans le CSS', () => {
    expect(CSS_CHAMP_CLASSEMENT).toContain(`animation-duration:${ANIM_ETENDRE_MS}ms, ${ANIM_REBOND_MS}ms`);
    expect(CSS_CHAMP_CLASSEMENT).toContain(`animation-delay:0ms, ${ANIM_ETENDRE_MS}ms`);
    expect(CSS_CHAMP_CLASSEMENT).toContain(`ccl-effacer ${ANIM_EFFACER_MS}ms ease-out forwards`);
    expect(CSS_CHAMP_CLASSEMENT).toContain(ANIM_COURBE_ELASTIQUE);
    // Le rebond demande : 1 -> 1.04 -> 0.986 -> 1.
    expect(CSS_CHAMP_CLASSEMENT).toContain('scale(1.04)');
    expect(CSS_CHAMP_CLASSEMENT).toContain('scale(.986)');
    // Et aucune durée ecrite a la main : le total vient de la somme des deux.
    expect(ANIM_ETENDRE_MS + ANIM_REBOND_MS).toBe(ANIM_TOTAL_MS);
  });

  /** 🔴 LES DEUX SENS SONT DANS LA FEUILLE, et ils ne partent pas de la même couleur. */
  it('🔴 un jeu d’images-clés par sens : depuis le blanc, depuis le rouge', () => {
    expect(src).toContain('@keyframes ccl-elastique-blanc');
    expect(src).toContain('@keyframes ccl-elastique-rouge');
    expect(src).toContain('.ccl-case--vers-gauche{transform-origin:right center}');
    expect(src).toContain('.ccl-case--vers-droite{transform-origin:left center}');
  });

  /** La règle du résumé vient du module PUR : l'écran place et peint, il ne décide pas. */
  it('le résumé par catégorie vient du module pur', () => {
    expect(src).toContain('resumeParCategorie');
    // 🔴 ET PLUS AUCUNE ADRESSE : l'ancien résumé par libellé a disparu de ce composant.
    expect(src).not.toContain('resumeBiensRattaches');
  });
});
