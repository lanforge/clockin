import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, Calendar, BookOpen, Users, Settings, LogOut, Menu, X, ShieldAlert, HelpCircle, CheckSquare, DollarSign } from 'lucide-react';
import { HandbookContent } from '../components/HandbookContent';
import CustomCheckbox from '../components/CustomCheckbox';
import OnboardingModal from '../components/OnboardingModal';

export const AppLayout = () => {
  const { user, logout, checkAuth } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showHandbookModal, setShowHandbookModal] = useState(false);
  const [agreedToHandbook, setAgreedToHandbook] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user && (!user.handbookAgreed || user.handbookVersion !== '1.0')) {
      setShowHandbookModal(true);
    }
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleAgreeHandbook = async () => {
    if (!agreedToHandbook) return;
    setIsSubmitting(true);
    try {
      // Fetch the public IP so it accurately reflects the user's actual IP even in local development
      let clientIp = '';
      try {
        const ipRes = await axios.get('https://api.ipify.org?format=json');
        clientIp = ipRes.data.ip;
      } catch (ipErr) {
        console.error('Failed to fetch public IP', ipErr);
      }

      await axios.post('/api/auth/agree-handbook', { version: '1.0', clientIp });
      await checkAuth();
      setShowHandbookModal(false);
    } catch (err) {
      console.error('Failed to agree to handbook', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={20} /> },
    { name: 'Calendar', path: '/calendar', icon: <Calendar size={20} /> },
    { name: 'Tasks', path: '/tasks', icon: <CheckSquare size={20} /> },
    ...(user?.payType !== 'none' ? [{ name: 'Paychecks', path: '/paychecks', icon: <DollarSign size={20} /> }] : []),
    { name: 'Company', path: '/company', icon: <Users size={20} /> },
    { name: 'Handbook', path: '/handbook', icon: <BookOpen size={20} /> },
    { name: 'Help', path: '/help', icon: <HelpCircle size={20} /> },
  ];

  if (user?.role === 'admin') {
    navItems.push({ name: 'Admin', path: '/admin', icon: <Settings size={20} /> });
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="sticky top-0 z-40 md:hidden bg-indigo-600 text-white p-4 flex justify-between items-center shadow-md">
        <img src="https://lanforge.co/logo-2.png" alt="LANForge" className="h-8" />
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
          {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-gray-800 shadow-xl transform transition-transform duration-300 ease-in-out md:sticky md:top-0 md:h-screen md:self-start md:translate-x-0 flex flex-col
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 border-b border-gray-700 flex justify-between items-center">
          <div>
            <img src="https://lanforge.co/logo-2.png" alt="LANForge" className="h-8 mb-1" />
            <p className="text-sm text-gray-400">Employee Portal</p>
          </div>
          <button className="md:hidden text-gray-400" onClick={() => setIsSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <div className="p-4 flex items-center space-x-3 border-b border-gray-700 bg-gray-900">
          <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg">
            {user?.username?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {user?.username}
            </p>
            <p className="text-xs text-gray-400 capitalize truncate">
              {user?.role}
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {navItems.map((item) => {
              const isActive = location.pathname.startsWith(item.path);
              return (
                <li key={item.name}>
                  <Link
                    to={item.path}
                    onClick={() => setIsSidebarOpen(false)}
                    className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                      isActive 
                        ? 'bg-indigo-900/50 text-indigo-400 font-medium' 
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }`}
                  >
                    {item.icon}
                    <span>{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-700">
          <button
            onClick={handleLogout}
            className="flex items-center space-x-3 text-red-300 hover:bg-red-900/50 w-full px-3 py-2.5 rounded-lg transition-colors"
          >
            <LogOut size={20} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <main className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 overflow-x-hidden">
          <Outlet />
        </main>
      </div>

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Forced contract-signing modal (blocks the app until required docs are signed) */}
      <OnboardingModal />

      {/* Handbook Agreement Modal */}
      {showHandbookModal && (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-2 sm:p-4">
          <div className="bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] flex flex-col border border-gray-700">
            <div className="p-4 sm:p-6 border-b border-gray-700 flex justify-between items-center bg-gray-800 rounded-t-xl">
              <h2 className="text-base sm:text-xl font-bold text-white flex items-center min-w-0">
                <BookOpen className="mr-2 sm:mr-3 text-indigo-500 flex-shrink-0" size={20} />
                <span className="truncate">Workforce Handbook & Policies</span>
              </h2>
            </div>

            <div className="p-3 sm:p-6 overflow-y-auto flex-1 bg-gray-900">
              <div className="bg-gray-800 p-4 sm:p-6 rounded-lg border border-gray-700">
                <HandbookContent />
              </div>
            </div>

            <div className="p-4 sm:p-6 border-t border-gray-700 bg-gray-800 rounded-b-xl">
              <div className="mb-4">
                <CustomCheckbox
                  id="agreedToHandbook"
                  checked={agreedToHandbook}
                  onChange={(e) => setAgreedToHandbook(e.target.checked)}
                  label="I have read and agree to the Workforce Handbook & Policies"
                />
              </div>
              
              <div className="flex justify-end">
                <button
                  onClick={handleAgreeHandbook}
                  disabled={!agreedToHandbook || isSubmitting}
                  className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                    !agreedToHandbook || isSubmitting
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {isSubmitting ? 'Submitting...' : 'Agree & Continue'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
