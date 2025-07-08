
const Route = require('../models/Route'); // Assuming you have a Route model defined
const express = require('express');
const app = express();
const manageRoutes = async(req,res) => {
  try {
    const { action, ...data } = req.body;

    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'Action field is required'
      });
    }

    let result;
    
    switch (action.toLowerCase()) {
      case 'create':
        // Create a new route
        const newRoute = new Route(data);
        result = await newRoute.save();
        return res.status(201).json({
          success: true,
          action: 'create',
          data: result
        });

      case 'read':
      case 'get':
        // Get routes based on filters
        const filters = { isActive: true, ...data };
        if (data.id) {
          result = await Route.findById(data.id);
        } else {
          result = await Route.find(filters);
        }
        return res.status(200).json({
          success: true,
          action: 'read',
          data: result
        });

      case 'update':
        // Update a route
        if (!data.id) {
          return res.status(400).json({
            success: false,
            error: 'Route ID is required for update action'
          });
        }
        result = await Route.findByIdAndUpdate(
          data.id,
          { $set: data },
          { new: true, runValidators: true }
        );
        if (!result) {
          return res.status(404).json({
            success: false,
            error: 'Route not found'
          });
        }
        return res.status(200).json({
          success: true,
          action: 'update',
          data: result
        });

      case 'delete':
        // Delete a route
        if (!data.id) {
          return res.status(400).json({
            success: false,
            error: 'Route ID is required for delete action'
          });
        }
        result = await Route.findByIdAndDelete(data.id);
        if (!result) {
          return res.status(404).json({
            success: false,
            error: 'Route not found'
          });
        }
        return res.status(200).json({
          success: true,
          action: 'delete',
          data: result
        });

      case 'activate':
        // Activate a route
        if (!data.id) {
          return res.status(400).json({
            success: false,
            error: 'Route ID is required for activate action'
          });
        }
        const routeToActivate = await Route.findById(data.id);
        if (!routeToActivate) {
          return res.status(404).json({
            success: false,
            error: 'Route not found'
          });
        }
        result = await routeToActivate.activate();
        return res.status(200).json({
          success: true,
          action: 'activate',
          data: result
        });

      case 'deactivate':
        // Deactivate a route
        if (!data.id) {
          return res.status(400).json({
            success: false,
            error: 'Route ID is required for deactivate action'
          });
        }
        const routeToDeactivate = await Route.findById(data.id);
        if (!routeToDeactivate) {
          return res.status(404).json({
            success: false,
            error: 'Route not found'
          });
        }
        result = await routeToDeactivate.deactivate();
        return res.status(200).json({
          success: true,
          action: 'deactivate',
          data: result
        });

      case 'search':
        // Search routes by name or path
        const searchQuery = data.query;
        if (!searchQuery) {
          return res.status(400).json({
            success: false,
            error: 'Search query is required'
          });
        }
        result = await Route.find({
          $and: [
            { isActive: true },
            {
              $or: [
                { name: { $regex: searchQuery, $options: 'i' } },
                { path: { $regex: searchQuery, $options: 'i' } },
                { description: { $regex: searchQuery, $options: 'i' } }
              ]
            }
          ]
        });
        return res.status(200).json({
          success: true,
          action: 'search',
          data: result
        });

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown action: ${action}. Supported actions: create, read, update, delete, activate, deactivate, search`
        });
    }

  } catch (error) {
    console.error('Route operation error:', error);
    
    // Handle specific MongoDB errors
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Route with this path and method already exists'
      });
    }
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    }
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID format'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

module.exports = { manageRoutes };
