Projet de:
 - David GONCALVES (david.goncalves)
 - Paul Rousseau (paul.rousseau)

# Épitanie Project MOS NOS

## 🚀 Lancement du projet

Prérequis :  
- Docker & Docker Compose installés  
- Node.js (≥ v18) si vous souhaitez lancer le backend manuellement  

### Démarrage

Dans le dossier `epitanie_project`:

```bash
npm run install-all
./start-dev.sh
````

Ce script :

* Stoppe les services existants
* Relance **PostgreSQL** et **Keycloak** via Docker Compose
* Initialise la base de données (`init_db.sql`)
* Popule Keycloak avec les rôles et utilisateurs (`populate_keycloak.js`)
* Lance le backend et le frontend

L’application sera accessible sur :

* Frontend : [http://localhost:5173](http://localhost:5173)
* Backend : [http://localhost:4000](http://localhost:4000)
* Keycloak : [http://localhost:8080](http://localhost:8080)

---

## 👤 Comptes utilisateurs

Connectez-vous au frontend avec l'un des utilisateurs ci-dessous.
Tous les utilisateurs ont le mot de passe **`test`**.

| Username       | Rôle(s) Keycloak |
| -------------- | ---------------- |
| **idpp-med01** | medecin          |
| **idpp-med02** | medecin          |
| **idpp-inf01** | infirmier        |
| **idpp-sec01** | secretaire       |
| **ipp-0001**   | patient          |
| **ipp-0002**   | patient          |
| **ipp-0003**   | patient          |

---

## 🔑 Accès administration Keycloak

* URL : [http://localhost:8080](http://localhost:8080)
* **Username** : `admin`
* **Password** : `admin`

Depuis l’interface Keycloak, vous pouvez :

* Voir les utilisateurs existants
* Gérer leurs rôles
* Inspecter les tokens d’authentification

---

## 🏗️ Architecture du projet

* **Frontend (React / Vite)**

  * Pages : Patients, Documents, Rendez-vous, Résultats d’analyses, Messagerie interne
  * Authentification via Keycloak

* **Backend (Node.js + Express)**

  * Expose des endpoints REST protégés par Keycloak
  * Gère les patients, documents, rendez-vous, résultats, messages

* **Base de données (PostgreSQL)**

  * Tables principales : `patient`, `professionnel`, `cercle_soins`, `documents`, `rendezvous`, `analyses`, `message`
  * Initialisation avec `init_db.sql`

* **Keycloak**

  * Gère les rôles : `medecin`, `infirmier`, `secretaire`, `patient`
  * Sécurise les endpoints backend

---

## 📖 Respect du MOS (Modèle Opérationnel de Santé)

- **Patient** (`patient`, comptes `ipp-xxxx` dans Keycloak)  
- **Professionnel de santé** (`professionnel`, comptes `idpp-medxx`, `idpp-infx`)  
- **Secrétaire** (rôle administratif `idpp-sec01`)  
- **Cercle de soins** (`cercle_soins`) liant patients et professionnels  
- **Documents, Résultats, Rendez-vous, Messages** : ressources partagées dans le cercle de soins

Toutes les classes sont définit dans le fichier `init_db.sql`.

---

## 💡 Notes

* Si le port `5432` (Postgres) est déjà utilisé, je vous conseille de manuellement arrêter celui-ci avant de relancer l'application.
* Les données Keycloak sont réinitialisées à chaque `docker compose down -v`.
