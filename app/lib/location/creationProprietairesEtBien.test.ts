import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 🔴🔴 Arno (18/11/2026, « Mandat par bien », 3) — « Un seul « Enregistrer » crée le propriétaire et le bien ensemble (tout ou rien). » La garde de
 * STRUCTURE : les fiches nouvelles sont écrites DANS la transaction du bien (un refus du bien n'en laisse aucune) ; leurs contrôles passent avant.
 * (L'épreuve réelle, un bien refusé sans aucune fiche créée, est faite sur la recette.)
 */
const src = readFileSync('app/lib/location/creationBienRepo.ts', 'utf8').replace(/\s+/g, ' ');
const tx = src.slice(src.indexOf('cree = await withTransaction(async (q) => {'), src.indexOf('} catch (e) { if (e instanceof MandatAConfirmer)'));

describe('🔴 le propriétaire et son bien, tout ou rien', () => {
  it('les fiches nouvelles sont écrites dans la transaction du bien, en tête (avant le verrou des propriétaires et le bien)', () => {
    expect(tx).toContain('for (const p of nouveaux) crees.push(await creerPersonneDans(q, p, auteur));');
    expect(tx.indexOf('creerPersonneDans(q, p, auteur)')).toBeLessThan(tx.indexOf('FOR UPDATE'));
    expect(tx).toContain('ids = [...crees, ...v.proprietaireIds.filter((x) => x !== PLACE_NOUVEAUX)];');
  });
  it('les cartes sont contrôlées AVANT (carte complète, fiches retenues, origine, préparation commune de l’annuaire) ; les suites, après un succès seulement', () => {
    const f = src.slice(src.indexOf('export async function creerProprietairesEtBien('), src.indexOf('const PLACE_NOUVEAUX'));
    expect(f).toContain('familleAUneCarteComplete(');
    expect(f).toContain('verifierEtPreparerCartes(o, cartes)');
    expect(f).toContain("if (r.etat === 'ok') for (const p of prepa.preparees) await apresCreationPersonne(p);");
    expect(f).not.toContain('creerPersonne(');
  });
  it('plus aucun statut « en gestion » ni n° de mandat écrit sur le propriétaire par la nouvelle page', () => {
    const page = readFileSync('app/(admin)/admin/(protected)/location/CreationProprietaires.tsx', 'utf8');
    expect(page).not.toMatch(/numeroMandat|enGestion/);
  });
});
