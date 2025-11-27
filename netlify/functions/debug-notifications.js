const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const results = {
    timestamp: new Date().toISOString(),
    checks: {}
  };

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Check 1: Can we query the notifications table?
    try {
      const { data, error, count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: false })
        .limit(5);

      if (error) {
        results.checks.notificationsTable = {
          exists: false,
          error: error.message,
          code: error.code,
          hint: error.hint
        };
      } else {
        results.checks.notificationsTable = {
          exists: true,
          rowCount: count,
          recentNotifications: data
        };
      }
    } catch (e) {
      results.checks.notificationsTable = {
        exists: false,
        error: e.message
      };
    }

    // Check 2: Can we query client_checkins table?
    try {
      const { data, error, count } = await supabase
        .from('client_checkins')
        .select('id, client_id, coach_id, coach_feedback, coach_responded_at', { count: 'exact', head: false })
        .limit(5)
        .order('created_at', { ascending: false });

      if (error) {
        results.checks.checkinsTable = {
          exists: false,
          error: error.message
        };
      } else {
        results.checks.checkinsTable = {
          exists: true,
          rowCount: count,
          recentCheckins: data
        };
      }
    } catch (e) {
      results.checks.checkinsTable = {
        exists: false,
        error: e.message
      };
    }

    // Check 3: Test inserting a notification (then delete it)
    try {
      const { data: testNotif, error: insertError } = await supabase
        .from('notifications')
        .insert([{
          type: 'test',
          title: 'Test Notification',
          message: 'This is a test - will be deleted'
        }])
        .select()
        .single();

      if (insertError) {
        results.checks.canInsertNotification = {
          success: false,
          error: insertError.message,
          code: insertError.code,
          details: insertError.details,
          hint: insertError.hint
        };
      } else {
        // Delete the test notification
        await supabase
          .from('notifications')
          .delete()
          .eq('id', testNotif.id);

        results.checks.canInsertNotification = {
          success: true,
          message: 'Successfully inserted and deleted test notification'
        };
      }
    } catch (e) {
      results.checks.canInsertNotification = {
        success: false,
        error: e.message
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(results, null, 2)
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: err.message,
        results
      }, null, 2)
    };
  }
};
