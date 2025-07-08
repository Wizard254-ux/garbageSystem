const PickupRecords = require('../models/PickUpRecords');
const User= require('../models/User');
const {sendVerificationCode} = require('../services/mail');

const markPicked= async (req, res) => {
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

    // Find or create pickup record for user
    let pickupRecord = await PickupRecords.findOne({ user_id: user_id });
    
    if (!pickupRecord) {
      pickupRecord = new PickupRecords({
        user_id: user_id,
        pickup_dates: new Map()
      });
    }

    // Mark as picked
    
    // Send email notification
    try {
        await sendVerificationCode(user,true);
        console.log(`Email sent to ${user.email} for pickup confirmation`);
        await pickupRecord.markAsPicked(dateKey, notes);
    
      
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      return res.status(500).json({
        success: false,
        error: 'Failed to send email notification'
      });
      // Continue execution even if email fails
    }

    return res.status(200).json({
      success: true,
      message: 'Pickup marked as completed and notification sent',
      data: {
        user_id: user_id,
        date: dateKey,
        status: 'picked',
        user_email: user.email
      }
    });

  } catch (error) {
    console.error('Error marking pickup:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}


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
      if (expectedPickupDate <= new Date()) {/
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


module.exports = {markPicked,batchMarkUnpicked,pickUpHistory,pickUpStatus};
