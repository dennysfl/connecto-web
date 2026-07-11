// ============================================================
// lib/api/photos.api.js
//
// Responsabilidade ÚNICA: toda comunicação com o Supabase
// (tabela "photos" + Storage) relacionada a fotos de qualquer
// entidade (services, events, ...).
//
// Genérico: todas as funções recebem `entityType`, seguindo
// o mesmo padrão de comments.api.js / ratings.api.js.
// ============================================================

import { supabase } from "../../supabaseClient.js";

export const MAX_PHOTOS = 5;
const BUCKET = "entity-photos";

/**
 * Lista as fotos de uma entidade, ordenadas por posição.
 */
export async function fetchPhotos(entityId, entityType) {
    const { data, error } = await supabase
        .from("photos")
        .select("*")
        .eq("entity_id", entityId)
        .eq("entity_type", entityType)
        .order("position", { ascending: true });

    if (error) throw error;
    return data ?? [];
}

/**
 * Busca a foto de capa (position = 0) de várias entidades de uma vez.
 * Usado para exibir a miniatura nos cards de listagem (services.html).
 *
 * @returns {Map<string, string>} entity_id -> url
 */
export async function fetchCoverPhotos(entityIds, entityType) {
    if (!entityIds?.length) return new Map();

    const { data, error } = await supabase
        .from("photos")
        .select("entity_id, url")
        .eq("entity_type", entityType)
        .eq("position", 0)
        .in("entity_id", entityIds);

    if (error) throw error;

    const map = new Map();
    (data ?? []).forEach((p) => map.set(p.entity_id, p.url));
    return map;
}

async function uploadFile(file, entityId, entityType) {
    const ext = file.name.split(".").pop();
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const path = `${entityType}/${entityId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, path };
}

/**
 * Faz upload de um arquivo e insere o registro na tabela `photos`.
 * A posição é sempre a próxima livre.
 */
export async function addPhoto(file, entityId, entityType) {
    const existing = await fetchPhotos(entityId, entityType);
    if (existing.length >= MAX_PHOTOS) {
        throw new Error(`Maximum of ${MAX_PHOTOS} photos per item.`);
    }

    const { url, path } = await uploadFile(file, entityId, entityType);
    const nextPosition = existing.length;

    const { data, error } = await supabase
        .from("photos")
        .insert({ entity_id: entityId, entity_type: entityType, url, path, position: nextPosition })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Faz upload de múltiplos arquivos em sequência.
 */
export async function addPhotos(files, entityId, entityType) {
    const inserted = [];
    for (const file of files) {
        const photo = await addPhoto(file, entityId, entityType);
        inserted.push(photo);
    }
    return inserted;
}

/**
 * Remove uma foto: deleta do Storage (usando o path salvo) e da tabela.
 */
export async function deletePhoto(photo) {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([photo.path]);
    if (storageError) throw storageError;

    const { error: dbError } = await supabase.from("photos").delete().eq("id", photo.id);
    if (dbError) throw dbError;
}

/**
 * Renormaliza as posições das fotos restantes para ficarem
 * contíguas (0, 1, 2...) depois de uma exclusão. Sem isso, deletar a
 * foto de position=0 faz a "capa" desaparecer mesmo com fotos restantes.
 */
export async function normalizePhotoPositions(entityId, entityType) {
    const photos = await fetchPhotos(entityId, entityType);

    for (let i = 0; i < photos.length; i++) {
        if (photos[i].position !== i) {
            const { error } = await supabase
                .from("photos")
                .update({ position: i })
                .eq("id", photos[i].id);
            if (error) throw error;
        }
    }
}