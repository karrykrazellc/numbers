import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const STORAGE_KEY = "number-logger-list-v1";
const TABLE_NAME = "phone_numbers";
const SUPABASE_URL = "https://worvqswzdixjgwtjqtub.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_UHZzKrmliMbxipgaCgI3rA__BAtuVUW";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

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

function setNumbersCache(nextNumbers) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextNumbers));
}

function getCachedNumbers() {
  const fromStorage = localStorage.getItem(STORAGE_KEY);
  if (!fromStorage) {
    return [];
  }

  try {
    const parsed = JSON.parse(fromStorage);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return Array.from(new Set(parsed.map((value) => normalizePhoneNumber(String(value))).filter(Boolean)));
  } catch {
    return [];
  }
}

function getSupabaseErrorMessage(error) {
  if (!error) {
    return "Unknown error.";
  }

  if (error.code === "42P01") {
    return "Supabase table missing. Run supabase.sql in your Supabase SQL Editor.";
  }

  if (error.code === "42501") {
    return "Supabase permissions blocked. Apply the RLS policies from supabase.sql.";
  }

  return error.message || "Supabase request failed.";
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
  setNumbersCache(numbers);
}

async function addNumberToList(number) {
  if (numbers.includes(number)) {
    setStatus("That number is already in the list.", true);
    return false;
  }

  const { error } = await supabase.from(TABLE_NAME).insert({ phone: number });
  if (error && error.code !== "23505") {
    setStatus(getSupabaseErrorMessage(error), true);
    return false;
  }

  numbers.unshift(number);
  saveNumbers();
  renderList();
  return true;
}

async function removeNumberFromList(number) {
  if (!numbers.includes(number)) {
    setStatus("That number is not in the list.", true);
    return false;
  }

  const { error } = await supabase.from(TABLE_NAME).delete().eq("phone", number);
  if (error) {
    setStatus(getSupabaseErrorMessage(error), true);
    return false;
  }

  numbers = numbers.filter((entry) => entry !== number);
  saveNumbers();
  renderList();
  return true;
}

async function fetchNumbersFromSupabase() {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("phone,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  numbers = Array.from(new Set((data || []).map((row) => normalizePhoneNumber(row.phone)).filter(Boolean)));
  saveNumbers();
}

async function syncCachedNumbersToSupabase(cachedNumbers) {
  if (cachedNumbers.length === 0) {
    return;
  }

  const payload = cachedNumbers.map((phone) => ({ phone }));
  const { error } = await supabase.from(TABLE_NAME).upsert(payload, { onConflict: "phone" });
  if (error) {
    throw error;
  }
}

async function runAutoCommandOnLoad() {
  const rawCmdMatch = window.location.search.match(/[?&]cmd=([^&]+)/);
  const rawCmdValue = rawCmdMatch ? decodeURIComponent(rawCmdMatch[1]) : "";
  const params = new URLSearchParams(window.location.search);
  const commandFromUrl = parseCommandText(rawCmdValue || params.get("cmd") || "");

  if (commandFromUrl.action && commandFromUrl.number) {
    const success =
      commandFromUrl.action === "add"
        ? await addNumberToList(commandFromUrl.number)
        : await removeNumberFromList(commandFromUrl.number);

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
        ? await addNumberToList(commandFromClipboard.number)
        : await removeNumberFromList(commandFromClipboard.number);

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
  const cachedNumbers = getCachedNumbers();

  try {
    await fetchNumbersFromSupabase();

    if (numbers.length === 0 && cachedNumbers.length > 0) {
      await syncCachedNumbersToSupabase(cachedNumbers);
      await fetchNumbersFromSupabase();
      setStatus("Local numbers synced to Supabase.");
    } else {
      setStatus("Loaded from Supabase.");
    }
  } catch (error) {
    numbers = cachedNumbers;
    renderList();
    setStatus(`${getSupabaseErrorMessage(error)} Using local cache only.`, true);
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

  const added = await addNumberToList(nextNumber);
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

  const removed = await removeNumberFromList(numberToRemove);
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