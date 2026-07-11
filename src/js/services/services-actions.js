
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

// Importa APENAS as funções que este arquivo realmente usa
import { fetchServiceById, createService, updateService } from "../services/services.api.js";
import { fetchCategories, fetchSubCategories } from "../lib/api/general.api.js";
import { escapeHTML } from "../utils/string.utils.js";

// Photos
import { fetchPhotos, addPhotos, deletePhoto, normalizePhotoPositions, MAX_PHOTOS } from "../lib/api/photos.api.js";
import { renderPhotoThumbnails, renderPhotoUploadControl } from "../ui/photos-render.js";
import { openLightbox } from "../ui/photo-lightbox.js";

// ─── Elementos da página ─────────────────────────────────────
const form = document.querySelector("#serviceForm");
const msg = document.querySelector("#msg");
const pageTitle = document.querySelector("#pageTitle");
const logoutLink = document.querySelector("#logoutLink");
const saveBtn = document.querySelector("#saveBtn");

const titleInput = document.querySelector("#serviceTitle");
const descInput = document.querySelector("#serviceDesc");
const categorySel = document.querySelector("#serviceCate");
const subCategorySel = document.querySelector("#serviceSubCate");
const cityInput = document.querySelector("#serviceCity");
const countryInput = document.querySelector("#serviceCountry");
const isActiveInput = document.querySelector("#serviceIsActive");

const photosSectionEl = document.querySelector("#photosSection");

// ─── Estado local ─────────────────────────────────────────────
let userIdState = null;
let serviceIdState = null;
let isEditModeState = false;

let existingPhotosState = [];   // fotos já salvas no banco (modo edição)
let newPhotosState = [];        // { tempId, file, previewUrl } — ainda não enviadas
let deletedPhotoIdsState = [];  // ids de fotos existentes marcadas para exclusão


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
        subcategory_id: subCategorySel.value || null,
        city: cityInput.value.trim(),
        country: countryInput.value.trim(),
        is_active: isActiveInput.checked,
    };
}

function validateForm(serviceData) {
    if (!serviceData.title) throw new Error("Title is required.");
    if (!serviceData.description) throw new Error("Description is required.");
    if (!categorySel.value) throw new Error("Category is required.");
    if (!serviceData.subcategory_id) throw new Error("Sub Category is required.");
    if (!serviceData.city) throw new Error("City is required.");
    if (!serviceData.country) throw new Error("Country is required.");
}

function fillCategoryDropdown(categories) {
    categorySel.innerHTML = `<option value="">Select a category</option>`;

    const options = categories
        .map((c) => `<option value="${c.id}">${escapeHTML(c.name)}</option>`)
        .join("");

    categorySel.insertAdjacentHTML("beforeend", options);
}

function fillSubCategoryDropdown(subcategories) {
    subCategorySel.innerHTML = `<option value="">Select a subcategory</option>`;

    const options = subcategories
        .map((c) => `<option value="${c.id}">${escapeHTML(c.name)}</option>`)
        .join("");

    subCategorySel.insertAdjacentHTML("beforeend", options);
}

async function populateForm(service) {
    titleInput.value = service.title ?? "";
    descInput.value = service.description ?? "";
    cityInput.value = service.city ?? "";
    countryInput.value = service.country ?? "";
    isActiveInput.checked = Boolean(service.is_active);

    const categoryId = service.subcategories?.category_id ?? "";
    const subcategoryId = service.subcategory_id ?? "";

    categorySel.value = categoryId;

    await reloadSubCate(categoryId, subcategoryId);
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
            await updateService(serviceIdState, serviceData);
            await applyPhotosDiff(serviceIdState);
            setMsg("Service updated successfully.");
            window.location.replace(`/serviceDetails.html?id=${serviceIdState}`);
        } else {
            const created = await createService(serviceData);
            await applyPhotosDiff(created.id);
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

async function reloadSubCate(categoryId, selectedSubcategoryId = "") {
    if (!categoryId) {
        fillSubCategoryDropdown([]);
        return;
    }

    const subcategories = await fetchSubCategories(categoryId);
    fillSubCategoryDropdown(subcategories);

    if (selectedSubcategoryId) {
        subCategorySel.value = selectedSubcategoryId;
    }
}

function getDisplayPhotos() {
    const remainingExisting = existingPhotosState
        .filter((p) => !deletedPhotoIdsState.includes(p.id))
        .map((p) => ({ id: p.id, url: p.url }));

    const newOnes = newPhotosState.map((p) => ({ id: p.tempId, url: p.previewUrl }));

    return [...remainingExisting, ...newOnes];
}

function renderPhotosSection() {
    const displayPhotos = getDisplayPhotos();
    photosSectionEl.innerHTML = `
        ${renderPhotoUploadControl(MAX_PHOTOS, displayPhotos.length)}
        ${renderPhotoThumbnails(displayPhotos, true)}
    `;
}

async function applyPhotosDiff(serviceId) {
    for (const photoId of deletedPhotoIdsState) {
        const photo = existingPhotosState.find((p) => p.id === photoId);
        if (photo) await deletePhoto(photo);
    }

    if (deletedPhotoIdsState.length) {
        await normalizePhotoPositions(serviceId, "service"); // evita perder a "capa" (position 0)
    }

    if (newPhotosState.length) {
        const files = newPhotosState.map((p) => p.file);
        await addPhotos(files, serviceId, "service");
    }
}
// ─── Init ────────────────────────────────────────────────────
async function init() {
    const session = await requireAuthOrRedirect();
    if (!session) return;

    userIdState = session.user.id;
    serviceIdState = getServiceIdFromUrl();
    isEditModeState = Boolean(serviceIdState);

    setMsg("Loading...");

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

    // abrir seletor / excluir / abrir lightbox
    photosSectionEl.addEventListener("click", (e) => {
        if (e.target.closest("#photoUploadBtn")) {
            photosSectionEl.querySelector("#photoFileInput").click();
            return;
        }

        const delBtn = e.target.closest(".photoDeleteBtn");
        if (delBtn) {
            const key = delBtn.dataset.photoKey;
            const newIndex = newPhotosState.findIndex((p) => p.tempId === key);

            if (newIndex >= 0) {
                URL.revokeObjectURL(newPhotosState[newIndex].previewUrl);
                newPhotosState.splice(newIndex, 1);
            } else {
                deletedPhotoIdsState.push(key);
            }

            renderPhotosSection();
            return;
        }

        const img = e.target.closest(".photoThumbImg");
        if (img) {
            const displayPhotos = getDisplayPhotos();
            openLightbox(displayPhotos.map((p) => p.url), Number(img.dataset.lightboxIndex));
        }
    });

    // arquivos selecionados
    photosSectionEl.addEventListener("change", (e) => {
        const input = e.target.closest("#photoFileInput");
        if (!input) return;

        const availableSlots = MAX_PHOTOS - getDisplayPhotos().length;
        const filesToAdd = Array.from(input.files).slice(0, availableSlots);

        for (const file of filesToAdd) {
            newPhotosState.push({
                tempId: crypto.randomUUID(),
                file,
                previewUrl: URL.createObjectURL(file),
            });
        }

        input.value = "";
        renderPhotosSection();
    });

    const categories = await fetchCategories('service');
    fillCategoryDropdown(categories);
    fillSubCategoryDropdown([]);

    categorySel.addEventListener("change", async () => {
        await reloadSubCate(categorySel.value);
    });

    if (isEditModeState) {
        pageTitle.textContent = "Edit Service";
        const service = await fetchServiceById(serviceIdState);
        if (service.owner_id !== userIdState) throw new Error("You do not have permission to edit this service.");
        await populateForm(service);
        existingPhotosState = await fetchPhotos(serviceIdState, "service");
    } else {
        pageTitle.textContent = "New Service";
    }

    renderPhotosSection(); // vazio na criação, populado na edição

    setMsg("");
}

init().catch((err) => {
    console.error(err);
    setMsg(err?.message ?? "Unexpected error");
});