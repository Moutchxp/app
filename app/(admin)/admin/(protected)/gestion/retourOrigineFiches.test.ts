import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 🔴🔴 Arno (28/11/2026, 13h18, point 3) — « quand je referme cette fenêtre j'arrive sur un autre écran : il faut revenir sur l'écran […] d'où l'on vient ».
 * Partout où une fiche s'ouvre PAR L'ADRESSE depuis une autre page, la refermer ramène à la page d'origine (le mécanisme commun `retourVersOrigine` :
 * la page, son état et son défilement) ; sans origine connue, l'écran garde son comportement d'avant.
 */
describe('fermer une fiche ouverte depuis une autre page ramène à la page d’origine', () => {
  const P = 'app/(admin)/admin/(protected)/';
  it('la liste des copropriétés (`?ouvrir=`, depuis la recherche de l’accueil Location) : retour à l’origine à la fermeture de la fiche ouverte par l’adresse', () => {
    const s = readFileSync(`${P}gestion/EcranCoproprietes.tsx`, 'utf8');
    expect(s).toContain('const depuisAdresse = useRef(ouvrirDepart !== null);');
    expect(s).toContain('if (depuisAdresse.current) { depuisAdresse.current = false; if (retourVersOrigine()) return; }');
  });
  it('l’écran des syndics de la Gestion (`?syndic=N`, le lien « à compléter » de la Location) : idem', () => {
    const s = readFileSync(`${P}gestion/EcranSyndics.tsx`, 'utf8');
    expect(s).toContain('if (Number.isInteger(n) && n > 0) { depuisAdresse.current = true; setOuvert({ id: n }); }');
    expect(s).toContain('if (depuisAdresse.current) { depuisAdresse.current = false; if (retourVersOrigine()) return; }');
  });
  it('la fiche syndic de la Location : la fiche copropriété s’ouvre en fenêtre, sur place (plus de changement de page)', () => {
    const s = readFileSync(`${P}location/EcransLocation.tsx`, 'utf8');
    expect(s).not.toContain('window.location.assign(`/admin/location/coproprietes?ouvrir=');
    expect(s).toContain('<FicheCopropriete immeuble={coproOuverte} onFerme={() => { setCoproOuverte(null); rafraichir(); }} />');
  });
});
