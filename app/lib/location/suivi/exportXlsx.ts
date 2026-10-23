import 'server-only';
import ExcelJS from 'exceljs';
import {
  type ActiviteCalcul, caLigne, NOMS_MOIS, commissionApporteurDe, type ContexteCalcul, primeDe, tauxNegociateurDe, totauxPeriode,
} from './tableauBord';
import { libelleOrigineContact } from './suivi';

/**
 * ══ LOCATION — « OUTILS DE SUIVI » : L'EXPORT .XLSX, UN ONGLET PAR MOIS (Arno, 22/10/2026 — exceljs validé) ════════════════════
 * La mise en page du suivi d'Arno : une ligne par bail (propriétaire, honoraires propriétaire HT, locataire, honoraires
 * locataire HT, TOTAL CA HT = B + D, prime de gestion, apporteur, commission), puis TOTAL CA HT, TOTAL CA HT − APPORTEURS,
 * la commission brute du négociateur, et la VENTILATION avec / sans gestion. Les cellules calculées portent la FORMULE et son
 * résultat (le fichier se recalcule dans Excel). 🔒 Sans « Voir les commissions » : ni prime, ni commission du négociateur.
 */
const EUROS = '#,##0.00 "€"';
const LIBELLE_TYPE: Record<ActiviteCalcul['type'], string> = { bail: 'Bail', avenant: 'Avenant', gestion_seule: 'Gestion seule' };

export async function classeurSuivi(o: {
  annee: number; moisMax: number; activites: readonly ActiviteCalcul[]; ctx: ContexteCalcul; voirCommissions: boolean; filtres: string;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sans Vis-à-Vis® — Outils de suivi';
  for (let m = 1; m <= o.moisMax; m += 1) {
    const ws = wb.addWorksheet(NOMS_MOIS[m - 1]);
    const prefixe = `${o.annee}-${String(m).padStart(2, '0')}`;
    const lignes = o.activites.filter((a) => a.dateSignature.startsWith(prefixe));
    ws.columns = [
      { key: 'A', width: 30 }, { key: 'B', width: 16 }, { key: 'C', width: 30 }, { key: 'D', width: 16 }, { key: 'E', width: 16 },
      { key: 'F', width: 12 }, { key: 'G', width: 24 }, { key: 'H', width: 16 }, { key: 'I', width: 12 }, { key: 'J', width: 22 }, { key: 'K', width: 14 }, { key: 'L', width: 14 },
      { key: 'M', width: 32 },
    ];
    ws.getCell('A1').value = `Suivi location — ${NOMS_MOIS[m - 1]} ${o.annee}${o.filtres ? ` (${o.filtres})` : ''}`;
    ws.getCell('A1').font = { bold: true, size: 13 };
    const entetes = ['PROPRIÉTAIRES', 'HONO. PROPRIÉTAIRE HT', 'LOCATAIRES', 'HONO. LOCATAIRE HT', 'TOTAL CA HT', o.voirCommissions ? 'GESTION (prime)' : '',
      'APPORTEURS D’AFFAIRES', 'COMS APPORTEURS', 'AVEC GESTION', 'NÉGOCIATEUR', 'SIGNATURE', 'NATURE',
      // Arno (24/10/2026) — l'origine du contact, telle quelle (« Personnalisé : <texte> »), en DERNIÈRE colonne : rien ne se décale.
      'ORIGINE DU CONTACT'];
    ws.getRow(2).values = entetes;
    ws.getRow(2).font = { bold: true };
    const debut = 3;
    lignes.forEach((a, i) => {
      const r = debut + i;
      const row = ws.getRow(r);
      row.getCell(1).value = a.libelleProprietaire;
      row.getCell(2).value = a.honoProprietaireHt;
      row.getCell(3).value = a.libelleLocataire;
      row.getCell(4).value = a.honoLocataireHt;
      row.getCell(5).value = { formula: `B${r}+D${r}`, result: caLigne(a) };
      if (o.voirCommissions) row.getCell(6).value = primeDe(a, o.ctx.regles);
      row.getCell(7).value = a.apporteurNom ?? '';
      const com = commissionApporteurDe(a, o.ctx.apporteurs);
      // La formule du fichier (`=E4*10%`) quand la commission EST le taux appliqué au CA ; sinon le montant saisi.
      const taux = a.apporteurTaux !== null && (a.commissionSaisie === null || Math.abs(a.commissionSaisie - caLigne(a) * a.apporteurTaux) < 1e-9) ? a.apporteurTaux : null;
      row.getCell(8).value = taux !== null ? { formula: `E${r}*${String(taux * 100).replace(',', '.')}%`, result: com } : com;
      row.getCell(9).value = a.avecGestion ? 'oui' : 'non';
      row.getCell(10).value = a.negociateurLibelle;
      row.getCell(11).value = `${a.dateSignature.split('-').reverse().join('/')}${a.dateSupposee ? ' (supposée)' : ''}`;
      row.getCell(12).value = LIBELLE_TYPE[a.type];
      row.getCell(13).value = libelleOrigineContact(a.origineContact, a.origineContactPrecision);
      for (const c of [2, 4, 5, 6, 8]) row.getCell(c).numFmt = EUROS;
    });
    const fin = Math.max(debut, debut + lignes.length - 1);
    const t = totauxPeriode(lignes, o.ctx, { annee: o.annee, mois: m });
    const rT = debut + lignes.length + 1;
    const somme = (col: string, result: number) => ({ formula: lignes.length === 0 ? '0' : `SUM(${col}${debut}:${col}${fin})`, result });
    ws.getCell(`A${rT}`).value = 'TOTAL CA HT';
    ws.getCell(`B${rT}`).value = somme('E', t.ca);
    if (o.voirCommissions) ws.getCell(`F${rT}`).value = somme('F', t.primes);
    ws.getCell(`H${rT}`).value = somme('H', t.apporteurs);
    ws.getCell(`A${rT + 1}`).value = 'TOTAL CA HT - APPORTEURS';
    ws.getCell(`C${rT + 1}`).value = { formula: `B${rT}-H${rT}`, result: t.caNet };
    if (o.voirCommissions) {
      ws.getCell(`A${rT + 2}`).value = 'COMS négociateur brut';
      const tauxUniques = [...new Set(lignes.map((a) => tauxNegociateurDe(a, o.ctx.regles)))];
      const retro = t.retrocessions > 0 ? `-${String(t.retrocessions)}` : '';
      ws.getCell(`C${rT + 2}`).value = tauxUniques.length <= 1
        ? { formula: `C${rT + 1}*${String((tauxUniques[0] ?? 0) * 100)}%+F${rT}${retro}`, result: t.commission }
        : t.commission;
      if (t.retrocessions > 0) { ws.getCell(`E${rT + 2}`).value = 'dont rétrocessions'; ws.getCell(`F${rT + 2}`).value = t.retrocessions; ws.getCell(`F${rT + 2}`).numFmt = EUROS; }
      ws.getCell(`C${rT + 2}`).numFmt = EUROS;
    }
    const rV = rT + 4;
    ws.getCell(`A${rV}`).value = 'VENTILATION';
    ws.getCell(`A${rV + 1}`).value = 'Location avec Gestion';
    ws.getCell(`B${rV + 1}`).value = t.avecGestion;
    ws.getCell(`A${rV + 2}`).value = 'Location sans Gestion';
    ws.getCell(`B${rV + 2}`).value = t.sansGestion;
    ws.getCell(`A${rV + 3}`).value = 'Total';
    ws.getCell(`B${rV + 3}`).value = { formula: `B${rV + 1}+B${rV + 2}`, result: t.avecGestion + t.sansGestion };
    for (const a of [`B${rT}`, `F${rT}`, `H${rT}`, `C${rT + 1}`, `B${rV + 1}`, `B${rV + 2}`, `B${rV + 3}`]) ws.getCell(a).numFmt = EUROS;
    for (const r of [rT, rT + 1, rT + 2, rV]) ws.getRow(r).font = { bold: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
