import { describe, it, expect } from 'vitest';
import { echeanceDe, etatEcheance, fenetreCada, fenetreCadaDepuisRefus, fenetreCadaEffective, refusAcquis, releveEstFraiche, type EntreeEcheance, type ReglagesEcheance } from './echeance';

/**
 * R6 — échéance PURE. Mois calendaire (pas 30 jours) + débordement de fin de mois ; ordre de priorité des états
 * (non_delivree > repondue > indeterminee > depassee/proche/en_cours). Le point central : jamais de silence non vérifié.
 */
const REG: ReglagesEcheance = { echeanceAlerteJours: 7, releveFraicheurHeures: 48 };

// Base « envoyée, relève fraîche, 5 dossiers, aucun satisfait » — chaque test surcharge ce qu'il éprouve.
function entree(over: Partial<EntreeEcheance> = {}): EntreeEcheance {
  return {
    envoyeLe: new Date('2026-03-15T10:00:00Z'),
    statutAcheminement: 'envoye',
    dossiersActifs: 5,
    dossiersSatisfaits: 0,
    derniereReleveOkLe: new Date('2026-04-20T02:00:00Z'),
    ...over,
  };
}

describe('R6 — echeanceDe : un mois calendaire + débordement de fin de mois', () => {
  it('cas simple : 15 janvier → 15 février', () => {
    expect(echeanceDe(new Date('2026-01-15T10:00:00Z')).toISOString()).toBe('2026-02-15T10:00:00.000Z');
  });

  it('débordement : 31 janvier → 28 février (année NON bissextile 2026)', () => {
    expect(echeanceDe(new Date('2026-01-31T10:00:00Z')).toISOString()).toBe('2026-02-28T10:00:00.000Z');
  });

  it('débordement : 31 janvier → 29 février (année bissextile 2024)', () => {
    expect(echeanceDe(new Date('2024-01-31T10:00:00Z')).toISOString()).toBe('2024-02-29T10:00:00.000Z');
  });

  it('débordement : 31 mars → 30 avril (avril n’a que 30 jours)', () => {
    expect(echeanceDe(new Date('2026-03-31T08:30:00Z')).toISOString()).toBe('2026-04-30T08:30:00.000Z');
  });

  it('passage d’année : 15 décembre → 15 janvier suivant', () => {
    expect(echeanceDe(new Date('2025-12-15T00:00:00Z')).toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });
});

describe('R6 — etatEcheance : ordre de priorité et silence vérifié', () => {
  it('non_delivree (rebond) l’emporte sur une échéance TRÈS dépassée', () => {
    const r = etatEcheance(entree({ statutAcheminement: 'rebond', envoyeLe: new Date('2026-01-01T10:00:00Z') }), new Date('2026-06-01T10:00:00Z'), REG);
    expect(r.etat).toBe('non_delivree');
  });

  it('non_delivree (echec) idem', () => {
    expect(etatEcheance(entree({ statutAcheminement: 'echec' }), new Date('2026-06-01T10:00:00Z'), REG).etat).toBe('non_delivree');
  });

  it('TOUS les dossiers satisfaits → repondue (même relève absente : c’est un fait connu)', () => {
    const r = etatEcheance(entree({ dossiersActifs: 5, dossiersSatisfaits: 5, derniereReleveOkLe: null }), new Date('2026-04-20T10:00:00Z'), REG);
    expect(r.etat).toBe('repondue');
  });

  it('CERTAINS dossiers satisfaits AVANT l’échéance → repondue_partiellement, échéance ancrée sur l’envoi d’origine', () => {
    // envoi 15 mars → échéance 15 avril ; maintenant 10 avril (avant), relève fraîche → réponse partielle, délai courant.
    const maintenant = new Date('2026-04-10T10:00:00Z');
    const r = etatEcheance(entree({ dossiersActifs: 5, dossiersSatisfaits: 2, derniereReleveOkLe: new Date('2026-04-10T06:00:00Z') }), maintenant, REG);
    expect(r.etat).toBe('repondue_partiellement');
    // joursRestants comptés depuis l’échéance d’ORIGINE (15 avril), pas depuis la réponse partielle → 5 jours.
    expect(r.joursRestants).toBe(5);
  });

  it('CERTAINS satisfaits APRÈS l’échéance → depassee (les dossiers restants sont dus) — pas de nouveau délai', () => {
    const r = etatEcheance(entree({ dossiersActifs: 5, dossiersSatisfaits: 2 }), new Date('2026-04-20T10:00:00Z'), REG);
    expect(r.etat).toBe('depassee');
  });

  it('message rattaché mais AUCUN dossier satisfait → état inchangé (ce n’est pas une communication)', () => {
    // 0 satisfait se comporte exactement comme « non répondu » : ici échéance passée + relève fraîche → depassee.
    const r = etatEcheance(entree({ dossiersActifs: 5, dossiersSatisfaits: 0 }), new Date('2026-04-20T10:00:00Z'), REG);
    expect(r.etat).toBe('depassee');
    expect(r.etat).not.toBe('repondue');
    expect(r.etat).not.toBe('repondue_partiellement');
  });

  it('POINT CENTRAL : relève trop ancienne → indeterminee MÊME si l’échéance est largement dépassée', () => {
    // échéance = 15 avril ; maintenant = 30 avril (dépassé) ; dernière relève = 10 avril (20 j > 48 h) → indéterminée.
    const r = etatEcheance(entree({ derniereReleveOkLe: new Date('2026-04-10T10:00:00Z') }), new Date('2026-04-30T10:00:00Z'), REG);
    expect(r.etat).toBe('indeterminee');
  });

  it('jamais relevé (null) → indeterminee', () => {
    expect(etatEcheance(entree({ derniereReleveOkLe: null }), new Date('2026-04-30T10:00:00Z'), REG).etat).toBe('indeterminee');
  });

  it('relève fraîche + échéance passée → depassee', () => {
    // échéance = 15 avril 10:00 ; maintenant = 20 avril ; relève = 20 avril 02:00 (8 h < 48 h) → dépassée.
    const r = etatEcheance(entree(), new Date('2026-04-20T10:00:00Z'), REG);
    expect(r.etat).toBe('depassee');
    expect(r.joursRestants).toBeLessThan(0);
  });

  it('proche AU SEUIL EXACT (échéance dans exactement echeance_alerte_jours) → proche', () => {
    const echeance = echeanceDe(new Date('2026-03-15T10:00:00Z')); // 15 avril 10:00
    const maintenant = new Date(echeance.getTime() - REG.echeanceAlerteJours * 86_400_000); // exactement 7 j avant
    const r = etatEcheance(entree({ derniereReleveOkLe: new Date(maintenant.getTime() - 3_600_000) }), maintenant, REG);
    expect(r.etat).toBe('proche');
    expect(r.joursRestants).toBe(7);
  });

  it('loin de l’échéance (relève fraîche) → en_cours', () => {
    const echeance = echeanceDe(new Date('2026-03-15T10:00:00Z'));
    const maintenant = new Date(echeance.getTime() - 10 * 86_400_000); // 10 j avant > seuil 7
    const r = etatEcheance(entree({ derniereReleveOkLe: new Date(maintenant.getTime() - 3_600_000) }), maintenant, REG);
    expect(r.etat).toBe('en_cours');
    expect(r.joursRestants).toBe(10);
  });

  it('pas encore envoyée (envoyeLe null, non rebond) → en_cours, le délai ne court pas', () => {
    const r = etatEcheance(entree({ envoyeLe: null, statutAcheminement: 'en_attente' }), new Date('2026-04-20T10:00:00Z'), REG);
    expect(r.etat).toBe('en_cours');
  });

  it('motif TOUJOURS non vide, quel que soit l’état', () => {
    const cas: EntreeEcheance[] = [
      entree({ statutAcheminement: 'rebond' }),
      entree({ dossiersActifs: 5, dossiersSatisfaits: 5 }),                                   // repondue
      entree({ dossiersActifs: 5, dossiersSatisfaits: 2, envoyeLe: new Date('2026-04-08T10:00:00Z'), derniereReleveOkLe: new Date('2026-04-20T09:00:00Z') }), // repondue_partiellement
      entree({ derniereReleveOkLe: null }),                                                   // indeterminee
      entree(),                                                                               // depassee
      entree({ envoyeLe: null }),                                                             // en_cours
    ];
    for (const c of cas) expect(etatEcheance(c, new Date('2026-04-20T10:00:00Z'), REG).motif.length).toBeGreaterThan(0);
  });
});

describe('X2 — releveEstFraiche (critère extrait, réutilisé par la saisine CADA)', () => {
  const now = new Date('2026-04-20T12:00:00Z');
  it('null (jamais relevé) → non fraîche', () => expect(releveEstFraiche(null, now, 48)).toBe(false));
  it('récente (< fraîcheur) → fraîche', () => expect(releveEstFraiche(new Date('2026-04-20T06:00:00Z'), now, 48)).toBe(true));
  it('trop ancienne (> fraîcheur) → non fraîche', () => expect(releveEstFraiche(new Date('2026-04-01T00:00:00Z'), now, 48)).toBe(false));
});

describe('X2 — fenetreCada : refus tacite (+1 mois), forclusion (+2 mois), 3 états dont forclusion au jour près', () => {
  const ENVOI = new Date('2026-03-14T10:00:00Z'); // refus tacite 14 avr ; forclusion 14 juin

  it('refus tacite = envoi + 1 mois ; forclusion = refus + 2 mois (mois calendaires)', () => {
    const f = fenetreCada(ENVOI, new Date('2026-05-01T00:00:00Z'));
    expect(f.refusTaciteLe.toISOString()).toBe(echeanceDe(ENVOI).toISOString());               // +1 mois
    expect(f.forclusionLe.toISOString()).toBe(echeanceDe(echeanceDe(echeanceDe(ENVOI))).toISOString()); // +3 mois depuis l'envoi
  });

  it('avant le refus tacite → « pas_ouverte »', () => {
    expect(fenetreCada(ENVOI, new Date('2026-04-01T10:00:00Z')).etat).toBe('pas_ouverte'); // < 14 avr
  });

  it('entre refus et forclusion → « ouverte »', () => {
    expect(fenetreCada(ENVOI, new Date('2026-05-10T10:00:00Z')).etat).toBe('ouverte');
  });

  it('AU JOUR PRÈS : à la forclusion exacte → encore « ouverte » ; une milliseconde après → « fermee »', () => {
    const forclusion = echeanceDe(echeanceDe(echeanceDe(ENVOI)));
    expect(fenetreCada(ENVOI, forclusion).etat).toBe('ouverte');                                  // borne inclusive
    expect(fenetreCada(ENVOI, new Date(forclusion.getTime() + 1)).etat).toBe('fermee');           // 1 ms après → forclos
  });

  it('joursAvantForclusion : positif avant, négatif après', () => {
    expect(fenetreCada(ENVOI, new Date('2026-05-10T10:00:00Z')).joursAvantForclusion).toBeGreaterThan(0);
    expect(fenetreCada(ENVOI, new Date('2026-07-01T10:00:00Z')).joursAvantForclusion).toBeLessThan(0);
  });
});

describe('B2 — dépôt téléservice : l’ancre envoyeLe fait courir l’échéance', () => {
  it('envoyeLe null (dépôt téléservice NON horodaté = bug B2) → « pas encore envoyée », joursRestants null, AUCUN crash', () => {
    const r = etatEcheance(entree({ envoyeLe: null }), new Date('2026-04-20T10:00:00Z'), REG);
    expect(r.etat).toBe('en_cours');
    expect(r.joursRestants).toBeNull();
    expect(r.motif).toContain('pas encore envoyée');
  });

  it('envoyeLe renseigné (après correctif) → PLUS « pas encore envoyée » ; échéance = envoi + 1 mois → dépassée ouvre la CADA', () => {
    // envoi 15 mars → échéance 15 avril ; au 20 avril, relève fraîche → 'depassee' (le silence peut valoir refus tacite)
    const r = etatEcheance(entree({ envoyeLe: new Date('2026-03-15T10:00:00Z') }), new Date('2026-04-20T10:00:00Z'), REG);
    expect(r.motif).not.toContain('pas encore envoyée');
    expect(r.etat).toBe('depassee');
  });
});

describe('T1 — fenetreCadaEffective : ancre = refus le plus PRÉCOCE déjà acquis (Correction 1)', () => {
  it('refus tacite = envoi + 1 mois (fenetreCada inchangée)', () => {
    const f = fenetreCada(new Date('2026-03-15T10:00:00Z'), new Date('2026-05-01T10:00:00Z'));
    expect(f.refusTaciteLe.toISOString()).toBe('2026-04-15T10:00:00.000Z'); // + 1 mois
    expect(f.forclusionLe.toISOString()).toBe('2026-06-15T10:00:00.000Z');  // + 2 mois après le refus
    expect(f.etat).toBe('ouverte');
  });

  it('EXIGÉ : envoyée il y a 3 mois + refus exprès AUJOURD’HUI → forclusion calée sur le refus TACITE (le plus précoce), pas sur aujourd’hui', () => {
    const envoyeLe = new Date('2026-05-12T10:00:00Z');        // tacite = 12 juin (acquis)
    const refusExpresAujourdhui = new Date('2026-08-12T00:00:00Z');
    const maintenant = new Date('2026-08-12T12:00:00Z');
    const { fenetre, voie } = fenetreCadaEffective(envoyeLe, [refusExpresAujourdhui], maintenant);
    expect(voie).toBe('refus_tacite');                        // le min retenu vient du tacite
    expect(fenetre.forclusionLe.toISOString()).toBe('2026-08-12T10:00:00.000Z'); // tacite (12 juin) + 2 mois
    expect(fenetre.forclusionLe.toISOString()).not.toBe('2026-10-12T00:00:00.000Z'); // JAMAIS aujourd’hui + 2 mois
  });

  it('refus exprès PRÉCOCE (avant le mois de silence écoulé) → ancre exprès, ouverture immédiate, voie refus_expres', () => {
    const envoyeLe = new Date('2026-08-01T10:00:00Z');        // tacite = 1er sept (PAS encore acquis au 10 août)
    const refusExpres = new Date('2026-08-05T00:00:00Z');     // refus exprès notifié le 5 août
    const maintenant = new Date('2026-08-10T10:00:00Z');
    const { fenetre, voie } = fenetreCadaEffective(envoyeLe, [refusExpres], maintenant);
    expect(voie).toBe('refus_expres');
    expect(fenetre.etat).toBe('ouverte');                    // ouverte dès le refus exprès (sans attendre le mois)
    expect(fenetre.forclusionLe.toISOString()).toBe('2026-10-05T00:00:00.000Z'); // refus exprès + 2 mois
  });

  it('aucun refus acquis (mois de silence en cours, pas d’exprès) → pas_ouverte, voie null', () => {
    const envoyeLe = new Date('2026-08-01T10:00:00Z');        // tacite = 1er sept (futur)
    const { fenetre, voie } = fenetreCadaEffective(envoyeLe, [], new Date('2026-08-10T10:00:00Z'));
    expect(voie).toBeNull();
    expect(fenetre.etat).toBe('pas_ouverte');
    expect(fenetre.refusTaciteLe.toISOString()).toBe('2026-09-01T10:00:00.000Z'); // ouverture future = tacite
  });
});

describe('T1 — refusAcquis : un dossier est inclus au corps SSI son refus est acquis (Correction 3)', () => {
  const envoyeRecent = new Date('2026-08-01T10:00:00Z'); // tacite 1er sept
  const envoyeVieux = new Date('2026-05-01T10:00:00Z');  // tacite 1er juin (échu)
  const maintenant = new Date('2026-08-10T10:00:00Z');
  it('refus exprès notifié (≤ maintenant) → acquis, même dans le mois de silence', () => {
    expect(refusAcquis(envoyeRecent, new Date('2026-08-05T00:00:00Z'), maintenant)).toBe(true);
  });
  it('pas d’exprès + tacite NON échu (mois de silence en cours) → PAS acquis (prématuré, à exclure)', () => {
    expect(refusAcquis(envoyeRecent, null, maintenant)).toBe(false);
  });
  it('pas d’exprès + tacite échu → acquis (refus tacite)', () => {
    expect(refusAcquis(envoyeVieux, null, maintenant)).toBe(true);
  });
  it('fenetreCadaDepuisRefus : refus futur → pas_ouverte', () => {
    expect(fenetreCadaDepuisRefus(new Date('2026-09-01T10:00:00Z'), maintenant).etat).toBe('pas_ouverte');
  });
});
