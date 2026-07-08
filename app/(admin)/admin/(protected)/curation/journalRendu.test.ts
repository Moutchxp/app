import { describe, it, expect } from 'vitest';
import { libelleAction, cleabsCourt, formaterHorodatage, horodatageTitle, nomAffiche, type LigneJournal } from './journalRendu';

function ligne(partial: Partial<LigneJournal>): LigneJournal {
  return {
    id: '1', ts: '2026-07-08T11:24:00Z', action: 'deplacement', entite_id: 5, cleabs: null,
    avant: null, apres: null, nom_affiche: 'X', famille_affiche: 'mh', supprimee: false, ...partial,
  };
}

describe('libelleAction — 9 actions + repli', () => {
  it('deplacement / annulation_deplacement / creation / suppression', () => {
    expect(libelleAction(ligne({ action: 'deplacement' }))).toBe('Point déplacé');
    expect(libelleAction(ligne({ action: 'annulation_deplacement' }))).toBe('Déplacement annulé');
    expect(libelleAction(ligne({ action: 'creation_entite_manuelle' }))).toBe('Créée');
    expect(libelleAction(ligne({ action: 'suppression_entite_manuelle' }))).toBe('Supprimée');
  });

  it('rattachement / detachement / verification → cleabs tronqué (12 derniers)', () => {
    const c = 'BATIMENT0000000245184819';
    const court = '…' + c.slice(-12);
    expect(libelleAction(ligne({ action: 'rattachement', cleabs: c }))).toBe(`Rattachée au bâtiment ${court}`);
    expect(libelleAction(ligne({ action: 'detachement', cleabs: c }))).toBe(`Détachée du bâtiment ${court}`);
    expect(libelleAction(ligne({ action: 'verification', cleabs: c }))).toBe(`Liaison vérifiée ${court}`);
  });

  it('renommage : avec ancien nom → « Renommée "a" → "b" »', () => {
    expect(libelleAction(ligne({ action: 'renommage', avant: { nom: 'poste' }, apres: { nom: 'Poste' } })))
      .toBe('Renommée "poste" → "Poste"');
  });

  it('renommage : avant.nom NULL → « Nommée "b" »', () => {
    expect(libelleAction(ligne({ action: 'renommage', avant: { nom: null }, apres: { nom: 'poste' } })))
      .toBe('Nommée "poste"');
  });

  it('annulation_edition : normalise nb_lignes (nombre ET string → nombre)', () => {
    expect(libelleAction(ligne({ action: 'annulation_edition', apres: { nb_lignes: 3 } }))).toBe('Édition annulée (3 actions)');
    expect(libelleAction(ligne({ action: 'annulation_edition', apres: { nb_lignes: '3', jusqu_a: '157' } }))).toBe('Édition annulée (3 actions)');
  });

  it('action inconnue → repli neutre (brut), ne plante pas', () => {
    expect(libelleAction(ligne({ action: 'action_future_x' }))).toBe('action_future_x');
  });
});

describe('cleabsCourt', () => {
  it('null → chaîne vide', () => expect(cleabsCourt(null)).toBe(''));
  it('court (≤12) → inchangé', () => expect(cleabsCourt('BAT123')).toBe('BAT123'));
  it('long → « … » + 12 derniers', () => {
    const c = 'BATIMENT0000000245184819';
    expect(cleabsCourt(c)).toBe('…' + c.slice(-12));
    expect(cleabsCourt(c).length).toBe(13); // ellipse + 12
  });
});

describe('formaterHorodatage / horodatageTitle', () => {
  it('déterministe (Europe/Paris, été = +02) : contient jour + heure locale', () => {
    const s = formaterHorodatage('2026-07-08T11:24:00Z'); // 11:24 UTC → 13:24 Paris
    expect(s).toContain('8');
    expect(s).toContain('juil');
    expect(s).toContain('13:24');
  });
  it('title = ISO complet', () => {
    expect(horodatageTitle('2026-07-08T11:24:00Z')).toBe('2026-07-08T11:24:00.000Z');
  });
  it('ts invalide → renvoyé tel quel (pas de crash)', () => {
    expect(formaterHorodatage('pas-une-date')).toBe('pas-une-date');
    expect(horodatageTitle('pas-une-date')).toBe('pas-une-date');
  });
});

describe('nomAffiche (volet global)', () => {
  it('entité existante → nom brut', () => {
    expect(nomAffiche({ nom_affiche: 'Maison', supprimee: false })).toBe('Maison');
  });
  it('entité supprimée avec nom résolu → suffixe « (supprimée) »', () => {
    expect(nomAffiche({ nom_affiche: 'Hotel de ville', supprimee: true })).toBe('Hotel de ville (supprimée)');
  });
  it('fallback « entité supprimée #id » → pas de suffixe redondant', () => {
    expect(nomAffiche({ nom_affiche: 'entité supprimée #42', supprimee: true })).toBe('entité supprimée #42');
  });
});
