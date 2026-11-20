import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 🔴 Arno (20/11/2026) — la ligne « Conditions d'entrée et suivi commercial » de la Location : JUSTE SOUS l'en-tête du locataire (nom, capsule,
 * « Dossier Drive du bail ») et AU-DESSUS de « LE BAIL ». La fiche commune lui réserve cet emplacement (`sousEnteteLocataire`) ; la Gestion
 * ne le remplit pas (rien n'y change). L'ordre est lu dans la source de la vue du locataire.
 */
const src = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
const vue = src.slice(src.indexOf('function VueLocataire('));

describe('la fiche du locataire : l’ordre des blocs', () => {
  it('en-tête du locataire → l’emplacement de la Location → « LE BAIL » → « Coordonnées »', () => {
    const tete = vue.indexOf('<BoutonDossierBailEntete locataireId={f.id} />');
    const fin = vue.indexOf('</header>', tete);
    const emplacement = vue.indexOf('{sousEntete}');
    const bail = vue.indexOf('<ResumeBailFiche f={f} ouvrir={ouvrir} />');
    const coord = vue.indexOf('<BlocCartes titre="Coordonnées"');
    expect([tete, fin, emplacement, bail, coord].every((x) => x > 0)).toBe(true);
    expect(tete < fin && fin < emplacement && emplacement < bail && bail < coord).toBe(true);
  });

  it('l’emplacement passe de la fiche commune de la Location à la vue du locataire ; absent par défaut (la Gestion ne change pas)', () => {
    const fc = readFileSync('app/(admin)/admin/(protected)/gestion/FicheCommune.tsx', 'utf8');
    expect(fc).toContain('sousEnteteLocataire={sousEnteteLocataire}');
    expect(src).toContain('sousEntete={sousEnteteLocataire}');
    const page = readFileSync('app/(admin)/admin/(protected)/location/locataire/[id]/page.tsx', 'utf8');
    expect(page).toContain('sousEnteteLocataire={<ConditionsSuiviFicheLocataire locataireId={id} />}');
    expect(readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8')).not.toContain('sousEnteteLocataire');
  });
});
