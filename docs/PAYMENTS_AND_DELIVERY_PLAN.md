# Payments and Delivery Plan

## Paystack

- Local environment variables are present for `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY`.
- The local app intentionally leaves those values blank, so payment initialization returns a controlled `503` JSON response.
- When live keys are supplied, the bookshop can initialize Paystack payment for an order through `POST /api/orders/<order_id>/paystack/initialize`.
- Paystack webhooks are received at `POST /api/paystack/webhook` and verified with the Paystack signature before marking an order as paid.

## Delivery Fees

- Delivery fees are modeled as admin-managed delivery zones.
- Public checkout clients can read active zones through `GET /api/delivery-zones`.
- Admins can create, update, and delete zones through `/api/admin/delivery-zones`.
- When RealMindX provides the official location/fee table, those locations should be loaded as delivery zones and exposed in checkout.

## Production Notes

- Do not hardcode Paystack keys, callback URLs, or delivery fees in source code.
- Keep payment callback and webhook URLs based on environment configuration.
- The order total should remain `subtotal + delivery_fee`; discounts and taxes can be added later as explicit fields.
