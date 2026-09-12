
### Razorpay checkout

Use the same checkout API for Stripe and Razorpay. Select the customer's payment
provider in Core; the SDK returns a discriminated response (`stripe`, `razorpay`,
`hosted`, `processing`, `completed`, or `scheduled`). Existing checkout arguments
remain supported.

```ts
// Merchant backend only. Bind the customer and checkout IDs to the signed-in user.
const checkout = await nozle.checkout(customerId, 'pro', returnUrl, {
  idempotencyKey: attemptId,
  registerMandate: true, // optional, explicit UPI AutoPay authorization
});
const invoiceCheckout = await nozle.checkoutInvoice(invoiceId, {
  idempotencyKey: attemptId,
});
const status = await nozle.verifyCheckout(checkoutId, {
  razorpay_order_id, razorpay_payment_id, razorpay_signature,
});
const refreshed = await nozle.checkoutStatus(checkoutId);
```

React accepts the server response directly. Supply authenticated merchant-backend
callbacks to `BillingProvider`; never send a Nozle secret key to the browser.
Your backend must check that the checkout belongs to the signed-in buyer before
forwarding verification or status requests.

```tsx
<BillingProvider
  publishableKey="pk_your_catalog_key"
  createCheckout={createCheckoutOnYourBackend}
  verifyCheckout={verifyCheckoutOnYourBackend}
  getCheckoutStatus={getCheckoutStatusOnYourBackend}
>
  <CheckoutButton planCode="pro" onSuccess={refreshBilling} />
</BillingProvider>
```

`createCheckout` receives `planCode`, `returnUrl`, and optional `idempotencyKey`
and `registerMandate`. Forward those options using the Node checkout arguments
above. `verifyCheckout(checkoutId, proof)` and `getCheckoutStatus(checkoutId)` return
the Core status response. Razorpay's `key_id` and `order_id` come from the server;
`razorpayKeyId` is deprecated. Success is emitted once the server confirms both
capture and fulfillment. Pending collection or credit delivery invokes
`onProcessing` and displays a pending message. The UI polls for up to 30 seconds;
UPI AutoPay may require a much longer provider notification/collection window.
Use the status callback to resume later. `Checkout` also accepts
`checkout={serverCheckoutResponse}` for Razorpay and processing results;
existing Stripe `clientSecret`/`publishableKey` props remain supported.

Razorpay in this release is INR-only. Invoice-based UPI AutoPay registration is
explicit; one-time card or UPI payments do not establish recurring authorization.
