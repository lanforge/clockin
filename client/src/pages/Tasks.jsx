import React, { useState, useEffect } from 'react';
import axios from 'axios';
import moment from 'moment';
import { CheckSquare, Square, Plus, Edit, Trash2, AlertCircle, ShieldAlert, Calendar as CalendarIcon, X } from 'lucide-react';
import CustomDatePicker from '../components/CustomDatePicker';
import CustomSelect from '../components/CustomSelect';
import CustomModal from '../components/CustomModal';
import { useAuth } from '../contexts/AuthContext';
import { formatDueDate, isDueDateOverdue, detectTz } from '../utils/datetime';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' }
];

const emptyForm = { title: '', description: '', due_date: '' };

export default function Tasks() {
  const { user } = useAuth();
  const viewerTz = user?.timezone || detectTz();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [modalConfig, setModalConfig] = useState({ isOpen: false });

  const closeModal = () => setModalConfig({ isOpen: false });

  const fetchTasks = async () => {
    try {
      const res = await axios.get('/api/tasks');
      if (res.data.success) setTasks(res.data.data.tasks);
    } catch (err) {
      setError('Failed to load tasks');
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    try {
      if (editingId) {
        const res = await axios.put(`/api/tasks/${editingId}`, form);
        if (res.data.success) {
          resetForm();
          fetchTasks();
        }
      } else {
        const res = await axios.post('/api/tasks', form);
        if (res.data.success) {
          resetForm();
          fetchTasks();
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save task');
    }
  };

  const handleEdit = (task) => {
    setForm({
      title: task.title,
      description: task.description || '',
      due_date: task.due_date ? moment.utc(task.due_date).format('YYYY-MM-DD') : ''
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
          await axios.delete(`/api/tasks/${task._id}`);
          fetchTasks();
        } catch (err) {
          setError(err.response?.data?.error || 'Failed to delete task');
        }
      }
    });
  };

  const handleStatusChange = async (task, status) => {
    try {
      await axios.put(`/api/tasks/${task._id}`, { status });
      fetchTasks();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update task');
    }
  };

  const toggleComplete = (task) => {
    handleStatusChange(task, task.status === 'completed' ? 'pending' : 'completed');
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const open = tasks.filter(t => t.status !== 'completed');
  const done = tasks.filter(t => t.status === 'completed');

  const TaskCard = ({ task }) => {
    const locked = task.is_admin_created;
    const overdue = task.status !== 'completed' && isDueDateOverdue(task.due_date, viewerTz);
    return (
      <div className={`border rounded-lg p-4 bg-gray-800 ${overdue ? 'border-red-700' : 'border-gray-700'}`}>
        <div className="flex items-start gap-3">
          <button
            onClick={() => toggleComplete(task)}
            className="mt-0.5 text-gray-400 hover:text-indigo-400 transition-colors"
            title={task.status === 'completed' ? 'Reopen' : 'Mark complete'}
          >
            {task.status === 'completed'
              ? <CheckSquare className="text-green-500" size={22} />
              : <Square size={22} />}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-2">
              <h4 className={`font-semibold ${task.status === 'completed' ? 'text-gray-500 line-through' : 'text-white'}`}>
                {task.title}
              </h4>
              {locked && (
                <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-200 border border-purple-800">
                  <ShieldAlert size={12} className="mr-1" /> Admin
                </span>
              )}
              {task.due_date && (
                <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border ${
                  overdue ? 'bg-red-900/40 text-red-200 border-red-800' : 'bg-gray-700 text-gray-200 border-gray-600'
                }`}>
                  <CalendarIcon size={12} className="mr-1" />
                  Due {formatDueDate(task.due_date)}
                </span>
              )}
            </div>
            {task.description && (
              <p className="mt-1 text-sm text-gray-300 whitespace-pre-wrap">{task.description}</p>
            )}
            <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
              <span>Created {moment(task.created_at).fromNow()}</span>
              {locked && task.created_by?.username && (
                <span>by {task.created_by.username}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <div className="w-32 hidden sm:block">
              <CustomSelect
                name="status"
                value={task.status}
                onChange={(e) => handleStatusChange(task, e.target.value)}
                options={STATUS_OPTIONS}
              />
            </div>
            {!locked && (
              <button onClick={() => handleEdit(task)} className="p-2 text-indigo-400 hover:text-indigo-300" title="Edit">
                <Edit size={16} />
              </button>
            )}
            {!locked && (
              <button onClick={() => handleDelete(task)} className="p-2 text-red-400 hover:text-red-300" title="Delete">
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-700 sm:hidden">
          <label className="block text-xs text-gray-400 mb-1">Status</label>
          <CustomSelect
            name="status"
            value={task.status}
            onChange={(e) => handleStatusChange(task, e.target.value)}
            options={STATUS_OPTIONS}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <CustomModal {...modalConfig} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-700">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Tasks</h2>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">Track your work and follow admin-assigned items</p>
        </div>
        <button
          onClick={() => {
            if (showForm) { resetForm(); } else { setForm(emptyForm); setEditingId(null); setShowForm(true); }
          }}
          className="mt-4 sm:mt-0 px-4 py-2 bg-indigo-600 text-white shadow-sm text-sm font-medium rounded-md hover:bg-indigo-700 inline-flex items-center justify-center"
        >
          {showForm ? <X size={16} className="mr-2" /> : <Plus size={16} className="mr-2" />}
          {showForm ? 'Cancel' : 'New Task'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/50 border-l-4 border-red-400 p-4 rounded-md flex items-start">
          <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 mr-3" />
          <p className="text-sm text-red-200 flex-1">{error}</p>
          <button onClick={() => setError('')} className="text-red-400">&times;</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 p-4 rounded-lg border border-gray-700 grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <label className="block text-sm font-medium text-gray-200 mb-1">Due Date (optional)</label>
            <CustomDatePicker
              name="due_date"
              value={form.due_date}
              onChange={e => setForm({ ...form, due_date: e.target.value })}
            />
          </div>
          <div className="md:col-span-2 flex justify-end space-x-3 mt-2">
            <button type="button" onClick={resetForm} className="px-4 py-2 border border-gray-600 text-sm rounded-md text-gray-200 bg-gray-800 hover:bg-gray-900">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-sm rounded-md text-white hover:bg-indigo-700">
              {editingId ? 'Save Changes' : 'Add Task'}
            </button>
          </div>
        </form>
      )}

      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Open ({open.length})</h3>
        {open.length === 0 ? (
          <p className="text-gray-400 text-center py-6 bg-gray-900 rounded-lg border border-dashed border-gray-600">
            Nothing on your list. Add a task to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {open.map(t => <TaskCard key={t._id} task={t} />)}
          </div>
        )}
      </div>

      {done.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3">Completed ({done.length})</h3>
          <div className="space-y-3">
            {done.map(t => <TaskCard key={t._id} task={t} />)}
          </div>
        </div>
      )}
    </div>
  );
}
