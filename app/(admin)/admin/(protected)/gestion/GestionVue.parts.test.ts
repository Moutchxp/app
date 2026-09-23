import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { CarteEv, LigneFil } from './GestionVue';

/**
 * LOT 2 — le CONTRAT VISIBLE de l'écran. Deux familles :
 *   · ce qui est RENDU (les deux briques de liste, rendues pour de vrai — un plantage se verrait ici, pas en production) ;
 *   · ce qui tient dans la FEUILLE DE STYLE : mobile d'abord, aucune couleur en dur, aucun débordement horizontal.
 * La vue entière (`GestionVue`) fait du `fetch` ; ses états sont couverts par ses fonctions pures (ecran.test.ts) et par
 * le contrat de la route (route.test.ts) — inutile de monter un navigateur pour re-tester les mêmes phrases.
 */

const MAINTENANT = new Date('2026-09-23T12:00:00Z');

const fil = (over: Partial<Parameters<typeof LigneFil>[0]['fil']> = {}) => ({
  filId: 1, objet: 'Fuite salle de bain', interlocuteur: 'Mme M.', dernierLe: '2026-09-20T12:00:00Z',
  nbMessages: 6, nbPieces: 2, attend: true, ...over,
});
const carte = (over: Partial<Parameters<typeof CarteEv>[0]['carte']> = {}) => ({
  evenementId: 1, reference: 'GES-2026-000001', objet: 'Fuite salle de bain', demandeur: 'Mme M.',
  adresseLibre: '53 avenue des Ternes', etat: 'a_traiter' as const, ouvertLe: '2026-09-01T12:00:00Z',
  dernierEchangeLe: '2026-09-20T12:00:00Z', nbFils: 2, attend: true, ...over,
});

const rendreFil = (o = {}) => renderToStaticMarkup(createElement(LigneFil, { fil: fil(o), maintenant: MAINTENANT }));
const rendreCarte = (o = {}) => renderToStaticMarkup(createElement(CarteEv, { carte: carte(o), maintenant: MAINTENANT }));

describe('une ligne de file = UN ÉCHANGE, pas un message', () => {
  it('montre l’objet, l’interlocuteur, l’ancienneté et le NOMBRE de messages du fil', () => {
    const html = rendreFil();
    expect(html).toContain('Fuite salle de bain');
    expect(html).toContain('Mme M.');
    expect(html).toContain('il y a 3 jours');
    expect(html).toContain('6 messages'); // six mails tiennent sur UNE ligne — c'est tout l'intérêt
    expect(html).toContain('2 pièces jointes');
  });

  it('l’attente est dite par un MOT, jamais par la seule couleur', () => {
    expect(rendreFil({ attend: true })).toContain('attend une réponse');
    expect(rendreFil({ attend: false })).not.toContain('attend une réponse');
  });

  it('accorde les pluriels, et ne montre les pièces que s’il y en a', () => {
    const html = rendreFil({ nbMessages: 1, nbPieces: 1 });
    expect(html).toContain('1 message<'); // pas « 1 messages »
    expect(html).toContain('1 pièce jointe');
    expect(rendreFil({ nbPieces: 0 })).not.toContain('pièce');
  });

  it('ne laisse jamais un trou : objet vide et expéditeur inconnu ont leur libellé', () => {
    expect(rendreFil({ objet: null })).toContain('(sans objet)');
    expect(rendreFil({ objet: '   ' })).toContain('(sans objet)');
    expect(rendreFil({ interlocuteur: null })).toContain('(expéditeur inconnu)');
  });

  it('la date exacte reste accessible en infobulle, sans encombrer la ligne', () => {
    expect(rendreFil()).toMatch(/title="[^"]*2026[^"]*"/);
  });
});

describe('une carte d’événement : qui demande, quoi, depuis quand, dernier échange, état', () => {
  it('rend les cinq informations demandées', () => {
    const html = rendreCarte();
    expect(html).toContain('GES-2026-000001'); // quoi (référence)
    expect(html).toContain('Fuite salle de bain');
    expect(html).toContain('Mme M.');          // qui demande
    expect(html).toContain('53 avenue des Ternes');
    expect(html).toContain('À traiter');       // état
    expect(html).toContain('ouvert il y a');   // depuis quand
    expect(html).toContain('dernier échange il y a');
    expect(html).toContain('2 échanges');      // une carte peut regrouper plusieurs échanges
  });

  it('les trois états s’affichent en français', () => {
    expect(rendreCarte({ etat: 'en_cours' })).toContain('En cours');
    expect(rendreCarte({ etat: 'traite' })).toContain('Traité');
  });

  it('une carte sans échange ni demandeur se rend quand même, sans mention creuse', () => {
    const html = rendreCarte({ demandeur: null, adresseLibre: null, dernierEchangeLe: null, nbFils: 0, attend: false });
    expect(html).toContain('0 échange');
    expect(html).not.toContain('dernier échange');
    expect(html).not.toContain('attend une réponse');
  });
});

describe('la feuille de style tient les exigences transverses', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
  const css = src.slice(src.indexOf('const CSS_GESTION'));

  it('MOBILE D’ABORD : deux colonnes au-dessus de 900 px, une seule en dessous', () => {
    expect(css).toContain('.gst-deux{display:grid;grid-template-columns:1fr 1fr');
    expect(css).toMatch(/@media \(max-width:900px\)\{\.gst-deux\{grid-template-columns:1fr\}\}/);
  });

  it('la FILE D’ABORD sur mobile vient de l’ordre du DOM, jamais d’un `order` CSS (qui mentirait au clavier)', () => {
    expect(/\border\s*:/.test(css.replace(/border-[a-z]+\s*:/g, '').replace(/\bborder\s*:[^;]*solid[^;]*;/g, ''))).toBe(false);
    const vue = src.slice(src.indexOf('gst-deux'), src.indexOf('const CSS_GESTION'));
    expect(vue.indexOf('gst-titre-file')).toBeLessThan(vue.indexOf('gst-titre-ev')); // la file est écrite en premier
  });

  it('AUCUN débordement horizontal : la grille peut rétrécir et le texte casse', () => {
    expect(css).toContain('.gst-col{min-width:0}');
    expect(css).toContain('overflow-wrap:anywhere');
    expect(/min-width:\s*\d{3,}px/.test(css)).toBe(false); // aucune largeur minimale plus large qu'un téléphone
  });

  it('CIBLES TACTILES : les éléments cliquables et les lignes font au moins 44 px', () => {
    expect(css).toContain('.gst-btn{width:auto;flex-shrink:0;min-height:44px');
    expect(css).toContain('.gst-item{min-height:44px');
  });

  it('AUCUNE couleur en dur : tout passe par les jetons de la charte', () => {
    const couleurs = css.match(/#[0-9a-f]{3,8}\b|\brgba?\(/gi) ?? [];
    expect(couleurs).toEqual([]);
    expect(css).toContain('var(--color-svv-');
  });

  it('aucune interaction dépendante du SURVOL seul (exigence transverse §15)', () => {
    expect(/:hover/.test(css)).toBe(false);
  });
});
