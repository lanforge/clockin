// Helpers for turning an admin-authored contract body (markdown-ish text with
// {placeholders}) into a DocuSeal HTML template, detecting the placeholder
// fields, and auto-mapping each field to an employee's profile data.

const moment = require('moment');

// Matches {{ Field }} or { Field }. We capture the inner text; any DocuSeal
// modifiers after a ';' (e.g. {{Sig;type=signature}}) are stripped to the name.
const PLACEHOLDER_RE = /\{\{?\s*([^{}]+?)\s*\}?\}/g;

function fieldNameFromRaw(raw) {
  return String(raw).split(';')[0].trim();
}

// Return the ordered list of unique field names found in the body.
function detectPlaceholders(body) {
  if (!body) return [];
  const seen = new Set();
  const out = [];
  let m;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((m = PLACEHOLDER_RE.exec(body)) !== null) {
    const name = fieldNameFromRaw(m[1]);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Minimal markdown -> HTML: headings (#), bold (**), horizontal rule (---),
// paragraphs, and line breaks. Placeholder braces are normalised to DocuSeal's
// {{ }} tags. Signature + date fields are appended if the author omitted them.
function bodyToDocusealHtml(body) {
  const normalized = String(body || '').replace(/\r\n/g, '\n');

  const blocks = normalized.split(/\n{2,}/).map((block) => {
    const trimmed = block.trim();
    if (!trimmed) return '';

    if (/^---+$/.test(trimmed)) return '<hr />';

    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      return `<h${level}>${inline(heading[2])}</h${level}>`;
    }

    const lines = trimmed.split('\n').map((l) => inline(l));
    return `<p>${lines.join('<br />')}</p>`;
  });

  let html = blocks.filter(Boolean).join('\n');

  // The /templates/html endpoint parses fields from custom HTML elements
  // (<text-field>, <signature-field>, <date-field>), NOT {{ }} text tags.
  // Ensure a signature + date field exists if the author didn't add one.
  if (!/<signature-field/i.test(html)) {
    html += `\n<p style="margin-top:40px">Signature: <signature-field name="Signature" role="First Party" required="true" style="width: 240px; height: 60px; display: inline-block"></signature-field></p>`;
    html += `\n<p>Date: <date-field name="Date Signed" role="First Party" required="true" style="width: 160px; height: 20px; display: inline-block; margin-bottom: -4px"></date-field></p>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>body{font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111;padding:24px;}h1,h2,h3{margin:0 0 12px;}p{margin:0 0 12px;}hr{border:none;border-top:1px solid #ccc;margin:24px 0;}text-field,date-field,signature-field{border-bottom:1px solid #888;}</style></head><body>${html}</body></html>`;
}

function attrEscape(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Emit the DocuSeal field element for a placeholder. A field named "Signature"
// becomes a signature field; everything else is a fillable text field that we
// pre-fill (and lock) at submission time by matching on `name`.
function fieldElement(rawName) {
  const name = String(rawName).split(';')[0].trim();
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nameAttr = attrEscape(name);
  if (key === 'signature' || key === 'sign' || key === 'signhere') {
    return `<signature-field name="${nameAttr}" role="First Party" required="true" style="width: 240px; height: 60px; display: inline-block"></signature-field>`;
  }
  return `<text-field name="${nameAttr}" role="First Party" required="false" preferences="{}" style="width: 260px; height: 20px; display: inline-block; margin-bottom: -4px"></text-field>`;
}

// Inline transforms for one plain-text line. Placeholders are protected from
// HTML-escaping/bold, then swapped for DocuSeal field elements at the end so
// that markup like **{Field}** wraps the field in <strong> correctly.
function inline(text) {
  const tokens = [];
  const SENT = '';
  const tokenized = String(text).replace(PLACEHOLDER_RE, (m, inner) => {
    const idx = tokens.length;
    tokens.push(inner);
    return `${SENT}${idx}${SENT}`;
  });

  let s = escapeHtml(tokenized);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(new RegExp(`${SENT}(\\d+)${SENT}`, 'g'), (m, i) => fieldElement(tokens[Number(i)]));
  return s;
}

function normalizeKey(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function activeCompany(user) {
  const c = user.companies || {};
  if (c.lanforge && c.lanforge.active) return { key: 'lanforge', label: 'LANForge', title: c.lanforge.title };
  if (c.ascendance && c.ascendance.active) return { key: 'ascendance', label: 'Ascendance', title: c.ascendance.title };
  return { key: null, label: user.company || 'LANForge', title: user.title || '' };
}

function fullAddress(a) {
  if (!a) return '';
  const line2 = [a.city, a.state, a.zip].filter(Boolean).join(', ').replace(', ,', ',');
  return [a.line1, a.line2, line2].filter(Boolean).join(', ');
}

function payString(user) {
  const pt = user.pay_type || 'hourly';
  if (pt === 'salary') return `$${Number(user.salary_amount || 0).toFixed(2)}/year`;
  if (pt === 'commission') return 'Commission';
  if (pt === 'none') return '';
  return `$${Number(user.hourly_rate || 0).toFixed(2)}/hour`;
}

// Suggest a prefill value for one placeholder based on the employee profile.
// ctx: { user, ssn, ein, today }  (ssn/ein already decrypted; '' if none)
function suggestValue(placeholder, ctx) {
  const { user, ssn = '', ein = '', today } = ctx;
  const k = normalizeKey(placeholder);
  const co = activeCompany(user);
  const addr = user.address || {};
  const legal = user.legal_name || user.username || '';
  const nameParts = legal.trim().split(/\s+/);

  const map = {
    fullname: legal,
    name: legal,
    legalname: legal,
    employeename: legal,
    contractorname: legal,
    printedname: legal,
    firstname: nameParts[0] || '',
    lastname: nameParts.length > 1 ? nameParts.slice(1).join(' ') : '',
    email: user.email || '',
    emailaddress: user.email || '',
    date: today,
    todaysdate: today,
    currentdate: today,
    dated: today,
    effectivedate: today,
    title: co.title || '',
    jobtitle: co.title || '',
    position: co.title || '',
    company: co.label,
    companyname: co.label,
    employer: co.label,
    address: fullAddress(addr),
    mailingaddress: fullAddress(addr),
    streetaddress: addr.line1 || '',
    addressline1: addr.line1 || '',
    addressline2: addr.line2 || '',
    city: addr.city || '',
    state: addr.state || '',
    zip: addr.zip || '',
    zipcode: addr.zip || '',
    postalcode: addr.zip || '',
    phone: user.phone || '',
    phonenumber: user.phone || '',
    ssn: ssn,
    socialsecuritynumber: ssn,
    ein: ein,
    taxid: ein || ssn,
    taxidnumber: ein || ssn,
    employerid: ein,
    startdate: user.start_date ? moment(user.start_date).format('MM/DD/YYYY') : '',
    hiredate: user.start_date ? moment(user.start_date).format('MM/DD/YYYY') : '',
    taxclassification: user.tax_classification || '',
    classification: user.tax_classification || '',
    workerclassification: user.tax_classification || '',
    payrate: payString(user),
    rate: payString(user),
    hourlyrate: user.hourly_rate ? `$${Number(user.hourly_rate).toFixed(2)}/hour` : '',
    salary: user.salary_amount ? `$${Number(user.salary_amount).toFixed(2)}/year` : '',
    annualsalary: user.salary_amount ? `$${Number(user.salary_amount).toFixed(2)}/year` : '',
    pay: payString(user),
    compensation: payString(user)
  };

  return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : '';
}

// Build the field list for the send modal: [{ name, value, autoFilled, sensitive }]
function buildFieldSuggestions(placeholders, ctx) {
  return placeholders.map((name) => {
    const value = suggestValue(name, ctx);
    const k = normalizeKey(name);
    return {
      name,
      value,
      autoFilled: value !== '',
      sensitive: k === 'ssn' || k === 'socialsecuritynumber' || k === 'ein' || k === 'taxid' || k === 'taxidnumber'
    };
  });
}

module.exports = {
  detectPlaceholders,
  bodyToDocusealHtml,
  buildFieldSuggestions,
  suggestValue,
  normalizeKey
};
