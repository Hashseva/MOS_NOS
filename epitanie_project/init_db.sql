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

-- 1. Table de référence pour les Nomenclatures (Indispensable pour l'interopérabilité)
-- Elle servira à ton Backend pour traduire les codes (10 -> Médecin)
CREATE TABLE ref_nomenclature (
    oid VARCHAR(100),         -- L'identifiant du système de codage (ex: 1.2.250.1.213.1.6.1.10)
    code VARCHAR(50),         -- Le code (ex: '10')
    libelle VARCHAR(255),     -- Le libellé affiché (ex: 'Médecin')
    PRIMARY KEY (oid, code)
);

-- 2. Structure (MOS : Entité Géographique ou Juridique)
-- Remplacement de 'secteur' par 'code_categorie' (TRE_R66_CategorieEtablissement)
CREATE TABLE structure (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    code_categorie VARCHAR(50) NOT NULL -- ex: '355' (Hôpital), 'CAB' (Cabinet)
);

-- 3. Professionnel (MOS : Professionnel de Santé)
-- Remplacement de 'role' par 'code_profession' (TRE_G15_ProfessionSante)
CREATE TABLE professionnel (
    id SERIAL PRIMARY KEY,
    idpp VARCHAR(50) UNIQUE NOT NULL, -- Identifiant national (RPPS)
    nom VARCHAR(255) NOT NULL,
    prenom VARCHAR(255) NOT NULL,
    code_profession VARCHAR(50) NOT NULL, -- Réfère à TRE_G15 (10=Médecin, 60=Infirmier)
    structure_id INT REFERENCES structure(id)
);

-- 4. Patient (MOS : Usager)
-- Ajout du Sexe Administratif (TRE_R10_SexeAdministratif)
CREATE TABLE patient (
    id SERIAL PRIMARY KEY,
    ipp VARCHAR(50) UNIQUE NOT NULL, -- Identifiant Permanent Patient
    nom VARCHAR(255) NOT NULL,
    prenom VARCHAR(255) NOT NULL,
    date_naissance DATE NOT NULL,
    code_sexe VARCHAR(1) CHECK (code_sexe IN ('M', 'F', 'I')), -- M=Masculin, F=Féminin
    structure_id INT REFERENCES structure(id)
);

-- 5. Cercle de soins
-- Idéalement, la pathologie devrait être un code CIM-10 (ex: E11 pour Diabète)
CREATE TABLE cercle_soins (
    patient_id INT REFERENCES patient(id) ON DELETE CASCADE,
    professionnel_id INT REFERENCES professionnel(id) ON DELETE CASCADE,
    code_pathologie VARCHAR(50), -- ex: 'E11' (Diabète), 'I10' (HTA)
    PRIMARY KEY (patient_id, professionnel_id)
);

-- 6. Document
-- Remplacement de 'type' par 'code_type_document' (TRE_A04 ou LOINC)
CREATE TABLE document (
    id SERIAL PRIMARY KEY,
    patient_id INT REFERENCES patient(id) ON DELETE CASCADE,
    auteur_id INT REFERENCES professionnel(id),
    code_type_document VARCHAR(50), -- ex: 'CR-CONS' pour Compte Rendu Consultation
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
CREATE TABLE rendezvous (
    id SERIAL PRIMARY KEY,
    patient_id INT REFERENCES patient(id) ON DELETE CASCADE,
    createur_id INT REFERENCES professionnel(id),
    date_debut TIMESTAMP NOT NULL,
    date_fin TIMESTAMP NOT NULL,
    objet VARCHAR(255)
);

-- 9. Résultat d'analyse
CREATE TABLE resultat_analyse (
    id SERIAL PRIMARY KEY,
    patient_id INT REFERENCES patient(id) ON DELETE CASCADE,
    prescripteur_id INT REFERENCES professionnel(id),
    code_analyse VARCHAR(50), -- Code LOINC idéalement (ex: Glucose)
    contenu TEXT NOT NULL,
    date_reception TIMESTAMP DEFAULT now()
);

-- --- INSERTION DES DONNÉES (JEU DE TEST CONFORME) ---

-- A. Remplissage du dictionnaire (Ref_Nomenclature)
-- Ce sont les vrais codes NOS simplifiés pour ton TD
INSERT INTO ref_nomenclature (oid, code, libelle) VALUES 
-- 1. Professions de santé (TRE_G15) - OID: 1.2.250.1.213.1.6.1.10
('1.2.250.1.213.1.6.1.10', '10', 'Médecin'),
('1.2.250.1.213.1.6.1.10', '60', 'Infirmier'),

-- 2. Spécialités Ordinales (TRE_R38) - OID: 1.2.250.1.213.1.6.1.18
-- (Utilisé si tu veux préciser "Médecin Généraliste" plus tard)
('1.2.250.1.213.1.6.1.18', 'SM26', 'Qualifié en Médecine Générale'),
('1.2.250.1.213.1.6.1.18', 'SCD01', 'Orthopédie dentaire'),

-- 3. Catégorie d'établissement (TRE_R66) - OID: 1.2.250.1.213.1.6.1.8
('1.2.250.1.213.1.6.1.8', '355', 'Centre Hospitalier (CH)'),
-- Note: 'CAB' n'est pas un code officiel (le code dépend du statut juridique exact), 
-- mais on le garde sous cet OID pour le fonctionnement du TD.
('1.2.250.1.213.1.6.1.8', 'CAB', 'Cabinet Libéral'),

-- 4. Rôles internes (Hors nomenclature nationale)
('LOCAL', 'SEC', 'Secrétaire Médicale'),

-- 5. Types de documents (TRE_A04) - OID: 1.2.250.1.213.1.1.4.12
('1.2.250.1.213.1.1.4.12', 'CR-CONS', 'Compte-rendu de consultation'),
('1.2.250.1.213.1.1.4.12', 'ORD', 'Ordonnance'),
('1.2.250.1.213.1.1.4.12', 'CR-IMG', 'Compte-rendu d''imagerie'),

-- 6. Pathologies (CIM-10) - OID: 2.16.840.1.113883.6.3
('2.16.840.1.113883.6.3', 'E11', 'Diabète de type 2'),
('2.16.840.1.113883.6.3', 'I10', 'Hypertension essentielle'),
('2.16.840.1.113883.6.3', 'L00', 'Affection dermatologique'),

-- 7. Analyses (LOINC) - OID: 2.16.840.1.113883.6.1
('2.16.840.1.113883.6.1', 'GLUCOSE', 'Glycémie'),
('2.16.840.1.113883.6.1', 'TSH', 'Hormone thyréotrope (TSH)'),
('2.16.840.1.113883.6.1', 'NFS', 'Numération form. sanguine');


-- B. Structures
-- On utilise le code 355 pour l'hôpital et CAB pour le cabinet
INSERT INTO structure (nom, code_categorie) VALUES 
('CH Epitanie Centre', '355'), 
('Cabinet VilleSud', 'CAB');

-- C. Professionnels
-- Note : code_profession remplace le string "medecin"
INSERT INTO professionnel (idpp, nom, prenom, code_profession, structure_id) VALUES
('IDPP-MED01','Durand','Alice','10', 1),  -- 10 = Médecin
('IDPP-MED02','Martin','Paul','10', 2),   -- 10 = Médecin
('IDPP-INF01','Leclerc','Julie','60', 1), -- 60 = Infirmier
('IDPP-SEC01','Secretariat','Centre','SEC', 1); -- SEC = Secrétaire

-- D. Patients
-- Ajout du sexe (F/M) requis par l'identité standard
INSERT INTO patient (ipp, nom, prenom, date_naissance, code_sexe, structure_id) VALUES
('IPP-0001','Petit','Jean','1980-05-12', 'M', 1),
('IPP-0002','Bernard','Marie','1975-11-02', 'F', 1),
('IPP-0003','Nguyen','Linh','1990-01-20', 'M', 2);

-- E. Cercle de soins
-- Utilisation de codes CIM-10 simulés (ex: E11 au lieu de "Diabète")
INSERT INTO cercle_soins (patient_id, professionnel_id, code_pathologie) VALUES
(1,1,'E11'), -- Alice suit Jean pour Diabète
(2,1,'I10'), -- Alice suit Marie pour HTA
(3,2,'L00'), -- Paul suit Linh pour Dermato
(1,3,'E11'); -- Julie (Inf) suit Jean pour Diabète

-- F. Documents
INSERT INTO document (patient_id, auteur_id, code_type_document, contenu) VALUES
(1,1,'CR-CONS','Compte-rendu consultation 2025-01-02 pour Jean Petit'),
(2,1,'CR-CONS','Compte-rendu consultation 2025-02-10 pour Marie Bernard');

-- G. Résultats Analyse
INSERT INTO resultat_analyse (patient_id, prescripteur_id, code_analyse, contenu) VALUES
(1,1, 'GLUCOSE', 'Glycémie : 1.2 g/L');

-- H. Rendez-vous
INSERT INTO rendezvous (patient_id, createur_id, date_debut, date_fin, objet) VALUES
(1,4,'2025-09-20 09:00','2025-09-20 09:30','Consultation suivi');