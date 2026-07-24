// Thin client for the DocuSeal API (https://www.docuseal.com/docs/api).
// Auth via X-Auth-Token header. Requires Node 18+ (global fetch).

const BASE_URL = (process.env.DOCUSEAL_BASE_URL || 'https://api.docuseal.com').replace(/\/$/, '');
const API_KEY = process.env.DOCUSEAL_API_KEY || '';

function isConfigured() {
  return !!API_KEY;
}

async function request(method, path, body) {
  if (!API_KEY) {
    throw new Error('DOCUSEAL_API_KEY is not set');
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'X-Auth-Token': API_KEY,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {
    json = text;
  }

  if (!res.ok) {
    const message = (json && (json.error || json.message)) || text || `DocuSeal ${res.status}`;
    const err = new Error(`DocuSeal API error (${res.status}): ${message}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// Create a reusable template from HTML. `html` should already contain DocuSeal
// field tags like {{Full Name}} and a signature field. Returns the template
// object (includes `id` and `fields`/`schema`).
async function createHtmlTemplate({ name, html }) {
  return request('POST', '/templates/html', { name, html });
}

// Create a signature request (submission) from an existing template.
// prefill: { "Field Name": "value", ... } — every provided field is sent
// locked (readonly) so the signer can only sign, not alter contract data.
async function createSubmission({ templateId, submitter, prefill = {}, sendEmail = true }) {
  const fields = Object.entries(prefill)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    .map(([name, value]) => ({ name, default_value: String(value), readonly: true }));

  const body = {
    template_id: templateId,
    send_email: sendEmail,
    submitters: [
      {
        role: submitter.role || 'First Party',
        email: submitter.email,
        name: submitter.name || undefined,
        fields
      }
    ]
  };
  // Returns an array of submitter objects (id, submission_id, slug, embed_src, status).
  return request('POST', '/submissions', body);
}

// Fetch a submission (status, submitters, documents).
async function getSubmission(submissionId) {
  return request('GET', `/submissions/${submissionId}`);
}

// Fetch the signed documents for a completed submission.
async function getSubmissionDocuments(submissionId) {
  return request('GET', `/submissions/${submissionId}/documents`);
}

// Normalise DocuSeal's various status strings into our own set.
function normalizeStatus(raw) {
  const s = String(raw || '').toLowerCase();
  if (['completed', 'signed'].includes(s)) return 'completed';
  if (['declined'].includes(s)) return 'declined';
  if (['expired'].includes(s)) return 'expired';
  if (['opened', 'viewed'].includes(s)) return 'viewed';
  return 'sent'; // sent, pending, awaiting, etc.
}

module.exports = {
  isConfigured,
  createHtmlTemplate,
  createSubmission,
  getSubmission,
  getSubmissionDocuments,
  normalizeStatus,
  BASE_URL
};
