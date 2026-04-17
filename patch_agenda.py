import os

with open("src/modules/Calendar/CalendarApp.jsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    if i == 646:
        skip = True
        new_lines.append('''    currentMainView = (
      <CalendarAgendaView 
        events={events}
        agendaSearch={agendaSearch}
        setAgendaSearch={setAgendaSearch}
        displayedAgendaCount={displayedAgendaCount}
        setDisplayedAgendaCount={setDisplayedAgendaCount}
        isLoading={isLoading}
        setSelectedEvent={setSelectedEvent}
      />
    );\n''')
    if skip:
        if i == 815:
            skip = False
        continue
    else:
        new_lines.append(line)

# Add import
for i, line in enumerate(new_lines):
    if "import React" in line:
        new_lines.insert(i + 1, "import CalendarAgendaView from './components/CalendarAgendaView';\n")
        break

with open("src/modules/Calendar/CalendarApp.jsx", "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print("CalendarApp patched")
