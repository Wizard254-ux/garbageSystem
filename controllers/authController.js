const User = require('../models/User');
const Route = require('../models/Route');
const jwt = require('jsonwebtoken');
const {verificationCodes} = require('../services/mail');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const setCookieToken = (res, token) => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
    console.log("Cookie set with token:", token.substring(0, 20) + "...");
};

const register = async (req, res) => {
  try {
    const { name, email, password, role,phone } = req.body;

   

    // Validation
    if (!name || !email || !password || !role || !phone) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
        $or: [{ email }, { phone }]
      });

        if (existingUser) {
            if (existingUser.email === email) {
              console.log("Matched by email");
            } else if (existingUser.phone === phone) {
              console.log("Matched by phone");
            }
    }


    // Only admin can create organizations, only organizations can create drivers
    if (role === 'organization' && (!req.user || req.user.role !== 'admin')) {
      return res.status(403).json({ message: 'Only admin can create organizations.' });
    }

    if (role === 'driver' && (!req.user || req.user.role !== 'organization')) {
      return res.status(403).json({ message: 'Only organizations can create drivers.' });
    }
    if (role === 'client' && (!req.user || req.user.role !== 'organization')) {
      return res.status(403).json({ message: 'Only organizations can create clients.' });
    }

    // Create user
    const userData = { name, email, password, role ,documents: req.filePaths || [],phone,createdBy: req.user ? req.user._id : null };
    if (role === 'driver') {
      userData.organizationId = req.user._id;
    }

    if (role === 'client') {
          const { route, pickUpDay, address, clientType, serviceStartDate, monthlyRate } = req.body;

          if (!route || !pickUpDay || !address || !clientType || !serviceStartDate || !monthlyRate) {
            return res.status(400).json({ 
              message: 'Route, pick-up day, address, client type, service start date, and monthly rate are required for clients.' 
            });
          }

          // Validate client type
          if (!['residential', 'commercial'].includes(clientType)) {
            return res.status(400).json({ message: 'Client type must be either "residential" or "commercial".' });
          }

          // Validate route
          const validRoute = await Route.findById(route);
          if (!validRoute) {
            return res.status(400).json({ message: 'Invalid route.' });
          }

          // Validate service start date
          const startDate = new Date(serviceStartDate);
          if (isNaN(startDate.getTime())) {
            return res.status(400).json({ message: 'Invalid service start date.' });
          }

          // Validate monthly rate
          const rate = parseFloat(monthlyRate);
          if (isNaN(rate) || rate <= 0) {
            return res.status(400).json({ message: 'Monthly rate must be a positive number.' });
          }

          userData.route = validRoute.id;
          userData.pickUpDay = pickUpDay.toLowerCase();
          userData.address = address;
          userData.clientType = clientType;
          userData.serviceStartDate = startDate;
          userData.monthlyRate = rate;
          userData.organizationId = req.user._id;
    }


    const user = await User.create(userData);
    
    // Generate token
    const token = generateToken(user._id);
    setCookieToken(res, token);

    res.status(201).json({
      message: 'User created successfully.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Generate token
    const token = generateToken(user._id);
    setCookieToken(res, token);
    console.log(user)

    res.json({
      message: 'Login successful.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        documents: user.documents || [],
      },
      token
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const logout = (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully.' });
};

const getProfile = async (req, res) => {
  try {
    res.json({
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        documents: req.user.documents || [],
        organizationId: req.user.organizationId
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const manageOrganization = async (req, res) => {
  try {
    const { action, organizationId, updateData } = req.body;
    console.log(action, organizationId, updateData)

    // Validation
    if (!action ) {
      return res.status(400).json({ 
        message: 'Action and organizationId are required.' 
      });
    }

    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ 
        message: 'Only admin can manage organizations.' 
      });
    }

    // Find organization
    let organization=null
    if(organizationId){

       organization = await User.findById(organizationId);
       console.log("Organization:", organization);
      if (!organization || organization.role !== 'organization') {
        return res.status(404).json({ 
          message: 'Organization not found.' 
        });
      }

    

    if(req.user._id.toString() !== organization.createdBy.toString()) {
      return res.status(403).json({"message": "You are not authorized to manage this organization."})
    }
  }

    switch (action.toLowerCase()) {
      case 'edit':
        if (!organization) {
          return res.status(400).json({ 
            message: 'organizationId is required for edit action.' 
          });
        }
        return await editOrganization(req, res, organization, updateData);
      
      case 'delete':
            if (!organization) {
          return res.status(400).json({ 
            message: 'organizationId is required for edit action.' 
          });
        }
        return await deleteOrganization(req, res, organization);
      case 'list':
        return await listOrganizations(req, res);
      case 'get':
            if (!organization) {
          return res.status(400).json({ 
            message: 'organizationId is required for get action.' 
          });
        }
        return await getOrganizationDetails(req, res,organization);
      
      case 'stats':
            if (!organization) {
          return res.status(400).json({ 
            message: 'organizationId is required for stats action.' 
          });
        }
        return await getOrganizationStats(req, res,organization);
      
      default:
        return res.status(400).json({ 
          message: 'Invalid action. Supported actions: edit, delete, list, get, stats' 
        });
    }

  } catch (error) {
    res.status(500).json({ 
      message: 'Server error.', 
      error: error.message 
    });
  }
};

const listOrganizations = async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ 
        message: 'Only admin can view organizations.' 
      });
    }

    const { page = 1, limit = 10, search = '', isActive, sortBy = 'createdAt', sortOrder = 'desc' } = req.body;

    // Build query for organizations
    const query = {
      role: 'organization'
    };

    // Add search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    // Add isActive filter
    // if (isActive !== undefined) {
    //   query.isActive = isActive === 'true';
    // }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build sort object
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get organizations with pagination - USE THE BUILT QUERY
    console.log('query ',query)
    const organizations = await User.find(query)
      .select('-password')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count - USE THE BUILT QUERY
    const totalOrganizations = await User.countDocuments(query);
    console.log(totalOrganizations)

    // Get detailed information for each organization
    const organizationsWithDetails = await Promise.all(
      organizations.map(async (org) => {
        // Count drivers and clients for each organization
        const driversCount = await User.countDocuments({
          role: 'driver',
          organizationId: org._id
        });

        const clientsCount = await User.countDocuments({
          role: 'client',
          organizationId: org._id
        });

        const activeDriversCount = await User.countDocuments({
          role: 'driver',
          organizationId: org._id,
          isActive: true
        });

        const activeClientsCount = await User.countDocuments({
          role: 'client',
          organizationId: org._id,
          isActive: true
        });

        return {
          id: org._id,
          name: org.name,
          email: org.email,
          phone: org.phone,
          isActive: org.isActive,
          createdAt: org.createdAt,
          updatedAt: org.updatedAt,
          statistics: {
            totalDrivers: driversCount,
            activeDrivers: activeDriversCount,
            totalClients: clientsCount,
            activeClients: activeClientsCount,
            totalUsers: driversCount + clientsCount
          }
        };
      })
    );

    res.json({
      message: 'Organizations retrieved successfully.',
      organizations: organizationsWithDetails,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalOrganizations / parseInt(limit)),
        totalOrganizations,
        hasNext: skip + organizations.length < totalOrganizations,
        hasPrev: parseInt(page) > 1,
        limit: parseInt(limit)
      },
      summary: {
        totalOrganizations,
        activeOrganizations: organizationsWithDetails.filter(org => org.isActive).length,
        inactiveOrganizations: organizationsWithDetails.filter(org => !org.isActive).length
      }
    });

  } catch (error) {
    res.status(500).json({ 
      message: 'Server error.', 
      error: error.message 
    });
  }
};

const getOrganizationDetails = async (req, res,organization) => {
  try {
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ 
        message: 'Only admin can view organization details.' 
      });
    }

    if (!organization) {
      return res.status(404).json({ 
        message: 'Organization not found.' 
      });
    }

    // Get all drivers and clients for this organization
    const drivers = await User.find({
      role: 'driver',
      organizationId: organization._id
    }).select('-password').sort({ createdAt: -1 });

    const clients = await User.find({
      role: 'client',
      organizationId: organization._id
    }).select('-password').sort({ createdAt: -1 });

    // Calculate statistics
    const stats = {
      totalDrivers: drivers.length,
      activeDrivers: drivers.filter(d => d.isActive).length,
      totalClients: clients.length,
      activeClients: clients.filter(c => c.isActive).length,
      totalUsers: drivers.length + clients.length
    };

    // Group clients by route
    const clientsByRoute = clients.reduce((acc, client) => {
      if (!acc[client.route]) {
        acc[client.route] = [];
      }
      acc[client.route].push({
        id: client._id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        pickUpDay: client.pickUpDay,
        address: client.address,
        isActive: client.isActive
      });
      return acc;
    }, {});

    // Group clients by pickup day
    const clientsByPickupDay = clients.reduce((acc, client) => {
      if (!acc[client.pickUpDay]) {
        acc[client.pickUpDay] = [];
      }
      acc[client.pickUpDay].push({
        id: client._id,
        name: client.name,
        route: client.route,
        address: client.address,
        isActive: client.isActive
      });
      return acc;
    }, {});

    res.json({
      message: 'Organization details retrieved successfully.',
      organization: {
        id: organization._id,
        name: organization.name,
        email: organization.email,
        phone: organization.phone,
        isActive: organization.isActive,
        createdAt: organization.createdAt,
        updatedAt: organization.updatedAt
      },
      statistics: stats,
      drivers: drivers.map(driver => ({
        id: driver._id,
        name: driver.name,
        email: driver.email,
        phone: driver.phone,
        isActive: driver.isActive,
        createdAt: driver.createdAt
      })),
      clients: clients.map(client => ({
        id: client._id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        route: client.route,
        pickUpDay: client.pickUpDay,
        address: client.address,
        isActive: client.isActive,
        createdAt: client.createdAt
      })),
      analytics: {
        clientsByRoute,
        clientsByPickupDay,
        routeStats: Object.keys(clientsByRoute).map(route => ({
          route,
          clientCount: clientsByRoute[route].length,
          activeClients: clientsByRoute[route].filter(c => c.isActive).length
        })),
        pickupDayStats: Object.keys(clientsByPickupDay).map(day => ({
          day,
          clientCount: clientsByPickupDay[day].length,
          activeClients: clientsByPickupDay[day].filter(c => c.isActive).length
        }))
      }
    });

  } catch (error) {
    res.status(500).json({ 
      message: 'Server error.', 
      error: error.message 
    });
  }
};

const getOrganizationStats = async (req, res, organization) => {
  try {
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ 
        message: 'Only admin can view organization statistics.' 
      });
    }

    // Get overall statistics
    const totalOrganizations = await User.countDocuments({ role: 'organization' });
    const activeOrganizations = await User.countDocuments({ role: 'organization', isActive: true });
    const totalDrivers = await User.countDocuments({ role: 'driver' });
    const activeDrivers = await User.countDocuments({ role: 'driver', isActive: true });
    const totalClients = await User.countDocuments({ role: 'client' });
    const activeClients = await User.countDocuments({ role: 'client', isActive: true });

    // Get organizations with their user counts
    const organizations = await User.find({ role: 'organization' }).select('-password');
    
    const organizationStats = await Promise.all(
      organizations.map(async (org) => {
        const driverCount = await User.countDocuments({ role: 'driver', organizationId: org._id });
        const clientCount = await User.countDocuments({ role: 'client', organizationId: org._id });
        
        return {
          id: org._id,
          name: org.name,
          isActive: org.isActive,
          driverCount,
          clientCount,
          totalUsers: driverCount + clientCount,
          createdAt: org.createdAt
        };
      })
    );

    // Sort organizations by total users
    organizationStats.sort((a, b) => b.totalUsers - a.totalUsers);

    res.json({
      message: 'Organization statistics retrieved successfully.',
      overallStats: {
        totalOrganizations,
        activeOrganizations,
        inactiveOrganizations: totalOrganizations - activeOrganizations,
        totalDrivers,
        activeDrivers,
        inactiveDrivers: totalDrivers - activeDrivers,
        totalClients,
        activeClients,
        inactiveClients: totalClients - activeClients,
        totalUsers: totalDrivers + totalClients
      },
      organizationBreakdown: organizationStats,
      topOrganizations: organizationStats.slice(0, 10) // Top 10 organizations by user count
    });

  } catch (error) {
    res.status(500).json({ 
      message: 'Server error.', 
      error: error.message 
    });
  }
};
const editOrganization = async (req, res, organization, updateData) => {
  try {
    if (!updateData || Object.keys(updateData).length === 0) {
      return res.status(400).json({ 
        message: 'Update data is required for edit action.' 
      });
    }

    // Define allowed fields for update
    const allowedFields = ['name', 'email', 'phone', 'isActive'];
    const filteredUpdateData = {};

    // Filter and validate update data
    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        filteredUpdateData[key] = value;
      }
    }

    if (Object.keys(filteredUpdateData).length === 0) {
      return res.status(400).json({ 
        message: `No valid fields to update. Allowed fields: ${allowedFields.join(', ')}` 
      });
    }

    // Check for duplicate email or phone if they're being updated
    if (filteredUpdateData.email || filteredUpdateData.phone) {
      const duplicateQuery = {
        _id: { $ne: organization._id },
        $or: []
      };

      if (filteredUpdateData.email) {
        duplicateQuery.$or.push({ email: filteredUpdateData.email });
      }
      if (filteredUpdateData.phone) {
        duplicateQuery.$or.push({ phone: filteredUpdateData.phone });
      }

      const existingUser = await User.findOne(duplicateQuery);
      if (existingUser) {
        return res.status(400).json({ 
          message: 'Email or phone already exists.' 
        });
      }
    }

    // Update organization
    const updatedOrganization = await User.findByIdAndUpdate(
      organization._id,
      filteredUpdateData,
      { new: true, runValidators: true }
    );

    res.json({
      message: 'Organization updated successfully.',
      organization: {
        id: updatedOrganization._id,
        name: updatedOrganization.name,
        email: updatedOrganization.email,
        phone: updatedOrganization.phone,
        role: updatedOrganization.role,
        isActive: updatedOrganization.isActive
      }
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Email or phone already exists.' 
      });
    }
    throw error;
  }
};

const deleteOrganization = async (req, res, organization) => {
  try {
    // Check if organization has associated drivers or clients
    const associatedUsers = await User.find({ 
      organizationId: organization._id 
    });

    if (associatedUsers.length > 0) {
      return res.status(400).json({ 
        message: `Cannot delete organization. It has ${associatedUsers.length} associated users (drivers/clients).` 
      });
    }

    // Delete organization
    await User.findByIdAndDelete(organization._id);

    res.json({
      message: 'Organization deleted successfully.',
      deletedOrganization: {
        id: organization._id,
        name: organization.name,
        email: organization.email
      }
    });

  } catch (error) {
    throw error;
  }
};

const manageOrganizationUsers = async (req, res) => {
  try {
    const { action, userType, userId, updateData } = req.body;

    // Validation
    if (!action || !userType) {
      return res.status(400).json({ 
        message: 'Action and userType are required.' 
      });
    }

    // Check if user is organization
    console.log('managing users')
    if (!req.user || req.user.role !== 'organization') {
      return res.status(403).json({ 
        message: 'Only organizations can manage users.' 
      });
    }

    // Validate userType
    if (!['client', 'driver'].includes(userType.toLowerCase())) {
      return res.status(400).json({ 
        message: 'Invalid userType. Must be either "client" or "driver".' 
      });
    }

    switch (action.toLowerCase()) {
      
      
      case 'edit':
        if (!userId) {
          return res.status(400).json({ message: 'userId is required for edit action.' });
        }
        return await editUser(req, res, userType.toLowerCase(), userId, updateData);
      
      case 'delete':
        if (!userId) {
          return res.status(400).json({ message: 'userId is required for delete action.' });
        }
        return await deleteUser(req, res, userType.toLowerCase(), userId);
      
      case 'list':
        return await listUsers(req, res, userType.toLowerCase());
      case 'get':
        const user=await User.findOne({
          _id: userId,
          role: userType,
          createdBy: req.user._id
        }).select('-password','-payment');

        return res.status(200).json({
          message: `${userType.charAt(0).toUpperCase() + userType.slice(1)} retrieved successfully.`,
          user: user
        })
      
      default:
        return res.status(400).json({ 
          message: 'Invalid action. Supported actions: create, edit, delete, list' 
        });
    }

  } catch (error) {
    res.status(500).json({ 
      message: 'Server error.', 
      error: error.message 
    });
  }
};


const editUser = async (req, res, userType, userId, updateData) => {
  try {
    if (!updateData || Object.keys(updateData).length === 0) {
      return res.status(400).json({ 
        message: 'Update data is required for edit action.' 
      });
    }

    // Find user and verify it belongs to the organization
    const user = await User.findOne({
      _id: userId,
      role: userType,
      organizationId: req.user._id,
      createdBy: req.user._id
    });

    if (!user) {
      return res.status(404).json({ 
        message: `${userType.charAt(0).toUpperCase() + userType.slice(1)} not found or doesn't belong to your organization.` 
      });
    }

    // Define allowed fields for update based on user type
    const commonFields = ['name', 'email', 'phone', 'isActive'];
    const clientFields = ['route', 'pickUpDay', 'address'];
    const allowedFields = userType === 'client' 
      ? [...commonFields, ...clientFields] 
      : commonFields;

    const filteredUpdateData = {};

    // Filter and validate update data
    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        if (key === 'pickUpDay' && value) {
          filteredUpdateData[key] = value.toLowerCase();
        } else {
          filteredUpdateData[key] = value;
        }
      }
    }

    if (Object.keys(filteredUpdateData).length === 0) {
      return res.status(400).json({ 
        message: `No valid fields to update. Allowed fields: ${allowedFields.join(', ')}` 
      });
    }

    // Check for duplicate email or phone if they're being updated
    if (filteredUpdateData.email || filteredUpdateData.phone) {
      const duplicateQuery = {
        _id: { $ne: user._id },
        $or: []
      };

      if (filteredUpdateData.email) {
        duplicateQuery.$or.push({ email: filteredUpdateData.email });
      }
      if (filteredUpdateData.phone) {
        duplicateQuery.$or.push({ phone: filteredUpdateData.phone });
      }

      const existingUser = await User.findOne(duplicateQuery);
      if (existingUser) {
        return res.status(400).json({ 
          message: 'Email or phone already exists.' 
        });
      }
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      filteredUpdateData,
      { new: true, runValidators: true }
    );

    const responseUser = {
      id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      role: updatedUser.role,
      isActive: updatedUser.isActive,
      organizationId: updatedUser.organizationId
    };

    if (userType === 'client') {
      responseUser.route = updatedUser.route;
      responseUser.pickUpDay = updatedUser.pickUpDay;
      responseUser.address = updatedUser.address;
    }

    res.json({
      message: `${userType.charAt(0).toUpperCase() + userType.slice(1)} updated successfully.`,
      user: responseUser
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Email or phone already exists.' 
      });
    }
    throw error;
  }
};

const deleteUser = async (req, res, userType, userId) => {
  try {
    // Find user and verify it belongs to the organization
    const user = await User.findOne({
      _id: userId,
      role: userType,
      organizationId: req.user._id,
      createdBy: req.user._id

    });

    if (!user) {
      return res.status(404).json({ 
        message: `${userType.charAt(0).toUpperCase() + userType.slice(1)} not found or doesn't belong to your organization.` 
      });
    }

    // Delete user
    await User.findByIdAndDelete(user._id);

    res.json({
      message: `${userType.charAt(0).toUpperCase() + userType.slice(1)} deleted successfully.`,
      deletedUser: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    throw error;
  }
};

const listUsers = async (req, res, userType) => {
  try {
    const { page = 1, limit = 10, search = '', isActive } = req.query;
       console.log(userType,req.user._id)

    // Build query
    const query = {
      role: userType,
      createdBy:req.user._id
    };

    // Add search filter
    // if (search) {
    //   query.$or = [
    //     { name: { $regex: search, $options: 'i' } },
    //     { email: { $regex: search, $options: 'i' } },
    //     { phone: { $regex: search, $options: 'i' } }
    //   ];
    // }

    // Add isActive filter
    // if (isActive !== undefined) {
    //   query.isActive = isActive === 'true';
    // }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get users with pagination
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const totalUsers = await User.countDocuments(query);

    const responseUsers = users.map(user => {
      const userObj = {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        createdBy: user.createdBy,
        createdAt: user.createdAt,
        organizationId:req.user._id,
        accountNumber:user.accountNumber
      };

      if (userType === 'client') {
        userObj.route = user.route;
        userObj.pickUpDay = user.pickUpDay;
        userObj.address = user.address;
      }

      return userObj;
    });

    res.json({
      message: `${userType.charAt(0).toUpperCase() + userType.slice(1)}s retrieved successfully.`,
      users: responseUsers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalUsers / parseInt(limit)),
        totalUsers,
        hasNext: skip + users.length < totalUsers,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    throw error;
  }
};


const changePassword = async (req, res) => {
  try {
    const {verificationCode, currentPassword, newPassword } = req.body;
    const email=req.user.email
    // Validation
    if (!email || !verificationCode || !currentPassword || !newPassword) {
      return res.status(400).json({ 
        message: 'All fields are required.' 
      });
    }

    // Check verification code
    const storedData = verificationCodes.get(email);
    if (!storedData) {
      return res.status(400).json({ 
        message: 'Invalid or expired verification code.' 
      });
    }

    // Check if code is expired
    if (new Date() > storedData.expiresAt) {
      verificationCodes.delete(email); // Clean up expired code
      return res.status(400).json({ 
        message: 'Verification code has expired. Please request a new one.' 
      });
    }

    // Check if code matches
    if (storedData.code !== verificationCode) {
      return res.status(400).json({ 
        message: 'Invalid verification code.' 
      });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user || user._id.toString() !== storedData.userId) {
      return res.status(404).json({ 
        message: 'User not found.' 
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ 
        message: 'Current password is incorrect.' 
      });
    }

    // Validate new password
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        message: 'New password must be at least 6 characters long.' 
      });
    }

    // Check if new password is different from current
    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({ 
        message: 'New password must be different from current password.' 
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Clean up verification code
    verificationCodes.delete(email);

    res.json({
      message: 'Password changed successfully.'
    });

  } catch (error) {
    res.status(500).json({ 
      message: 'Server error.', 
      error: error.message 
    });
  }
};

module.exports = { 
  register, 
  login, 
  logout, 
  getProfile, 
  manageOrganization, 
  manageOrganizationUsers, 
  changePassword, 
  listOrganizations, 
  getOrganizationDetails, 
  getOrganizationStats, 
  editOrganization, 
  deleteOrganization 
};
