/**
 * Calendar card type module.
 *
 * Provides visual month grid view with events, highlights, and navigation.
 */

import { escapeHtml } from '/js/framework.js';

// ========== SVG HELPERS ==========

// Generate a rounded 5-pointed star SVG with the given color and size
function starSvg(color, size = 20) {
    // Chubby rounded star - shorter points, wider body
    return `<svg class="calendar-star" width="${size}" height="${size}" viewBox="0 0 100 100" fill="${color}">
        <path d="M50 5 Q55 35 80 38 Q58 48 63 78 Q50 58 37 78 Q42 48 20 38 Q45 35 50 5Z"
              stroke="${color}" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
}

// ========== MODULE STATE ==========

// Track current view month for each calendar (by card ID)
// Structure: { cardId: { year, month } }
const calendarViewState = {};

// ========== HELPER FUNCTIONS ==========

// Get the day names for headers
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

// Normalize a date value to YYYY-MM-DD string
// Handles: Date objects, strings, or already formatted strings
function normalizeDateStr(dateVal) {
    if (!dateVal) return null;
    if (dateVal instanceof Date) {
        const y = dateVal.getFullYear();
        const m = String(dateVal.getMonth() + 1).padStart(2, '0');
        const d = String(dateVal.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    // Already a string - return as-is (assume YYYY-MM-DD format)
    return String(dateVal);
}

// Parse YYYY-MM string to year and month
function parseYearMonth(str) {
    if (!str) return null;
    const normalized = normalizeDateStr(str);
    if (!normalized) return null;
    const [year, month] = normalized.split('-').map(Number);
    return { year, month };
}

// Get events for a specific date
function getEventsForDate(events, dateStr) {
    if (!events || !dateStr) return [];
    return events.filter(e => normalizeDateStr(e.date) === dateStr);
}

// Check if a date is within any highlight range
function getHighlightForDate(highlights, dateStr) {
    if (!highlights || !dateStr) return null;
    for (const h of highlights) {
        const start = normalizeDateStr(h.start);
        const end = normalizeDateStr(h.end);
        if (start && end && dateStr >= start && dateStr <= end) {
            return h;
        }
    }
    return null;
}

// Check if date is the start of a highlight
function isHighlightStart(highlights, dateStr) {
    if (!highlights) return false;
    return highlights.some(h => normalizeDateStr(h.start) === dateStr);
}

// Get today's date as YYYY-MM-DD
function getTodayStr() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

// Generate the days array for a month grid (includes padding from prev/next months)
function generateMonthDays(year, month) {
    const days = [];
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();

    // Get day of week for first day (0 = Sunday, convert to 0 = Monday)
    let startDayOfWeek = firstDay.getDay();
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1; // Convert to Monday-based

    // Add days from previous month
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();

    for (let i = startDayOfWeek - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        days.push({
            day,
            month: prevMonth,
            year: prevYear,
            dateStr: `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
            isOtherMonth: true
        });
    }

    // Add days from current month
    for (let day = 1; day <= daysInMonth; day++) {
        days.push({
            day,
            month,
            year,
            dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
            isOtherMonth: false
        });
    }

    // Add days from next month to complete the grid (up to 42 days = 6 weeks)
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const remaining = 42 - days.length;

    for (let day = 1; day <= remaining; day++) {
        days.push({
            day,
            month: nextMonth,
            year: nextYear,
            dateStr: `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
            isOtherMonth: true
        });
    }

    return days;
}

// Get the view range from card data
function getViewRange(card) {
    const view = card.view || {};
    let startYM = parseYearMonth(view.start);
    let endYM = parseYearMonth(view.end);

    // Default to current month if not specified
    const now = new Date();
    if (!startYM) {
        startYM = { year: now.getFullYear(), month: now.getMonth() + 1 };
    }
    if (!endYM) {
        endYM = { year: now.getFullYear(), month: now.getMonth() + 1 };
    }

    return { start: startYM, end: endYM };
}

// Check if a month is within the view range
function isMonthInRange(year, month, range) {
    const current = year * 12 + month;
    const start = range.start.year * 12 + range.start.month;
    const end = range.end.year * 12 + range.end.month;
    return current >= start && current <= end;
}

// Get initial view month (current month if in range, otherwise first month)
function getInitialViewMonth(card) {
    const range = getViewRange(card);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    if (isMonthInRange(currentYear, currentMonth, range)) {
        return { year: currentYear, month: currentMonth };
    }
    return { year: range.start.year, month: range.start.month };
}

// Get or initialize view state for a card
function getViewState(card) {
    if (!calendarViewState[card.id]) {
        calendarViewState[card.id] = getInitialViewMonth(card);
    }
    return calendarViewState[card.id];
}

// ========== RENDER FUNCTIONS ==========

// Card preview: compact month grid showing current month
export function renderPreview(card, template) {
    const viewState = getViewState(card);
    const { year, month } = viewState;
    const events = card.events || [];
    const legend = card.legend || {};
    const todayStr = getTodayStr();

    const days = generateMonthDays(year, month);

    // Build day headers (abbreviated)
    const dayHeaders = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d =>
        `<div class="calendar-preview-header-day">${d}</div>`
    ).join('');

    // Build compact grid (first 5-6 weeks)
    const displayDays = days.slice(0, 42);

    let gridHtml = '';
    for (const d of displayDays) {
        const dayEvents = getEventsForDate(events, d.dateStr);
        const isToday = d.dateStr === todayStr;
        const hasEvents = dayEvents.length > 0;

        let classes = 'calendar-preview-day';
        if (d.isOtherMonth) classes += ' other-month';
        if (isToday) classes += ' today';
        if (hasEvents && !d.isOtherMonth) classes += ' has-events';

        // Show day number and event indicator
        let content = `<span class="day-num">${d.day}</span>`;
        if (hasEvents && !d.isOtherMonth) {
            const stars = dayEvents
                .map(e => legend[e.type]?.color)
                .filter(Boolean)
                .slice(0, 3)
                .map(color => starSvg(color, 12));
            if (stars.length > 0) {
                content += `<span class="event-dots">${stars.join('')}</span>`;
            }
        }

        gridHtml += `<div class="${classes}">${content}</div>`;
    }

    // Count total events
    const eventCount = events.length;

    return `
        <div class="calendar-preview">
            <div class="calendar-preview-title">${MONTH_NAMES[month - 1]} ${year}</div>
            <div class="calendar-preview-headers">${dayHeaders}</div>
            <div class="calendar-preview-grid">${gridHtml}</div>
            ${eventCount > 0 ? `<div class="calendar-preview-summary">${eventCount} event${eventCount !== 1 ? 's' : ''}</div>` : ''}
        </div>
    `;
}

// Viewer: full month view with navigation
export function renderViewer(card, template) {
    const events = card.events || [];
    const highlights = card.highlights || [];
    const legend = card.legend || {};
    const viewState = getViewState(card);
    const range = getViewRange(card);
    const todayStr = getTodayStr();

    const { year, month } = viewState;
    const days = generateMonthDays(year, month);

    // Check navigation bounds
    const canGoPrev = isMonthInRange(
        month === 1 ? year - 1 : year,
        month === 1 ? 12 : month - 1,
        range
    );
    const canGoNext = isMonthInRange(
        month === 12 ? year + 1 : year,
        month === 12 ? 1 : month + 1,
        range
    );

    // Build day headers
    let headersHtml = DAY_NAMES.map(d =>
        `<div class="calendar-day-header">${d}</div>`
    ).join('');

    // Build grid
    let gridHtml = '';
    for (const d of days) {
        const dayEvents = getEventsForDate(events, d.dateStr);
        const highlight = getHighlightForDate(highlights, d.dateStr);
        const isToday = d.dateStr === todayStr;
        const isStart = isHighlightStart(highlights, d.dateStr);

        let classes = 'calendar-day';
        if (d.isOtherMonth) classes += ' other-month';
        if (isToday) classes += ' today';
        if (highlight) classes += ' highlight';
        if (isStart) classes += ' highlight-start';

        // Build events HTML
        let eventsHtml = '';
        for (const evt of dayEvents) {
            const color = legend[evt.type]?.color;
            const label = legend[evt.type]?.label || evt.type;
            if (evt.label) {
                eventsHtml += `<div class="calendar-event-labeled" title="${escapeHtml(evt.label)}">
                    ${color ? starSvg(color, 16) : ''}
                    <span class="event-label">${escapeHtml(evt.label)}</span>
                </div>`;
            } else if (color) {
                eventsHtml += `<span class="calendar-event-star" title="${escapeHtml(label)}">${starSvg(color, 22)}</span>`;
            }
        }

        // Highlight label (only on start date)
        let highlightLabelHtml = '';
        if (isStart && highlight && highlight.label) {
            highlightLabelHtml = `<span class="calendar-highlight-label">${escapeHtml(highlight.label)}</span>`;
        }

        gridHtml += `
            <div class="${classes}">
                ${highlightLabelHtml}
                <div class="calendar-day-number">${d.day}</div>
                <div class="calendar-day-events">${eventsHtml}</div>
            </div>
        `;
    }

    // Build legend (filter out hidden entries)
    let legendHtml = '';
    const legendEntries = Object.entries(legend).filter(([key, val]) => !val.hidden);
    if (legendEntries.length > 0) {
        const items = legendEntries.map(([key, val]) =>
            `<div class="calendar-legend-item">
                <span class="calendar-legend-star">${val.color ? starSvg(val.color, 24) : ''}</span>
                <span class="calendar-legend-label">${escapeHtml(val.label || key)}</span>
            </div>`
        ).join('');
        legendHtml = `<div class="calendar-legend">${items}</div>`;
    }

    // Subtitle
    const subtitleHtml = card.subtitle
        ? `<div class="calendar-subtitle">${escapeHtml(card.subtitle)}</div>`
        : '';

    return `
        <div class="calendar-viewer" data-card-id="${card.id}">
            ${subtitleHtml}
            <div class="calendar-nav">
                <button class="calendar-nav-btn" onclick="navigateCalendar('${card.id}', -1)" ${canGoPrev ? '' : 'disabled'}>◀</button>
                <div class="calendar-nav-title">${MONTH_NAMES[month - 1]} ${year}</div>
                <button class="calendar-nav-btn" onclick="navigateCalendar('${card.id}', 1)" ${canGoNext ? '' : 'disabled'}>▶</button>
            </div>
            <div class="calendar-day-headers">${headersHtml}</div>
            <div class="calendar-grid">${gridHtml}</div>
            ${legendHtml}
        </div>
    `;
}

// ========== NAVIGATION ==========

// Navigate to previous/next month
function navigateCalendar(cardId, direction) {
    const state = calendarViewState[cardId];
    if (!state) return;

    let { year, month } = state;
    month += direction;

    if (month < 1) {
        month = 12;
        year--;
    } else if (month > 12) {
        month = 1;
        year++;
    }

    // Update state
    calendarViewState[cardId] = { year, month };

    // Re-render viewer
    const viewerContent = document.getElementById('viewerContent');
    if (viewerContent) {
        const card = window.notebook?.findCardById?.(cardId);
        if (card) {
            const templateRegistry = window.notebook?.templateRegistry || {};
            const template = templateRegistry[card.template || card.type];
            viewerContent.innerHTML = renderViewer(card, template);
        }
    }
}

// ========== REGISTER GLOBAL HANDLERS ==========

window.navigateCalendar = navigateCalendar;
