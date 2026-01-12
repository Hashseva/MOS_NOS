const express = require('express');

function buildPatient(row) {
  const gender =
    row.code_sexe === 'M' ? 'male' :
    row.code_sexe === 'F' ? 'female' :
    'unknown';

  return {
    resourceType: 'Patient',
    id: String(row.id),
    identifier: [{ system: 'urn:oid:1.2.250.1.213.1.4.2', value: row.ipp }],
    name: [{ family: row.nom, given: [row.prenom] }],
    gender,
    birthDate: row.date_naissance
  };
}

function buildPractitioner(row) {
  return {
    resourceType: 'Practitioner',
    id: String(row.id),
    identifier: [{ system: 'urn:oid:1.2.250.1.71.4.2.1', value: row.idpp }],
    name: [{ family: row.nom, given: [row.prenom] }],
    qualification: row.code_profession ? [{
      code: {
        coding: [{
          system: 'urn:oid:1.2.250.1.213.1.6.1.10',
          code: row.code_profession
        }]
      }
    }] : undefined
  };
}

function buildOrganization(row) {
  return {
    resourceType: 'Organization',
    id: String(row.id),
    name: row.nom,
    type: row.code_categorie ? [{
      coding: [{
        system: 'urn:oid:1.2.250.1.213.1.6.1.8',
        code: row.code_categorie
      }]
    }] : undefined
  };
}

function buildObservation(row) {
  return {
    resourceType: 'Observation',
    id: String(row.id),
    status: 'final',
    code: {
      coding: [{
        system: 'http://loinc.org',
        code: row.code_analyse || 'NA'
      }]
    },
    subject: { reference: `Patient/${row.patient_id}` },
    performer: row.prescripteur_id ? [{ reference: `Practitioner/${row.prescripteur_id}` }] : undefined,
    effectiveDateTime: row.date_reception,
    valueString: row.contenu
  };
}

function buildDocumentReference(row) {
  return {
    resourceType: 'DocumentReference',
    id: String(row.id),
    status: 'current',
    type: row.code_type_document ? {
      coding: [{
        system: 'urn:oid:1.2.250.1.213.1.1.4.12',
        code: row.code_type_document
      }]
    } : undefined,
    subject: { reference: `Patient/${row.patient_id}` },
    author: row.auteur_id ? [{ reference: `Practitioner/${row.auteur_id}` }] : undefined,
    date: row.date_creation,
    content: [{ attachment: { contentType: 'text/plain', data: Buffer.from(row.contenu || '').toString('base64') } }]
  };
}

function buildAppointment(row) {
  const participants = [{ actor: { reference: `Patient/${row.patient_id}` } }];
  if (row.createur_id) {
    participants.push({ actor: { reference: `Practitioner/${row.createur_id}` } });
  }

  return {
    resourceType: 'Appointment',
    id: String(row.id),
    status: 'booked',
    description: row.objet || undefined,
    start: row.date_debut,
    end: row.date_fin,
    participant: participants
  };
}

function buildTd2SampleBundle() {
  return {
    resourceType: 'Bundle',
    type: 'collection',
    entry: [
      {
        resource: {
          resourceType: 'ServiceRequest',
          id: 'sr-lab-1',
          status: 'active',
          intent: 'order',
          code: { coding: [{ system: 'http://loinc.org', code: 'TSH' }] },
          subject: { reference: 'Patient/1' },
          requester: { reference: 'Practitioner/1' }
        }
      },
      {
        resource: {
          resourceType: 'ServiceRequest',
          id: 'sr-echo-1',
          status: 'active',
          intent: 'order',
          code: { coding: [{ system: 'http://snomed.info/sct', code: '24165007' }] },
          subject: { reference: 'Patient/1' },
          requester: { reference: 'Practitioner/1' }
        }
      },
      {
        resource: {
          resourceType: 'DocumentReference',
          id: 'doc-1',
          status: 'current',
          type: { coding: [{ system: 'urn:oid:1.2.250.1.213.1.1.4.12', code: 'CR-CONS' }] },
          subject: { reference: 'Patient/1' },
          author: [{ reference: 'Practitioner/1' }],
          date: new Date().toISOString(),
          content: [{ attachment: { contentType: 'text/plain', data: Buffer.from('CR endocrino (exemple)').toString('base64') } }]
        }
      },
      {
        resource: {
          resourceType: 'Observation',
          id: 'obs-1',
          status: 'final',
          code: { coding: [{ system: 'http://loinc.org', code: 'TSH' }] },
          subject: { reference: 'Patient/1' },
          effectiveDateTime: new Date().toISOString(),
          valueString: 'TSH: 0.2 mIU/L'
        }
      },
      {
        resource: {
          resourceType: 'DiagnosticReport',
          id: 'dr-1',
          status: 'final',
          code: { text: 'Bilan thyroide' },
          subject: { reference: 'Patient/1' },
          result: [{ reference: 'Observation/obs-1' }]
        }
      }
    ]
  };
}

function fhirRouter(pool, keycloak) {
  const router = express.Router();

  router.get('/Patient/:id', keycloak.protect(), async (req, res) => {
    const r = await pool.query('SELECT * FROM patient WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    return res.json(buildPatient(r.rows[0]));
  });

  router.get('/Practitioner/:id', keycloak.protect(), async (req, res) => {
    const r = await pool.query('SELECT * FROM professionnel WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    return res.json(buildPractitioner(r.rows[0]));
  });

  router.get('/Organization/:id', keycloak.protect(), async (req, res) => {
    const r = await pool.query('SELECT * FROM structure WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    return res.json(buildOrganization(r.rows[0]));
  });

  router.get('/Observation/:id', keycloak.protect(), async (req, res) => {
    const r = await pool.query('SELECT * FROM resultat_analyse WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    return res.json(buildObservation(r.rows[0]));
  });

  router.get('/DocumentReference/:id', keycloak.protect(), async (req, res) => {
    const r = await pool.query('SELECT * FROM document WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    return res.json(buildDocumentReference(r.rows[0]));
  });

  router.get('/Appointment/:id', keycloak.protect(), async (req, res) => {
    const r = await pool.query('SELECT * FROM rendezvous WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    return res.json(buildAppointment(r.rows[0]));
  });

  router.get('/samples/td2', (req, res) => {
    return res.json(buildTd2SampleBundle());
  });

  return router;
}

module.exports = { fhirRouter };
