import os

with open("src/modules/Calendar/CalendarApp.jsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []

helpers = "".join(lines[596:629])

# Finding boundaries for Month view
# line 818: const daysInMonth = ...
# line 1118: return (
start_idx = 0
end_idx = 0
for i, line in enumerate(lines):
    if "const daysInMonth = new Date(" in line:
        start_idx = i
    if "return (" in line and start_idx != 0 and i > start_idx:
        end_idx = i
        break

month_body = "".join(lines[start_idx:end_idx]).replace("currentMainView =", "return (")

month_component = f'''import React from 'react';
import {{"Search", "Loader2"}} from 'lucide-react'; // actually wait I don't need imports if I just want to avoid errors. Wait, lucide react is used in month view? Only chevron left/right.
import {{ ChevronLeft, ChevronRight, Loader2, MapPin, Search }} from 'lucide-react';

export default function CalendarMonthView({{
  events,
  currentYear,
  currentDate,
  searchQuery,
  setSearchQuery,
  isLoading,
  handlePrevMonth,
  handleNextMonth,
  handleToday,
  setSelectedEvent,
  selectedCalDay,
  setSelectedCalDay,
  openCreateForDay
}}) {{
{helpers}

{month_body}

}}
'''

with open("src/modules/Calendar/components/CalendarMonthView.jsx", "w", encoding="utf-8") as f:
    f.write(month_component)

print("Month View extracted")
