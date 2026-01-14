// Netlify Function to get client activity feed for coaches
// Shows recent food diary entries grouped by meal for the coach to engage with
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const {
      coachId,
      clientId, // Optional: filter to specific client
      mealType, // Optional: filter to specific meal type
      date, // Optional: filter to specific date
      startDate, // Optional: filter date range start
      endDate, // Optional: filter date range end
      limit = '50',
      offset = '0'
    } = event.queryStringParameters || {};

    if (!coachId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'coachId required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Build the query for diary entries - fetch more than limit to account for grouping
    // We'll fetch extra entries to ensure we have enough meals after grouping
    // Use a higher multiplier (10x) to ensure we can paginate back through a week+ of history
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);
    const fetchMultiplier = 10; // Fetch 10x to account for multiple items per meal
    const fetchLimit = parsedLimit * fetchMultiplier;

    // Calculate database-level offset based on the meal offset
    // Since meals group multiple entries, we estimate entries per meal offset
    const dbOffset = parsedOffset * fetchMultiplier;

    let query = supabase
      .from('food_diary_entries')
      .select(`
        id,
        client_id,
        entry_date,
        meal_type,
        food_name,
        brand,
        calories,
        protein,
        carbs,
        fat,
        serving_size,
        serving_unit,
        number_of_servings,
        created_at
      `)
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false })
      .range(dbOffset, dbOffset + fetchLimit - 1);

    // Apply filters
    if (clientId) {
      query = query.eq('client_id', clientId);
    }
    if (mealType) {
      query = query.eq('meal_type', mealType);
    }
    if (date) {
      query = query.eq('entry_date', date);
    }
    if (startDate) {
      query = query.gte('entry_date', startDate);
    }
    if (endDate) {
      query = query.lte('entry_date', endDate);
    }

    const { data: entries, error: entriesError } = await query;

    console.log('coach-activity-feed: coachId=', coachId, 'offset=', parsedOffset, 'dbOffset=', dbOffset, 'entries found=', entries?.length || 0);

    if (entriesError) {
      console.error('Error fetching entries:', entriesError);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: entriesError.message }) };
    }

    if (!entries || entries.length === 0) {
      console.log('coach-activity-feed: No entries found for coach', coachId);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ meals: [], clients: {}, hasMore: false })
      };
    }

    // Get unique client IDs
    const clientIds = [...new Set(entries.map(e => e.client_id))];
    const entryIds = entries.map(e => e.id);

    // Fetch client info
    const { data: clients } = await supabase
      .from('clients')
      .select('id, client_name, email, profile_photo_url, avatar_url')
      .in('id', clientIds);

    const clientMap = {};
    (clients || []).forEach(c => {
      clientMap[c.id] = {
        name: c.client_name || 'Client',
        email: c.email,
        photo: c.profile_photo_url || c.avatar_url
      };
    });

    // Fetch reactions for these entries
    const { data: reactions } = await supabase
      .from('diary_entry_reactions')
      .select('id, entry_id, reaction, created_at')
      .eq('coach_id', coachId)
      .in('entry_id', entryIds);

    const reactionsMap = {};
    (reactions || []).forEach(r => {
      reactionsMap[r.entry_id] = {
        id: r.id,
        reaction: r.reaction,
        createdAt: r.created_at
      };
    });

    // Fetch comments for these entries
    const { data: comments } = await supabase
      .from('diary_entry_comments')
      .select('id, entry_id, comment, author_type, created_at')
      .in('entry_id', entryIds)
      .order('created_at', { ascending: true });

    const commentsMap = {};
    (comments || []).forEach(c => {
      if (!commentsMap[c.entry_id]) {
        commentsMap[c.entry_id] = [];
      }
      commentsMap[c.entry_id].push({
        id: c.id,
        comment: c.comment,
        authorType: c.author_type,
        createdAt: c.created_at
      });
    });

    // Group entries by client + date + meal_type
    const mealsMap = new Map();

    entries.forEach(entry => {
      const mealKey = `${entry.client_id}_${entry.entry_date}_${entry.meal_type}`;

      if (!mealsMap.has(mealKey)) {
        mealsMap.set(mealKey, {
          mealKey,
          clientId: entry.client_id,
          clientName: clientMap[entry.client_id]?.name || 'Client',
          clientPhoto: clientMap[entry.client_id]?.photo,
          entryDate: entry.entry_date,
          mealType: entry.meal_type,
          items: [],
          totalCalories: 0,
          totalProtein: 0,
          totalCarbs: 0,
          totalFat: 0,
          latestCreatedAt: entry.created_at,
          entryIds: [],
          reactions: [],
          comments: []
        });
      }

      const meal = mealsMap.get(mealKey);

      // Add food item to the meal
      meal.items.push({
        id: entry.id,
        foodName: entry.food_name,
        brand: entry.brand,
        calories: entry.calories || 0,
        protein: entry.protein || 0,
        carbs: entry.carbs || 0,
        fat: entry.fat || 0,
        servingSize: entry.serving_size,
        servingUnit: entry.serving_unit,
        numberOfServings: entry.number_of_servings,
        createdAt: entry.created_at
      });

      // Sum up macros
      meal.totalCalories += entry.calories || 0;
      meal.totalProtein += entry.protein || 0;
      meal.totalCarbs += entry.carbs || 0;
      meal.totalFat += entry.fat || 0;

      // Track entry IDs for reactions/comments
      meal.entryIds.push(entry.id);

      // Update latest created_at for sorting
      if (new Date(entry.created_at) > new Date(meal.latestCreatedAt)) {
        meal.latestCreatedAt = entry.created_at;
      }

      // Collect reactions for this entry
      if (reactionsMap[entry.id]) {
        meal.reactions.push({
          entryId: entry.id,
          ...reactionsMap[entry.id]
        });
      }

      // Collect comments for this entry
      if (commentsMap[entry.id]) {
        meal.comments.push(...commentsMap[entry.id].map(c => ({
          entryId: entry.id,
          ...c
        })));
      }
    });

    // Convert to array and sort by latest activity
    let meals = Array.from(mealsMap.values())
      .sort((a, b) => new Date(b.latestCreatedAt) - new Date(a.latestCreatedAt));

    // Since we're using database-level offset now, we just take the first 'limit' meals
    // The database query already skipped older entries based on dbOffset
    const paginatedMeals = meals.slice(0, parsedLimit);

    // hasMore is true if we got enough entries to potentially have more meals
    // We fetch extra entries, so if we have more than the limit, there's likely more
    const hasMore = meals.length >= parsedLimit;

    // Round the totals
    paginatedMeals.forEach(meal => {
      meal.totalCalories = Math.round(meal.totalCalories);
      meal.totalProtein = Math.round(meal.totalProtein);
      meal.totalCarbs = Math.round(meal.totalCarbs);
      meal.totalFat = Math.round(meal.totalFat);
      // Sort comments by date
      meal.comments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        meals: paginatedMeals,
        clients: clientMap,
        totalMeals: meals.length,
        hasMore
      })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};
