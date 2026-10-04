/**
 * ══ 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 3 — L'ÉPREUVE DE L'HISTORIQUE PAR LOCATAIRE. LECTURE SEULE ════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (04/10/2026) : « Contenu : les mails rattachés aux biens qu'il occupe, UNIQUEMENT pendant sa période
 * d'occupation (entrée → sortie, ou aujourd'hui), plus les mails dont il est lui-même l'expéditeur ou le
 * destinataire. Jamais le courrier de ses prédécesseurs ou successeurs. »
 *
 * ═══ 🔴🔴 CE QUE CE SCRIPT PROUVE, ET CE QU'IL NE PROUVERAIT PAS ═════════════════════════════════════════════════
 *
 * Il appelle les VRAIES fonctions de l'écran — `etendreCible` puis `pageHistorique`, page après page, dans
 * l'ordre — et vérifie DEUX choses sur chaque ligne rendue :
 *
 *   ① AUCUNE LIGNE D'UN BIEN HORS DE LA TRANCHE. Pour chaque ligne venue de l'axe « bien », la date du mail doit
 *      tomber dans la période d'occupation de CE bien par CE locataire. Une seule ligne dehors, et c'est le
 *      courrier d'un prédécesseur ou d'un successeur qui a fui.
 *
 *   ② RIEN QUI NE SOIT NI UN DE SES BIENS, NI SON PROPRE COURRIER. La cible de chaque ligne est soit un lot qu'il
 *      a occupé, soit lui-même (axe « correspondance »). Tout le reste serait un mail entré par une porte qu'on
 *      n'a pas voulue.
 *
 * 🔴 ET IL PARCOURT TOUTE LA FRISE, pas la première page. Une borne qui ne s'applique qu'au-delà de la page 1
 * donnerait un écran juste au premier coup d'œil et faux dès qu'on déroule — le pire des deux.
 *
 * ⚠️ IL NE RÉÉCRIT PAS LA RÈGLE. Le SQL de ce fichier ne sert qu'à ÉNUMÉRER les locataires à éprouver et à redire
 * la vérité de l'occupation ; le contenu de l'historique vient entièrement du code de production. Un oracle qui
 * partagerait la requête qu'il contrôle ne contrôlerait rien.
 *
 * ═══ 🔒 LECTURE SEULE ════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Aucun verbe d'écriture, aucun appel réseau, aucun fichier écrit. Un garde relit son propre source.
 *
 * USAGE :  npx tsx --env-file=.env app/scripts/verifier-historique-locataire.ts
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs';
import { query } from '../lib/db/client';
import { etendreCible, pageHistorique } from '../lib/gestion/historiqueRepo';
import { FILTRES_VIDES } from '../lib/gestion/historique';
import { cibleLocataire } from '../lib/gestion/rattachement';

const VERBES = ['INSERT ', 'UPDATE ', 'DELETE ', 'TRUNCATE', 'ALTER ', 'CREATE ', 'DROP ', 'COMMIT'];

/** 🔒 LE GARDE INSPECTE LE CODE, PAS LA PROSE — leçon du script d'audit, qui s'était dénoncé sur ses commentaires. */
function gardeLectureSeule(): void {
  const src = readFileSync(new URL(import.meta.url).pathname, 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
    .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
    .filter((l) => !l.includes('VERBES'))
    .join('\n')
    .toUpperCase();
  const fautifs = VERBES.filter((v) => code.includes(v));
  if (fautifs.length > 0) {
    throw new Error(`garde lecture seule : verbe d'écriture dans ce script — ${fautifs.join(', ')}`);
  }
}

/** Combien de lignes on demande par page. Le plafond de l'écran ; moins ferait des centaines d'allers-retours. */
const PAGE = 100;
/** Garde-fou de boucle : 100 pages = 10 000 mails pour une seule personne. Au-delà, on le DIT plutôt que de tourner. */
const PAGES_MAX = 100;

async function principal(): Promise<void> {
  gardeLectureSeule();

  /**
   * ① LES LOCATAIRES À ÉPROUVER : tous ceux qui ont au moins une occupation. Un locataire sans occupation n'a
   *   pas de tranche, donc pas de règle à enfreindre — et son historique se réduit à son propre courrier.
   */
  const { rows: gens } = await query<{ cle: string; nom: string; nb_lots: string; partage: boolean }>(
    `WITH multi AS (
       SELECT lot_id FROM gestion_annuaire_occupation
        GROUP BY lot_id HAVING count(DISTINCT locataire_id) > 1
     )
     SELECT lc.wippimmo_id AS cle, lc.nom,
            count(DISTINCT o.lot_id)::text AS nb_lots,
            bool_or(m.lot_id IS NOT NULL) AS partage
       FROM gestion_annuaire_locataire lc
       JOIN gestion_annuaire_occupation o ON o.locataire_id = lc.id
       LEFT JOIN multi m ON m.lot_id = o.lot_id
      GROUP BY lc.wippimmo_id, lc.nom
      ORDER BY lc.wippimmo_id`);

  process.stdout.write('épreuve « historique par locataire »\n');
  process.stdout.write(`  locataires à éprouver ................ ${gens.length}\n`);
  process.stdout.write(`  dont un logement partagé avec un autre occupant (prédécesseur ou successeur) ... ${
    gens.filter((g) => g.partage).length}\n`);

  let lignesVues = 0;
  let mailsVus = 0;
  let tronques = 0;
  const horsPeriode: string[] = [];
  const horsSujet: string[] = [];
  const multiLots: string[] = [];

  for (const g of gens) {
    const e = await etendreCible(cibleLocataire(g.cle), FILTRES_VIDES);
    if (e.etat !== 'ok') { horsSujet.push(`locataire ${g.cle} — cible ${e.etat}`); continue; }
    /**
     * ══ 🔴🔴 UNE LISTE DE TRANCHES PAR LOT, ET JAMAIS UNE SEULE ══════════════════════════════════════════════
     *
     * ⚠️ MA PREMIÈRE VERSION ÉCRIVAIT `new Map(occupations.map((o) => [o.cle, o]))`, ce qui garde UNE tranche par
     * lot : la dernière. Elle a dénoncé 119 lignes « hors période » chez BENABDALLAH Hicham (lot 40). Le défaut
     * était dans L'ÉPREUVE, pas dans le code — mesuré en base : un locataire peut REVENIR dans le même logement
     * après l'avoir quitté (lot 40, du 01/06/2020 au 01/10/2021 PUIS du 13/12/2023 au 26/06/2026 ; 3 cas de ce
     * genre en base). Le SQL de production, lui, déplie tous les triplets (`unnest`) et prend donc les deux.
     *
     * 🔴 UNE LIGNE EST DONC VALIDE SI ELLE TOMBE DANS L'UNE QUELCONQUE DES TRANCHES de ce lot.
     */
    const periodes = new Map<string, typeof e.data.occupations>();
    for (const o of e.data.occupations) periodes.set(o.cle, [...(periodes.get(o.cle) ?? []), o]);
    if (periodes.size > 1) multiLots.push(`${g.nom} (${g.cle}) — ${periodes.size} logements`);

    const vus = new Set<number>();
    for (let page = 0; ; page += 1) {
      if (page >= PAGES_MAX) { tronques += 1; break; }
      /**
       * ⚠️ `grouper: true` POUR VOIR CHAQUE AXE. Sans regroupement, la requête ne garde qu'UNE ligne par mail
       * (la plus prioritaire) : un mail entré à tort par l'axe « bien » serait masqué par sa propre ligne de
       * correspondance, et l'épreuve passerait à côté du défaut qu'elle cherche.
       */
      const p = await pageHistorique(e.data, { ...FILTRES_VIDES, page, taille: PAGE, grouper: true });
      for (const l of p.lignes) {
        lignesVues += 1;
        vus.add(l.messageId);
        if (l.parCible.sorte === 'locataire') {
          if (l.parCible.cle !== g.cle) {
            horsSujet.push(`locataire ${g.cle} — ligne « locataire ${l.parCible.cle ?? '?'} » (mail ${l.messageId})`);
          }
          continue;
        }
        if (l.parCible.sorte !== 'lot') {
          horsSujet.push(`locataire ${g.cle} — ligne de sorte « ${l.parCible.sorte} » (mail ${l.messageId})`);
          continue;
        }
        const tranches = periodes.get(l.parCible.cle ?? '');
        if (tranches === undefined) {
          horsSujet.push(`locataire ${g.cle} — lot ${l.parCible.cle ?? '?'} qu'il n'a jamais occupé `
            + `(mail ${l.messageId})`);
          continue;
        }
        const jour = l.recuLe.slice(0, 10);
        const dedans = tranches.some((per) => (per.depuis === null || jour >= per.depuis)
          && (per.jusqua === null || jour <= per.jusqua));
        if (!dedans) {
          horsPeriode.push(`locataire ${g.cle} (${g.nom}) — lot ${l.parCible.cle ?? '?'} — mail ${l.messageId} `
            + `du ${jour}, hors ${tranches.map((p) => `[${p.depuis ?? 'début'} ; ${p.jusqua ?? 'aujourd’hui'}]`)
              .join(' ∪ ')}`);
        }
      }
      if (!p.suite) break;
    }
    mailsVus += vus.size;
  }

  process.stdout.write(`  lignes parcourues .................... ${lignesVues}\n`);
  process.stdout.write(`  mails distincts ...................... ${mailsVus}\n`);
  process.stdout.write(`  locataires à plusieurs logements ..... ${multiLots.length}\n`);
  for (const m of multiLots.slice(0, 5)) process.stdout.write(`      · ${m}\n`);
  process.stdout.write(`  🔴 lignes HORS PÉRIODE ............... ${horsPeriode.length}\n`);
  for (const x of horsPeriode.slice(0, 20)) process.stdout.write(`      · ${x}\n`);
  process.stdout.write(`  🔴 lignes HORS SUJET ................. ${horsSujet.length}\n`);
  for (const x of horsSujet.slice(0, 20)) process.stdout.write(`      · ${x}\n`);
  if (tronques > 0) process.stdout.write(`  ⚠️ historiques tronqués au plafond de pages ... ${tronques}\n`);

  process.exitCode = horsPeriode.length === 0 && horsSujet.length === 0 ? 0 : 1;
}

void principal().then(() => process.exit(process.exitCode ?? 0));
