import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import moment from 'moment';
import { CheckCircle, AlertCircle, RotateCcw, Save, X, Edit2, ChevronDown, ChevronRight, Gift, Plus, Trash2, Percent } from 'lucide-react';
import CustomSelect from './CustomSelect';
import CustomCheckbox from './CustomCheckbox';
import CustomModal from './CustomModal';
import CustomDatePicker from './CustomDatePicker';

const TAX_OPTIONS = [
  { value: '1099', label: '1099' },
  { value: 'W2', label: 'W2' }
];

const SUPPORTED_YEARS = [2026];

export default function AdminPaychecks({ users, onError }) {
  const [year, setYear] = useState(SUPPORTED_YEARS[0]);
  const [paychecks, setPaychecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ amount: '', notes: '', tax_classification: '1099' });
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [modalConfig, setModalConfig] = useState({ isOpen: false });
  const [saving, setSaving] = useState(false);
  const [extraForm, setExtraForm] = useState({
    kind: null,
    user_ids: [],
    amount: '',
    description: '',
    pay_date: moment().format('YYYY-MM-DD'),
    tax_classification: '1099'
  });

  const closeModal = () => setModalConfig({ isOpen: false });

  const yearOptions = useMemo(
    () => SUPPORTED_YEARS.map(y => ({ value: String(y), label: String(y) })),
    []
  );

  const userOptions = useMemo(() => {
    const opts = [{ value: 'all', label: 'All users' }];
    (users || []).forEach(u => opts.push({ value: u._id, label: u.username }));
    return opts;
  }, [users]);

  const fetchPaychecks = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/admin/paychecks', { params: { year } });
      if (res.data.success) {
        setPaychecks(res.data.data.paychecks);
      }
    } catch (err) {
      onError?.(err.response?.data?.error || 'Failed to load paychecks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPaychecks(); }, [year]);

  const startEdit = (pc) => {
    setEditingId(pc._id);
    setEditForm({
      amount: pc.amount.toFixed(2),
      notes: pc.notes || '',
      tax_classification: pc.tax_classification || '1099'
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ amount: '', notes: '', tax_classification: '1099' });
  };

  const saveEdit = async (pc) => {
    setSaving(true);
    try {
      const amountChanged = parseFloat(editForm.amount) !== pc.amount;
      const payload = { notes: editForm.notes, tax_classification: editForm.tax_classification };
      if (amountChanged) payload.amount = editForm.amount;
      const res = await axios.put(`/api/admin/paychecks/${pc._id}`, payload);
      if (res.data.success) {
        cancelEdit();
        fetchPaychecks();
      }
    } catch (err) {
      onError?.(err.response?.data?.error || 'Failed to save paycheck');
    } finally {
      setSaving(false);
    }
  };

  const clearOverride = async (pc) => {
    setSaving(true);
    try {
      const res = await axios.put(`/api/admin/paychecks/${pc._id}`, { clear_override: true });
      if (res.data.success) {
        cancelEdit();
        fetchPaychecks();
      }
    } catch (err) {
      onError?.(err.response?.data?.error || 'Failed to reset paycheck');
    } finally {
      setSaving(false);
    }
  };

  const markPaid = (pc) => {
    if (pc.pay_type === 'hourly' && pc.hours === 0 && !pc.amount_override) {
      onError?.(`${pc.username}'s paycheck for ${pc.period_label} has 0 hours. Enter the paycheck amount before marking it paid.`);
      startEdit(pc);
      return;
    }
    setModalConfig({
      isOpen: true,
      title: 'Mark as Paid',
      message: `Confirm paycheck of $${pc.amount.toFixed(2)} for ${pc.username} (${pc.period_label}) has been paid?`,
      type: 'confirm',
      confirmText: 'Mark Paid',
      onCancel: closeModal,
      onConfirm: async () => {
        closeModal();
        try {
          const res = await axios.post(`/api/admin/paychecks/${pc._id}/mark-paid`);
          if (res.data.success) {
            fetchPaychecks();
          }
        } catch (err) {
          onError?.(err.response?.data?.error || 'Failed to mark paycheck as paid');
        }
      }
    });
  };

  const markUnpaid = (pc) => {
    setModalConfig({
      isOpen: true,
      title: 'Unmark as Paid',
      message: `Revert "${pc.username}'s" paycheck for ${pc.period_label} back to unpaid?`,
      type: 'confirm',
      confirmText: 'Unmark Paid',
      onCancel: closeModal,
      onConfirm: async () => {
        closeModal();
        try {
          const res = await axios.post(`/api/admin/paychecks/${pc._id}/mark-unpaid`);
          if (res.data.success) {
            fetchPaychecks();
          }
        } catch (err) {
          onError?.(err.response?.data?.error || 'Failed to mark paycheck as unpaid');
        }
      }
    });
  };

  const openExtraForm = (kind) => {
    setExtraForm({
      kind,
      user_ids: [],
      amount: '',
      description: '',
      pay_date: moment().format('YYYY-MM-DD'),
      tax_classification: '1099'
    });
  };

  const closeExtraForm = () => setExtraForm(f => ({ ...f, kind: null }));

  const toggleExtraUser = (uid) => {
    setExtraForm(f => ({
      ...f,
      user_ids: f.user_ids.includes(uid) ? f.user_ids.filter(u => u !== uid) : [...f.user_ids, uid]
    }));
  };

  const submitExtra = async (e) => {
    e.preventDefault();
    const kindLabel = extraForm.kind === 'commission' ? 'commission' : 'bonus';
    if (extraForm.user_ids.length === 0) {
      onError?.('Pick at least one recipient');
      return;
    }
    if (!extraForm.amount || parseFloat(extraForm.amount) <= 0) {
      onError?.(`Enter a ${kindLabel} amount`);
      return;
    }
    if (!extraForm.description.trim()) {
      onError?.(`${kindLabel.charAt(0).toUpperCase() + kindLabel.slice(1)} description is required`);
      return;
    }
    setSaving(true);
    try {
      const endpoint = extraForm.kind === 'commission' ? '/api/admin/paychecks/commission' : '/api/admin/paychecks/bonus';
      const { kind, ...payload } = extraForm;
      const res = await axios.post(endpoint, payload);
      if (res.data.success) {
        closeExtraForm();
        fetchPaychecks();
      }
    } catch (err) {
      onError?.(err.response?.data?.error || `Failed to create ${kindLabel}`);
    } finally {
      setSaving(false);
    }
  };

  const deletePaycheck = (pc) => {
    setModalConfig({
      isOpen: true,
      title: 'Delete paycheck',
      message: `Permanently delete this ${pc.is_bonus ? 'bonus' : pc.is_commission ? 'commission' : 'scheduled'} paycheck for ${pc.username} (${pc.period_label})? This cannot be undone.`,
      type: 'confirm',
      confirmText: 'Delete',
      onCancel: closeModal,
      onConfirm: async () => {
        closeModal();
        try {
          const res = await axios.delete(`/api/admin/paychecks/${pc._id}`);
          if (res.data.success) {
            fetchPaychecks();
          }
        } catch (err) {
          onError?.(err.response?.data?.error || 'Failed to delete paycheck');
        }
      }
    });
  };

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (filterUser === 'all') return paychecks;
    return paychecks.filter(p => String(p.user_id) === String(filterUser));
  }, [paychecks, filterUser]);

  const now = new Date();
  const allPending = filtered.filter(p => !p.is_paid);
  const pastDue = allPending.filter(p => new Date(p.period_end) <= now);
  const futureUpcoming = allPending
    .filter(p => new Date(p.period_end) > now)
    .sort((a, b) => new Date(a.period_start) - new Date(b.period_start));
  const pending = [...pastDue, ...futureUpcoming.slice(0, 2)];
  const hiddenUpcomingCount = Math.max(0, futureUpcoming.length - 2);
  const paid = filtered.filter(p => p.is_paid);

  const totalPending = pending.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalPaid = paid.reduce((sum, p) => sum + (p.amount || 0), 0);

  const renderRow = (pc) => {
    const isEditing = editingId === pc._id;
    const isExpanded = expandedIds.has(pc._id);
    const needsAmount = pc.pay_type === 'hourly' && pc.hours === 0 && !pc.amount_override && !pc.is_paid;

    return (
      <div
        key={pc._id}
        className={`border rounded-lg p-3 sm:p-4 transition-colors ${
          pc.is_paid
            ? 'border-green-800 bg-green-900/10'
            : pc.is_bonus
              ? 'border-pink-700 bg-pink-900/10'
              : pc.is_commission
                ? 'border-amber-700 bg-amber-900/10'
                : needsAmount
                  ? 'border-yellow-700 bg-yellow-900/10'
                  : 'border-gray-700 bg-gray-900'
        }`}
      >
        <div className="flex flex-wrap items-start gap-3">
          <button
            onClick={() => toggleExpand(pc._id)}
            className="text-gray-400 hover:text-white p-1 -ml-1 flex-shrink-0"
            aria-label="Toggle details"
          >
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-white text-sm">{pc.username}</span>
              <span className="text-xs text-gray-400">{pc.period_label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider border inline-flex items-center gap-1 ${
                pc.is_bonus
                  ? 'border-pink-700 text-pink-300'
                  : pc.is_commission
                    ? 'border-amber-700 text-amber-300'
                    : pc.pay_type === 'salary'
                      ? 'border-indigo-700 text-indigo-300'
                      : 'border-gray-600 text-gray-300'
              }`}>
                {pc.is_bonus && <Gift size={10} />}
                {pc.is_commission && <Percent size={10} />}
                {pc.is_bonus ? `Bonus${pc.bonus_source === 'sales_goal' ? ' (goal)' : ''}` : pc.is_commission ? 'Commission' : pc.pay_type}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider border ${
                pc.tax_classification === 'W2'
                  ? 'border-sky-700 text-sky-300'
                  : 'border-amber-700 text-amber-300'
              }`}>
                {pc.tax_classification || '1099'}
              </span>
              {pc.amount_override && !pc.is_paid && (
                <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider bg-purple-900/40 border border-purple-700 text-purple-200">
                  Override
                </span>
              )}
              {needsAmount && (
                <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider bg-yellow-900/40 border border-yellow-700 text-yellow-200">
                  Needs Amount
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Pay date: {moment(pc.pay_date).format('MMM D, YYYY')}
              {!pc.is_bonus && !pc.is_commission && pc.pay_type === 'hourly' && <span className="ml-3">{pc.hours.toFixed(2)} hrs @ ${pc.hourly_rate.toFixed(2)}/hr</span>}
              {pc.is_bonus && pc.bonus_description && <span className="ml-3 italic">{pc.bonus_description}</span>}
              {pc.is_commission && pc.commission_description && <span className="ml-3 italic">{pc.commission_description}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isEditing ? (
              <div className="flex items-center gap-1">
                <span className="text-green-400 text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.amount}
                  onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                  className="w-24 px-2 py-1 text-sm rounded border border-gray-600 bg-gray-800 text-white focus:border-indigo-500 focus:ring-indigo-500"
                  autoFocus
                />
              </div>
            ) : (
              <span className="text-base font-semibold text-green-400 whitespace-nowrap">
                ${pc.amount.toFixed(2)}
              </span>
            )}
            {pc.is_paid ? (
              <button
                onClick={() => markUnpaid(pc)}
                className="text-xs px-2 py-1 rounded border border-green-700 text-green-300 hover:bg-green-900/30 inline-flex items-center gap-1"
              >
                <CheckCircle size={14} /> Paid
              </button>
            ) : (
              <>
                {isEditing ? (
                  <>
                    <button
                      onClick={() => saveEdit(pc)}
                      disabled={saving}
                      className="text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      <Save size={14} /> Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="text-xs px-2 py-1 rounded border border-gray-600 text-gray-300 hover:bg-gray-800"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startEdit(pc)}
                      className="text-xs px-2 py-1 rounded border border-gray-600 text-gray-300 hover:bg-gray-800 inline-flex items-center gap-1"
                    >
                      <Edit2 size={14} /> Edit
                    </button>
                    <button
                      onClick={() => markPaid(pc)}
                      className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 inline-flex items-center gap-1"
                    >
                      <CheckCircle size={14} /> Mark Paid
                    </button>
                    {(pc.is_bonus || pc.is_commission) && (
                      <button
                        onClick={() => deletePaycheck(pc)}
                        className="text-xs p-1 rounded text-red-400 hover:bg-red-900/30"
                        title="Delete paycheck"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {(isExpanded || isEditing) && (
          <div className="mt-3 pt-3 border-t border-gray-700 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Tax Classification</label>
              {isEditing ? (
                <CustomSelect
                  name="tax_classification"
                  value={editForm.tax_classification}
                  onChange={e => setEditForm({ ...editForm, tax_classification: e.target.value })}
                  options={TAX_OPTIONS}
                />
              ) : (
                <div className="text-gray-200">{pc.tax_classification || '1099'}</div>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Period</label>
              <div className="text-gray-200">
                {moment(pc.period_start).format('MMM D')} – {moment(pc.period_end).format('MMM D, YYYY')}
              </div>
            </div>
            {pc.pay_type === 'salary' && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Annual Salary</label>
                <div className="text-gray-200">${(pc.salary_amount || 0).toFixed(2)}/yr</div>
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Notes</label>
              {isEditing ? (
                <textarea
                  value={editForm.notes}
                  onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                  rows="2"
                  className="w-full px-2 py-1.5 rounded border border-gray-600 bg-gray-800 text-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder="Optional notes (e.g. bonus, deduction, reason for override)"
                />
              ) : (
                <div className="text-gray-300 whitespace-pre-wrap">{pc.notes || <span className="text-gray-500">—</span>}</div>
              )}
            </div>
            {pc.amount_override && !pc.is_paid && (
              <div className="sm:col-span-2">
                <button
                  onClick={() => clearOverride(pc)}
                  disabled={saving}
                  className="text-xs px-2 py-1 rounded border border-gray-600 text-gray-300 hover:bg-gray-800 inline-flex items-center gap-1"
                >
                  <RotateCcw size={14} /> Reset to computed amount
                </button>
              </div>
            )}
            {pc.is_paid && pc.paid_at && (
              <div className="sm:col-span-2 text-xs text-gray-400">
                Paid {moment(pc.paid_at).format('MMM D, YYYY h:mm A')}
                {pc.paid_by?.username ? ` by ${pc.paid_by.username}` : ''}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <CustomModal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        onConfirm={modalConfig.onConfirm}
        onCancel={modalConfig.onCancel}
        confirmText={modalConfig.confirmText}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Paychecks</h3>
          <p className="text-xs text-gray-400 mt-1">2026: semi-monthly (1st–15th, 16th–EOM) through June 30, then biweekly from July 1. Pending paychecks must be checked off when paid.</p>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
          <div className="w-32">
            <CustomSelect
              name="year"
              value={String(year)}
              onChange={e => setYear(parseInt(e.target.value, 10))}
              options={yearOptions}
            />
          </div>
          <div className="w-44">
            <CustomSelect
              name="filter_user"
              value={filterUser}
              onChange={e => setFilterUser(e.target.value)}
              options={userOptions}
            />
          </div>
          <button
            onClick={() => openExtraForm('bonus')}
            className="px-3 py-2 text-xs rounded bg-pink-600 text-white hover:bg-pink-700 inline-flex items-center justify-center gap-1"
          >
            <Gift size={14} /> Add Bonus
          </button>
          <button
            onClick={() => openExtraForm('commission')}
            className="px-3 py-2 text-xs rounded bg-amber-600 text-white hover:bg-amber-700 inline-flex items-center justify-center gap-1"
          >
            <Percent size={14} /> Add Commission
          </button>
        </div>
      </div>

      {extraForm.kind && (
        <form onSubmit={submitExtra} className={`bg-gray-900 p-4 rounded-lg border space-y-3 ${
          extraForm.kind === 'commission' ? 'border-amber-800' : 'border-pink-800'
        }`}>
          <h4 className={`text-sm font-semibold flex items-center gap-2 ${
            extraForm.kind === 'commission' ? 'text-amber-300' : 'text-pink-300'
          }`}>
            {extraForm.kind === 'commission' ? <Percent size={16} /> : <Gift size={16} />}
            Manual {extraForm.kind === 'commission' ? 'Commission' : 'Bonus'}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={extraForm.amount}
                onChange={e => setExtraForm({ ...extraForm, amount: e.target.value })}
                className="w-full border rounded p-1.5 text-sm bg-gray-800 border-gray-600 text-white"
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Pay Date</label>
              <CustomDatePicker
                name="extra_pay_date"
                value={extraForm.pay_date}
                onChange={e => setExtraForm({ ...extraForm, pay_date: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-400 block mb-1">Description (shown on the paycheck)</label>
              <input
                type="text"
                value={extraForm.description}
                onChange={e => setExtraForm({ ...extraForm, description: e.target.value })}
                placeholder={extraForm.kind === 'commission' ? 'e.g. June commission on order #1234' : 'e.g. Q2 performance bonus, holiday bonus'}
                className="w-full border rounded p-1.5 text-sm bg-gray-800 border-gray-600 text-white"
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Tax Classification (override)</label>
              <CustomSelect
                name="extra_tax_classification"
                value={extraForm.tax_classification}
                onChange={e => setExtraForm({ ...extraForm, tax_classification: e.target.value })}
                options={[
                  { value: '1099', label: '1099' },
                  { value: 'W2', label: 'W2' }
                ]}
              />
              <p className="text-[10px] text-gray-500 mt-1">Defaults to each recipient's current classification.</p>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-2">Recipients</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-2 bg-gray-800 rounded border border-gray-700">
              {(users || []).map(u => (
                <CustomCheckbox
                  key={u._id}
                  id={`extra_user_${u._id}`}
                  checked={extraForm.user_ids.includes(u._id)}
                  onChange={() => toggleExtraUser(u._id)}
                  label={u.pay_type === 'none' ? `${u.username} (no pay)` : u.username}
                />
              ))}
            </div>
            <p className="text-[10px] text-gray-500 mt-1">Users marked "no pay" are excluded from auto-awards but can still receive a manual bonus or commission if you select them.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeExtraForm}
              className="px-3 py-1.5 text-xs rounded border border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`px-3 py-1.5 text-xs rounded text-white disabled:opacity-50 ${
                extraForm.kind === 'commission' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-pink-600 hover:bg-pink-700'
              }`}
            >
              {saving ? 'Creating…' : `Create ${extraForm.user_ids.length || ''} ${extraForm.kind} paycheck${extraForm.user_ids.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
          <p className="text-xs uppercase tracking-wider text-gray-400">Pending</p>
          <p className="mt-1 text-xl font-bold text-yellow-300">${totalPending.toFixed(2)}</p>
          <p className="text-xs text-gray-500">{pending.length} paycheck{pending.length === 1 ? '' : 's'}</p>
        </div>
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
          <p className="text-xs uppercase tracking-wider text-gray-400">Paid (year)</p>
          <p className="mt-1 text-xl font-bold text-green-400">${totalPaid.toFixed(2)}</p>
          <p className="text-xs text-gray-500">{paid.length} paycheck{paid.length === 1 ? '' : 's'}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin h-8 w-8 border-b-2 border-indigo-600 rounded-full"></div>
        </div>
      ) : (
        <>
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle size={16} className="text-yellow-400" />
              <h4 className="text-sm font-semibold text-white">Pending / Upcoming</h4>
            </div>
            {pending.length === 0 ? (
              <p className="text-sm text-gray-400 italic px-2">No pending paychecks for {year}.</p>
            ) : (
              <>
                <div className="space-y-2">
                  {pending.map(renderRow)}
                </div>
                {hiddenUpcomingCount > 0 && (
                  <p className="text-xs text-gray-500 italic mt-2 px-2">
                    {hiddenUpcomingCount} more upcoming paycheck{hiddenUpcomingCount === 1 ? '' : 's'} hidden until closer to pay date.
                  </p>
                )}
              </>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={16} className="text-green-400" />
              <h4 className="text-sm font-semibold text-white">Paid</h4>
            </div>
            {paid.length === 0 ? (
              <p className="text-sm text-gray-400 italic px-2">No paid paychecks yet for {year}.</p>
            ) : (
              <div className="space-y-2">
                {paid.map(renderRow)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
