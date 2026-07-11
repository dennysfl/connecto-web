// ============================================================
// events-actions.js  (eventNew.html + eventEdit.html)
//
// Responsabilidade: orquestrar o formulário de criar/editar evento.
// ============================================================

import { requireAuthOrRedirect } from "../guard.js";
import { signOut } from "../auth.js";
import { fetchEventById, createEvent, updateEvent } from "../events/events.api.js";
import { fetchCategories, fetchSubCategories } from "../lib/api/general.api.js";
import { escapeHTML } from "../utils/string.utils.js";

// Photos
import { fetchPhotos, addPhotos, deletePhoto, normalizePhotoPositions, MAX_PHOTOS } from "../lib/api/photos.api.js";
import { renderPhotoThumbnails, renderPhotoUploadControl } from "../ui/photos-render.js";
import { openLightbox } from "../ui/photo-lightbox.js";

// ─── Elementos da página ──────────────────────────────────────────────────────
//
//    ✅ Em JS, variáveis locais seguem sempre camelCase:
//       const addressInput, const cityInput, const onlineUrlInput
//
// 💡 DICA — CONVENÇÃO DE NOMES:
//    camelCase    → variáveis e funções:  myVariable, getFormData()
//    PascalCase   → Classes e Components: EventForm, UserService
//    UPPER_SNAKE  → Constantes globais:   MAX_RETRIES, API_URL
//    kebab-case   → IDs no HTML, CSS:     event-form, #save-btn
// ──────────────────────────────────────────────────────────────────────────────

const form = document.querySelector("#eventForm");
const msg = document.querySelector("#msg");
const pageTitle = document.querySelector("#pageTitle");
const logoutLink = document.querySelector("#logoutLink");
const saveBtn = document.querySelector("#saveBtn");

// Campos básicos
const titleInput = document.querySelector("#eventTitle");
const descInput = document.querySelector("#eventDesc");
const categorySel = document.querySelector("#eventCate");
const subCategorySel = document.querySelector("#eventSubCate");

// Tipo de evento + blocos condicionais
const eventTypeInput = document.querySelector("#eventType");
const locationFields = document.querySelector("#locationFields");
const onlineFields = document.querySelector("#onlineFields");

// Campos de localização (in_person / hybrid)
const venueNameInput = document.querySelector("#eventVenueName");
const addressInput = document.querySelector("#eventAddress");
const cityInput = document.querySelector("#eventCity");
const countryInput = document.querySelector("#eventCountry");

// Campo online (online / hybrid)
const onlineUrlInput = document.querySelector("#eventOnlineUrl");

// Data, hora e timezone
const startsAtInput = document.querySelector("#eventStartsAt");
const endsAtInput = document.querySelector("#eventEndsAt");
const timezoneInput = document.querySelector("#eventTimezone");

// Recorrência
const isRecurringInput = document.querySelector("#eventIsRecurring");
const recurrenceFields = document.querySelector("#recurrenceFields");
const recurrenceRuleInput = document.querySelector("#eventRecurrenceRule");
const recurrenceEndsAtInput = document.querySelector("#eventRecurrenceEndsAt");

// Capacidade e preço
const maxCapacityInput = document.querySelector("#eventMaxCapacity");
const isFreeInput = document.querySelector("#eventIsFree");
const priceFields = document.querySelector("#priceFields");
const priceAmountInput = document.querySelector("#eventPriceAmount");
const priceCurrencyInput = document.querySelector("#eventPriceCurrency");

// Status
const isActiveInput = document.querySelector("#eventIsActive");
const isCancelledInput = document.querySelector("#eventIsCancelled");

// Photos
const photosSectionEl = document.querySelector("#photosSection");

// ─── Estado local ─────────────────────────────────────────────────────────────
let userIdState = null;
let eventIdState = null;
let isEditModeState = false;

let existingPhotosState = [];   // fotos já salvas no banco (modo edição)
let newPhotosState = [];        // { tempId, file, previewUrl } — ainda não enviadas
let deletedPhotoIdsState = [];  // ids de fotos existentes marcadas para exclusão

// ─── Helpers de UI ────────────────────────────────────────────────────────────
function setMsg(text = "") {
    msg.textContent = text;
}

function getEventIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id");
}

// ─── Show/Hide condicional ────────────────────────────────────────────────────
//
// 💡 EXPLICAÇÃO — Por que show/hide e não criação dinâmica?
//
//    O HTML já contém todos os campos. O JS apenas controla a visibilidade.
//    Isto é suficiente porque o NÚMERO de campos é fixo — nunca vais precisar
//    de "2 campos de venue" ou "N campos de cidade".
//
//    Criação dinâmica só faz sentido quando o número de elementos é variável.
//    Exemplo: "adicionar vários ingressos com preços diferentes" — aí sim,
//    criarias os campos dinamicamente porque não sabes quantos serão.
//
// 💡 DICA — required vs validação manual:
//    Campos dentro de divs escondidas com display:none NÃO bloqueiam o submit
//    se tiverem required, porque o browser ignora campos invisíveis.
//    Por isso a nossa validateForm() trata a lógica condicional manualmente.
// ─────────────────────────────────────────────────────────────────────────────

function updateEventTypeVisibility() {
    const type = eventTypeInput.value; // "in_person" | "online" | "hybrid"

    // Mostra campos de localização para eventos presenciais ou híbridos
    const showLocation = type === "in_person" || type === "hybrid";
    locationFields.style.display = showLocation ? "block" : "none";

    // Mostra campo de URL apenas para eventos online ou híbridos
    const showOnline = type === "online" || type === "hybrid";
    onlineFields.style.display = showOnline ? "block" : "none";
}

function updateRecurrenceVisibility() {
    // Se is_recurring está marcado, mostra os campos de recorrência
    recurrenceFields.style.display = isRecurringInput.checked ? "block" : "none";
}

function updatePriceVisibility() {
    // Se NÃO é grátis (isFree desmarcado), mostra os campos de preço
    priceFields.style.display = isFreeInput.checked ? "none" : "block";
}

// ─── Conversão de datetime com timezone ──────────────────────────────────────
//
// 💡 EXPLICAÇÃO DETALHADA — O problema do datetime-local:
//
//    O input type="datetime-local" devolve uma string no formato:
//    "2026-07-15T19:00"  ← SEM informação de timezone!
//
//    O Supabase guarda "timestamp with time zone", o que significa que ele
//    PRECISA saber em que fuso horário o evento acontece.
//
//    Exemplo do problema:
//      - Utilizador em Lisboa seleciona "19:00"
//      - Utilizador em São Paulo seleciona "19:00"
//      - Sem timezone, o Supabase não sabe se é o mesmo momento ou não!
//
//    A solução: usar a API Intl.DateTimeFormat do browser para descobrir
//    o "offset" (diferença horária) da timezone selecionada naquele momento,
//    e construir uma string ISO 8601 completa:
//    "2026-07-15T19:00:00+01:00"  ← COM offset
//
//    Por que não usar apenas new Date()?
//    new Date("2026-07-15T19:00") interpreta como UTC ou timezone LOCAL
//    do browser — não da timezone que o utilizador selecionou no form!
// ─────────────────────────────────────────────────────────────────────────────

function toZonedISOString(datetimeLocalValue, tzName) {
    // datetimeLocalValue = "2026-07-15T19:00"
    // tzName = "Europe/Lisbon"

    if (!datetimeLocalValue) return null;

    // Passo 1: Cria um Date "ingénuo" — o browser vai assumir timezone local,
    //          mas isso não importa; só queremos os componentes numéricos.
    const naiveDate = new Date(datetimeLocalValue);

    // Passo 2: Usa Intl para formatar esse momento NA timezone desejada,
    //          pedindo especificamente o offset numérico.
    const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: tzName,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        // timeZoneName: "shortOffset" devolve "GMT+1", "GMT-3", etc.
        timeZoneName: "shortOffset",
    });

    const parts = formatter.formatToParts(naiveDate);
    const get = (type) => parts.find((p) => p.type === type)?.value ?? "";

    // Passo 3: Monta a string ISO 8601 com offset explícito
    // Formato: "2026-07-15T19:00:00+01:00"
    const offset = get("timeZoneName").replace("GMT", "") || "+00:00";
    // "GMT+1" → "+1" → precisamos de "+01:00"
    const offsetFormatted = offset.includes(":")
        ? offset
        : offset + ":00";

    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}${offsetFormatted}`;
}

// ─── Recolha e validação dos dados do form ────────────────────────────────────
//
// 🐛 BUG CORRIGIDO: No teu código original, getFormData() recolhia apenas
//    6 campos (title, description, subcategory_id, city, country, is_active)
//    e ignorava TODOS os campos novos que adicionámos ao HTML:
//    event_type, venue_name, address, online_url, starts_at, ends_at,
//    timezone, is_recurring, recurrence_rule, max_capacity, is_free,
//    price_amount, price_currency, is_cancelled
//
//    Resultado: ao submeter o form, esses campos seriam enviados como undefined
//    e o Supabase usaria os valores default da tabela — ou daria erro.
// ─────────────────────────────────────────────────────────────────────────────

function getFormData() {
    const selectedType = eventTypeInput.value;
    const selectedTz = timezoneInput.value;
    const freeEvent = isFreeInput.checked;
    const recurringEvent = isRecurringInput.checked;

    return {
        // ── Campos base ──────────────────────────────────────
        title: titleInput.value.trim(),
        description: descInput.value.trim() || null,
        subcategory_id: subCategorySel.value || null,

        // ── Tipo de evento ───────────────────────────────────
        event_type: selectedType,

        // ── Localização (só relevante para in_person / hybrid) ──
        // 💡 DICA: Enviamos null para campos irrelevantes ao tipo.
        //    Isto mantém a base de dados limpa — sem URLs em eventos presenciais
        //    e sem venues em eventos online.
        venue_name: (selectedType !== "online")
            ? venueNameInput.value.trim() || null
            : null,
        address: (selectedType !== "online")
            ? addressInput.value.trim() || null
            : null,
        city: (selectedType !== "online")
            ? cityInput.value.trim() || null
            : null,
        country: (selectedType !== "online")
            ? countryInput.value.trim() || null
            : null,

        // ── URL online (só relevante para online / hybrid) ───
        online_url: (selectedType !== "in_person")
            ? onlineUrlInput.value.trim() || null
            : null,

        // ── Data, hora e timezone ────────────────────────────
        timezone: selectedTz,
        // Aqui usamos a função de conversão que explicámos acima!
        starts_at: toZonedISOString(startsAtInput.value, selectedTz),
        ends_at: toZonedISOString(endsAtInput.value, selectedTz),

        // ── Recorrência ──────────────────────────────────────
        is_recurring: recurringEvent,
        recurrence_rule: recurringEvent
            ? recurrenceRuleInput.value.trim() || null
            : null,
        recurrence_ends_at: recurringEvent
            ? toZonedISOString(recurrenceEndsAtInput.value, selectedTz)
            : null,

        // ── Capacidade ───────────────────────────────────────
        // 💡 DICA: Number("") === 0, por isso usamos || null
        //    para enviar null quando o campo está vazio (sem limite).
        max_capacity: Number(maxCapacityInput.value) || null,

        // ── Preço ────────────────────────────────────────────
        is_free: freeEvent,
        price_amount: freeEvent ? null : (Number(priceAmountInput.value) || null),

        // ✅ Depois — quando grátis, mantém 'GBP' como fallback
        //    O campo é NOT NULL na tabela, por isso sempre precisa de um valor.
        //    Faz sentido semanticamente também — um evento gratuito ainda
        //    tem uma "moeda padrão" mesmo que o preço seja 0/null.
        price_currency: freeEvent ? "GBP" : priceCurrencyInput.value,

        // ── Status ───────────────────────────────────────────
        is_active: isActiveInput.checked,
        is_cancelled: isCancelledInput.checked,
    };
}

// ─── Validação ────────────────────────────────────────────────────────────────
//
// 💡 DICA — Validação condicional:
//    A validação deve espelhar a lógica do getFormData().
//    Se um campo só é obrigatório para certos tipos de evento,
//    a validação também deve verificar isso condicionalmente.
// ─────────────────────────────────────────────────────────────────────────────

function validateForm(data) {
    if (!data.title) throw new Error("Title is required.");
    if (!categorySel.value) throw new Error("Category is required.");
    if (!data.subcategory_id) throw new Error("Sub Category is required.");
    if (!data.starts_at) throw new Error("Start date & time is required.");

    const type = data.event_type;

    // Validação condicional por tipo de evento
    if (type === "in_person" || type === "hybrid") {
        if (!data.city) throw new Error("City is required for in-person events.");
        if (!data.country) throw new Error("Country is required for in-person events.");
    }

    if (type === "online" || type === "hybrid") {
        if (!data.online_url) throw new Error("Online URL is required for online events.");
    }

    // Valida que ends_at é depois de starts_at
    if (data.ends_at && data.starts_at && data.ends_at <= data.starts_at) {
        throw new Error("End date must be after start date.");
    }

    // Se tem preço, deve ser um número positivo
    if (!data.is_free && (data.price_amount === null || data.price_amount < 0)) {
        throw new Error("Please enter a valid price for paid events.");
    }
}

// ─── Dropdowns de categoria ───────────────────────────────────────────────────
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

// ─── Preencher form no modo EDIT ──────────────────────────────────────────────
//
// 🐛 BUG CORRIGIDO: O teu populateForm() original só preenchia 5 campos.
//    Em modo edit, os campos de tipo, datas, preço, etc. ficavam em branco.
//    Também faltava chamar as funções de visibilidade depois de preencher
//    os valores — o utilizador via campos escondidos que deviam estar visíveis.
// ─────────────────────────────────────────────────────────────────────────────

function toDatetimeLocalString(isoString) {
    // Converte "2026-07-15T19:00:00+01:00" → "2026-07-15T19:00"
    // para poder preencher o input type="datetime-local"
    if (!isoString) return "";
    // Corta os segundos e timezone, deixando só "YYYY-MM-DDTHH:MM"
    return isoString.slice(0, 16);
}

async function populateForm(event) {
    // Campos base
    titleInput.value = event.title ?? "";
    descInput.value = event.description ?? "";

    // Tipo de evento — tem de ser preenchido ANTES de chamar updateEventTypeVisibility()
    eventTypeInput.value = event.event_type ?? "in_person";

    // Localização
    venueNameInput.value = event.venue_name ?? "";
    addressInput.value = event.address ?? "";
    cityInput.value = event.city ?? "";
    countryInput.value = event.country ?? "";
    onlineUrlInput.value = event.online_url ?? "";

    // Data e timezone
    timezoneInput.value = event.timezone ?? "Europe/London";
    startsAtInput.value = toDatetimeLocalString(event.starts_at);
    endsAtInput.value = toDatetimeLocalString(event.ends_at);

    // Recorrência
    isRecurringInput.checked = Boolean(event.is_recurring);
    recurrenceRuleInput.value = event.recurrence_rule ?? "";
    recurrenceEndsAtInput.value = toDatetimeLocalString(event.recurrence_ends_at);

    // Capacidade e preço
    maxCapacityInput.value = event.max_capacity ?? "";
    isFreeInput.checked = Boolean(event.is_free);
    priceAmountInput.value = event.price_amount ?? "";
    priceCurrencyInput.value = event.price_currency ?? "GBP";

    // Status
    isActiveInput.checked = Boolean(event.is_active);
    isCancelledInput.checked = Boolean(event.is_cancelled);

    // Categoria e subcategoria
    const categoryId = event.subcategories?.category_id ?? "";
    const subcategoryId = event.subcategory_id ?? "";
    categorySel.value = categoryId;
    await reloadSubCate(categoryId, subcategoryId);

    // 💡 IMPORTANTE: Atualiza a visibilidade dos campos condicionais
    //    DEPOIS de preencher todos os valores.
    //    Se fizeres antes, os campos vão aparecer/desaparecer com os
    //    valores errados ainda nos inputs.
    updateEventTypeVisibility();
    updateRecurrenceVisibility();
    updatePriceVisibility();
}

// ─── Photos ───────────────────────────────────────────────────────────────────

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

async function applyPhotosDiff(eventId) {
    for (const photoId of deletedPhotoIdsState) {
        const photo = existingPhotosState.find((p) => p.id === photoId);
        if (photo) await deletePhoto(photo);
    }

    if (deletedPhotoIdsState.length) {
        await normalizePhotoPositions(eventId, "event"); // evita perder a "capa" (position 0)
    }

    if (newPhotosState.length) {
        const files = newPhotosState.map((p) => p.file);
        await addPhotos(files, eventId, "event");
    }
}

// ─── Submit ───────────────────────────────────────────────────────────────────
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMsg("");
    saveBtn.disabled = true;

    try {
        const eventData = getFormData();
        validateForm(eventData);

        if (isEditModeState) {
            await updateEvent(eventIdState, eventData);
            await applyPhotosDiff(eventIdState);
            setMsg("Event updated successfully.");
            window.location.replace(`/eventDetails.html?id=${eventIdState}`);
        } else {
            const created = await createEvent(eventData);
            await applyPhotosDiff(created.id);
            setMsg("Event created successfully.");
            window.location.replace(`/eventDetails.html?id=${created.id}`);
        }
    } catch (err) {
        console.error(err);
        setMsg(err?.message ?? "Error saving event.");
    } finally {
        saveBtn.disabled = false;
    }
});

// ─── Init ─────────────────────────────────────────────────────────────────────
//
// 🐛 BUG CORRIGIDO: O teu init() original não registava os event listeners
//    para os campos condicionais (eventType, isRecurring, isFree).
//    Os campos nunca apareciam/desapareciam ao interagir com o form!
// ─────────────────────────────────────────────────────────────────────────────

async function init() {
    const session = await requireAuthOrRedirect();
    if (!session) return;

    userIdState = session.user.id;
    eventIdState = getEventIdFromUrl();
    isEditModeState = Boolean(eventIdState);

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

    // ── Listeners dos campos condicionais ────────────────────
    // Cada um chama a sua função de visibilidade ao mudar de valor
    eventTypeInput.addEventListener("change", updateEventTypeVisibility);
    isRecurringInput.addEventListener("change", updateRecurrenceVisibility);
    isFreeInput.addEventListener("change", updatePriceVisibility);

    // ── Listeners de fotos: abrir seletor / excluir / abrir lightbox ──
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

    // ── Listener de fotos: arquivos selecionados ──────────────
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

    // ── Carrega categorias ───────────────────────────────────
    setMsg("Loading...");

    const categories = await fetchCategories("event");
    fillCategoryDropdown(categories);
    fillSubCategoryDropdown([]);

    categorySel.addEventListener("change", () => reloadSubCate(categorySel.value));

    // ── Modo Edit vs New ─────────────────────────────────────
    if (isEditModeState) {
        pageTitle.textContent = "Edit Event";

        const eventData = await fetchEventById(eventIdState);

        // 💡 DICA — Segurança: verifica se o utilizador é o dono
        //    antes de mostrar qualquer dado. Sem esta verificação,
        //    qualquer utilizador autenticado poderia editar eventos alheios
        //    conhecendo o ID.
        if (eventData.owner_id !== userIdState) {
            throw new Error("You do not have permission to edit this event.");
        }

        await populateForm(eventData);
        existingPhotosState = await fetchPhotos(eventIdState, "event");
    } else {
        pageTitle.textContent = "New Event";

        // Define a visibilidade inicial para os defaults do HTML
        // (in_person visível, online escondido, preço escondido, recorrência escondida)
        updateEventTypeVisibility();
        updateRecurrenceVisibility();
        updatePriceVisibility();
    }

    renderPhotosSection(); // vazio na criação, populado na edição

    setMsg("");
}

init().catch((err) => {
    console.error(err);
    setMsg(err?.message ?? "Unexpected error");
});