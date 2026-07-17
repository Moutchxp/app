import { describe, it, expect } from 'vitest';
import { versCsvPreuveDesabo, COLONNES_PREUVE_DESABO, type LignePreuveDesabo } from './extraction';

/**
 * Forme du DOSSIER DE PREUVE des désabonnements (sérialiseur pur `versCsvPreuveDesabo`).
 *
 * ⚠️ 0 retrait en base au moment de l'écriture → ces tests couvrent la FORME des lignes (contrat du CSV), PAS la
 * requête sur données réelles. Les cas critiques du verrou produit y sont : une ligne SANS journal sort quand même
 * (colonnes journal vides), un EFFACÉ sort en identité vide (la preuve survit), un motif libre n'est jamais tronqué.
 */

function ligne(over: Partial<LignePreuveDesabo> = {}): LignePreuveDesabo {
  return {
    internaute_id: '11111111-1111-1111-1111-111111111111',
    prenom: 'Jean',
    nom: 'Test',
    email: 'jean@example.com',
    efface_a: null,
    finalite: 'email_marketing',
    etat: 'retire',
    horodatage: '2026-07-18 10:00:00+00',
    canal: 'email',
    texte_version: 1,
    texte_contenu: 'Vous acceptez de recevoir les communications par email.',
    a_la_demande_de: 'internaute',
    admin_auteur_id: null,
    motif: null,
    ...over,
  };
}

const ENTETE =
  'internaute_id,prenom,nom,email,efface,finalite,etat,horodatage,canal,texte_version,texte_contenu,a_la_demande_de,admin_auteur_id,motif';

describe('versCsvPreuveDesabo — forme du dossier de preuve', () => {
  it('en-tête dans l’ordre attendu ; aucune ligne → en-tête seul (pas de CRLF final)', () => {
    expect(COLONNES_PREUVE_DESABO.map((c) => c.entete).join(',')).toBe(ENTETE);
    expect(versCsvPreuveDesabo([])).toBe(ENTETE);
  });

  it("ligne 'retire' AVEC journal (admin) → toutes les colonnes remplies, dans l'ordre", () => {
    const csv = versCsvPreuveDesabo([ligne({ a_la_demande_de: 'admin', admin_auteur_id: 7, motif: 'demande écrite' })]);
    const l1 = csv.split('\r\n')[1];
    expect(l1).toBe(
      '11111111-1111-1111-1111-111111111111,Jean,Test,jean@example.com,non,email_marketing,retire,' +
        '2026-07-18 10:00:00+00,email,1,Vous acceptez de recevoir les communications par email.,admin,7,demande écrite',
    );
  });

  it("ligne 'retire' SANS journal → 3 colonnes de journal vides (a_la_demande_de, admin_auteur_id, motif)", () => {
    const csv = versCsvPreuveDesabo([ligne({ a_la_demande_de: null, admin_auteur_id: null, motif: null })]);
    const l1 = csv.split('\r\n')[1];
    expect(l1.endsWith(',,,')).toBe(true); // les 3 dernières colonnes vides — la ligne sort quand même
  });

  it('EFFACÉ → identité vide (prenom/nom/email) + efface=oui ; la preuve (finalité/état) survit', () => {
    const csv = versCsvPreuveDesabo([ligne({ prenom: null, nom: null, email: null, efface_a: '2026-07-19 00:00:00+00' })]);
    const l1 = csv.split('\r\n')[1];
    // internaute_id conservé, 3 champs identité vides, puis efface=oui, puis la finalité (preuve conservée)
    expect(l1.startsWith('11111111-1111-1111-1111-111111111111,,,,oui,email_marketing,')).toBe(true);
  });

  it('ré-accord après retrait → deux lignes distinctes (ligne de vie, jamais un état figé)', () => {
    const csv = versCsvPreuveDesabo([
      ligne({ etat: 'retire', horodatage: '2026-07-18 10:00:00+00' }),
      ligne({ etat: 'accorde', horodatage: '2026-07-18 12:00:00+00', canal: 'tunnel' }),
    ]);
    const lignes = csv.split('\r\n');
    expect(lignes).toHaveLength(3); // en-tête + 2 décisions
    expect(lignes[1]).toContain(',retire,');
    expect(lignes[2]).toContain(',accorde,');
  });

  it('motif LIBRE (virgules, guillemets, saut de ligne) → quoté RFC 4180, jamais tronqué', () => {
    const csv = versCsvPreuveDesabo([ligne({ motif: 'RGPD, "urgent", ligne1\nligne2' })]);
    const corps = csv.slice(csv.indexOf('\r\n') + 2);
    expect(corps).toContain('"RGPD, ""urgent"", ligne1\nligne2"'); // guillemets doublés, contenu intégral préservé
  });
});
