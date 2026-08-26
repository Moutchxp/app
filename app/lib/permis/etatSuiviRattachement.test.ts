import { describe, it, expect } from 'vitest';
import { resoudreEtatSuivi, MOTIF_DAACT, MOTIF_ACHEVE_SANS_BATI, type EntreeEtatSuivi } from './etatSuiviRattachement';
import type { EtatInitialDossier } from './preseanceAltitude';

/**
 * RATTACHEMENT — décision PURE de l'état d'un dossier (géométrie → DAACT en repli → préservation). Couvre les cas de la spec :
 * DAACT + polygone (géométrie tranche) · DAACT sans polygone (en_attente_bati) · réglage OFF · aucune conclusion auto (jamais
 * 'valide' par DAACT) · dossier tranché non ressuscité.
 */
const GEOM = (etat: EtatInitialDossier['etat'], auto = false): EtatInitialDossier => ({ etat, auto });
const e = (o: Partial<EntreeEtatSuivi> = {}): EntreeEtatSuivi =>
  ({ initialGeom: null, daactActif: true, acheveDaact: false, sansSignalGeometrique: false, existant: null, ...o });

describe('resoudreEtatSuivi — géométrie prioritaire', () => {
  it('DAACT + polygone nouveau (géométrie = ARBITRAGE) → dossier en arbitrage ; la géométrie tranche, pas la DAACT', () => {
    const d = resoudreEtatSuivi(e({ initialGeom: GEOM('arbitrage_demande'), acheveDaact: true }));
    expect(d).toMatchObject({ persister: true, etat: 'arbitrage_demande', auto: false, origineDaact: false });
  });
  it('géométrie = RATTACHEMENT_AUTOMATIQUE (valide auto) → conservée telle quelle (comportement existant, non touché)', () => {
    const d = resoudreEtatSuivi(e({ initialGeom: GEOM('valide', true) }));
    expect(d).toMatchObject({ persister: true, etat: 'valide', auto: true, origineDaact: false });
  });
});

describe('resoudreEtatSuivi — DAACT en repli (géométrie RIEN)', () => {
  it('DAACT SANS polygone (géométrie RIEN) + réglage ON → dossier « en_attente_bati », origine DAACT, JAMAIS valide', () => {
    const d = resoudreEtatSuivi(e({ initialGeom: null, daactActif: true, acheveDaact: true }));
    expect(d).toMatchObject({ persister: true, etat: 'en_attente_bati', auto: false, origineDaact: true });
  });
  it('AUCUNE ALTITUDE INJECTÉE sur le seul signal DAACT : l’état n’est JAMAIS « valide » et auto=false (rien ne déclenche l’injection)', () => {
    const d = resoudreEtatSuivi(e({ initialGeom: null, daactActif: true, acheveDaact: true }));
    expect(d.etat).not.toBe('valide'); // 'valide' est la SEULE porte vers une injection ; la DAACT ne l'ouvre jamais
    expect(d.auto).toBe(false);        // et jamais 'moteur:auto'
  });
  it('le motif de création DAACT est un texte dédié, traçable', () => {
    expect(MOTIF_DAACT).toMatch(/DAACT/);
    expect(MOTIF_DAACT).toMatch(/attente du bâti/i);
  });
});

describe('ÉTAGE 1 — DAACT sur un permis SANS signal géométrique (surélévation / surface constante)', () => {
  it('DAACT + géométrie RIEN + sansSignalGeometrique → « acheve_sans_bati » (jamais en_attente_bati, jamais valide)', () => {
    const d = resoudreEtatSuivi(e({ initialGeom: null, daactActif: true, acheveDaact: true, sansSignalGeometrique: true }));
    expect(d).toMatchObject({ persister: true, etat: 'acheve_sans_bati', auto: false });
    expect(d.etat).not.toBe('en_attente_bati'); // le motif « en attente du bâti » serait mensonger
    expect(d.etat).not.toBe('valide');           // jamais d'injection
  });
  it('MÊME cas mais AVEC signal géométrique possible (extension) → comportement ACTUEL « en_attente_bati »', () => {
    const d = resoudreEtatSuivi(e({ initialGeom: null, daactActif: true, acheveDaact: true, sansSignalGeometrique: false }));
    expect(d).toMatchObject({ persister: true, etat: 'en_attente_bati' });
  });
  it('la géométrie PRIME : un polygone détecté (arbitrage) l’emporte sur « sans signal » (le type ne bloque pas un vrai signal)', () => {
    const d = resoudreEtatSuivi(e({ initialGeom: GEOM('arbitrage_demande'), acheveDaact: true, sansSignalGeometrique: true }));
    expect(d.etat).toBe('arbitrage_demande');
  });
  it('un dossier CLÔTURÉ (clos_sans_bati) n’est PAS rouvert par une DAACT (terminal préservé)', () => {
    const d = resoudreEtatSuivi(e({ initialGeom: null, daactActif: true, acheveDaact: true, sansSignalGeometrique: true, existant: { etat: 'clos_sans_bati', valideParHumain: false } }));
    expect(d).toMatchObject({ persister: true, etat: 'clos_sans_bati', preserve: true });
  });
  it('le motif dédié dit la vérité : rien à attendre, emprise au sol inchangée, hauteur = futur LiDAR', () => {
    expect(MOTIF_ACHEVE_SANS_BATI).toMatch(/achevés/i);
    expect(MOTIF_ACHEVE_SANS_BATI).toMatch(/emprise au sol/i);
    expect(MOTIF_ACHEVE_SANS_BATI).toMatch(/LiDAR/);
    expect(MOTIF_ACHEVE_SANS_BATI).not.toMatch(/\bcorps\b/); // vocabulaire « bâtiment », jamais « corps »
  });
});

describe('resoudreEtatSuivi — réglage désactivé / permis non achevé', () => {
  it('réglage DÉSACTIVÉ (daactActif=false) + achevé → AUCUN dossier (persister=false)', () => {
    expect(resoudreEtatSuivi(e({ initialGeom: null, daactActif: false, acheveDaact: true }))).toMatchObject({ persister: false });
  });
  it('réglage ON mais permis NON achevé (acheveDaact=false) + géométrie RIEN → aucun dossier', () => {
    expect(resoudreEtatSuivi(e({ initialGeom: null, daactActif: true, acheveDaact: false }))).toMatchObject({ persister: false });
  });
});

describe('resoudreEtatSuivi — un dossier tranché n’est pas ressuscité par une DAACT', () => {
  it('existant REFUSÉ + DAACT (géométrie RIEN) → reste « refuse » (préservé), pas d’origine DAACT', () => {
    const d = resoudreEtatSuivi(e({ initialGeom: null, daactActif: true, acheveDaact: true, existant: { etat: 'refuse', valideParHumain: false } }));
    expect(d).toMatchObject({ persister: true, etat: 'refuse', preserve: true, origineDaact: false });
  });
  it('existant VALIDÉ PAR UN HUMAIN + DAACT → reste « valide » (jamais rétrogradé en en_attente)', () => {
    const d = resoudreEtatSuivi(e({ initialGeom: null, daactActif: true, acheveDaact: true, existant: { etat: 'valide', valideParHumain: true } }));
    expect(d).toMatchObject({ persister: true, etat: 'valide', preserve: true });
  });
  it('existant ANNULÉ PAR LIDAR + géométrie RIEN + DAACT → reste « annule_par_lidar »', () => {
    const d = resoudreEtatSuivi(e({ initialGeom: null, daactActif: true, acheveDaact: true, existant: { etat: 'annule_par_lidar', valideParHumain: false } }));
    expect(d).toMatchObject({ persister: true, etat: 'annule_par_lidar', preserve: true });
  });
  it('existant « valide AUTO » (pas humain) → PAS préservé : la réévaluation peut le mettre à jour', () => {
    const d = resoudreEtatSuivi(e({ initialGeom: GEOM('arbitrage_demande'), existant: { etat: 'valide', valideParHumain: false } }));
    expect(d).toMatchObject({ persister: true, etat: 'arbitrage_demande', preserve: false });
  });
});
