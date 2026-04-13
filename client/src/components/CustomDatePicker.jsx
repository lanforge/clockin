import React, { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import moment from 'moment';

export default function CustomDatePicker({ value, onChange, name }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(value ? moment(value) : moment());
  const popupRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const daysInMonth = currentMonth.daysInMonth();
  const startDay = moment(currentMonth).startOf('month').day();

  const days = [];
  for (let i = 0; i < startDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const handleDateSelect = (day) => {
    const newDate = moment(currentMonth).date(day).format('YYYY-MM-DD');
    onChange({ target: { name, value: newDate } });
    setIsOpen(false);
  };

  return (
    <div className="relative w-full" ref={popupRef}>
      <div 
        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white cursor-pointer flex justify-between items-center focus:outline-none focus:border-indigo-500"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{value ? moment(value).format('MMM D, YYYY') : 'Select a date'}</span>
        <CalendarIcon size={16} className="text-gray-400" />
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-64 p-4 bg-gray-800 border border-gray-600 rounded-lg shadow-xl">
          <div className="flex justify-between items-center mb-4">
            <button 
              type="button"
              className="p-1 hover:bg-gray-700 rounded text-gray-300"
              onClick={() => setCurrentMonth(moment(currentMonth).subtract(1, 'month'))}
            >
              <ChevronLeft size={16} />
            </button>
            <div className="font-semibold text-white text-sm">
              {currentMonth.format('MMMM YYYY')}
            </div>
            <button 
              type="button"
              className="p-1 hover:bg-gray-700 rounded text-gray-300"
              onClick={() => setCurrentMonth(moment(currentMonth).add(1, 'month'))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-400 mb-2">
            <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
          </div>
          
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, index) => {
              if (!day) return <div key={`empty-${index}`} className="h-8"></div>;
              
              const dateStr = moment(currentMonth).date(day).format('YYYY-MM-DD');
              const isSelected = value === dateStr;
              const isToday = moment().format('YYYY-MM-DD') === dateStr;
              
              return (
                <button
                  type="button"
                  key={index}
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-sm transition-colors ${
                    isSelected 
                      ? 'bg-indigo-600 text-white font-bold' 
                      : isToday
                        ? 'bg-gray-700 text-indigo-400 font-bold border border-indigo-500/30'
                        : 'text-gray-200 hover:bg-gray-700'
                  }`}
                  onClick={() => handleDateSelect(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
