// Error handling middleware
const errorHandler = {
  // Log error
  logError: (err, req) => {
    console.error(`[${new Date().toISOString()}] Error:`, {
      message: err.message,
      stack: err.stack,
      method: req.method,
      url: req.url,
      ip: req.ip,
      user: req.session?.userId || 'anonymous'
    });
  },
  
  // Client error response
  clientError: (res, message = 'An error occurred', status = 400) => {
    return res.status(status).json({
      success: false,
      error: message,
      timestamp: new Date().toISOString()
    });
  },
  
  // Server error response
  serverError: (res, err, req) => {
    errorHandler.logError(err, req);
    
    const isProduction = process.env.NODE_ENV === 'production';
    return res.status(500).json({
      success: false,
      error: isProduction ? 'Internal server error' : err.message,
      timestamp: new Date().toISOString()
    });
  },
  
  // Not found error
  notFound: (req, res) => {
    return res.status(404).json({
      success: false,
      error: 'Resource not found',
      path: req.url,
      timestamp: new Date().toISOString()
    });
  },
  
  // Validation error
  validationError: (res, errors) => {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors,
      timestamp: new Date().toISOString()
    });
  },
  
  // Authentication error
  authError: (res, message = 'Authentication required') => {
    return res.status(401).json({
      success: false,
      error: message,
      timestamp: new Date().toISOString()
    });
  },
  
  // Authorization error
  authorizationError: (res, message = 'Not authorized') => {
    return res.status(403).json({
      success: false,
      error: message,
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = errorHandler;
