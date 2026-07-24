import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FileText, Plus, Edit, Trash2, Save, X, AlertCircle, Tag } from 'lucide-react';
import CustomSelect from './CustomSelect';
import CustomCheckbox from './CustomCheckbox';
import CustomModal from './CustomModal';

// Mirror of the server-side placeholder regex for a live field preview.
const PLACEHOLDER_RE = /\{\{?\s*([^{}]+?)\s*\}?\}/g;
function detectFields(body) {
  const seen = new Set();
  const out = [];
  let m;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((m = PLACEHOLDER_RE.exec(body || '')) !== null) {
    const name = m[1].split(';')[0].trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

const DOC_TYPE_OPTIONS = [
  { value: '1099', label: '1099 Contractor Agreement' },
  { value: 'W2', label: 'W2 Employee Agreement' },
  { value: 'other', label: 'Other (no re-sign tracking)' }
];

const emptyForm = { name: '', description: '', doc_type: '1099', send_email: true, body: '' };

export default function AdminContractTemplates({ onError }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [docusealConfigured, setDocusealConfigured] = useState(true);
  const [encConfigured, setEncConfigured] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const fetchTemplates = async () => {
    try {
      const res = await axios.get('/api/admin/contract-templates');
      if (res.data.success) {
        setTemplates(res.data.templates);
        setDocusealConfigured(res.data.docusealConfigured);
        setEncConfigured(res.data.encConfigured);
      }
    } catch (err) {
      onError?.(err.response?.data?.error || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const openCreate = () => { setForm(emptyForm); setEditingId(null); setShowForm(true); };
  const openEdit = (t) => {
    setForm({ name: t.name, description: t.description || '', doc_type: t.doc_type, send_email: t.send_email !== false, body: t.body || '' });
    setEditingId(t._id);
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(emptyForm); };

  const handleSave = async () => {
    if (!form.name.trim() || !form.body.trim()) {
      onError?.('Name and body are required');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await axios.put(`/api/admin/contract-templates/${editingId}`, form);
      } else {
        await axios.post('/api/admin/contract-templates', form);
      }
      closeForm();
      fetchTemplates();
    } catch (err) {
      onError?.(err.response?.data?.error || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`/api/admin/contract-templates/${deleteId}`);
      setDeleteId(null);
      fetchTemplates();
    } catch (err) {
      onError?.(err.response?.data?.error || 'Failed to delete template');
    }
  };

  const liveFields = detectFields(form.body);

  if (loading) return <div className="flex justify-center p-8"><div className="animate-spin h-6 w-6 border-b-2 border-indigo-600 rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <CustomModal
        isOpen={!!deleteId}
        title="Delete Template"
        message="Delete this template? Contracts already sent are retained."
        type="confirm"
        confirmText="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Contract Templates</h3>
          <p className="text-sm text-gray-400 mt-1">Write a contract with <code className="text-indigo-300">{'{Field Name}'}</code> placeholders. Fields auto-fill from each employee's profile when you send.</p>
        </div>
        {!showForm && (
          <button onClick={openCreate} className="flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700">
            <Plus size={18} className="mr-2" /> New Template
          </button>
        )}
      </div>

      {!docusealConfigured && (
        <div className="p-4 bg-yellow-900/40 border border-yellow-800 text-yellow-200 rounded-lg flex items-start gap-2 text-sm">
          <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
          <span>DocuSeal is not configured. You can still write templates, but set <code>DOCUSEAL_API_KEY</code> on the server before sending contracts for signature.</span>
        </div>
      )}
      {!encConfigured && (
        <div className="p-4 bg-yellow-900/40 border border-yellow-800 text-yellow-200 rounded-lg flex items-start gap-2 text-sm">
          <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
          <span>SSN/EIN encryption key (<code>CONTRACT_ENC_KEY</code>) is not set. Sensitive fields can't be stored until it's configured.</span>
        </div>
      )}

      {showForm && (
        <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-4 sm:p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="text-white font-semibold">{editingId ? 'Edit Template' : 'New Template'}</h4>
            <button onClick={closeForm} className="text-gray-400 hover:text-white"><X size={18} /></button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Template Name</label>
              <input type="text" className="w-full bg-gray-800 border border-gray-600 rounded-lg p-2 text-sm text-white" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. 1099 Independent Contractor Agreement" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Document Type</label>
              <CustomSelect name="doc_type" value={form.doc_type} onChange={e => setForm({ ...form, doc_type: e.target.value })} options={DOC_TYPE_OPTIONS} />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Description (optional)</label>
            <input type="text" className="w-full bg-gray-800 border border-gray-600 rounded-lg p-2 text-sm text-white" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Contract Body</label>
            <textarea
              className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-sm text-white font-mono min-h-[260px]"
              value={form.body}
              onChange={e => setForm({ ...form, body: e.target.value })}
              placeholder={"# Independent Contractor Agreement\n\nThis Agreement is made between LANForge and {Full Name} ({Email}), residing at {Address}.\n\nWorker Classification: {Tax Classification}\nCompensation: {Pay Rate}\nEffective Date: {Date}\n\nContractor Tax ID: {SSN}\n\nBy signing below, the parties agree to the terms above."}
            />
            <p className="text-xs text-gray-500 mt-1">Supports simple markdown (#, ##, **bold**, ---). A signature and date field are added automatically. Use <code className="text-indigo-300">{'{Field}'}</code> for anything to fill in.</p>
          </div>

          <div>
            <div className="text-xs text-gray-400 mb-2 flex items-center gap-1"><Tag size={12} /> Detected fields ({liveFields.length})</div>
            <div className="flex flex-wrap gap-2">
              {liveFields.length === 0 && <span className="text-xs text-gray-500">No {'{placeholders}'} found yet.</span>}
              {liveFields.map(f => (
                <span key={f} className="px-2 py-1 bg-indigo-900/40 border border-indigo-800 text-indigo-200 rounded text-xs">{f}</span>
              ))}
            </div>
          </div>

          <CustomCheckbox id="tpl_send_email" checked={form.send_email} onChange={e => setForm({ ...form, send_email: e.target.checked })} label="Email the signing link to the employee via DocuSeal" />

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={closeForm} className="px-4 py-2 border border-gray-600 text-gray-200 text-sm rounded-md hover:bg-gray-800">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50">
              <Save size={16} className="mr-2" /> {saving ? 'Saving…' : 'Save Template'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {templates.length === 0 && !showForm && (
          <div className="text-center py-12 text-gray-400">
            <FileText size={32} className="mx-auto mb-2 opacity-50" />
            No templates yet. Create one to start sending contracts.
          </div>
        )}
        {templates.map(t => (
          <div key={t._id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-white">{t.name}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${t.doc_type === 'W2' ? 'bg-sky-900/50 text-sky-300' : t.doc_type === '1099' ? 'bg-purple-900/50 text-purple-300' : 'bg-gray-700 text-gray-300'}`}>{t.doc_type}</span>
              </div>
              {t.description && <div className="text-sm text-gray-400 mt-1">{t.description}</div>}
              <div className="text-xs text-gray-500 mt-1">{(t.fields || []).length} field{(t.fields || []).length === 1 ? '' : 's'}: {(t.fields || []).map(f => f.name).join(', ')}</div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => openEdit(t)} className="p-2 text-indigo-400 hover:text-indigo-300" title="Edit"><Edit size={16} /></button>
              <button onClick={() => setDeleteId(t._id)} className="p-2 text-red-400 hover:text-red-300" title="Delete"><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
