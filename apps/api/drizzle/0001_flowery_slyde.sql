ALTER TABLE "messages" ADD COLUMN "seq" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "seq" integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bills_document_idx" ON "bills" USING btree ("document_sha");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_seq_idx" ON "payments" USING btree ("org_id","seq");