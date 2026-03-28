import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const TABLE_NAME = "phone_numbers";
const SUPABASE_URL = "https://worvqswzdixjgwtjqtub.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_UHZzKrmliMbxipgaCgI3rA__BAtuVUW";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: {
    fetch: (input, init = {}) => {
      return fetch(input, { ...init, cache: "no-store" });
    },
  },
});

const addForm = document.querySelector("#addForm");
const phoneInput = document.querySelector("#phoneInput");
const removeByInputBtn = document.querySelector("#removeByInputBtn");
const statusText = document.querySelector("#statusText");
const actionBanner = document.querySelector("#actionBanner");
const numbersList = document.querySelector("#numbersList");
const refreshBtn = document.querySelector("#refreshBtn");
const copyBtn = document.querySelector("#copyBtn");
const numberItemTemplate = document.querySelector("#numberItemTemplate");

let numbers = [];
let actionBannerTimeoutId = null;

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.className = `mt-2 min-h-5 text-xs ${isError ? "text-rose-300" : "text-slate-400"}`;
}

function showActionBanner(message, isError = false) {
  if (!message) {
    return;
  }

  actionBanner.textContent = message;
  actionBanner.className = `mb-3 rounded-xl border px-3 py-2 text-sm font-semibold ${
    isError ? "border-rose-500/60 bg-rose-500/10 text-rose-200" : "border-emerald-500/60 bg-emerald-500/10 text-emerald-200"
  }`;

  if (actionBannerTimeoutId) {
    clearTimeout(actionBannerTimeoutId);
  }

  actionBannerTimeoutId = setTimeout(() => {
    actionBanner.className = "mb-3 hidden rounded-xl border px-3 py-2 text-sm font-semibold";
    actionBanner.textContent = "";
  }, 3500);
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

async function disableBrowserCaching() {
  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch {
    }
  }

  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch {
    }
  }
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
      const successMessage = commandFromUrl.action === "add" ? "Number added from command link." : "Number removed from command link.";
      setStatus(successMessage);
      showActionBanner(successMessage);
    } else {
      const failureMessage = commandFromUrl.action === "add" ? "Add command failed." : "Remove command failed.";
      showActionBanner(failureMessage, true);
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
      const successMessage =
        commandFromClipboard.action === "add" ? "Number added from clipboard command." : "Number removed from clipboard command.";
      setStatus(successMessage);
      showActionBanner(successMessage);
    } else {
      const failureMessage = commandFromClipboard.action === "add" ? "Clipboard add command failed." : "Clipboard remove command failed.";
      showActionBanner(failureMessage, true);
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
  try {
    await fetchNumbersFromSupabase();
    setStatus("Loaded from Supabase.");
  } catch (error) {
    numbers = [];
    renderList();
    setStatus(getSupabaseErrorMessage(error), true);
  }
}

async function refreshFromSupabase() {
  const originalText = refreshBtn.textContent;
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Refreshing...";

  try {
    await disableBrowserCaching();
    await fetchNumbersFromSupabase();
    renderList();
    setStatus("Refreshed from Supabase.");
  } catch (error) {
    setStatus(getSupabaseErrorMessage(error), true);
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = originalText;
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

refreshBtn.addEventListener("click", async () => {
  await refreshFromSupabase();
});

await disableBrowserCaching();
await loadInitialData();
renderList();
await runAutoCommandOnLoad();