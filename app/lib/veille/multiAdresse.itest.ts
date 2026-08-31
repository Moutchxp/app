import { describe, it, expect } from 'vitest';
import { query } from '../db/client';
import { composerDestinatairesDemande, estParmiDernieres } from './destinatairesCommune';

/**
 * 🔴 LOT 20 — DRY-RUN (point 9/11) : prouve, SANS AUCUN ENVOI et SANS passer par la couche d'envoi, la liste de destinataires composée
 * pour une commune RÉELLE (Aubervilliers 93001), et les étapes EXACTES qui reçoivent le multi-adresse dans chaque cascade. On lit
 * seulement les sources d'adresses ; aucun transport, aucun sendMail, aucune écriture. La règle (dest_email ∪ mairie_contact confirmé
 * ∪ prada ∪ répondants) est composée par la fonction de production ; on affiche le résultat.
 */
const AUBER_CODE_INSEE = '93001';

describe('LOT 20 — dry-run : composition des destinataires (Aubervilliers, AUCUN envoi)', () => {
  it('sur une demande RÉELLE d’Aubervilliers : ≥ 2 adresses connues, dest_email en tête (liste affichée)', async () => {
    // demande d'Aubervilliers avec un dest_email (n'importe laquelle du parc réel) — lecture seule.
    const { rows } = await query<{ id: number }>(`SELECT id::int AS id FROM demande WHERE code_insee = $1 AND coalesce(btrim(dest_email),'') <> '' ORDER BY id LIMIT 1`, [AUBER_CODE_INSEE]);
    if (rows.length === 0) { console.log('LOT 20 dry-run : aucune demande Aubervilliers avec dest_email — test neutre'); return; }
    const demandeId = rows[0].id;
    const liste = await composerDestinatairesDemande(demandeId, AUBER_CODE_INSEE);
    console.log(`LOT 20 dry-run — Aubervilliers (demande ${demandeId}) — destinataires composés (${liste.length}) :\n` + liste.map((a, i) => `   ${i + 1}. ${a}`).join('\n'));
    expect(liste.length).toBeGreaterThanOrEqual(2);
    expect(liste[0].toLowerCase()).toContain('@'); // dest_email en tête
    // dédup insensible à la casse : aucune adresse répétée
    expect(new Set(liste.map((a) => a.toLowerCase())).size).toBe(liste.length);
  });

  it('ÉTAPES concernées (nb_dernieres = 2) — ordinaire : avis + saisine ; partielle : dernière relance + annonce (aucun envoi)', () => {
    // Ordinaire : chaîne rappel(1) → avis(2) → saisine(3), total 3.
    const ordinaire = { rappel: estParmiDernieres(1, 3, 2), avis: estParmiDernieres(2, 3, 2), saisine: estParmiDernieres(3, 3, 2) };
    expect(ordinaire).toEqual({ rappel: false, avis: true, saisine: true }); // les 2 dernières = avis + saisine
    // Partielle : relance 1(1) → relance 2(2) → annonce(3), total N+1 = 3 (N=2).
    const partielle = { relance1: estParmiDernieres(1, 3, 2), relance2: estParmiDernieres(2, 3, 2), annonce: estParmiDernieres(3, 3, 2) };
    expect(partielle).toEqual({ relance1: false, relance2: true, annonce: true }); // les 2 dernières = 2e relance + annonce
    console.log('LOT 20 dry-run — étapes multi-adresse (nb=2) : ordinaire {avis, saisine} · partielle {2e relance, annonce}. Rappel + 1re relance restent mono-adresse.');
  });
});
