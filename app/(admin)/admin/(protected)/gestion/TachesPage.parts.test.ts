import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compterTachesDuJour, jourParisDe } from '../../../../lib/gestion/taches';
import { ETAT_DEFAUT, ecrireEtatUrl, lireEtatUrl } from '../../../../lib/gestion/ecranUrl';

/**
 * ══ 🔴 LOT GESTION-TACHES-PAGE (Arno, 17/10/2026) — PAGE PLEINE « TÂCHES » ET RACCOURCI DANS LA COLONNE DES MAILS ═══
 * La page est le MÊME composant que le module de l'écran partagé ; le raccourci « Tâches » est entre « Événements » et
 * « Syndics », même style ; sa pastille rouge dit les tâches d'AUJOURD'HUI ni faites ni annulées, absente à 0.
 */
const VUE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
const BOITE = readFileSync('app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx', 'utf8');
const COLONNE = readFileSync('app/(admin)/admin/(protected)/gestion/ColonneMode.tsx', 'utf8');

describe('la pastille : aujourd’hui seulement, ni faites ni annulées', () => {
  const m = new Date('2026-10-17T21:30:00Z'); // 23 h 30 à Paris, le 17
  const t = (jour: string, etat: 'a_faire' | 'faite' | 'annulee' = 'a_faire') => ({ jour, etat });
  it('le jour civil de Paris ; ni demain, ni hier, ni faite, ni annulée', () => {
    expect(jourParisDe(m)).toBe('2026-10-17');
    expect(compterTachesDuJour([t('2026-10-17'), t('2026-10-17'), t('2026-10-18'), t('2026-10-16'),
      t('2026-10-17', 'faite'), t('2026-10-17', 'annulee')], m)).toBe(2);
    expect(compterTachesDuJour([], m)).toBe(0);
  });
});

describe('la page pleine « Tâches »', () => {
  it('l’adresse ?ecran=taches ouvre l’écran « taches »', () => {
    expect(lireEtatUrl('ecran=taches').ecran).toBe('taches');
    // Aller-retour : l'adresse écrite pour l'écran se relit en lui (rechargement, « Précédent »).
    expect(lireEtatUrl(ecrireEtatUrl({ ...ETAT_DEFAUT, ecran: 'taches' })).ecran).toBe('taches');
  });
  it('c’est le MÊME composant que le module de l’écran partagé, avec un retour ; le module partagé est toujours là', () => {
    const page = VUE.slice(VUE.indexOf("{ecran === 'taches' ? ("), VUE.indexOf(") : ecran === 'syndics' ? ("));
    expect(page).toContain('<TableauTaches');
    expect(page).toContain('retour={');
    expect(VUE.split('<TableauTaches').length - 1).toBe(2);
  });
});

describe('le raccourci « Tâches » de la colonne des mails', () => {
  it('entre « Événements » et « Syndics », même style (cm-entree)', () => {
    const ev = BOITE.indexOf('<span className="cm-texte">Événements</span>');
    const ta = BOITE.indexOf('<span className="cm-texte">Tâches</span>');
    const sy = BOITE.indexOf('<span className="cm-texte">Syndics</span>');
    expect(ev).toBeGreaterThan(0);
    expect(ta).toBeGreaterThan(ev);
    expect(sy).toBeGreaterThan(ta);
    expect(BOITE.slice(BOITE.lastIndexOf('<button', ta), ta)).toContain('className="cm-entree"');
  });
  it('pastille seulement au-dessus de 0 ; ronde, rouge de la charte, chiffre clair', () => {
    expect(BOITE).toContain('{tachesDuJour > 0 && (');
    expect(COLONNE).toMatch(/\.cm-pastille-jour\{[^}]*border-radius:999px[^}]*background:var\(--color-svv-red\);color:var\(--color-svv-surface\)/);
    expect(VUE).toContain('tachesDuJour={tachesDuJour}');
  });
});
