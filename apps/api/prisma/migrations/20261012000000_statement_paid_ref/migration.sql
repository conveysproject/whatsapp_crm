-- Gateway payment reference (for example Razorpay pay_...) of the payment that settled a statement. Shown on the invoice. NULL until paid.
ALTER TABLE "billing_statements" ADD COLUMN "paid_ref" TEXT;
