import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { filtresLignes, lignePasseFiltre, statutLigne, statutsLigne, type FaitsLigne } from './statutLignePreavis';
import { colonneRdv, colonnesRdv, missionDeLigne, ordonnerParRdv, rdvDuStatut, rdvsDeLigne, type LigneRdv } from './triRdvPreavis';
import { cartoucheEdls } from './frisePreavis';

/**
 * 🔴🔴 Arno (16/11/2026) — LA PRÉ-VISITE ET L'ÉTAT DES LIEUX FIXÉS EN MÊME TEMPS (à la réception du préavis, on fixe les deux dates d'un coup) :
 * deux statuts, deux rendez-vous dans la colonne, les deux filtres, le tri sur le prochain rendez-vous, le cartouche vert de la case 3.
 */
type Statut = 'alerte' | 'recu' | 'programmee' | 'effectuee' | 'refusee';
const PV = (statut: Statut, jour = '2099-01-10', collegues: { libelle: string; statut: string | null }[] = []) =>
  ({ statut, rdv: statut === 'recu' || statut === 'alerte' ? null : { jour, heure: '10:30' }, collegues });
const EDLS = (jour = '2099-02-03', statut: string | null = 'en_attente') => ({ jour, heure: '11:30', confieA: 'Claire Test', statut });
const MAINTENANT = '2026-11-16 12:00';

describe('deux statuts : pré-visite programmée ET état des lieux planifié', () => {
  it('« RDV pré-visite fixé » et « RDV état des lieux fixé » ; le statut « le plus avancé » reste l’état des lieux (tri par statut)', () => {
    const f: FaitsLigne = { previsite: PV('programmee'), edls: EDLS() };
    expect(statutsLigne(f)).toEqual(['rdv_previsite', 'rdv_edl']);
    expect(statutLigne(f)).toBe('rdv_edl');
  });
  it('pré-visite effectuée (compte rendu envoyé) ou refusée : un seul statut, « RDV état des lieux fixé »', () => {
    expect(statutsLigne({ previsite: PV('effectuee'), edls: EDLS() })).toEqual(['rdv_edl']);
    expect(statutsLigne({ previsite: PV('refusee'), edls: EDLS() })).toEqual(['rdv_edl']);
  });
  it('tous les autres cas : un seul statut (pré-visite seule, état des lieux seul, sortie validée)', () => {
    expect(statutsLigne({ previsite: PV('programmee'), edls: null })).toEqual(['rdv_previsite']);
    expect(statutsLigne({ previsite: PV('recu'), edls: EDLS() })).toEqual(['rdv_edl']);
    expect(statutsLigne({ previsite: PV('alerte'), edls: EDLS() })).toEqual(['rdv_edl']);
    expect(statutsLigne({ previsite: PV('programmee'), edls: EDLS(), sortieValidee: true })).toEqual(['edl_effectue']);
    expect(statutsLigne({ previsite: PV('recu') })).toEqual(['en_preavis']);
  });
});

describe('les filtres', () => {
  const lignes: FaitsLigne[] = [{ previsite: PV('programmee'), edls: EDLS() }, { previsite: PV('programmee') }, { previsite: PV('effectuee'), edls: EDLS() }, { previsite: PV('recu') }];
  it('la ligne aux deux rendez-vous est comptée et visible dans les DEUX filtres', () => {
    const n = Object.fromEntries(filtresLignes(lignes).map((x) => [x.filtre, x.nombre]));
    expect(n).toMatchObject({ en_preavis: 1, rdv_previsite: 2, rdv_edl: 2, previsite_effectuee: 0 });
    expect(lignePasseFiltre(lignes[0], new Set(['rdv_previsite']))).toBe(true);
    expect(lignePasseFiltre(lignes[0], new Set(['rdv_edl']))).toBe(true);
    expect(lignePasseFiltre(lignes[0], new Set(['en_preavis']))).toBe(false);
  });
  it('deux filtres choisis ensemble : la ligne n’apparaît qu’une fois ; vide (« Tous ») : chaque ligne une fois', () => {
    expect(lignes.filter((l) => lignePasseFiltre(l, new Set(['rdv_previsite', 'rdv_edl'])))).toHaveLength(3);
    expect(lignes.filter((l) => lignePasseFiltre(l, new Set()))).toHaveLength(lignes.length);
  });
});

describe('la colonne des rendez-vous et le tri', () => {
  const deux: LigneRdv = { previsite: PV('programmee', '2099-01-10', [{ libelle: 'Arno Test', statut: 'acceptee' }]), edls: EDLS('2099-02-03') };
  it('les deux dates, l’une sous l’autre : pré-visite puis état des lieux, chacune avec sa mission', () => {
    expect(colonnesRdv(deux, MAINTENANT).map((c) => c.texte)).toEqual(['Pré-visite · sam. 10/01 · 10h30', 'État des lieux · mar. 03/02 · 11h30']);
    expect(missionDeLigne(deux, 'previsite')).toEqual({ qui: 'Arno TEST', etat: 'confirme' });
    expect(missionDeLigne(deux, 'edl')).toEqual({ qui: 'Claire TEST', etat: 'attente' });
    // un seul rendez-vous : la colonne d'avant, inchangée
    expect(colonnesRdv({ previsite: PV('effectuee'), edls: EDLS() }, MAINTENANT).map((c) => c.texte)).toEqual(['État des lieux · mar. 03/02 · 11h30']);
    expect(colonnesRdv({ previsite: PV('recu') }, MAINTENANT)).toEqual([{ sorte: 'aucun', texte: '— Aucun RDV fixé' }]);
  });
  it('la mention rouge « date dépassée » sur CHAQUE rendez-vous concerné', () => {
    const passe: LigneRdv = { previsite: PV('programmee', '2026-11-01'), edls: EDLS('2026-11-10') };
    expect(colonnesRdv(passe, MAINTENANT).map((c) => ('depassee' in c ? c.depassee : null))).toEqual(['date dépassée — compte rendu à faire', 'date dépassée — sortie à valider']);
    const unSeul: LigneRdv = { previsite: PV('programmee', '2026-11-01'), edls: EDLS('2099-02-03') };
    expect(colonnesRdv(unSeul, MAINTENANT).map((c) => ('depassee' in c ? c.depassee : null))).toEqual(['date dépassée — compte rendu à faire', null]);
  });
  it('TRI : la ligne est datée par son PROCHAIN rendez-vous non réalisé (le plus tôt des deux), dans « Rendez-vous fixés »', () => {
    expect(rdvsDeLigne(deux).map((r) => r.sorte)).toEqual(['previsite', 'edl']);
    expect(rdvDuStatut(deux)).toMatchObject({ sorte: 'previsite', jour: '2099-01-10' });
    expect(colonneRdv(deux, MAINTENANT).sorte).toBe('previsite');
    // un état des lieux fixé AVANT la pré-visite : c'est lui qui date la ligne
    expect(rdvDuStatut({ previsite: PV('programmee', '2099-03-01'), edls: EDLS('2099-02-03') })).toMatchObject({ sorte: 'edl' });
    const L = [{ id: 'edl-20', previsite: PV('effectuee'), edls: EDLS('2099-01-20') }, { id: 'deux', ...deux }, { id: 'edl-05', previsite: PV('refusee'), edls: EDLS('2099-01-05') },
      { id: 'sans', previsite: PV('recu'), dateMax: '2099-05-01' }];
    const o = ordonnerParRdv(L, 'proches');
    expect(o.avecRdv.map((x) => x.id)).toEqual(['edl-05', 'deux', 'edl-20']);
    expect(o.sansRdv.map((x) => x.id)).toEqual(['sans']);
    expect(ordonnerParRdv(L, 'lointains').avecRdv.map((x) => x.id)).toEqual(['edl-20', 'deux', 'edl-05']);
  });
});

describe('la frise, case 3 : le cartouche VERT de l’état des lieux fixé', () => {
  it('« État des lieux programmé — le … de … à … », dessous « Prénom NOM : en attente / acceptée / refusée »', () => {
    const e = { jour: '2099-02-03', heure: '11:30', dureeMinutes: 60, confieA: 'Claire Test' };
    expect(cartoucheEdls({ ...e, statut: 'en_attente' })).toEqual({ texte: 'État des lieux programmé — le 03/02/2099 de 11h30 à 12h30', qui: 'Claire TEST', reponse: 'en attente', statut: 'en_attente' });
    expect(cartoucheEdls({ ...e, statut: 'acceptee' }).reponse).toBe('acceptée');
    expect(cartoucheEdls({ ...e, statut: 'refusee' }).reponse).toBe('refusée');
    // confié directement (sans demande) : acceptée ; sans heure : la date seule
    expect(cartoucheEdls({ ...e, statut: null }).reponse).toBe('acceptée');
    expect(cartoucheEdls({ ...e, heure: null, statut: 'acceptee' }).texte).toBe('État des lieux programmé — le 03/02/2099');
  });
});

describe('planifier l’état des lieux quel que soit l’état de la pré-visite (serveur)', () => {
  it('la planification, le déplacement et la réattribution ne consultent JAMAIS la pré-visite (programmée, refusée ou effectuée : mêmes règles)', () => {
    const src = readFileSync('app/lib/location/edlsRepo.ts', 'utf8');
    for (const f of ['planifierEdls', 'deplacerEdls', 'reattribuerEdls']) {
      const debut = src.indexOf(`export async function ${f}(`);
      expect(debut).toBeGreaterThan(-1);
      const fin = src.indexOf('\nexport ', debut + 10);
      expect(src.slice(debut, fin === -1 ? undefined : fin)).not.toMatch(/previsite/i);
    }
  });
});
