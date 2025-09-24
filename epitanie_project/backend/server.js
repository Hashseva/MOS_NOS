// backend/server.js
const express = require('express');
const session = require('express-session');
const Keycloak = require('keycloak-connect');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');

const PORT = process.env.PORT || 4000;
const PG_CONFIG = {
  host: process.env.PG_HOST || 'localhost',
  user: process.env.PG_USER || 'epitanie',
  password: process.env.PG_PASSWORD || 'epitanie',
  database: process.env.PG_DATABASE || 'epitanie',
  port: process.env.PG_PORT || 5432
};

const pool = new Pool(PG_CONFIG);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Keycloak setup
const memoryStore = new session.MemoryStore();
app.use(session({
  secret: 'some secret',
  resave: false,
  saveUninitialized: true,
  store: memoryStore
}));

const keycloak = new Keycloak({ store: memoryStore });
app.use(keycloak.middleware());

// Extract user info from Keycloak token
function extractUserInfo(req) {
  const tokenContent = req.kauth?.grant?.access_token?.content;
  if (!tokenContent) return null;
  const roles = tokenContent.realm_access?.roles || [];
  const idpp_attr = tokenContent.id_professionnel || null;
  const id_patient_attr = tokenContent.id_patient || null;
  return { username: tokenContent.preferred_username, roles, id_professionnel: idpp_attr, id_patient: id_patient_attr };
}

// =================== Patients ===================
app.get('/api/patients', keycloak.protect(), async (req, res) => {
  try {
    const user = extractUserInfo(req);
    if (!user) return res.status(403).json({ error: 'No token info' });

    let rows;
    if (user.roles.includes('medecin') || user.roles.includes('infirmier')) {
      const profId = parseInt(user.id_professionnel, 10);
      const q = `SELECT p.* FROM patient p
                 JOIN cercle_soins cs ON cs.patient_id = p.id
                 WHERE cs.professionnel_id = $1`;
      rows = (await pool.query(q, [profId])).rows;
    } else if (user.roles.includes('secretaire')) {
      const profId = parseInt(user.id_professionnel, 10);
      const q = `SELECT p.* FROM patient p
                 JOIN professionnel pr ON pr.id = $1
                 WHERE p.structure_id = pr.structure_id`;
      rows = (await pool.query(q, [profId])).rows;
    } else if (user.roles.includes('patient')) {
      const pid = parseInt(user.id_patient, 10);
      rows = (await pool.query('SELECT * FROM patient WHERE id = $1', [pid])).rows;
    } else {
      return res.status(403).json({ error: 'No access' });
    }
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/patients/:id', keycloak.protect(), async (req, res) => {
  try {
    const user = extractUserInfo(req);
    const pid = parseInt(req.params.id, 10);
    if (!user) return res.status(403).json({ error: 'No token info' });

    let allowed = [];
    if (user.roles.includes('medecin') || user.roles.includes('infirmier')) {
      const profId = parseInt(user.id_professionnel, 10);
      const rows = (await pool.query('SELECT p.* FROM patient p JOIN cercle_soins cs ON cs.patient_id = p.id WHERE cs.professionnel_id = $1', [profId])).rows;
      allowed = rows.map(r => r.id);
    } else if (user.roles.includes('secretaire')) {
      const profId = parseInt(user.id_professionnel, 10);
      const rows = (await pool.query('SELECT p.* FROM patient p JOIN professionnel pr ON pr.id = $1 WHERE p.structure_id = pr.structure_id', [profId])).rows;
      allowed = rows.map(r => r.id);
    } else if (user.roles.includes('patient')) {
      allowed = [parseInt(user.id_patient, 10)];
    }

    if (!allowed.includes(pid)) return res.status(403).json({ error: 'Not allowed' });
    const row = (await pool.query('SELECT * FROM patient WHERE id = $1', [pid])).rows[0];
    return res.json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// POST patient → ajoute en PostgreSQL et Keycloak
app.post('/api/patients', keycloak.protect(), async (req, res) => {
  try {
    const user = extractUserInfo(req);
    if (!user.roles.includes('medecin') && !user.roles.includes('secretaire')) {
      return res.status(403).json({ error: 'Only medecin or secretaire can add patients' });
    }

    const { ipp, nom, prenom, date_naissance, structure_id } = req.body;
    const insertQuery = 'INSERT INTO patient (ipp, nom, prenom, date_naissance, structure_id) VALUES ($1,$2,$3,$4,$5) RETURNING *';
    const { rows } = await pool.query(insertQuery, [ipp, nom, prenom, date_naissance, structure_id]);
    const patient = rows[0];

    // Création Keycloak utilisateur
    const adminTokenRes = await axios.post('http://localhost:8080/realms/master/protocol/openid-connect/token', new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: 'admin',
      password: 'admin'
    }));
    const token = adminTokenRes.data.access_token;

    // Créer l'utilisateur patient
    const userRes = await axios.post(`http://localhost:8080/admin/realms/epitanie/users`, {
      username: patient.ipp,
      enabled: true,
      credentials: [{ type: 'password', value: 'test', temporary: false }]
    }, { headers: { Authorization: 'Bearer ' + token } });

    // Ajouter rôle patient
    const roleRes = await axios.get(`http://localhost:8080/admin/realms/epitanie/roles/patient`, { headers: { Authorization: 'Bearer ' + token } });
    await axios.post(`http://localhost:8080/admin/realms/epitanie/users/${userRes.data.id}/role-mappings/realm`, [roleRes.data], { headers: { Authorization: 'Bearer ' + token } });

    return res.status(201).json(patient);
  } catch (err) {
    console.error(err.response?.data || err);
    return res.status(500).json({ error: err.message });
  }
});

// =================== Rendez-vous ===================
app.post('/api/rendezvous', keycloak.protect(), async (req, res) => {
  try {
    const user = extractUserInfo(req);
    if (!user.roles.includes('medecin') && !user.roles.includes('secretaire') && !user.roles.includes('infirmier')) {
      return res.status(403).json({ error: 'Not allowed to create rendezvous' });
    }
    const { patient_id, date_debut, date_fin, objet } = req.body;
    const createur_id = parseInt(user.id_professionnel, 10);
    const insertQuery = 'INSERT INTO rendezvous (patient_id, createur_id, date_debut, date_fin, objet) VALUES ($1,$2,$3,$4,$5) RETURNING *';
    const { rows } = await pool.query(insertQuery, [patient_id, createur_id, date_debut, date_fin, objet]);
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// =================== Documents ===================
app.post('/api/document', keycloak.protect(), async (req, res) => {
  try {
    const user = extractUserInfo(req);
    if (!user.roles.includes('medecin') && !user.roles.includes('secretaire') && !user.roles.includes('infirmier')) {
      return res.status(403).json({ error: 'Not allowed to add document' });
    }
    const { patient_id, type, contenu } = req.body;
    const auteur_id = parseInt(user.id_professionnel, 10);
    const insertQuery = 'INSERT INTO document (patient_id, auteur_id, type, contenu) VALUES ($1,$2,$3,$4) RETURNING *';
    const { rows } = await pool.query(insertQuery, [patient_id, auteur_id, type, contenu]);
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// GET documents d’un patient
app.get('/api/documents/:patientId', keycloak.protect(), async (req, res) => {
  try {
    const user = extractUserInfo(req);
    const pid = parseInt(req.params.patientId, 10);

    let allowedIds = [];
    if (user.roles.includes('medecin') || user.roles.includes('infirmier')) {
      const profId = parseInt(user.id_professionnel, 10);
      const rows = (await pool.query('SELECT patient_id FROM cercle_soins WHERE professionnel_id = $1', [profId])).rows;
      allowedIds = rows.map(r => r.patient_id);
    } else if (user.roles.includes('secretaire')) {
      const profId = parseInt(user.id_professionnel, 10);
      const rows = (await pool.query('SELECT id FROM patient WHERE structure_id = (SELECT structure_id FROM professionnel WHERE id=$1)', [profId])).rows;
      allowedIds = rows.map(r => r.id);
    } else if (user.roles.includes('patient')) {
      allowedIds = [parseInt(user.id_patient, 10)];
    }

    if (!allowedIds.includes(pid)) return res.status(403).json({ error: 'Not allowed' });
    const rows = (await pool.query('SELECT * FROM document WHERE patient_id=$1', [pid])).rows;
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// =================== Résultats d’analyses ===================
app.post('/api/resultat_analyse', keycloak.protect(), async (req, res) => {
  try {
    const user = extractUserInfo(req);
    if (!user.roles.includes('medecin')) return res.status(403).json({ error: 'Only medecin can add result' });
    const { patient_id, contenu } = req.body;
    const prescripteur_id = parseInt(user.id_professionnel, 10);
    const insertQuery = 'INSERT INTO resultat_analyse (patient_id, prescripteur_id, contenu) VALUES ($1,$2,$3) RETURNING *';
    const { rows } = await pool.query(insertQuery, [patient_id, prescripteur_id, contenu]);

    // 🚨 Alertes automatiques pour secrétaires et prescripteur
    console.log(`ALERTE: nouveau résultat d'analyse pour patient ${patient_id}, prescripteur ${prescripteur_id}`);

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// =================== Messagerie interne ===================
app.post('/api/messages', keycloak.protect(), async (req, res) => {
  try {
    const user = extractUserInfo(req);
    const { destinataire_id, contenu } = req.body;
    const createur_id = user.roles.includes('patient') ? parseInt(user.id_patient, 10) : parseInt(user.id_professionnel, 10);
    const insertQuery = 'INSERT INTO messages (createur_id, destinataire_id, contenu) VALUES ($1,$2,$3) RETURNING *';
    const { rows } = await pool.query(insertQuery, [createur_id, destinataire_id, contenu]);
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages/:userId', keycloak.protect(), async (req, res) => {
  try {
    const user = extractUserInfo(req);
    const uid = parseInt(req.params.userId, 10);
    let allowedIds = [];
    if (user.roles.includes('medecin') || user.roles.includes('infirmier') || user.roles.includes('secretaire')) {
      const profId = parseInt(user.id_professionnel, 10);
      // autorisation : peut lire tous messages où il est créateur ou destinataire
      const rows = (await pool.query('SELECT * FROM messages WHERE createur_id=$1 OR destinataire_id=$1', [profId])).rows;
      return res.json(rows);
    } else if (user.roles.includes('patient')) {
      const pid = parseInt(user.id_patient, 10);
      const rows = (await pool.query('SELECT * FROM messages WHERE createur_id=$1 OR destinataire_id=$1', [pid])).rows;
      return res.json(rows);
    } else {
      return res.status(403).json({ error: 'Not allowed' });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// =================== Start server ===================
app.listen(PORT, () => {
  console.log(`Backend listening on ${PORT}`);
});
