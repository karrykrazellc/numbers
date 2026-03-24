const STORAGE_KEY = "number-logger-list-v1";

const addForm = document.querySelector("#addForm");
const phoneInput = document.querySelector("#phoneInput");
const removeByInputBtn = document.querySelector("#removeByInputBtn");
const statusText = document.querySelector("#statusText");
const numbersList = document.querySelector("#numbersList");
const copyBtn = document.querySelector("#copyBtn");
const numberItemTemplate = document.querySelector("#numberItemTemplate");

let numbers = [];

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.className = `mt-2 min-h-5 text-xs ${isError ? "text-rose-300" : "text-slate-400"}`;
}

function sanitizeNumber(value) {
  return value.trim();
}

function normalizePhoneNumber(value) {
  const cleaned = sanitizeNumber(value);
  if (!cleaned) {
    return "";
  }

  const digitsOnly = cleaned.replace(/\D/g, "");
  if (!digitsOnly) {
    return "";
  }

  if (digitsOnly.length === 10) {
    return `+1${digitsOnly}`;
  }

  if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
    return `+${digitsOnly}`;
  }

  return `+${digitsOnly}`;
}

function parseCommandText(value) {
  const cleaned = sanitizeNumber(value);
  if (!cleaned) {
    return { action: null, number: "" };
  }

  if (cleaned.startsWith("+")) {
    return { action: "add", number: normalizePhoneNumber(cleaned.slice(1)) };
  }

  if (cleaned.startsWith("-")) {
    return { action: "remove", number: normalizePhoneNumber(cleaned.slice(1)) };
  }

  return { action: null, number: normalizePhoneNumber(cleaned) };
}

async function getNumberFromClipboardOrInput() {
  if (navigator.clipboard?.readText) {
    try {
      const clipboardText = await navigator.clipboard.readText();
      const parsed = parseCommandText(clipboardText);
      if (parsed.number) {
        return { value: parsed.number, source: "clipboard" };
      }
    } catch {
    }
  }

  const parsedInput = parseCommandText(phoneInput.value);
  if (parsedInput.number) {
    return { value: parsedInput.number, source: "input" };
  }

  return { value: "", source: "none" };
}

function saveNumbers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(numbers));
}

function addNumberToList(number) {
  if (numbers.includes(number)) {
    setStatus("That number is already in the list.", true);
    return false;
  }

  numbers.unshift(number);
  saveNumbers();
  renderList();
  return true;
}

function removeNumberFromList(number) {
  if (!numbers.includes(number)) {
    setStatus("That number is not in the list.", true);
    return false;
  }

  numbers = numbers.filter((entry) => entry !== number);
  saveNumbers();
  renderList();
  return true;
}

async function runAutoCommandOnLoad() {
  const params = new URLSearchParams(window.location.search);
  const commandFromUrl = parseCommandText(params.get("cmd") || "");

  if (commandFromUrl.action && commandFromUrl.number) {
    const success =
      commandFromUrl.action === "add"
        ? addNumberToList(commandFromUrl.number)
        : removeNumberFromList(commandFromUrl.number);

    if (success) {
      setStatus(commandFromUrl.action === "add" ? "Auto-added from shortcut link." : "Auto-removed from shortcut link.");
    }
    window.history.replaceState({}, "", window.location.pathname);
    return;
  }

  if (!navigator.clipboard?.readText) {
    return;
  }

  try {
    const clipboardText = await navigator.clipboard.readText();
    const commandFromClipboard = parseCommandText(clipboardText);
    if (!commandFromClipboard.action || !commandFromClipboard.number) {
      return;
    }

    const success =
      commandFromClipboard.action === "add"
        ? addNumberToList(commandFromClipboard.number)
        : removeNumberFromList(commandFromClipboard.number);

    if (success) {
      setStatus(commandFromClipboard.action === "add" ? "Auto-added from clipboard command." : "Auto-removed from clipboard command.");
    }
  } catch {
  }
}

function renderList() {
  numbersList.innerHTML = "";

  if (numbers.length === 0) {
    const emptyState = document.createElement("li");
    emptyState.className = "rounded-xl border border-dashed border-slate-700 bg-slate-900/50 px-3 py-4 text-sm text-slate-400";
    emptyState.textContent = "No numbers yet.";
    numbersList.appendChild(emptyState);
    return;
  }

  numbers.forEach((number) => {
    const fragment = numberItemTemplate.content.cloneNode(true);
    const textElement = fragment.querySelector(".number-text");

    textElement.textContent = number;
    numbersList.appendChild(fragment);
  });
}

async function loadInitialData() {
  const fromStorage = localStorage.getItem(STORAGE_KEY);

  if (fromStorage) {
    try {
      const parsed = JSON.parse(fromStorage);
      if (Array.isArray(parsed)) {
        numbers = Array.from(new Set(parsed.map((value) => normalizePhoneNumber(String(value))).filter(Boolean)));
        return;
      }
    } catch {
      setStatus("Saved data was invalid. Starting fresh.", true);
    }
  }

  try {
    const response = await fetch("numbers.json", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const parsed = await response.json();
    if (Array.isArray(parsed)) {
      numbers = Array.from(new Set(parsed.map((value) => normalizePhoneNumber(String(value))).filter(Boolean)));
      saveNumbers();
    }
  } catch {
    setStatus("Could not load starter JSON. You can still add numbers.", true);
  }
}

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const candidate = await getNumberFromClipboardOrInput();
  const nextNumber = candidate.value;

  if (!nextNumber) {
    setStatus("Copy a number first or type one in the box.", true);
    return;
  }

  const added = addNumberToList(nextNumber);
  if (!added) {
    return;
  }

  phoneInput.value = "";
  phoneInput.focus();
  setStatus(candidate.source === "clipboard" ? "Number added from clipboard." : "Number added.");
});

removeByInputBtn.addEventListener("click", async () => {
  const candidate = await getNumberFromClipboardOrInput();
  const numberToRemove = candidate.value;

  if (!numberToRemove) {
    setStatus("Copy a number first or type one to remove.", true);
    return;
  }

  const removed = removeNumberFromList(numberToRemove);
  if (!removed) {
    return;
  }

  phoneInput.value = "";
  phoneInput.focus();
  setStatus(candidate.source === "clipboard" ? "Number removed from clipboard." : "Number removed.");
});

copyBtn.addEventListener("click", async () => {
  if (numbers.length === 0) {
    setStatus("There are no numbers to copy.", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(numbers.join("\n"));
    setStatus(`Copied ${numbers.length} number${numbers.length === 1 ? "" : "s"}.`);
  } catch {
    setStatus("Copy failed. Please allow clipboard access.", true);
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      setStatus("Offline support could not be enabled.", true);
    });
  });
}

await loadInitialData();
renderList();
await runAutoCommandOnLoad();