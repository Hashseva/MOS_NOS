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
  host: 'localhost',//process.env.PG_HOST || 'localhost',
  user: 'epitanie',//process.env.PG_USER || 'epitanie',
  password: 'epitanie',//process.env.PG_PASSWORD || 'epitanie',
  database: 'epitanie',//process.env.PG_DATABASE || 'epitanie',
  port: 5432//process.env.PG_PORT || 5432
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

// helper: read KC username + roles
function getKC(req) {
  const t = req.kauth?.grant?.access_token?.content;
  if (!t) throw new Error('no-token');
  return { username: t.preferred_username, roles: t.realm_access?.roles || [] };
}

// helper: resolve professionnel by KC username (case-insensitive)
async function getProByUsername(username) {
  const r = await pool.query(
    'SELECT id, structure_id FROM professionnel WHERE LOWER(idpp) = LOWER($1)',
    [username]
  );
  return r.rows[0]; // undefined if not found
}

async function getPatientByIPP(ipp) {
  const r = await pool.query(
    'SELECT * FROM patient WHERE UPPER(ipp) = UPPER($1)',
    [String(ipp).trim()]
  );
  return r.rows[0];
}

// =================== Patients ===================
app.get('/api/patients', keycloak.protect(), async (req, res) => {
  try {
    const { username, roles } = getKC(req);

    if (roles.includes('medecin') || roles.includes('infirmier')) {
      const pro = await getProByUsername(username);
      // renvoie la pathologie liée à CE pro via cercle_soins
      const q = `
        SELECT p.*, cs.pathologie
        FROM patient p
        JOIN cercle_soins cs
          ON cs.patient_id = p.id
         AND cs.professionnel_id = $1
        ORDER BY p.nom, p.prenom
      `;
      const rows = (await pool.query(q, [pro?.id || -1])).rows;
      return res.json(rows);
    }

    if (roles.includes('secretaire')) {
      const pro = await getProByUsername(username);
      // pas de lien direct au pro : on laisse pathologie à NULL
      const rows = (await pool.query(
        `SELECT p.*, NULL::text AS pathologie
           FROM patient p
          WHERE p.structure_id = $1
          ORDER BY p.nom, p.prenom`,
        [pro?.structure_id || -1]
      )).rows;
      return res.json(rows);
    }

    if (roles.includes('patient')) {
      const me = await getPatientByIPP(username);
      if (!me) return res.json([]);
      // pour un patient, on peut agréger TOUTES ses pathologies
      const rows = (await pool.query(
        `SELECT p.*,
                (SELECT string_agg(cs.pathologie, ', ' ORDER BY cs.pathologie)
                   FROM cercle_soins cs
                  WHERE cs.patient_id = p.id) AS pathologie
           FROM patient p
          WHERE p.id = $1`,
        [me.id]
      )).rows;
      return res.json(rows);
    }

    return res.status(403).json({ error: 'No access' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'server error' });
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

// helper: map token -> professionnel (id, structure_id)
async function getProfessional(ctx) {
  const username = ctx.kauth?.grant?.access_token?.content?.preferred_username;
  if (!username) throw new Error('no-username');

  const r = await pool.query(
    'SELECT id, structure_id FROM professionnel WHERE LOWER(idpp) = LOWER($1)',
    [username]
  );
  if (!r.rows.length) throw new Error('pro-not-found');
  return r.rows[0]; // { id: int, structure_id: int|null }
}

// ensure uniqueness once:
/// ALTER TABLE cercle_soins ADD CONSTRAINT uniq_cercle_soins UNIQUE (professionnel_id, patient_id);

// POST /patients  -> create (if needed) + attach 

app.post('/api/patients', keycloak.protect(), async (req, res) => {
  try {
    const pro = await getProfessional(req);             // <- gets {id, structure_id}
    const { ipp, nom, prenom, date_naissance, pathologie  } = req.body || {};
    if (!ipp || !nom || !prenom || !date_naissance) {
      return res.status(400).json({ error: 'missing fields' });
    }

    const c = await pool.connect();
    try {
      await c.query('BEGIN');

      // create patient if not exists; set structure_id to the doctor's structure
      const ins = await c.query(
        `INSERT INTO patient (ipp, nom, prenom, date_naissance, structure_id)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (ipp) DO UPDATE SET ipp = EXCLUDED.ipp
         RETURNING id`,
        [ipp, nom, prenom, date_naissance, pro.structure_id]   // <-- integer from DB, never NaN
      );
      const patientId = ins.rows[0].id;

      // attach to care circle (idempotent)
      await c.query(
        `INSERT INTO cercle_soins (professionnel_id, patient_id, pathologie)
         VALUES ($1,$2,$3)
         ON CONFLICT (professionnel_id, patient_id)
         DO UPDATE SET pathologie = EXCLUDED.pathologie`,
        [pro.id, patientId, (pathologie ?? '').trim() || null]
      );

      await c.query('COMMIT');
      return res.status(201).json({ id: patientId });
    } catch (e) {
      await c.query('ROLLBACK');
      if (e.code === '23505') return res.status(409).json({ error: 'IPP already exists' });
      console.error(e);
      return res.status(500).json({ error: 'server error' });
    } finally {
      c.release();
    }
  } catch (e) {
    if (e.message === 'pro-not-found') return res.status(403).json({ error: 'User not found' });
    if (e.message === 'no-username')  return res.status(401).json({ error: 'unauthorized' });
    console.error(e);
    return res.status(500).json({ error: 'server error' });
  }
});

// POST /patients/attach  -> attach existing patient by IPP
app.post('/api/patients/attach', keycloak.protect(), async (req, res) => {
  try {
    const pro = await getProfessional(req);
    const { ipp, pathologie } = req.body || {};
    if (!ipp) return res.status(400).json({ error: 'missing ipp' });

    const r = await pool.query('SELECT id FROM patient WHERE ipp=$1', [ipp]);
    if (!r.rows.length) return res.status(404).json({ error: 'patient not found' });

    await pool.query(
      `INSERT INTO cercle_soins (professionnel_id, patient_id, pathologie)
       VALUES ($1,$2,$3)
       ON CONFLICT (professionnel_id, patient_id)
       DO UPDATE SET pathologie = EXCLUDED.pathologie`,
      [pro.id, r.rows[0].id, (pathologie ?? '').trim() || null]
    );
    return res.status(204).end();
  } catch (e) {
    if (e.message === 'pro-not-found') return res.status(403).json({ error: 'User not found' });
    console.error(e);
    return res.status(500).json({ error: 'server error' });
  }
});

// =================== Rendez-vous ===================
// GET rendezvous for a patient
app.get('/api/rendezvous', keycloak.protect(), async (req, res) => {
  try {
    const { username, roles } = getKC(req);
    const patientId = Number(req.query.patient_id);
    if (!Number.isInteger(patientId)) return res.status(400).json({ error: 'bad patient id' });

    let allowed = false;
    if (roles.includes('medecin') || roles.includes('infirmier')) {
      const pro = await getProByUsername(username);
      const x = await pool.query(
        'SELECT 1 FROM cercle_soins WHERE professionnel_id=$1 AND patient_id=$2',
        [pro.id, patientId]
      );
      allowed = x.rowCount > 0;
    } else if (roles.includes('secretaire')) {
      const pro = await getProByUsername(username);
      const x = await pool.query(
        'SELECT 1 FROM patient WHERE id=$1 AND structure_id=$2',
        [patientId, pro.structure_id]
      );
      allowed = x.rowCount > 0;
    } else if (roles.includes('patient')) {
      const me = await getPatientByIPP(username);
      allowed = !!me && me.id === patientId;
    }
    if (!allowed) return res.status(403).json({ error: 'forbidden' });

    const rows = (await pool.query(
      'SELECT * FROM rendezvous WHERE patient_id=$1 ORDER BY date_debut',
      [patientId]
    )).rows;
    return res.json(rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

// POST new rendezvous
app.post('/api/rendezvous', keycloak.protect(), async (req, res) => {
  try {
    const { username, roles } = getKC(req);
    if (!roles.includes('medecin') && !roles.includes('secretaire'))
      return res.status(403).json({ error: 'no access' });

    const { patient_id, date_debut, date_fin, objet } = req.body || {};
    if (!patient_id || !date_debut || !date_fin || !objet)
      return res.status(400).json({ error: 'missing fields' });

    const patientId = Number(patient_id);
    const pro = await getProByUsername(username);

    // same checks as above
    if (roles.includes('medecin')) {
      const x = await pool.query(
        'SELECT 1 FROM cercle_soins WHERE professionnel_id=$1 AND patient_id=$2',
        [pro.id, patientId]
      );
      if (!x.rowCount) return res.status(403).json({ error: 'forbidden' });
    } else {
      const x = await pool.query(
        'SELECT 1 FROM patient WHERE id=$1 AND structure_id=$2',
        [patientId, pro.structure_id]
      );
      if (!x.rowCount) return res.status(403).json({ error: 'forbidden' });
    }

    const ins = await pool.query(
      `INSERT INTO rendezvous (patient_id, createur_id, date_debut, date_fin, objet)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [patientId, pro.id, date_debut, date_fin, objet]
    );
    return res.status(201).json({ id: ins.rows[0].id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

// =================== Documents ===================
app.post('/api/documents', keycloak.protect(), async (req, res) => {
  try {
    const { username, roles } = getKC(req);
    if (!roles.includes('medecin') && !roles.includes('secretaire')) {
      return res.status(403).json({ error: 'no access' });
    }

    const { patient_id, type, contenu } = req.body || {};
    const patientId = Number(patient_id);
    if (!Number.isInteger(patientId) || !type || !contenu) {
      return res.status(400).json({ error: 'missing fields' });
    }

    const pro = await getProByUsername(username);
    if (!pro) return res.status(403).json({ error: 'professional not found' });

    // access check
    if (roles.includes('medecin')) {
      const x = await pool.query(
        'SELECT 1 FROM cercle_soins WHERE professionnel_id = $1 AND patient_id = $2',
        [pro.id, patientId]
      );
      if (!x.rowCount) return res.status(403).json({ error: 'forbidden' });
    } else {
      // secretaire: same structure
      const y = await pool.query(
        'SELECT 1 FROM patient WHERE id = $1 AND structure_id = $2',
        [patientId, pro.structure_id]
      );
      if (!y.rowCount) return res.status(403).json({ error: 'forbidden' });
    }

    const ins = await pool.query(
      `INSERT INTO document (patient_id, auteur_id, type, contenu, date_creation)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id`,
      [patientId, pro.id, type, contenu]
    );

    return res.status(201).json({ id: ins.rows[0].id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'server error' });
  }
});

// GET documents d’un patient
app.get('/api/documents/:patientId', keycloak.protect(), async (req, res) => {
  try {
    const { username, roles } = getKC(req);
    const patientId = Number(req.params.patientId);
    if (!Number.isInteger(patientId)) return res.status(400).json({ error: 'bad patientId' });

    let allowed = false;

    if (roles.includes('medecin') || roles.includes('infirmier')) {
      const pro = await getProByUsername(username);
      if (!pro) return res.status(403).json({ error: 'professional not found' });

      // must be in the care circle
      const x = await pool.query(
        'SELECT 1 FROM cercle_soins WHERE professionnel_id = $1 AND patient_id = $2',
        [pro.id, patientId]
      );
      allowed = x.rowCount > 0;

    } else if (roles.includes('secretaire')) {
      const pro = await getProByUsername(username);
      if (!pro) return res.status(403).json({ error: 'professional not found' });

      // same structure
      const x = await pool.query(
        'SELECT 1 FROM patient WHERE id = $1 AND structure_id = $2',
        [patientId, pro.structure_id]
      );
      allowed = x.rowCount > 0;

    } else if (roles.includes('patient')) {
      // KC username for patients is the IPP
      const me = await getPatientByIPP(username);
      allowed = !!me && me.id === patientId;
    } else {
      return res.status(403).json({ error: 'no access' });
    }

    if (!allowed) return res.status(403).json({ error: 'forbidden' });

    const docs = (await pool.query(
      'SELECT * FROM document WHERE patient_id = $1 ORDER BY date_creation DESC',
      [patientId]
    )).rows;

    return res.json(docs);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'server error' });
  }
});

// =================== Résultats d’analyses ===================
// GET analyses
app.get('/api/resultats/:patientId', keycloak.protect(), async (req, res) => {
  try {
    const { username, roles } = getKC(req);
    const patientId = Number(req.params.patientId);
    if (!Number.isInteger(patientId)) return res.status(400).json({ error: 'bad patient id' });

    let allowed = false;
    if (roles.includes('medecin') || roles.includes('infirmier')) {
      const pro = await getProByUsername(username);
      const x = await pool.query(
        'SELECT 1 FROM cercle_soins WHERE professionnel_id=$1 AND patient_id=$2',
        [pro.id, patientId]
      );
      allowed = x.rowCount > 0;
    } else if (roles.includes('secretaire')) {
      const pro = await getProByUsername(username);
      const x = await pool.query(
        'SELECT 1 FROM patient WHERE id=$1 AND structure_id=$2',
        [patientId, pro.structure_id]
      );
      allowed = x.rowCount > 0;
    } else if (roles.includes('patient')) {
      const me = await getPatientByIPP(username);
      allowed = !!me && me.id === patientId;
    }
    if (!allowed) return res.status(403).json({ error: 'forbidden' });

    const rows = (await pool.query(
      'SELECT * FROM resultat_analyse WHERE patient_id=$1 ORDER BY date_reception DESC',
      [patientId]
    )).rows;
    return res.json(rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

// POST new analyse
app.post('/api/resultats', keycloak.protect(), async (req, res) => {
  try {
    const { username, roles } = getKC(req);
    if (!roles.includes('medecin') && !roles.includes('secretaire'))
      return res.status(403).json({ error: 'no access' });

    const { patient_id, contenu } = req.body || {};
    const patientId = Number(patient_id);
    if (!contenu || !Number.isInteger(patientId))
      return res.status(400).json({ error: 'missing fields' });

    const pro = await getProByUsername(username);

    if (roles.includes('medecin')) {
      const x = await pool.query(
        'SELECT 1 FROM cercle_soins WHERE professionnel_id=$1 AND patient_id=$2',
        [pro.id, patientId]
      );
      if (!x.rowCount) return res.status(403).json({ error: 'forbidden' });
    } else {
      const x = await pool.query(
        'SELECT 1 FROM patient WHERE id=$1 AND structure_id=$2',
        [patientId, pro.structure_id]
      );
      if (!x.rowCount) return res.status(403).json({ error: 'forbidden' });
    }

    const ins = await pool.query(
      `INSERT INTO resultat_analyse (patient_id, prescripteur_id, contenu, date_reception)
       VALUES ($1,$2,$3,NOW()) RETURNING id`,
      [patientId, pro.id, contenu]
    );
    return res.status(201).json({ id: ins.rows[0].id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});


// =================== Messagerie interne ===================
app.get('/api/users', keycloak.protect(), async (req, res) => {
  try {
    // For demo, just list everyone from both tables
    const pros = (await pool.query(
      'SELECT id, nom, prenom FROM professionnel ORDER BY nom'
    )).rows.map(p => ({ id: `pro-${p.id}`, nom: p.nom, prenom: p.prenom }));

    const pats = (await pool.query(
      'SELECT id, nom, prenom FROM patient ORDER BY nom'
    )).rows.map(p => ({ id: `pat-${p.id}`, nom: p.nom, prenom: p.prenom }));

    return res.json([...pros, ...pats]);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/messages', keycloak.protect(), async (req, res) => {
  try {
    const { username, roles } = getKC(req);
    const { destinataire_id, contenu } = req.body || {};
    if (!destinataire_id || !contenu) return res.status(400).json({ error: 'missing fields' });

    // me
    let me;
    if (roles.includes('patient')) me = await getPatientByIPP(username);
    else me = await getProByUsername(username);
    if (!me) return res.status(403).json({ error: 'user not found' });
    const myType = roles.includes('patient') ? 'pat' : 'pro';

    // target
    const [targetType, targetIdStr] = destinataire_id.split('-');
    const targetId = Number(targetIdStr);

    await pool.query(
      `INSERT INTO message (emetteur_type, emetteur_id, destinataire_type, destinataire_id, contenu, date_envoi)
       VALUES ($1,$2,$3,$4,$5,NOW())`,
      [myType, me.id, targetType, targetId, contenu]
    );

    return res.status(201).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/messages/:userKey', keycloak.protect(), async (req, res) => {
  try {
    const { username, roles } = getKC(req);

    // qui suis-je ?
    let me;
    if (roles.includes('patient')) me = await getPatientByIPP(username);
    else me = await getProByUsername(username);
    if (!me) return res.status(403).json({ error: 'user not found' });
    const myType = roles.includes('patient') ? 'pat' : 'pro';

    // cible
    const [targetType, targetIdStr] = req.params.userKey.split('-');
    const targetId = Number(targetIdStr);

    const rows = (await pool.query(
      `SELECT id, emetteur_type, emetteur_id, destinataire_type, destinataire_id, contenu, date_envoi
       FROM message
       WHERE (emetteur_type=$1 AND emetteur_id=$2 AND destinataire_type=$3 AND destinataire_id=$4)
          OR (emetteur_type=$3 AND emetteur_id=$4 AND destinataire_type=$1 AND destinataire_id=$2)
       ORDER BY date_envoi`,
      [myType, me.id, targetType, targetId]
    )).rows;

    // ajoute un champ "fromMe"
    rows.forEach(m => {
      m.fromMe = (m.emetteur_type === myType && m.emetteur_id === me.id);
    });

    return res.json(rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

// =================== Start server ===================
app.listen(PORT, () => {
  console.log(`Backend listening on ${PORT}`);
});
