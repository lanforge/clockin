import React, { useState, useEffect } from 'react';
import axios from 'axios';
import moment from 'moment';
import { ChevronLeft, ChevronRight, Clock, AlertCircle } from 'lucide-react';

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(moment());
  const [data, setData] = useState(null);
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

  useEffect(() => {
    fetchCalendar(currentDate.month() + 1, currentDate.year());
  }, [currentDate]);

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
