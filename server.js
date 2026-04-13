require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const moment = require('moment');
const { createObjectCsvWriter } = require('csv-writer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const cron = require('node-cron');
const { Resend } = require('resend');

const resend = process.env.RESEND_KEY ? new Resend(process.env.RESEND_KEY) : null;

const createEmailTemplate = (title, content) => `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f3f4f6;">
  <div style="text-align: center; padding-bottom: 20px;">
    <h1 style="color: #4f46e5; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">LANForge</h1>
    <p style="color: #6b7280; font-size: 14px; margin-top: 5px; text-transform: uppercase; letter-spacing: 1px;">Employee Dashboard</p>
  </div>
  <div style="background-color: #ffffff; padding: 32px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
    <h2 style="color: #111827; margin-top: 0; margin-bottom: 24px; font-size: 20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px;">${title}</h2>
    <div style="color: #374151; line-height: 1.6; font-size: 16px;">
      ${content}
    </div>
  </div>
  <div style="text-align: center; margin-top: 24px; color: #9ca3af; font-size: 12px; line-height: 1.5;">
    <p style="margin: 0;">This is an automated message from the LANForge Employee Dashboard.</p>
    <p style="margin: 4px 0 0 0;">&copy; ${new Date().getFullYear()} LANForge. All rights reserved.</p>
  </div>
</div>
`;

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Trust proxy to correctly parse X-Forwarded-For headers when behind a load balancer/reverse proxy
app.set('trust proxy', true);

// Security middleware - disable CSP for now to fix inline event handlers
app.use(helmet({
  contentSecurityPolicy: false
}));

// Compression middleware
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);
app.use('/auth/', limiter);

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://damian:wJwxO0xQYgrLV9AH@altoev.u9lcgej.mongodb.net/lanforge-employee-dashboard?retryWrites=true&w=majority&appName=LANForgeEmployeeDashboard';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB Atlas');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Define Mongoose schemas
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: { type: String },
  role: { type: String, default: 'employee' },
  hourly_rate: { type: Number, default: 0.0 },
  companies: {
    lanforge: {
      active: { type: Boolean, default: true },
      title: { type: String, default: 'Employee' },
      level: { type: Number, default: 3, min: 1, max: 5 }
    },
    ascendance: {
      active: { type: Boolean, default: false },
      title: { type: String, default: 'Employee' },
      level: { type: Number, default: 3, min: 1, max: 5 }
    }
  },
  created_at: { type: Date, default: Date.now },
  needs_password_reset: { type: Boolean, default: false },
  temporary_password: { type: String },
  handbook_agreed: { type: Boolean, default: false },
  handbook_version: { type: String },
  handbook_agreed_ip: { type: String },
  handbook_agreed_date: { type: Date }
});

const timeEntrySchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  clock_in: { type: Date, required: true },
  clock_out: { type: Date },
  notes: { type: String },
  created_at: { type: Date, default: Date.now }
});

const helpInquirySchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username: { type: String },
  inquiry_type: { type: String, required: true },
  submitter_name: { type: String },
  submitter_email: { type: String },
  subject: { type: String, required: true },
  details: { type: String, required: true },
  urgency: { type: String, default: 'medium' },
  incident_date: { type: Date },
  involved_parties: { type: String },
  status: { type: String, default: 'new' },
  is_anonymous: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  type: { type: String, default: 'info', enum: ['info', 'warning', 'urgent', 'success'] },
  display_type: { type: String, default: 'banner', enum: ['banner', 'popup'] },
  start_date: { type: Date, default: Date.now },
  end_date: { type: Date },
  is_active: { type: Boolean, default: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Create models
const User = mongoose.model('User', userSchema);
const TimeEntry = mongoose.model('TimeEntry', timeEntrySchema);
const HelpInquiry = mongoose.model('HelpInquiry', helpInquirySchema);
const Announcement = mongoose.model('Announcement', announcementSchema);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'client/dist')));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'lanforge-employee-dashboard-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: false, // Set to false for development, true for production with HTTPS
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Authentication middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId || req.session.role !== 'admin') {
    return res.redirect('/dashboard');
  }
  next();
}

// API Routes
app.get('/api/auth/me', async (req, res) => {
  if (req.session.userId) {
    try {
      const user = await User.findById(req.session.userId);
      res.json({
        success: true,
        user: {
          username: req.session.username,
          role: req.session.role,
          hourlyRate: req.session.hourlyRate,
          needsPasswordReset: req.session.needsPasswordReset,
          handbookAgreed: user.handbook_agreed,
          handbookVersion: user.handbook_version
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Database error' });
    }
  } else {
    res.json({ success: false, user: null });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('Login attempt for username:', req.body.username);
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }
    
    // Escape special characters in username to prevent regex injection
    const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const user = await User.findOne({ 
      username: { $regex: new RegExp(`^${escapedUsername}$`, 'i') } 
    });
    
    if (!user) {
      console.log('User not found:', username);
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }
    
    console.log('User found:', user.username, 'Role:', user.role);
    
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      console.log('Invalid password for user:', username);
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }
    
    console.log('Password valid for user:', username);
    
    // Check if user needs to reset password
    if (user.needs_password_reset) {
      console.log('User needs password reset:', username);
      req.session.userId = user._id;
      req.session.username = user.username;
      req.session.needsPasswordReset = true;
      return res.json({ success: true, needsPasswordReset: true, user: { username: user.username, role: user.role } });
    }
    
    // Set session data
    req.session.userId = user._id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.hourlyRate = user.hourly_rate;
    
    console.log('Session data set:', {
      userId: req.session.userId,
      username: req.session.username,
      role: req.session.role
    });
    
    // Save session before redirect
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ success: false, error: 'Session error occurred' });
      }
      console.log('Session saved, sending user info');
      res.json({ 
        success: true, 
        user: {
          username: user.username,
          role: user.role,
          hourlyRate: user.hourly_rate,
          handbookAgreed: user.handbook_agreed,
          handbookVersion: user.handbook_version
        }
      });
    });
    
  } catch (err) {
    console.error('Login error:', err);
    console.error('Error stack:', err.stack);
    res.status(500).json({ success: false, error: 'An error occurred during login' });
  }
});


app.post('/api/auth/agree-handbook', requireAuth, async (req, res) => {
  try {
    const { version, clientIp } = req.body;
    
    // Use frontend-provided clientIp (from ipify) or fall back to Express's trusted req.ip
    let ip = clientIp || req.ip || req.socket.remoteAddress;
    
    // Convert IPv6 loopback to IPv4 format for readability
    if (ip === '::1') ip = '127.0.0.1';

    await User.findByIdAndUpdate(req.session.userId, {
      handbook_agreed: true,
      handbook_version: version || '1.0',
      handbook_agreed_ip: ip,
      handbook_agreed_date: new Date()
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Handbook agreement error:', err);
    res.status(500).json({ success: false, error: 'Failed to save handbook agreement' });
  }
});

app.get('/api/dashboard', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const currentDate = moment().format('YYYY-MM-DD');
    
    // Get today's time entries
    const todayEntries = await TimeEntry.find({
      user_id: userId,
      clock_in: {
        $gte: moment().startOf('day').toDate(),
        $lt: moment().endOf('day').toDate()
      }
    }).sort({ clock_in: -1 });
    
    // Get current clock status
    const currentEntry = await TimeEntry.findOne({
      user_id: userId,
      clock_out: null
    }).sort({ clock_in: -1 });
    
    // Get monthly summary
    const monthStart = moment().startOf('month').toDate();
    const monthEnd = moment().endOf('month').toDate();
    
    const monthlyEntries = await TimeEntry.find({
      user_id: userId,
      clock_in: { $gte: monthStart, $lt: monthEnd }
    });
    
    let totalHours = 0;
    monthlyEntries.forEach(entry => {
      const endTime = entry.clock_out || new Date();
      const hours = (endTime - entry.clock_in) / (1000 * 60 * 60);
      totalHours += hours;
    });
    
    // Pay Period Summary
    const currentDay = moment().date();
    let periodStart, periodEnd;
    
    if (currentDay <= 15) {
      periodStart = moment().startOf('month').toDate();
      periodEnd = moment().date(15).endOf('day').toDate();
    } else {
      periodStart = moment().date(16).startOf('day').toDate();
      periodEnd = moment().endOf('month').toDate();
    }
    
    const payPeriodEntries = await TimeEntry.find({
      user_id: userId,
      clock_in: { $gte: periodStart, $lt: periodEnd }
    });
    
    let periodTotalHours = 0;
    let basePeriodTotalHours = 0;
    payPeriodEntries.forEach(entry => {
      const endTime = entry.clock_out || new Date();
      const hours = (endTime - entry.clock_in) / (1000 * 60 * 60);
      periodTotalHours += hours;
      if (entry.clock_out) {
        basePeriodTotalHours += hours;
      }
    });

    const userRecord = await User.findById(userId);
    const hourlyRate = userRecord ? userRecord.hourly_rate : 0.0;
    const periodEstimatedPay = periodTotalHours * hourlyRate;
    
    // Get active announcements
    const now = new Date();
    const announcements = await Announcement.find({
      is_active: true,
      start_date: { $lte: now },
      $or: [
        { end_date: null },
        { end_date: { $gte: now } }
      ]
    }).sort({ created_at: -1 }).limit(5);
    
    res.json({
      success: true,
      data: {
        user: {
          username: req.session.username,
          role: req.session.role,
          hourlyRate: hourlyRate
        },
        todayEntries,
        currentEntry,
        monthlySummary: {
          totalHours: totalHours.toFixed(2),
          estimatedPay: '0.00' // Hourly rates removed
        },
        payPeriodSummary: {
          totalHours: periodTotalHours.toFixed(2),
          baseTotalHours: basePeriodTotalHours,
          estimatedPay: periodEstimatedPay.toFixed(2),
          periodStart: moment(periodStart).format('MMM D'),
          periodEnd: moment(periodEnd).format('MMM D')
        },
        currentDate,
        announcements
      }
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ success: false, error: 'Error loading dashboard' });
  }
});

app.post('/api/clockin', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const timeEntry = new TimeEntry({
      user_id: userId,
      clock_in: new Date()
    });
    
    await timeEntry.save();
    
    res.json({ success: true, entryId: timeEntry._id });
  } catch (err) {
    console.error('Clock in error:', err);
    res.status(500).json({ success: false, error: 'Failed to clock in' });
  }
});

app.post('/api/clockout', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const result = await TimeEntry.findOneAndUpdate(
      { user_id: userId, clock_out: null },
      { clock_out: new Date() },
      { sort: { clock_in: -1 }, new: true }
    );
    
    if (!result) {
      return res.status(400).json({ success: false, error: 'No active clock in found' });
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Clock out error:', err);
    res.status(500).json({ success: false, error: 'Failed to clock out' });
  }
});

// Add notes to current time entry
app.post('/api/add-notes', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { notes } = req.body;
    
    const result = await TimeEntry.findOneAndUpdate(
      { user_id: userId, clock_out: null },
      { notes },
      { sort: { clock_in: -1 }, new: true }
    );
    
    if (!result) {
      return res.status(400).json({ success: false, error: 'No active clock in found' });
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Add notes error:', err);
    res.status(500).json({ success: false, error: 'Failed to add notes' });
  }
});

// Update existing time entry notes
app.post('/api/update-entry-notes', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { entryId, notes } = req.body;
    
    const result = await TimeEntry.findOneAndUpdate(
      { _id: entryId, user_id: userId },
      { notes },
      { new: true }
    );
    
    if (!result) {
      return res.status(404).json({ success: false, error: 'Time entry not found' });
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Update notes error:', err);
    res.status(500).json({ success: false, error: 'Failed to update notes' });
  }
});

app.get('/api/calendar', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { month, year } = req.query;
    const targetMonth = month || moment().month() + 1;
    const targetYear = year || moment().year();
    
    // Ensure proper date formatting with padding
    const monthStr = targetMonth.toString().padStart(2, '0');
    const monthStart = moment(`${targetYear}-${monthStr}-01`, 'YYYY-MM-DD').startOf('month').toDate();
    const monthEnd = moment(`${targetYear}-${monthStr}-01`, 'YYYY-MM-DD').endOf('month').toDate();
    
    // Get aggregated calendar data with proper day splitting
    // We need to handle entries that span multiple days
    const allEntries = await TimeEntry.find({
      user_id: userId,
      clock_in: { $gte: monthStart, $lt: monthEnd }
    }).sort({ clock_in: 1 });
    
    // Manually aggregate with day splitting
    const calendarData = [];
    const hoursByDate = {};
    const entriesByDateCount = {};
    
    allEntries.forEach(entry => {
      const clockIn = moment(entry.clock_in);
      const clockOut = entry.clock_out ? moment(entry.clock_out) : moment();
      
      // If entry spans multiple days, split it
      const startDate = clockIn.clone().startOf('day');
      const endDate = clockOut.clone().startOf('day');
      
      if (startDate.isSame(endDate, 'day')) {
        // Entry is within the same day
        const dateStr = startDate.format('YYYY-MM-DD');
        const hours = (clockOut - clockIn) / (1000 * 60 * 60);
        
        if (!hoursByDate[dateStr]) {
          hoursByDate[dateStr] = 0;
          entriesByDateCount[dateStr] = 0;
        }
        hoursByDate[dateStr] += hours;
        entriesByDateCount[dateStr] += 1;
      } else {
        // Entry spans multiple days - split it
        let currentDate = startDate.clone();
        while (currentDate.isSameOrBefore(endDate, 'day')) {
          const dateStr = currentDate.format('YYYY-MM-DD');
          
          // Calculate hours for this day
          const dayStart = currentDate.clone().startOf('day');
          const dayEnd = currentDate.clone().endOf('day');
          
          const entryStart = currentDate.isSame(startDate, 'day') ? clockIn : dayStart;
          const entryEnd = currentDate.isSame(endDate, 'day') ? clockOut : dayEnd;
          
          const hoursWorked = (entryEnd - entryStart) / (1000 * 60 * 60);
          if (hoursWorked > 0) {
            if (!hoursByDate[dateStr]) {
              hoursByDate[dateStr] = 0;
              entriesByDateCount[dateStr] = 0;
            }
            hoursByDate[dateStr] += hoursWorked;
            // Only count as a separate entry if it's a significant portion of the day
            if (hoursWorked > 0.5) { // More than 30 minutes
              entriesByDateCount[dateStr] += 1;
            }
          }
          
          currentDate.add(1, 'day');
        }
      }
    });
    
    // Convert to array format
    Object.keys(hoursByDate).forEach(dateStr => {
      calendarData.push({
        date: dateStr,
        hours: hoursByDate[dateStr],
        entries: entriesByDateCount[dateStr] || 1
      });
    });
    
    // Sort by date
    calendarData.sort((a, b) => a.date.localeCompare(b.date));
    
    // Get detailed time entries for the month
    const detailedEntries = await TimeEntry.find({
      user_id: userId,
      clock_in: { $gte: monthStart, $lt: monthEnd }
    }).sort({ clock_in: 1 });
    
    // Group detailed entries by date and handle entries that span multiple days
    const entriesByDate = {};
    detailedEntries.forEach(entry => {
      const plainEntry = entry.toObject ? entry.toObject() : entry;
      const clockIn = moment(plainEntry.clock_in);
      const clockOut = plainEntry.clock_out ? moment(plainEntry.clock_out) : moment();
      
      // If entry spans multiple days, we need to split it
      const startDate = clockIn.clone().startOf('day');
      const endDate = clockOut.clone().startOf('day');
      
      if (startDate.isSame(endDate, 'day')) {
        // Entry is within the same day
        const dateStr = startDate.format('YYYY-MM-DD');
        if (!entriesByDate[dateStr]) {
          entriesByDate[dateStr] = [];
        }
        entriesByDate[dateStr].push({
          clock_in: plainEntry.clock_in,
          clock_out: plainEntry.clock_out,
          notes: plainEntry.notes
        });
      } else {
        // Entry spans multiple days - split it
        let currentDate = startDate.clone();
        while (currentDate.isSameOrBefore(endDate, 'day')) {
          const dateStr = currentDate.format('YYYY-MM-DD');
          if (!entriesByDate[dateStr]) {
            entriesByDate[dateStr] = [];
          }
          
          // Calculate hours for this day
          const dayStart = currentDate.clone().startOf('day');
          const dayEnd = currentDate.clone().endOf('day');
          
          const entryStart = currentDate.isSame(startDate, 'day') ? clockIn : dayStart;
          const entryEnd = currentDate.isSame(endDate, 'day') ? clockOut : dayEnd;
          
          // Only add if there are actual hours worked on this day
          const hoursWorked = (entryEnd - entryStart) / (1000 * 60 * 60);
          if (hoursWorked > 0) {
            entriesByDate[dateStr].push({
              clock_in: entryStart.toDate(),
              clock_out: entryEnd.toDate(),
              notes: plainEntry.notes,
              is_partial: true
            });
          }
          
          currentDate.add(1, 'day');
        }
      }
    });
    
    res.json({
      success: true,
      data: {
        calendarData,
        entriesByDate, // Send as object, not stringified for JSON API
        currentMonth: targetMonth,
        currentYear: targetYear,
        monthName: moment(`${targetYear}-${monthStr}-01`, 'YYYY-MM-DD').format('MMMM YYYY')
      }
    });
  } catch (err) {
    console.error('Calendar error:', err);
    res.status(500).json({ success: false, error: 'Error loading calendar' });
  }
});

// Admin routes
app.get('/api/admin', requireAdmin, async (req, res) => {
  try {
    const users = await User.aggregate([
      {
        $lookup: {
          from: 'timeentries',
          localField: '_id',
          foreignField: 'user_id',
          as: 'timeEntries'
        }
      },
      {
        $project: {
          username: 1,
          email: 1,
          role: 1,
          hourly_rate: 1,
          total_entries: { $size: '$timeEntries' },
          total_hours: {
            $sum: {
              $map: {
                input: '$timeEntries',
                as: 'entry',
                in: {
                  $divide: [
                    { $subtract: [{ $ifNull: ['$$entry.clock_out', new Date()] }, '$$entry.clock_in'] },
                    1000 * 60 * 60
                  ]
                }
              }
            }
          }
        }
      },
      { $sort: { role: 1, username: 1 } }
    ]);
    
    res.json({ success: true, data: { users } });
  } catch (err) {
    console.error('Admin error:', err);
    res.status(500).json({ success: false, error: 'Error loading admin panel' });
  }
});

app.get('/api/admin/user/:id', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    
    const userData = await User.findById(userId);
    if (!userData) {
      return res.redirect('/admin');
    }
    
    const timeEntries = await TimeEntry.find({ user_id: userId })
      .sort({ clock_in: -1 })
      .limit(100);

    const yearStart = moment().startOf('year').toDate();
    const yearEnd = moment().endOf('year').toDate();
    const allYearEntries = await TimeEntry.find({ 
      user_id: userId,
      clock_in: { $gte: yearStart, $lte: yearEnd }
    });

    const payPeriods = {};
    const hourlyRate = userData.hourly_rate || 0;

    allYearEntries.forEach(entry => {
      if (!entry.clock_out) return;
      
      const durationMs = new Date(entry.clock_out) - new Date(entry.clock_in);
      const hours = durationMs / (1000 * 60 * 60);
      const pay = hours * hourlyRate;
      
      const date = moment(entry.clock_in);
      const month = date.format('MMMM');
      const isFirstHalf = date.date() <= 15;
      const periodName = `${month} ${isFirstHalf ? '1st - 15th' : '16th - EOM'}`;
      const sortKey = `${date.format('YYYY-MM')}-${isFirstHalf ? '1' : '2'}`;
      
      if (!payPeriods[sortKey]) {
        payPeriods[sortKey] = { name: periodName, hours: 0, pay: 0, sortKey };
      }
      payPeriods[sortKey].hours += hours;
      payPeriods[sortKey].pay += pay;
    });

    const yearPayPeriods = Object.values(payPeriods).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    
    res.json({
      success: true,
      data: {
        userData,
        timeEntries,
        yearPayPeriods
      }
    });
  } catch (err) {
    console.error('Admin user error:', err);
    res.status(500).json({ success: false, error: 'Error loading user data' });
  }
});

app.post('/api/admin/add-time', requireAdmin, async (req, res) => {
  try {
    const { userId, date, hours, minutes } = req.body;
    const clockIn = moment(`${date} 09:00:00`).toDate();
    const clockOut = moment(clockIn).add(hours, 'hours').add(minutes, 'minutes').toDate();
    
    const timeEntry = new TimeEntry({
      user_id: userId,
      clock_in: clockIn,
      clock_out: clockOut
    });
    
    await timeEntry.save();
    
    res.json({ success: true });
  } catch (err) {
    console.error('Add time error:', err);
    res.status(500).json({ success: false, error: 'Failed to add time' });
  }
});

app.post('/api/admin/remove-time', requireAdmin, async (req, res) => {
  try {
    const { entryId } = req.body;
    await TimeEntry.findByIdAndDelete(entryId);
    res.json({ success: true });
  } catch (err) {
    console.error('Remove time error:', err);
    res.status(500).json({ success: false, error: 'Failed to remove time entry' });
  }
});

// User management routes
app.post('/api/admin/edit-user', requireAdmin, async (req, res) => {
  try {
    const { userId, username, email, role, hourly_rate, companies } = req.body;
    
    const updateData = {
      username,
      email,
      role,
      hourly_rate: parseFloat(hourly_rate)
    };
    
    if (companies) {
      updateData.companies = companies;
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    );
    
    if (!updatedUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    res.json({ success: true, user: updatedUser });
  } catch (err) {
    console.error('Edit user error:', err);
    res.status(500).json({ success: false, error: 'Failed to update user' });
  }
});

app.post('/api/admin/delete-user', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    
    // Don't allow deleting the admin user
    const user = await User.findById(userId);
    if (user && user.username === 'admin') {
      return res.status(400).json({ success: false, error: 'Cannot delete admin user' });
    }
    
    // Delete user's time entries first
    await TimeEntry.deleteMany({ user_id: userId });
    
    // Delete the user
    await User.findByIdAndDelete(userId);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete user' });
  }
});

app.post('/api/admin/create-user', requireAdmin, async (req, res) => {
  try {
    const { username, email, role, hourly_rate, companies } = req.body;
    
    // Check if user already exists
    const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existingUser = await User.findOne({ 
      username: { $regex: new RegExp(`^${escapedUsername}$`, 'i') } 
    });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Username already exists' });
    }
    
    const tempPassword = generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    
    const newUser = new User({
      username,
      password: hashedPassword,
      email,
      role: role || 'employee',
      hourly_rate: parseFloat(hourly_rate) || 0.0,
      companies: companies || {
        lanforge: { active: true, title: 'Employee', level: 3 },
        ascendance: { active: false, title: 'Employee', level: 3 }
      },
      needs_password_reset: true,
      temporary_password: tempPassword
    });
    
    await newUser.save();
    
    if (email && resend) {
      try {
        await resend.emails.send({
          from: 'staff@lanforge.co',
          to: email,
          subject: 'Welcome to LANForge Dashboard',
          html: createEmailTemplate(
            'Welcome to LANForge Dashboard',
            `
            <p>Hello <strong>${username}</strong>,</p>
            <p>An account has been created for you on the LANForge Employee Dashboard.</p>
            <div style="background-color: #f3f4f6; padding: 12px; border-radius: 6px; text-align: center; margin: 20px 0;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">Your temporary password is:</p>
              <p style="margin: 8px 0 0 0; font-size: 24px; font-weight: bold; color: #111827; letter-spacing: 2px;">${tempPassword}</p>
            </div>
            <p style="text-align: center; margin-top: 30px;">
              <a href="https://employee.lanforge.co" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Log In to Dashboard</a>
            </p>
            `
          )
        });
      } catch (emailErr) {
        console.error('Failed to send welcome email:', emailErr);
      }
    }
    
    res.json({ success: true, user: newUser, temporaryPassword: tempPassword });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ success: false, error: 'Failed to create user' });
  }
});

// Generate a random temporary password
function generateTemporaryPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

app.post('/api/admin/reset-password', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    
    // Generate a temporary password
    const tempPassword = generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { 
        password: hashedPassword,
        needs_password_reset: true,
        temporary_password: tempPassword
      },
      { new: true }
    );
    
    if (!updatedUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    if (updatedUser.email && resend) {
      try {
        await resend.emails.send({
          from: 'staff@lanforge.co',
          to: updatedUser.email,
          subject: 'Your LANForge Password Has Been Reset',
          html: createEmailTemplate(
            'Password Reset',
            `
            <p>Hello <strong>${updatedUser.username}</strong>,</p>
            <p>Your password has been reset by an administrator.</p>
            <div style="background-color: #f3f4f6; padding: 12px; border-radius: 6px; text-align: center; margin: 20px 0;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">Your temporary password is:</p>
              <p style="margin: 8px 0 0 0; font-size: 24px; font-weight: bold; color: #111827; letter-spacing: 2px;">${tempPassword}</p>
            </div>
            <p style="text-align: center; margin-top: 30px;">
              <a href="https://employee.lanforge.co" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Log In to Dashboard</a>
            </p>
            `
          )
        });
      } catch (emailErr) {
        console.error('Failed to send password reset email:', emailErr);
      }
    }
    
    res.json({ 
      success: true, 
      temporaryPassword: tempPassword,
      message: `Temporary password generated: ${tempPassword}. User will be required to reset password on next login.`
    });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, error: 'Failed to reset password' });
  }
});

// Password reset API for users
app.post('/api/auth/reset-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.session.userId;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ success: false, error: 'Current password is incorrect' });
    }
    
    // Check if new passwords match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, error: 'New passwords do not match' });
    }
    
    // Update password and clear reset flag
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(userId, {
      password: hashedPassword,
      needs_password_reset: false,
      temporary_password: null
    });
    
    // Clear the reset flag from session
    req.session.needsPasswordReset = false;
    req.session.role = user.role;
    req.session.hourlyRate = user.hourly_rate;
    
    res.json({ success: true });
  } catch (err) {
    console.error('Password reset error:', err);
    res.status(500).json({ success: false, error: 'An error occurred while resetting password' });
  }
});

app.get('/api/admin/export', requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date('2024-01-01');
    const end = endDate ? new Date(endDate) : new Date('2024-12-31');
    
    const data = await TimeEntry.aggregate([
      {
        $match: {
          clock_in: { $gte: start, $lt: end }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'user_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          username: '$user.username',
          email: '$user.email',
          hourly_rate: '$user.hourly_rate',
          clock_in: 1,
          clock_out: 1,
          hours: {
            $divide: [
              { $subtract: [{ $ifNull: ['$clock_out', new Date()] }, '$clock_in'] },
              1000 * 60 * 60
            ]
          },
          notes: 1
        }
      },
      { $sort: { clock_in: 1 } }
    ]);
    
    const csvWriter = createObjectCsvWriter({
      path: 'temp-export.csv',
      header: [
        { id: 'username', title: 'Employee' },
        { id: 'email', title: 'Email' },
        { id: 'hourly_rate', title: 'Hourly Rate' },
        { id: 'clock_in', title: 'Clock In' },
        { id: 'clock_out', title: 'Clock Out' },
        { id: 'hours', title: 'Hours Worked' },
        { id: 'notes', title: 'Notes' }
      ]
    });
    
    await csvWriter.writeRecords(data);
    res.download('temp-export.csv', `time-entries-${moment().format('YYYY-MM-DD')}.csv`);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).send('Error exporting data');
  }
});

app.get('/api/handbook', requireAuth, async (req, res) => {
  try {
    const users = await User.find({}).sort({ username: 1 });
    
    const lanforgeByLevel = {};
    const ascendanceByLevel = {};
    
    users.forEach(user => {
      // Legacy fallback
      const hasCompaniesObj = user.companies && (user.companies.lanforge || user.companies.ascendance);
      
      // LANForge
      const inLanforge = hasCompaniesObj ? user.companies?.lanforge?.active : (user.company === 'LANForge');
      if (inLanforge) {
        const level = hasCompaniesObj ? (user.companies.lanforge.level || 3) : (user.company_level || 3);
        const title = hasCompaniesObj ? (user.companies.lanforge.title || 'Employee') : (user.title || 'Employee');
        const person = {
          _id: user._id + '_lanforge',
          name: user.username,
          title: title,
          level: level,
          color: '#4f46e5'
        };
        if (!lanforgeByLevel[level]) lanforgeByLevel[level] = [];
        lanforgeByLevel[level].push(person);
      }
      
      // Ascendance
      const inAscendance = hasCompaniesObj ? user.companies?.ascendance?.active : (user.company === 'Ascendance');
      if (inAscendance) {
        const level = hasCompaniesObj ? (user.companies.ascendance.level || 3) : (user.company_level || 3);
        const title = hasCompaniesObj ? (user.companies.ascendance.title || 'Employee') : (user.title || 'Employee');
        const person = {
          _id: user._id + '_ascendance',
          name: user.username,
          title: title,
          level: level,
          color: '#0ea5e9'
        };
        if (!ascendanceByLevel[level]) ascendanceByLevel[level] = [];
        ascendanceByLevel[level].push(person);
      }
    });
    
    // Sort each level's array alphabetically by name
    Object.keys(lanforgeByLevel).forEach(lvl => {
      lanforgeByLevel[lvl].sort((a, b) => a.name.localeCompare(b.name));
    });
    Object.keys(ascendanceByLevel).forEach(lvl => {
      ascendanceByLevel[lvl].sort((a, b) => a.name.localeCompare(b.name));
    });
    
    res.json({
      success: true,
      data: {
        lanforgeHierarchy: lanforgeByLevel,
        ascendanceHierarchy: ascendanceByLevel
      }
    });
  } catch (err) {
    console.error('Handbook error:', err);
    res.status(500).json({ success: false, error: 'Error loading handbook' });
  }
});

// Submit help inquiry
app.post('/api/help-inquiry', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const username = req.session.username;
    const {
      inquiryType,
      submitterName,
      submitterEmail,
      subject,
      details,
      urgency,
      incidentDate,
      involvedParties
    } = req.body;
    
    // Validate required fields
    if (!inquiryType || !subject || !details) {
      return res.status(400).json({ 
        success: false, 
        error: 'Inquiry type, subject, and details are required' 
      });
    }
    
    const helpInquiry = new HelpInquiry({
      user_id: userId,
      username: username,
      inquiry_type: inquiryType,
      submitter_name: submitterName || null,
      submitter_email: submitterEmail || null,
      subject: subject,
      details: details,
      urgency: urgency || 'medium',
      incident_date: incidentDate ? new Date(incidentDate) : null,
      involved_parties: involvedParties || null,
      is_anonymous: !submitterName && !submitterEmail,
      status: 'new'
    });
    
    await helpInquiry.save();
    
    // Log the submission (in production, you might want to send email notifications)
    console.log(`Help inquiry submitted: ${inquiryType} - ${subject} by ${submitterName || 'anonymous'}`);
    
    res.json({ 
      success: true, 
      message: 'Your inquiry has been submitted successfully.',
      inquiryId: helpInquiry._id
    });
  } catch (err) {
    console.error('Help inquiry submission error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to submit inquiry. Please try again.' 
    });
  }
});

// Admin route to view help inquiries
app.get('/api/admin/help-inquiries', requireAdmin, async (req, res) => {
  try {
    const inquiries = await HelpInquiry.find()
      .sort({ created_at: -1 })
      .populate('user_id', 'username email');
    
    res.json({ success: true, data: { inquiries } });
  } catch (err) {
    console.error('Admin help inquiries error:', err);
    res.status(500).json({ success: false, error: 'Error loading help inquiries' });
  }
});

// Update inquiry status
app.post('/api/admin/help-inquiry/update-status', requireAdmin, async (req, res) => {
  try {
    const { inquiryId, status, adminNotes } = req.body;
    
    const updatedInquiry = await HelpInquiry.findByIdAndUpdate(
      inquiryId,
      { 
        status: status,
        admin_notes: adminNotes,
        updated_at: new Date()
      },
      { new: true }
    );
    
    if (!updatedInquiry) {
      return res.status(404).json({ success: false, error: 'Inquiry not found' });
    }
    
    res.json({ success: true, inquiry: updatedInquiry });
  } catch (err) {
    console.error('Update inquiry status error:', err);
    res.status(500).json({ success: false, error: 'Failed to update inquiry status' });
  }
});

// Announcement routes
app.get('/api/admin/announcements', requireAdmin, async (req, res) => {
  try {
    const announcements = await Announcement.find()
      .sort({ created_at: -1 })
      .populate('created_by', 'username');
    
    res.json({ success: true, data: { announcements } });
  } catch (err) {
    console.error('Admin announcements error:', err);
    res.status(500).json({ success: false, error: 'Error loading announcements' });
  }
});

app.post('/api/announcements', requireAdmin, async (req, res) => {
  try {
    const userId = req.session.userId;
    const {
      title,
      content,
      type,
      display_type,
      start_date,
      end_date,
      is_active
    } = req.body;
    
    // Validate required fields
    if (!title || !content) {
      return res.status(400).json({ 
        success: false, 
        error: 'Title and content are required' 
      });
    }
    
    const announcement = new Announcement({
      title,
      content,
      type: type || 'info',
      display_type: display_type || 'banner',
      start_date: start_date ? new Date(start_date) : new Date(),
      end_date: end_date ? new Date(end_date) : null,
      is_active: is_active !== undefined ? is_active : true,
      created_by: userId
    });
    
    await announcement.save();
    
    // Send email to all users with an email address
    if (resend) {
      try {
        const usersWithEmail = await User.find({ email: { $exists: true, $ne: '' } });
        const emails = usersWithEmail.map(u => u.email);
        
        if (emails.length > 0) {
          await resend.emails.send({
            from: 'staff@lanforge.co',
            to: emails,
            subject: `LANForge Announcement: ${title}`,
            html: createEmailTemplate(
              `Announcement: ${title}`,
              `
              <div style="white-space: pre-wrap;">${content}</div>
              <p style="text-align: center; margin-top: 30px;">
                <a href="https://employee.lanforge.co" style="background-color: #4f46e5; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 14px;">View in Dashboard</a>
              </p>
              `
            )
          });
        }
      } catch (emailErr) {
        console.error('Failed to send announcement emails:', emailErr);
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Announcement created successfully.',
      announcementId: announcement._id
    });
  } catch (err) {
    console.error('Create announcement error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create announcement. Please try again.' 
    });
  }
});

app.put('/api/announcements/:id', requireAdmin, async (req, res) => {
  try {
    const announcementId = req.params.id;
    const {
      title,
      content,
      type,
      display_type,
      start_date,
      end_date,
      is_active
    } = req.body;
    
    const updatedAnnouncement = await Announcement.findByIdAndUpdate(
      announcementId,
      {
        title,
        content,
        type,
        display_type,
        start_date: start_date ? new Date(start_date) : undefined,
        end_date: end_date ? new Date(end_date) : undefined,
        is_active,
        updated_at: new Date()
      },
      { new: true }
    );
    
    if (!updatedAnnouncement) {
      return res.status(404).json({ success: false, error: 'Announcement not found' });
    }
    
    res.json({ success: true, announcement: updatedAnnouncement });
  } catch (err) {
    console.error('Update announcement error:', err);
    res.status(500).json({ success: false, error: 'Failed to update announcement' });
  }
});

app.delete('/api/announcements/:id', requireAdmin, async (req, res) => {
  try {
    const announcementId = req.params.id;
    
    const deletedAnnouncement = await Announcement.findByIdAndDelete(announcementId);
    
    if (!deletedAnnouncement) {
      return res.status(404).json({ success: false, error: 'Announcement not found' });
    }
    
    res.json({ success: true, message: 'Announcement deleted successfully' });
  } catch (err) {
    console.error('Delete announcement error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete announcement' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Catch-all route to serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/dist/index.html'));
});

// Pay period summary cron job
cron.schedule('1 0 1,16 * *', async () => {
  if (!resend) return;
  
  try {
    const currentDay = moment().date();
    let periodStart, periodEnd, periodName;
    
    if (currentDay === 16) {
      // Previous period was 1st-15th of current month
      periodStart = moment().date(1).startOf('day').toDate();
      periodEnd = moment().date(15).endOf('day').toDate();
      periodName = `${moment(periodStart).format('MMMM 1st')} - 15th`;
    } else if (currentDay === 1) {
      // Previous period was 16th-EOM of previous month
      periodStart = moment().subtract(1, 'month').date(16).startOf('day').toDate();
      periodEnd = moment().subtract(1, 'month').endOf('month').toDate();
      periodName = `${moment(periodStart).format('MMMM 16th')} - ${moment(periodEnd).format('Do')}`;
    } else {
      return; // Should only run on 1st or 16th
    }
    
    console.log(`Running pay period summary cron job for period: ${periodName}`);
    
    const usersWithEmail = await User.find({ email: { $exists: true, $ne: '' } });
    
    for (const user of usersWithEmail) {
      const payPeriodEntries = await TimeEntry.find({
        user_id: user._id,
        clock_in: { $gte: periodStart, $lt: periodEnd }
      });
      
      let periodTotalHours = 0;
      payPeriodEntries.forEach(entry => {
        const endTime = entry.clock_out || entry.clock_in; // If no clock_out, ignore hours? Or use current time? Better to use clock_in to result in 0 hours for unclosed entries
        if (entry.clock_out) {
          const hours = (endTime - entry.clock_in) / (1000 * 60 * 60);
          periodTotalHours += hours;
        }
      });
      
      // If user worked 0 hours, skip email to avoid spam? No, user might want to know they recorded 0 hours. Let's send it anyway or maybe skip if 0?
      // I'll send it regardless.
      
      let estimatedPayHtml = '';
      if (user.hourly_rate > 0) {
        const estimatedPay = periodTotalHours * user.hourly_rate;
        estimatedPayHtml = `<p><strong>Estimated Pay:</strong> $${estimatedPay.toFixed(2)}</p>`;
      }
      
      try {
        await resend.emails.send({
          from: 'staff@lanforge.co',
          to: user.email,
          subject: `Pay Period Summary: ${periodName}`,
          html: createEmailTemplate(
            'Pay Period Summary',
            `
            <p>Hello <strong>${user.username}</strong>,</p>
            <p>Here is your summary for the pay period <strong>${periodName}</strong>:</p>
            
            <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
              <div style="margin-bottom: 12px;">
                <span style="color: #64748b; font-size: 14px; display: block; margin-bottom: 4px;">Total Hours Worked</span>
                <span style="color: #0f172a; font-size: 24px; font-weight: bold;">${periodTotalHours.toFixed(2)} <span style="font-size: 16px; font-weight: normal; color: #475569;">hours</span></span>
              </div>
              ${user.hourly_rate > 0 ? `
              <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 12px;">
                <span style="color: #64748b; font-size: 14px; display: block; margin-bottom: 4px;">Estimated Gross Pay</span>
                <span style="color: #10b981; font-size: 24px; font-weight: bold;">$${(periodTotalHours * user.hourly_rate).toFixed(2)}</span>
              </div>
              ` : ''}
            </div>
            
            <p style="text-align: center; margin-top: 30px;">
              <a href="https://employee.lanforge.co" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Review Timesheet</a>
            </p>
            <p style="font-size: 13px; color: #6b7280; text-align: center; margin-top: 20px;">
              Please review your timesheet to ensure all entries are correct.
            </p>
            `
          )
        });
      } catch (emailErr) {
        console.error(`Failed to send pay period summary to ${user.email}:`, emailErr);
      }
    }
  } catch (err) {
    console.error('Error in pay period summary cron job:', err);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
