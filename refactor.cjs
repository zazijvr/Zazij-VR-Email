const fs = require('fs');

let content = fs.readFileSync('src/modules/Calendar/CalendarApp.jsx', 'utf-8');

// 1. Add imports
content = content.replace(
  "import EventModal from './components/EventModal';",
  "import EventModal from './components/EventModal';\nimport AgendaView from './components/AgendaView';\nimport MonthView from './components/MonthView';\nimport EventDetailView from './components/EventDetailView';"
);

// 2. Wrap color functions & helpers in handleDateChange only
content = content.replace(
  /const handlePrevMonth[\s\S]*?bg-\[#00f3ff\] shadow-\[0_0_10px_rgba\(0,243,255,0\.5\)\]'; \n  };/,
  `const handleDateChange = (action) => {
    if (action === 'prev') setCurrentDate(new Date(currentYear, currentDate.getMonth() - 1, 1));
    else if (action === 'next') setCurrentDate(new Date(currentYear, currentDate.getMonth() + 1, 1));
    else if (action === 'today') setCurrentDate(new Date());
  };`
);

// 3. Replace Agenda & Month views using String splits and exact string matchers
const textAgendaStart = "  } else if (activeCalendarView === 'Co mě čeká?') {\n    // AGENDA POHLED: Co mě čeká?";
const textAgendaEnd = "    );\n  } else {\n\n  // Příprava logiky Mřížky";
const parts1 = content.split(textAgendaStart);

if (parts1.length === 2) {
  const parts2 = parts1[1].split(textAgendaEnd);
  if(parts2.length === 2) {
      const agendaReplacement = `  } else if (activeCalendarView === 'Co mě čeká?') {
    currentMainView = (
      <AgendaView 
        events={events}
        agendaSearch={agendaSearch}
        setAgendaSearch={setAgendaSearch}
        displayedAgendaCount={displayedAgendaCount}
        setDisplayedAgendaCount={setDisplayedAgendaCount}
        setSelectedEvent={setSelectedEvent}
        activeCalendarView={activeCalendarView}
      />
    );
  } else {

  // Příprava logiky Mřížky`;
      content = parts1[0] + agendaReplacement + parts2[1];
  }
}

// 4. Replace Month Grid
const textMonthStart = "  // Filtr událostí podle fulltextového search okna";
const textMonthEnd = "                  </div>\n               </div>\n           </div>\n        )}\n      </div>\n    </div>\n    );\n  }";
const parts3 = content.split(textMonthStart);

if (parts3.length === 2) {
  const parts4 = parts3[1].split(textMonthEnd);
  if (parts4.length === 2) {
     const monthReplacement = `  // Filtr událostí podle fulltextového search okna
  currentMainView = (
      <MonthView 
        currentYear={currentYear}
        currentMonthName={currentMonthName}
        currentDate={currentDate}
        handleDateChange={handleDateChange}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        firstDayOfMonth={firstDayOfMonth}
        daysInMonth={daysInMonth}
        startingDay={startingDay}
        totalCells={totalCells}
        events={events}
        specialDays={specialDays}
        specialCalsLoading={specialCalsLoading}
        openCreateForDay={openCreateForDay}
        selectedCalDay={selectedCalDay}
        setSelectedCalDay={setSelectedCalDay}
        setSelectedEvent={setSelectedEvent}
        activeCalendarView={activeCalendarView}
      />
    );
  }`;
     content = parts3[0] + monthReplacement + parts4[1];
  }
}

// 5. Replace Detail view
const detailStart = "      {selectedEvent && (\n        <>\n          {/* --- MOBILE TOP BAR MORPHING FROM APP HEADER (PORTALLED) --- */}";
const detailEnd = "         </div>\n        </div>\n        </>\n      )}";

const parts5 = content.split(detailStart);
if (parts5.length === 2) {
  const parts6 = parts5[1].split(detailEnd);
  if (parts6.length === 2) {
     const detailReplacement = `      {selectedEvent && (
        <EventDetailView 
          selectedEvent={selectedEvent}
          setSelectedEvent={setSelectedEvent}
          handleEditSelectedEvent={handleEditSelectedEvent}
          handleDeleteSelectedEvent={handleDeleteSelectedEvent}
          isDeleting={isDeleting}
          previewRecurrenceText={previewRecurrenceText}
        />
      )}`;
     content = parts5[0] + detailReplacement + parts6[1];
  }
}

fs.writeFileSync('src/modules/Calendar/CalendarApp.jsx', content);
console.log("Refactoring complete");
