import os

with open('src/components/EmailList.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    if "{visibleEmails.map((email, index) => {" in line:
        skip = True
        new_lines.append('            {visibleEmails.map((email, index) => (\n')
        new_lines.append('              <EmailListItem\n')
        new_lines.append('                key={email.id}\n')
        new_lines.append('                email={email}\n')
        new_lines.append('                index={index}\n')
        new_lines.append('                activeFolder={activeFolder}\n')
        new_lines.append('                selectedEmailId={selectedEmailId}\n')
        new_lines.append('                selectedMailIds={selectedMailIds}\n')
        new_lines.append('                keyboardIndex={keyboardIndex}\n')
        new_lines.append('                draggableEmailId={draggableEmailId}\n')
        new_lines.append('                emails={emails}\n')
        new_lines.append('                handlePointerDown={handlePointerDown}\n')
        new_lines.append('                setKeyboardIndex={setKeyboardIndex}\n')
        new_lines.append('                clearDragTimer={clearDragTimer}\n')
        new_lines.append('                handleDragEnd={handleDragEnd}\n')
        new_lines.append('                setSelectedMailIds={setSelectedMailIds}\n')
        new_lines.append('                handleEmailClick={handleEmailClick}\n')
        new_lines.append('                toggleSelectEmail={toggleSelectEmail}\n')
        new_lines.append('                handleToggleRead={handleToggleRead}\n')
        new_lines.append('                onDraftClick={onDraftClick}\n')
        new_lines.append('                handleToggleStar={handleToggleStar}\n')
        new_lines.append('                handleTrashEmail={handleTrashEmail}\n')
        new_lines.append('              />\n')
        new_lines.append('            ))}\n')
        continue
    
    if skip:
        # We need to find where the map ends. It ends right before "{/* Load More Button */}"
        if "{/* Load More Button */}" in line:
            skip = False
            new_lines.append(line)
        continue
    else:
        new_lines.append(line)

# Add import
import_added = False
for i, line in enumerate(new_lines):
    if "import React" in line:
        new_lines.insert(i + 1, "import EmailListItem from './EmailListItem';\n")
        import_added = True
        break

if not import_added:
    new_lines.insert(0, "import EmailListItem from './EmailListItem';\n")

with open('src/components/EmailList.jsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('EmailList patched dynamically')
