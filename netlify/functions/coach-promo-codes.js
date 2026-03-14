/**
 * Coach Promo Codes / Coupons
 *
 * Allows coaches to create and manage discount codes for their clients.
 * Syncs with Stripe Coupons/PromotionCodes on the connected account.
 *
 * GET: List promo codes
 * POST: Create promo code
 * DELETE: Deactivate promo code
 */
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateRequest, corsHeaders } = require('./utils/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

exports.handler = async (event) => {
  const cors = handleCors(event);
  if (cors) return cors;

  try {
    const { user, error: authErr } = await authenticateRequest(event);
    if (authErr) return authErr;

    // GET - List promo codes
    if (event.httpMethod === 'GET') {
      const { data: codes, error } = await supabase
        .from('coach_promo_codes')
        .select('*')
        .eq('coach_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        return {
          statusCode: 500, headers: corsHeaders,
          body: JSON.stringify({ error: error.message })
        };
      }

      return {
        statusCode: 200, headers: corsHeaders,
        body: JSON.stringify({ promo_codes: codes || [] })
      };
    }

    // POST - Create promo code
    if (event.httpMethod === 'POST') {
      const { code, discountType, discountValue, planIds, maxUses, expiresAt } =
        JSON.parse(event.body || '{}');

      if (!code || !discountType || !discountValue) {
        return {
          statusCode: 400, headers: corsHeaders,
          body: JSON.stringify({ error: 'code, discountType, and discountValue are required' })
        };
      }

      const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (normalizedCode.length < 3 || normalizedCode.length > 20) {
        return {
          statusCode: 400, headers: corsHeaders,
          body: JSON.stringify({ error: 'Code must be 3-20 alphanumeric characters' })
        };
      }

      // Get coach's connected account
      const { data: coach } = await supabase
        .from('coaches')
        .select('stripe_connect_account_id')
        .eq('id', user.id)
        .single();

      if (!coach?.stripe_connect_account_id) {
        return {
          statusCode: 400, headers: corsHeaders,
          body: JSON.stringify({ error: 'Complete Stripe Connect onboarding first' })
        };
      }

      const stripeAccount = coach.stripe_connect_account_id;

      // Create Stripe coupon on the connected account
      const couponParams = {
        metadata: { coach_id: user.id, code: normalizedCode }
      };

      if (discountType === 'percent') {
        couponParams.percent_off = Math.min(100, Math.max(1, discountValue));
      } else {
        couponParams.amount_off = discountValue;
        couponParams.currency = 'usd';
      }

      if (maxUses) {
        couponParams.max_redemptions = maxUses;
      }

      if (expiresAt) {
        couponParams.redeem_by = Math.floor(new Date(expiresAt).getTime() / 1000);
      }

      const coupon = await stripe.coupons.create(
        couponParams,
        { stripeAccount }
      );

      // Create promotion code (the customer-facing code)
      const promoCodeParams = {
        coupon: coupon.id,
        code: normalizedCode
      };

      if (maxUses) {
        promoCodeParams.max_redemptions = maxUses;
      }

      if (expiresAt) {
        promoCodeParams.expires_at = Math.floor(new Date(expiresAt).getTime() / 1000);
      }

      const promoCode = await stripe.promotionCodes.create(
        promoCodeParams,
        { stripeAccount }
      );

      // Save to DB
      const { data: saved, error: saveErr } = await supabase
        .from('coach_promo_codes')
        .insert({
          coach_id: user.id,
          code: normalizedCode,
          discount_type: discountType,
          discount_value: discountValue,
          plan_ids: planIds || [],
          max_uses: maxUses || null,
          expires_at: expiresAt || null,
          stripe_coupon_id: coupon.id,
          stripe_promo_code_id: promoCode.id,
          is_active: true
        })
        .select()
        .single();

      if (saveErr) {
        return {
          statusCode: 500, headers: corsHeaders,
          body: JSON.stringify({ error: saveErr.message })
        };
      }

      return {
        statusCode: 200, headers: corsHeaders,
        body: JSON.stringify({ promo_code: saved })
      };
    }

    // DELETE - Deactivate promo code
    if (event.httpMethod === 'DELETE') {
      const promoId = event.queryStringParameters?.promoId;
      if (!promoId) {
        return {
          statusCode: 400, headers: corsHeaders,
          body: JSON.stringify({ error: 'promoId is required' })
        };
      }

      const { data: promo } = await supabase
        .from('coach_promo_codes')
        .select('stripe_promo_code_id, stripe_coupon_id')
        .eq('id', promoId)
        .eq('coach_id', user.id)
        .single();

      if (!promo) {
        return {
          statusCode: 404, headers: corsHeaders,
          body: JSON.stringify({ error: 'Promo code not found' })
        };
      }

      // Deactivate in Stripe
      const { data: coach } = await supabase
        .from('coaches')
        .select('stripe_connect_account_id')
        .eq('id', user.id)
        .single();

      if (coach?.stripe_connect_account_id && promo.stripe_promo_code_id) {
        try {
          await stripe.promotionCodes.update(
            promo.stripe_promo_code_id,
            { active: false },
            { stripeAccount: coach.stripe_connect_account_id }
          );
        } catch (e) {
          console.error('Error deactivating Stripe promo code:', e.message);
        }
      }

      // Deactivate in DB
      await supabase
        .from('coach_promo_codes')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', promoId)
        .eq('coach_id', user.id);

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
    console.error('Coach promo codes error:', error);
    return {
      statusCode: 500, headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};
