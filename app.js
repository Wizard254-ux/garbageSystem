const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const morgan = require('morgan');

require('dotenv').config();

const authRoutes= require('./routes/authRoutes');
const routeRouter = require('./routes/routes');
const pickUpRouter = require('./routes/pickUp');
const paymentRouter = require('./routes/payment');
const mpesaRouter = require('./routes/mpesa');
const invoiceRouter = require('./routes/invoices');
require('./services/schedule'); // Initialize cron jobs
const app = express();


app.use(helmet());
app.use(morgan('dev'));

app.use(cookieParser());
// Middleware
app.use(cors({ credentials: true, origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());


// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/routes', routeRouter);
app.use('/api/pickUps', pickUpRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/invoices', invoiceRouter);
app.use('/universal', mpesaRouter);
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
