/**
 * Coach Billing Plans CRUD
 *
 * Manages payment plans that coaches create for their clients.
 * Syncs with Stripe Products/Prices on the coach's connected account.
 *
 * GET: List plans for a coach
 * POST: Create or update a plan
 * DELETE: Deactivate a plan
 */
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateRequest, corsHeaders } = require('./utils/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

async function getCoachConnectId(coachId) {
  const { data } = await supabase
    .from('coaches')
    .select('stripe_connect_account_id, stripe_connect_charges_enabled')
    .eq('id', coachId)
    .single();
  return data;
}

exports.handler = async (event) => {
  const cors = handleCors(event);
  if (cors) return cors;

  try {
    const { user, error: authErr } = await authenticateRequest(event);
    if (authErr) return authErr;

    // GET - List plans
    if (event.httpMethod === 'GET') {
      const coachId = event.queryStringParameters?.coachId;
      const publicView = event.queryStringParameters?.public === 'true';

      if (!coachId) {
        return {
          statusCode: 400, headers: corsHeaders,
          body: JSON.stringify({ error: 'coachId is required' })
        };
      }

      let query = supabase
        .from('coach_payment_plans')
        .select('*')
        .eq('coach_id', coachId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      // Public view only shows active plans
      if (publicView) {
        query = query.eq('is_active', true);
      }

      const { data: plans, error } = await query;

      if (error) {
        return {
          statusCode: 500, headers: corsHeaders,
          body: JSON.stringify({ error: error.message })
        };
      }

      return {
        statusCode: 200, headers: corsHeaders,
        body: JSON.stringify({ plans: plans || [] })
      };
    }

    // POST - Create or update plan
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { planId, name, description, type, priceCents, currency, billingInterval,
              trialDays, setupFeeCents, tierLevel, features, isActive, sortOrder, action } = body;

      // Handle reorder action
      if (action === 'reorder') {
        const { planOrders } = body;
        if (!Array.isArray(planOrders)) {
          return {
            statusCode: 400, headers: corsHeaders,
            body: JSON.stringify({ error: 'planOrders array is required' })
          };
        }

        for (const { id, sort_order } of planOrders) {
          await supabase
            .from('coach_payment_plans')
            .update({ sort_order, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('coach_id', user.id);
        }

        return {
          statusCode: 200, headers: corsHeaders,
          body: JSON.stringify({ success: true })
        };
      }

      if (!name || !type || priceCents === undefined) {
        return {
          statusCode: 400, headers: corsHeaders,
          body: JSON.stringify({ error: 'name, type, and priceCents are required' })
        };
      }

      // Get coach's connected account
      const connectData = await getCoachConnectId(user.id);
      if (!connectData?.stripe_connect_account_id) {
        return {
          statusCode: 400, headers: corsHeaders,
          body: JSON.stringify({ error: 'Complete Stripe Connect onboarding first' })
        };
      }

      const stripeAccount = connectData.stripe_connect_account_id;

      if (planId) {
        // UPDATE existing plan
        const { data: existingPlan } = await supabase
          .from('coach_payment_plans')
          .select('*')
          .eq('id', planId)
          .eq('coach_id', user.id)
          .single();

        if (!existingPlan) {
          return {
            statusCode: 404, headers: corsHeaders,
            body: JSON.stringify({ error: 'Plan not found' })
          };
        }

        // Update Stripe product
        if (existingPlan.stripe_product_id) {
          await stripe.products.update(
            existingPlan.stripe_product_id,
            { name, description: description || undefined, active: isActive !== false },
            { stripeAccount }
          );
        }

        // If price changed, create a new price (Stripe prices are immutable)
        let newPriceId = existingPlan.stripe_price_id;
        const priceChanged = priceCents !== existingPlan.price_cents ||
                             billingInterval !== existingPlan.billing_interval;

        if (priceChanged && existingPlan.stripe_product_id) {
          const priceParams = {
            product: existingPlan.stripe_product_id,
            unit_amount: priceCents,
            currency: currency || 'usd'
          };

          if (type === 'subscription' || type === 'tier') {
            priceParams.recurring = {
              interval: billingInterval === 'week' ? 'week' : 'month'
            };
          }

          const newPrice = await stripe.prices.create(
            priceParams,
            { stripeAccount }
          );

          newPriceId = newPrice.id;

          // Deactivate old price
          if (existingPlan.stripe_price_id) {
            await stripe.prices.update(
              existingPlan.stripe_price_id,
              { active: false },
              { stripeAccount }
            );
          }
        }

        // Handle setup fee price
        let setupPriceId = existingPlan.stripe_setup_price_id;
        if ((type === 'subscription' || type === 'tier') && setupFeeCents > 0) {
          if (setupFeeCents !== existingPlan.setup_fee_cents && existingPlan.stripe_product_id) {
            const setupPrice = await stripe.prices.create(
              {
                product: existingPlan.stripe_product_id,
                unit_amount: setupFeeCents,
                currency: currency || 'usd'
              },
              { stripeAccount }
            );
            setupPriceId = setupPrice.id;

            if (existingPlan.stripe_setup_price_id) {
              await stripe.prices.update(
                existingPlan.stripe_setup_price_id,
                { active: false },
                { stripeAccount }
              );
            }
          }
        } else {
          setupPriceId = null;
        }

        const { data, error } = await supabase
          .from('coach_payment_plans')
          .update({
            name,
            description: description || null,
            type,
            price_cents: priceCents,
            currency: currency || 'usd',
            billing_interval: billingInterval || null,
            trial_days: trialDays || 0,
            setup_fee_cents: setupFeeCents || 0,
            tier_level: tierLevel || 0,
            features: features || [],
            stripe_price_id: newPriceId,
            stripe_setup_price_id: setupPriceId,
            is_active: isActive !== false,
            sort_order: sortOrder !== undefined ? sortOrder : existingPlan.sort_order,
            updated_at: new Date().toISOString()
          })
          .eq('id', planId)
          .eq('coach_id', user.id)
          .select()
          .single();

        if (error) {
          return {
            statusCode: 500, headers: corsHeaders,
            body: JSON.stringify({ error: error.message })
          };
        }

        return {
          statusCode: 200, headers: corsHeaders,
          body: JSON.stringify({ plan: data })
        };

      } else {
        // CREATE new plan
        // Create Stripe product on the connected account
        const product = await stripe.products.create(
          {
            name,
            description: description || undefined,
            metadata: { coach_id: user.id }
          },
          { stripeAccount }
        );

        // Create Stripe price
        const priceParams = {
          product: product.id,
          unit_amount: priceCents,
          currency: currency || 'usd'
        };

        if (type === 'subscription' || type === 'tier') {
          priceParams.recurring = {
            interval: billingInterval === 'week' ? 'week' : 'month'
          };
        }

        const price = await stripe.prices.create(
          priceParams,
          { stripeAccount }
        );

        // Create setup fee price if applicable
        let setupPriceId = null;
        if ((type === 'subscription' || type === 'tier') && setupFeeCents > 0) {
          const setupPrice = await stripe.prices.create(
            {
              product: product.id,
              unit_amount: setupFeeCents,
              currency: currency || 'usd'
            },
            { stripeAccount }
          );
          setupPriceId = setupPrice.id;
        }

        // Get current max sort_order for this coach
        const { data: maxOrder } = await supabase
          .from('coach_payment_plans')
          .select('sort_order')
          .eq('coach_id', user.id)
          .order('sort_order', { ascending: false })
          .limit(1)
          .single();

        const newSortOrder = (maxOrder?.sort_order || 0) + 1;

        const { data, error } = await supabase
          .from('coach_payment_plans')
          .insert({
            coach_id: user.id,
            name,
            description: description || null,
            type,
            price_cents: priceCents,
            currency: currency || 'usd',
            billing_interval: billingInterval || null,
            trial_days: trialDays || 0,
            setup_fee_cents: setupFeeCents || 0,
            tier_level: tierLevel || 0,
            features: features || [],
            stripe_product_id: product.id,
            stripe_price_id: price.id,
            stripe_setup_price_id: setupPriceId,
            is_active: true,
            sort_order: newSortOrder
          })
          .select()
          .single();

        if (error) {
          return {
            statusCode: 500, headers: corsHeaders,
            body: JSON.stringify({ error: error.message })
          };
        }

        return {
          statusCode: 200, headers: corsHeaders,
          body: JSON.stringify({ plan: data })
        };
      }
    }

    // DELETE - Deactivate plan
    if (event.httpMethod === 'DELETE') {
      const planId = event.queryStringParameters?.planId;
      if (!planId) {
        return {
          statusCode: 400, headers: corsHeaders,
          body: JSON.stringify({ error: 'planId is required' })
        };
      }

      const { data: plan } = await supabase
        .from('coach_payment_plans')
        .select('stripe_product_id, stripe_price_id')
        .eq('id', planId)
        .eq('coach_id', user.id)
        .single();

      if (!plan) {
        return {
          statusCode: 404, headers: corsHeaders,
          body: JSON.stringify({ error: 'Plan not found' })
        };
      }

      // Deactivate in Stripe
      const connectData = await getCoachConnectId(user.id);
      if (connectData?.stripe_connect_account_id && plan.stripe_product_id) {
        try {
          await stripe.products.update(
            plan.stripe_product_id,
            { active: false },
            { stripeAccount: connectData.stripe_connect_account_id }
          );
        } catch (e) {
          console.error('Error deactivating Stripe product:', e.message);
        }
      }

      // Soft-delete (deactivate) in DB
      const { error } = await supabase
        .from('coach_payment_plans')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', planId)
        .eq('coach_id', user.id);

      if (error) {
        return {
          statusCode: 500, headers: corsHeaders,
          body: JSON.stringify({ error: error.message })
        };
      }

      return {
        statusCode: 200, headers: corsHeaders,
        body: JSON.stringify({ success: true })
      };
    }

    return {
      statusCode: 405, headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('Coach billing plans error:', error);
    return {
      statusCode: 500, headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};
