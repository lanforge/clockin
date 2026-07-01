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
  pay_type: { type: String, enum: ['hourly', 'salary', 'commission', 'none'], default: 'hourly' },
  salary_amount: { type: Number, default: 0.0 },
  tax_classification: { type: String, enum: ['1099', 'W2'], default: '1099' },
  paychecks_start_date: { type: Date },
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
  handbook_agreed_date: { type: Date },
  timezone: { type: String, default: '' },
  employment_status: {
    type: String,
    enum: ['active', 'inactive', 'on_leave', 'let_go'],
    default: 'active'
  },
  status_changed_at: { type: Date },
  status_note: { type: String, default: '' }
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

const taskSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  due_date: { type: Date },
  status: { type: String, enum: ['pending', 'in_progress', 'completed'], default: 'pending' },
  is_admin_created: { type: Boolean, default: false },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  completed_at: { type: Date },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

const meetingSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  link: { type: String, default: '' },
  location: { type: String, default: '' },
  start_time: { type: Date, required: true },
  end_time: { type: Date },
  recurrence: { type: String, enum: ['none', 'daily', 'weekly', 'biweekly', 'monthly'], default: 'none' },
  recurrence_end_date: { type: Date },
  organizer_timezone: { type: String, default: '' },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  attendees: [{
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined', 'maybe'], default: 'pending' },
    responded_at: { type: Date }
  }],
  dismissed_alerts: [{
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    occurrence_start: { type: Date, required: true },
    dismissed_at: { type: Date, default: Date.now }
  }],
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

const salesGoalTierSchema = new mongoose.Schema({
  target_count: { type: Number, required: true },
  bonus: { type: String, default: '' },
  bonus_amount: { type: Number, default: 0 }
}, { _id: false });

const salesGoalAwardSchema = new mongoose.Schema({
  target_count: { type: Number, required: true },
  period_key: { type: String, required: true },
  awarded_at: { type: Date, default: Date.now },
  amount_per_user: { type: Number, default: 0 },
  user_count: { type: Number, default: 0 }
}, { _id: false });

const salesGoalSchema = new mongoose.Schema({
  singleton: { type: String, default: 'goal', unique: true },
  label: { type: String, default: 'Sales Goal' },
  tiers: { type: [salesGoalTierSchema], default: [] },
  awarded_tiers: { type: [salesGoalAwardSchema], default: [] },
  target_count: { type: Number, default: 0 }, // legacy fallback when tiers is empty
  period_kind: { type: String, enum: ['month', 'year', 'days', 'range'], default: 'month' },
  period_days: { type: Number, default: 30 },
  period_start: { type: Date },
  period_end: { type: Date },
  last_fetched_count: { type: Number, default: 0 },
  last_fetched_at: { type: Date },
  last_fetch_error: { type: String, default: '' },
  updated_at: { type: Date, default: Date.now },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const payRateSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  effective_date: { type: Date, required: true },
  pay_type: { type: String, enum: ['hourly', 'salary', 'commission', 'none'], required: true },
  hourly_rate: { type: Number, default: 0 },
  salary_amount: { type: Number, default: 0 },
  tax_classification: { type: String, enum: ['1099', 'W2'], default: '1099' },
  note: { type: String, default: '' },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now }
});
payRateSchema.index({ user_id: 1, effective_date: -1 });

const paycheckSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  period_start: { type: Date, required: true },
  period_end: { type: Date, required: true },
  period_key: { type: String, required: true },
  pay_date: { type: Date, required: true },
  pay_type: { type: String, enum: ['hourly', 'salary', 'bonus', 'commission'], required: true },
  tax_classification: { type: String, enum: ['1099', 'W2'], default: '1099' },
  hourly_rate: { type: Number, default: 0 },
  salary_amount: { type: Number, default: 0 },
  hours: { type: Number, default: 0 },
  amount: { type: Number, default: 0 },
  amount_override: { type: Boolean, default: false },
  is_bonus: { type: Boolean, default: false },
  bonus_description: { type: String, default: '' },
  bonus_source: { type: String, enum: ['manual', 'sales_goal'], default: 'manual' },
  bonus_source_ref: { type: String, default: '' },
  is_commission: { type: Boolean, default: false },
  commission_description: { type: String, default: '' },
  is_paid: { type: Boolean, default: false },
  paid_at: { type: Date },
  paid_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: { type: String, default: '' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});
paycheckSchema.index({ user_id: 1, period_key: 1 }, { unique: true });

// Create models
const User = mongoose.model('User', userSchema);
const TimeEntry = mongoose.model('TimeEntry', timeEntrySchema);
const HelpInquiry = mongoose.model('HelpInquiry', helpInquirySchema);
const Announcement = mongoose.model('Announcement', announcementSchema);
const Task = mongoose.model('Task', taskSchema);
const Meeting = mongoose.model('Meeting', meetingSchema);
const SalesGoal = mongoose.model('SalesGoal', salesGoalSchema);
const Paycheck = mongoose.model('Paycheck', paycheckSchema);
const PayRate = mongoose.model('PayRate', payRateSchema);

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

function userHasLanforge(user) {
  if (!user) return false;
  if (user.companies && (user.companies.lanforge || user.companies.ascendance)) {
    return !!user.companies.lanforge?.active;
  }
  return user.company === 'LANForge';
}

async function requireLanforgePosition(req, res, next) {
  try {
    const user = await User.findById(req.session.userId);
    if (!userHasLanforge(user)) {
      return res.status(403).json({ success: false, error: 'LANForge position required' });
    }
    next();
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
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
          payType: user.pay_type || 'hourly',
          needsPasswordReset: req.session.needsPasswordReset,
          handbookAgreed: user.handbook_agreed,
          handbookVersion: user.handbook_version,
          timezone: user.timezone || '',
          hasLanforge: userHasLanforge(user)
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Database error' });
    }
  } else {
    res.json({ success: false, user: null });
  }
});

app.post('/api/auth/timezone', requireAuth, async (req, res) => {
  try {
    const { timezone } = req.body;
    if (!timezone || typeof timezone !== 'string' || timezone.length > 64) {
      return res.status(400).json({ success: false, error: 'Invalid timezone' });
    }
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    } catch {
      return res.status(400).json({ success: false, error: 'Unknown timezone identifier' });
    }
    await User.findByIdAndUpdate(req.session.userId, { timezone });
    res.json({ success: true });
  } catch (err) {
    console.error('Update timezone error:', err);
    res.status(500).json({ success: false, error: 'Failed to update timezone' });
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

    const status = user.employment_status || 'active';
    if (status !== 'active') {
      const statusMessages = {
        inactive: 'Your account is inactive. Please contact an administrator.',
        on_leave: 'Your account is currently on leave. Please contact an administrator.',
        let_go: 'Your account is no longer active. Please contact an administrator.'
      };
      console.log(`Blocked login for ${username} (status: ${status})`);
      return res.status(403).json({
        success: false,
        error: statusMessages[status] || 'Your account is not active.'
      });
    }

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
          pay_type: 1,
          employment_status: 1,
          status_changed_at: 1,
          status_note: 1,
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
    const { userId, username, email, role, hourly_rate, companies, pay_type, salary_amount, tax_classification, paychecks_start_date } = req.body;

    const updateData = {
      username,
      email,
      role,
      hourly_rate: parseFloat(hourly_rate)
    };

    if (['hourly', 'salary', 'commission', 'none'].includes(pay_type)) {
      updateData.pay_type = pay_type;
    }
    if (salary_amount !== undefined) {
      const parsed = parseFloat(salary_amount);
      updateData.salary_amount = Number.isFinite(parsed) ? parsed : 0;
    }
    if (tax_classification === '1099' || tax_classification === 'W2') {
      updateData.tax_classification = tax_classification;
    }
    if (paychecks_start_date !== undefined) {
      if (paychecks_start_date === '' || paychecks_start_date === null) {
        updateData.paychecks_start_date = null;
      } else {
        const parsed = new Date(paychecks_start_date);
        if (Number.isNaN(parsed.getTime())) {
          return res.status(400).json({ success: false, error: 'Invalid paycheck start date' });
        }
        updateData.paychecks_start_date = parsed;
      }
    }

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
    const { username, email, role, hourly_rate, companies, pay_type, salary_amount, tax_classification, paychecks_start_date } = req.body;
    
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
      pay_type: ['hourly', 'salary', 'commission', 'none'].includes(pay_type) ? pay_type : 'hourly',
      salary_amount: parseFloat(salary_amount) || 0.0,
      tax_classification: tax_classification === 'W2' ? 'W2' : '1099',
      paychecks_start_date: paychecks_start_date ? new Date(paychecks_start_date) : undefined,
      companies: companies || {
        lanforge: { active: true, title: 'Employee', level: 3 },
        ascendance: { active: false, title: 'Employee', level: 3 }
      },
      needs_password_reset: true,
      temporary_password: tempPassword
    });
    
    await newUser.save();

    try {
      await PayRate.create({
        user_id: newUser._id,
        effective_date: newUser.created_at || new Date(),
        pay_type: newUser.pay_type,
        hourly_rate: newUser.hourly_rate || 0,
        salary_amount: newUser.salary_amount || 0,
        tax_classification: newUser.tax_classification || '1099',
        note: 'Initial pay rate',
        created_by: req.session.userId
      });
    } catch (rateErr) {
      console.error('Failed to seed initial pay rate:', rateErr);
    }

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

app.post('/api/admin/update-status', requireAdmin, async (req, res) => {
  try {
    const { userId, status, note } = req.body;
    const allowed = ['active', 'inactive', 'on_leave', 'let_go'];
    if (!userId || !allowed.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid userId or status' });
    }
    if (userId === String(req.session.userId)) {
      return res.status(400).json({ success: false, error: 'You cannot change your own status' });
    }
    const target = await User.findById(userId);
    if (!target) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    if (target.username === 'admin' && status !== 'active') {
      return res.status(400).json({ success: false, error: 'Cannot deactivate the admin user' });
    }
    target.employment_status = status;
    target.status_changed_at = new Date();
    if (note !== undefined) target.status_note = note;
    await target.save();
    res.json({ success: true, user: { _id: target._id, employment_status: target.employment_status, status_note: target.status_note, status_changed_at: target.status_changed_at } });
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ success: false, error: 'Failed to update status' });
  }
});

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
    const users = await User.find({
      $or: [{ employment_status: 'active' }, { employment_status: { $exists: false } }]
    }).sort({ username: 1 });
    
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
        const usersWithEmail = await User.find({
          email: { $exists: true, $ne: '' },
          $or: [{ employment_status: 'active' }, { employment_status: { $exists: false } }]
        });
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

// Sales goal: build the orders-API query for a given goal config
function buildOrdersQuery(goal) {
  const kind = goal.period_kind || 'month';
  const now = new Date();
  if (kind === 'month') {
    return `year=${now.getUTCFullYear()}&month=${now.getUTCMonth() + 1}`;
  }
  if (kind === 'year') {
    const y = now.getUTCFullYear();
    return `start=${y}-01-01&end=${y}-12-31`;
  }
  if (kind === 'days') {
    const days = Math.max(1, Math.floor(goal.period_days || 30));
    return `days=${days}`;
  }
  if (kind === 'range') {
    const fmt = (d) => new Date(d).toISOString().slice(0, 10);
    if (!goal.period_start || !goal.period_end) return null;
    return `start=${fmt(goal.period_start)}&end=${fmt(goal.period_end)}`;
  }
  return null;
}

const ordersCountCache = new Map(); // query -> { count, fetched_at }
const ORDERS_CACHE_TTL_MS = 30 * 1000;

async function fetchDeliveredCount(query) {
  const baseUrl = process.env.LANFORGE_ORDERS_API_URL || 'http://localhost:5001/api';
  const apiKey = process.env.LANFORGE_ORDERS_API_KEY;
  if (!apiKey) throw new Error('LANFORGE_ORDERS_API_KEY is not configured');
  if (!query) throw new Error('Missing timeframe configuration');

  const cached = ordersCountCache.get(query);
  if (cached && Date.now() - cached.fetched_at < ORDERS_CACHE_TTL_MS) {
    return cached.count;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const url = `${baseUrl.replace(/\/+$/, '')}/orders/delivered-count?${query}`;
    const r = await fetch(url, { headers: { 'X-API-Key': apiKey }, signal: controller.signal });
    if (!r.ok) throw new Error(`Orders API returned ${r.status}`);
    const text = await r.text();
    const count = parseInt(String(text).trim(), 10);
    if (!Number.isFinite(count)) throw new Error('Orders API returned non-numeric body');
    ordersCountCache.set(query, { count, fetched_at: Date.now() });
    return count;
  } finally {
    clearTimeout(timeout);
  }
}

function salesGoalPeriodKey(goal) {
  const kind = goal.period_kind || 'month';
  if (kind === 'month') return `month-${moment().format('YYYY-MM')}`;
  if (kind === 'year') return `year-${moment().format('YYYY')}`;
  if (kind === 'range') {
    if (!goal.period_start || !goal.period_end) return null;
    const fmt = (d) => moment(d).format('YYYY-MM-DD');
    return `range-${fmt(goal.period_start)}-${fmt(goal.period_end)}`;
  }
  return null; // 'days' (rolling) — don't auto-award since the window slides
}

async function maybeAwardSalesGoalBonuses(goal, liveCount) {
  if (!Array.isArray(goal.tiers) || goal.tiers.length === 0) return;
  const periodKey = salesGoalPeriodKey(goal);
  if (!periodKey) return;

  const awarded = Array.isArray(goal.awarded_tiers) ? goal.awarded_tiers : [];
  const awardedSet = new Set(awarded.map(a => `${a.target_count}-${a.period_key}`));

  const tiersToAward = goal.tiers
    .filter(t => t.target_count > 0 && (t.bonus_amount || 0) > 0)
    .filter(t => liveCount >= t.target_count)
    .filter(t => !awardedSet.has(`${t.target_count}-${periodKey}`));

  if (tiersToAward.length === 0) return;

  const activeUsers = await User.find({
    $and: [
      { $or: [{ employment_status: 'active' }, { employment_status: { $exists: false } }] },
      { $or: [{ pay_type: { $ne: 'none' } }, { pay_type: { $exists: false } }] }
    ]
  });
  if (activeUsers.length === 0) return;

  const newAwards = [];
  for (const tier of tiersToAward) {
    const amount = tier.bonus_amount;
    const payDate = new Date();
    const docs = activeUsers.map(u => ({
      user_id: u._id,
      period_start: payDate,
      period_end: payDate,
      period_key: `bonus-sg-${tier.target_count}-${periodKey}-${u._id}`,
      pay_date: payDate,
      pay_type: 'bonus',
      tax_classification: u.tax_classification || '1099',
      hourly_rate: 0,
      salary_amount: 0,
      hours: 0,
      amount,
      amount_override: false,
      is_bonus: true,
      bonus_description: `${goal.label || 'Sales Goal'}: ${tier.target_count.toLocaleString()} PCs tier reached${tier.bonus ? ` (${tier.bonus})` : ''}`,
      bonus_source: 'sales_goal',
      bonus_source_ref: periodKey,
      is_paid: false
    }));
    try {
      await Paycheck.insertMany(docs, { ordered: false });
    } catch (insertErr) {
      if (insertErr.code !== 11000) {
        console.error('Failed to insert auto bonus paychecks:', insertErr);
        continue;
      }
    }
    newAwards.push({
      target_count: tier.target_count,
      period_key: periodKey,
      awarded_at: new Date(),
      amount_per_user: amount,
      user_count: activeUsers.length
    });
  }

  if (newAwards.length > 0) {
    goal.awarded_tiers = [...awarded, ...newAwards];
    await goal.save();
  }
}

// Sales goal routes
app.get('/api/sales-goal', requireAuth, async (req, res) => {
  try {
    const requester = await User.findById(req.session.userId);
    if (!userHasLanforge(requester)) {
      return res.json({ success: true, data: { goal: null } });
    }
    const goal = await SalesGoal.findOneAndUpdate(
      { singleton: 'goal' },
      { $setOnInsert: { singleton: 'goal' } },
      { new: true, upsert: true }
    );

    const query = buildOrdersQuery(goal);
    let liveCount = goal.last_fetched_count || 0;
    let fetchedAt = goal.last_fetched_at;
    let fetchError = '';
    try {
      liveCount = await fetchDeliveredCount(query);
      fetchedAt = new Date();
      goal.last_fetched_count = liveCount;
      goal.last_fetched_at = fetchedAt;
      goal.last_fetch_error = '';
      await goal.save();
      try {
        await maybeAwardSalesGoalBonuses(goal, liveCount);
      } catch (awardErr) {
        console.error('Auto-award sales goal bonuses failed:', awardErr);
      }
    } catch (fetchErr) {
      fetchError = fetchErr.message || 'Failed to fetch orders count';
      goal.last_fetch_error = fetchError;
      try { await goal.save(); } catch {}
      console.error('Sales goal fetch error:', fetchErr);
    }

    const obj = goal.toObject();
    let tiers = Array.isArray(obj.tiers) ? obj.tiers.slice() : [];
    if (tiers.length === 0 && obj.target_count > 0) {
      tiers = [{ target_count: obj.target_count, bonus: '' }];
    }
    tiers.sort((a, b) => a.target_count - b.target_count);

    res.json({
      success: true,
      data: {
        goal: {
          ...obj,
          tiers,
          current_count: liveCount,
          last_fetched_count: liveCount,
          last_fetched_at: fetchedAt,
          last_fetch_error: fetchError
        }
      }
    });
  } catch (err) {
    console.error('Get sales goal error:', err);
    res.status(500).json({ success: false, error: 'Failed to load sales goal' });
  }
});

app.put('/api/admin/sales-goal', requireAdmin, requireLanforgePosition, async (req, res) => {
  try {
    const { label, tiers, period_kind, period_days, period_start, period_end } = req.body;
    const update = { updated_at: new Date(), updated_by: req.session.userId };
    if (label !== undefined) update.label = label;
    if (tiers !== undefined) {
      if (!Array.isArray(tiers)) {
        return res.status(400).json({ success: false, error: 'tiers must be an array' });
      }
      const cleaned = [];
      for (const t of tiers) {
        const n = Number(t?.target_count);
        if (!Number.isFinite(n) || n < 1) {
          return res.status(400).json({ success: false, error: 'Each tier needs a target_count >= 1' });
        }
        const bonusAmt = Number(t?.bonus_amount);
        cleaned.push({
          target_count: Math.floor(n),
          bonus: typeof t.bonus === 'string' ? t.bonus.slice(0, 200) : '',
          bonus_amount: Number.isFinite(bonusAmt) && bonusAmt >= 0 ? bonusAmt : 0
        });
      }
      cleaned.sort((a, b) => a.target_count - b.target_count);
      // De-dupe identical targets
      const seen = new Set();
      const deduped = cleaned.filter(t => {
        if (seen.has(t.target_count)) return false;
        seen.add(t.target_count);
        return true;
      });
      update.tiers = deduped;
      update.target_count = 0; // legacy field is no longer used once tiers are set
    }
    if (period_kind !== undefined) {
      if (!['month', 'year', 'days', 'range'].includes(period_kind)) {
        return res.status(400).json({ success: false, error: 'invalid period_kind' });
      }
      update.period_kind = period_kind;
    }
    if (period_days !== undefined) {
      const n = Number(period_days);
      if (Number.isNaN(n) || n < 1) {
        return res.status(400).json({ success: false, error: 'period_days must be at least 1' });
      }
      update.period_days = Math.floor(n);
    }
    if (period_start !== undefined) update.period_start = period_start ? new Date(period_start) : null;
    if (period_end !== undefined) update.period_end = period_end ? new Date(period_end) : null;

    const goal = await SalesGoal.findOneAndUpdate(
      { singleton: 'goal' },
      { $set: update, $setOnInsert: { singleton: 'goal' } },
      { new: true, upsert: true }
    );
    // Invalidate cache so the next GET fetches fresh
    ordersCountCache.clear();
    res.json({ success: true, goal });
  } catch (err) {
    console.error('Update sales goal error:', err);
    res.status(500).json({ success: false, error: 'Failed to update sales goal' });
  }
});

// Paycheck helpers
const PAYCHECK_FIRST_YEAR = 2026;
const BIWEEKLY_ANCHOR = moment('2026-07-01').startOf('day');

function buildPayPeriodsForYear(year) {
  const periods = [];
  if (year < PAYCHECK_FIRST_YEAR) return periods;

  for (let month = 0; month < 12; month++) {
    const monthMoment = moment({ year, month, day: 1 });

    const p1Start = monthMoment.clone().startOf('day');
    const p1End = monthMoment.clone().date(15).endOf('day');
    if (p1End.isBefore(BIWEEKLY_ANCHOR)) {
      periods.push({
        period_key: `${year}-${String(month + 1).padStart(2, '0')}-1`,
        period_start: p1Start.toDate(),
        period_end: p1End.toDate(),
        pay_date: monthMoment.clone().date(20).startOf('day').toDate(),
        label: `${monthMoment.format('MMM')} 1 - 15, ${year}`,
        cadence: 'semi-monthly'
      });
    }

    const p2Start = monthMoment.clone().date(16).startOf('day');
    const p2End = monthMoment.clone().endOf('month');
    if (p2End.isBefore(BIWEEKLY_ANCHOR)) {
      periods.push({
        period_key: `${year}-${String(month + 1).padStart(2, '0')}-2`,
        period_start: p2Start.toDate(),
        period_end: p2End.toDate(),
        pay_date: monthMoment.clone().add(1, 'month').date(5).startOf('day').toDate(),
        label: `${monthMoment.format('MMM')} 16 - ${p2End.format('D')}, ${year}`,
        cadence: 'semi-monthly'
      });
    }
  }

  let periodStart = BIWEEKLY_ANCHOR.clone();
  let biweeklyIdx = 1;
  while (periodStart.year() <= year) {
    const periodEnd = periodStart.clone().add(13, 'days').endOf('day');
    if (periodStart.year() === year) {
      periods.push({
        period_key: `${year}-bw-${String(biweeklyIdx).padStart(2, '0')}`,
        period_start: periodStart.toDate(),
        period_end: periodEnd.toDate(),
        pay_date: periodEnd.clone().add(5, 'days').startOf('day').toDate(),
        label: `${periodStart.format('MMM D')} – ${periodEnd.format('MMM D, YYYY')}`,
        cadence: 'biweekly'
      });
    }
    biweeklyIdx++;
    periodStart = periodEnd.clone().add(1, 'millisecond').startOf('day');
  }

  return periods;
}

function computeHoursForPeriod(timeEntries, userId, periodStart, periodEnd) {
  let totalHours = 0;
  for (const entry of timeEntries) {
    if (String(entry.user_id) !== String(userId)) continue;
    if (!entry.clock_out) continue;
    const start = new Date(entry.clock_in);
    if (start < periodStart || start > periodEnd) continue;
    totalHours += (new Date(entry.clock_out) - start) / (1000 * 60 * 60);
  }
  return totalHours;
}

function computeAmount(payType, hours, hourlyRate, salaryAmount) {
  if (payType === 'salary') {
    return (salaryAmount || 0) / 24;
  }
  return (hours || 0) * (hourlyRate || 0);
}

function resolveRateAt(userHistory, user, date) {
  const match = userHistory.find(r => new Date(r.effective_date) <= date);
  if (match) {
    return {
      pay_type: match.pay_type,
      hourly_rate: match.hourly_rate || 0,
      salary_amount: match.salary_amount || 0,
      tax_classification: match.tax_classification || '1099'
    };
  }
  return {
    pay_type: user.pay_type || 'hourly',
    hourly_rate: user.hourly_rate || 0,
    salary_amount: user.salary_amount || 0,
    tax_classification: user.tax_classification || '1099'
  };
}

app.post('/api/admin/user/:id/paychecks-start-date', requireAdmin, async (req, res) => {
  try {
    const { start_date } = req.body;
    let value;
    if (start_date === '' || start_date === null || start_date === undefined) {
      value = null;
    } else {
      const parsed = new Date(start_date);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid date' });
      }
      value = parsed;
    }
    const updated = await User.findByIdAndUpdate(
      req.params.id,
      { paychecks_start_date: value },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, paychecks_start_date: updated.paychecks_start_date });
  } catch (err) {
    console.error('Update paycheck start date error:', err);
    res.status(500).json({ success: false, error: 'Failed to update start date' });
  }
});

app.get('/api/admin/user/:id/pay-history', requireAdmin, async (req, res) => {
  try {
    const history = await PayRate.find({ user_id: req.params.id })
      .sort({ effective_date: -1 })
      .populate('created_by', 'username');
    res.json({ success: true, data: { history } });
  } catch (err) {
    console.error('Pay history list error:', err);
    res.status(500).json({ success: false, error: 'Failed to load pay history' });
  }
});

app.post('/api/admin/user/:id/pay-history', requireAdmin, async (req, res) => {
  try {
    const { effective_date, pay_type, hourly_rate, salary_amount, tax_classification, note } = req.body;
    if (!effective_date) {
      return res.status(400).json({ success: false, error: 'Effective date is required' });
    }
    const parsedDate = new Date(effective_date);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid effective date' });
    }
    if (!['hourly', 'salary', 'commission', 'none'].includes(pay_type)) {
      return res.status(400).json({ success: false, error: 'pay_type must be hourly, salary, commission, or none' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const rate = new PayRate({
      user_id: user._id,
      effective_date: parsedDate,
      pay_type,
      hourly_rate: parseFloat(hourly_rate) || 0,
      salary_amount: parseFloat(salary_amount) || 0,
      tax_classification: tax_classification === 'W2' ? 'W2' : '1099',
      note: (note || '').slice(0, 500),
      created_by: req.session.userId
    });
    await rate.save();

    if (parsedDate <= new Date()) {
      user.pay_type = rate.pay_type;
      user.hourly_rate = rate.hourly_rate;
      user.salary_amount = rate.salary_amount;
      user.tax_classification = rate.tax_classification;
      await user.save();
    }

    res.json({ success: true, rate });
  } catch (err) {
    console.error('Add pay rate error:', err);
    res.status(500).json({ success: false, error: 'Failed to add pay rate' });
  }
});

app.delete('/api/admin/user/:id/pay-history/:rateId', requireAdmin, async (req, res) => {
  try {
    const removed = await PayRate.findOneAndDelete({ _id: req.params.rateId, user_id: req.params.id });
    if (!removed) return res.status(404).json({ success: false, error: 'Pay rate not found' });

    const latest = await PayRate.find({
      user_id: req.params.id,
      effective_date: { $lte: new Date() }
    }).sort({ effective_date: -1 }).limit(1);
    if (latest.length > 0) {
      await User.findByIdAndUpdate(req.params.id, {
        pay_type: latest[0].pay_type,
        hourly_rate: latest[0].hourly_rate,
        salary_amount: latest[0].salary_amount,
        tax_classification: latest[0].tax_classification
      });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Delete pay rate error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete pay rate' });
  }
});

app.get('/api/admin/paychecks', requireAdmin, async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10) || moment().year();
    const periods = buildPayPeriodsForYear(year);
    const yearStart = periods[0].period_start;
    const yearEnd = periods[periods.length - 1].period_end;
    const now = new Date();

    const users = await User.find().sort({ username: 1 });
    const allEntries = await TimeEntry.find({
      clock_in: { $gte: yearStart, $lte: yearEnd }
    });

    const existing = await Paycheck.find({
      period_start: { $gte: yearStart, $lte: yearEnd }
    }).populate('paid_by', 'username');

    const allRates = await PayRate.find({}).sort({ effective_date: -1 });
    const ratesByUser = new Map();
    for (const rate of allRates) {
      const key = String(rate.user_id);
      if (!ratesByUser.has(key)) ratesByUser.set(key, []);
      ratesByUser.get(key).push(rate);
    }

    const existingMap = new Map();
    for (const pc of existing) {
      existingMap.set(`${pc.user_id}-${pc.period_key}`, pc);
    }

    const toInsert = [];
    const toUpdate = [];
    const result = [];

    for (const user of users) {
      const isActive = (user.employment_status || 'active') === 'active';
      const userHistory = ratesByUser.get(String(user._id)) || [];
      const userStart = (() => {
        if (user.paychecks_start_date) return new Date(user.paychecks_start_date);
        let start = user.created_at ? new Date(user.created_at) : new Date(0);
        if (userHistory.length > 0) {
          const earliest = new Date(userHistory[userHistory.length - 1].effective_date);
          if (earliest < start) start = earliest;
        }
        return start;
      })();

      for (const period of periods) {
        const mapKey = `${user._id}-${period.period_key}`;
        let pc = existingMap.get(mapKey);
        const hours = computeHoursForPeriod(allEntries, user._id, period.period_start, period.period_end);
        const effective = resolveRateAt(userHistory, user, period.period_start);

        if (!pc) {
          if (period.period_end < userStart) continue;
          if (!isActive && period.period_start > now) continue;
          if (effective.pay_type === 'commission' || effective.pay_type === 'none') continue;

          const amount = computeAmount(effective.pay_type, hours, effective.hourly_rate, effective.salary_amount);
          pc = new Paycheck({
            user_id: user._id,
            period_start: period.period_start,
            period_end: period.period_end,
            period_key: period.period_key,
            pay_date: period.pay_date,
            pay_type: effective.pay_type,
            tax_classification: effective.tax_classification,
            hourly_rate: effective.hourly_rate,
            salary_amount: effective.salary_amount,
            hours,
            amount,
            amount_override: false,
            is_paid: false
          });
          toInsert.push(pc);
        } else if (!pc.is_paid) {
          if (effective.pay_type === 'none' || effective.pay_type === 'commission') {
            continue;
          }
          let changed = false;
          if (pc.hours !== hours) {
            pc.hours = hours;
            changed = true;
          }
          if (pc.pay_type !== effective.pay_type) {
            pc.pay_type = effective.pay_type;
            changed = true;
          }
          if (pc.hourly_rate !== effective.hourly_rate) {
            pc.hourly_rate = effective.hourly_rate;
            changed = true;
          }
          if (pc.salary_amount !== effective.salary_amount) {
            pc.salary_amount = effective.salary_amount;
            changed = true;
          }
          if (pc.tax_classification !== effective.tax_classification) {
            pc.tax_classification = effective.tax_classification;
            changed = true;
          }
          if (!pc.amount_override) {
            const amount = computeAmount(pc.pay_type, pc.hours, pc.hourly_rate, pc.salary_amount);
            if (pc.amount !== amount) {
              pc.amount = amount;
              changed = true;
            }
          }
          if (changed) {
            pc.updated_at = new Date();
            toUpdate.push(pc);
          }
        }

        result.push({
          paycheck: pc,
          user
        });
      }
    }

    if (toInsert.length) {
      try {
        await Paycheck.insertMany(toInsert, { ordered: false });
      } catch (err) {
        if (err.code !== 11000) throw err;
      }
    }
    if (toUpdate.length) {
      await Promise.all(toUpdate.map(pc => pc.save()));
    }

    const includedIds = new Set(result.map(r => String(r.paycheck._id)).filter(Boolean));
    const usersById = new Map(users.map(u => [String(u._id), u]));
    for (const pc of existing) {
      if (!pc.is_bonus && !pc.is_commission) continue;
      if (includedIds.has(String(pc._id))) continue;
      const user = usersById.get(String(pc.user_id));
      if (!user) continue;
      result.push({ paycheck: pc, user });
    }

    const paychecks = result.map(({ paycheck, user }) => {
      const period = periods.find(p => p.period_key === paycheck.period_key);
      const label = period
        ? period.label
        : (paycheck.is_bonus
            ? `Bonus · ${moment(paycheck.pay_date).format('MMM D, YYYY')}`
            : paycheck.is_commission
              ? `Commission · ${moment(paycheck.pay_date).format('MMM D, YYYY')}`
              : moment(paycheck.pay_date).format('MMM D, YYYY'));
      return {
        _id: paycheck._id,
        user_id: paycheck.user_id,
        username: user.username,
        employment_status: user.employment_status || 'active',
        period_start: paycheck.period_start,
        period_end: paycheck.period_end,
        period_key: paycheck.period_key,
        period_label: label,
        pay_date: paycheck.pay_date,
        pay_type: paycheck.pay_type,
        tax_classification: paycheck.tax_classification || '1099',
        hourly_rate: paycheck.hourly_rate,
        salary_amount: paycheck.salary_amount,
        hours: paycheck.hours,
        amount: paycheck.amount,
        amount_override: paycheck.amount_override,
        is_bonus: paycheck.is_bonus || false,
        bonus_description: paycheck.bonus_description || '',
        bonus_source: paycheck.bonus_source || '',
        is_commission: paycheck.is_commission || false,
        commission_description: paycheck.commission_description || '',
        is_paid: paycheck.is_paid,
        paid_at: paycheck.paid_at,
        paid_by: paycheck.paid_by,
        notes: paycheck.notes
      };
    });

    paychecks.sort((a, b) => {
      if (a.is_paid !== b.is_paid) return a.is_paid ? 1 : -1;
      const aStart = new Date(a.period_start).getTime();
      const bStart = new Date(b.period_start).getTime();
      if (aStart !== bStart) return aStart - bStart;
      return a.username.localeCompare(b.username);
    });

    res.json({ success: true, data: { paychecks, year } });
  } catch (err) {
    console.error('Paychecks list error:', err);
    res.status(500).json({ success: false, error: 'Failed to load paychecks' });
  }
});

app.put('/api/admin/paychecks/:id', requireAdmin, async (req, res) => {
  try {
    const { amount, notes, clear_override, tax_classification } = req.body;
    const pc = await Paycheck.findById(req.params.id);
    if (!pc) return res.status(404).json({ success: false, error: 'Paycheck not found' });
    if (pc.is_paid) {
      return res.status(400).json({ success: false, error: 'Paid paychecks cannot be edited. Unmark as paid first.' });
    }

    if (clear_override) {
      pc.amount_override = false;
      const recomputed = computeAmount(pc.pay_type, pc.hours, pc.hourly_rate, pc.salary_amount);
      pc.amount = recomputed;
    } else if (amount !== undefined) {
      const parsed = parseFloat(amount);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return res.status(400).json({ success: false, error: 'Invalid amount' });
      }
      pc.amount = parsed;
      pc.amount_override = true;
    }

    if (tax_classification === '1099' || tax_classification === 'W2') {
      pc.tax_classification = tax_classification;
    }
    if (notes !== undefined) pc.notes = String(notes).slice(0, 1000);
    pc.updated_at = new Date();
    await pc.save();
    res.json({ success: true, paycheck: pc });
  } catch (err) {
    console.error('Update paycheck error:', err);
    res.status(500).json({ success: false, error: 'Failed to update paycheck' });
  }
});

app.delete('/api/admin/paychecks/:id', requireAdmin, async (req, res) => {
  try {
    const pc = await Paycheck.findById(req.params.id);
    if (!pc) return res.status(404).json({ success: false, error: 'Paycheck not found' });
    if (pc.is_paid) {
      return res.status(400).json({ success: false, error: 'Cannot delete a paid paycheck. Unmark as paid first.' });
    }
    await Paycheck.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete paycheck error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete paycheck' });
  }
});

app.post('/api/admin/paychecks/commission', requireAdmin, async (req, res) => {
  try {
    const { user_ids, amount, description, pay_date, tax_classification } = req.body;
    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Pick at least one user' });
    }
    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Enter a positive commission amount' });
    }
    if (!description || !String(description).trim()) {
      return res.status(400).json({ success: false, error: 'Commission description is required' });
    }
    const date = pay_date ? new Date(pay_date) : new Date();
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid pay date' });
    }

    const users = await User.find({ _id: { $in: user_ids } });
    if (users.length === 0) return res.status(404).json({ success: false, error: 'No users found' });

    const docs = users.map(u => ({
      user_id: u._id,
      period_start: date,
      period_end: date,
      period_key: `commission-${Date.now()}-${u._id}`,
      pay_date: date,
      pay_type: 'commission',
      tax_classification: (tax_classification === 'W2' ? 'W2' : (u.tax_classification || '1099')),
      hourly_rate: 0,
      salary_amount: 0,
      hours: 0,
      amount: parsedAmount,
      amount_override: true,
      is_commission: true,
      commission_description: String(description).slice(0, 500),
      is_paid: false
    }));
    const created = await Paycheck.insertMany(docs);
    res.json({ success: true, created: created.length });
  } catch (err) {
    console.error('Create commission error:', err);
    res.status(500).json({ success: false, error: 'Failed to create commission' });
  }
});

app.get('/api/paychecks/me', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const year = moment().year();
    const periods = buildPayPeriodsForYear(year);
    const yearStart = periods.length > 0 ? periods[0].period_start : moment(`${year}-01-01`).toDate();
    const yearEnd = periods.length > 0 ? periods[periods.length - 1].period_end : moment(`${year}-12-31`).endOf('day').toDate();

    const userRates = await PayRate.find({ user_id: userId }).sort({ effective_date: -1 });
    const existing = await Paycheck.find({
      user_id: userId,
      period_start: { $gte: yearStart, $lte: yearEnd }
    });
    const existingMap = new Map(existing.map(pc => [pc.period_key, pc]));

    const now = new Date();
    const allEntries = await TimeEntry.find({
      user_id: userId,
      clock_in: { $gte: yearStart, $lte: yearEnd }
    });

    const currentPayType = user.pay_type || 'hourly';
    const optedOut = currentPayType === 'none';
    const userStart = (() => {
      if (user.paychecks_start_date) return new Date(user.paychecks_start_date);
      let start = user.created_at ? new Date(user.created_at) : new Date(0);
      if (userRates.length > 0) {
        const earliest = new Date(userRates[userRates.length - 1].effective_date);
        if (earliest < start) start = earliest;
      }
      return start;
    })();

    const items = [];
    for (const period of periods) {
      if (period.period_end < userStart) continue;
      const effective = resolveRateAt(userRates, user, period.period_start);
      const pc = existingMap.get(period.period_key);
      if (pc) {
        if (optedOut && !pc.is_paid) continue;
        items.push({
          _id: pc._id,
          period_start: pc.period_start,
          period_end: pc.period_end,
          period_label: period.label,
          pay_date: pc.pay_date,
          pay_type: pc.pay_type,
          tax_classification: pc.tax_classification || '1099',
          hours: pc.hours,
          amount: pc.amount,
          is_paid: pc.is_paid,
          paid_at: pc.paid_at,
          is_bonus: false,
          is_commission: false,
          upcoming: false
        });
      } else if (!optedOut && effective.pay_type !== 'commission' && effective.pay_type !== 'none' && period.period_end >= now) {
        let projHours = 0;
        for (const entry of allEntries) {
          if (!entry.clock_out) continue;
          const start = new Date(entry.clock_in);
          if (start < period.period_start || start > period.period_end) continue;
          projHours += (new Date(entry.clock_out) - start) / (1000 * 60 * 60);
        }
        const projAmount = computeAmount(effective.pay_type, projHours, effective.hourly_rate, effective.salary_amount);
        items.push({
          _id: `proj-${period.period_key}`,
          period_start: period.period_start,
          period_end: period.period_end,
          period_label: period.label,
          pay_date: period.pay_date,
          pay_type: effective.pay_type,
          tax_classification: effective.tax_classification,
          hours: projHours,
          amount: projAmount,
          is_paid: false,
          is_bonus: false,
          is_commission: false,
          upcoming: true
        });
      }
    }

    for (const pc of existing) {
      if (!pc.is_bonus && !pc.is_commission) continue;
      items.push({
        _id: pc._id,
        period_start: pc.period_start,
        period_end: pc.period_end,
        period_label: pc.is_bonus
          ? `Bonus · ${moment(pc.pay_date).format('MMM D, YYYY')}`
          : `Commission · ${moment(pc.pay_date).format('MMM D, YYYY')}`,
        pay_date: pc.pay_date,
        pay_type: pc.pay_type,
        tax_classification: pc.tax_classification || '1099',
        hours: 0,
        amount: pc.amount,
        is_paid: pc.is_paid,
        paid_at: pc.paid_at,
        is_bonus: pc.is_bonus,
        is_commission: pc.is_commission,
        description: pc.bonus_description || pc.commission_description || '',
        upcoming: false
      });
    }

    items.sort((a, b) => new Date(b.period_start) - new Date(a.period_start));

    const upcoming = items.filter(i => !i.is_paid && new Date(i.period_end) >= now).sort((a, b) => new Date(a.period_start) - new Date(b.period_start));
    const upcomingIds = new Set(upcoming.slice(0, 2).map(i => String(i._id)));

    const visible = items.filter(i => {
      if (i.is_paid) return true;
      if (new Date(i.period_end) < now) return true;
      return upcomingIds.has(String(i._id));
    });

    res.json({
      success: true,
      data: {
        paychecks: visible,
        pay_type: user.pay_type || 'hourly',
        tax_classification: user.tax_classification || '1099'
      }
    });
  } catch (err) {
    console.error('Get my paychecks error:', err);
    res.status(500).json({ success: false, error: 'Failed to load paychecks' });
  }
});

app.post('/api/admin/paychecks/bonus', requireAdmin, async (req, res) => {
  try {
    const { user_ids, amount, description, pay_date, tax_classification } = req.body;
    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Pick at least one user' });
    }
    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Enter a positive bonus amount' });
    }
    if (!description || !String(description).trim()) {
      return res.status(400).json({ success: false, error: 'Bonus description is required' });
    }
    const date = pay_date ? new Date(pay_date) : new Date();
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid pay date' });
    }

    const users = await User.find({ _id: { $in: user_ids } });
    if (users.length === 0) return res.status(404).json({ success: false, error: 'No users found' });

    const docs = users.map(u => ({
      user_id: u._id,
      period_start: date,
      period_end: date,
      period_key: `bonus-manual-${Date.now()}-${u._id}`,
      pay_date: date,
      pay_type: 'bonus',
      tax_classification: (tax_classification === 'W2' ? 'W2' : (u.tax_classification || '1099')),
      hourly_rate: 0,
      salary_amount: 0,
      hours: 0,
      amount: parsedAmount,
      amount_override: true,
      is_bonus: true,
      bonus_description: String(description).slice(0, 500),
      bonus_source: 'manual',
      is_paid: false
    }));
    const created = await Paycheck.insertMany(docs);
    res.json({ success: true, created: created.length });
  } catch (err) {
    console.error('Create bonus error:', err);
    res.status(500).json({ success: false, error: 'Failed to create bonus' });
  }
});

app.post('/api/admin/paychecks/:id/mark-paid', requireAdmin, async (req, res) => {
  try {
    const pc = await Paycheck.findById(req.params.id);
    if (!pc) return res.status(404).json({ success: false, error: 'Paycheck not found' });

    if (pc.pay_type === 'hourly' && pc.hours === 0 && !pc.amount_override) {
      return res.status(400).json({
        success: false,
        error: 'Hourly paycheck has 0 hours. Enter the paycheck amount before marking it paid.'
      });
    }
    if (!Number.isFinite(pc.amount) || pc.amount < 0) {
      return res.status(400).json({ success: false, error: 'Paycheck amount must be a valid non-negative number.' });
    }

    pc.is_paid = true;
    pc.paid_at = new Date();
    pc.paid_by = req.session.userId;
    pc.updated_at = new Date();
    await pc.save();
    res.json({ success: true, paycheck: pc });
  } catch (err) {
    console.error('Mark paid error:', err);
    res.status(500).json({ success: false, error: 'Failed to mark paycheck as paid' });
  }
});

app.post('/api/admin/paychecks/:id/mark-unpaid', requireAdmin, async (req, res) => {
  try {
    const pc = await Paycheck.findById(req.params.id);
    if (!pc) return res.status(404).json({ success: false, error: 'Paycheck not found' });
    pc.is_paid = false;
    pc.paid_at = undefined;
    pc.paid_by = undefined;
    pc.updated_at = new Date();
    await pc.save();
    res.json({ success: true, paycheck: pc });
  } catch (err) {
    console.error('Mark unpaid error:', err);
    res.status(500).json({ success: false, error: 'Failed to mark paycheck as unpaid' });
  }
});

// Task routes
app.get('/api/tasks', requireAuth, async (req, res) => {
  try {
    const tasks = await Task.find({ user_id: req.session.userId })
      .sort({ status: 1, due_date: 1, created_at: -1 })
      .populate('created_by', 'username');
    res.json({ success: true, data: { tasks } });
  } catch (err) {
    console.error('Get tasks error:', err);
    res.status(500).json({ success: false, error: 'Failed to load tasks' });
  }
});

app.post('/api/tasks', requireAuth, async (req, res) => {
  try {
    const { title, description, due_date } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }
    const task = new Task({
      user_id: req.session.userId,
      created_by: req.session.userId,
      title,
      description: description || '',
      due_date: due_date ? new Date(due_date) : null,
      is_admin_created: false
    });
    await task.save();
    res.json({ success: true, task });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ success: false, error: 'Failed to create task' });
  }
});

app.put('/api/tasks/:id', requireAuth, async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, user_id: req.session.userId });
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const { title, description, due_date, status } = req.body;
    const isAdmin = req.session.role === 'admin';

    // Status can always be updated by the assignee
    if (status !== undefined) {
      task.status = status;
      task.completed_at = status === 'completed' ? new Date() : null;
    }

    // Title/description/due_date are locked on admin-created tasks for non-admins
    if (!task.is_admin_created || isAdmin) {
      if (title !== undefined) task.title = title;
      if (description !== undefined) task.description = description;
      if (due_date !== undefined) task.due_date = due_date ? new Date(due_date) : null;
    }

    task.updated_at = new Date();
    await task.save();
    res.json({ success: true, task });
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ success: false, error: 'Failed to update task' });
  }
});

app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, user_id: req.session.userId });
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    if (task.is_admin_created && req.session.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Only admins can delete admin-assigned tasks' });
    }
    await Task.findByIdAndDelete(task._id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete task' });
  }
});

// Admin task routes
app.get('/api/admin/tasks', requireAdmin, async (req, res) => {
  try {
    const tasks = await Task.find()
      .sort({ created_at: -1 })
      .populate('user_id', 'username email')
      .populate('created_by', 'username');
    res.json({ success: true, data: { tasks } });
  } catch (err) {
    console.error('Admin tasks error:', err);
    res.status(500).json({ success: false, error: 'Failed to load tasks' });
  }
});

app.post('/api/admin/tasks', requireAdmin, async (req, res) => {
  try {
    const { title, description, due_date, user_ids, assign_to_all } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }

    let targetUsers = [];
    const activeFilter = { $or: [{ employment_status: 'active' }, { employment_status: { $exists: false } }] };
    if (assign_to_all) {
      targetUsers = await User.find(activeFilter);
    } else if (Array.isArray(user_ids) && user_ids.length > 0) {
      targetUsers = await User.find({ _id: { $in: user_ids }, ...activeFilter });
    } else {
      return res.status(400).json({ success: false, error: 'Select at least one user or assign to all' });
    }
    if (targetUsers.length === 0) {
      return res.status(400).json({ success: false, error: 'No active users to assign' });
    }

    const dueDate = due_date ? new Date(due_date) : null;
    const docs = targetUsers.map(u => ({
      user_id: u._id,
      created_by: req.session.userId,
      title,
      description: description || '',
      due_date: dueDate,
      is_admin_created: true
    }));

    const created = await Task.insertMany(docs);

    if (resend) {
      const dueLine = dueDate ? `<p><strong>Due:</strong> ${moment.utc(dueDate).format('dddd, MMM D, YYYY')}</p>` : '';
      const descriptionBlock = description
        ? `<div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0; white-space: pre-wrap;">${description}</div>`
        : '';
      for (const u of targetUsers) {
        if (!u.email) continue;
        try {
          await resend.emails.send({
            from: 'staff@lanforge.co',
            to: u.email,
            subject: `New task assigned: ${title}`,
            html: createEmailTemplate(
              `New Task: ${title}`,
              `
              <p>Hello <strong>${u.username}</strong>,</p>
              <p>An administrator has assigned you a new task.</p>
              ${dueLine}
              ${descriptionBlock}
              <p style="text-align: center; margin-top: 24px;">
                <a href="https://employee.lanforge.co/tasks" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">View Tasks</a>
              </p>
              `
            )
          });
        } catch (emailErr) {
          console.error(`Failed to send task email to ${u.email}:`, emailErr);
        }
      }
    }

    res.json({ success: true, count: created.length });
  } catch (err) {
    console.error('Admin create task error:', err);
    res.status(500).json({ success: false, error: 'Failed to create tasks' });
  }
});

app.put('/api/admin/tasks/:id', requireAdmin, async (req, res) => {
  try {
    const { title, description, due_date, status } = req.body;
    const update = { updated_at: new Date() };
    if (title !== undefined) update.title = title;
    if (description !== undefined) update.description = description;
    if (due_date !== undefined) update.due_date = due_date ? new Date(due_date) : null;
    if (status !== undefined) {
      update.status = status;
      update.completed_at = status === 'completed' ? new Date() : null;
    }
    const task = await Task.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    res.json({ success: true, task });
  } catch (err) {
    console.error('Admin update task error:', err);
    res.status(500).json({ success: false, error: 'Failed to update task' });
  }
});

app.delete('/api/admin/tasks/:id', requireAdmin, async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Admin delete task error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete task' });
  }
});

// Expand a recurring meeting into discrete occurrences within [windowStart, windowEnd]
function expandOccurrences(meeting, windowStart, windowEnd) {
  const start = moment(meeting.start_time);
  const durationMs = meeting.end_time ? moment(meeting.end_time).diff(start) : 0;
  const stepMap = {
    daily: [1, 'day'],
    weekly: [1, 'week'],
    biweekly: [2, 'week'],
    monthly: [1, 'month']
  };
  const occurrences = [];

  if (!meeting.recurrence || meeting.recurrence === 'none') {
    if (start.isBetween(windowStart, windowEnd, null, '[]')) {
      occurrences.push({
        start: start.toDate(),
        end: durationMs ? start.clone().add(durationMs, 'ms').toDate() : null
      });
    }
    return occurrences;
  }

  const step = stepMap[meeting.recurrence];
  if (!step) return occurrences;

  const seriesEnd = meeting.recurrence_end_date
    ? moment.min(moment(meeting.recurrence_end_date), moment(windowEnd))
    : moment(windowEnd);

  let cursor = start.clone();
  let guard = 0;
  while (cursor.isSameOrBefore(seriesEnd) && guard < 1000) {
    if (cursor.isSameOrAfter(windowStart)) {
      occurrences.push({
        start: cursor.toDate(),
        end: durationMs ? cursor.clone().add(durationMs, 'ms').toDate() : null
      });
    }
    cursor.add(step[0], step[1]);
    guard++;
  }
  return occurrences;
}

const RECURRENCE_LABELS = {
  none: 'One-time',
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly'
};

// Format a Date in a given IANA timezone using Intl. Falls back to local when tz is empty.
function formatDateInTz(date, tz, opts = {}) {
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz || undefined,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
      ...opts
    }).format(new Date(date));
  } catch {
    return new Date(date).toString();
  }
}

function formatTimeOnlyInTz(date, tz) {
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz || undefined,
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    }).format(new Date(date));
  } catch {
    return new Date(date).toString();
  }
}

// Meeting routes
app.get('/api/meetings', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const meetings = await Meeting.find({ 'attendees.user_id': userId })
      .populate('created_by', 'username');

    const windowStart = moment().subtract(30, 'days');
    const windowEnd = moment().add(365, 'days');

    const result = [];
    meetings.forEach(m => {
      const obj = m.toObject();
      const mine = obj.attendees.find(a => a.user_id.toString() === userId.toString());
      const occurrences = expandOccurrences(obj, windowStart, windowEnd);
      occurrences.forEach(occ => {
        const occIso = occ.start.toISOString();
        const dismissed = (obj.dismissed_alerts || []).some(d =>
          d.user_id.toString() === userId.toString() &&
          new Date(d.occurrence_start).toISOString() === occIso
        );
        result.push({
          _id: obj._id,
          occurrence_id: `${obj._id}_${occIso}`,
          occurrence_start: occ.start,
          occurrence_end: occ.end,
          title: obj.title,
          description: obj.description,
          link: obj.link,
          location: obj.location,
          start_time: occ.start,
          end_time: occ.end,
          recurrence: obj.recurrence || 'none',
          recurrence_label: RECURRENCE_LABELS[obj.recurrence || 'none'],
          recurrence_end_date: obj.recurrence_end_date,
          organizer_timezone: obj.organizer_timezone || '',
          created_by: obj.created_by,
          my_status: mine ? mine.status : 'pending',
          alert_dismissed: dismissed
        });
      });
    });

    result.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    res.json({ success: true, data: { meetings: result } });
  } catch (err) {
    console.error('Get meetings error:', err);
    res.status(500).json({ success: false, error: 'Failed to load meetings' });
  }
});

app.post('/api/meetings/:id/dismiss-alert', requireAuth, async (req, res) => {
  try {
    const { occurrence_start } = req.body;
    if (!occurrence_start) {
      return res.status(400).json({ success: false, error: 'occurrence_start is required' });
    }
    const meeting = await Meeting.findOne({
      _id: req.params.id,
      'attendees.user_id': req.session.userId
    });
    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }
    const occDate = new Date(occurrence_start);
    const already = (meeting.dismissed_alerts || []).some(d =>
      d.user_id.toString() === req.session.userId.toString() &&
      new Date(d.occurrence_start).toISOString() === occDate.toISOString()
    );
    if (!already) {
      meeting.dismissed_alerts.push({
        user_id: req.session.userId,
        occurrence_start: occDate,
        dismissed_at: new Date()
      });
      await meeting.save();
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Dismiss alert error:', err);
    res.status(500).json({ success: false, error: 'Failed to dismiss alert' });
  }
});

app.post('/api/meetings/:id/rsvp', requireAuth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['accepted', 'declined', 'maybe', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    const meeting = await Meeting.findOne({
      _id: req.params.id,
      'attendees.user_id': req.session.userId
    });
    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }
    const attendee = meeting.attendees.find(a => a.user_id.toString() === req.session.userId.toString());
    attendee.status = status;
    attendee.responded_at = new Date();
    await meeting.save();
    res.json({ success: true });
  } catch (err) {
    console.error('RSVP error:', err);
    res.status(500).json({ success: false, error: 'Failed to update RSVP' });
  }
});

// Admin meeting routes
app.get('/api/admin/meetings', requireAdmin, async (req, res) => {
  try {
    const meetings = await Meeting.find()
      .sort({ start_time: -1 })
      .populate('attendees.user_id', 'username email')
      .populate('created_by', 'username');
    res.json({ success: true, data: { meetings } });
  } catch (err) {
    console.error('Admin meetings error:', err);
    res.status(500).json({ success: false, error: 'Failed to load meetings' });
  }
});

app.post('/api/admin/meetings', requireAdmin, async (req, res) => {
  try {
    const { title, description, link, location, start_time, end_time, user_ids, invite_all, recurrence, recurrence_end_date } = req.body;
    if (!title || !start_time) {
      return res.status(400).json({ success: false, error: 'Title and start time are required' });
    }

    let attendeeUsers = [];
    const activeFilter = { $or: [{ employment_status: 'active' }, { employment_status: { $exists: false } }] };
    if (invite_all) {
      attendeeUsers = await User.find(activeFilter);
    } else if (Array.isArray(user_ids) && user_ids.length > 0) {
      attendeeUsers = await User.find({ _id: { $in: user_ids }, ...activeFilter });
    } else {
      return res.status(400).json({ success: false, error: 'Select at least one attendee or invite all' });
    }
    if (attendeeUsers.length === 0) {
      return res.status(400).json({ success: false, error: 'No active users to invite' });
    }

    const organizer = await User.findById(req.session.userId);
    const organizerTz = (organizer && organizer.timezone) || '';

    const meeting = new Meeting({
      title,
      description: description || '',
      link: link || '',
      location: location || '',
      start_time: new Date(start_time),
      end_time: end_time ? new Date(end_time) : null,
      recurrence: recurrence || 'none',
      recurrence_end_date: recurrence_end_date ? new Date(recurrence_end_date) : null,
      organizer_timezone: organizerTz,
      created_by: req.session.userId,
      attendees: attendeeUsers.map(u => ({ user_id: u._id, status: 'pending' }))
    });
    await meeting.save();

    if (resend) {
      const recurrenceLabel = RECURRENCE_LABELS[meeting.recurrence] || 'One-time';
      const recurrenceLine = meeting.recurrence !== 'none'
        ? `<p><strong>Repeats:</strong> ${recurrenceLabel}${meeting.recurrence_end_date ? ` until ${formatDateInTz(meeting.recurrence_end_date, organizerTz, { hour: undefined, minute: undefined, timeZoneName: undefined })}` : ''}</p>`
        : '';
      const locationLine = meeting.location ? `<p><strong>Location:</strong> ${meeting.location}</p>` : '';
      const descriptionBlock = meeting.description
        ? `<div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0; white-space: pre-wrap;">${meeting.description}</div>`
        : '';
      const linkBlock = meeting.link
        ? `<p style="text-align: center; margin: 20px 0;">
            <a href="${meeting.link}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Join Meeting</a>
          </p>`
        : '';

      for (const u of attendeeUsers) {
        if (!u.email) continue;
        const recipientTz = u.timezone || organizerTz;
        const recipientStart = formatDateInTz(meeting.start_time, recipientTz);
        const recipientEnd = meeting.end_time ? formatTimeOnlyInTz(meeting.end_time, recipientTz) : '';
        let whenLine = `<strong>When:</strong> ${recipientStart}${recipientEnd ? ` – ${recipientEnd}` : ''}`;
        if (organizerTz && recipientTz && organizerTz !== recipientTz) {
          const organizerStart = formatDateInTz(meeting.start_time, organizerTz);
          whenLine += `<br><span style="color:#6b7280;font-size:13px;">Organizer time: ${organizerStart}</span>`;
        }

        try {
          await resend.emails.send({
            from: 'staff@lanforge.co',
            to: u.email,
            subject: `Meeting invite: ${meeting.title}`,
            html: createEmailTemplate(
              `Meeting Invite: ${meeting.title}`,
              `
              <p>Hello <strong>${u.username}</strong>,</p>
              <p>You have a new meeting on your calendar.</p>
              <p>${whenLine}</p>
              ${recurrenceLine}
              ${locationLine}
              ${descriptionBlock}
              ${linkBlock}
              <p style="font-size: 13px; color: #6b7280; text-align: center; margin-top: 16px;">RSVP and view details in your dashboard.</p>
              `
            )
          });
        } catch (emailErr) {
          console.error(`Failed to send meeting invite to ${u.email}:`, emailErr);
        }
      }
    }

    res.json({ success: true, meeting });
  } catch (err) {
    console.error('Create meeting error:', err);
    res.status(500).json({ success: false, error: 'Failed to create meeting' });
  }
});

app.put('/api/admin/meetings/:id', requireAdmin, async (req, res) => {
  try {
    const { title, description, link, location, start_time, end_time, user_ids, invite_all, recurrence, recurrence_end_date } = req.body;
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }

    if (title !== undefined) meeting.title = title;
    if (description !== undefined) meeting.description = description;
    if (link !== undefined) meeting.link = link;
    if (location !== undefined) meeting.location = location;
    if (start_time !== undefined) meeting.start_time = new Date(start_time);
    if (end_time !== undefined) meeting.end_time = end_time ? new Date(end_time) : null;
    if (recurrence !== undefined) meeting.recurrence = recurrence || 'none';
    if (recurrence_end_date !== undefined) meeting.recurrence_end_date = recurrence_end_date ? new Date(recurrence_end_date) : null;

    if (invite_all || (Array.isArray(user_ids) && user_ids.length > 0)) {
      let newIds;
      const activeFilter = { $or: [{ employment_status: 'active' }, { employment_status: { $exists: false } }] };
      if (invite_all) {
        const users = await User.find(activeFilter, '_id');
        newIds = users.map(u => u._id.toString());
      } else {
        const users = await User.find({ _id: { $in: user_ids }, ...activeFilter }, '_id');
        newIds = users.map(u => u._id.toString());
      }
      const existingMap = new Map(meeting.attendees.map(a => [a.user_id.toString(), a]));
      meeting.attendees = newIds.map(uid => {
        const existing = existingMap.get(uid);
        return existing || { user_id: uid, status: 'pending' };
      });
    }

    meeting.updated_at = new Date();
    await meeting.save();
    res.json({ success: true, meeting });
  } catch (err) {
    console.error('Update meeting error:', err);
    res.status(500).json({ success: false, error: 'Failed to update meeting' });
  }
});

app.delete('/api/admin/meetings/:id', requireAdmin, async (req, res) => {
  try {
    await Meeting.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete meeting error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete meeting' });
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
    
    const usersWithEmail = await User.find({
      email: { $exists: true, $ne: '' },
      $or: [{ employment_status: 'active' }, { employment_status: { $exists: false } }]
    });

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
