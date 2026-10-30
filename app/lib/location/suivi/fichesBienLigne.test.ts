import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { groupesFicheBien, titreAnnexeLigne } from './fichesBienLigne';

/**
 * 🔴 LOT LS3 / LS4 (Arno, 30/10/2026) — « Fiche du bien » d'une ligne du Suivi du mois. Règle d'Arno (LS4) : un bien principal et TOUTES ses
 * annexes = UN SEUL bouton (« Fiche du bien — [adresse] · + N annexe(s) »), qui ouvre la fiche du bien principal ; les petits liens « + annexe »
 * (LS3) sont retirés ; la fiche du bien liste ses annexes, chacune avec le lien vers sa fiche. Cas de CHALAH / REIFHI (production).
 */
const adresse = '25 Rue Henri Barbusse GENNEVILLIERS';
const logement = { id: 10, libelle: adresse, annexeDe: null, categorie: null, nature: null, typeBien: null, porte: null };
const annexe = (id: number, categorie: string, porte: string | null = null) => ({ id, libelle: adresse, annexeDe: 10, categorie, nature: null, typeBien: null, porte });
const lignes = (lots: Parameters<typeof groupesFicheBien>[0]) => groupesFicheBien(lots).map((g) => [g.principal.id, g.libelle, g.annexes.map((a) => a.lot.id)]);

describe('🔴 LOT LS4 — un bien principal et ses annexes = un seul bouton « Fiche du bien »', () => {
  it('bien sans annexe : « Fiche du bien », comme avant', () => {
    expect(lignes([logement])).toEqual([[10, 'Fiche du bien', []]]);
  });

  it('bien + 1 annexe (le cas de CHALAH) : un seul bouton « Fiche du bien — [adresse] · + 1 annexe »', () => {
    expect(lignes([logement, annexe(11, 'parking', '12')])).toEqual([[10, `Fiche du bien — ${adresse} · + 1 annexe`, [11]]]);
  });

  it('bien + 3 annexes : un seul bouton « … · + 3 annexes », qui ouvre le bien principal', () => {
    const g = groupesFicheBien([logement, annexe(11, 'parking', '12'), annexe(12, 'cave', '4'), annexe(13, 'box')]);
    expect(g.map((x) => [x.principal.id, x.libelle, x.annexes.map((a) => a.titre)])).toEqual([[10, `Fiche du bien — ${adresse} · + 3 annexes`, ['Parking n° 12', 'Cave n° 4', 'Box']]]);
  });

  it('deux biens principaux sur la même ligne : un bouton par bien principal, chacun avec ses annexes comptées dedans', () => {
    const autre = { ...logement, id: 20, libelle: 'Appartement — 3 rue B PUTEAUX' };
    expect(lignes([logement, autre, annexe(11, 'parking'), { ...annexe(21, 'cave'), annexeDe: 20 }, { ...annexe(22, 'box'), annexeDe: 20 }])).toEqual([
      [10, `Fiche du bien — ${adresse} · + 1 annexe`, [11]], [20, 'Fiche du bien — Appartement — 3 rue B PUTEAUX · + 2 annexes', [21, 22]]]);
  });

  it('annexe dont le logement n’est pas sur la ligne : elle reste un bouton à part (inchangé)', () => {
    expect(lignes([{ ...annexe(11, 'parking'), annexeDe: 99 }])).toEqual([[11, 'Fiche du bien', []]]);
    expect(lignes([logement, { ...annexe(11, 'parking'), annexeDe: 99 }])).toEqual([[10, `Fiche du bien — ${adresse}`, []], [11, `Fiche du bien — ${adresse}`, []]]);
  });

  it('le nom d’une annexe (bulle du bouton, fiche) : sa catégorie, sinon la nature WIPPIMMO, sinon « Annexe » ; son numéro s’il est saisi', () => {
    expect([titreAnnexeLigne(annexe(11, 'parking', '12')), titreAnnexeLigne({ ...annexe(11, 'parking'), categorie: null, nature: 'Garage' }),
      titreAnnexeLigne({ ...annexe(11, 'parking', ' '), categorie: null })]).toEqual(['Parking n° 12', 'Garage', 'Annexe']);
  });

  it('l’écran : plus de petits liens « + annexe » sous le bouton ; un bouton par groupe (utilisable par un observateur : il n’ajoute rien)', async () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/FeuilleDuMois.tsx', 'utf8');
    expect(src).toContain('groupesFicheBien(a.lots ?? []).map((g) => {');
    expect(src).not.toContain('+ annexe : {x.titre}');
    expect(src).not.toContain('data-fiche-annexe=');
    expect(src).toContain('data-fiche-bien={g.principal.id} data-nb-annexes={g.annexes.length}');
    const { estBoutonAction } = await import('../../../(admin)/admin/(protected)/ModeObservateur');
    expect(estBoutonAction('button', `Fiche du bien — ${adresse} · + 3 annexes`)).toBe(false);
  });

  it('la fiche du bien liste ses annexes (bloc « Annexes ») ; chacune existante a son lien « Fiche de l’annexe ↗ » (nouvel onglet)', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/CreationBien.tsx', 'utf8');
    expect(src).toContain('<ul className="loc-annexes" data-annexes>');
    expect(src).toContain('{a.id != null && <a className="svv-btn svv-btn-outline gst-btn" href={`/admin/location/bien/${a.id}`} target="_blank" rel="noopener noreferrer"');
    expect(src).toContain('data-lien-fiche-annexe={a.id}>Fiche de l’annexe ↗</a>}');
  });
});
