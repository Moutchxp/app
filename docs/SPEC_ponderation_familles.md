# Spec — pondération par famille de bâtiment (Couche 1)

## Statut : SPEC, non implémentée. Modifie le score → application ultérieure avec
recon d'impact golden + rescellage en commit séparé. Toutes les variables ci-dessous
sont destinées à une TABLE DE CONFIG modifiable (interface d'édition future), pas en dur.

## 1. Barème par famille
Cône = ±60° (120°). Flancs = 60–90°. Distance max = plafond de valorisation du faisceau.

| Famille | Cône | Flancs | Distance max (m) |
|---|---|---|---|
| Patrimoine mondial (14 monuments MONUMENTS_L93) | faisceau = 800 | faisceau = 800 | 800 |
| Monument Historique classé | ×2.0 | ×1.5 | 400 |
| Monument Historique inscrit | ×2.0 | ×1.5 | 400 |
| Bâti patrimonial (Inventaire IA) | ×2.0 | ×1.5 | 400 |
| Bâti construit ≤ 1900 | ×1.5 | ×1.2 | 300 |
| Bâti construit 1901–1935 | ×1.2 | ×1.1 | 200 |

## 2. Règle de cumul nature + bâti
Déclencheur : le faisceau traverse de la NATURE entre l'origine et le bâti touché.
Si PAS de nature → calcul classique inchangé, ne rien appliquer.

Si nature présente :
- Partie 1 : valeur du faisceau calculée comme aujourd'hui, en ignorant le bâti
  derrière (nature + pondérations normales), CAPÉE À 200.
- Partie 2 : (distance_réelle × coeff_bâti) / diviseur, où le diviseur dépend de la
  longueur de nature traversée :
    < 30 m → 1,0 (pas de division)
    30–34 → 1,1 ; 35–39 → 1,2 ; 40–44 → 1,3 ; 45–49 → 1,4 ; 50–54 → 1,5 ;
    55–59 → 1,6 ; 60–64 → 1,7 ; 65–69 → 1,8 ; 70–74 → 1,9 ; ≥ 75 m → 2,0 (plafond).
  Formule : diviseur = min(2,0 ; 1,0 + 0,1 × floor((nature − 25)/5)) si nature ≥ 30, sinon 1,0.
- Total faisceau = Partie 1 + Partie 2, CAPÉ à la distance max de la catégorie du bâti.

Patrimoine mondial : AUCUN calcul, faisceau = 800 systématiquement.

Exemple (MH, cône, 150 m réels dont 100 m nature) :
- P1 = calcul nature classique capé à 200 → 200.
- P2 = (150 × 2) / 2 (nature ≥ 75 ? non, 100 ≥ 75 → diviseur 2,0) = 150.
- Total = 350, capé à 400 (MH) → 350.

## 3. Cadre
- Couche 1 reste plafonnée à 80 (existant, non modifié).
- À implémenter : lire les coefficients depuis une table de config (pas en dur),
  pour édition via interface future.

## 4. Points à vérifier en recon AVANT implémentation
- Coefficient nature réel (F4) et le calcul nature actuel (Partie 1).
- Localisation du max(nature, bâti) actuel, à remplacer par le cumul.
- Coefficients F2 (pré-1900 ×1.30) / F3 existants → éviter le double comptage
  avec les nouvelles lignes ≤1900 / 1901–1935.
- Dépendance golden Asnières (25.44030853862166).
