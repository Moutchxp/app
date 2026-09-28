import { describe, expect, it } from 'vitest';
import {
  MOTIF_SANS_JOURNAL, NOM_DOSSIER_MAX, cheminComplet, formeComparable, homonymeParmi, motifHomonyme, nomPourDrive,
  phraseConfirmation,
} from './dossierNouveau';
import { NOM_MAX } from './driveGardeFou';

/**
 * LOT DRIVE-VISUALISER-ET-DOSSIERS — CE QUI SE DÉCIDE SANS RÉSEAU AVANT DE CRÉER UN DOSSIER.
 *
 * Module PUR : ces tests n'ont ni base, ni réseau, ni horloge. C'est tout l'intérêt d'avoir sorti ces décisions de la
 * route — la règle du doublon et celle du chemin s'éprouvent ici exhaustivement, y compris les cas qu'on ne saurait
 * pas provoquer à la main dans un Drive réel.
 */

describe('① le nom du dossier', () => {
  it('refuse un nom vide, et un nom fait seulement d’espaces', () => {
    for (const brut of ['', '   ', '\t\n ']) {
      const v = nomPourDrive(brut);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.motif).toContain('Donnez un nom');
    }
  });

  it('retire les caractères de contrôle et réduit les espaces multiples', () => {
    const v = nomPourDrive('  Travaux   2026 \n');
    expect(v).toEqual({ ok: true, nom: 'Travaux 2026' });
  });

  /**
   * 🔴 LE DÉFAUT QUE CE TEST EMPÊCHE DE REVENIR. Au lot DRIVE-2, la barre oblique avait été remplacée par un tiret
   * « par prudence » : « entrée 01/09/2022 » devenait « entrée 01-09-2022 », c'est-à-dire un format de date qu'Arno
   * avait explicitement demandé, déformé en silence. Drive accepte la barre oblique. On ne nettoie que le nécessaire.
   */
  it('GARDE la barre oblique, les accents et les apostrophes — nettoyer au-delà du nécessaire déforme la donnée', () => {
    expect(nomPourDrive('entrée 01/09/2022')).toEqual({ ok: true, nom: 'entrée 01/09/2022' });
    expect(nomPourDrive('Bail d’habitation — Frédéric')).toEqual({ ok: true, nom: 'Bail d’habitation — Frédéric' });
  });

  it('REFUSE un nom trop long au lieu de le tronquer en silence', () => {
    const v = nomPourDrive('x'.repeat(NOM_DOSSIER_MAX + 1));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motif).toContain(String(NOM_DOSSIER_MAX));
    expect(nomPourDrive('x'.repeat(NOM_DOSSIER_MAX)).ok).toBe(true);
  });

  /** La borne est la même que celle des dossiers construits par le lot DRIVE-1 : deux bornes différentes surprendraient. */
  it('emploie la même borne de longueur que le reste du module', () => {
    expect(NOM_DOSSIER_MAX).toBe(NOM_MAX);
  });
});

describe('② le doublon — « il n’y a jamais de doublon silencieux »', () => {
  const dedans = [
    { id: 'a', nom: 'Travaux 2026', dossier: true },
    { id: 'b', nom: 'Quittances', dossier: true },
    { id: 'c', nom: 'bail signé.pdf', dossier: false },
  ];

  it('trouve le dossier de même nom', () => {
    expect(homonymeParmi('Travaux 2026', dedans)?.id).toBe('a');
  });

  /**
   * 🔴 LA CASSE ET LES ACCENTS NE FONT PAS UN AUTRE DOSSIER. Google, lui, laisserait cohabiter « Travaux » et
   * « travaux » : dans une liste, l'œil ne les distingue pas, et l'on se retrouve un mois plus tard avec deux moitiés
   * de dossier. C'est exactement ce que ce garde-fou existe pour empêcher.
   */
  it('ignore la casse, les accents et les espaces en trop', () => {
    expect(homonymeParmi('travaux 2026', dedans)?.id).toBe('a');
    expect(homonymeParmi('  TRAVAUX   2026 ', dedans)?.id).toBe('a');
    expect(homonymeParmi('Quittançes', dedans)?.id).toBe('b');
  });

  /** Un FICHIER du même nom compte aussi : dans la liste, on ne verra qu'un nom en double. */
  it('refuse aussi quand c’est un FICHIER qui porte déjà le nom, et le DIT', () => {
    const t = homonymeParmi('bail signé.pdf', dedans);
    expect(t?.dossier).toBe(false);
    expect(motifHomonyme(t!)).toContain('fichier');
  });

  it('ne trouve rien pour un nom neuf, ni pour un nom vide', () => {
    expect(homonymeParmi('Assurances', dedans)).toBeNull();
    expect(homonymeParmi('   ', dedans)).toBeNull();
  });

  it('le motif d’un dossier existant invite à l’OUVRIR plutôt qu’à en créer un second', () => {
    expect(motifHomonyme({ nom: 'Travaux 2026', dossier: true })).toContain('ouvrez-le');
  });

  it('la forme comparable est stable — mêmes entrées, même sortie', () => {
    expect(formeComparable('Été  2026')).toBe(formeComparable('ete 2026'));
  });
});

describe('③ le chemin complet, celui que la confirmation montre', () => {
  it('assemble les étapes et met le NOUVEAU dossier en dernier', () => {
    expect(cheminComplet([{ nom: 'Mon Drive' }, { nom: 'GESTION LOCATIVE' }], 'Travaux 2026'))
      .toBe('Mon Drive › GESTION LOCATIVE › Travaux 2026');
  });

  it('ignore les étapes sans nom plutôt que d’afficher des flèches vides', () => {
    expect(cheminComplet([{ nom: 'Mon Drive' }, { nom: '  ' }, { nom: 'Biens' }], 'X'))
      .toBe('Mon Drive › Biens › X');
  });

  it('un chemin sans étape reste lisible : le nom seul', () => {
    expect(cheminComplet([], 'Travaux')).toBe('Travaux');
  });

  it('la phrase de confirmation porte le chemin en entier', () => {
    const c = 'Mon Drive › GESTION LOCATIVE › Base de données locative › Travaux';
    expect(phraseConfirmation(c)).toContain(c);
  });
});

describe('le mode dégradé sans la migration 272', () => {
  /**
   * 🔴 IL DIT LA CAUSE *ET* LA LIMITE DE LA CONSÉQUENCE. « Indisponible » tout court ferait croire à une panne du
   * Drive, qui lui va très bien : on nomme donc la mise à jour attendue et l'on précise que tout le reste marche.
   */
  it('nomme la migration et dit que le reste du Drive fonctionne', () => {
    expect(MOTIF_SANS_JOURNAL).toContain('272');
    expect(MOTIF_SANS_JOURNAL).toContain('reste du Drive fonctionne');
  });
});
