import { describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 LE MAIL « NOUVELLE LOCATION » AUX PARTENAIRES — TEXTE MODIFIABLE AVANT ENVOI (Arno, 10/11/2026, option 1). La vraie fonction d'envoi,
 * base et transport simulés : appel, introduction, conclusion et politesse modifiables ; le dossier protégé ; refus d'une partie protégée ;
 * le journal garde le texte d'origine et le texte envoyé.
 */
const requetes: { sql: string; params: unknown[] }[] = [];
const S = (sql: string) => sql.replace(/\s+/g, ' ');
vi.mock('../db/client', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    requetes.push({ sql, params });
    const s = S(sql);
    if (s.includes('FROM gestion_bail WHERE id = $1')) return { rows: [{ lot_id: '356', entree: '2026-10-10' }], rowCount: 1 };
    if (s.includes('FROM gestion_annuaire_occupation WHERE bail_id = $1')) return { rows: [{ id: '560', lot_id: '356', locataire_id: '531' }], rowCount: 1 };
    if (s.includes('FROM gestion_annuaire_lot lo WHERE lo.id = ANY')) return { rows: [{ id: '356', adresse: '28 Avenue Fictive', code_postal: '92400', commune: 'Courbevoie' }], rowCount: 1 };
    if (s.includes('AS s FROM gestion_bail g JOIN gestion_annuaire_lot lo')) return { rows: [{ s: 'en_gestion' }], rowCount: 1 };
    if (s.startsWith('INSERT INTO gestion_location_mail_envoi')) return { rows: [{ quand: '2026-11-10 10:00:00+01' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  }),
}));
let avec466 = true;
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: vi.fn(async (_t: string, c: string) => (c === 'texte_origine' ? avec466 : true)) }));
vi.mock('../gestion/statutBienRepo', () => ({ sqlStatutBien: vi.fn(async () => `'en_gestion'`), statutBienDisponible: vi.fn(async () => true) }));
vi.mock('./mailPortefeuilleRepo', () => ({ emailDeLAuteur: vi.fn(async () => ({ nom: 'Arno Test', email: 'arno@exemple.test' })) }));
vi.mock('../gestion/config', () => ({ chargerConfigGestion: vi.fn(async () => ({ adresseGestion: 'gestion@criterimmo.fr' })) }));
vi.mock('../gestion/coordonneeVivante', () => ({ conditionCoordonneeVivante: vi.fn(async () => '') }));
vi.mock('./creationBienRepo', () => ({ complementsDuBien: vi.fn(async () => null) }));
vi.mock('./conditionsEntreeRepo', () => ({ conditionsParOccupation: vi.fn(async () => new Map()) }));
vi.mock('./loyerEntreeRepo', () => ({ loyerDesOccupations: vi.fn(async () => null) }));
vi.mock('./brancheBailDriveRepo', () => ({ dossierDuBail: vi.fn(async () => null) }));
vi.mock('./digicodeImmeubleRepo', () => ({ lireDigicodeDuLot: vi.fn(async () => null) }));
vi.mock('./mandatBienRepo', () => ({ mandatsDesProprietaires: vi.fn(async () => []) }));
vi.mock('../gestion/partieCategorieRepo', () => ({ lireGarantsDuBail: vi.fn(async () => []) }));

const { envoyerNouvelleLocation } = await import('./mailNouvelleLocationRepo');
const { INTRODUCTION, SIGNATURE } = await import('./mailNouvelleLocation');
const DEST = [{ adresse: 'partenaire@exemple.test', libelle: 'P' }];
const AUTEUR = { id: 7, libelle: 'arno@exemple.test' };
const transport = () => ({ envoyer: vi.fn(async (_m: { corps: string; corpsHtml: string }) => ({ ok: true as const })) });

describe('🔴 nouvelle location : texte modifiable, dossier protégé', () => {
  it('sans retouche : le texte d’origine, rien de plus au journal', async () => {
    requetes.length = 0;
    const t = transport();
    expect((await envoyerNouvelleLocation(542, DEST, AUTEUR, { transport: t as never })).etat).toBe('ok');
    const corps = t.envoyer.mock.calls[0][0].corps;
    expect(corps).toContain(`${INTRODUCTION.join('\n')}\n`);
    expect(corps).toContain(SIGNATURE.join('\n'));
    expect(S(requetes.find((r) => r.sql.startsWith('INSERT'))!.sql)).not.toContain('texte_origine');
  });
  it('avec retouche : appel, introduction, conclusion et politesse ; le dossier et « L’équipe gestion » restent ; le journal garde origine et envoyé', async () => {
    requetes.length = 0;
    const t = transport();
    const r = await envoyerNouvelleLocation(542, DEST, AUTEUR, { transport: t as never }, null,
      { nouvelle_location: { appel: 'Bonjour Laura,', intro: 'Voici le dossier du nouveau bail.', conclusion: 'Le bail démarre lundi.', politesse: 'Bien à vous,' } });
    expect(r.etat).toBe('ok');
    const { corps, corpsHtml } = t.envoyer.mock.calls[0][0];
    expect(corps).toContain('Bonjour Laura,\nVoici le dossier du nouveau bail.');
    expect(corps).toContain('Le bail démarre lundi.\n\nBien à vous,\nL’équipe gestion');
    expect(corps).not.toContain(INTRODUCTION[1]);
    expect(corps).toContain('28 Avenue Fictive');                  // le dossier, protégé, est là
    expect(corpsHtml).toContain('Le bail démarre lundi.');
    const ins = requetes.find((x) => x.sql.startsWith('INSERT'))!;
    expect(S(ins.sql)).toContain('texte_origine, texte_envoye');
    const [origine, envoye] = ins.params.slice(-2) as string[];
    expect(origine).toContain(INTRODUCTION[1]);
    expect(envoye).toBe(corps);
    expect(ins.params[2]).toBe('Arno Test');                          // qui
  });
  it('🔴 forcer une partie protégée : REFUS, rien ne part, rien n’est journalisé', async () => {
    for (const cle of ['signature', 'dossier', 'objet']) {
      requetes.length = 0;
      const t = transport();
      const r = await envoyerNouvelleLocation(542, DEST, AUTEUR, { transport: t as never }, null, { nouvelle_location: { [cle]: 'piraté' } });
      expect(r).toMatchObject({ etat: 'refus' });
      expect(t.envoyer).not.toHaveBeenCalled();
      expect(requetes.some((x) => x.sql.startsWith('INSERT'))).toBe(false);
    }
  });
  it('sans la migration 466 : un texte modifié est refusé ; le texte proposé part toujours', async () => {
    avec466 = false;
    try {
      const t = transport();
      expect(await envoyerNouvelleLocation(542, DEST, AUTEUR, { transport: t as never }, null, { nouvelle_location: { conclusion: 'x' } })).toMatchObject({ etat: 'refus' });
      expect(t.envoyer).not.toHaveBeenCalled();
      expect((await envoyerNouvelleLocation(542, DEST, AUTEUR, { transport: t as never })).etat).toBe('ok');
    } finally { avec466 = true; }
  });
});
