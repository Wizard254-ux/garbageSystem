const Pickup = require('../models/Pickup');
const User = require('../models/User');
const Route = require('../models/Route');

// Helper function to get the date of a specific day in the current week
const getDateOfDay = (dayName, referenceDate = new Date()) => {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIndex = days.indexOf(dayName.toLowerCase());
  
  if (dayIndex === -1) return null;
  
  // Clone the reference date to avoid modifying it
  const date = new Date(referenceDate);
  
  // Get the current day index (0 = Sunday, 1 = Monday, etc.)
  const currentDayIndex = date.getDay();
  
  // Calculate the difference between the current day and the target day
  let diff = dayIndex - currentDayIndex;
  
  // If the difference is negative, it means the day is in the next week
  if (diff < 0) diff += 7;
  
  // Set the date to the target day
  date.setDate(date.getDate() + diff);
  
  // Reset time to midnight
  date.setHours(0, 0, 0, 0);
  
  return date;
};

// Helper function to get the start of the week (Sunday)
const getStartOfWeek = (date = new Date()) => {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() - day);
  result.setHours(0, 0, 0, 0);
  return result;
};

// Create pickup for a new client
const createInitialPickup = async (userId) => {
  try {
    // Get client details
    const client = await User.findById(userId);
    if (!client || client.role !== 'client') {
      throw new Error('Client not found');
    }
    
    // Get route details
    const route = await Route.findById(client.routeId);
    if (!route) {
      throw new Error('Route not found');
    }
    
    // Get the service start date
    const serviceStartDate = new Date(client.serviceStartDate);
    
    // Calculate pickup day from service start date
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const pickupDay = days[serviceStartDate.getDay()];
    
    // Get the week of the service start date
    const weekOf = getStartOfWeek(serviceStartDate);
    
    // The first pickup date is the service start date itself
    const pickupDate = new Date(serviceStartDate);
    
    // Create the pickup
    const pickup = new Pickup({
      userId: client._id,
      routeId: client.routeId,
      scheduledDate: pickupDate,
      pickupDay,
      weekOf,
      status: 'scheduled'
    });
    
    await pickup.save();
    return pickup;
  } catch (error) {
    console.error('Error creating initial pickup:', error);
    throw error;
  }
};

// Create pickups for all active clients for the current week
const createWeeklyPickups = async () => {
  try {
    // Get all active clients
    const clients = await User.find({ 
      role: 'client', 
      isActive: true,
      serviceStartDate: { $exists: true }
    });
    
    const currentDate = new Date();
    const weekOf = getStartOfWeek(currentDate);
    
    const pickupsCreated = [];
    
    for (const client of clients) {
      // Get the service start date
      const serviceStartDate = new Date(client.serviceStartDate);
      
      // Calculate pickup day from service start date
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const pickupDay = days[serviceStartDate.getDay()];
      
      // Check if a pickup already exists for this client for this week
      const existingPickup = await Pickup.findOne({
        userId: client._id,
        weekOf
      });
      
      // Skip if pickup already exists
      if (existingPickup) continue;
      
      // Get the actual pickup date based on the pickup day
      const pickupDate = getDateOfDay(pickupDay, weekOf);
      
      // Create the pickup
      const pickup = new Pickup({
        userId: client._id,
        routeId: client.routeId,
        scheduledDate: pickupDate,
        pickupDay,
        weekOf,
        status: 'scheduled'
      });
      
      await pickup.save();
      pickupsCreated.push(pickup);
    }
    
    return pickupsCreated;
  } catch (error) {
    console.error('Error creating weekly pickups:', error);
    throw error;
  }
};

// Mark missed pickups for the previous week
const markMissedPickups = async () => {
  try {
    const currentDate = new Date();
    
    // Get the start of the previous week
    const previousWeekStart = new Date(currentDate);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);
    const previousWeekOf = getStartOfWeek(previousWeekStart);
    
    // Find all scheduled pickups from the previous week
    const scheduledPickups = await Pickup.find({
      status: 'scheduled',
      weekOf: previousWeekOf
    });
    
    // Mark them as missed
    for (const pickup of scheduledPickups) {
      pickup.status = 'missed';
      await pickup.save();
    }
    
    return scheduledPickups;
  } catch (error) {
    console.error('Error marking missed pickups:', error);
    throw error;
  }
};

module.exports = {
  createInitialPickup,
  createWeeklyPickups,
  markMissedPickups,
  getDateOfDay,
  getStartOfWeek
};