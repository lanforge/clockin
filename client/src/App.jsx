import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';

// Placeholder Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Calendar from './pages/Calendar';
import Company from './pages/Company';
import Handbook from './pages/Handbook';
import Help from './pages/Help';
import AdminPanel from './pages/AdminPanel';
import AdminUser from './pages/AdminUser';
import ResetPassword from './pages/ResetPassword';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/company" element={<Company />} />
          <Route path="/handbook" element={<Handbook />} />
          <Route path="/help" element={<Help />} />
          <Route path="/admin" element={
            <ProtectedRoute requireAdmin={true}>
              <AdminPanel />
            </ProtectedRoute>
          } />
          <Route path="/admin/user/:id" element={
            <ProtectedRoute requireAdmin={true}>
              <AdminUser />
            </ProtectedRoute>
          } />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
