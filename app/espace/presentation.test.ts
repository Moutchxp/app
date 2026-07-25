import { describe, it, expect } from 'vitest';
import {
  salutation, libelleVerdict, formatScore, TITRE_ESPACE, TITRE_CONNEXION, SOUS_LIGNE_ACCUEIL,
  TITRE_ANALYSES, MSG_AUCUNE_ANALYSE, MSG_SANS_CERTIFICAT, LIB_DOCUMENTS,
  DOC_NOMINATIF, DOC_ANONYME, DOC_VISUEL, MSG_NOMINATIF_EN_PREPARATION, LIB_RETOUR,
  validerNouveauMotDePasse, LONGUEUR_MIN_MDP, MSG_MDP_TROP_COURT, MSG_MDP_DIVERGENT,
  MSG_DEMANDE_ENVOYEE, LIB_MDP_OUBLIE, TITRE_MDP_OUBLIE, TITRE_NOUVEAU_MDP,
  MSG_LIEN_INVALIDE, LIB_REDEMANDER_LIEN,
  TITRE_COMPTE, LIB_CHAMP_PRENOM, LIB_CHAMP_NOM, LIB_CHAMP_EMAIL_COMPTE, LIB_CHAMP_TELEPHONE,
  MSG_TELEPHONE_ABSENT, LIB_MODIFIER, LIB_ENREGISTRER, LIB_ANNULER, ARIA_CADENAS,
  BULLE_CADENAS_AVANT, BULLE_CADENAS_EMAIL,
  TITRE_SUPPRESSION, AVERTISSEMENTS_SUPPRESSION, CONSEIL_TELECHARGER_SUPPRESSION,
  LIB_CASE_SUPPRESSION, LIB_BOUTON_SUPPRIMER, TITRE_ZONE_DANGER, LIB_LIEN_SUPPRESSION,
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

describe('page « Mon compte » — libellés + texte EXACT de la bulle cadenas', () => {
  it('libellés présents et non vides', () => {
    for (const s of [TITRE_COMPTE, LIB_CHAMP_PRENOM, LIB_CHAMP_NOM, LIB_CHAMP_EMAIL_COMPTE, LIB_CHAMP_TELEPHONE,
                     MSG_TELEPHONE_ABSENT, LIB_MODIFIER, LIB_ENREGISTRER, LIB_ANNULER, ARIA_CADENAS]) {
      expect(typeof s).toBe('string');
      expect(s.trim().length).toBeGreaterThan(0);
    }
  });

  it('la bulle recompose EXACTEMENT la phrase imposée (AVANT + e-mail + « . »)', () => {
    const phrase = `${BULLE_CADENAS_AVANT}${BULLE_CADENAS_EMAIL}.`;
    expect(phrase).toBe(
      'Votre adresse e-mail et votre numéro de téléphone ne sont pas modifiables depuis l’application : votre e-mail sert d’identifiant de connexion. Pour les faire changer, écrivez-nous à contact@sansvisavis.com.',
    );
  });

  it('l’e-mail de contact est bien une adresse (support du lien mailto)', () => {
    expect(BULLE_CADENAS_EMAIL).toBe('contact@sansvisavis.com');
    expect(BULLE_CADENAS_AVANT.endsWith('écrivez-nous à ')).toBe(true); // l'adresse suit immédiatement
  });
});

describe('suppression de compte — avertissement complet et sans ambiguïté (C4)', () => {
  it('les 5 conséquences imposées sont présentes, chacune séparément', () => {
    expect(AVERTISSEMENTS_SUPPRESSION).toHaveLength(5);
    for (const a of AVERTISSEMENTS_SUPPRESSION) expect(a.trim().length).toBeGreaterThan(0);
  });
  it('l’avertissement énonce : identité effacée · historique · documents plus authentifiables · QR imprimés · irréversible', () => {
    const tout = AVERTISSEMENTS_SUPPRESSION.join(' § ');
    expect(tout).toMatch(/identité/i);
    expect(tout).toMatch(/historique/i);
    expect(tout).toMatch(/authentifiable/i);      // documents / certificats plus authentifiables en ligne
    expect(tout).toMatch(/QR/);                    // QR déjà imprimés / publiés
    expect(tout).toMatch(/irréversible/i);
    expect(tout).toMatch(/support/i);              // « même en écrivant au support »
  });
  it('le conseil invite à télécharger ses documents ; libellés présents et non vides', () => {
    expect(CONSEIL_TELECHARGER_SUPPRESSION).toMatch(/téléchargez/i);
    for (const s of [TITRE_SUPPRESSION, LIB_CASE_SUPPRESSION, LIB_BOUTON_SUPPRIMER, TITRE_ZONE_DANGER, LIB_LIEN_SUPPRESSION]) {
      expect(typeof s).toBe('string');
      expect(s.trim().length).toBeGreaterThan(0);
    }
  });
  it('la case reconnaît explicitement la compréhension des conséquences', () => {
    expect(LIB_CASE_SUPPRESSION).toMatch(/compris/i);
    expect(LIB_CASE_SUPPRESSION).toMatch(/supprimer/i);
  });
});
