"use client";

import * as React from "react";
import { format, parse } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MonthPicker } from "@/components/ui/monthpicker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface MonthYearPickerProps {
  value?: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  defaultYear?: number;
}

export function MonthYearPicker({
  value,
  onChange,
  placeholder = "Select month",
  disabled = false,
  className,
  defaultYear,
}: MonthYearPickerProps) {
  const [date, setDate] = React.useState<Date | undefined>(() => {
    if (!value) return undefined;
    const parsed = parse(value, "yyyy-MM-dd", new Date());
    return isNaN(parsed.getTime()) ? undefined : parsed;
  });
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (value) {
      const parsedDate = parse(value, "yyyy-MM-dd", new Date());
      if (!isNaN(parsedDate.getTime()) && parsedDate.getTime() !== date?.getTime()) {
        setDate(parsedDate);
      } else if (isNaN(parsedDate.getTime())) {
        setDate(undefined);
      }
    } else {
      setDate(undefined);
    }
  }, [value]);

  const handleSelect = (newDate: Date) => {
    // Set day to 1st of the month
    const normalizedDate = new Date(newDate.getFullYear(), newDate.getMonth(), 1);
    setDate(normalizedDate);
    onChange(format(normalizedDate, "yyyy-MM-dd"));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal hover:bg-transparent hover:text-inherit",
            !date && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "MMMM yyyy") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl rounded-lg" align="start">
        <MonthPicker
          selectedMonth={date}
          onMonthSelect={handleSelect}
          defaultYear={defaultYear}
        />
      </PopoverContent>
    </Popover>
  );
}
