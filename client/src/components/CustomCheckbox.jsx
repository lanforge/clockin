import React from 'react';
import { Check } from 'lucide-react';

export default function CustomCheckbox({ id, checked, onChange, label, icon: Icon }) {
  return (
    <div className="flex items-center space-x-2 pt-2 pb-2 cursor-pointer" onClick={() => onChange({ target: { checked: !checked } })}>
      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
        checked ? 'bg-indigo-600 border-indigo-600' : 'bg-gray-700 border-gray-600'
      }`}>
        {checked && <Check size={12} className="text-white font-bold" strokeWidth={4} />}
      </div>
      <label htmlFor={id} className="text-sm font-medium text-gray-300 flex items-center cursor-pointer pointer-events-none">
        {Icon && <Icon size={16} className={`${checked ? 'text-indigo-400' : 'text-gray-500'} mr-2 transition-colors`} />}
        <span className={checked ? 'text-white' : 'text-gray-300'}>{label}</span>
      </label>
    </div>
  );
}
