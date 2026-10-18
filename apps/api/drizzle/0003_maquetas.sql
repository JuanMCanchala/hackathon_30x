CREATE TABLE "maquetas" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"format" text NOT NULL,
	"style" jsonb NOT NULL,
	"slides" jsonb NOT NULL,
	"origin" jsonb,
	"based_on" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ALTER COLUMN "adaptation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ALTER COLUMN "topic_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "maqueta_id" text;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "scheduled_time" text;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "origin" jsonb;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_maqueta_id_maquetas_id_fk" FOREIGN KEY ("maqueta_id") REFERENCES "public"."maquetas"("id") ON DELETE set null ON UPDATE no action;