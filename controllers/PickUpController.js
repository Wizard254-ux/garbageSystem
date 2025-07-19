const PickupRecords = require('../models/PickUpRecords');
const User= require('../models/User');
const {sendVerificationCode} = require('../services/mail');
const mongoose = require('mongoose');


const markPicked = async (req, res) => {
  try {
    const { user_id, date, notes } = req.body;

    // Validate required fields
    if (!user_id || !date) {
      return res.status(400).json({
        success: false,
        error: 'User ID and date are required'
      });
    }

    // Check if user exists
    const user = await User.findById(user_id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Format date
    const pickupDate = new Date(date);
    const dateKey = pickupDate.toISOString().split('T')[0];

    // Helper function to get week start and end dates (Monday to Sunday)
    const getWeekDates = (inputDate) => {
      const date = new Date(inputDate);
      const day = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
      
      // Calculate days to subtract to get to Monday
      // If day is 0 (Sunday), we need to go back 6 days to get Monday
      // If day is 1 (Monday), we need to go back 0 days
      // If day is 2 (Tuesday), we need to go back 1 day, etc.
      const daysToSubtract = day === 0 ? 6 : day - 1;
      
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - daysToSubtract);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      
      return {
        start: weekStart.toISOString().split('T')[0],
        end: weekEnd.toISOString().split('T')[0]
      };
    };

    // Get current week dates
    const currentWeek = getWeekDates(pickupDate);
        console.log('hhhhh',currentWeek)


    // Find existing pickup record for user
    let pickupRecord = await PickupRecords.findOne({ user_id: user_id });
    console.log(pickupRecord)
    
    if (pickupRecord) {
      // Check if there's already a pickup record for the current week
      const pickupDatesMap = pickupRecord.pickup_dates.toObject ? 
        pickupRecord.pickup_dates.toObject() : pickupRecord.pickup_dates;

      let hasRecordThisWeek = false;
      let existingWeekRecord = null;

      console.log('bgbgbg',pickupDatesMap)
      console.log(pickupDatesMap.get(date))

      // Check all existing pickup dates
      if (pickupDatesMap.get(date)){
        const existingWeek = getWeekDates(date);
        console.log('jhjjjjjj',existingWeek)
        
        // Check if existing date is in the same week as the new date
        if (existingWeek.start === currentWeek.start && existingWeek.end === currentWeek.end) {
          hasRecordThisWeek = true;
          existingWeekRecord = {
            date: date,
            status: pickupDatesMap.get(date).status,
            timestamp: pickupDatesMap.get(date).timestamp
          };
         
        }
      }

      // If there's already a record for this week, prevent new entry
      if (hasRecordThisWeek) {
        return res.status(400).json({
          success: false,
          error: `A pickup record already exists for this week (${currentWeek.start} to ${currentWeek.end})`,
          existingRecord: existingWeekRecord,
          message: 'Cannot create multiple pickup records within the same week. Please wait until next week.'
        });
      }
    } else {
      // Create new pickup record if none exists
      pickupRecord = new PickupRecords({
        user_id: user_id,
        pickup_dates: new Map()
      });
    }

    // Mark as picked
    await pickupRecord.markAsPicked(dateKey, notes);

    // Send email notification
    try {
      await sendVerificationCode(user, true);
      console.log(`Email sent to ${user.email} for pickup confirmation`);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Continue execution even if email fails - don't return error
      console.log('Continuing despite email failure...');
    }

    return res.status(200).json({
      success: true,
      message: 'Pickup marked as completed and notification sent',
      data: {
        user_id: user_id,
        date: dateKey,
        status: 'picked',
        user_email: user.email,
        week: currentWeek
      }
    });

  } catch (error) {
    console.error('Error marking pickup:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};




const pickUpHistory=async (req, res) => {
  try {
    const { user_id } = req.params;
    
    const pickupRecord = await PickupRecords.findOne({ user_id }).populate('user_id');
    
    if (!pickupRecord) {
      return res.status(404).json({
        success: false,
        error: 'No pickup records found for this user'
      });
    }

    // Convert Map to Object for JSON response
    const pickupHistory = Object.fromEntries(pickupRecord.pickup_dates);

    return res.status(200).json({
      success: true,
      data: {
        user: pickupRecord.user_id,
        pickup_history: pickupHistory
      }
    });

  } catch (error) {
    console.error('Error fetching pickup history:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

// Route to check pickup status for a specific date
const pickUpStatus=async (req, res) => {
  try {
    const { user_id, date } = req.params;
    
    const pickupRecord = await PickupRecords.findOne({ user_id });
    
    if (!pickupRecord) {
      return res.status(404).json({
        success: false,
        error: 'No pickup records found for this user'
      });
    }

    const status = pickupRecord.getPickupStatus(date);
    
    return res.status(200).json({
      success: true,
      data: {
        user_id,
        date,
        status: status || 'no_record'
      }
    });

  } catch (error) {
    console.error('Error checking pickup status:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

async function batchMarkUnpicked() {
  try {
    console.log('Starting batch job to mark unpicked garbage...');
    
    const users = await User.find({ pickUpDay: { $exists: true } });
    
    // Helper function to convert day name to number (0 = Sunday, 1 = Monday, etc.)
    const getDayNumber = (dayName) => {
      const dayMap = {
        'sunday': 0,
        'monday': 1,
        'tuesday': 2,
        'wednesday': 3,
        'thursday': 4,
        'friday': 5,
        'saturday': 6
      };
      return dayMap[dayName.toLowerCase()];
    };
    
    // Get current week's dates based on pickup days
    const today = new Date();
    const currentWeekStart = new Date(today.setDate(today.getDate() - today.getDay()));
    
    for (const user of users) {
      // Convert pickup day name to number
      const pickupDayNumber = getDayNumber(user.pickUpDay);
              console.log('record for user ',user)

      
      // Skip if invalid day name
      if (pickupDayNumber === undefined) {
        console.log(`Invalid pickup day for user ${user.email}: ${user.pickup_day}`);
        continue;
      }
      
      // Calculate expected pickup date for this week based on user's pickup_day
      const expectedPickupDate = new Date(currentWeekStart);
      expectedPickupDate.setDate(currentWeekStart.getDate() + pickupDayNumber);
      
      // Only process if the expected pickup date has passed
      if (expectedPickupDate <= new Date()) {
        const dateKey = expectedPickupDate.toISOString().split('T')[0];
        
        // Find or create pickup record
        let pickupRecord = await PickupRecords.findOne({ user_id: user._id });
        
        if (!pickupRecord) {
          pickupRecord = new PickupRecords({
            user_id: user._id,
            pickup_dates: new Map()
          });
        }
        
        // Check if already marked for this date
        const existingRecord = pickupRecord.getPickupStatus(dateKey);
        
        if (!existingRecord) {
          // Mark as unpicked
          await pickupRecord.markAsUnpicked(dateKey, 'Automatically marked as unpicked by batch job');
          console.log(`Marked ${user.email} as unpicked for ${dateKey} (${user.pickup_day})`);
        }
      }
    }
    
    console.log('Batch job completed successfully');
    
  } catch (error) {
    console.error('Batch job failed:', error);
  }
}





const getUsersByPickupStatus = async (req, res) => {
  const { routeId, pickStatus } = req.params;
  const { 
    startDate, 
    endDate, 
    date, 
    day 
  } = req.query; // Get filters from query parameters

  console.log('Fetching users for route:', routeId, 'pickStatus:', pickStatus);

  try {
    // Validate required parameters
    if (!routeId || !pickStatus) {
      return res.status(400).json({
        success: false,
        error: 'routeId and pickStatus are required parameters'
      });
    }

    // Validate pickStatus
    if (!['picked', 'unpicked', 'not_yet_marked', 'all'].includes(pickStatus)) {
      return res.status(400).json({
        success: false,
        error: 'pickStatus must be one of "picked", "unpicked", "not_yet_marked", or "all"'
      });
    }

    // Validate day if provided
    if (day && !['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(day.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: 'day must be one of: monday, tuesday, wednesday, thursday, friday, saturday, sunday'
      });
    }

    // Validate date parameters (only if provided)
    if (date && (startDate || endDate)) {
      return res.status(400).json({
        success: false,
        error: 'Cannot use both "date" and "startDate/endDate" parameters together'
      });
    }

    if ((startDate && !endDate) || (!startDate && endDate)) {
      return res.status(400).json({
        success: false,
        error: 'Both startDate and endDate must be provided when using date range'
      });
    }

    // Helper function to convert DD-MM-YYYY to YYYY-MM-DD format
    const convertDateFormat = (dateStr) => {
      if (!dateStr) return null;
      const [day, month, year] = dateStr.split('-');
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    };

    // Validate and convert date formats
    let convertedDate = null;
    let convertedStartDate = null;
    let convertedEndDate = null;

    if (date) {
      if (!/^\d{2}-\d{2}-\d{4}$/.test(date)) {
        return res.status(400).json({
          success: false,
          error: 'date must be in DD-MM-YYYY format (e.g., 15-01-2024)'
        });
      }
      convertedDate = convertDateFormat(date);
    }

    if (startDate) {
      if (!/^\d{2}-\d{2}-\d{4}$/.test(startDate)) {
        return res.status(400).json({
          success: false,
          error: 'startDate must be in DD-MM-YYYY format (e.g., 15-01-2024)'
        });
      }
      convertedStartDate = convertDateFormat(startDate);
    }

    if (endDate) {
      if (!/^\d{2}-\d{2}-\d{4}$/.test(endDate)) {
        return res.status(400).json({
          success: false,
          error: 'endDate must be in DD-MM-YYYY format (e.g., 20-01-2024)'
        });
      }
      convertedEndDate = convertDateFormat(endDate);
    }

    // Handle 'all' pickup status - simple query without pickup records
    if (pickStatus === 'all') {
      if (req.user.role !== 'organization') {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized access'
        });
      }

      let userQuery = { 
        role: "client", 
        isActive: true 
      };

      // Only add route filter if routeId is not "all"
      if (routeId !== 'all') {
        userQuery.route = routeId;
      }

      // Add day filter if provided
      if (day) {
        userQuery.pickUpDay = day.toLowerCase();
      }

      const users = await User.find(userQuery)
        .select('name address pickUpDay phone email');

      return res.status(200).json({
        success: true,
        users
      });
    }

    // For other statuses, use a simpler approach with multiple queries
    let baseQuery = {
      route: new mongoose.Types.ObjectId(routeId),
      role: "client",
      isActive: true
    };

    // Add day filter if provided
    if (day) {
      baseQuery.pickUpDay = day.toLowerCase();
    }

    // Get all users matching the base criteria
    const allUsers = await User.find(baseQuery)
      .select('name address pickUpDay phone email')
      .lean();

    // If no users found, return empty result
    if (allUsers.length === 0) {
      return res.status(200).json({
        success: true,
        users: []
      });
    }

    // Get user IDs for pickup records lookup
    const userIds = allUsers.map(user => user._id);

    // Get pickup records for these users
    const pickupRecords = await PickupRecords.find({
      user_id: { $in: userIds }
    }).lean();

    // Create a map of user_id to pickup records
    const pickupRecordsMap = {};
    pickupRecords.forEach(record => {
      pickupRecordsMap[record.user_id.toString()] = record;
    });

    // Helper function to check if a date is within range
    const isDateInRange = (dateKey, startDate, endDate) => {
      return dateKey >= startDate && dateKey <= endDate;
    };

    // Helper function to get date keys for filtering
    const getDateKeys = () => {
      if (convertedDate) {
        return [new Date(convertedDate).toISOString().split('T')[0]];
      } else if (convertedStartDate && convertedEndDate) {
        const start = new Date(convertedStartDate);
        const end = new Date(convertedEndDate);
        const dateKeys = [];
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          dateKeys.push(d.toISOString().split('T')[0]);
        }
        return dateKeys;
      }
      return null;
    };

    const dateKeys = getDateKeys();

    // Filter users based on pickup status
    const filteredUsers = allUsers.filter(user => {
      const userId = user._id.toString();
      const userPickupRecord = pickupRecordsMap[userId];

      if (pickStatus === 'not_yet_marked') {
        // User has no pickup records at all
        if (!userPickupRecord || !userPickupRecord.pickup_dates || Object.keys(userPickupRecord.pickup_dates).length === 0) {
          return true;
        }

        // If date filters are specified, check if user has no records for those dates
        if (dateKeys) {
          return dateKeys.every(dateKey => !userPickupRecord.pickup_dates[dateKey]);
        }

        // No date filter, so user with any pickup record should be excluded
        return false;
      }

      // For 'picked' and 'unpicked' statuses
      if (!userPickupRecord || !userPickupRecord.pickup_dates || Object.keys(userPickupRecord.pickup_dates).length === 0) {
        return false;
      }

      // Check pickup dates - pickup_dates is a MongoDB Map
      const pickupDatesMap = userPickupRecord.pickup_dates;
      
      if (dateKeys) {
        // Check specific dates
        return dateKeys.some(dateKey => {
          const dateRecord = pickupDatesMap[dateKey];
          return dateRecord && dateRecord.status === pickStatus;
        });
      } else {
        // Check all dates in the map
        for (let dateKey in pickupDatesMap) {
          const dateRecord = pickupDatesMap[dateKey];
          if (dateRecord && dateRecord.status === pickStatus) {
            return true;
          }
        }
        return false;
      }
    });

    res.status(200).json({
      success: true,
      users: filteredUsers,
      filters: {
        routeId,
        pickStatus,
        ...(date && { date }),
        ...(startDate && endDate && { startDate, endDate }),
        ...(day && { day })
      }
    });

  } catch (error) {
    console.error("Error fetching users by pickup status:", error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};



module.exports = {markPicked,batchMarkUnpicked,pickUpHistory,pickUpStatus,getUsersByPickupStatus};
