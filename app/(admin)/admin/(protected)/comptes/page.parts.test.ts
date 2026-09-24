import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { formaterDate, Chip, DetailContenu } from './page';

describe('formaterDate (M3-4 Lot E)', () => {
  it('null → « jamais »', () => {
    expect(formaterDate(null)).toBe('jamais');
  });
  it('ISO invalide → « jamais »', () => {
    expect(formaterDate('pas-une-date')).toBe('jamais');
  });
  it('ISO valide → format fr lisible, jamais l’ISO brut', () => {
    const s = formaterDate('2026-07-09T22:31:35.591Z');
    expect(s).toMatch(/^\d{1,2} \S+ 2026, \d{2}:\d{2}$/); // « 9 juillet 2026, 22:31 » (heure locale)
    expect(s).not.toContain('T');
    expect(s).not.toContain('Z');
  });
});

describe('Chip — pastille accessible (ARIA, état par forme)', () => {
  it('cochée → aria-pressed="true" + indicateur ✓', () => {
    const html = renderToStaticMarkup(createElement(Chip, { libelle: 'Curation', coche: true }));
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('✓');
    expect(html).toContain('Curation');
  });
  it('décochée → aria-pressed="false" + pas de ✓', () => {
    const html = renderToStaticMarkup(createElement(Chip, { libelle: 'Curation', coche: false }));
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('✓');
  });
  it('désactivée (cas administrateur) → attribut disabled', () => {
    const html = renderToStaticMarkup(createElement(Chip, { libelle: 'Pilotage', coche: true, disabled: true }));
    expect(html).toContain('disabled');
  });
});

const compteCollab = {
  id: 5, identifiant: 'lea@unique.test', prenom: 'Léa', nom: 'M', role: 'collaborateur' as const, actif: true,
  perms: { pilotage: false, cartes_annee: false, statistiques: false, internautes: false, curation: true, banc_test: false, permis: false, gestion: false }, peutModifierPermis: false,
  derniere_connexion_a: '2026-07-09T22:31:35.591Z', cree_a: '2026-06-01T09:00:00.000Z', doit_changer_mot_de_passe: false,
};
const noop = () => {};
// LOT 5-DROITS — la réponse d'envoi fait désormais partie des props du détail ; `null` = « à décider ».
const idProps = { idPrenom: 'Léa', idNom: 'M', onIdPrenom: noop, onIdNom: noop, onEnregistrerIdentite: noop,
  envoi: null as boolean | null, onChoisirEnvoi: noop };

describe('DetailContenu — identité affichée UNE seule fois, date formatée', () => {
  it('l’identifiant n’apparaît qu’une fois dans le rendu du détail', () => {
    const html = renderToStaticMarkup(createElement(DetailContenu, {
      compte: compteCollab, perms: compteCollab.perms, collaborateur: true, msg: null, enCours: false, ...idProps,
      peutModifierPermis: false, onToggle: noop, onToggleModif: noop, onEnregistrer: noop, onPromouvoir: noop, onFermer: noop,
    }));
    expect((html.match(/lea@unique\.test/g) ?? []).length).toBe(1);
    expect(html).not.toContain('2026-07-09T22:31'); // date formatée, pas l’ISO
    expect(html).toContain('Fermer');
  });

  it('cas administrateur → 8 pastilles forcées cochées et désactivées (7 modules + le sous-droit « modifier après validation », RATT-EDIT lots A2/A3)', () => {
    const html = renderToStaticMarkup(createElement(DetailContenu, {
      compte: { ...compteCollab, role: 'administrateur' as const }, perms: compteCollab.perms, collaborateur: false,
      msg: null, enCours: false, ...idProps, peutModifierPermis: true, onToggle: noop, onToggleModif: noop, onEnregistrer: noop, onPromouvoir: noop, onFermer: noop,
    }));
    // LOT 5-DROITS — 10 et non 9 : le droit d'envoi de Gestion s'ajoute, forcé sur « Oui » et désactivé, exactement comme
    //   les huit tuiles et le sous-droit Permis. Un administrateur a tous les droits, et aucune case sur laquelle cliquer.
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(10);
    expect((html.match(/disabled/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });
});

describe('DetailContenu — édition d’identité (M3-4 Lot F2, F-1/F-2)', () => {
  it('expose deux champs prénom/nom éditables et un bouton « Enregistrer l’identité »', () => {
    const html = renderToStaticMarkup(createElement(DetailContenu, {
      compte: compteCollab, perms: compteCollab.perms, collaborateur: true, msg: null, enCours: false, ...idProps,
      peutModifierPermis: false, onToggle: noop, onToggleModif: noop, onEnregistrer: noop, onPromouvoir: noop, onFermer: noop,
    }));
    expect(html).toContain('value="Léa"');
    expect(html).toContain('value="M"');
    expect(html).toContain('Enregistrer l’identité');
  });

  it('l’identifiant s’affiche en TEXTE (jamais dans un input value), avec la mention d’immuabilité', () => {
    const html = renderToStaticMarkup(createElement(DetailContenu, {
      compte: compteCollab, perms: compteCollab.perms, collaborateur: true, msg: null, enCours: false, ...idProps,
      peutModifierPermis: false, onToggle: noop, onToggleModif: noop, onEnregistrer: noop, onPromouvoir: noop, onFermer: noop,
    }));
    expect(html).toContain('<span class="cpt-idval">lea@unique.test</span>'); // texte, pas un champ
    expect(html).not.toContain('value="lea@unique.test"'); // jamais un input désactivé trompeur
    expect(html).toContain('Non modifiable'); // mention sobre que l’identifiant n’est pas modifiable
  });

  it('l’édition d’identité est offerte AUSSI sur un administrateur (F-2)', () => {
    const html = renderToStaticMarkup(createElement(DetailContenu, {
      compte: { ...compteCollab, role: 'administrateur' as const }, perms: compteCollab.perms, collaborateur: false,
      msg: null, enCours: false, ...idProps, peutModifierPermis: true, onToggle: noop, onToggleModif: noop, onEnregistrer: noop, onPromouvoir: noop, onFermer: noop,
    }));
    expect(html).toContain('Enregistrer l’identité');
    expect(html).toContain('value="Léa"');
  });

  it('refus CLIENT : prénom vide (ou blancs seuls) → bouton « Enregistrer l’identité » désactivé', () => {
    const html = renderToStaticMarkup(createElement(DetailContenu, {
      compte: compteCollab, perms: compteCollab.perms, collaborateur: true, msg: null, enCours: false,
      idPrenom: '   ', idNom: 'M', onIdPrenom: noop, onIdNom: noop, onEnregistrerIdentite: noop,
      envoi: null, onChoisirEnvoi: noop,
      peutModifierPermis: false, onToggle: noop, onToggleModif: noop, onEnregistrer: noop, onPromouvoir: noop, onFermer: noop,
    }));
    // le bouton d’identité porte disabled ; la validation tombe avant tout appel serveur
    expect(html).toMatch(/Enregistrer l’identité/);
    expect(html).toContain('Prénom et nom sont obligatoires.');
    const boutonIdentite = html.slice(0, html.indexOf('Enregistrer l’identité'));
    expect(boutonIdentite.lastIndexOf('disabled')).toBeGreaterThan(boutonIdentite.lastIndexOf('<button'));
  });
});

describe('Aucune couleur bleue dans la page (charte : pas de bleu)', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/comptes/page.tsx', 'utf8');
  it('aucune valeur/classe bleue en dur', () => {
    expect(src).not.toMatch(/blue/i);
    expect(src).not.toMatch(/#0000ff|#00f\b|rgb\(\s*0\s*,\s*0\s*,\s*255/i);
  });
  it('le focus est explicitement stylé (anneau rouge) — le bleu par défaut du navigateur est neutralisé', () => {
    expect(src).toContain('focus-visible');
    expect(src).toContain('outline:2px solid var(--color-svv-red)');
  });
});

describe('Libellé de la règle administrateur (M3-4 Lot F1)', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/comptes/page.tsx', 'utf8');
  it('le texte exact figure, dans la colonne d’identité (classe cpt-regle), pas dans la rangée de boutons', () => {
    expect(src).toContain('Un administrateur ne peut pas être désactivé depuis l’interface.');
    expect(src).toContain('cpt-regle');
  });
  it('variante « réactivé » pour un administrateur désactivé (section désactivés)', () => {
    expect(src).toContain('Un administrateur ne peut pas être réactivé depuis l’interface.');
  });
  it('le vocabulaire « CLI » a disparu de l’UI, y compris du toast d’erreur (jargon incompréhensible)', () => {
    expect(src).not.toMatch(/\bCLI\b/);
  });
  it('l’ancienne mention « CLI uniquement » a disparu de l’UI (le code d’erreur serveur reste, lui, inchangé)', () => {
    expect(src).not.toContain('CLI uniquement');
    expect(src).not.toContain('cpt-cli');
  });
});

describe('Migration 017 — action changement_identite (M3-4 Lot F1, NON appliquée par ce run)', () => {
  const sql = readFileSync('db/migrations/017_action_changement_identite.sql', 'utf8');
  it('étend le CHECK avec changement_identite SANS retirer les 7 actions existantes', () => {
    for (const a of ['creation', 'desactivation', 'reactivation', 'changement_role', 'changement_permissions', 'reinitialisation_mot_de_passe', 'changement_mot_de_passe', 'changement_identite']) {
      expect(sql).toContain(`'${a}'`);
    }
  });
  it('rejouable : DROP CONSTRAINT IF EXISTS puis ADD, en transaction explicite', () => {
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS admin_utilisateur_log_action_check');
    expect(sql).toContain('ADD CONSTRAINT admin_utilisateur_log_action_check');
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;/);
  });
});

describe('DetailContenu — droits complémentaires GROUPÉS SOUS LEUR TUILE (lot 5-DROITS, décision c d’Arno)', () => {
  const noop2 = () => {};
  const idProps2 = { idPrenom: 'Léa', idNom: 'M', onIdPrenom: noop2, onIdNom: noop2, onEnregistrerIdentite: noop2 };
  const rendre = (perms: typeof compteCollab.perms, peutModifierPermis: boolean, collaborateur: boolean, envoi: boolean | null = null) =>
    renderToStaticMarkup(createElement(DetailContenu, {
      compte: { ...compteCollab, role: collaborateur ? ('collaborateur' as const) : ('administrateur' as const) },
      perms, peutModifierPermis, collaborateur, msg: null, enCours: false, ...idProps2,
      envoi, onChoisirEnvoi: noop2,
      onToggle: noop2, onToggleModif: noop2, onEnregistrer: noop2, onPromouvoir: noop2, onFermer: noop2,
    }));
  const boutonSousCase = (html: string) => { const i = html.indexOf('Modifier un permis après validation'); return html.slice(html.lastIndexOf('<button', i), i); };

  /**
   * 🔴 LE MASQUAGE CONDITIONNEL EST DEMANDÉ PAR ARNO (décision c du 24/09/2026), il ne retire aucune fonctionnalité :
   * décocher une tuile retire ses droits complémentaires (décision d), donc un droit affiché sous une tuile décochée
   * serait une case sans effet — c'est CELA qui trompait.
   */
  describe('Permis de construire', () => {
    it('tuile COCHÉE → le droit complémentaire apparaît, en retrait sous sa tuile', () => {
      const html = rendre({ ...compteCollab.perms, permis: true }, false, true);
      expect(html).toContain('Modifier un permis après validation');
      expect(html).toContain('cpt-tuile__sous');
    });

    it('tuile DÉCOCHÉE → il n’apparaît PAS du tout (et non plus « affiché mais désactivé »)', () => {
      expect(rendre({ ...compteCollab.perms, permis: false }, false, true)).not.toContain('Modifier un permis après validation');
    });

    it('son EFFET n’est pas touché : coché, il reste coché et actif', () => {
      const b = boutonSousCase(rendre({ ...compteCollab.perms, permis: true }, true, true));
      expect(/aria-pressed="true"/.test(b)).toBe(true);
      expect(/disabled/.test(b)).toBe(false);
    });

    it('administrateur → droit forcé coché ET désactivé (droits implicites, décision e)', () => {
      const b = boutonSousCase(rendre({ ...compteCollab.perms, permis: true }, false, false));
      expect(/disabled/.test(b)).toBe(true);
      expect(/aria-pressed="true"/.test(b)).toBe(true);
    });
  });

  describe('Gestion — le droit d’envoi, et sa réponse OBLIGATOIRE', () => {
    it('tuile DÉCOCHÉE → aucune question d’envoi n’est posée', () => {
      const html = rendre({ ...compteCollab.perms, gestion: false }, false, true);
      expect(html).not.toContain('gestion@criterimmo.fr');
    });

    it('tuile COCHÉE → la question apparaît sous elle, avec Oui et Non', () => {
      const html = rendre({ ...compteCollab.perms, gestion: true }, false, true);
      expect(html).toContain('Peut envoyer des mails au nom de gestion@criterimmo.fr');
      expect(html).toContain('Oui');
      expect(html).toContain('Non');
    });

    it('🔴 RIEN N’EST PRÉ-COCHÉ, et le mot « à décider » est ÉCRIT (jamais une couleur seule)', () => {
      const html = rendre({ ...compteCollab.perms, gestion: true }, false, true, null);
      expect(html).toContain('à décider');
      // On regarde le groupe Oui/Non LUI-MÊME : aucun de ses deux boutons n'est enfoncé. (Compter les `aria-pressed`
      //   de toute la page serait fragile — d'autres tuiles du compte de test sont cochées.)
      const groupe = html.slice(html.indexOf('cpt-ouinon'), html.indexOf('cpt-a-decider'));
      expect(groupe).not.toContain('aria-pressed="true"');
    });

    it('sans réponse → le message d’erreur est là ET le bouton d’enregistrement est désactivé', () => {
      const html = rendre({ ...compteCollab.perms, gestion: true }, false, true, null);
      expect(html).toContain('Répondez d’abord à la question');
      const i = html.indexOf('Enregistrer les permissions');
      expect(/disabled/.test(html.slice(html.lastIndexOf('<button', i), i))).toBe(true);
    });

    it('réponse donnée → plus d’erreur, enregistrement possible, et « à décider » disparaît', () => {
      for (const reponse of [true, false]) {
        const html = rendre({ ...compteCollab.perms, gestion: true }, false, true, reponse);
        expect(html).not.toContain('Répondez d’abord à la question');
        expect(html).not.toContain('à décider');
        const i = html.indexOf('Enregistrer les permissions');
        expect(/disabled/.test(html.slice(html.lastIndexOf('<button', i), i))).toBe(false);
      }
    });

    it('administrateur → la question ne se pose pas : droits implicites, aucune case (décision e)', () => {
      const html = rendre({ ...compteCollab.perms, gestion: true }, false, false);
      expect(html).not.toContain('à décider');
      expect(html).not.toContain('Répondez d’abord à la question');
    });
  });
});
