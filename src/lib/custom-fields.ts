/**
 * Custom fields per category (Snipe-IT-style fieldsets).
 *
 * Owners define fields per part category. The fields are stored in
 * `CategoryField` and the per-part values are stored in `PartMeta`.
 *
 * Example: "Brake Pads" category gets fields:
 *   - Pad Material (select: Ceramic, Semi-metallic, Organic)
 *   - Vehicle Fitment (text)
 *   - Wear Sensor (boolean)
 *
 * When a part with category="Brakes" is created/edited, the UI fetches
 * the category's fields and renders a dynamic form. Saved values live
 * in `PartMeta`.
 */

import { db } from '@/lib/db'

export type CategoryFieldType = 'text' | 'number' | 'select' | 'date' | 'boolean'

export interface CategoryField {
  id: string
  ownerId: string
  category: string
  fieldName: string
  fieldType: CategoryFieldType
  fieldOptions: string[]  // For 'select' type
  isRequired: boolean
  sortOrder: number
}

export interface CategoryFieldInput {
  category: string
  fieldName: string
  fieldType: CategoryFieldType
  fieldOptions?: string[]
  isRequired?: boolean
  sortOrder?: number
}

/**
 * List all custom fields for a category.
 */
export async function getFieldsForCategory(
  ownerId: string,
  category: string
): Promise<CategoryField[]> {
  const fields = await db.categoryField.findMany({
    where: { ownerId, category: { equals: category, mode: 'insensitive' } },
    orderBy: { sortOrder: 'asc' },
  })
  return fields.map((f) => ({
    ...f,
    fieldType: f.fieldType as CategoryFieldType,
    fieldOptions: safeParseArray(f.fieldOptions),
  }))
}

/**
 * List all categories that have custom fields defined.
 */
export async function getCategoriesWithFields(ownerId: string): Promise<string[]> {
  const result = await db.categoryField.findMany({
    where: { ownerId },
    distinct: ['category'],
    select: { category: true },
    orderBy: { category: 'asc' },
  })
  return result.map((r) => r.category)
}

/**
 * Create or update a custom field for a category.
 * Upsert on (ownerId, category, fieldName).
 */
export async function upsertCategoryField(
  ownerId: string,
  input: CategoryFieldInput
): Promise<CategoryField> {
  const field = await db.categoryField.upsert({
    where: {
      ownerId_category_fieldName: {
        ownerId,
        category: input.category,
        fieldName: input.fieldName,
      },
    },
    create: {
      ownerId,
      category: input.category,
      fieldName: input.fieldName,
      fieldType: input.fieldType,
      fieldOptions: JSON.stringify(input.fieldOptions || []),
      isRequired: input.isRequired ?? false,
      sortOrder: input.sortOrder ?? 0,
    },
    update: {
      fieldType: input.fieldType,
      fieldOptions: JSON.stringify(input.fieldOptions || []),
      isRequired: input.isRequired ?? false,
      sortOrder: input.sortOrder ?? 0,
    },
  })
  return {
    ...field,
    fieldType: field.fieldType as CategoryFieldType,
    fieldOptions: safeParseArray(field.fieldOptions),
  }
}

/**
 * Delete a custom field. Also cascades to PartMeta (deletes all values).
 */
export async function deleteCategoryField(ownerId: string, fieldId: string): Promise<void> {
  await db.categoryField.deleteMany({ where: { id: fieldId, ownerId } })
}

/**
 * Get all custom field values for a part (returns a key-value map).
 */
export async function getPartMeta(partId: string): Promise<Record<string, string>> {
  const metas = await db.partMeta.findMany({
    where: { partId },
    include: { categoryField: { select: { fieldName: true } } },
  })
  const result: Record<string, string> = {}
  for (const m of metas) {
    if (m.categoryField) {
      result[m.categoryField.fieldName] = m.value
    }
  }
  return result
}

/**
 * Save custom field values for a part.
 * Replaces all existing values (delete + insert pattern within a tx).
 */
export async function savePartMeta(
  ownerId: string,
  partId: string,
  category: string,
  values: Record<string, string>
): Promise<void> {
  // Fetch the fields for this category (so we only save known fields)
  const fields = await getFieldsForCategory(ownerId, category)
  const fieldByName = new Map(fields.map((f) => [f.fieldName, f]))

  await db.$transaction(async (tx) => {
    // Delete existing values for this part
    await tx.partMeta.deleteMany({ where: { partId, ownerId } })

    // Insert new values (only for fields that exist in the category)
    for (const [fieldName, value] of Object.entries(values)) {
      const field = fieldByName.get(fieldName)
      if (!field) continue
      await tx.partMeta.create({
        data: {
          ownerId,
          partId,
          categoryFieldId: field.id,
          value: String(value ?? ''),
        },
      })
    }
  })
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function safeParseArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}
