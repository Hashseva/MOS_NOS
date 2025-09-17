-- init_db.sql
-- Tables
CREATE TABLE structure (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    secteur VARCHAR(50) NOT NULL
);

CREATE TABLE professionnel (
    id SERIAL PRIMARY KEY,
    idpp VARCHAR(50) UNIQUE NOT NULL,
    nom VARCHAR(255) NOT NULL,
    prenom VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('medecin','infirmier','secretaire')),
    structure_id INT REFERENCES structure(id)
);

CREATE TABLE patient (
    id SERIAL PRIMARY KEY,
    ipp VARCHAR(50) UNIQUE NOT NULL,
    nom VARCHAR(255) NOT NULL,
    prenom VARCHAR(255) NOT NULL,
    date_naissance DATE NOT NULL,
    structure_id INT REFERENCES structure(id)
);

CREATE TABLE cercle_soins (
    patient_id INT REFERENCES patient(id) ON DELETE CASCADE,
    professionnel_id INT REFERENCES professionnel(id) ON DELETE CASCADE,
    pathologie VARCHAR(255),
    PRIMARY KEY (patient_id, professionnel_id)
);

CREATE TABLE document (
    id SERIAL PRIMARY KEY,
    patient_id INT REFERENCES patient(id) ON DELETE CASCADE,
    auteur_id INT REFERENCES professionnel(id),
    type VARCHAR(50),
    contenu TEXT,
    date_creation TIMESTAMP DEFAULT now()
);

CREATE TABLE rendezvous (
    id SERIAL PRIMARY KEY,
    patient_id INT REFERENCES patient(id) ON DELETE CASCADE,
    createur_id INT REFERENCES professionnel(id),
    date_debut TIMESTAMP NOT NULL,
    date_fin TIMESTAMP NOT NULL,
    objet VARCHAR(255)
);

CREATE TABLE resultat_analyse (
    id SERIAL PRIMARY KEY,
    patient_id INT REFERENCES patient(id) ON DELETE CASCADE,
    prescripteur_id INT REFERENCES professionnel(id),
    contenu TEXT NOT NULL,
    date_reception TIMESTAMP DEFAULT now()
);

-- Données de test
INSERT INTO structure (nom, secteur) VALUES ('CH Epitanie Centre', 'Urbain'), ('Cabinet VilleSud', 'Rural');

-- Professionnels
INSERT INTO professionnel (idpp, nom, prenom, role, structure_id) VALUES
('IDPP-MED01','Durand','Alice','medecin',1),
('IDPP-MED02','Martin','Paul','medecin',2),
('IDPP-INF01','Leclerc','Julie','infirmier',1),
('IDPP-SEC01','Secretariat','Centre','secretaire',1);

-- Patients
INSERT INTO patient (ipp, nom, prenom, date_naissance, structure_id) VALUES
('IPP-0001','Petit','Jean','1980-05-12',1),
('IPP-0002','Bernard','Marie','1975-11-02',1),
('IPP-0003','Nguyen','Linh','1990-01-20',2);

-- Cercle de soins (qui peut accéder à quels patients)
-- Médecin Alice (id=1) suit patients 1 et 2
INSERT INTO cercle_soins (patient_id, professionnel_id, pathologie) VALUES
(1,1,'Diabète'),
(2,1,'HTA');
-- Médecin Paul (id=2) suit patient 3
INSERT INTO cercle_soins (patient_id, professionnel_id, pathologie) VALUES
(3,2,'Dermatologie');
-- Infirmier Julie (id=3) suit patient 1
INSERT INTO cercle_soins (patient_id, professionnel_id, pathologie) VALUES
(1,3,'Diabète');

-- Documents et résultats
INSERT INTO document (patient_id,auteur_id,type,contenu) VALUES
(1,1,'compte_rendu','Compte-rendu consultation 2025-01-02 pour Jean Petit'),
(2,1,'compte_rendu','Compte-rendu consultation 2025-02-10 pour Marie Bernard');

INSERT INTO resultat_analyse (patient_id,prescripteur_id,contenu) VALUES
(1,1,'Glycémie : 1.2 g/L');

-- Rendez-vous
INSERT INTO rendezvous (patient_id,createur_id,date_debut,date_fin,objet) VALUES
(1,4,'2025-09-20 09:00','2025-09-20 09:30','Consultation suivi');
