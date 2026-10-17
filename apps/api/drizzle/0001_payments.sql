CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"payee_id" text NOT NULL,
	"rail" text NOT NULL,
	"destination" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"usd_cents" bigint,
	"scheduled_for" text NOT NULL,
	"status" text NOT NULL,
	"reference" text,
	"expected_settlement" text,
	"sent_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_org_status_idx" ON "payments" USING btree ("org_id","status","scheduled_for");