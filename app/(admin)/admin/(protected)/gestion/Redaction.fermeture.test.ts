// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';

/**
 * LOT APERCU-PAGE1 + BROUILLONS — OUVRIR L'ÉDITEUR PUIS LE FERMER NE DOIT LAISSER AUCUN BROUILLON.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LE DÉFAUT, ET IL SE VOYAIT EN BASE. Au soir du 28/09/2026, dix brouillons vivaient dans
 * `gestion_brouillon` ; cinq n'avaient NI destinataire, NI objet, NI autre corps que la signature — des fenêtres
 * ouvertes puis refermées, rien de plus.
 *
 * LA RÈGLE EXISTAIT POURTANT (lot BROUILLON-SILENCIEUX) : `fermer` abandonne un brouillon que personne n'a touché.
 * Elle était simplement CONTOURNÉE par le geste le plus naturel — la CROIX de la barre de titre d'une fenêtre
 * flottante, qui fermait la fenêtre elle-même sans jamais passer par l'éditeur. « Garder en brouillon » appliquait
 * la règle, la croix non : deux façons de fermer, deux comportements, et rien ne le disait.
 *
 * ⚠️ CE FICHIER REJOUE LE GESTE, il ne relit pas une intention : il monte le VRAI éditeur et lui adresse la demande
 * de fermeture que la croix envoie désormais. Un test qui se contenterait de chercher `onDemanderFermeture` dans le
 * source prouverait que le mot est écrit, pas que le brouillon disparaît.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test',
  delaiAnnulationS: 5,
};

const NEUF: BrouillonEcran = {
  id: null, voie: 'nouveau', a: [], cc: [], cci: [], objet: '', corps: '\n\nService Gestion',
  citation: null, destinatairesApproximatifs: false, filId: null, repondALeMessageId: null,
};

let container: HTMLDivElement;
let root: Root;
let appels: { url: string; methode: string }[];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, init?: { method?: string }) => {
    const url = String(entree);
    appels.push({ url, methode: init?.method ?? 'GET' });
    // La zone des pièces relit les siennes : deux pièces DÉJÀ LÀ, comme en a un brouillon qu'on rouvre.
    const corps = /\/pieces$/.test(url)
      ? { etat: 'ok', pieces: [
        { id: 1, nom: 'Carte identite.pdf', typeMime: 'application/pdf', taille: 410_000, origine: 'ajoutee' },
        { id: 2, nom: 'Charges 2025.2026.pdf', typeMime: 'application/pdf', taille: 1_400_000, origine: 'ajoutee' },
      ] }
      : { ok: true };
    return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  // L'éditeur riche pose le curseur : jsdom n'a pas de sélection utilisable, et l'absence ne doit rien casser.
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); }); };

/** Monte l'éditeur DANS UNE FENÊTRE, et rend la main pour faire varier la demande de fermeture. */
const monter = async (brouillon: BrouillonEcran, contexte: ContexteRedactionEcran = CONTEXTE) => {
  let ferme = 0;
  let demandes = 0;
  const rendre = () => root.render(createElement(Redaction, {
    dansFenetre: true, fermetureDemandee: demandes, brouillon, contexte,
    onChange: () => {}, onFerme: () => { ferme += 1; }, onEnvoye: () => {}, onGeste: () => {},
  } as never));
  await act(async () => { rendre(); });
  await calmer();
  return {
    croix: async () => { demandes += 1; await act(async () => { rendre(); }); await calmer(); },
    ferme: () => ferme,
  };
};

describe('🔴🔴 la croix d’une fenêtre de rédaction passe par l’éditeur', () => {
  it('🔴 un brouillon JAMAIS ENREGISTRÉ : la croix ferme, et n’écrit rien du tout', async () => {
    const f = await monter(NEUF);
    // Rien n'a été saisi ⇒ l'enregistrement automatique n'a jamais eu lieu : il n'y a même pas de ligne à abandonner.
    expect(appels.filter((a) => a.methode === 'POST')).toHaveLength(0);
    await f.croix();
    expect(f.ferme()).toBe(1);
    expect(appels.filter((a) => a.url.includes('/brouillons'))).toHaveLength(0);
  });

  /**
   * 🔴 LE CAS QUI LAISSAIT LES LIGNES VIDES. Le brouillon EXISTE en base (on a joint une pièce, puis on l'a
   * retirée ; ou l'on a écrit trois mots, puis on les a effacés). Personne ne l'a touché au sens de la règle : la
   * croix doit l'ABANDONNER, comme « Garder en brouillon » le faisait déjà.
   */
  it('🔴🔴 un brouillon enregistré mais resté vide : la croix l’ABANDONNE', async () => {
    const f = await monter({ ...NEUF, id: 4242 });
    await f.croix();
    const abandon = appels.filter((a) => a.methode === 'DELETE' && a.url.includes('id=4242'));
    expect(abandon).toHaveLength(1);
    expect(f.ferme()).toBe(1);
  });

  /**
   * 🔴 ET L'INVERSE, QUI COMPTE AUTANT : un brouillon ROUVERT n'est jamais abandonné pour avoir été REGARDÉ.
   * Il part de ce qu'il contient, donc « rien n'a été touché » est vrai dès la première seconde — sans cette
   * garde, ouvrir un brouillon pour le relire l'effacerait de la liste.
   */
  it('🔴🔴 un brouillon ROUVERT n’est PAS abandonné quand on le referme sans rien changer', async () => {
    const f = await monter({
      ...NEUF, id: 45, repris: true, a: ['quelquun@exemple.test'], corps: '\n\nService Gestion',
    });
    await f.croix();
    expect(appels.filter((a) => a.methode === 'DELETE')).toHaveLength(0);
    expect(f.ferme()).toBe(1);
  });
});

/**
 * ══ CE QUE LE CADRE DOIT FAIRE, ET QU'ON NE PEUT PAS MONTER ICI ════════════════════════════════════════════════
 * La croix vit dans `FenetresRedaction`. On vérifie qu'elle DEMANDE au lieu de fermer — c'est le câblage qui a
 * manqué pendant tout le lot précédent, et il ne se voit pas depuis l'éditeur.
 */
/**
 * ══ 🔴 ROUVRIR N'EST PAS MODIFIER ══════════════════════════════════════════════════════════════════════════════
 *
 * DÉFAUT VU À L'ÉCRAN LE 29/09/2026 : rouvrir le brouillon qui portait quatorze pièces l'a fait REMONTER EN TÊTE
 * DE LISTE — l'enregistrement automatique était reparti et `maj_le` avait été réécrite, pour une simple lecture.
 * La règle « joindre est une saisie » est vraie quand on vient de joindre ; appliquée à des pièces DÉJÀ LÀ, elle
 * déclare touché ce qu'on a seulement ouvert.
 */
describe('🔴 rouvrir un brouillon ne le réécrit pas', () => {
  const AVEC_PIECES: ContexteRedactionEcran = { ...CONTEXTE, piecesDisponibles: true };

  it('🔴🔴 ses propres pièces ne comptent pas comme une saisie : aucun enregistrement', async () => {
    const f = await monter({ ...NEUF, id: 46, repris: true }, AVEC_PIECES);
    // La zone des pièces a bien lu les deux pièces du brouillon : c'est ce comptage qui déclarait « touché ».
    expect(appels.some((a) => /\/pieces$/.test(a.url))).toBe(true);
    await new Promise((r) => setTimeout(r, 1400));
    await calmer();
    expect(appels.filter((a) => a.methode === 'POST' && /\/brouillons$/.test(a.url))).toHaveLength(0);
    await f.croix();
    expect(appels.filter((a) => a.methode === 'DELETE')).toHaveLength(0);
  });

  /** ⚠️ ET LA RÈGLE D'ORIGINE TIENT TOUJOURS : sur un brouillon NEUF, joindre reste une saisie (lot EDITEUR-PJ). */
  it('⚠️ sur un brouillon neuf, joindre reste une saisie', async () => {
    await monter({ ...NEUF, id: 77 }, AVEC_PIECES);
    await new Promise((r) => setTimeout(r, 1400));
    await calmer();
    expect(appels.filter((a) => a.methode === 'POST' && /\/brouillons$/.test(a.url)).length).toBeGreaterThan(0);
  });
});

describe('🔴 le câblage de la croix', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/FenetresRedaction.tsx', 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');

  it('🔴 la croix appelle `onDemanderFermeture`, jamais `onFermer` directement', () => {
    expect(code).toContain('aria-label="Fermer la fenêtre"');
    expect(code).toContain('onClick={() => onDemanderFermeture(f.cle)}');
    expect(code).not.toContain('onClick={() => onFermer(f.cle)}');
  });

  it('🔴 le compteur de fermeture atteint l’éditeur', () => {
    expect(code).toContain('fermetureDemandee={fermetures.get(f.cle) ?? 0}');
  });
});
