# Razorpay Payment Integration Guide

## Overview
This application now includes Razorpay payment integration for Pro subscription upgrades. Users can pay ₹50/month to upgrade from Free tier (5 machines) to Pro tier (unlimited machines).

## Setup Instructions

### 1. Get Razorpay API Keys

1. Sign up for a Razorpay account at [https://razorpay.com](https://razorpay.com)
2. Go to [Dashboard → Settings → API Keys](https://dashboard.razorpay.com/app/keys)
3. Generate Test Mode API keys (for development)
4. Copy the **Key ID** and **Key Secret**

### 2. Configure Environment Variables

Update your `.env` file with your Razorpay credentials:

```env
# Razorpay Configuration (Test Mode)
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxx
```

### 3. Test Payment Flow

#### Test Card Details (Razorpay Test Mode)
Use these test card details to simulate payments:

**Successful Payment:**
- Card Number: `4111 1111 1111 1111`
- CVV: Any 3 digits
- Expiry: Any future date
- Name: Any name

**Failed Payment:**
- Card Number: `4000 0000 0000 0002`
- CVV: Any 3 digits
- Expiry: Any future date

**More test cards:** [Razorpay Test Cards](https://razorpay.com/docs/payments/payments/test-card-upi-details/)

## How It Works

### Payment Flow

1. **User Clicks "Upgrade Now"**
   - Frontend calls `/api/payment/create-order`
   - Backend creates a Razorpay order for ₹50

2. **Razorpay Checkout Opens**
   - User enters payment details
   - Razorpay processes the payment

3. **Payment Success**
   - Razorpay calls success handler
   - Frontend sends payment details to `/api/payment/verify`
   - Backend verifies signature and upgrades user to Pro

4. **Subscription Updated**
   - User tier changed to 'pro'
   - Expiry set to 30 days from payment
   - Payment recorded in user's payment history

### API Endpoints

#### Create Payment Order
```http
POST /api/payment/create-order
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "order_xxxxx",
    "amount": 5000,
    "currency": "INR",
    "keyId": "rzp_test_xxxxx"
  }
}
```

#### Verify Payment
```http
POST /api/payment/verify
Authorization: Bearer <token>
Content-Type: application/json

{
  "razorpay_order_id": "order_xxxxx",
  "razorpay_payment_id": "pay_xxxxx",
  "razorpay_signature": "xxxxx"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment verified and subscription upgraded successfully!",
  "data": {
    "tier": "pro",
    "expiry": "2026-02-18T15:30:00.000Z",
    "paymentId": "pay_xxxxx"
  }
}
```

#### Webhook Handler
```http
POST /api/payment/webhook
X-Razorpay-Signature: <signature>
Content-Type: application/json
```

Handles events like:
- `payment.captured` - Payment successful
- `payment.failed` - Payment failed

## Database Schema Updates

### User Model
New fields added to track payments:

```javascript
{
  razorpayCustomerId: String,      // Razorpay customer ID
  razorpaySubscriptionId: String,  // Razorpay subscription ID
  paymentHistory: [{
    orderId: String,               // Razorpay order ID
    paymentId: String,             // Razorpay payment ID
    amount: Number,                // Amount in rupees
    currency: String,              // Currency (INR)
    status: String,                // Payment status
    createdAt: Date                // Payment timestamp
  }]
}
```

## Subscription Details

- **Price:** ₹50/month
- **Free Tier:** 5 machines maximum
- **Pro Tier:** Unlimited machines
- **Subscription Duration:** 30 days
- **Auto-renewal:** Not implemented (manual renewal required)

## Security Features

1. **Payment Signature Verification**
   - All payments verified using HMAC SHA256
   - Prevents payment tampering

2. **Webhook Signature Verification**
   - Webhooks verified before processing
   - Protects against fake webhook calls

3. **JWT Authentication**
   - All payment endpoints protected
   - User must be logged in

## Testing Checklist

- [ ] Create order successfully
- [ ] Complete payment with test card
- [ ] Verify subscription upgraded to Pro
- [ ] Check unlimited machine access
- [ ] Test payment failure scenario
- [ ] Verify payment history saved
- [ ] Test webhook handling

## Production Deployment

### Before Going Live:

1. **Switch to Live Mode**
   - Generate Live API keys from Razorpay dashboard
   - Update `.env` with live credentials
   - Remove test mode indicators

2. **Configure Webhooks**
   - Add webhook URL in Razorpay dashboard
   - URL: `https://yourdomain.com/api/payment/webhook`
   - Events: `payment.captured`, `payment.failed`

3. **Update Pricing (if needed)**
   - Modify amount in `/server/routes/payment.js`
   - Line: `amount: 5000` (₹50 in paise)

4. **Implement Auto-Renewal (Optional)**
   - Set up Razorpay subscriptions
   - Handle subscription lifecycle events
   - Send renewal reminders

## Troubleshooting

### Payment Not Working
- Check Razorpay API keys are correct
- Verify test mode is enabled
- Check browser console for errors

### Signature Verification Failed
- Ensure `RAZORPAY_KEY_SECRET` is correct
- Check payment response format

### Webhook Not Receiving Events
- Verify webhook URL is accessible
- Check webhook secret is configured
- Test webhook with Razorpay dashboard

## Support

- **Razorpay Docs:** [https://razorpay.com/docs](https://razorpay.com/docs)
- **Test Cards:** [https://razorpay.com/docs/payments/payments/test-card-upi-details/](https://razorpay.com/docs/payments/payments/test-card-upi-details/)
- **Dashboard:** [https://dashboard.razorpay.com](https://dashboard.razorpay.com)

## Future Enhancements

- [ ] Implement automatic subscription renewal
- [ ] Add multiple pricing tiers
- [ ] Support annual subscriptions with discount
- [ ] Email receipts after payment
- [ ] Payment history page for users
- [ ] Refund functionality
- [ ] Invoice generation
