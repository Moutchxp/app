// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BoiteMail } from './BoiteMail';

/**
 * LOT RECHERCHE-LIGNES — UNE LIGNE DE RÉSULTAT EST UNE LIGNE DE RÉCEPTION.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LE CONSTAT D'ARNO : « dans les Résultats du moteur de recherche, chaque ligne affiche le mot “Réception”
 * (ou la catégorie) À LA PLACE des éléments habituels. Il manque le trombone avec le nombre de pièces et la capsule
 * de statut. » Voulu : « les lignes de résultats utilisent EXACTEMENT le même composant de ligne que la Réception
 * classique […] Un seul composant de ligne pour toutes les listes. Pas de copie divergente. »
 *
 * 🔴 CE QUE CE FICHIER A TROUVÉ, ET QUI CHANGE LA NATURE DU CORRECTIF. Le composant était DÉJÀ le même — il n'y a
 * jamais eu deux rendus de ligne dans ce module. Ce qui différait était la DONNÉE : la route de recherche rendait
 * `piecesDuMessage: 0`, `piecesAilleurs: 0` et `classement: null`, et la ligne affichait alors fidèlement… rien.
 * Une ligne qui n'affiche rien parce qu'on ne lui a rien donné ressemble, à l'œil, à une ligne d'un autre genre.
 *
 * D'où les deux étages de ce fichier :
 *   ① LE RENDU — la MÊME ligne, passée par la Réception puis par les résultats, produit le MÊME balisage ;
 *   ② LA SOURCE — il n'existe qu'UN endroit dans le code qui rend une ligne de liste, et la mention de catégorie
 *      n'y est plus.
 * La forme de la donnée, elle, est éprouvée là où elle naît (`rechercheBoite.test.ts`).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * 🔴 UNE SEULE LIGNE, ÉCRITE UNE SEULE FOIS, servie aux DEUX écrans. C'est tout le propos : si la Réception et les
 * résultats rendent autrement la même ligne, la différence ne peut venir que du composant.
 *
 * ⚠️ ELLE PORTE CE QUI MANQUAIT : deux pièces sur le message affiché, une ailleurs, et un rattachement confirmé à
 * la main — soit un trombone NOIR « 📎 2 » et une capsule « Classé ».
 */
const LIGNE = {
  filId: 4242,
  objet: 'Re: Fuite chez JULLIEN',
  interlocuteur: 'Cédric JULLIEN',
  messageAffiche: 77,
  dernierSens: 'recu' as const,
  dernierLe: '2026-09-20T08:00:00Z',
  extrait: 'bonjour, la fuite continue',
  nbMessages: 3,
  nbLisibles: 3,
  aPiece: true,
  nbPieces: 3,
  piecesDuMessage: 2,
  piecesAilleurs: 1,
  etoilee: false,
  classement: { nbActifs: 1, parUnHumain: true, detail: 'lot 219 — à la main' },
  horsGestion: false,
  reference: null,
  sansSuite: false,
  nonRemise: null,
};

/** La même ligne, telle que la RECHERCHE la rend : elle porte en plus ce que la recherche sait d'elle-même. */
const LIGNE_TROUVEE = { ...LIGNE, messageTrouveId: 77, objetTrouve: 'Re: Fuite chez JULLIEN', provenance: 'reception' };

let container: HTMLDivElement;
let root: Root;
let urls: string[];

const reponse = (lignes: unknown[], recherche: boolean) => ({
  lignes, suivant: null, total: lignes.length, comptes: null,
  nonLus: [], nonLusTotal: 0, nonLusPartiel: false,
  ...(recherche ? { pleinTexte: true, automatiquesMasques: null, brouillons: { lignes: [], tronque: false } } : {}),
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  urls = [];
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    urls.push(u);
    const cherche = u.includes('/boite/recherche');
    return {
      ok: true,
      json: async () => reponse(cherche ? [LIGNE_TROUVEE] : [LIGNE], cherche),
    } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async () => {
  await act(async () => { root.render(createElement(BoiteMail, { onOuvrir: () => {} })); });
  await calmer();
};
const champHaut = () => container.querySelector('input[type="search"]') as HTMLInputElement;
/**
 * ⚠️ LA RECHERCHE EST UN FORMULAIRE, PAS UNE FRAPPE : elle ne part qu'à la soumission (« Entrée », ou le bouton
 * « Rechercher » du clavier des téléphones). Taper sans soumettre laisserait la liste d'avant à l'écran — et le
 * test aurait comparé la Réception à elle-même, donc passé sans rien prouver.
 */
const taper = async (valeur: string) => {
  const champ = champHaut();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, valeur);
  await act(async () => { champ.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => {
    champ.closest('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await calmer();
};
const ligne = () => container.querySelector('.bte-ligne') as HTMLElement | null;

/**
 * ══ 🔴🔴 LA SEULE DIFFÉRENCE PERMISE : LA MISE EN ÉVIDENCE DU MOT CHERCHÉ ═══════════════════════════════════════
 *
 * Arno la veut EXPRESSÉMENT conservée (« mise en évidence du mot cherché conservée dans l'objet et l'extrait »).
 * Le balisage des deux écrans ne peut donc pas être identique au caractère près : en résultats, « JULLIEN » est
 * enveloppé d'un `<strong class="bte-trouve">`, et le reste du texte de spans nus que `Evidence` introduit.
 *
 * 🔴 ON DÉPLIE DONC CES DEUX BALISES-LÀ, ET ELLES SEULES, avant de comparer. Tout le reste — l'ordre des marques,
 * le trombone, la capsule, l'heure, les titres d'infobulle — est comparé tel quel. Une marque de plus, une marque
 * en moins, un ordre différent : le test rougit. C'était exactement le défaut d'Arno.
 *
 * ⚠️ ON DÉPLIE PAR LE DOM, PAS PAR UNE EXPRESSION RÉGULIÈRE. Première écriture de ce test : un `replace` sur
 * `</span>` — qui effaçait AUSSI les fermetures des spans à classe, donc rendait la comparaison bien plus laxiste
 * qu'annoncé. Une normalisation trop gourmande fait passer un test sans qu'il prouve ce qu'il dit prouver.
 */
const sansEvidence = (n: HTMLElement | null): string => {
  if (n === null) return '';
  const copie = n.cloneNode(true) as HTMLElement;
  // Chaque morceau mis en évidence redevient du texte ; `normalize()` recolle les morceaux voisins.
  for (const fort of [...copie.querySelectorAll('.bte-trouve')]) {
    fort.replaceWith(document.createTextNode(fort.textContent ?? ''));
  }
  // Les spans NUS que `Evidence` pose autour du reste du texte : eux seuls n'ont aucun attribut.
  for (const nu of [...copie.querySelectorAll('span')]) {
    if (nu.attributes.length === 0) nu.replaceWith(document.createTextNode(nu.textContent ?? ''));
  }
  copie.normalize();
  return copie.outerHTML;
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LE RENDU — LA MÊME LIGNE, LE MÊME BALISAGE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 une ligne de résultat et une ligne de Réception sont la MÊME ligne', () => {
  /**
   * 🔴🔴 L'ÉPREUVE CENTRALE DU LOT. On rend la même ligne deux fois — une fois en Réception, une fois en
   * résultats — et l'on compare le BALISAGE produit, caractère par caractère. Deux composants, même très
   * ressemblants, ne produisent pas le même HTML ; un seul composant, oui.
   *
   * ⚠️ POURQUOI LE HTML ENTIER ET NON QUELQUES CLASSES : une comparaison par échantillon ne verrait pas ce qu'on
   * cherche justement à interdire — une marque de plus, une marque en moins, un ordre différent. C'est le défaut
   * qu'Arno a constaté, et il ne tenait qu'à cela.
   */
  it('🔴 le balisage de la ligne est IDENTIQUE dans les deux écrans', async () => {
    await monter();
    const enReception = sansEvidence(ligne());
    const brutReception = ligne()?.outerHTML ?? '';
    expect(enReception).not.toBe('');

    await taper('jullien');
    expect(urls.some((u) => u.includes('/boite/recherche'))).toBe(true);
    const enResultats = sansEvidence(ligne());

    expect(enResultats).toBe(enReception);
    // ⚠️ ET LA COMPARAISON N'EST PAS VIDE DE SENS : la ligne comparée porte bien ses repères.
    expect(brutReception).toContain('bte-marque--pieces');
    expect(brutReception).toContain('bte-capsule');
  });

  /** 🔴 ET LES DEUX REPÈRES QU'ARNO CHERCHAIT DES YEUX SONT BIEN LÀ, dans les résultats. */
  it('🔴 le trombone porte son NOMBRE, et la capsule son MOT', async () => {
    await monter();
    await taper('jullien');
    const l = ligne();
    /**
     * ⚠️ RÉÉCRIT PAR LE LOT LISTE-PAGINATION : le trombone est un TRACÉ, plus un emoji (il ignorait `color`, ce
     * qui le laissait argenté à côté d'un chiffre noir ou gris — le défaut signalé par Arno). `textContent` ne
     * voit donc plus que le nombre ; la présence de l'icône se vérifie sur le tracé lui-même.
     */
    // 2 pièces du message AFFICHÉ, en noir (la classe « loin » est celle du gris).
    const trombone = l?.querySelector('.bte-marque--pieces');
    expect(trombone?.querySelector('svg')).not.toBeNull();
    expect(trombone?.textContent?.replace(/\s+/g, ' ').trim()).toBe('2');
    expect(trombone?.className).not.toContain('bte-marque--pieces-loin');
    // La capsule dit son mot : un rattachement confirmé à la main, c'est « Classé ».
    expect(l?.querySelector('.bte-capsule')?.textContent).toContain('Classé');
  });

  /**
   * 🔴🔴 LA MENTION DE CATÉGORIE A DISPARU (demande d'Arno, mot pour mot : « Supprime la mention de catégorie
   * (“Réception”, “Envoyés”…) sur les lignes »).
   *
   * ⚠️ ON VÉRIFIE LE MOT DANS LA LIGNE, PAS DANS L'ÉCRAN : « Réception » reste écrit ailleurs — c'est le nom de
   * l'étiquette dans la colonne de gauche, et il doit y rester.
   */
  it('🔴 aucune mention de catégorie sur la ligne d’un résultat', async () => {
    await monter();
    await taper('jullien');
    const l = ligne();
    expect(l?.textContent).not.toContain('Réception');
    expect(l?.textContent).not.toContain('Envoyés');
    expect(container.querySelector('.bte-provenance')).toBeNull();
  });

  /** ⚠️ ET CE QUI FAIT DE CETTE LIGNE UN RÉSULTAT RESTE : le mot cherché est mis en évidence, objet et extrait. */
  it('la mise en évidence du mot cherché est conservée', async () => {
    await monter();
    await taper('jullien');
    const forts = [...(ligne()?.querySelectorAll('.bte-trouve') ?? [])]
      .map((x) => (x.textContent ?? '').toLowerCase());
    expect(forts.some((t) => t.includes('jullien'))).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LA SOURCE — UN SEUL ENDROIT QUI REND UNE LIGNE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 pas de copie divergente', () => {
  const code = (f: string) => readFileSync(f, 'utf8');
  const BOITE = 'app/(admin)/admin/(protected)/gestion/BoiteMail.tsx';

  /**
   * 🔴 UN SEUL RENDU DE LIGNE DANS TOUT LE MODULE. C'est la demande d'Arno (« un seul composant de ligne pour
   * toutes les listes : Réception, Envoyés, Brouillons, Spam, Corbeille, Sans événement, filtre étoile, résultats
   * de recherche »). Le jour où quelqu'un recopiera ce bloc pour « adapter » une liste, ce test rougira — et
   * c'est exactement à ce moment-là qu'il faut en parler.
   *
   * ⚠️ ON COMPTE L'OUVERTURE DE LA BALISE, pas la classe : `bte-ligne` apparaît aussi dans le CSS, dans les
   * lignes de squelette et dans la liste des « récents ». Ce qu'on veut compter, c'est le BOUTON de ligne.
   */
  it('🔴 un seul bouton de ligne est écrit, pour toutes les listes', () => {
    const src = code(BOITE);
    const ouvertures = src.match(/className=\{`bte-ligne\$\{/g) ?? [];
    expect(ouvertures).toHaveLength(1);
  });

  /** 🔴 ET AUCUN AUTRE ÉCRAN NE REND SA PROPRE LIGNE DE BOÎTE : la liste est `BoiteMail`, partout. */
  it('🔴 aucun autre fichier ne fabrique une ligne de boîte', () => {
    for (const f of [
      'app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx',
      'app/(admin)/admin/(protected)/gestion/BoiteReception.tsx',
      'app/(admin)/admin/(protected)/gestion/GestionVue.tsx',
    ]) {
      expect(code(f), f).not.toContain('className={`bte-ligne${');
    }
  });

  /**
   * 🔴 LA DONNÉE AUSSI EST ÉCRITE UNE SEULE FOIS. Les jointures de la capsule et la lecture des pièces sont
   * IMPORTÉES de `boiteRepo` par la recherche, jamais recopiées : deux écritures de « qu'est-ce qu'un échange
   * classé ? » finiraient par ne plus dire la même chose, et c'est précisément ce qui avait produit le défaut.
   */
  it('🔴 la recherche IMPORTE les fragments de la liste au lieu de les recopier', () => {
    const rech = code('app/lib/gestion/rechercheBoite.ts');
    expect(rech).toContain('sqlJointureClassement(rattachements,');
    expect(rech).toContain('sqlJointureHorsGestion(horsGestion,');
    expect(rech).toContain('piecesVraiesDesFils(filsDeLaPage)');
    // La règle elle-même n'est PAS réécrite ici : aucune table de rattachement nommée dans ce fichier.
    expect(rech).not.toContain('gestion_rattachement r');
    expect(rech).not.toContain('gestion_hors_gestion');
  });
});
