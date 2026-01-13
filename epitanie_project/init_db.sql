-- init_db.sql
-- Nettoyage préalable (optionnel si tu relances souvent)
DROP TABLE IF EXISTS resultat_analyse CASCADE;
DROP TABLE IF EXISTS rendezvous CASCADE;
DROP TABLE IF EXISTS message CASCADE;
DROP TABLE IF EXISTS document CASCADE;
DROP TABLE IF EXISTS cercle_soins CASCADE;
DROP TABLE IF EXISTS patient CASCADE;
DROP TABLE IF EXISTS professionnel CASCADE;
DROP TABLE IF EXISTS structure CASCADE;
DROP TABLE IF EXISTS ref_nomenclature CASCADE;

-- 1. Table de référence pour les Nomenclatures NOS
-- Elle servira à ton Backend pour traduire les codes (10 -> Médecin)
CREATE TABLE ref_nomenclature (
    oid VARCHAR(100),         -- L'identifiant du système de codage (ex: 1.2.250.1.213.1.6.1.10)
    code VARCHAR(50),         -- Le code (ex: '10')
    libelle VARCHAR(255),     -- Le libellé affiché (ex: 'Médecin')
    PRIMARY KEY (oid, code)
);

-- 2. Structure
-- Normalement, il faudrait distinguer l'entité juridique et l'entité géographique.
-- Pour simplifier le TD, nous utilisons une table unique.
-- https://mos.esante.gouv.fr/4.html#_f6152a96-2f8f-4f69-89f5-18f024d4b4d8
-- Remplacement de 'secteur' par 'code_categorie' (TRE_R66_CategorieEtablissement)
-- https://interop.esante.gouv.fr/ig/nos/1.5.0/CodeSystem-TRE-R66-CategorieEtablissement.html
CREATE TABLE structure (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    code_categorie VARCHAR(50) NOT NULL -- ex: '355' (Hôpital)
);

-- 3. Professionnel
-- Inspiration de la structure MOS suivante, pour la classe Professionnel :
-- https://mos.esante.gouv.fr/2.html#_9d79ff39-6b00-4aa6-ac03-7afb4a8aad2b:~:text=Classe%20%22Professionnel%22
-- Remplacement de 'role' par 'code_profession' (TRE_G15_ProfessionSante)
-- https://interop.esante.gouv.fr/ig/nos/1.5.0/CodeSystem-TRE-G15-ProfessionSante.html
CREATE TABLE professionnel (
    id SERIAL PRIMARY KEY,
    idpp VARCHAR(50) UNIQUE NOT NULL, -- Identifiant national (RPPS)
    nom VARCHAR(255) NOT NULL,
    prenom VARCHAR(255) NOT NULL,
    code_profession VARCHAR(50) NOT NULL, -- Réfère à TRE_G15 (10=Médecin, 60=Infirmier)
    structure_id INT REFERENCES structure(id)
);

-- 4. Patient
-- Inspiré de Classe "PersonnePriseCharge":
-- https://mos.esante.gouv.fr/10.html#_3c0d057f-9056-4d1c-b392-b6343c79fafa:~:text=Classe%20%22PersonnePriseCharge%22
-- Ajout du Sexe Administratif (TRE_R10_SexeAdministratif)
-- https://interop.esante.gouv.fr/ig/nos/1.5.0/CodeSystem-TRE-R10-SexeAdministratif.html
CREATE TABLE patient (
    id SERIAL PRIMARY KEY,
    ipp VARCHAR(50) UNIQUE NOT NULL, -- Identifiant Permanent Patient
    nom VARCHAR(255) NOT NULL,
    prenom VARCHAR(255) NOT NULL,
    date_naissance DATE NOT NULL,
    code_sexe VARCHAR(1) CHECK (code_sexe IN ('M', 'F')), -- M=Masculin, F=Féminin
    structure_id INT REFERENCES structure(id)
);

-- 5. Cercle de soins
-- https://mos.esante.gouv.fr/20.html
-- La pathologie est un code standardisé (ex: E11 pour Diabète)
-- https://icd.who.int/browse10/2008/fr
CREATE TABLE cercle_soins (
    patient_id INT REFERENCES patient(id) ON DELETE CASCADE,
    professionnel_id INT REFERENCES professionnel(id) ON DELETE CASCADE,
    code_pathologie VARCHAR(50), -- ex: 'E11' (Diabète)
    PRIMARY KEY (patient_id, professionnel_id)
);

-- 6. Document
-- https://mos.esante.gouv.fr/12.html#_31ce6d02-a917-4f77-8cf8-052dac62bc15:~:text=Classe%20%22Document%22
-- Remplacement de 'type' par 'code_type_document' (TRE_A03)
-- https://interop.esante.gouv.fr/ig/nos/1.5.0/CodeSystem-TRE-A03-ClasseDocument.html
CREATE TABLE document (
    id SERIAL PRIMARY KEY,
    patient_id INT REFERENCES patient(id) ON DELETE CASCADE,
    auteur_id INT REFERENCES professionnel(id),
    code_type_document VARCHAR(50), -- ex: '10' pour Compte rendu
    contenu TEXT,
    date_creation TIMESTAMP DEFAULT now()
);

-- 7. Message (Messagerie sécurisée)
CREATE TABLE message (
  id SERIAL PRIMARY KEY,
  emetteur_type TEXT NOT NULL,      -- 'pro' ou 'pat'
  emetteur_id   INT NOT NULL,
  destinataire_type TEXT NOT NULL,  -- 'pro' ou 'pat'
  destinataire_id   INT NOT NULL,
  contenu TEXT NOT NULL,
  date_envoi TIMESTAMP DEFAULT now()
);

-- 8. Rendez-vous
-- https://mos.esante.gouv.fr/13.html#_e2f3f153-4095-4fc4-b1dd-5adf63ecbdfd:~:text=Classe%20%22RendezVous%22
CREATE TABLE rendezvous (
    id SERIAL PRIMARY KEY,
    patient_id INT REFERENCES patient(id) ON DELETE CASCADE,
    createur_id INT REFERENCES professionnel(id),
    date_debut TIMESTAMP NOT NULL,
    date_fin TIMESTAMP NOT NULL,
    objet VARCHAR(255)
);

-- 9. Résultat d'analyse
-- https://mos.esante.gouv.fr/10.html#_24f2914e-9690-4c12-84e9-8a3f887d8983:~:text=Classe%20%22ResultatObservation%22
CREATE TABLE resultat_analyse (
    id SERIAL PRIMARY KEY,
    patient_id INT REFERENCES patient(id) ON DELETE CASCADE,
    prescripteur_id INT REFERENCES professionnel(id),
    code_analyse VARCHAR(50), -- Code interne (ex: LOCAL-GLUCOSE)
    contenu TEXT NOT NULL,
    date_reception TIMESTAMP DEFAULT now()
);

-- --- INSERTION DES DONNÉES ---

-- A. Remplissage du dictionnaire des nomenclatures
-- Mélange de codes NOS officiels + codes internes quand nécessaire.
INSERT INTO ref_nomenclature (oid, code, libelle) VALUES 
-- 1. Professions de santé (TRE_G15)
('1.2.250.1.71.1.2.7', '10', 'Médecin'),
('1.2.250.1.71.1.2.7', '60', 'Infirmier'),

-- 2. Catégorie d'établissement (TRE_R66) - OID: 1.2.250.1.213.1.6.1.8
('1.2.250.1.213.1.6.1.8', '355', 'Centre Hospitalier (CH)'),

-- 4. Roles internes (hors nomenclature nationale)
-- Le role "secretaire" n'existe pas dans TRE_G15, on utilise un code local n'ayant pas trouver rien d'assez proche.
('LOCAL', 'SEC', 'Secrétaire'),

-- 5. Types de documents (TRE_A03) - OID: 1.2.250.1.213.1.1.4.1 
('1.2.250.1.213.1.1.4.1', '10', 'Compte rendu'),
('1.2.250.1.213.1.1.4.1', '42', 'Prescription'),
('1.2.250.1.213.1.1.4.1', '31', 'Imagerie médicale'),

-- 6. Pathologies
-- OID officiel pour la CIM-10 : 2.16.840.1.113883.6.3
-- https://icd.who.int/browse10/2008/fr#/E11
-- https://icd.who.int/browse10/2008/fr#/I10
-- https://icd.who.int/browse10/2008/fr#/L00
('2.16.840.1.113883.6.3', 'E11', 'Diabète de type 2'),
('2.16.840.1.113883.6.3', 'I10', 'Hypertension essentielle'),
('2.16.840.1.113883.6.3', 'J01', 'Sinusite aiguë'),

-- 7. Analyses (codes internes)
('LOCAL', 'LOCAL-GLUCOSE', 'Glycémie'),
('LOCAL', 'LOCAL-TSH', 'Hormone thyréotrope (TSH)'),
('LOCAL', 'LOCAL-NFS', 'Numération form. sanguine');


-- B. Structures
-- On utilise un code officiel pour les deux structures
INSERT INTO structure (nom, code_categorie) VALUES 
('CH Epitanie Centre', '355'), 
('Structure VilleSud', '355');

-- C. Professionnels
-- Note : code_profession remplace le string "medecin"
INSERT INTO professionnel (idpp, nom, prenom, code_profession, structure_id) VALUES
('IDPP-MED01','Durand','Alice','10', 1),  -- 10 = Médecin
('IDPP-MED02','Martin','Paul','10', 2),   -- 10 = Médecin
('IDPP-INF01','Leclerc','Julie','60', 1), -- 60 = Infirmier
('IDPP-SEC01','Secretariat','Centre','SEC', 1); -- SEC = Secrétaire (code local)

-- D. Patients
-- Ajout du sexe (F/M) requis par l'identité standard
INSERT INTO patient (ipp, nom, prenom, date_naissance, code_sexe, structure_id) VALUES
('IPP-0001','Petit','Jean','1980-05-12', 'M', 1),
('IPP-0002','Bernard','Marie','1975-11-02', 'F', 1),
('IPP-0003','Nguyen','Linh','1990-01-20', 'M', 2);

-- E. Cercle de soins
-- Utilisation de codes de pathologie (ex: E11 au lieu de "Diabète")
INSERT INTO cercle_soins (patient_id, professionnel_id, code_pathologie) VALUES
(1,1,'E11'), -- Alice suit Jean pour Diabète
(2,1,'I10'), -- Alice suit Marie pour HTA
(3,2,'J01'), -- Paul suit Linh pour Sinusite
(1,3,'E11'); -- Julie (Inf) suit Jean pour Diabète

-- F. Documents
INSERT INTO document (patient_id, auteur_id, code_type_document, contenu) VALUES
(1,1,'10','Compte-rendu consultation 2025-01-02 pour Jean Petit'),
(2,1,'10','Compte-rendu consultation 2025-02-10 pour Marie Bernard');

-- G. Résultats Analyse
INSERT INTO resultat_analyse (patient_id, prescripteur_id, code_analyse, contenu) VALUES
(1,1, 'LOCAL-GLUCOSE', 'Glycémie : 1.2 g/L');

-- H. Rendez-vous
INSERT INTO rendezvous (patient_id, createur_id, date_debut, date_fin, objet) VALUES
(1,4,'2025-09-20 09:00','2025-09-20 09:30','Consultation suivi');
