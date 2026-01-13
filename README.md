Projet de:
 - David GONCALVES (david.goncalves)
 - Paul Rousseau (paul.rousseau)

# Epitanie Project MOS NOS

Objectif: une application simple avec base Postgres, authentification Keycloak, backend Express et frontend React.
Elle permet de consulter/ajouter des patients, documents, rendez-vous, resultats d'analyses et messages.

---

## Demarrage rapide

Prerequis:
- Docker + Docker Compose
- Node.js (>= v18) si vous lancez le backend hors script

Depuis la racine du projet:

```bash
cd epitanie_project
npm run install-all
./start-dev.sh
```

Le script:
- relance Postgres + Keycloak via Docker
- initialise la base (`epitanie_project/init_db.sql`)
- peuple Keycloak (`epitanie_project/populate_keycloak.js`)
- lance backend + frontend

URLs:
- Frontend: http://localhost:5173
- Backend: http://localhost:4000
- Keycloak: http://localhost:8080

---

## Utiliser l'app

1) Ouvrir http://localhost:5173
2) Se connecter avec un compte (voir ci-dessous)
3) Naviguer via le menu (patients, documents, rendez-vous, resultats, messages)

Comptes (mot de passe: `test`):

| Username       | Role |
| -------------- | ---- |
| idpp-med01     | medecin |
| idpp-med02     | medecin |
| idpp-inf01     | infirmier |
| idpp-sec01     | secretaire |
| ipp-0001       | patient |
| ipp-0002       | patient |
| ipp-0003       | patient |

---

## Acces admin Keycloak

- URL: http://localhost:8080
- Username: `admin`
- Password: `admin`

Puis changez le realm en haut à droite à epitanie.

---

## Fichiers importants

- `epitanie_project/start-dev.sh`: demarre tout le stack en dev
- `epitanie_project/docker-compose.yml`: Postgres + Keycloak
- `epitanie_project/init_db.sql`: schema + donnees de test
- `epitanie_project/backend/server.js`: backend REST + securite Keycloak
- `epitanie_project/frontend/src`: frontend React
- `epitanie_project/backend/fhir.js`: endpoints FHIR minimaux (lecture)
- `epitanie_project/backend/fhir-sim.js`: serveur FHIR simple pour simulation TP3

---

## FHIR minimal (TD2)

Endpoints disponibles (lecture):
- `GET /fhir/Patient/:id`
- `GET /fhir/Practitioner/:id`
- `GET /fhir/Organization/:id`
- `GET /fhir/Observation/:id`
- `GET /fhir/DocumentReference/:id`
- `GET /fhir/Appointment/:id`
- `GET /fhir/samples/td2` (exemple statique)

Pour tester les endpoints, apres avoir lancé l'application, vous pouvez utiliser les commandes suivantes.

Cette commande permet de recuperer un token d'acces (Keycloak):
```bash
curl -s -X POST "http://localhost:8080/realms/epitanie/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=admin"
```

Resultat attendu: un JSON contenant `access_token`.

Une fois récupéré, vous pouvez appeler un endpoint FHIR:
```bash
curl -s "http://localhost:4000/fhir/Patient/1" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

Resultat attendu: un JSON FHIR `Patient` (id 1).

---

## Simulation TD3 (multi-instances FHIR)

On simule l'echange entre 3 services FHIR (plateforme, medecin, labo).

### 1) Lancer 3 instances

Chaque commande lance un serveur FHIR simple sur un port different.
Chaque ligne doivent être lancé dans un terminal différent.

```bash
node epitanie_project/backend/fhir-sim.js
PORT=4101 SERVICE_NAME=doctor node epitanie_project/backend/fhir-sim.js
PORT=4102 SERVICE_NAME=lab node epitanie_project/backend/fhir-sim.js
```

Par defaut (port 4100), l'instance represente la plateforme.

### 2) Medecin -> Plateforme (CR + prescription)

On envoie un compte-rendu + une prescription a la plateforme.

```bash
curl -s -X POST "http://localhost:4100/fhir/DocumentReference" \
  -H "Content-Type: application/json" \
  -d '{"resourceType":"DocumentReference","status":"current","type":{"coding":[{"code":"10"}]},"subject":{"reference":"Patient/1"},"content":[{"attachment":{"contentType":"text/plain","data":"Q1IgZW5kb2NyaW5v"}}]}'

curl -s -X POST "http://localhost:4100/fhir/ServiceRequest" \
  -H "Content-Type: application/json" \
  -d '{"resourceType":"ServiceRequest","status":"active","intent":"order","code":{"coding":[{"system":"urn:epitanie:analysis","code":"LOCAL-TSH"}]},"subject":{"reference":"Patient/1"}}'
```

Resultat attendu: chaque commande renvoie le JSON cree avec un `id`.

### 3) Plateforme -> Labo (transmettre la prescription)

On recupere la prescription de la plateforme et on la pousse vers le labo.

```bash
curl -s "http://localhost:4100/fhir/ServiceRequest" | \
python3 -c 'import json,sys; data=json.load(sys.stdin); req=data["entry"][0]["resource"]; print(json.dumps(req))' | \
curl -s -X POST "http://localhost:4102/fhir/ServiceRequest" \
  -H "Content-Type: application/json" -d @-
```

Resultat attendu: un JSON `ServiceRequest` créé sur le service labo.

### 4) Labo -> Plateforme (resultat)

Le labo renvoie un résultat d'analyse à la plateforme.

```bash
curl -s -X POST "http://localhost:4100/fhir/Observation" \
  -H "Content-Type: application/json" \
  -d '{"resourceType":"Observation","status":"final","code":{"coding":[{"system":"urn:epitanie:analysis","code":"LOCAL-TSH"}]},"subject":{"reference":"Patient/1"},"valueString":"TSH: 0.2 mIU/L"}'
```

Resultat attendu: un JSON `Observation` créé sur la plateforme.

---

## Notes

- Si le port 5432 est déjà utilise, arrèter le Postgres local avant.
- `docker compose down -v` reinitialise la base et Keycloak.
