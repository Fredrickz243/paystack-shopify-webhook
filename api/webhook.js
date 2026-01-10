import crypto from 'crypto';

export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // SECURITY LAYER 1: Verify webhook signature
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest('hex');
    
    if (hash !== req.headers['x-paystack-signature']) {
      console.error('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;

    // Only process successful charges
    if (event.event === 'charge.success') {
      const { reference, amount, customer, metadata, paid_at } = event.data;

      // SECURITY LAYER 2: Verify payment with Paystack API
      const verifyResponse = await fetch(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
          }
        }
      );

      const verifyData = await verifyResponse.json();

      // Check if payment is actually successful
      if (!verifyData.status || verifyData.data.status !== 'success') {
        console.error('Payment verification failed:', reference);
        return res.status(400).json({ error: 'Payment not verified' });
      }

      // Check if amount matches (prevent amount manipulation)
      if (verifyData.data.amount !== amount) {
        console.error('Amount mismatch:', reference);
        return res.status(400).json({ error: 'Amount mismatch' });
      }

      // Get product details from metadata
      const productTitle = metadata.custom_fields?.find(
        f => f.variable_name === 'product_title'
      )?.value || 'Unknown Product';
      
      const variantId = metadata.custom_fields?.find(
        f => f.variable_name === 'variant_id'
      )?.value || 'N/A';

      const customerName = metadata.custom_fields?.find(
        f => f.variable_name === 'customer_name'
      )?.value || 'N/A';

      const phone = metadata.custom_fields?.find(
        f => f.variable_name === 'phone'
      )?.value || 'N/A';

      const shippingZone = metadata.custom_fields?.find(
        f => f.variable_name === 'shipping_zone'
      )?.value || 'N/A';

      const address = metadata.custom_fields?.find(
        f => f.variable_name === 'address'
      )?.value || 'N/A';

      const shippingFee = metadata.custom_fields?.find(
        f => f.variable_name === 'shipping_fee'
      )?.value || '0';

      // Format amount (convert kobo to NGN)
      const amountInNGN = (amount / 100).toLocaleString('en-NG', {
        style: 'currency',
        currency: 'NGN'
      });

      const shippingFeeNGN = parseFloat(shippingFee).toLocaleString('en-NG', {
        style: 'currency',
        currency: 'NGN'
      });

      // Create email content
      const emailSubject = `✅ New Verified Paystack Order - ${reference}`;
      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2C2C2C;">🎉 New Paystack Payment Received!</h2>
          
          <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #0369a1; font-weight: 600;">✅ Payment Verified by Paystack</p>
          </div>

          <h3 style="color: #333; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px;">Payment Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Reference:</strong></td>
              <td style="padding: 8px 0;">${reference}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Total Amount:</strong></td>
              <td style="padding: 8px 0; font-weight: 700; color: #059669;">${amountInNGN}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Date:</strong></td>
              <td style="padding: 8px 0;">${new Date(paid_at).toLocaleString()}</td>
            </tr>
          </table>

          <h3 style="color: #333; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px; margin-top: 30px;">Customer Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Name:</strong></td>
              <td style="padding: 8px 0;">${customerName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Email:</strong></td>
              <td style="padding: 8px 0;">${customer.email}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Phone:</strong></td>
              <td style="padding: 8px 0;">${phone}</td>
            </tr>
          </table>

          <h3 style="color: #333; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px; margin-top: 30px;">Shipping Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Zone:</strong></td>
              <td style="padding: 8px 0;">${shippingZone}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Shipping Fee:</strong></td>
              <td style="padding: 8px 0;">${shippingFeeNGN}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Address:</strong></td>
              <td style="padding: 8px 0;">${address}</td>
            </tr>
          </table>

          <h3 style="color: #333; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px; margin-top: 30px;">Product Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Product:</strong></td>
              <td style="padding: 8px 0;">${productTitle}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Variant ID:</strong></td>
              <td style="padding: 8px 0;">${variantId}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Quantity:</strong></td>
              <td style="padding: 8px 0;">1</td>
            </tr>
          </table>

          <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 30px 0;">
            <p style="margin: 0; color: #92400e;"><strong>⚡ Action Required:</strong> Create this order in Shopify Admin</p>
            <p style="margin: 10px 0 0 0; color: #92400e; font-size: 14px;">
              Go to: <strong>Orders → Create order</strong> → Add customer email and product → Mark as paid
            </p>
          </div>

          <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-top: 20px;">
            <p style="margin: 0; font-size: 12px; color: #6b7280;">
              <strong>Verify in Paystack:</strong> 
              <a href="https://dashboard.paystack.com/#/transactions/${reference}" style="color: #2563eb;">
                View Transaction
              </a>
            </p>
          </div>
        </div>
      `;

      // Send email via Resend API
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Paystack Notifications <onboarding@resend.dev>',
          to: process.env.NOTIFICATION_EMAIL,
          subject: emailSubject,
          html: emailBody
        })
      });

      if (!emailResponse.ok) {
        throw new Error('Failed to send email');
      }

      return res.status(200).json({ 
        success: true, 
        reference,
        verified: true,
        message: 'Payment verified and email notification sent'
      });
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
}
