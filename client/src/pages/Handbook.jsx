import React from 'react';
import { BookOpen } from 'lucide-react';
import { HandbookContent } from '../components/HandbookContent';

export default function Handbook() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-700">
        <div className="flex items-center space-x-3 mb-2">
          <BookOpen className="text-indigo-500 flex-shrink-0" size={28} />
          <h2 className="text-xl sm:text-2xl font-bold text-white">Employee Handbook</h2>
        </div>
        <p className="text-sm text-gray-400">Policies, procedures, and important information.</p>
      </div>

      <div className="bg-gray-800 rounded-xl shadow-sm border border-gray-700 p-4 sm:p-6 md:p-8">
        <HandbookContent />
      </div>
    </div>
  );
}
