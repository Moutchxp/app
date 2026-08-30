import { describe, it, expect } from 'vitest';
import { composerComplementPieces, estNoReply, entetesFil, problemeTexteComplement, problemeDateDeclaration, objetReponse } from './complementPieces';

describe('problemeDateDeclaration — bornes d’une relance déclarée', () => {
  it('date valide (après le dernier message, pas future) → null', () => {
    expect(problemeDateDeclaration('2026-08-29', '2026-08-30', '2026-08-28T14:39:59+02:00')).toBeNull();
  });
  it('date dans le FUTUR → refus', () => {
    expect(problemeDateDeclaration('2026-09-01', '2026-08-30', '2026-08-28T00:00:00+02:00')).toMatch(/futur/);
  });
  it('date ANTÉRIEURE au dernier message reçu → refus', () => {
    expect(problemeDateDeclaration('2026-08-27', '2026-08-30', '2026-08-28T14:39:59+02:00')).toMatch(/précéder le dernier message/);
  });
  it('date absente / mal formée → refus', () => {
    expect(problemeDateDeclaration('', '2026-08-30', null)).toMatch(/manquante/);
    expect(problemeDateDeclaration('30/08/2026', '2026-08-30', null)).toMatch(/invalide|manquante/);
  });
  it('même jour que le dernier message → accepté (borne basse inclusive)', () => {
    expect(problemeDateDeclaration('2026-08-28', '2026-08-30', '2026-08-28T14:39:59+02:00')).toBeNull();
  });
});

describe('problemeTexteComplement — validation du texte (y compris modifié à la main)', () => {
  it('texte valable → null', () => {
    expect(problemeTexteComplement('Objet', 'Bonjour, merci.')).toBeNull();
  });
  it('objet vide → refus ; corps vide → refus', () => {
    expect(problemeTexteComplement('   ', 'corps')).toBe('objet vide');
    expect(problemeTexteComplement('objet', '   ')).toBe('corps vide');
  });
  it('entité HTML échappée (objet ou corps) → refus', () => {
    expect(problemeTexteComplement('objet', 'Bonjour&nbsp;&nbsp;merci')).toMatch(/entité HTML/);
    expect(problemeTexteComplement('Titre &amp; suite', 'corps')).toMatch(/entité HTML/);
    expect(problemeTexteComplement('objet', 'a &#160; b')).toMatch(/entité HTML/);
  });
  it('apostrophe, esperluette NUE, « < » isolé → acceptés (ce ne sont pas des entités)', () => {
    expect(problemeTexteComplement('Objet', 'Dupont & Fils, coût < 5 jours, l’étage')).toBeNull();
  });
});

describe('entetesFil — répondre dans le fil du dernier message', () => {
  it('In-Reply-To = Message-ID reçu ; References = chaîne existante + Message-ID', () => {
    const r = entetesFil('<abc@mairie.fr>', '<x@svav.com> <y@mairie.fr>');
    expect(r.inReplyTo).toBe('<abc@mairie.fr>');
    expect(r.references).toBe('<x@svav.com> <y@mairie.fr> <abc@mairie.fr>');
  });
  it('sans References préalables → References = juste le Message-ID', () => {
    expect(entetesFil('<abc@mairie.fr>', null).references).toBe('<abc@mairie.fr>');
  });
});

describe('objetReponse — préfixe Re:', () => {
  it('ajoute « Re: » si absent, ne le double pas', () => {
    expect(objetReponse('Nouvelle demande')).toBe('Re: Nouvelle demande');
    expect(objetReponse('Re: Nouvelle demande')).toBe('Re: Nouvelle demande');
    expect(objetReponse('RE : truc')).toBe('RE : truc'); // déjà une réponse (casse/espace tolérés)
    expect(objetReponse('')).toBe('Re:');
    expect(objetReponse(null)).toBe('Re:');
  });
});

describe('estNoReply', () => {
  it('reconnaît les adresses non répondables', () => {
    expect(estNoReply('no-reply@paris.fr')).toBe(true);
    expect(estNoReply('noreply@paris.fr')).toBe(true);
    expect(estNoReply('ne-pas-repondre@mairie.fr')).toBe(true);
    expect(estNoReply('')).toBe(true);
    expect(estNoReply(null)).toBe(true);
  });
  it('accepte une adresse personnelle répondable', () => {
    expect(estNoReply('lauriane.pangui@mairie-aubervilliers.fr')).toBe(false);
    expect(estNoReply('urba-reglementaire@mairie-aubervilliers.fr')).toBe(false);
  });
});

/** PART-3a — générateur PUR du courriel « complément de pièces ». Complément de dossier courtois, JAMAIS une relance de cascade. */
describe('composerComplementPieces', () => {
  it('ne cite QUE les familles demandées (2 manquantes, 1 cochée → 1 seule dans le corps)', () => {
    const r = composerComplementPieces('0930012500081', ['etage'])!;
    expect(r.corps).toContain('plans des différents niveaux');
    expect(r.corps).not.toContain('Cerfa'); // la famille NON cochée n'apparaît pas
    expect(r.corps).not.toContain('plan de masse');
    expect(r.corps).not.toContain('plan de coupe');
  });

  it('la famille Cerfa réclame AUSSI l’annexe pour la liste intégrale des parcelles cadastrales (PART-3d)', () => {
    const r = composerComplementPieces('0930012500081', ['cerfa'])!;
    expect(r.corps).toContain('le formulaire Cerfa de demande de permis de construire et son annexe si besoin pour obtenir la liste intégrale des parcelles cadastrales concernées par ce permis');
  });

  it('rappelle le NUMÉRO DE PERMIS (pas la référence interne) dans l’objet et le corps, et remercie pour les pièces déjà transmises', () => {
    const r = composerComplementPieces('0930012500081', ['cerfa', 'etage'])!;
    expect(r.objet).toContain('0930012500081');
    expect(r.objet).not.toContain('SVAV');
    expect(r.corps).toContain('0930012500081');
    expect(r.corps).not.toContain('SVAV');
    expect(r.corps).toContain('déjà transmises');
  });

  it('AUCUNE mention de refus tacite, de CADA ni de Commission d’accès (ce n’est pas une relance)', () => {
    const r = composerComplementPieces('0930012500081', ['cerfa', 'masse', 'coupe', 'etage'])!;
    const c = r.corps.toLowerCase();
    expect(c).not.toContain('refus tacite');
    expect(c).not.toMatch(/\bcada\b/); // le SIGLE CADA — « cadastrales » (PART-3d) ne doit pas déclencher un faux positif
    expect(c).not.toContain('commission d’accès');
    expect(c).not.toContain('commission d\'accès');
    expect(c).not.toContain('délai');
  });

  it('à la première personne du singulier', () => {
    const r = composerComplementPieces('0930012500081', ['cerfa'])!;
    expect(r.corps).toContain('Je vous remercie');
    expect(r.corps).toContain('je me permets');
  });

  it('ordre stable (masse, coupe, étages, Cerfa) quel que soit l’ordre d’entrée', () => {
    const r = composerComplementPieces('X', ['cerfa', 'coupe', 'masse', 'etage'])!;
    const iMasse = r.corps.indexOf('plan de masse');
    const iCoupe = r.corps.indexOf('plan de coupe');
    const iEtage = r.corps.indexOf('plans des différents niveaux');
    const iCerfa = r.corps.indexOf('formulaire Cerfa');
    expect(iMasse).toBeLessThan(iCoupe);
    expect(iCoupe).toBeLessThan(iEtage);
    expect(iEtage).toBeLessThan(iCerfa);
  });

  it('aucune famille → null (filet ; l’appelant refuse l’envoi en amont)', () => {
    expect(composerComplementPieces('X', [])).toBeNull();
  });

  it('AUCUNE entité HTML échappée ni espace insécable dans le corps (le mail part en TEXTE brut)', () => {
    // Toutes les combinaisons de familles : le corps ne doit contenir ni « &nbsp; » « &amp; » « &lt; »… ni U+00A0.
    const combos: Parameters<typeof composerComplementPieces>[1][] = [
      ['masse'], ['coupe'], ['etage'], ['cerfa'], ['masse', 'coupe', 'etage', 'cerfa'],
    ];
    for (const fam of combos) {
      const r = composerComplementPieces('0930012500081', fam)!;
      const texte = `${r.objet}\n${r.corps}`;
      expect(texte).not.toMatch(/&(?:[a-z]+|#\d+);/i); // aucune entité HTML (&nbsp; &amp; &lt; &#160; …)
      expect(texte).not.toContain('\u00A0');     // aucun espace insécable littéral (U+00A0)
      expect(texte.includes('&nbsp;')).toBe(false);
    }
  });
});
