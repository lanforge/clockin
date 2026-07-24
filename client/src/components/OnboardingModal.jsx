import React, { useState, useEffect } from 'react';
import axios from 'axios';
import moment from 'moment';
import { FileSignature, PenLine, X, Eye, CheckCircle2, Clock, XCircle, ExternalLink, RefreshCw } from 'lucide-react';

const STATUS_META = {
  sent: { label: 'Awaiting your signature', cls: 'bg-blue-900/50 text-blue-300', icon: Clock },
  viewed: { label: 'Viewed — not signed', cls: 'bg-yellow-900/50 text-yellow-300', icon: Eye },
  completed: { label: 'Signed', cls: 'bg-green-900/50 text-green-300', icon: CheckCircle2 },
  declined: { label: 'Declined', cls: 'bg-red-900/50 text-red-300', icon: XCircle },
  expired: { label: 'Expired', cls: 'bg-gray-700 text-gray-300', icon: XCircle }
};

export default function OnboardingModal() {
  const [submissions, setSubmissions] = useState([]);
  const [state, setState] = useState(null);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchContracts = async () => {
    try {
      const res = await axios.get('/api/my-contracts');
      if (res.data.success) {
        setSubmissions(res.data.submissions);
        setState(res.data.signingState);
        const pending = res.data.submissions.some(s => ['sent', 'viewed'].includes(s.status));
        // Auto-open when there is an outstanding required signature.
        if ((res.data.signingState?.needsSigning && pending) && !dismissed) setOpen(true);
      }
    } catch (err) {
      // Silent: onboarding modal is non-critical.
    }
  };

  useEffect(() => { fetchContracts(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchContracts();
    setRefreshing(false);
  };

  // A pending doc for the currently required classification.
  const pendingRequired = submissions.find(
    s => state && s.doc_type === state.requiredDocType && ['sent', 'viewed'].includes(s.status)
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl shadow-xl border border-gray-700 w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <FileSignature size={20} className="text-indigo-400" /> Documents to Sign
          </h3>
          <button onClick={() => { setOpen(false); setDismissed(true); }} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          {state?.needsSigning ? (
            <p className="text-sm text-gray-300">
              You have a <strong className="text-white">{state.requiredDocType}</strong> document that needs your signature. Please review and sign it below.
            </p>
          ) : (
            <p className="text-sm text-gray-300">Here are your documents and their status.</p>
          )}

          {pendingRequired && (
            <a
              href={pendingRequired.embed_src}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
            >
              <PenLine size={18} /> Review & Sign your {pendingRequired.doc_type} document
            </a>
          )}

          <div className="space-y-2">
            {submissions.length === 0 && <div className="text-sm text-gray-400 text-center py-4">No documents assigned to you.</div>}
            {submissions.map(s => {
              const meta = STATUS_META[s.status] || STATUS_META.sent;
              const Icon = meta.icon;
              return (
                <div key={s._id} className="border border-gray-700 rounded-lg p-3 bg-gray-900/40 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white">{s.template_name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${s.doc_type === 'W2' ? 'bg-sky-900/50 text-sky-300' : 'bg-purple-900/50 text-purple-300'}`}>{s.doc_type}</span>
                    </div>
                    <div className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded text-xs font-medium ${meta.cls}`}>
                      <Icon size={12} /> {meta.label}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1">
                      Sent {moment(s.sent_at).format('ll')}
                      {s.completed_at && ` · Signed ${moment(s.completed_at).format('ll')}`}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {s.status === 'completed' && s.signed_document_url ? (
                      <a href={s.signed_document_url} target="_blank" rel="noreferrer" className="p-2 text-green-400 hover:text-green-300" title="View signed copy"><ExternalLink size={16} /></a>
                    ) : ['sent', 'viewed'].includes(s.status) && s.embed_src ? (
                      <a href={s.embed_src} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-md flex items-center gap-1"><PenLine size={12} /> Sign</a>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-gray-700 flex justify-between items-center">
          <button onClick={handleRefresh} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh status
          </button>
          <button onClick={() => { setOpen(false); setDismissed(true); }} className="px-4 py-2 border border-gray-600 text-gray-200 text-sm rounded-md hover:bg-gray-700">
            {state?.needsSigning ? 'Remind me later' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
