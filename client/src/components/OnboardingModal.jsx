import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { FileSignature, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';

const DOCUSEAL_SCRIPT = 'https://cdn.docuseal.com/js/form.js';

// Load the DocuSeal embed script once. The <docuseal-form> web component
// upgrades automatically once the script defines it.
function useDocusealScript() {
  useEffect(() => {
    if (window.customElements && window.customElements.get('docuseal-form')) return;
    if (document.querySelector(`script[src="${DOCUSEAL_SCRIPT}"]`)) return;
    const s = document.createElement('script');
    s.src = DOCUSEAL_SCRIPT;
    s.async = true;
    document.head.appendChild(s);
  }, []);
}

// Blocking signing modal. When the logged-in employee owes a signature for
// their current tax classification and a document has been sent, this embeds
// the DocuSeal signing form and does not let them dismiss it until every
// required document is signed.
export default function OnboardingModal() {
  useDocusealScript();

  const [data, setData] = useState(null); // { submissions, signingState }
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [wasSigning, setWasSigning] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);
  const pollRef = useRef(null);
  const formRef = useRef(null);

  const reload = useCallback(async () => {
    try {
      const res = await axios.get('/api/my-contracts');
      if (res.data.success) setData({ submissions: res.data.submissions, signingState: res.data.signingState });
    } catch (e) {
      /* non-critical */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Documents the employee must sign now: pending, matching the doc_type their
  // current classification requires, and with a signing URL.
  const requiredType = data?.signingState?.requiredDocType;
  const toSign = (data?.submissions || []).filter(
    (s) => s.doc_type === requiredType && ['sent', 'viewed'].includes(s.status) && s.embed_src
  );
  // Force signing whenever there is ANY unsigned (sent/viewed) document of the
  // employee's current required type — even if they've completed a different one
  // before. This is what makes a re-sent or reclassified document block the app.
  const mustSign = toSign.length > 0;
  const current = toSign[0] || null;

  // Track the signing -> done transition so we can show a one-time thank-you.
  useEffect(() => {
    if (mustSign && !wasSigning) setWasSigning(true);
    if (wasSigning && !mustSign) {
      setWasSigning(false);
      setShowThankYou(true);
    }
  }, [mustSign, wasSigning]);

  // Refresh the current submission's status directly from DocuSeal, then reload.
  const refreshCurrent = useCallback(async (showSpinner) => {
    if (!current) return;
    if (showSpinner) setRefreshing(true);
    try {
      await axios.post(`/api/my-contracts/${current._id}/refresh`);
    } catch (e) {
      /* ignore */
    }
    await reload();
    if (showSpinner) setRefreshing(false);
  }, [current, reload]);

  // Listen for the embedded form's completion/decline events. These are only a
  // hint to re-check with the backend, which is the source of truth — a spurious
  // event can't bypass signing.
  useEffect(() => {
    const el = formRef.current;
    if (!el) return;
    const onDone = () => refreshCurrent(false);
    el.addEventListener('completed', onDone);
    el.addEventListener('declined', onDone);
    return () => {
      el.removeEventListener('completed', onDone);
      el.removeEventListener('declined', onDone);
    };
  }, [current, refreshCurrent]);

  // Poll as a safety net while something is pending, in case the event or
  // webhook is missed.
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (mustSign && current) {
      pollRef.current = setInterval(() => refreshCurrent(false), 8000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [mustSign, current, refreshCurrent]);

  if (!loaded) return null;

  // One-time confirmation after the last required signature.
  if (showThankYou && !mustSign) {
    return (
      <div className="fixed inset-0 bg-black/80 z-[300] flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md p-8 text-center">
          <CheckCircle2 size={48} className="mx-auto text-green-400 mb-3" />
          <h3 className="text-xl font-semibold text-white mb-2">All set — thank you!</h3>
          <p className="text-sm text-gray-300 mb-6">Your document has been signed and recorded.</p>
          <button onClick={() => setShowThankYou(false)} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium">Continue to dashboard</button>
        </div>
      </div>
    );
  }

  if (!mustSign) return null;

  const multiple = toSign.length > 1;

  return (
    <div className="fixed inset-0 bg-black/85 z-[300] flex items-center justify-center p-2 sm:p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-4xl h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between gap-3 bg-gray-800/60">
          <div className="flex items-center gap-2 min-w-0">
            <FileSignature size={20} className="text-indigo-400 flex-shrink-0" />
            <div className="min-w-0">
              <h3 className="text-white font-semibold truncate">Signature required: {current.template_name}</h3>
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <ShieldCheck size={12} /> You must sign your {requiredType} document to continue{multiple ? ` (${toSign.length} remaining)` : ''}.
              </p>
            </div>
          </div>
          <button
            onClick={() => refreshCurrent(true)}
            className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white border border-gray-600 rounded-md px-3 py-1.5 flex-shrink-0"
            title="Check signing status"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> I've signed
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-white">
          {/* DocuSeal embedded signing form (upgrades once the CDN script loads) */}
          <docuseal-form
            key={current._id}
            ref={formRef}
            data-src={current.embed_src}
            style={{ display: 'block', width: '100%' }}
          ></docuseal-form>
        </div>

        <div className="px-4 py-2 bg-gray-800/60 border-t border-gray-700 text-center">
          <p className="text-[11px] text-gray-400">This document must be signed before you can use the dashboard. If the form finished but this didn't close, click “I've signed”.</p>
        </div>
      </div>
    </div>
  );
}
