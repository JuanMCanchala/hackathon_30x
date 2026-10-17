CREATE TABLE "bank_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"document_sha" text NOT NULL,
	"channel" text NOT NULL,
	"received_at" text NOT NULL,
	"vendor_id" text,
	"contract_id" text,
	"status" text NOT NULL,
	"reading" jsonb,
	"reading_meta" jsonb,
	"matches" jsonb,
	"match_meta" jsonb,
	"supersedes_bill_id" text,
	"chain" jsonb NOT NULL,
	"asked_at" text,
	"case_paid_minor" bigint DEFAULT 0 NOT NULL,
	"dataset_id" text
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"vendor_id" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"bill_id" text NOT NULL,
	"seq" integer NOT NULL,
	"at" text NOT NULL,
	"outcome" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"sha256" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"channel" text NOT NULL,
	"text" text NOT NULL,
	"bytes" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_items" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"vendor_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "human_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"bill_id" text NOT NULL,
	"at" text NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"org_id" text NOT NULL,
	"bill_id" text NOT NULL,
	"at" text NOT NULL,
	"sender" text NOT NULL,
	"body" text NOT NULL,
	"attachment_bill_id" text
);
--> statement-breakpoint
CREATE TABLE "org_state" (
	"org_id" text PRIMARY KEY NOT NULL,
	"now" text NOT NULL,
	"phase" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"seq" integer NOT NULL,
	"bill_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"bill_id" text NOT NULL,
	"vendor_id" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline" (
	"seq" serial PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"at" text NOT NULL,
	"kind" text NOT NULL,
	"bill_id" text,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "bills_org_idx" ON "bills" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "bills_vendor_idx" ON "bills" USING btree ("vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bills_document_idx" ON "bills" USING btree ("document_sha");--> statement-breakpoint
CREATE INDEX "contracts_vendor_idx" ON "contracts" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "decisions_bill_idx" ON "decisions" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "evidence_vendor_idx" ON "evidence_items" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "messages_bill_idx" ON "messages" USING btree ("bill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_seq_idx" ON "payments" USING btree ("org_id","seq");