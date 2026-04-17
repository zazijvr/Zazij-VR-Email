import os

with open('src/modules/Calendar/CalendarApp.jsx', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    if i == 1252 and "isCreateModalOpen &&" in line:
        skip = True
        new_lines.append('''      <EventModal 
        isCreateModalOpen={isCreateModalOpen}
        handleAttemptCloseCreateModal={handleAttemptCloseCreateModal}
        editEventId={editEventId}
        newEventForm={newEventForm}
        setNewEventForm={setNewEventForm}
        handleCreateEvent={handleCreateEvent}
        isCreatingEvent={isCreatingEvent}
      />\n''')
        # find the end
    if skip:
        if i == 1588 and ")}" in line:
            skip = False
            continue
    else:
        new_lines.append(line)

# Add import
for i, line in enumerate(new_lines):
    if "import React" in line:
        new_lines.insert(i + 1, "import EventModal from './components/EventModal';\n")
        break

with open('src/modules/Calendar/CalendarApp.jsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
