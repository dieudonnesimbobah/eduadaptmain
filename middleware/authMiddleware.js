// middleware/authMiddleware.js - JWT token verification
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  // Prefer httpOnly cookie; fall back to Bearer header for API clients / older sessions
  if (req.cookies && req.cookies.ea_token) {
    token = req.cookies.ea_token;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Attach user to request (exclude password)
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (!req.user.isActive) {
      return res.status(403).json({ message: 'Your account has been deactivated' });
    }

    next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized, token invalid' });
  }
};

// Middleware for protecting HTML pages - redirects to login instead of returning JSON
const protectHtml = async (req, res, next) => {
  let token;

  if (req.cookies && req.cookies.ea_token) {
    token = req.cookies.ea_token;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.redirect('./login.html');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.redirect('./login.html');
    }

    if (!req.user.isActive) {
      return res.redirect('./login.html');
    }

    next();
  } catch (error) {
    return res.redirect('./login.html');
  }
};

// Middleware for protecting HTML pages with role authorization
const protectHtmlWithRole = (...roles) => {
  return async (req, res, next) => {
    let token;

    if (req.cookies && req.cookies.ea_token) {
      token = req.cookies.ea_token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.redirect('./login.html');
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.redirect('./login.html');
      }

      if (!req.user.isActive) {
        return res.redirect('./login.html');
      }

      if (!roles.includes(req.user.role)) {
        return res.redirect('./login.html');
      }

      next();
    } catch (error) {
      return res.redirect('./login.html');
    }
  };
};

module.exports = { protect, protectHtml, protectHtmlWithRole };
