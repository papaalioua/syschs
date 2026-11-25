# SysCHS : Centre Hospitalier de Sahloul

Application web (Flask + MySQL) de gestion des dossiers patients : inscription avec validation CNSS,
étiquettes code-barres, saisie infirmier, diagnostic médecin, programmation automatique des
interventions et facturation hebdomadaire à la CNSS (SysBill).

**Démo en ligne :** https://papaalioua.github.io/syschs/
(version navigateur de l'application : mêmes écrans et mêmes règles métier, données fictives
enregistrées dans le navigateur ; bouton « Réinitialiser » pour revenir au jeu de démonstration).

![Connexion](docs/screenshots/01_login.png)

| Réception | Médecin | Facturation |
|-----------|---------|-------------|
| ![Réception](docs/screenshots/02_reception.png) | ![Médecin](docs/screenshots/10_doctor_form.png) | ![SysBill](docs/screenshots/12_billing.png) |

## Interface

- **Circuit patient en direct** : la barre latérale et le bandeau de chaque espace affichent le
  nombre de dossiers à chaque étape (réception → infirmerie → médecin → facturation).
- **Espaces par rôle** avec indicateurs (inscriptions du jour, file d'attente, interventions à venir,
  montant à facturer…).
- **Champs « scanner »** pour la carte CNSS et le code-barres du dossier (compatibles douchette USB).
- **Documents imprimables** : étiquettes code-barres, compte rendu de visite sur papier à en-tête,
  facture SysBill.
- Responsive (tablette / mobile) et feuille d'impression dédiée.

## Installation

```bash
pip install -r requirements.txt

# 1. Créer la base MySQL
mysql -u root -p -e "CREATE DATABASE syschs CHARACTER SET utf8mb4;"

# 2. Indiquer la connexion (adapter user / mot de passe)
export DATABASE_URL="mysql+pymysql://root:@localhost/syschs?charset=utf8mb4"
#   Windows PowerShell : $env:DATABASE_URL="mysql+pymysql://root:MOTDEPASSE@localhost/syschs?charset=utf8mb4"
#   Sans MySQL (test rapide) : export DATABASE_URL="sqlite:///syschs.db"

# 3. Créer les tables + comptes de démo + 10 chambres
python init_db.py            # ajouter --demo pour créer 7 patients à toutes les étapes

# 4. Lancer
python run.py                # http://127.0.0.1:5000
```

`schema.sql` contient le script SQL équivalent.

## Comptes de démonstration (mot de passe : `demo1234`)

| Identifiant  | Rôle                          |
|--------------|-------------------------------|
| `reception1` | Réception                     |
| `nurse1`     | Infirmier                     |
| `doctor1`    | Médecin                       |
| `doctor2`    | Médecin                       |
| `admin`      | Facturation SysBill           |

En production : `SHOW_DEMO_ACCOUNTS=0` masque ces comptes sur la page de connexion.

## Scénario de démonstration

1. **reception1** : saisir la carte `1234567890` (valide) → remplir le profil → imprimer les 2 étiquettes.
   Essayer `0123456789` (carte expirée) et `9999999` (invalide) pour voir le rejet.
2. **nurse1** : saisir le code-barres du dossier (ex. `SCH00000001`) → saisir l'ordonnance.
3. **doctor1** : recevoir le patient → diagnostic → *chirurgie* (chambre + créneau automatiques)
   ou *médicaments* → document patient imprimable.
4. **admin** : « Lancer SysBill maintenant » (en production il s'exécute seul chaque lundi à 02:00).

## API CNSS simulée

`GET /api/cnss/validate/<numéro>` : commence par `1` = valide, `0` = carte expirée, sinon invalide.
`POST /api/cnss/bills` : réception de la facture hebdomadaire.
Pour pointer vers un autre serveur : `export CNSS_API_URL=http://hote:port`.

## Tests

```bash
python tests/smoke_test.py   # parcourt les 3 phases (SQLite temporaire, sans MySQL)
```

## Structure

```
app/models.py         tables (Patient, Dossier, Consultation, Surgery, Room, Bill, BillLine, User)
app/services.py       logique métier (inscription, chirurgie auto, SysBill)
app/cnss_client.py    client CNSS (mock par défaut)
app/routes/           reception, nurse, doctor, billing, cnss (API simulée)
app/templates/        interface en français (_ui.html : composants réutilisables)
app/static/           style.css + icons.svg (sprite d'icônes)
docs/                 démo statique publiée sur GitHub Pages (assets/app.js reprend services.py)
```

Après une modification de `app/static/style.css` ou `icons.svg`, recopier les fichiers dans
`docs/assets/` pour garder la démo en ligne identique.

Réglages (tarifs des actes, créneaux, jour d'exécution de SysBill) : `app/config.py`.
