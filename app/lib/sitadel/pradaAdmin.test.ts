import { describe, it, expect } from 'vitest';
import type { Requete } from './mairieContact';
import { rattacherManuelTx, estIdentifiantValide, SQL_RATTACHER_MANUEL, SQL_ECARTER, SQL_LIGNE_IMPORT, SQL_AMBIGUITES } from './pradaAdmin';

/** Faux `q` (transaction) journalisant chaque requête pour vérifier la SÉQUENCE et les invariants, sans base. */
function fauxQ(opts: { pradaExistante?: { courriel: string | null; protegee?: boolean } } = {}) {
  const appels: { text: string; params: unknown[] }[] = [];
  const q: Requete = (async (text: string, params?: unknown[]) => {
    const p = params ?? [];
    appels.push({ text, params: p });
    if (text.includes('FROM prada_import WHERE id')) {
      return { rows: [{ nom: 'Bernard', prenom: 'Léa', courriel: 'lea@ville.fr', adresse: '6 place', millesime: '2026-07' }] };
    }
    if (text.includes('SELECT courriel FROM mairie_prada')) {
      return { rows: opts.pradaExistante ? [{ courriel: opts.pradaExistante.courriel }] : [] };
    }
    if (text.includes('INSERT INTO mairie_prada') && text.includes('ON CONFLICT (code_insee)')) {
      // protégée (confirme/saisie_manuelle) → 0 ligne retournée ; sinon insertion (xmax=0 => insere true)
      return { rows: opts.pradaExistante?.protegee ? [] : [{ insere: !opts.pradaExistante, courriel: 'lea@ville.fr' }] };
    }
    return { rows: [] };
  }) as Requete;
  return { q, appels };
}

describe('S14e — rattachement manuel (invariants)', () => {
  it('pose rapprochement « manuel » (JAMAIS « automatique »)', () => {
    expect(SQL_RATTACHER_MANUEL).toContain("rapprochement = 'manuel'");
    expect(SQL_RATTACHER_MANUEL).not.toContain("'automatique'");
  });

  it('écarter → rapprochement « hors_perimetre », code_insee NULL', () => {
    expect(SQL_ECARTER).toContain("rapprochement = 'hors_perimetre'");
    expect(SQL_ECARTER).toContain('code_insee = NULL');
  });

  it('la séquence pose « manuel », alimente mairie_prada, journalise — et NE TOUCHE JAMAIS mairie_contact', async () => {
    const { q, appels } = fauxQ();
    await rattacherManuelTx(q, 12, '93070', 'admin-1');

    const rattache = appels.find((a) => a.text === SQL_RATTACHER_MANUEL);
    expect(rattache).toBeTruthy();
    expect(rattache!.params).toEqual(['93070', 12]); // code_insee, id
    expect(appels.some((a) => a.text.includes('INSERT INTO mairie_prada'))).toBe(true);
    expect(appels.some((a) => a.text.includes('INSERT INTO mairie_prada_journal'))).toBe(true);
    // INVARIANT : aucune écriture sur mairie_contact (le contact confirmé reste intact)
    expect(appels.some((a) => /INSERT INTO mairie_contact|UPDATE mairie_contact/.test(a.text))).toBe(false);
    // et jamais 'automatique' écrit
    expect(appels.some((a) => a.params.includes('automatique'))).toBe(false);
  });

  it('mairie_prada protégée (confirme / saisie_manuelle) → aucun journal (rien écrasé)', async () => {
    const { q, appels } = fauxQ({ pradaExistante: { courriel: 'ancien@x.fr', protegee: true } });
    await rattacherManuelTx(q, 12, '93070', null);
    // le rattachement prada_import a bien lieu, mais l'upsert protégé ne renvoie rien → pas de journal
    expect(appels.some((a) => a.text === SQL_RATTACHER_MANUEL)).toBe(true);
    expect(appels.some((a) => a.text.includes('INSERT INTO mairie_prada_journal'))).toBe(false);
  });

  it('lit la ligne source avant d’alimenter mairie_prada', () => {
    expect(SQL_LIGNE_IMPORT).toContain('FROM prada_import WHERE id = $1');
  });
});

describe('S14e — cause du « importId invalide » : bigint sérialisé en chaîne', () => {
  it('la sélection des ambiguïtés caste id::int → identifiant rendu en NOMBRE JSON (pas une chaîne)', () => {
    expect(SQL_AMBIGUITES).toContain('id::int AS id'); // sans ce cast, prada_import.id (bigint) arrive en string
  });

  it('la route exige un ENTIER JS : « 12 » (chaîne, forme d’un bigint sérialisé) est REFUSÉ, la validation reste stricte', () => {
    expect(estIdentifiantValide(12)).toBe(true);        // la forme attendue par la route
    expect(estIdentifiantValide('12')).toBe(false);     // la forme fautive avant correctif → toujours refusée
    expect(estIdentifiantValide(undefined)).toBe(false);// absent → refusé (jamais de rattachement indéterminé)
    expect(estIdentifiantValide(1.5)).toBe(false);
    expect(estIdentifiantValide(null)).toBe(false);
  });
});
