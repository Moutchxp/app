import { describe, expect, it } from 'vitest';
import { ACTIONS_SANS_ANNONCE, annonceDeLaReponse, libelleAction, requeteAConfirmer } from './confirmationEnregistrement';

/**
 * 🔴 Arno (21/10/2026) — TUILE LOCATION : chaque enregistrement se confirme (succès vert / erreur rouge, jamais de silence).
 * Ce que l'hôte annonce, requête par requête. PUR.
 */
const POST = (corps: unknown) => JSON.stringify(corps);

describe('🔴 quelles requêtes se confirment', () => {
  it('les ÉCRITURES vers la Location et la fiche commune ; jamais une lecture, une autre route, ni un écran qui confirme lui-même', () => {
    expect(requeteAConfirmer('/api/admin/location', 'POST', POST({ action: 'modifier-bien', id: 3 }), null)).toEqual({ action: 'modifier-bien', corps: { action: 'modifier-bien', id: 3 } });
    expect(requeteAConfirmer('http://h/api/admin/gestion/annuaire/location', 'POST', POST({ action: 'conditions-entree' }), null)?.action).toBe('conditions-entree');
    expect(requeteAConfirmer('/api/admin/gestion/annuaire', 'POST', POST({ action: 'modifier' }), null)?.action).toBe('modifier');
    expect(requeteAConfirmer('/api/admin/location/parametres', 'POST', POST({ action: 'destinataires' }), null)?.action).toBe('destinataires');
    expect(requeteAConfirmer('/api/admin/location/honoraires', 'POST', POST({ action: 'tva' }), null)?.action).toBe('tva');
    expect(requeteAConfirmer('/api/admin/location?lot=3', 'GET', undefined, null)).toBeNull();
    expect(requeteAConfirmer('/api/admin/location/nouvelle-location', 'POST', POST({ bailId: 1 }), null)).toBeNull();   // sa propre fenêtre
    expect(requeteAConfirmer('/api/admin/gestion/taches', 'POST', POST({ action: 'creer' }), null)).toBeNull();
    for (const a of ACTIONS_SANS_ANNONCE) expect(requeteAConfirmer('/api/admin/location', 'POST', POST({ action: a }), null)).toBeNull();
    expect(requeteAConfirmer('/api/admin/location', 'POST', POST({ action: 'modifier-bien' }), new Headers({ 'x-svav-confirmation': 'propre' }))).toBeNull();
  });
});

describe('🔴 ce qui s’annonce', () => {
  const ok = (action: string, corps: Record<string, unknown> = {}, json: unknown = { etat: 'ok' }) => annonceDeLaReponse({ action, corps: { action, ...corps }, statut: 200, json, fiche: 'DUPONT Paul' });

  it('le SUCCÈS : le titre de l’action, la fiche ; les remarques non bloquantes (mail, Drive)', () => {
    expect(ok('conditions-entree')).toEqual({ sorte: 'succes', titre: 'Conditions d’entrée enregistrées', lignes: [['Fiche', 'DUPONT Paul']], notes: [] });
    expect(ok('detacher-annexe', { detacher: true })).toMatchObject({ titre: 'Annexe détachée' });
    expect(ok('detacher-annexe', { detacher: false })).toMatchObject({ titre: 'Annexe rattachée à son bien' });
    expect(ok('sortir', { sujet: 'bien' })).toMatchObject({ titre: 'Bien sorti du portefeuille' });
    expect(ok('dossier-drive-bien', { geste: 'deplacer' })).toMatchObject({ titre: 'Dossier Drive déplacé' });
    expect(ok('reactiver', {}, { etat: 'ok', mail: { envoye: false, ignore: false, motif: 'aucun destinataire' } }))
      .toMatchObject({ notes: ['Enregistré, mais le mail de confirmation n’est pas parti : aucun destinataire.'] });
    expect(ok('statut-bien', {}, { etat: 'ok', drive: { ok: false, motif: 'RECETTE' } })).toMatchObject({ notes: ['Enregistré, mais le dossier Drive n’a pas été fait : RECETTE.'] });
    expect(ok('action-inconnue')).toMatchObject({ titre: 'Modification enregistrée' });
    expect(annonceDeLaReponse({ action: 'modifier', corps: {}, statut: 200, json: null, fiche: null })).toMatchObject({ sorte: 'succes', lignes: [] });
  });

  it('l’ÉCHEC : quoi, pourquoi, quoi faire, en français simple ; la saisie est conservée', () => {
    const r = annonceDeLaReponse({ action: 'complements-bien', corps: {}, statut: 200, json: { etat: 'refus', motif: 'La date du DPE est invalide.' }, fiche: null });
    expect(r).toEqual({ sorte: 'erreur', titre: 'Les informations du bien n’ont pas été enregistrées', echec: {
      quoi: 'Les informations du bien n’ont pas été enregistrées.', pourquoi: 'La date du DPE est invalide.',
      faire: 'Corrigez ce point, puis cliquez à nouveau sur le bouton.', conserve: 'Rien n’a été enregistré. Votre saisie est conservée : vous pouvez réessayer.' } });
    expect(annonceDeLaReponse({ action: 'modifier', corps: {}, statut: 403, json: { erreur: 'ACCES_REVOQUE' }, fiche: null })).toMatchObject({ echec: { pourquoi: 'Votre compte n’a pas le droit « Location », ou votre session a expiré.' } });
    expect(annonceDeLaReponse({ action: 'modifier', corps: {}, statut: 200, json: { etat: 'sans_schema' }, fiche: null })).toMatchObject({ echec: { faire: expect.stringContaining('mise à jour de la base') } });
    expect(annonceDeLaReponse({ action: 'modifier', corps: {}, statut: null, json: null, fiche: null })).toMatchObject({ echec: { pourquoi: 'Le serveur n’a pas répondu ou a rencontré une erreur technique.' } });
    expect(annonceDeLaReponse({ action: 'modifier', corps: {}, statut: 200, json: { etat: 'inconnu' }, fiche: null })).toMatchObject({ echec: { pourquoi: 'Cette fiche n’existe plus.' } });
    // L'échec d'un changement de statut se lit DANS sa fenêtre de confirmation (on y corrige) : pas de seconde modale.
    expect(annonceDeLaReponse({ action: 'statut-bien', corps: {}, statut: 200, json: { etat: 'refus', motif: 'x' }, fiche: null })).toBeNull();
  });

  it('chaque action recensée a ses mots (succès et échec)', () => {
    const actions = ['modifier', 'ordonner', 'archiver', 'restaurer', 'supprimer', 'separer', 'creer', 'ajouter-proprietaire', 'remplacer-proprietaire', 'ajouter-occupant',
      'depart', 'numero-mandat', 'en-gestion', 'modifier-bien', 'complements-bien', 'ajouter-annexe', 'rattacher-annexe', 'creer-locataire', 'ajouter-contact-syndic',
      'reactiver', 'sortir-biens', 'sortie-locataires', 'corriger-sortie-locataires', 'annuler-sortie-locataires', 'enregistrer-preavis', 'corriger-preavis',
      'annuler-preavis', 'planifier-edls', 'deplacer-edls', 'reattribuer-edls', 'etat-des-lieux', 'conditions-location', 'conditions-entree', 'creer-dossier-bail',
      'statut-bien', 'reglages', 'bareme', 'corriger-bareme', 'tva', 'destinataires', 'detacher-annexe', 'sortir', 'dossier-drive-bien'];
    for (const a of actions) {
      const l = libelleAction(a, {});
      expect(l.succes, a).not.toBe('Modification enregistrée');
      expect(l.echec, a).toMatch(/n’a pas|n’ont pas/);
    }
  });
});
