import React from 'react';
import { HelpCircle } from 'lucide-react';
import { HelpAndReporting } from '../components/HelpAndReporting';

export default function Help() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-700">
        <div className="flex items-center space-x-3 mb-2">
          <HelpCircle className="text-indigo-500" size={28} />
          <h2 className="text-2xl font-bold text-white">Help & Support</h2>
        </div>
        <p className="text-gray-400">Request assistance, contact HR, or submit anonymous reports.</p>
      </div>

      <HelpAndReporting />
    </div>
  );
}
