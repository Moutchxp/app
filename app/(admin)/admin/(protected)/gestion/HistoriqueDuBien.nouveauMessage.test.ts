// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import { preparerBrouillon } from '../../../../lib/gestion/redaction';
import { brouillonNouveauDepuisLeBien } from '../../../../lib/gestion/nouveauMessageBien';
import { rangerSuggestions, type SuggestionAdresse } from '../../../../lib/gestion/suggestionsBien';

/**
 * ══ 🔴🔴 LOT BOUTON-NOUVEAU-MESSAGE-DANS-L-HISTORIQUE-DU-BIEN — LE BOUTON, ET LE VRAI COMPOSITEUR ══════════════════════
 * ARNO (13/10/2026) : « Un bouton “Nouveau message” en haut de la liste des mails de la fiche historique […] Le clic
 * ouvre LE MÊME compositeur que “Nouveau message”, avec TOUTES ses fonctions, mais déjà rattaché au bien de la fiche. »
 * 🔒 Données inventées, `fetch` simulé, aucun envoi, aucune écriture.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HDB = readFileSync('app/(admin)/admin/(protected)/gestion/HistoriqueDuBien.tsx', 'utf8');
const BOITE = readFileSync('app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx', 'utf8');
/** Le code sans ses commentaires : une phrase d'explication ne prouve rien. */
const vif = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\s*\}/g, '').split('\n')
  .map((x) => x.replace(/^\s*\/\/.*$/, '')).join('\n');

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false, classementDisponible: true,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test', delaiAnnulationS: 5,
} as ContexteRedactionEcran;
const l = (adresse: string, o: Partial<SuggestionAdresse>): SuggestionAdresse => ({
  adresse, nom: null, role: 'r', ton: 'neutre', propre: true, civilite: null, nomFamille: null, ...o,
});
const GROUPES = rangerSuggestions({
  clients: [
    l('jean@x.fr', { nom: 'DUPONT Jean', role: 'Propriétaire', ton: 'proprietaire', civilite: 'M.', nomFamille: 'DUPONT' }),
    l('lea@x.fr', { nom: 'ROI Léa', role: 'Locataire', ton: 'locataire', civilite: 'Mme', nomFamille: 'ROI' }),
  ],
  immeuble: [l('gardien@x.fr', { nom: 'Rose', role: 'Gardien', ton: 'immeuble' })],
  autres: [l('vu@y.fr', { role: 'vue dans 1 mail du bien' })],
});
const CIBLE = { cle: '343', id: 77, libelle: '54 avenue Inventée, VILLE — lot 343', categorie: 'logement' };

let container: HTMLDivElement;
let root: Root;
let courant: BrouillonEcran;
let appels: string[];
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: { method?: string }) => {
    const url = String(u);
    appels.push(`${init?.method ?? 'GET'} ${url}`);
    const q = new URL(`http://x${url}`).searchParams.getAll('a');
    if (url.includes('/biens/77/ecrire')) return new Response(JSON.stringify({ etat: 'ok', cible: CIBLE, groupes: GROUPES, dossierDrive: null }));
    if (url.includes('/adresses/biens')) return new Response(JSON.stringify({ etat: 'ok', biens: Object.fromEntries(q.map((a) => [a, []])) }));
    if (url.includes('/adresses/familles')) return new Response(JSON.stringify({ etat: 'ok', familles: Object.fromEntries(q.map((a) => [a, null])) }));
    if (url.includes('/gestion/classement')) {
      return new Response(JSON.stringify({ etat: 'ok', contexte: { biens: [], examen: { issue: 'a_trancher', motif: '' }, proprietaire: null, interneDabord: false, disponible: true } }));
    }
    return new Response(JSON.stringify({ ok: true, correspondants: [] }));
  }));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const laisser = async () => { for (let i = 0; i < 4; i++) { await act(async () => { vi.advanceTimersByTime(300); }); await calmer(); } };
/** Le compositeur tel que la fiche le monte : le brouillon du bouton, et le bien de la fiche en `lotFiche`. */
const ouvrir = async () => {
  const base: BrouillonEcran = { ...preparerBrouillon('nouveau', null, { adresseGestion: CONTEXTE.adresseGestion, signature: CONTEXTE.signature }), id: null };
  courant = await brouillonNouveauDepuisLeBien(base, { lotId: 77, cle: '343', libelle: 'lot 343' }, { texte: 'Service Gestion' }) as BrouillonEcran;
  const rendre = () => root.render(createElement(Redaction, {
    brouillon: courant, contexte: CONTEXTE, lotFiche: 77,
    onChange: (n: BrouillonEcran) => { courant = n; rendre(); },
    onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {},
  } as never));
  await act(async () => { rendre(); });
  await laisser();
};
const champ = (c: 'À' | 'Cc' | 'Cci') => container.querySelector(`[data-champ="${c}"] input.red-saisie`) as HTMLInputElement | null;
const cliquerDans = async (c: 'À' | 'Cc' | 'Cci') => {
  if (c !== 'À' && champ(c) === null) {
    const b = container.querySelector(`button.red-copie-bouton[data-bascule="${c}"]`) as HTMLElement;
    await act(async () => { b.click(); }); await calmer();
  }
  await act(async () => { const s = champ(c) as HTMLInputElement; s.focus(); s.click(); }); await calmer();
};
const suggestions = () => [...container.querySelectorAll('.red-suggestions--bien .red-suggestion--bien')].map((x) => x.textContent ?? '');
const premiereLigne = () => container.querySelector('.red-corps-riche [contenteditable] p, .red-corps-riche p')?.textContent;

describe('🔴 le compositeur ouvert par le bouton de la fiche', () => {
  it('🔴 le bien de la fiche est pré-rattaché : « Rattaché · 1 logement »', async () => {
    await ouvrir();
    expect((courant.cibles ?? []).filter((c) => c.sorte === 'lot').map((c) => [c.cle, c.id])).toEqual([['343', 77]]);
    expect(container.textContent).toContain('Rattaché');
    expect(container.textContent).toContain('1 logement');
  });
  it('🔴 un clic dans À, Cc ou Cci propose le dossier du bien (clients, immeuble, autres)', async () => {
    await ouvrir();
    for (const c of ['À', 'Cc', 'Cci'] as const) {
      await cliquerDans(c);
      const vues = suggestions();
      for (const a of ['jean@x.fr', 'lea@x.fr', 'gardien@x.fr', 'vu@y.fr']) expect(vues.some((t) => t.includes(a)), `${c} ${a}`).toBe(true);
      await act(async () => { (champ(c) as HTMLInputElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      await calmer();
    }
  });
  it('🔴 la formule d’appel suit le champ À : « Madame, Monsieur » puis « Monsieur DUPONT » au choix du propriétaire', async () => {
    await ouvrir();
    expect(premiereLigne()).toBe('Bonjour Madame, Monsieur,');
    await cliquerDans('À');
    const b = [...container.querySelectorAll('.red-suggestion')].find((x) => x.textContent?.includes('jean@x.fr')) as HTMLElement;
    await act(async () => { b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    await laisser();
    expect(courant.a).toEqual(['jean@x.fr']);
    expect(premiereLigne()).toBe('Bonjour Monsieur DUPONT,');
    expect(courant.appel?.formule).toBe('Bonjour Monsieur DUPONT,');
  });
  it('🔒 ouvrir sans rien toucher n’écrit rien : aucune requête autre que des lectures (hors moteur de classement)', async () => {
    await ouvrir();
    expect(appels.filter((x) => !x.startsWith('GET ') && !x.includes('/gestion/classement'))).toEqual([]);
  });
});

describe('🔴 le bouton dans la fiche : le MÊME compositeur que « Nouveau message »', () => {
  const code = vif(HDB);
  it('le bouton porte les classes du gros bouton rouge de la colonne, et son mot', () => {
    expect(vif(BOITE)).toContain('className="svv-btn svv-btn-primary gst-btn"');
    expect(code).toContain('className="svv-btn svv-btn-primary gst-btn hdb-nouveau"');
    expect(code).toMatch(/hdb-nouveau"[\s\S]{0,300}\{MOT_NOUVEAU_MESSAGE\}/);
  });
  it('il est sur la ligne « N pièces dans cette sélection », à gauche (avant le bouton des pièces et la légende)', () => {
    const ligne = code.indexOf('<div className="hdb-resume-ligne">');
    const bouton = code.indexOf('hdb-nouveau"', ligne);
    expect(ligne).toBeGreaterThan(-1);
    expect(bouton).toBeGreaterThan(ligne);
    expect(bouton).toBeLessThan(code.indexOf('<BasculeResume', ligne));
    expect(bouton).toBeLessThan(code.indexOf('hdb-legende-barres', ligne));
  });
  it('🔴 c’est `Redaction`, monté tel quel, avec le brouillon de `preparerBrouillon(\'nouveau\')` — jamais une copie', () => {
    expect(code).toMatch(/<Redaction brouillon=\{nouveau\} contexte=\{redaction\} lotFiche=\{lotId\}/);
    expect(code).toContain("preparerBrouillon('nouveau', null, { adresseGestion: redaction.adresseGestion, signature: redaction.signature })");
    expect(vif(BOITE)).toContain("preparerBrouillon('nouveau', null, { adresseGestion: redaction.adresseGestion, signature: redaction.signature })");
    expect(code).toContain('brouillonNouveauDepuisLeBien(');
  });
  it('🔴 envoyé : le compositeur se ferme et l’historique se RELIT (le mail arrive en tête sans recharger la page)', () => {
    expect(code).toContain('onEnvoye={() => { setNouveau(null); setRechargement((n) => n + 1); }}');
  });
  it('les mêmes conditions que « Répondre » (droit d’envoi, base à jour), plus le bien de la fiche', () => {
    expect(code).toContain('const peutEcrireNouveau = peutRepondre && lotId !== null;');
    expect(code).toMatch(/\{peutEcrireNouveau && \(\s*<button type="button" className="svv-btn svv-btn-primary gst-btn hdb-nouveau"/);
  });
});
