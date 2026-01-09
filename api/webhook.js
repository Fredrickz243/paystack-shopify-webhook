const crypto = require('crypto');

export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Step 1: Verify webhook signature
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body;

    // Step 2: Only process successful charges
    if (event.event === 'charge.success') {
      const { reference, amount, customer, metadata } = event.data;

      // Step 3: Verify transaction with Paystack
      const verifyResponse = await fetch(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
          }
        }
      );

      const verification = await verifyResponse.json();

      if (verification.data.status === 'success') {
        // Step 4: Get variant ID from metadata
        const variantIdField = metadata.custom_fields.find(
          f => f.variable_name === 'variant_id'
        );
        const variantId = variantIdField ? variantIdField.value : null;

        if (!variantId) {
          throw new Error('Variant ID not found in metadata');
        }

        // Step 5: Create Shopify draft order
        const shopifyResponse = await fetch(
          `https://${process.env.SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/graphql.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
            },
            body: JSON.stringify({
              query: `
                mutation {
                  draftOrderCreate(input: {
                    email: "${customer.email}"
                    note: "Paid via Paystack - Ref: ${reference}"
                    lineItems: [
                      {
                        variantId: "gid://shopify/ProductVariant/${variantId}"
                        quantity: 1
                      }
                    ]
                    customAttributes: [
                      {
                        key: "paystack_reference"
                        value: "${reference}"
                      }
                    ]
                  }) {
                    draftOrder {
                      id
                      invoiceUrl
                    }
                  }
                }
              `
            })
          }
        );

        const shopifyData = await shopifyResponse.json();
        
        if (shopifyData.errors) {
          throw new Error('Shopify API error: ' + JSON.stringify(shopifyData.errors));
        }

        const draftOrderId = shopifyData.data.draftOrderCreate.draftOrder.id;

        // Step 6: Complete (mark as paid) the draft order
        await fetch(
          `https://${process.env.SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/graphql.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
            },
            body: JSON.stringify({
              query: `
                mutation {
                  draftOrderComplete(id: "${draftOrderId}") {
                    draftOrder {
                      id
                      order {
                        id
                      }
                    }
                  }
                }
              `
            })
          }
        );

        return res.status(200).json({ 
          success: true, 
          reference,
          message: 'Order created successfully'
        });
      }
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
}
