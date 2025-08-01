// MongoDB to MySQL/Sequelize Query Conversion Script
// This script contains the patterns and replacements needed to complete the MongoDB to MySQL conversion

/**
 * Common MongoDB to Sequelize Conversions:
 */

// 1. findById -> findByPk
// MongoDB: Model.findById(id)
// Sequelize: Model.findByPk(id)

// 2. find() -> findAll()
// MongoDB: Model.find(query)
// Sequelize: Model.findAll({ where: query })

// 3. findOne() -> findOne()
// MongoDB: Model.findOne(query)
// Sequelize: Model.findOne({ where: query })

// 4. findByIdAndUpdate -> update + findByPk
// MongoDB: Model.findByIdAndUpdate(id, data, options)
// Sequelize: await Model.update(data, { where: { id } }); const result = await Model.findByPk(id);

// 5. findByIdAndDelete -> destroy
// MongoDB: Model.findByIdAndDelete(id)
// Sequelize: Model.destroy({ where: { id } })

// 6. countDocuments -> count
// MongoDB: Model.countDocuments(query)
// Sequelize: Model.count({ where: query })

// 7. populate -> include
// MongoDB: .populate('field', 'select')
// Sequelize: include: [{ model: AssociatedModel, as: 'alias', attributes: ['select'] }]

// 8. sort -> order
// MongoDB: .sort({ field: -1 })
// Sequelize: order: [['field', 'DESC']]

// 9. skip/limit -> offset/limit
// MongoDB: .skip(skip).limit(limit)
// Sequelize: offset: skip, limit: limit

// 10. $or operator
// MongoDB: { $or: [{ field1: value1 }, { field2: value2 }] }
// Sequelize: { [Op.or]: [{ field1: value1 }, { field2: value2 }] }

// 11. $in operator
// MongoDB: { field: { $in: [val1, val2] } }
// Sequelize: { field: { [Op.in]: [val1, val2] } }

// 12. Date range queries
// MongoDB: { field: { $gte: startDate, $lte: endDate } }
// Sequelize: { field: { [Op.between]: [startDate, endDate] } }

/**
 * Specific fixes needed in controllers:
 */

const conversionPatterns = {
  // Auth Controller
  authController: {
    // Already mostly converted, just need to ensure all _id references are changed to id
    patterns: [
      {
        from: 'req.user._id',
        to: 'req.user.id'
      },
      {
        from: 'user._id',
        to: 'user.id'
      },
      {
        from: 'organization._id',
        to: 'organization.id'
      }
    ]
  },

  // Pickup Controller - Additional conversions needed
  pickupController: {
    patterns: [
      {
        from: `query.$or = [
          { bagsCollected: { $eq: 0 } },
          { bagsCollected: { $exists: false } }
        ];`,
        to: `query[Op.or] = [
          { bagsCollected: 0 },
          { bagsCollected: null }
        ];`
      },
      {
        from: `const pickups = await Pickup.find(query)
      .sort({ scheduledDate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('userId', 'name email phone address accountNumber')
      .populate('routeId', 'name path')
      .populate('driverId', 'name email phone');`,
        to: `const pickups = await Pickup.findAll({
      where: query,
      order: [['scheduledDate', 'DESC']],
      offset: skip,
      limit: parseInt(limit),
      include: [
        { model: User, as: 'user', attributes: ['name', 'email', 'phone', 'address', 'accountNumber'] },
        { model: Route, as: 'route', attributes: ['name', 'path'] },
        { model: User, as: 'driver', attributes: ['name', 'email', 'phone'] }
      ]
    });`
      }
    ]
  },

  // Payment Controller
  paymentController: {
    patterns: [
      {
        from: 'User.findById(userId)',
        to: 'User.findByPk(userId)'
      },
      {
        from: '.populate(',
        to: 'include: [{ model: '
      }
    ]
  }
};

/**
 * Required imports for all controllers using Sequelize operators:
 */
const requiredImports = `
const { Op } = require('sequelize');
`;

/**
 * Model association aliases that should be used:
 */
const modelAliases = {
  User: {
    route: 'route',
    organization: 'organization', 
    creator: 'creator',
    payment: 'payment'
  },
  Route: {
    activeDriver: 'activeDriver',
    users: 'users'
  },
  Pickup: {
    user: 'user',
    route: 'route', 
    driver: 'driver'
  },
  Bag: {
    client: 'client',
    driver: 'driver'
  }
};

console.log('MongoDB to MySQL Conversion Patterns Ready');
console.log('Apply these patterns to complete the conversion');

module.exports = {
  conversionPatterns,
  requiredImports,
  modelAliases
};