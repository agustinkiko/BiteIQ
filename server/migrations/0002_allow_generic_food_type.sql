-- Earlier installations ran 0000 before generic was added to its constraint.
-- Widen the accepted set without rewriting foods or historical diary snapshots.
ALTER TABLE "foods" DROP CONSTRAINT "foods_food_type_check";
--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_food_type_check"
  CHECK ("food_type" in ('generic', 'whole_food', 'branded', 'prepared', 'restaurant', 'user_created', 'development'));
