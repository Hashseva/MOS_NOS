const express = require('express');
const session = require('express-session');
const Keycloak = require('keycloak-connect');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');

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

const memoryStore = new session.MemoryStore();
app.use(session({
  secret: 'some secret',
  resave: false,
  saveUninitialized: true,
  store: memoryStore
}));

const keycloak = new Keycloak({ store: memoryStore });
app.use(keycloak.middleware());

function extractUserInfo(req) {
  const tokenContent = req.kauth && req.kauth.grant && req.kauth.grant.access_token && req.kauth.grant.access_token.content;
  if (!tokenContent) return null;
  const roles = (tokenContent.realm_access && tokenContent.realm_access.roles) || [];
  const idpp_attr = tokenContent.hasOwnProperty('id_professionnel') ? tokenContent.id_professionnel : null;
  const id_patient_attr = tokenContent.hasOwnProperty('id_patient') ? tokenContent.id_patient : null;
  return { username: tokenContent.preferred_username, roles, id_professionnel: idpp_attr, id_patient: id_patient_attr };
}

app.get('/api/patients', keycloak.protect(), async (req, res) => {
  try {
    const user = extractUserInfo(req);
    if (!user) return res.status(403).json({ error: 'No token info' });

    if (user.roles.includes('medecin') || user.roles.includes('infirmier')) {
      const profId = parseInt(user.id_professionnel, 10);
      if (!profId) return res.status(400).json({ error: 'id_professionnel missing in token' });
      const q = `SELECT p.* FROM patient p
                 JOIN cercle_soins cs ON cs.patient_id = p.id
                 WHERE cs.professionnel_id = $1`;
      const { rows } = await pool.query(q, [profId]);
      return res.json(rows);
    }

    if (user.roles.includes('secretaire')) {
      const profId = parseInt(user.id_professionnel, 10);
      if (!profId) return res.status(400).json({ error: 'id_professionnel missing in token' });
      const q = `SELECT p.* FROM patient p
                 JOIN professionnel pr ON pr.id = $1
                 WHERE p.structure_id = pr.structure_id`;
      const { rows } = await pool.query(q, [profId]);
      return res.json(rows);
    }

    if (user.roles.includes('patient')) {
      const pid = parseInt(user.id_patient, 10);
      if (!pid) return res.status(400).json({ error: 'id_patient missing in token' });
      const { rows } = await pool.query('SELECT * FROM patient WHERE id = $1', [pid]);
      return res.json(rows);
    }

    return res.status(403).json({ error: 'No access' });
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
      const { rows } = await pool.query('SELECT p.* FROM patient p JOIN cercle_soins cs ON cs.patient_id = p.id WHERE cs.professionnel_id = $1', [profId]);
      allowed = rows.map(r => r.id);
    } else if (user.roles.includes('secretaire')) {
      const profId = parseInt(user.id_professionnel, 10);
      const { rows } = await pool.query('SELECT p.* FROM patient p JOIN professionnel pr ON pr.id = $1 WHERE p.structure_id = pr.structure_id', [profId]);
      allowed = rows.map(r => r.id);
    } else if (user.roles.includes('patient')) {
      allowed = [parseInt(user.id_patient, 10)];
    }

    if (!allowed.includes(pid)) return res.status(403).json({ error: 'Not allowed' });

    const { rows } = await pool.query('SELECT * FROM patient WHERE id = $1', [pid]);
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on ${PORT}`);
});
