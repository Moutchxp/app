/**
 * ══ 🔴🔴 LES MAILS D'ENTRÉE / SORTIE DU PORTEFEUILLE (Arno, 18/10/2026), SUR UNE BASE JETABLE ════════════════════════════
 *
 *   ① destinataires : l'auteur + les comptes ACTIFS de l'autre tuile (droit Gestion depuis la Location, droit Location
 *      depuis la Gestion ; un administrateur a tous les droits), dédoublonnés ;
 *   ② sortie d'un propriétaire : le mail part APRÈS l'archivage, avec qui, lots (location close le …), origine + précision,
 *      honoraires mois / an HT et TTC ; un lot sans loyer de départ exclu et compté ; journal de l'envoi ;
 *   ③ entrée : un bien d'un propriétaire « en gestion = Non » (mandat de transaction seul) n'envoie RIEN ; « Oui » envoie ;
 *   ④ un échec d'envoi n'annule rien : l'archivage reste, l'échec est rendu et journalisé.
 * Les comptes d'essai sont créés DANS LA BASE JETABLE (jamais ailleurs). Aucun envoi réel : transport de relevé.
 *
 * 🔒 REFUSE de tourner ailleurs que sur une base `svav_jetable…` ou `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_l25 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/mailPortefeuille.itest.ts
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import type { MessageAEnvoyer } from '../gestion/envoiGmail';
import type { TransportDemande } from '../gestion/envoiDemandeTache';
import { creerProprietaireEtBiens } from './locationRepo';
import { creerLocataireSurBien, sortirDuPortefeuille } from './portefeuilleRepo';
import { destinatairesDe, notifierPortefeuille } from './mailPortefeuilleRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const S = `m${Date.now().toString(36)}`;
afterAll(async () => { if (baseEssai) await closePool(); });

const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const envoyes: MessageAEnvoyer[] = [];
const releve: TransportDemande = { async envoyer(m) { envoyes.push(m); return { ok: true, id: 'essai', factice: true }; } };
const enPanne: TransportDemande = { async envoyer() { return { ok: false, motif: 'Gmail indisponible (essai)' }; } };
async function compte(identifiant: string, o: { role?: string; gestion?: boolean; location?: boolean; actif?: boolean }): Promise<number> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO admin_utilisateur (identifiant, mot_de_passe, role, actif, prenom, nom, perm_gestion, perm_location)
     VALUES ($1, 'x', $2, $3, 'Essai', $4, $5, $6) RETURNING id::text`,
    [identifiant, o.role ?? 'collaborateur', o.actif ?? true, identifiant.split('@')[0], o.gestion ?? false, o.location ?? false]);
  return Number(rows[0].id);
}

describe.skipIf(!baseEssai)('🔴 mails d’entrée / sortie du portefeuille', () => {
  let auteurId = 0; let proprio = 0; let loue = 0; let vide = 0;

  it('① destinataires : auteur + comptes actifs de l’autre tuile, dédoublonnés', async () => {
    auteurId = await compte(`auteur.${S}@exemple.test`, { location: true, gestion: true });
    await compte(`gestion.${S}@exemple.test`, { gestion: true });
    await compte(`location.${S}@exemple.test`, { location: true });
    await compte(`admin.${S}@exemple.test`, { role: 'administrateur' });
    await compte(`inactif.${S}@exemple.test`, { gestion: true, location: true, actif: false });
    const depuisLocation = (await destinatairesDe('Location', `Auteur.${S}@exemple.test`)).filter((e) => e.includes(S));
    expect(depuisLocation).toEqual([`auteur.${S}@exemple.test`, `gestion.${S}@exemple.test`, `admin.${S}@exemple.test`]);
    const depuisGestion = (await destinatairesDe('Gestion', `auteur.${S}@exemple.test`)).filter((e) => e.includes(S));
    expect(depuisGestion).toEqual([`auteur.${S}@exemple.test`, `location.${S}@exemple.test`, `admin.${S}@exemple.test`]);
  });

  it('② sortie d’un propriétaire : qui, lots, location close, origine + précision, honoraires ; lot sans loyer exclu ; journal', async () => {
    const a = ok(await creerProprietaireEtBiens({ proprietaireId: null,
      proprietaire: { nom: `MAIL${S}`, telephone: '06 61 61 61 61', email: `mail.${S}@exemple.test`, numeroMandat: 'MG 2026-777' },
      logement: { adresse: `7 rue du Mail${S}`, codePostal: '75011', commune: 'Paris' }, annexes: [{ categorie: 'cave', porte: '4' }] }, { id: auteurId, libelle: `auteur.${S}@exemple.test` }));
    proprio = a.proprietaireId; loue = a.logementId;
    vide = ok(await creerProprietaireEtBiens({ proprietaireId: proprio, proprietaire: {}, logement: { adresse: `8 rue Sans Loyer${S}` }, annexes: [] }, { id: null, libelle: 'itest' })).logementId;
    const l = ok(await creerLocataireSurBien({ locataireId: null, locataire: { nom: `LOCMAIL${S}` }, lotId: loue, entree: '2025-03-01' }, { id: null, libelle: 'itest' }));
    const { rows: o } = await query<{ id: string }>('SELECT id::text FROM gestion_annuaire_occupation WHERE locataire_id = $1', [l.locataireId]);
    await query(`INSERT INTO gestion_location_conditions (occupation_id, loyer_hc, provisions, taux_gestion_ht, base, origine, saisi_par_libelle)
                 VALUES ($1, 900, 100, 6, 'cc', 'saisie', 'itest')`, [Number(o[0].id)]);
    const vente = { origine: 'mise_en_vente' as const, sousOrigine: 'autre_agence' as const, precision: 'Compromis signé chez Maître X' };
    const r = ok(await sortirDuPortefeuille('proprietaire', proprio, { id: auteurId, libelle: `auteur.${S}@exemple.test` }, { origine: vente, confirmeOccupation: true }));
    const issue = await notifierPortefeuille({ sens: 'sortie', proprietaireId: proprio, lotIds: r.lots ?? [], origine: vente },
      { auteur: { id: auteurId, libelle: `auteur.${S}@exemple.test` }, tuile: 'Location' }, { transport: releve });
    expect(issue.envoye).toBe(true);
    const m = envoyes[envoyes.length - 1];
    expect(m.a.filter((e) => e.includes(S))).toEqual([`auteur.${S}@exemple.test`, `gestion.${S}@exemple.test`, `admin.${S}@exemple.test`]);
    expect(m.objet).toBe(`Sortie de gestion — MAIL${S} — 2 lots — −60,00 € HT/mois`);
    expect(m.corps).toContain(`QUI : Essai auteur.${S} <auteur.${S}@exemple.test>`);
    expect(m.corps).toContain('depuis la tuile Location');
    expect(m.corps).toContain('Mandat de gestion : MG 2026-777');
    expect(m.corps).toContain(`7 rue du Mail${S}`);
    expect(m.corps).toContain('annexes : Cave n° 4');
    expect(m.corps).toMatch(new RegExp(`locataire : LOCMAIL${S} — location close le \\d{2}/\\d{2}/\\d{4}`));
    expect(m.corps).toContain('- Mise en vente — Par une autre agence');
    expect(m.corps).toContain('- Précision : « Compromis signé chez Maître X »');
    // 900 + 100 de provisions (base charges comprises) × 6 % = 60 € HT / mois ; TVA 20 % (réglage par défaut).
    expect(m.corps).toContain('1 000,00 € × 6 % = 60,00 € HT / mois');
    expect(m.corps).toContain('Honoraires de gestion perdus : 60,00 € HT / mois (72,00 € TTC) · 720,00 € HT / an (864,00 € TTC)');
    expect(m.corps).toContain('loyer de départ non renseigné — lot exclu du total');
    expect(m.corps).toContain('1 lot sans loyer de départ ou sans taux : exclu du total.');
    expect(m.corpsHtml).toContain(`fiche=proprietaire-${proprio}`);
    const { rows: j } = await query<{ etat: string; commentaire: string }>(
      `SELECT valeur_apres AS etat, commentaire FROM gestion_journal WHERE action = 'location_mail_portefeuille' AND entite = 'annuaire' AND entite_id = $1 ORDER BY id DESC LIMIT 1`, [proprio]);
    expect(j[0].etat).toBe('envoye');
    expect(j[0].commentaire).toContain(`Sortie de gestion — MAIL${S}`);
    expect(j[0].commentaire).toContain(`gestion.${S}@exemple.test`);
    expect(vide).toBeGreaterThan(0);
  });

  it('③ entrée : mandat de transaction seul (en gestion = Non) → aucun mail ; en gestion = Oui → « Nouveau mandat de gestion »', async () => {
    const b = ok(await creerProprietaireEtBiens({ proprietaireId: null, proprietaire: { nom: `TRANSAC${S}`, telephone: '06 62 62 62 62', email: `t.${S}@exemple.test` },
      logement: { adresse: `9 rue Transaction${S}` }, annexes: [] }, { id: null, libelle: 'itest' }));
    await query('UPDATE gestion_annuaire_proprietaire SET en_gestion = false WHERE id = $1', [b.proprietaireId]);
    const avant = envoyes.length;
    const non = await notifierPortefeuille({ sens: 'entree', proprietaireId: null, lotIds: [b.logementId], origine: null, exigerEnGestion: true },
      { auteur: { id: auteurId, libelle: 'x' }, tuile: 'Location' }, { transport: releve });
    expect(non).toMatchObject({ envoye: false, ignore: true });
    expect(envoyes.length).toBe(avant);
    await query('UPDATE gestion_annuaire_proprietaire SET en_gestion = true WHERE id = $1', [b.proprietaireId]);
    const oui = await notifierPortefeuille({ sens: 'entree', proprietaireId: null, lotIds: [b.logementId], origine: null, exigerEnGestion: true },
      { auteur: { id: auteurId, libelle: 'x' }, tuile: 'Gestion' }, { transport: releve });
    expect(oui.envoye).toBe(true);
    expect(envoyes[envoyes.length - 1].objet).toBe(`Nouveau mandat de gestion — TRANSAC${S} — 1 lot — +0,00 € HT/mois`);
    expect(envoyes[envoyes.length - 1].a.filter((e) => e.includes(S))).toEqual([`auteur.${S}@exemple.test`, `location.${S}@exemple.test`, `admin.${S}@exemple.test`]);
  });

  it('④ échec d’envoi : rien n’est annulé ; l’échec est rendu et journalisé', async () => {
    const issue = await notifierPortefeuille({ sens: 'sortie', proprietaireId: proprio, lotIds: [loue], origine: null },
      { auteur: { id: auteurId, libelle: 'x' }, tuile: 'Gestion' }, { transport: enPanne });
    expect(issue).toMatchObject({ envoye: false, motif: 'Gmail indisponible (essai)' });
    expect((await query<{ s: boolean }>('SELECT sorti_portefeuille_le IS NOT NULL AS s FROM gestion_annuaire_proprietaire WHERE id = $1', [proprio])).rows[0].s).toBe(true);
    const { rows: j } = await query<{ etat: string; commentaire: string }>(
      `SELECT valeur_apres AS etat, commentaire FROM gestion_journal WHERE action = 'location_mail_portefeuille' AND entite_id = $1 ORDER BY id DESC LIMIT 1`, [proprio]);
    expect(j[0]).toMatchObject({ etat: 'echec' });
    expect(j[0].commentaire).toContain('non envoyé : Gmail indisponible (essai)');
  });

  it('⑤ sortie d’une ANNEXE seule (fiche commune) : « Sortie d’annexe — NOM — annexe — logement d’origine », sans valorisation', async () => {
    const c = ok(await creerProprietaireEtBiens({ proprietaireId: null, proprietaire: { nom: `ANNEXE${S}`, telephone: '06 63 63 63 63', email: `an.${S}@exemple.test` },
      logement: { adresse: `5 rue Annexe${S}`, codePostal: '75011', commune: 'Paris' }, annexes: [{ categorie: 'parking', porte: '9' }] }, { id: null, libelle: 'itest' }));
    const { rows } = await query<{ id: string }>('SELECT annexe_id::text AS id FROM gestion_lot_annexe WHERE parent_id = $1', [c.logementId]);
    const parking = Number(rows[0].id);
    const r = ok(await sortirDuPortefeuille('bien', parking, { id: auteurId, libelle: 'x' }));
    expect(r.lots).toEqual([parking]);
    const issue = await notifierPortefeuille({ sens: 'sortie', proprietaireId: null, lotIds: r.lots ?? [], origine: null },
      { auteur: { id: auteurId, libelle: 'x' }, tuile: 'Gestion' }, { transport: releve });
    expect(issue.envoye).toBe(true);
    const m = envoyes[envoyes.length - 1];
    expect(m.objet).toBe(`Sortie d’annexe — ANNEXE${S} — Parking n° 9 — 5 rue Annexe${S}, Paris`);
    expect(m.corps).not.toContain('VALORISATION');
  });
});
