import os

with open('src/components/EmailList.jsx', encoding='utf-8') as f:
    lines = f.readlines()

item_body = "".join(lines[922:1054])

component = f'''import React from 'react';
import {{ CheckSquare, Square, Mail, MailOpen, FileEdit, Star, Trash2, Paperclip }} from 'lucide-react';

export default function EmailListItem({{
  email,
  index,
  activeFolder,
  selectedEmailId,
  selectedMailIds,
  keyboardIndex,
  draggableEmailId,
  emails,
  handlePointerDown,
  setKeyboardIndex,
  clearDragTimer,
  handleDragEnd,
  setSelectedMailIds,
  handleEmailClick,
  toggleSelectEmail,
  handleToggleRead,
  onDraftClick,
  handleToggleStar,
  handleTrashEmail
}}) {{
  const isSelected = selectedEmailId === email.id;
  const isMultiSelected = selectedMailIds.has(email.id);
  const isActiveRow = isSelected || isMultiSelected;
  const isKeyboardFocus = keyboardIndex === index;

  return (
{item_body}
  );
}}
'''

with open('src/components/EmailListItem.jsx', 'w', encoding='utf-8') as f:
    f.write(component)

print('EmailListItem component generated.')
