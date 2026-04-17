import os

with open("src/modules/Calendar/CalendarApp.jsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []

# Helper functions to extract: getEventColor, getEventSolidColor
helpers = "".join(lines[597:630])

agenda_body = "".join(lines[646:814]).replace("currentMainView =", "return (").replace("      <div className=\"flex-1 flex flex-col h-full relative overflow-hidden animate-in fade-in duration-300\">", "      <div className=\"flex-1 flex flex-col h-full relative overflow-hidden animate-in fade-in duration-300\">\n")
agenda_component = f'''import React from 'react';
import {{"Search", "Loader2"}} from 'lucide-react';

export default function CalendarAgendaView({{
  events,
  agendaSearch,
  setAgendaSearch,
  displayedAgendaCount,
  setDisplayedAgendaCount,
  isLoading,
  setSelectedEvent
}}) {{
{helpers}

{agenda_body}
}}
'''

with open("src/modules/Calendar/components/CalendarAgendaView.jsx", "w", encoding="utf-8") as f:
    f.write(agenda_component)

print("Agenda extracted")
