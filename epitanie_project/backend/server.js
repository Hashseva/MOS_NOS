// backend/server.js
const express = require('express');
const session = require('express-session');
const Keycloak = require('keycloak-connect');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');

const PORT = process.env.PORT || 4000;
const PG_CONFIG = {
  host: 'localhost',
  user: 'epitanie',
  password: 'epitanie',
  database: 'epitanie',
  port: 5432
};

const pool = new Pool(PG_CONFIG);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- Keycloak Setup ---
const memoryStore = new session.MemoryStore();
app.use(session({
  secret: 'some secret',
  resave: false,
  saveUninitialized: true,
  store: memoryStore
}));

const keycloak = new Keycloak({ store: memoryStore });
app.use(keycloak.middleware());

// --- Helpers ---

// 1. Récupérer info Keycloak
function getKC(req) {
  const t = req.kauth?.grant?.access_token?.content;
  if (!t) throw new Error('no-token');
  return { username: t.preferred_username, roles: t.realm_access?.roles || [] };
}

// 2. Récupérer le Professionnel connecté (avec traduction de son métier)
async function getProByUsername(username) {
  const q = `
    SELECT p.id, p.structure_id, p.code_profession, n.libelle as profession_libelle
    FROM professionnel p
    LEFT JOIN ref_nomenclature n ON p.code_profession = n.code
    WHERE LOWER(p.idpp) = LOWER($1)
  `;
  const r = await pool.query(q, [username]);
  return r.rows[0]; 
}

// 3. Récupérer le Patient connecté (via IPP)
async function getPatientByIPP(ipp) {
  const r = await pool.query(
    'SELECT * FROM patient WHERE UPPER(ipp) = UPPER($1)',
    [String(ipp).trim()]
  );
  return r.rows[0];
}

// =================== PATIENTS (Interopérabilité MOS) ===================

app.get('/api/patients', keycloak.protect(), async (req, res) => {
  try {
    const { username, roles } = getKC(req);
    
    // --- Cas 1 : Médecin ou Infirmier ---
    if (roles.includes('medecin') || roles.includes('infirmier')) {
      const pro = await getProByUsername(username);
      if (!pro) return res.status(403).json({ error: 'Pro introuvable' });

      // On récupère le patient + le code pathologie + le LIBELLÉ pathologie (via jointure)
      const q = `
        SELECT p.*, 
               cs.code_pathologie,
               n.libelle as pathologie_libelle
        FROM patient p
        JOIN cercle_soins cs ON cs.patient_id = p.id
        LEFT JOIN ref_nomenclature n ON cs.code_pathologie = n.code
        WHERE cs.professionnel_id = $1
        ORDER BY p.nom, p.prenom
      `;
      const rows = (await pool.query(q, [pro.id])).rows;
      return res.json(rows);
    }

    // --- Cas 2 : Secrétaire ---
    if (roles.includes('secretaire')) {
      const pro = await getProByUsername(username);
      // La secrétaire voit les patients de la structure, sans info médicale précise (pathologie null)
      const q = `
        SELECT p.*, NULL as code_pathologie, NULL as pathologie_libelle
        FROM patient p
        WHERE p.structure_id = $1
        ORDER BY p.nom, p.prenom
      `;
      const rows = (await pool.query(q, [pro.structure_id])).rows;
      return res.json(rows);
    }

    // --- Cas 3 : Patient (lui-même) ---
    if (roles.includes('patient')) {
      const me = await getPatientByIPP(username);
      if (!me) return res.json([]);
      
      // Agrégation des pathologies pour le patient
      const q = `
        SELECT p.*,
               string_agg(n.libelle, ', ') as pathologie_libelle
        FROM patient p
        LEFT JOIN cercle_soins cs ON cs.patient_id = p.id
        LEFT JOIN ref_nomenclature n ON cs.code_pathologie = n.code
        WHERE p.id = $1
        GROUP BY p.id
      `;
      const rows = (await pool.query(q, [me.id])).rows;
      return res.json(rows);
    }

    return res.status(403).json({ error: 'Accès interdit' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/patients/:id', keycloak.protect(), async (req, res) => {
    // Note: Pour faire simple, je réutilise la logique de liste filtrée mais pour un ID spécifique
    // Dans un vrai projet, on vérifierait les droits un par un.
    // Ici, on suppose que le frontend a déjà filtré l'ID via la liste.
    try {
        const pid = parseInt(req.params.id, 10);
        const q = `
            SELECT p.*, s.nom as structure_nom 
            FROM patient p 
            LEFT JOIN structure s ON p.structure_id = s.id 
            WHERE p.id = $1
        `;
        const row = (await pool.query(q, [pid])).rows[0];
        if(!row) return res.status(404).json({error: "Patient non trouvé"});
        return res.json(row);
    } catch(e) {
        return res.status(500).json({error: e.message});
    }
});

// Création de patient (Réception de CODES NOS)
app.post('/api/patients', keycloak.protect(), async (req, res) => {
  try {
    const { username } = getKC(req);
    const pro = await getProByUsername(username); // Besoin du structure_id
    if (!pro) return res.status(403).json({ error: 'Pro inconnu' });

    // On attend ici 'code_sexe' (ex: 'M') et 'code_pathologie' (ex: 'E11')
    const { ipp, nom, prenom, date_naissance, code_sexe, code_pathologie } = req.body || {};
    
    if (!ipp || !nom || !prenom || !date_naissance) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Upsert Patient
      const insPat = await client.query(
        `INSERT INTO patient (ipp, nom, prenom, date_naissance, code_sexe, structure_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (ipp) DO UPDATE SET ipp = EXCLUDED.ipp
         RETURNING id`,
        [ipp, nom, prenom, date_naissance, code_sexe || 'I', pro.structure_id]
      );
      const patientId = insPat.rows[0].id;

      // 2. Cercle de soins (Lien Pro <-> Patient avec Code Pathologie CIM-10)
      if (code_pathologie) {
          await client.query(
            `INSERT INTO cercle_soins (professionnel_id, patient_id, code_pathologie)
             VALUES ($1, $2, $3)
             ON CONFLICT (professionnel_id, patient_id)
             DO UPDATE SET code_pathologie = EXCLUDED.code_pathologie`,
            [pro.id, patientId, code_pathologie]
          );
      }

      await client.query('COMMIT');
      return res.status(201).json({ id: patientId });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(e);
      return res.status(500).json({ error: 'Erreur SQL' });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

// Attacher un patient existant
app.post('/api/patients/attach', keycloak.protect(), async (req, res) => {
  try {
    const { username } = getKC(req);
    const pro = await getProByUsername(username);
    const { ipp, code_pathologie } = req.body; // on attend un CODE ici

    const pat = await pool.query('SELECT id FROM patient WHERE ipp=$1', [ipp]);
    if (!pat.rows.length) return res.status(404).json({ error: 'Patient introuvable' });

    await pool.query(
      `INSERT INTO cercle_soins (professionnel_id, patient_id, code_pathologie)
       VALUES ($1, $2, $3)
       ON CONFLICT (professionnel_id, patient_id) DO UPDATE SET code_pathologie = EXCLUDED.code_pathologie`,
      [pro.id, pat.rows[0].id, code_pathologie || null]
    );
    return res.status(204).end();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// =================== DOCUMENTS (NOS: Type Document) ===================

app.post('/api/documents', keycloak.protect(), async (req, res) => {
  try {
    const { username } = getKC(req);
    const pro = await getProByUsername(username);
    
    // On attend code_type_document (ex: 'CR-CONS')
    const { patient_id, code_type_document, contenu } = req.body;
    
    if (!patient_id || !code_type_document || !contenu) 
        return res.status(400).json({ error: 'Manque code_type_document ou contenu' });

    // Vérification sommaire des droits (appartenance cercle de soins ou même structure)
    // ... (simplifié pour le TD) ...

    const ins = await pool.query(
      `INSERT INTO document (patient_id, auteur_id, code_type_document, contenu, date_creation)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
      [patient_id, pro.id, code_type_document, contenu]
    );
    return res.status(201).json({ id: ins.rows[0].id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/documents/:patientId', keycloak.protect(), async (req, res) => {
    try {
        const pid = parseInt(req.params.patientId);
        
        // Jointure pour récupérer le libellé du type de document (ex: "Compte-rendu")
        const q = `
            SELECT d.*, 
                   n.libelle as type_libelle,
                   p.nom as auteur_nom
            FROM document d
            LEFT JOIN ref_nomenclature n ON d.code_type_document = n.code
            LEFT JOIN professionnel p ON d.auteur_id = p.id
            WHERE d.patient_id = $1
            ORDER BY d.date_creation DESC
        `;
        const rows = (await pool.query(q, [pid])).rows;
        return res.json(rows);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// =================== RÉSULTATS (NOS: Code Analyse) ===================

app.post('/api/resultats', keycloak.protect(), async (req, res) => {
    try {
        const { username } = getKC(req);
        const pro = await getProByUsername(username);
        
        // On attend code_analyse (ex: 'GLUCOSE')
        const { patient_id, code_analyse, contenu } = req.body;

        const ins = await pool.query(
            `INSERT INTO resultat_analyse (patient_id, prescripteur_id, code_analyse, contenu, date_reception)
             VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
            [patient_id, pro.id, code_analyse || 'NA', contenu]
        );
        return res.status(201).json({id: ins.rows[0].id});
    } catch(e) {
        return res.status(500).json({error: e.message});
    }
});

app.get('/api/resultats/:patientId', keycloak.protect(), async (req, res) => {
    try {
        const pid = parseInt(req.params.patientId);
        // Jointure pour avoir le nom de l'analyse (ex: 'Glucose Sanguin') si dispo dans ref_nomenclature
        const q = `
            SELECT r.*, n.libelle as analyse_libelle
            FROM resultat_analyse r
            LEFT JOIN ref_nomenclature n ON r.code_analyse = n.code
            WHERE r.patient_id = $1
            ORDER BY r.date_reception DESC
        `;
        const rows = (await pool.query(q, [pid])).rows;
        return res.json(rows);
    } catch(e) {
        return res.status(500).json({error: e.message});
    }
});

// =================== MESSAGERIE & RENDEZ-VOUS ===================
// Ces parties changent peu niveau structure de données, mais doivent utiliser les nouveaux helpers

app.get('/api/rendezvous', keycloak.protect(), async (req, res) => {
    try {
        const { username, roles } = getKC(req);
        const patientId = Number(req.query.patient_id);
        
        // (Logique de sécu simplifiée : on suppose que le middleware KC + logique frontend filtrent bien)
        // Dans un vrai cas, vérifier 'cercle_soins' ici aussi.
        
        const rows = (await pool.query(
            'SELECT * FROM rendezvous WHERE patient_id=$1 ORDER BY date_debut', 
            [patientId]
        )).rows;
        return res.json(rows);
    } catch(e) { return res.status(500).json({error: e.message}); }
});

app.post('/api/rendezvous', keycloak.protect(), async (req, res) => {
    try {
        const { username } = getKC(req);
        const pro = await getProByUsername(username); // Récupère l'ID du pro
        const { patient_id, date_debut, date_fin, objet } = req.body;

        const ins = await pool.query(
            `INSERT INTO rendezvous (patient_id, createur_id, date_debut, date_fin, objet)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [patient_id, pro.id, date_debut, date_fin, objet]
        );
        return res.status(201).json({id: ins.rows[0].id});
    } catch(e) { return res.status(500).json({error: e.message}); }
});

// Messagerie : Lister les utilisateurs pour le carnet d'adresses
app.get('/api/users', keycloak.protect(), async (req, res) => {
    try {
        // Récupérer les Pros avec leur fonction traduite
        const pros = await pool.query(`
            SELECT p.id, p.nom, p.prenom, n.libelle as role_label 
            FROM professionnel p
            LEFT JOIN ref_nomenclature n ON p.code_profession = n.code
        `);
        
        const pats = await pool.query('SELECT id, nom, prenom FROM patient');

        const result = [
            ...pros.rows.map(p => ({ id: `pro-${p.id}`, label: `${p.nom} ${p.prenom} (${p.role_label || 'Inconnu'})` })),
            ...pats.rows.map(p => ({ id: `pat-${p.id}`, label: `${p.nom} ${p.prenom} (Patient)` }))
        ];
        return res.json(result);
    } catch(e) { return res.status(500).json({error: e.message}); }
});

app.post('/api/messages', keycloak.protect(), async (req, res) => {
    // Logique identique à l'ancien back, adaptée aux helpers
    try {
        const { username, roles } = getKC(req);
        let meId, meType;

        if (roles.includes('patient')) {
            const me = await getPatientByIPP(username);
            meId = me.id; meType = 'pat';
        } else {
            const me = await getProByUsername(username);
            meId = me.id; meType = 'pro';
        }

        const { destinataire_id, contenu } = req.body; // destinataire_id = "pro-1"
        const [targetType, targetIdStr] = destinataire_id.split('-');

        await pool.query(
            `INSERT INTO message (emetteur_type, emetteur_id, destinataire_type, destinataire_id, contenu, date_envoi)
             VALUES ($1,$2,$3,$4,$5,NOW())`,
            [meType, meId, targetType, Number(targetIdStr), contenu]
        );
        return res.status(201).json({ok: true});
    } catch(e) { return res.status(500).json({error: e.message}); }
});

app.get('/api/messages/:userKey', keycloak.protect(), async (req, res) => {
    try {
        const { username, roles } = getKC(req);
        let meId, meType;
        if (roles.includes('patient')) {
             const me = await getPatientByIPP(username);
             meId = me.id; meType = 'pat';
        } else {
             const me = await getProByUsername(username);
             meId = me.id; meType = 'pro';
        }

        const [targetType, targetIdStr] = req.params.userKey.split('-');
        
        const rows = (await pool.query(
            `SELECT * FROM message 
             WHERE (emetteur_type=$1 AND emetteur_id=$2 AND destinataire_type=$3 AND destinataire_id=$4)
                OR (emetteur_type=$3 AND emetteur_id=$4 AND destinataire_type=$1 AND destinataire_id=$2)
             ORDER BY date_envoi`,
            [meType, meId, targetType, Number(targetIdStr)]
        )).rows;
        
        const result = rows.map(m => ({
            ...m,
            fromMe: (m.emetteur_type === meType && m.emetteur_id === meId)
        }));
        return res.json(result);
    } catch(e) { return res.status(500).json({error: e.message}); }
});

// START
app.listen(PORT, () => {
  console.log(`Backend Interopérable (MOS/NOS) écoutant sur le port ${PORT}`);
});