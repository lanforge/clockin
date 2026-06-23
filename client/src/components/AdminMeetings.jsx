import React, { useState, useEffect } from 'react';
import axios from 'axios';
import moment from 'moment';
import { Plus, Edit, Trash2, X, Video, MapPin, ExternalLink, Check, HelpCircle, Repeat } from 'lucide-react';
import CustomCheckbox from './CustomCheckbox';
import CustomSelect from './CustomSelect';
import CustomModal from './CustomModal';
import { useAuth } from '../contexts/AuthContext';
import { detectTz, tzAbbrev, formatInTz } from '../utils/datetime';

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' }
];

const RECURRENCE_LABELS = {
  none: 'One-time',
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly'
};

const emptyForm = {
  title: '',
  description: '',
  link: '',
  location: '',
  start_time: '',
  end_time: '',
  recurrence: 'none',
  recurrence_end_date: '',
  user_ids: [],
  invite_all: false
};

const statusBadge = {
  accepted: { label: 'Going', cls: 'bg-green-900/40 text-green-200 border-green-800', Icon: Check },
  declined: { label: 'Not Going', cls: 'bg-red-900/40 text-red-200 border-red-800', Icon: X },
  maybe: { label: 'Maybe', cls: 'bg-yellow-900/40 text-yellow-200 border-yellow-800', Icon: HelpCircle },
  pending: { label: 'No response', cls: 'bg-gray-700 text-gray-200 border-gray-600', Icon: HelpCircle }
};

export default function AdminMeetings({ users, onError }) {
  const { user } = useAuth();
  const adminTz = user?.timezone || detectTz();
  const adminAbbr = tzAbbrev(adminTz);

  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [modalConfig, setModalConfig] = useState({ isOpen: false });

  const closeModal = () => setModalConfig({ isOpen: false });

  const fetchMeetings = async () => {
    try {
      const res = await axios.get('/api/admin/meetings');
      if (res.data.success) setMeetings(res.data.data.meetings);
    } catch (err) {
      onError?.('Failed to load meetings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMeetings(); }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const toggleUser = (uid) => {
    setForm(f => ({
      ...f,
      user_ids: f.user_ids.includes(uid) ? f.user_ids.filter(u => u !== uid) : [...f.user_ids, uid]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.start_time) {
      onError?.('Title and start time are required');
      return;
    }
    if (!form.invite_all && form.user_ids.length === 0) {
      onError?.('Pick at least one attendee or invite all');
      return;
    }
    try {
      if (editingId) {
        const res = await axios.put(`/api/admin/meetings/${editingId}`, form);
        if (res.data.success) {
          resetForm();
          fetchMeetings();
        }
      } else {
        const res = await axios.post('/api/admin/meetings', form);
        if (res.data.success) {
          resetForm();
          fetchMeetings();
        }
      }
    } catch (err) {
      onError?.(err.response?.data?.error || 'Failed to save meeting');
    }
  };

  const handleEdit = (m) => {
    setForm({
      title: m.title,
      description: m.description || '',
      link: m.link || '',
      location: m.location || '',
      start_time: m.start_time ? moment(m.start_time).format('YYYY-MM-DDTHH:mm') : '',
      end_time: m.end_time ? moment(m.end_time).format('YYYY-MM-DDTHH:mm') : '',
      recurrence: m.recurrence || 'none',
      recurrence_end_date: m.recurrence_end_date ? moment(m.recurrence_end_date).format('YYYY-MM-DD') : '',
      user_ids: (m.attendees || []).map(a => a.user_id?._id || a.user_id).filter(Boolean).map(String),
      invite_all: false
    });
    setEditingId(m._id);
    setShowForm(true);
  };

  const handleDelete = (m) => {
    setModalConfig({
      isOpen: true,
      title: 'Delete Meeting',
      message: `Delete "${m.title}"?`,
      type: 'confirm',
      confirmText: 'Delete',
      onCancel: closeModal,
      onConfirm: async () => {
        closeModal();
        try {
          await axios.delete(`/api/admin/meetings/${m._id}`);
          fetchMeetings();
        } catch (err) {
          onError?.(err.response?.data?.error || 'Failed to delete meeting');
        }
      }
    });
  };

  if (loading) return <div className="text-gray-400">Loading meetings…</div>;

  return (
    <div className="space-y-6">
      <CustomModal {...modalConfig} />

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h3 className="text-lg font-semibold text-white">Meetings</h3>
        <button
          onClick={() => { if (showForm) resetForm(); else { setForm(emptyForm); setEditingId(null); setShowForm(true); } }}
          className="px-4 py-2 bg-indigo-600 text-white shadow-sm text-sm font-medium rounded-md hover:bg-indigo-700 inline-flex items-center justify-center"
        >
          {showForm ? <X size={16} className="mr-2" /> : <Plus size={16} className="mr-2" />}
          {showForm ? 'Cancel' : 'New Meeting'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 p-4 rounded-lg border border-gray-600 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-200">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-800 text-white p-2 focus:border-indigo-500 focus:ring-indigo-500"
              required
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-200">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              rows="2"
              className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-800 text-white p-2 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-200">Meeting link</label>
            <input
              type="url"
              value={form.link}
              onChange={e => setForm({ ...form, link: e.target.value })}
              placeholder="https://…"
              className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-800 text-white p-2 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-200">Location (optional)</label>
            <input
              type="text"
              value={form.location}
              onChange={e => setForm({ ...form, location: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-800 text-white p-2 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
          <div className="md:col-span-2 text-xs text-gray-400">
            Times are entered in your timezone ({adminAbbr || adminTz}). Each attendee sees the meeting in their own timezone with your time shown as a reference.
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-200">Start ({adminAbbr || adminTz})</label>
            <input
              type="datetime-local"
              value={form.start_time}
              onChange={e => setForm({ ...form, start_time: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-800 text-white p-2 focus:border-indigo-500 focus:ring-indigo-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-200">End ({adminAbbr || adminTz}, optional)</label>
            <input
              type="datetime-local"
              value={form.end_time}
              onChange={e => setForm({ ...form, end_time: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-800 text-white p-2 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">Repeats</label>
            <CustomSelect
              name="recurrence"
              value={form.recurrence}
              onChange={e => setForm({ ...form, recurrence: e.target.value })}
              options={RECURRENCE_OPTIONS}
            />
          </div>
          {form.recurrence !== 'none' && (
            <div>
              <label className="block text-sm font-medium text-gray-200">Repeat until (optional)</label>
              <input
                type="date"
                value={form.recurrence_end_date}
                onChange={e => setForm({ ...form, recurrence_end_date: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-800 text-white p-2 focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
          )}

          <div className="md:col-span-2 border-t border-gray-700 pt-3">
            <CustomCheckbox
              id="invite_all"
              checked={form.invite_all}
              onChange={e => setForm({ ...form, invite_all: e.target.checked, user_ids: e.target.checked ? [] : form.user_ids })}
              label="Invite all users"
            />
            {!form.invite_all && (
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-200 mb-2">Attendees</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-gray-800 rounded-md border border-gray-700">
                  {users.map(u => (
                    <label key={u._id} className="flex items-center space-x-2 text-sm text-gray-200 cursor-pointer hover:bg-gray-700 px-2 py-1 rounded">
                      <input
                        type="checkbox"
                        checked={form.user_ids.includes(u._id)}
                        onChange={() => toggleUser(u._id)}
                        className="accent-indigo-600"
                      />
                      <span>{u.username}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="md:col-span-2 flex justify-end space-x-3 mt-2">
            <button type="button" onClick={resetForm} className="px-4 py-2 border border-gray-600 text-sm rounded-md text-gray-200 bg-gray-800 hover:bg-gray-900">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-sm rounded-md text-white hover:bg-indigo-700">
              {editingId ? 'Save Changes' : 'Create Meeting'}
            </button>
          </div>
        </form>
      )}

      {meetings.length === 0 ? (
        <p className="text-gray-400">No meetings yet.</p>
      ) : (
        <div className="space-y-4">
          {meetings.map(m => (
            <div key={m._id} className="border border-gray-700 rounded-lg p-4 bg-gray-800">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-white flex items-center">
                    <Video className="mr-2 text-purple-400" size={16} />
                    {m.title}
                  </h4>
                  <div className="mt-1 text-sm text-gray-300 flex flex-wrap items-center gap-2">
                    <span>{formatInTz(m.start_time, m.organizer_timezone || adminTz)}</span>
                    {m.recurrence && m.recurrence !== 'none' && (
                      <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-indigo-900/50 text-indigo-200 border border-indigo-800">
                        <Repeat size={12} className="mr-1" />
                        {RECURRENCE_LABELS[m.recurrence] || m.recurrence}
                        {m.recurrence_end_date && ` · until ${moment.utc(m.recurrence_end_date).format('MMM D, YYYY')}`}
                      </span>
                    )}
                  </div>
                  {m.description && <p className="mt-2 text-sm text-gray-400 whitespace-pre-wrap">{m.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-3 text-sm">
                    {m.link && (
                      <a href={m.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-indigo-400 hover:text-indigo-300">
                        <ExternalLink size={14} className="mr-1" /> {m.link}
                      </a>
                    )}
                    {m.location && (
                      <span className="inline-flex items-center text-gray-400"><MapPin size={14} className="mr-1" /> {m.location}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(m)} className="p-2 text-indigo-400 hover:text-indigo-300"><Edit size={16} /></button>
                  <button onClick={() => handleDelete(m)} className="p-2 text-red-400 hover:text-red-300"><Trash2 size={16} /></button>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-700">
                <p className="text-xs text-gray-400 mb-2">Attendees ({m.attendees?.length || 0})</p>
                <div className="flex flex-wrap gap-2">
                  {(m.attendees || []).map((a, idx) => {
                    const badge = statusBadge[a.status] || statusBadge.pending;
                    const Icon = badge.Icon;
                    const name = a.user_id?.username || 'Unknown';
                    return (
                      <span key={idx} className={`inline-flex items-center text-xs px-2 py-1 rounded-full border ${badge.cls}`}>
                        <Icon size={12} className="mr-1" />
                        {name} · {badge.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
