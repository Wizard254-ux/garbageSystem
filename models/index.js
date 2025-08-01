const sequelize = require('../config/database');
const User = require('./User');
const Route = require('./Route');
const Pickup = require('./Pickup');
const Payment = require('./Payment');
const Invoice = require('./Invoice');
const Bag = require('./Bag');
const Overpayment = require('./Overpayment');
const PickupRecords = require('./PickUpRecords');

// Define associations
User.belongsTo(Route, { foreignKey: 'routeId', as: 'route' });
User.belongsTo(User, { foreignKey: 'organizationId', as: 'organization' });
User.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
User.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment' });

Route.belongsTo(User, { foreignKey: 'activeDriverId', as: 'activeDriver' });
Route.hasMany(User, { foreignKey: 'routeId', as: 'users' });

Pickup.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Pickup.belongsTo(Route, { foreignKey: 'routeId', as: 'route' });
Pickup.belongsTo(User, { foreignKey: 'driverId', as: 'driver' });

Payment.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Payment.belongsTo(Invoice, { foreignKey: 'invoiceId', as: 'invoice' });

Invoice.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Invoice.hasMany(Payment, { foreignKey: 'invoiceId', as: 'payments' });

Bag.belongsTo(User, { foreignKey: 'client_id', as: 'client' });
Bag.belongsTo(User, { foreignKey: 'driver_id', as: 'driver' });

Overpayment.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Overpayment.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment' });
Overpayment.belongsTo(Invoice, { foreignKey: 'appliedToInvoiceId', as: 'appliedToInvoice' });

PickupRecords.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

module.exports = {
  sequelize,
  User,
  Route,
  Pickup,
  Payment,
  Invoice,
  Bag,
  Overpayment,
  PickupRecords
};