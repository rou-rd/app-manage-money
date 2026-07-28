# Guide d'installation Firebase + GitHub Pages

## Étape 1 — Créer le projet Firebase (5 minutes)

1. Va sur https://console.firebase.google.com
2. Clique **"Ajouter un projet"**
3. Nom du projet : `fintrack` → Continuer
4. Désactive Google Analytics (pas nécessaire) → Créer le projet

## Étape 2 — Activer Authentication Google

1. Dans Firebase Console → **Authentication** → **Commencer**
2. Onglet **Méthodes de connexion** → cliquer **Google**
3. Activer → choisir un email de support → **Enregistrer**

## Étape 3 — Créer la base Firestore

1. Firebase Console → **Firestore Database** → **Créer une base de données**
2. Choisir **Mode production** → Sélectionner une région (europe-west1) → **Activer**
3. Onglet **Règles** → Remplacer par le contenu de `firestore.rules` → **Publier**

## Étape 4 — Récupérer la configuration

1. Firebase Console → icône engrenage → **Paramètres du projet**
2. Section **Vos applications** → cliquer **</>** (Web)
3. Nom : `fintrack-web` → **Enregistrer l'application**
4. Copier l'objet `firebaseConfig` affiché

## Étape 5 — Mettre à jour finance.html

Ouvrir `finance.html` et chercher :
```js
const firebaseConfig = {
  apiKey:            "VOTRE_API_KEY",
  ...
```

Remplacer par les vraies valeurs copiées à l'étape 4.

## Étape 6 — Mettre sur GitHub

1. Créer un compte sur https://github.com si pas encore fait
2. Nouveau dépôt → nom : `fintrack` → Public → Créer
3. Uploader tous les fichiers :
   - index.html
   - finance.html
   - tasks.html
   - manifest.json
   - sw.js
   - icon-192.svg
   - icon-512.svg
   - README.md
   - firestore.rules
   - css/
   - js/

## Étape 7 — Activer GitHub Pages

1. Dans ton dépôt GitHub → **Settings** → **Pages**
2. Source : **Deploy from a branch** → Branch : **main** → **Save**
3. Attendre 2-3 minutes
4. Ton app est sur : `https://TON_NOM.github.io/fintrack`

## Étape 8 — Autoriser le domaine dans Firebase

1. Firebase Console → Authentication → **Domaines autorisés**
2. Ajouter : `TON_NOM.github.io`

## Étape 9 — Installer sur les appareils

### iPhone / iPad
1. Safari → ouvrir `https://TON_NOM.github.io/fintrack`
2. Bouton **Partager** (carré avec flèche) → **Sur l'écran d'accueil**
3. Nom : FinTrack → **Ajouter**

### Android
1. Chrome → ouvrir l'URL
2. Menu (...) → **Ajouter à l'écran d'accueil** ou bannière automatique
3. L'icône FinTrack apparaît sur le bureau

### PC
1. Chrome → ouvrir l'URL
2. Icône d'installation dans la barre d'adresse → **Installer**

## Résultat
✅ Toutes tes données sauvegardées dans le cloud Firebase
✅ Sync automatique entre tous tes appareils en temps réel
✅ App installable comme une vraie app native
✅ Fonctionne aussi hors connexion (données locales)
