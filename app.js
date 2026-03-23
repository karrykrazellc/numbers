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

function saveNumbers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(numbers));
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
        numbers = parsed;
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
      numbers = parsed.map((value) => String(value).trim()).filter(Boolean);
      saveNumbers();
    }
  } catch {
    setStatus("Could not load starter JSON. You can still add numbers.", true);
  }
}

addForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const nextNumber = sanitizeNumber(phoneInput.value);
  if (!nextNumber) {
    setStatus("Enter a phone number first.", true);
    return;
  }

  if (numbers.includes(nextNumber)) {
    setStatus("That number is already in the list.", true);
    return;
  }

  numbers.unshift(nextNumber);
  saveNumbers();
  renderList();
  phoneInput.value = "";
  phoneInput.focus();
  setStatus("Number added.");
});

removeByInputBtn.addEventListener("click", () => {
  const numberToRemove = sanitizeNumber(phoneInput.value);
  if (!numberToRemove) {
    setStatus("Paste or type a number to remove.", true);
    return;
  }

  if (!numbers.includes(numberToRemove)) {
    setStatus("That number is not in the list.", true);
    return;
  }

  numbers = numbers.filter((entry) => entry !== numberToRemove);
  saveNumbers();
  renderList();
  phoneInput.value = "";
  phoneInput.focus();
  setStatus("Number removed.");
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