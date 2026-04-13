import React from 'react';
import { X, AlertTriangle, CheckCircle, Info } from 'lucide-react';

export default function CustomModal({ 
  isOpen, 
  title, 
  message, 
  type = 'confirm', // 'confirm', 'alert', 'success', 'error'
  onConfirm, 
  onCancel, 
  confirmText = 'Confirm', 
  cancelText = 'Cancel' 
}) {
  if (!isOpen) return null;

  const icons = {
    confirm: <AlertTriangle className="text-yellow-500 w-6 h-6" />,
    alert: <Info className="text-blue-500 w-6 h-6" />,
    success: <CheckCircle className="text-green-500 w-6 h-6" />,
    error: <AlertTriangle className="text-red-500 w-6 h-6" />
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl shadow-xl border border-gray-700 w-full max-w-md overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-800/50">
          <div className="flex items-center space-x-2">
            {icons[type]}
            <h3 className="text-lg font-semibold text-white">{title || (type === 'confirm' ? 'Confirm Action' : type === 'success' ? 'Success' : 'Alert')}</h3>
          </div>
          {type !== 'confirm' && (
            <button onClick={onCancel} className="text-gray-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          )}
        </div>
        <div className="p-6">
          <p className="text-gray-300 whitespace-pre-wrap">{message}</p>
        </div>
        <div className="p-4 border-t border-gray-700 flex justify-end space-x-3 bg-gray-900/50">
          {(type === 'confirm') && (
            <button 
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
            >
              {cancelText}
            </button>
          )}
          <button 
            onClick={onConfirm || onCancel}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
              type === 'confirm' ? 'bg-indigo-600 hover:bg-indigo-700' :
              type === 'success' ? 'bg-green-600 hover:bg-green-700' :
              type === 'error' ? 'bg-red-600 hover:bg-red-700' :
              'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {type === 'confirm' ? confirmText : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
