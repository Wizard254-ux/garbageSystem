const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticateToken = async (req, res, next) => {
  try {
    let token;
    console.log('checking for authentication')
    
    // Check for token in cookie or Authorization header
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
      console.log('token ',token)
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
      console.log('token ',token)
    }

    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

        console.log('checking for authentication')


    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(decoded)
    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password'] }
    });
    console.log(decoded)
    
    if (!user || !user.isActive) {
              console.log('Invalid User')

      return res.status(401).json({ message: 'Invalid token or user not active.' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.log('invalid toke ',token)
    res.status(401).json({ message: 'Invalid token.' });
  }
};

const authorizeRoles = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    console.log('User Role:', req.user,roles)

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `Access denied. Required roles: ${roles.join(', ')}`
      });
    }

    next();
  };
};



module.exports = { authenticateToken, authorizeRoles };