import React, { useState, useEffect } from 'react';
import axios from 'axios';
import moment from 'moment';
import { Plus, Trash2, History, X, Calendar as CalendarIcon, Edit2, Save } from 'lucide-react';
import CustomSelect from './CustomSelect';
import CustomDatePicker from './CustomDatePicker';
import CustomModal from './CustomModal';

const emptyForm = {
  effective_date: moment().format('YYYY-MM-DD'),
  pay_type: 'hourly',
  hourly_rate: '',
  salary_amount: '',
  tax_classification: '1099',
  note: ''
};

export default function PaySchedule({ userId, user, onSaved }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalConfig, setModalConfig] = useState({ isOpen: false });
  const [editingStartDate, setEditingStartDate] = useState(false);
  const [startDateValue, setStartDateValue] = useState('');
  const [savingStartDate, setSavingStartDate] = useState(false);

  useEffect(() => {
    setStartDateValue(user?.paychecks_start_date ? moment(user.paychecks_start_date).format('YYYY-MM-DD') : '');
  }, [user?.paychecks_start_date]);

  const saveStartDate = async () => {
    setSavingStartDate(true);
    try {
      const res = await axios.post(`/api/admin/user/${userId}/paychecks-start-date`, { start_date: startDateValue });
      if (res.data.success) {
        setEditingStartDate(false);
        onSaved?.();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update start date');
    } finally {
      setSavingStartDate(false);
    }
  };

  const clearStartDate = async () => {
    setSavingStartDate(true);
    try {
      const res = await axios.post(`/api/admin/user/${userId}/paychecks-start-date`, { start_date: '' });
      if (res.data.success) {
        setStartDateValue('');
        setEditingStartDate(false);
        onSaved?.();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to clear start date');
    } finally {
      setSavingStartDate(false);
    }
  };

  const closeModal = () => setModalConfig({ isOpen: false });

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/admin/user/${userId}/pay-history`);
      if (res.data.success) {
        setHistory(res.data.data.history);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load pay history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHistory(); }, [userId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.effective_date) {
      setError('Effective date is required');
      return;
    }
    const payload = {
      effective_date: form.effective_date,
      pay_type: form.pay_type,
      tax_classification: form.tax_classification,
      note: form.note,
      hourly_rate: form.pay_type === 'hourly' ? parseFloat(form.hourly_rate || 0) : 0,
      salary_amount: form.pay_type === 'salary' ? parseFloat(form.salary_amount || 0) : 0
    };
    setSaving(true);
    try {
      const res = await axios.post(`/api/admin/user/${userId}/pay-history`, payload);
      if (res.data.success) {
        setForm(emptyForm);
        setShowForm(false);
        fetchHistory();
        onSaved?.();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save pay change');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (rate) => {
    setModalConfig({
      isOpen: true,
      title: 'Remove pay rate entry',
      message: `Remove the ${rate.pay_type} rate effective ${moment(rate.effective_date).format('MMM D, YYYY')}? Existing paid paychecks keep their snapshot; unpaid paychecks will recompute from the previous effective rate.`,
      type: 'confirm',
      confirmText: 'Remove',
      onCancel: closeModal,
      onConfirm: async () => {
        closeModal();
        try {
          const res = await axios.delete(`/api/admin/user/${userId}/pay-history/${rate._id}`);
          if (res.data.success) {
            fetchHistory();
            onSaved?.();
          }
        } catch (err) {
          setError(err.response?.data?.error || 'Failed to remove pay rate');
        }
      }
    });
  };

  const now = new Date();
  const current = history.find(r => new Date(r.effective_date) <= now);
  const future = history.filter(r => new Date(r.effective_date) > now);
  const past = history.filter(r => new Date(r.effective_date) <= now);

  return (
    <div className="bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-700">
      <CustomModal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        onConfirm={modalConfig.onConfirm}
        onCancel={modalConfig.onCancel}
        confirmText={modalConfig.confirmText}
      />

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center"><History size={18} className="mr-2 text-indigo-500" /> Pay Schedule</h3>
        <button
          onClick={() => { setShowForm(s => !s); setForm({ ...emptyForm, pay_type: current?.pay_type || 'hourly', tax_classification: current?.tax_classification || '1099' }); }}
          className="text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 inline-flex items-center gap-1"
        >
          {showForm ? <X size={14} /> : <Plus size={14} />} {showForm ? 'Cancel' : 'Add pay change'}
        </button>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-900/50 border border-red-700 rounded text-red-200 text-xs">{error}</div>
      )}

      <div className="mb-4 p-3 bg-gray-900 border border-gray-700 rounded-lg">
        <div className="flex justify-between items-start gap-2 mb-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold flex items-center gap-1">
              <CalendarIcon size={12} /> Paycheck Start Date
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">Scheduled paychecks won't be generated for any period ending before this date.</p>
          </div>
          {!editingStartDate ? (
            <button
              onClick={() => setEditingStartDate(true)}
              className="text-indigo-400 hover:text-indigo-300 p-1"
              title="Edit start date"
            >
              <Edit2 size={14} />
            </button>
          ) : (
            <div className="flex gap-1">
              <button
                onClick={saveStartDate}
                disabled={savingStartDate}
                className="text-green-400 hover:text-green-300 p-1 disabled:opacity-50"
                title="Save"
              >
                <Save size={14} />
              </button>
              <button
                onClick={() => {
                  setEditingStartDate(false);
                  setStartDateValue(user?.paychecks_start_date ? moment(user.paychecks_start_date).format('YYYY-MM-DD') : '');
                }}
                className="text-gray-400 hover:text-gray-300 p-1"
                title="Cancel"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
        {editingStartDate ? (
          <div className="space-y-2">
            <CustomDatePicker
              name="paychecks_start_date"
              value={startDateValue}
              onChange={e => setStartDateValue(e.target.value)}
            />
            <button
              type="button"
              onClick={clearStartDate}
              disabled={savingStartDate || !startDateValue}
              className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-40"
            >
              Clear (use account creation date)
            </button>
          </div>
        ) : (
          <div className="text-sm text-white">
            {user?.paychecks_start_date
              ? moment(user.paychecks_start_date).format('MMM D, YYYY')
              : <span className="text-gray-400 italic">Not set · using account creation date ({moment(user?.created_at).format('MMM D, YYYY')})</span>}
          </div>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 p-3 rounded-lg border border-gray-700 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-400 block mb-1">Effective Date (when the new rate starts)</label>
            <CustomDatePicker
              name="effective_date"
              value={form.effective_date}
              onChange={e => setForm({ ...form, effective_date: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Pay Type</label>
            <CustomSelect
              name="pay_type"
              value={form.pay_type}
              onChange={e => setForm({ ...form, pay_type: e.target.value })}
              options={[
                { value: 'hourly', label: 'Hourly' },
                { value: 'salary', label: 'Salary' },
                { value: 'commission', label: 'Commission only' },
                { value: 'none', label: 'No paychecks' }
              ]}
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Tax Classification</label>
            <CustomSelect
              name="tax_classification"
              value={form.tax_classification}
              onChange={e => setForm({ ...form, tax_classification: e.target.value })}
              options={[
                { value: '1099', label: '1099' },
                { value: 'W2', label: 'W2' }
              ]}
            />
          </div>
          {form.pay_type === 'hourly' && (
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-400 block mb-1">Hourly Rate ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.hourly_rate}
                onChange={e => setForm({ ...form, hourly_rate: e.target.value })}
                className="w-full border rounded p-1.5 text-sm bg-gray-800 border-gray-600 text-white"
                required
              />
            </div>
          )}
          {form.pay_type === 'salary' && (
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-400 block mb-1">Annual Salary ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.salary_amount}
                onChange={e => setForm({ ...form, salary_amount: e.target.value })}
                className="w-full border rounded p-1.5 text-sm bg-gray-800 border-gray-600 text-white"
                required
              />
              <p className="text-[10px] text-gray-400 mt-1">Divided across pay periods (24 semi-monthly / biweekly afterward).</p>
            </div>
          )}
          {form.pay_type === 'commission' && (
            <div className="sm:col-span-2 text-xs text-pink-200 bg-pink-900/20 border border-pink-800 rounded p-2">
              Commission only: no scheduled paychecks will be auto-created. Admins add commission paychecks per event from the Paychecks tab.
            </div>
          )}
          {form.pay_type === 'none' && (
            <div className="sm:col-span-2 text-xs text-gray-300 bg-gray-800 border border-gray-700 rounded p-2">
              No paychecks: this user won't receive any scheduled paychecks. Bonuses can still be added manually.
            </div>
          )}
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-400 block mb-1">Note (optional)</label>
            <input
              type="text"
              value={form.note}
              onChange={e => setForm({ ...form, note: e.target.value })}
              placeholder="e.g. annual raise, switched to W2"
              className="w-full border rounded p-1.5 text-sm bg-gray-800 border-gray-600 text-white"
            />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(''); }}
              className="px-3 py-1.5 text-xs rounded border border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save pay change'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="animate-spin h-6 w-6 border-b-2 border-indigo-600 rounded-full"></div>
        </div>
      ) : (
        <div className="space-y-3">
          {current && (
            <div className="bg-gray-900 border border-indigo-700 rounded-lg p-3">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-indigo-300 font-semibold">Current</div>
                  <div className="text-sm text-white mt-1">
                    {formatRate(current)}
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded uppercase border border-gray-600 text-gray-300">{current.tax_classification || '1099'}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    Effective {moment(current.effective_date).format('MMM D, YYYY')}
                    {current.note ? ` · ${current.note}` : ''}
                  </div>
                </div>
              </div>
            </div>
          )}

          {future.length > 0 && (
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Scheduled (future)</div>
              <div className="space-y-2">
                {future.map(r => (
                  <RateRow key={r._id} rate={r} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          )}

          {past.length > 1 && (
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Past changes</div>
              <div className="space-y-2">
                {past.slice(1).map(r => (
                  <RateRow key={r._id} rate={r} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          )}

          {history.length === 0 && (
            <p className="text-sm text-gray-400 italic">No pay history yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

function formatRate(rate) {
  if (rate.pay_type === 'salary') {
    return <>${(rate.salary_amount || 0).toFixed(2)}/yr <span className="text-gray-400">(salary)</span></>;
  }
  if (rate.pay_type === 'commission') {
    return <span className="text-pink-300">Commission only</span>;
  }
  if (rate.pay_type === 'none') {
    return <span className="text-gray-400">No paychecks</span>;
  }
  return <>${(rate.hourly_rate || 0).toFixed(2)}/hr</>;
}

function RateRow({ rate, onDelete }) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 flex justify-between items-start gap-2">
      <div className="min-w-0">
        <div className="text-sm text-white">
          {formatRate(rate)}
          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded uppercase border border-gray-600 text-gray-300">{rate.tax_classification || '1099'}</span>
        </div>
        <div className="text-xs text-gray-400 mt-1">
          Effective {moment(rate.effective_date).format('MMM D, YYYY')}
          {rate.note ? ` · ${rate.note}` : ''}
          {rate.created_by?.username ? ` · by ${rate.created_by.username}` : ''}
        </div>
      </div>
      <button
        onClick={() => onDelete(rate)}
        className="text-red-400 hover:text-red-300 p-1 flex-shrink-0"
        title="Remove"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
