import React, { useState, useEffect } from 'react';
import axios from 'axios';
import moment from 'moment';
import { useAuth } from '../contexts/AuthContext';
import { Clock, AlertCircle, Play, Square, Video, ExternalLink, Check, X as XIcon, HelpCircle, Repeat, Target, Gift, Megaphone } from 'lucide-react';
import { describeMeetingTime, detectTz } from '../utils/datetime';
import OnboardingModal from '../components/OnboardingModal';

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

  const goalTiers = Array.isArray(salesGoal?.tiers) ? salesGoal.tiers : [];
  const goalCurrent = salesGoal?.current_count || 0;
  const nextTierIdx = goalTiers.findIndex(t => goalCurrent < t.target_count);
  const allTiersHit = goalTiers.length > 0 && nextTierIdx === -1;
  const activeTier = nextTierIdx >= 0 ? goalTiers[nextTierIdx] : null;
  const prevTierTarget = nextTierIdx > 0 ? goalTiers[nextTierIdx - 1].target_count : 0;
  const tierSpan = activeTier ? (activeTier.target_count - prevTierTarget) : 0;
  const tierProgressPct = activeTier && tierSpan > 0
    ? Math.min(100, Math.round(((goalCurrent - prevTierTarget) / tierSpan) * 100))
    : (allTiersHit ? 100 : 0);

  const viewerTz = user?.timezone || detectTz();
  const pendingMeetingDesc = pendingMeeting ? describeMeetingTime(pendingMeeting, viewerTz) : null;

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <OnboardingModal />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
        <h2 className="text-2xl font-bold text-white">Welcome, {user?.username}</h2>
        <p className="text-sm text-gray-400">{moment().format('dddd, MMMM Do YYYY')}</p>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-800 px-3 py-2 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-200 flex-1">{error}</p>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300 text-lg leading-none">×</button>
        </div>
      )}

      {/* Sales Goal — compact banner */}
      {salesGoal && goalTiers.length > 0 && (
        <div className={`p-4 sm:p-5 rounded-xl border ${allTiersHit ? 'bg-green-900/15 border-green-800' : 'bg-gray-800 border-gray-700'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`p-2 rounded-lg flex-shrink-0 ${allTiersHit ? 'bg-green-900/40' : 'bg-indigo-900/40'}`}>
                <Target size={18} className={allTiersHit ? 'text-green-400' : 'text-indigo-400'} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 truncate">{salesGoal.label || 'Sales Goal'}</p>
                <p className="font-mono font-bold text-white text-lg leading-tight">
                  {goalCurrent.toLocaleString()}
                  {activeTier && <span className="text-gray-500 font-normal"> / {activeTier.target_count.toLocaleString()}</span>}
                  <span className="text-gray-500 font-normal text-sm ml-1">PCs</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {activeTier?.bonus && (
                <span className="hidden md:inline-flex items-center text-xs px-2.5 py-1 rounded-full bg-indigo-900/40 text-indigo-200 border border-indigo-800">
                  <Gift size={12} className="mr-1" /> {activeTier.bonus}
                </span>
              )}
              <span className={`text-xl font-bold ${allTiersHit ? 'text-green-300' : 'text-indigo-300'}`}>{tierProgressPct}%</span>
            </div>
          </div>
          <div className="mt-3 h-2 bg-gray-900 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${allTiersHit ? 'bg-green-500' : 'bg-indigo-500'}`}
              style={{ width: `${tierProgressPct}%` }}
            />
          </div>
          {goalTiers.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {goalTiers.map((t, i) => {
                const hit = goalCurrent >= t.target_count;
                const isNext = i === nextTierIdx;
                return (
                  <span
                    key={i}
                    className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${
                      hit ? 'bg-green-900/30 text-green-200 border-green-800'
                          : isNext ? 'bg-indigo-900/40 text-indigo-100 border-indigo-700'
                                   : 'bg-gray-900 text-gray-400 border-gray-700'
                    }`}
                  >
                    {hit && <Check size={10} className="inline -mt-0.5 mr-0.5" />}
                    {t.target_count.toLocaleString()}{t.bonus && <span className="opacity-80"> · {t.bonus}</span>}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Hero time tracker */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-4 sm:p-8">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
              {currentEntry ? 'Currently clocked in' : 'Not clocked in'}
            </p>
            <p className={`text-4xl sm:text-6xl font-mono font-bold tracking-tight ${currentEntry ? 'text-indigo-400' : 'text-gray-600'}`}>
              {currentEntry ? elapsedTime : '00:00:00'}
            </p>
            {currentEntry && (
              <p className="mt-2 text-xs text-gray-500">
                Started {moment(currentEntry.clock_in).format('h:mm A')}
              </p>
            )}
          </div>

          <div className="mt-6 max-w-xs mx-auto">
            {!currentEntry ? (
              <button
                onClick={handleClockIn}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors inline-flex items-center justify-center"
              >
                <Play size={18} className="mr-2" /> Clock In
              </button>
            ) : (
              <button
                onClick={handleClockOut}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors inline-flex items-center justify-center"
              >
                <Square size={18} className="mr-2" /> Clock Out
              </button>
            )}
          </div>

          {currentEntry && (
            <div className="mt-6 max-w-md mx-auto">
              <textarea
                rows="2"
                placeholder="What are you working on?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full text-sm bg-gray-900 border border-gray-700 rounded-lg p-3 text-gray-100 placeholder:text-gray-500 focus:border-indigo-500 focus:ring-indigo-500"
              />
              <div className="mt-2 flex justify-end">
                <button
                  onClick={handleSaveNotes}
                  disabled={addingNotes}
                  className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md disabled:opacity-50"
                >
                  {addingNotes ? 'Saving…' : 'Save notes'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-700 bg-gray-900/40 grid grid-cols-3 divide-x divide-gray-700">
          <div className="px-2 sm:px-3 py-3 text-center min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 truncate">
              <span className="sm:hidden">Pay Period</span>
              <span className="hidden sm:inline">Pay Period{payPeriodSummary ? ` · ${payPeriodSummary.periodStart}–${payPeriodSummary.periodEnd}` : ''}</span>
            </p>
            <p className="mt-0.5 text-base sm:text-lg font-bold text-white font-mono">
              {Number(dynamicTotalHours).toFixed(2)}
              <span className="text-xs text-gray-500 ml-1">hrs</span>
            </p>
          </div>
          <div className="px-2 sm:px-3 py-3 text-center min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 truncate">Est. Pay</p>
            <p className="mt-0.5 text-base sm:text-lg font-bold text-green-300 font-mono truncate">
              ${Number(dynamicEstimatedPay).toFixed(2)}
            </p>
          </div>
          <div className="px-2 sm:px-3 py-3 text-center min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 truncate">This Month</p>
            <p className="mt-0.5 text-base sm:text-lg font-bold text-white font-mono">
              {monthlySummary?.totalHours || '0.00'}
              <span className="text-xs text-gray-500 ml-1">hrs</span>
            </p>
          </div>
        </div>
      </div>

      {/* Pending meeting */}
      {pendingMeeting && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="p-2 bg-purple-900/40 rounded-lg flex-shrink-0">
                <Video size={18} className="text-purple-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider text-purple-300 mb-1">Awaiting RSVP</p>
                <h3 className="font-semibold text-white">{pendingMeeting.title}</h3>
                <div className="mt-1 text-sm text-gray-300 flex flex-wrap items-center gap-2">
                  <span>{pendingMeetingDesc?.primary}</span>
                  {pendingMeeting.recurrence && pendingMeeting.recurrence !== 'none' && (
                    <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-indigo-900/50 text-indigo-200 border border-indigo-800">
                      <Repeat size={12} className="mr-1" />
                      {pendingMeeting.recurrence_label || pendingMeeting.recurrence}
                    </span>
                  )}
                </div>
                {pendingMeetingDesc?.secondary && (
                  <p className="text-xs text-gray-500 mt-0.5">Your time: {pendingMeetingDesc.secondary}</p>
                )}
                {pendingMeeting.link && (
                  <a
                    href={pendingMeeting.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center mt-2 text-sm text-indigo-400 hover:text-indigo-300"
                  >
                    <ExternalLink size={14} className="mr-1" /> Join meeting
                  </a>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 md:flex-shrink-0">
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
      )}

      {/* Announcements */}
      {announcements && announcements.length > 0 && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-700 flex items-center">
            <Megaphone size={14} className="mr-2 text-indigo-400" />
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Announcements</h3>
          </div>
          <div className="divide-y divide-gray-700">
            {announcements.map(ann => {
              const accent = ann.type === 'urgent' ? 'bg-red-500'
                : ann.type === 'warning' ? 'bg-yellow-500'
                : ann.type === 'success' ? 'bg-green-500'
                : 'bg-blue-500';
              return (
                <div key={ann._id} className="px-5 py-3 flex items-start gap-3">
                  <div className={`w-1 self-stretch rounded-full ${accent}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-medium text-white text-sm">{ann.title}</h4>
                      <span className="text-xs text-gray-500 flex-shrink-0">{moment(ann.created_at).fromNow()}</span>
                    </div>
                    <p className="text-sm text-gray-300 mt-1 whitespace-pre-wrap">{ann.content}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Today's Activity */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-700 flex items-center">
          <Clock size={14} className="mr-2 text-indigo-400" />
          <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Today's Activity</h3>
        </div>
        {(!todayEntries || todayEntries.length === 0) ? (
          <p className="text-gray-500 text-center py-8 text-sm">No entries for today yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="text-left text-[10px] text-gray-500 uppercase tracking-wider bg-gray-900/40">
                  <th className="px-3 sm:px-5 py-2 font-medium">Time</th>
                  <th className="px-3 sm:px-5 py-2 font-medium">Hours</th>
                  <th className="px-3 sm:px-5 py-2 font-medium hidden sm:table-cell">Notes</th>
                  <th className="px-3 sm:px-5 py-2 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {todayEntries.map(entry => {
                  const duration = entry.clock_out
                    ? ((new Date(entry.clock_out) - new Date(entry.clock_in)) / (1000 * 60 * 60)).toFixed(2)
                    : '—';
                  const active = !entry.clock_out;
                  return (
                    <tr key={entry._id} className={active ? 'bg-indigo-900/20' : ''}>
                      <td className="px-3 sm:px-5 py-3 text-xs sm:text-sm text-white whitespace-nowrap font-mono">
                        {moment(entry.clock_in).format('h:mm A')} – {entry.clock_out ? moment(entry.clock_out).format('h:mm A') : '—'}
                      </td>
                      <td className="px-3 sm:px-5 py-3 text-xs sm:text-sm text-white font-medium whitespace-nowrap font-mono">{duration}</td>
                      <td className="px-3 sm:px-5 py-3 text-sm text-gray-400 max-w-md truncate hidden sm:table-cell" title={entry.notes}>{entry.notes || '—'}</td>
                      <td className="px-3 sm:px-5 py-3 text-right">
                        {active ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/40 text-green-200 border border-green-800">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-700 text-gray-300">
                            Done
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
