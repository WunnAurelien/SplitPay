import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0"
import webPush from "npm:web-push@3.6.7"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { recipientId, amount, groupName, groupId, senderName } = await req.json()

    if (!recipientId || !amount || !groupName || !groupId || !senderName) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase Client with service role to read recipient's push_subscription
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Database environment variables not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch recipient's push subscription
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('push_subscription, username, email')
      .eq('id', recipientId)
      .single()

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'Recipient profile not found: ' + (profileError?.message || '') }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const subscription = profile.push_subscription
    if (!subscription) {
      return new Response(
        JSON.stringify({ error: 'Recipient has no push subscription' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Configure Web Push with VAPID details
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') || Deno.env.get('VITE_VAPID_PUBLIC_KEY')
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') || Deno.env.get('VITE_VAPID_PRIVATE_KEY')

    if (!publicKey || !privateKey) {
      return new Response(
        JSON.stringify({ error: 'VAPID keys not configured in Edge Function' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // web-push config
    webPush.setVapidDetails(
      'mailto:contact@splitpay.com',
      publicKey,
      privateKey
    )

    // Construct the notification payload
    const payload = JSON.stringify({
      title: 'Demande de remboursement',
      body: `${senderName} vous demande un remboursement de ${parseFloat(amount).toFixed(2)} € dans le groupe ${groupName}.`,
      url: `/SplitPay/group/${groupId}`
    })

    // Send push notification
    await webPush.sendNotification(subscription, payload)

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
