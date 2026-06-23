import React, { useState, useEffect } from 'react';
import axios from 'axios';
import moment from 'moment';
import { Plus, Edit, Trash2, X, Users as UsersIcon, ShieldAlert } from 'lucide-react';
import CustomDatePicker from './CustomDatePicker';
import CustomSelect from './CustomSelect';
import CustomCheckbox from './CustomCheckbox';
import CustomModal from './CustomModal';
import { formatDueDate } from '../utils/datetime';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' }
];

const emptyForm = { title: '', description: '', due_date: '', user_ids: [], assign_to_all: false };

export default function AdminTasks({ users, onError }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [filterUser, setFilterUser] = useState('all');
  const [modalConfig, setModalConfig] = useState({ isOpen: false });

  const closeModal = () => setModalConfig({ isOpen: false });

  const fetchTasks = async () => {
    try {
      const res = await axios.get('/api/admin/tasks');
      if (res.data.success) setTasks(res.data.data.tasks);
    } catch (err) {
      onError?.('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTasks(); }, []);

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
    if (!form.title.trim()) {
      onError?.('Title is required');
      return;
    }
    try {
      if (editingId) {
        const res = await axios.put(`/api/admin/tasks/${editingId}`, {
          title: form.title,
          description: form.description,
          due_date: form.due_date
        });
        if (res.data.success) {
          resetForm();
          fetchTasks();
        }
      } else {
        if (!form.assign_to_all && form.user_ids.length === 0) {
          onError?.('Pick at least one user or assign to all');
          return;
        }
        const res = await axios.post('/api/admin/tasks', form);
        if (res.data.success) {
          resetForm();
          fetchTasks();
        }
      }
    } catch (err) {
      onError?.(err.response?.data?.error || 'Failed to save task');
    }
  };

  const handleEdit = (task) => {
    setForm({
      title: task.title,
      description: task.description || '',
      due_date: task.due_date ? moment.utc(task.due_date).format('YYYY-MM-DD') : '',
      user_ids: [],
      assign_to_all: false
    });
    setEditingId(task._id);
    setShowForm(true);
  };

  const handleDelete = (task) => {
    setModalConfig({
      isOpen: true,
      title: 'Delete Task',
      message: `Delete "${task.title}"?`,
      type: 'confirm',
      confirmText: 'Delete',
      onCancel: closeModal,
      onConfirm: async () => {
        closeModal();
        try {
          await axios.delete(`/api/admin/tasks/${task._id}`);
          fetchTasks();
        } catch (err) {
          onError?.(err.response?.data?.error || 'Failed to delete task');
        }
      }
    });
  };

  const handleStatusChange = async (task, status) => {
    try {
      await axios.put(`/api/admin/tasks/${task._id}`, { status });
      fetchTasks();
    } catch (err) {
      onError?.(err.response?.data?.error || 'Failed to update task');
    }
  };

  const filteredTasks = filterUser === 'all'
    ? tasks
    : tasks.filter(t => t.user_id?._id === filterUser);

  if (loading) {
    return <div className="text-gray-400">Loading tasks…</div>;
  }

  const userOptions = [
    { value: 'all', label: 'All users' },
    ...users.map(u => ({ value: u._id, label: u.username }))
  ];

  return (
    <div className="space-y-6">
      <CustomModal {...modalConfig} />

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h3 className="text-lg font-semibold text-white">Task Management</h3>
        <button
          onClick={() => { if (showForm) resetForm(); else { setForm(emptyForm); setEditingId(null); setShowForm(true); } }}
          className="px-4 py-2 bg-indigo-600 text-white shadow-sm text-sm font-medium rounded-md hover:bg-indigo-700 inline-flex items-center justify-center"
        >
          {showForm ? <X size={16} className="mr-2" /> : <Plus size={16} className="mr-2" />}
          {showForm ? 'Cancel' : 'New Task'}
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
              rows="3"
              className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-800 text-white p-2 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">Due Date</label>
            <CustomDatePicker
              name="due_date"
              value={form.due_date}
              onChange={e => setForm({ ...form, due_date: e.target.value })}
            />
          </div>
          {!editingId && (
            <div className="md:col-span-2 border-t border-gray-700 pt-3">
              <CustomCheckbox
                id="assign_to_all"
                checked={form.assign_to_all}
                onChange={e => setForm({ ...form, assign_to_all: e.target.checked, user_ids: e.target.checked ? [] : form.user_ids })}
                label="Assign to all users"
              />
              {!form.assign_to_all && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-200 mb-2">Pick users</label>
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
          )}
          <div className="md:col-span-2 flex justify-end space-x-3 mt-2">
            <button type="button" onClick={resetForm} className="px-4 py-2 border border-gray-600 text-sm rounded-md text-gray-200 bg-gray-800 hover:bg-gray-900">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-sm rounded-md text-white hover:bg-indigo-700">
              {editingId ? 'Save Changes' : 'Create Task(s)'}
            </button>
          </div>
        </form>
      )}

      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400">Filter:</span>
        <div className="w-56">
          <CustomSelect
            name="filterUser"
            value={filterUser}
            onChange={e => setFilterUser(e.target.value)}
            options={userOptions}
          />
        </div>
      </div>

      {filteredTasks.length === 0 ? (
        <p className="text-gray-400">No tasks found.</p>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map(task => (
            <div key={task._id} className="border border-gray-700 rounded-lg p-4 bg-gray-800">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2">
                    <h4 className={`font-semibold ${task.status === 'completed' ? 'text-gray-500 line-through' : 'text-white'}`}>
                      {task.title}
                    </h4>
                    {task.is_admin_created && (
                      <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-200 border border-purple-800">
                        <ShieldAlert size={12} className="mr-1" /> Admin
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-gray-300 flex flex-wrap gap-3">
                    <span className="inline-flex items-center"><UsersIcon size={14} className="mr-1 text-gray-400" />{task.user_id?.username || 'Unknown'}</span>
                    {task.due_date && <span>Due {formatDueDate(task.due_date)}</span>}
                    <span className="text-gray-500">Created {moment(task.created_at).fromNow()}</span>
                  </div>
                  {task.description && <p className="mt-2 text-sm text-gray-400 whitespace-pre-wrap">{task.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-36">
                    <CustomSelect
                      name="status"
                      value={task.status}
                      onChange={(e) => handleStatusChange(task, e.target.value)}
                      options={STATUS_OPTIONS}
                    />
                  </div>
                  <button onClick={() => handleEdit(task)} className="p-2 text-indigo-400 hover:text-indigo-300"><Edit size={16} /></button>
                  <button onClick={() => handleDelete(task)} className="p-2 text-red-400 hover:text-red-300"><Trash2 size={16} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
