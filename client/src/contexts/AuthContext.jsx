import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { detectTz } from '../utils/datetime';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

const syncTimezone = async (storedTz) => {
  const localTz = detectTz();
  if (!localTz || localTz === storedTz) return storedTz;
  try {
    await axios.post('/api/auth/timezone', { timezone: localTz });
    return localTz;
  } catch {
    return storedTz;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await axios.get('/api/auth/me');
      if (res.data.success) {
        const fetched = res.data.user;
        const finalTz = await syncTimezone(fetched.timezone);
        setUser({ ...fetched, timezone: finalTz });
      } else {
        setUser(null);
      }
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    try {
      const res = await axios.post('/api/auth/login', { username, password });
      if (res.data.success) {
        if (res.data.needsPasswordReset) {
          return { success: true, needsPasswordReset: true };
        }
        setUser(res.data.user);
        return { success: true };
      }
      return { success: false, error: res.data.error || 'Login failed' };
    } catch (err) {
      return { 
        success: false, 
        error: err.response?.data?.error || 'An error occurred during login' 
      };
    }
  };

  const logout = async () => {
    try {
      await axios.post('/api/auth/logout');
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, loading, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};
