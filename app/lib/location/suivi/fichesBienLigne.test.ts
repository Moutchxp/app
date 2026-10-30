import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { groupesFicheBien, titreAnnexeLigne } from './fichesBienLigne';

/**
 * 🔴 LOT LS3 (Arno, 30/10/2026) — « Fiche du bien » d'une ligne du Suivi du mois : un bouton par bien principal, l'annexe d'un bien de la même
 * ligne en petit lien « + annexe : … » (jamais deux boutons au même libellé). Cas de CHALAH / REIFHI (production) : un bail « Gestion seule »
 * sur un logement et son annexe, à la même adresse (25 Rue Henri Barbusse, GENNEVILLIERS).
 */
const adresse = '25 Rue Henri Barbusse GENNEVILLIERS';
const logement = { id: 10, libelle: adresse, annexeDe: null, categorie: null, nature: null, typeBien: null, porte: null };
const parking = { id: 11, libelle: adresse, annexeDe: 10, categorie: 'parking', nature: null, typeBien: null, porte: '12' };

describe('🔴 LOT LS3 — les boutons « Fiche du bien » d’une ligne', () => {
  it('un seul bien : un bouton « Fiche du bien », comme avant', () => {
    expect(groupesFicheBien([logement]).map((g) => [g.principal.id, g.libelle, g.annexes])).toEqual([[10, 'Fiche du bien', []]]);
  });

  it('logement + annexe à la même adresse (le cas de CHALAH) : UN bouton « Fiche du bien — [adresse] » et le lien « + annexe : Parking n° 12 »', () => {
    const g = groupesFicheBien([logement, parking]);
    expect(g.map((x) => [x.principal.id, x.libelle, x.annexes.map((a) => [a.lot.id, a.titre])])).toEqual([[10, `Fiche du bien — ${adresse}`, [[11, 'Parking n° 12']]]]);
    expect(new Set(g.map((x) => x.libelle)).size).toBe(g.length);
  });

  it('le nom d’une annexe : sa catégorie, sinon la nature WIPPIMMO (« Garage »), sinon « Annexe » ; son numéro s’il est saisi', () => {
    expect([titreAnnexeLigne(parking), titreAnnexeLigne({ ...parking, categorie: null, nature: 'Garage', porte: null }),
      titreAnnexeLigne({ ...parking, categorie: null, porte: ' ' })]).toEqual(['Parking n° 12', 'Garage', 'Annexe']);
  });

  it('deux biens principaux distincts : deux boutons, chacun à son libellé (inchangé) ; une annexe dont le bien principal n’est pas sur la ligne reste un bouton', () => {
    const autre = { ...logement, id: 20, libelle: 'Appartement — 3 rue B PUTEAUX' };
    expect(groupesFicheBien([logement, autre]).map((g) => g.libelle)).toEqual([`Fiche du bien — ${adresse}`, 'Fiche du bien — Appartement — 3 rue B PUTEAUX']);
    expect(groupesFicheBien([{ ...parking, annexeDe: 99 }]).map((g) => [g.principal.id, g.libelle, g.annexes.length])).toEqual([[11, 'Fiche du bien', 0]]);
  });

  it('l’écran : le regroupement remplace la liste ; l’annexe est un LIEN (le mode observateur ne grise que les boutons) qui ouvre sa fiche', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/FeuilleDuMois.tsx', 'utf8');
    expect(src).toContain('groupesFicheBien(a.lots ?? []).map((g) => {');
    expect(src).toContain('<a key={`annexe-${x.lot.id}`} href={`/admin/location/bien/${x.lot.id}`} className="fdm-lien-annexe"');
    expect(src).toContain('data-fiche-annexe={x.lot.id} title={x.lot.libelle}>+ annexe : {x.titre}</a>');
    expect(src).toContain('data-fiche-bien={g.principal.id} title={g.principal.libelle}>{g.libelle}</button>');
    // la donnée : le bien principal d'une annexe NON détachée, pris parmi les biens de la même ligne
    const repo = readFileSync('app/lib/location/suivi/tableauBordRepo.ts', 'utf8').replace(/\s+/g, ' ');
    expect(repo).toContain("'annexeDe', ${avecAnnexes ? `(SELECT ax.parent_id FROM gestion_lot_annexe ax WHERE ax.annexe_id = lt.id");
  });
});
