// Input validation utilities
const validator = {
  // Validate username
  validateUsername: (username) => {
    if (!username || typeof username !== 'string') {
      return { valid: false, error: 'Username is required' };
    }
    
    if (username.length < 3 || username.length > 30) {
      return { valid: false, error: 'Username must be between 3 and 30 characters' };
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return { valid: false, error: 'Username can only contain letters, numbers, and underscores' };
    }
    
    return { valid: true };
  },
  
  // Validate password
  validatePassword: (password) => {
    if (!password || typeof password !== 'string') {
      return { valid: false, error: 'Password is required' };
    }
    
    if (password.length < 6) {
      return { valid: false, error: 'Password must be at least 6 characters' };
    }
    
    return { valid: true };
  },
  
  // Validate email
  validateEmail: (email) => {
    if (!email) {
      return { valid: true }; // Email is optional
    }
    
    if (typeof email !== 'string') {
      return { valid: false, error: 'Email must be a string' };
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { valid: false, error: 'Invalid email format' };
    }
    
    return { valid: true };
  },
  
  // Validate hourly rate
  validateHourlyRate: (rate) => {
    if (rate === undefined || rate === null) {
      return { valid: false, error: 'Hourly rate is required' };
    }
    
    const numRate = parseFloat(rate);
    if (isNaN(numRate)) {
      return { valid: false, error: 'Hourly rate must be a number' };
    }
    
    if (numRate < 0) {
      return { valid: false, error: 'Hourly rate cannot be negative' };
    }
    
    if (numRate > 1000) {
      return { valid: false, error: 'Hourly rate cannot exceed $1000' };
    }
    
    return { valid: true, value: numRate };
  },
  
  // Validate date
  validateDate: (date) => {
    if (!date) {
      return { valid: false, error: 'Date is required' };
    }
    
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return { valid: false, error: 'Invalid date format' };
    }
    
    return { valid: true, value: parsedDate };
  },
  
  // Validate time entry
  validateTimeEntry: (clockIn, clockOut) => {
    const clockInDate = new Date(clockIn);
    const clockOutDate = clockOut ? new Date(clockOut) : null;
    
    if (isNaN(clockInDate.getTime())) {
      return { valid: false, error: 'Invalid clock in time' };
    }
    
    if (clockOutDate && isNaN(clockOutDate.getTime())) {
      return { valid: false, error: 'Invalid clock out time' };
    }
    
    if (clockOutDate && clockOutDate < clockInDate) {
      return { valid: false, error: 'Clock out time cannot be before clock in time' };
    }
    
    return { valid: true };
  },
  
  // Sanitize input
  sanitizeInput: (input) => {
    if (typeof input !== 'string') return input;
    
    // Remove potentially dangerous characters
    return input
      .replace(/[<>]/g, '') // Remove < and >
      .trim()
      .substring(0, 1000); // Limit length
  },
  
  // Sanitize notes
  sanitizeNotes: (notes) => {
    if (!notes) return '';
    if (typeof notes !== 'string') return '';
    
    return notes
      .replace(/[<>]/g, '') // Remove < and >
      .trim()
      .substring(0, 500); // Limit length
  }
};

module.exports = validator;
