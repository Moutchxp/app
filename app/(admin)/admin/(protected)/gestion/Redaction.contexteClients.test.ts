// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import { rangerSuggestions } from '../../../../lib/gestion/suggestionsBien';
import type { BienClient } from '../../../../lib/gestion/contexteClients';

/**
 * ══ 🔴🔴 LOT NOUVEAU-MESSAGE-CONTEXTE-BIEN-PAR-CLIENT — LE BIEN RETROUVÉ PAR LES CLIENTS TAPÉS ═══════════════════════
 * Composeur ouvert SANS fiche bien (Nouveau message, Répondre depuis la Réception) :
 *   a. client à UN bien ⇒ le bien entre d'office dans les cibles, puce à trame pleine, suggestions de ce bien ;
 *   b. client à PLUSIEURS biens ⇒ puce à contour plein, « Rattacher ce mail à : », cocher 1 puis 2 biens ;
 *   décocher, retirer l'adresse ; propriétaire et locataire ; client sous deux familles ; inconnue inchangée ;
 *   à l'envoi, les cibles partent avec le mail ; depuis une fiche bien, rien d'office.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false, classementDisponible: true,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test', delaiAnnulationS: 5,
} as ContexteRedactionEcran;
const bien = (lotId: number, cle: string, role: BienClient['role'], nom = 'DUPONT Jean'): BienClient => ({
  lotId, cle, libelle: `${cle} rue des Tests, 75000 PARIS — lot ${cle}`, categorie: 'logement', role, nom,
});
const BIENS: Record<string, BienClient[]> = {
  'un.bien@x.fr': [bien(501, '501', 'locataire', 'ROI Léa')],
  'trois.biens@x.fr': [bien(601, '601', 'proprietaire'), bien(602, '602', 'proprietaire'), bien(603, '603', 'proprietaire')],
  'deux.familles@x.fr': [bien(701, '701', 'locataire', 'MARTIN Paul'), bien(702, '702', 'proprietaire', 'MARTIN Paul')],
  // LOT RATTACHEMENT-BIENS-SUIT-LES-ADRESSES — le scénario d'Arno : un multipropriétaire, un propriétaire à bien unique.
  'multi@x.fr': [bien(432, '432', 'proprietaire', 'JULLIEN'), bien(433, '433', 'proprietaire', 'JULLIEN')],
  'seul@x.fr': [bien(900, '900', 'proprietaire', 'SEUL')],
  'loc1@x.fr': [bien(950, '950', 'locataire', 'A')],
  'loc2@x.fr': [bien(950, '950', 'locataire', 'B')],
  // LOT RATTACHEMENT-VALIDER-TOUS-PERD-DES-BIENS — un client de NOTRE domaine : le moteur ne le prend pas comme clé.
  'c.jullien@sansvisavis.com': ['432', '494', '373', '219', '224', '58'].map((k) => bien(Number(k), k, 'proprietaire', 'JULLIEN - GARRIDO Cédric')),
};
const HORS_MOTEUR = new Set(['c.jullien@sansvisavis.com']);
const listeDu = (id: number) => rangerSuggestions({
  clients: [{ adresse: `client.${id}@x.fr`, nom: `Client ${id}`, role: 'Propriétaire', ton: 'proprietaire', propre: true, civilite: null, nomFamille: null }],
  immeuble: [{ adresse: `syndic.${id}@x.fr`, nom: `Syndic ${id}`, role: 'Syndic — e-mail général', ton: 'syndic', propre: true, civilite: null, nomFamille: null }],
});

let container: HTMLDivElement;
let root: Root;
let courant: BrouillonEcran;
let appels: Array<{ url: string; methode: string; corps?: string }>;
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: { method?: string; body?: string }) => {
    const url = String(u);
    appels.push({ url, methode: init?.method ?? 'GET', corps: init?.body });
    const q = new URL(`http://x${url}`).searchParams.getAll('a');
    if (url.includes('/adresses/biens')) return new Response(JSON.stringify({ etat: 'ok', biens: Object.fromEntries(q.map((a) => [a, BIENS[a] ?? []])) }));
    if (url.includes('/adresses/familles')) return new Response(JSON.stringify({ etat: 'ok', familles: Object.fromEntries(q.map((a) => [a, null])) }));
    if (url.includes('/gestion/classement') && init?.method === 'POST') {
      const dest = (JSON.parse(String(init.body)) as { destinataires?: string[] }).destinataires ?? [];
      const biens = [...new Map(dest.filter((a) => !HORS_MOTEUR.has(a)).flatMap((a) => BIENS[a] ?? []).map((x) => [x.cle, x])).values()].map((x) => ({
        cle: x.cle, libelle: x.libelle, adresse: `${x.cle} rue des Tests`, commune: 'PARIS', typeBien: 'Appartement', nature: 'Appartement',
        caracteristiques: [], adresseComplete: `${x.cle} rue des Tests, 75000 PARIS`, parties: [], recommande: false,
        motif: 'un des biens du propriétaire', cas: 'b', certitude: 'a_trancher', dejaRattache: false,
      }));
      return new Response(JSON.stringify({ etat: 'ok', contexte: { biens, examen: { issue: 'a_trancher', motif: '' }, proprietaire: null, interneDabord: false, disponible: true } }));
    }
    if (url.includes('/gestion/biens?q=')) {
      // Le moteur de RECHERCHE de la modale (chercherBiens) : les biens dont l'e-mail cherché est celui d'une partie.
      const q2 = decodeURIComponent(/q=([^&]*)/.exec(url)?.[1] ?? '');
      const lignes = (BIENS[q2] ?? []).map((x) => ({ cle: x.cle, lotId: x.lotId, libelle: x.libelle, adresse: `${x.cle} rue des Tests, 75000 PARIS`,
        adresseVoie: `${x.cle} rue des Tests`, commune: 'PARIS', nature: 'Appartement', typeBien: 'Type 2', parties: [],
        raisons: [{ sorte: 'email_proprietaire', detail: x.nom ?? '' }] }));
      return new Response(JSON.stringify({ etat: 'ok', lignes, tronque: false, disponible: true }));
    }
    const m = /\/biens\/(\d+)\/ecrire/.exec(url);
    if (m) return new Response(JSON.stringify({ etat: 'ok', cible: { cle: m[1], libelle: `${m[1]} rue des Tests, 75000 PARIS — lot ${m[1]}` }, groupes: listeDu(Number(m[1])) }));
    return new Response(JSON.stringify({ ok: true, correspondants: [] }));
  }));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const laisser = async () => { for (let i = 0; i < 3; i++) { await act(async () => { vi.advanceTimersByTime(300); }); await calmer(); } };
const NOUVEAU = { id: null, voie: 'nouveau', a: [], cc: [], cci: [], objet: '', corps: '\n\nService Gestion', citation: null,
  destinatairesApproximatifs: false, filId: null, repondALeMessageId: null } as unknown as BrouillonEcran;
const monter = async (b: BrouillonEcran, lotFiche: number | null = null) => {
  courant = b;
  const rendre = () => root.render(createElement(Redaction, {
    brouillon: courant, contexte: CONTEXTE, lotFiche,
    onChange: (n: BrouillonEcran) => { courant = n; rendre(); },
    onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {},
  } as never));
  await act(async () => { rendre(); });
  await laisser();
};
const ligne = (l: string) => container.querySelector(`[data-champ="${l}"]`) as HTMLElement;
const saisie = (l: string) => ligne(l).querySelector('input.red-saisie') as HTMLInputElement;
const taper = async (adresse: string, champ = 'À') => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(saisie(champ), adresse);
    saisie(champ).dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { saisie(champ).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
  await laisser();
};
const cliquer = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    (el as HTMLElement).click();
  });
  await laisser();
};
const puce = (a: string) => [...container.querySelectorAll('.red-pastille')].find((p) => p.querySelector(`button[aria-label="Retirer ${a}"]`)) as HTMLElement | undefined;
const cibles = () => ((courant.cibles ?? []) as Array<{ cle: string | null; id: number | null }>).map((c) => c.cle);
/** 🔴 LOT RATTACHER-LIGNE-SUPPRIMEE-BOUTON-PULSE — on choisit DANS LA MODALE, la seule porte : ouvrir par le bouton du
 *  bas, cocher / décocher le bien (par son adresse), valider. */
const boutonRattacher = () => container.querySelector('.ccl-case--rouge, .ccl-case--verte') as HTMLButtonElement;
const ouvrirModale = async () => { await cliquer(boutonRattacher()); };
const basculerDansLaModale = async (...cles: string[]) => {
  await ouvrirModale();
  for (const c of cles) {
    const li = [...container.querySelectorAll('.rec-bien')].find((l) => (l.textContent ?? '').includes(`${c} rue des Tests`));
    expect(li, `bien ${c} dans la modale`).toBeDefined();
    await cliquer(li?.querySelector('input') as Element);
  }
  await cliquer([...container.querySelectorAll('button')].find((b) => /^Valider/.test(b.textContent?.trim() ?? '')) as Element);
};
const pulse = () => container.querySelector('.ccl-case--pulse');
/** LOT BOUTON-RATTACHER-TAILLE-ORIGINE — le sous-titre du bouton qui pulse, et son info-bulle (qui attend). */
const mention = () => container.querySelector('.ccl-case--pulse .ccl-case-detail--une-ligne')?.textContent ?? null;
const infobulle = () => container.querySelector('.ccl-case--pulse')?.getAttribute('title') ?? null;
const titresListe = async (champ = 'À') => {
  await cliquer(saisie(champ));
  const t = [...ligne(champ).querySelectorAll('.red-sugg-titre, .red-sugg-sous-titre')].map((x) => `${x.className.includes('sous') ? '  ' : ''}${x.textContent}`);
  await cliquer(container.querySelector('#red-corps-label') as Element);
  return t;
};

describe('a. client lié à UN SEUL bien (locataire)', () => {
  it('🔴 le bien devient le contexte d’office ; trame pleine ; suggestions de ce bien au clic', async () => {
    await monter(NOUVEAU);
    await taper('un.bien@x.fr');
    expect(cibles()).toEqual(['501']);
    expect(puce('un.bien@x.fr')?.className).toBe('red-pastille red-pastille--famille red-pastille--locataire');
    expect(container.querySelector('.red-rattacher-clients')).toBeNull();          // rien à choisir
    expect(await titresListe()).toEqual(['Clients de l’agence', 'Immeuble']);
  });
  it('retirer l’adresse retire le bien qu’elle avait amené', async () => {
    await monter(NOUVEAU);
    await taper('un.bien@x.fr');
    await cliquer(container.querySelector('button[aria-label="Retirer un.bien@x.fr"]') as Element);
    expect(cibles()).toEqual([]);
  });
  it('décoché ailleurs (« Classer ce mail ») : il ne revient pas d’office', async () => {
    await monter(NOUVEAU);
    await taper('un.bien@x.fr');
    await act(async () => { courant = { ...courant, cibles: [] }; root.render(createElement(Redaction, {
      brouillon: courant, contexte: CONTEXTE, lotFiche: null, onChange: (n: BrouillonEcran) => { courant = n; },
      onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {} } as never)); });
    await laisser();
    expect(cibles()).toEqual([]);
  });
});

describe('b. client lié à PLUSIEURS biens (propriétaire)', () => {
  it('🔴 contour plein, info-bulle « lié à 3 biens », le bouton PULSE, aucune suggestion de bien ; la modale propose les 3', async () => {
    await monter(NOUVEAU);
    await taper('trois.biens@x.fr');
    expect(puce('trois.biens@x.fr')?.className).toBe('red-pastille red-pastille--famille red-pastille--proprietaire red-pastille--a-choisir');
    expect(puce('trois.biens@x.fr')?.title).toBe('DUPONT Jean · Propriétaire — lié à 3 biens, aucun rattaché — choisissez avec « Rattacher » — trois.biens@x.fr');
    expect(pulse()).toBe(boutonRattacher());
    expect(mention()).toBe('3 propositions en attente');
    expect(infobulle()).toBe('Biens à choisir pour Jean DUPONT (3) — cliquer pour choisir');
    expect(cibles()).toEqual([]);
    expect(await titresListe()).toEqual([]);
    await ouvrirModale();
    expect([...container.querySelectorAll('.rec-bien')].map((l) => (/(\d+) rue des Tests/.exec(l.textContent ?? '') ?? [])[1]))
      .toEqual(['601', '602', '603']);
  });
  it('🔴 cocher 1 bien : trame pleine, cible, suggestions de ce bien ; cocher un 2e : intertitre par bien', async () => {
    await monter(NOUVEAU);
    await taper('trois.biens@x.fr');
    await basculerDansLaModale('602');
    expect(cibles()).toEqual(['602']);
    expect(puce('trois.biens@x.fr')?.className).toBe('red-pastille red-pastille--famille red-pastille--proprietaire');
    expect(await titresListe()).toEqual(['Clients de l’agence', 'Immeuble']);
    await basculerDansLaModale('603');
    expect(cibles()).toEqual(['602', '603']);
    expect(await titresListe()).toEqual([
      'Clients de l’agence', '  602 rue des Tests, 75000 PARIS — lot 602', '  603 rue des Tests, 75000 PARIS — lot 603',
      'Immeuble', '  602 rue des Tests, 75000 PARIS — lot 602', '  603 rue des Tests, 75000 PARIS — lot 603']);
  });
  it('décocher : le bien sort du contexte ; plus aucun coché ⇒ contour', async () => {
    await monter(NOUVEAU);
    await taper('trois.biens@x.fr');
    await basculerDansLaModale('601');
    await basculerDansLaModale('601');
    expect(cibles()).toEqual([]);
    expect(puce('trois.biens@x.fr')?.className).toContain('red-pastille--a-choisir');
  });
});

describe('un client sous DEUX familles (locataire d’un bien, propriétaire d’un autre)', () => {
  it('rien de coché : couleur propriétaire ; locataire coché : vert, trame pleine', async () => {
    await monter(NOUVEAU);
    await taper('deux.familles@x.fr');
    expect(puce('deux.familles@x.fr')?.className).toBe('red-pastille red-pastille--famille red-pastille--proprietaire red-pastille--a-choisir');
    await basculerDansLaModale('701');
    expect(puce('deux.familles@x.fr')?.className).toBe('red-pastille red-pastille--famille red-pastille--locataire');
  });
});

describe('ce qui ne change pas', () => {
  it('une adresse INCONNUE reste en pointillé, sans bien ni ligne', async () => {
    await monter(NOUVEAU);
    await taper('exterieur@ailleurs.fr');
    expect(puce('exterieur@ailleurs.fr')?.className).toBe('red-pastille red-pastille--inconnue');
    expect(cibles()).toEqual([]);
    expect(pulse()).toBeNull();
  });
  it('🔴 depuis une FICHE BIEN : rien d’office (le bien de la fiche reste le contexte), mais on peut cocher les biens d’un client', async () => {
    await monter({ ...NOUVEAU, voie: 'repondre', a: [], filId: 10, repondALeMessageId: 77, objet: 'Re: X',
      cibles: [{ sorte: 'lot', cle: '219', id: null, libelle: 'lot 219' }] } as unknown as BrouillonEcran, 176);
    await taper('un.bien@x.fr');
    expect(cibles()).toEqual(['219']);
    await taper('trois.biens@x.fr');
    expect(pulse()).not.toBeNull();                                  // la case verte du bien de la fiche pulse
    await basculerDansLaModale('601');
    expect(cibles()).toEqual(['219', '601']);
  });
  it('un mail classé « Interne » : aucun bien d’office', async () => {
    await monter({ ...NOUVEAU, interne: true } as BrouillonEcran);
    await taper('un.bien@x.fr');
    expect(cibles()).toEqual([]);
  });
});

describe('🔴 à l’envoi, les biens du contexte partent avec le mail (la porte des biens cochés)', () => {
  it('le POST /envois porte les cibles : le bien d’office et le bien coché', async () => {
    await monter({ ...NOUVEAU, objet: 'Essai' } as BrouillonEcran);
    await taper('un.bien@x.fr');
    await taper('trois.biens@x.fr');
    await basculerDansLaModale('603');
    const envoyer = [...container.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Envoyer') as HTMLButtonElement;
    expect(envoyer.disabled).toBe(false);
    await act(async () => { envoyer.click(); });
    await act(async () => { vi.advanceTimersByTime(8000); });
    await calmer();
    const envoi = appels.find((x) => x.url.includes('/envois') && x.methode === 'POST');
    expect(envoi, 'POST /envois').toBeDefined();
    const corps = JSON.parse(String(envoi?.corps)) as { cibles: Array<{ sorte: string; cle: string; id: number }> };
    expect(corps.cibles.map((c) => [c.sorte, c.cle, c.id])).toEqual([['lot', '501', 501], ['lot', '603', 603]]);
  });
});

describe('🔴🔴 LOT RATTACHEMENT-BIENS-SUIT-LES-ADRESSES — le scénario d’Arno, exactement', () => {
  const retirer = async (a: string) => { await cliquer(container.querySelector(`button[aria-label="Retirer ${a}"]`) as Element); };
  /** Le texte VISIBLE du bloc « Classer ce mail » (sans les feuilles de style). */
  const texteClasser = () => [...container.querySelectorAll('[class^="ccl"], [class*=" ccl"]')]
    .map((e) => e.textContent ?? '').join(' ').replace(/\s+/g, ' ');
  it('🔴 multipropriétaire, 1 bien coché, adresse retirée, propriétaire à 1 bien ajouté : « 1 logement », SEULEMENT le sien', async () => {
    await monter(NOUVEAU);
    await taper('multi@x.fr');
    await basculerDansLaModale('432');                                // 1bis rue Manessier, lot 432
    expect(cibles()).toEqual(['432']);
    await retirer('multi@x.fr');
    expect(cibles()).toEqual([]);                                     // le bien part AVEC l'adresse
    await taper('seul@x.fr');
    expect(cibles()).toEqual(['900']);
    expect(texteClasser()).toMatch(/Rattaché\s*—?\s*1 logement(?!s)/);
    expect(texteClasser()).not.toContain('432');
  });
  it('remettre l’adresse : bien unique ⇒ d’office ; plusieurs biens ⇒ à choisir de nouveau (rien de coché d’avance)', async () => {
    await monter(NOUVEAU);
    await taper('seul@x.fr');
    await retirer('seul@x.fr');
    expect(cibles()).toEqual([]);
    await taper('seul@x.fr');
    expect(cibles()).toEqual(['900']);
    await taper('multi@x.fr');
    await basculerDansLaModale('433');
    await retirer('multi@x.fr');
    await taper('multi@x.fr');
    expect(cibles()).toEqual(['900']);
    expect(mention()).toBe('2 propositions en attente');               // à choisir de nouveau : rien de coché d'avance
  });
  it('deux clients du MÊME bien : retirer l’un garde le bien ; retirer le second le retire', async () => {
    await monter(NOUVEAU);
    await taper('loc1@x.fr');
    await taper('loc2@x.fr');
    expect(cibles()).toEqual(['950']);
    await retirer('loc1@x.fr');
    expect(cibles()).toEqual(['950']);
    await retirer('loc2@x.fr');
    expect(cibles()).toEqual([]);
  });
  it('un bien d’office DÉCOCHÉ à la main ne revient pas tant que son client reste', async () => {
    await monter(NOUVEAU);
    await taper('seul@x.fr');
    await act(async () => { courant = { ...courant, cibles: [] }; root.render(createElement(Redaction, {
      brouillon: courant, contexte: CONTEXTE, lotFiche: null, onChange: (n: BrouillonEcran) => { courant = n; },
      onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {} } as never)); });
    await laisser();
    expect(cibles()).toEqual([]);
  });
  it('🔴 un bien AJOUTÉ À LA MAIN (moteur de recherche) sans client : il reste, et l’envoi demande confirmation', async () => {
    await monter({ ...NOUVEAU, objet: 'Devis', cibles: [] } as BrouillonEcran);
    await taper('artisan@ailleurs.fr');
    // Ce que la modale rend après une recherche : un bien sans origine, marqué au passage par le composeur.
    const rendre = (b: BrouillonEcran) => root.render(createElement(Redaction, {
      brouillon: b, contexte: CONTEXTE, lotFiche: null, onChange: (n: BrouillonEcran) => { courant = n; rendre(n); },
      onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {} } as never));
    const { marquerOrigines } = await import('../../../../lib/gestion/contexteClients');
    await act(async () => { courant = { ...courant, cibles: marquerOrigines([], [{ sorte: 'lot', cle: '432', id: 432, libelle: '1bis rue Manessier, 92130 ISSY — lot 432' }],
      courant.a, { 'artisan@ailleurs.fr': [] }) } as BrouillonEcran; rendre(courant); });
    await laisser();
    expect(cibles()).toEqual(['432']);                                // il reste (motif c : un mail à un artisan)
    const envoyer = () => [...container.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Envoyer') as HTMLButtonElement;
    await act(async () => { envoyer().click(); });
    await calmer();
    const alerte = container.querySelector('.red-avertit-manuel');
    expect(alerte?.textContent).toContain('Ce mail sera rattaché à 1bis rue Manessier, 92130 ISSY — lot 432 alors qu’aucun propriétaire ni locataire de ce bien n’est destinataire. Confirmer ?');
    expect(appels.some((x) => x.url.includes('/envois'))).toBe(false);    // rien n'est parti
    // « Retirer ce bien » le sort ; on le remet, puis « Envoyer quand même » le confirme et envoie.
    await cliquer([...container.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Retirer ce bien') as Element);
    expect(cibles()).toEqual([]);
    await act(async () => { courant = { ...courant, cibles: [{ sorte: 'lot', cle: '432', id: 432, libelle: '1bis rue Manessier — lot 432', origine: 'manuel' }] } as BrouillonEcran; rendre(courant); });
    await laisser();
    await act(async () => { envoyer().click(); });
    await calmer();
    await cliquer([...container.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Envoyer quand même') as Element);
    await act(async () => { vi.advanceTimersByTime(8000); });
    await calmer();
    const envoi = appels.find((x) => x.url.includes('/envois') && x.methode === 'POST');
    expect(JSON.parse(String(envoi?.corps)).cibles).toEqual([
      { sorte: 'lot', cle: '432', id: 432, libelle: '1bis rue Manessier — lot 432', origine: 'manuel', manuelConfirme: true }]);
  });
  it('🔴 depuis une fiche bien : le bien de la fiche reste, même sans aucun de ses clients destinataire', async () => {
    await monter({ ...NOUVEAU, voie: 'repondre', a: [], filId: 10, repondALeMessageId: 77, objet: 'Re: X',
      cibles: [{ sorte: 'lot', cle: '219', id: null, libelle: 'lot 219' }] } as unknown as BrouillonEcran, 176);
    await taper('seul@x.fr');
    await retirer('seul@x.fr');
    expect(cibles()).toEqual(['219']);
    expect(texteClasser()).toMatch(/Rattaché/);
  });
});

describe('🔴🔴 LOT RATTACHER-LIGNE-SUPPRIMEE-BOUTON-PULSE — le bouton pulse tant que des biens attendent un choix', () => {
  const retirer = async (a: string) => { await cliquer(container.querySelector(`button[aria-label="Retirer ${a}"]`) as Element); };
  it('🔴 la ligne « Rattacher ce mail à : » n’existe plus, dans aucun composeur (nouveau, réponse, fiche bien)', async () => {
    for (const [b, lot] of [[NOUVEAU, null], [{ ...NOUVEAU, voie: 'repondre', filId: 10, repondALeMessageId: 77, objet: 'Re: X' }, null],
      [{ ...NOUVEAU, voie: 'repondre', filId: 10, repondALeMessageId: 77, objet: 'Re: X', cibles: [{ sorte: 'lot', cle: '219', id: null, libelle: 'lot 219' }] }, 176]] as const) {
      await monter(b as unknown as BrouillonEcran, lot);
      await taper('trois.biens@x.fr');
      expect(container.querySelector('.red-rattacher-clients')).toBeNull();
      expect([...container.querySelectorAll('section.red > *:not(style)')].map((e) => e.textContent).join(' ')).not.toContain('Rattacher ce mail à :');
    }
  });
  it('ouvrir la modale arrête la pulsation (et elle ne reprend pas à la fermeture pour le même client)', async () => {
    await monter(NOUVEAU);
    await taper('trois.biens@x.fr');
    expect(pulse()).not.toBeNull();
    await ouvrirModale();
    expect(pulse()).toBeNull();
    await cliquer(container.querySelector('.rdf--brouillon .rdf-croix') as Element);
    expect(container.querySelector('.rdf--brouillon .rdf-croix')).toBeNull();          // la modale est fermée
    expect(pulse()).toBeNull();
  });
  it('un bien coché : la pulsation s’arrête et la puce passe en trame pleine', async () => {
    await monter(NOUVEAU);
    await taper('trois.biens@x.fr');
    await basculerDansLaModale('602');
    expect(pulse()).toBeNull();
    expect(puce('trois.biens@x.fr')?.className).toBe('red-pastille red-pastille--famille red-pastille--proprietaire');
  });
  it('adresse retirée : la pulsation s’arrête ; une NOUVELLE adresse multi-biens : elle reprend', async () => {
    await monter(NOUVEAU);
    await taper('trois.biens@x.fr');
    await retirer('trois.biens@x.fr');
    expect(pulse()).toBeNull();
    await taper('deux.familles@x.fr');
    expect(pulse()).not.toBeNull();
    expect(mention()).toBe('2 propositions en attente');
    expect(infobulle()).toBe('Biens à choisir pour Paul MARTIN (2) — cliquer pour choisir');
    await ouvrirModale();
    await cliquer(container.querySelector('.rdf--brouillon .rdf-croix') as Element);
    expect(pulse()).toBeNull();                                       // vu à la modale : il n'attend plus
    await taper('multi@x.fr');                                       // un nouveau client en attente : elle reprend
    expect(pulse()).not.toBeNull();
    expect(mention()).toBe('4 propositions en attente');              // plusieurs clients : le total
  });
  it('client à UN seul bien : aucune pulsation', async () => {
    await monter(NOUVEAU);
    await taper('un.bien@x.fr');
    expect(pulse()).toBeNull();
    expect(mention()).toBeNull();
  });
});

describe('🔴🔴 LOT RATTACHEMENT-VALIDER-TOUS-PERD-DES-BIENS — le scénario d’Arno, de bout en bout dans le composeur', () => {
  const texteClasser = () => [...container.querySelectorAll('[class^="ccl"], [class*=" ccl"]')]
    .map((e) => e.textContent ?? '').join(' ').replace(/\s+/g, ' ');
  const caseDe = (rue: string) => [...container.querySelectorAll('.rec input[type="checkbox"]')]
    .find((i) => (i.closest('li, label')?.textContent ?? '').includes(rue)) as HTMLInputElement;
  const bouton = (re: RegExp) => [...container.querySelectorAll('button')].find((b) => re.test(b.textContent?.trim() ?? '')) as HTMLButtonElement;
  const origines = () => ((courant.cibles ?? []) as Array<{ cle: string; origine?: string }>).map((c) => `${c.cle}:${c.origine ?? 'base'}`).sort();
  it('🔴 1 bien coché à la main, « Sélectionner tous », Valider : 6 biens, origine client ; « Rattaché — 6 logements » ; modale rouverte : 6 cochés', async () => {
    await monter(NOUVEAU);
    await taper('c.jullien@sansvisavis.com');
    await ouvrirModale();
    /* LOT PUCE-COHERENTE-AVEC-RATTACHEMENT-TOUTES-FAMILLES — les biens en attente sont DANS les propositions, décochés,
       avec leur motif : la recherche n'est plus lancée sur l'adresse du client. */
    expect((container.querySelector('.rec input[type="search"], .rec input[type="text"]') as HTMLInputElement).value).toBe('');
    expect([...container.querySelectorAll('.rec-motif')].filter((m) => /^propriétaire de ce bien/.test(m.textContent ?? ''))).toHaveLength(6);
    expect([...container.querySelectorAll('.rec input[type="checkbox"]')].filter((i) => (i as HTMLInputElement).checked)).toHaveLength(0);
    await cliquer(caseDe('432 rue des Tests'));
    await cliquer(bouton(/^Sélectionner tous les biens$/));
    expect(bouton(/^Valider/).textContent).toBe('Valider — 6 bien(s)');
    await cliquer(bouton(/^Valider/));
    expect(origines()).toEqual(['219:client', '224:client', '373:client', '432:client', '494:client', '58:client']);
    expect(texteClasser()).toMatch(/Rattaché\s*—?\s*6 logements/);
    await ouvrirModale();
    expect([...container.querySelectorAll('.rec input[type="checkbox"]')].filter((i) => (i as HTMLInputElement).checked)).toHaveLength(6);
  });
  it('retirer l’adresse : SEULS les biens de cette adresse partent (le bien d’un autre client reste)', async () => {
    await monter(NOUVEAU);
    await taper('seul@x.fr');
    await taper('c.jullien@sansvisavis.com');
    await ouvrirModale();
    await cliquer(bouton(/^Sélectionner tous les biens$/));
    await cliquer(bouton(/^Valider/));
    expect(cibles().sort()).toEqual(['219', '224', '373', '432', '494', '58', '900']);
    await cliquer(container.querySelector('button[aria-label="Retirer c.jullien@sansvisavis.com"]') as Element);
    expect(cibles()).toEqual(['900']);
  });
});

describe('🔴🔴 LOT MODALE-PROPOSITIONS-TOUJOURS-VISIBLES — la modale montre TOUS les biens des adresses présentes', () => {
  const JULLIEN = ['432', '494', '373', '219', '224', '58'];
  const cartes = () => [...container.querySelectorAll('.rec-biens .rec-bien')].filter((l) => l.querySelector('input[type="checkbox"]'));
  const cleDe = (li: Element) => /(\d+) rue des Tests/.exec(li.textContent ?? '')?.[1] ?? '?';
  const cochees = () => cartes().filter((l) => (l.querySelector('input') as HTMLInputElement).checked).map(cleDe);
  const compteur = () => container.querySelector('.rec-compte')?.textContent ?? '';
  const bouton = (re: RegExp) => [...container.querySelectorAll('button')].find((b) => re.test(b.textContent?.trim() ?? '')) as HTMLButtonElement;
  const texteClasser = () => [...container.querySelectorAll('[class^="ccl"], [class*=" ccl"]')].map((e) => e.textContent ?? '').join(' ').replace(/\s+/g, ' ');
  const cocher = async (cle: string) => { await cliquer(cartes().find((l) => cleDe(l) === cle)?.querySelector('input') as Element); };
  const retirer = async (a: string) => { await cliquer(container.querySelector(`button[aria-label="Retirer ${a}"]`) as Element); };
  const choisirEtValider = async (...cles: string[]) => {
    await ouvrirModale();
    for (const c of cles) await cocher(c);
    await cliquer(bouton(/^Valider/));
  };

  it('🔴 le scénario d’Arno : 1 bien choisi et validé, la modale rouverte montre les 6, 1 coché EN TÊTE', async () => {
    await monter(NOUVEAU);
    await taper('c.jullien@sansvisavis.com');
    await choisirEtValider('373');
    expect(cibles()).toEqual(['373']);
    await ouvrirModale();
    expect(cartes().map(cleDe)).toEqual(['373', '432', '494', '219', '224', '58']);
    expect(cochees()).toEqual(['373']);
    expect(compteur()).toBe('1 bien(s) coché(s) sur 6 affiché(s).');
    expect(cartes()[0].querySelector('.rec-motif')?.textContent).toBe('déjà rattaché — décochez pour le retirer');
    expect(cartes()[1].querySelector('.rec-motif')?.textContent).toBe('propriétaire de ce bien — Cédric JULLIEN - GARRIDO');
  });
  it('cocher un 2e bien et valider : « Rattaché — 2 logements »', async () => {
    await monter(NOUVEAU);
    await taper('c.jullien@sansvisavis.com');
    await choisirEtValider('373');
    await choisirEtValider('432');
    expect(cibles().sort()).toEqual(['373', '432']);
    expect(texteClasser()).toMatch(/Rattaché\s*—?\s*2 logements/);
  });
  it('« Sélectionner tous » puis « Désélectionner tous » portent sur toute la liste', async () => {
    await monter(NOUVEAU);
    await taper('c.jullien@sansvisavis.com');
    await choisirEtValider('373');
    await ouvrirModale();
    await cliquer(bouton(/^Sélectionner tous les biens$/));
    expect(cochees().sort()).toEqual([...JULLIEN].sort());
    expect(compteur()).toBe('6 bien(s) coché(s) sur 6 affiché(s).');
    await cliquer(bouton(/^Désélectionner tous les biens$/));
    expect(cochees()).toEqual([]);
    await cliquer(bouton(/^Sélectionner tous les biens$/));
    await cliquer(bouton(/^Valider/));
    expect(cibles().sort()).toEqual([...JULLIEN].sort());
  });
  it('pas de doublon avec la recherche : les mêmes biens trouvés par la recherche ne s’ajoutent pas au compte', async () => {
    await monter(NOUVEAU);
    await taper('c.jullien@sansvisavis.com');
    await ouvrirModale();
    const champ = container.querySelector('.rec input[type="search"], .rec input[type="text"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(champ, 'c.jullien@sansvisavis.com');
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await laisser();
    expect(cartes().map(cleDe)).toHaveLength(6);
    expect(compteur()).toBe('0 bien(s) coché(s) sur 6 affiché(s).');
    await cocher('494');
    await cliquer(bouton(/^Valider/));
    expect(cibles()).toEqual(['494']);
  });
  it('adresse retirée : ses biens quittent le rattachement ET la liste', async () => {
    await monter(NOUVEAU);
    await taper('seul@x.fr');
    await taper('c.jullien@sansvisavis.com');
    await choisirEtValider('373', '432');
    expect(cibles().sort()).toEqual(['373', '432', '900']);
    await retirer('c.jullien@sansvisavis.com');
    expect(cibles()).toEqual(['900']);
    await ouvrirModale();
    expect(cartes().map(cleDe)).toEqual(['900']);
  });
  it('plusieurs destinataires : cochés en tête, puis les autres regroupés par adresse (ordre des champs)', async () => {
    await monter(NOUVEAU);
    await taper('multi@x.fr');
    await taper('c.jullien@sansvisavis.com');
    await choisirEtValider('224');
    await ouvrirModale();
    // multi@x.fr est aussi proposé par le moteur ; c.jullien ne l'est que par ses biens.
    expect(cartes().map(cleDe)).toEqual(['224', '432', '433', '494', '373', '219', '58']);
    expect(cochees()).toEqual(['224']);
    expect(compteur()).toBe('1 bien(s) coché(s) sur 7 affiché(s).');
  });
});
