import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, Link } from 'react-router-dom';
import moment from 'moment';
import { ArrowLeft, Edit2, Clock, Trash2, Save, X } from 'lucide-react';
import CustomModal from '../components/CustomModal';
import CustomSelect from '../components/CustomSelect';
import CustomCheckbox from '../components/CustomCheckbox';
import CustomDatePicker from '../components/CustomDatePicker';

export default function AdminUser() {
  const { id } = useParams();
  const [userData, setUserData] = useState(null);
  const [timeEntries, setTimeEntries] = useState([]);
  const [yearPayPeriods, setYearPayPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Edit user state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  // Add time state
  const [addTimeForm, setAddTimeForm] = useState({ date: moment().format('YYYY-MM-DD'), hours: 0, minutes: 0 });

  // Modal state
  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: '', message: '', type: 'confirm', onConfirm: null });

  const closeModal = () => setModalConfig({ ...modalConfig, isOpen: false });

  const fetchUserData = async () => {
    try {
      const res = await axios.get(`/api/admin/user/${id}`);
      if (res.data.success) {
        setUserData(res.data.data.userData);
        setTimeEntries(res.data.data.timeEntries);
        setYearPayPeriods(res.data.data.yearPayPeriods || []);
        let user = JSON.parse(JSON.stringify(res.data.data.userData));
        if (!user.companies) {
          user.companies = {
            lanforge: { active: user.company === 'LANForge', title: user.title || 'Employee', level: user.company_level || 3 },
            ascendance: { active: user.company === 'Ascendance', title: user.title || 'Employee', level: user.company_level || 3 }
          };
        }
        setEditForm(user);
      }
    } catch (err) {
      setError('Failed to load user data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserData();
  }, [id]);

  const handleEditSubmit = async () => {
    try {
      const res = await axios.post('/api/admin/edit-user', {
        userId: id,
        username: editForm.username,
        email: editForm.email,
        role: editForm.role,
        hourly_rate: editForm.hourly_rate,
        companies: editForm.companies
      });
      if (res.data.success) {
        setUserData(res.data.user);
        setIsEditing(false);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user');
    }
  };

  const handleAddTime = async (e) => {
    e.preventDefault();
    if (!addTimeForm.date) {
      setError('Date is required to add time');
      return;
    }
    try {
      const res = await axios.post('/api/admin/add-time', {
        userId: id,
        ...addTimeForm
      });
      if (res.data.success) {
        setAddTimeForm({ date: moment().format('YYYY-MM-DD'), hours: 0, minutes: 0 });
        fetchUserData();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add time');
    }
  };

  const handleRemoveTime = (entryId) => {
    setModalConfig({
      isOpen: true,
      title: 'Remove Time Entry',
      message: 'Are you sure you want to remove this time entry?',
      type: 'confirm',
      onConfirm: async () => {
        closeModal();
        try {
          const res = await axios.post('/api/admin/remove-time', { entryId });
          if (res.data.success) {
            fetchUserData();
          }
        } catch (err) {
          setError(err.response?.data?.error || 'Failed to remove time');
        }
      }
    });
  };

  if (loading) return <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-b-2 border-indigo-600 rounded-full"></div></div>;

  if (!userData) return <div className="text-center p-12 text-gray-400">User not found</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <CustomModal 
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        onConfirm={modalConfig.onConfirm}
        onCancel={closeModal}
        confirmText="Remove"
      />

      <div className="flex items-center space-x-4">
        <Link to="/admin" className="p-2 text-gray-400 hover:bg-gray-700 rounded-full">
          <ArrowLeft size={20} />
        </Link>
        <h2 className="text-2xl font-bold text-white">User Details</h2>
      </div>

      {error && <div className="p-4 bg-red-900/50 text-red-300 rounded-lg">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <div className="md:col-span-1 space-y-4 sm:space-y-6">
          <div className="bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Profile</h3>
              {!isEditing ? (
                <button onClick={() => setIsEditing(true)} className="text-indigo-600 hover:text-indigo-800 p-1"><Edit2 size={16} /></button>
              ) : (
                <div className="space-x-2">
                  <button onClick={() => setIsEditing(false)} className="text-gray-400 p-1"><X size={16} /></button>
                  <button onClick={handleEditSubmit} className="text-green-600 p-1"><Save size={16} /></button>
                </div>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400">Username</label>
                  <input type="text" className="w-full border rounded p-1 text-sm bg-gray-800 border-gray-600 text-white" value={editForm.username} onChange={e => setEditForm({...editForm, username: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Email</label>
                  <input type="email" className="w-full border rounded p-1 text-sm bg-gray-800 border-gray-600 text-white" value={editForm.email || ''} onChange={e => setEditForm({...editForm, email: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Hourly Pay Rate ($)</label>
                  <input type="number" step="0.01" min="0" className="w-full border rounded p-1 text-sm bg-gray-800 border-gray-600 text-white" value={editForm.hourly_rate ?? 0} onChange={e => setEditForm({...editForm, hourly_rate: parseFloat(e.target.value)})} />
                </div>
                <div className="pb-2">
                  <label className="text-xs text-gray-400 mb-1 block">App Role</label>
                  <CustomSelect
                    name="role"
                    value={editForm.role} 
                    onChange={e => setEditForm({...editForm, role: e.target.value})}
                    options={[
                      { value: 'employee', label: 'Employee' },
                      { value: 'admin', label: 'Admin' }
                    ]}
                  />
                </div>
                
                {/* LANForge Section */}
                <div className="border-t border-gray-600 pt-2 mt-2">
                  <CustomCheckbox
                    id="edit_lanforge_active"
                    checked={editForm.companies?.lanforge?.active || false}
                    onChange={e => setEditForm({...editForm, companies: {...editForm.companies, lanforge: {...editForm.companies?.lanforge, active: e.target.checked}}})}
                    label="Enable LANForge Profile"
                  />
                  {editForm.companies?.lanforge?.active && (
                    <div className="space-y-2 pl-4 mt-2">
                      <div>
                        <label className="text-xs text-gray-400">LANForge Title</label>
                        <input type="text" className="w-full border rounded p-1 text-sm bg-gray-800 border-gray-600" value={editForm.companies?.lanforge?.title || ''} onChange={e => setEditForm({...editForm, companies: {...editForm.companies, lanforge: {...editForm.companies.lanforge, title: e.target.value}}})} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">LANForge Level</label>
                        <input type="number" min="1" max="5" className="w-full border rounded p-1 text-sm bg-gray-800 border-gray-600" value={editForm.companies?.lanforge?.level || 3} onChange={e => setEditForm({...editForm, companies: {...editForm.companies, lanforge: {...editForm.companies.lanforge, level: parseInt(e.target.value)}}})} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Ascendance Section */}
                <div className="border-t border-gray-600 pt-2 mt-2">
                  <CustomCheckbox
                    id="edit_ascendance_active"
                    checked={editForm.companies?.ascendance?.active || false}
                    onChange={e => setEditForm({...editForm, companies: {...editForm.companies, ascendance: {...editForm.companies?.ascendance, active: e.target.checked}}})}
                    label="Enable Ascendance Profile"
                  />
                  {editForm.companies?.ascendance?.active && (
                    <div className="space-y-2 pl-4 mt-2">
                      <div>
                        <label className="text-xs text-gray-400">Ascendance Title</label>
                        <input type="text" className="w-full border rounded p-1 text-sm bg-gray-800 border-gray-600" value={editForm.companies?.ascendance?.title || ''} onChange={e => setEditForm({...editForm, companies: {...editForm.companies, ascendance: {...editForm.companies.ascendance, title: e.target.value}}})} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">Ascendance Level</label>
                        <input type="number" min="1" max="5" className="w-full border rounded p-1 text-sm bg-gray-800 border-gray-600" value={editForm.companies?.ascendance?.level || 3} onChange={e => setEditForm({...editForm, companies: {...editForm.companies, ascendance: {...editForm.companies.ascendance, level: parseInt(e.target.value)}}})} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div><span className="text-xs text-gray-400 block">Username</span><div className="font-medium">{userData.username}</div></div>
                <div><span className="text-xs text-gray-400 block">Email</span><div>{userData.email || 'N/A'}</div></div>
                <div><span className="text-xs text-gray-400 block">App Role</span><div className="capitalize">{userData.role}</div></div>
                <div><span className="text-xs text-gray-400 block">Hourly Pay Rate</span><div className="font-medium">${(userData.hourly_rate ?? 0).toFixed(2)}/hr</div></div>

                {userData.companies?.lanforge?.active && (
                  <div className="border-l-2 border-indigo-500 pl-3 py-1 my-2 bg-gray-900/30 rounded-r">
                    <div className="text-xs font-bold text-indigo-400 mb-1">LANForge</div>
                    <div className="text-sm">Title: {userData.companies.lanforge.title}</div>
                    <div className="text-sm">Level: {userData.companies.lanforge.level}</div>
                  </div>
                )}
                
                {userData.companies?.ascendance?.active && (
                  <div className="border-l-2 border-sky-500 pl-3 py-1 my-2 bg-gray-900/30 rounded-r">
                    <div className="text-xs font-bold text-sky-400 mb-1">Ascendance</div>
                    <div className="text-sm">Title: {userData.companies.ascendance.title}</div>
                    <div className="text-sm">Level: {userData.companies.ascendance.level}</div>
                  </div>
                )}
                
                {/* Legacy Fallback Display */}
                {(!userData.companies || (!userData.companies.lanforge && !userData.companies.ascendance)) && (
                  <div className="border-l-2 border-gray-500 pl-3 py-1 my-2 bg-gray-900/30 rounded-r">
                    <div className="text-xs font-bold text-gray-400 mb-1">{userData.company || 'LANForge'}</div>
                    <div className="text-sm">Title: {userData.title || 'N/A'}</div>
                    <div className="text-sm">Level: {userData.company_level || 3}</div>
                  </div>
                )}
                
                <div><span className="text-xs text-gray-400 block">Joined</span><div>{moment(userData.created_at).format('ll')}</div></div>
              </div>
            )}
          </div>

          <div className="bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center"><Clock size={18} className="mr-2 text-indigo-500"/> Add Time</h3>
            <form onSubmit={handleAddTime} className="space-y-4">
              <div>
                <label className="text-sm text-gray-300 mb-1 block">Date</label>
                <CustomDatePicker
                  name="date"
                  value={addTimeForm.date}
                  onChange={e => setAddTimeForm({...addTimeForm, date: e.target.value})}
                />
              </div>
              <div className="flex space-x-4">
                <div className="flex-1">
                  <label className="text-sm text-gray-300">Hours</label>
                  <input type="number" min="0" className="w-full border border-gray-600 rounded p-2 text-sm mt-1" value={addTimeForm.hours} onChange={e => setAddTimeForm({...addTimeForm, hours: e.target.value})} />
                </div>
                <div className="flex-1">
                  <label className="text-sm text-gray-300">Minutes</label>
                  <input type="number" min="0" max="59" className="w-full border border-gray-600 rounded p-2 text-sm mt-1" value={addTimeForm.minutes} onChange={e => setAddTimeForm({...addTimeForm, minutes: e.target.value})} />
                </div>
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white rounded p-2 text-sm font-medium hover:bg-indigo-700 transition-colors">
                Add Entry
              </button>
            </form>
          </div>
        </div>

        <div className="md:col-span-2 space-y-4 sm:space-y-6">
          <div className="bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Pay Periods (This Year)</h3>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="min-w-full divide-y divide-gray-200 mb-2">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Period</th>
                    <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Hours</th>
                    <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Gross Pay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {yearPayPeriods.map(period => (
                    <tr key={period.sortKey}>
                      <td className="px-3 sm:px-4 py-3 text-sm text-white">{period.name}</td>
                      <td className="px-3 sm:px-4 py-3 text-sm font-medium text-white">{period.hours.toFixed(2)}h</td>
                      <td className="px-3 sm:px-4 py-3 text-sm font-medium text-green-400">${period.pay.toFixed(2)}</td>
                    </tr>
                  ))}
                  {yearPayPeriods.length === 0 && (
                    <tr>
                      <td colSpan="3" className="px-4 py-3 text-sm text-center text-gray-400">No pay period data found for this year</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Recent Time Entries</h3>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Date</th>
                    <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">In/Out</th>
                    <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Hrs</th>
                    <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-400 uppercase"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {timeEntries.map(entry => {
                    const duration = entry.clock_out ? ((new Date(entry.clock_out) - new Date(entry.clock_in)) / (1000 * 60 * 60)).toFixed(2) : '--';
                    return (
                      <tr key={entry._id}>
                        <td className="px-3 sm:px-4 py-3 text-sm text-white whitespace-nowrap">{moment(entry.clock_in).format('MMM Do YYYY')}</td>
                        <td className="px-3 sm:px-4 py-3 text-sm text-gray-400 whitespace-nowrap">
                          {moment(entry.clock_in).format('HH:mm')} - {entry.clock_out ? moment(entry.clock_out).format('HH:mm') : 'Active'}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-sm font-medium text-white whitespace-nowrap">{duration}h</td>
                        <td className="px-3 sm:px-4 py-3 text-right">
                          <button onClick={() => handleRemoveTime(entry._id)} className="text-red-500 hover:text-red-200" aria-label="Remove entry"><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
