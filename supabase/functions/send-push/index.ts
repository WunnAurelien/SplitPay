import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0"
import webPush from "npm:web-push@3.6.7"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type NotificationParams = {
  senderName?: string;
  amount?: string | number;
  groupName?: string;
  addedBy?: string;
  joinerName?: string;
  creditorName?: string;
  description?: string;
  [key: string]: any;
};

const translations: Record<string, Record<string, { title: string; body: (params: NotificationParams) => string }>> = {
  fr: {
    new_expense: {
      title: "Nouvelle dépense",
      body: (p) => `${p.payerName || 'Quelqu\'un'} a ajouté la dépense "${p.description || ''}" de ${p.amount || '0.00'} € dans le groupe "${p.groupName || ''}".`
    },
    settlement: {
      title: "Remboursement à valider",
      body: (p) => `${p.payerName || 'Quelqu\'un'} indique vous avoir remboursé ${p.amount || '0.00'} € dans le groupe "${p.groupName || ''}". Veuillez valider le remboursement.`
    },
    settlement_confirmed: {
      title: "Remboursement validé",
      body: (p) => `${p.creditorName || 'Quelqu\'un'} a validé votre remboursement de ${p.amount || '0.00'} € dans le groupe "${p.groupName || ''}".`
    },
    added_to_group: {
      title: "Ajouté à un groupe",
      body: (p) => `${p.addedBy || 'Quelqu\'un'} vous a ajouté au groupe "${p.groupName || ''}".`
    },
    new_member: {
      title: "Nouveau membre",
      body: (p) => `${p.joinerName || 'Quelqu\'un'} a rejoint le groupe "${p.groupName || ''}".`
    },
    account_approved: {
      title: "Compte approuvé",
      body: () => "Votre compte SplitPay a été approuvé. Vous pouvez désormais créer et rejoindre des groupes !"
    },
    request_repayment: {
      title: "Demande de remboursement",
      body: (p) => `${p.senderName || 'Quelqu\'un'} vous demande un remboursement de ${p.amount || '0.00'} € dans le groupe "${p.groupName || ''}".`
    }
  },
  en: {
    new_expense: {
      title: "New Expense",
      body: (p) => `${p.payerName || 'Someone'} added the expense "${p.description || ''}" of €${p.amount || '0.00'} in the group "${p.groupName || ''}".`
    },
    settlement: {
      title: "Settlement to Confirm",
      body: (p) => `${p.payerName || 'Someone'} indicated they repaid you €${p.amount || '0.00'} in the group "${p.groupName || ''}". Please confirm the repayment.`
    },
    settlement_confirmed: {
      title: "Settlement Confirmed",
      body: (p) => `${p.creditorName || 'Someone'} confirmed your repayment of €${p.amount || '0.00'} in the group "${p.groupName || ''}".`
    },
    added_to_group: {
      title: "Added to Group",
      body: (p) => `${p.addedBy || 'Someone'} added you to the group "${p.groupName || ''}".`
    },
    new_member: {
      title: "New Member",
      body: (p) => `${p.joinerName || 'Someone'} joined the group "${p.groupName || ''}".`
    },
    account_approved: {
      title: "Account Approved",
      body: () => "Your SplitPay account has been approved. You can now create and join groups!"
    },
    request_repayment: {
      title: "Repayment Request",
      body: (p) => `${p.senderName || 'Someone'} is requesting a repayment of €${p.amount || '0.00'} in the group "${p.groupName || ''}".`
    }
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const bodyParams = await req.json()
    const {
      recipientId,
      recipientIds,
      title,
      body,
      url,
      amount,
      groupName,
      groupId,
      senderName,
      type,
      params
    } = bodyParams

    // Construct recipient list
    let targetIds: string[] = []
    if (recipientIds && Array.isArray(recipientIds)) {
      targetIds = recipientIds
    } else if (recipientId) {
      targetIds = [recipientId]
    }

    if (targetIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing recipientId or recipientIds' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Determine target URL
    let notifUrl = url
    if (!notifUrl && groupId) {
      notifUrl = `/SplitPay/group/${groupId}`
    }
    if (!notifUrl) {
      notifUrl = '/SplitPay/'
    }

    // Initialize Supabase Client with service role to read recipient's push_subscription & locale
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Database environment variables not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch push subscriptions and locales for all recipients
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, push_subscription, locale')
      .in('id', targetIds)

    if (profilesError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch profiles: ' + profilesError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No recipient profiles found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
      'mailto:wunn.aurelien@gmail.com',
      publicKey,
      privateKey
    )

    // Send notifications in parallel
    const sendPromises = profiles
      .filter(p => p.push_subscription)
      .flatMap((profile) => {
        const userLocale = (profile.locale === 'en' || profile.locale === 'fr') ? profile.locale : 'fr';
        
        let notifTitle = '';
        let notifBody = '';
        
        if (type && translations[userLocale]?.[type]) {
          const t = translations[userLocale][type];
          notifTitle = t.title;
          notifBody = t.body(params || {});
        } else if (!type && senderName && amount && groupName) {
          // Legacy direct parameters fallback
          const formattedAmount = typeof amount === 'number' ? amount.toFixed(2) : parseFloat(amount).toFixed(2);
          if (userLocale === 'fr') {
            notifTitle = 'Demande de remboursement';
            notifBody = `${senderName} vous demande un remboursement de ${formattedAmount} € dans le groupe ${groupName}.`;
          } else {
            notifTitle = 'Repayment Request';
            notifBody = `${senderName} is requesting a repayment of €${formattedAmount} in the group ${groupName}.`;
          }
        } else {
          // Absolute fallback
          notifTitle = title || (userLocale === 'fr' ? 'Notification SplitPay' : 'SplitPay Notification');
          notifBody = body || (userLocale === 'fr' ? 'Nouveau message de SplitPay' : 'New message from SplitPay');
        }

        const payload = JSON.stringify({
          title: notifTitle,
          body: notifBody,
          url: notifUrl
        })

        // Check if push_subscription is an array or a single object
        const subs = Array.isArray(profile.push_subscription)
          ? profile.push_subscription
          : [profile.push_subscription];

        return subs.map(async (sub) => {
          if (!sub || !sub.endpoint) return { id: profile.id, success: false, error: 'Invalid subscription' };
          try {
            await webPush.sendNotification(sub, payload)
            return { id: profile.id, success: true, endpoint: sub.endpoint }
          } catch (err) {
            console.error(`Failed to send push to user ${profile.id} at endpoint ${sub.endpoint}:`, err)
            return { id: profile.id, success: false, error: err.message, endpoint: sub.endpoint }
          }
        })
      })

    const results = await Promise.all(sendPromises)

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
