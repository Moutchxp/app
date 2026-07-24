import { describe, it, expect } from 'vitest';
import {
  salutation, libelleVerdict, formatScore, TITRE_ESPACE, TITRE_CONNEXION, SOUS_LIGNE_ACCUEIL,
  TITRE_ANALYSES, MSG_AUCUNE_ANALYSE, MSG_SANS_CERTIFICAT, LIB_DOCUMENTS,
  DOC_NOMINATIF, DOC_ANONYME, DOC_VISUEL, MSG_NOMINATIF_EN_PREPARATION, LIB_RETOUR,
  validerNouveauMotDePasse, LONGUEUR_MIN_MDP, MSG_MDP_TROP_COURT, MSG_MDP_DIVERGENT,
  MSG_DEMANDE_ENVOYEE, LIB_MDP_OUBLIE, TITRE_MDP_OUBLIE, TITRE_NOUVEAU_MDP,
  MSG_LIEN_INVALIDE, LIB_REDEMANDER_LIEN,
} from './presentation';

describe('salutation — repli défensif (prénom/nom NULL ou vide)', () => {
  it('les DEUX présents → « Bonjour Prénom Nom »', () => {
    expect(salutation('Jean', 'Dupont')).toBe('Bonjour Jean Dupont');
  });
  it('nom NULL → « Bonjour, » seul (jamais « Bonjour null » ni espace orphelin)', () => {
    expect(salutation('Jean', null)).toBe('Bonjour,');
  });
  it('prénom NULL → « Bonjour, » seul', () => {
    expect(salutation(null, 'Dupont')).toBe('Bonjour,');
  });
  it('les DEUX NULL (dossier anonymisé) → « Bonjour, »', () => {
    expect(salutation(null, null)).toBe('Bonjour,');
  });
  it('chaînes vides / espaces → « Bonjour, » (pas d’espace orphelin)', () => {
    expect(salutation('', '')).toBe('Bonjour,');
    expect(salutation('  ', 'Dupont')).toBe('Bonjour,');
    expect(salutation(' Jean ', ' Dupont ')).toBe('Bonjour Jean Dupont'); // trim appliqué
  });
  it('jamais la chaîne « null » dans la sortie', () => {
    for (const s of [salutation(null, 'X'), salutation('X', null), salutation(null, null)]) {
      expect(s).not.toContain('null');
    }
  });
});

describe('libelleVerdict (espace)', () => {
  it('SANS_VIS_A_VIS → « Sans vis-à-vis »', () => expect(libelleVerdict('SANS_VIS_A_VIS')).toBe('Sans vis-à-vis'));
  it('VIS_A_VIS → « Vis-à-vis détecté »', () => expect(libelleVerdict('VIS_A_VIS')).toBe('Vis-à-vis détecté'));
  it('INDETERMINE / null → « Indéterminé »', () => {
    expect(libelleVerdict('INDETERMINE')).toBe('Indéterminé');
    expect(libelleVerdict(null)).toBe('Indéterminé');
  });
});

describe('titres de bandeau', () => {
  it('espace = « Mon espace personnel » (orthographe : deux n à personnel)', () => {
    expect(TITRE_ESPACE).toBe('Mon espace personnel');
  });
  it('connexion = « Connexion »', () => {
    expect(TITRE_CONNEXION).toBe('Connexion');
  });
});

describe('constantes de texte présentes et non vides', () => {
  it('toutes définies', () => {
    for (const s of [
      TITRE_ESPACE, TITRE_CONNEXION, SOUS_LIGNE_ACCUEIL, TITRE_ANALYSES, MSG_AUCUNE_ANALYSE,
      MSG_SANS_CERTIFICAT, LIB_DOCUMENTS, MSG_NOMINATIF_EN_PREPARATION, LIB_RETOUR,
    ]) {
      expect(typeof s).toBe('string');
      expect(s.trim().length).toBeGreaterThan(0);
    }
  });
  it('la sous-ligne d’accueil invite aux analyses et certificats', () => {
    expect(SOUS_LIGNE_ACCUEIL).toMatch(/analyses/i);
    expect(SOUS_LIGNE_ACCUEIL).toMatch(/certificats/i);
  });
});

describe('documents du dépliement (label + description parlante pour un non-technicien)', () => {
  it('les trois documents ont un label et une description non vides', () => {
    for (const d of [DOC_NOMINATIF, DOC_ANONYME, DOC_VISUEL]) {
      expect(d.label.trim().length).toBeGreaterThan(0);
      expect(d.description.trim().length).toBeGreaterThan(0);
    }
  });
  it('les descriptions collent au rôle de chaque document', () => {
    expect(DOC_NOMINATIF.description).toMatch(/complet|à votre nom/i);
    expect(DOC_ANONYME.description).toMatch(/sans vos coordonnées|transmettre/i);
    expect(DOC_VISUEL.description).toMatch(/annonce/i);
  });
  it('libellés distincts (trois documents bien différenciés)', () => {
    const labels = [DOC_NOMINATIF.label, DOC_ANONYME.label, DOC_VISUEL.label];
    expect(new Set(labels).size).toBe(3);
  });
});

describe('formatScore — arrondi d’AFFICHAGE seulement', () => {
  it('null → « — »', () => expect(formatScore(null)).toBe('—'));
  it('entier → « NN/100 »', () => expect(formatScore(88)).toBe('88/100'));
  it('décimal → arrondi à l’entier (affichage seul)', () => {
    expect(formatScore(87.4)).toBe('87/100');
    expect(formatScore(87.6)).toBe('88/100');
  });
  it('0 → « 0/100 » (pas confondu avec null)', () => expect(formatScore(0)).toBe('0/100'));
});

describe('validerNouveauMotDePasse — miroir client de la politique serveur', () => {
  const bon = 'a'.repeat(LONGUEUR_MIN_MDP); // exactement 12

  it('trop court → refus « trop court » (même si divergent : la longueur prime)', () => {
    expect(validerNouveauMotDePasse('court', 'court')).toEqual({ ok: false, erreur: MSG_MDP_TROP_COURT });
    expect(validerNouveauMotDePasse('court', 'autre')).toEqual({ ok: false, erreur: MSG_MDP_TROP_COURT });
  });
  it('assez long mais divergent → refus « ne correspondent pas »', () => {
    expect(validerNouveauMotDePasse(bon, bon + 'x')).toEqual({ ok: false, erreur: MSG_MDP_DIVERGENT });
  });
  it('assez long ET identique → ok', () => {
    expect(validerNouveauMotDePasse(bon, bon)).toEqual({ ok: true, erreur: null });
  });
  it('borne exacte : LONGUEUR_MIN_MDP caractères acceptés', () => {
    expect(validerNouveauMotDePasse(bon, bon).ok).toBe(true);
    expect(validerNouveauMotDePasse(bon.slice(0, -1), bon.slice(0, -1)).ok).toBe(false);
  });
  it('LONGUEUR_MIN_MDP = 12 (miroir de la politique serveur)', () => expect(LONGUEUR_MIN_MDP).toBe(12));
});

describe('chaînes reset — anti-énumération + libellés présents', () => {
  it('la confirmation de demande est conditionnelle (ne confirme JAMAIS l’existence d’un compte)', () => {
    expect(MSG_DEMANDE_ENVOYEE).toMatch(/si un compte/i);
    expect(MSG_DEMANDE_ENVOYEE).not.toMatch(/n’existe pas|inexistant|introuvable/i);
  });
  it('libellés user-facing du reset définis et non vides', () => {
    for (const s of [LIB_MDP_OUBLIE, TITRE_MDP_OUBLIE, TITRE_NOUVEAU_MDP, MSG_LIEN_INVALIDE, LIB_REDEMANDER_LIEN]) {
      expect(typeof s).toBe('string');
      expect(s.trim().length).toBeGreaterThan(0);
    }
  });
});
