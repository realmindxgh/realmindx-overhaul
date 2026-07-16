# WhatsApp phone verification setup

The teacher portal and RealMindX Bookshop share the same account phone-verification flow. A user selects exactly one delivery channel per request: SMS or WhatsApp.

## WhatsApp challenge flow

The current WhatsApp path does not depend on a Meta-approved authentication template. It uses a customer-initiated challenge:

1. The user enters the phone number they want to verify.
2. The server creates a short-lived challenge phrase, for example `RMX VERIFY 123456`.
3. The user taps **Open WhatsApp** and sends that exact phrase to the RealMindX WhatsApp number: `+233201166122`.
4. Meta sends the incoming WhatsApp message to `/api/webhooks/whatsapp`.
5. The server verifies that the WhatsApp sender is the same number the user entered, then marks that phone as verified.

The challenge expires after 15 minutes. The site never accepts a WhatsApp challenge typed back into the page, because the phrase is visible on screen. It must arrive through the WhatsApp webhook from the number being verified.

Users are told not to edit the prepared WhatsApp message in any way. If the correct WhatsApp number sends extra words, removes the prefix, changes the code, adds emojis, or otherwise changes the phrase, the modal shows a wrong-message warning and asks them to send the prepared message exactly as shown.

If the phrase arrives from a different WhatsApp number, the challenge stays pending and the modal warns the logged-in user. This helps users who have two WhatsApp accounts on one phone select the correct account or change the number inside the same modal.

## Meta webhook setup

1. In the Meta app dashboard, go to **WhatsApp > Configuration** or **Webhooks**.
2. Set the callback URL to:

```text
https://realmindxgh.com/api/webhooks/whatsapp
```

3. Set the verify token to the same value configured on the server as `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
4. Subscribe the WhatsApp Business Account to the **messages** webhook field.
5. Keep `WHATSAPP_APP_SECRET` set in production so incoming webhook signatures can be checked.

Meta documents the webhook verify-token handshake and the `X-Hub-Signature-256` header in its official webhook setup docs: [Create a webhook endpoint](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint/).

## Optional Meta outbound template setup

This is only needed if RealMindX later wants Meta to send authentication templates directly to the customer instead of using the incoming challenge flow.

1. In the Meta app's WhatsApp use case, complete **Production setup**.
2. Add and verify the RealMindX WhatsApp sender number and copy its **Phone number ID** (not the visible phone number).
3. Add a payment method to the WhatsApp Business Account.
4. In WhatsApp Manager, create an **Authentication** message template:
   - Name: `realmindx_verification_code`
   - Language: English (US), `en_US`
   - OTP button: **Copy code**
   - Security recommendation: enabled
   - Code expiry: 15 minutes
5. Wait until the template status is **Approved**.
6. In Business Settings, create a system user, assign the Meta app and WhatsApp assets, and generate a non-temporary token with `whatsapp_business_messaging` permission. Store the token only in the server environment.

## Server environment

```dotenv
WHATSAPP_BUSINESS_PHONE_E164=+233201166122
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<private-random-token-used-in-meta>
WHATSAPP_APP_SECRET=<meta-app-secret>
WHATSAPP_INBOUND_CHALLENGE_ENABLED=true
WHATSAPP_CHALLENGE_PREFIX=RMX VERIFY

# Optional outbound template settings
WHATSAPP_ACCESS_TOKEN=<system-user-token>
WHATSAPP_PHONE_NUMBER_ID=<numeric-phone-number-id>
WHATSAPP_OTP_TEMPLATE_NAME=realmindx_verification_code
WHATSAPP_OTP_TEMPLATE_LANGUAGE=en_US
WHATSAPP_GRAPH_API_VERSION=v23.0
```

Restart the Flask/Gunicorn service after changing these values.

## Request controls

- Only the selected channel is charged and sent.
- The first resend becomes available after 45 seconds.
- Later cooldowns increase by 30 seconds: 75, 105, 135, and so on within the one-hour window.
- The server enforces the cooldown even after refresh or channel switching.
- The existing six-per-hour endpoint limit remains in place.
