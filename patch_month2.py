import os

with open("src/modules/Calendar/CalendarApp.jsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    if i == 672 and "currentMainView = (" in line:
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
        if i == 959 and ");" in line:
            skip = False
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

print("CalendarApp patched month accurately")
