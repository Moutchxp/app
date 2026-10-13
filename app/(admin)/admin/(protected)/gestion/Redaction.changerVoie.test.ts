// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import { preparerBrouillon, type VoieRedaction } from '../../../../lib/gestion/redaction';
import type { OrigineVoies } from '../../../../lib/gestion/changerVoie';

/**
 * ══ 🔴🔴 LOT REPONDRE-TRANSFERER-SANS-PERTE — LE GARDE-FOU À L'ÉCRAN ════════════════════════════════════════════════
 *
 * Arno : « passer librement entre Répondre / Répondre à tous / Transférer […] SANS JAMAIS perdre ce que j'ai déjà
 * écrit ». Ce fichier monte le VRAI éditeur, y écrit du texte mis en forme, y ajoute une pièce et des destinataires à
 * la main, puis enchaîne Répondre → Répondre à tous → Transférer → Répondre par le sélecteur du composeur (et une fois
 * par le bouton du mail). À chaque étape : le texte est intact (et l'éditeur n'a PAS été remonté), la pièce ajoutée
 * est là, les destinataires manuels sont à leur place, et la part automatique est celle du mode.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: true,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test',
  delaiAnnulationS: 5,
};
const ORIGINE: OrigineVoies = {
  message: {
    messageId: 7, de: 'locataire@exemple.test', objet: 'Fuite salle de bain', corps: 'Il y a une fuite.',
    destA: [{ adresse: 'gestion@exemple.test' }, { adresse: 'proprio@exemple.test' }],
    destCc: [{ adresse: 'syndic@exemple.test' }],
  },
};

let container: HTMLDivElement;
let root: Root;
let posts: { voie: string; a: string[]; cc: string[]; cci: string[]; corps: string }[];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = [];
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, init?: { method?: string; body?: string }) => {
    const url = String(entree);
    if (/\/brouillons$/.test(url) && init?.method === 'POST') posts.push(JSON.parse(String(init.body)));
    const corps = /\/brouillons\/77\/pieces$/.test(url)
      ? { etat: 'ok', pieces: [
        { id: 1, nom: 'Devis plombier.pdf', typeMime: 'application/pdf', taille: 1000, origine: 'ajoutee', cochee: true },
        { id: 2, nom: 'Photo fuite.jpg', typeMime: 'image/jpeg', taille: 2000, origine: 'reprise', cochee: true, pieceId: 9 },
      ] }
      : /\/brouillons$/.test(url) ? { ok: true, brouillon: { id: 77 } } : { ok: true };
    return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };

const TEXTE_HTML = '<p><strong>Bonjour Madame,</strong> le plombier passe jeudi.</p><p>Service Gestion</p>';

/** L'éditeur, tenu par un parent qui garde le brouillon — comme la conversation et la fiche bien. */
const monter = async () => {
  const ne = preparerBrouillon('repondre', ORIGINE.message, CTX());
  let courant: BrouillonEcran = { ...ne, id: 77, origineVoies: ORIGINE, cibles: [], interne: false };
  let poser: (b: BrouillonEcran) => void = () => {};
  let demander: (v: VoieRedaction) => void = () => {};
  function Parent() {
    const [b, setB] = useState<BrouillonEcran>(courant);
    const [d, setD] = useState<{ voie: VoieRedaction; n: number } | null>(null);
    courant = b;
    poser = setB;
    demander = (voie) => setD((x) => ({ voie, n: (x?.n ?? 0) + 1 }));
    return createElement(Redaction, {
      brouillon: b, contexte: CONTEXTE, voieDemandee: d,
      onChange: setB, onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {},
    } as never);
  }
  await act(async () => { root.render(createElement(Parent)); });
  await calmer();
  return {
    b: () => courant,
    /** Ce que font l'éditeur riche et le champ « À » / « Cci » quand on écrit : un `onChange` du brouillon. */
    ecrire: async (p: Partial<BrouillonEcran>) => { await act(async () => { poser({ ...courant, ...p }); }); await calmer(); },
    selecteur: async (mot: string) => {
      const bouton = [...container.querySelectorAll<HTMLButtonElement>('.red-voie')].find((x) => x.textContent === mot);
      if (!bouton) throw new Error(`bouton « ${mot} » absent du sélecteur`);
      await act(async () => { bouton.click(); });
      await calmer();
    },
    /** ON TAPE DANS L'ÉDITEUR, le vrai : son contenu change, et il le remonte par son propre `input`. */
    taper: async (html: string) => {
      const zone = container.querySelector<HTMLElement>('[contenteditable="true"]');
      if (!zone) throw new Error('zone de texte absente');
      await act(async () => { zone.innerHTML = html; zone.dispatchEvent(new Event('input', { bubbles: true })); });
      await calmer();
    },
    boutonDuMail: async (voie: VoieRedaction) => { await act(async () => { demander(voie); }); await calmer(); },
  };
};
function CTX() { return { adresseGestion: CONTEXTE.adresseGestion, signature: CONTEXTE.signature }; }

const nomsDesPieces = () => [...container.querySelectorAll('.pjb-nom')].map((n) => n.textContent);
const zoneTexte = () => container.querySelector('[contenteditable="true"]');

describe('🔴🔴 changer de mode ne perd RIEN de ce qu’on a écrit', () => {
  it('Répondre → Répondre à tous → Transférer → Répondre : texte, pièce et destinataires manuels intacts', async () => {
    const f = await monter();
    await f.taper(TEXTE_HTML);
    await f.ecrire({ a: [...f.b().a, 'artisan@exemple.test'], cci: ['avocat@exemple.test'] });
    const TEXTE = f.b().corps;
    const HTML = f.b().corpsHtml;
    expect(TEXTE).toContain('le plombier passe jeudi');
    expect(HTML).toContain('<strong>Bonjour Madame,</strong>');
    const editeur = zoneTexte();
    expect(editeur?.innerHTML).toContain('<strong>Bonjour Madame,</strong>');
    expect(nomsDesPieces()).toEqual(['Devis plombier.pdf']);

    const verifierIntact = () => {
      expect(f.b().corps).toBe(TEXTE);
      expect(f.b().corpsHtml).toBe(HTML);
      // 🔴 LE MÊME éditeur : un éditeur remonté aurait rechargé son HTML initial, et perdu le curseur et l'annulation.
      expect(zoneTexte()).toBe(editeur);
      expect(zoneTexte()?.innerHTML).toContain('<strong>Bonjour Madame,</strong>');
      expect(f.b().a).toContain('artisan@exemple.test');
      expect(f.b().cci).toEqual(['avocat@exemple.test']);
      expect(nomsDesPieces()).toContain('Devis plombier.pdf');
      expect(f.b().id).toBe(77);
    };

    await f.selecteur('Répondre à tous');
    verifierIntact();
    expect(f.b().voie).toBe('repondre_tous');
    expect(f.b().a).toEqual(['locataire@exemple.test', 'artisan@exemple.test']);
    expect(f.b().cc).toEqual(['proprio@exemple.test', 'syndic@exemple.test']);
    expect(nomsDesPieces()).toEqual(['Devis plombier.pdf']);

    await f.selecteur('Transférer');
    verifierIntact();
    expect(f.b().voie).toBe('transferer');
    expect(f.b().a).toEqual(['artisan@exemple.test']);
    expect(f.b().cc).toEqual([]);
    expect(f.b().objet).toBe('Tr: Fuite salle de bain');
    // En Transférer, la pièce du message d'origine est là, à côté de la nôtre.
    await new Promise((r) => setTimeout(r, 400));
    await calmer();
    expect(nomsDesPieces()).toEqual(['Devis plombier.pdf', 'Photo fuite.jpg']);

    await f.selecteur('Répondre');
    verifierIntact();
    expect(f.b().voie).toBe('repondre');
    expect(f.b().a).toEqual(['locataire@exemple.test', 'artisan@exemple.test']);
    expect(f.b().cc).toEqual([]);
    expect(f.b().objet).toBe('Re: Fuite salle de bain');
    // 🔴 Revenir à Répondre retire ce que le transfert avait ajouté — et seulement cela.
    expect(nomsDesPieces()).toEqual(['Devis plombier.pdf']);

    // Le brouillon automatique a suivi : son dernier enregistrement porte le mode courant, et tout le reste.
    await new Promise((r) => setTimeout(r, 400));
    await calmer();
    const dernier = posts[posts.length - 1];
    expect(dernier.voie).toBe('repondre');
    expect(dernier.corps).toBe(TEXTE);
    expect(dernier.cci).toEqual(['avocat@exemple.test']);
  });

  it('🔴 un bouton du MAIL, composeur ouvert, change le mode du composeur existant au lieu d’en ouvrir un vide', async () => {
    const f = await monter();
    await f.taper(TEXTE_HTML);
    await f.ecrire({ cci: ['avocat@exemple.test'] });
    const TEXTE = f.b().corps;
    const editeur = zoneTexte();
    await f.boutonDuMail('repondre_tous');
    expect(f.b().voie).toBe('repondre_tous');
    expect(f.b().corps).toBe(TEXTE);
    expect(f.b().cci).toEqual(['avocat@exemple.test']);
    expect(zoneTexte()).toBe(editeur);
    // Le sélecteur dit le mode courant (enfoncé), pas seulement par la couleur.
    const actif = container.querySelector('.red-voie[aria-pressed="true"]');
    expect(actif?.textContent).toBe('Répondre à tous');
  });

  it('le sélecteur n’existe pas sur un « Nouveau message »', async () => {
    await act(async () => {
      root.render(createElement(Redaction, {
        brouillon: { ...preparerBrouillon('nouveau', null, CTX()), id: null },
        contexte: CONTEXTE, onChange: () => {}, onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {},
      } as never));
    });
    await calmer();
    expect(container.querySelector('.red-voies')).toBeNull();
  });
});
