import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Users, Megaphone, HelpCircle, UserPlus, Plus, Settings, AlertCircle, Edit, Trash2, Key } from 'lucide-react';
import moment from 'moment';
import CustomModal from '../components/CustomModal';
import CustomSelect from '../components/CustomSelect';
import CustomCheckbox from '../components/CustomCheckbox';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // New user form state
  const [newUser, setNewUser] = useState({ 
    username: '', email: '', role: 'employee', hourly_rate: 0, 
    companies: {
      lanforge: { active: true, title: 'Employee', level: 3 },
      ascendance: { active: false, title: 'Employee', level: 3 }
    }
  });
  const [showNewUserForm, setShowNewUserForm] = useState(false);

  // Announcement form state
  const defaultAnnouncement = { title: '', content: '', type: 'info', is_active: true };
  const [announcementForm, setAnnouncementForm] = useState(defaultAnnouncement);
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState(null);

  // Modal state
  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: '', message: '', type: 'confirm', onConfirm: null, onCancel: null, confirmText: 'Confirm' });

  const closeModal = () => setModalConfig({ ...modalConfig, isOpen: false });

  const fetchUsers = async () => {
    try {
      const res = await axios.get('/api/admin');
      if (res.data.success) {
        setUsers(res.data.data.users);
      }
    } catch (err) {
      setError('Failed to load users');
    }
  };

  const fetchAnnouncements = async () => {
    try {
      const res = await axios.get('/api/admin/announcements');
      if (res.data.success) {
        setAnnouncements(res.data.data.announcements);
      }
    } catch (err) {
      setError('Failed to load announcements');
    }
  };

  const fetchInquiries = async () => {
    try {
      const res = await axios.get('/api/admin/help-inquiries');
      if (res.data.success) {
        setInquiries(res.data.data.inquiries);
      }
    } catch (err) {
      setError('Failed to load inquiries');
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchUsers(), fetchAnnouncements(), fetchInquiries()]);
      setLoading(false);
    };
    loadData();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUser.username) {
      setError('Username is required');
      return;
    }
    try {
      const res = await axios.post('/api/admin/create-user', newUser);
      if (res.data.success) {
        setShowNewUserForm(false);
        setNewUser({ 
          username: '', email: '', role: 'employee', hourly_rate: 0, 
          companies: {
            lanforge: { active: true, title: 'Employee', level: 3 },
            ascendance: { active: false, title: 'Employee', level: 3 }
          }
        });
        fetchUsers();
        if (res.data.temporaryPassword) {
          setModalConfig({
            isOpen: true,
            title: 'User Created',
            message: `User created successfully! Temporary password: ${res.data.temporaryPassword}\n\nThe user will be prompted to change this upon first login.`,
            type: 'success',
            onCancel: closeModal
          });
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user');
    }
  };

  const handleDeleteUser = (userId) => {
    setModalConfig({
      isOpen: true,
      title: 'Delete User',
      message: 'Are you sure you want to delete this user? All their time entries will also be deleted.',
      type: 'confirm',
      confirmText: 'Delete',
      onCancel: closeModal,
      onConfirm: async () => {
        closeModal();
        try {
          const res = await axios.post('/api/admin/delete-user', { userId });
          if (res.data.success) {
            fetchUsers();
          }
        } catch (err) {
          setError(err.response?.data?.error || 'Failed to delete user');
        }
      }
    });
  };

  const handleResetPassword = (userId) => {
    setModalConfig({
      isOpen: true,
      title: 'Reset Password',
      message: 'Are you sure you want to reset this user\'s password?',
      type: 'confirm',
      confirmText: 'Reset',
      onCancel: closeModal,
      onConfirm: async () => {
        closeModal();
        try {
          const res = await axios.post('/api/admin/reset-password', { userId });
          if (res.data.success) {
            setModalConfig({
              isOpen: true,
              title: 'Password Reset',
              message: `Success! ${res.data.message}`,
              type: 'success',
              onCancel: closeModal
            });
          }
        } catch (err) {
          setError(err.response?.data?.error || 'Failed to reset password');
        }
      }
    });
  };

  const handleSaveAnnouncement = async (e) => {
    e.preventDefault();
    if (!announcementForm.title || !announcementForm.content) {
      setError('Title and content are required');
      return;
    }
    try {
      if (editingAnnouncementId) {
        const res = await axios.put(`/api/announcements/${editingAnnouncementId}`, announcementForm);
        if (res.data.success) {
          setShowAnnouncementForm(false);
          setAnnouncementForm(defaultAnnouncement);
          setEditingAnnouncementId(null);
          fetchAnnouncements();
        }
      } else {
        const res = await axios.post('/api/announcements', announcementForm);
        if (res.data.success) {
          setShowAnnouncementForm(false);
          setAnnouncementForm(defaultAnnouncement);
          fetchAnnouncements();
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save announcement');
    }
  };

  const handleEditAnnouncement = (ann) => {
    setAnnouncementForm({
      title: ann.title,
      content: ann.content,
      type: ann.type,
      is_active: ann.is_active
    });
    setEditingAnnouncementId(ann._id);
    setShowAnnouncementForm(true);
  };

  const handleDeleteAnnouncement = (id) => {
    setModalConfig({
      isOpen: true,
      title: 'Delete Announcement',
      message: 'Are you sure you want to delete this announcement?',
      type: 'confirm',
      confirmText: 'Delete',
      onCancel: closeModal,
      onConfirm: async () => {
        closeModal();
        try {
          const res = await axios.delete(`/api/announcements/${id}`);
          if (res.data.success) {
            fetchAnnouncements();
          }
        } catch (err) {
          setError(err.response?.data?.error || 'Failed to delete announcement');
        }
      }
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <CustomModal 
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        onConfirm={modalConfig.onConfirm}
        onCancel={modalConfig.onCancel}
        confirmText={modalConfig.confirmText}
      />

      <div className="bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-700 flex items-center space-x-3">
        <Settings className="text-indigo-600" size={28} />
        <div>
          <h2 className="text-2xl font-bold text-white">Admin Dashboard</h2>
          <p className="text-gray-400 text-sm">Manage users, announcements, and inquiries</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/50 border-l-4 border-red-400 p-4 rounded-md flex items-start">
          <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 mr-3" />
          <p className="text-sm text-red-200">{error}</p>
          <button onClick={() => setError('')} className="ml-auto text-red-400">
            &times;
          </button>
        </div>
      )}

      <div className="bg-gray-800 rounded-xl shadow-sm border border-gray-700 overflow-hidden">
        <div className="flex border-b border-gray-700 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === 'users' ? 'border-b-2 border-indigo-600 text-indigo-600 bg-indigo-900/50' : 'text-gray-400 hover:bg-gray-900'
            }`}
          >
            <Users className="mr-2" size={18} />
            Users
          </button>
          <button
            onClick={() => setActiveTab('announcements')}
            className={`flex items-center px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === 'announcements' ? 'border-b-2 border-indigo-600 text-indigo-600 bg-indigo-900/50' : 'text-gray-400 hover:bg-gray-900'
            }`}
          >
            <Megaphone className="mr-2" size={18} />
            Announcements
          </button>
          <button
            onClick={() => setActiveTab('inquiries')}
            className={`flex items-center px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === 'inquiries' ? 'border-b-2 border-indigo-600 text-indigo-600 bg-indigo-900/50' : 'text-gray-400 hover:bg-gray-900'
            }`}
          >
            <HelpCircle className="mr-2" size={18} />
            Help Inquiries
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <h3 className="text-lg font-semibold text-white">User Management</h3>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <a href="/api/admin/export" className="px-4 py-2 border border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-200 bg-gray-800 hover:bg-gray-900 text-center">
                    Export Timesheets
                  </a>
                  <button 
                    onClick={() => setShowNewUserForm(!showNewUserForm)}
                    className="px-4 py-2 bg-indigo-600 text-white shadow-sm text-sm font-medium rounded-md hover:bg-indigo-700 flex items-center justify-center inline-flex"
                  >
                    <UserPlus size={16} className="mr-2" />
                    New User
                  </button>
                </div>
              </div>

              {showNewUserForm && (
                <form onSubmit={handleCreateUser} className="bg-gray-900 p-4 rounded-lg border border-gray-600 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-200">Username</label>
                    <input type="text" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} className="mt-1 block w-full rounded-md border-gray-600 shadow-sm p-2 border focus:border-indigo-500 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-200">Email</label>
                    <input type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} className="mt-1 block w-full rounded-md border-gray-600 shadow-sm p-2 border focus:border-indigo-500 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-200">Hourly Pay Rate ($)</label>
                    <input type="number" step="0.01" min="0" value={newUser.hourly_rate} onChange={e => setNewUser({...newUser, hourly_rate: parseFloat(e.target.value)})} className="mt-1 block w-full rounded-md border-gray-600 shadow-sm p-2 border focus:border-indigo-500 focus:ring-indigo-500 bg-gray-800 text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-200 mb-1">App Role</label>
                    <CustomSelect 
                      name="role"
                      value={newUser.role} 
                      onChange={e => setNewUser({...newUser, role: e.target.value})}
                      options={[
                        { value: 'employee', label: 'Employee' },
                        { value: 'admin', label: 'Admin' }
                      ]}
                    />
                  </div>
                  
                  {/* LANForge Section */}
                  <div className="col-span-1 md:col-span-2 border-t border-gray-600 pt-3 mt-1">
                    <CustomCheckbox
                      id="lanforge_active"
                      checked={newUser.companies.lanforge.active}
                      onChange={e => setNewUser({...newUser, companies: {...newUser.companies, lanforge: {...newUser.companies.lanforge, active: e.target.checked}}})}
                      label="Enable LANForge Profile"
                    />
                    {newUser.companies.lanforge.active && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6">
                        <div>
                          <label className="block text-xs text-gray-400">LANForge Title</label>
                          <input type="text" value={newUser.companies.lanforge.title} onChange={e => setNewUser({...newUser, companies: {...newUser.companies, lanforge: {...newUser.companies.lanforge, title: e.target.value}}})} className="mt-1 block w-full rounded-md border-gray-600 shadow-sm p-1.5 border bg-gray-800 text-sm focus:border-indigo-500 focus:ring-indigo-500" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400">LANForge Level</label>
                          <input type="number" min="1" max="5" value={newUser.companies.lanforge.level} onChange={e => setNewUser({...newUser, companies: {...newUser.companies, lanforge: {...newUser.companies.lanforge, level: parseInt(e.target.value)}}})} className="mt-1 block w-full rounded-md border-gray-600 shadow-sm p-1.5 border bg-gray-800 text-sm focus:border-indigo-500 focus:ring-indigo-500" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Ascendance Section */}
                  <div className="col-span-1 md:col-span-2 border-t border-gray-600 pt-3 mt-1">
                    <CustomCheckbox
                      id="ascendance_active"
                      checked={newUser.companies.ascendance.active}
                      onChange={e => setNewUser({...newUser, companies: {...newUser.companies, ascendance: {...newUser.companies.ascendance, active: e.target.checked}}})}
                      label="Enable Ascendance Profile"
                    />
                    {newUser.companies.ascendance.active && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6">
                        <div>
                          <label className="block text-xs text-gray-400">Ascendance Title</label>
                          <input type="text" value={newUser.companies.ascendance.title} onChange={e => setNewUser({...newUser, companies: {...newUser.companies, ascendance: {...newUser.companies.ascendance, title: e.target.value}}})} className="mt-1 block w-full rounded-md border-gray-600 shadow-sm p-1.5 border bg-gray-800 text-sm focus:border-indigo-500 focus:ring-indigo-500" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400">Ascendance Level</label>
                          <input type="number" min="1" max="5" value={newUser.companies.ascendance.level} onChange={e => setNewUser({...newUser, companies: {...newUser.companies, ascendance: {...newUser.companies.ascendance, level: parseInt(e.target.value)}}})} className="mt-1 block w-full rounded-md border-gray-600 shadow-sm p-1.5 border bg-gray-800 text-sm focus:border-indigo-500 focus:ring-indigo-500" />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="md:col-span-2 flex justify-end space-x-3 mt-2">
                    <button type="button" onClick={() => setShowNewUserForm(false)} className="px-4 py-2 border border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-200 bg-gray-800 hover:bg-gray-900">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-indigo-600 border border-transparent shadow-sm text-sm font-medium rounded-md text-white hover:bg-indigo-700">Create User</button>
                  </div>
                </form>
              )}

              <div className="overflow-x-auto ring-1 ring-gray-700 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-900">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Role</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Total Hours</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-gray-800 divide-y divide-gray-200">
                    {users.map(u => (
                      <tr key={u._id} className="hover:bg-gray-900">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                              {u.username.charAt(0).toUpperCase()}
                            </div>
                            <div className="ml-4">
                              <Link to={`/admin/user/${u._id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-100">{u.username}</Link>
                              <div className="text-sm text-gray-400">{u.email || 'No email'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            u.role === 'admin' ? 'bg-purple-900/50 text-purple-200' : 'bg-green-900/50 text-green-200'
                          }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                          {u.total_hours?.toFixed(2) || '0.00'} hrs ({u.total_entries || 0} entries)
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end space-x-2">
                            <button title="Reset Password" onClick={() => handleResetPassword(u._id)} className="text-yellow-600 hover:text-yellow-900">
                              <Key size={18} />
                            </button>
                            {u.username !== 'admin' && (
                              <button title="Delete User" onClick={() => handleDeleteUser(u._id)} className="text-red-300 hover:text-red-900">
                                <Trash2 size={18} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'announcements' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <h3 className="text-lg font-semibold text-white">Announcements</h3>
                <button 
                  onClick={() => {
                    setAnnouncementForm(defaultAnnouncement);
                    setEditingAnnouncementId(null);
                    setShowAnnouncementForm(!showAnnouncementForm);
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white shadow-sm text-sm font-medium rounded-md hover:bg-indigo-700 flex items-center justify-center inline-flex"
                >
                  <Plus size={16} className="mr-2" />
                  New Announcement
                </button>
              </div>

              {showAnnouncementForm && (
                <form onSubmit={handleSaveAnnouncement} className="bg-gray-900 p-4 rounded-lg border border-gray-600 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-200">Title</label>
                    <input type="text" value={announcementForm.title} onChange={e => setAnnouncementForm({...announcementForm, title: e.target.value})} className="mt-1 block w-full rounded-md border-gray-600 shadow-sm p-2 border bg-gray-800 text-white focus:border-indigo-500 focus:ring-indigo-500" required />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-200">Content</label>
                    <textarea value={announcementForm.content} onChange={e => setAnnouncementForm({...announcementForm, content: e.target.value})} rows="3" className="mt-1 block w-full rounded-md border-gray-600 shadow-sm p-2 border bg-gray-800 text-white focus:border-indigo-500 focus:ring-indigo-500" required></textarea>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-200 mb-1">Type</label>
                    <CustomSelect 
                      name="type"
                      value={announcementForm.type} 
                      onChange={e => setAnnouncementForm({...announcementForm, type: e.target.value})}
                      options={[
                        { value: 'info', label: 'Info' },
                        { value: 'success', label: 'Success' },
                        { value: 'warning', label: 'Warning' },
                        { value: 'urgent', label: 'Urgent' }
                      ]}
                    />
                  </div>
                  <div className="flex items-center pt-6">
                    <CustomCheckbox
                      id="is_active"
                      checked={announcementForm.is_active}
                      onChange={e => setAnnouncementForm({...announcementForm, is_active: e.target.checked})}
                      label="Active (Visible to users)"
                    />
                  </div>
                  <div className="md:col-span-2 flex justify-end space-x-3 mt-2">
                    <button type="button" onClick={() => {
                      setShowAnnouncementForm(false);
                      setAnnouncementForm(defaultAnnouncement);
                      setEditingAnnouncementId(null);
                    }} className="px-4 py-2 border border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-200 bg-gray-800 hover:bg-gray-900">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-indigo-600 border border-transparent shadow-sm text-sm font-medium rounded-md text-white hover:bg-indigo-700">
                      {editingAnnouncementId ? 'Update' : 'Create'} Announcement
                    </button>
                  </div>
                </form>
              )}
              
              <div className="space-y-4">
                {announcements.length === 0 ? (
                  <p className="text-gray-400">No announcements found.</p>
                ) : announcements.map(ann => (
                  <div key={ann._id} className={`border rounded-lg p-4 ${
                    ann.type === 'urgent' ? 'border-red-800 bg-red-900/20' :
                    ann.type === 'warning' ? 'border-yellow-800 bg-yellow-900/20' :
                    ann.type === 'success' ? 'border-green-800 bg-green-900/20' :
                    'border-gray-600 bg-gray-800'
                  }`}>
                    <div className="flex justify-between items-start">
                      <h4 className="font-bold text-white flex items-center">
                        {ann.title}
                        <span className={`ml-3 px-2 py-0.5 text-xs rounded-full ${ann.is_active ? 'bg-green-900/50 text-green-200 border border-green-800' : 'bg-gray-700 text-gray-300 border border-gray-600'}`}>
                          {ann.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </h4>
                      <div className="flex space-x-2">
                        <button onClick={() => handleEditAnnouncement(ann)} className="text-indigo-400 hover:text-indigo-300 p-1">
                          <Edit size={16} />
                        </button>
                        <button onClick={() => handleDeleteAnnouncement(ann._id)} className="text-red-400 hover:text-red-300 p-1">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-gray-300 whitespace-pre-wrap">{ann.content}</p>
                    <div className="mt-3 text-xs text-gray-400 flex items-center space-x-4">
                      <span>Type: <span className="capitalize">{ann.type}</span></span>
                      <span>Created: {moment(ann.created_at).format('MMM D, YYYY')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'inquiries' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-white">Help Inquiries</h3>
              <div className="space-y-4">
                {inquiries.length === 0 ? (
                  <p className="text-gray-400">No inquiries found.</p>
                ) : inquiries.map(inq => (
                  <div key={inq._id} className="border border-gray-600 rounded-lg p-4 bg-gray-800">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className={`inline-block px-2 py-1 text-xs rounded-full mb-2 mr-2 ${
                          inq.urgency === 'high' ? 'bg-red-900/50 text-red-800' :
                          inq.urgency === 'medium' ? 'bg-yellow-900/50 text-yellow-200' : 'bg-blue-900/50 text-blue-200'
                        }`}>
                          {inq.urgency}
                        </span>
                        <span className="inline-block px-2 py-1 text-xs rounded-full bg-gray-700 text-gray-200 mb-2">
                          Status: {inq.status}
                        </span>
                        <h4 className="font-bold text-white">{inq.subject}</h4>
                      </div>
                      <span className="text-xs text-gray-400">{moment(inq.created_at).fromNow()}</span>
                    </div>
                    <p className="mt-2 text-sm text-gray-300">{inq.details}</p>
                    <div className="mt-3 text-xs text-gray-400 border-t border-gray-700 pt-2">
                      Submitted by: {inq.is_anonymous ? 'Anonymous' : (inq.submitter_name || inq.username || 'Unknown')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
