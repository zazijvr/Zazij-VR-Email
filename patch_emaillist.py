import os

with open('src/components/EmailList.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    # Match the beginning of the return statement inside map
    if i == 917 and "const isSelected = selectedEmailId" in line:
        skip = True
        new_lines.append('''              return (
                <EmailListItem
                  key={email.id}
                  email={email}
                  index={index}
                  activeFolder={activeFolder}
                  selectedEmailId={selectedEmailId}
                  selectedMailIds={selectedMailIds}
                  keyboardIndex={keyboardIndex}
                  draggableEmailId={draggableEmailId}
                  emails={emails}
                  handlePointerDown={handlePointerDown}
                  setKeyboardIndex={setKeyboardIndex}
                  clearDragTimer={clearDragTimer}
                  handleDragEnd={handleDragEnd}
                  setSelectedMailIds={setSelectedMailIds}
                  handleEmailClick={handleEmailClick}
                  toggleSelectEmail={toggleSelectEmail}
                  handleToggleRead={handleToggleRead}
                  onDraftClick={onDraftClick}
                  handleToggleStar={handleToggleStar}
                  handleTrashEmail={handleTrashEmail}
                />
              );
            })}\n''')
    if skip:
        if i == 1055 and "})}" in line:
            skip = False
        continue
    else:
        new_lines.append(line)

# Add import
for i, line in enumerate(new_lines):
    if "import React" in line:
        new_lines.insert(i + 1, "import EmailListItem from './EmailListItem';\n")
        break

with open('src/components/EmailList.jsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('EmailList patched')
