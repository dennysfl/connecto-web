import { supabase } from "./supabaseClient.js";
import { requireAuthOrRedirect } from "./guard.js";
import { signOut } from "./auth.js";

// --------------------
// Elementos da página
// --------------------
const form = document.querySelector("#serviceForm");
const msg = document.querySelector("#msg");
const pageTitle = document.querySelector("#pageTitle");
const logoutLink = document.querySelector("#logoutLink");
const saveBtn = document.querySelector("#saveBtn");

const titleInput = document.querySelector("#serviceTitle");
const descInput = document.querySelector("#serviceDesc");
const categorySel = document.querySelector("#serviceCate");
const cityInput = document.querySelector("#serviceCity");
const countryInput = document.querySelector("#serviceCountry");
const isActiveInput = document.querySelector("#serviceIsActive");

// --------------------
// Estado local
// --------------------
let userIdState = null;
let serviceIdState = null;
let isEditModeState = false;

// --------------------
// Helpers
// --------------------
function setMsg(text = "") {
    msg.textContent = text;
}

function escapeHtml(str) {
    return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function getServiceIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id");
}

function getFormData() {
    return {
        title: titleInput.value.trim(),
        description: descInput.value.trim(),
        category: categorySel.value.trim(),
        city: cityInput.value.trim(),
        country: countryInput.value.trim(),
        is_active: isActiveInput.checked,
    };
}

function validateForm(serviceData) {
    if (!serviceData.title) throw new Error("Title is required.");
    if (!serviceData.description) throw new Error("Description is required.");
    if (!serviceData.category) throw new Error("Category is required.");
    if (!serviceData.city) throw new Error("City is required.");
    if (!serviceData.country) throw new Error("Country is required.");
}

function fillCategoryDropdown(categories) {
    categorySel.innerHTML = categories
        .map((category) => {
            const safeValue = escapeHtml(category);
            return `<option value="${safeValue}">${safeValue}</option>`;
        })
        .join("");
}

function populateForm(service) {
    titleInput.value = service.title ?? "";
    descInput.value = service.description ?? "";
    categorySel.value = service.category ?? "";
    cityInput.value = service.city ?? "";
    countryInput.value = service.country ?? "";
    isActiveInput.checked = Boolean(service.is_active);
}

// --------------------
// Data access
// --------------------
async function fetchCategories() {
    const { data, error } = await supabase
        .from("services")
        .select("category")
        .eq("is_active", true);

    if (error) throw error;

    const unique = [...new Set((data ?? []).map((row) => row.category).filter(Boolean))];
    unique.sort((a, b) => a.localeCompare(b));

    if (!unique.length) {
        throw new Error("No categories found.");
    }

    return unique;
}

async function fetchServiceById(serviceId) {
    const { data, error } = await supabase
        .from("services")
        .select("id, owner_id, title, description, category, city, country, is_active")
        .eq("id", serviceId)
        .single();

    if (error) throw error;
    return data;
}

async function createService(serviceData) {
    const { data, error } = await supabase
        .from("services")
        .insert([serviceData])
        .select()
        .single();

    if (error) throw error;
    return data;
}

async function updateService(serviceId, serviceData) {
    const { data, error } = await supabase
        .from("services")
        .update(serviceData)
        .eq("id", serviceId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// --------------------
// Submit
// --------------------
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMsg("");
    saveBtn.disabled = true;

    try {
        const serviceData = getFormData();
        validateForm(serviceData);

        if (isEditModeState) {
            const updated = await updateService(serviceIdState, serviceData);
            console.log("Updated service:", updated);
            setMsg("Service updated successfully.");
            window.location.replace(`/serviceDetails.html?id=${serviceIdState}`);
        } else {
            const created = await createService(serviceData);
            console.log("Created service:", created);
            setMsg("Service created successfully.");
            window.location.replace(`/serviceDetails.html?id=${created.id}`);
        }
    } catch (err) {
        console.error(err);
        setMsg(err?.message ?? "Error saving service.");
    } finally {
        saveBtn.disabled = false;
    }
});

// --------------------
// Init
// --------------------
async function init() {
    const session = await requireAuthOrRedirect();
    if (!session) return;

    userIdState = session.user.id;
    serviceIdState = getServiceIdFromUrl();
    isEditModeState = Boolean(serviceIdState);

    logoutLink.addEventListener("click", async (e) => {
        e.preventDefault();

        try {
            await signOut();
            window.location.replace("/login.html");
        } catch (err) {
            console.error(err);
            setMsg(err?.message ?? "Logout failed");
        }
    });

    setMsg("Loading...");

    const categories = await fetchCategories();
    fillCategoryDropdown(categories);

    if (isEditModeState) {
        pageTitle.textContent = "Edit Service";

        const service = await fetchServiceById(serviceIdState);

        if (service.owner_id !== userIdState) {
            throw new Error("You do not have permission to edit this service.");
        }

        populateForm(service);
    } else {
        pageTitle.textContent = "New Service";
    }

    setMsg("");
}

init().catch((err) => {
    console.error(err);
    setMsg(err?.message ?? "Unexpected error");
});