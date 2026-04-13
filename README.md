# LANForge Employee Dashboard

A comprehensive employee time tracking system with clock in/out functionality, calendar view, and admin features.

## Features

- **Employee Features:**
  - Clock in/out with notes
  - View daily and monthly time entries
  - Calendar view with hours worked per day
  - Click on calendar days to see detailed time entries
  - Estimated pay calculation based on hourly rate

- **Admin Features:**
  - View all employees and their time entries
  - Add/remove time entries for employees
  - Create/edit/delete user accounts
  - Reset user passwords
  - Export time data to CSV
  - Set hourly rates for employees

## Prerequisites

- Node.js 16 or higher
- MongoDB Atlas account (or local MongoDB)
- npm or yarn

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd lanforge-employee-dashboard
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. Update the `.env` file with:
   - Your MongoDB Atlas connection string
   - A strong session secret
   - Admin credentials

## Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Production Deployment

### Option 1: Using PM2 (Recommended)

1. Make the deployment script executable:
   ```bash
   chmod +x deploy-production.sh
   ```

2. Run the deployment script:
   ```bash
   npm run deploy
   ```

   Or manually:
   ```bash
   ./deploy-production.sh
   ```

### Option 2: Manual Deployment

1. Set environment to production:
   ```bash
   export NODE_ENV=production
   ```

2. Install production dependencies:
   ```bash
   npm ci --only=production
   ```

3. Start the application:
   ```bash
   npm start
   ```

### Option 3: Using Docker (Advanced)

Create a `Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

Build and run:
```bash
docker build -t lanforge-employee-dashboard .
docker run -p 3000:3000 --env-file .env lanforge-employee-dashboard
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| MONGODB_URI | MongoDB connection string | Required |
| SESSION_SECRET | Secret for session encryption | Required |
| PORT | Server port | 3000 |
| NODE_ENV | Environment (development/production) | development |
| ADMIN_USERNAME | Initial admin username | admin |
| ADMIN_PASSWORD | Initial admin password | admin123 |
| ADMIN_EMAIL | Admin email | admin@lanforge.com |
| RATE_LIMIT_WINDOW_MS | Rate limit window (ms) | 900000 |
| RATE_LIMIT_MAX_REQUESTS | Max requests per IP | 100 |

## Security Features

- **Helmet.js**: Security headers
- **Rate Limiting**: Protection against brute force attacks
- **Input Validation**: Sanitization of user inputs
- **Session Security**: Secure cookies with HTTP-only flag
- **Password Hashing**: bcrypt for password storage
- **CSP**: Content Security Policy headers

## Production Checklist

- [ ] Change default admin password
- [ ] Use strong session secret
- [ ] Enable HTTPS with reverse proxy (nginx/apache)
- [ ] Configure firewall rules
- [ ] Set up regular database backups
- [ ] Configure monitoring and alerts
- [ ] Set up log rotation
- [ ] Configure SSL/TLS certificates

## API Endpoints

### Authentication
- `POST /login` - User login
- `POST /register` - User registration
- `GET /logout` - User logout

### Time Tracking
- `POST /clockin` - Clock in
- `POST /clockout` - Clock out
- `POST /add-notes` - Add notes to current entry
- `POST /update-entry-notes` - Update existing entry notes

### Calendar
- `GET /calendar` - View monthly calendar with time entries

### Admin
- `GET /admin` - Admin dashboard
- `GET /admin/user/:id` - View user details
- `POST /admin/add-time` - Add time for user
- `POST /admin/remove-time` - Remove time entry
- `POST /admin/edit-user` - Edit user details
- `POST /admin/delete-user` - Delete user
- `POST /admin/create-user` - Create new user
- `POST /admin/reset-password` - Reset user password
- `GET /admin/export` - Export data to CSV

## Troubleshooting

### Common Issues

1. **MongoDB Connection Failed**
   - Check your connection string in `.env`
   - Ensure IP is whitelisted in MongoDB Atlas
   - Verify network connectivity

2. **Session Not Persisting**
   - Check session secret in `.env`
   - Ensure cookies are enabled in browser
   - Verify same-site cookie settings

3. **Rate Limiting Issues**
   - Adjust `RATE_LIMIT_MAX_REQUESTS` in `.env`
   - Check if behind proxy (adjust trust proxy)

4. **Calendar Not Showing Hours**
   - Check timezone settings
   - Verify time entries exist in database
   - Check console for JavaScript errors

### Logs

- Application logs: `logs/app.log`
- Error logs: `logs/error.log`
- PM2 logs: `pm2 logs lanforge-employee-dashboard`

## License

ISC License

## Support

For issues and feature requests, please create an issue in the repository.
