import crypto from 'crypto';
import nodemailer from 'nodemailer';

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
      )?.value || metadata.custom_fields?.find(
        f => f.variable_name === 'state'
      )?.value || 'N/A';

      const address = metadata.custom_fields?.find(
        f => f.variable_name === 'address'
      )?.value || 'N/A';

      const shippingFee = metadata.custom_fields?.find(
        f => f.variable_name === 'shipping_fee'
      )?.value || '0';

      // Format amounts
      const amountInNGN = (amount / 100).toLocaleString('en-NG', {
        style: 'currency',
        currency: 'NGN'
      });

      const shippingFeeNGN = parseFloat(shippingFee).toLocaleString('en-NG', {
        style: 'currency',
        currency: 'NGN'
      });

      const productPriceNGN = ((amount / 100) - parseFloat(shippingFee)).toLocaleString('en-NG', {
        style: 'currency',
        currency: 'NGN'
      });

      // ========================================
      // GMAIL SMTP SETUP
      // ========================================
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD
        }
      });

      // ========================================
      // EMAIL 1: Admin Notification
      // ========================================
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
              <td style="padding: 8px 0; color: #666;"><strong>State/Zone:</strong></td>
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

      try {
        await transporter.sendMail({
          from: `"Je Golden Orders" <${process.env.GMAIL_USER}>`,
          to: ['support@jegolden.com'],
          subject: emailSubject,
          html: emailBody
        });
        console.log('Admin notification sent successfully');
      } catch (emailError) {
        console.error('Failed to send admin email:', emailError);
      }

      // ========================================
      // EMAIL 2: Customer Order Summary
      // ========================================
      const customerEmailSubject = `Order Confirmation - Je Golden (Ref: ${reference})`;
      const customerEmailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
          
         
          <!-- Header -->
<div style="background: #000000; padding: 30px; text-align: center;">
  <img src="https://cdn.shopify.com/s/files/1/0906/6043/8350/files/JE_GOLDEN_LOGO_WHITE.png?v=1760625414" alt="Je Golden" style="max-width: 180px; height: auto;">
</div>

<!-- Order Confirmation -->
<div style="padding: 30px; background: #f9f9f9;">
  <div style="background: #ffffff; color: #000000; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 30px; border: 2px solid #e0e0e0;">
    <h2 style="margin: 0; font-size: 24px; color: #000000;">✓ Order Confirmed!</h2>
    <p style="margin: 10px 0 0 0; font-size: 14px; color: #333333;">Thank you for your purchase, ${customerName}</p>
  </div>


            <p style="font-size: 16px; color: #333; line-height: 1.6;">
              We've received your payment and your order is being processed. You'll receive tracking details once your item ships.
            </p>

            <!-- Order Details -->
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e0e0e0;">
              <h3 style="margin: 0 0 15px 0; color: #333; font-size: 18px;">Order Details</h3>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666; font-size: 14px;">Order Reference:</td>
                  <td style="padding: 8px 0; color: #333; font-weight: 600; font-size: 14px; text-align: right;">${reference}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-size: 14px;">Order Date:</td>
                  <td style="padding: 8px 0; color: #333; font-size: 14px; text-align: right;">${new Date(paid_at).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-size: 14px;">Payment Method:</td>
                  <td style="padding: 8px 0; color: #333; font-size: 14px; text-align: right;">Paystack</td>
                </tr>
              </table>
            </div>

            <!-- Product Details -->
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e0e0e0;">
              <h3 style="margin: 0 0 15px 0; color: #333; font-size: 18px;">Your Order</h3>
              
              <div style="border-bottom: 1px solid #e0e0e0; padding-bottom: 15px; margin-bottom: 15px;">
                <div style="font-weight: 600; color: #333; font-size: 16px; margin-bottom: 5px;">${productTitle}</div>
                <div style="color: #666; font-size: 14px;">Quantity: 1</div>
                <div style="color: #333; font-weight: 600; margin-top: 5px;">${productPriceNGN}</div>
              </div>

              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666; font-size: 14px;">Subtotal:</td>
                  <td style="padding: 8px 0; color: #333; font-size: 14px; text-align: right;">${productPriceNGN}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-size: 14px;">Shipping (${shippingZone}):</td>
                  <td style="padding: 8px 0; color: #333; font-size: 14px; text-align: right;">${shippingFeeNGN}</td>
                </tr>
                <tr style="border-top: 2px solid #e0e0e0;">
                  <td style="padding: 12px 0; color: #333; font-weight: 700; font-size: 16px;">Total Paid:</td>
                  <td style="padding: 12px 0; color: #333; font-weight: 700; font-size: 18px; text-align: right;">${amountInNGN}</td>
                </tr>
              </table>
            </div>

            <!-- Shipping Address -->
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e0e0e0;">
              <h3 style="margin: 0 0 15px 0; color: #333; font-size: 18px;">Shipping Address</h3>
              <p style="margin: 0; color: #333; line-height: 1.6; font-size: 14px;">
                <strong>${customerName}</strong><br>
                ${address}<br>
                ${shippingZone}, Nigeria<br>
                Phone: ${phone}
              </p>
            </div>

            <!-- Delivery Info -->
            <div style="background: #fffbeb; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
              <h3 style="margin: 0 0 10px 0; color: #92400e; font-size: 16px;">📦 Delivery Information</h3>
              <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.6;">
                Your order will be processed within 1-2 business days. Estimated delivery time is 3-7 business days depending on your location. You'll receive tracking information once your order ships.
              </p>
            </div>

            <!-- Contact Info -->
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e0e0e0;">
              <h3 style="margin: 0 0 15px 0; color: #333; font-size: 18px;">Need Help?</h3>
              <p style="margin: 0; color: #666; font-size: 14px; line-height: 1.6;">
                If you have any questions about your order, please contact us:<br>
                <strong>Email:</strong> <a href="mailto:support@jegolden.com" style="color: #2563eb;">support@jegolden.com</a><br>
                <strong>Website:</strong> <a href="https://jegolden.com" style="color: #2563eb;">jegolden.com</a>
              </p>
            </div>

          </div>

          <!-- Footer -->
          <div style="background: #f3f4f6; padding: 20px; text-align: center;">
            <p style="margin: 0; color: #6b7280; font-size: 12px;">
              © ${new Date().getFullYear()} Je Golden. All rights reserved.<br>
              Premium Fashion Eyewear | Nigeria
            </p>
          </div>

        </div>
      `;

    try {
  await transporter.sendMail({
    from: `"Je Golden" <${process.env.GMAIL_USER}>`,
    to: [customer.email],
    subject: customerEmailSubject,
    html: customerEmailBody
  });
  console.log('Customer order summary sent successfully');
} catch (emailError) {
  console.error('Failed to send customer email:', emailError);
}


      return res.status(200).json({ 
        success: true, 
        reference,
        verified: true,
        message: 'Payment verified, admin notification and customer order summary sent'
      });
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
}
