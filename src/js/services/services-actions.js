// ============================================================
// service-actions.js  (serviceNew.html + serviceEdit.html)
//
// Responsabilidade: orquestrar o formulário de criar/editar serviço.
//
// O que mudou em relação ao original:
//   ✅ Não tem mais nenhuma função que fala com o Supabase
//   ✅ Toda comunicação com o banco vem de services.api.js
//   ✅ escapeHTML veio de utils/string.utils.js (sem duplicação)
//   ✅ saveRating recebe userId como parâmetro (sem depender de estado global)
// ============================================================

import { requireAuthOrRedirect } from "../guard.js";
import { signOut } from "../auth.js";

// 💡 Importa APENAS as funções que este arquivo realmente usa
import { fetchCategories, fetchServiceById, createService, updateService } from "../services/services.api.js";
import { escapeHTML } from "../utils/string.utils.js";

// ─── Elementos da página ─────────────────────────────────────
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

// ─── Estado local ─────────────────────────────────────────────
let userIdState = null;
let serviceIdState = null;
let isEditModeState = false;

// ─── Helpers de UI ───────────────────────────────────────────
function setMsg(text = "") {
    msg.textContent = text;
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
    // escapeHTML importado de utils — não duplicado aqui
    categorySel.innerHTML = categories
        .map((category) => {
            const safe = escapeHTML(category);
            return `<option value="${safe}">${safe}</option>`;
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

// ─── Evento de submit ─────────────────────────────────────────
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMsg("");
    saveBtn.disabled = true;

    try {
        const serviceData = getFormData();
        validateForm(serviceData);

        if (isEditModeState) {
            // updateService vem de services.api.js — sem supabase aqui
            await updateService(serviceIdState, serviceData);
            setMsg("Service updated successfully.");
            window.location.replace(`/serviceDetails.html?id=${serviceIdState}`);
        } else {
            const created = await createService(serviceData);
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

// ─── Init ────────────────────────────────────────────────────
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

    // fetchCategories vem de services.api.js
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