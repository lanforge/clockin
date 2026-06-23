import React, { useState, useEffect } from 'react';
import axios from 'axios';
import moment from 'moment';
import { ChevronLeft, ChevronRight, Clock, AlertCircle, Video, MapPin, ExternalLink, Check, X, HelpCircle, Repeat, Bell } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { describeMeetingTime, detectTz } from '../utils/datetime';

export default function Calendar() {
  const { user } = useAuth();
  const viewerTz = user?.timezone || detectTz();
  const [currentDate, setCurrentDate] = useState(moment());
  const [data, setData] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchCalendar = async (month, year) => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/calendar?month=${month}&year=${year}`);
      if (res.data.success) {
        setData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch calendar', err);
      setError('Failed to load calendar data');
    } finally {
      setLoading(false);
    }
  };

  const fetchMeetings = async () => {
    try {
      const res = await axios.get('/api/meetings');
      if (res.data.success) {
        setMeetings(res.data.data.meetings);
      }
    } catch (err) {
      console.error('Failed to fetch meetings', err);
    }
  };

  const handleRsvp = async (meetingId, status) => {
    try {
      await axios.post(`/api/meetings/${meetingId}/rsvp`, { status });
      fetchMeetings();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update RSVP');
    }
  };

  useEffect(() => {
    fetchCalendar(currentDate.month() + 1, currentDate.year());
  }, [currentDate]);

  useEffect(() => {
    fetchMeetings();
  }, []);

  const meetingsByDate = {};
  meetings.forEach(m => {
    const key = moment(m.start_time).format('YYYY-MM-DD');
    if (!meetingsByDate[key]) meetingsByDate[key] = [];
    meetingsByDate[key].push(m);
  });

  const MAX_PER_SERIES = 3;
  const seriesCounts = {};
  const upcomingMeetings = meetings
    .filter(m => moment(m.start_time).isSameOrAfter(moment().startOf('day')))
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
    .filter(m => {
      const key = m._id;
      seriesCounts[key] = (seriesCounts[key] || 0) + 1;
      return seriesCounts[key] <= MAX_PER_SERIES;
    });

  const now = moment();
  const alertMeetings = meetings.filter(m => {
    if (m.alert_dismissed) return false;
    const start = moment(m.start_time);
    return start.isAfter(now) && start.diff(now, 'hours', true) <= 24;
  });

  const handleDismissAlert = async (meeting) => {
    try {
      await axios.post(`/api/meetings/${meeting._id}/dismiss-alert`, {
        occurrence_start: meeting.occurrence_start || meeting.start_time
      });
      fetchMeetings();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to dismiss alert');
    }
  };

  const nextMonth = () => {
    setCurrentDate(moment(currentDate).add(1, 'month'));
  };

  const prevMonth = () => {
    setCurrentDate(moment(currentDate).subtract(1, 'month'));
  };

  const getDaysInMonth = () => {
    const daysInMonth = currentDate.daysInMonth();
    const firstDayOfMonth = moment(currentDate).startOf('month').day();
    
    const blanks = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
      blanks.push(<div key={`blank-${i}`} className="h-24 bg-gray-900 border border-gray-700 rounded-lg"></div>);
    }

    const daysInMonthArray = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = moment(currentDate).date(d).format('YYYY-MM-DD');
      const isToday = dateStr === moment().format('YYYY-MM-DD');
      
      let dayData = null;
      if (data?.entriesByDate && data.entriesByDate[dateStr]) {
        dayData = data.entriesByDate[dateStr];
      }
      
      let totalHours = 0;
      if (dayData) {
        dayData.forEach(entry => {
          const duration = entry.clock_out 
            ? ((new Date(entry.clock_out) - new Date(entry.clock_in)) / (1000 * 60 * 60))
            : 0;
          totalHours += duration;
        });
      }

      const dayMeetings = meetingsByDate[dateStr] || [];

      daysInMonthArray.push(
        <div
          key={d}
          className={`h-24 border rounded-lg p-2 flex flex-col ${isToday ? 'border-indigo-400 bg-indigo-900/50/30' : 'border-gray-600 bg-gray-800'}`}
        >
          <div className="flex justify-between items-start">
            <span className={`text-sm font-semibold ${isToday ? 'text-indigo-600' : 'text-gray-200'}`}>{d}</span>
            {totalHours > 0 && (
              <span className="text-xs font-medium text-green-600 bg-green-900/50 px-1.5 py-0.5 rounded">
                {totalHours.toFixed(1)}h
              </span>
            )}
          </div>

          <div className="flex-1 mt-1 overflow-y-auto no-scrollbar space-y-1">
            {dayMeetings.map(m => (
              <div key={m.occurrence_id || m._id} className="text-[10px] leading-tight p-1 bg-purple-900/40 rounded text-purple-100 truncate border border-purple-800/60 flex items-center" title={m.title}>
                <Video size={10} className="mr-1 flex-shrink-0" />
                <span className="truncate">{moment(m.start_time).format('HH:mm')} {m.title}</span>
              </div>
            ))}
            {dayData && dayData.map((entry, idx) => (
              <div key={idx} className="text-[10px] leading-tight p-1 bg-gray-900 rounded text-gray-300 truncate border border-gray-700">
                {moment(entry.clock_in).format('HH:mm')} - {entry.clock_out ? moment(entry.clock_out).format('HH:mm') : 'Active'}
              </div>
            ))}
          </div>
        </div>
      );
    }

    return [...blanks, ...daysInMonthArray];
  };

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-700">
        <div>
          <h2 className="text-2xl font-bold text-white">Work Calendar</h2>
          <p className="text-sm text-gray-400 mt-1">View your time entries and daily hours</p>
        </div>
        
        <div className="mt-4 sm:mt-0 flex items-center space-x-4">
          <button 
            onClick={prevMonth}
            className="p-2 rounded-full hover:bg-gray-700 text-gray-300 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-lg font-semibold text-gray-100 min-w-[140px] text-center">
            {currentDate.format('MMMM YYYY')}
          </span>
          <button 
            onClick={nextMonth}
            className="p-2 rounded-full hover:bg-gray-700 text-gray-300 transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/50 border-l-4 border-red-400 p-4 rounded-md flex items-start">
          <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 mr-3" />
          <p className="text-sm text-red-200">{error}</p>
        </div>
      )}

      {alertMeetings.length > 0 && (
        <div className="space-y-3">
          {alertMeetings.map(m => {
            const start = moment(m.start_time);
            const hoursAway = start.diff(moment(), 'hours');
            const minutesAway = start.diff(moment(), 'minutes') % 60;
            const { primary: alertPrimary, secondary: alertSecondary } = describeMeetingTime(m, viewerTz);
            return (
              <div key={m.occurrence_id || m._id} className="bg-amber-900/30 border border-amber-700 rounded-lg p-4 flex items-start gap-3">
                <Bell className="text-amber-300 flex-shrink-0 mt-0.5" size={20} />
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-amber-100">{m.title}</h4>
                  <p className="text-sm text-amber-200 mt-1">
                    Starts {hoursAway > 0 ? `${hoursAway}h ${minutesAway}m` : `${minutesAway}m`} from now · {alertPrimary}
                  </p>
                  {alertSecondary && (
                    <p className="text-xs text-amber-300/80 mt-0.5">Your time: {alertSecondary}</p>
                  )}
                  {m.link && (
                    <a href={m.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center mt-2 text-sm text-indigo-300 hover:text-indigo-200">
                      <ExternalLink size={14} className="mr-1" /> Join meeting
                    </a>
                  )}
                </div>
                <button
                  onClick={() => handleDismissAlert(m)}
                  className="text-amber-300 hover:text-amber-100 p-1"
                  title="Dismiss"
                >
                  <X size={18} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-700 overflow-x-auto">
        <div className="min-w-[600px]">
          <div className="grid grid-cols-7 gap-2 mb-4">
            {weekdays.map(day => (
              <div key={day} className="text-center font-medium text-sm text-gray-400 py-2">
                {day}
              </div>
            ))}
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {getDaysInMonth()}
            </div>
          )}
        </div>
      </div>

      {upcomingMeetings.length > 0 && (
        <div className="bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-700">
          <h3 className="text-lg font-semibold mb-4 text-white flex items-center">
            <Video className="mr-2 text-purple-400" size={20} />
            Upcoming Meetings
          </h3>
          <div className="space-y-3">
            {upcomingMeetings.map(m => {
              const key = m.occurrence_id || m._id;
              const rsvpButton = (status, label, Icon, activeClass) => (
                <button
                  key={status}
                  onClick={() => handleRsvp(m._id, status)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border inline-flex items-center transition-colors ${
                    m.my_status === status
                      ? activeClass
                      : 'border-gray-600 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <Icon size={14} className="mr-1" />
                  {label}
                </button>
              );

              return (
                <div key={key} className="border border-gray-700 rounded-lg p-4 bg-gray-900">
                  <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-white">{m.title}</h4>
                      {(() => {
                        const { primary, secondary } = describeMeetingTime(m, viewerTz);
                        return (
                          <>
                            <div className="mt-1 text-sm text-gray-300 flex flex-wrap items-center gap-2">
                              <span>{primary}</span>
                              {m.recurrence && m.recurrence !== 'none' && (
                                <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-indigo-900/50 text-indigo-200 border border-indigo-800">
                                  <Repeat size={12} className="mr-1" />
                                  {m.recurrence_label || m.recurrence}
                                </span>
                              )}
                            </div>
                            {secondary && (
                              <div className="text-xs text-gray-400 mt-0.5">Your time: {secondary}</div>
                            )}
                          </>
                        );
                      })()}
                      {m.description && (
                        <p className="mt-2 text-sm text-gray-400 whitespace-pre-wrap">{m.description}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-3 text-sm">
                        {m.link && (
                          <a
                            href={m.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-indigo-400 hover:text-indigo-300"
                          >
                            <ExternalLink size={14} className="mr-1" /> Join meeting
                          </a>
                        )}
                        {m.location && (
                          <span className="inline-flex items-center text-gray-400">
                            <MapPin size={14} className="mr-1" /> {m.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {rsvpButton('accepted', 'Going', Check, 'bg-green-700/40 border-green-600 text-green-100')}
                      {rsvpButton('maybe', 'Maybe', HelpCircle, 'bg-yellow-700/40 border-yellow-600 text-yellow-100')}
                      {rsvpButton('declined', 'Not Going', X, 'bg-red-700/40 border-red-600 text-red-100')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && data?.calendarData && data.calendarData.length > 0 && (
        <div className="bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-700 mt-6">
          <h3 className="text-lg font-semibold mb-4 text-white">Monthly Details</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Total Hours</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Entries</th>
                </tr>
              </thead>
              <tbody className="bg-gray-800 divide-y divide-gray-200">
                {data.calendarData.map(day => (
                  <tr key={day.date}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                      {moment(day.date).format('MMM Do, YYYY')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {day.hours.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {day.entries}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
