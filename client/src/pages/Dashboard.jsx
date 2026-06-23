import React, { useState, useEffect } from 'react';
import axios from 'axios';
import moment from 'moment';
import { useAuth } from '../contexts/AuthContext';
import { Clock, CheckCircle2, XCircle, AlertCircle, Play, Square, MessageSquare, Video, ExternalLink, MapPin, Check, X as XIcon, HelpCircle, Repeat, Target } from 'lucide-react';
import { describeMeetingTime, detectTz } from '../utils/datetime';

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [addingNotes, setAddingNotes] = useState(false);
  const [error, setError] = useState('');
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const [dynamicTotalHours, setDynamicTotalHours] = useState('0.0000');
  const [dynamicEstimatedPay, setDynamicEstimatedPay] = useState('0.0000');
  const [pendingMeeting, setPendingMeeting] = useState(null);
  const [rsvpSubmitting, setRsvpSubmitting] = useState(false);
  const [salesGoal, setSalesGoal] = useState(null);

  const fetchDashboard = async () => {
    try {
      const res = await axios.get('/api/dashboard');
      if (res.data.success) {
        setData(res.data.data);
        if (res.data.data.currentEntry?.notes) {
          setNotes(res.data.data.currentEntry.notes);
        } else {
          setNotes('');
        }
      }
    } catch (err) {
      console.error('Failed to fetch dashboard', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingMeeting = async () => {
    try {
      const res = await axios.get('/api/meetings');
      if (res.data.success) {
        const now = new Date();
        const next = res.data.data.meetings
          .filter(m => m.my_status === 'pending' && new Date(m.start_time) > now)
          .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0] || null;
        setPendingMeeting(next);
      }
    } catch (err) {
      console.error('Failed to fetch meetings', err);
    }
  };

  const handleRsvp = async (status) => {
    if (!pendingMeeting) return;
    setRsvpSubmitting(true);
    try {
      await axios.post(`/api/meetings/${pendingMeeting._id}/rsvp`, { status });
      await fetchPendingMeeting();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to RSVP');
    } finally {
      setRsvpSubmitting(false);
    }
  };

  const fetchSalesGoal = async () => {
    try {
      const res = await axios.get('/api/sales-goal');
      if (res.data.success) setSalesGoal(res.data.data.goal);
    } catch (err) {
      console.error('Failed to fetch sales goal', err);
    }
  };

  useEffect(() => {
    fetchDashboard();
    fetchPendingMeeting();
    fetchSalesGoal();
  }, []);

  useEffect(() => {
    let interval;
    const currentEntry = data?.currentEntry;
    
    // Set baseline when not running
    if (data?.payPeriodSummary) {
      setDynamicTotalHours(Number(data.payPeriodSummary.baseTotalHours || 0).toFixed(4));
      setDynamicEstimatedPay((Number(data.payPeriodSummary.baseTotalHours || 0) * Number(data.user?.hourlyRate || 0)).toFixed(4));
    }

    if (currentEntry?.clock_in) {
      const updateStopwatch = () => {
        const start = new Date(currentEntry.clock_in).getTime();
        const now = new Date().getTime();
        const diff = Math.max(0, now - start);

        const hoursStr = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        setElapsedTime(
          `${hoursStr.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );

        if (data?.payPeriodSummary) {
          const activeHours = diff / (1000 * 60 * 60);
          const totalExactHours = Number(data.payPeriodSummary.baseTotalHours || 0) + activeHours;
          const estimatedPayExact = totalExactHours * Number(data.user?.hourlyRate || 0);
          
          setDynamicTotalHours(totalExactHours.toFixed(4));
          setDynamicEstimatedPay(estimatedPayExact.toFixed(4));
        }
      };

      updateStopwatch();
      interval = setInterval(updateStopwatch, 1000);
    } else {
      setElapsedTime('00:00:00');
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [data]);

  const handleClockIn = async () => {
    try {
      const res = await axios.post('/api/clockin');
      if (res.data.success) {
        fetchDashboard();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to clock in');
    }
  };

  const handleClockOut = async () => {
    try {
      const res = await axios.post('/api/clockout');
      if (res.data.success) {
        fetchDashboard();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to clock out');
    }
  };

  const handleSaveNotes = async () => {
    try {
      setAddingNotes(true);
      const res = await axios.post('/api/add-notes', { notes });
      if (res.data.success) {
        fetchDashboard();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save notes');
    } finally {
      setAddingNotes(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const { todayEntries, currentEntry, monthlySummary, payPeriodSummary, announcements } = data || {};

  const goalTarget = salesGoal?.target_count || 0;
  const goalCurrent = salesGoal?.current_count || 0;
  const goalPct = goalTarget > 0 ? Math.min(100, Math.round((goalCurrent / goalTarget) * 100)) : 0;
  const goalHit = goalTarget > 0 && goalCurrent >= goalTarget;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {salesGoal && goalTarget > 0 && (
        <div className={`p-6 rounded-xl border ${goalHit ? 'bg-green-900/20 border-green-700' : 'bg-gray-800 border-indigo-800/60'}`}>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <Target className={`mt-1 ${goalHit ? 'text-green-400' : 'text-indigo-400'}`} size={22} />
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-400">{salesGoal.label || 'Sales Goal'}</p>
                <p className="text-3xl font-bold text-white font-mono">
                  {goalCurrent.toLocaleString()} <span className="text-gray-400 font-normal text-xl">/ {goalTarget.toLocaleString()} PCs</span>
                </p>
              </div>
            </div>
            <div className={`text-2xl font-bold ${goalHit ? 'text-green-300' : 'text-indigo-300'}`}>
              {goalPct}%
            </div>
          </div>
          <div className="mt-4 h-3 bg-gray-900 rounded-full overflow-hidden border border-gray-700">
            <div
              className={`h-full transition-all ${goalHit ? 'bg-green-500' : 'bg-indigo-500'}`}
              style={{ width: `${goalPct}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-gray-500">
              {salesGoal.last_fetched_at
                ? `Updated ${moment(salesGoal.last_fetched_at).fromNow()}`
                : 'Awaiting first sync'}
            </span>
            {goalHit && <span className="text-green-300 font-medium">Goal hit. Nice work.</span>}
          </div>
          {salesGoal.last_fetch_error && (
            <p className="mt-1 text-xs text-red-300/80">Last sync failed: {salesGoal.last_fetch_error}</p>
          )}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Welcome, {user?.username}</h2>
          <p className="text-gray-400">{moment().format('dddd, MMMM Do YYYY')}</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/50 border-l-4 border-red-400 p-4 rounded-md flex items-start">
          <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 mr-3" />
          <p className="text-sm text-red-200">{error}</p>
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-500">
            &times;
          </button>
        </div>
      )}

      {/* Announcements */}
      {announcements && announcements.length > 0 && (
        <div className="space-y-3">
          {announcements.map(ann => (
            <div key={ann._id} className={`p-4 rounded-lg border ${
              ann.type === 'urgent' ? 'bg-red-900/50 border-red-800 text-red-200' :
              ann.type === 'warning' ? 'bg-yellow-900/50 border-yellow-800 text-yellow-200' :
              ann.type === 'success' ? 'bg-green-900/50 border-green-800 text-green-200' :
              'bg-blue-900/50 border-blue-800 text-blue-200'
            }`}>
              <div className="flex justify-between items-start">
                <h3 className="font-semibold">{ann.title}</h3>
                <span className="text-xs opacity-75">{moment(ann.created_at).fromNow()}</span>
              </div>
              <p className="text-sm mt-1">{ann.content}</p>
            </div>
          ))}
        </div>
      )}

      {pendingMeeting && (() => {
        const viewerTz = user?.timezone || detectTz();
        const { primary: pendingPrimary, secondary: pendingSecondary } = describeMeetingTime(pendingMeeting, viewerTz);
        return (
        <div className="bg-gray-800 rounded-xl shadow-sm border border-purple-800/60 overflow-hidden">
          <div className="px-6 py-3 bg-purple-900/30 border-b border-purple-800/60 flex items-center text-sm text-purple-100">
            <Video size={16} className="mr-2 text-purple-300" />
            RSVP for your next meeting
          </div>
          <div className="p-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-white">{pendingMeeting.title}</h3>
              <div className="mt-1 text-sm text-gray-300 flex flex-wrap items-center gap-2">
                <span>{pendingPrimary}</span>
                {pendingMeeting.recurrence && pendingMeeting.recurrence !== 'none' && (
                  <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-indigo-900/50 text-indigo-200 border border-indigo-800">
                    <Repeat size={12} className="mr-1" />
                    {pendingMeeting.recurrence_label || pendingMeeting.recurrence}
                  </span>
                )}
              </div>
              {pendingSecondary && (
                <div className="text-xs text-gray-400 mt-0.5">Your time: {pendingSecondary}</div>
              )}
              {pendingMeeting.description && (
                <p className="mt-2 text-sm text-gray-400 whitespace-pre-wrap">{pendingMeeting.description}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {pendingMeeting.link && (
                  <a href={pendingMeeting.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-indigo-400 hover:text-indigo-300">
                    <ExternalLink size={14} className="mr-1" /> Join meeting
                  </a>
                )}
                {pendingMeeting.location && (
                  <span className="inline-flex items-center text-gray-400">
                    <MapPin size={14} className="mr-1" /> {pendingMeeting.location}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleRsvp('accepted')}
                disabled={rsvpSubmitting}
                className="px-3 py-2 rounded-md text-sm font-medium border border-green-600 text-green-100 bg-green-700/30 hover:bg-green-700/50 disabled:opacity-50 inline-flex items-center"
              >
                <Check size={14} className="mr-1" /> Going
              </button>
              <button
                onClick={() => handleRsvp('maybe')}
                disabled={rsvpSubmitting}
                className="px-3 py-2 rounded-md text-sm font-medium border border-yellow-600 text-yellow-100 bg-yellow-700/30 hover:bg-yellow-700/50 disabled:opacity-50 inline-flex items-center"
              >
                <HelpCircle size={14} className="mr-1" /> Maybe
              </button>
              <button
                onClick={() => handleRsvp('declined')}
                disabled={rsvpSubmitting}
                className="px-3 py-2 rounded-md text-sm font-medium border border-red-600 text-red-100 bg-red-700/30 hover:bg-red-700/50 disabled:opacity-50 inline-flex items-center"
              >
                <XIcon size={14} className="mr-1" /> Not Going
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Clock Controls */}
        <div className="bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-700 flex flex-col">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
            <Clock className="mr-2 text-indigo-500" size={20} />
            Time Tracking
          </h3>

          <div className="flex-1 flex flex-col items-center justify-center py-6">
            <div className={`text-5xl font-mono font-bold mb-8 ${currentEntry ? 'text-indigo-600' : 'text-gray-300'}`}>
              {currentEntry ? elapsedTime : '00:00:00'}
            </div>

            <div className="flex space-x-4 w-full">
              {!currentEntry ? (
                <button
                  onClick={handleClockIn}
                  className="flex-1 py-3 px-4 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center shadow-sm"
                >
                  <Play size={18} className="mr-2" />
                  Start Timer
                </button>
              ) : (
                <button
                  onClick={handleClockOut}
                  className="flex-1 py-3 px-4 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors flex items-center justify-center shadow-sm"
                >
                  <Square size={18} className="mr-2" />
                  Stop Timer
                </button>
              )}
            </div>
          </div>

          {currentEntry && (
            <div className="mt-4 pt-4 border-t border-gray-700">
              <label className="block text-sm font-medium text-gray-200 mb-2 flex items-center">
                <MessageSquare size={16} className="mr-1" /> Current Notes
              </label>
              <textarea
                className="w-full border-gray-600 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border bg-gray-900"
                rows="2"
                placeholder="What are you working on?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <div className="mt-2 flex justify-end">
                <button
                  onClick={handleSaveNotes}
                  disabled={addingNotes}
                  className="px-3 py-1.5 bg-gray-700 text-gray-200 rounded text-sm hover:bg-gray-600 transition-colors"
                >
                  {addingNotes ? 'Saving...' : 'Save Notes'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Summary Card */}
        <div className="bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-700 flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center justify-between">
              Pay Period
              <span className="text-xs font-normal text-green-400 bg-green-900/30 px-2 py-1 rounded-full border border-green-800/50">
                {payPeriodSummary ? `${payPeriodSummary.periodStart} - ${payPeriodSummary.periodEnd}` : 'N/A'}
              </span>
            </h3>
            <div className="space-y-4">
              <div className="p-4 bg-green-900/20 rounded-lg border border-green-800/50">
                <p className="text-sm text-green-500 font-medium">Hours</p>
                <p className="text-3xl font-bold text-green-100 font-mono">{dynamicTotalHours}</p>
                
                <div className="border-t border-green-800/50 pt-3 mt-3">
                  <p className="text-sm text-green-500 font-medium">Estimated Pay</p>
                  <p className="text-2xl font-bold text-green-100 font-mono">${dynamicEstimatedPay}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-md font-semibold text-white mb-3">Monthly Summary</h3>
            <div className="p-3 bg-indigo-900/20 rounded-lg border border-indigo-800/50">
              <p className="text-xs text-indigo-500 font-medium">Total Hours</p>
              <p className="text-xl font-bold text-indigo-100">{monthlySummary?.totalHours || '0.00'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Entries */}
      <div className="bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Today's Activity</h3>
        
        {(!todayEntries || todayEntries.length === 0) ? (
          <p className="text-gray-400 text-center py-6 bg-gray-900 rounded-lg border border-dashed border-gray-600">
            No entries for today yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Start Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">End Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Hours</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Notes</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-gray-800 divide-y divide-gray-200">
                {todayEntries.map(entry => {
                  const duration = entry.clock_out 
                    ? ((new Date(entry.clock_out) - new Date(entry.clock_in)) / (1000 * 60 * 60)).toFixed(2)
                    : '--';
                  
                  return (
                    <tr key={entry._id} className={!entry.clock_out ? "bg-indigo-900/50" : ""}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {moment(entry.clock_in).format('hh:mm A')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {entry.clock_out ? moment(entry.clock_out).format('hh:mm A') : '--:--'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white font-medium">
                        {duration}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400 max-w-xs truncate" title={entry.notes}>
                        {entry.notes || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {!entry.clock_out ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900/50 text-green-200">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-700 text-gray-100">
                            Completed
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
