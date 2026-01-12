const express = require('express');

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT) || 4100;
const SERVICE_NAME = process.env.SERVICE_NAME || 'fhir-sim';

const store = {
  DocumentReference: new Map(),
  ServiceRequest: new Map(),
  Observation: new Map(),
  DiagnosticReport: new Map(),
  Patient: new Map(),
  Practitioner: new Map(),
  Organization: new Map()
};

const counters = {};

function nextId(type) {
  counters[type] = (counters[type] || 0) + 1;
  return String(counters[type]);
}

function normalizeType(type) {
  return type.replace(/^\w/, (c) => c.toUpperCase());
}

function ensureType(type) {
  const t = normalizeType(type);
  if (!store[t]) return null;
  return t;
}

function bundleFor(type, items) {
  return {
    resourceType: 'Bundle',
    type: 'collection',
    entry: items.map((resource) => ({ resource }))
  };
}

app.get('/fhir/health', (req, res) => {
  res.json({ status: 'ok', service: SERVICE_NAME });
});

app.post('/fhir/:type', (req, res) => {
  const type = ensureType(req.params.type);
  if (!type) return res.status(400).json({ error: 'Unsupported resource type' });

  const resource = req.body || {};
  resource.resourceType = type;
  resource.id = resource.id || nextId(type);

  store[type].set(resource.id, resource);
  res.status(201).json(resource);
});

app.get('/fhir/:type', (req, res) => {
  const type = ensureType(req.params.type);
  if (!type) return res.status(400).json({ error: 'Unsupported resource type' });
  const items = Array.from(store[type].values());
  res.json(bundleFor(type, items));
});

app.get('/fhir/:type/:id', (req, res) => {
  const type = ensureType(req.params.type);
  if (!type) return res.status(400).json({ error: 'Unsupported resource type' });

  const resource = store[type].get(req.params.id);
  if (!resource) return res.status(404).json({ error: 'Not found' });
  res.json(resource);
});

app.listen(PORT, () => {
  console.log(`FHIR sim running on port ${PORT} (${SERVICE_NAME})`);
});
