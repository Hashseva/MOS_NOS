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

## 🧪 FHIR API minimal (TP2)

Endpoints (R4 simplifiés, lecture seule):
* `GET /fhir/Patient/:id`
* `GET /fhir/Practitioner/:id`
* `GET /fhir/Organization/:id`
* `GET /fhir/Observation/:id`
* `GET /fhir/DocumentReference/:id`
* `GET /fhir/Appointment/:id`
* `GET /fhir/samples/td2` (bundle d'exemple pour le scénario TP2)

Exemple payload (Patient):
```json
{
  "resourceType": "Patient",
  "id": "1",
  "identifier": [{ "system": "urn:oid:1.2.250.1.213.1.4.2", "value": "IPP-0001" }],
  "name": [{ "family": "Petit", "given": ["Jean"] }],
  "gender": "male",
  "birthDate": "1980-05-12"
}
```

Exemple payload (Observation - résultat analyse):
```json
{
  "resourceType": "Observation",
  "id": "1",
  "status": "final",
  "code": { "coding": [{ "system": "http://loinc.org", "code": "GLUCOSE" }] },
  "subject": { "reference": "Patient/1" },
  "performer": [{ "reference": "Practitioner/1" }],
  "effectiveDateTime": "2025-01-02T10:00:00.000Z",
  "valueString": "Glycémie : 1.2 g/L"
}
```

---

## 🧾 Exemple : utilisé les endpoint fhir.js

```bash
curl -s -X POST "http://localhost:8080/realms/epitanie/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=admin"
```

Copié l'access token puis:

```bash
curl -s "http://localhost:4000/fhir/Patient/1" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

---

## 🧩 Mise en correspondance MOS → FHIR (TP2)

Mise en correspondance basée sur MOS (ANS) + adaptation à notre modèle simplifié.

| MOS / Donnée | Table(s) | FHIR R4 |
| --- | --- | --- |
| PersonnePriseCharge | `patient` | `Patient` |
| Professionnel | `professionnel` | `Practitioner` |
| ExerciceProfessionnel / SituationExercice | `professionnel` | `PractitionerRole` |
| EntiteJuridique / EntiteGeographique | `structure` | `Organization` (avec `partOf`) |
| RendezVous | `rendezvous` | `Appointment` |
| Observation (résultat analyse) | `resultat_analyse` | `Observation` (+ `DiagnosticReport` si regroupement) |
| Document | `document` | `DocumentReference` (non explicité dans MOS) |
| Cercle de soins | `cercle_soins` | `CareTeam` (choix pragmatique) |
| Messagerie | `message` | `Communication` (choix pragmatique) |

---

## 🔁 Scénario d’échange (TP2)

1) **Endocrinologue → Plateforme**  
   Envoi d’un compte-rendu + prescription (TSH/T3/T4 + échographie).
2) **Plateforme → Labo**  
   Transmission de la prescription d’analyses.
3) **Labo → Plateforme**  
   Retour des résultats (Observations) + DiagnosticReport.
4) **Plateforme → Hôpital**  
   Envoi du CR + demande d’échographie.
5) **Hôpital → Plateforme**  
   Retour du CR d’imagerie.
6) **Plateforme → Médecin & Patient**  
   Notifications (Communication).

---

## 🧭 Profils IHE et nomenclatures (TP2)

**Profils IHE (mentionnés via le CI-SIS)**
* IHE (profils abordés dans le cadre du CI-SIS)

**Nomenclatures adaptées (mentionnées en cours)**
* LOINC (analyses biologiques)
* SNOMED-CT (actes / concepts cliniques)
* ATC (médicaments)
* MOS / NOS (référentiels de base)

---

## 📖 Respect du MOS (Modèle Opérationnel de Santé)

- **Patient** (`patient`, comptes `ipp-xxxx` dans Keycloak)  
- **Professionnel de santé** (`professionnel`, comptes `idpp-medxx`, `idpp-infx`)  
- **Secrétaire** (rôle administratif `idpp-sec01`)  
- **Cercle de soins** (`cercle_soins`) liant patients et professionnels  
- **Documents, Résultats, Rendez-vous, Messages** : ressources partagées dans le cercle de soins

Toutes les classes sont définit dans le fichier `init_db.sql`.

---

## ✅ Matrice d’habilitations (version TD1)

Matrice simplifiée correspondant à l’implémentation actuelle (Keycloak + règles appliquées côté backend/frontend).

| Rôle | Patients (liste) | Détails patient | Documents | Résultats analyses | Rendez-vous | Messagerie |
| ---- | ---------------- | --------------- | --------- | ------------------ | ----------- | ---------- |
| **Médecin** | Patients de son cercle de soins | Oui | Lire + créer | Lire + créer | Lire + créer | Lire + envoyer |
| **Infirmier** | Patients de son cercle de soins | Oui | Lire | Lire | Lire | Lire + envoyer |
| **Secrétaire** | Patients de sa structure | Oui | Lire + créer | Lire + créer | Lire + créer | Lire + envoyer |
| **Patient** | Lui-même | Oui | Lire | Lire | Lire | Lire + envoyer |

Notes :
* Les contrôles sont volontairement simplifiés pour le TD (ex : vérification “cercle de soins” non systématique).
* La logique est cohérente avec les écrans disponibles dans le frontend et les endpoints sécurisés du backend.

---

## 🧾 Sources, prompts, choix et esprit critique

**Choix d’implémentation**
* Sous-ensemble MOS/NOS ciblé : patient, professionnel, structure, cercle de soins, documents, rendez-vous, résultats, messages.
* Codes NOS intégrés dans `ref_nomenclature` pour la traduction côté UI.
* Authentification/autorisation via Keycloak (rôles simples).

**Esprit critique / limites**
* Les règles d’habilitation sont simplifiées (pas de matrice fine par type de document ou par contexte).
* Certains codes sont “adaptés” pour le TD (ex: catégorie “CAB”) et ne sont pas des références officielles exhaustives.

---

## 💡 Notes

* Si le port `5432` (Postgres) est déjà utilisé, je vous conseille de manuellement arrêter celui-ci avant de relancer l'application.
* Les données Keycloak sont réinitialisées à chaque `docker compose down -v`.
