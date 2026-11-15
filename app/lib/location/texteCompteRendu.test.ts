import { describe, expect, it } from 'vitest';
import { appliquerTirets, insererEntree, sansTiretsOrphelins, themeBascule, tiretApresRetour } from './texteCompteRendu';
import { insererDictee, insererTranscription } from './vocauxCompteRendu';

/** 🔴 Arno (15/11/2026) — la règle des tirets du compte rendu, dans TOUS les cas. */
describe('appliquerTirets', () => {
  it('jamais sur la première ligne ; toute nouvelle ligne écrite commence par « - »', () => {
    expect(appliquerTirets('Entrée propre\nCuisine sale', null).texte).toBe('Entrée propre\n- Cuisine sale');
    expect(appliquerTirets('Première ligne', null).texte).toBe('Première ligne');
  });
  it('pas de double tiret ; une ligne vide (ou un tiret seul) ne garde pas de tiret', () => {
    expect(appliquerTirets('A\n- déjà\n-aussi\n\n- \n   ', null).texte).toBe('A\n- déjà\n-aussi\n\n\n   ');
  });
  it('🔴 (15/11/2026, 6e retour) « Entrée » : le tiret TOUT DE SUITE, le curseur juste après (« - | ») ; on y écrit à la suite', () => {
    const e = insererEntree('Salon propre', 12);
    expect(e).toEqual({ texte: 'Salon propre\n- ', curseur: 15 });
    expect(appliquerTirets(`${e.texte}C`, 16)).toEqual({ texte: 'Salon propre\n- C', curseur: 16 });
    // deux « Entrée » de suite : la ligne quittée sans rien y écrire perd son tiret, la nouvelle a le sien
    const e2 = insererEntree(e.texte, e.curseur);
    expect(e2).toEqual({ texte: 'Salon propre\n\n- ', curseur: 16 });
    // au milieu d'une ligne : la suite descend, avec son tiret ; le curseur reste devant elle
    expect(insererEntree('Salon propre Cuisine', 13)).toEqual({ texte: 'Salon propre \n- Cuisine', curseur: 16 });
  });
  it('le retour à la ligne du CLAVIER puis la frappe : même règle, le curseur suit', () => {
    expect(appliquerTirets('A\nb', 3)).toEqual({ texte: 'A\n- b', curseur: 5 });
  });
  it('une DICTÉE qui arrive sur une ligne vide reçoit son tiret ; au milieu d’une ligne, aucun', () => {
    const d = insererDictee('Entrée.\n', 8, 'Cuisine propre');
    expect(appliquerTirets(d.texte, d.curseur)).toEqual({ texte: 'Entrée.\n- Cuisine propre', curseur: 24 });
    const m = insererDictee('Entrée. Salon.', 8, 'Cuisine');
    expect(appliquerTirets(m.texte, m.curseur).texte).toBe('Entrée. Cuisine Salon.');
  });
  it('la transcription d’un fichier vocal (sur sa ligne) reçoit son tiret', () => {
    const t = insererTranscription('Début.', 6, 'Le parquet.');
    expect(appliquerTirets(t.texte, t.curseur).texte).toBe('Début.\n- Le parquet. (transcrit d’un vocal)');
  });
});

describe('themeBascule', () => {
  it('le thème inverse de celui qu’on voit', () => {
    expect(themeBascule('light', true)).toBe('dark');
    expect(themeBascule('dark', false)).toBe('light');
    expect(themeBascule('system', true)).toBe('light');
    expect(themeBascule('system', false)).toBe('dark');
  });
});

import { abregerCivilite, personneAjoutee, phrasePresence } from './texteCompteRendu';
describe('🔴 « En présence de … » (Arno, 15/11/2026)', () => {
  it('une seule personne : sans « et » ; civilité abrégée, prénom puis nom', () => {
    expect(phrasePresence([{ civilite: 'Madame', prenom: 'Jeanne', nom: 'DUPONT' }])).toBe('En présence de Mme Jeanne DUPONT.');
  });
  it('deux : « X et de Y » ; trois : « X, Y et de Z »', () => {
    const p = [{ civilite: 'Madame', prenom: 'Jeanne', nom: 'X' }, { civilite: 'Monsieur', prenom: 'Paul', nom: 'Y' }, { civilite: 'Mme', prenom: null, nom: 'Z' }];
    expect(phrasePresence(p.slice(0, 2))).toBe('En présence de Mme Jeanne X et de M. Paul Y.');
    expect(phrasePresence(p)).toBe('En présence de Mme Jeanne X, M. Paul Y et de Mme Z.');
  });
  it('civilité inconnue : le nom tel qu’il est connu ; « d’ » devant une voyelle ; le prénom déjà dans le nom n’est pas doublé', () => {
    expect(phrasePresence([{ civilite: null, prenom: null, nom: 'ANDRÉ Alice' }])).toBe('En présence d’ANDRÉ Alice.');
    expect(phrasePresence([{ civilite: null, prenom: 'Alice', nom: 'BERNARD Alice' }, { civilite: null, prenom: null, nom: 'Émile Roux' }])).toBe('En présence de BERNARD Alice et d’Émile Roux.');
    expect(phrasePresence([])).toBe('');
    expect([abregerCivilite('M.'), abregerCivilite('Mme'), abregerCivilite('M. et Mme')]).toEqual(['M.', 'Mme', '']);
  });
  it('une personne ajoutée : civilité Madame / Monsieur et nom obligatoires, nettoyée', () => {
    expect(personneAjoutee({ civilite: 'Madame', nom: '  Martin ', prenom: ' Léa ' })).toEqual({ civilite: 'Madame', nom: 'Martin', prenom: 'Léa' });
    expect(personneAjoutee({ civilite: 'Docteur', nom: 'Martin' })).toBeNull();
    expect(personneAjoutee({ civilite: 'Monsieur', nom: '   ' })).toBeNull();
  });
});

import { paragraphesNotesPresence } from './texteCompteRendu';
describe('🔴 la note INTERNE d’une personne ajoutée (Arno, 15/11/2026)', () => {
  it('gardée sur la personne, jamais dans la phrase de présence ; listée seulement dans les notes internes', () => {
    const p = personneAjoutee({ civilite: 'Madame', nom: 'Martin', prenom: 'Léa', note: '  mère du locataire ' })!;
    expect(p.note).toBe('mère du locataire');
    expect(phrasePresence([p])).toBe('En présence de Mme Léa Martin.');
    expect(paragraphesNotesPresence([p, { civilite: null, prenom: null, nom: 'BERNARD Paul' }])).toEqual(['Notes de présence (internes)', 'Mme Léa Martin — mère du locataire']);
    expect(paragraphesNotesPresence([{ civilite: null, prenom: null, nom: 'X' }])).toEqual([]);
  });
});

describe('🔴 (15/11/2026, 6e retour) le retour à la ligne du clavier ; les tirets orphelins', () => {
  it('le retour du CLAVIER pose le tiret tout de suite, comme « Entrée » ; jamais de double tiret', () => {
    expect(tiretApresRetour('Salon\n', 6)).toEqual({ texte: 'Salon\n- ', curseur: 8 });
    expect(tiretApresRetour('Salon\n- déjà', 6)).toEqual({ texte: 'Salon\n- déjà', curseur: 6 });
    expect(tiretApresRetour('Salon\nsuite', 6)).toEqual({ texte: 'Salon\n- suite', curseur: 8 });
  });
  it('à l’enregistrement, une ligne restée vide avec son seul tiret est retirée ; le reste ne bouge pas', () => {
    expect(sansTiretsOrphelins('Salon\n- Cuisine\n- ')).toBe('Salon\n- Cuisine');
    expect(sansTiretsOrphelins('Salon\n-\n- Cuisine\n\n')).toBe('Salon\n- Cuisine');
    expect(sansTiretsOrphelins('Salon propre.')).toBe('Salon propre.');
  });
});
