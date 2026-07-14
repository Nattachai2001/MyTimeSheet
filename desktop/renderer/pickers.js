/**
 * Modern date / month / time pickers for native inputs.
 * Keeps hidden native inputs so existing renderer logic keeps working.
 */
const ModernPickers = (() => {
  const locale = navigator.language || "en-US";
  const weekdayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthShort = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ];
  const monthLong = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  const TIME_ITEM_HEIGHT = 40;
  const POPOVER_MARGIN = 10;

  let openPicker = null;
  let openWrapper = null;

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function parseIsoDate(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function parseIsoMonth(value) {
    if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
    const [y, m] = value.split("-").map(Number);
    return { year: y, month: m };
  }

  function parseIsoTime(value) {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
    const [h, m] = value.split(":").map(Number);
    return { hour: h, minute: m };
  }

  function toIsoDate(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function toIsoMonth(year, month) {
    return `${year}-${pad2(month)}`;
  }

  function toIsoTime(hour, minute) {
    return `${pad2(hour)}:${pad2(minute)}`;
  }

  function sameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function formatDateDisplay(value) {
    const date = parseIsoDate(value);
    if (!date) return "Select date";
    try {
      return date.toLocaleDateString(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    } catch {
      return `${weekdayShort[date.getDay()]}, ${date.getDate()} ${monthShort[date.getMonth()]} ${date.getFullYear()}`;
    }
  }

  function formatMonthDisplay(value) {
    const parsed = parseIsoMonth(value);
    if (!parsed) return "Select month";
    try {
      const date = new Date(parsed.year, parsed.month - 1, 1);
      return date.toLocaleDateString(locale, { month: "long", year: "numeric" });
    } catch {
      return `${monthLong[parsed.month - 1]} ${parsed.year}`;
    }
  }

  function formatTimeDisplay(value) {
    const parsed = parseIsoTime(value);
    if (!parsed) return "Select time";
    try {
      const date = new Date(2000, 0, 1, parsed.hour, parsed.minute);
      return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
    } catch {
      return toIsoTime(parsed.hour, parsed.minute);
    }
  }

  function iconCalendar() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5"/>
      <path d="M8 3v3M16 3v3M3 10h18" stroke-linecap="round"/>
    </svg>`;
  }

  function iconClock() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5"/>
      <path d="M12 8v4.5l3 1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  function iconNavPrev() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 7l-5 5 5 5"/></svg>`;
  }

  function iconNavNext() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 7l5 5-5 5"/></svg>`;
  }

  function iconChevron() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M7 10l5 5 5-5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  function typeMinWidth(type) {
    if (type === "time") return 272;
    if (type === "month") return 300;
    return 336;
  }

  function resetPopoverStyles(popover) {
    popover.style.removeProperty("top");
    popover.style.removeProperty("left");
    popover.style.removeProperty("right");
    popover.style.removeProperty("bottom");
    popover.style.removeProperty("width");
    popover.style.removeProperty("max-width");
    popover.style.removeProperty("transform");
  }

  function getAnchorRect(wrapper) {
    const trigger = wrapper.querySelector(".picker-trigger");
    return (trigger ?? wrapper).getBoundingClientRect();
  }

  function mountPopover(wrapper, popover) {
    if (popover.parentElement !== document.body) {
      document.body.appendChild(popover);
    }
    popover.classList.add("is-floating");
    popover.dataset.anchorId = wrapper.dataset.pickerId;
  }

  function unmountPopover(_wrapper, popover) {
    resetPopoverStyles(popover);
    popover.classList.remove("is-floating", "opens-up");
  }

  function closePicker(popover, wrapper) {
    if (!popover || !wrapper) return;
    popover.classList.add("hidden");
    resetPopoverStyles(popover);
    wrapper.querySelector(".picker-trigger")?.setAttribute("aria-expanded", "false");
    unmountPopover(wrapper, popover);
    if (openPicker === popover) {
      openPicker = null;
      openWrapper = null;
    }
  }

  function closeAllPickers() {
    if (openPicker && openWrapper) {
      closePicker(openPicker, openWrapper);
    }
  }

  function hookValueSync(input, onSync) {
    const proto = Object.getPrototypeOf(input);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (!desc?.get || !desc?.set) return;

    let internal = desc.get.call(input);
    Object.defineProperty(input, "value", {
      get() {
        return internal;
      },
      set(next) {
        internal = next;
        desc.set.call(input, next);
        onSync(next);
      },
      configurable: true
    });
  }

  function setNativeValue(input, value, dispatch = true) {
    input.value = value;
    const wrapper = input.closest(".modern-picker");
    if (wrapper) updateTrigger(wrapper, input);
    if (dispatch) {
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function buildTrigger(type) {
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "picker-trigger";
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = `
      <span class="picker-trigger-icon">${type === "time" ? iconClock() : iconCalendar()}</span>
      <span class="picker-trigger-text">
        <span class="picker-trigger-value"></span>
        <span class="picker-trigger-hint"></span>
      </span>
      <span class="picker-trigger-chevron">${iconChevron()}</span>
    `;
    return trigger;
  }

  function renderCalendar(popover, input, viewDate) {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startCol = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = parseIsoDate(input.value);
    const wrapper = input.closest(".modern-picker");

    const body = popover.querySelector(".picker-body");
    body.innerHTML = "";

    const weekdays = document.createElement("div");
    weekdays.className = "picker-weekdays";
    weekdayShort.forEach((day) => {
      const cell = document.createElement("span");
      cell.textContent = day;
      weekdays.appendChild(cell);
    });
    body.appendChild(weekdays);

    const grid = document.createElement("div");
    grid.className = "picker-grid picker-grid-days";
    for (let i = 0; i < startCol; i += 1) {
      const spacer = document.createElement("span");
      spacer.className = "picker-spacer";
      grid.appendChild(spacer);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "picker-cell";
      button.textContent = String(day);
      if (sameDay(date, today)) button.classList.add("is-today");
      if (selected && sameDay(date, selected)) button.classList.add("is-selected");
      button.addEventListener("click", () => {
        setNativeValue(input, toIsoDate(date));
        closePicker(popover, wrapper);
      });
      grid.appendChild(button);
    }
    body.appendChild(grid);

    popover.querySelector(".picker-title").textContent = `${monthLong[month]} ${year}`;
    popover.dataset.viewYear = String(year);
    popover.dataset.viewMonth = String(month);
  }

  function renderMonthGrid(popover, input, year) {
    const parsed = parseIsoMonth(input.value);
    const selectedMonth = parsed?.year === year ? parsed.month : null;
    const today = new Date();
    const wrapper = input.closest(".modern-picker");
    const body = popover.querySelector(".picker-body");
    body.innerHTML = "";

    const grid = document.createElement("div");
    grid.className = "picker-grid picker-grid-months";
    for (let month = 1; month <= 12; month += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "picker-cell picker-month-cell";
      button.textContent = monthShort[month - 1];
      if (year === today.getFullYear() && month === today.getMonth() + 1) {
        button.classList.add("is-today");
      }
      if (month === selectedMonth) button.classList.add("is-selected");
      button.addEventListener("click", () => {
        setNativeValue(input, toIsoMonth(year, month));
        closePicker(popover, wrapper);
      });
      grid.appendChild(button);
    }
    body.appendChild(grid);
    popover.querySelector(".picker-title").textContent = String(year);
    popover.dataset.viewYear = String(year);
  }

  function updateTimeLive(popover, hour, minute) {
    const live = popover.querySelector(".picker-time-live");
    if (live) live.textContent = toIsoTime(hour, minute);
  }

  function scrollDrumToValue(list, value) {
    const target = list.querySelector(`[data-value="${value}"]`);
    if (!target) return;
    const offset = target.offsetTop - (list.clientHeight - TIME_ITEM_HEIGHT) / 2;
    list.scrollTop = offset;
  }

  function readDrumValue(list) {
    const center = list.scrollTop + list.clientHeight / 2;
    let closest = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    list.querySelectorAll("[data-value]").forEach((item) => {
      const itemCenter = item.offsetTop + TIME_ITEM_HEIGHT / 2;
      const distance = Math.abs(itemCenter - center);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = item;
      }
    });
    return closest ? Number(closest.dataset.value) : null;
  }

  function syncDrumSelection(list) {
    const value = readDrumValue(list);
    list.querySelectorAll("[data-value]").forEach((item) => {
      item.classList.toggle("is-centered", Number(item.dataset.value) === value);
    });
    return value;
  }

  function renderTimeDrum(popover, input) {
    const parsed = parseIsoTime(input.value) ?? { hour: 9, minute: 0 };
    const body = popover.querySelector(".picker-body");
    body.innerHTML = `
      <div class="picker-time-live" aria-live="polite">${toIsoTime(parsed.hour, parsed.minute)}</div>
      <div class="picker-time-drum">
        <div class="picker-time-columns-header">
          <span class="picker-time-label">Hour</span>
          <span class="picker-time-label">Min</span>
        </div>
        <div class="picker-time-drum-scroll">
          <div class="picker-time-drum-highlight" aria-hidden="true"></div>
          <div class="picker-time-columns">
            <div class="picker-time-list" data-unit="hour"></div>
            <div class="picker-time-list" data-unit="minute"></div>
          </div>
        </div>
      </div>
    `;

    const hourList = body.querySelector('[data-unit="hour"]');
    const minuteList = body.querySelector('[data-unit="minute"]');

    const addSpacers = (list) => {
      for (let i = 0; i < 2; i += 1) {
        const spacer = document.createElement("div");
        spacer.className = "picker-time-spacer";
        list.appendChild(spacer);
      }
    };

    const buildItems = (list, values, selected) => {
      addSpacers(list);
      values.forEach((value) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "picker-time-option";
        item.dataset.value = String(value);
        item.textContent = pad2(value);
        if (value === selected) item.classList.add("is-centered");
        item.addEventListener("click", () => {
          scrollDrumToValue(list, value);
          syncDrumAndApply(popover, input, hourList, minuteList);
        });
        list.appendChild(item);
      });
      addSpacers(list);
    };

    buildItems(
      hourList,
      Array.from({ length: 24 }, (_, index) => index),
      parsed.hour
    );
    buildItems(
      minuteList,
      Array.from({ length: 12 }, (_, index) => index * 5),
      parsed.minute - (parsed.minute % 5)
    );

    let scrollTimer;
    const onScroll = () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => syncDrumAndApply(popover, input, hourList, minuteList), 80);
      syncDrumSelection(hourList);
      syncDrumSelection(minuteList);
    };

    hourList.addEventListener("scroll", onScroll, { passive: true });
    minuteList.addEventListener("scroll", onScroll, { passive: true });

    requestAnimationFrame(() => {
      scrollDrumToValue(hourList, parsed.hour);
      scrollDrumToValue(minuteList, parsed.minute - (parsed.minute % 5));
      syncDrumSelection(hourList);
      syncDrumSelection(minuteList);
    });
  }

  function syncDrumAndApply(popover, input, hourList, minuteList) {
    const hour = syncDrumSelection(hourList);
    const minute = syncDrumSelection(minuteList);
    if (hour == null || minute == null) return;
    updateTimeLive(popover, hour, minute);
    setNativeValue(input, toIsoTime(hour, minute), false);
  }

  function updateTrigger(wrapper, input) {
    if (!wrapper) return;
    const valueEl = wrapper.querySelector(".picker-trigger-value");
    const hintEl = wrapper.querySelector(".picker-trigger-hint");
    const type = wrapper.dataset.pickerType;
    if (type === "date") {
      valueEl.textContent = formatDateDisplay(input.value);
      hintEl.textContent = input.value ? "" : "Choose a date";
    } else if (type === "month") {
      valueEl.textContent = formatMonthDisplay(input.value);
      hintEl.textContent = input.value ? "" : "Choose a month";
    } else {
      valueEl.textContent = formatTimeDisplay(input.value);
      hintEl.textContent = input.value ? "" : "Choose a time";
    }
    wrapper.classList.toggle("has-value", Boolean(input.value));
    wrapper.classList.toggle("has-empty-hint", !input.value && !wrapper.classList.contains("has-field-label"));
  }

  function buildPopover(type, pickerId) {
    const popover = document.createElement("div");
    popover.className = "picker-popover hidden";
    popover.dataset.pickerId = pickerId;
    popover.setAttribute("role", "dialog");
    popover.innerHTML = `
      <div class="picker-popover-head">
        <button type="button" class="picker-nav picker-nav-prev" aria-label="Previous">${iconNavPrev()}</button>
        <strong class="picker-title"></strong>
        <button type="button" class="picker-nav picker-nav-next" aria-label="Next">${iconNavNext()}</button>
      </div>
      <div class="picker-body"></div>
      <div class="picker-footer">
        <button type="button" class="picker-footer-btn" data-action="today">Today</button>
        <button type="button" class="picker-footer-btn picker-footer-btn-muted" data-action="clear">Clear</button>
      </div>
    `;
    if (type === "month") {
      popover.querySelector('[data-action="today"]').textContent = "This month";
    }
    if (type === "time") {
      popover.classList.add("picker-popover-time");
      popover.querySelector(".picker-popover-head").remove();
      popover.querySelector(".picker-footer").innerHTML =
        '<button type="button" class="picker-footer-btn picker-footer-btn-done" data-action="done">Done</button>';
    }
    return popover;
  }

  function positionPopover(wrapper, popover) {
    if (popover.classList.contains("hidden")) return;
    const rect = getAnchorRect(wrapper);
    if (!rect.width && !rect.height) return;

    const type = wrapper.dataset.pickerType;
    const minWidth = typeMinWidth(type);
    const width = Math.max(Math.round(rect.width), minWidth);

    popover.style.position = "fixed";
    popover.style.width = `${width}px`;
    popover.style.maxWidth = `calc(100vw - ${POPOVER_MARGIN * 2}px)`;

    let left = Math.round(rect.left);
    let top = Math.round(rect.bottom + POPOVER_MARGIN);
    const popoverHeight = popover.offsetHeight || 360;
    const popoverWidth = popover.offsetWidth || width;

    const fitsBelow = top + popoverHeight <= window.innerHeight - POPOVER_MARGIN;
    const fitsAbove = rect.top - POPOVER_MARGIN - popoverHeight >= POPOVER_MARGIN;

    if (!fitsBelow && fitsAbove) {
      top = Math.round(rect.top - popoverHeight - POPOVER_MARGIN);
      popover.classList.add("opens-up");
    } else {
      popover.classList.remove("opens-up");
    }

    if (left + popoverWidth > window.innerWidth - POPOVER_MARGIN) {
      left = Math.max(POPOVER_MARGIN, window.innerWidth - popoverWidth - POPOVER_MARGIN);
    }
    if (left < POPOVER_MARGIN) {
      left = POPOVER_MARGIN;
    }

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    popover.style.right = "auto";
    popover.style.bottom = "auto";
    popover.style.transform = "none";
  }

  function openPickerPanel(wrapper, popover, input, type) {
    closeAllPickers();
    mountPopover(wrapper, popover);
    popover.classList.remove("hidden");
    wrapper.querySelector(".picker-trigger")?.setAttribute("aria-expanded", "true");
    openPicker = popover;
    openWrapper = wrapper;

    if (type === "date") {
      const base = parseIsoDate(input.value) ?? new Date();
      renderCalendar(popover, input, base);
    } else if (type === "month") {
      const base = parseIsoMonth(input.value)?.year ?? new Date().getFullYear();
      renderMonthGrid(popover, input, base);
    } else {
      renderTimeDrum(popover, input);
    }

    requestAnimationFrame(() => {
      positionPopover(wrapper, popover);
      requestAnimationFrame(() => positionPopover(wrapper, popover));
    });
  }

  function enhance(input) {
    if (input.closest(".modern-picker")) return;

    const type = input.type === "month" ? "month" : input.type === "time" ? "time" : "date";
    const pickerId = `picker-${Math.random().toString(36).slice(2, 9)}`;
    const wrapper = document.createElement("div");
    wrapper.className = "modern-picker";
    wrapper.dataset.pickerType = type;
    wrapper.dataset.pickerId = pickerId;

    input.classList.add("picker-native");
    input.tabIndex = -1;
    input.setAttribute("aria-hidden", "true");

    const parent = input.parentNode;
    parent.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const trigger = buildTrigger(type);
    const popover = buildPopover(type, pickerId);
    wrapper.insertBefore(trigger, input);
    document.body.appendChild(popover);
    popover.classList.add("is-floating", "hidden");

    if (parent.tagName === "LABEL") {
      wrapper.classList.add("has-field-label");
      parent.classList.add("picker-label");
    }

    updateTrigger(wrapper, input);
    hookValueSync(input, () => updateTrigger(wrapper, input));

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = openPicker === popover && !popover.classList.contains("hidden");
      if (isOpen) {
        closePicker(popover, wrapper);
        return;
      }
      openPickerPanel(wrapper, popover, input, type);
    });

    popover.addEventListener("click", (event) => event.stopPropagation());

    popover.querySelector(".picker-nav-prev")?.addEventListener("click", () => {
      if (type === "date") {
        const year = Number(popover.dataset.viewYear);
        const month = Number(popover.dataset.viewMonth);
        renderCalendar(popover, input, new Date(year, month - 1, 1));
      } else if (type === "month") {
        const year = Number(popover.dataset.viewYear) - 1;
        renderMonthGrid(popover, input, year);
      }
      requestAnimationFrame(() => positionPopover(wrapper, popover));
    });

    popover.querySelector(".picker-nav-next")?.addEventListener("click", () => {
      if (type === "date") {
        const year = Number(popover.dataset.viewYear);
        const month = Number(popover.dataset.viewMonth);
        renderCalendar(popover, input, new Date(year, month + 1, 1));
      } else if (type === "month") {
        const year = Number(popover.dataset.viewYear) + 1;
        renderMonthGrid(popover, input, year);
      }
      requestAnimationFrame(() => positionPopover(wrapper, popover));
    });

    popover.querySelector('[data-action="today"]')?.addEventListener("click", () => {
      const now = new Date();
      if (type === "date") {
        setNativeValue(input, toIsoDate(now));
      } else if (type === "month") {
        setNativeValue(input, toIsoMonth(now.getFullYear(), now.getMonth() + 1));
      }
      closePicker(popover, wrapper);
    });

    popover.querySelector('[data-action="clear"]')?.addEventListener("click", () => {
      setNativeValue(input, "");
      closePicker(popover, wrapper);
    });

    popover.querySelector('[data-action="done"]')?.addEventListener("click", () => {
      const hourList = popover.querySelector('[data-unit="hour"]');
      const minuteList = popover.querySelector('[data-unit="minute"]');
      if (hourList && minuteList) syncDrumAndApply(popover, input, hourList, minuteList);
      input.dispatchEvent(new Event("change", { bubbles: true }));
      closePicker(popover, wrapper);
    });
  }

  function init() {
    document.querySelectorAll('input[type="date"], input[type="month"], input[type="time"]').forEach(enhance);

    document.addEventListener("click", () => closeAllPickers());

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      closeAllPickers();
    });

    const reposition = () => {
      if (!openPicker || !openWrapper) return;
      positionPopover(openWrapper, openPicker);
    };

    window.addEventListener("resize", reposition, { passive: true });
    document.querySelector(".workspace")?.addEventListener("scroll", reposition, { passive: true });
    window.addEventListener(
      "scroll",
      () => {
        if (!openPicker || !openWrapper) return;
        requestAnimationFrame(reposition);
      },
      { passive: true, capture: true }
    );
  }

  function refresh(input) {
    const wrapper = input?.closest?.(".modern-picker");
    if (wrapper) updateTrigger(wrapper, input);
  }

  function refreshAll() {
    document.querySelectorAll(".picker-native").forEach((node) => refresh(node));
  }

  return { init, refresh, refreshAll, closeAll: closeAllPickers };
})();

window.ModernPickers = ModernPickers;
