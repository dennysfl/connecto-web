// ============================================================
// ui/photos-render.js
//
// HTML puro para fotos — reutilizável entre services e events.
// Mesmas regras de services-render.js: sem DOM, sem fetch, sem estado.
// ============================================================

import { escapeHTML } from "../utils/string.utils.js";

const THUMB_SIZE = "80px";

/**
 * Grid de thumbnails. Em modo editável, mostra o X de exclusão
 * e usa data-photo-key (id existente OU tempId de foto ainda não salva).
 *
 * @param {Array<{id?:string, tempId?:string, url:string}>} photos
 * @param {boolean} editable
 */
export function renderPhotoThumbnails(photos, editable = false) {
    if (!photos.length) return "";

    return `
        <div class="photoThumbGrid" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:10px;">
            ${photos.map((photo, index) => `
                <div class="photoThumb" style="position:relative; width:${THUMB_SIZE}; height:${THUMB_SIZE};">
                    <img src="${photo.url}"
                         class="photoThumbImg"
                         data-lightbox-index="${index}"
                         style="width:100%; height:100%; object-fit:cover; border-radius:4px;
                                cursor:pointer; border:1px solid #ddd;" />
                    ${editable ? `
                        <button type="button"
                                class="photoDeleteBtn"
                                data-photo-key="${escapeHTML(photo.id ?? photo.tempId)}"
                                title="Remove photo"
                                style="position:absolute; top:-6px; right:-6px; width:20px; height:20px;
                                       border-radius:50%; border:none; background:#c0392b; color:#fff;
                                       cursor:pointer; font-size:12px; line-height:1; padding:0;">
                            ×
                        </button>
                    ` : ""}
                </div>
            `).join("")}
        </div>
    `;
}

/**
 * Botão "Add Photos (N/5)" + input de arquivo escondido.
 */
export function renderPhotoUploadControl(maxPhotos, currentCount) {
    const disabled = currentCount >= maxPhotos;
    return `
        <div class="photoUploadControl">
            <input type="file" id="photoFileInput" accept="image/*" multiple
                   style="display:none;" ${disabled ? "disabled" : ""} />
            <button type="button" id="photoUploadBtn" ${disabled ? "disabled" : ""}>
                Add Photos (${currentCount}/${maxPhotos})
            </button>
        </div>
    `;
}

/**
 * Card read-only de fotos, usado em telas de detalhes.
 */
export function renderPhotosCard(photos, emptyText = "No photos added") {
    if (!photos.length) return `<p class="muted">${escapeHTML(emptyText)}</p>`;
    return renderPhotoThumbnails(photos, false);
}