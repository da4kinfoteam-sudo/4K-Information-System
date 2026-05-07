-- Phase 10: Realignment and Savings Support
-- Author: 4K

-- Add columns to subprojects
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subprojects' AND column_name='isRealignment') THEN
    ALTER TABLE subprojects ADD COLUMN "isRealignment" BOOLEAN DEFAULT FALSE;
    ALTER TABLE subprojects ADD COLUMN "isSavings" BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Add columns to activities
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='activities' AND column_name='isRealignment') THEN
    ALTER TABLE activities ADD COLUMN "isRealignment" BOOLEAN DEFAULT FALSE;
    ALTER TABLE activities ADD COLUMN "isSavings" BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Add columns to office_requirements
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='office_requirements' AND column_name='isRealignment') THEN
    ALTER TABLE office_requirements ADD COLUMN "isRealignment" BOOLEAN DEFAULT FALSE;
    ALTER TABLE office_requirements ADD COLUMN "isSavings" BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Add columns to staffing_requirements
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='staffing_requirements' AND column_name='isRealignment') THEN
    ALTER TABLE staffing_requirements ADD COLUMN "isRealignment" BOOLEAN DEFAULT FALSE;
    ALTER TABLE staffing_requirements ADD COLUMN "isSavings" BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Add columns to other_program_expenses
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='other_program_expenses' AND column_name='isRealignment') THEN
    ALTER TABLE other_program_expenses ADD COLUMN "isRealignment" BOOLEAN DEFAULT FALSE;
    ALTER TABLE other_program_expenses ADD COLUMN "isSavings" BOOLEAN DEFAULT FALSE;
  END IF;
END $$;
