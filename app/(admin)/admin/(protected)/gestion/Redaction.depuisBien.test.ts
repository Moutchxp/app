// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ══ 🔴🔴 LOT MAIL-DEPUIS-BIEN-MISE-EN-PAGE-OBJET-DRIVE ════════════════════════════════════════════════════════════════
 * ① La fenêtre de rédaction ne déborde plus : sa grille borne la colonne (la mesure dans Chrome est au compte rendu ;
 *    jsdom ne calcule aucune largeur, on éprouve donc la RÈGLE qui la produit).
 * ③ Depuis une fiche bien, le bouton Drive s'ouvre sur le dossier du bien (arbre déplié, dossier en évidence et
 *    sélectionné), en LECTURE SEULE stricte ; sans dossier, la mention grise ; hors fiche bien, rien ne change.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* La fenêtre Drive est remplacée par une doublure qui RETIENT ce qu'on lui passe : c'est le câblage qu'on éprouve ici. */
const recus: Record<string, unknown>[] = [];
vi.mock('./SelecteurFichierDrive', () => ({
  SelecteurFichierDrive: (p: Record<string, unknown>) => { recus.push(p); return null; },
  CSS_SELECTEUR_FICHIER: '',
}));
const { Redaction } = await import('./Redaction');

const CONTEXTE = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: true,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test', delaiAnnulationS: 5,
};
const BASE = {
  id: null, voie: 'nouveau', a: ['x@y.fr'], cc: [], cci: [], objet: 'XXXXXXXX / Cabinet Criterimmo', corps: 'Bonjour,\n\n\n',
  citation: null, destinatairesApproximatifs: false, filId: null, repondALeMessageId: null,
};
const DOSSIER = { id: '1bTVd151JnMnGJoU1RxKtoVgARNkBbP1Q', nom: '25 rue Edith Cavell, 92400 COURBEVOIE — lot 219' };

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  recus.length = 0;
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, correspondants: [], pieces: [] }), { status: 200 })));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const ouvrirLeDrive = async (b: Record<string, unknown>) => {
  await act(async () => {
    root.render(createElement(Redaction as never, {
      dansFenetre: true, brouillon: { ...BASE, ...b }, contexte: CONTEXTE,
      onChange: () => {}, onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {},
    }));
  });
  await act(async () => { (container.querySelector('[aria-label="Insérer un fichier depuis Google Drive"]') as HTMLElement).click(); });
  return recus.at(-1) ?? {};
};

describe('③ le bouton Drive de la rédaction', () => {
  it('🔴 depuis une fiche bien : le dossier du bien, en arborescence, lui-même en évidence — et en LECTURE SEULE', async () => {
    const p = await ouvrirLeDrive({ depuisLeBien: true, dossierDriveBien: DOSSIER });
    expect(p.dossierDepart).toEqual(DOSSIER);
    expect(p.arrivee).toBe('arborescence');
    expect(p.documentEnEvidence).toEqual({ driveFileId: DOSSIER.id });
    expect(p.lectureSeule).toBe(true);
    expect(p.mentionDepart).toBeUndefined();
  });
  it('bien SANS dossier Drive : ouverture habituelle, avec « Aucun dossier Drive associé à ce bien » (et lecture seule)', async () => {
    const p = await ouvrirLeDrive({ depuisLeBien: true, dossierDriveBien: null });
    expect(p.dossierDepart).toBeUndefined();
    expect(p.arrivee).toBeUndefined();
    expect(p.mentionDepart).toBe('Aucun dossier Drive associé à ce bien');
    expect(p.lectureSeule).toBe(true);
  });
  it('hors fiche bien : comportement inchangé (ni dossier de départ, ni lecture seule, ni mention)', async () => {
    const p = await ouvrirLeDrive({});
    for (const k of ['dossierDepart', 'arrivee', 'documentEnEvidence', 'lectureSeule', 'mentionDepart']) expect(p[k], k).toBeUndefined();
  });
  it('l’objet pré-rempli : le curseur au début, « XXXXXXXX » sélectionné ET visible (champ ramené à gauche)', async () => {
    await act(async () => {
      root.render(createElement(Redaction as never, {
        dansFenetre: true, brouillon: { ...BASE, objet: 'XXXXXXXX / Cabinet Criterimmo / résidence 25 rue Edith Cavell, 92400 Courbevoie', selectionObjet: [0, 8] },
        contexte: CONTEXTE, onChange: () => {}, onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {},
      }));
    });
    const objet = container.querySelector('#red-objet') as HTMLInputElement;
    expect([objet.selectionStart, objet.selectionEnd, objet.scrollLeft]).toEqual([0, 8, 0]);
  });
});

const lire = (f: string): string => readFileSync(join(__dirname, f), 'utf8');
const vif = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
  .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');

describe('① la fenêtre de rédaction tient dans son cadre, à toutes les tailles', () => {
  const css = lire('FenetresRedaction.tsx');
  it('🔴 la colonne de la grille est BORNÉE à la largeur de la fenêtre (cause du texte coupé à gauche)', () => {
    expect(css).toContain('grid-template-rows:auto minmax(0,1fr);grid-template-columns:minmax(0,1fr);width:var(--fre-largeur)');
  });
  it('le corps ne déborde jamais en largeur : il défile verticalement, à l’intérieur — et il est le REPÈRE de ses absolus', () => {
    // position:relative : sans lui, le champ caché des pièces jointes rallongeait la FENÊTRE (« De : » sous la barre).
    expect(css).toContain('.fre-corps{position:relative;min-height:0;min-width:0;overflow-y:auto;overflow-x:hidden;');
  });
  it('les longues lignes passent à la ligne, la barre d’outils sur plusieurs rangées, les destinataires aussi', () => {
    expect(lire('EditeurRiche.tsx')).toContain('.edr-zone{padding:8px 2px;overflow-wrap:anywhere;');
    expect(lire('EditeurRiche.tsx')).toContain('.edr-barre{display:flex;flex-wrap:wrap;');
    expect(lire('Redaction.tsx')).toContain('.red-pastilles{display:flex;flex-wrap:wrap;');
  });
});

describe('🔴 DRIVE — LECTURE SEULE STRICTE : le garde-fou codé de la fenêtre Drive', () => {
  const src = lire('SelecteurFichierDrive.tsx');
  const code = vif(src);
  it('TOUTE requête qui modifie le Drive passe par `appelDrive` — aucune ne l’évite', () => {
    const lignes = code.split('\n');
    const ecritures = lignes.map((l, i) => ({ l, i })).filter((x) => /method: '(POST|PATCH|PUT|DELETE)'|^\s*method: 'PATCH',\s*$/.test(x.l));
    expect(ecritures.length).toBeGreaterThanOrEqual(11);
    for (const { i } of ecritures) {
      const avant = lignes.slice(Math.max(0, i - 4), i + 1).join('\n');
      expect(avant, `écriture ligne ${i}`).toContain('await appelDrive(');
      expect(avant).not.toMatch(/await fetch\([^)]*$/m);
    }
  });
  it('en lecture seule, `appelDrive` n’émet RIEN et rend un refus motivé', () => {
    expect(code).toContain("if (lectureSeule && (init?.method ?? 'GET').toUpperCase() !== 'GET') return reponseLectureSeule();");
    expect(src).toContain('rien n’y est créé, renommé, déplacé ni supprimé');
  });
  it('le dossier d’arrivée peut être l’élément mis en évidence, et il est sélectionné', () => {
    expect(code).toContain("const dansLeDossier = dernier === undefined || documentId === '' || documentId === cible.id");
    expect(code).toContain('setSelection({ ids: [cible.id], ancre: cible.id })');
  });
  it('l’ouverture automatique ne double pas une arrivée en arborescence', () => {
    expect(code).toContain('if (enArborescence) return;');
  });
});
