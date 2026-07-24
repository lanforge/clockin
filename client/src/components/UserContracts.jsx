import React, { useState, useEffect } from 'react';
import axios from 'axios';
import moment from 'moment';
import { FileSignature, Send, RefreshCw, ExternalLink, X, Eye, CheckCircle2, Clock, XCircle, AlertTriangle, Copy } from 'lucide-react';
import CustomSelect from './CustomSelect';

const STATUS_META = {
  sent: { label: 'Sent', cls: 'bg-blue-900/50 text-blue-300', icon: Clock },
  viewed: { label: 'Viewed', cls: 'bg-yellow-900/50 text-yellow-300', icon: Eye },
  completed: { label: 'Signed', cls: 'bg-green-900/50 text-green-300', icon: CheckCircle2 },
  declined: { label: 'Declined', cls: 'bg-red-900/50 text-red-300', icon: XCircle },
  expired: { label: 'Expired', cls: 'bg-gray-700 text-gray-300', icon: XCircle }
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.sent;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${meta.cls}`}>
      <Icon size={12} /> {meta.label}
    </span>
  );
}

function SendContractModal({ userId, employeeName, onClose, onSent, onError }) {
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [fields, setFields] = useState([]);
  const [email, setEmail] = useState('');
  const [loadingPrefill, setLoadingPrefill] = useState(false);
  const [sending, setSending] = useState(false);
  const [docType, setDocType] = useState('');

  useEffect(() => {
    axios.get('/api/admin/contract-templates').then(res => {
      if (res.data.success) setTemplates(res.data.templates);
    }).catch(() => {});
  }, []);

  const handlePickTemplate = async (id) => {
    setTemplateId(id);
    setFields([]);
    if (!id) return;
    setLoadingPrefill(true);
    try {
      const res = await axios.get(`/api/admin/user/${userId}/contract-prefill`, { params: { templateId: id } });
      if (res.data.success) {
        setFields(res.data.fields);
        setDocType(res.data.template.doc_type);
        if (!email) setEmail(res.data.employee.email || '');
      }
    } catch (err) {
      onError?.(err.response?.data?.error || 'Failed to load fields');
    } finally {
      setLoadingPrefill(false);
    }
  };

  const updateField = (idx, value) => {
    setFields(fields.map((f, i) => i === idx ? { ...f, value } : f));
  };

  const handleSend = async () => {
    if (!templateId) { onError?.('Pick a template'); return; }
    if (!email) { onError?.('An email address is required to send'); return; }
    setSending(true);
    try {
      const res = await axios.post(`/api/admin/user/${userId}/send-contract`, { templateId, fields, email });
      if (res.data.success) onSent?.(res.data.submission);
    } catch (err) {
      onError?.(err.response?.data?.error || 'Failed to send contract');
    } finally {
      setSending(false);
    }
  };

  const templateOptions = [{ value: '', label: 'Select a template…' }, ...templates.map(t => ({ value: t._id, label: `${t.name} (${t.doc_type})` }))];

  return (
    <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl shadow-xl border border-gray-700 w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2"><Send size={18} className="text-indigo-400" /> Send Contract to {employeeName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Template</label>
            <CustomSelect name="template" value={templateId} onChange={e => handlePickTemplate(e.target.value)} options={templateOptions} />
            {templates.length === 0 && <p className="text-xs text-yellow-400 mt-1">No templates yet. Create one under Admin → Contracts.</p>}
          </div>

          {loadingPrefill && <div className="flex justify-center py-6"><div className="animate-spin h-6 w-6 border-b-2 border-indigo-600 rounded-full" /></div>}

          {!loadingPrefill && fields.length > 0 && (
            <>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Send to email</label>
                <input type="email" className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 text-sm text-white" value={email} onChange={e => setEmail(e.target.value)} />
              </div>

              <div className="border-t border-gray-700 pt-3">
                <div className="text-sm font-medium text-white mb-1">Review fields</div>
                <p className="text-xs text-gray-400 mb-3">Auto-filled from the profile. Edit anything before sending. These are locked in the document — the employee only signs.</p>
                <div className="space-y-3">
                  {fields.map((f, idx) => (
                    <div key={f.name}>
                      <label className="text-xs text-gray-400 mb-1 flex items-center gap-2">
                        {f.name}
                        {f.sensitive && <span className="px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 text-[10px]">sensitive</span>}
                        {!f.autoFilled && <span className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 text-[10px]">not in profile</span>}
                      </label>
                      <input
                        type="text"
                        className={`w-full bg-gray-900 border rounded-lg p-2 text-sm text-white ${f.value ? 'border-gray-600' : 'border-yellow-700'}`}
                        value={f.value}
                        onChange={e => updateField(idx, e.target.value)}
                        placeholder="Leave blank for the employee to fill"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-gray-700 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-gray-600 text-gray-200 text-sm rounded-md hover:bg-gray-700">Cancel</button>
          <button onClick={handleSend} disabled={sending || !templateId || fields.length === 0} className="flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50">
            <Send size={16} className="mr-2" /> {sending ? 'Sending…' : 'Send for Signature'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UserContracts({ userId, employeeName, onError }) {
  const [submissions, setSubmissions] = useState([]);
  const [signingState, setSigningState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSend, setShowSend] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);

  const fetchContracts = async () => {
    try {
      const res = await axios.get(`/api/admin/user/${userId}/contracts`);
      if (res.data.success) {
        setSubmissions(res.data.submissions);
        setSigningState(res.data.signingState);
      }
    } catch (err) {
      onError?.(err.response?.data?.error || 'Failed to load contracts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchContracts(); }, [userId]);

  const handleRefresh = async (id) => {
    setRefreshingId(id);
    try {
      await axios.post(`/api/admin/contract-submissions/${id}/refresh`);
      await fetchContracts();
    } catch (err) {
      onError?.(err.response?.data?.error || 'Failed to refresh');
    } finally {
      setRefreshingId(null);
    }
  };

  const copyLink = (url) => { navigator.clipboard?.writeText(url); };

  return (
    <div className="bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-700">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center"><FileSignature size={18} className="mr-2 text-indigo-500" /> Contracts</h3>
        <button onClick={() => setShowSend(true)} className="flex items-center px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700">
          <Send size={14} className="mr-1.5" /> Send
        </button>
      </div>

      {signingState && (
        signingState.needsSigning ? (
          <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-800 rounded-lg flex items-start gap-2 text-sm text-yellow-200">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <span>Needs to sign a <strong>{signingState.requiredDocType}</strong> document{signingState.pendingSubmission ? ' — one is currently pending.' : '. None sent yet.'}</span>
          </div>
        ) : (
          <div className="mb-4 p-3 bg-green-900/25 border border-green-800 rounded-lg flex items-center gap-2 text-sm text-green-200">
            <CheckCircle2 size={16} /> Signed the required {signingState.requiredDocType} document.
          </div>
        )
      )}

      {loading ? (
        <div className="flex justify-center py-6"><div className="animate-spin h-6 w-6 border-b-2 border-indigo-600 rounded-full" /></div>
      ) : submissions.length === 0 ? (
        <div className="text-sm text-gray-400 text-center py-6">No contracts sent yet.</div>
      ) : (
        <div className="space-y-3">
          {submissions.map(s => (
            <div key={s._id} className="border border-gray-700 rounded-lg p-3 bg-gray-900/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white text-sm">{s.template_name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${s.doc_type === 'W2' ? 'bg-sky-900/50 text-sky-300' : s.doc_type === '1099' ? 'bg-purple-900/50 text-purple-300' : 'bg-gray-700 text-gray-300'}`}>{s.doc_type}</span>
                    <StatusBadge status={s.status} />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Sent {moment(s.sent_at).format('ll')}
                    {s.viewed_at && ` · Viewed ${moment(s.viewed_at).format('ll')}`}
                    {s.completed_at && ` · Signed ${moment(s.completed_at).format('ll')}`}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => handleRefresh(s._id)} className="p-1.5 text-gray-400 hover:text-white" title="Refresh status">
                    <RefreshCw size={14} className={refreshingId === s._id ? 'animate-spin' : ''} />
                  </button>
                  {s.embed_src && s.status !== 'completed' && (
                    <button onClick={() => copyLink(s.embed_src)} className="p-1.5 text-gray-400 hover:text-white" title="Copy signing link"><Copy size={14} /></button>
                  )}
                  {s.signed_document_url && (
                    <a href={s.signed_document_url} target="_blank" rel="noreferrer" className="p-1.5 text-green-400 hover:text-green-300" title="View signed document"><ExternalLink size={14} /></a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showSend && (
        <SendContractModal
          userId={userId}
          employeeName={employeeName}
          onError={onError}
          onClose={() => setShowSend(false)}
          onSent={() => { setShowSend(false); fetchContracts(); }}
        />
      )}
    </div>
  );
}
