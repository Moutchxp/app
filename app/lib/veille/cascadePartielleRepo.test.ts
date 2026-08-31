import { describe, it, expect } from 'vitest';
import { executerRelancePartielle, type DepsRelancePartielle } from './cascadePartielleRepo';
import type { CibleComplement } from '../permis/demanderPiecesRepo';

/**
 * CASC-3 — orchestrateur de PRÉPARATION (envoi MANUEL verbatim). Testé PAR INJECTION : `envoyer` factice → AUCUN e-mail réel.
 * On vérifie : envoi AVANT journal, refus vide, refus sans message mairie, étape/rang relayés au journal.
 */
const cible = (over: Partial<CibleComplement> = {}): CibleComplement => ({
  demandeId: 154, numDau: 'PC0930012500081', destinataire: 'urba@mairie-aubervilliers.fr', deNom: null, messageId: '<m@mairie>', referencesBrut: null,
  from: 'contact@sansvisavis.com', profil: 'entreprise', recuLe: '2026-05-01T09:00:00Z', motifIndisponible: null, ...over,
});
function deps(over: Partial<DepsRelancePartielle> = {}): DepsRelancePartielle {
  return {
    regimePartiel: async () => true, // CASC-4 : demande partielle par défaut (régime cascade partielle)
    reserverCreneau: async () => true, // AUTO-PARTIEL : créneau libre par défaut (anti-doublon inactif dans ces cas)
    libererCreneau: async () => {},
    lireCible: async () => cible(),
    destinataires: async (_d, fige) => [fige], // LOT 20 : par défaut, seul le destinataire figé (multi-adresse inactif)
    envoyer: async () => ({ messageId: '<out@svav>' }),
    journaliser: async () => {},
    ...over,
  };
}
const arg = (over: Partial<{ demandeId: number; etape: 'relance' | 'annonce'; rang: number | null; objet: string; corps: string; auteur: string }> = {}) =>
  ({ demandeId: 154, etape: 'relance' as const, rang: 1, objet: 'Pièces manquantes — première relance', corps: 'Madame, Monsieur, …', auteur: 'admin:decision', ...over });

describe('CASC-3 — executerRelancePartielle (injection, aucun e-mail réel)', () => {
  it('envoi AVANT journal, retourne le messageId', async () => {
    const ordre: string[] = [];
    let journal: { etape: string; rang: number | null } | null = null;
    const r = await executerRelancePartielle(deps({
      envoyer: async () => { ordre.push('envoyer'); return { messageId: '<out@svav>' }; },
      journaliser: async (_d, etape, rang) => { ordre.push('journal'); journal = { etape, rang }; },
    }), arg());
    expect(r.ok).toBe(true);
    expect(r.messageId).toBe('<out@svav>');
    expect(ordre).toEqual(['envoyer', 'journal']);
    expect(journal).toEqual({ etape: 'relance', rang: 1 });
  });

  it('annonce : étape relayée au journal', async () => {
    let journal: { etape: string; rang: number | null } | null = null;
    await executerRelancePartielle(deps({ journaliser: async (_d, etape, rang) => { journal = { etape, rang }; } }),
      arg({ etape: 'annonce', rang: null, objet: 'Information CADA', corps: 'Madame, Monsieur, …' }));
    expect(journal).toEqual({ etape: 'annonce', rang: null });
  });

  it('objet ou corps vide → refus, AUCUN envoi', async () => {
    let envoye = false;
    const d = deps({ envoyer: async () => { envoye = true; return { messageId: 'x' }; } });
    expect((await executerRelancePartielle(d, arg({ corps: '   ' }))).ok).toBe(false);
    expect((await executerRelancePartielle(d, arg({ objet: '' }))).ok).toBe(false);
    expect(envoye).toBe(false);
  });

  it('CASC-4 — demande NON marquée partielle (régime ordinaire) → refus, AUCUN envoi (garde serveur)', async () => {
    let envoye = false;
    const r = await executerRelancePartielle(deps({ regimePartiel: async () => false, envoyer: async () => { envoye = true; return { messageId: 'x' }; } }), arg());
    expect(r.ok).toBe(false);
    expect(r.motif).toMatch(/dossier partiel/i);
    expect(envoye).toBe(false);
  });

  it('aucun message de mairie (cible null) → refus, aucun envoi', async () => {
    let envoye = false;
    const r = await executerRelancePartielle(deps({ lireCible: async () => null, envoyer: async () => { envoye = true; return { messageId: 'x' }; } }), arg());
    expect(r.ok).toBe(false);
    expect(envoye).toBe(false);
  });

  it('expédition indisponible (motifIndisponible) → refus, aucun envoi', async () => {
    let envoye = false;
    const r = await executerRelancePartielle(deps({ lireCible: async () => cible({ motifIndisponible: 'expéditeur non répondable' }), envoyer: async () => { envoye = true; return { messageId: 'x' }; } }), arg());
    expect(r.ok).toBe(false);
    expect(envoye).toBe(false);
  });
});

describe('AUTO-PARTIEL — RÉSERVATION de créneau : jamais deux fois la même relance (auto ⇄ manuel)', () => {
  // Verrou simulé = un Set partagé, exactement comme le PK de cascade_partiel_creneau : le 1er réserve, les suivants échouent.
  function verrouPartage() {
    const pris = new Set<string>();
    return {
      reserverCreneau: async (demandeId: number, cle: string) => { const k = `${demandeId}|${cle}`; if (pris.has(k)) return false; pris.add(k); return true; },
      libererCreneau: async (demandeId: number, cle: string) => { pris.delete(`${demandeId}|${cle}`); },
    };
  }

  it('créneau DÉJÀ réservé → refus AVANT envoi (aucun e-mail, aucun journal)', async () => {
    let envoye = false, journalise = false;
    const r = await executerRelancePartielle(deps({
      reserverCreneau: async () => false,
      envoyer: async () => { envoye = true; return { messageId: 'x' }; },
      journaliser: async () => { journalise = true; },
    }), arg());
    expect(r.ok).toBe(false);
    expect(r.motif).toMatch(/déjà partie|déjà servi/i);
    expect(envoye).toBe(false);
    expect(journalise).toBe(false);
  });

  it('MÊME créneau visé par l’auto ET le manuel → UN SEUL envoi, l’autre neutralisé', async () => {
    const v = verrouPartage();
    let envois = 0;
    const d = deps({ ...v, envoyer: async () => { envois += 1; return { messageId: `<m${envois}>` }; } });
    const r1 = await executerRelancePartielle(d, arg({ auteur: 'auto' }));          // l'auto passe en premier
    const r2 = await executerRelancePartielle(d, arg({ auteur: 'admin:decision' })); // le manuel vise le MÊME créneau
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false); // neutralisé par la réservation
    expect(envois).toBe(1);    // UN SEUL e-mail parti — jamais de doublon
  });

  it('un créneau différent (autre étape) N’EST PAS bloqué', async () => {
    const v = verrouPartage();
    const d = deps(v);
    const r1 = await executerRelancePartielle(d, arg({ etape: 'relance', rang: 1 }));
    const r2 = await executerRelancePartielle(d, arg({ etape: 'annonce', rang: null }));
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true); // « relance-1 » et « annonce » sont deux créneaux distincts
  });

  it('l’envoi n’a PAS eu lieu (cible absente) → le créneau est LIBÉRÉ (retentable au prochain run)', async () => {
    const v = verrouPartage();
    let liberations = 0;
    const d = deps({ ...v, lireCible: async () => null, libererCreneau: async (dm, cle) => { liberations += 1; await v.libererCreneau(dm, cle); } });
    const r1 = await executerRelancePartielle(d, arg());
    expect(r1.ok).toBe(false);
    expect(liberations).toBe(1);
    // libéré → une nouvelle tentative peut re-réserver (cible désormais disponible)
    const r2 = await executerRelancePartielle(deps({ ...v }), arg());
    expect(r2.ok).toBe(true);
  });
});
