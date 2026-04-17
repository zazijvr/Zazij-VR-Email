import os

with open("src/modules/Calendar/CalendarApp.jsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
skip = False

start_idx = 0
end_idx = 0
for i, line in enumerate(lines):
    if "const daysInMonth = new Date(" in line:
        start_idx = i
    if "return (" in line and start_idx != 0 and i > start_idx:
        end_idx = i
        break

for i, line in enumerate(lines):
    if i == start_idx:
        skip = True
        new_lines.append('''    currentMainView = (
      <CalendarMonthView 
        events={filteredEventsForGrid || events}
        currentYear={currentYear}
        currentDate={currentDate}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isLoading={isLoading}
        handlePrevMonth={handlePrevMonth}
        handleNextMonth={handleNextMonth}
        handleToday={handleToday}
        setSelectedEvent={setSelectedEvent}
        selectedCalDay={selectedCalDay}
        setSelectedCalDay={setSelectedCalDay}
        openCreateForDay={openCreateForDay}
      />
    );\n''')
    if skip:
        if i == end_idx:
            skip = False
            new_lines.append(line)
        continue
    else:
        new_lines.append(line)

# Add import
for i, line in enumerate(new_lines):
    if "import React" in line:
        new_lines.insert(i + 1, "import CalendarMonthView from './components/CalendarMonthView';\n")
        break

with open("src/modules/Calendar/CalendarApp.jsx", "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print("CalendarApp patched month")
