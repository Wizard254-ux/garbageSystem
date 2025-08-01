const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const morgan = require('morgan');

require('dotenv').config();

const { sequelize } = require('./models');
const authRoutes= require('./routes/authRoutes');
const routeRouter = require('./routes/routes');
const pickUpRouter = require('./routes/pickUp');
const paymentRouter = require('./routes/payment');
const mpesaRouter = require('./routes/mpesa');
const invoiceRouter = require('./routes/invoices');
const bagRouter = require('./routes/bags');
require('./services/schedule'); // Initialize cron jobs
const app = express();


app.use(helmet());
app.use(morgan('dev'));

app.use(cookieParser());
// Middleware
const allowedOrigins = [
  'http://localhost:5173',
  'https://gabbage-web.vercel.app',
  process.env.CLIENT_URL
].filter(Boolean); // remove undefined/null

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (e.g. mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());


// Connect to MySQL and sync models
sequelize.authenticate()
  .then(() => {
    console.log('Connected to MySQL database');
    // For initial setup, use force: true to recreate tables
    // Change to { alter: true } after first successful run
    // return sequelize.sync({ alter: true });
  })
  .then(() => console.log('Database synchronized'))
  .catch(err => console.error('Database connection error:', err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/routes', routeRouter);
app.use('/api/pickups', pickUpRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/invoices', invoiceRouter);
app.use('/api/bags', bagRouter);
app.use(
  "/universal",
  (req, res, next) => {
    console.log("Mpesa route accessed");
    next();
  },
  mpesaRouter
);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// Error handling middleware
// app.use((err, req, res, next) => {
//   console.error(err.stack);
//   res.status(500).json({ message: 'Something went wrong!' });
// });

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0',() => {
  console.log(`Server running on port ${PORT}`);
});
