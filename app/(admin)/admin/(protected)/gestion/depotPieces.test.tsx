// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { MOT_DEPOT, motDoublon, natureDuCollage, nomDuCollage, sansDoublons, transporteDesFichiers } from '../../../../lib/gestion/depotPieces';
import { useDepotPieces } from './DepotPieces';
import { PiecesBrouillon, type PoigneePieces } from './PiecesBrouillon';

/**
 * 🔴 Arno (23/10/2026) — glisser-déposer et coller des pièces jointes n'importe où sur le bloc d'écriture d'un mail. Les règles
 * (module pur), puis le VRAI `PiecesBrouillon` sous le VRAI crochet `useDepotPieces`, routes simulées : rien n'est écrit ni envoyé.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('🔴 les règles du dépôt et du collage (pur)', () => {
  it('seul un glissement de FICHIERS compte ; du texte ou un lien glissé, rien', () => {
    expect(transporteDesFichiers(['Files'])).toBe(true);
    expect(transporteDesFichiers(['text/plain', 'text/html'])).toBe(false);
    expect(transporteDesFichiers(['text/uri-list'])).toBe(false);
    expect(transporteDesFichiers(undefined)).toBe(false);
  });
  it('collage : capture (aucun HTML), image d’une page (une balise img), fichier du Finder → fichiers ; Word (texte + image) → texte', () => {
    expect(natureDuCollage({ nbFichiers: 1, html: '' })).toBe('fichiers');
    expect(natureDuCollage({ nbFichiers: 1, html: '<meta charset="utf-8"><img src="https://x.test/a.png">' })).toBe('fichiers');
    expect(natureDuCollage({ nbFichiers: 1, html: '<html><head><style>p{}</style></head><body><p>Bonjour Madame,</p></body></html>' })).toBe('texte');
    expect(natureDuCollage({ nbFichiers: 0, html: '' })).toBe('texte');
  });
  it('une capture collée devient « capture-AAAA-MM-JJ-HHMM.png » (heure de Paris) ; un vrai nom est gardé', () => {
    const d = new Date('2026-10-23T19:41:00Z');   // 21:41 à Paris
    expect(nomDuCollage('image.png', 'image/png', d)).toBe('capture-2026-10-23-2141.png');
    expect(nomDuCollage('', 'image/jpeg', d)).toBe('capture-2026-10-23-2141.jpg');
    expect(nomDuCollage('bail Dupont.pdf', 'application/pdf', d)).toBe('bail Dupont.pdf');
    expect(nomDuCollage('Plan cave.png', 'image/png', d)).toBe('Plan cave.png');
  });
  it('pas de doublon : même nom et même taille qu’une pièce jointe, ou que dans le même dépôt', () => {
    const a = { name: 'a.pdf', size: 10 };
    const r = sansDoublons([a, { name: 'a.pdf', size: 10 }, { name: 'a.pdf', size: 11 }, { name: 'b.pdf', size: 5 }], [{ nom: 'b.pdf', taille: 5 }]);
    expect(r.gardes.map((f) => `${f.name}/${f.size}`)).toEqual(['a.pdf/10', 'a.pdf/11']);
    expect(r.doublons.map((f) => f.name)).toEqual(['a.pdf', 'b.pdf']);
    expect(motDoublon('a.pdf')).toBe('« a.pdf » est déjà joint : il n’a pas été ajouté une seconde fois.');
  });
});

/* ══ LE BANC : le crochet sur un bloc (comme `Redaction`), le vrai `PiecesBrouillon` dedans, avec sa poignée ══ */
const json = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let pieces: { id: number; nom: string; taille: number; typeMime: string; origine: string; cochee: boolean; disponible: boolean }[];
let posts: string[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  pieces = []; posts = [];
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/pieces-recentes')) return json({ etat: 'ok', lignes: [], disponible: true });
    if (u.includes('/brouillons/7/pieces') && init?.method === 'POST') {
      const f = (init.body as FormData).get('fichier') as File;
      posts.push(f.name);
      pieces.push({ id: pieces.length + 1, nom: f.name, taille: f.size, typeMime: f.type, origine: 'locale', cochee: true, disponible: true });
      return json({ etat: 'ok' });
    }
    if (u.includes('/brouillons/7/pieces')) return json({ etat: 'ok', pieces });
    return json({ etat: 'ok' });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

function Banc() {
  const poignee = useRef<PoigneePieces | null>(null);
  const depot = useDepotPieces({ actif: true, onFichiers: (f) => poignee.current?.deposer(f) });
  return createElement('section', { className: 'pjd-cible', 'data-bloc': '', ...depot.proprietes },
    depot.calque,
    createElement('input', { id: 'objet' }),
    createElement('div', { id: 'texte', contentEditable: true }),
    createElement(PiecesBrouillon, { brouillonId: 7, poignee, depotExterieur: true }));
}
const attendre = async () => { await act(async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); }); };
const fichier = (nom: string, taille: number, type = 'application/pdf') => new File([new Uint8Array(taille)], nom, { type });
const glisser = async (cible: Element, type: string, d: { types: string[]; files: File[] }) => {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'dataTransfer', { value: { types: d.types, files: d.files, dropEffect: 'none' } });
  await act(async () => { cible.dispatchEvent(ev); });
  await attendre();
  return ev;
};
const coller = async (cible: Element, d: { files: File[]; html?: string; texte?: string }) => {
  const ev = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', {
    value: { files: d.files, getData: (t: string) => (t === 'text/html' ? d.html ?? '' : t === 'text/plain' ? d.texte ?? '' : '') },
  });
  await act(async () => { cible.dispatchEvent(ev); });
  await attendre();
  return ev;
};
const rendre = async () => { await act(async () => { root.render(createElement(Banc)); }); await attendre(); };
const calque = () => document.querySelector('[data-calque-depot]');
const noms = () => [...document.querySelectorAll('.pjb-nom')].map((n) => n.textContent);
const refus = () => document.querySelector('.pjb-refus')?.textContent ?? '';

describe('🔴 glisser-déposer sur tout le bloc', () => {
  it('un fichier glissé sur la zone de texte : calque « Déposer ici pour joindre », puis joint ; le navigateur ne l’ouvre pas', async () => {
    await rendre();
    const texte = document.querySelector('#texte')!;
    const f = [fichier('bail.pdf', 1200)];
    await glisser(texte, 'dragenter', { types: ['Files'], files: f });
    expect(calque()?.textContent).toBe(MOT_DEPOT);
    expect((await glisser(texte, 'dragover', { types: ['Files'], files: f })).defaultPrevented).toBe(true);
    const lacher = await glisser(texte, 'drop', { types: ['Files'], files: f });
    expect(lacher.defaultPrevented).toBe(true);   // ni ouvert, ni inséré comme texte
    expect(calque()).toBeNull();
    expect(posts).toEqual(['bail.pdf']);
    expect(noms()).toEqual(['bail.pdf']);
  });
  it('plusieurs fichiers d’un coup, lâchés sur l’objet : tous joints', async () => {
    await rendre();
    await glisser(document.querySelector('#objet')!, 'drop', { types: ['Files'], files: [fichier('a.pdf', 10), fichier('b.jpg', 20, 'image/jpeg'), fichier('c.docx', 30)] });
    expect(posts).toEqual(['a.pdf', 'b.jpg', 'c.docx']);
  });
  it('la sortie du bloc retire le calque (le passage d’un champ à l’autre ne le fait pas clignoter)', async () => {
    await rendre();
    const bloc = document.querySelector('[data-bloc]')!;
    const objet = document.querySelector('#objet')!;
    await glisser(bloc, 'dragenter', { types: ['Files'], files: [] });
    await glisser(objet, 'dragenter', { types: ['Files'], files: [] });
    await glisser(bloc, 'dragleave', { types: ['Files'], files: [] });
    expect(calque()).not.toBeNull();
    await glisser(objet, 'dragleave', { types: ['Files'], files: [] });
    expect(calque()).toBeNull();
  });
  it('glisser du TEXTE : aucun calque, aucun ajout, le geste natif reste intact', async () => {
    await rendre();
    const texte = document.querySelector('#texte')!;
    await glisser(texte, 'dragenter', { types: ['text/plain'], files: [] });
    expect(calque()).toBeNull();
    expect((await glisser(texte, 'dragover', { types: ['text/plain'], files: [] })).defaultPrevented).toBe(false);
    expect((await glisser(texte, 'drop', { types: ['text/plain'], files: [] })).defaultPrevented).toBe(false);
    expect(posts).toEqual([]);
  });
  it('mêmes règles que « Joindre » : un type refusé ou un total trop lourd est ignoré et DIT, les autres passent', async () => {
    await rendre();
    await glisser(document.querySelector('#texte')!, 'drop', {
      types: ['Files'], files: [fichier('outil.exe', 10), fichier('ok.pdf', 10), fichier('enorme.mov', 26 * 1024 * 1024, 'video/quicktime')],
    });
    expect(posts).toEqual(['ok.pdf']);
    expect(refus()).toContain('« outil.exe » ne peut pas être joint');
    expect(refus()).toContain('« enorme.mov » ferait');
  });
  it('le même fichier déposé deux fois n’est joint qu’une fois, et c’est dit', async () => {
    await rendre();
    const texte = document.querySelector('#texte')!;
    await glisser(texte, 'drop', { types: ['Files'], files: [fichier('bail.pdf', 1200)] });
    await glisser(texte, 'drop', { types: ['Files'], files: [fichier('bail.pdf', 1200)] });
    expect(posts).toEqual(['bail.pdf']);
    expect(refus()).toBe(motDoublon('bail.pdf'));
  });
});

describe('🔴 coller', () => {
  it('une capture d’écran collée devient une pièce « capture-AAAA-MM-JJ-HHMM.png »', async () => {
    await rendre();
    const ev = await coller(document.querySelector('#texte')!, { files: [fichier('image.png', 500, 'image/png')] });
    expect(ev.defaultPrevented).toBe(true);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatch(/^capture-\d{4}-\d{2}-\d{2}-\d{4}\.png$/);
  });
  it('un fichier copié dans le Finder garde son nom', async () => {
    await rendre();
    await coller(document.querySelector('#objet')!, { files: [fichier('devis.pdf', 900)], texte: 'devis.pdf' });
    expect(posts).toEqual(['devis.pdf']);
  });
  it('coller du texte reste un collage de texte (rien n’est joint, rien n’est empêché)', async () => {
    await rendre();
    const ev = await coller(document.querySelector('#texte')!, { files: [], texte: 'Bonjour', html: '<p>Bonjour</p>' });
    expect(ev.defaultPrevented).toBe(false);
    expect(posts).toEqual([]);
  });
  it('du texte copié depuis Word (avec son image de rendu) reste du texte', async () => {
    await rendre();
    await coller(document.querySelector('#texte')!, { files: [fichier('image.png', 500, 'image/png')], html: '<p>Madame, veuillez…</p>' });
    expect(posts).toEqual([]);
  });
});

describe('🔴 partout où l’on écrit un mail : un seul composant, et rien n’est retiré', () => {
  const G = 'app/(admin)/admin/(protected)/gestion';
  it('le bloc d’écriture `Redaction` porte le dépôt, et sa zone de pièces garde le bouton « Joindre »', () => {
    const red = readFileSync(`${G}/Redaction.tsx`, 'utf8');
    expect(red).toContain('aria-label={titre} ref={racine} {...depot.proprietes}>');
    expect(red).toContain('poignee={poigneePieces} depotExterieur');
    expect(readFileSync(`${G}/PiecesBrouillon.tsx`, 'utf8')).toContain("{occupe ? 'Ajout en cours…' : '📎 Joindre un fichier'}");
  });
  it('aucune autre fenêtre d’envoi n’a son propre sélecteur de fichiers : toutes passent par `Redaction`', () => {
    const avecChamp = execSync(`grep -rl 'type="file"' "${G}" --include=*.tsx || true`, { encoding: 'utf8' })
      .split('\n').filter((l) => l !== '' && !l.endsWith('.test.tsx'));
    expect(avecChamp).toEqual([`${G}/PiecesBrouillon.tsx`]);
  });
  it('l’éditeur n’insère pas le collage d’un fichier comme texte', () => {
    expect(readFileSync(`${G}/EditeurRiche.tsx`, 'utf8'))
      .toContain("if (natureDuCollage({ nbFichiers: e.clipboardData.files?.length ?? 0, html }) === 'fichiers') return;");
  });
});
