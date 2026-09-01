# 🚀 Lead Generator Pro - Enterprise SaaS Application

Enterprise-level lead generation platform for IndiaMART with JWT authentication, subscription management, and automated lead generation.

## ✨ Features

### Authentication & Authorization
- ✅ User registration and login with JWT
- ✅ Secure password hashing with bcrypt
- ✅ Protected routes and API endpoints

### Subscription Management
- ✅ **Free Tier**: 5 machines maximum
- ✅ **Pro Tier**: Unlimited machines
- ✅ **Payment Integration**: Razorpay payment gateway (₹50/month)
- ✅ **Secure Checkout**: PCI-compliant payment processing

### Machine Management
- ✅ Add machines individually
- ✅ Bulk import via CSV upload
- ✅ Toggle machines on/off
- ✅ Delete machines
- ✅ Real-time machine status

### Lead Generation
- ✅ Automated lead generation from active machines
- ✅ Configurable interval (seconds between leads)
- ✅ Set maximum lead count
- ✅ Real-time session tracking
- ✅ Lead history with pagination
- ✅ Export leads to CSV

### Modern UI/UX
- ✅ Glassmorphism design
- ✅ Smooth animations and transitions
- ✅ Responsive mobile-friendly layout
- ✅ Real-time updates
- ✅ Toast notifications
- ✅ Loading states

## 🛠️ Tech Stack

**Backend:**
- Node.js + Express
- MongoDB + Mongoose
- JWT for authentication
- bcryptjs for password hashing
- Razorpay SDK for payments
- PapaParse for CSV handling
- Multer for file uploads

**Frontend:**
- Vanilla HTML/CSS/JavaScript
- Modern CSS with CSS variables
- Fetch API for HTTP requests
- No framework dependencies

## 📋 Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or Atlas)
- npm or yarn

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up MongoDB

**Option A: Local MongoDB**
```bash
# Start MongoDB service
sudo systemctl start mongod
# or
mongod
```

**Option B: MongoDB Atlas**
- Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas)
- Get your connection string
- Update `MONGODB_URI` in `.env`

### 3. Configure Environment

The `.env` file is already created. Update if needed:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/laser-lead-generator
JWT_SECRET=your_secret_key_here
JWT_EXPIRE=7d
NODE_ENV=development

# Razorpay Configuration (Get from https://dashboard.razorpay.com/app/keys)
RAZORPAY_KEY_ID=rzp_test_your_key_id_here
RAZORPAY_KEY_SECRET=your_key_secret_here
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here
```

**Note:** For payment integration, you need to sign up at [Razorpay](https://razorpay.com) and get your test API keys. See [PAYMENT_INTEGRATION.md](PAYMENT_INTEGRATION.md) for detailed setup instructions.

### 4. Start the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The server will start on `http://localhost:5000`

### 5. Access the Application

Open your browser and navigate to:
- **Landing Page**: http://localhost:5000
- **Login/Register**: http://localhost:5000/auth.html
- **Dashboard**: http://localhost:5000/dashboard.html (after login)

## 📖 Usage Guide

### Getting Started

1. **Register an Account**
   - Go to http://localhost:5000/auth.html
   - Click "Register" tab
   - Fill in your details
   - You'll start with Free tier (5 machines)

2. **Add Machines**
   - **Individual**: Click "+ Add Machine" button
   - **Bulk**: Click "📁 Upload CSV" and select a CSV file
   - CSV format: Single column with machine names

3. **Configure Machines**
   - Toggle machines on/off using the switch
   - Only active machines will generate leads
   - Delete machines you don't need

4. **Start Lead Generation**
   - Click "▶️ Start" button
   - Configure:
     - Maximum leads to generate
     - Interval in seconds (time between leads)
   - Click "Start Generation"
   - Watch real-time updates!

5. **Export Leads**
   - Click "📥 Export CSV" to download all leads
   - Opens in Excel or any CSV viewer

6. **Upgrade to Pro**
   - Click "Upgrade Now" when you hit the 5-machine limit
   - Get unlimited machines!

## 📁 CSV Format for Bulk Import

Create a CSV file with machine names:

```csv
name
Laser Cutting Machine 1
Fiber Laser Cutter
CO2 Laser Engraver
CNC Laser Machine
Metal Laser Cutter
```

Or simply:
```csv
Laser Cutting Machine 1
Fiber Laser Cutter
CO2 Laser Engraver
```

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (protected)

### Machines
- `GET /api/machines` - Get all machines (protected)
- `POST /api/machines` - Add single machine (protected)
- `POST /api/machines/bulk` - Bulk upload CSV (protected)
- `PUT /api/machines/:id` - Update machine (protected)
- `DELETE /api/machines/:id` - Delete machine (protected)

### Leads
- `GET /api/leads` - Get all leads (protected)
- `POST /api/leads` - Create lead (protected)
- `GET /api/leads/export` - Export leads as CSV (protected)
- `DELETE /api/leads` - Delete all leads (protected)

### Lead Generator
- `POST /api/generator/start` - Start generation (protected)
- `POST /api/generator/stop` - Stop generation (protected)
- `GET /api/generator/status` - Get status (protected)

### Subscription
- `GET /api/subscription/status` - Get subscription info (protected)
- `POST /api/subscription/upgrade` - Upgrade to Pro (protected)

### Payment
- `POST /api/payment/create-order` - Create Razorpay order (protected)
- `POST /api/payment/verify` - Verify payment and upgrade (protected)
- `POST /api/payment/webhook` - Handle Razorpay webhooks (public)

## 🎨 Project Structure

```
laser-machines-extensions/
├── server/
│   ├── config/
│   │   ├── db.js              # MongoDB connection
│   │   └── jwt.js             # JWT utilities
│   ├── models/
│   │   ├── User.js            # User model
│   │   ├── Machine.js         # Machine model
│   │   └── Lead.js            # Lead model
│   ├── routes/
│   │   ├── auth.js            # Auth routes
│   │   ├── machines.js        # Machine routes
│   │   ├── leads.js           # Lead routes
│   │   ├── generator.js       # Generator routes
│   │   └── subscription.js    # Subscription routes
│   ├── middleware/
│   │   ├── auth.js            # JWT middleware
│   │   └── subscription.js    # Subscription middleware
│   ├── services/
│   │   └── leadGenerator.js   # Lead generation service
│   └── server.js              # Main server file
├── public/
│   ├── css/
│   │   ├── main.css           # Main styles
│   │   └── dashboard.css      # Dashboard styles
│   ├── js/
│   │   ├── api.js             # API helpers
│   │   ├── auth.js            # Auth page logic
│   │   └── dashboard.js       # Dashboard logic
│   ├── index.html             # Landing page
│   ├── auth.html              # Login/Register page
│   └── dashboard.html         # Main dashboard
├── package.json
├── .env                       # Environment variables
├── .env.example               # Environment template
└── README.md
```

## 🔐 Security Notes

- Passwords are hashed with bcrypt (10 salt rounds)
- JWT tokens expire after 7 days (configurable)
- All sensitive routes are protected with JWT middleware
- Payment signature verification with HMAC SHA256
- Webhook signature verification for secure payment events
- CORS enabled for development
- Input validation on all endpoints

## 🚧 Future Enhancements

- [x] Payment gateway integration (Razorpay) ✅
- [ ] Automatic subscription renewal
- [ ] Email verification
- [ ] Password reset functionality
- [ ] Advanced analytics dashboard
- [ ] Webhook notifications
- [ ] Team collaboration features
- [ ] API rate limiting
- [ ] Advanced lead filtering

## 📝 Notes

- The lead generation logic is adapted from the original Chrome extension
- Machine names are fetched from GitHub repository (configurable)
- Free tier users are limited to 5 machines
- Pro tier users have unlimited machines
- All data is stored in MongoDB

## 🐛 Troubleshooting

**MongoDB Connection Error:**
- Ensure MongoDB is running: `sudo systemctl status mongod`
- Check connection string in `.env`

**Port Already in Use:**
- Change `PORT` in `.env` to a different port
- Or kill the process using port 5000: `lsof -ti:5000 | xargs kill`

**JWT Token Invalid:**
- Clear browser localStorage
- Re-login to get a new token

## 📄 License

MIT License - feel free to use this for your projects!

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

Built with ❤️ for enterprise lead generation
# lead-generator
