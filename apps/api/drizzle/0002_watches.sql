CREATE TABLE "watch_hits" (
	"watch_id" text NOT NULL,
	"item_id" text NOT NULL,
	"run_id" text NOT NULL,
	"found_at" timestamp with time zone NOT NULL,
	"lang" text NOT NULL,
	"score" double precision NOT NULL,
	"reasons" jsonb NOT NULL,
	"capture" jsonb,
	"adaptation" jsonb,
	CONSTRAINT "watch_hits_watch_id_item_id_pk" PRIMARY KEY("watch_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "watch_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"watch_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"report" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "watches" (
	"id" text PRIMARY KEY NOT NULL,
	"term" text NOT NULL,
	"plan" jsonb NOT NULL,
	"langs" jsonb NOT NULL,
	"window_hours" integer DEFAULT 72 NOT NULL,
	"every_minutes" integer DEFAULT 60 NOT NULL,
	"budget" integer DEFAULT 12 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "watch_hits" ADD CONSTRAINT "watch_hits_watch_id_watches_id_fk" FOREIGN KEY ("watch_id") REFERENCES "public"."watches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_hits" ADD CONSTRAINT "watch_hits_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_runs" ADD CONSTRAINT "watch_runs_watch_id_watches_id_fk" FOREIGN KEY ("watch_id") REFERENCES "public"."watches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "watch_runs_watch_idx" ON "watch_runs" USING btree ("watch_id","started_at");