export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;

    // Only process successful charges
    if (event.event === 'charge.success') {
      const { reference, amount, customer, metadata, paid_at } = event.data;

      // Get product details from metadata
      const productTitle = metadata.custom_fields?.find(
        f => f.variable_name === 'product_title'
      )?.value || 'Unknown Product';
      
      const variantId = metadata.custom_fields?.find(
        f => f.variable_name === 'variant_id'
      )?.value || 'N/A';

      // Format amount (convert kobo to NGN)
      const amountInNGN = (amount / 100).toLocaleString('en-NG', {
        style: 'currency',
        currency: 'NGN'
      });

      // Create email content
      const emailSubject = `New Paystack Order - ${reference}`;
      const emailBody = `
        <h2>🎉 New Paystack Payment Received!</h2>
        
        <h3>Payment Details:</h3>
        <ul>
          <li><strong>Reference:</strong> ${reference}</li>
          <li><strong>Amount:</strong> ${amountInNGN}</li>
          <li><strong>Date:</strong> ${new Date(paid_at).toLocaleString()}</li>
        </ul>

        <h3>Customer Details:</h3>
        <ul>
          <li><strong>Email:</strong> ${customer.email}</li>
          <li><strong>Customer Code:</strong> ${customer.customer_code}</li>
        </ul>

        <h3>Product Details:</h3>
        <ul>
          <li><strong>Product:</strong> ${productTitle}</li>
          <li><strong>Variant ID:</strong> ${variantId}</li>
          <li><strong>Quantity:</strong> 1</li>
        </ul>

        <hr>
        <p><strong>Action Required:</strong> Create this order manually in Shopify Admin.</p>
        <p>Go to: Orders → Create order → Add customer email and product</p>
      `;

      // Send email via Resend API (free tier: 100 emails/day)
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
        message: 'Email notification sent'
      });
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
}
