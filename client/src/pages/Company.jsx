import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AlertCircle, Users, BookOpen } from 'lucide-react';

export default function Company() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('LANForge');

  useEffect(() => {
    const fetchHandbook = async () => {
      try {
        const res = await axios.get('/api/handbook');
        if (res.data.success) {
          setData(res.data.data);
        }
      } catch (err) {
        console.error('Failed to fetch handbook', err);
        setError('Failed to load handbook data');
      } finally {
        setLoading(false);
      }
    };
    fetchHandbook();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const { lanforgeHierarchy, ascendanceHierarchy } = data || {};

  const renderHierarchy = (hierarchyData) => {
    if (!hierarchyData || Object.keys(hierarchyData).length === 0) {
      return <p className="text-gray-400 italic p-4 text-center">No hierarchy data available.</p>;
    }

    return (
      <div className="space-y-8 mt-6">
        {Object.keys(hierarchyData).sort().map(level => (
          <div key={level} className="relative">
            <div className="flex items-center mb-4">
              <div className="h-px bg-gray-600 flex-1"></div>
              <span className="px-4 text-sm font-medium text-gray-400 uppercase tracking-wider bg-gray-800">
                Level {level}
              </span>
              <div className="h-px bg-gray-600 flex-1"></div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {hierarchyData[level].map(person => (
                <div key={person._id} className="bg-gray-800 rounded-xl shadow-sm border border-gray-700 p-5 hover:shadow-md transition-shadow relative overflow-hidden group">
                  <div 
                    className="absolute top-0 left-0 w-1.5 h-full"
                    style={{ backgroundColor: person.color || '#4f46e5' }}
                  ></div>
                  <div className="ml-3">
                    <h4 className="text-lg font-bold text-white">{person.name}</h4>
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <p className="text-sm text-gray-300 leading-relaxed">{person.title}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-700">
        <div className="flex items-center space-x-3 mb-2">
          <BookOpen className="text-indigo-500" size={28} />
          <h2 className="text-2xl font-bold text-white">Company</h2>
        </div>
        <p className="text-gray-400">Company hierarchy and role structures</p>
      </div>

      {error && (
        <div className="bg-red-900/50 border-l-4 border-red-400 p-4 rounded-md flex items-start">
          <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 mr-3" />
          <p className="text-sm text-red-200">{error}</p>
        </div>
      )}

      <div className="bg-gray-800 rounded-xl shadow-sm border border-gray-700 overflow-hidden">
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('LANForge')}
            className={`flex-1 py-4 px-2 sm:px-6 text-center font-medium text-xs sm:text-sm transition-colors ${
              activeTab === 'LANForge'
                ? 'bg-indigo-900/50 text-indigo-400 border-b-2 border-indigo-600'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'
            }`}
          >
            LANForge Hierarchy
          </button>
          <button
            onClick={() => setActiveTab('Ascendance')}
            className={`flex-1 py-4 px-2 sm:px-6 text-center font-medium text-xs sm:text-sm transition-colors ${
              activeTab === 'Ascendance'
                ? 'bg-indigo-900/50 text-indigo-400 border-b-2 border-indigo-600'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'
            }`}
          >
            Ascendance Hierarchy
          </button>
        </div>
        
        <div className="p-6 md:p-8 bg-gray-900/50">
          {activeTab === 'LANForge' ? renderHierarchy(lanforgeHierarchy) : renderHierarchy(ascendanceHierarchy)}
        </div>
      </div>
    </div>
  );
}
